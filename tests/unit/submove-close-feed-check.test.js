/** @file OI-0119 — Sub-move Close sheet forced feed-check card.
 *
 * When the event has any stored-feed deliveries (`event.hasStoredFeed`),
 * the Sub-move Close sheet must render a feed-check card inline and block
 * Save until the farmer records remaining stored feed for every batch×location
 * combo. On Save, a new `event_feed_checks` + per-combo
 * `event_feed_check_items` must be written with `isCloseReading=false`.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import { openSubmoveCloseSheet } from '../../src/features/events/submove.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const LOC = '00000000-0000-0000-0000-0000000000c1';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const PW = '00000000-0000-0000-0000-0000000000e1';
const FEED_TYPE = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000f2';

beforeAll(() => setLocale('en', enLocale));

function seedBase() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'Pasture A',
    type: 'land', landUse: 'pasture', areaHectares: 2,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-04-10', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function seedStoredFeed() {
  add('feedTypes', FeedTypeEntity.create({
    id: FEED_TYPE, operationId: OP, name: 'Grass Hay', category: 'hay', unit: 'bales',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch 1',
    quantity: 20, remaining: 5, unit: 'bales', weightPerUnitKg: 500, dmPct: 90,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
    date: '2026-04-10', quantity: 15,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function openDialog() {
  const pw = getById('eventPaddockWindows', PW);
  openSubmoveCloseSheet(pw, OP);
  return document.getElementById('submove-close-sheet-panel');
}

describe('OI-0119 — sub-move close forced feed-check', () => {
  beforeEach(seedBase);

  it('hasStoredFeed=false: feed-check card does NOT render', () => {
    const panel = openDialog();
    expect(panel.querySelector('[data-testid="submove-close-feed-check-title"]')).toBeFalsy();
    // Save button should exist unblocked.
    expect(panel.querySelector('[data-testid="submove-close-save"]')).toBeTruthy();
  });

  it('hasStoredFeed=true: feed-check card renders one input per batch×location', () => {
    seedStoredFeed();
    const panel = openDialog();
    expect(panel.querySelector('[data-testid="submove-close-feed-check-title"]')).toBeTruthy();
    const input = panel.querySelector(`[data-testid="submove-close-feed-${BATCH}-${LOC}"]`);
    expect(input).toBeTruthy();
    expect(input.type).toBe('number');
  });

  it('hasStoredFeed=true + blank input: Save is blocked with a status error', () => {
    seedStoredFeed();
    const panel = openDialog();
    // Clear the default '0' so it's blank.
    const input = panel.querySelector(`[data-testid="submove-close-feed-${BATCH}-${LOC}"]`);
    input.value = '';
    panel.querySelector('[data-testid="submove-close-save"]').click();
    const status = panel.querySelector('[data-testid="submove-close-status"]');
    expect(status.textContent).toMatch(/remaining/i);
    // No eventFeedChecks row created.
    expect(getAll('eventFeedChecks')).toHaveLength(0);
  });

  it('hasStoredFeed=true + input filled: Save creates check + item rows with isCloseReading=false', () => {
    seedStoredFeed();
    const panel = openDialog();
    const input = panel.querySelector(`[data-testid="submove-close-feed-${BATCH}-${LOC}"]`);
    input.value = '4';
    panel.querySelector('[data-testid="submove-close-save"]').click();

    const checks = getAll('eventFeedChecks').filter(c => c.eventId === EVT);
    expect(checks).toHaveLength(1);
    expect(checks[0].isCloseReading).toBe(false);
    expect(checks[0].date).toBeTruthy();

    const items = getAll('eventFeedCheckItems').filter(i => i.feedCheckId === checks[0].id);
    expect(items).toHaveLength(1);
    expect(items[0].batchId).toBe(BATCH);
    expect(items[0].locationId).toBe(LOC);
    expect(items[0].remainingQuantity).toBe(4);
  });
});
