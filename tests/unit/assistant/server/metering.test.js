import { describe, it, expect, vi } from 'vitest';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createAssistantFunction, createTranscribeFunction } from '../../../../src/features/assistant/server/compose.js';
import { createBillingPorts } from '../../../../src/features/assistant/backend-bindings.js';
import { createBackendHandler } from '../../../../src/features/assistant/shared.js';
import { fakeSupabase, env, OP, USER } from './fake-supabase.js';

const ORIGIN = 'https://getthehayout.com';
const REF = '00000000-0000-4000-8000-0000000000c1';
const NOTE = '00000000-0000-4000-8000-0000000000e1';
const START = { command: 'start', conversationRef: REF, requestRef: 'r1', intent: 'how-to', capture: { capturedAt: '2026-11-09T10:00:00Z', source: 'voice', context: {} } };

function setup(fetch) {
  const { config } = readConfig(env());
  let lease = 0;
  const client = fakeSupabase({
    users: { 'jwt-user': USER },
    tables: {
      operation_members: [{ operation_id: OP, user_id: USER, accepted_at: '2026-01-01T00:00:00Z' }],
      assistant_testing_consents: [{ id: 'c1', operation_id: OP, actor_id: USER, conversation_id: REF, decision: 'declined', decided_at: '2026-11-09T10:00:00Z' }],
      assistant_session_checkpoints: [],
    },
    rpc: async name => name === 'assistant_billing_reserve' ? { data: [{ lease: `00000000-0000-4000-8000-${String(++lease).padStart(12, '0')}`, routing: 'shared' }], error: null } : name === 'assistant_billing_settle' ? { data: true, error: null } : { data: null, error: null },
  });
  const openDatabase = () => ({
    connect: async () => ({ query: async text => ({ rows: text.startsWith('SELECT id FROM assistant_session_locks') ? [{ id: 1 }] : [] }), release: async () => {} }),
    close: async () => {},
  });
  const log = vi.fn();
  return { client, log, deps: { config, client, openDatabase, fetch, log, providerTimeoutMs: 20 } };
}
const post = body => new Request('https://fn.invalid/gtho-assistant', { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'content-type': 'application/json' }, body: JSON.stringify(body) });
const lastFinish = client => client.calls.rpc.filter(call => call.name === 'assistant_billing_finish').at(-1).args;
const hang = vi.fn((url, init) => new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason))));

describe('measured zero only before provider dispatch', () => {
  it('a validation failure after reserve records measured zero: one request, zero tokens and audio', async () => {
    const fetch = vi.fn();
    const { deps, client } = setup(fetch);
    const handler = createAssistantFunction(deps);
    await handler(post(START));
    const response = await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'assistant', modality: 'text', text: 'x' } }));
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: false, p_requests: 1, p_input: 0, p_output: 0, p_audio: 0 });
  });
  it('a 403 (authorization lost) after reserve and before dispatch records measured zero', async () => {
    const client = fakeSupabase({ rpc: async name => name === 'assistant_billing_reserve' ? { data: [{ lease: 'l1', routing: 'shared' }], error: null } : { data: null, error: null } });
    const meter = { providerInvoked: false };
    let allowed = true;
    const billing = createBillingPorts({ client, authorize: async () => true, isUnmeasured: () => meter.providerInvoked });
    const provider = vi.fn();
    const scope = { operationId: OP, actorId: USER };
    const snapshot = { version: 1, scope, conversationRef: REF, intent: 'how-to', capture: START.capture, transcript: [], phase: 'converse', preserved: [], saveState: 'draft', logs: [], answered: [], reviewReady: false };
    const host = { authorize: async () => true, earlyTesting: async () => false, context: async () => { if (!allowed) throw new Error('unauthorized'); }, checkpoint: async () => {}, event: async () => {}, artifact: async () => {} };
    const handler = createBackendHandler({ authenticate: async () => ({ scope }), withSession: (s, ref, work) => work(snapshot), host, billing: { ...billing, reserve: async (...args) => { const lease = await billing.reserve(...args); allowed = false; return lease; } }, provider }, { maxReadRounds: 3, maxBodyBytes: 65536 });
    const response = await handler(new Request('https://fn.invalid', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'text', text: 'Help' } }) }));
    expect(await response.clone().json()).toEqual({ error: 'backend-unavailable' });
    expect(response.status).toBe(503);
    expect(meter.providerInvoked).toBe(false);
    expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: false, p_requests: 1, p_input: 0, p_audio: 0 });
  });
});

