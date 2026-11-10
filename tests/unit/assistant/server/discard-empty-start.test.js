/**
 * @file Empty-start cleanup must call the atomic assistant_discard_empty_start
 * RPC (not independent REST deletes). Migration 041 must delete testing consent
 * in the same transaction (NO ACTION FK would otherwise block conversation
 * DELETE), lock the conversation row, admit restore-fence, keep billing/usage,
 * and refuse when any transcript turn already exists.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeSupabase, OP } from './fake-supabase.js';
import { discardEmptyStartRows } from '../../../../src/features/assistant/server/discard-empty-start.js';
import { RuntimeError } from '../../../../src/features/assistant/shared.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';

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
    // Must not fall back to table deletes.
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
    // Consent DELETE must appear before conversation DELETE (FK order).
    const consentAt = sql.indexOf('DELETE FROM public.assistant_testing_consents');
    const convAt = sql.indexOf('DELETE FROM public.assistant_conversations');
    expect(consentAt).toBeGreaterThan(-1);
    expect(convAt).toBeGreaterThan(consentAt);
  });

  it('documents the testing_consents NO ACTION FK that blocks conversation DELETE without consent cleanup', () => {
    const mig040 = readFileSync(resolve(process.cwd(), 'supabase/migrations/040_assistant_host_artifacts.sql'), 'utf8');
    // 040 wires assistant_testing_consents → assistant_conversations with default NO ACTION.
    expect(mig040).toMatch(
      /ALTER TABLE assistant_testing_consents ADD FOREIGN KEY \(operation_id, conversation_id\) REFERENCES assistant_conversations\(operation_id, id\)/,
    );
    // No ON DELETE CASCADE on that FK — deleting the conversation while a consent
    // row remains must fail. 041 therefore deletes consent in the same transaction.
    const fkBlock = mig040.match(
      /ALTER TABLE assistant_testing_consents ADD FOREIGN KEY \(operation_id, conversation_id\) REFERENCES assistant_conversations\(operation_id, id\)[^;]*/,
    )?.[0] ?? '';
    expect(fkBlock).not.toMatch(/ON DELETE\s+CASCADE/i);
  });

  it('grants execute to authenticated and service_role (edge service-role client) only', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) FROM PUBLIC, anon/);
  });
});
