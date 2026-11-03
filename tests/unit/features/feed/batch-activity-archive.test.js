/** @file Batch card activity list, adjustment date, and archive pill. */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../../src/entities/event-feed-entry.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC = '00000000-0000-0000-0000-0000000001a1';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const ARCHIVED = '00000000-0000-0000-0000-0000000000b2';
const ENTRY = '00000000-0000-0000-0000-0000000000fe';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('locations', LocationEntity.create({ id: LOC, operationId: OP, farmId: FARM, name: 'North', type: 'land' }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('feedTypes', FeedTypeEntity.create({ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }),
    FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'bale', quantity: 20, remaining: 10, purchaseDate: '2026-10-01',
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('batches', BatchEntity.create({
    id: ARCHIVED, operationId: OP, feedTypeId: FT, name: 'Old Batch',
    unit: 'bale', quantity: 5, remaining: 0, archived: true,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    id: ENTRY, operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
    date: '2026-11-02', time: '09:00', quantity: 2,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  return container;
}

function pill() {
  return document.querySelector('[data-testid="feed-show-archived"]');
}

/** Store writes notify on a microtask. */
async function flush() {
  await Promise.resolve();
}

describe('feed batch activity, adjustment date, and archive', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    seed();
    mount();
    if (pill().textContent === 'Hide archived') pill().click();
  });

  it('lists feed out and the original quantity, and only adjustments are editable', () => {
    const card = document.querySelector(`[data-testid="feed-batch-${BATCH}"]`);
    const activity = card.querySelector(`[data-testid="feed-batch-activity-${BATCH}"]`);
    expect(activity.textContent).toContain('Out');
    expect(activity.textContent).toContain('2 bale');
    expect(activity.textContent).toContain('North');
    expect(activity.textContent).toContain('In');
    expect(activity.textContent).toContain('20 bale');
    expect(activity.textContent).toContain('2026-10-01');
    expect(activity.textContent.indexOf('Out')).toBeLessThan(activity.textContent.indexOf('In'));

    const lines = [...activity.querySelectorAll('.batch-card-detail')];
    const outLine = lines.find(line => line.textContent.includes('Out'));
    expect(outLine.querySelector('button')).toBeNull();
    expect(document.querySelector(`[data-testid="feed-batch-${ARCHIVED}"]`)).toBeNull();
  });

  it('saves the chosen adjustment date and opens that row for edit', async () => {
    document.querySelector(`[data-testid="feed-batch-adjust-${BATCH}"]`).click();
    const dateInput = document.querySelector('[data-testid="batch-adjust-date"]');
    expect(dateInput.value).toBe(new Date().toISOString().slice(0, 10));
    const reason = document.querySelector('[data-testid="batch-adjust-reason"]');
    expect(dateInput.compareDocumentPosition(reason) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    dateInput.value = '2026-11-01';
    document.querySelector('[data-testid="batch-adjust-new-qty"]').value = '8';
    document.querySelector('[data-testid="batch-adjust-save"]').click();
    await flush();

    const adj = getAll('batchAdjustments').find(a => a.batchId === BATCH);
    expect(adj.adjustmentDate).toBe('2026-11-01');
    expect(adj.previousQty).toBe(10);
    expect(adj.newQty).toBe(8);
    expect(adj.delta).toBe(-2);
    expect(getById('batches', BATCH).remaining).toBe(8);

    const activity = document.querySelector(`[data-testid="feed-batch-activity-${BATCH}"]`);
    const adjLine = [...activity.querySelectorAll('.batch-card-detail')]
      .find(line => line.textContent.includes('Adjustment'));
    expect(adjLine.textContent).toContain('10 → 8');
    expect(adjLine.querySelector('button').textContent).toBe('Edit');
    expect([...activity.querySelectorAll('.batch-card-detail')]
      .find(line => line.textContent.includes('Out')).querySelector('button')).toBeNull();

    adjLine.querySelector('button').click();
    const editDate = document.querySelector('[data-testid="batch-adjust-date"]');
    expect(editDate.value).toBe('2026-11-01');
    editDate.value = '2026-10-15';
    document.querySelector('[data-testid="batch-adjust-new-qty"]').value = '6';
    document.querySelector('[data-testid="batch-adjust-save"]').click();
    await flush();

    const edited = getById('batchAdjustments', adj.id);
    expect(edited.adjustmentDate).toBe('2026-10-15');
    expect(edited.newQty).toBe(6);
    expect(edited.previousQty).toBe(10);
    expect(edited.delta).toBe(-4);
    expect(getById('batches', BATCH).remaining).toBe(6);
  });

  it('archives with confirmation and restores from the show-archived list', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    document.querySelector(`[data-testid="feed-batch-archive-${BATCH}"]`).click();
    expect(confirmSpy).toHaveBeenCalled();
    expect(document.querySelector(`[data-testid="feed-batch-${BATCH}"]`)).not.toBeNull();

    confirmSpy.mockReturnValue(true);
    document.querySelector(`[data-testid="feed-batch-archive-${BATCH}"]`).click();
    await flush();
    expect(getById('batches', BATCH).archived).toBe(true);
    expect(document.querySelector(`[data-testid="feed-batch-${BATCH}"]`)).toBeNull();
    expect(document.querySelector('[data-testid="feed-batch-empty"]').textContent).toContain('2 archived hidden');
    expect(getById('batches', BATCH).name).toBe('Hay Batch');

    pill().click();
    expect(pill().textContent).toBe('Hide archived');
    expect(document.querySelector(`[data-testid="feed-batch-restore-${BATCH}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-testid="feed-batch-activity-${BATCH}"]`).textContent).toContain('Out');

    document.querySelector(`[data-testid="feed-batch-restore-${BATCH}"]`).click();
    await flush();
    expect(getById('batches', BATCH).archived).toBe(false);
    pill().click();
    expect(document.querySelector(`[data-testid="feed-batch-${BATCH}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-testid="feed-batch-archive-${BATCH}"]`)).not.toBeNull();
  });
});
