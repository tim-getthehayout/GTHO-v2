/** xAI realtime voice driver for the pinned VoiceTransport. Voice I/O only: the
 * final input transcript becomes a backend `turn`; the backend's answer is spoken
 * verbatim. No realtime function tools. The token is never logged or stored.
 *
 * One user turn (ended by spoken "over" or a tap) becomes exactly one runtime
 * turn: transcriptions accumulate per item_id (latest text wins) until the turn
 * ends, then a short wait collects finals and a single onTurn fires with a
 * client-minted UUID. Manual commit only — no server_vad.
 */
import { logVoice } from './voice-telemetry.js';
export const REALTIME_URL = 'wss://api.x.ai/v1/realtime';
export const SESSION_CREATED_TIMEOUT_MS = 5000;
export const CONNECT_ATTEMPTS = 3;
export const SAMPLE_RATE = 24000;
/** Overall bound from the tap until session.created AND the first PCM chunk is sent. */
export const VOICE_CONNECT_BUDGET_MS = 10_000;
/** After "over"/tap + commit, wait this long for final transcription.completed
 * events before emitting the one runtime turn. Conservative short window. */
export const TURN_FINALIZE_TIMEOUT_MS = 1500;
const SPEAK_INSTRUCTIONS = 'Read the text in the latest user message aloud exactly as written. Do not add, remove, reorder or change any words. Do not answer it.';

/** Trailing spoken "over" (with punctuation) ends a turn and is not part of it. */
export const endsWithOver = text => /(?:^|[\s,.;:!?-])over[\s.!?]*$/i.test(text ?? '');
export const stripOver = text => (text ?? '').replace(/(?:^|[\s,.;:!?-]+)over[\s.!?]*$/i, '').trim();

export function toBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return globalThis.btoa(binary);
}
export function fromBase64(text) {
  const binary = globalThis.atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}


const PINNED_MODEL = value => typeof value === 'string' && value.trim().length > 0 && !/latest/i.test(value) && /^[A-Za-z0-9._-]+$/.test(value.trim());

/** Race several abort signals: abort the returned signal when any input aborts. */
export function anySignal(...signals) {
  const live = signals.filter(Boolean);
  if (!live.length) return undefined;
  if (live.length === 1) return live[0];
  const controller = new globalThis.AbortController();
  const abort = () => controller.abort();
  for (const signal of live) {
    if (signal.aborted) { controller.abort(); break; }
    signal.addEventListener('abort', abort, { once: true });
  }
  return controller.signal;
}

function abortError(message = 'connect-budget') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function waitForAbort(signal) {
  return new Promise((_, reject) => {
    if (!signal) return;
    if (signal.aborted) { reject(abortError()); return; }
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
  });
}

// Teardown can race the deadline, capture abort and End. Close each context once.
const closingContexts = new WeakMap();
export function closeCaptureContext(context) {
  if (!context) return Promise.resolve();
  if (!closingContexts.has(context)) {
    try { closingContexts.set(context, Promise.resolve(context.close()).catch(() => {})); }
    catch { closingContexts.set(context, Promise.resolve()); }
  }
  return closingContexts.get(context);
}

/** Create an AudioContext synchronously in the user-gesture stack and kick resume() before any await. */
export function prepareCaptureContext(AudioContextImpl = globalThis.AudioContext) {
  if (typeof AudioContextImpl !== 'function') throw new Error('audio-context-unavailable');
  const context = new AudioContextImpl({ sampleRate: SAMPLE_RATE });
  const resumePromise = typeof context.resume === 'function' ? Promise.resolve(context.resume()) : Promise.resolve();
  // A consent prompt may outlive a failed resume; the startup path still observes it.
  void resumePromise.catch(() => {});
  return { context, resumePromise };
}

