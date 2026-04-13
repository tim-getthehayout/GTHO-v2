/** @file Calculation engine tests — verify all registered formulas */
import { describe, it, expect, beforeAll } from 'vitest';
import { getAllCalcs, getCalcByName, _clearRegistry } from '../../src/utils/calc-registry.js';

// Import to trigger registration
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';

describe('calculation engine', () => {
  it('registers 35 formulas', () => {
    const calcs = getAllCalcs();
    expect(calcs.length).toBe(35);
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
});
