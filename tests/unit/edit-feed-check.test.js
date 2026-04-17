/** @file Tests for SP-10 §9 Feed Check Edit + Re-snap (OI-0084). */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildLineSequence,
  computeIntervals,
  classifyInvariant,
  commitFeedCheckEdit,
} from '../../src/features/events/edit-feed-check.js';
import { _reset, add, getById, getAll, setSyncAdapter } from '../../src/data/store.js';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const EVENT_ID = '00000000-0000-0000-0000-0000000000bb';
const BATCH = '00000000-0000-0000-0000-0000000000cc';
const LOC = '00000000-0000-0000-0000-0000000000dd';

function mkCheck(id, date) {
  return FeedCheckEntity.create({ id, operationId: OP, eventId: EVENT_ID, date });
}
function mkItem(id, feedCheckId, remainingQuantity) {
  return FeedCheckItemEntity.create({
    id, operationId: OP, feedCheckId,
    batchId: BATCH, locationId: LOC, remainingQuantity,
  });
}

describe('edit-feed-check: buildLineSequence', () => {
  it('orders items by their parent check date ascending', () => {
    const checks = [mkCheck('c2', '2026-04-10'), mkCheck('c1', '2026-04-05'), mkCheck('c3', '2026-04-15')];
    const items = [mkItem('i2', 'c2', 60), mkItem('i1', 'c1', 100), mkItem('i3', 'c3', 30)];
    const seq = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
    });
    expect(seq.map(s => s.itemId)).toEqual(['i1', 'i2', 'i3']);
    expect(seq.map(s => s.remaining)).toEqual([100, 60, 30]);
  });

  it('replaces the edited item value and date when staged', () => {
    const checks = [mkCheck('c1', '2026-04-05'), mkCheck('c2', '2026-04-10')];
    const items = [mkItem('i1', 'c1', 100), mkItem('i2', 'c2', 60)];
    const seq = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
      editedItemId: 'i2', stagedRemaining: 20, stagedDate: '2026-04-12',
    });
    const edited = seq.find(s => s.itemId === 'i2');
    expect(edited.remaining).toBe(20);
    expect(edited.date).toBe('2026-04-12');
    expect(edited.isEdited).toBe(true);
  });

  it('inserts a back-fill check into the sequence at the correct position', () => {
    const checks = [mkCheck('c1', '2026-04-05'), mkCheck('c3', '2026-04-15')];
    const items = [mkItem('i1', 'c1', 100), mkItem('i3', 'c3', 30)];
    const seq = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
      insertCheck: { date: '2026-04-10', remaining: 60 },
    });
    expect(seq.map(s => s.date)).toEqual(['2026-04-05', '2026-04-10', '2026-04-15']);
    expect(seq[1].isEdited).toBe(true);
  });

  it('ignores items on other feed lines', () => {
    const checks = [mkCheck('c1', '2026-04-05')];
    const items = [
      mkItem('i1', 'c1', 100),
      { ...mkItem('i2', 'c1', 50), batchId: 'OTHER-BATCH' },
    ];
    const seq = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
    });
    expect(seq.map(s => s.itemId)).toEqual(['i1']);
  });
});

describe('edit-feed-check: computeIntervals', () => {
  it('subtracts remaining(Ti+1) from remaining(Ti) when no entries', () => {
    const sequence = [
      { date: '2026-04-05', time: '', remaining: 100, isEdited: false },
      { date: '2026-04-10', time: '', remaining: 60, isEdited: false },
    ];
    const intervals = computeIntervals({ sequence, entries: [] });
    expect(intervals).toEqual([{ fromIdx: 0, toIdx: 1, consumed: 40 }]);
  });

  it('counts deliveries strictly after Ti and through Ti+1', () => {
    const sequence = [
      { date: '2026-04-05', time: '', remaining: 100, isEdited: false },
      { date: '2026-04-15', time: '', remaining: 200, isEdited: false },
    ];
    const entries = [
      { date: '2026-04-05', quantity: 50, entryType: 'delivery' }, // boundary: NOT counted (not strictly after Ti)
      { date: '2026-04-10', quantity: 200, entryType: 'delivery' }, // counted
      { date: '2026-04-20', quantity: 30, entryType: 'delivery' }, // out of range
    ];
    const intervals = computeIntervals({ sequence, entries });
    // 100 + 200 - 0 - 200 = 100
    expect(intervals[0].consumed).toBe(100);
  });

  it('subtracts removals', () => {
    const sequence = [
      { date: '2026-04-05', time: '', remaining: 100, isEdited: false },
      { date: '2026-04-15', time: '', remaining: 50, isEdited: false },
    ];
    const entries = [
      { date: '2026-04-10', quantity: 30, entryType: 'removal' },
    ];
    const intervals = computeIntervals({ sequence, entries });
    // 100 + 0 - 30 - 50 = 20
    expect(intervals[0].consumed).toBe(20);
  });

  it('produces negative consumed when feed appears from nowhere', () => {
    const sequence = [
      { date: '2026-04-05', time: '', remaining: 100, isEdited: false },
      { date: '2026-04-15', time: '', remaining: 200, isEdited: false },
    ];
    const intervals = computeIntervals({ sequence, entries: [] });
    expect(intervals[0].consumed).toBe(-100);
  });
});

