import { describe, it, expect, vi } from 'vitest';
import { createBackendPersistence, createBillingPorts, createVerifiedVoiceUsage, createUsageReconciliation } from '../../../src/features/assistant/backend-bindings.js';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { operationId: id(1), actorId: id(2) }, ref = id(3);
function database() {
  const tables = {}, locks = new Set();
  const client = { from(table) {
    tables[table] ??= [];
    let filters = [], mode = 'select', value;
    const q = {
      select() { return q; }, eq(k, v) { filters.push([k,v]); return q; },
      insert(v) { mode = 'insert'; value = v; return q; }, upsert(v) { mode = 'upsert'; value = v; return q; }, update(v) { mode = 'update'; value = v; return q; },
      single() { return q.then(r => ({ ...r, data: r.data[0] })); }, maybeSingle() { return q.then(r => ({ ...r, data: r.data[0] ?? null })); },
      async then(fn) {
        let data = tables[table].filter(r => filters.every(([k,v]) => r[k] === v));
        if (mode === 'insert') {
          if (table === 'assistant_execution_results' && tables[table].some(r => ['operation_id','conversation_ref','proposal_id','proposal_revision'].every(k => r[k] === value[k]))) return fn({ error: { code: '23505' } });
          tables[table].push(structuredClone(value)); data = [value];
        }
        if (mode === 'upsert') {
          const old = tables[table].find(r => r.operation_id === value.operation_id && r.conversation_id === value.conversation_id);
          if (old) Object.assign(old, structuredClone(value)); else tables[table].push(structuredClone(value));
          data = [value];
        }
        if (mode === 'update') data.forEach(row => Object.assign(row, structuredClone(value)));
        return fn({ data: structuredClone(data), error: null });
      },
    }; return q;
  }, rpc: vi.fn(async (name, args) => {
    const key = `${args.p_operation}/${args.p_ref}`;
    if (name === 'assistant_lock_acquire') { if (locks.has(key)) return { data: [] }; locks.add(key); return { data: [{ owner_token: args.p_owner }] }; }
    if (name === 'assistant_lock_release') { locks.delete(key); return { data: null }; }
    return { data: [{ lease: id(9), routing: 'shared' }] };
  }) };
  return { client, tables, locks };
}
function snapshot(extra = {}) { return { version: 1, scope, conversationRef: ref, transcript: [], phase: 'converse', preserved: [], answered: [], capture: { context: { screen: 'original' } }, ...extra }; }
describe('trusted runtime persistence bindings', () => {
  it('round-trips the exact snapshot even on errors, not inspection-pointer reconstruction', async () => {
    const { client, tables } = database();
    const a = createBackendPersistence({ client, authorize: async () => true });
    const saved = snapshot({ reviewReady: false, switchRequested: 'question', logs: [{ field: 'x' }] });
    await expect(a.withSession(scope, ref, async () => { await a.checkpoint(scope, saved); throw new Error('interrupted'); })).rejects.toThrow('interrupted');
    tables.assistant_session_checkpoints[0].lifecycle_phase = 'incorrect-pointer';
    // PostgreSQL JSONB reorders object keys, but never array elements.
    tables.assistant_session_checkpoints[0].trusted_snapshot.scope = { actorId: scope.actorId, operationId: scope.operationId };
    const b = createBackendPersistence({ client, authorize: async () => true });
    await b.withSession(scope, ref, async existing => expect(existing).toEqual(saved));
    await expect(a.checkpoint(scope, saved)).rejects.toThrow('lock-required');
  });
  it('serializes separate adapter instances through the durable lock, including start, with no expiry takeover', async () => {
    const { client } = database();
    const a = createBackendPersistence({ client, authorize: async () => true });
    const b = createBackendPersistence({ client, authorize: async () => true });
    await a.withSession(scope, ref, async () => {
      await expect(b.withSession(scope, ref, async () => {})).rejects.toThrow('session-busy');
    });
    await b.withSession(scope, ref, async () => {});
  });
  it('rejects authorization and stored scope forgery', async () => {
    const { client, tables } = database();
    const denied = createBackendPersistence({ client, authorize: async () => false });
    await expect(denied.withSession(scope, ref, async () => {})).rejects.toThrow('unauthorized');
    tables.assistant_session_checkpoints = [{ operation_id: scope.operationId, conversation_id: ref, trusted_snapshot: snapshot({ scope: { ...scope, actorId: id(77) } }) }];
    const p = createBackendPersistence({ client, authorize: async () => true });
    await expect(p.withSession(scope, ref, async () => {})).rejects.toThrow('untrusted-snapshot');
  });
  it('persists the exact execution key before writes, replays stored outcomes and never reapplies ambiguous claims', async () => {
    const { client, tables } = database();
    const proposal = { id: id(4), revision: 1, destination: 'animalTreatments', fields: { notes: 'reviewed' } };
    tables.assistant_proposal_revisions = [{ id: id(5), operation_id: scope.operationId, proposal_id: proposal.id, revision_number: 1 }];
    tables.assistant_review_confirmations = [{ id: id(6), operation_id: scope.operationId, revision_id: id(5), actor_id: scope.actorId }];
    const apply = vi.fn(async () => ({ savedRecordId: id(7), localSavedAt: '2026-11-08T19:00:00-05:00' }));
    const p = createBackendPersistence({ client, authorize: async () => true, applyConfirmedWrite: apply });
    const key = JSON.stringify([scope.operationId, ref, proposal.id, proposal.revision]);
    await p.withSession(scope, ref, async () => {
      await p.checkpoint(scope, snapshot({ phase: 'executing', pending: proposal, confirmation: id(6), reviewReady: true }));
      tables.assistant_session_checkpoints[0].trusted_snapshot.pending = Object.fromEntries(Object.entries(proposal).reverse());
      const a = await p.execute(scope, proposal, id(6), key);
      expect(await p.execute(scope, proposal, id(6), key)).toEqual(a);
      expect(apply).toHaveBeenCalledOnce();
      tables.assistant_execution_results[0].local_saved_at = null;
      await expect(p.execute(scope, proposal, id(6), key)).rejects.toThrow('unresolved');
      expect(apply).toHaveBeenCalledOnce();
      await expect(p.execute(scope, { ...proposal, fields: { notes: 'unreviewed' } }, id(6), key)).rejects.toThrow('checkpoint-required');
    });
  });
});
describe('billing ports are backed by atomic SQL, never no-op hooks', () => {
  it('passes authenticated operation/purpose/ref/kind and records all measured usage separately', async () => {
    const { client, tables } = database();
    const billing = createBillingPorts({ client, authorize: async () => true });
    expect(await billing.reserve(scope, 'feedback', 'request', { kind: 'request' })).toEqual({ lease: id(9), routing: 'shared' });
    expect(client.rpc).toHaveBeenCalledWith('assistant_billing_reserve', { p_operation: scope.operationId, p_purpose: 'feedback', p_request: 'request', p_kind: 'request' });
    await billing.finish(scope, id(9), { model: 'configured', voiceSession: 'provider-session', inputTokens: 2, outputTokens: 3, audioMinutes: 4, requestCount: 1 }, true, false);
    expect(client.rpc).toHaveBeenCalledWith('assistant_billing_finish', expect.objectContaining({ p_operation: scope.operationId, p_input: 2, p_output: 3, p_audio: 4, p_requests: 1, p_bill_shared: true, p_failed: false }));
    tables.assistant_billing_usage = [{ operation_id: scope.operationId, input_tokens: 2 }, { operation_id: id(99), input_tokens: 3 }];
    expect(await billing.own(scope)).toEqual([{ operation_id: scope.operationId, input_tokens: 2 }]);
    await expect(billing.control(scope)).rejects.toThrow('central-billing');
  });
});

