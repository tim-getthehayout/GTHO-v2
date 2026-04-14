/** @file Calculation engine tests — verify all registered formulas */
import { describe, it, expect, beforeAll } from 'vitest';
import { getAllCalcs, getCalcByName, _clearRegistry } from '../../src/utils/calc-registry.js';

// Import to trigger registration
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';

describe('calculation engine', () => {
  it('registers 37 formulas', () => {
    const calcs = getAllCalcs();
    expect(calcs.length).toBe(37);
  });

  it('has formulas in all expected categories', () => {
    const calcs = getAllCalcs();
    const categories = [...new Set(calcs.map(c => c.category))].sort();
    expect(categories).toContain('npk');
    expect(categories).toContain('animal');
    expect(categories).toContain('time');
    expect(categories).toContain('unit');
    expect(categories).toContain('dmi');
    expect(categories).toContain('forage');
    expect(categories).toContain('cost');
    expect(categories).toContain('feed');
    expect(categories).toContain('recovery');
    expect(categories).toContain('survey');
    expect(categories).toContain('capacity');
  });

  // Core tier
  describe('NPK-1: Excretion', () => {
    it('calculates correctly with example data', () => {
      const calc = getCalcByName('NPK-1');
      const result = calc.fn({
        headCount: 50, avgWeightKg: 545, days: 14,
        excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136,
      });
      // 50 × 0.545 × 14 × rates
      expect(result.nKg).toBeCloseTo(55.3175, 2);
      expect(result.pKg).toBeCloseTo(15.6415, 2);
      expect(result.kKg).toBeCloseTo(51.884, 2);
    });
  });

  describe('TIM-1: Days Between Inclusive', () => {
    it('same day = 1', () => {
      const calc = getCalcByName('TIM-1');
      expect(calc.fn({ dateA: '2026-04-01', dateB: '2026-04-01' })).toBe(1);
    });
    it('3-day span = 3', () => {
      const calc = getCalcByName('TIM-1');
      expect(calc.fn({ dateA: '2026-04-01', dateB: '2026-04-03' })).toBe(3);
    });
  });

  describe('TIM-2: Days Between Exact', () => {
    it('same day = 0', () => {
      const calc = getCalcByName('TIM-2');
      expect(calc.fn({ dateA: '2026-04-01', dateB: '2026-04-01' })).toBe(0);
    });
    it('one day apart = 1', () => {
      const calc = getCalcByName('TIM-2');
      expect(calc.fn({ dateA: '2026-04-01', dateB: '2026-04-02' })).toBe(1);
    });
  });

  describe('ANI-3: Weaning Target', () => {
    it('adds weaning age days to birth date', () => {
      const calc = getCalcByName('ANI-3');
      expect(calc.fn({ birthDate: '2026-01-01', weaningAgeDays: 205 })).toBe('2026-07-24');
    });
  });

  describe('ANI-1: Group Totals', () => {
    it('aggregates correctly', () => {
      const calc = getCalcByName('ANI-1');
      const result = calc.fn({
        entries: [
          { headCount: 30, avgWeightKg: 545, dmiPct: 2.5 },
          { headCount: 20, avgWeightKg: 363, dmiPct: 2.5 },
        ],
      });
      expect(result.totalHead).toBe(50);
      // 30×545×0.025 + 20×363×0.025 = 408.75 + 181.5 = 590.25
      expect(result.totalDmiKgPerDay).toBeCloseTo(590.25, 0);
    });
  });

  // Forage tier
  describe('FOR-1: Standing Forage DM', () => {
    it('calculates available DM', () => {
      const calc = getCalcByName('FOR-1');
      const result = calc.fn({
        forageHeightCm: 25, residualHeightCm: 10, areaHectares: 10,
        coverPct: 80, dmKgPerCmPerHa: 200, areaPct: 100,
      });
      // (25-10) × 10 × 0.80 × 200 = 24000
      expect(result).toBeCloseTo(24000, 0);
    });

    it('adjusts for strip grazing', () => {
      const calc = getCalcByName('FOR-1');
      const result = calc.fn({
        forageHeightCm: 25, residualHeightCm: 10, areaHectares: 10,
        coverPct: 80, dmKgPerCmPerHa: 200, areaPct: 25,
      });
      // (25-10) × (10×0.25) × 0.80 × 200 = 6000
      expect(result).toBeCloseTo(6000, 0);
    });
  });

  describe('SUR-1: Forage Quality Rating', () => {
    it('classifies correctly', () => {
      const calc = getCalcByName('SUR-1');
      expect(calc.fn({ forageQuality: 20 }).label).toBe('poor');
      expect(calc.fn({ forageQuality: 40 }).label).toBe('fair');
      expect(calc.fn({ forageQuality: 60 }).label).toBe('good');
      expect(calc.fn({ forageQuality: 80 }).label).toBe('excellent');
    });
  });

  describe('REC-1: Recovery Window', () => {
    it('calculates return dates', () => {
      const calc = getCalcByName('REC-1');
      const result = calc.fn({
        observedAt: '2026-04-01', recoveryMinDays: 21, recoveryMaxDays: 60,
      });
      expect(result.earliestReturn).toBe('2026-04-22');
      expect(result.windowCloses).toBe('2026-05-31');
    });
  });

  // CP-54: Forecast + Capacity
  describe('FOR-6: Forecast Standing DM at Date', () => {
    const base = {
      observedAt: '2024-06-01', residualHeightCm: 5, areaHectares: 2,
      areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
      growthCmPerDay: 0.5, recoveryMinDays: 21, recoveryMaxDays: 35,
    };

    it('confidence = min when target_date <= earliest_return', () => {
      const calc = getCalcByName('FOR-6');
      const result = calc.fn({ ...base, targetDate: '2024-06-22' }); // day 21 = recoveryMinDays
      expect(result.confidence).toBe('min');
      // height = 5 + 0.5*21 = 15.5; dm = 15.5 * 2 * 0.8 * 110 = 2728
      expect(result.forecastDmKg).toBeCloseTo(2728, 0);
    });

    it('confidence = mid when between min and max recovery', () => {
      const calc = getCalcByName('FOR-6');
      const result = calc.fn({ ...base, targetDate: '2024-06-29' }); // day 28
      expect(result.confidence).toBe('mid');
    });

    it('confidence = max when at window_closes', () => {
      const calc = getCalcByName('FOR-6');
      const result = calc.fn({ ...base, targetDate: '2024-07-06' }); // day 35 = recoveryMaxDays
      expect(result.confidence).toBe('max');
    });

    it('confidence = past_max when beyond recovery window', () => {
      const calc = getCalcByName('FOR-6');
      const result = calc.fn({ ...base, targetDate: '2024-08-01' }); // day 61
      expect(result.confidence).toBe('past_max');
    });

    it('returns 0 when target_date < observed_at', () => {
      const calc = getCalcByName('FOR-6');
      const result = calc.fn({ ...base, targetDate: '2024-05-15' });
      expect(result.forecastDmKg).toBe(0);
      expect(result.confidence).toBe('min');
    });

    it('strip grazing: sums DM across strips', () => {
      const calc = getCalcByName('FOR-6');
      const strip1 = calc.fn({ ...base, areaPct: 30, targetDate: '2024-06-22' });
      const strip2 = calc.fn({ ...base, areaPct: 70, targetDate: '2024-06-22' });
      const whole = calc.fn({ ...base, areaPct: 100, targetDate: '2024-06-22' });
      // Strip forecasts should sum to whole-paddock forecast
      expect(strip1.forecastDmKg + strip2.forecastDmKg).toBeCloseTo(whole.forecastDmKg, 2);
    });
  });

  describe('CAP-1: Period Capacity Coverage', () => {
    it('full coverage with surplus', () => {
      const calc = getCalcByName('CAP-1');
      const result = calc.fn({
        forecastDmKg: 3000,
        groupDmiKgPerDay: [{ dmiKgPerDay: 250 }, { dmiKgPerDay: 150 }],
        periodDays: 3,
      });
      // demand = 400 * 3 = 1200; supply = 3000
      expect(result.coverageFraction).toBe(1);
      expect(result.coversHours).toBe(72);
      expect(result.shortfallLbsHay).toBe(0);
      // surplus = (3000 - 1200) / (400/24) = 1800 / 16.667 = 108 hours
      expect(result.surplusHours).toBeCloseTo(108, 0);
    });

    it('partial coverage with shortfall', () => {
      const calc = getCalcByName('CAP-1');
      const result = calc.fn({
        forecastDmKg: 600,
        groupDmiKgPerDay: [{ dmiKgPerDay: 400 }],
        periodDays: 3,
      });
      // demand = 1200; supply = 600; coverage = 0.5
      expect(result.coverageFraction).toBe(0.5);
      expect(result.coversHours).toBe(36);
      expect(result.shortfallLbsHay).toBeCloseTo(600 * 2.20462, 0);
      expect(result.surplusHours).toBe(0);
    });

    it('never-grazed paddock: 100% shortfall', () => {
      const calc = getCalcByName('CAP-1');
      const result = calc.fn({
        forecastDmKg: 0,
        groupDmiKgPerDay: [{ dmiKgPerDay: 400 }],
        periodDays: 3,
      });
      expect(result.coverageFraction).toBe(0);
      expect(result.coversHours).toBe(0);
      expect(result.shortfallLbsHay).toBeCloseTo(1200 * 2.20462, 0);
    });

    it('multi-group: sums DMI across groups', () => {
      const calc = getCalcByName('CAP-1');
      const result = calc.fn({
        forecastDmKg: 2000,
        groupDmiKgPerDay: [{ dmiKgPerDay: 100 }, { dmiKgPerDay: 200 }, { dmiKgPerDay: 100 }],
        periodDays: 5,
      });
      // demand = 400 * 5 = 2000; exact match
      expect(result.dmDemandKg).toBe(2000);
      expect(result.coverageFraction).toBe(1);
      expect(result.surplusHours).toBe(0);
    });

    it('strip-graze: uses summed forecast DM from strips', () => {
      const calc = getCalcByName('CAP-1');
      // Simulate: caller sums FOR-6 across strips before passing in
      const stripSum = 1500 + 3500; // two strips
      const result = calc.fn({
        forecastDmKg: stripSum,
        groupDmiKgPerDay: [{ dmiKgPerDay: 500 }],
        periodDays: 3,
      });
      expect(result.dmAvailableKg).toBe(5000);
      expect(result.dmDemandKg).toBe(1500);
      expect(result.coverageFraction).toBe(1);
    });
  });
});
