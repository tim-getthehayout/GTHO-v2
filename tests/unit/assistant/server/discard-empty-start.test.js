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
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/041_assistant_discard_empty_start.sql'), 'utf8');

  it('is SECURITY DEFINER with fixed search_path and membership via auth.uid()', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = ''/);
    expect(sql).toMatch(/operation_members[\s\S]*auth\.uid\(\)/);
    expect(sql).toMatch(/accepted_at IS NOT NULL/);
  });

  it('raises when auth.uid() is null (no null-uid bypass)', () => {
    expect(sql).toMatch(/IF \(SELECT auth\.uid\(\)\) IS NULL THEN/);
    expect(sql).toMatch(/RAISE EXCEPTION 'discard-empty-auth-required'/);
    // No service_role / null-uid bypass remains.
    expect(sql).not.toMatch(/auth\.role\(\)/);
    expect(sql).not.toMatch(/IS DISTINCT FROM 'service_role'/);
  });

  it('refuses a non-member via accepted operation_members for auth.uid()', () => {
    expect(sql).toMatch(/discard-empty-membership-required/);
    expect(sql).toMatch(/user_id = \(SELECT auth\.uid\(\)\)/);
    expect(sql).toMatch(/accepted_at IS NOT NULL/);
  });

  it('admits restore-fence and locks the conversation row before deletes', () => {
    expect(sql).toMatch(/assistant_assert_restore_unfenced\(p_operation\)/);
    expect(sql).toMatch(/FOR UPDATE/);
  });

  it('deletes testing consent before conversation (NO ACTION FK) plus attempt/checkpoint/lock; never billing', () => {
    expect(sql).toMatch(/DELETE FROM public\.assistant_testing_consents/);
    expect(sql).toMatch(/DELETE FROM public\.voice_entry_attempts/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_session_checkpoints/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_session_locks/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_conversations/);
    expect(sql).not.toMatch(/DELETE FROM public\.assistant_billing_/);
    expect(sql).toMatch(/discard-empty-refused-turns-exist/);
    const consentAt = sql.indexOf('DELETE FROM public.assistant_testing_consents');
    const convAt = sql.indexOf('DELETE FROM public.assistant_conversations');
    expect(consentAt).toBeGreaterThan(-1);
    expect(convAt).toBeGreaterThan(consentAt);
  });

  it('documents the testing_consents NO ACTION FK that blocks conversation DELETE without consent cleanup', () => {
    const mig040 = readFileSync(resolve(process.cwd(), 'supabase/migrations/040_assistant_host_artifacts.sql'), 'utf8');
    expect(mig040).toMatch(
      /ALTER TABLE assistant_testing_consents ADD FOREIGN KEY \(operation_id, conversation_id\) REFERENCES assistant_conversations\(operation_id, id\)/,
    );
    const fkBlock = mig040.match(
      /ALTER TABLE assistant_testing_consents ADD FOREIGN KEY \(operation_id, conversation_id\) REFERENCES assistant_conversations\(operation_id, id\)[^;]*/,
    )?.[0] ?? '';
    expect(fkBlock).not.toMatch(/ON DELETE\s+CASCADE/i);
  });

  it('grants execute to authenticated only — service_role cannot execute (CP-56 style)', () => {
    // Same pattern as assistant_restore_prepare: REVOKE … service_role; GRANT authenticated only.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) FROM PUBLIC, anon, service_role/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO authenticated/);
    expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO service_role/);
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
