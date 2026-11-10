/** xAI realtime voice driver for the pinned VoiceTransport. Voice I/O only: the
 * final input transcript becomes a backend `turn`; the backend's answer is spoken
 * verbatim. No realtime function tools. The token is never logged or stored.
 *
 * One user turn (ended by spoken "over" or a tap) becomes exactly one runtime
 * turn: transcriptions accumulate per item_id (latest text wins) until the turn
 * ends, then a short wait collects finals and a single onTurn fires with a
 * client-minted UUID. Manual commit only — no server_vad.
 */
export const REALTIME_URL = 'wss://api.x.ai/v1/realtime';
export const SESSION_CREATED_TIMEOUT_MS = 5000;
export const CONNECT_ATTEMPTS = 3;
export const SAMPLE_RATE = 24000;
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

/**
 * config: server-returned {model, voice, reasoning, turnDetection, sessionCapSeconds}.
 * turnDetection from the server is ignored for the wire session: this driver always
 * sends turn_detection null (manual commit). Returns a VoiceTransport driver plus
 * endTurn() (tap) and speak(text).
 */
export function createXaiRealtimeDriver({ config, WebSocketImpl = globalThis.WebSocket, setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id), onStatus = () => {}, randomId = () => globalThis.crypto.randomUUID() }) {
  if (!config?.model || /latest/i.test(config.model)) throw new Error('pinned-voice-model-required');
  let active = null;

  function open(token) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(`${REALTIME_URL}?model=${encodeURIComponent(config.model)}`, [`xai-client-secret.${token}`]);
      const timer = setTimer(() => { try { socket.close(); } catch { /* ignore */ } reject(new Error('session-created-timeout')); }, SESSION_CREATED_TIMEOUT_MS);
      socket.onmessage = event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'session.created') { clearTimer(timer); socket.onmessage = null; resolve(socket); }
      };
      socket.onerror = () => {};
      socket.onclose = () => { clearTimer(timer); reject(new Error('socket-closed')); };
    });
  }

  async function connect({ authorization, onTurn, onAudio, onDisconnect, signal }) {
    let socket, lastError;
    for (let attempt = 0; attempt < CONNECT_ATTEMPTS && !socket; attempt++) {
      if (signal?.aborted) throw new Error('aborted');
      try { socket = await open(authorization.token); } catch (error) { lastError = error; }
    }
    if (!socket) throw lastError ?? new Error('voice-connect-failed');
    const send = message => socket.readyState === 1 && socket.send(JSON.stringify(message));
    send({ type: 'session.update', session: {
      voice: config.voice, instructions: SPEAK_INSTRUCTIONS, reasoning: { effort: config.reasoning },
      // Manual commit only (OI-0202). server_vad is out of scope regardless of config.turnDetection.
      turn_detection: { type: null },
      audio: { input: { format: { type: 'audio/pcm', rate: SAMPLE_RATE }, transcription: { model: 'grok-transcribe' } }, output: { format: { type: 'audio/pcm', rate: SAMPLE_RATE } } },
    } });
    let closed = false, committed = false, ownResponses = 0, buffered = false;
    // One user turn → one runtime turn. item_id text accumulates until over/tap.
    let turnId = null;
    const itemOrder = [];
    const itemText = new Map();
    let finalizing = false;
    let emitted = null; // { id, text } after the one onTurn; reused for retry replay
    let finalizeTimer = null;

    const close = () => {
      if (closed) return; closed = true; clearTimer(cap); clearTimer(finalizeTimer); finalizeTimer = null;
      socket.onmessage = socket.onclose = null;
      try { socket.close(); } catch { /* ignore */ }
      if (active?.socket === socket) active = null;
    };
    // P4: hang up at the session cap; a new session needs a new token.
    const cap = setTimer(() => { close(); onStatus('session-cap'); onDisconnect(); }, (config.sessionCapSeconds ?? 600) * 1000);
    const commit = () => { if (!committed && buffered) { committed = true; buffered = false; send({ type: 'input_audio_buffer.commit' }); } };

    function beginUserTurn() {
      turnId = randomId();
      itemOrder.length = 0;
      itemText.clear();
      finalizing = false;
      emitted = null;
      clearTimer(finalizeTimer); finalizeTimer = null;
    }

    function noteItem(itemId, rawText) {
      if (emitted) return; // late after send: do not revise or re-emit
      if (!turnId) beginUserTurn();
      const id = itemId || randomId();
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
      if (!text) { turnId = null; itemOrder.length = 0; itemText.clear(); return; }
      const id = turnId || randomId();
      emitted = { id, text };
      onTurn({ id, role: 'user', modality: 'voice', text });
    }

    function finalizeTurn() {
      if (emitted) { emitTurn(); return; } // retry
      if (finalizing) return;
      if (!turnId) beginUserTurn();
      finalizing = true;
      commit();
      clearTimer(finalizeTimer);
      finalizeTimer = setTimer(() => { finalizeTimer = null; emitTurn(); }, TURN_FINALIZE_TIMEOUT_MS);
    }

    socket.onclose = () => { if (!closed) { close(); onDisconnect(); } };
    socket.onmessage = event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      switch (message.type) {
        case 'conversation.item.input_audio_transcription.updated': {
          const raw = message.transcript ?? message.text ?? '';
          if (message.item_id) noteItem(message.item_id, raw);
          // Spoken "over" ends the user turn (then commit + wait for finals).
          if (endsWithOver(raw)) finalizeTurn();
          break;
        }
        case 'conversation.item.input_audio_transcription.completed': {
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
        if (emitted || !turnId) beginUserTurn();
        buffered = true;
        send({ type: 'input_audio_buffer.append', audio: toBase64(bytes) });
      },
      // Typed text goes to the backend only; the realtime session never answers it.
      async sendText() {},
      async interrupt() { send({ type: 'response.cancel' }); },
      async cancel() { send({ type: 'response.cancel' }); },
      async close() { close(); },
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
    endTurn() { active?.endTurn(); },
    speak(text) { if (!active) return false; active.speak(text); return true; },
    get connected() { return !!active; },
  };
}

