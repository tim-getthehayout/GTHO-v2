/**
 * @file OI-0184 — Surface + auto-retry failed syncs (dead-letter queue).
 *
 * Covers `CustomSync.getSyncHealth()`, `getQueueLength()`, and the new
 * `_drainDeadLetters` loop wired into `flush()`. Mocks the Supabase client so
 * we can deterministically drive push outcomes and assert the DLQ state.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Stub navigator.onLine so isOnline() returns true by default.
beforeEach(() => {
  Object.defineProperty(global, 'navigator', {
    value: { onLine: true }, writable: true, configurable: true,
  });
  localStorage.clear();
  vi.resetModules();
});

afterEach(() => vi.restoreAllMocks());

/**
 * Build a Supabase client mock whose insert / update / upsert methods return
 * either an error (when `mode = 'fail'`) or success (when `mode = 'ok'`). The
 * mode is stored in a ref so individual cases can flip it mid-test.
 */
function makeSupabaseStub(modeRef) {
  const respond = () => {
    if (modeRef.mode === 'fail') return Promise.resolve({ error: { message: 'simulated push failure' } });
    return Promise.resolve({ error: null, data: [] });
  };
  return {
    from: () => ({
      insert: respond,
      update: () => ({ eq: respond }),
      upsert: respond,
      delete: () => ({ eq: respond }),
      select: () => ({ gt: () => respond() }),
    }),
  };
}

async function loadSync(modeRef) {
  vi.doMock('../../src/data/supabase-client.js', () => ({
    supabase: makeSupabaseStub(modeRef),
  }));
  const { CustomSync } = await import('../../src/data/custom-sync.js');
  return new CustomSync();
}

const TABLE = 'animals';
const RECORD = { id: 'r-1', name: 'Daisy' };

describe('OI-0184 — getSyncHealth contract', () => {
  it('returns idle / zeros on a fresh adapter with empty queues', async () => {
    const mode = { mode: 'ok' };
    const sync = await loadSync(mode);
    const health = sync.getSyncHealth();
    expect(health).toEqual({ status: 'idle', queueLength: 0, deadLetterCount: 0 });
  });

  it('forces status=failed when DLQ is non-empty, regardless of transient _status', async () => {
    const mode = { mode: 'fail' };
    const sync = await loadSync(mode);
    // Drive a failing push — _pushToRemote walks 5 attempts with backoff;
    // patch wait() to no-op so the test finishes quickly.
    vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });
    await sync._pushToRemote(TABLE, RECORD, 'upsert');
    const health = sync.getSyncHealth();
    expect(health.deadLetterCount).toBe(1);
    expect(health.status).toBe('failed');
  });

  it('promotes idle → syncing when the pending queue is non-empty even if _status was idle', async () => {
    const mode = { mode: 'ok' };
    const sync = await loadSync(mode);
    // Pre-seed a pending queue entry directly via localStorage.
    localStorage.setItem('_sync_queue', JSON.stringify([{
      id: 'r-2', operation: 'upsert', table: TABLE,
      record: { id: 'r-2' }, enqueued_at: '', attempts: 0, errors: [],
    }]));
    const health = sync.getSyncHealth();
    expect(health.queueLength).toBe(1);
    expect(health.status).toBe('syncing');
  });
});

describe('OI-0184 — auto-retry dead letters on flush', () => {
  it('drains DLQ on flush when network recovers — heals without user action', async () => {
    const mode = { mode: 'fail' };
    const sync = await loadSync(mode);
    vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });

    // Step 1 — failed push lands in DLQ.
    await sync._pushToRemote(TABLE, RECORD, 'upsert');
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);

    // Step 2 — network recovers and flush auto-drains.
    mode.mode = 'ok';
    await sync.flush();

    const health = sync.getSyncHealth();
    expect(health.deadLetterCount).toBe(0);
    expect(health.queueLength).toBe(0);
    expect(health.status).toBe('idle');
  });

  it('stops auto-retrying after MAX_AUTO_DRAIN failed drains — leaves entry for manual recovery', async () => {
    const mode = { mode: 'fail' };
    const sync = await loadSync(mode);
    vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });

    // Land one record in the DLQ.
    await sync._pushToRemote(TABLE, RECORD, 'upsert');
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);

    // Run flush enough times for the auto-drain count to exceed the ceiling.
    for (let i = 0; i < 5; i++) await sync.flush();

    const letters = sync.getDeadLetters();
    expect(letters.length).toBe(1);
    // The auto_drain_count must have advanced and capped at MAX_AUTO_DRAIN (3).
    expect(letters[0].auto_drain_count).toBeGreaterThanOrEqual(3);
    // The indicator stays red — manual recovery is required from here.
    expect(sync.getSyncHealth().status).toBe('failed');
  });
});

describe('OI-0184 — retryDeadLetters as manual recovery', () => {
  it('moves DLQ entries back to the pending queue (consumed by the indicator tap)', async () => {
    const mode = { mode: 'fail' };
    const sync = await loadSync(mode);
    vi.spyOn(global, 'setTimeout').mockImplementation((cb) => { cb(); return 0; });

    await sync._pushToRemote(TABLE, RECORD, 'upsert');
    expect(sync.getSyncHealth().deadLetterCount).toBe(1);

    sync.retryDeadLetters();
    expect(sync.getSyncHealth().deadLetterCount).toBe(0);
    expect(sync.getQueueLength()).toBe(1);
  });
});

describe('OI-0184 — getQueueLength accessor', () => {
  it('returns 0 when queue is empty', async () => {
    const mode = { mode: 'ok' };
    const sync = await loadSync(mode);
    expect(sync.getQueueLength()).toBe(0);
  });

  it('reflects the localStorage queue length', async () => {
    const mode = { mode: 'ok' };
    const sync = await loadSync(mode);
    localStorage.setItem('_sync_queue', JSON.stringify([{ id: 'a' }, { id: 'b' }]));
    expect(sync.getQueueLength()).toBe(2);
  });
});