describe('a started provider fetch is unknown usage, never zero', () => {
  it('text: a network failure after dispatch', async () => {
    const fetch = vi.fn(async () => { throw new TypeError('network'); });
    const { deps, client } = setup(fetch);
    const handler = createAssistantFunction(deps);
    await handler(post(START));
    expect((await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'text', text: 'Help' } }))).status).toBe(503);
    expect(fetch).toHaveBeenCalledOnce();
    expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: true, p_requests: 1 });
  });
  it('unknown usage does not stop the next request from reserving and running', async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      if (++calls === 1) throw new TypeError('network');
      return Response.json({ usage: { input_tokens: 3, output_tokens: 2 }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify({ type: 'answer', text: 'Open the Feed tab.' }) }] }] });
    });
    const { deps, client } = setup(fetch);
    const handler = createAssistantFunction(deps);
    await handler(post(START));
    expect((await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't1', role: 'user', modality: 'text', text: 'Help' } }))).status).toBe(503);
    expect(lastFinish(client)).toMatchObject({ p_unmeasured: true });
    expect((await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r3', turn: { id: 't2', role: 'user', modality: 'text', text: 'Help again' } }))).status).toBe(200);
    expect(lastFinish(client)).toMatchObject({ p_failed: false, p_unmeasured: false, p_input: 3, p_output: 2 });
  });
  it('text: a timeout abort after dispatch', async () => {
    const { deps, client } = setup(hang);
    const handler = createAssistantFunction(deps);
    await handler(post(START));
    expect((await handler(post({ command: 'turn', conversationRef: REF, requestRef: 'r2', turn: { id: 't2', role: 'user', modality: 'text', text: 'Help' } }))).status).toBe(503);
    expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: true });
  });
  it('voice token exchange: provider error, network failure and timeout after dispatch', async () => {
    for (const fetch of [vi.fn(async () => new Response('', { status: 500 })), vi.fn(async () => { throw new TypeError('network'); })]) {
      const { deps, client } = setup(fetch);
      const handler = createAssistantFunction(deps);
      await handler(post(START));
      expect((await handler(post({ command: 'voice-authorization', conversationRef: REF, requestRef: 'r2' }))).ok).toBe(false);
      expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: true, p_requests: 1 });
      expect(client.calls.rpc.some(call => call.name === 'assistant_billing_settle')).toBe(false);
    }
  });
  it('STT: provider error, timeout after dispatch and a missing duration are unknown', async () => {
    const audio = () => new Request(`https://fn.invalid/gtho-assistant-transcribe?requestRef=${NOTE}`, { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'content-type': 'audio/webm' }, body: new Uint8Array([1, 2, 3]) });
    const cases = [
      [vi.fn(async () => new Response('', { status: 500 })), 'provider-request-failed'],
      [hang, null],
      [vi.fn(async () => Response.json({ text: 'Moved the heifers' })), 'provider-duration-missing'],
      [vi.fn(async () => Response.json({ text: 'Moved the heifers', duration: null })), 'provider-duration-missing'],
    ];
    for (const [fetch, code] of cases) {
      const { deps, client } = setup(fetch);
      const response = await createTranscribeFunction(deps)(audio());
      expect(response.ok).toBe(false);
      if (code) expect(await response.json()).toEqual({ error: code });
      expect(lastFinish(client)).toMatchObject({ p_failed: true, p_unmeasured: true, p_requests: 1 });
    }
  });
  it('STT: a request refused before dispatch records measured zero', async () => {
    const fetch = vi.fn();
    const { deps, client } = setup(fetch);
    const empty = new Request(`https://fn.invalid/gtho-assistant-transcribe?requestRef=${NOTE}`, { method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer jwt-user', 'content-type': 'audio/webm' }, body: new Uint8Array([]) });
    expect((await createTranscribeFunction(deps)(empty)).status).toBe(400);
    expect(client.calls.rpc).toEqual([]); // refused before any reservation
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('client voice-usage reports', () => {
  it('are refused idempotently with a stable 200, no reservation and no log', async () => {
    const { deps, client, log } = setup(vi.fn());
    const handler = createAssistantFunction(deps);
    await handler(post(START));
    const before = client.calls.rpc.length;
    const logged = log.mock.calls.length;
    const bodies = [];
    for (const requestRef of ['u1', 'u1', 'u2']) {
      const response = await handler(post({ command: 'voice-usage', conversationRef: REF, requestRef, usage: { audioMinutes: 99 } }));
      expect(response.status).toBe(200);
      bodies.push(await response.json());
    }
    expect(new Set(bodies.map(body => JSON.stringify(body))).size).toBe(1);
    expect(bodies[0]).toEqual({ voiceUsage: { accepted: false, reason: 'settled-at-token-issue' } });
    expect(client.calls.rpc.length).toBe(before);
    expect(log.mock.calls.length).toBe(logged);
  });
});
