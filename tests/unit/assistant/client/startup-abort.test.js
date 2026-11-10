/**
 * @file Faster-start Listening can show before the realtime driver exists, and
 * during auth/connect the driver object may already exist while endTurn is still
 * ignored. A second tap must queue until connection ready AND PCM flushed.
 * End during begin/auth/connect must abort the in-flight startup (discard PCM
 * buffer + empty conversation) without leaving mic/End stranded.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let connectGate;
let releaseConnect;
let brokerCalls = 0;
let transportInstances = [];
let micOnChunk = null;

vi.mock('../../../../src/features/assistant/shared.js', async () => {
  class VoiceTransport {
    constructor({ broker }) {
      this.state = 'idle';
      this.broker = broker;
      this.cancel = vi.fn(async () => { this.state = 'cancelled'; });
      this.stream = vi.fn(async () => {});
      transportInstances.push(this);
    }
    async connect() {
      await this.broker();
      brokerCalls += 1;
      if (connectGate) await connectGate;
      this.state = 'connected';
    }
  }
  return {
    VoiceTransport,
    feedback: {},
    ConversationRuntime: class {},
    XaiProvider: class {},
    createVoiceBroker: vi.fn(),
    createBackendHandler: vi.fn(),
    RuntimeError: class extends Error { constructor(code) { super(code); this.code = code; } },
  };
});

vi.mock('../../../../src/features/assistant/client/realtime.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createXaiRealtimeDriver: vi.fn(() => ({
      endTurn: vi.fn(),
      speak: vi.fn(() => true),
      get connected() { return true; },
      connect: vi.fn(async () => ({
        sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(),
        cancel: vi.fn(), close: vi.fn(), endTurn: vi.fn(), speak: vi.fn(),
      })),
    })),
    createPcmPlayer: vi.fn(() => ({ play: vi.fn(), close: vi.fn(async () => {}) })),
    startMicrophone: vi.fn(async ({ stream, onChunk }) => {
      micOnChunk = onChunk;
      onChunk?.(new Uint8Array([1]));
      return { stream: stream || {}, stop: vi.fn(async () => {}) };
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
  resolveTestingConsent: vi.fn(async () => null),
}));

const { createAssistantSession } = await import('../../../../src/features/assistant/client/session.js');
const { createAssistantConversation } = await import('../../../../src/features/assistant/client/conversation.js');
const { createXaiRealtimeDriver, startMicrophone } = await import('../../../../src/features/assistant/client/realtime.js');

const deps = {
  api: {},
  scope: () => ({ operationId: 'op', actorId: 'u' }),
  persist: vi.fn(),
  awaitServerRows: vi.fn(async () => true),
  buildStamp: 'test',
};
const config = {
  model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none',
  turnDetection: 'manual', sessionCapSeconds: 600, earlyTesting: false,
  transcriptionModel: 'grok-transcribe',
};

function mockConversation({ gateBegin = false } = {}) {
  let releaseBegin;
  const beginGate = gateBegin ? new Promise((r) => { releaseBegin = r; }) : null;
  const voiceAuthorization = vi.fn(async () => ({
    provider: 'xai', token: `tok-${brokerCalls + 1}`, expiresAt: Date.now() + 60000,
  }));
  const conv = {
    ref: 'c1',
    scope: { operationId: 'op', actorId: 'u' },
    session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
    route: null,
    begin: vi.fn(async () => { if (beginGate) await beginGate; }),
    turn: vi.fn(async () => null),
    switchIntent: vi.fn(),
    cancel: vi.fn(async () => ({})),
    discardEmpty: vi.fn(async () => ({ value: { outcome: 'discarded' } })),
    voiceAuthorization,
    releaseBegin: () => releaseBegin?.(),
  };
  createAssistantConversation.mockImplementation(() => conv);
  return conv;
}

beforeEach(() => {
  transportInstances = [];
  brokerCalls = 0;
  micOnChunk = null;
  connectGate = null;
  releaseConnect = null;
  createAssistantConversation.mockReset();
  createXaiRealtimeDriver.mockClear();
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) } },
    configurable: true,
  });
  globalThis.AudioContext = class {
    constructor({ sampleRate } = {}) { this.sampleRate = sampleRate || 24000; this.state = 'running'; this.resume = async () => { this.state = 'running'; }; this.close = async () => {}; this.destination = {}; }
  };
});

describe('startup second-tap and End abort', () => {
  it('second tap while Connecting before driver queues endTurn (no throw on undefined)', async () => {
    const conv = mockConversation({ gateBegin: true });
    const driverHolder = [];
    createXaiRealtimeDriver.mockImplementation(() => {
      const d = {
        endTurn: vi.fn(), speak: vi.fn(() => true), get connected() { return true; },
        connect: vi.fn(async () => ({
          sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(),
          cancel: vi.fn(), close: vi.fn(), endTurn: vi.fn(), speak: vi.fn(),
        })),
      };
      driverHolder.push(d);
      return d;
    });
    const say = vi.fn();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say });
    const first = session.talk();
    await vi.waitFor(() => {
      expect(say).toHaveBeenCalledWith('Connecting…');
    });
    // begin still gated → driver not created yet. Second tap must queue, not throw.
    expect(say).not.toHaveBeenCalledWith(expect.stringMatching(/Listening/));
    expect(driverHolder).toHaveLength(0);
    await expect(session.talk()).resolves.toBe('turn-ended');
    conv.releaseBegin();
    await expect(first).resolves.toBe('turn-ended');
    expect(driverHolder[0].endTurn).toHaveBeenCalled();
  });

  it('End during begin aborts startup, discards empty conversation, never mints', async () => {
    const conv = mockConversation({ gateBegin: true });
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    const talking = session.talk();
    await vi.waitFor(() => expect(startMicrophone).toHaveBeenCalled());
    expect(session.listening).toBe(false);
    await session.end();
    conv.releaseBegin();
    await expect(talking).resolves.toBe('aborted');
    expect(conv.discardEmpty).toHaveBeenCalled();
    expect(conv.voiceAuthorization).not.toHaveBeenCalled();
    expect(brokerCalls).toBe(0);
    expect(session.listening).toBe(false);
  });

  it('End during connect aborts, cancels transport, discards empty start', async () => {
    connectGate = new Promise((r) => { releaseConnect = r; });
    const conv = mockConversation();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
    const talking = session.talk();
    await vi.waitFor(() => expect(transportInstances.length).toBe(1));
    await session.end();
    releaseConnect();
    await expect(talking).resolves.toBe('aborted');
    expect(transportInstances[0].cancel).toHaveBeenCalled();
    expect(conv.discardEmpty).toHaveBeenCalled();
    expect(session.listening).toBe(false);
  });

  it('second tap during gated authorization queues endTurn until connected and flushed', async () => {
    connectGate = new Promise((r) => { releaseConnect = r; });
    const conv = mockConversation();
    const driverHolder = [];
    createXaiRealtimeDriver.mockImplementation(() => {
      const d = {
        endTurn: vi.fn(), speak: vi.fn(() => true), get connected() { return false; },
        connect: vi.fn(async () => ({
          sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(),
          cancel: vi.fn(), close: vi.fn(), endTurn: vi.fn(), speak: vi.fn(),
        })),
      };
      driverHolder.push(d);
      return d;
    });
    const say = vi.fn();
    const session = createAssistantSession({ deps, config, intent: 'data-entry', say });
    const first = session.talk();
    // Driver exists once transport.connect starts (auth/connect gated).
    await vi.waitFor(() => expect(driverHolder).toHaveLength(1));
    expect(createXaiRealtimeDriver).toHaveBeenCalled();
    // Second tap while auth/connect is gated — must NOT call endTurn yet.
    await expect(session.talk()).resolves.toBe('turn-ended');
    expect(driverHolder[0].endTurn).not.toHaveBeenCalled();
    releaseConnect();
    await expect(first).resolves.toBe('turn-ended');
    // After connect + PCM flush, the queued end fires once.
    expect(driverHolder[0].endTurn).toHaveBeenCalledTimes(1);
  });
});
