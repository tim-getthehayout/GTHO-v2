/** @file OI-0149 — pullAllRemote() in-flight dedupe.
 *
 * Two concurrent callers (boot + visibilitychange firing on tab foreground,
 * online + visibilitychange firing back-to-back, etc.) must share one in-flight
 * pull rather than fire parallel full-table pulls. After the in-flight pull
 * settles, a fresh call must start a new pull (the guard does not latch).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAdapter = {
  isOnline: vi.fn(),
  pullAll: vi.fn(),
};

const mergeRemote = vi.fn();

vi.mock('../../src/data/store.js', () => ({
  getSyncAdapter: () => mockAdapter,
  mergeRemote: (...args) => mergeRemote(...args),
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
    }));
    const mod = await import('../../src/data/pull-remote.js');
    const r = await mod.pullAllRemote();
    expect(r).toEqual({ pulled: 0, errors: 0 });
    // Subsequent call still returns the no-op (guard did not latch).
    const r2 = await mod.pullAllRemote();
    expect(r2).toEqual({ pulled: 0, errors: 0 });
  });
});
