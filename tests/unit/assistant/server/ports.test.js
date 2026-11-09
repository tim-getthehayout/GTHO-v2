import { describe, it, expect, vi } from 'vitest';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createServerHost, feedbackInterview } from '../../../../src/features/assistant/server/host.js';
import { createVoiceAuthorization } from '../../../../src/features/assistant/server/voice.js';
import { createTestingAudioHandler } from '../../../../src/features/assistant/server/testing-audio.js';
import { createTranscribeHandler } from '../../../../src/features/assistant/server/transcribe.js';
import { createServerFarmData } from '../../../../src/features/assistant/server/farm-data.js';
import { FARM_ENTRY_FIELD_HINTS, FARM_ENTRY_DEFINITIONS } from '../../../../src/features/assistant/farm-entry-contract.js';
import { entryFieldHints } from '../../../../src/features/assistant/entry-fields.js';
import { ROUTING_INSTRUCTION, parseRoute, INTENT_PURPOSE } from '../../../../src/features/assistant/intent-routing.js';
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
  it('data-entry targets resolve only from names the user said, inside the operation', async () => {
    const session = { intent: 'data-entry', capture: { context: {} }, transcript: [] };
    const proposal = { id: 'p', itemRef: 'i', revision: 1, intent: 'data-entry', destination: 'treatment', fields: { product: 'Ivomec', entryTarget: { animal: '42' } } };
    const animals = operation_id => ({ animals: [{ id: ANIMAL, operation_id, tag_num: '42', active: true }] });
    await expect(host(session, animals(OTHER_OP)).createProposal(scope, proposal)).rejects.toMatchObject({ code: 'entry-target-unresolved' });
    await expect(host(session, animals(OP)).createProposal(scope, proposal)).resolves.toEqual(proposal);
    await expect(host(session, animals(OP)).createProposal(scope, { ...proposal, fields: { product: 'Ivomec' } })).rejects.toMatchObject({ code: 'entry-target-unresolved' });
    await expect(host(session, animals(OP)).createProposal(scope, { ...proposal, destination: 'harvest' })).rejects.toMatchObject({ code: 'entry-ui-not-allowed' });
  });
  it('fills paddock IDs from resolved names, overriding any model-supplied ID', async () => {
    const LOC = '00000000-0000-4000-8000-0000000000e1', EVT = '00000000-0000-4000-8000-0000000000e2';
    const tables = { locations: [{ id: LOC, operation_id: OP, name: 'North 40', farm_id: 'f' }], events: [{ id: EVT, operation_id: OP, farm_id: 'f' }], event_paddock_windows: [{ id: 'w', operation_id: OP, event_id: EVT, location_id: LOC, date_closed: null }] };
    const h = host({ intent: 'data-entry', capture: { context: {} }, transcript: [] }, tables);
    const created = await h.createProposal(scope, { id: 'p', itemRef: 'i', revision: 1, intent: 'data-entry', destination: 'feeding', fields: { date: '2026-11-09', locationId: 'model-guess', entryTarget: { paddock: 'north 40' } } });
    expect(created.fields.locationId).toBe(LOC);
    await expect(h.validate(scope, created)).resolves.toBeUndefined();
    await expect(h.validate(scope, { ...created, fields: { ...created.fields, locationId: 'stale' } })).rejects.toMatchObject({ code: 'entry-target-changed' });
  });
  it('offers the resolve-entry-target read tool that returns one question and never IDs', async () => {
    const h = host({ intent: 'data-entry', capture: { context: {} }, transcript: [] }, { groups: [{ id: 'g1', operation_id: OP, name: 'Heifers' }, { id: 'g2', operation_id: OP, name: 'heifers' }] });
    const context = await h.context(scope, 'data-entry');
    expect(context.readTools[0].name).toBe('resolve-entry-target');
    expect(context.data.chooseEntryQuestion).toBe('Which entry did you mean: treatment, calving, feeding, move or place?');
    expect(await h.read(scope, 'resolve-entry-target', { ui: 'move', entryTarget: {} })).toEqual({ status: 'question', question: 'Which group are you moving?' });
    expect(await h.read(scope, 'resolve-entry-target', { ui: 'move', entryTarget: { group: 'heifers', to: 'North' } })).toEqual({ status: 'question', question: 'Which group did you mean: Heifers or heifers?' });
    await expect(h.read(scope, 'resolve-entry-target', { ui: 'move', operationId: OTHER_OP })).rejects.toMatchObject({ code: 'read-tool-denied' });
  });
  it('rejects scopes other than the verified caller', async () => {
    await expect(host(null).context({ operationId: OTHER_OP, actorId: USER }, 'how-to')).rejects.toThrow('unauthorized');
  });
  it('gives each intent its own context: read tools only for farm questions/entry, answer-only how-to', async () => {
    const h = host({ intent: 'how-to', capture: { context: {} }, transcript: [] });
    // Every intent only adds the route-intent suggestion tool.
    expect((await h.context(scope, 'how-to')).readTools.map(tool => tool.name)).toEqual(['route-intent']);
    expect((await h.context(scope, 'data-questions')).readTools.map(tool => tool.name)).toEqual(['animal-reproductive-evidence', 'open-animal-set', 'paddock-grazing-evidence', 'route-intent']);
    expect((await h.context(scope, 'feedback')).readTools.map(tool => tool.name)).toEqual(['route-intent']);
    for (const intent of ['how-to', 'data-questions', 'feedback', 'data-entry']) expect((await h.context(scope, intent)).instructions).toContain(ROUTING_INSTRUCTION);
    expect(await h.matchingDoc(scope, 'anything')).toBeUndefined();
    await expect(h.createProposal(scope, { id: 'p', itemRef: 'i', revision: 1, intent: 'how-to', destination: 'x', fields: {} })).rejects.toMatchObject({ code: 'read-only-intent' });
  });
  it('feedback interview state comes from the pinned library', () => {
    const session = { intent: 'feedback', capture: { context: { feedbackHost: { itemId: 'i', contractVersion: '0.1.2', appId: 'gtho', screen: { state: 'known', value: 's', source: 'host' }, buildStamp: { state: 'known', value: 'b', source: 'host' }, capturedAt: '2026-11-09T10:00:00Z' } } }, transcript: [{ id: 't', role: 'user', modality: 'voice', text: 'Totals look off' }] };
    expect(feedbackInterview(session)).toEqual({ nextQuestion: { field: 'type', text: expect.any(String) }, destination: 'design' });
  });
  it('field hints are derived from the sheet field definitions', () => {
    for (const ui of Object.keys(FARM_ENTRY_FIELD_HINTS)) expect(FARM_ENTRY_FIELD_HINTS[ui]).toEqual(entryFieldHints(FARM_ENTRY_DEFINITIONS[ui]));
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

describe('data-entry context', () => {
  it('includes the open sheet fields only for the pending destination', async () => {
    const { createServerHost } = await import('../../../../src/features/assistant/server/host.js');
    const make = (pending, openSheet) => createServerHost({ client: fakeSupabase(), scope, config, persistence: {}, getAll: async () => [], authorize: async () => true, session: { ref: REF, loaded: { intent: 'data-entry', pending, capture: { context: {} } }, live: null }, openSheet });
    const open = { ui: 'calving', fields: [{ name: 'date', required: true }, { name: 'driedOffDate', required: false }] };
    expect((await make({ destination: 'calving' }, open).context(scope, 'data-entry')).data.openSheet).toEqual(open);
    expect((await make({ destination: 'move' }, open).context(scope, 'data-entry')).data.openSheet).toBeNull();
    expect((await make(undefined, null).context(scope, 'data-entry')).data.fieldHints.move.dynamicFields.map(field => field.name)).toContain('feed:*');
  });
});

describe('one push-to-talk: intent routing is a suggestion, fallback question is a host event', () => {
  const make = (intent, log = vi.fn()) => {
    const holder = { ref: REF, loaded: { intent, capture: { context: {} }, transcript: [] }, live: null, route: null };
    return { holder, log, h: createServerHost({ client: fakeSupabase(), scope, config, persistence: {}, getAll: async () => [], authorize: async () => true, session: holder, log }) };
  };
  it('route-intent records only another valid intent and never switches by itself', async () => {
    const { h, holder, log } = make('data-entry');
    expect(await h.read(scope, 'route-intent', { intent: 'data-questions' })).toEqual({ status: 'switch-requested', intent: 'data-questions' });
    expect(holder.route).toBe('data-questions');
    expect(holder.loaded.intent).toBe('data-entry');
    expect(log).toHaveBeenCalledWith({ type: 'intent-route-suggested', conversationRef: REF, intent: 'data-questions' });
    await expect(h.read(scope, 'route-intent', { intent: 'data-entry' })).rejects.toMatchObject({ code: 'read-tool-denied' });
    await expect(h.read(scope, 'route-intent', { intent: 'admin' })).rejects.toMatchObject({ code: 'read-tool-denied' });
    await expect(h.read(scope, 'route-intent', { intent: 'feedback', extra: 1 })).rejects.toMatchObject({ code: 'read-tool-denied' });
  });
  it('parseRoute and purposes cover exactly the four runtime intents', () => {
    expect(Object.entries(INTENT_PURPOSE)).toEqual([['data-entry', 'write'], ['data-questions', 'question'], ['feedback', 'feedback'], ['how-to', 'how-to']]);
    expect(parseRoute({ intent: 'how-to' }, 'feedback')).toBe('how-to');
    expect(parseRoute(['how-to'], 'feedback')).toBeNull();
  });
  it('an unresolved entry is refused and logged as a content-free host event, not a transcript turn', async () => {
    const { h, holder, log } = make('data-entry');
    await expect(h.createProposal(scope, { id: 'p', itemRef: 'i', revision: 1, intent: 'data-entry', destination: 'treatment', fields: { entryTarget: { animal: 'Nobody' } } })).rejects.toMatchObject({ code: 'entry-target-unresolved' });
    expect(log).toHaveBeenCalledWith({ type: 'entry-target-question', conversationRef: REF });
    expect(holder.loaded.transcript).toEqual([]);
  });
});
