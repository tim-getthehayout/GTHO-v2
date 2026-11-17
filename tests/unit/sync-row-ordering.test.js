/**
 * Per-row sync ordering: a later local write to a row must never be
 * overtaken by an earlier one. Covers the window-integrity brief §3 (b)
 * acceptance vectors with invented ids.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CustomSync } from '../../src/data/custom-sync.js';
import { commitDurableWrite } from '../../src/data/local-storage.js';

const TABLE = 'event_group_windows';
const WINDOW_ID = 'aaaaaaaa-1111-4000-8000-000000000001';
const OTHER_ID = 'bbbbbbbb-2222-4000-8000-000000000002';

const openFixed = {
  id: WINDOW_ID,
  date_joined: '2026-07-27',
  time_joined: null,
  date_left: null,
  time_left: null,
  updated_at: '2026-07-29T15:00:00.000Z',
};

const closedAtClose = {
  id: WINDOW_ID,
  date_joined: '2026-07-27',
  time_joined: null,
  date_left: '2026-07-27',
  time_left: '09:00',
  updated_at: '2026-07-29T15:00:01.000Z',
};

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function makeSync() {
  const sync = new CustomSync();
  vi.spyOn(sync, 'isOnline').mockResolvedValue(true);
  return sync;
}

/** Mock _pushToRemote as a last-write-wins server, with optional per-call delay. */
function mockRemote(sync, { delayFor, hold = 'none' } = {}) {
  const server = new Map();
  let inFlight = 0;
  let maxInFlight = 0;
  const started = [];
  const finished = [];
  vi.spyOn(sync, '_pushToRemote').mockImplementation(async (_table, record, _operation) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    const startIndex = started.length;
    let release = () => {};
    const gate = new Promise(resolve => { release = resolve; });
    started.push({ record, release });
    if (delayFor) await wait(delayFor(record, startIndex));
    else if (hold === 'all' || (hold === 'first' && startIndex === 0)) await gate;
    server.set(record.id, { ...record });
    finished.push(record);
    inFlight -= 1;
    return { id: record.id, success: true };
  });
  const releaseAll = () => { for (const item of started) item.release(); };
  return { server, started, finished, maxInFlight: () => maxInFlight, releaseAll };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('per-row sync ordering', () => {
  it('A1: one-tap fix then close, first push delayed, server ends closed with the newest updated_at', async () => {
    const sync = makeSync();
    const { server, started } = mockRemote(sync, { hold: 'first' });

    const first = sync.push(TABLE, openFixed, 'update');
    await vi.waitFor(() => expect(started).toHaveLength(1));

    const second = sync.push(TABLE, closedAtClose, 'update');
    // If the two requests ran in parallel, the mock would already have a
    // second in-flight start. The row gate must keep the close queued.
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toHaveLength(1);

    started[0].release();
    await Promise.all([first, second]);

    expect(server.get(WINDOW_ID)).toEqual(closedAtClose);
    expect(server.get(WINDOW_ID).date_left).toBe('2026-07-27');
    expect(server.get(WINDOW_ID).updated_at).toBe(closedAtClose.updated_at);
    expect(started).toHaveLength(2);
    expect(started[1].record).toEqual(closedAtClose);
  });

  it('A1 race would lose the close if the row gate were removed (mutation)', async () => {
    const sync = makeSync();
    const arrivals = [];
    vi.spyOn(sync, '_pushToRemote').mockImplementation(async (_table, record) => {
      const n = arrivals.length;
      arrivals.push({ record, release: null });
      if (n === 0) {
        await new Promise(resolve => { arrivals[0].release = resolve; });
      }
      return { id: record.id, success: true };
    });

    const first = sync.push(TABLE, openFixed, 'update');
    await vi.waitFor(() => expect(arrivals).toHaveLength(1));
    const second = sync.push(TABLE, closedAtClose, 'update');
    await Promise.resolve();
    await Promise.resolve();
    // With the gate, the delayed first push is still the only one started.
    expect(arrivals).toHaveLength(1);
    arrivals[0].release();
    await Promise.all([first, second]);
    expect(arrivals).toHaveLength(2);
  });

  it('ten rapid updates with randomised delays: server ends with the last local value', async () => {
    const sync = makeSync();
    const delays = [45, 8, 70, 12, 55, 18, 90, 22, 6, 35];
    const { server } = mockRemote(sync, { delayFor: (_record, index) => delays[index] });

    const rows = Array.from({ length: 10 }, (_, i) => ({
      id: WINDOW_ID,
      value: i,
      updated_at: `2026-11-17T20:00:00.${String(i * 10).padStart(3, '0')}Z`,
    }));
    await Promise.all(rows.map(row => sync.push(TABLE, row, 'update')));

    expect(server.get(WINDOW_ID)).toEqual(rows[9]);
    expect(server.get(WINDOW_ID).value).toBe(9);
  });

  it('writes to different rows are not serialised behind each other', async () => {
    const sync = makeSync();
    const { server, maxInFlight, releaseAll, started } = mockRemote(sync, { hold: 'all' });

    const rowA = { id: WINDOW_ID, value: 'a', updated_at: '2026-11-17T20:00:00.000Z' };
    const rowB = { id: OTHER_ID, value: 'b', updated_at: '2026-11-17T20:00:00.000Z' };
    const pending = Promise.all([
      sync.push(TABLE, rowA, 'update'),
      sync.push(TABLE, rowB, 'update'),
    ]);
    await vi.waitFor(() => expect(started).toHaveLength(2));
    expect(maxInFlight()).toBe(2);
    releaseAll();
    await pending;
    expect(server.get(WINDOW_ID)).toEqual(rowA);
    expect(server.get(OTHER_ID)).toEqual(rowB);
  });

  it('offline: fix and close are queued, then reconnect leaves the server closed', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    const { server, releaseAll, started } = mockRemote(sync);

    await sync.push(TABLE, openFixed, 'update');
    await sync.push(TABLE, closedAtClose, 'update');

    const queued = sync.getQueuedItems();
    expect(queued).toHaveLength(1);
    expect(queued[0].table).toBe(TABLE);
    expect(queued[0].record).toEqual(closedAtClose);

    sync.isOnline.mockResolvedValue(true);
    const flushing = sync.flush();
    await vi.waitFor(() => expect(started).toHaveLength(1));
    expect(started[0].record).toEqual(closedAtClose);
    releaseAll();
    await flushing;

    expect(server.get(WINDOW_ID)).toEqual(closedAtClose);
    expect(sync.getQueuedItems()).toHaveLength(0);
  });

  it('flush waits for an in-flight push of the same row and then sends the later close', async () => {
    const sync = makeSync();
    const { server, started } = mockRemote(sync, { hold: 'first' });

    const first = sync.push(TABLE, openFixed, 'update');
    await vi.waitFor(() => expect(started).toHaveLength(1));

    localStorage.setItem('_sync_queue', JSON.stringify([{
      id: WINDOW_ID,
      table: TABLE,
      operation: 'update',
      record: closedAtClose,
      enqueued_at: '2026-07-29T15:00:01.000Z',
      attempts: 0,
      errors: [],
      durable_key: JSON.stringify([['op', 'move', 'close', 1], 0]),
    }]));

    const flushing = sync.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(started).toHaveLength(1);

    started[0].release();
    await Promise.all([first, flushing]);

    expect(server.get(WINDOW_ID)).toEqual(closedAtClose);
    expect(server.get(WINDOW_ID).updated_at).toBe(closedAtClose.updated_at);
  });

  it('same-turn journalled close is adopted so the first send carries the closed row', async () => {
    const sync = makeSync();
    const { server, started, releaseAll } = mockRemote(sync);

    const first = sync.push(TABLE, openFixed, 'update');
    commitDurableWrite(
      JSON.stringify(['op', 'move', 'close', 1]),
      { eventGroupWindows: [{ id: WINDOW_ID }] },
      [{ table: TABLE, record: closedAtClose, operation: 'update' }],
      WINDOW_ID,
    );
    await vi.waitFor(() => expect(started.length).toBeGreaterThan(0));
    releaseAll();
    await first;

    expect(server.get(WINDOW_ID)).toEqual(closedAtClose);
    expect(sync.getQueuedItems().filter(entry => entry.id === WINDOW_ID)).toHaveLength(0);
  });

  it('an unsent insert then update collapse to one upsert of the latest row', async () => {
    const sync = makeSync();
    sync.isOnline.mockResolvedValue(false);
    const created = { id: WINDOW_ID, date_joined: '2026-07-29', updated_at: '2026-07-29T14:00:00.000Z' };
    const updated = { ...created, date_joined: '2026-07-27', updated_at: '2026-07-29T15:00:00.000Z' };

    await sync.push(TABLE, created, 'insert');
    await sync.push(TABLE, updated, 'update');

    const queued = sync.getQueuedItems();
    expect(queued).toHaveLength(1);
    expect(queued[0].operation).toBe('upsert');
    expect(queued[0].record).toEqual(updated);
  });
});
