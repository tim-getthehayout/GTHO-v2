/** @file Multi-paddock dashboard forage aggregation (A1+B1+C1) + DMI prior-event label (D1). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getById } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import '../../../src/calcs/core.js';
import '../../../src/calcs/feed-forage.js';
import { getCalcByName } from '../../../src/utils/calc-registry.js';
import { pickPreGraze, aggregateOpenPaddockForage } from '../../../src/calcs/feed-forage.js';
import { buildLocationCard } from '../../../src/features/dashboard/index.js';
import { buildDmi8ChartContext, computeDmi8Days } from '../../../src/features/events/dmi-chart-context.js';
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
import * as PaddockObsEntity from '../../../src/entities/paddock-observation.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const FORAGE = '00000000-0000-0000-0000-0000000000cc';
const CLASS = '00000000-0000-0000-0000-0000000000cd';
const GROUP = '00000000-0000-0000-0000-000000000101';
const GW = '00000000-0000-0000-0000-000000000102';
const ANIMAL = '00000000-0000-0000-0000-000000000201';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const SRC_EVT = '00000000-0000-0000-0000-0000000000e2';
const LOC1 = '00000000-0000-0000-0000-0000000000d1';
const LOC2 = '00000000-0000-0000-0000-0000000000d2';
const LOC3 = '00000000-0000-0000-0000-0000000000d3';
const PW1 = '00000000-0000-0000-0000-0000000000f1';
const PW2 = '00000000-0000-0000-0000-0000000000f2';
const PW3 = '00000000-0000-0000-0000-0000000000f3';
const PW_SRC = '00000000-0000-0000-0000-0000000000f4';

function inchToCm(inches) {
  return inches * 2.54;
}

function seedBase() {
  _reset();
  setLocale('en', en);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('forageTypes', ForageTypeEntity.create({
    id: FORAGE, operationId: OP, name: 'Mixed',
    dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS, operationId: OP, name: 'Sheep', species: 'sheep', role: 'ewe',
    dmiPct: 2.5, defaultWeightKg: 70,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Flock' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animals', AnimalEntity.create({
    id: ANIMAL, operationId: OP, classId: CLASS, sex: 'female', active: true,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: ANIMAL, groupId: GROUP, dateJoined: '2026-11-10',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function addLoc(id, name, areaHa) {
  add('locations', LocationEntity.create({
    id, operationId: OP, farmId: FARM, name,
    type: 'land', landUse: 'pasture', areaHectares: areaHa, forageTypeId: FORAGE,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function addPw(id, eventId, locationId, dateOpened = '2026-11-10') {
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id, operationId: OP, eventId, locationId,
    dateOpened, timeOpened: '08:00', areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
}

function addObs(locationId, sourceId, heightIn, coverPct = 80) {
  add('paddockObservations', PaddockObsEntity.create({
    operationId: OP, locationId, type: 'open', source: 'event', sourceId,
    observedAt: '2026-11-10T08:00:00Z',
    forageHeightCm: inchToCm(heightIn), forageCoverPct: coverPct,
  }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
}

function for1() {
  return getCalcByName('FOR-1').fn;
}

describe('aggregateOpenPaddockForage A1+B1+C1', () => {
  beforeEach(seedBase);

  it('sums FOR-1 per open PW and area-weights height when heights differ', () => {
    // Equal 1 ha paddocks at 9 / 6 / 8 in → weighted 7.666… in; not primary-only 9.
    const openPws = [
      { id: PW1, locationId: LOC1, areaPct: 100 },
      { id: PW2, locationId: LOC2, areaPct: 100 },
      { id: PW3, locationId: LOC3, areaPct: 100 },
    ];
    const observations = [
      { locationId: LOC1, type: 'open', source: 'event', sourceId: PW1, forageHeightCm: inchToCm(9), forageCoverPct: 80 },
      { locationId: LOC2, type: 'open', source: 'event', sourceId: PW2, forageHeightCm: inchToCm(6), forageCoverPct: 80 },
      { locationId: LOC3, type: 'open', source: 'event', sourceId: PW3, forageHeightCm: inchToCm(8), forageCoverPct: 80 },
    ];
    const locations = {
      [LOC1]: { areaHa: 1, type: 'land' },
      [LOC2]: { areaHa: 1, type: 'land' },
      [LOC3]: { areaHa: 1, type: 'land' },
    };
    const forageTypes = {
      [LOC1]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 },
      [LOC2]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 },
      [LOC3]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 },
    };

    const agg = aggregateOpenPaddockForage(openPws, {
      observations, locations, forageTypes, for1Fn: for1(),
    });

    const dm1 = for1()({
      forageHeightCm: inchToCm(9), residualHeightCm: 5, areaHectares: 1,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
    });
    const dm2 = for1()({
      forageHeightCm: inchToCm(6), residualHeightCm: 5, areaHectares: 1,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
    });
    const dm3 = for1()({
      forageHeightCm: inchToCm(8), residualHeightCm: 5, areaHectares: 1,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
    });
    expect(agg.availableDmKg).toBeCloseTo(dm1 + dm2 + dm3, 6);
    // Not primary-only (9 in → cm)
    expect(agg.heightCm).not.toBeCloseTo(inchToCm(9), 5);
    expect(agg.heightCm).toBeCloseTo((inchToCm(9) + inchToCm(6) + inchToCm(8)) / 3, 6);
    expect(agg.partial).toBe(false);
  });

  it('C1: missing pre-graze contributes 0 DM; height weighted only over PWs with height; partial', () => {
    const openPws = [
      { id: PW1, locationId: LOC1, areaPct: 100 },
      { id: PW2, locationId: LOC2, areaPct: 100 },
    ];
    const observations = [
      { locationId: LOC1, type: 'open', source: 'event', sourceId: PW1, forageHeightCm: inchToCm(10), forageCoverPct: 80 },
      // PW2 intentionally has no observation
    ];
    const locations = {
      [LOC1]: { areaHa: 2, type: 'land' },
      [LOC2]: { areaHa: 2, type: 'land' },
    };
    const forageTypes = {
      [LOC1]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 },
      [LOC2]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 },
    };
    const agg = aggregateOpenPaddockForage(openPws, {
      observations, locations, forageTypes, for1Fn: for1(),
    });
    const onlyFirst = for1()({
      forageHeightCm: inchToCm(10), residualHeightCm: 5, areaHectares: 2,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
    });
    expect(agg.availableDmKg).toBeCloseTo(onlyFirst, 6);
    expect(agg.heightCm).toBeCloseTo(inchToCm(10), 6);
    expect(agg.missingPreGraze).toBe(1);
    expect(agg.partial).toBe(true);
    expect(pickPreGraze(openPws[1], observations)).toBeNull();
  });

  it('single open PW matches one FOR-1 call (regression)', () => {
    const openPws = [{ id: PW1, locationId: LOC1, areaPct: 100 }];
    const observations = [
      { locationId: LOC1, type: 'open', source: 'event', sourceId: PW1, forageHeightCm: 25, forageCoverPct: 80 },
    ];
    const locations = { [LOC1]: { areaHa: 2, type: 'land' } };
    const forageTypes = { [LOC1]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5 } };
    const agg = aggregateOpenPaddockForage(openPws, {
      observations, locations, forageTypes, for1Fn: for1(),
    });
    const solo = for1()({
      forageHeightCm: 25, residualHeightCm: 5, areaHectares: 2,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
    });
    expect(agg.availableDmKg).toBeCloseTo(solo, 6);
    expect(agg.heightCm).toBeCloseTo(25, 6);
  });
});

describe('buildLocationCard multi-paddock capacity line', () => {
  beforeEach(() => {
    seedBase();
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW, operationId: OP, eventId: EVT, groupId: GROUP,
      dateJoined: '2026-11-10', timeJoined: '08:00', headCount: 10, avgWeightKg: 70,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  });

  it('shows area-weighted height, not openPws[0] alone', () => {
    addLoc(LOC1, 'F-1', 1);
    addLoc(LOC2, 'F-2', 1);
    addPw(PW1, EVT, LOC1);
    addPw(PW2, EVT, LOC2);
    addObs(LOC1, PW1, 9);
    addObs(LOC2, PW2, 6);

    const text = buildLocationCard(getById('events', EVT), OP, FARM, 'imperial').textContent;
    // Weighted = 7.5 in (not primary-only 9.0). display() may include the unit token.
    expect(text).toMatch(/7\.5/);
    expect(text).not.toMatch(/9\.0/);
    expect(text).toMatch(/Est\. capacity:/);
  });

  it('C1 partial: missing pre-graze still shows capacity from other PWs', () => {
    addLoc(LOC1, 'F-1', 1);
    addLoc(LOC2, 'F-2', 1);
    addPw(PW1, EVT, LOC1);
    addPw(PW2, EVT, LOC2);
    addObs(LOC1, PW1, 10);
    // no obs for PW2
    const text = buildLocationCard(getById('events', EVT), OP, FARM, 'imperial').textContent;
    expect(text).toMatch(/Est\. capacity:/);
    expect(text).toMatch(/partial pre-graze/);
  });
});

describe('computeDmi8Days D1 prior-event label', () => {
  beforeEach(() => {
    seedBase();
    addLoc(LOC1, 'G1', 2);
    add('events', EventEntity.create({
      id: SRC_EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: '2026-04-09',
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      id: PW_SRC, operationId: OP, eventId: SRC_EVT, locationId: LOC1,
      dateOpened: '2026-04-01', dateClosed: '2026-04-09', timeOpened: '08:00', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('events', EventEntity.create({
      id: EVT, operationId: OP, farmId: FARM, type: 'graze', dateOut: null, sourceEventId: SRC_EVT,
    }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    addPw(PW1, EVT, LOC1, '2026-04-10');
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC1, type: 'open', source: 'event', sourceId: PW1,
      observedAt: '2026-04-10T08:30:00Z', forageHeightCm: 25, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC1, type: 'open', source: 'event', sourceId: PW_SRC,
      observedAt: '2026-04-01T08:00:00Z', forageHeightCm: 25, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
  });

  it('labels sourceEventId cascade days as prior event', () => {
    const dmi8 = getCalcByName('DMI-8');
    const event = buildDmi8ChartContext(EVT).event;
    const days = computeDmi8Days(event, dmi8, { today: '2026-04-11' });
    expect(days).toHaveLength(3);
    expect(days[0].date).toBe('2026-04-09');
    expect(days[0].fromPriorEvent).toBe(true);
    expect(days[0].label).toMatch(/prior event/);
    expect(days[1].fromPriorEvent).toBe(false);
    expect(days[1].label).not.toMatch(/prior event/);
  });
});
