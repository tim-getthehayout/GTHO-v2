/** Browser side of the client-apply handshake. The backend runtime decides; the
 * browser renders reviews through existing UIs, applies the confirmed write via
 * the existing validate()+write path, and reports the receipt. */
import { feedback } from '../shared.js';
import { mapFeedbackFacts } from '../feedback-facts.js';
import * as SubmissionEntity from '../../../entities/submission.js';
import { ASSISTANT_ENTITIES } from '../entities.js';
import { resolveEntryTarget, ENTRY_TARGET_KEY } from '../entry-targets.js';

export const LIBRARY_PINS = Object.freeze({ feedbackModule: '0.1.3', conversationRuntime: '0.1.1' });
const TABLES = { assistantConversations: 'assistant_conversations', assistantTestingConsents: 'assistant_testing_consents', assistantReviewCards: 'assistant_review_cards', assistantReviewConfirmations: 'assistant_review_confirmations', submissions: 'submissions' };

/** Flush the normal sync queue until the server holds every listed row. */
export function createServerRowWaiter({ flush, exists, attempts = 6, delay = attempt => 250 * 2 ** attempt, sleep = ms => new Promise(resolve => globalThis.setTimeout(resolve, ms)) }) {
  return async rows => {
    for (let attempt = 0; attempt < attempts; attempt++) {
      await flush();
      const seen = await Promise.all(rows.map(row => exists(TABLES[row.entityType] ?? row.table, row.id)));
      if (seen.every(Boolean)) return true;
      if (attempt < attempts - 1) await sleep(delay(attempt));
    }
    throw new Error('server-sync-required');
  };
}

export function createAssistantConversation({ api, scope, persist, awaitServerRows, intent, capture, buildStamp = null, randomUUID = () => crypto.randomUUID() }) {
  const ref = randomUUID();
  let session = null, route = null;
  const conversation = {
    ref, scope, capture,
    get session() { return session; },
    /** Intent the model suggested on the last turn (host route-intent), if any. */
    get route() { return route; },
    /** P7/T12: the consent decision is stored and server-acknowledged before start. */
    async begin({ consent = null, decidedAt = new Date().toISOString() } = {}) {
      await persist(scope, 'assistantConversations', { id: ref, operationId: scope.operationId, capturedAt: capture.capturedAt, currentIntent: intent, originalContext: JSON.stringify(capture.context), buildStamp, feedbackModulePin: LIBRARY_PINS.feedbackModule, conversationRuntimePin: LIBRARY_PINS.conversationRuntime });
      const rows = [{ entityType: 'assistantConversations', id: ref }];
      if (consent) {
        const decision = await persist(scope, 'assistantTestingConsents', { operationId: scope.operationId, conversationId: ref, actorId: scope.actorId, decision: consent, decidedAt });
        rows.push({ entityType: 'assistantTestingConsents', id: decision.id });
      }
      await awaitServerRows(rows);
      session = (await api.command(ref, 'start', { intent, capture })).session;
      return session;
    },
    async resume() { session = (await api.command(ref, 'resume')).session; return session; },
    /** Sends one user turn (final voice transcript or typed text); returns any new assistant answer. */
    async turn(turn, { replayOf = null } = {}) {
      const before = session?.transcript?.length ?? 0;
      // replayOf marks a reroute replay for the host (content-free server event).
      const response = await api.command(ref, 'turn', { turn, ...(replayOf ? { replayOf } : {}) });
      session = response.session;
      route = typeof response.route === 'string' && response.route !== session.intent ? response.route : null;
      const added = session.transcript.slice(before).filter(entry => entry.role === 'assistant');
      return added.map(entry => entry.text).join('\n') || null;
    },
    /** Switches through the runtime's own intent command. A pending review is kept
     * as a recoverable draft (preserve), never confirmed or filed by the switch. */
    async switchIntent(intent) {
      const asked = await api.command(ref, 'intent', { intent });
      session = asked.session;
      if (asked.value?.needsDraftDecision) session = (await api.command(ref, 'resolve-intent', { decision: 'preserve' })).session;
      route = null;
      return session;
    },
    async correct(correction) { session = (await api.command(ref, 'correct', { correction })).session; return session; },
    async cancel() { session = (await api.command(ref, 'cancel')).session; return session; },
    /** Empty start only: server deletes checkpoint/lock/attempt; refuses if any turn exists. */
    async discardEmpty() { return api.command(ref, 'discard-empty'); },
    setOpenSheet(value) { api.setOpenSheet?.(value); },
    async voiceAuthorization() { return (await api.command(ref, 'voice-authorization')).value; },
    /**
     * confirm -> client-apply-pending -> local apply (runDurableWrite, idempotent by key)
     * -> flush -> apply receipt -> confirm replays the stored outcome.
     */
    async confirmAndApply({ pending, confirmationId, applyLocal, flush, maxRounds = 3 }) {
      const confirmation = { proposalId: pending.id, revision: pending.revision, evidence: { confirmationId } };
      const key = JSON.stringify([scope.operationId, ref, pending.id, pending.revision]);
      let receipt = null, applied = null;
      for (let round = 0; round < maxRounds; round++) {
        try {
          const done = await api.command(ref, 'confirm', { confirmation });
          session = done.session;
          return { result: done.value, receipt, applied };
        } catch (error) {
          if (error.code === 'client-apply-pending') { /* claim is durable: apply locally */ }
          else if (!(error.status >= 500) && error.status !== undefined) throw error;
          else {
            // Ambiguous network/503: read the authoritative phase before any local write.
            await conversation.resume();
            if (session.phase !== 'executing' || session.pending?.id !== pending.id || session.pending?.revision !== pending.revision) {
              if (session.phase === 'completed') continue;
              throw error;
            }
          }
        }
        receipt = await applyLocal(key);
        await flush();
        try {
          applied = await api.apply({ conversationRef: ref, proposalId: pending.id, proposalRevision: pending.revision, savedRecordId: receipt.savedRecordId, localSavedAt: receipt.localSavedAt });
        } catch (error) {
          if (error.code !== 'execution-claim-required') throw error;
        }
      }
      throw new Error('execution-outcome-unresolved');
    },
  };
  return conversation;
}

