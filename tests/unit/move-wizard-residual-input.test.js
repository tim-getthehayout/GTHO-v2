/** @file OI-0135 + OI-0136 — move-wizard forced residual input + live-remaining
 * wiring. Drives the real move-wizard DOM and verifies:
 *   - Step 3 "remaining: N unit" label reads live-remaining (most-recent check)
 *   - Move writes quantity = live-remaining to destination
 *   - Residual with blank/negative input blocks Save
 *   - Residual with valid farmer-corrected input writes the entered value
 *   - Move selection hides the residual input (no regression)
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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

  it('Step 3 "remaining: N unit" label reads live-remaining (most-recent check)', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    const label = document.querySelector(`[data-testid="move-wizard-transfer-label-${BATCH}-${SRC_LOC}"]`);
    expect(label).toBeTruthy();
    expect(label.textContent).toMatch(/remaining: 4/);
    expect(label.textContent).not.toMatch(/remaining: 10/);
  });

  it('no prior check → label falls back to delivery total', () => {
    seedFeed({ delivered: 10, checkRemaining: null });
    driveToStep3();
    const label = document.querySelector(`[data-testid="move-wizard-transfer-label-${BATCH}-${SRC_LOC}"]`);
    expect(label.textContent).toMatch(/remaining: 10/);
  });

  it('Move with prior check writes live-remaining to destination feed entry, not delivery total', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    // Move radio is the default — just save.
    document.querySelector('[data-testid="move-wizard-save"]').click();
    const newEntries = getAll('eventFeedEntries').filter(e => e.eventId !== EVT);
    expect(newEntries).toHaveLength(1);
    expect(Number(newEntries[0].quantity)).toBe(4);
  });
});

describe('move-wizard OI-0136 forced residual input', () => {
  beforeEach(seedBase);

  it('Residual radio reveals the required input, prefilled with live-remaining', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    const testId = `move-wizard-residual-input-${BATCH}-${SRC_LOC}`;
    const input = document.querySelector(`[data-testid="${testId}"]`);
    expect(input).toBeTruthy();
    expect(input.value).toBe('4');
    // Initially hidden (Move is default).
    expect(input.offsetParent === null || input.closest('div').style.display === 'none').toBe(true);

    document.querySelector(`[data-testid="move-wizard-transfer-residual-${BATCH}-${SRC_LOC}"]`).click();
    expect(input.closest('div').style.display).toBe('');
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
    expect(status.textContent).toMatch(/remaining for every residual/i);
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
    expect(status.textContent).toMatch(/remaining for every residual/i);
    expect(getAll('eventFeedCheckItems').length).toBe(itemsBefore);
  });

  it('Residual with farmer-corrected input writes the entered value, not the prefilled default', () => {
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

  it('Move selection has the residual input hidden and Save proceeds without reading it (no regression)', () => {
    seedFeed({ delivered: 10, checkRemaining: 4 });
    driveToStep3();
    // Explicitly click Move (it's the default, but exercise the change handler too).
    document.querySelector(`[data-testid="move-wizard-transfer-move-${BATCH}-${SRC_LOC}"]`).click();
    const input = document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
    // Even if the input had a blank value, Save must not block — it's hidden.
    input.value = '';
    document.querySelector('[data-testid="move-wizard-save"]').click();
    // Destination event created successfully.
    expect(getAll('events').filter(e => e.id !== EVT)).toHaveLength(1);
  });
});
