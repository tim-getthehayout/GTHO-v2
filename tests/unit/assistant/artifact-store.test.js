import { describe, it, expect, vi } from 'vitest';
import { createArtifactStore } from '../../../src/features/assistant/artifact-store.js';
import { ASSISTANT_ENTITIES } from '../../../src/features/assistant/entities.js';
const scope = { operationId: '00000000-0000-4000-8000-000000000001' };
describe('client artifact persistence boundaries', () => {
  it('uses the existing entity validate/add/update/toSupabaseShape paths, without manufacturing durable receipts', async () => {
    const entity = ASSISTANT_ENTITIES.assistantConversations.entity;
    const store = { getById: vi.fn(), add: vi.fn(() => 'ordinary-store-result'), update: vi.fn() };
    const persist = createArtifactStore({ authorize: async () => true, store });
    const record = entity.create({ operationId: scope.operationId, capturedAt: '2026-11-08T19:00:00-05:00', feedbackModulePin: '0.1.3', conversationRuntimePin: '0.1.1' });
    expect(await persist(scope, 'assistantConversations', record)).toBe('ordinary-store-result');
    expect(store.add).toHaveBeenCalledWith('assistantConversations', record, entity.validate, entity.toSupabaseShape, 'assistant_conversations');
    store.getById.mockReturnValue(record);
    await persist(scope, 'assistantConversations', { ...record, originalContext: 'reopened' });
    expect(store.update).toHaveBeenCalledWith('assistantConversations', record.id, expect.objectContaining({ originalContext: 'reopened' }), entity.validate, entity.toSupabaseShape, 'assistant_conversations');
  });
  it('rejects client writes to backend-authoritative tables and cross-operation artifacts', async () => {
    const persist = createArtifactStore({ authorize: async () => true, store: { getById: vi.fn() } });
    await expect(persist(scope, 'assistantSessionCheckpoints', {})).rejects.toThrow('backend-only');
    await expect(persist(scope, 'assistantBillingPolicies', {})).rejects.toThrow('backend-only');
    await expect(persist(scope, 'assistantConversations', { operationId: 'foreign' })).rejects.toThrow('operation-mismatch');
  });
  it('never overwrites a confirmed revision/card/mapping in place after correction', async () => {
    const entity = ASSISTANT_ENTITIES.assistantReviewCards.entity;
    const record = entity.create({ operationId: scope.operationId, revisionId: scope.operationId, presentedAt: '2026-11-08T19:00:00-05:00', populatedUi: 'calving', presentedEvidence: 'old' });
    const store = { getById: () => record, update: vi.fn() };
    const persist = createArtifactStore({ authorize: async () => true, store });
    await expect(persist(scope, 'assistantReviewCards', { ...record, presentedEvidence: 'corrected' })).rejects.toThrow('immutable');
    expect(store.update).not.toHaveBeenCalled();
  });
});