/** Streaming linear interpolation. Phase and the boundary sample survive chunks. */
export function createPcm16Resampler(fromRate, toRate) {
  let offset = 0, next = 0, last;
  const step = fromRate / toRate;
  return pcm => {
    if (!pcm || fromRate === toRate) return pcm;
    const source = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    const end = offset + source.length;
    const out = [];
    while (next < end) {
      const lo = Math.floor(next), fraction = next - lo;
      if (fraction > 1e-9 && lo + 1 >= end) break; // need next chunk's sample
      const left = lo < offset ? last : source[lo - offset];
      const right = fraction > 1e-9 ? source[lo + 1 - offset] : left;
      out.push(Math.round(left * (1 - fraction) + right * fraction));
      next += step;
    }
    if (source.length) last = source[source.length - 1];
    offset = end;
    return new Uint8Array(new Int16Array(out).buffer);
  };
}

/** One-shot convenience; capture uses one stateful converter for its lifetime. */
export function resamplePcm16(pcm, fromRate, toRate) {
  return createPcm16Resampler(fromRate, toRate)(pcm);
}

/**
 * config: server-returned {model, voice, reasoning, turnDetection, sessionCapSeconds}.
 * turnDetection from the server is ignored for the wire session: this driver always
 * sends turn_detection null (manual commit). Returns a VoiceTransport driver plus
 * endTurn() (tap) and speak(text).
 */
