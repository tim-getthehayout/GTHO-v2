import { describe, it, expect, vi } from 'vitest';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createAssistantFunction, createApplyFunction, createTestingAudioFunction, createTranscribeFunction } from '../../../../src/features/assistant/server/compose.js';
import { fakeSupabase, env, OP, OTHER_OP, USER, BILLING_USER } from './fake-supabase.js';

const ORIGIN = 'https://getthehayout.com';
const REF = '00000000-0000-4000-8000-0000000000c1';
const FEEDBACK_HOST = { itemId: '00000000-0000-4000-8000-0000000000f1', contractVersion: '0.1.2', appId: 'gtho', screen: { state: 'known', value: 'dashboard', source: 'host' }, buildStamp: { state: 'known', value: 'b1', source: 'host' }, capturedAt: '2026-11-09T10:00:00.000Z' };

function setup({ memberships = [OP], consent = 'accepted', fetch, user = USER } = {}) {
  const { config } = readConfig(env());
  let lease = 0;
  const client = fakeSupabase({
    users: { 'jwt-user': user },
    tables: {
      operation_members: memberships.map(operation_id => ({ operation_id, user_id: user, accepted_at: '2026-01-01T00:00:00Z' })),
      assistant_testing_consents: consent ? [{ id: 'c1', operation_id: OP, actor_id: user, conversation_id: REF, decision: consent, decided_at: '2026-11-09T10:00:00Z' }] : [],
      assistant_session_checkpoints: [],
    },
    rpc: async name => name === 'assistant_billing_reserve' ? { data: [{ lease: `00000000-0000-4000-8000-${String(++lease).padStart(12, '0')}`, routing: 'shared' }], error: null } : name === 'assistant_billing_settle' ? { data: true, error: null } : { data: null, error: null },
  });
  const queries = [];
  const database = { closed: 0 };
  const openDatabase = () => ({
    connect: async () => ({ query: async (text, values) => { queries.push(text); return { rows: text.startsWith('SELECT id FROM assistant_session_locks') ? [{ id: 1 }] : [] }; }, release: async () => {} }),
    close: async () => { database.closed++; },
  });
  return { config, client, deps: { config, client, openDatabase, fetch: fetch ?? vi.fn(), log: vi.fn() }, queries, database };
}
const post = (body, headers = {}) => new Request('https://fn.invalid/gtho-assistant', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('gtho-assistant composition', () => {
  it('rejects unauthenticated callers with 401', async () => {
    const { deps } = setup();
    const response = await createAssistantFunction(deps)(post({ command: 'billing-own' }, { authorization: 'Bearer nope' }));
    expect(response.status).toBe(401);
  });
  it('refuses an operation outside the allowlist with 403 before any reservation', async () => {
    const { deps, client } = setup({ memberships: [OTHER_OP] });
    const response = await createAssistantFunction(deps)(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: 'now', source: 'voice', context: {} } }));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'assistant-not-enabled' });
    expect(client.calls.rpc).toEqual([]);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
  });
  it('requires X-GTHO-Operation only when the caller has several memberships, verified against them', async () => {
    const { deps } = setup({ memberships: [OP, OTHER_OP] });
    const handler = createAssistantFunction(deps);
    expect((await handler(new Request('https://fn.invalid', { headers: { origin: ORIGIN, authorization: 'Bearer jwt-user' } }))).status).toBe(400);
    expect((await handler(new Request('https://fn.invalid', { headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'x-gtho-operation': '00000000-0000-4000-8000-0000000000ff' } }))).status).toBe(403);
    const ok = await handler(new Request('https://fn.invalid', { headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'x-gtho-operation': OP } }));
    expect(ok.status).toBe(200);
    expect((await ok.json()).config).toMatchObject({ model: 'grok-voice-3.0', voice: 'eve', reasoning: 'none' });
  });
  it('starts a session under the SQL lock only after a stored consent decision, and closes the connection', async () => {
    const { deps, client, queries, database } = setup();
    const response = await createAssistantFunction(deps)(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'feedback', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: { feedbackHost: FEEDBACK_HOST } } }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.session).toMatchObject({ intent: 'feedback', phase: 'converse', conversationRef: REF });
    expect(queries.some(text => text.includes('FOR UPDATE'))).toBe(true);
    expect(client.tables.assistant_session_checkpoints).toHaveLength(1);
    expect(database.closed).toBe(1);
    expect(client.calls.rpc.map(call => call.name)).toEqual(['assistant_billing_reserve', 'assistant_billing_finish']);
    expect(client.calls.rpc[1].args).toMatchObject({ p_failed: false, p_unmeasured: false, p_requests: 1 });
  });
  it('refuses start when the consent popup was never answered', async () => {
    const { deps } = setup({ consent: null });
    const response = await createAssistantFunction(deps)(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'testing-consent-decision-required' });
  });
  it('runs a how-to turn through the configured text model and meters measured usage', async () => {
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe('https://api.x.ai/v1/responses');
      expect(JSON.parse(init.body).model).toBe('grok-4.20-0309-non-reasoning');
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Response.json({ usage: { input_tokens: 10, output_tokens: 5 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ type: 'answer', text: 'Open the Feed tab.' }) }] }] });
    });
    const { deps, client } = setup({ fetch });
    const handler = createAssistantFunction(deps);
    await handler(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } }));
    const response = await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'voice', text: 'How do I log feed?' } }));
    expect(response.status).toBe(200);
    const { session } = await response.json();
    expect(session.transcript.at(-1)).toMatchObject({ role: 'assistant', text: 'Open the Feed tab.' });
    const finish = client.calls.rpc.filter(call => call.name === 'assistant_billing_finish').at(-1);
    expect(finish.args).toMatchObject({ p_input: 10, p_output: 5, p_failed: false });
  });
  it('a provider failure after the call is unmeasured; the 25 s bound returns the library 503', async () => {
    const fetch = vi.fn((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));
    const { deps, client } = setup({ fetch });
    // Same code path as the 25 000 ms production bound, shortened for the test.
    const handler = createAssistantFunction({ ...deps, providerTimeoutMs: 20 });
    await handler(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } }));
    const response = await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'text', text: 'Help' } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'backend-unavailable' });
    const finish = client.calls.rpc.filter(call => call.name === 'assistant_billing_finish').at(-1);
    expect(finish.args).toMatchObject({ p_failed: true, p_unmeasured: true });
  });
  it('lets only GTHO_BILLING_CONTROL_USERS read central billing', async () => {
    const plain = setup();
    expect((await createAssistantFunction(plain.deps)(post({ command: 'billing-control' }))).status).toBe(403);
    const tim = setup({ user: BILLING_USER });
    expect((await createAssistantFunction(tim.deps)(post({ command: 'billing-control' }))).status).toBe(200);
  });
  it('mints voice tokens server-side and settles the 10-minute worst case before returning one', async () => {
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe('https://api.x.ai/v1/realtime/client_secrets');
      expect(JSON.parse(init.body)).toEqual({ expires_after: { seconds: 60 } });
      return Response.json({ value: 'ephemeral-secret', expires_at: Math.floor(Date.now() / 1000) + 60 });
    });
    const { deps, client } = setup({ fetch });
    const handler = createAssistantFunction(deps);
    await handler(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } }));
    const response = await handler(post({ command: 'voice-authorization', conversationRef: REF, requestRef: 'r2' }));
    expect(response.status).toBe(200);
    const { value } = await response.json();
    expect(Object.keys(value).sort()).toEqual(['expiresAt', 'provider', 'token']);
    const settle = client.calls.rpc.find(call => call.name === 'assistant_billing_settle');
    expect(settle.args).toMatchObject({ p_settlement: 'session-cap-worst-case', p_audio: 10, p_requests: 0, p_model: 'grok-voice-3.0' });
    expect(JSON.stringify(client.tables.assistant_session_checkpoints)).not.toContain('ephemeral-secret');
  });
  it('other functions also gate on identity and the allowlist', async () => {
    const { deps } = setup({ memberships: [OTHER_OP] });
    for (const factory of [createApplyFunction, createTestingAudioFunction, createTranscribeFunction]) {
      expect((await factory(deps)(post({}))).status).toBe(403);
    }
  });
  it('feedback filing runs the client-apply handshake: confirm -> client-apply-pending -> apply receipt -> confirm replays', async () => {
    const fact = value => ({ state: 'known', value, source: 'user' });
    const proposal = { type: 'proposal', destination: 'build', fields: { type: 'bug', title: fact('Feed total wrong'), expected: fact('Total matches lines'), actual: fact('Total doubled') }, mappings: [] };
    const fetch = vi.fn(async () => Response.json({ usage: { input_tokens: 1, output_tokens: 1 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }] }));
    const { deps, client } = setup({ fetch });
    const handler = createAssistantFunction(deps);
    const apply = createApplyFunction(deps);
    await handler(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'feedback', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: { feedbackHost: FEEDBACK_HOST } } }));
    const turned = await (await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'voice', text: 'The feed total doubled' } }))).json();
    const pending = turned.session.pending;
    // Library routing wins over the model's destination guess.
    expect(pending.destination).toBe('design');
    expect(turned.session.phase).toBe('review');
    const revision = client.tables.assistant_proposal_revisions.find(row => row.proposal_id === pending.id);
    expect(revision.revision_number).toBe(1);
    // Browser-synced review evidence.
    const CARD = '00000000-0000-4000-8000-0000000000a1', CONF = '00000000-0000-4000-8000-0000000000a2', FOREIGN = '00000000-0000-4000-8000-0000000000a3';
    client.tables.assistant_review_cards = [{ id: CARD, operation_id: OP, revision_id: revision.id }];
    client.tables.assistant_review_confirmations = [{ id: CONF, operation_id: OP, card_id: CARD, revision_id: revision.id, actor_id: USER }, { id: FOREIGN, operation_id: OP, card_id: CARD, revision_id: revision.id, actor_id: BILLING_USER }];
    const confirm = (requestRef, confirmationId = CONF) => handler(post({ command: 'confirm', conversationRef: REF, requestRef, confirmation: { proposalId: pending.id, revision: 1, evidence: { confirmationId } } }));
    expect(await (await confirm('r3', FOREIGN)).json()).toEqual({ error: 'stale-or-foreign-confirmation' });
    const first = await confirm('r4');
    expect(first.status).toBe(400);
    expect(await first.json()).toEqual({ error: 'client-apply-pending' });
    expect(client.tables.assistant_execution_results).toHaveLength(1);
    expect(client.tables.assistant_execution_results[0].local_saved_at).toBeUndefined();
    expect(await (await confirm('r5')).json()).toEqual({ error: 'client-apply-pending' });
    const finishes = client.calls.rpc.filter(call => call.name === 'assistant_billing_finish').slice(-2);
    expect(finishes.every(call => call.args.p_failed === true && call.args.p_unmeasured === false)).toBe(true);
    const SUB = '00000000-0000-4000-8000-0000000000b1';
    const receipt = { conversationRef: REF, proposalId: pending.id, proposalRevision: 1, savedRecordId: SUB, localSavedAt: '2026-11-09T10:05:00.000Z' };
    const applied = await apply(post(receipt));
    expect(applied.status).toBe(200);
    expect(await applied.json()).toMatchObject({ state: 'local-save', savedRecordId: SUB, executionResultId: expect.any(String), destination: 'design' });
    const replay = await confirm('r6');
    expect(replay.status).toBe(200);
    const replayed = await replay.json();
    expect(replayed.value).toEqual({ state: 'local-save', result: { savedRecordId: SUB } });
    expect(replayed.session.phase).toBe('completed');
    client.tables.submissions = [{ id: SUB, operation_id: OP, review_confirmation_id: CONF }];
    expect(await (await apply(post(receipt))).json()).toMatchObject({ state: 'acknowledged-delivery' });
    expect(client.tables.assistant_execution_results[0].feedback_handoff_acknowledged_at).toBeTruthy();
    expect((await apply(post({ ...receipt, savedRecordId: '00000000-0000-4000-8000-0000000000b2' }))).status).toBe(409);
  });

  it('feeding proposal without paddock returns 400 entry-target-unresolved with the plain-words question', async () => {
    const proposal = {
      type: 'proposal',
      destination: 'feeding',
      fields: { date: '2026-11-09', entryTarget: {} },
      mappings: [],
    };
    const fetch = vi.fn(async () => Response.json({
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }],
    }));
    const { deps } = setup({ fetch });
    const handler = createAssistantFunction(deps);
    await handler(post({
      command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'data-entry',
      capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} },
    }));
    const response = await handler(post({
      command: 'turn', conversationRef: REF, requestRef: 'r2',
      turn: { id: 't1', role: 'user', modality: 'voice', text: 'Feeding' },
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'entry-target-unresolved',
      question: 'How many bales, and which paddock?',
    });
  });

  it('a failed typed feeding request leaves conversation checkpoint and transcript evidence', async () => {
    const proposal = {
      type: 'proposal',
      destination: 'feeding',
      fields: { date: '2026-11-09', entryTarget: { paddock: 'e1' } },
      mappings: [],
    };
    const fetch = vi.fn(async () => Response.json({
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }],
    }));
    const { deps, client } = setup({ fetch });
    // No matching paddock: resolution fails, but the request must still be attributable.
    const handler = createAssistantFunction(deps);
    await handler(post({
      command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'data-entry',
      capture: { capturedAt: '2026-11-10T10:35:00Z', source: 'text', context: {} },
    }));
    const response = await handler(post({
      command: 'turn', conversationRef: REF, requestRef: 'r2',
      turn: { id: '00000000-0000-4000-8000-0000000000t1', role: 'user', modality: 'text', text: 'e1' },
    }));
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe('entry-target-unresolved');
    expect(body.question).toMatch(/paddock/i);
    const checkpoint = client.tables.assistant_session_checkpoints[0];
    expect(checkpoint).toBeTruthy();
    const snap = checkpoint.trusted_snapshot;
    expect(snap.transcript.some(turn => turn.role === 'user' && turn.text === 'e1')).toBe(true);
    expect(snap.transcript.some(turn => turn.role === 'assistant' && turn.text === body.question)).toBe(true);
    const turns = client.tables.assistant_transcript_turns || [];
    expect(turns.some(row => row.speaker === 'user' && row.text === 'e1' && row.input_mode === 'text')).toBe(true);
    expect(turns.some(row => row.speaker === 'assistant' && row.text === body.question)).toBe(true);
    expect(client.calls.rpc.some(call => call.name === 'assistant_billing_finish')).toBe(true);
  });

  it('feeding proposal with paddock Corral reaches review (stubbed model picked feeding)', async () => {
    const CORRAL = '00000000-0000-4000-8000-0000000000c5';
    const EVT = '00000000-0000-4000-8000-0000000000c6';
    const proposal = {
      type: 'proposal',
      destination: 'feeding',
      fields: {
        date: '2026-11-09',
        lines: [{ feedTypeId: 'ft', quantity: 2 }],
        entryTarget: { paddock: 'Corral' },
      },
      mappings: [],
    };
    const fetch = vi.fn(async () => Response.json({
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(proposal) }] }],
    }));
    const { deps, client } = setup({ fetch });
    client.tables.locations = [{ id: CORRAL, operation_id: OP, name: 'Corral', farm_id: 'f1' }];
    client.tables.events = [{ id: EVT, operation_id: OP, farm_id: 'f1' }];
    client.tables.event_paddock_windows = [{ id: 'pw-c', operation_id: OP, event_id: EVT, location_id: CORRAL, date_closed: null }];
    const handler = createAssistantFunction(deps);
    await handler(post({
      command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'data-entry',
      capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} },
    }));
    const turned = await (await handler(post({
      command: 'turn', conversationRef: REF, requestRef: 'r2',
      turn: { id: 't1', role: 'user', modality: 'voice', text: 'I fed two bales of grass hay in the corral' },
    }))).json();
    expect(turned.error).toBeUndefined();
    expect(turned.session.phase).toBe('review');
    expect(turned.session.pending).toMatchObject({
      intent: 'data-entry',
      destination: 'feeding',
      fields: expect.objectContaining({ locationId: CORRAL, entryTarget: { paddock: 'Corral' } }),
    });
  });
  it('apply refuses a receipt with no durable claim', async () => {
    const { deps } = setup();
    const handler = createAssistantFunction(deps);
    await handler(post({ command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } }));
    const response = await createApplyFunction(deps)(post({ conversationRef: REF, proposalId: 'p', proposalRevision: 1, savedRecordId: '00000000-0000-4000-8000-0000000000b1', localSavedAt: '2026-11-09T10:05:00.000Z' }));
    expect(response.status).toBe(409);
  });
});
