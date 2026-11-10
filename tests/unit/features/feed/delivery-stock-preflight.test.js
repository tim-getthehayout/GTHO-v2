/** @file Delivery must refuse a short batch in preflight so no other batch is deducted. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter, update } from '../../../../src/data/store.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import { t } from '../../../../src/i18n/i18n.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import { placeInitialBalance, moveBatchQuantity, balancesFor } from '../../../../src/features/feed/batch-balances.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC_G1 = '00000000-0000-0000-0000-0000000001a1';
const LOC_G2 = '00000000-0000-0000-0000-0000000001a2';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH_A = '00000000-0000-0000-0000-0000000000b1';
const BATCH_B = '00000000-0000-0000-0000-0000000000b2';
const STORE_1 = '00000000-0000-0000-0000-0000000000s1';
const STORE_9 = '00000000-0000-0000-0000-0000000000s9';

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

  it('writes nothing when the selected store is short even if batch remaining would cover it', () => {
    add('locations', LocationEntity.create({
      id: STORE_1, operationId: OP, farmId: FARM, name: 'Store 1', type: 'storage',
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('locations', LocationEntity.create({
      id: STORE_9, operationId: OP, farmId: FARM, name: 'Store 9', type: 'storage',
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    update('batches', BATCH_B, { quantity: 10, remaining: 10 },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    placeInitialBalance({ operationId: OP, batchId: BATCH_B, locationId: STORE_1, quantity: 10 });
    moveBatchQuantity({
      operationId: OP, batchId: BATCH_B,
      fromLocationId: STORE_1, toLocationId: STORE_9, quantity: 9,
    });

    const panel = openSheet();
    clickBatch(panel, 'Hay A');
    bumpQty(panel, 'Hay A', 2); // 1
    clickBatch(panel, 'Hay B');
    const picker = panel.querySelector(`[data-testid="feed-delivery-source-${BATCH_B}"]`);
    picker.value = STORE_1;
    picker.dispatchEvent(new Event('change'));
    bumpQty(panel, 'Hay B', 4); // 2
    clickSave(panel);

    expect(panel.textContent).toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(10);
    const stores = balancesFor(BATCH_B);
    expect(stores.find(row => row.locationId === STORE_1).quantity).toBe(1);
    expect(stores.find(row => row.locationId === STORE_9).quantity).toBe(9);
    expect(getAll('batches').find(row => row.id === BATCH_B).remaining).toBe(10);
  });

  it('writes nothing when two unplaced same-batch lines with different sources exceed remaining together', () => {
    let binding;
    const panel = openSheet({
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([
      { batchId: BATCH_A, qty: 6, sourceLocationId: STORE_1 },
      { batchId: BATCH_A, qty: 6, sourceLocationId: STORE_9 },
    ]);
    binding.fields.locationIds.set([LOC_G1]);
    clickSave(panel);
    expect(panel.textContent).toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(10);
  });

  it('saves 0.1 plus 0.2 against a remaining of 0.3, but still blocks a clear overage', () => {
    update('batches', BATCH_A, { quantity: 0.3, remaining: 0.3 },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    let binding;
    const panel = openSheet({
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([{
      batchId: BATCH_A,
      qty: 0.3,
      allocations: [
        { locationId: LOC_G1, qty: 0.1 },
        { locationId: LOC_G2, qty: 0.2 },
      ],
    }]);
    binding.fields.locationIds.set([LOC_G1, LOC_G2]);
    binding.fields.quantityBasis.set('total');
    clickSave(panel);

    expect(panel.textContent).not.toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(2);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(0);
  });

  it('writes nothing when 0.2 plus 0.2 is more than a remaining of 0.3', () => {
    update('batches', BATCH_A, { quantity: 0.3, remaining: 0.3 },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    let binding;
    const panel = openSheet({
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([{
      batchId: BATCH_A,
      qty: 0.4,
      allocations: [
        { locationId: LOC_G1, qty: 0.2 },
        { locationId: LOC_G2, qty: 0.2 },
      ],
    }]);
    binding.fields.locationIds.set([LOC_G1, LOC_G2]);
    binding.fields.quantityBasis.set('total');
    clickSave(panel);

    expect(panel.textContent).toContain(t('feed.moveTooMuch'));
    expect(getAll('eventFeedEntries')).toHaveLength(0);
    expect(getAll('batches').find(row => row.id === BATCH_A).remaining).toBe(0.3);
  });
});
