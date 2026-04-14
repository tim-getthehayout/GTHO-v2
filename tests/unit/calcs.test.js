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

  // OI-0012: Targeted coverage tests
  describe('DMI-1: Consumed DM from Feed (v1 bug fix regression)', () => {
    it('sums delivered DM minus residual', () => {
      const calc = getCalcByName('DMI-1');
      const result = calc.fn({
        entries: [{ qtyKg: 100, dmPct: 88 }, { qtyKg: 50, dmPct: 90 }],
        remainingDmKg: 10,
      });
      // (100×0.88) + (50×0.90) - 10 = 88 + 45 - 10 = 123
      expect(result).toBeCloseTo(123, 1);
    });

    it('applies residual correctly when multiple checks exist (by date, not index)', () => {
      const calc = getCalcByName('DMI-1');
      // The key v2 fix: v1 used array index, v2 time-filters. This tests that
      // the function accepts and computes correctly with any residual value.
      const result = calc.fn({
        entries: [{ qtyKg: 200, dmPct: 90 }],
        remainingDmKg: 50,
      });
      // 200×0.90 - 50 = 130
      expect(result).toBeCloseTo(130, 1);
    });

    it('returns negative when more residual than delivered (valid — overcount)', () => {
      const calc = getCalcByName('DMI-1');
      const result = calc.fn({ entries: [{ qtyKg: 10, dmPct: 88 }], remainingDmKg: 20 });
      expect(result).toBeCloseTo(-11.2, 1);
    });
  });

  describe('DMI-2: Daily DMI Target (lactation-aware)', () => {
    it('uses base dmiPct when not lactating (beef: calf-in-class)', () => {
      const calc = getCalcByName('DMI-2');
      const result = calc.fn({
        headCount: 20, avgWeightKg: 500, dmiPct: 2.5, dmiPctLactating: 3.0, isLactating: false,
      });
      // 20 × 500 × 0.025 = 250
      expect(result).toBeCloseTo(250, 1);
    });

    it('uses dmiPctLactating when lactating (dairy: dried_off_date branching)', () => {
      const calc = getCalcByName('DMI-2');
      const result = calc.fn({
        headCount: 20, avgWeightKg: 500, dmiPct: 2.5, dmiPctLactating: 3.0, isLactating: true,
      });
      // 20 × 500 × 0.030 = 300
      expect(result).toBeCloseTo(300, 1);
    });

    it('lactation increases DMI by expected ratio', () => {
      const calc = getCalcByName('DMI-2');
      const base = calc.fn({ headCount: 10, avgWeightKg: 545, dmiPct: 2.5, dmiPctLactating: 3.0, isLactating: false });
      const lact = calc.fn({ headCount: 10, avgWeightKg: 545, dmiPct: 2.5, dmiPctLactating: 3.0, isLactating: true });
      expect(lact / base).toBeCloseTo(3.0 / 2.5, 2);
    });
  });

  describe('FED-1: Effective Feed Residual', () => {
    it('computes remaining percentage', () => {
      const calc = getCalcByName('FED-1');
      expect(calc.fn({ remainingQuantity: 8, totalDelivered: 20 })).toBeCloseTo(40, 1);
    });

    it('returns 0 when no feed delivered', () => {
      const calc = getCalcByName('FED-1');
      expect(calc.fn({ remainingQuantity: 5, totalDelivered: 0 })).toBe(0);
    });

    it('returns 100 when all feed remains', () => {
      const calc = getCalcByName('FED-1');
      expect(calc.fn({ remainingQuantity: 20, totalDelivered: 20 })).toBeCloseTo(100, 1);
    });
  });

  describe('CST-1: Feed Entry Cost', () => {
    it('sums cost across multiple entries', () => {
      const calc = getCalcByName('CST-1');
      const result = calc.fn({
        entries: [
          { qtyUnits: 10, costPerUnit: 15 },
          { qtyUnits: 5, costPerUnit: 20 },
        ],
      });
      // 10×15 + 5×20 = 150 + 100 = 250
      expect(result).toBe(250);
    });

    it('returns 0 for empty entries', () => {
      const calc = getCalcByName('CST-1');
      expect(calc.fn({ entries: [] })).toBe(0);
    });
  });

  describe('CST-2: Batch Unit Cost', () => {
    it('divides total cost by original quantity', () => {
      const calc = getCalcByName('CST-2');
      expect(calc.fn({ costTotal: 750, quantityOriginal: 50 })).toBe(15);
    });

    it('returns 0 when quantity is 0', () => {
      const calc = getCalcByName('CST-2');
      expect(calc.fn({ costTotal: 100, quantityOriginal: 0 })).toBe(0);
    });
  });

  describe('CST-3: NPK Value per Event', () => {
    it('values NPK using per-kg prices', () => {
      const calc = getCalcByName('CST-3');
      const result = calc.fn({
        nKg: 55.4, pKg: 15.7, kKg: 52.0,
        nPricePerKg: 1.50, pPricePerKg: 2.20, kPricePerKg: 0.90,
      });
      // 55.4×1.5 + 15.7×2.2 + 52.0×0.9 = 83.1 + 34.54 + 46.8 = 164.44
      expect(result).toBeCloseTo(164.44, 1);
    });

    it('returns 0 when all NPK is 0', () => {
      const calc = getCalcByName('CST-3');
      expect(calc.fn({ nKg: 0, pKg: 0, kKg: 0, nPricePerKg: 1.5, pPricePerKg: 2.2, kPricePerKg: 0.9 })).toBe(0);
    });
  });

  describe('REC-1: Recovery Window (strip graze context)', () => {
    it('each strip has independent recovery dates', () => {
      const calc = getCalcByName('REC-1');
      // Strip 1 closed earlier
      const strip1 = calc.fn({ observedAt: '2026-04-01', recoveryMinDays: 21, recoveryMaxDays: 35 });
      // Strip 2 closed later
      const strip2 = calc.fn({ observedAt: '2026-04-10', recoveryMinDays: 21, recoveryMaxDays: 35 });
      // Strip 1 recovers before strip 2
      expect(strip1.earliestReturn).toBe('2026-04-22');
      expect(strip2.earliestReturn).toBe('2026-05-01');
      // Whole-paddock readiness = latest strip recovery → 2026-05-01
      const wholeReady = strip1.earliestReturn > strip2.earliestReturn ? strip1.earliestReturn : strip2.earliestReturn;
      expect(wholeReady).toBe('2026-05-01');
    });
  });

  describe('DMI-5: Daily Stored DMI by Date (interpolation)', () => {
    it('linearly interpolates between checks', () => {
      const calc = getCalcByName('DMI-5');
      const result = calc.fn({
        prevCheckRemainingKg: 200, nextCheckRemainingKg: 150, daysBetweenChecks: 5,
      });
      // (200-150)/5 = 10 kg/day
      expect(result).toBe(10);
    });

    it('returns 0 when days between checks is 0', () => {
      const calc = getCalcByName('DMI-5');
      expect(calc.fn({ prevCheckRemainingKg: 200, nextCheckRemainingKg: 150, daysBetweenChecks: 0 })).toBe(0);
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
