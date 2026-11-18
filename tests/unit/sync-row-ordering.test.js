/**
 * Per-row sync ordering: a later local write to a row must never be
 * overtaken by an earlier one. Covers the window-integrity brief §3 (b)
 * acceptance vectors and the round-2 review cases, against an op-aware
 * fake server: insert fails on an existing id, update matches no missing
 * row (and reports no error, like PostgREST), upsert does either.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const srv = vi.hoisted(() => ({
  rows: new Map(), log: [], holds: [], holdNext: 0, failNext: 0, hangNext: 0,
  delays: null, calls: 0, inFlight: 0, maxInFlight: 0, holdWhen: null,
}));

vi.mock('../../src/data/supabase-client.js', () => {
  const key = (t, id) => `${t}/${id}`;
  function exec(table, op, payload, id) {
    return async () => {
      const rowId = id ?? payload?.id;
      const index = srv.calls++;
      if (srv.hangNext > 0) {
        srv.hangNext--;
        srv.log.push({ table, op, id: rowId, hung: true });
        return new Promise(() => {});
      }
      srv.inFlight++;
      srv.maxInFlight = Math.max(srv.maxInFlight, srv.inFlight);
      try {
        if (srv.delays) await new Promise(r => setTimeout(r, srv.delays[index] ?? 0));
        if (srv.holdNext > 0) { srv.holdNext--; await new Promise(r => srv.holds.push(r)); }
        if (srv.holdWhen?.(table, rowId)) { srv.holdWhen = null; await new Promise(r => srv.holds.push(r)); }
        if (srv.failNext > 0) {
          srv.failNext--;
          srv.log.push({ table, op, id: rowId, failed: true });
          return { error: { message: 'new row violates row-level security policy (42501)' } };
        }
        const k = key(table, rowId);
        let data = null;
        if (op === 'insert') {
          if (srv.rows.has(k)) return { error: { code: '23505', message: 'duplicate key value violates unique constraint "x_pkey"' } };
          srv.rows.set(k, { ...payload });
        } else if (op === 'update') {
          data = srv.rows.has(k) ? [{ id: rowId }] : [];
          if (srv.rows.has(k)) srv.rows.set(k, { ...srv.rows.get(k), ...payload });
        } else if (op === 'upsert') {
          srv.rows.set(k, { ...(srv.rows.get(k) || {}), ...payload });
        } else if (op === 'delete') {
          data = srv.rows.has(k) ? [{ id: rowId }] : [];
          srv.rows.delete(k);
        }
        srv.log.push({ table, op, id: rowId, rec: payload ? { ...payload } : null });
        return { error: null, data };
      } finally {
        srv.inFlight--;
      }
    };
  }
  const thenable = fn => ({ then: (a, b) => fn().then(a, b), eq() { return this; }, select() { return this; } });
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } }, error: null }) }, from(table) { return {
    insert: p => thenable(exec(table, 'insert', p)),
    upsert: p => thenable(exec(table, 'upsert', p)),
    update: p => ({ eq: (_c, id) => thenable(exec(table, 'update', p, id)) }),
    delete: () => ({ eq: (_c, id) => thenable(exec(table, 'delete', null, id)) }),
    select: () => ({ gt: async () => ({ data: [] }) }),
  }; } };
  return { supabase };
});

import { CustomSync, SYNC_REQUEST_TIMEOUT_MS } from '../../src/data/custom-sync.js';
import { commitDurableWrite } from '../../src/data/local-storage.js';
import { resetWriteOrderClock } from '../../src/data/write-order.js';
import { _reset, init, setSyncAdapter, add, setUnitSystem } from '../../src/data/store.js';
import * as Operation from '../../src/entities/operation.js';
import { RELEASED_SCHEMA_VERSION } from '../../src/data/schema-release.js';
import { logger } from '../../src/utils/logger.js';

const TABLE = 'event_group_windows';
const WINDOW_ID = 'aaaaaaaa-1111-4000-8000-000000000001';
const OTHER_ID = 'bbbbbbbb-2222-4000-8000-000000000002';
const k = id => `${TABLE}/${id}`;

const joinedLate = {
  id: WINDOW_ID, date_joined: '2026-07-29', time_joined: null, date_left: null, time_left: null,
  updated_at: '2026-07-29T14:00:00.000Z',
};
const openFixed = { ...joinedLate, date_joined: '2026-07-27', updated_at: '2026-07-29T15:00:00.000Z' };
const closedAtClose = { ...openFixed, date_left: '2026-07-27', time_left: '09:00', updated_at: '2026-07-29T15:00:01.000Z' };

const v = (n, sec, id = WINDOW_ID) => ({ id, v: n, updated_at: `2026-11-17T20:00:${String(sec).padStart(2, '0')}.000Z` });

function makeSync() {
  const sync = new CustomSync();
  vi.spyOn(sync, 'isOnline').mockResolvedValue(true);
  return sync;
}
const tick = async (n = 20) => { for (let i = 0; i < n; i++) await Promise.resolve(); };
const sent = id => srv.log.filter(e => e.id === id && !e.failed && !e.hung);
const deadLetters = () => JSON.parse(localStorage.getItem('_dead_letter_queue') || '[]');
const queued = () => JSON.parse(localStorage.getItem('_sync_queue') || '[]');

beforeEach(() => {
  localStorage.clear();
  resetWriteOrderClock();
  Object.assign(srv, { holdNext: 0, failNext: 0, hangNext: 0, delays: null, calls: 0, inFlight: 0, maxInFlight: 0, holdWhen: null });
  srv.rows.clear(); srv.log.length = 0; srv.holds.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('per-row sync ordering: acceptance vectors', () => {
  it('A1: one-tap fix then close, fix delayed; server ends closed with the newest updated_at', async () => {
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), { ...joinedLate });
    srv.holdNext = 1;
    const fix = sync.push(TABLE, openFixed, 'update');
    await tick();
    const close = sync.push(TABLE, closedAtClose, 'update');
    await tick();
    // The close waits behind the delayed fix: only one request has started.
    expect(srv.calls).toBe(1);
    srv.holds.forEach(r => r());
    await Promise.all([fix, close]);

    expect(srv.rows.get(k(WINDOW_ID))).toEqual(closedAtClose);
    expect(sent(WINDOW_ID).map(e => e.rec.updated_at)).toEqual([openFixed.updated_at, closedAtClose.updated_at]);
  });

  it('ten rapid updates with randomised delays: server ends with the last local value', async () => {
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), v(-1, 0));
    srv.delays = [45, 8, 70, 12, 55, 18, 90, 22, 6, 35];
    const rows = Array.from({ length: 10 }, (_, i) => v(i, i + 1));
    await Promise.all(rows.map(row => sync.push(TABLE, row, 'update')));
    expect(srv.rows.get(k(WINDOW_ID))).toEqual(rows[9]);
    expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('writes to different rows are not serialised behind each other', async () => {
    const sync = makeSync();
    srv.holdNext = 2;
    const pending = Promise.all([
      sync.push(TABLE, v('a', 1, WINDOW_ID), 'upsert'),
      sync.push(TABLE, v('b', 1, OTHER_ID), 'upsert'),
    ]);
    await vi.waitFor(() => expect(srv.holds).toHaveLength(2));
    expect(srv.maxInFlight).toBe(2);
    srv.holds.forEach(r => r());
    await pending;
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe('a');
    expect(srv.rows.get(k(OTHER_ID)).v).toBe('b');
  });

  it('offline: fix and close are both queued in order, then reconnect leaves the server closed', async () => {
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), { ...joinedLate });
    sync.isOnline.mockResolvedValue(false);
    await sync.push(TABLE, openFixed, 'update');
    await sync.push(TABLE, closedAtClose, 'update');
    expect(sync.getQueuedItems().map(e => e.record)).toEqual([openFixed, closedAtClose]);

    sync.isOnline.mockResolvedValue(true);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID))).toEqual(closedAtClose);
    expect(sent(WINDOW_ID).map(e => e.rec.updated_at)).toEqual([openFixed.updated_at, closedAtClose.updated_at]);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('flush waits for an in-flight push of the same row and then sends the journalled close', async () => {
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), { ...joinedLate });
    srv.holdNext = 1;
    const fix = sync.push(TABLE, openFixed, 'update');
    await tick();
    commitDurableWrite(JSON.stringify(['op', 'move', 'close', 1]), { eventGroupWindows: [{ id: WINDOW_ID }] },
      [{ table: TABLE, record: closedAtClose, operation: 'update' }], WINDOW_ID);
    const flushing = sync.flush();
    await tick();
    expect(srv.calls).toBe(1);
    srv.holds.forEach(r => r());
    await Promise.all([fix, flushing]);
    expect(srv.rows.get(k(WINDOW_ID))).toEqual(closedAtClose);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });
});

describe('chain-only: every version goes out, nothing is merged', () => {
  it('an offline insert then update are both queued and sent in order', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    await sync.push(TABLE, v(1, 0), 'insert');
    await sync.push(TABLE, v(2, 5), 'update');
    expect(sync.getQueuedItems().map(e => e.operation)).toEqual(['insert', 'update']);
    sync.isOnline.mockResolvedValue(true);
    await sync.flush();
    expect(sent(WINDOW_ID).map(e => [e.op, e.rec.v])).toEqual([['insert', 1], ['update', 2]]);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
  });

  it('a durable-queued new row edited online before flush still reaches the server with the edit', async () => {
    const sync = makeSync();
    commitDurableWrite(JSON.stringify(['op', 'feed-check', 'c1', 1]), { eventGroupWindows: [{ id: WINDOW_ID }] },
      [{ table: TABLE, record: v(1, 0), operation: 'insert' }], WINDOW_ID);
    await sync.push(TABLE, v(2, 5), 'update');
    expect(srv.rows.get(k(WINDOW_ID))?.v).toBe(2);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID))?.v).toBe(2);
    // Queue-first: both versions go out from the queue, in order.
    expect(sent(WINDOW_ID).map(e => [e.op, e.rec.v])).toEqual([['upsert', 1], ['update', 2]]);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('a failed queued insert does not leave a later update matching nothing', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    await sync.push(TABLE, v(1, 0), 'insert');
    await sync.push(TABLE, v(2, 5), 'update');
    sync.isOnline.mockResolvedValue(true);
    vi.useFakeTimers();
    srv.failNext = 5;
    const f = sync.flush();
    await vi.runAllTimersAsync();
    await f;
    expect(srv.rows.get(k(WINDOW_ID))?.v).toBe(2);
  });

  it('operations: offline onboarding insert then unit-system change keeps the compiled schema_version stamp', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    _reset(); init(); setSyncAdapter(sync);
    const op = Operation.create({ name: 'Farm', unitSystem: 'imperial' });
    add('operations', op, Operation.validate, Operation.toOnboardingSupabaseShape, 'operations');
    setUnitSystem('metric');
    await vi.waitFor(() => expect(sync.getQueuedItems()).toHaveLength(2));
    sync.isOnline.mockResolvedValue(true);
    await sync.flush();
    const row = srv.rows.get(`operations/${op.id}`);
    expect(row.unit_system).toBe('metric');
    expect(row.schema_version).toBe(RELEASED_SCHEMA_VERSION);
    _reset();
  });

  it('operations: a queued insert edited online before flush is created with the compiled stamp', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    const op = { id: 'op-1', name: 'Farm', unit_system: 'imperial', updated_at: '2026-11-17T20:00:00.000Z' };
    await sync.push('operations', op, 'insert');
    sync.isOnline.mockResolvedValue(true);
    await sync.push('operations', { ...op, unit_system: 'metric', updated_at: '2026-11-17T20:00:01.000Z' }, 'update');
    await sync.flush();
    const row = srv.rows.get('operations/op-1');
    expect(row.unit_system).toBe('metric');
    expect(row.schema_version).toBe(RELEASED_SCHEMA_VERSION);
  });
});

describe('newest sent stamp: an older payload never lands last', () => {
  it('flush snapshot: a save made during a flush goes out after the older queued copy; the server ends at the newer', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: OTHER_ID, table: TABLE, operation: 'upsert', record: v(1, 0, OTHER_ID), attempts: 0, errors: [] },
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(1, 0), attempts: 0, errors: [] },
    ]));
    srv.holdNext = 1;
    const f = sync.flush();
    await tick();
    // Queue-first: the new save waits for the follow-up pass, behind the snapshot.
    const newer = sync.push(TABLE, v(2, 9), 'upsert');
    srv.holds.forEach(r => r());
    await f;
    await newer;
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([1, 2]);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('a persisted queue holding a newer version before an older one ends at the newer', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(2, 9), attempts: 0, errors: [] },
      { id: WINDOW_ID, table: TABLE, operation: 'push', record: v(1, 0), attempts: 0, errors: [] },
    ]));
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('an equal updated_at is not treated as older and is still sent', async () => {
    const sync = makeSync();
    await sync.push(TABLE, v(1, 5), 'upsert');
    await sync.push(TABLE, { ...v(2, 5) }, 'upsert');
    expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([1, 2]);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
  });
});

describe('dead letters go through the row chain and never overwrite a newer row', () => {
  it('an earlier push dead-letters, a later one succeeds; the drain does not restore the earlier one', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), v(0, 0));
    srv.failNext = 5;
    const a = sync.push(TABLE, v(1, 1), 'update');
    await tick();
    const b = sync.push(TABLE, v(2, 2), 'update');
    await vi.runAllTimersAsync();
    await Promise.all([a, b]);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(deadLetters()).toHaveLength(0);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
  });

  it('pool-write path: one-tap fix push dead-letters, the journalled close succeeds, the drain does not restore the fix', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), { ...joinedLate });
    srv.failNext = 5;
    const fix = sync.push(TABLE, openFixed, 'update');
    await vi.runAllTimersAsync();
    await fix;
    expect(deadLetters()).toHaveLength(1);

    commitDurableWrite(JSON.stringify(['op', 'move', 'close', 1]), { eventGroupWindows: [{ id: WINDOW_ID }] },
      [{ table: TABLE, record: closedAtClose, operation: 'update' }], WINDOW_ID);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).date_left).toBe('2026-07-27');
    expect(deadLetters()).toHaveLength(0);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID))).toEqual(closedAtClose);
  });

  it('the drain waits for an in-flight newer push of the row and then drops the stale letter', async () => {
    const sync = makeSync();
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, record: v(1, 1), error: 'x', retry_count: 5, dead_lettered_at: '2026-11-17T20:00:01.500Z' },
    ]));
    srv.holdNext = 1;
    const newer = sync.push(TABLE, v(2, 2), 'upsert');
    await tick();
    const f = sync.flush();
    await tick();
    expect(srv.calls).toBe(1);
    srv.holds.forEach(r => r());
    await Promise.all([newer, f]);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([2]);
    expect(deadLetters()).toHaveLength(0);
  });

  it('a letter with nothing newer still auto-drains (dead-letter recovery unchanged)', async () => {
    const sync = makeSync();
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, record: v(1, 1), error: 'x', retry_count: 5, dead_lettered_at: '2026-11-17T20:00:01.500Z' },
    ]));
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(1);
    expect(deadLetters()).toHaveLength(0);
  });

  it('manual retry keeps only the newest letter per row; ties go to the later letter', async () => {
    const sync = makeSync();
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, record: v(2, 9), dead_lettered_at: 'a' },
      { id: WINDOW_ID, table: TABLE, record: v(1, 0), dead_lettered_at: 'b' },
      { id: OTHER_ID, table: TABLE, record: v('first', 3, OTHER_ID), dead_lettered_at: 'c' },
      { id: OTHER_ID, table: TABLE, record: v('second', 3, OTHER_ID), dead_lettered_at: 'd' },
    ]));
    sync.retryDeadLetters();
    expect(queued().map(e => e.record.v)).toEqual([2, 'second']);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(srv.rows.get(k(OTHER_ID)).v).toBe('second');
  });

  it('manual retry does not queue a letter behind a newer queued write of the same row', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(2, 9), attempts: 0, errors: [] },
    ]));
    localStorage.setItem('_dead_letter_queue', JSON.stringify([{ id: WINDOW_ID, table: TABLE, record: v(1, 0) }]));
    sync.retryDeadLetters();
    expect(queued().map(e => e.record.v)).toEqual([2]);
    await sync.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
  });
});

describe('deletes join the row chain', () => {
  it('an in-flight save does not bring the row back after an online delete', async () => {
    const sync = makeSync();
    srv.holdNext = 1;
    const up = sync.push(TABLE, v(1, 0), 'insert');
    await tick();
    const del = sync.delete(TABLE, WINDOW_ID);
    await tick();
    expect(srv.calls).toBe(1);
    srv.holds.forEach(r => r());
    await Promise.all([up, del]);
    expect(srv.rows.has(k(WINDOW_ID))).toBe(false);
    expect(srv.log.map(e => e.op)).toEqual(['insert', 'delete']);
  });

  it('pending saves are dropped, queued saves and dead letters cleared, and older saves stay out', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(3, 3), attempts: 0, errors: [] },
    ]));
    localStorage.setItem('_dead_letter_queue', JSON.stringify([{ id: WINDOW_ID, table: TABLE, record: v(0, 0) }]));
    srv.holdNext = 1;
    const first = sync.push(TABLE, v(1, 1), 'upsert');
    await tick();
    const pendingSave = sync.push(TABLE, v(2, 2), 'upsert');
    const del = sync.delete(TABLE, WINDOW_ID);
    srv.holds.forEach(r => r());
    await Promise.all([first, pendingSave, del]);
    // Queue-first: the persisted v3 goes out first; v1 and v2 are older and dropped.
    expect(srv.log.map(e => [e.op, e.rec?.v ?? null])).toEqual([['upsert', 3], ['delete', null]]);
    expect(queued()).toHaveLength(0);
    expect(deadLetters()).toHaveLength(0);
    await sync.push(TABLE, v(3, 3), 'upsert');
    await sync.flush();
    expect(srv.rows.has(k(WINDOW_ID))).toBe(false);
  });
});

describe('request timeout', () => {
  it('a hung request times out as a failure, so the row and later writes are not blocked', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.hangNext = 1;
    const first = sync.push(TABLE, v(1, 1), 'upsert');
    await tick();
    let done = false;
    const second = sync.push(TABLE, v(2, 2), 'upsert').then(r => { done = true; return r; });
    await vi.advanceTimersByTimeAsync(SYNC_REQUEST_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    await vi.runAllTimersAsync();
    await Promise.all([first, second]);
    expect(done).toBe(true);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(srv.log.map(e => (e.hung ? 'hung' : e.rec.v))).toEqual(['hung', 1, 2]);
  }, 10_000);

  it('a request that hangs on every attempt ends in the dead-letter queue', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.hangNext = 5;
    const p = sync.push(TABLE, v(1, 1), 'upsert');
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/timed out/);
    expect(deadLetters()).toHaveLength(1);
  }, 10_000);

  it('uses a named 15 s timeout', () => {
    expect(SYNC_REQUEST_TIMEOUT_MS).toBe(15_000);
  });
});

describe('row gate bookkeeping', () => {
  it('drops a row gate once its chain goes idle', async () => {
    const sync = makeSync();
    srv.holdNext = 1;
    const a = sync.push(TABLE, v(1, 1), 'upsert');
    const b = sync.push(TABLE, v(2, 2), 'upsert');
    await tick();
    expect(sync._rowGates.size).toBe(1);
    srv.holds.forEach(r => r());
    await Promise.all([a, b]);
    await tick();
    expect(sync._rowGates.size).toBe(0);
  });
});

describe('persisted state is pruned on success, so nothing stale survives a reload', () => {
  it('a queued save that failed in flush is not resent by a fresh adapter after a newer save landed', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), v(0, 0));
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(1, 1), enqueued_at: '2026-11-17T20:00:01.000Z', attempts: 0, errors: [] },
    ]));
    srv.failNext = 5;
    const f = sync.flush();
    await tick();
    const newer = sync.push(TABLE, v(2, 5), 'update');
    await vi.runAllTimersAsync();
    await Promise.all([f, newer]);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(queued()).toEqual([]);
    expect(deadLetters()).toEqual([]);

    const reloaded = makeSync();
    await reloaded.flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([2]);
  });

  it('flush does not write back a failed save when a newer save of the row landed before the write-back', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(1, 1), enqueued_at: '2026-11-17T20:00:01.000Z', attempts: 0, errors: [] },
      { id: OTHER_ID, table: 'events', operation: 'upsert', record: v('e', 1, OTHER_ID), enqueued_at: '2026-11-17T20:00:01.000Z', attempts: 0, errors: [] },
    ]));
    srv.failNext = 5;
    srv.holdWhen = table => table === 'events';
    const f = sync.flush();
    await tick();
    const newer = sync.push(TABLE, v(2, 5), 'update');
    await vi.runAllTimersAsync();
    await newer;
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    srv.holds.forEach(r => r()); // the flush only now reaches its write-back
    await f;
    expect(queued()).toEqual([]);
    await makeSync().flush();
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
  });

  it('a successful send removes that row\'s older queued saves from storage at once', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(3, 9), enqueued_at: '2026-11-17T20:00:09.000Z', attempts: 0, errors: [] },
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(1, 1), enqueued_at: '2026-11-17T20:00:01.000Z', attempts: 0, errors: [] },
      { id: OTHER_ID, table: TABLE, operation: 'upsert', record: v(1, 1, OTHER_ID), enqueued_at: '2026-11-17T20:00:01.000Z', attempts: 0, errors: [] },
    ]));
    srv.holdWhen = (_table, id) => id === OTHER_ID;
    const f = sync.flush();
    await vi.waitFor(() => expect(sent(WINDOW_ID).map(e => e.rec.v)).toEqual([3]));
    // The other row is still in flight; the sent v3 and its older v1 are already out of storage.
    expect(queued().map(e => [e.id, e.record.v])).toEqual([[OTHER_ID, 1]]);
    srv.holds.forEach(r => r());
    await f;
    expect(queued()).toEqual([]);
  });

  it('dead letters stay cleared after an online delete, across a reload', async () => {
    const sync = makeSync();
    srv.rows.set(k(WINDOW_ID), v(0, 0));
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, record: v(1, 1), dead_lettered_at: '2026-11-17T20:00:01.500Z' },
    ]));
    await sync.delete(TABLE, WINDOW_ID);
    expect(deadLetters()).toEqual([]);
    const reloaded = makeSync();
    await reloaded.flush();
    expect(srv.rows.has(k(WINDOW_ID))).toBe(false);
  });
});

describe('rows with no updated_at use write order', () => {
  const IT = 'event_feed_check_items';
  const ik = id => `${IT}/${id}`;
  const item = (remaining, id = WINDOW_ID) => ({ id, remaining });

  it('feed-check correction: failed first save is dead-lettered, the correction lands, the drain does not restore it', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.rows.set(ik(WINDOW_ID), item(2.25));
    srv.failNext = 5;
    const first = sync.push(IT, item(1.5), 'upsert');
    await vi.runAllTimersAsync();
    await first;
    expect(deadLetters()).toHaveLength(1);
    await sync.push(IT, item(0.75), 'upsert');
    expect(deadLetters()).toEqual([]);
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    await makeSync().flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('a correction issued while the first save is still retrying clears the first save\'s dead letter', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.rows.set(ik(WINDOW_ID), item(2.25));
    srv.failNext = 5;
    const first = sync.push(IT, item(1.5), 'upsert');
    await tick();
    const correction = sync.push(IT, item(0.75), 'upsert');
    await vi.runAllTimersAsync();
    await Promise.all([first, correction]);
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(deadLetters()).toEqual([]);
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('flush snapshot: an unstamped save made during a flush goes out after the older queued copy', async () => {
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: OTHER_ID, table: IT, operation: 'upsert', record: item(9, OTHER_ID), enqueued_at: '2026-11-17T20:00:00.000Z', attempts: 0, errors: [] },
      { id: WINDOW_ID, table: IT, operation: 'upsert', record: item(1.5), enqueued_at: '2026-11-17T20:00:00.000Z', attempts: 0, errors: [] },
    ]));
    srv.holdNext = 1;
    const f = sync.flush();
    await tick();
    const newer = sync.push(IT, item(0.75), 'upsert');
    srv.holds.forEach(r => r());
    await f;
    await newer;
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(sent(WINDOW_ID).map(e => e.rec.remaining)).toEqual([1.5, 0.75]);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('a queued unstamped save that failed in flush is not resent by a fresh adapter', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: IT, operation: 'upsert', record: item(1.5), enqueued_at: '2026-11-17T20:00:00.000Z', attempts: 0, errors: [] },
    ]));
    srv.failNext = 5;
    const f = sync.flush();
    await tick();
    const correction = sync.push(IT, item(0.75), 'upsert');
    await vi.runAllTimersAsync();
    await Promise.all([f, correction]);
    expect(queued()).toEqual([]);
    await makeSync().flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });
});

describe('dead-letter drain leaves a letter alone while a newer save is queued', () => {
  it('the older letter is never sent when the queue still holds a newer save of the row', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, operation: 'upsert', record: v(2, 9), enqueued_at: '2026-11-17T20:00:09.000Z', attempts: 0, errors: [] },
    ]));
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: TABLE, record: v(1, 1), dead_lettered_at: '2026-11-17T20:00:01.500Z' },
    ]));
    srv.failNext = 5; // the queued newer save fails in this flush and is dead-lettered
    const f = sync.flush();
    await vi.runAllTimersAsync();
    await f;
    expect(sent(WINDOW_ID).map(e => e.rec.v)).not.toContain(1);
    // The next flush drains the newer letter; the older one is never sent.
    await sync.flush();
    expect(sent(WINDOW_ID).map(e => e.rec.v)).not.toContain(1);
    expect(srv.rows.get(k(WINDOW_ID)).v).toBe(2);
    expect(deadLetters()).toEqual([]);
  });
});

describe('operations schema stamp on the dead-letter path', () => {
  const op = { id: 'op-2', name: 'Farm', unit_system: 'imperial', updated_at: '2026-11-17T20:00:00.000Z' };

  it('an insert dead-lettered online, then an update sent as upsert, keeps the compiled stamp', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.failNext = 5;
    const first = sync.push('operations', op, 'insert');
    await vi.runAllTimersAsync();
    await first;
    await sync.push('operations', { ...op, unit_system: 'metric', updated_at: '2026-11-17T20:00:01.000Z' }, 'update');
    const row = srv.rows.get('operations/op-2');
    expect(row.unit_system).toBe('metric');
    expect(row.schema_version).toBe(RELEASED_SCHEMA_VERSION);
  });

  it('an insert dead-lettered online keeps the compiled stamp when the drain sends it', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.failNext = 5;
    const first = sync.push('operations', op, 'insert');
    await vi.runAllTimersAsync();
    await first;
    await sync.flush();
    expect(srv.rows.get('operations/op-2').schema_version).toBe(RELEASED_SCHEMA_VERSION);
  });

  it('an insert dead-lettered online keeps the compiled stamp through manual retry', async () => {
    vi.useFakeTimers();
    const sync = makeSync();
    srv.failNext = 5;
    const first = sync.push('operations', op, 'insert');
    await vi.runAllTimersAsync();
    await first;
    sync.retryDeadLetters();
    await sync.flush();
    expect(srv.rows.get('operations/op-2').schema_version).toBe(RELEASED_SCHEMA_VERSION);
  });
});

describe('write-order clock (rows with no updated_at)', () => {
  const IT = 'event_feed_check_items';
  const ik = id => `${IT}/${id}`;
  const T0 = Date.parse('2026-11-17T21:00:00.000Z');
  const durableItem = (key, remaining, operation) => commitDurableWrite(JSON.stringify(['op', 'feed-check', key, 1]),
    { eventFeedCheckItems: [{ id: WINDOW_ID }] }, [{ table: IT, record: { id: WINDOW_ID, remaining }, operation }], WINDOW_ID);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  it('the device clock stepping back 60 s mid-session does not drop the newer save', async () => {
    const sync = makeSync();
    await sync.push(IT, { id: WINDOW_ID, remaining: 2.25 }, 'upsert');
    vi.setSystemTime(T0 - 60_000);
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('a forward jump corrected between two offline saves still ends at the newer save', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    vi.setSystemTime(T0 + 86_400_000);
    await sync.push(IT, { id: WINDOW_ID, remaining: 2.25 }, 'upsert');
    vi.setSystemTime(T0);
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    sync.isOnline.mockResolvedValue(true);
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('after a small backward step, a newer durable save is not dropped against an earlier live push', async () => {
    const sync = makeSync();
    await sync.push(IT, { id: WINDOW_ID, remaining: 2.25 }, 'upsert');
    vi.setSystemTime(T0 - 500);
    durableItem('c5', 0.75, 'update');
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('a durable save and a newer live push in the same millisecond: the older durable copy never lands last', async () => {
    const sync = makeSync();
    durableItem('c6', 2.25, 'insert');
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'update');
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(queued()).toEqual([]);
  });

  it('a reload after the clock stepped back 60 s: the post-reload save is still the newest', async () => {
    const before = makeSync();
    before.isOnline.mockResolvedValue(false);
    await before.push(IT, { id: WINDOW_ID, remaining: 2.25 }, 'upsert');
    vi.setSystemTime(T0 - 60_000);
    resetWriteOrderClock(); // reload: the clock re-seeds from storage
    const after = makeSync();
    await after.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    expect(queued()).toEqual([]);
    await after.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('manual retry re-queues a letter with its original write order, so a later offline save is sent after it', async () => {
    const sync = makeSync();
    srv.failNext = 5;
    const first = sync.push(IT, { id: WINDOW_ID, remaining: 2.25 }, 'upsert');
    await vi.runAllTimersAsync();
    await first;
    const origin = deadLetters()[0].origin_at;
    expect(origin).toBe(new Date(T0).toISOString());
    sync.retryDeadLetters();
    expect(queued()[0].enqueued_at).toBe(origin);
    vi.setSystemTime(T0 + 60_000);
    sync.isOnline.mockResolvedValue(false);
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    sync.isOnline.mockResolvedValue(true);
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
  });

  it('a drained letter records its write order as sent, so an older queued save is dropped afterwards', async () => {
    const sync = makeSync();
    localStorage.setItem('_dead_letter_queue', JSON.stringify([
      { id: WINDOW_ID, table: IT, record: { id: WINDOW_ID, remaining: 0.75 }, origin_at: new Date(T0 - 1000).toISOString(), dead_lettered_at: new Date(T0 - 500).toISOString() },
    ]));
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    localStorage.setItem('_sync_queue', JSON.stringify([
      { id: WINDOW_ID, table: IT, operation: 'upsert', record: { id: WINDOW_ID, remaining: 2.25 }, enqueued_at: new Date(T0 - 2000).toISOString(), attempts: 0, errors: [] },
    ]));
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(sent(WINDOW_ID).map(e => e.rec.remaining)).toEqual([0.75]);
  });

  const staleLetter = extra => ({ id: WINDOW_ID, table: IT, record: { id: WINDOW_ID, remaining: 2.25 }, error: 'x', retry_count: 5,
    dead_lettered_at: new Date(T0).toISOString(), ...extra });

  it('a reload after a 60 s backward step with only a stale dead letter: the post-reload save clears it and the drain does not restore it', async () => {
    localStorage.setItem('_dead_letter_queue', JSON.stringify([staleLetter({ origin_at: new Date(T0).toISOString() })]));
    vi.setSystemTime(T0 - 60_000);
    resetWriteOrderClock(); // reload: the clock re-seeds from storage, dead letters included
    const sync = makeSync();
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(deadLetters()).toEqual([]);
  });

  it('the same with a legacy dead letter (no origin_at): the seed falls back to dead_lettered_at', async () => {
    localStorage.setItem('_dead_letter_queue', JSON.stringify([staleLetter()]));
    vi.setSystemTime(T0 - 60_000);
    resetWriteOrderClock();
    const sync = makeSync();
    await sync.push(IT, { id: WINDOW_ID, remaining: 0.75 }, 'upsert');
    await sync.flush();
    expect(srv.rows.get(ik(WINDOW_ID)).remaining).toBe(0.75);
    expect(deadLetters()).toEqual([]);
  });

  it('two commands in one durable save get strictly increasing write order', () => {
    commitDurableWrite(JSON.stringify(['op', 'feed-check', 'd6', 1]), { eventFeedCheckItems: [{ id: WINDOW_ID }] }, [
      { table: IT, record: { id: WINDOW_ID, remaining: 1 }, operation: 'insert' },
      { table: IT, record: { id: OTHER_ID, remaining: 2 }, operation: 'insert' },
    ], WINDOW_ID);
    const [a, b] = queued().map(e => Date.parse(e.enqueued_at));
    expect(b).toBeGreaterThan(a);
  });
});
