/**
 * @file OI-0196: mic-first before realtime connect; Type instead? on failure;
 * offline note message; header typed path never touches getUserMedia.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const onStatusHolders = [];
const voiceAuth = vi.fn(async () => ({ provider: 'xai', token: 'tok', expiresAt: Date.now() + 60000 }));

vi.mock('../../../../src/features/assistant/client/realtime.js', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    createXaiRealtimeDriver: vi.fn(({ onStatus }) => {
      onStatusHolders.push(onStatus);
      return {
        endTurn: vi.fn(),
        speak: vi.fn(() => true),
        get connected() { return true; },
        connect: vi.fn(async ({ onDisconnect }) => ({
          sendAudio: vi.fn(), sendText: vi.fn(), interrupt: vi.fn(), cancel: vi.fn(),
          close: vi.fn(async () => { onDisconnect?.(); }), endTurn: vi.fn(), speak: vi.fn(),
        })),
      };
    }),
    createPcmPlayer: vi.fn(() => ({ play: vi.fn(), close: vi.fn(async () => {}) })),
  };
});

vi.mock('../../../../src/features/assistant/shared.js', async () => {
  class VoiceTransport {
    constructor({ broker }) { this.state = 'idle'; this.broker = broker; this.cancel = vi.fn(async () => { this.state = 'cancelled'; }); this.stream = vi.fn(); }
    async connect() {
      // Mint happens here via broker — must not run when mic fails first.
      await this.broker();
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
    voiceAuthorization: voiceAuth,
    cancel: vi.fn(async () => {}),
    discardEmpty: vi.fn(async () => ({ value: { outcome: 'discarded' } })),
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

const { createAssistantSession, createOfflineNoteRecorder, DISCARD_EMPTY_FAILED_MESSAGE } = await import('../../../../src/features/assistant/client/session.js');
const { createAssistantConversation } = await import('../../../../src/features/assistant/client/conversation.js');
const {
  acquireMicrophone, classifyMicError, startMicrophone,
  MIC_MISSING_MESSAGE, MIC_BLOCKED_MESSAGE, OFFLINE_NO_MIC_MESSAGE,
} = await import('../../../../src/features/assistant/client/realtime.js');
const { openAssistant } = await import('../../../../src/features/assistant/client/panel.js');

const deps = {
  api: {},
  scope: () => ({ operationId: 'op', actorId: 'u' }),
  persist: vi.fn(),
  awaitServerRows: vi.fn(),
  buildStamp: 'test',
  online: () => true,
  offlineNotes: { list: async () => [] },
};

const config = { model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none', turnDetection: 'manual', sessionCapSeconds: 600, earlyTesting: false };

function micError(name) {
  const err = new Error(name);
  err.name = name;
  return err;
}

beforeEach(() => {
  document.body.innerHTML = '';
  onStatusHolders.length = 0;
  voiceAuth.mockClear();
  createAssistantConversation.mockClear();
});

describe('classifyMicError / acquireMicrophone', () => {
  it('maps NotAllowedError to blocked copy; every other named failure to missing copy', () => {
    expect(classifyMicError(micError('NotAllowedError'))).toEqual({ name: 'NotAllowedError', message: MIC_BLOCKED_MESSAGE });
    for (const name of ['NotFoundError', 'NotReadableError', 'OverconstrainedError', 'SecurityError']) {
      expect(classifyMicError(micError(name))).toEqual({ name, message: MIC_MISSING_MESSAGE });
    }
    expect(classifyMicError(new Error('boom')).message).toBe(MIC_MISSING_MESSAGE);
  });

  it('throws NotFoundError when mediaDevices is missing', async () => {
    await expect(acquireMicrophone({ mediaDevices: undefined })).rejects.toMatchObject({ name: 'NotFoundError' });
  });

  it('forwards getUserMedia for each named failure', async () => {
    for (const name of ['NotFoundError', 'NotAllowedError', 'NotReadableError', 'OverconstrainedError', 'SecurityError']) {
      const mediaDevices = { getUserMedia: vi.fn(async () => { throw micError(name); }) };
      await expect(acquireMicrophone({ mediaDevices })).rejects.toMatchObject({ name });
    }
  });
});

describe('talk() mic-first', () => {
  it('mints only after the mic settles (begin may overlap; Listening before mint)', async () => {
    const order = [];
    let releaseMic;
    const micGate = new Promise(resolve => { releaseMic = resolve; });
    const mediaDevices = {
      getUserMedia: vi.fn(async () => {
        order.push('mic-start');
        await micGate;
        order.push('mic');
        return { getTracks: () => [{ stop: vi.fn() }] };
      }),
    };
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
    const AudioContextImpl = class {
      constructor() { this.destination = {}; this.currentTime = 0; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
      createBuffer() { return { getChannelData: () => new Float32Array(1), duration: 0 }; }
      createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
      async close() {}
    };
    globalThis.AudioContext = AudioContextImpl;

    createAssistantConversation.mockImplementation(() => {
      order.push('begin');
      return {
        ref: 'c1', scope: { operationId: 'op', actorId: 'u' },
        session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
        route: null, begin: vi.fn(async () => { order.push('begin-done'); }), turn: vi.fn(async () => null), switchIntent: vi.fn(),
        cancel: vi.fn(async () => {}),
    discardEmpty: vi.fn(async () => ({ value: { outcome: 'discarded' } })),
        voiceAuthorization: async () => { order.push('mint'); return { provider: 'xai', token: 't', expiresAt: Date.now() + 60000 }; },
      };
    });

    try {
      const say = vi.fn();
      const session = createAssistantSession({ deps, config, intent: 'data-entry', say });
      const talking = session.talk();
      await vi.waitFor(() => expect(order).toContain('begin'));
      // begin overlapped while mic still pending — mint must not have run.
      expect(order).not.toContain('mint');
      releaseMic();
      await expect(talking).resolves.toBe('listening');
      expect(order.indexOf('mic')).toBeLessThan(order.indexOf('mint'));
      expect(say).toHaveBeenCalledWith('Listening… say "over" or tap again when done.');
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });

  it.each([
    ['NotFoundError', MIC_MISSING_MESSAGE],
    ['NotAllowedError', MIC_BLOCKED_MESSAGE],
    ['NotReadableError', MIC_MISSING_MESSAGE],
    ['OverconstrainedError', MIC_MISSING_MESSAGE],
    ['SecurityError', MIC_MISSING_MESSAGE],
  ])('returns no-mic for %s without minting a secret or opening a WS', async (name, message) => {
    const mediaDevices = { getUserMedia: vi.fn(async () => { throw micError(name); }) };
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
    try {
      const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
      await expect(session.talk()).resolves.toBe('no-mic');
      expect(session.micFailure).toEqual({ name, message });
      expect(voiceAuth).not.toHaveBeenCalled();
      // begin may have raced; mint/WS must not.
      expect(session.conversation == null).toBe(true);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });

  it('returns no-mic when mediaDevices is missing, with no mint', async () => {
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    try {
      const session = createAssistantSession({ deps, config, intent: 'data-entry', say: vi.fn() });
      await expect(session.talk()).resolves.toBe('no-mic');
      expect(session.micFailure.message).toBe(MIC_MISSING_MESSAGE);
      expect(voiceAuth).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });

  it('says the locked discard-empty failure copy and does not null the conversation', async () => {
    const mediaDevices = { getUserMedia: vi.fn(async () => { throw micError('NotFoundError'); }) };
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
    const conv = {
      ref: 'c1', scope: { operationId: 'op', actorId: 'u' },
      session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
      route: null, begin: vi.fn(async () => {}), turn: vi.fn(async () => null), switchIntent: vi.fn(),
      cancel: vi.fn(async () => {}),
      discardEmpty: vi.fn(async () => { throw new Error('Could not find the function public.assistant_discard_empty_start'); }),
      voiceAuthorization: voiceAuth,
    };
    createAssistantConversation.mockImplementation(() => conv);
    try {
      const say = vi.fn();
      const session = createAssistantSession({ deps, config, intent: 'data-entry', say });
      await expect(session.talk()).resolves.toBe('no-mic');
      expect(conv.discardEmpty).toHaveBeenCalled();
      expect(say).toHaveBeenCalledWith(DISCARD_EMPTY_FAILED_MESSAGE);
      expect(say).not.toHaveBeenCalledWith(expect.stringMatching(/Could not find the function/));
      expect(session.discardEmptyFailed).toBe(true);
      expect(session.conversation).toBe(conv);
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });
});

describe('offline note recorder no-mic', () => {
  it('says the locked message, leaves no recording, and never prompts Type instead?', async () => {
    const say = vi.fn();
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    try {
      const offline = createOfflineNoteRecorder({ notes: { save: vi.fn() }, say, intent: null });
      await expect(offline.toggle()).resolves.toBe('no-mic');
      expect(say).toHaveBeenCalledWith(OFFLINE_NO_MIC_MESSAGE);
      expect(offline.recording).toBe(false);
      expect(document.querySelector('[data-testid="ptt-type-instead"]')).toBeNull();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });
});

describe('header typed path never needs the mic', () => {
  it('begin + text run with mediaDevices missing and never call getUserMedia', async () => {
    const getUserMedia = vi.fn();
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true });
    // Even if something poked mediaDevices later, ensure getUserMedia is absent.
    try {
      const sheet = openAssistant(deps, config);
      const session = await sheet.begin('data-entry');
      expect(document.querySelector('[data-testid="assistant-text"]')).not.toBeNull();
      // text() goes through conversation.turn — no mic.
      await session.text('Fed two bales in the corral');
      expect(getUserMedia).not.toHaveBeenCalled();
      expect(voiceAuth).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });
});

describe('shared voice sheet: no xAI session before the mic check', () => {
  it('opens Cancel / Type here first and does not mint until getUserMedia settles', async () => {
    const order = [];
    let releaseMic;
    const micGate = new Promise(resolve => { releaseMic = resolve; });
    const mediaDevices = {
      getUserMedia: vi.fn(async () => {
        order.push('mic-start');
        await micGate;
        order.push('mic');
        return { getTracks: () => [{ stop: vi.fn() }] };
      }),
    };
    const saved = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices }, configurable: true });
    const AudioContextImpl = class {
      constructor() { this.destination = {}; this.currentTime = 0; }
      createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
      createScriptProcessor() { return { connect() {}, disconnect() {}, onaudioprocess: null }; }
      createBuffer() { return { getChannelData: () => new Float32Array(1), duration: 0 }; }
      createBufferSource() { return { connect() {}, start() {}, buffer: null }; }
      async close() {}
    };
    globalThis.AudioContext = AudioContextImpl;

    createAssistantConversation.mockImplementation(() => {
      order.push('begin');
      return {
        ref: 'c1', scope: { operationId: 'op', actorId: 'u' },
        session: { intent: 'data-entry', phase: 'converse', transcript: [], capture: {}, conversationRef: 'c1' },
        route: null, begin: vi.fn(async () => { order.push('begin-done'); }), turn: vi.fn(async () => null), switchIntent: vi.fn(),
        cancel: vi.fn(async () => {}),
        discardEmpty: vi.fn(async () => ({ value: { outcome: 'discarded' } })),
        voiceAuthorization: async () => { order.push('mint'); return { provider: 'xai', token: 't', expiresAt: Date.now() + 60000 }; },
      };
    });

    try {
      const say = vi.fn();
      const entry = openAssistant(deps, config, { mode: 'voice', say });
      expect(document.querySelectorAll('[data-testid^="assistant-intent-"]')).toHaveLength(0);
      expect(document.querySelector('[data-testid="assistant-cancel"]').textContent).toBe('Cancel');
      expect(document.querySelector('[data-testid="assistant-text"]').placeholder).toBe('Type here');
      expect(document.querySelector('[data-testid="assistant-end"]')).toBeTruthy();
      await vi.waitFor(() => expect(order).toContain('mic-start'));
      expect(order).not.toContain('mint');
      expect(voiceAuth).not.toHaveBeenCalled();
      releaseMic();
      const outcome = await entry.ready;
      expect(outcome.result).toBe('listening');
      expect(order).toContain('mic');
      expect(order.indexOf('mint')).toBeGreaterThan(order.indexOf('mic'));
    } finally {
      Object.defineProperty(globalThis, 'navigator', { value: saved, configurable: true });
    }
  });
});