/** Mic-failure copy for the Type-instead? prompt (OI-0196). */
export const MIC_MISSING_MESSAGE = 'No microphone found.';
export const MIC_BLOCKED_MESSAGE = 'Microphone access is blocked.';
export const TYPE_INSTEAD_QUESTION = 'Type instead?';
export const OFFLINE_NO_MIC_MESSAGE = "No microphone found, so the voice note wasn't recorded. You can use the normal screens.";

const MIC_AUDIO = Object.freeze({ channelCount: 1, echoCancellation: true, noiseSuppression: true });

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
export async function acquireMicrophone({ mediaDevices = globalThis.navigator?.mediaDevices } = {}) {
  if (!mediaDevices?.getUserMedia) {
    const err = new Error(MIC_MISSING_MESSAGE);
    err.name = 'NotFoundError';
    throw err;
  }
  return mediaDevices.getUserMedia({ audio: { ...MIC_AUDIO } });
}

/** Microphone -> PCM16 mono 24 kHz chunks. Also hands the raw stream to the
 * optional MediaRecorder consumer (testing audio). Pass `stream` when the mic
 * was already acquired (mic-first / faster-start). */
export async function startMicrophone({ onChunk, stream, mediaDevices = globalThis.navigator?.mediaDevices, AudioContextImpl = globalThis.AudioContext }) {
  const owned = stream ?? await acquireMicrophone({ mediaDevices });
  const context = new AudioContextImpl({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(owned);
  const processor = context.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = event => {
    const input = event.inputBuffer.getChannelData(0);
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) { const s = Math.max(-1, Math.min(1, input[i])); pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff; }
    onChunk(new Uint8Array(pcm.buffer));
  };
  source.connect(processor); processor.connect(context.destination);
  return { stream: owned, async stop() { processor.disconnect(); source.disconnect(); owned.getTracks().forEach(track => track.stop()); await context.close(); } };
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
