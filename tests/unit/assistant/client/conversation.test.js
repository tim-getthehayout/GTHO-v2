import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _reset, add, getAll, runDurableWrite } from '../../../../src/data/store.js';
import { createAssistantConversation, createServerRowWaiter, createFeedbackFiling, writeFeedbackSubmission, feedbackSheetSession } from '../../../../src/features/assistant/client/conversation.js';
import { AssistantApiError } from '../../../../src/features/assistant/client/api.js';
import { feedback } from '../../../../src/features/assistant/shared.js';

const OP = '00000000-0000-4000-8000-000000000001', USER = '00000000-0000-4000-8000-000000000010', REF = '00000000-0000-4000-8000-0000000000c1';
const scope = { operationId: OP, actorId: USER };
const fact = value => ({ state: 'known', value, source: 'user' });
const host = { itemId: '00000000-0000-4000-8000-0000000000f1', contractVersion: '0.1.2', appId: 'gtho', screen: { state: 'known', value: 'feed', source: 'host' }, buildStamp: { state: 'known', value: 'b1', source: 'host' }, capturedAt: '2026-11-09T10:00:00.000Z' };
const pending = { id: 'p1', itemRef: 'i1', revision: 1, intent: 'feedback', destination: 'build', fields: { type: 'bug', title: fact('Total doubled'), expected: fact('Matches'), actual: fact('Doubled'), reproSteps: fact(['Open feed', 'Log two bales']), severity: fact('normal'), impact: { affectedWork: fact('Feeding'), workaround: fact('Re-enter'), dataRisk: fact('No') } } };

function fakeApi(script) {
  const calls = [];
  return { calls, async command(ref, command, payload) { calls.push({ command, payload }); return script(command, payload, calls); }, apply: vi.fn(async () => ({ state: 'local-save' })) };
}
beforeEach(() => { _reset(); localStorage.clear(); });

describe('client conversation', () => {
  it('stores the conversation and consent rows and waits for server acknowledgement before start', async () => {
    const order = [];
    const persist = vi.fn(async (s, type, data) => { order.push(`persist:${type}`); return { id: data.id ?? `${type}-id`, ...data }; });
    const awaitServerRows = vi.fn(async rows => { order.push(`await:${rows.map(r => r.entityType).join(',')}`); });
    const api = fakeApi(command => { order.push(command); return { session: { phase: 'converse', transcript: [] } }; });
    const conversation = createAssistantConversation({ api, scope, persist, awaitServerRows, intent: 'how-to', capture: { capturedAt: 'now', source: 'assistant', context: {} }, randomUUID: () => REF });
    await conversation.begin({ consent: 'declined', decidedAt: '2026-11-01T10:00:00.000Z' });
    expect(order).toEqual(['persist:assistantConversations', 'persist:assistantTestingConsents', 'await:assistantConversations,assistantTestingConsents', 'start']);
    expect(persist.mock.calls[1][2]).toMatchObject({ conversationId: REF, actorId: USER, decision: 'declined', decidedAt: '2026-11-01T10:00:00.000Z' });
    expect(api.calls[0].payload).toMatchObject({ intent: 'how-to' });
  });
  it('confirm -> client-apply-pending -> local apply -> receipt -> confirm replay', async () => {
    const api = fakeApi((command, payload, calls) => {
      if (calls.filter(c => c.command === 'confirm').length === 1) throw new AssistantApiError(400, 'client-apply-pending');
      return { session: { phase: 'completed', pending }, value: { state: 'local-save', result: { savedRecordId: 'saved' } } };
    });
    const conversation = createAssistantConversation({ api, scope, persist: vi.fn(), awaitServerRows: vi.fn(), intent: 'feedback', capture: {}, randomUUID: () => REF });
    const applyLocal = vi.fn(async key => ({ savedRecordId: 'saved', localSavedAt: '2026-11-09T10:05:00.000Z', syncQueuedAt: '2026-11-09T10:05:00.000Z', key }));
    const flush = vi.fn();
    const outcome = await conversation.confirmAndApply({ pending, confirmationId: 'conf', applyLocal, flush });
    expect(applyLocal).toHaveBeenCalledWith(JSON.stringify([OP, REF, 'p1', 1]));
    expect(flush).toHaveBeenCalledOnce();
    expect(api.apply).toHaveBeenCalledWith({ conversationRef: REF, proposalId: 'p1', proposalRevision: 1, savedRecordId: 'saved', localSavedAt: '2026-11-09T10:05:00.000Z' });
    expect(outcome.result).toEqual({ state: 'local-save', result: { savedRecordId: 'saved' } });
    expect(api.calls.filter(c => c.command === 'confirm')[0].payload).toEqual({ confirmation: { proposalId: 'p1', revision: 1, evidence: { confirmationId: 'conf' } } });
  });
  it('an ambiguous 503 reads the authoritative phase before any local write', async () => {
    const api = fakeApi(command => {
      if (command === 'confirm') throw new AssistantApiError(503, 'backend-unavailable');
      return { session: { phase: 'review', pending } };
    });
    const conversation = createAssistantConversation({ api, scope, persist: vi.fn(), awaitServerRows: vi.fn(), intent: 'feedback', capture: {}, randomUUID: () => REF });
    const applyLocal = vi.fn();
    await expect(conversation.confirmAndApply({ pending, confirmationId: 'conf', applyLocal, flush: vi.fn() })).rejects.toMatchObject({ status: 503 });
    expect(api.calls.map(c => c.command)).toEqual(['confirm', 'resume']);
    expect(applyLocal).not.toHaveBeenCalled();
  });
  it('waits for server rows by flushing normal sync, then gives up visibly', async () => {
    const flush = vi.fn();
    let seen = false;
    const wait = createServerRowWaiter({ flush, exists: async () => seen, attempts: 3, sleep: async () => { seen = true; } });
    await expect(wait([{ entityType: 'assistantConversations', id: REF }])).resolves.toBe(true);
    const never = createServerRowWaiter({ flush, exists: async () => false, attempts: 2, sleep: async () => {} });
    await expect(never([{ entityType: 'assistantConversations', id: REF }])).rejects.toThrow('server-sync-required');
  });
});