describe('edit-feed-check: classifyInvariant — Cases A/B/C/D', () => {
  function buildCase(remaining1, edited2, remaining3) {
    const sequence = [
      { date: '2026-04-05', time: '', remaining: remaining1, isEdited: false, itemId: 'i1', checkId: 'c1' },
      { date: '2026-04-10', time: '', remaining: edited2, isEdited: true, itemId: 'i2', checkId: 'c2' },
      { date: '2026-04-15', time: '', remaining: remaining3, isEdited: false, itemId: 'i3', checkId: 'c3' },
    ];
    return sequence;
  }

  it('Case A — benign edit (all intervals ≥ 0) → caseLabel A', () => {
    const sequence = buildCase(100, 55, 30);
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('A');
  });

  it('Case B — later interval breaks (edit too low) → caseLabel B with later break listed', () => {
    const sequence = buildCase(100, 20, 30);
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('B');
    expect(verdict.laterBreaks).toHaveLength(1);
    expect(verdict.laterBreaks[0].fromIdx).toBe(1);
  });

  it('Case C — earlier interval breaks (edit too high) → caseLabel C with earlier break listed', () => {
    const sequence = buildCase(100, 110, 30);
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('C');
    expect(verdict.earlierBreaks).toHaveLength(1);
    expect(verdict.earlierBreaks[0].fromIdx).toBe(0);
  });

  it('Case D back-fill (insert a past check between two existing) — Case A when consistent', () => {
    const checks = [mkCheck('c1', '2026-04-05'), mkCheck('c3', '2026-04-15')];
    const items = [mkItem('i1', 'c1', 100), mkItem('i3', 'c3', 30)];
    const sequence = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
      insertCheck: { date: '2026-04-10', remaining: 60 },
    });
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('A');
  });

  it('Case D back-fill — Case B when the insert breaks the later interval', () => {
    const checks = [mkCheck('c1', '2026-04-05'), mkCheck('c3', '2026-04-15')];
    const items = [mkItem('i1', 'c1', 100), mkItem('i3', 'c3', 80)];
    const sequence = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
      insertCheck: { date: '2026-04-10', remaining: 50 }, // 50 → 80 with no delivery = +30 from nowhere
    });
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('B');
  });

  it('Case D back-fill — Case C when the insert breaks the earlier interval', () => {
    const checks = [mkCheck('c1', '2026-04-05'), mkCheck('c3', '2026-04-15')];
    const items = [mkItem('i1', 'c1', 100), mkItem('i3', 'c3', 30)];
    const sequence = buildLineSequence({
      eventId: EVENT_ID, batchId: BATCH, locationId: LOC,
      allChecks: checks, allItems: items,
      insertCheck: { date: '2026-04-10', remaining: 150 }, // 100 → 150 with no delivery = +50 from nowhere
    });
    const intervals = computeIntervals({ sequence, entries: [] });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('C');
  });

  it('delivery in interval relaxes the constraint', () => {
    const sequence = buildCase(100, 200, 180);
    const entries = [{ date: '2026-04-08', quantity: 150, entryType: 'delivery' }];
    const intervals = computeIntervals({ sequence, entries });
    const verdict = classifyInvariant({ sequence, intervals });
    expect(verdict.caseLabel).toBe('A');
  });
});

