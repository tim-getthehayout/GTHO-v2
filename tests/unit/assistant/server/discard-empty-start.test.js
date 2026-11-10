/**
 * @file Empty-start cleanup must call the atomic assistant_discard_empty_start
 * RPC (not independent REST deletes). Migration 041 must delete testing consent
 * in the same transaction (NO ACTION FK would otherwise block conversation
 * DELETE), lock the conversation row, admit restore-fence, keep billing/usage,
 * refuse null auth.uid() / non-members, and GRANT EXECUTE to authenticated only
 * (no service_role) — same style as CP-56 restore RPC grants.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeSupabase, env, OP, USER } from './fake-supabase.js';
import { discardEmptyStartRows } from '../../../../src/features/assistant/server/discard-empty-start.js';
import { RuntimeError } from '../../../../src/features/assistant/shared.js';
import { readConfig } from '../../../../src/features/assistant/server/config.js';
import { createAssistantFunction } from '../../../../src/features/assistant/server/compose.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const ORIGIN = 'https://getthehayout.com';

describe('discardEmptyStartRows routes through atomic RPC', () => {
  it('calls assistant_discard_empty_start and returns discarded', async () => {
    const client = fakeSupabase({
      rpc: async (name, args) => {
        expect(name).toBe('assistant_discard_empty_start');
        expect(args).toEqual({ p_operation: OP, p_conversation: CONV });
        return { data: 'discarded', error: null };
      },
    });
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .resolves.toEqual({ outcome: 'discarded' });
    expect(client.calls.rpc).toEqual([
      { name: 'assistant_discard_empty_start', args: { p_operation: OP, p_conversation: CONV } },
    ]);
    expect(client.calls.deletes || []).toEqual([]);
  });

  it('maps refused-turns-exist from the RPC and does not claim success', async () => {
    const client = fakeSupabase({
      rpc: async () => ({ data: null, error: { message: 'discard-empty-refused-turns-exist' } }),
    });
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .rejects.toMatchObject({ code: 'discard-empty-refused-turns-exist' });
  });

  it('surfaces unexpected RPC errors as RuntimeError', async () => {
    const client = fakeSupabase({
      rpc: async () => ({ data: null, error: { message: 'boom-from-rpc' } }),
    });
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .rejects.toBeInstanceOf(RuntimeError);
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .rejects.toMatchObject({ code: 'boom-from-rpc' });
  });
});

describe('migration 041 assistant_discard_empty_start', () => {
  // Grants, null-uid, non-member, consent FK, and atomic rollback are proved
  // against a real database in tests/sql/assistant-discard-empty-start.sql
  // (PGlite runner: tests/sql/run-assistant-host-artifacts.mjs).
  it('is loaded by the isolated SQL runner after migration 040', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/041_assistant_discard_empty_start.sql'), 'utf8');
    const runner = readFileSync(resolve(process.cwd(), 'tests/sql/run-assistant-host-artifacts.mjs'), 'utf8');
    const assertions = readFileSync(resolve(process.cwd(), 'tests/sql/assistant-discard-empty-start.sql'), 'utf8');
    expect(runner).toMatch(/041_assistant_discard_empty_start\.sql/);
    expect(runner).toMatch(/assistant-discard-empty-start\.sql/);
    expect(assertions).toMatch(/has_function_privilege\('service_role'/);
    expect(assertions).toMatch(/foreign_key_violation/);
    expect(sql).toMatch(/assistant_discard_empty_start/);
  });
});

describe('edge discard-empty uses the user-scoped client', () => {
  it('forwards the caller JWT via createUserClient and never RPCs on the service client', async () => {
    const { config } = readConfig(env());
    const serviceClient = fakeSupabase({
      users: { 'jwt-user': USER },
      tables: {
        operation_members: [{ operation_id: OP, user_id: USER, accepted_at: '2026-01-01T00:00:00Z' }],
      },
      rpc: async () => ({ data: 'discarded', error: null }),
    });
    const userClient = fakeSupabase({
      rpc: async (name, args) => {
        expect(name).toBe('assistant_discard_empty_start');
        expect(args).toEqual({ p_operation: OP, p_conversation: CONV });
        return { data: 'discarded', error: null };
      },
    });
    const createUserClient = vi.fn(() => userClient);
    const openDatabase = () => ({
      connect: async () => ({ query: async () => ({ rows: [] }), release: async () => {} }),
      close: async () => {},
    });
    const handler = createAssistantFunction({
      config, client: serviceClient, createUserClient, openDatabase, fetch: vi.fn(), log: vi.fn(),
    });
    const response = await handler(new Request('https://fn.invalid/gtho-assistant', {
      method: 'POST',
      headers: {
        origin: ORIGIN,
        authorization: 'Bearer jwt-user',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ command: 'discard-empty', conversationRef: CONV }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ value: { outcome: 'discarded' } });
    expect(createUserClient).toHaveBeenCalledTimes(1);
    expect(createUserClient).toHaveBeenCalledWith('jwt-user');
    expect(userClient.calls.rpc).toEqual([
      { name: 'assistant_discard_empty_start', args: { p_operation: OP, p_conversation: CONV } },
    ]);
    // Service client may auth/membership-lookup; it must not call the discard RPC.
    expect(serviceClient.calls.rpc.filter(c => c.name === 'assistant_discard_empty_start')).toEqual([]);
  });
});
