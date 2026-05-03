/** @file OI-0151 — store batch + microtask coalescing.
 *
 * Two paths share one dirty set + one drain:
 *   - Explicit batch (beginBatch/endBatch) used by `_doPullAllRemote()` and
 *     future bulk producers.
 *   - Microtask coalescing for synchronous notify bursts outside a batch.
 *
 * Drain dedupes callbacks by identity so a multi-subscription consumer fires
 * exactly once per drain. Subscriber errors are caught + logged; sibling
 * callbacks still fire.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  _reset,
  subscribe,
  mergeRemote,
  beginBatch,
  endBatch,
} from '../../src/data/store.js';

// Drain pending microtasks so we observe `queueMicrotask`-scheduled drains.
async function flushMicrotasks() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

// Build a remote record with a strictly-newer updatedAt so mergeRemote keeps
// add/update counts > 0 (the existing `notify(entityType)` gate inside
// mergeRemote only fires when something actually changed).
let stamp = 0;
function rec(id) {
  stamp += 1;
  return { id, updatedAt: new Date(2030, 0, 1, 0, 0, stamp).toISOString() };
}

describe('store batch — OI-0151', () => {
  beforeEach(() => {
    _reset();
    stamp = 0;
  });

  it('a callback registered against six dirty entity types fires exactly once per drain (identity dedupe)', async () => {
    const cb = vi.fn();
    subscribe('groups', cb);
    subscribe('events', cb);
    subscribe('eventPaddockWindows', cb);
    subscribe('eventGroupWindows', cb);
    subscribe('animalGroupMemberships', cb);
    subscribe('eventFeedEntries', cb);

    beginBatch();
    mergeRemote('groups', [rec('g1')]);
    mergeRemote('events', [rec('e1')]);
    mergeRemote('eventPaddockWindows', [rec('pw1')]);
    mergeRemote('eventGroupWindows', [rec('gw1')]);
    mergeRemote('animalGroupMemberships', [rec('m1')]);
    mergeRemote('eventFeedEntries', [rec('fe1')]);
    expect(cb).toHaveBeenCalledTimes(0); // batch open — no drain yet
    endBatch();

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('nested batches: inner endBatch does not drain while outer batch is open', async () => {
    const cb = vi.fn();
    subscribe('events', cb);
    subscribe('groups', cb);

    beginBatch();
    beginBatch();
    mergeRemote('events', [rec('e1')]);
    endBatch(); // inner — depth still > 0
    expect(cb).toHaveBeenCalledTimes(0);

    mergeRemote('groups', [rec('g1')]);
    endBatch(); // outer — drain
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('microtask coalescing outside batch: 3 synchronous notifies in same tick → 1 drain', async () => {
    const cb = vi.fn();
    subscribe('events', cb);
    subscribe('groups', cb);
    subscribe('eventPaddockWindows', cb);

    mergeRemote('events', [rec('e1')]);
    mergeRemote('groups', [rec('g1')]);
    mergeRemote('eventPaddockWindows', [rec('pw1')]);
    expect(cb).toHaveBeenCalledTimes(0); // microtask not yet flushed

    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscriber error inside drain does not break sibling callbacks', async () => {
    const failing = vi.fn(() => { throw new Error('subscriber boom'); });
    const sibling1 = vi.fn();
    const sibling2 = vi.fn();
    subscribe('events', failing);
    subscribe('events', sibling1);
    subscribe('events', sibling2);

    mergeRemote('events', [rec('e1')]);
    await flushMicrotasks();

    expect(failing).toHaveBeenCalledTimes(1);
    expect(sibling1).toHaveBeenCalledTimes(1);
    expect(sibling2).toHaveBeenCalledTimes(1);
  });

  it('endBatch without matching beginBatch is a no-op (does not drain, does not throw)', async () => {
    const cb = vi.fn();
    subscribe('events', cb);

    // Pre-populate the dirty set via an outside-batch notify; the drain is now
    // queued for the next microtask.
    mergeRemote('events', [rec('e1')]);

    // Erroneous endBatch with depth 0 — must not throw and must not drain
    // synchronously (the queued microtask is the only drain that should run).
    expect(() => endBatch()).not.toThrow();
    expect(cb).toHaveBeenCalledTimes(0); // no synchronous drain

    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(1); // microtask drain ran normally
  });

  it('batch + microtask paths share one dirty set: notifies inside batch are not lost if a microtask also fires', async () => {
    const cb = vi.fn();
    subscribe('events', cb);
    subscribe('groups', cb);

    beginBatch();
    mergeRemote('events', [rec('e1')]);
    mergeRemote('groups', [rec('g1')]);
    // Yield a microtask while the batch is still open — drain must not run.
    await flushMicrotasks();
    expect(cb).toHaveBeenCalledTimes(0);
    endBatch();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('a callback registered against only one dirty type fires once (control case)', async () => {
    const cb = vi.fn();
    subscribe('events', cb);

    beginBatch();
    mergeRemote('events', [rec('e1')]);
    mergeRemote('events', [rec('e2')]);
    endBatch();

    expect(cb).toHaveBeenCalledTimes(1);
  });
});