describe('edit-feed-check: commitFeedCheckEdit', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('updates the edited item only when nothing else changes', () => {
    const c = mkCheck('c1', '2026-04-05');
    const i = mkItem('i1', 'c1', 100);
    add('eventFeedChecks', c, FeedCheckEntity.validate);
    add('eventFeedCheckItems', i, FeedCheckItemEntity.validate);

    commitFeedCheckEdit({
      check: c, item: i,
      newDate: '2026-04-05', newTime: null, newNotes: null, newRemaining: 80,
      deleteItemIds: [],
      allChecks: getAll('eventFeedChecks'),
      allItems: getAll('eventFeedCheckItems'),
    });

    expect(getById('eventFeedCheckItems', 'i1').remainingQuantity).toBe(80);
    expect(getById('eventFeedChecks', 'c1').date).toBe('2026-04-05');
  });

  it('updates the parent check date/time/notes when those changed', () => {
    const c = mkCheck('c1', '2026-04-05');
    const i = mkItem('i1', 'c1', 100);
    add('eventFeedChecks', c, FeedCheckEntity.validate);
    add('eventFeedCheckItems', i, FeedCheckItemEntity.validate);

    commitFeedCheckEdit({
      check: c, item: i,
      newDate: '2026-04-06', newTime: '10:00', newNotes: 'updated',
      newRemaining: 100,
      deleteItemIds: [],
      allChecks: getAll('eventFeedChecks'),
      allItems: getAll('eventFeedCheckItems'),
    });

    const updated = getById('eventFeedChecks', 'c1');
    expect(updated.date).toBe('2026-04-06');
    expect(updated.time).toBe('10:00');
    expect(updated.notes).toBe('updated');
  });

  it('deletes later check items and orphan parent checks when re-snapping', () => {
    const c1 = mkCheck('c1', '2026-04-05');
    const c2 = mkCheck('c2', '2026-04-10');
    const i1 = mkItem('i1', 'c1', 100);
    const i2 = mkItem('i2', 'c2', 30); // only item on c2 → c2 should be deleted too
    add('eventFeedChecks', c1, FeedCheckEntity.validate);
    add('eventFeedChecks', c2, FeedCheckEntity.validate);
    add('eventFeedCheckItems', i1, FeedCheckItemEntity.validate);
    add('eventFeedCheckItems', i2, FeedCheckItemEntity.validate);

    const result = commitFeedCheckEdit({
      check: c1, item: i1,
      newDate: '2026-04-05', newTime: null, newNotes: null, newRemaining: 20,
      deleteItemIds: ['i2'],
      allChecks: getAll('eventFeedChecks'),
      allItems: getAll('eventFeedCheckItems'),
    });

    expect(getById('eventFeedCheckItems', 'i2')).toBeUndefined();
    expect(getById('eventFeedChecks', 'c2')).toBeUndefined();
    expect(result.deletedItemIds).toEqual(['i2']);
    expect(result.deletedCheckIds).toEqual(['c2']);
    expect(getById('eventFeedCheckItems', 'i1').remainingQuantity).toBe(20);
  });

  it('keeps the parent check when other items remain', () => {
    const c1 = mkCheck('c1', '2026-04-05');
    const c2 = mkCheck('c2', '2026-04-10');
    const i1 = mkItem('i1', 'c1', 100);
    const i2a = mkItem('i2a', 'c2', 30);
    const i2b = { ...mkItem('i2b', 'c2', 50), batchId: 'OTHER-BATCH' };
    add('eventFeedChecks', c1, FeedCheckEntity.validate);
    add('eventFeedChecks', c2, FeedCheckEntity.validate);
    add('eventFeedCheckItems', i1, FeedCheckItemEntity.validate);
    add('eventFeedCheckItems', i2a, FeedCheckItemEntity.validate);
    add('eventFeedCheckItems', i2b, FeedCheckItemEntity.validate);

    commitFeedCheckEdit({
      check: c1, item: i1,
      newDate: '2026-04-05', newTime: null, newNotes: null, newRemaining: 20,
      deleteItemIds: ['i2a'],
      allChecks: getAll('eventFeedChecks'),
      allItems: getAll('eventFeedCheckItems'),
    });

    expect(getById('eventFeedCheckItems', 'i2a')).toBeUndefined();
    expect(getById('eventFeedChecks', 'c2')).toBeTruthy();
  });

  it('rejects when the staged item value would fail validation', () => {
    const c = mkCheck('c1', '2026-04-05');
    const i = mkItem('i1', 'c1', 100);
    add('eventFeedChecks', c, FeedCheckEntity.validate);
    add('eventFeedCheckItems', i, FeedCheckItemEntity.validate);

    expect(() => commitFeedCheckEdit({
      check: c, item: i,
      newDate: '2026-04-05', newTime: null, newNotes: null, newRemaining: undefined,
      deleteItemIds: [],
      allChecks: getAll('eventFeedChecks'),
      allItems: getAll('eventFeedCheckItems'),
    })).toThrow(/Item invalid/);

    expect(getById('eventFeedCheckItems', 'i1').remainingQuantity).toBe(100);
  });
});
