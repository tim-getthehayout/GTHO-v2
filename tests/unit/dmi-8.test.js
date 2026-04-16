/** @file Tests for DMI-8 daily breakdown calc */
import { describe, it, expect, beforeAll } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';

// Import to trigger registration
import '../../src/calcs/feed-forage.js';

const baseEvent = { id: 'evt-1', dateIn: '2026-04-10', dateOut: null, sourceEventId: null };
const baseGw = [{ headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: null }];
const basePw = [{ locationId: 'loc-1', dateOpened: '2026-04-10', dateClosed: null, areaPct: 100 }];
const baseObs = [{ observationPhase: 'pre_graze', forageHeightCm: 25, forageCoverPct: 80, createdAt: '2026-04-10T00:00:00Z' }];
const baseFt = { 'loc-1': { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 } };
const baseLoc = { 'loc-1': { areaHa: 2 } };

describe('DMI-8: Daily DMI Breakdown', () => {
  let dmi8;
  beforeAll(() => { dmi8 = getCalcByName('DMI-8'); });

  it('is registered', () => {
    expect(dmi8).toBeDefined();
    expect(dmi8.name).toBe('DMI-8');
  });

  describe('actual state (feed checks bracket the date)', () => {
    it('returns actual when two checks bracket the date', () => {
      const checks = [
        { id: 'chk-1', checkDate: '2026-04-11' },
        { id: 'chk-2', checkDate: '2026-04-13' },
      ];
      const checkItems = [
        { feedCheckId: 'chk-1', remainingQty: 200 },
        { feedCheckId: 'chk-2', remainingQty: 150 },
      ];
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-12', groupWindows: baseGw,
        feedEntries: [], feedChecks: checks, feedCheckItems: checkItems,
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('actual');
      // storedDmiKg = (200-150)/2 = 25 kg/day
      expect(result.storedDmiKg).toBe(25);
      // totalDmiKg = 20 * 500 * 0.025 = 250
      expect(result.totalDmiKg).toBe(250);
      // pastureDmiKg = 250 - 25 = 225
      expect(result.pastureDmiKg).toBe(225);
    });
  });

  describe('estimated state (declining pasture mass balance)', () => {
    it('returns estimated with correct pasture balance', () => {
      // FOR-1: (25-5) * 2 * 0.8 * 110 = 3520 kg initial DM
      // DMI demand: 250 kg/day
      // Day 1 (2026-04-10): consume 250 from 3520 → remaining 3270
      // Day 2 (2026-04-11): remaining=3270, demand=250 → pasture=250, stored=0
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('estimated');
      expect(result.totalDmiKg).toBe(250);
      expect(result.pastureDmiKg).toBe(250);
      expect(result.storedDmiKg).toBe(0);
    });

    it('shows stored feed filling gap when pasture runs low', () => {
      // Small paddock: only 500kg initial DM
      const smallFt = { 'loc-1': { dmKgPerCmPerHa: 15.625, minResidualHeightCm: 5, utilizationPct: 100 } };
      // FOR-1: (25-5) * 2 * 0.8 * 15.625 = 500 kg
      // demand: 250/day → Day 1 consumes 250 → 250 left → Day 2: remaining=250, pasture=250, stored=0
      // Day 3 (2026-04-12): remaining=0, pasture=0, stored=250
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-12', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: smallFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('estimated');
      expect(result.pastureDmiKg).toBe(0);
      expect(result.storedDmiKg).toBe(250);
    });

    it('partial pasture: remaining covers part of demand', () => {
      // 375 kg initial DM → demand 250/day
      const partialFt = { 'loc-1': { dmKgPerCmPerHa: 11.71875, minResidualHeightCm: 5, utilizationPct: 100 } };
      // FOR-1: (25-5) * 2 * 0.8 * 11.71875 = 375 kg
      // Day 1: consume 250 → remaining 125
      // Day 2 (2026-04-11): remaining=125, demand=250 → pasture=125, stored=125
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: partialFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('estimated');
      expect(result.pastureDmiKg).toBe(125);
      expect(result.storedDmiKg).toBe(125);
    });
  });

  describe('needs_check state', () => {
    it('returns needs_check when no forage type', () => {
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: {},
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('needs_check');
    });

    it('returns needs_check when no pre-graze observation', () => {
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: [], forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('needs_check');
    });

    it('returns needs_check when no location area', () => {
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: baseGw,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: {}, animalClasses: {},
      });
      expect(result.status).toBe('needs_check');
    });

    it('returns needs_check when no group windows have demand', () => {
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: [],
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('needs_check');
    });
  });

  describe('edge cases', () => {
    it('pastureDmiKg floors at 0 (never negative)', () => {
      // Massive stored feed consumed: storedDmiKg exceeds totalDmiKg
      const checks = [
        { id: 'chk-1', checkDate: '2026-04-11' },
        { id: 'chk-2', checkDate: '2026-04-13' },
      ];
      const checkItems = [
        { feedCheckId: 'chk-1', remainingQty: 1000 },
        { feedCheckId: 'chk-2', remainingQty: 0 },
      ];
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-12', groupWindows: baseGw,
        feedEntries: [], feedChecks: checks, feedCheckItems: checkItems,
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      expect(result.status).toBe('actual');
      // storedDmiKg = (1000-0)/2 = 500, totalDmiKg = 250
      expect(result.storedDmiKg).toBe(500);
      // pasture floors at 0
      expect(result.pastureDmiKg).toBe(0);
    });

    it('group joined after date is excluded from demand', () => {
      const gws = [
        { headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: null },
        { headCount: 10, avgWeightKg: 400, animalClassId: null, dateJoined: '2026-04-15', dateLeft: null },
      ];
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-11', groupWindows: gws,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      // Only first group: 20 * 500 * 0.025 = 250
      expect(result.totalDmiKg).toBe(250);
    });

    it('group that left before date is excluded from demand', () => {
      const gws = [
        { headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: '2026-04-11' },
      ];
      const result = dmi8.fn({
        event: baseEvent, date: '2026-04-12', groupWindows: gws,
        feedEntries: [], feedChecks: [], feedCheckItems: [],
        paddockWindows: basePw, observations: baseObs, forageTypes: baseFt,
        locations: baseLoc, animalClasses: {},
      });
      // Group left on 2026-04-11, dateLeft <= date → excluded
      expect(result.status).toBe('needs_check');
    });
  });
});
