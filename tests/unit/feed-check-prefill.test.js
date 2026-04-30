/** @file OI-0139 — feed-check sheet prefill must consume getLiveRemainingForMove
 * so post-check deliveries land on top of the latest check's reading. Six cases
 * mirror the helper-level cases but assert at the sheet's units stepper.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../src/data/store.js';
import { openFeedCheckSheet } from '../../src/features/feed/check.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as EventEntity from '../../src/entities/event.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const LOC = '00000000-0000-0000-0000-0000000000l1';
const FT = '00000000-0000-0000-0000-0000000000f1';

function seedScaffold() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'bale', quantity: 10, remaining: 10,
    weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

function addDelivery({ date, time = null, quantity }) {
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
    date, time, quantity,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function addCheck({ date, time = null, remainingQuantity }) {
  const check = FeedCheckEntity.create({ operationId: OP, eventId: EVT, date, time });
  add('eventFeedChecks', check, FeedCheckEntity.validate,
    FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
  add('eventFeedCheckItems', FeedCheckItemEntity.create({
    operationId: OP, feedCheckId: check.id, batchId: BATCH, locationId: LOC, remainingQuantity,
  }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
}

/** Open the sheet and read the units-stepper prefill value. The units stepper
 * is the only `<input type="number" step="0.01">` rendered per item card; the
 * percent input uses `step="0.5"`. */
function openAndReadPrefill() {
  const evt = getAll('events').find(e => e.id === EVT);
  openFeedCheckSheet(evt, OP);
  const panel = document.getElementById('feed-check-sheet-panel');
  const stepper = panel.querySelector('input[type="number"][step="0.01"]');
  return Number(stepper.value);
}

describe('openFeedCheckSheet prefill (OI-0139)', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seedScaffold();
  });

  it('case 1 — one delivery, no prior check → prefill = lifetime delivery sum', () => {
    addDelivery({ date: '2026-04-16', quantity: 1 });
    expect(openAndReadPrefill()).toBe(1);
  });

  it('case 2 — single check, no post-check delivery → prefill = check value (OI-0135 path)', () => {
    addDelivery({ date: '2026-04-16', quantity: 1 });
    addCheck({ date: '2026-04-20', time: '15:00', remainingQuantity: 0.5 });
    expect(openAndReadPrefill()).toBe(0.5);
  });

  it('case 3 — Pasture D: 0-remaining check + post-check delivery → prefill = 1 (was 0 before fix)', () => {
    addCheck({ date: '2026-04-28', time: '13:51', remainingQuantity: 0 });
    addDelivery({ date: '2026-04-29', time: '15:02', quantity: 1 });
    expect(openAndReadPrefill()).toBe(1);
  });

  it('case 4 — multiple checks: only deliveries strictly after the *latest* check are added', () => {
    addCheck({ date: '2026-04-16', time: '13:19', remainingQuantity: 0.85 });
    addDelivery({ date: '2026-04-20', quantity: 1 }); // between checks → captured by latest check
    addCheck({ date: '2026-04-28', time: '13:51', remainingQuantity: 0 });
    addDelivery({ date: '2026-04-29', quantity: 1 }); // strictly after latest → adds on top
    expect(openAndReadPrefill()).toBe(1);
  });

  it('case 5 — same-instant delivery is captured by the check (strict-> rule)', () => {
    addCheck({ date: '2026-04-28', time: '13:51', remainingQuantity: 0.5 });
    addDelivery({ date: '2026-04-28', time: '13:51', quantity: 1 });
    expect(openAndReadPrefill()).toBe(0.5);
  });

  it('case 6 — time:null delivery dated strictly after the check is included', () => {
    addCheck({ date: '2026-04-28', time: '13:51', remainingQuantity: 0.3 });
    addDelivery({ date: '2026-04-29', time: null, quantity: 1 });
    expect(openAndReadPrefill()).toBe(1.3);
  });
});