const known = fact => fact?.state === 'known' ? (Array.isArray(fact.value) ? fact.value.join('\n') : fact.value) : null;

/** The feedback filing write, inside runDurableWrite; submission id = host itemId. */
export function writeFeedbackSubmission({ add, scope, conversationRef, confirmationId, item, now = new Date().toISOString() }) {
  const { submission: impact, fieldStates, reproSteps } = mapFeedbackFacts(item);
  const record = SubmissionEntity.create({
    id: item.itemId, operationId: scope.operationId, submitterId: scope.actorId, type: 'feedback', category: item.type === 'bug' ? 'bug' : 'feature',
    screen: known(item.screen), note: item.firstNote.value, version: known(item.buildStamp), feedbackKind: item.type, contractVersion: item.contractVersion,
    title: known(item.title), firstNote: item.firstNote.value, expected: known(item.expected), actual: known(item.actual), severity: known(item.severity),
    ...impact, capturedAt: item.capturedAt, filedAt: now, conversationId: conversationRef, reviewConfirmationId: confirmationId,
  });
  add('submissions', record, SubmissionEntity.validate, SubmissionEntity.toSupabaseShape, 'submissions');
  for (const [entityType, rows] of [['submissionFieldStates', fieldStates], ['submissionReproSteps', reproSteps]]) {
    const { entity, table } = ASSISTANT_ENTITIES[entityType];
    for (const row of rows) add(entityType, entity.create({ ...row, operationId: scope.operationId, submissionId: record.id }), entity.validate, entity.toSupabaseShape, table);
  }
  return record.id;
}

/** Library session for the existing feedback sheet, built from the backend's pending proposal. */
export async function feedbackSheetSession({ session, persistDraft }) {
  const host = session.capture.context.feedbackHost;
  const first = session.transcript.find(turn => turn.role === 'user');
  let draft = feedback.createSession(host);
  draft = await feedback.recordFirstNote(draft, { kind: 'reviewed_transcript', reviewed: true, text: first.text }, persistDraft);
  if (draft.saveError) throw new Error(draft.saveError);
  return feedback.applyAnswer(draft, session.pending.fields);
}

export const editableFeedbackFields = item => Object.fromEntries(['title', 'type', 'expected', 'actual', 'reproSteps', 'severity', 'impact', 'needsDecision', 'unknowns'].filter(key => Object.hasOwn(item, key)).map(key => [key, globalThis.structuredClone(item[key])]));
const comparable = value => JSON.stringify(value, (key, inner) => inner && typeof inner === 'object' && !Array.isArray(inner) ? Object.fromEntries(Object.keys(inner).sort().map(k => [k, inner[k]])) : inner);

/**
 * options.fileConfirmed for the existing feedback sheet. Returns P10 delivery reports:
 * local_save (local submission), sync_queue (queued sync), acknowledged_handoff (server row).
 */
