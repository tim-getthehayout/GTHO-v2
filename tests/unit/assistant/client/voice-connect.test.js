/**
 * @file Live-voice connect bound, iOS capture resume/resample, content-free
 * telemetry, typed-send takeover, and testing-recorder start/cap.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../../src/features/assistant/shared.js', async () => {
  class VoiceTransport {
    constructor({ broker }) {
      this.state = 'idle';
      this.broker = broker;
      this.cancel = vi.fn(async () => { this.state = 'cancelled'; });
      this.stream = vi.fn(async () => {});
      VoiceTransport.instances.push(this);
    }
    async connect() {
      await this.broker();
      if (this.hold) await this.hold;
      this.state = this.nextState || 'connected';
    }
  }
  VoiceTransport.instances = [];
  return {
    VoiceTransport,
    feedback: {},
    ConversationRuntime: class {},
    XaiProvider: class {},
    createVoiceBroker: vi.fn(),
    createBackendHandler: vi.fn(),
    RuntimeError: class extends Error {},
  };
});

const voiceHolders = vi.hoisted(() => ({ drivers: [], mics: [] }));

vi.mock('../../../../src/features/assistant/client/realtime.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createXaiRealtimeDriver: vi.fn(() => {
      const driver = {
        endTurn: vi.fn(), speak: vi.fn(() => true), get connected() { return true; },
        connect: vi.fn(async () => ({ sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(), cancel: vi.fn(), close: vi.fn(), endTurn: vi.fn(), speak: vi.fn() })),
      };
      voiceHolders.drivers.push(driver);
      return driver;
    }),
    createPcmPlayer: vi.fn(() => ({ play: vi.fn(), close: vi.fn(async () => {}) })),
    startMicrophone: vi.fn(async ({ stream, onChunk }) => {
      onChunk?.(new Uint8Array([1]));
      const owned = stream || {};
      const stop = vi.fn(async () => { owned.getTracks?.().forEach(track => track.stop()); });
      const mic = { stream: owned, stop };
      voiceHolders.mics.push(mic);
      return mic;
    }),
  };
});

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(),
  createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(),
  feedbackSheetSession: vi.fn(),
}));

vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: vi.fn(() => ({
    current: null, ensure: vi.fn(async () => ({ id: 'a1' })), reroute: vi.fn(), finish: vi.fn(),
  })),
}));

vi.mock('../../../../src/features/assistant/client/consent.js', () => ({
  resolveTestingConsent: vi.fn(async () => ({ decision: 'accepted', decidedAt: '2026-11-10T00:00:00.000Z' })),
}));

vi.mock('../../../../src/features/assistant/client/testing-audio.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createTestingRecorder: vi.fn((...args) => actual.createTestingRecorder(...args)),
  };
});

const realtime = await import('../../../../src/features/assistant/client/realtime.js');
const { createAssistantSession } = await import('../../../../src/features/assistant/client/session.js');
const { createAssistantConversation } = await import('../../../../src/features/assistant/client/conversation.js');
const { VoiceTransport } = await import('../../../../src/features/assistant/shared.js');
const { createTestingRecorder } = await import('../../../../src/features/assistant/client/testing-audio.js');
const { openAssistant } = await import('../../../../src/features/assistant/client/panel.js');
const { mountPushToTalk, unmountPushToTalk } = await import('../../../../src/features/assistant/client/push-to-talk.js');
const {
  startMicrophone, SAMPLE_RATE, VOICE_CONNECT_BUDGET_MS, createXaiRealtimeDriver,
} = realtime;
const { sanitizeVoiceLogContext, logVoice } = await import('../../../../src/features/assistant/client/voice-telemetry.js');
const { logger } = await import('../../../../src/utils/logger.js');
const { createAssistantApi } = await import('../../../../src/features/assistant/client/api.js');
const { LIVE_TRANSCRIPTION_MODEL, STT_MODEL, publicVoiceConfig } = await import('../../../../src/features/assistant/server/config.js');

const deps = {
  api: {},
  scope: () => ({ operationId: 'op', actorId: 'u' }),
  persist: vi.fn(),
  awaitServerRows: vi.fn(async () => true),
  buildStamp: 'test',
  online: () => true,
  offlineNotes: { list: async () => [] },
};
const config = {
  model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual',
  sessionCapSeconds: 600, earlyTesting: true, transcriptionModel: 'grok-transcribe',
};

function mockConversation({ authHang = false, beginDelayMs = 0 } = {}) {
  let releaseBegin;
  const beginGate = beginDelayMs > 0 ? new Promise(r => { releaseBegin = r; }) : null;
  const voiceAuthorization = vi.fn(signal => {
    if (!authHang) return Promise.resolve({ provider: 'xai', token: 'tok', expiresAt: Date.now() + 60000 });
    return new Promise((_, reject) => {
      const fail = () => { const error = new Error('aborted'); error.name = 'AbortError'; reject(error); };
      if (signal?.aborted) { fail(); return; }
      signal?.addEventListener('abort', fail, { once: true });
    });
  });
  const conv = {
    ref: 'c1',
    scope: { operationId: 'op', actorId: 'u' },
    session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
    route: null,
    begin: vi.fn(async () => { if (beginGate) await beginGate; }),
    turn: vi.fn(async () => null),
    switchIntent: vi.fn(),
    cancel: vi.fn(async () => {}),
    discardEmpty: vi.fn(async () => ({ value: { outcome: 'discarded' } })),
    voiceAuthorization,
    releaseBegin: () => releaseBegin?.(),
  };
  createAssistantConversation.mockImplementation(() => conv);
  return conv;
}

beforeEach(() => {
  document.body.innerHTML = '';
  VoiceTransport.instances = [];
  voiceHolders.drivers = [];
  voiceHolders.mics = [];
  createAssistantConversation.mockReset();
  startMicrophone.mockClear();
  createXaiRealtimeDriver.mockClear();
  createTestingRecorder.mockClear();
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } },
    configurable: true,
  });
  globalThis.AudioContext = class {
    constructor({ sampleRate } = {}) { this.sampleRate = sampleRate || 24000; this.state = 'running'; this.resume = async () => { this.state = 'running'; }; this.close = async () => {}; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
  };
});

afterEach(async () => {
  try { vi.useRealTimers(); } catch { /* already real */ }
  delete VoiceTransport.prototype.hold;
  delete VoiceTransport.prototype.nextState;
  document.querySelector('[data-testid="ptt-type-instead-dismiss"]')?.click();
  document.querySelector('[data-testid="assistant-cancel"]')?.click();
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
  unmountPushToTalk();
});

