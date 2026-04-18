/** @file Integration test for the full Feed check Save click path (OI-0103).
 *
 * OI-0103's unit test only covered the entity round-trip. This test drives the
 * actual onClick handler in `openFeedCheckSheet` to catch any remaining silent-
 * drop or validate-reject failure. Follow-up to Tim's report that Save still
 * doesn't persist after the `checkDate:` → `date:` rename landed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter, mergeRemote } from '../../src/data/store.js';
import { openFeedCheckSheet } from '../../src/features/feed/check.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as EventEntity from '../../src/entities/event.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVENT_ID = '00000000-0000-0000-0000-0000000000e1';
const BATCH_ID = '00000000-0000-0000-0000-0000000000b1';
const LOC_ID = '00000000-0000-0000-0000-0000000000l1';

function seedOperation() {
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
}
function seedEvent() {
  add('events', EventEntity.create({ id: EVENT_ID, operationId: OP_ID, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}
function seedBatch() {
  const ftId = '00000000-0000-0000-0000-0000000000f1';
  add('feedTypes', FeedTypeEntity.create({ id: ftId, operationId: OP_ID, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH_ID, operationId: OP_ID, feedTypeId: ftId, name: 'Hay Batch',
    unit: 'bale', quantity: 10, remaining: 10,
    weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}
function seedFeedEntry({ stringifiedQty = false } = {}) {
  if (stringifiedQty) {
    // Simulate a remote-pulled row (PostgREST returns numeric as string by default).
    // mergeRemote pushes remote records into state without re-validating, so the
    // string survives into feature code. This is the exact real-world path.
    const remoteRecord = FeedEntryEntity.fromSupabaseShape({
      id: crypto.randomUUID(),
      operation_id: OP_ID, event_id: EVENT_ID, batch_id: BATCH_ID, location_id: LOC_ID,
      date: '2026-04-02',
      quantity: '10',              // PostgREST numeric-as-string
      entry_type: 'delivery',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    mergeRemote('eventFeedEntries', [remoteRecord]);
    return;
  }
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP_ID, eventId: EVENT_ID, batchId: BATCH_ID, locationId: LOC_ID,
    date: '2026-04-02',
    quantity: 10,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

describe('openFeedCheckSheet — end-to-end Save click (OI-0103 regression guard)', () => {
  let queuedWrites;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    queuedWrites = [];
    setSyncAdapter({
      push: (table, row, op) => queuedWrites.push({ table, row, op }),
      pushBatch: () => {},
      pull: () => {},
      pullAll: () => {},
      delete: () => {},
      isOnline: () => true,
      getStatus: () => 'idle',
      onStatusChange: () => {},
    });
    seedOperation();
    seedEvent();
    seedBatch();
  });

  function runClickFlow() {
    const evt = getAll('events').find(e => e.id === EVENT_ID);
    openFeedCheckSheet(evt, OP_ID);

    const panel = document.getElementById('feed-check-sheet-panel');
    expect(panel).toBeTruthy();
    // Save button is the last button in the panel.
    const buttons = Array.from(panel.querySelectorAll('button'));
    const saveBtn = buttons.find(b => b.textContent.includes('Save') || b.textContent.includes('save'));
    expect(saveBtn, 'Save button must render').toBeTruthy();

    const checksBefore = getAll('eventFeedChecks').length;
    const itemsBefore = getAll('eventFeedCheckItems').length;

    saveBtn.click();

    const checksAfter = getAll('eventFeedChecks');
    const itemsAfter = getAll('eventFeedCheckItems');
    expect(checksAfter.length).toBe(checksBefore + 1);
    expect(itemsAfter.length).toBe(itemsBefore + 1);

    const check = checksAfter[checksAfter.length - 1];
    expect(check.eventId).toBe(EVENT_ID);
    expect(check.date).toBeTruthy();
    expect(check.operationId).toBe(OP_ID);

    const item = itemsAfter[itemsAfter.length - 1];
    expect(item.feedCheckId).toBe(check.id);
    expect(item.batchId).toBe(BATCH_ID);
    expect(item.locationId).toBe(LOC_ID);

    // Sync adapter received both rows via toSupabaseShape.
    const checkPush = queuedWrites.find(w => w.table === 'event_feed_checks' && w.op === 'insert');
    const itemPush = queuedWrites.find(w => w.table === 'event_feed_check_items' && w.op === 'insert');
    expect(checkPush, 'event_feed_checks sync push must fire').toBeTruthy();
    expect(itemPush, 'event_feed_check_items sync push must fire').toBeTruthy();
    // Supabase shape has snake_case `date` populated (not null).
    expect(checkPush.row.date).toBeTruthy();
    // remaining_quantity must be a number (not a string) — guards against the
    // "numeric column arrived as string from PostgREST" silent-drop.
    expect(typeof itemPush.row.remaining_quantity).toBe('number');
  }

  it('clicking Save persists rows when feed-entry quantity is a plain number', () => {
    seedFeedEntry({ stringifiedQty: false });
    runClickFlow();
  });

  it('clicking Save persists rows even when feed-entry quantity arrived from Supabase as a string (PostgREST numeric default)', () => {
    seedFeedEntry({ stringifiedQty: true });
    runClickFlow();
  });
});
