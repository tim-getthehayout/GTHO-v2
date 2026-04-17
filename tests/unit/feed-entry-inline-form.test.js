/** @file Tests for the §8 inline feed entry add/edit form (OI-0085). */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateFeedEntryForm,
  commitAdd,
  commitEdit,
  clampDateToEvent,
  openAddMode,
  openEditMode,
  closeForm,
  getFormState,
  isFormOpen,
} from '../../src/features/events/feed-entry-inline-form.js';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FEED_TYPE = '00000000-0000-0000-0000-0000000000bb';
const EVENT_ID = '00000000-0000-0000-0000-0000000000cc';
const LOC = '00000000-0000-0000-0000-0000000000dd';
const BATCH_A = '00000000-0000-0000-0000-0000000000e1';
const BATCH_B = '00000000-0000-0000-0000-0000000000e2';

function mkBatch(id, name, remaining = 100, unit = 'bale') {
  return BatchEntity.create({
    id, operationId: OP, feedTypeId: FEED_TYPE,
    name, quantity: 100, remaining, unit,
    weightPerUnitKg: 20, dmPct: 88, costPerUnit: 45,
  });
}
function mkEntry(id, batchId, quantity, date) {
  return FeedEntryEntity.create({
    id, operationId: OP, eventId: EVENT_ID,
    batchId, locationId: LOC, date, quantity,
  });
}

const event = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: null };
const closedEvent = { id: EVENT_ID, dateIn: '2026-04-01', dateOut: '2026-04-20' };

describe('feed-entry-inline-form: clampDateToEvent', () => {
  it('returns date as-is when within window', () => {
    expect(clampDateToEvent('2026-04-10', event)).toBe('2026-04-10');
  });
  it('clamps up to event.dateIn when before', () => {
    expect(clampDateToEvent('2026-03-01', event)).toBe('2026-04-01');
  });
  it('clamps down to event.dateOut when after on closed events', () => {
    expect(clampDateToEvent('2026-05-01', closedEvent)).toBe('2026-04-20');
  });
});

describe('feed-entry-inline-form: state setters', () => {
  beforeEach(() => closeForm());

  it('openAddMode resets state and opens form in add mode with clamped today', () => {
    openAddMode(event);
    const s = getFormState();
    expect(s.mode).toBe('add');
    expect(s.editingEntryId).toBeNull();
    expect(s.lines).toEqual([]);
    expect(isFormOpen()).toBe(true);
  });

  it('openEditMode pre-populates from entry and locks to one line', () => {
    openEditMode({ id: 'entry-1', batchId: BATCH_A, quantity: 3, date: '2026-04-10' });
    const s = getFormState();
    expect(s.mode).toBe('edit');
    expect(s.editingEntryId).toBe('entry-1');
    expect(s.date).toBe('2026-04-10');
    expect(s.lines).toEqual([{ batchId: BATCH_A, qty: 3 }]);
  });

  it('closeForm resets state', () => {
    openAddMode(event);
    closeForm();
    expect(isFormOpen()).toBe(false);
    expect(getFormState().mode).toBeNull();
  });
});

describe('feed-entry-inline-form: validateFeedEntryForm', () => {
  const batches = [mkBatch(BATCH_A, 'Hay A', 100), mkBatch(BATCH_B, 'Hay B', 50)];
  const todayStr = '2026-04-15';

  it('rejects when no line has qty > 0', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-04-10', lines: [{ batchId: BATCH_A, qty: 0 }],
      mode: 'add', editingEntry: null, batches, todayStr,
    });
    expect(v.valid).toBe(false);
    expect(v.error).toMatch(/Quantity must be greater than zero/);
  });

  it('rejects date < event.dateIn', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-03-31', lines: [{ batchId: BATCH_A, qty: 1 }],
      mode: 'add', editingEntry: null, batches, todayStr,
    });
    expect(v.error).toMatch(/on or after the event start date/);
  });

  it('rejects date > event.dateOut on closed events', () => {
    const v = validateFeedEntryForm({
      event: closedEvent, date: '2026-04-21', lines: [{ batchId: BATCH_A, qty: 1 }],
      mode: 'add', editingEntry: null, batches, todayStr,
    });
    expect(v.error).toMatch(/on or before the event end date/);
  });

  it('rejects date in the future', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-04-16', lines: [{ batchId: BATCH_A, qty: 1 }],
      mode: 'add', editingEntry: null, batches, todayStr,
    });
    expect(v.error).toMatch(/can't be in the future/);
  });

  it('rejects edit mode when new_qty exceeds batch.remaining + old_qty', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-04-10',
      lines: [{ batchId: BATCH_A, qty: 105 }],
      mode: 'edit',
      editingEntry: { id: 'e1', batchId: BATCH_A, quantity: 3 },
      batches, todayStr,
    });
    // ceiling = 100 + 3 = 103, requested 105 → reject
    expect(v.error).toMatch(/Not enough inventory/);
    expect(v.error).toMatch(/103\.0 bale/);
  });

  it('passes edit mode when new_qty equals ceiling', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-04-10',
      lines: [{ batchId: BATCH_A, qty: 103 }],
      mode: 'edit',
      editingEntry: { id: 'e1', batchId: BATCH_A, quantity: 3 },
      batches, todayStr,
    });
    expect(v.valid).toBe(true);
  });

  it('passes when valid', () => {
    const v = validateFeedEntryForm({
      event, date: '2026-04-10', lines: [{ batchId: BATCH_A, qty: 2 }],
      mode: 'add', editingEntry: null, batches, todayStr,
    });
    expect(v.valid).toBe(true);
    expect(v.error).toBeNull();
  });
});

