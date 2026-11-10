/** @file Feeding review must show an editable carryover (batch, paddock, remaining) before save. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, setSyncAdapter } from '../../../../src/data/store.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
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
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const BATCH_B = '00000000-0000-0000-0000-0000000000b2';
const LOC_OUT = '00000000-0000-0000-0000-0000000001a9';

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
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'bale', quantity: 10, remaining: 10, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('batches', BatchEntity.create({
    id: BATCH_B, operationId: OP, feedTypeId: FT, name: 'Second Hay',
    unit: 'bale', quantity: 8, remaining: 8, weightPerUnitKg: 20, dmPct: 85,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('locations', LocationEntity.create({ id: LOC_G1, operationId: OP, farmId: FARM, name: 'G-1' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({ id: LOC_G2, operationId: OP, farmId: FARM, name: 'G-2' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({ id: LOC_OUT, operationId: OP, farmId: FARM, name: 'Other Farm Paddock' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: 'pw-g1', operationId: OP, eventId: EVT, locationId: LOC_G1, dateOpened: '2026-04-30',
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: 'pw-g2', operationId: OP, eventId: EVT, locationId: LOC_G2, dateOpened: '2026-04-29',
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

describe('feeding review carryover is visible and editable', () => {
  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    setSyncAdapter(null);
    seed();
  });

  it('shows batch, paddock and remaining on the review sheet and writes edits back through the bound field', () => {
    let binding;
    const evt = getAll('events').find(e => e.id === EVT);
    openDeliverFeedSheet(evt, OP, { review: { bind(value) { binding = value; } } });
    const panel = document.getElementById('deliver-feed-sheet-panel');
    binding.fields.carryover.set({
      timing: 'same-instant',
      batchId: BATCH,
      locationId: LOC_G1,
      remainingQuantity: 2,
    });

    const region = panel.querySelector('[data-testid="feed-delivery-carryover"]');
    expect(region).toBeTruthy();
    expect(region.style.display).not.toBe('none');
    const batch = region.querySelector('[data-testid="feed-carryover-batch"]');
    const location = region.querySelector('[data-testid="feed-carryover-location"]');
    const remaining = region.querySelector('[data-testid="feed-carryover-remaining"]');
    expect(batch.value).toBe(BATCH);
    expect(location.value).toBe(LOC_G1);
    expect(remaining.value).toBe('2');

    batch.value = BATCH_B;
    batch.dispatchEvent(new Event('change'));
    location.value = LOC_G2;
    location.dispatchEvent(new Event('change'));
    remaining.value = '3.5';
    remaining.dispatchEvent(new Event('input'));

    const value = binding.fields.carryover.get();
    expect(value.batchId).toBe(BATCH_B);
    expect(value.locationId).toBe(LOC_G2);
    expect(value.remainingQuantity).toBe(3.5);
    expect(value.items).toEqual([
      { batchId: BATCH_B, locationId: LOC_G2, remainingQuantity: 3.5 },
    ]);
  });


  it('asks for a leftover check time and writes one leftover, not one per paddock, at that time', () => {
    let binding;
    const evt = getAll('events').find(e => e.id === EVT);
    openDeliverFeedSheet(evt, OP, {
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([{ batchId: BATCH, qty: 2 }]);
    binding.fields.locationIds.set([LOC_G1, LOC_G2]);
    binding.fields.quantityBasis.set('per-paddock');
    binding.fields.carryover.set({
      timing: 'before',
      batchId: BATCH,
      remainingQuantity: 2,
    });
    const panel = document.getElementById('deliver-feed-sheet-panel');
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => /save|deliver|log/i.test(b.textContent || ''));
    saveBtn.click();
    expect(getAll('eventFeedCheckItems')).toHaveLength(0);
    expect(panel.textContent).toMatch(/time was the remaining feed checked/i);

    const leftoverTime = panel.querySelector('[data-testid="feed-carryover-time"]');
    leftoverTime.value = '07:15';
    leftoverTime.dispatchEvent(new Event('input'));
    leftoverTime.dispatchEvent(new Event('change'));
    const deliveryTime = Array.from(panel.querySelectorAll('input[type="time"]')).find(input => input !== leftoverTime);
    if (deliveryTime) deliveryTime.value = '18:00';
    saveBtn.click();
    const items = getAll('eventFeedCheckItems');
    expect(items).toHaveLength(1);
    expect(items[0].remainingQuantity).toBe(2);
    expect(items[0].locationId).toBe(LOC_G1);
    expect(getAll('eventFeedChecks')[0].time).toBe('07:15');
  });

  it('shows the check-time input when leftover timing changes from same-instant to before', () => {
    let binding;
    const evt = getAll('events').find(e => e.id === EVT);
    openDeliverFeedSheet(evt, OP, { review: { bind(value) { binding = value; } } });
    binding.fields.carryover.set({
      timing: 'same-instant',
      batchId: BATCH,
      locationId: LOC_G1,
      remainingQuantity: 2,
    });
    const region = document.querySelector('[data-testid="feed-delivery-carryover"]');
    expect(region.querySelector('[data-testid="feed-carryover-time"]')).toBeNull();
    const timing = region.querySelector('[data-testid="feed-carryover-timing"]');
    timing.value = 'before';
    timing.dispatchEvent(new Event('change'));
    expect(document.querySelector('[data-testid="feed-carryover-time"]')).toBeTruthy();
  });

  it('does not save a leftover location that is not on this event', () => {
    let binding;
    const evt = getAll('events').find(e => e.id === EVT);
    openDeliverFeedSheet(evt, OP, {
      review: { bind(value) { binding = value; }, requestConfirmation: save => save() },
    });
    binding.fields.lines.set([{ batchId: BATCH, qty: 2 }]);
    binding.fields.locationIds.set([LOC_G1]);
    binding.fields.carryover.set({
      timing: 'same-instant',
      items: [{ batchId: BATCH, locationId: LOC_OUT, remainingQuantity: 2 }],
    });
    const panel = document.getElementById('deliver-feed-sheet-panel');
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => /save|deliver|log/i.test(b.textContent || ''));
    saveBtn.click();
    expect(getAll('eventFeedCheckItems')).toHaveLength(0);
    expect(getAll('eventFeedChecks')).toHaveLength(0);
    expect(panel.textContent).toMatch(/batch and paddock shown on this review/i);
  });
});
