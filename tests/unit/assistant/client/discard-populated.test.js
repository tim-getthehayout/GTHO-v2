import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../src/features/assistant/client/conversation.js', () => ({
  createAssistantConversation: vi.fn(),
  createFarmReviewFlow: vi.fn(),
  createFeedbackFiling: vi.fn(),
  feedbackSheetSession: vi.fn(),
}));
vi.mock('../../../../src/features/assistant/client/attempts.js', () => ({
  createAttemptTracker: vi.fn(() => ({
    current: { id: 'a1' },
    ensure: vi.fn(async () => ({ id: 'a1' })),
    reroute: vi.fn(),
    finish: vi.fn(),
  })),
}));
vi.mock('../../../../src/features/assistant/client/consent.js', () => ({
  resolveTestingConsent: vi.fn(async () => null),
}));

const { createAssistantSession, DISCARD_EMPTY_FAILED_MESSAGE } = await import('../../../../src/features/assistant/client/session.js');
const { createAssistantConversation } = await import('../../../../src/features/assistant/client/conversation.js');

describe('end() after a failed-but-traced typed request', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the conversation records and does not show the cleanup-failure bubble when discard is refused because turns exist', async () => {
    const conv = {
      ref: 'c1',
      scope: { operationId: 'op', actorId: 'u' },
      session: { intent: 'data-entry', phase: 'converse', transcript: [{ id: 't', role: 'user', modality: 'text', text: 'e1' }], capture: {}, conversationRef: 'c1' },
      route: null,
      begin: vi.fn(async () => {}),
      turn: vi.fn(async () => null),
      cancel: vi.fn(async () => {}),
      discardEmpty: vi.fn(async () => {
        throw Object.assign(new Error('discard-empty-refused-turns-exist'), { code: 'discard-empty-refused-turns-exist' });
      }),
    };
    createAssistantConversation.mockImplementation(() => conv);
    const say = vi.fn();
    const session = createAssistantSession({
      deps: {
        api: {},
        scope: () => conv.scope,
        persist: async () => ({}),
        awaitServerRows: async () => {},
      },
      config: { earlyTesting: false },
      intent: 'data-entry',
      say,
    });
    await session.begin();
    await session.end();
    expect(conv.discardEmpty).toHaveBeenCalled();
    expect(conv.cancel).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalledWith(DISCARD_EMPTY_FAILED_MESSAGE);
    expect(session.discardEmptyFailed).toBe(false);
    expect(session.conversation).toBeNull();
  });
});