describe('server/provider usage verification', () => {
  it('records verified deltas atomically and returns zero additional usage only for a stored duplicate event', async () => {
    const { client, tables } = database();
    tables.assistant_billing_reservations = [{ operation_id: scope.operationId, request_ref: 'settlement', kind: 'settlement', lease: id(9) }];
    const usage = { model: 'configured', inputTokens: 2, outputTokens: 3, audioMinutes: 4, requestCount: 0 };
    const verifyDelta = vi.fn(async () => ({ providerSessionRef: 'provider', settlementRef: 'event', usage }));
    const voiceUsage = createVerifiedVoiceUsage({ client, authorize: async () => true, verifyDelta });
    client.rpc.mockResolvedValueOnce({ data: true });
    expect(await voiceUsage(scope, ref, 'settlement')).toEqual({ ...usage, voiceSession: 'provider' });
    expect(client.rpc).toHaveBeenCalledWith('assistant_billing_settle', expect.objectContaining({ p_lease: id(9), p_provider: 'provider', p_settlement: 'event', p_audio: 4 }));
    client.rpc.mockResolvedValueOnce({ data: false });
    expect(await voiceUsage(scope, ref, 'settlement')).toEqual({ model: 'configured', voiceSession: 'provider', inputTokens: 0, outputTokens: 0, audioMinutes: 0, requestCount: 0 });
    tables.assistant_billing_reservations[0].kind = 'request';
    await expect(voiceUsage(scope, ref, 'settlement')).rejects.toThrow('settlement-reservation');
  });
  it('does not treat failure/missing provider totals as zero; reconciliation needs server-verified counters', async () => {
    const { client } = database();
    const bad = createUsageReconciliation({ client, authorize: async () => true, verifyUsage: async () => ({}) });
    await expect(bad(scope, id(9))).rejects.toThrow('verified-usage-required');
    expect(client.rpc).not.toHaveBeenCalled();
    const usage = { model: 'configured', inputTokens: 0, outputTokens: 0, audioMinutes: 0, requestCount: 1 };
    const good = createUsageReconciliation({ client, authorize: async () => true, verifyUsage: async () => usage });
    await good(scope, id(9));
    expect(client.rpc).toHaveBeenCalledWith('assistant_billing_reconcile', expect.objectContaining({ p_operation: scope.operationId, p_input: 0, p_audio: 0, p_requests: 1 }));
  });
});
