/** @file Location-card pasture floor and remaining hay. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import '../../../src/calcs/core.js';
import '../../../src/calcs/feed-forage.js';
import { getCalcByName } from '../../../src/utils/calc-registry.js';
import { buildLocationCard, eventStoredFeedDm } from '../../../src/features/dashboard/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as ForageTypeEntity from '../../../src/entities/forage-type.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as FeedTypeEntity from '../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../src/entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../../src/entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../../src/entities/event-feed-check-item.js';
import * as PaddockObsEntity from '../../../src/entities/paddock-observation.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const FORAGE = '00000000-0000-0000-0000-0000000000cc';
const CLASS = '00000000-0000-0000-0000-0000000000cd';
const LOC = '00000000-0000-0000-0000-0000000000d1';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const PW = '00000000-0000-0000-0000-0000000000f1';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';
const ANIMAL = '00000000-0000-0000-0000-000000000201';
const FT = '00000000-0000-0000-0000-000000000111';
const BATCH = '00000000-0000-0000-0000-000000000112';
const BATCH_B = '00000000-0000-0000-0000-000000000113';

const WPU = 272.15574566138383;
const LB = 2.20462;

function seedShell() {
  _reset();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('forageTypes', ForageTypeEntity.create({
    id: FORAGE, operationId: OP, name: 'Mixed',
    dmKgPerCmPerHa: 88.24, minResidualHeightCm: 7.62, utilizationPct: 70,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
    dmiPct: 2.5, defaultWeightKg: 400,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animals', AnimalEntity.create({
    id: ANIMAL, operationId: OP, classId: CLASS, sex: 'female', active: true,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: ANIMAL, groupId: GROUP, dateJoined: '2026-11-02',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'E - 1',
    type: 'land', landUse: 'pasture', areaHectares: 1.47, forageTypeId: FORAGE,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW, operationId: OP, eventId: EVT, locationId: LOC,
    dateOpened: '2026-11-02', timeOpened: '10:00', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
    dateJoined: '2026-11-02', timeJoined: '10:00', headCount: 1, avgWeightKg: 400,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('paddockObservations', PaddockObsEntity.create({
    operationId: OP, locationId: LOC, type: 'open', source: 'event', sourceId: PW,
    observedAt: '2026-11-02T10:00:00Z', forageHeightCm: 15.24, forageCoverPct: 90,
  }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
  add('feedTypes', FeedTypeEntity.create({
    id: FT, operationId: OP, name: 'Round bale', category: 'forage', unit: 'bale', dmPct: 85,
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
}

function addBatch(id) {
  add('batches', BatchEntity.create({
    id, operationId: OP, feedTypeId: FT, name: 'Grass Hay',
    unit: 'bale', quantity: 90, remaining: 0, weightPerUnitKg: WPU, dmPct: 90, costPerUnit: 56,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

function addDelivery(batchId, quantity, date, time) {
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId, locationId: LOC,
    date, time, quantity, entryType: 'delivery',
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function cardText() {
  return buildLocationCard({ id: EVT }, OP, FARM, 'imperial').textContent;
}

describe('grazing event card DMI floor', () => {
  beforeEach(() => {
    setLocale('en', en);
    seedShell();
    addBatch(BATCH);
    addBatch(BATCH_B);
  });

  it('floors pasture at 0 when stored feed exceeds demand', () => {
    addDelivery(BATCH, 40, '2026-11-02', '11:00');
    const text = cardText();
    expect(text).toMatch(/Pasture:\s*0\s*lbs DM/);
    expect(text).not.toMatch(/Pasture:\s*-/);
    const stored = text.match(/Stored feed:\s*([\d,]+)\s*lbs DM/);
    expect(parseInt(stored[1].replace(/,/g, ''), 10)).toBe(21600);
  });

  it('an ordinary check replaces the delivery projection with the measured residual', () => {
    addDelivery(BATCH, 10, '2026-11-02', '11:00');
    const before = cardText();
    const beforeStored = parseInt(before.match(/Stored feed:\s*([\d,]+)/)[1].replace(/,/g, ''), 10);
    const beforeDays = parseFloat(before.match(/~([\d.]+) days remaining/)[1]);
    expect(before).toContain('(incl. stored feed)');

    const check = FeedCheckEntity.create({
      operationId: OP, eventId: EVT, date: '2026-11-05', time: '09:00', isCloseReading: false,
    });
    add('eventFeedChecks', check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP, feedCheckId: check.id, batchId: BATCH, locationId: LOC, remainingQuantity: 6,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');

    const after = cardText();
    const afterStored = parseInt(after.match(/Stored feed:\s*([\d,]+)/)[1].replace(/,/g, ''), 10);
    const afterDays = parseFloat(after.match(/~([\d.]+) days remaining/)[1]);
    expect(afterStored).toBeLessThan(beforeStored);
    expect(afterDays).toBeGreaterThan(0);
    expect(afterDays).toBeLessThan(beforeDays);
    expect(after).toContain('(incl. stored feed)');
    expect(after).not.toMatch(/Pasture:\s*-/);
  });

  it('counts deliveries after the check as remaining, not consumed', () => {
    const check = FeedCheckEntity.create({
      operationId: OP, eventId: EVT, date: '2026-11-05', time: '09:00', isCloseReading: false,
    });
    add('eventFeedChecks', check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP, feedCheckId: check.id, batchId: BATCH, locationId: LOC, remainingQuantity: 2.5,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
    addDelivery(BATCH, 7, '2026-11-05', '10:00');
    addDelivery(BATCH_B, 5, '2026-11-05', '10:00');

    const mass = eventStoredFeedDm(EVT);
    const baleDm = WPU * 0.9;
    expect(mass.remainingStoredDmKg).toBeCloseTo(14.5 * baleDm, 4);
    expect(mass.storedConsumedKg).toBeCloseTo(0, 4);
    const text = cardText();
    expect(text).toContain('(incl. stored feed)');
    expect(text).toMatch(/Stored feed:\s*0\s*lbs DM/);
  });

  it('reproduces event eeb2febe intermediates from the recorded bale sequence', () => {
    addDelivery(BATCH, 2, '2026-11-02', '10:00');
    addDelivery(BATCH, 12, '2026-11-02', '11:00');
    const check = FeedCheckEntity.create({
      operationId: OP, eventId: EVT, date: '2026-11-05', time: '09:00', isCloseReading: false,
    });
    add('eventFeedChecks', check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
    add('eventFeedCheckItems', FeedCheckItemEntity.create({
      operationId: OP, feedCheckId: check.id, batchId: BATCH, locationId: LOC, remainingQuantity: 2.5,
    }), FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
    addDelivery(BATCH, 7, '2026-11-05', '10:00');
    addDelivery(BATCH_B, 5, '2026-11-05', '10:00');

    const mass = eventStoredFeedDm(EVT);
    expect(Math.round(mass.netDeliveredDmKg * LB)).toBe(14040);
    expect(Math.round(mass.storedConsumedKg * LB)).toBe(6210);
    expect(Math.round(mass.remainingStoredDmKg * LB)).toBe(7830);

    const dailyKg = 499.1780996756629;
    const availableKg = 891.420456614783;
    const split = getCalcByName('DMI-4').fn({
      totalDmiKg: dailyKg * 4,
      storedConsumedKg: mass.storedConsumedKg,
      availablePastureDmKg: availableKg,
    });
    expect(split.pastureDmiKg).toBe(0);
    expect(Math.round(split.pastureDmiKg * LB)).toBe(0);
    const days = getCalcByName('FOR-4').fn({
      remainingStoredDmKg: mass.remainingStoredDmKg,
      forageEstimateKg: Math.max(0, availableKg - split.pastureDmiKg),
      groupDmiKgPerDay: dailyKg,
    });
    expect(days).toBeCloseTo(8.9, 1);
  });
});