describe('live transcription model', () => {
  it('is grok-transcribe on public voice config and distinct from the offline STT model', () => {
    expect(LIVE_TRANSCRIPTION_MODEL).toBe('grok-transcribe');
    expect(STT_MODEL).toBe('grok-voice-transcribe-2.0');
    expect(LIVE_TRANSCRIPTION_MODEL).not.toBe(STT_MODEL);
    expect(publicVoiceConfig({ voiceModel: 'grok-voice-3.0', earlyTesting: false }).transcriptionModel).toBe('grok-transcribe');
  });
});

describe('capture resume and resample', () => {
  it('resumes a suspended AudioContext before capture', async () => {
    const resume = vi.fn(async function resume() { this.state = 'running'; });
    const AudioContextImpl = class {
      constructor({ sampleRate } = {}) {
        this.sampleRate = sampleRate || SAMPLE_RATE;
        this.state = 'suspended';
        this.destination = {};
        this.resume = resume;
      }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
      async close() {}
    };
    // Call the real startMicrophone, not the session mock.
    const { startMicrophone: realStart, prepareCaptureContext: realPrepare } = await vi.importActual('../../../../src/features/assistant/client/realtime.js');
    const prepared = realPrepare(AudioContextImpl);
    expect(resume).toHaveBeenCalled(); // kicked synchronously inside the gesture stack
    await prepared.resumePromise;
    expect(prepared.context.state).toBe('running');
    const stillSuspended = new AudioContextImpl();
    expect(stillSuspended.state).toBe('suspended');
    await realStart({
      stream: { getTracks: () => [{ stop: vi.fn() }] },
      context: stillSuspended,
      onChunk: () => {},
      AudioContextImpl,
    });
    expect(stillSuspended.state).toBe('running');
    expect(resume.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('resamples 48 kHz PCM16 to 24 kHz with the expected length', async () => {
    const { resamplePcm16: realResample, SAMPLE_RATE: rate } = await vi.importActual('../../../../src/features/assistant/client/realtime.js');
    const samples = 480;
    const src = new Int16Array(samples);
    for (let i = 0; i < samples; i += 1) src[i] = i;
    const out = realResample(new Uint8Array(src.buffer), 48000, rate);
    expect(rate).toBe(24000);
    expect(out.byteLength).toBe(240 * 2);
  });

  it('iOS capture: AudioContext is created and resumed in the gesture, and 48 kHz input is resampled to 24 kHz before send', async () => {
    const order = [];
    const { prepareCaptureContext: realPrepare, startMicrophone: realStart, SAMPLE_RATE: rate } = await vi.importActual('../../../../src/features/assistant/client/realtime.js');
    const resume = vi.fn(function resume() {
      order.push('resume');
      return new Promise(resolve => { queueMicrotask(() => { this.state = 'running'; order.push('resume-resolved'); resolve(); }); });
    });
    const AudioContextImpl = class {
      constructor({ sampleRate } = {}) {
        order.push('construct');
        this.sampleRate = 48000;
        this.state = 'suspended';
        this.destination = {};
        this.resume = resume;
        this._requested = sampleRate;
      }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() {
        const processor = {
          connect() {
            processor.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array(480) } });
          },
          disconnect() {},
          onaudioprocess: null,
        };
        return processor;
      }
      async close() {}
    };
    const prepared = realPrepare(AudioContextImpl);
    expect(order).toEqual(['construct', 'resume']);
    expect(prepared.context.state).toBe('suspended');
    await prepared.resumePromise;
    expect(order).toEqual(['construct', 'resume', 'resume-resolved']);
    expect(prepared.context.state).toBe('running');
    let sent;
    await realStart({
      stream: { getTracks: () => [{ stop: vi.fn() }] },
      context: prepared.context,
      onChunk: bytes => { sent = bytes; },
      AudioContextImpl,
    });
    expect(rate).toBe(24000);
    expect(prepared.context.sampleRate).toBe(48000);
    expect(sent.byteLength).toBe(240 * 2);
  });
});

