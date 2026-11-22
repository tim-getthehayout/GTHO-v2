/** @file OI-0259 — Move wizard Step 3 is the close feed check (schema 48 pools).
 *
 *   - Remaining input is visible for both Move and Residual and starts blank
 *   - Live remaining appears only as a Delivered/Started hint (OI-0119 style)
 *   - Blank / NaN / neg remaining blocks Save on both choices
 *   - Move stamps close-reading remaining = entered and dest pool_carry qty = entered
 *   - Residual stamps close-reading remaining = entered and writes no dest carry
 *   - Pasture-only / leftover 0: no radios (D N/A)
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
import { RELEASED_SCHEMA_VERSION } from '../../src/data/schema-release.js';

const OP = '00000000-0000-0000-0000-000000003aa1';
const FARM = '00000000-0000-0000-0000-000000003bb1';
const SRC_LOC = '00000000-0000-0000-0000-000000003c11';
const DST_LOC = '00000000-0000-0000-0000-000000003c12';
const EVT = '00000000-0000-0000-0000-000000003d11';
const SRC_PW = '00000000-0000-0000-0000-000000003e11';
const GROUP = '00000000-0000-0000-0000-000000003f11';
const GW = '00000000-0000-0000-0000-000000003101';
const FEED_TYPE = '00000000-0000-0000-0000-000000003f21';
const BATCH = '00000000-0000-0000-0000-000000003f22';

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
    id: EVT, operationId: OP, farmId: FARM, type: 'graze',
    dateIn: '2026-04-01', dateOut: null,
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
    const aid = `00000000-0000-0000-0000-0000000b3${i.toString().padStart(2, '0')}`;
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
    id: FEED_TYPE, operationId: OP, name: 'Grass Hay', category: 'hay', unit: 'bale',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'Hay Batch 1',
    quantity: 20, remaining: 5, unit: 'bale', weightPerUnitKg: 500, dmPct: 90,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: SRC_LOC,
    date: '2026-04-02', time: '09:00', quantity: delivered,
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

function inputEl() {
  return document.querySelector(`[data-testid="move-wizard-residual-input-${FEED_TYPE}-${SRC_LOC}"]`)
    || document.querySelector(`[data-testid="move-wizard-residual-input-${BATCH}-${SRC_LOC}"]`);
}

function hintEl() {
  return document.querySelector(`[data-testid="move-wizard-remaining-hint-${FEED_TYPE}-${SRC_LOC}"]`)
    || document.querySelector(`[data-testid="move-wizard-remaining-hint-${BATCH}-${SRC_LOC}"]`);
}

function closeReadingItems() {
  const closeReading = getAll('eventFeedChecks').find(c => c.eventId === EVT && c.isCloseReading);
  if (!closeReading) return { closeReading: null, items: [] };
  return {
    closeReading,
    items: getAll('eventFeedCheckItems').filter(i => i.feedCheckId === closeReading.id),
  };
}

function destCarryEntries() {
  return getAll('eventFeedEntries').filter(e => e.eventId !== EVT && (e.kind === 'pool_carry' || e.sourceEventId === EVT));
}

describe('OI-0259 Move Step 3 close feed check (schema 48 pools)', () => {
  beforeEach(() => {
    expect(RELEASED_SCHEMA_VERSION).toBeGreaterThanOrEqual(48);
    seedBase();
  });

  it('shows remaining input for both Move and Residual, blank, with Delivered hint only', () => {
    seedFeed({ delivered: 10, checkRemaining: 7 });
    driveToStep3();
    const input = inputEl();
    const hint = hintEl();
    expect(input).toBeTruthy();
    expect(input.value).toBe('');
    expect(hint).toBeTruthy();
    expect(hint.textContent).toMatch(/Delivered:\s*7/);
    expect(hint.parentElement.style.display).not.toBe('none');

    const residualRadio = document.querySelector(`[data-testid^="move-wizard-transfer-residual-"]`);
    residualRadio.click();
    expect(input.value).toBe('');
    expect(hint.parentElement.style.display).not.toBe('none');
  });

  it('blocks Save on Move when remaining is blank, NaN, or negative', () => {
    seedFeed({ delivered: 10, checkRemaining: 7 });
    const eventsBefore = getAll('events').length;
    driveToStep3();
    const input = inputEl();
    const save = () => document.querySelector('[data-testid="move-wizard-save"]').click();
    const status = () => document.querySelector('[data-testid="move-wizard-status"]').textContent;

    input.value = '';
    save();
    expect(status()).toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);

    input.value = 'nope';
    save();
    expect(status()).toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);

    input.value = '-2';
    save();
    expect(status()).toMatch(/remaining for every leftover stored-feed/i);
    expect(getAll('events')).toHaveLength(eventsBefore);
  });

  it('Move uses entered qty for close-reading remaining and dest pool_carry (not live total)', () => {
    seedFeed({ delivered: 10, checkRemaining: 7 });
    driveToStep3();
    inputEl().value = '5';
    document.querySelector('[data-testid="move-wizard-save"]').click();

    const status = document.querySelector('[data-testid="move-wizard-status"]');
    expect(status.textContent).not.toMatch(/remaining for every leftover/i);
    expect(status.textContent).not.toMatch(/unavailable/i);

    const { closeReading, items } = closeReadingItems();
    expect(closeReading).toBeTruthy();
    expect(items).toHaveLength(1);
    expect(Number(items[0].remainingQuantity)).toBe(5);

    const dest = destCarryEntries();
    expect(dest).toHaveLength(1);
    expect(Number(dest[0].quantity)).toBe(5);
    expect(dest[0].sourceEventId).toBe(EVT);
    expect(dest[0].kind).toBe('pool_carry');
  });

  it('Residual uses entered qty for close-reading and writes no dest carry', () => {
    seedFeed({ delivered: 10, checkRemaining: 7 });
    driveToStep3();
    document.querySelector(`[data-testid^="move-wizard-transfer-residual-"]`).click();
    inputEl().value = '4';
    document.querySelector('[data-testid="move-wizard-save"]').click();

    const { closeReading, items } = closeReadingItems();
    expect(closeReading).toBeTruthy();
    expect(items).toHaveLength(1);
    expect(Number(items[0].remainingQuantity)).toBe(4);
    expect(destCarryEntries()).toHaveLength(0);
  });

  it('pasture-only events show no leftover radios and Save proceeds', () => {
    driveToStep3();
    expect(document.querySelector('[data-testid^="move-wizard-transfer-move-"]')).toBeNull();
    expect(document.querySelector('[data-testid^="move-wizard-residual-input-"]')).toBeNull();
    document.querySelector('[data-testid="move-wizard-save"]').click();
    expect(getAll('events').filter(e => e.id !== EVT)).toHaveLength(1);
  });

  it('leftover 0 / zero-live still skips radios (OI-0162 caveat)', () => {
    seedFeed({ delivered: 10, checkRemaining: 0 });
    driveToStep3();
    expect(document.querySelector('[data-testid^="move-wizard-transfer-move-"]')).toBeNull();
    expect(document.querySelector('[data-testid="move-wizard-feed-transfer-all-zero"]')).toBeTruthy();
  });
});