export function createXaiRealtimeDriver({ config, WebSocketImpl = globalThis.WebSocket, setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id), onStatus = () => {}, onTurnEnd = () => {}, onFinalTurn = () => {}, randomId = () => globalThis.crypto.randomUUID(), now = () => (typeof globalThis.performance !== 'undefined' ? globalThis.performance.now() : Date.now()), tapAt } = {}) {
  if (!config?.model || /latest/i.test(config.model)) throw new Error('pinned-voice-model-required');
  if (!PINNED_MODEL(config.transcriptionModel)) throw new Error('pinned-transcription-model-required');
  let active = null;

  function open(token, attempt = 0, signal) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(`${REALTIME_URL}?model=${encodeURIComponent(config.model)}`, [`xai-client-secret.${token}`]);
      const cleanup = () => { clearTimer(timer); signal?.removeEventListener('abort', abort); };
      const abort = () => {
        cleanup(); socket.onmessage = socket.onclose = null;
        try { socket.close(); } catch { /* ignore */ }
        reject(abortError());
      };
      const timer = setTimer(() => { cleanup(); try { socket.close(); } catch { /* ignore */ } logVoice('teardown', { reason: 'session-created-timeout', attempt }, now, tapAt); reject(new Error('session-created-timeout')); }, SESSION_CREATED_TIMEOUT_MS);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) { abort(); return; }
      socket.onmessage = event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'session.created') {
          cleanup();
          socket.onmessage = null;
          logVoice('session-created', { attempt }, now, tapAt);
          resolve(socket);
        }
      };
      socket.onerror = () => {};
      socket.onclose = () => { cleanup(); logVoice('teardown', { reason: 'socket-closed', attempt }, now, tapAt); reject(new Error('socket-closed')); };
    });
  }

  async function connect({ authorization, onTurn, onAudio, onDisconnect, signal }) {
    let socket, lastError;
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS && !socket; attempt++) {
      if (signal?.aborted) throw abortError();
      try { socket = await open(authorization.token, attempt, signal); } catch (error) { lastError = error; }
    }
    if (signal?.aborted) { socket?.close(); throw abortError(); }
    if (!socket) throw lastError ?? new Error('voice-connect-failed');
    const send = message => socket.readyState === 1 && socket.send(JSON.stringify(message));
    send({ type: 'session.update', session: {
      voice: config.voice, instructions: SPEAK_INSTRUCTIONS, reasoning: { effort: config.reasoning },
      // Manual commit only (OI-0202). server_vad is out of scope regardless of config.turnDetection.
      turn_detection: { type: null },
      audio: { input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, transcription: { model: config.transcriptionModel } }, output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } } },
    } });
    let closed = false, committed = false, ownResponses = 0, buffered = false;
    let transcriptionEvents = 0;
    // One user turn → one runtime turn. item_id text accumulates until over/tap.
    let turnId = null;
    const itemOrder = [];
    const itemText = new Map();
    let finalizing = false;
    let emitted = null; // { id, text } after the one onTurn; reused for retry replay
    let finalizeTimer = null;
    let finalized = null, resolveFinalized = () => {};
    /** item_ids already committed to an emitted turn — late revisions never migrate. */
    const finalizedItems = new Set();

    const close = (preserveFinal = false) => {
      if (closed) return;
      // An unexpected close must not strand typed takeover's finalization wait
      // or lose the transcript already collected for that turn.
      if (preserveFinal && finalizing && !emitted) emitTurn();
      closed = true; clearTimer(cap); clearTimer(finalizeTimer); finalizeTimer = null;
      resolveFinalized();
      socket.onmessage = socket.onclose = null;
      try { socket.close(); } catch { /* ignore */ }
      if (active?.socket === socket) active = null;
    };
    // P4: hang up at the session cap; a new session needs a new token.
    const cap = setTimer(() => { logVoice('teardown', { reason: 'session-cap' }, now, tapAt); close(true); onStatus('session-cap'); onDisconnect(); }, (config.sessionCapSeconds ?? 600) * 1000);
    const commit = () => { if (!committed && buffered) { committed = true; buffered = false; send({ type: 'input_audio_buffer.commit' }); } };

    function beginUserTurn() {
      turnId = randomId();
      itemOrder.length = 0;
      itemText.clear();
      finalizing = false;
      emitted = null;
      finalized = null;
      clearTimer(finalizeTimer); finalizeTimer = null;
    }

    function noteItem(itemId, rawText) {
      const id = itemId || randomId();
      // Already-sent turn ownership is sticky across PCM chunks / next turns.
      if (finalizedItems.has(id)) return;
      if (emitted) return; // late after send (same turn): do not revise or re-emit
      if (!turnId) beginUserTurn();
      if (!itemText.has(id)) itemOrder.push(id);
      itemText.set(id, rawText ?? '');
    }

    function joinedText() {
      return itemOrder.map(id => stripOver(itemText.get(id) ?? '')).filter(Boolean).join(' ').trim();
    }

    function emitTurn() {
      clearTimer(finalizeTimer); finalizeTimer = null;
      if (emitted) {
        // Retry replay: same id + identical text (vendor allows identical replay).
        onTurn({ id: emitted.id, role: 'user', modality: 'voice', text: emitted.text });
        return;
      }
      const text = joinedText();
      finalizing = false;
      if (!text) { turnId = null; itemOrder.length = 0; itemText.clear(); resolveFinalized(); return; }
      const id = turnId || randomId();
      for (const itemId of itemOrder) finalizedItems.add(itemId);
      emitted = { id, text };
      logVoice('emitted-turn', { emitted: 1 }, now, tapAt);
      const entry = { id, role: 'user', modality: 'voice', text };
      onFinalTurn(entry);
      onTurn(entry);
      resolveFinalized(emitted);
    }

    function finalizeTurn({ replay = true } = {}) {
      if (emitted) { if (replay) emitTurn(); return finalized; }
      if (finalizing) return finalized;
      if (!turnId) beginUserTurn();
      finalizing = true;
      finalized = new Promise(resolve => { resolveFinalized = resolve; });
      onTurnEnd();
      commit();
      clearTimer(finalizeTimer);
      finalizeTimer = setTimer(() => { finalizeTimer = null; emitTurn(); }, TURN_FINALIZE_TIMEOUT_MS);
      return finalized;
    }

    socket.onclose = () => { if (!closed) { logVoice('teardown', { reason: 'socket-close' }, now, tapAt); close(true); onDisconnect(); } };
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      switch (message.type) {
        case 'conversation.item.input_audio_transcription.updated': {
          transcriptionEvents += 1;
          logVoice('transcription-event', { event: 'updated', eventCount: transcriptionEvents }, now, tapAt);
          // Drop finalized-item events before any state mutation or turn-end.
          if (message.item_id && finalizedItems.has(message.item_id)) break;
          const raw = message.transcript ?? message.text ?? '';
          if (message.item_id) noteItem(message.item_id, raw);
          // Spoken "over" ends the user turn (then commit + wait for finals).
          if (endsWithOver(raw)) finalizeTurn();
          break;
        }
        case 'conversation.item.input_audio_transcription.completed': {
          transcriptionEvents += 1;
          logVoice('transcription-event', { event: 'completed', eventCount: transcriptionEvents }, now, tapAt);
          // Drop finalized-item events before any state mutation or turn-end.
          if (message.item_id && finalizedItems.has(message.item_id)) break;
          committed = false;
          const raw = message.transcript ?? message.text ?? '';
          noteItem(message.item_id, raw);
          // "over" may land only on the final completed.
          if (!finalizing && !emitted && endsWithOver(raw)) finalizeTurn();
          break;
        }
        case 'input_audio_buffer.committed': committed = false; buffered = false; break;
        case 'response.created':
          // Transcript is authoritative and the backend decides: cancel anything we did not ask for.
          if (ownResponses > 0) ownResponses--; else send({ type: 'response.cancel' });
          break;
        case 'response.output_audio.delta':
          if (message.delta) onAudio(fromBase64(message.delta));
          break;
        default: break;
      }
    };
    const connection = {
      socket,
      async sendAudio(bytes) {
        // Explicit next-turn boundary: after an emitted turn, the next PCM chunk
        // opens a new client turnId. Finalized item_ids stay locked so a late
        // revised `completed` for the previous item cannot land in the new turn.
        if (emitted || !turnId) beginUserTurn();
        buffered = true;
        send({ type: 'input_audio_buffer.append', audio: toBase64(bytes) });
      },
      // Typed text goes to the backend only; the realtime session never answers it.
      async sendText() {},
      async interrupt() { send({ type: 'response.cancel' }); },
      async cancel() { send({ type: 'response.cancel' }); },
      async close() { close(true); },
      endTurn: finalizeTurn,
      speak(text) {
        ownResponses++;
        send({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } });
        send({ type: 'response.create', response: { instructions: SPEAK_INSTRUCTIONS } });
      },
    };
    active = connection;
    return connection;
  }
  return {
    connect,
    /** Tap ends the current user turn (same as saying "over"). */
    endTurn(options) { return active?.endTurn(options); },
    speak(text) { if (!active) return false; active.speak(text); return true; },
    get connected() { return !!active; },
  };
}

