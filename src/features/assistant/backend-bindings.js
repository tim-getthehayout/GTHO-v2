/** Server-only Supabase bindings. The client passed here must be backend-owned;
 * never pass a client snapshot, caller operation ID or a browser's database client.
 * Deployment remains fail-closed until authenticated review/write/provider ports exist.
 */
import * as Checkpoint from '../../entities/assistant-session-checkpoints.js';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const requireResult = ({ data, error }) => { if (error) throw new Error(error.code === '23505' ? 'duplicate-durable-identity' : 'assistant-persistence-failed'); return data; };

export function createBackendPersistence({ client, authorize, applyConfirmedWrite }) {
  const held = new Map(); // Local proof of ownership only; exclusivity lives in SQL.
  async function auth(scope) {
    if (!scope?.operationId || !scope?.actorId || await authorize(scope) !== true) throw new Error('unauthorized');
  }
  const lockKey = (scope, ref) => JSON.stringify([scope.operationId, ref]);
  async function load(scope, ref) {
    const row = requireResult(await client.from('assistant_session_checkpoints').select('*').eq('operation_id', scope.operationId).eq('conversation_id', ref).maybeSingle());
    if (!row) return null;
    const snapshot = row.trusted_snapshot;
    if (snapshot?.version !== 1 || snapshot.conversationRef !== ref || !same(snapshot.scope, scope)) throw new Error('untrusted-snapshot-scope');
    return globalThis.structuredClone(snapshot);
  }
  async function checkpoint(scope, snapshot) {
    await auth(scope);
    const ref = snapshot.conversationRef;
    if (!held.has(lockKey(scope, ref))) throw new Error('durable-session-lock-required');
    if (!same(snapshot.scope, scope)) throw new Error('snapshot-scope-mismatch');
    const old = requireResult(await client.from('assistant_session_checkpoints').select('*').eq('operation_id', scope.operationId).eq('conversation_id', ref).maybeSingle());
    let revisionId = null;
    if (snapshot.pending) {
      const revision = requireResult(await client.from('assistant_proposal_revisions').select('*').eq('operation_id', scope.operationId).eq('proposal_id', snapshot.pending.id).eq('revision_number', snapshot.pending.revision).single());
      revisionId = revision.id;
    }
    const record = Checkpoint.create({
      id: old?.id, operationId: scope.operationId, conversationId: ref,
      transcriptPosition: snapshot.transcript.length, pendingRevisionId: revisionId,
      lifecyclePhase: snapshot.phase, trustedSnapshot: snapshot,
      createdAt: old?.created_at,
    });
    const validation = Checkpoint.validate(record);
    if (!validation.valid) throw new Error(validation.errors.join('; '));
    requireResult(await client.from('assistant_session_checkpoints').upsert(Checkpoint.toSupabaseShape(record), { onConflict: 'operation_id,conversation_id' }));
  }
  async function withSession(scope, ref, work) {
    await auth(scope);
    const owner = crypto.randomUUID();
    const locks = requireResult(await client.rpc('assistant_lock_acquire', { p_operation: scope.operationId, p_ref: ref, p_owner: owner }));
    if (locks?.length !== 1) throw new Error('session-busy-no-automatic-expiry');
    const key = lockKey(scope, ref);
    held.set(key, owner);
    try { return await work(await load(scope, ref)); }
    finally {
      held.delete(key);
      requireResult(await client.rpc('assistant_lock_release', { p_operation: scope.operationId, p_ref: ref, p_owner: owner }));
    }
  }
  async function execute(scope, proposal, receipt, idempotencyKey) {
    await auth(scope);
    const key = JSON.parse(idempotencyKey);
    if (!Array.isArray(key) || key.length !== 4 || key[0] !== scope.operationId || key[2] !== proposal.id || key[3] !== proposal.revision) throw new Error('execution-key-mismatch');
    const ref = key[1];
    if (!held.has(lockKey(scope, ref))) throw new Error('durable-session-lock-required');
    const snapshot = await load(scope, ref);
    if (snapshot?.phase !== 'executing' || snapshot.confirmation !== receipt || !same(snapshot.pending, proposal)) throw new Error('executing-checkpoint-required');
    const revision = requireResult(await client.from('assistant_proposal_revisions').select('*').eq('operation_id', scope.operationId).eq('proposal_id', proposal.id).eq('revision_number', proposal.revision).single());
    const confirmation = requireResult(await client.from('assistant_review_confirmations').select('*').eq('operation_id', scope.operationId).eq('id', receipt).single());
    if (revision.superseded_by_id || confirmation.revision_id !== revision.id || confirmation.actor_id !== scope.actorId) throw new Error('stale-or-foreign-confirmation');
    const queryOutcome = () => client.from('assistant_execution_results').select('*').eq('operation_id', scope.operationId).eq('conversation_ref', ref).eq('proposal_id', proposal.id).eq('proposal_revision', proposal.revision).maybeSingle();
    const outcome = row => {
      if (!row.local_saved_at || !row.saved_record_id) throw new Error('execution-outcome-unresolved-do-not-reapply');
      return { state: row.server_acknowledged_at ? 'acknowledged-delivery' : row.sync_queued_at ? 'sync-queue' : 'local-save', result: { savedRecordId: row.saved_record_id } };
    };
    const existing = requireResult(await queryOutcome());
    if (existing) return outcome(existing);
    if (typeof applyConfirmedWrite !== 'function') throw new Error('durable-confirmed-write-binding-required');
    const id = crypto.randomUUID();
    const claim = { id, operation_id: scope.operationId, conversation_id: ref, conversation_ref: ref, proposal_id: proposal.id, proposal_revision: proposal.revision, revision_id: revision.id, confirmation_id: confirmation.id, destination_entity: proposal.destination };
    const inserted = await client.from('assistant_execution_results').insert(claim);
    if (inserted.error?.code === '23505') return outcome(requireResult(await queryOutcome()));
    requireResult(inserted);
    // Claim exists durably before side effects. An ambiguous failure is retry-only,
    // never permission to apply the same existing UI write a second time.
    const result = await applyConfirmedWrite(scope, proposal, receipt, idempotencyKey);
    if (!result?.savedRecordId || !result.localSavedAt) throw new Error('durable-local-save-evidence-required');
    const row = { ...claim, saved_record_id: result.savedRecordId, local_saved_at: result.localSavedAt, sync_queued_at: result.syncQueuedAt ?? null, server_acknowledged_at: result.serverAcknowledgedAt ?? null, feedback_handoff_acknowledged_at: result.feedbackHandoffAcknowledgedAt ?? null };
    requireResult(await client.from('assistant_execution_results').update(row).eq('operation_id', scope.operationId).eq('id', id));
    return outcome(row);
  }
  async function cleanupFinished(scope) { await auth(scope); requireResult(await client.rpc('assistant_cleanup_finished', { p_operation: scope.operationId })); }
  return { withSession, checkpoint, execute, cleanupFinished };
}

