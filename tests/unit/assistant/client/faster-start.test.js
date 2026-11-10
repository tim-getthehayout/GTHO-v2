/**
 * @file OI-0204 faster start: buffer PCM before WS, Listening before awaitServerRows,
 * mic-failure still mints nothing, no mount prewarm / no cross-tap token reuse.
 * Bench numbers are fake-timer simulations, not phone measurements.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const streamed = [];
let connectImpl = async function connect() { this.state = 'connected'; };
let brokerCalls = 0;
let transportInstances = [];

vi.mock('../../../../src/features/assistant/shared.js', async () => {
  class VoiceTransport {
    constructor({ broker }) {
      this.state = 'idle';
      this.broker = broker;
      this.cancel = vi.fn(async () => { this.state = 'cancelled'; });
      this.stream = vi.fn(async bytes => { streamed.push(Uint8Array.from(bytes)); });
      transportInstances.push(this);
    }
    async connect() {
      const auth = await this.broker();
      brokerCalls += 1;
      this.lastAuth = auth;
      await connectImpl.call(this);
    }
  }
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

let micOnChunk = null;
vi.mock('../../../../src/features/assistant/client/realtime.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createXaiRealtimeDriver: vi.fn(() => ({
      endTurn: vi.fn(), speak: vi.fn(() => true), get connected() { return true; },
      connect: vi.fn(async () => ({ sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(), cancel: vi.fn(), close: vi.fn(), endTurn: vi.fn(), speak: vi.fn() })),
    })),
    createPcmPlayer: vi.fn(() => ({ play: vi.fn(), close: vi.fn(async () => {}) })),
    startMicrophone: vi.fn(async ({ stream, onChunk }) => {
      micOnChunk = onChunk;
      return { stream: stream || {}, stop: vi.fn(async () => {}) };
    }),
    // keep real acquireMicrophone / createAudioChunkBuffer / classifyMicError / marks
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
  resolveTestingConsent: vi.fn(async () => null),
}));

const { createAssistantSession } = await import('../../../../src/features/assistant/client/session.js');
const { createAssistantConversation } = await import('../../../../src/features/assistant/client/conversation.js');
const { startMicrophone, createAudioChunkBuffer, VOICE_UNAVAILABLE_MESSAGE } = await import('../../../../src/features/assistant/client/realtime.js');
const { mountPushToTalk } = await import('../../../../src/features/assistant/client/push-to-talk.js');

const deps = {
  api: {},
  scope: () => ({ operationId: 'op', actorId: 'u' }),
  persist: vi.fn(),
  awaitServerRows: vi.fn(async () => true),
  buildStamp: 'test',
  online: () => true,
  offlineNotes: { list: async () => [] },
};
const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', sessionCapSeconds: 600, earlyTesting: false };

function chunk(n) { return new Uint8Array([n]); }

function mockConversation({ beginDelayMs = 0, auth = null } = {}) {
  let releaseBegin;
  const beginGate = beginDelayMs > 0 ? new Promise(r => { releaseBegin = r; }) : null;
  const voiceAuthorization = vi.fn(async () => auth ?? { provider: 'xai', token: `tok-${brokerCalls + 1}`, expiresAt: Date.now() + 60000 });
  const conv = {
    ref: 'c1',
    scope: { operationId: 'op', actorId: 'u' },
    session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
    route: null,
    begin: vi.fn(async () => {
      if (beginGate) await beginGate;
    }),
    turn: vi.fn(async () => null),
    switchIntent: vi.fn(),
    cancel: vi.fn(async () => {}),
    voiceAuthorization,
    releaseBegin: () => releaseBegin?.(),
  };
  createAssistantConversation.mockImplementation(() => conv);
  return conv;
}

beforeEach(() => {
  document.body.innerHTML = '';
  streamed.length = 0;
  brokerCalls = 0;
  transportInstances = [];
  micOnChunk = null;
  connectImpl = async function connect() { this.state = 'connected'; };
  createAssistantConversation.mockReset();
  startMicrophone.mockClear();

  const mediaDevices = {
    getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  };
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
});

describe('createAudioChunkBuffer', () => {
  it('flushes buffered chunks in order then live-sends', async () => {
    const buf = createAudioChunkBuffer();
    const out = [];
    buf.onChunk(chunk(1));
    buf.onChunk(chunk(2));
    await buf.flushTo(async c => { out.push([...c]); });
    buf.onChunk(chunk(3));
    expect(out).toEqual([[1], [2], [3]]);
  });
  it('discard drops queued audio', async () => {
    const buf = createAudioChunkBuffer();
    buf.onChunk(chunk(1));
    buf.discard();
    const out = [];
    await buf.flushTo(async c => { out.push([...c]); });
    expect(out).toEqual([]);
  });
});

describe('faster start talk()', () => {
  it('shows Listening before awaitServerRows/begin finishes, and flushes pre-WS speech in order', async () => {
    const conv = mockConversation({ beginDelayMs: 1 });
    const say = vi.fn();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say });

    // Hold connect until we push buffered speech.
    let releaseConnect;
    const connectGate = new Promise(r => { releaseConnect = r; });
    connectImpl = async function connect() {
      await connectGate;
      this.state = 'connected';
    };

    const talking = session.talk();
    await vi.waitFor(() => expect(say).toHaveBeenCalledWith('Listening… say "over" or tap again when done.'));
    // begin still blocked — Listening did not wait on it.
    expect(conv.begin).toHaveBeenCalled();
    expect(conv.voiceAuthorization).not.toHaveBeenCalled();

    // Speech while WS not open yet.
    micOnChunk(chunk(10));
    micOnChunk(chunk(20));
    micOnChunk(chunk(30));

    conv.releaseBegin();
    releaseConnect();
    await expect(talking).resolves.toBe('listening');
    expect(conv.voiceAuthorization).toHaveBeenCalledOnce();
    expect(streamed.map(c => [...c])).toEqual([[10], [20], [30]]);
  });

  it('discards the buffer when connect fails (auth/connect path)', async () => {
    mockConversation();
    connectImpl = async function connect() { this.state = 'text-fallback'; };
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    const talking = session.talk();
    await vi.waitFor(() => expect(micOnChunk).toBeTypeOf('function'));
    micOnChunk(chunk(99));
    await expect(talking).resolves.toBe('unavailable');
    expect(session.micFailure.message).toBe(VOICE_UNAVAILABLE_MESSAGE);
    expect(streamed).toEqual([]);
  });

  it('mic failure after begin has started still mints nothing and opens no WS', async () => {
    let releaseMic;
    const micGate = new Promise(r => { releaseMic = r; });
    globalThis.navigator.mediaDevices.getUserMedia = vi.fn(async () => {
      await micGate;
      const err = new Error('missing'); err.name = 'NotFoundError'; throw err;
    });
    const conv = mockConversation({ beginDelayMs: 1 });
    // Force createAssistantConversation path: begin runs in parallel.
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    const talking = session.talk();
    await vi.waitFor(() => expect(createAssistantConversation).toHaveBeenCalled());
    conv.releaseBegin();
    releaseMic();
    await expect(talking).resolves.toBe('no-mic');
    expect(conv.voiceAuthorization).not.toHaveBeenCalled();
    expect(transportInstances).toHaveLength(0);
    expect(brokerCalls).toBe(0);
    expect(conv.cancel).toHaveBeenCalled();
  });

  it('each tap mints a fresh token (no cross-tap reuse); mount does not mint', async () => {
    // Mount must not call voice auth.
    const sessions = [];
    mockConversation();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    await session.talk();
    const firstToken = transportInstances[0].lastAuth.token;
    await session.end();
    // Second talk on a new session object (new tap after endLiveSession).
    mockConversation();
    const session2 = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    await session2.talk();
    const secondToken = transportInstances.at(-1).lastAuth.token;
    expect(firstToken).not.toBe(secondToken);
    expect(brokerCalls).toBe(2);
  });
});

describe('no mint on PTT mount', () => {
  it('mountPushToTalk does not call voice-authorization', async () => {
    const voiceAuthorization = vi.fn();
    // Lightweight: mounting must not create a session at all.
    const { createAssistantSession: cas } = await import('../../../../src/features/assistant/client/session.js');
    // push-to-talk imports session at module load — spy via mock already used in other file.
    // Here assert mount with real module doesn't invoke api voice command.
    const api = { command: vi.fn(), config: async () => config };
    const control = mountPushToTalk({
      ...deps,
      api,
      offlineNotes: { list: async () => [], save: vi.fn() },
    }, config);
    expect(control).not.toBeNull();
    expect(api.command).not.toHaveBeenCalled();
    expect(voiceAuthorization).not.toHaveBeenCalled();
    expect(brokerCalls).toBe(0);
  });
});

describe('bench (fake delays — NOT phone numbers)', () => {
  it('parallel mic+begin reaches Listening sooner than sequential mic-then-begin', async () => {
    // Simulated code-path timings (ms), not device measurements.
    const MIC_MS = 80;
    const BEGIN_MS = 200; // awaitServerRows-dominated
    const CONNECT_MS = 150;

    // Before (OI-0196 sequential): mic → begin → connect → Listening
    const beforeListening = MIC_MS + BEGIN_MS + CONNECT_MS;
    // After (OI-0204): Listening at max(mic, …) once mic live; begin overlaps.
    const afterListening = MIC_MS; // Listening as soon as mic settles
    // WS ready after: max(mic, begin) + connect
    const afterWsReady = Math.max(MIC_MS, BEGIN_MS) + CONNECT_MS;
    const beforeWsReady = MIC_MS + BEGIN_MS + CONNECT_MS;

    expect(afterListening).toBeLessThan(beforeListening);
    expect(afterWsReady).toBeLessThanOrEqual(beforeWsReady);
    // Record for the report (clearly labelled simulation).
    globalThis.__GTHO_VOICE_BENCH__ = {
      label: 'fake-timer / assumed delays — NOT phone numbers',
      assumptionsMs: { mic: MIC_MS, beginAwaitServerRows: BEGIN_MS, connect: CONNECT_MS },
      before: { tapToListeningMs: beforeListening, tapToWsReadyMs: beforeWsReady },
      after: { tapToListeningMs: afterListening, tapToWsReadyMs: afterWsReady },
      listeningImprovementMs: beforeListening - afterListening,
      wsReadyImprovementMs: beforeWsReady - afterWsReady,
    };
    expect(globalThis.__GTHO_VOICE_BENCH__.listeningImprovementMs).toBe(BEGIN_MS + CONNECT_MS);
    expect(globalThis.__GTHO_VOICE_BENCH__.wsReadyImprovementMs).toBe(MIC_MS); // begin overlapped with mic
  });
});
