/** @file Delivery must refuse a short batch in preflight so no other batch is deducted. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../../../src/data/store.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import { t } from '../../../../src/i18n/i18n.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC_G1 = '00000000-0000-0000-0000-0000000001a1';
const LOC_G2 = '00000000-0000-0000-0000-0000000001a2';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH_A = '00000000-0000-0000-0000-0000000000b1';
const BATCH_B = '00000000-0000-0000-0000-0000000000b2';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH_A, operationId: OP, feedTypeId: FT, name: 'Hay A',
    unit: 'bale', quantity: 10, remaining: 10, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('batches', BatchEntity.create({
    id: BATCH_B, operationId: OP, feedTypeId: FT, name: 'Hay B',
    unit: 'bale', quantity: 1, remaining: 1, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('locations', LocationEntity.create({ id: LOC_G1, operationId: OP, farmId: FARM, name: 'G-1' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({ id: LOC_G2, operationId: OP, farmId: FARM, name: 'G-2' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: 'pw-g1', operationId: OP, eventId: EVT, locationId: LOC_G1, dateOpened: '2026-04-30',
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: 'pw-g2', operationId: OP, eventId: EVT, locationId: LOC_G2, dateOpened: '2026-04-29',
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function openSheet(options) {
  const evt = getAll('events').find(e => e.id === EVT);
  openDeliverFeedSheet(evt, OP, options);
  return document.getElementById('deliver-feed-sheet-panel');
}

function clickBatch(panel, name) {
  const card = Array.from(panel.querySelectorAll('.batch-sel')).find(node => (node.textContent || '').includes(name));
  card.click();
}

function bumpQty(panel, name, clicks) {
  const card = Array.from(panel.querySelectorAll('.batch-sel')).find(node => (node.textContent || '').includes(name));
  const plus = Array.from(card.parentElement.querySelectorAll('button.qty-btn')).find(button => button.textContent === '+');
  for (let i = 0; i < clicks; i += 1) plus.click();
}

function clickSave(panel) {
  const saveBtn = Array.from(panel.querySelectorAll('button')).find(button => /save|deliver|log/i.test(button.textContent || ''));
  saveBtn.click();
}

describe('delivery stock is checked in preflight', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seed();
  });

  it('writes nothing when a second batch is short, leaving the first batch untouched', () => {
    const panel = openSheet();
    clickBatch(panel, 'Hay A');
    bumpQty(panel, 'Hay A', 2); // 1
    clickBatch(panel, 'Hay B');
    bumpQty(panel, 'Hay B', 4); // 2
    clickSave(panel);
    expect(panel.textContent).toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(10);
    expect(getAll('batches').find(row => row.id === BATCH_B).remaining).toBe(1);
  });

  it('writes nothing when two lines of the same batch each fit alone but exceed remaining together', () => {
    let binding;
    const panel = openSheet({
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([{ batchId: BATCH_A, qty: 6 }]);
    binding.fields.locationIds.set([LOC_G1, LOC_G2]);
    binding.fields.quantityBasis.set('per-paddock');
    clickSave(panel);
    expect(panel.textContent).toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(10);
  });
});
