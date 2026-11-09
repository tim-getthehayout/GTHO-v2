/** gtho-assistant-apply: records the browser's local-save receipt against the
 * durable execution claim. It never writes farm/feedback records itself. */
import { feedback } from '../shared.js';
import { readJson, json, httpError } from './http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEYS = ['conversationRef', 'proposalId', 'proposalRevision', 'savedRecordId', 'localSavedAt'];
/** Server tables that prove the saved record reached the server (acknowledgement). */
export const ACK_TABLES = Object.freeze({ treatment: 'animal_treatments', calving: 'animal_calving_records', feeding: 'event_feed_entries', move: 'events', place: 'events', design: 'submissions', build: 'submissions' });
const requireData = ({ data, error }) => { if (error) throw new Error('assistant-persistence-failed'); return data; };

export function parseApplyBody(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !KEYS.includes(key))) throw httpError(400, 'invalid-apply-receipt');
  const { conversationRef, proposalId, proposalRevision, savedRecordId, localSavedAt } = body;
  const at = Date.parse(localSavedAt);
  if (!UUID.test(conversationRef ?? '') || typeof proposalId !== 'string' || !proposalId.trim() || !Number.isSafeInteger(proposalRevision) || proposalRevision < 1
    || !UUID.test(savedRecordId ?? '') || typeof localSavedAt !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(localSavedAt) || !Number.isFinite(at) || at > now + 5 * 60_000) throw httpError(400, 'invalid-apply-receipt');
  return { conversationRef, proposalId, proposalRevision, savedRecordId, localSavedAt: new Date(at).toISOString() };
}

export function createApplyHandler({ client, persistence, maxBodyBytes = 4096, now = () => Date.now() }) {
  return async (scope, request) => {
    const receipt = parseApplyBody(await readJson(request, maxBodyBytes), now());
    return persistence.withSession(scope, receipt.conversationRef, async snapshot => {
      const pending = snapshot?.pending;
      if (!snapshot || !pending || pending.id !== receipt.proposalId || pending.revision !== receipt.proposalRevision) throw httpError(409, 'stale-review');
      if (!['executing', 'completed'].includes(snapshot.phase)) throw httpError(409, 'execution-claim-required');
      const claim = requireData(await client.from('assistant_execution_results').select('*').eq('operation_id', scope.operationId).eq('conversation_ref', receipt.conversationRef).eq('proposal_id', receipt.proposalId).eq('proposal_revision', receipt.proposalRevision).maybeSingle());
      if (!claim) throw httpError(409, 'execution-claim-required');
      if (claim.confirmation_id !== snapshot.confirmation) throw httpError(409, 'stale-or-foreign-confirmation');
      const confirmation = requireData(await client.from('assistant_review_confirmations').select('id, actor_id, revision_id').eq('operation_id', scope.operationId).eq('id', claim.confirmation_id).maybeSingle());
      if (!confirmation || confirmation.actor_id !== scope.actorId || confirmation.revision_id !== claim.revision_id) throw httpError(403, 'confirming-actor-required');
      if (claim.local_saved_at && claim.saved_record_id !== receipt.savedRecordId) throw httpError(409, 'execution-receipt-conflict');
      // Acknowledged only when the server itself holds the saved record.
      const table = ACK_TABLES[pending.destination];
      let acknowledged = !!claim.server_acknowledged_at;
      if (!acknowledged && table) {
        let query = client.from(table).select('id').eq('operation_id', scope.operationId).eq('id', receipt.savedRecordId);
        if (pending.intent === 'feedback') query = query.eq('review_confirmation_id', claim.confirmation_id);
        acknowledged = !!requireData(await query.maybeSingle());
      }
      const at = new Date(now()).toISOString();
      const update = {
        saved_record_id: receipt.savedRecordId,
        local_saved_at: claim.local_saved_at ?? receipt.localSavedAt,
        server_acknowledged_at: claim.server_acknowledged_at ?? (acknowledged ? at : null),
        feedback_handoff_acknowledged_at: claim.feedback_handoff_acknowledged_at ?? (acknowledged && pending.intent === 'feedback' ? at : null),
        updated_at: at,
      };
      requireData(await client.from('assistant_execution_results').update(update).eq('operation_id', scope.operationId).eq('id', claim.id));
      const state = update.server_acknowledged_at ? 'acknowledged-delivery' : 'local-save';
      return json({ state, savedRecordId: receipt.savedRecordId, ...(pending.intent === 'feedback' ? { destination: pending.destination, contractVersion: feedback.CONTRACT_VERSION } : {}) });
    });
  };
}
