import { getLocalTodayStr } from '../../../../src/utils/date-utils.js';
/** @file Batch locations: create, move, card summary, details, delivery source. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { openDeliverFeedSheet } from '../../../../src/features/feed/delivery.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const BARN = '00000000-0000-0000-0000-0000000000c1';
const PAD = '00000000-0000-0000-0000-0000000000c2';
const FT = '00000000-0000-0000-0000-0000000000f1';
const EVT = '00000000-0000-0000-0000-0000000000e1';

function seedBase() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({
    id: BARN, operationId: OP, farmId: FARM, name: 'Hay Barn', type: 'storage',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: PAD, operationId: OP, farmId: FARM, name: 'Field Pad', type: 'land', landUse: 'pasture',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('feedTypes', FeedTypeEntity.create({
    id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  return container;
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

function createBatch(name, quantity) {
  document.querySelector('[data-testid="feed-add-batch-btn"]').click();
  document.querySelector('[data-testid="batch-sheet-name"]').value = name;
  document.querySelector('[data-testid="batch-sheet-quantity"]').value = String(quantity);
  document.querySelector('[data-testid="batch-sheet-unit"]').value = 'bale';
  document.querySelector(`[data-testid="batch-location-item-${BARN}"]`).click();
  document.querySelector('[data-testid="batch-sheet-save"]').click();
}

describe('feed batch locations', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    seedBase();
    mount();
  });

  it('requires a location and records the first balance and move', async () => {
    document.querySelector('[data-testid="feed-add-batch-btn"]').click();
    document.querySelector('[data-testid="batch-sheet-name"]').value = 'May hay';
    document.querySelector('[data-testid="batch-sheet-quantity"]').value = '10';
    document.querySelector('[data-testid="batch-sheet-unit"]').value = 'bale';
    document.querySelector('[data-testid="batch-sheet-save"]').click();
    expect(document.querySelector('[data-testid="batch-sheet-status"]').textContent)
      .toContain('Choose a location');
    expect(getAll('batches')).toHaveLength(0);

    document.querySelector(`[data-testid="batch-location-item-${BARN}"]`).click();
    document.querySelector('[data-testid="batch-sheet-save"]').click();
    await flush();

    const batch = getAll('batches')[0];
    expect(batch.remaining).toBe(10);
    expect(batch.quantity).toBe(10);
    const balances = getAll('batchLocationBalances');
    expect(balances).toHaveLength(1);
    expect(balances[0].locationId).toBe(BARN);
    expect(balances[0].quantity).toBe(10);
    const moves = getAll('batchMoves');
    expect(moves).toHaveLength(1);
    expect(moves[0].fromLocationId).toBeNull();
    expect(moves[0].toLocationId).toBe(BARN);
    expect(moves[0].quantity).toBe(10);
    expect(document.querySelector(`[data-testid="feed-batch-locations-${batch.id}"]`).textContent)
      .toBe('Hay Barn');
    expect(document.querySelector(`[data-testid="feed-batch-activity-${batch.id}"]`)).toBeNull();
  });

  it('moves part of a batch and shows both locations on the card and in details', async () => {
    createBatch('May hay', 10);
    await flush();
    const batch = getAll('batches')[0];

    document.querySelector(`[data-testid="feed-batch-details-${batch.id}"]`).click();
    expect(document.querySelector(`[data-testid="feed-batch-balances-${batch.id}"]`).textContent)
      .toContain('Hay Barn');
    expect(document.querySelector(`[data-testid="feed-batch-moves-${batch.id}"]`).textContent)
      .toContain('Hay Barn');
    document.querySelector(`[data-testid="feed-batch-move-${batch.id}"]`).click();
    document.querySelector('[data-testid="batch-move-quantity"]').value = '4';
    document.querySelector('#batch-move-sheet-panel [data-testid="batch-location-mode-pasture"]').click();
    document.querySelector(`#batch-move-sheet-panel [data-testid="batch-location-item-${PAD}"]`).click();
    document.querySelector('[data-testid="batch-move-save"]').click();
    await flush();

    const balances = getAll('batchLocationBalances');
    const barn = balances.find(row => row.locationId === BARN);
    const pad = balances.find(row => row.locationId === PAD);
    expect(barn.quantity).toBe(6);
    expect(pad.quantity).toBe(4);
    expect(getById('batches', batch.id).remaining).toBe(10);
    const transfer = getAll('batchMoves').find(row => row.fromLocationId === BARN);
    expect(transfer.toLocationId).toBe(PAD);
    expect(transfer.quantity).toBe(4);
    expect(transfer.movedAt).toBe(getLocalTodayStr());

    const summary = document.querySelector(`[data-testid="feed-batch-locations-${batch.id}"]`).textContent;
    expect(summary).toContain('Field Pad (4)');
    expect(summary).toContain('Hay Barn (6)');
    expect(document.querySelector(`[data-testid="feed-batch-${batch.id}"] [data-testid="feed-batch-activity-${batch.id}"]`)).toBeNull();

    document.querySelector(`[data-testid="feed-batch-details-${batch.id}"]`).click();
    const history = document.querySelector(`[data-testid="feed-batch-moves-${batch.id}"]`).textContent;
    expect(history.indexOf('Field Pad')).toBeLessThan(history.indexOf('—'));
  });

  it('deducts a delivery from the chosen storage location', async () => {
    createBatch('May hay', 10);
    await flush();
    const batch = getAll('batches')[0];
    document.querySelector(`[data-testid="feed-batch-details-${batch.id}"]`).click();
    document.querySelector(`[data-testid="feed-batch-move-${batch.id}"]`).click();
    document.querySelector('[data-testid="batch-move-quantity"]').value = '4';
    document.querySelector('#batch-move-sheet-panel [data-testid="batch-location-mode-pasture"]').click();
    document.querySelector(`#batch-move-sheet-panel [data-testid="batch-location-item-${PAD}"]`).click();
    document.querySelector('[data-testid="batch-move-save"]').click();
    await flush();

    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: PAD, dateOpened: '2026-11-01',
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

    openDeliverFeedSheet({ id: EVT }, OP);
    const source = document.querySelector(`[data-testid="feed-delivery-source-${batch.id}"]`);
    expect(source).toBeNull();
    document.querySelector('.batch-sel').click();
    const picker = document.querySelector(`[data-testid="feed-delivery-source-${batch.id}"]`);
    expect(picker).not.toBeNull();
    picker.value = BARN;
    picker.dispatchEvent(new Event('change'));
    const plus = [...document.querySelectorAll('.qty-btn')].find(btn => btn.textContent === '+');
    plus.click();
    plus.click();
    document.querySelector('#deliver-feed-sheet-panel .btn-green').click();
    await flush();

    const entry = getAll('eventFeedEntries')[0];
    expect(entry.sourceLocationId).toBe(BARN);
    expect(entry.locationId).toBe(PAD);
    expect(entry.quantity).toBe(1);
    expect(getAll('batchLocationBalances').find(row => row.locationId === BARN).quantity).toBe(5);
    expect(getAll('batchLocationBalances').find(row => row.locationId === PAD).quantity).toBe(4);
    expect(getById('batches', batch.id).remaining).toBe(9);

    document.querySelector(`[data-testid="feed-batch-details-${batch.id}"]`).click();
    const activity = document.querySelector(`[data-testid="feed-batch-activity-${batch.id}"]`).textContent;
    expect(activity).toContain('from Hay Barn');
  });

  it('removes balances and moves when the batch is deleted and leaves them when archived', async () => {
    createBatch('May hay', 10);
    await flush();
    const batch = getAll('batches')[0];
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    document.querySelector(`[data-testid="feed-batch-archive-${batch.id}"]`).click();
    await flush();
    expect(getAll('batchLocationBalances')).toHaveLength(1);
    expect(getAll('batchMoves')).toHaveLength(1);
    expect(getById('batches', batch.id).archived).toBe(true);

    document.querySelector('[data-testid="feed-show-archived"]').click();
    document.querySelector(`[data-testid="feed-batch-delete-${batch.id}"]`).click();
    await flush();
    expect(getAll('batches')).toHaveLength(0);
    expect(getAll('batchLocationBalances')).toHaveLength(0);
    expect(getAll('batchMoves')).toHaveLength(0);
    confirmSpy.mockRestore();
  });
});