/** Mic-failure copy for the Type-instead? prompt (OI-0196). */
export const MIC_MISSING_MESSAGE = 'No microphone found.';
export const MIC_BLOCKED_MESSAGE = 'Microphone access is blocked.';
export const TYPE_INSTEAD_QUESTION = 'Type instead?';
export const OFFLINE_NO_MIC_MESSAGE = "No microphone found, so the voice note wasn't recorded. You can use the normal screens.";
export const VOICE_UNAVAILABLE_MESSAGE = 'Voice is unavailable right now; you can type instead.';

const MIC_AUDIO = Object.freeze({ channelCount: 1, echoCancellation: true, noiseSuppression: true });

/** Dev-only timing for Tim's phone (silent in production builds). */
export function voiceStartTap() {
  if (!import.meta.env.DEV) return null;
  return globalThis.performance.now();
}
export function voiceStartMark(label, tapAt) {
  if (tapAt == null || !import.meta.env.DEV) return;
  const ms = globalThis.performance.now() - tapAt;
  globalThis.console.info(`[gtho-voice] ${label}: ${ms.toFixed(1)}ms`);
}

/**
 * PCM queue for faster-start: capture from mic-live, flush in order once the
 * socket is connected, discard on auth/connect failure.
 */
export function createAudioChunkBuffer() {
  const queue = [];
  let mode = 'buffer';
  let liveSend = null;
  let firstSent = false;
  let firstSentResolve = () => {};
  const firstSentPromise = new Promise(resolve => { firstSentResolve = resolve; });
  const markFirst = () => {
    if (firstSent) return;
    firstSent = true;
    firstSentResolve();
  };
  return {
    get length() { return queue.length; },
    get sentFirst() { return firstSent; },
    onChunk(bytes) {
      const copy = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
      if (mode === 'live' && liveSend) {
        liveSend(copy);
        return;
      }
      queue.push(copy);
    },
    async flushTo(send) {
      while (queue.length) {
        const batch = queue.splice(0, queue.length);
        for (const chunk of batch) { await send(chunk); markFirst(); }
      }
      liveSend = chunk => { void send(chunk); markFirst(); };
      mode = 'live';
    },
    waitForFirstSend(signal) {
      if (firstSent) return Promise.resolve();
      return Promise.race([firstSentPromise, waitForAbort(signal)]);
    },
    discard() {
      queue.length = 0;
      mode = 'buffer';
      liveSend = null;
    },
  };
}