export function createFeedbackFiling({ conversation, persist, awaitServerRows, getAll, runDurableWrite, add, flush, revisionIdFor, presentedAt = new Date().toISOString(), onLocalSave = async () => {} }) {
  const { scope } = conversation;
  return async handoff => {
    const pending = conversation.session.pending;
    const fields = editableFeedbackFields(handoff.item);
    if (comparable(fields) !== comparable(pending.fields)) {
      // A sheet edit is a correction: a new revision that needs its own confirmation.
      await conversation.correct({ revision: pending.revision, destination: feedback.routeDestination(handoff.item), fields, modality: 'text' });
      throw new Error('Your changes made a new revision. Review it, then confirm again.');
    }
    const revisionId = await revisionIdFor(pending);
    const card = await persist(scope, 'assistantReviewCards', { operationId: scope.operationId, revisionId, presentedAt, populatedUi: 'Feedback sheet', presentedEvidence: Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n') });
    const confirmation = await persist(scope, 'assistantReviewConfirmations', { operationId: scope.operationId, cardId: card.id, revisionId, actorId: scope.actorId, confirmedAt: new Date().toISOString(), channel: 'text' });
    await awaitServerRows([{ entityType: 'assistantReviewCards', id: card.id }, { entityType: 'assistantReviewConfirmations', id: confirmation.id }]);
    const outcome = await conversation.confirmAndApply({
      pending, confirmationId: confirmation.id, flush,
      applyLocal: key => runDurableWrite(key, () => writeFeedbackSubmission({ add, scope, conversationRef: conversation.ref, confirmationId: confirmation.id, item: handoff.item })),
    });
    const receipt = outcome.receipt ?? { savedRecordId: outcome.result?.result?.savedRecordId, localSavedAt: getAll('submissions').find(row => row.id === handoff.itemId)?.createdAt };
    const base = { itemId: handoff.itemId, revision: handoff.revision };
    const reports = [{ ...base, state: 'local_save', evidence: `submission:${receipt.savedRecordId}@${receipt.localSavedAt}` }];
    if (receipt.savedRecordId && receipt.localSavedAt) await onLocalSave({ ...outcome, receipt });
    if (outcome.receipt?.syncQueuedAt) reports.push({ ...base, state: 'sync_queue', destination: handoff.destination, evidence: `queued@${outcome.receipt.syncQueuedAt}` });
    if (outcome.result?.state === 'acknowledged-delivery' || outcome.applied?.state === 'acknowledged-delivery') reports.push({ ...base, state: 'acknowledged_handoff', destination: handoff.destination, evidence: `server-row:${receipt.savedRecordId}` });
    return reports;
  };
}

/** Farm review: existing normal UI via farm-ui ports, then the same handshake. */
export function createFarmReviewFlow({ conversation, createFarmUiPorts, authorize, awaitServerRows, getAll, getById, flush, pullReviewRows, onResult = () => {}, onError = () => {} }) {
  const { scope } = conversation;
  let ports;
  ports = createFarmUiPorts({
    scope, conversationRef: conversation.ref, authorize,
    // Same host resolution the backend validated, over this device's synced rows.
    resolveTarget: async (incoming, proposal) => {
      const resolved = await resolveEntryTarget({ ui: proposal.destination, names: proposal.fields[ENTRY_TARGET_KEY], fields: proposal.fields, rows: async table => getAll(table).filter(row => row.operationId === scope.operationId) });
      if (resolved.status !== 'resolved') throw new Error(resolved.question ?? 'entry-target-unresolved');
      return resolved.target;
    },
    onCorrect: async ({ revision, fields }) => {
      const session = await conversation.correct({ revision, fields, modality: 'text' });
      await render(session.pending);
    },
    onConfirm: async ({ evidence }) => {
      try {
        const pending = conversation.session.pending;
        const confirmationId = await ports.recordConfirmation(scope, pending, evidence);
        const confirmation = getById('assistantReviewConfirmations', confirmationId);
        await awaitServerRows([{ entityType: 'assistantReviewCards', id: confirmation.cardId }, { entityType: 'assistantReviewConfirmations', id: confirmationId }]);
        const outcome = await conversation.confirmAndApply({ pending, confirmationId, flush, applyLocal: key => ports.applyConfirmedWrite(scope, pending, confirmationId, key) });
        conversation.setOpenSheet?.(null);
        onResult(outcome);
      } catch (error) { onError(error); throw error; }
    },
  });
  async function render(pending) {
    // Server-recorded proposal/revision identity must be local before the UI binds to it.
    await pullReviewRows();
    await ports.renderReview(scope, pending);
    conversation.setOpenSheet?.(ports.openSheet?.() ?? null);
  }
  return { render };
}