describe('content-free voice telemetry', () => {
  it('drops text, tokens, transcripts, and ids from the logged context', () => {
    const leaked = sanitizeVoiceLogContext({
      ms: 12,
      reason: 'connect-budget',
      text: 'received 30 bales',
      token: 'xai-secret',
      transcript: 'hello',
      conversationId: 'abc',
      authorization: 'Bearer x',
      audio: 'AAAA',
    });
    expect(leaked).toEqual({ ms: 12, reason: 'connect-budget' });
    expect(leaked).not.toHaveProperty('text');
    expect(leaked).not.toHaveProperty('token');
    expect(leaked).not.toHaveProperty('transcript');
    expect(leaked).not.toHaveProperty('conversationId');
    expect(leaked).not.toHaveProperty('authorization');
    expect(leaked).not.toHaveProperty('audio');
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    logVoice('mint-done', { ok: true, text: 'secret', token: 'tok', id: 'c1' });
    expect(spy).toHaveBeenCalledWith('assistant-voice', 'mint-done', { ok: true });
    const context = spy.mock.calls[0][2];
    expect(JSON.stringify(context)).not.toMatch(/secret|tok|c1/);
    spy.mockRestore();
  });
});

describe('testing recorder cap', () => {
  it('stops itself when the session-cap timer fires', async () => {
    let cap;
    const rec = createTestingRecorder({
      stream: {},
      MediaRecorderImpl: class {
        static isTypeSupported() { return true; }
        constructor() { this.state = 'recording'; this.mimeType = 'audio/webm'; }
        start() { this.state = 'recording'; }
        stop() { this.state = 'inactive'; this.onstop?.(); }
      },
      maxMs: 600_000,
      setTimer: (fn, ms) => { cap = { fn, ms }; return 1; },
      clearTimer: vi.fn(),
    });
    expect(cap.ms).toBe(600_000);
    cap.fn();
    const result = await rec.stop();
    expect(result.blob).toBeInstanceOf(Blob);
  });
});

