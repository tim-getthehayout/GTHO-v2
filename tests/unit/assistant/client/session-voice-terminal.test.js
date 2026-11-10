/**
 * @file Session cap, unexpected socket close, and voice-unavailable go through
 * onVoiceTerminal so the host can run the shared endLiveSession path
 * (transport/mic/timer + hide End).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const onStatusHolders = [];
vi.mock('../../../../src/features/assistant/client/realtime.js', () => ({
  createXaiRealtimeDriver: vi.fn(({ onStatus }) => {
    onStatusHolders.push(onStatus);
    return {
      endTurn: vi.fn(),
      speak: vi.fn(() => true),
      get connected() { return true; },
      connect: vi.fn(async ({ onDisconnect }) => ({
        sendAudio: vi.fn(),
        sendText: vi.fn(),
        interrupt: vi.fn(),
        cancel: vi.fn(),
        close: vi.fn(async () => { onDisconnect?.(); }),
        endTurn: vi.fn(),
        speak: vi.fn(),
      })),
    };
  }),
  acquireMicrophone: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })),
  startMicrophone: vi.fn(async ({ stream, onChunk } = {}) => ({ stream: stream || {}, stop: vi.fn(async () => {}) })),
  createPcmPlayer: vi.fn(() => ({ play: vi.fn(), close: vi.fn(async () => {}) })),
  createAudioChunkBuffer: () => {
    const queue = [];
    return {
      get length() { return queue.length; },
      onChunk(bytes) { queue.push(bytes); },
      async flushTo(send) { for (const c of queue.splice(0)) await send(c); },
      discard() { queue.length = 0; },
    };
  },
  voiceStartTap: () => null,
  voiceStartMark: () => {},
  classifyMicError: vi.fn(error => ({ name: error?.name || 'NotFoundError', message: error?.name === 'NotAllowedError' ? 'Microphone access is blocked.' : 'No microphone found.' })),
  OFFLINE_NO_MIC_MESSAGE: "No microphone found, so the voice note wasn't recorded. You can use the normal screens.",
  VOICE_UNAVAILABLE_MESSAGE: 'Voice is unavailable right now; you can type instead.',
  MIC_MISSING_MESSAGE: 'No microphone found.',
  MIC_BLOCKED_MESSAGE: 'Microphone access is blocked.',
  TYPE_INSTEAD_QUESTION: 'Type instead?',
}));

const onStateHolders = [];
vi.mock('../../../../src/features/assistant/shared.js', async () => {
  class VoiceTransport {
    constructor({ onState } = {}) {
      this.state = 'connected';
      this.onState = onState;
      if (onState) onStateHolders.push(onState);
      this.cancel = vi.fn(async () => { this.state = 'cancelled'; onState?.('cancelled'); });
    }
    async connect() { this.state = 'connected'; }
    async stream() {}
    async text() {}
    /** Test helper: simulate VoiceTransport #disconnect after unexpected socket close. */
    simulateDisconnect(state = 'text-fallback') {
      this.state = state;
      this.onState?.(state);
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

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(() => ({
    ref: 'c1',
    scope: { operationId: 'op', actorId: 'u' },
    session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {} },
    route: null,
    begin: vi.fn(async () => {}),
    turn: vi.fn(async () => null),
    switchIntent: vi.fn(),
    voiceAuthorization: vi.fn(async () => ({ provider: 'xai', token: 't', expiresAt: Date.now() + 60000 })),
  })),
  createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(),
  feedbackSheetSession: vi.fn(),
}));

vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: vi.fn(() => ({
    current: null,
    ensure: vi.fn(async () => ({ id: 'a1' })),
    reroute: vi.fn(),
    finish: vi.fn(),
  })),
}));

vi.mock('../../../../src/features/assistant/client/consent.js', () => ({
  resolveTestingConsent: vi.fn(async () => null),
}));

const { createAssistantSession } = await import('../../../../src/features/assistant/client/session.js');
const { createXaiRealtimeDriver, startMicrophone, acquireMicrophone } = await import('../../../../src/features/assistant/client/realtime.js');

const deps = {
  api: {},
  scope: () => ({ operationId: 'op', actorId: 'u' }),
  persist: vi.fn(),
  awaitServerRows: vi.fn(),
  buildStamp: 'test',
};

beforeEach(() => {
  onStatusHolders.length = 0;
  onStateHolders.length = 0;
  createXaiRealtimeDriver.mockClear();
  startMicrophone.mockClear();
  acquireMicrophone.mockClear();
  acquireMicrophone.mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
});

describe('voice terminal notifications', () => {
  it('session-cap notifies onVoiceTerminal instead of only stopping the mic', async () => {
    const onVoiceTerminal = vi.fn();
    const say = vi.fn();
    const session = createAssistantSession({
      deps, config: { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', sessionCapSeconds: 600, earlyTesting: false },
      intent: 'data-entry', say, onVoiceTerminal,
    });
    await session.talk();
    expect(onStatusHolders).toHaveLength(1);
    onStatusHolders[0]('session-cap');
    expect(onVoiceTerminal).toHaveBeenCalledWith('Voice session ended at 10 minutes. Tap to start a new one.');
    // Host owns full cleanup via endLiveSession → session.end(); do not leave a
    // stranded stopVoice-only path as the primary reaction.
    expect(say).not.toHaveBeenCalledWith('Voice session ended at 10 minutes. Tap to start a new one.');
  });

  it('voice-unavailable returns unavailable with Type-instead message (no stranded timer)', async () => {
    const { VoiceTransport } = await import('../../../../src/features/assistant/shared.js');
    const onVoiceTerminal = vi.fn();
    // Force text-fallback after connect.
    const original = VoiceTransport.prototype.connect;
    VoiceTransport.prototype.connect = async function connect() { this.state = 'text-fallback'; };
    try {
      const session = createAssistantSession({
        deps, config: { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', earlyTesting: false },
        intent: 'data-entry', say: vi.fn(), onVoiceTerminal,
      });
      await expect(session.talk()).resolves.toBe('unavailable');
      expect(session.micFailure.message).toMatch(/type instead/i);
      // Host prompts Type instead? via the return code; session-cap still uses onVoiceTerminal.
      expect(onVoiceTerminal).not.toHaveBeenCalled();
    } finally {
      VoiceTransport.prototype.connect = original;
    }
  });

  it('unexpected transport drop after connect notifies onVoiceTerminal (shared stop path)', async () => {
    const onVoiceTerminal = vi.fn();
    const session = createAssistantSession({
      deps, config: { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', earlyTesting: false },
      intent: 'data-entry', say: vi.fn(), onVoiceTerminal,
    });
    await expect(session.talk()).resolves.toBe('listening');
    expect(onStateHolders).toHaveLength(1);
    // Simulate VoiceTransport onDisconnect → #disconnect('text-fallback').
    onStateHolders[0]('text-fallback');
    expect(onVoiceTerminal).toHaveBeenCalledWith('Voice connection ended. Tap to start a new one.');
  });

  it('intentional session.end cancel does not re-fire onVoiceTerminal via onState', async () => {
    const onVoiceTerminal = vi.fn();
    const session = createAssistantSession({
      deps, config: { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', earlyTesting: false },
      intent: 'data-entry', say: vi.fn(), onVoiceTerminal,
    });
    await session.talk();
    await session.end();
    expect(onVoiceTerminal).not.toHaveBeenCalled();
  });
});
