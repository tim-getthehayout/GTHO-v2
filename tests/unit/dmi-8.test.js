/** @file Tests for DMI-8 cascade model (OI-0119 rewrite).
 *
 * These cover the five statuses + edge cases. The dedicated cascade
 * allocation-table walk lives in tests/unit/dmi-8-cascade.test.js.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';

import '../../src/calcs/feed-forage.js';

const EVT = 'evt-1';
const LOC = 'loc-1';
const PW = 'pw-1';

const baseEvent = { id: EVT, dateIn: '2026-04-10', dateOut: null, sourceEventId: null };
const baseGw = [{ headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: null }];
const basePw = [{ id: PW, eventId: EVT, locationId: LOC, dateOpened: '2026-04-10', dateClosed: null, areaPct: 100 }];
const baseObs = [{ id: 'obs-1', locationId: LOC, type: 'open', source: 'event', sourceId: PW, forageHeightCm: 25, forageCoverPct: 80, createdAt: '2026-04-10T00:00:00Z' }];
const baseFt = { [LOC]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 } };
const baseLoc = { [LOC]: { areaHa: 2 } };

function run(overrides = {}) {
  const dmi8 = getCalcByName('DMI-8');
  return dmi8.fn({
    event: baseEvent,
    date: '2026-04-11',
    groupWindows: baseGw,
    memberships: null, animals: [], animalWeightRecords: [],
    feedEntries: [], feedChecks: [], feedCheckItems: [],
    batches: {},
    paddockWindows: basePw,
    observations: baseObs,
    forageTypes: baseFt,
    locations: baseLoc,
    animalClasses: {},
    ...overrides,
  });
}

describe('DMI-8: cascade model', () => {
  let dmi8;
  beforeAll(() => { dmi8 = getCalcByName('DMI-8'); });

  it('is registered', () => {
    expect(dmi8).toBeDefined();
    expect(dmi8.name).toBe('DMI-8');
  });

  describe('no_animals status', () => {
    it('returns no_animals when group windows have no active groups on date', () => {
      const result = run({ groupWindows: [] });
      expect(result.status).toBe('no_animals');
    });

    it('returns no_animals when a group that left before date is the only group', () => {
      const result = run({
        groupWindows: [{ headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: '2026-04-11' }],
        date: '2026-04-12',
      });
      expect(result.status).toBe('no_animals');
    });

    it('returns no_animals when no paddock windows are open on date', () => {
      const result = run({ paddockWindows: [] });
      expect(result.status).toBe('no_animals');
    });
  });

  describe('no_pasture_data status', () => {
    it('returns no_pasture_data/missing_forage_type when forage type is missing', () => {
      const result = run({ forageTypes: {} });
      expect(result.status).toBe('no_pasture_data');
      expect(result.reason).toBe('missing_forage_type');
      expect(result.pwId).toBe(PW);
      expect(result.locationId).toBe(LOC);
    });

    it('returns no_pasture_data/missing_forage_type when location area is missing', () => {
      const result = run({ locations: {} });
      expect(result.status).toBe('no_pasture_data');
      expect(result.reason).toBe('missing_forage_type');
    });

    it('returns no_pasture_data/missing_observation when no pre-graze observation exists', () => {
      const result = run({ observations: [] });
      expect(result.status).toBe('no_pasture_data');
      expect(result.reason).toBe('missing_observation');
    });

    it('returns no_pasture_data/missing_observation when forageHeightCm is null', () => {
      const obs = [{ ...baseObs[0], forageHeightCm: null }];
      const result = run({ observations: obs });
      expect(result.status).toBe('no_pasture_data');
      expect(result.reason).toBe('missing_observation');
    });
  });

  describe('hint: assumed_full_cover', () => {
    it('emits hint=assumed_full_cover when cover is null but height present', () => {
      const obs = [{ ...baseObs[0], forageCoverPct: null }];
      const result = run({ observations: obs, date: '2026-04-10' });
      expect(result.status).toBe('estimated');
      expect(result.hint).toBe('assumed_full_cover');
    });
  });

  describe('estimated status (pure cascade, no checks)', () => {
    it('day 1 of event: pasture covers full demand from seeded FOR-1', () => {
      // FOR-1 = (25-5) * 2 * (80/100) * (100/100) * 110 = 3520 kg. Demand 250/day.
      const result = run({ date: '2026-04-10' });
      expect(result.status).toBe('estimated');
      expect(result.totalDmiKg).toBe(250);
      expect(result.pastureDmiKg).toBe(250);
      expect(result.storedDmiKg).toBe(0);
      expect(result.deficitKg).toBe(0);
    });

    it('small paddock exhausts pasture → stored takes over (no stored = deficit)', () => {
      // dmKgPerCmPerHa = 15.625 → FOR-1 = 500 kg. Demand 250/day.
      // Day 1 consumes 250 → 250 left. Day 2 consumes 250 → 0 left.
      // Day 3 (target): pasture 0, stored 0 → deficit 250.
      const smallFt = { [LOC]: { dmKgPerCmPerHa: 15.625, minResidualHeightCm: 5, utilizationPct: 100 } };
      const result = run({ forageTypes: smallFt, date: '2026-04-12' });
      expect(result.status).toBe('estimated');
      expect(result.pastureDmiKg).toBe(0);
      expect(result.storedDmiKg).toBe(0);
      expect(result.deficitKg).toBe(250);
    });

    it('partial pasture on day 2: remaining covers part of demand, stored fills the rest (if delivered)', () => {
      // FOR-1 = 375 kg. Demand 250.
      // Day 1 consumes 250 → 125 left. Day 2: pasture=125, shortfall=125.
      // With one delivery of 500 kg stored on day 1 (500 kg DM via batch 1*1),
      // stored bucket = 500. Day 1 uses pasture only (250 sufficient).
      // Day 2 uses pasture 125 + stored 125 → deficit 0.
      const partialFt = { [LOC]: { dmKgPerCmPerHa: 11.71875, minResidualHeightCm: 5, utilizationPct: 100 } };
      const feedEntries = [{ id: 'fe-1', batchId: 'b-1', locationId: LOC, date: '2026-04-10', quantity: 500 }];
      const batches = { 'b-1': { weightPerUnitKg: 1, dmPct: 100 } };
      const result = run({ forageTypes: partialFt, feedEntries, batches, date: '2026-04-11' });
      expect(result.status).toBe('estimated');
      expect(result.pastureDmiKg).toBe(125);
      expect(result.storedDmiKg).toBe(125);
      expect(result.deficitKg).toBe(0);
    });
  });

  describe('actual status (feed checks present)', () => {
    it('returns actual when two checks bracket the date — DMI-5 linear distribution', () => {
      // prev check day 11 with 200 kg DM remaining; next check day 13 with 150 kg.
      // daysBetween = 2. No deliveries. storedDmiKg = (200-150)/2 = 25 kg/day.
      const batches = { 'b-1': { weightPerUnitKg: 1, dmPct: 100 } };
      const feedChecks = [
        { id: 'chk-1', date: '2026-04-11' },
        { id: 'chk-2', date: '2026-04-13' },
      ];
      const feedCheckItems = [
        { feedCheckId: 'chk-1', batchId: 'b-1', locationId: LOC, remainingQuantity: 200 },
        { feedCheckId: 'chk-2', batchId: 'b-1', locationId: LOC, remainingQuantity: 150 },
      ];
      const result = run({ batches, feedChecks, feedCheckItems, date: '2026-04-12' });
      expect(result.status).toBe('actual');
      expect(result.totalDmiKg).toBe(250);
      expect(result.storedDmiKg).toBe(25);
      expect(result.pastureDmiKg).toBe(225);
      expect(result.deficitKg).toBe(0);
    });

    it('single check before date → status=actual (cascade seeded from check)', () => {
      // One check on day 10 with 0 kg DM remaining (stored empty).
      // Target date day 11 — no stored, pasture covers all.
      const batches = { 'b-1': { weightPerUnitKg: 1, dmPct: 100 } };
      const feedChecks = [{ id: 'chk-1', date: '2026-04-10' }];
      const feedCheckItems = [{ feedCheckId: 'chk-1', batchId: 'b-1', locationId: LOC, remainingQuantity: 0 }];
      const result = run({ batches, feedChecks, feedCheckItems, date: '2026-04-11' });
      expect(result.status).toBe('actual');
      expect(result.pastureDmiKg).toBe(250);
      expect(result.storedDmiKg).toBe(0);
    });

    it('pastureDmiKg floors at 0 when stored consumption exceeds demand (bracketed)', () => {
      const batches = { 'b-1': { weightPerUnitKg: 1, dmPct: 100 } };
      const feedChecks = [
        { id: 'chk-1', date: '2026-04-11' },
        { id: 'chk-2', date: '2026-04-13' },
      ];
      const feedCheckItems = [
        { feedCheckId: 'chk-1', batchId: 'b-1', locationId: LOC, remainingQuantity: 1000 },
        { feedCheckId: 'chk-2', batchId: 'b-1', locationId: LOC, remainingQuantity: 0 },
      ];
      const result = run({ batches, feedChecks, feedCheckItems, date: '2026-04-12' });
      expect(result.status).toBe('actual');
      // storedDmiKg = 1000/2 = 500, totalDmiKg = 250 → pasture floors at 0.
      expect(result.storedDmiKg).toBe(500);
      expect(result.pastureDmiKg).toBe(0);
    });
  });

  describe('filters', () => {
    it('group joined after date is excluded from demand', () => {
      const gws = [
        { headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: null },
        { headCount: 10, avgWeightKg: 400, animalClassId: null, dateJoined: '2026-04-15', dateLeft: null },
      ];
      const result = run({ groupWindows: gws });
      expect(result.totalDmiKg).toBe(250);
    });
  });
});