describe('feedback filing through the existing sheet', () => {
  async function confirmedHandoff(fields = pending.fields) {
    const persistDraft = async () => ({ saved: true });
    let session = await feedbackSheetSession({ session: { capture: { context: { feedbackHost: host } }, transcript: [{ role: 'user', text: 'The total doubled' }], pending: { ...pending, fields } }, persistDraft });
    session = await feedback.persistDraft(session, persistDraft);
    session = feedback.presentReview(session);
    session = feedback.acceptReview(session, { source: 'host', confirmed: true, revision: session.review.revision, destination: session.review.destination, evidence: 'click' });
    return feedback.prepareHandoff(session);
  }
  it('writes the submission (id = itemId) with facts and field states in one durable write', () => {
    const item = { ...host, firstNote: fact('The total doubled'), ...pending.fields, impact: { affectedWork: fact('Feeding'), workaround: { state: 'unknown', source: 'user' }, dataRisk: fact('No') } };
    delete item.reproSteps;
    const receipt = runDurableWrite(JSON.stringify([OP, REF, 'p1', 1]), () => writeFeedbackSubmission({ add, scope, conversationRef: REF, confirmationId: 'conf', item }));
    expect(receipt.savedRecordId).toBe(host.itemId);
    const [row] = getAll('submissions');
    expect(row).toMatchObject({ id: host.itemId, feedbackKind: 'bug', title: 'Total doubled', firstNote: 'The total doubled', impactAffectedWork: 'Feeding', impactWorkaround: null, conversationId: REF, reviewConfirmationId: 'conf', contractVersion: '0.1.2' });
    expect(getAll('submissionFieldStates').map(r => r.fieldName).sort()).toEqual(['affectedWork', 'dataRisk', 'workaround']);
  });
  it('returns local_save, sync_queue and acknowledged_handoff reports from real evidence', async () => {
    const handoff = await confirmedHandoff();
    const conversation = { scope, ref: REF, session: { pending }, correct: vi.fn(), confirmAndApply: vi.fn(async () => ({ receipt: { savedRecordId: host.itemId, localSavedAt: 'L', syncQueuedAt: 'Q' }, applied: { state: 'acknowledged-delivery' }, result: { state: 'acknowledged-delivery' } })) };
    const persist = vi.fn(async (s, type, data) => ({ id: `${type}-id`, ...data }));
    const awaitServerRows = vi.fn();
    const file = createFeedbackFiling({ conversation, persist, awaitServerRows, getAll, runDurableWrite, add, flush: vi.fn(), revisionIdFor: async () => 'rev-1' });
    const reports = await file(handoff);
    expect(reports.map(r => r.state)).toEqual(['local_save', 'sync_queue', 'acknowledged_handoff']);
    expect(persist.mock.calls.map(c => c[1])).toEqual(['assistantReviewCards', 'assistantReviewConfirmations']);
    expect(persist.mock.calls[1][2]).toMatchObject({ actorId: USER, revisionId: 'rev-1', channel: 'text', cardId: 'assistantReviewCards-id' });
    expect(awaitServerRows).toHaveBeenCalledWith([{ entityType: 'assistantReviewCards', id: 'assistantReviewCards-id' }, { entityType: 'assistantReviewConfirmations', id: 'assistantReviewConfirmations-id' }]);
    expect(reports[2]).toMatchObject({ itemId: host.itemId, revision: handoff.revision, destination: 'build' });
  });
  it('a sheet edit becomes a correction, never a silent filing', async () => {
    const handoff = await confirmedHandoff({ ...pending.fields, title: fact('Edited title') });
    const conversation = { scope, ref: REF, session: { pending }, correct: vi.fn(), confirmAndApply: vi.fn() };
    const file = createFeedbackFiling({ conversation, persist: vi.fn(), awaitServerRows: vi.fn(), getAll, runDurableWrite, add, flush: vi.fn(), revisionIdFor: async () => 'rev' });
    await expect(file(handoff)).rejects.toThrow('new revision');
    expect(conversation.correct).toHaveBeenCalledWith(expect.objectContaining({ revision: 1, modality: 'text', fields: expect.objectContaining({ title: fact('Edited title') }) }));
    expect(conversation.confirmAndApply).not.toHaveBeenCalled();
  });
});

