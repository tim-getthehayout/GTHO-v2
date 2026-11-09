import { describe, it, expect, vi } from 'vitest';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createServerHost, feedbackInterview } from '../../../../src/features/assistant/server/host.js';
import { createVoiceAuthorization } from '../../../../src/features/assistant/server/voice.js';
import { createTestingAudioHandler } from '../../../../src/features/assistant/server/testing-audio.js';
import { createTranscribeHandler } from '../../../../src/features/assistant/server/transcribe.js';
import { createServerFarmData } from '../../../../src/features/assistant/server/farm-data.js';
import { FARM_ENTRY_FIELD_HINTS } from '../../../../src/features/assistant/farm-entry-contract.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeSupabase, env, OP, OTHER_OP, USER } from './fake-supabase.js';

const { config } = readConfig(env());
const scope = { operationId: OP, actorId: USER };
const REF = '00000000-0000-4000-8000-0000000000c1';
const ANIMAL = '00000000-0000-4000-8000-0000000000d1';
const json = (url, body, headers = {}) => new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

function host(session, tables = {}) {
  const client = fakeSupabase({ tables });
  const getAll = createServerFarmData({ client, operationId: OP });
  return createServerHost({ client, scope, config, persistence: {}, getAll, authorize: async () => true, session: { ref: REF, loaded: session, live: null } });
}

describe('server host ports', () => {
  it('data-entry proposals need a host-resolved target inside the operation', async () => {
    const session = { intent: 'data-entry', capture: { context: { target: { ui: 'treatment', id: ANIMAL } } }, transcript: [] };
    const proposal = { id: 'p', itemRef: 'i', revision: 1, intent: 'data-entry', destination: 'treatment', fields: { product: 'Ivomec' } };
    await expect(host(session, { animals: [{ id: ANIMAL, operation_id: OTHER_OP }] }).createProposal(scope, proposal)).rejects.toMatchObject({ code: 'entry-target-outside-operation' });
    await expect(host(session, { animals: [{ id: ANIMAL, operation_id: OP }] }).createProposal(scope, proposal)).resolves.toEqual(proposal);
    await expect(host({ ...session, capture: { context: {} } }).createProposal(scope, proposal)).rejects.toMatchObject({ code: 'entry-target-required' });
    await expect(host(session, { animals: [{ id: ANIMAL, operation_id: OP }] }).createProposal(scope, { ...proposal, destination: 'harvest' })).rejects.toMatchObject({ code: 'entry-ui-not-allowed' });
  });
  it('rejects scopes other than the verified caller', async () => {
    await expect(host(null).context({ operationId: OTHER_OP, actorId: USER }, 'how-to')).rejects.toThrow('unauthorized');
  });
  it('gives each intent its own context: read tools only for farm questions/entry, answer-only how-to', async () => {
    const h = host({ intent: 'how-to', capture: { context: {} }, transcript: [] });
    expect((await h.context(scope, 'how-to')).readTools).toEqual([]);
    expect((await h.context(scope, 'data-questions')).readTools.map(tool => tool.name)).toEqual(['animal-reproductive-evidence', 'open-animal-set', 'paddock-grazing-evidence']);
    expect((await h.context(scope, 'feedback')).readTools).toEqual([]);
    expect(await h.matchingDoc(scope, 'anything')).toBeUndefined();
    await expect(h.createProposal(scope, { id: 'p', itemRef: 'i', revision: 1, intent: 'how-to', destination: 'x', fields: {} })).rejects.toMatchObject({ code: 'read-only-intent' });
  });
  it('feedback interview state comes from the pinned library', () => {
    const session = { intent: 'feedback', capture: { context: { feedbackHost: { itemId: 'i', contractVersion: '0.1.2', appId: 'gtho', screen: { state: 'known', value: 's', source: 'host' }, buildStamp: { state: 'known', value: 'b', source: 'host' }, capturedAt: '2026-11-09T10:00:00Z' } } }, transcript: [{ id: 't', role: 'user', modality: 'voice', text: 'Totals look off' }] };
    expect(feedbackInterview(session)).toEqual({ nextQuestion: { field: 'type', text: expect.any(String) }, destination: 'design' });
  });
  it('field hints name fields the normal UIs actually bind', () => {
    const files = { treatment: 'health/treatment.js', calving: 'health/calving.js', feeding: 'feed/delivery.js', move: 'events/move-wizard.js', place: 'events/place-wizard.js' };
    for (const [ui, names] of Object.entries(FARM_ENTRY_FIELD_HINTS)) {
      const source = readFileSync(resolve(import.meta.dirname, '../../../../src/features', files[ui]), 'utf8');
      for (const name of names) expect(source, `${ui}.${name}`).toMatch(new RegExp(`\\b${name}\\b`));
    }
  });
});

