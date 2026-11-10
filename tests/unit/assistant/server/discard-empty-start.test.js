/**
 * @file Empty-start cleanup must DELETE checkpoint/lock/voice attempt (and the
 * empty conversation), keep every billing/usage row, and refuse when any
 * transcript turn already exists. Asserts the persisted table state — not a
 * mocked cancel().
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fakeSupabase, OP } from './fake-supabase.js';
import { discardEmptyStartRows } from '../../../../src/features/assistant/server/discard-empty-start.js';
import { RuntimeError } from '../../../../src/features/assistant/shared.js';

const CONV = '00000000-0000-4000-8000-0000000000c1';
const OTHER = '00000000-0000-4000-8000-0000000000c2';
const ATTEMPT = '00000000-0000-4000-8000-0000000000a1';
const LOCK = '00000000-0000-4000-8000-0000000000l1';
const CHECKPOINT = '00000000-0000-4000-8000-0000000000k1';
const RESERVATION = '00000000-0000-4000-8000-0000000000r1';
const USAGE = '00000000-0000-4000-8000-0000000000u1';

function seed({ withTurn = false } = {}) {
  return fakeSupabase({
    tables: {
      assistant_conversations: [
        { id: CONV, operation_id: OP },
        { id: OTHER, operation_id: OP },
      ],
      assistant_transcript_turns: withTurn
        ? [{ id: 't1', operation_id: OP, conversation_id: CONV }]
        : [],
      voice_entry_attempts: [
        { id: ATTEMPT, operation_id: OP, conversation_id: CONV, status: 'unfinished' },
        { id: 'keep-attempt', operation_id: OP, conversation_id: OTHER, status: 'unfinished' },
      ],
      assistant_session_checkpoints: [
        { id: CHECKPOINT, operation_id: OP, conversation_id: CONV, lifecycle_phase: 'cancelled' },
        { id: 'keep-cp', operation_id: OP, conversation_id: OTHER, lifecycle_phase: 'converse' },
      ],
      assistant_session_locks: [
        { id: LOCK, operation_id: OP, conversation_ref: CONV },
        { id: 'keep-lock', operation_id: OP, conversation_ref: OTHER },
      ],
      assistant_billing_reservations: [
        { id: RESERVATION, operation_id: OP, lease: RESERVATION },
      ],
      assistant_billing_usage: [
        { id: USAGE, operation_id: OP, lease: RESERVATION, audio_minutes: 0 },
      ],
    },
  });
}

describe('discardEmptyStartRows persisted result', () => {
  it('deletes checkpoint, lock, voice attempt, and empty conversation; keeps billing/usage and other conversations', async () => {
    const client = seed();
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .resolves.toEqual({ outcome: 'discarded' });

    expect(client.tables.assistant_session_checkpoints.map(r => r.id)).toEqual(['keep-cp']);
    expect(client.tables.assistant_session_locks.map(r => r.id)).toEqual(['keep-lock']);
    expect(client.tables.voice_entry_attempts.map(r => r.id)).toEqual(['keep-attempt']);
    expect(client.tables.assistant_conversations.map(r => r.id)).toEqual([OTHER]);
    // Billing / usage ledger untouched.
    expect(client.tables.assistant_billing_reservations).toHaveLength(1);
    expect(client.tables.assistant_billing_usage).toHaveLength(1);
    expect(client.tables.assistant_billing_usage[0].id).toBe(USAGE);
  });

  it('refuses when any transcript turn exists and leaves every row in place', async () => {
    const client = seed({ withTurn: true });
    await expect(discardEmptyStartRows(client, { operationId: OP, conversationRef: CONV }))
      .rejects.toMatchObject({ code: 'discard-empty-refused-turns-exist' });
    expect(client.tables.assistant_session_checkpoints).toHaveLength(2);
    expect(client.tables.assistant_session_locks).toHaveLength(2);
    expect(client.tables.voice_entry_attempts).toHaveLength(2);
    expect(client.tables.assistant_conversations).toHaveLength(2);
    expect(client.tables.assistant_billing_usage).toHaveLength(1);
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

  it('deletes checkpoint, lock, and voice_entry_attempts; never names billing tables in DELETE', () => {
    expect(sql).toMatch(/DELETE FROM public\.voice_entry_attempts/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_session_checkpoints/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_session_locks/);
    expect(sql).toMatch(/DELETE FROM public\.assistant_conversations/);
    expect(sql).not.toMatch(/DELETE FROM public\.assistant_billing_/);
    expect(sql).toMatch(/discard-empty-refused-turns-exist/);
  });

  it('grants execute to authenticated and service_role only', () => {
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) TO service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.assistant_discard_empty_start\(uuid, uuid\) FROM PUBLIC, anon/);
  });
});
