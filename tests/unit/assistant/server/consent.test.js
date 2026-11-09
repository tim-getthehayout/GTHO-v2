import { describe, it, expect } from 'vitest';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createAssistantFunction } from '../../../../src/features/assistant/server/compose.js';
import { fakeSupabase, env, OP, OTHER_OP, USER, BILLING_USER } from './fake-supabase.js';

const ORIGIN = 'https://getthehayout.com';
const row = (operation_id, actor_id, decision, decided_at, conversation_id = 'c') => ({ id: `${operation_id}-${actor_id}-${decided_at}`, operation_id, actor_id, conversation_id, decision, decided_at });
function get(rows, overrides = {}) {
  const { config } = readConfig(env(overrides));
  const client = fakeSupabase({ users: { 'jwt-user': USER }, tables: { operation_members: [{ operation_id: OP, user_id: USER, accepted_at: '2026-01-01T00:00:00Z' }], assistant_testing_consents: rows } });
  const handler = createAssistantFunction({ config, client, openDatabase: () => ({ connect: async () => ({}), close: async () => {} }) });
  return handler(new Request('https://fn.invalid/gtho-assistant', { headers: { origin: ORIGIN, authorization: 'Bearer jwt-user' } }));
}

describe('one-time testing consent per tester per operation', () => {
  it('returns no stored decision for a first-time tester', async () => {
    expect((await (await get([])).json()).testingConsent).toBeNull();
  });
  it("returns the signed-in tester's latest decision in this operation only", async () => {
    const response = await get([
      row(OP, USER, 'accepted', '2026-11-01T10:00:00Z'),
      row(OP, USER, 'declined', '2026-11-02T10:00:00Z'),
      row(OP, BILLING_USER, 'accepted', '2026-11-05T10:00:00Z'),
      row(OTHER_OP, USER, 'accepted', '2026-11-06T10:00:00Z'),
    ]);
    expect((await response.json()).testingConsent).toEqual({ decision: 'declined', decidedAt: '2026-11-02T10:00:00Z' });
  });
  it('is not read outside early testing', async () => {
    expect((await (await get([row(OP, USER, 'accepted', '2026-11-01T10:00:00Z')], { GTHO_ASSISTANT_EARLY_TESTING: 'false' })).json()).testingConsent).toBeNull();
  });
});