describe('feed-entry-inline-form: commitAdd', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('creates one feed entry per line with qty > 0 and decrements each batch', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 100);
    const b = mkBatch(BATCH_B, 'Hay B', 50);
    add('batches', a, BatchEntity.validate);
    add('batches', b, BatchEntity.validate);

    commitAdd({
      operationId: OP,
      event,
      locationId: LOC,
      date: '2026-04-10',
      lines: [{ batchId: BATCH_A, qty: 3 }, { batchId: BATCH_B, qty: 2 }],
      batches: [a, b],
    });

    const entries = getAll('eventFeedEntries');
    expect(entries).toHaveLength(2);
    expect(entries.every(e => e.date === '2026-04-10')).toBe(true);
    expect(entries.find(e => e.batchId === BATCH_A).quantity).toBe(3);
    expect(entries.find(e => e.batchId === BATCH_B).quantity).toBe(2);

    expect(getById('batches', BATCH_A).remaining).toBe(97);
    expect(getById('batches', BATCH_B).remaining).toBe(48);
  });

  it('skips lines with qty 0', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 100);
    add('batches', a, BatchEntity.validate);

    commitAdd({
      operationId: OP, event, locationId: LOC, date: '2026-04-10',
      lines: [{ batchId: BATCH_A, qty: 3 }, { batchId: BATCH_B, qty: 0 }],
      batches: [a],
    });

    expect(getAll('eventFeedEntries')).toHaveLength(1);
  });

  it('clamps batch.remaining at 0 when over-decrementing', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 2);
    add('batches', a, BatchEntity.validate);

    commitAdd({
      operationId: OP, event, locationId: LOC, date: '2026-04-10',
      lines: [{ batchId: BATCH_A, qty: 5 }],
      batches: [a],
    });

    expect(getById('batches', BATCH_A).remaining).toBe(0);
  });
});

describe('feed-entry-inline-form: commitEdit', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('raising qty reduces batch.remaining by the delta', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 100);
    const e = mkEntry('e1', BATCH_A, 3, '2026-04-10');
    add('batches', a, BatchEntity.validate);
    add('eventFeedEntries', e, FeedEntryEntity.validate);

    commitEdit({ entry: e, newDate: '2026-04-10', newQty: 5, batches: [a] });

    expect(getById('eventFeedEntries', 'e1').quantity).toBe(5);
    // delta = 3 - 5 = -2 → remaining 100 + (-2) = 98
    expect(getById('batches', BATCH_A).remaining).toBe(98);
  });

  it('lowering qty increases batch.remaining by the freed delta', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 100);
    const e = mkEntry('e1', BATCH_A, 5, '2026-04-10');
    add('batches', a, BatchEntity.validate);
    add('eventFeedEntries', e, FeedEntryEntity.validate);

    commitEdit({ entry: e, newDate: '2026-04-10', newQty: 1, batches: [a] });

    expect(getById('eventFeedEntries', 'e1').quantity).toBe(1);
    // delta = 5 - 1 = 4 → remaining 100 + 4 = 104
    expect(getById('batches', BATCH_A).remaining).toBe(104);
  });

  it('changing only the date leaves remaining untouched', () => {
    const a = mkBatch(BATCH_A, 'Hay A', 100);
    const e = mkEntry('e1', BATCH_A, 3, '2026-04-10');
    add('batches', a, BatchEntity.validate);
    add('eventFeedEntries', e, FeedEntryEntity.validate);

    commitEdit({ entry: e, newDate: '2026-04-12', newQty: 3, batches: [a] });

    expect(getById('eventFeedEntries', 'e1').date).toBe('2026-04-12');
    expect(getById('batches', BATCH_A).remaining).toBe(100);
  });
});
