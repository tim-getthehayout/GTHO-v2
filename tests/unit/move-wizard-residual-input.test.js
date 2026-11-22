// Historical batch-row UI/API regression fixture. Released pool forms run
// unmocked in manual-feed-pools and manual-pool-chart-refresh.
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 41 }));
/** @file OI-0135 + OI-0136 + OI-0259 — move-wizard Step 3 close-check input
 * + live-remaining hint. Drives the real move-wizard DOM (schema 41 / legacy
 * entries) and verifies:
 *   - Step 3 Delivered/Started hint reads live-remaining (most-recent check)
 *   - Remaining input is visible for both Move and Residual and starts blank
 *   - Blank / NaN / neg remaining blocks Save on both choices
 *   - Move writes destination quantity = entered remaining (not live total)
 *   - Residual with valid farmer-corrected input writes the entered value
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as FeedTypeEntity from '../../src/entities/feed-type.js';
import * as BatchEntity from '../../src/entities/batch.js';
import * as FeedEntryEntity from '../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../src/entities/event-feed-check-item.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openMoveWizard } from '../../src/features/events/move-wizard.js';

const OP = '00000000-0000-0000-0000-000000002aa1';
const FARM = '00000000-0000-0000-0000-000000002bb1';
const SRC_LOC = '00000000-0000-0000-0000-000000002c11';
const DST_LOC = '00000000-0000-0000-0000-000000002c12';
const EVT = '00000000-0000-0000-0000-000000002d11';
const SRC_PW = '00000000-0000-0000-0000-000000002e11';
const GROUP = '00000000-0000-0000-0000-000000002f11';
const GW = '00000000-0000-0000-0000-000000002101';
const FEED_TYPE = '00000000-0000-0000-0000-000000002f21';
const BATCH = '00000000-0000-0000-0000-000000002f22';

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
  for (const [id, name] of [[SRC_LOC, 'Source'], [DST_LOC, 'Dest']]) {
    add('locations', LocationEntity.create({
      id, operationId: OP, farmId: FARM, name, type: 'land',
      landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('events', EventEntity.create({
    id: EVT, operationId: OP, farmId: FARM,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: SRC_PW, operationId: OP, eventId: EVT, locationId: SRC_LOC,
    dateOpened: '2026-04-01', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Group' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-04-01', headCount: 10, avgWeightKg: 450,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  for (let i = 0; i < 3; i++) {
    const aid = `00000000-0000-0000-0000-0000000a2${i.toString().padStart(2, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `A${i}`, active: true,
      dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP,
      dateJoined: '2026-04-01', dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
}

function seedFeed({ delivered, checkRemaining }) {
  add('feedTypes', FeedTypeEntity.create({
    id: FEED_TYPE, operationId: OP, name: 'Grass Hay', category: 'hay', unit: 'bales',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch 1',
    quantity: 20, remaining: 5, unit: 'bales', weightPerUnitKg: 500, dmPct: 90,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: SRC_LOC,
    date: '2026-04-02', quantity: delivered,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
  if (checkRemaining != null) {
    const check = FeedCheckEntity.create({
      operationId: OP, eventId: EVT, date: '2026-04-04', time: '13:00',
    });
    add('eventFeedChecks', check, FeedCheckEntity.validate,
      FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP, feedCheckId: check.id,
      batchId: BATCH, locationId: SRC_LOC,
      remainingQuantity: checkRemaining,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
  }
}

function driveToStep3() {
  const event = { id: EVT, dateIn: '2026-04-01', dateOut: null };
  openMoveWizard(event, OP, FARM, {});
  document.querySelector('[data-testid="move-wizard-dest-new"]').click();
  document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
  document.querySelector(`[data-testid="location-picker-item-${DST_LOC}"]`).click();
  document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
}

describe('move-wizard OI-0135 live-remaining wiring', () => {
  beforeEach(seedBase);

  it('Step 3 Delivered hint reads live-remaining (most-recent check)', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    const hint = document.querySelector(`[data-testid="move-wizard-remaining-hint-${BATCH}-${SRC_LOC}"]`);
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/Delivered:\s*4/);
    expect(hint.textContent).not.toMatch(/Delivered:\s*10/);
  });

  it('no prior check → hint falls back to delivery total', () => {
    seedFeed({ delivered: 10, checkRemaining: null });
    driveToStep3();
    const hint = document.querySelector(`[data-testid="move-wizard-remaining-hint-${BATCH}-${SRC_LOC}"]`);
    expect(hint.textContent).toMatch(/Delivered:\s*10/);
  });

  it('Move writes entered remaining to destination, not live or delivery total', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = '3';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const newEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(newEntries).toHaveLength(1);
    expect(Number(newEntries[0].quantity)).toBe(3);
    expect(newEntries[0].sourceEventId).toBe(EVT);
  });
});

describe('move-wizard OI-0136 forced residual input', () => {
  beforeEach(seedBase);

  it('Remaining input is visible for Move and Residual and starts blank (no live prefill)', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    const testId = `move-wizard-residual-input-${BATCH}-${SRC_LOC}`;
    const input = document.querySelector(`[data-testid="${testId}"]`);
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
    const wrap = document.querySelector(`[data-testid="move-wizard-remaining-hint-${BATCH}-${SRC_LOC}"]`).parentElement;
    expect(wrap.style.display).not.toBe('none');

    document.querySelector(`[data-testid="move-wizard-transfer-residual-${BATCH}-${SRC_LOC}"]`).click();
    expect(input.value).toBe('');
    expect(wrap.style.display).not.toBe('none');

    document.querySelector(`[data-testid="move-wizard-transfer-move-${BATCH}-${SRC_LOC}"]`).click();
    expect(wrap.style.display).not.toBe('none');
  });

  it('Residual with blank input blocks Save', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    const itemsBefore = getAll('eventFeedCheckItems').length;
    const checksBefore = getAll('eventFeedChecks').length;
    driveToStep3();
    document.querySelector(`[data-testid="move-wizard-transfer-residual-${BATCH}-${SRC_LOC}"]`).click();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = '';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/remaining for every leftover stored-feed/i);
    // No new close-reading check + items written, no destination event.
    expect(getAll('eventFeedCheckItems').length).toBe(itemsBefore);
    expect(getAll('eventFeedChecks').length).toBe(checksBefore);
    expect(getAll('events').filter(e => e.id !== EVT)).toHaveLength(0);
  });

  it('Residual with negative input blocks Save', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    const itemsBefore = getAll('eventFeedCheckItems').length;
    driveToStep3();
    document.querySelector(`[data-testid="move-wizard-transfer-residual-${BATCH}-${SRC_LOC}"]`).click();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = '-1';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('eventFeedCheckItems').length).toBe(itemsBefore);
  });

  it('Residual with farmer-entered remaining writes the entered value', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    document.querySelector(`[data-testid="move-wizard-transfer-residual-${BATCH}-${SRC_LOC}"]`).click();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = '2.5';  // farmer walked paddock, corrected from 4 to 2.5
    document.querySelector('[data-testid="move-wizard-save"]').click();
    // The close-reading check created by Save is the only isCloseReading=true row.
    const closeReading = getAll('eventFeedChecks').find(c => c.eventId === EVT && c.isCloseReading);
    expect(closeReading).toBeTruthy();
    const items = getAll('eventFeedCheckItems').filter(i => i.feedCheckId === closeReading.id);
    expect(items).toHaveLength(1);
    expect(Number(items[0].remainingQuantity)).toBe(2.5);
    // Residual → no destination feed entry.
    const destEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(destEntries).toHaveLength(0);
  });

  it('Move with blank remaining blocks Save (OI-0259)', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    const eventsBefore = getAll('events').length;
    driveToStep3();
    document.querySelector(`[data-testid="move-wizard-transfer-move-${BATCH}-${SRC_LOC}"]`).click();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = '';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);
  });

  it('Move with NaN or negative remaining blocks Save', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    const eventsBefore = getAll('events').length;
    driveToStep3();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    input.value = 'abc';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    expect(document.querySelector('[data-testid="move-wizard-status"]').textContent)
      .toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);

    input.value = '-1';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    expect(document.querySelector('[data-testid="move-wizard-status"]').textContent)
      .toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);
  });
});