export function createBillingPorts({ client, authorize, authorizeControl }) {
  async function auth(scope) { if (await authorize(scope) !== true) throw new Error('unauthorized'); }
  return {
    async reserve(scope, purpose, requestRef, { kind }) {
      await auth(scope);
      if (!nonempty(purpose) || !nonempty(requestRef) || !['request','settlement'].includes(kind)) throw new Error('invalid-reservation');
      const rows = requireResult(await client.rpc('assistant_billing_reserve', { p_operation: scope.operationId, p_purpose: purpose, p_request: requestRef, p_kind: kind }));
      if (!rows?.[0]?.lease || rows[0].routing !== 'shared') throw new Error('invalid-billing-reservation');
      return { lease: rows[0].lease, routing: rows[0].routing };
    },
    async finish(scope, lease, usage, billShared, failed) {
      await auth(scope);
      for (const key of ['inputTokens','outputTokens','audioMinutes','requestCount']) if (usage[key] != null && (!Number.isFinite(usage[key]) || usage[key] < 0)) throw new Error('invalid-usage');
      requireResult(await client.rpc('assistant_billing_finish', {
        p_operation: scope.operationId, p_lease: lease, p_model: usage.model || null, p_voice: usage.voiceSession || null,
        p_input: usage.inputTokens ?? null, p_output: usage.outputTokens ?? null, p_audio: usage.audioMinutes ?? null, p_requests: usage.requestCount ?? null,
        p_bill_shared: billShared, p_failed: failed,
      }));
    },
    async own(scope) { await auth(scope); return requireResult(await client.from('assistant_billing_usage').select('*').eq('operation_id', scope.operationId)); },
    async control(scope) {
      await auth(scope);
      if (typeof authorizeControl !== 'function' || await authorizeControl(scope) !== true) throw new Error('central-billing-role-required');
      return requireResult(await client.from('assistant_billing_usage').select('*'));
    },
  };
}

