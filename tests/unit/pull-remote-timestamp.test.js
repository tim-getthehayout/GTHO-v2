/** @file Tests for pullAllRemote() lastPulledAt timestamp tracking (OI-0141) */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let pullAllRemote, getLastPulledAt;

const mockAdapter = {
  isOnline: vi.fn(),
  pullAll: vi.fn(),
};

vi.mock('../../src/data/store.js', () => ({
  getSyncAdapter: () => mockAdapter,
  mergeRemote: vi.fn(),
  // OI-0151: pull-remote.js wraps the merge loop in beginBatch/endBatch.
  beginBatch: vi.fn(),
  endBatch: vi.fn(),
}));

vi.mock('../../src/data/sync-registry.js', () => ({
  SYNC_REGISTRY: {
    things: { table: 'things', from: (r) => r },
  },
}));

vi.mock('../../src/utils/logger.js', () => ({
  logger: { error: vi.fn() },
}));

describe('pull-remote timestamp', () => {
  beforeEach(async () => {
    localStorage.clear();
    mockAdapter.isOnline.mockResolvedValue(true);
    mockAdapter.pullAll.mockResolvedValue([]);
    vi.resetModules();
    const mod = await import('../../src/data/pull-remote.js');
    pullAllRemote = mod.pullAllRemote;
    getLastPulledAt = mod.getLastPulledAt;
  });

  it('getLastPulledAt returns null when no pull has occurred', () => {
    expect(getLastPulledAt()).toBeNull();
  });

  it('records timestamp on successful pull (0 rows, 0 errors)', async () => {
    const before = Date.now();
    await pullAllRemote();
    const ts = getLastPulledAt();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now());
  });

  it('records timestamp on partial success (some rows pulled, some errors)', async () => {
    mockAdapter.pullAll.mockResolvedValueOnce([{ id: '1' }]);
    const before = Date.now();
    await pullAllRemote();
    const ts = getLastPulledAt();
    expect(ts).toBeGreaterThanOrEqual(before);
  });

  it('does not record timestamp when adapter is null', async () => {
    vi.resetModules();
    vi.doMock('../../src/data/store.js', () => ({
      getSyncAdapter: () => null,
      mergeRemote: vi.fn(),
      beginBatch: vi.fn(),
      endBatch: vi.fn(),
    }));
    const mod = await import('../../src/data/pull-remote.js');
    await mod.pullAllRemote();
    expect(mod.getLastPulledAt()).toBeNull();
  });

  it('does not record timestamp when offline', async () => {
    mockAdapter.isOnline.mockResolvedValue(false);
    await pullAllRemote();
    expect(getLastPulledAt()).toBeNull();
  });

  it('persists across module reloads via localStorage', async () => {
    await pullAllRemote();
    const ts1 = getLastPulledAt();
    vi.resetModules();
    const mod2 = await import('../../src/data/pull-remote.js');
    expect(mod2.getLastPulledAt()).toBe(ts1);
  });
});