describe('farm review through the existing normal UI', () => {
  it('pulls server review rows before rendering and applies through the normal UI write after confirm', async () => {
    const { createFarmReviewFlow } = await import('../../../../src/features/assistant/client/conversation.js');
    const ANIMAL = '00000000-0000-4000-8000-0000000000d1';
    const rowsFor = table => table === 'animals' ? [{ id: ANIMAL, operationId: OP, tagNum: '42', active: true }, { id: 'x', operationId: 'other-op', tagNum: '42', active: true }] : [];
    const farmPending = { id: 'p2', itemRef: 'i2', revision: 1, intent: 'data-entry', destination: 'treatment', fields: { product: 'Ivomec', entryTarget: { animal: '42' } } };
    const order = [];
    let hooks;
    const ports = {
      renderReview: vi.fn(async () => { order.push('render'); }),
      recordConfirmation: vi.fn(async () => 'conf-2'),
      applyConfirmedWrite: vi.fn(async () => ({ savedRecordId: 'treatment-1', localSavedAt: 'L' })),
    };
    const conversation = { scope, ref: REF, capture: { context: {} }, session: { pending: farmPending }, correct: vi.fn(), confirmAndApply: vi.fn(async ({ applyLocal }) => ({ receipt: await applyLocal('key'), result: { state: 'local-save' } })) };
    const awaitServerRows = vi.fn(async () => { order.push('await'); });
    const onResult = vi.fn();
    const flow = createFarmReviewFlow({ conversation, createFarmUiPorts: options => { hooks = options; return ports; }, authorize: async () => true, awaitServerRows, getAll: rowsFor, getById: () => ({ id: 'conf-2', cardId: 'card-2' }), flush: vi.fn(), pullReviewRows: async () => { order.push('pull'); }, onResult });
    await flow.render(farmPending);
    expect(order).toEqual(['pull', 'render']);
    expect(await hooks.resolveTarget(scope, farmPending)).toEqual({ ui: 'treatment', id: ANIMAL });
    await expect(hooks.resolveTarget(scope, { ...farmPending, fields: { entryTarget: { animal: '43' } } })).rejects.toThrow("I couldn't find an animal");
    await hooks.onConfirm({ proposalId: 'p2', revision: 1, evidence: { reviewCardId: 'card-2', clickId: 'x' } });
    expect(ports.recordConfirmation).toHaveBeenCalledWith(scope, farmPending, { reviewCardId: 'card-2', clickId: 'x' });
    expect(awaitServerRows).toHaveBeenCalledWith([{ entityType: 'assistantReviewCards', id: 'card-2' }, { entityType: 'assistantReviewConfirmations', id: 'conf-2' }]);
    expect(ports.applyConfirmedWrite).toHaveBeenCalledWith(scope, farmPending, 'conf-2', 'key');
    expect(onResult).toHaveBeenCalledWith(expect.objectContaining({ result: { state: 'local-save' } }));
  });
});