/** Map getUserMedia / missing-mediaDevices failures to the two locked messages. */
export function classifyMicError(error) {
  const name = typeof error?.name === 'string' && error.name ? error.name : 'NotFoundError';
  if (name === 'NotAllowedError') return { name, message: MIC_BLOCKED_MESSAGE };
  return { name, message: MIC_MISSING_MESSAGE };
}

/**
 * Mic-first: open the mic before minting a realtime secret or connecting.
 * Structured as its own step so a later faster-start can run it concurrently
 * with begin() / voice-authorization and buffer PCM until the socket is ready.
 */
export async function acquireMicrophone({ mediaDevices = globalThis.navigator?.mediaDevices, signal } = {}) {
  if (signal?.aborted) throw abortError();
  if (!mediaDevices?.getUserMedia) {
    const err = new Error(MIC_MISSING_MESSAGE);
    err.name = 'NotFoundError';
    throw err;
  }
  let stream = null;
  const pending = mediaDevices.getUserMedia({ audio: { ...MIC_AUDIO } }).then(owned => {
    stream = owned;
    if (signal?.aborted) owned.getTracks().forEach(track => track.stop());
    return owned;
  });
  try {
    return await (signal ? Promise.race([pending, waitForAbort(signal)]) : pending);
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    throw error;
  }
}

/** Microphone -> PCM16 mono 24 kHz chunks. Also hands the raw stream to the
 * optional MediaRecorder consumer (testing audio). Pass `stream` when the mic
 * was already acquired (mic-first / faster-start). Pass a pre-created
 * `context` (from prepareCaptureContext) so iOS can resume inside the tap. */
export async function startMicrophone({ onChunk, stream, context, mediaDevices = globalThis.navigator?.mediaDevices, AudioContextImpl = globalThis.AudioContext, signal } = {}) {
  const owned = stream ?? await acquireMicrophone({ mediaDevices, signal });
  const audio = context ?? new AudioContextImpl({ sampleRate: SAMPLE_RATE });
  if (typeof audio.resume === 'function' && audio.state === 'suspended') {
    try { await Promise.race([audio.resume(), waitForAbort(signal)]); }
    catch (error) { owned.getTracks().forEach(track => track.stop()); void closeCaptureContext(audio); throw error; }
  }
  if (signal?.aborted) { owned.getTracks().forEach(track => track.stop()); void closeCaptureContext(audio); throw abortError(); }
  const source = audio.createMediaStreamSource(owned);
  const processor = audio.createScriptProcessor(4096, 1, 1);
  const inRate = audio.sampleRate || SAMPLE_RATE;
  const resample = createPcm16Resampler(inRate, SAMPLE_RATE);
  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) { const s = Math.max(-1, Math.min(1, input[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    const bytes = new Uint8Array(pcm.buffer);
    onChunk(inRate === SAMPLE_RATE ? bytes : resample(bytes));
  };
  source.connect(processor); processor.connect(audio.destination);
  return { stream: owned, context: audio, async stop() { processor.disconnect(); source.disconnect(); owned.getTracks().forEach(track => track.stop()); await closeCaptureContext(audio); } };
}

/** PCM16 24 kHz speaker output, chunks scheduled back to back. */
export function createPcmPlayer({ AudioContextImpl = globalThis.AudioContext } = {}) {
  let context, at = 0;
  return {
    play(bytes) {
      context ??= new AudioContextImpl({ sampleRate: SAMPLE_RATE });
      const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
      const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
      const node = context.createBufferSource();
      node.buffer = buffer; node.connect(context.destination);
      at = Math.max(at, context.currentTime); node.start(at); at += buffer.duration;
    },
    async close() { await context?.close(); context = undefined; at = 0; },
  };
}