describe('api command abort', () => {
  it('forwards an AbortSignal to fetch', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ value: { token: 't' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const api = createAssistantApi({
      supabaseUrl: 'https://example.invalid',
      anonKey: 'anon',
      getAccessToken: async () => 'jwt',
      operationId: '11111111-1111-1111-1111-111111111111',
      fetch,
    });
    await api.command('c1', 'voice-authorization', {}, controller.signal);
    expect(fetch).toHaveBeenCalled();
    expect(fetch.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe('talk() connect budget and Listening', () => {
  it('shows Connecting until the connection is live and the first chunk is sent, then Listening', async () => {
    const conv = mockConversation();
    const say = vi.fn();
    const onListening = vi.fn();
    let releaseConnect;
    VoiceTransport.prototype.hold = new Promise(r => { releaseConnect = r; });
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say, onListening });
    const talking = session.talk();
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('Connecting…'));
    expect(onListening).not.toHaveBeenCalledWith(true);
    expect(say).not.toHaveBeenCalledWith('Listening… say "over" or tap again when done.');
    expect(createTestingRecorder).not.toHaveBeenCalled();
    expect(session.listening).toBe(false);
    releaseConnect();
    await expect(talking).resolves.toBe('listening');
    expect(onListening).toHaveBeenCalledWith(true);
    expect(say).toHaveBeenCalledWith('Listening… say "over" or tap again when done.');
    expect(createTestingRecorder).toHaveBeenCalledTimes(1);
    expect(createTestingRecorder.mock.calls[0][0].maxMs).toBe(600_000);
    expect(session.listening).toBe(true);
    delete VoiceTransport.prototype.hold;
  });

  it('times out the hung mint via AbortSignal and returns unavailable', async () => {
    vi.useFakeTimers();
    const conv = mockConversation({ authHang: true });
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    const talking = session.talk();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 25; i += 1) await Promise.resolve();
    expect(conv.voiceAuthorization).toHaveBeenCalled();
    const signal = conv.voiceAuthorization.mock.calls[0][0];
    expect(signal).toBeInstanceOf(AbortSignal);
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await expect(talking).resolves.toBe('unavailable');
    expect(signal.aborted).toBe(true);
    expect(session.micFailure.message).toMatch(/type instead/i);
    expect(voiceHolders.mics[0].stop).toHaveBeenCalled();
    expect(conv.discardEmpty).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('ends a live voice turn when a typed send arrives, then composes the text', async () => {
    const conv = mockConversation();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    await session.talk();
    const driver = voiceHolders.drivers[0];
    const mic = voiceHolders.mics[0];
    await session.text('received 30 bales');
    expect(driver.endTurn).toHaveBeenCalled();
    expect(mic.stop).toHaveBeenCalled();
    expect(VoiceTransport.instances[0].cancel).toHaveBeenCalled();
    expect(conv.discardEmpty).not.toHaveBeenCalled();
    expect(conv.turn).toHaveBeenCalledWith(expect.objectContaining({ role: 'user', modality: 'text', text: 'received 30 bales' }));
    expect(session.listening).toBe(false);
  });

  it('hides the Type-here box from the tap through Connecting and Listening, showing End only when ready', async () => {
    mockConversation();
    const entry = openAssistant(deps, config, { mode: 'voice' });
    const input = document.querySelector('[data-testid="assistant-text"]');
    const send = document.querySelector('[data-testid="assistant-send"]');
    const end = document.querySelector('[data-testid="assistant-end"]');
    expect(input.hidden).toBe(true);
    expect(send.hidden).toBe(true);
    expect(end.hidden).toBe(true);
    await entry.ready;
    expect(input.hidden).toBe(true);
    expect(send.hidden).toBe(true);
    expect(end.hidden).toBe(false);
    await entry.close();
    expect(input.hidden).toBe(false);
    expect(end.hidden).toBe(true);
  });

  it('startup states keep Listening, status, bubble and End in agreement', async () => {
    let releaseMint;
    const mintGate = new Promise(resolve => { releaseMint = resolve; });
    const conv = mockConversation();
    conv.voiceAuthorization = vi.fn(async () => {
      await mintGate;
      return { provider: 'xai', token: 'tok', expiresAt: Date.now() + 60000 };
    });
    let releaseConnect;
    VoiceTransport.prototype.hold = new Promise(resolve => { releaseConnect = resolve; });
    mountPushToTalk(deps, config);
    document.querySelector('[data-testid="ptt-button"]').click();

    const assertConnecting = () => {
      expect(document.querySelector('[data-testid="assistant-status"]').textContent).toBe('Connecting…');
      expect(document.querySelector('[data-testid="ptt-status-text"]').textContent).toBe('Connecting…');
      expect(document.querySelector('[data-testid="ptt-status"]').hidden).toBe(false);
      expect(document.querySelector('[data-testid="assistant-end"]').hidden).toBe(true);
      expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(true);
      expect(document.querySelector('[data-testid="ptt-button"]').getAttribute('aria-pressed')).toBe('false');
      expect(createTestingRecorder).not.toHaveBeenCalled();
    };

    await vi.waitFor(() => expect(document.querySelector('[data-testid="assistant-status"]')?.textContent).toBe('Connecting…'));
    await vi.waitFor(() => expect(conv.voiceAuthorization).toHaveBeenCalled());
    assertConnecting(); // mic acquired, mint pending
    releaseMint();
    await vi.waitFor(() => expect(VoiceTransport.instances.length).toBe(1));
    assertConnecting(); // connect pending
    releaseConnect();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="assistant-status"]').textContent).toMatch(/^Listening/));
    expect(document.querySelector('[data-testid="ptt-status-text"]').textContent).toMatch(/^Listening/);
    expect(document.querySelector('[data-testid="ptt-status"]').hidden).toBe(false);
    expect(document.querySelector('[data-testid="assistant-end"]').hidden).toBe(false);
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(true);
    expect(document.querySelector('[data-testid="ptt-button"]').getAttribute('aria-pressed')).toBe('true');
    expect(createTestingRecorder).toHaveBeenCalledTimes(1);
  });

  it('a forced hung connect stays Connecting, then reaches the 10s terminal path once and offers Type instead?', async () => {
    vi.useFakeTimers();
    const conv = mockConversation();
    let releaseConnect;
    VoiceTransport.prototype.hold = new Promise(resolve => { releaseConnect = resolve; });
    const stopTrack = vi.fn();
    globalThis.navigator.mediaDevices.getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }));
    const phases = [];
    const spy = vi.spyOn(logger, 'info').mockImplementation((category, message, context) => {
      if (category === 'assistant-voice') phases.push({ phase: message, context: { ...context } });
    });
    mountPushToTalk(deps, config);
    document.querySelector('[data-testid="ptt-button"]').click();
    await vi.advanceTimersByTimeAsync(1);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    expect(document.querySelector('[data-testid="assistant-status"]').textContent).toBe('Connecting…');
    expect(document.querySelector('[data-testid="ptt-status-text"]').textContent).toBe('Connecting…');
    expect(document.querySelector('[data-testid="assistant-end"]').hidden).toBe(true);
    expect(createTestingRecorder).not.toHaveBeenCalled();
    expect(VoiceTransport.instances.length).toBe(1);
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    expect(document.querySelector('[data-testid="ptt-type-instead-question"]').textContent).toBe('Type instead?');
    expect(document.querySelector('[data-testid="assistant-status"]')?.textContent ?? '').not.toMatch(/Listening/);
    expect(document.querySelector('[data-testid="ptt-status-text"]')?.textContent ?? '').not.toMatch(/Listening/);
    expect(stopTrack).toHaveBeenCalled();
    expect(voiceHolders.mics[0].stop).toHaveBeenCalled();
    expect(createTestingRecorder).not.toHaveBeenCalled();
    expect(conv.discardEmpty).toHaveBeenCalledTimes(1);
    const names = phases.map(entry => entry.phase);
    expect(names).toContain('connecting');
    expect(names).toContain('mint-done');
    expect(names).toContain('teardown');
    expect(names).not.toContain('session-created');
    expect(names).not.toContain('first-chunk-sent');
    expect(names).not.toContain('voice-ready');
    expect(names.at(-1)).toBe('teardown');
    expect(JSON.stringify(phases)).not.toMatch(/measured audio|audio_minutes|worst-case settlement is measured/i);
    releaseConnect();
    await Promise.resolve();
    await Promise.resolve();
    expect(createTestingRecorder).not.toHaveBeenCalled();
    expect(conv.discardEmpty).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-testid="assistant-status"]')?.textContent ?? '').not.toMatch(/Listening/);
    spy.mockRestore();
    vi.useRealTimers();
  });

  it('a connect that never sends a first chunk reaches the 10s terminal path and never Listening', async () => {
    vi.useFakeTimers();
    startMicrophone.mockImplementationOnce(async ({ stream } = {}) => {
      const stop = vi.fn(async () => {});
      const mic = { stream: stream || {}, stop };
      voiceHolders.mics.push(mic);
      return mic;
    });
    const conv = mockConversation();
    const say = vi.fn();
    const onListening = vi.fn();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say, onListening });
    const talking = session.talk();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    expect(say).toHaveBeenCalledWith('Connecting…');
    expect(onListening).not.toHaveBeenCalledWith(true);
    expect(session.listening).toBe(false);
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await expect(talking).resolves.toBe('unavailable');
    expect(onListening).not.toHaveBeenCalledWith(true);
    expect(session.listening).toBe(false);
    expect(createTestingRecorder).not.toHaveBeenCalled();
    expect(conv.discardEmpty).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('restores Type here after turn end, header Cancel, or connect failure, and Cancel uses the shared lifecycle', async () => {
    mockConversation();
    const live = openAssistant(deps, config, { mode: 'voice' });
    await live.ready;
    const input = document.querySelector('[data-testid="assistant-text"]');
    const end = document.querySelector('[data-testid="assistant-end"]');
    expect(input.hidden).toBe(true);
    expect(end.hidden).toBe(false);
    end.click();
    await vi.waitFor(() => expect(input.hidden).toBe(false));
    expect(end.hidden).toBe(true);
    await live.close();
    createTestingRecorder.mockClear();

    const conv = mockConversation();
    let releaseConnect;
    VoiceTransport.prototype.hold = new Promise(resolve => { releaseConnect = resolve; });
    const starting = openAssistant(deps, config, { mode: 'voice' });
    await vi.waitFor(() => expect(document.querySelector('[data-testid="assistant-status"]').textContent).toBe('Connecting…'));
    document.querySelector('[data-testid="assistant-cancel"]').click();
    await vi.waitFor(() => expect(starting.isClosed()).toBe(true));
    await vi.waitFor(() => expect(conv.discardEmpty).toHaveBeenCalledTimes(1));
    expect(createTestingRecorder).not.toHaveBeenCalled();
    releaseConnect();
    await Promise.resolve();
    expect(starting.isClosed()).toBe(true);
    expect(createTestingRecorder).not.toHaveBeenCalled();

    vi.useFakeTimers();
    VoiceTransport.prototype.hold = new Promise(() => {});
    const failed = openAssistant(deps, config, { mode: 'voice' });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await failed.ready;
    expect(document.querySelector('[data-testid="assistant-text"]').hidden).toBe(false);
    expect(document.querySelector('[data-testid="assistant-end"]').hidden).toBe(true);
    expect(document.querySelector('[data-testid="assistant-status"]').textContent).not.toMatch(/Listening/);
    vi.useRealTimers();
  });

  it('stops the testing recorder on teardown and keeps no audio when the session never connects', async () => {
    const recStop = vi.fn(async () => null);
    createTestingRecorder.mockImplementation(() => ({ capturedAt: '2026-11-10T00:00:00.000Z', stop: recStop }));
    mockConversation();
    const live = openAssistant(deps, config, { mode: 'voice' });
    await live.ready;
    expect(createTestingRecorder).toHaveBeenCalledTimes(1);
    await live.close();
    expect(recStop).toHaveBeenCalledTimes(1);

    createTestingRecorder.mockClear();
    VoiceTransport.prototype.hold = new Promise(() => {});
    vi.useFakeTimers();
    const hung = openAssistant(deps, config, { mode: 'voice' });
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 40; i += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(VOICE_CONNECT_BUDGET_MS);
    await hung.ready;
    expect(createTestingRecorder).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

});