/** The verifier is server/provider-owned; a client cannot submit billable totals. */
export function createVerifiedVoiceUsage({ client, authorize, verifyDelta }) {
  return async (scope, conversationRef, requestRef) => {
    if (await authorize(scope) !== true) throw new Error('unauthorized');
    const reservation = requireResult(await client.from('assistant_billing_reservations').select('*').eq('operation_id', scope.operationId).eq('request_ref', requestRef).single());
    if (reservation.kind !== 'settlement') throw new Error('settlement-reservation-required');
    const verified = await verifyDelta(scope, conversationRef, requestRef);
    if (!nonempty(verified?.providerSessionRef) || !nonempty(verified?.settlementRef) || !verified.usage) throw new Error('verified-provider-delta-required');
    const usage = verified.usage;
    for (const key of ['inputTokens','outputTokens','audioMinutes','requestCount']) if (!Number.isFinite(usage[key]) || usage[key] < 0) throw new Error('verified-usage-required');
    const recorded = requireResult(await client.rpc('assistant_billing_settle', {
      p_operation: scope.operationId, p_lease: reservation.lease,
      p_provider: verified.providerSessionRef, p_settlement: verified.settlementRef,
      p_model: usage.model || null, p_input: usage.inputTokens, p_output: usage.outputTokens,
      p_audio: usage.audioMinutes, p_requests: usage.requestCount,
    }));
    // SQL atomically stores the dedup marker AND measured usage, before finish.
    // A repeated verified event establishes zero additional delta, not zero usage.
    if (recorded === false) return { model: usage.model, voiceSession: verified.providerSessionRef, inputTokens: 0, outputTokens: 0, audioMinutes: 0, requestCount: 0 };
    if (recorded !== true) throw new Error('invalid-settlement-result');
    return { ...usage, voiceSession: verified.providerSessionRef };
  };
}

/** Final failed-request counters come from a backend verifier, never client input. */
export function createUsageReconciliation({ client, authorize, verifyUsage }) {
  return async (scope, lease) => {
    if (await authorize(scope) !== true) throw new Error('unauthorized');
    const usage = await verifyUsage(scope, lease);
    for (const key of ['inputTokens','outputTokens','audioMinutes','requestCount']) if (!Number.isFinite(usage?.[key]) || usage[key] < 0) throw new Error('verified-usage-required');
    return requireResult(await client.rpc('assistant_billing_reconcile', {
      p_operation: scope.operationId, p_lease: lease,
      p_model: usage.model || null, p_voice: usage.voiceSession || null,
      p_input: usage.inputTokens, p_output: usage.outputTokens,
      p_audio: usage.audioMinutes, p_requests: usage.requestCount,
    }));
  };
}
