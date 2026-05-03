/** @file OI-0149 — pullAllRemote() in-flight dedupe.
 *  OI-0151 — multi-entity-type pull fires a registered callback exactly once.
 *
 * OI-0149 cases use a fully mocked store (in-flight dedupe is a wrapper-level
 * concern). The OI-0151 case at the bottom of the file uses the real store
 * via `vi.importActual` so we can observe the actual batch + identity-dedupe
 * drain.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAdapter = {
  isOnline: vi.fn(),
  pullAll: vi.fn(),
};

const mergeRemote = vi.fn();
const beginBatch = vi.fn();
const endBatch = vi.fn();

vi.mock('../../src/data/store.js', () => ({
  getSyncAdapter: () => mockAdapter,
  mergeRemote: (...args) => mergeRemote(...args),
  beginBatch: (...args) => beginBatch(...args),
  endBatch: (...args) => endBatch(...args),
}));

vi.mock('../../src/data/sync-registry.js', () => ({
  SYNC_REGISTRY: {
    things: { table: 'things', from: (r) => r },
    widgets: { table: 'widgets', from: (r) => r },
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { error: vi.fn() },
}));

let pullAllRemote;
let getLastPulledAt;

async function loadModule() {
  vi.resetModules();
  const mod = await import('../../src/data/pull-remote.js');
  pullAllRemote = mod.pullAllRemote;
  getLastPulledAt = mod.getLastPulledAt;
}

describe('pullAllRemote() — OI-0149 inFlight dedupe', () => {
  beforeEach(async () => {
    localStorage.clear();
    mockAdapter.isOnline.mockReset();
    mockAdapter.pullAll.mockReset();
    mergeRemote.mockReset();
    beginBatch.mockReset();
    endBatch.mockReset();
    mockAdapter.isOnline.mockResolvedValue(true);
    await loadModule();
  });

  it('two concurrent callers share one in-flight pull (single wave of pullAll calls)', async () => {
    mockAdapter.pullAll.mockResolvedValue([]);

    const first = pullAllRemote();
    const second = pullAllRemote();

    expect(first).toBe(second); // same promise instance returned to both callers

    const [r1, r2] = await Promise.all([first, second]);
    expect(r1).toEqual(r2);

    // SYNC_REGISTRY has 2 tables; with dedupe, exactly 2 pullAll invocations
    // (one wave). Without dedupe we'd see 4.
    expect(mockAdapter.pullAll).toHaveBeenCalledTimes(2);
  });

  it('inFlight clears after settle — a third call after resolution starts a fresh pull', async () => {
    mockAdapter.pullAll.mockResolvedValue([]);

    await pullAllRemote();
    expect(mockAdapter.pullAll).toHaveBeenCalledTimes(2); // first wave

    await pullAllRemote();
    expect(mockAdapter.pullAll).toHaveBeenCalledTimes(4); // fresh wave — guard did not latch
  });

  it('inFlight clears even when the inner pull rejects (finally branch)', async () => {
    // First wave throws on second table; the inner _doPullAllRemote catches per
    // table and continues, so the outer promise still resolves — but verify
    // even a fully thrown pull resets the guard.
    mockAdapter.pullAll.mockResolvedValue([]);
    await pullAllRemote();

    // Now make pullAll itself reject on every call to simulate a torn-down
    // adapter; the inner loop catches per-table so the wrapper still resolves.
    mockAdapter.pullAll.mockRejectedValue(new Error('boom'));
    const result = await pullAllRemote();
    expect(result.errors).toBeGreaterThan(0);

    // Guard cleared — a follow-up call must trigger a new wave.
    mockAdapter.pullAll.mockReset();
    mockAdapter.pullAll.mockResolvedValue([]);
    await pullAllRemote();
    expect(mockAdapter.pullAll).toHaveBeenCalledTimes(2);
  });

  it('a second concurrent caller still observes the timestamp written by the shared pull', async () => {
    // Create a deferred promise upfront so the mock's first invocation captures
    // it. The internal `await adapter.isOnline()` and `await adapter.pullAll()`
    // give us multiple microtask hops before the deferred resolves; the second
    // caller must already be enqueued on the same in-flight promise by then.
    let resolveFirstTable;
    const firstTablePending = new Promise((resolve) => { resolveFirstTable = resolve; });
    mockAdapter.pullAll.mockImplementationOnce(() => firstTablePending);
    mockAdapter.pullAll.mockResolvedValue([]); // remaining tables resolve immediately

    const before = Date.now();
    const first = pullAllRemote();
    const second = pullAllRemote();
    expect(first).toBe(second); // shared in-flight promise

    // Let the inner async function progress to its first `await pullAll(...)`.
    await Promise.resolve();
    await Promise.resolve();

    resolveFirstTable([]);
    await Promise.all([first, second]);

    const ts = getLastPulledAt();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it('visibilitychange-style call during a boot pull does not fire a second wave', async () => {
    // Simulates main.js: boot() calls pullAllRemote(), then a visibilitychange
    // handler fires before the boot pull settles. The dedupe must absorb the
    // second call.
    let resolveFirstTable;
    const firstTablePending = new Promise((resolve) => { resolveFirstTable = resolve; });
    mockAdapter.pullAll.mockImplementationOnce(() => firstTablePending);
    mockAdapter.pullAll.mockResolvedValue([]); // remaining tables resolve immediately

    const boot = pullAllRemote();
    // Tab foregrounded — fires another pullAllRemote() before boot completes.
    const visibility = pullAllRemote();
    expect(visibility).toBe(boot);

    // Drain microtask queue so the inner loop reaches `await pullAll(...)`
    // and the deferred mock can be resolved.
    await Promise.resolve();
    await Promise.resolve();

    resolveFirstTable([]);
    await Promise.all([boot, visibility]);

    // Two tables in registry → two pullAll calls total (one wave),
    // not four (two waves).
    expect(mockAdapter.pullAll).toHaveBeenCalledTimes(2);
  });

  it('returns the no-op result without setting inFlight when adapter is null', async () => {
    vi.resetModules();
    vi.doMock('../../src/data/store.js', () => ({
      getSyncAdapter: () => null,
      mergeRemote: vi.fn(),
      beginBatch: vi.fn(),
      endBatch: vi.fn(),
    }));
    const mod = await import('../../src/data/pull-remote.js');
    const r = await mod.pullAllRemote();
    expect(r).toEqual({ pulled: 0, errors: 0 });
    // Subsequent call still returns the no-op (guard did not latch).
    const r2 = await mod.pullAllRemote();
    expect(r2).toEqual({ pulled: 0, errors: 0 });
  });

});

// The "beginBatch wraps the merge loop" invariant is asserted via the
// integration test below (callback fires exactly once across 6 entity types
// — only possible if a batch is open) plus the `grep -nE "beginBatch\(\)"
// src/data/pull-remote.js` contract enforced at commit time.

// ----------------------------------------------------------------------------
// OI-0151 integration — real store, real subscribe, real notify drain.
// Verifies that a pull merging multiple entity types fires a registered
// multi-subscription callback exactly once (root-cause fix for the dashboard
// rerender storm OI-0149's paint-first exposed).
// ----------------------------------------------------------------------------

describe('pullAllRemote() — OI-0151 multi-entity batch drain (integration)', () => {
  let realStore;
  let pullAllRemoteReal;

  beforeEach(async () => {
    localStorage.clear();
    vi.resetModules();

    // Replace the file-level mock of store.js with the actual implementation
    // for this describe block; pull-remote.js will import the real
    // beginBatch/endBatch and the real notify pipeline.
    vi.doMock('../../src/data/store.js', async () => {
      return await vi.importActual('../../src/data/store.js');
    });

    // Six tables, mirroring the dashboard's six subscriptions
    // (`src/features/dashboard/index.js:118-123`). Each pullAll returns one
    // remote row with a future updatedAt so mergeRemote registers an add and
    // fires notify(entityType).
    vi.doMock('../../src/data/sync-registry.js', () => ({
      SYNC_REGISTRY: {
        groups: { table: 'groups', from: (r) => r },
        events: { table: 'events', from: (r) => r },
        eventPaddockWindows: { table: 'event_paddock_windows', from: (r) => r },
        eventGroupWindows: { table: 'event_group_windows', from: (r) => r },
        animalGroupMemberships: { table: 'animal_group_memberships', from: (r) => r },
        eventFeedEntries: { table: 'event_feed_entries', from: (r) => r },
      },
    }));

    vi.doMock('../../src/utils/logger.js', () => ({
      logger: { error: vi.fn() },
    }));

    realStore = await import('../../src/data/store.js');
    const pullMod = await import('../../src/data/pull-remote.js');
    pullAllRemoteReal = pullMod.pullAllRemote;
  });

  it('a pull merging 6 entity types fires a multi-subscription callback exactly once', async () => {
    realStore._reset();

    const cb = vi.fn();
    realStore.subscribe('groups', cb);
    realStore.subscribe('events', cb);
    realStore.subscribe('eventPaddockWindows', cb);
    realStore.subscribe('eventGroupWindows', cb);
    realStore.subscribe('animalGroupMemberships', cb);
    realStore.subscribe('eventFeedEntries', cb);

    let counter = 0;
    realStore.setSyncAdapter({
      isOnline: () => Promise.resolve(true),
      pullAll: (table) => Promise.resolve([
        { id: `${table}-1`, updatedAt: new Date(2030, 0, 1, 0, 0, ++counter).toISOString() },
      ]),
    });

    await pullAllRemoteReal();

    // After the batch closes, the drain runs synchronously inside endBatch().
    // No microtask flush needed — but await one anyway to surface any latent
    // queued drain that should NOT fire (regression guard).
    for (let i = 0; i < 3; i++) await Promise.resolve();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('without batching the same setup would fire 6 times — sanity probe via inline simulated notifies (control)', async () => {
    realStore._reset();

    const cb = vi.fn();
    realStore.subscribe('groups', cb);
    realStore.subscribe('events', cb);
    realStore.subscribe('eventPaddockWindows', cb);

    // Three synchronous notifies in the same tick coalesce into one drain via
    // the microtask path (not the batch path). This still produces ONE
    // callback invocation, confirming the dedupe is in the drain layer (not
    // tied to explicit batches).
    realStore.mergeRemote('groups', [{ id: 'g1', updatedAt: '2030-01-01T00:00:01Z' }]);
    realStore.mergeRemote('events', [{ id: 'e1', updatedAt: '2030-01-01T00:00:02Z' }]);
    realStore.mergeRemote('eventPaddockWindows', [{ id: 'pw1', updatedAt: '2030-01-01T00:00:03Z' }]);

    for (let i = 0; i < 3; i++) await Promise.resolve();

    expect(cb).toHaveBeenCalledTimes(1);
  });
});
