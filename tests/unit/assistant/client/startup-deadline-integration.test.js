/** Real voice driver + VoiceTransport with fake capture/socket boundaries. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createAssistantSession } from '../../../../src/features/assistant/client/session.js';
import { openAssistant } from '../../../../src/features/assistant/client/panel.js';
import { createPcm16Resampler, startMicrophone, VOICE_CONNECT_BUDGET_MS, TURN_FINALIZE_TIMEOUT_MS } from '../../../../src/features/assistant/client/realtime.js';
import { createTestingRecorder } from '../../../../src/features/assistant/client/testing-audio.js';
import { sanitizeVoiceLogContext } from '../../../../src/features/assistant/client/voice-telemetry.js';
import { createAssistantConversation } from '../../../../src/features/assistant/client/conversation.js';

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(), createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(), feedbackSheetSession: vi.fn(),
}));
vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: () => ({ current: null, ensure: async () => ({ id: 'test-attempt' }), finish: async () => {} }),
}));

const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', sessionCapSeconds: 600, transcriptionModel: 'grok-transcribe', earlyTesting: false };
const deps = { api: {}, scope: () => ({ operationId: 'test-operation', actorId: 'test-actor' }), persist: vi.fn(), online: () => true, offlineNotes: { list: async () => [] } };
const gate = () => { let resolve, reject; const promise = new Promise((r, j) => { resolve = r; reject = j; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
let sockets, tracks, contexts, conversation, entry;
class Socket {
  constructor() { this.readyState = 1; this.sent = []; sockets.push(this); }
  send(json) { this.sent.push(JSON.parse(json)); }
  message(value) { this.onmessage?.({ data: JSON.stringify(value) }); }
  close() { this.readyState = 3; this.onclose?.(); }
}
class Audio {
  constructor() { this.state = 'running'; this.sampleRate = 24000; this.destination = {}; contexts.push(this); }
  resume() { return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  createScriptProcessor() {
    const processor = { connect() { processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(128) } }); }, disconnect() {} };
    this.processor = processor;
    return processor;
  }
}
function makeSession(options = {}) { return createAssistantSession({ deps, config: { ...config }, intent: 'data-entry', ...options }); }
async function connect(talking) {
  await flush();
  expect(sockets).toHaveLength(1);
  sockets[0].message({ type: 'session.created' });
  await flush();
  await expect(talking).resolves.toBe('listening');
}
beforeEach(() => {
  vi.useFakeTimers(); document.body.replaceChildren(); sockets = []; tracks = [{ stop: vi.fn() }]; contexts = []; entry = null;
  vi.stubGlobal('WebSocket', Socket); vi.stubGlobal('AudioContext', Audio);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => tracks })) } });
  conversation = {
    ref: 'test-conversation', scope: deps.scope(), route: null,
    session: { conversationRef: 'test-conversation', intent: 'data-entry', phase: 'converse', transcript: [], capture: {} },
    begin: vi.fn(async () => {}), turn: vi.fn(async () => null), discardEmpty: vi.fn(async () => {}),
    voiceAuthorization: vi.fn(async () => ({ provider: 'xai', token: 'test-token', expiresAt: Date.now() + 60000 })),
  };
  createAssistantConversation.mockReturnValue(conversation);
});
afterEach(async () => { await entry?.close(); await flush(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('startup awaits cannot defeat the deadline', () => {
  it('a hung gesture resume releases tracks at 10 seconds without waiting for begin or close', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    Audio.prototype.resume = () => new Promise(() => {});
    const originalClose = Audio.prototype.close;
    Audio.prototype.close = () => new Promise(() => {});
    const session = makeSession(); const talking = session.talk(); await flush();
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await expect(talking).resolves.toBe('unavailable');
    expect(tracks[0].stop).toHaveBeenCalled(); expect(session.listening).toBe(false);
    expect(conversation.discardEmpty).not.toHaveBeenCalled();
    begin.resolve(); await flush(); expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
    Audio.prototype.resume = () => Promise.resolve(); Audio.prototype.close = originalClose;
  });
  it('a rejected resume takes the unavailable path without awaiting context close', async () => {
    const originalResume = Audio.prototype.resume, originalClose = Audio.prototype.close;
    Audio.prototype.resume = () => Promise.reject(new Error('resume-failed'));
    const close = vi.fn(() => new Promise(() => {})); Audio.prototype.close = close;
    try {
      const session = makeSession();
      await expect(session.talk()).resolves.toBe('unavailable');
      expect(tracks[0].stop).toHaveBeenCalled(); expect(close).toHaveBeenCalledTimes(1);
    } finally { Audio.prototype.resume = originalResume; Audio.prototype.close = originalClose; }
  });
  it('a hung row begin releases capture immediately and cleans the late begin exactly once', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    const session = makeSession(); const talking = session.talk(); await flush();
    expect(conversation.begin).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await expect(talking).resolves.toBe('unavailable'); expect(tracks[0].stop).toHaveBeenCalled();
    expect(sockets).toHaveLength(0); expect(conversation.discardEmpty).not.toHaveBeenCalled();
    begin.resolve(); await flush(); expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
    await session.end(); expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
  });
  it('a row begin that rejects after the deadline still runs empty cleanup exactly once', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    const session = makeSession(); const talking = session.talk(); await flush();
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await expect(talking).resolves.toBe('unavailable');
    begin.reject(new Error('late-start-failure')); await flush();
    expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
    await session.end(); expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
  });
  it('first-use consent takes no connect budget and the subsequent hung begin still expires', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    entry = openAssistant(deps, { ...config, earlyTesting: true }, { mode: 'voice' });
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(30000);
    expect(conversation.begin).not.toHaveBeenCalled(); expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    document.querySelector('[data-testid="assistant-consent-decline"]').click(); await flush();
    await vi.advanceTimersByTimeAsync(9999); expect(tracks[0].stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect((await entry.ready).result).toBe('unavailable');
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(false);
    begin.resolve(); await flush(); expect(conversation.discardEmpty).toHaveBeenCalledTimes(1);
  });
  it('the capture helper itself aborts a second hung resume', async () => {
    const audio = new Audio(); audio.state = 'suspended'; audio.resume = () => new Promise(() => {});
    const abort = new AbortController();
    const capture = startMicrophone({ stream: { getTracks: () => tracks }, context: audio, onChunk() {}, signal: abort.signal });
    const checked = expect(capture).rejects.toMatchObject({ name: 'AbortError' });
    abort.abort(); await checked; expect(tracks[0].stop).toHaveBeenCalled();
  });
  it('typed Send during pending voice begin waits for attempts and keeps the conversation', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    const session = makeSession(); const talking = session.talk(); await flush();
    const typing = session.text('typed while connecting'); await flush();
    expect(conversation.turn).not.toHaveBeenCalled();
    begin.resolve(); await expect(typing).resolves.toBeUndefined(); await talking;
    expect(conversation.turn).toHaveBeenCalledWith(expect.objectContaining({ modality: 'text', text: 'typed while connecting' }));
    expect(conversation.begin).toHaveBeenCalledTimes(1); expect(conversation.discardEmpty).not.toHaveBeenCalled();
  });
  it('typed Send during a text-first begin also waits for attempts', async () => {
    const begin = gate(); conversation.begin.mockReturnValue(begin.promise);
    const session = makeSession(); const starting = session.begin(); await flush();
    const typing = session.text('pending text'); await flush(); expect(conversation.turn).not.toHaveBeenCalled();
    begin.resolve(); await starting; await typing;
    expect(conversation.turn).toHaveBeenCalledTimes(1);
  });
});

describe('real driver finalization and shared composer', () => {
  it('typed takeover emits the unfinished voice turn before composing text, including final transcription', async () => {
    const session = makeSession(); await connect(session.talk());
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'spoken', transcript: 'old partial' });
    const typing = session.text('then typed'); await flush();
    expect(sockets[0].sent.some(row => row.type === 'input_audio_buffer.commit')).toBe(true);
    expect(conversation.turn).not.toHaveBeenCalled();
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'spoken', transcript: 'final spoken words' });
    await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS); await typing;
    expect(conversation.turn.mock.calls.map(([row]) => [row.modality, row.text])).toEqual([['voice', 'final spoken words'], ['text', 'then typed']]);
    expect(sockets[0].readyState).toBe(3);
  });
  it('typed takeover uses the finalization timeout when no completed event arrives', async () => {
    const session = makeSession(); await connect(session.talk());
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'spoken', transcript: 'partial survives' });
    const typing = session.text('typed'); await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS); await typing;
    expect(conversation.turn.mock.calls.map(([row]) => row.text)).toEqual(['partial survives', 'typed']);
  });
  it('typed takeover waits for its own voice delivery behind an earlier pending backend turn', async () => {
    const first = gate();
    conversation.turn.mockImplementationOnce(() => first.promise);
    const session = makeSession(); await connect(session.talk());
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'first', transcript: 'first voice over' });
    await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
    expect(conversation.turn).toHaveBeenCalledTimes(1);
    contexts[0].processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(128) } });
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'second', transcript: 'second voice' });
    const typing = session.text('typed last');
    await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
    expect(conversation.turn).toHaveBeenCalledTimes(1); expect(sockets[0].readyState).toBe(1);
    first.resolve(null); await typing;
    expect(conversation.turn.mock.calls.map(([row]) => row.text)).toEqual(['first voice', 'second voice', 'typed last']);
  });
  it('spoken over restores Type here and clears Listening without a second tap', async () => {
    const listening = vi.fn(); entry = openAssistant(deps, config, { mode: 'voice', onListening: listening });
    await flush(); sockets[0].message({ type: 'session.created' }); await entry.ready;
    const input = document.querySelector('[data-testid="assistant-text"]'); expect(input.hidden).toBe(true);
    sockets[0].message({ type: 'conversation.item.input_audio_transcription.updated', item_id: 'over-turn', transcript: 'hello over' });
    expect(input.hidden).toBe(false); expect(entry.session.listening).toBe(false);
    expect(document.querySelector('[data-testid="assistant-end"]').hidden).toBe(true);
    expect(listening).toHaveBeenLastCalledWith(false);
    await vi.advanceTimersByTimeAsync(TURN_FINALIZE_TIMEOUT_MS);
    expect(conversation.turn).toHaveBeenCalledWith(expect.objectContaining({ text: 'hello' }));
  });
  it.each(['send', 'begin'])('a %s-first session adopts push-to-talk callbacks when the open header sheet is reused', async path => {
    entry = openAssistant(deps, config);
    if (path === 'send') {
      document.querySelector('[data-testid="assistant-text"]').value = 'text first';
      document.querySelector('[data-testid="assistant-send"]').click(); await flush();
    } else await entry.begin('data-entry');
    const priorSession = entry.session, listening = vi.fn(), terminal = vi.fn();
    const reused = openAssistant(deps, config, { mode: 'voice', onListening: listening, onVoiceTerminal: terminal });
    expect(reused).toBe(entry); expect(entry.session).toBe(priorSession);
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(true);
    await flush(); sockets[0].message({ type: 'session.created' }); await entry.ready;
    expect(listening).toHaveBeenLastCalledWith(true);
    sockets[0].close(); await flush();
    expect(terminal).toHaveBeenCalledWith('Voice connection ended. Tap to start a new one.');
    expect(listening).toHaveBeenLastCalledWith(false);
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(entry.session.listening).toBe(false);
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(false);
  });
});

it('44.1 kHz chunk boundaries produce the same PCM as a continuous stream', () => {
  const samples = Int16Array.from({ length: 44100 }, (_, i) => Math.round(Math.sin(i / 17) * 20000));
  const one = createPcm16Resampler(44100, 24000)(new Uint8Array(samples.buffer));
  const convert = createPcm16Resampler(44100, 24000), chunks = [];
  for (let i = 0; i < samples.length; i += 4096) chunks.push(...convert(new Uint8Array(samples.slice(i, i + 4096).buffer)));
  expect(new Uint8Array(chunks)).toEqual(one); expect(one.byteLength).toBe(48000);
});
it('recorder duration freezes at the cap even when stop is consumed much later', async () => {
  class Recorder {
    static isTypeSupported() { return true; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop(); }
  }
  const recorder = createTestingRecorder({ stream: {}, MediaRecorderImpl: Recorder, maxMs: 1000 });
  await vi.advanceTimersByTimeAsync(10000);
  expect((await recorder.stop()).durationMs).toBe(1000);
});
it('known telemetry keys cannot carry arbitrary strings, nonfinite numbers or wrong types', () => {
  expect(sanitizeVoiceLogContext({ reason: 'secret text', event: 'transcript', audioContextState: 'token', sampleRate: 'secret', ms: Infinity, attempt: NaN, ok: 'yes', emitted: true })).toEqual({});
  expect(sanitizeVoiceLogContext({ reason: 'connect-budget', event: 'updated', audioContextState: 'running', ms: 10, ok: true })).toEqual({ reason: 'connect-budget', event: 'updated', audioContextState: 'running', ms: 10, ok: true });
});
