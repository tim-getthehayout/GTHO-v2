/** @file Feed Day Goal card: run-rate section mounted on the real Feed screen. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import { getLocalTodayStr } from '../../../../src/utils/date-utils.js';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../../src/entities/event-feed-entry.js';
import * as CheckEntity from '../../../../src/entities/event-feed-check.js';
import * as CheckItemEntity from '../../../../src/entities/event-feed-check-item.js';
import * as PaddockWindowEntity from '../../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../../src/entities/event-group-window.js';
import * as GroupEntity from '../../../../src/entities/group.js';
import * as MembershipEntity from '../../../../src/entities/animal-group-membership.js';
import * as AnimalClassEntity from '../../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../../src/entities/animal.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC = '00000000-0000-0000-0000-0000000001a1';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const GROUP = '00000000-0000-0000-0000-0000000000d1';
const CLS = '00000000-0000-0000-0000-0000000000c1';
const HERD = '00000000-0000-0000-0000-0000000000a1';

function localDay(offset) {
  const base = new Date(`${getLocalTodayStr()}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}
const put = (collection, entity, data, table) => add(collection, entity.create({ operationId: OP, ...data }), entity.validate, entity.toSupabaseShape, table);
const snap = { feedTypeId: FT, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80 };

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }), OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  put('farms', FarmEntity, { id: FARM, name: 'Farm' }, 'farms');
  put('locations', LocationEntity, { id: LOC, farmId: FARM, name: 'North', type: 'land' }, 'locations');
  put('events', EventEntity, { id: EVT, farmId: FARM }, 'events');
  put('eventPaddockWindows', PaddockWindowEntity, { eventId: EVT, locationId: LOC, dateOpened: localDay(-29) }, 'event_paddock_windows');
  put('feedTypes', FeedTypeEntity, { id: FT, name: 'Grass Hay', category: 'forage', unit: 'bale', dmPct: 80 }, 'feed_types');
  put('batches', BatchEntity, { id: BATCH, feedTypeId: FT, name: 'Hay', unit: 'bale', quantity: 50, remaining: 35, weightPerUnitKg: 500, dmPct: 80, costPerUnit: 60 }, 'batches');
  put('eventFeedEntries', FeedEntryEntity, { eventId: EVT, batchId: BATCH, locationId: LOC, date: localDay(-29), time: '09:00', quantity: 10, kind: 'inventory_feeding', ...snap }, 'event_feed_entries');
  put('eventFeedEntries', FeedEntryEntity, { eventId: EVT, batchId: BATCH, locationId: LOC, date: localDay(-20), time: '09:00', quantity: 5, kind: 'inventory_feeding', ...snap }, 'event_feed_entries');
  for (const [id, day, q] of [['00000000-0000-0000-0000-00000000c001', -25, 6], ['00000000-0000-0000-0000-00000000c002', -15, 1]]) {
    put('eventFeedChecks', CheckEntity, { id, eventId: EVT, date: localDay(day), time: '12:00' }, 'event_feed_checks');
    put('eventFeedCheckItems', CheckItemEntity, { feedCheckId: id, locationId: LOC, remainingQuantity: q, ...snap }, 'event_feed_check_items');
  }
  put('animalClasses', AnimalClassEntity, { id: CLS, name: 'Cow', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 500 }, 'animal_classes');
  put('animals', AnimalEntity, { id: HERD, sex: 'female', active: true, classId: CLS, isBulk: true, bulkHeadCount: 10 }, 'animals');
  put('groups', GroupEntity, { id: GROUP, name: 'Herd' }, 'groups');
  put('animalGroupMemberships', MembershipEntity, { animalId: HERD, groupId: GROUP, dateJoined: localDay(-29) }, 'animal_group_memberships');
  put('eventGroupWindows', GroupWindowEntity, { eventId: EVT, groupId: GROUP, dateJoined: localDay(-29), headCount: 10, avgWeightKg: 500, animalClassId: CLS }, 'event_group_windows');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  return container;
}
const text = id => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;

describe('feed run rate on the Feed Day Goal card', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    globalThis.localStorage?.clear();
  });

  it('shows measured bales/day, consumed, residual, DMI vs forecast, and the renamed need cell', () => {
    seed();
    mount();
    expect(text('feed-run-rate')).toContain('Daily need (DMI)');
    expect(document.querySelector('[data-testid="feed-run-rate-pill-30"]').getAttribute('aria-pressed')).toBe('true');
    expect(text('feed-run-rate-line')).toBe('Run rate: 1 round bales/day · 400 kg DM/day');
    expect(text('feed-run-rate-measured')).toBe(`Measured 10 of 30 days, through ${localDay(-15)}`);
    expect(text('feed-run-rate-consumed')).toContain('10 round bales');
    expect(text('feed-run-rate-consumed')).toContain('4000 kg DM');
    expect(text('feed-run-rate-consumed')).toContain('$600');
    expect(text('feed-run-rate-residual')).toContain('No events closed in the last 30 days');
    expect(text('feed-run-rate-dmi')).toBe('DMI: actual 400 kg DM/day vs forecast 125 kg DM/day (320%)');
  });

  it('pills switch the window, show the empty state without zeros, and are remembered on the device', () => {
    seed();
    mount();
    document.querySelector('[data-testid="feed-run-rate-pill-7"]').click();
    expect(text('feed-run-rate-empty')).toBe('No feed checks in the last 7 days. Run rate needs two checks of the same feed.');
    expect(text('feed-run-rate-line')).toBeNull();
    expect(text('feed-run-rate-consumed')).toBeNull();
    expect(text('feed-run-rate-dmi')).toBeNull();
    document.body.replaceChildren();
    mount();
    expect(document.querySelector('[data-testid="feed-run-rate-pill-7"]').getAttribute('aria-pressed')).toBe('true');
  });
});