describe('voice authorization', () => {
  it('refuses a token whose lifetime exceeds 120 s and records no settlement', async () => {
    const client = fakeSupabase();
    const fetch = vi.fn(async () => Response.json({ value: 'secret', expires_at: Math.floor(Date.now() / 1000) + 600 }));
    await expect(createVoiceAuthorization({ config, client, fetch })(scope, REF, 'shared')).rejects.toMatchObject({ code: 'invalid-voice-authorization' });
    expect(client.calls.rpc).toEqual([]);
  });
  it('does not return a token when the worst-case settlement is not recorded', async () => {
    const client = fakeSupabase({ rpc: async name => name === 'assistant_billing_reserve' ? { data: [{ lease: 'l', routing: 'shared' }], error: null } : { data: false, error: null } });
    const fetch = vi.fn(async () => Response.json({ value: 'secret', expires_at: Math.floor(Date.now() / 1000) + 60 }));
    await expect(createVoiceAuthorization({ config, client, fetch })(scope, REF, 'shared')).rejects.toThrow('voice-settlement-not-recorded');
  });
  it('the unverified session-binding variant is behind a switch', async () => {
    const client = fakeSupabase({ rpc: async name => name === 'assistant_billing_reserve' ? { data: [{ lease: 'l', routing: 'shared' }], error: null } : { data: true, error: null } });
    const fetch = vi.fn(async () => Response.json({ value: 'secret', expires_at: Math.floor(Date.now() / 1000) + 60 }));
    await createVoiceAuthorization({ config, client, fetch, bindSession: true })(scope, REF, 'shared');
    expect(JSON.parse(fetch.mock.calls[0][1].body).session).toEqual({ model: 'grok-voice-3.0', reasoning: { effort: 'none' } });
  });
});

describe('testing audio signed upload', () => {
  const tables = accepted => ({ assistant_testing_consents: [{ id: 'consent', operation_id: OP, actor_id: USER, conversation_id: REF, decision: accepted ? 'accepted' : 'declined', decided_at: '2026-11-09T10:00:00Z' }] });
  it('needs a stored accepted consent and a native codec', async () => {
    const declined = createTestingAudioHandler({ client: fakeSupabase({ tables: tables(false) }), config });
    await expect(declined(scope, json('https://fn.invalid', { conversationRef: REF, mimeType: 'audio/webm' }))).rejects.toMatchObject({ status: 403 });
    const handler = createTestingAudioHandler({ client: fakeSupabase({ tables: tables(true) }), config, randomUUID: () => 'u' });
    await expect(handler(scope, json('https://fn.invalid', { conversationRef: REF, mimeType: 'audio/wav' }))).rejects.toMatchObject({ status: 400 });
    const response = await handler(scope, json('https://fn.invalid', { conversationRef: REF, mimeType: 'audio/webm;codecs=opus' }));
    expect(await response.json()).toEqual({ bucket: 'assistant-testing-audio', path: `${OP}/${REF}/u`, token: 'signed-token', consentId: 'consent', mimeType: 'audio/webm', maxBytes: 26214400 });
  });
});

describe('offline note transcription', () => {
  const billing = () => ({ reserve: vi.fn(async () => ({ lease: 'l', routing: 'shared' })), finish: vi.fn(async () => {}) });
  const audio = requestRef => new Request(`https://fn.invalid/gtho-assistant-transcribe?requestRef=${requestRef}`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: new Uint8Array([1, 2, 3]) });
  it('posts model before file to /v1/stt and meters the reported duration', async () => {
    const meter = billing();
    const fetch = vi.fn(async (url, init) => {
      expect(url).toBe('https://api.x.ai/v1/stt');
      expect([...init.body.keys()]).toEqual(['model', 'file']);
      expect(init.body.get('model')).toBe('grok-voice-transcribe-2.0');
      return Response.json({ text: 'Moved the heifers', duration: 90, words: [] });
    });
    const response = await createTranscribeHandler({ config, billing: meter, fetch })(scope, audio(REF));
    expect(await response.json()).toEqual({ text: 'Moved the heifers', durationSeconds: 90 });
    expect(meter.reserve).toHaveBeenCalledWith(scope, 'offline-note', `transcribe:${REF}`, { kind: 'request' });
    expect(meter.finish).toHaveBeenCalledWith(scope, 'l', expect.objectContaining({ audioMinutes: 1.5, requestCount: 1 }), true, false);
  });
  it('marks a failed provider call failed (unknown usage), and needs a request ref', async () => {
    const meter = billing();
    await expect(createTranscribeHandler({ config, billing: meter, fetch: async () => new Response('', { status: 500 }) })(scope, audio(REF))).rejects.toMatchObject({ code: 'provider-request-failed' });
    expect(meter.finish.mock.calls[0][4]).toBe(true);
    await expect(createTranscribeHandler({ config, billing: meter, fetch })(scope, audio('nope'))).rejects.toMatchObject({ status: 400 });
  });
});
