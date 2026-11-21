/**
 * @file Preg-check settings helper — Pv validation + Pg0 gate.
 */
import { describe, it, expect } from 'vitest';
import {
  validatePregCheckThresholds,
  arePregCheckSettingsReleased,
  updateFarmPregCheckSettings,
  PREG_CHECK_SOFT_MAX_DAYS,
} from '../../../src/features/settings/preg-check-settings.js';
import { RELEASED_SCHEMA_VERSION } from '../../../src/data/schema-release.js';

describe('validatePregCheckThresholds (Pv)', () => {
  const good = {
    pregCheckMinDaysSinceExposureCattle: 35,
    pregCheckMinDaysPostCalvingCattle: 45,
    pregCheckMinDaysSinceExposureSheep: 25,
    pregCheckMinDaysPostCalvingSheep: 30,
    pregCheckMinDaysSinceExposureGoat: 25,
    pregCheckMinDaysPostCalvingGoat: 30,
  };

  it('accepts required non-negative integers within soft max', () => {
    const r = validatePregCheckThresholds(good);
    expect(r.valid).toBe(true);
    expect(r.normalized).toEqual(good);
  });

  it('rejects empty / missing fields', () => {
    const r = validatePregCheckThresholds({ ...good, pregCheckMinDaysSinceExposureSheep: '' });
    expect(r.valid).toBe(false);
    expect(r.errors.some(e => /Sheep/i.test(e))).toBe(true);
  });

  it('rejects negatives and non-integers', () => {
    expect(validatePregCheckThresholds({ ...good, pregCheckMinDaysSinceExposureCattle: -1 }).valid).toBe(false);
    expect(validatePregCheckThresholds({ ...good, pregCheckMinDaysPostCalvingGoat: 1.5 }).valid).toBe(false);
  });

  it('rejects above soft max', () => {
    const r = validatePregCheckThresholds({
      ...good, pregCheckMinDaysSinceExposureCattle: PREG_CHECK_SOFT_MAX_DAYS + 1,
    });
    expect(r.valid).toBe(false);
  });
});

describe('Pg0 release gate', () => {
  it('is hidden at current RELEASED ceiling 45', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(45);
    expect(arePregCheckSettingsReleased()).toBe(false);
    expect(arePregCheckSettingsReleased(47)).toBe(true);
  });

  it('updateFarmPregCheckSettings refuses while held', () => {
    expect(() => updateFarmPregCheckSettings('fs1', {
      pregCheckMinDaysSinceExposureCattle: 35,
      pregCheckMinDaysPostCalvingCattle: 45,
      pregCheckMinDaysSinceExposureSheep: 25,
      pregCheckMinDaysPostCalvingSheep: 30,
      pregCheckMinDaysSinceExposureGoat: 25,
      pregCheckMinDaysPostCalvingGoat: 30,
    })).toThrow(/schema 47/i);
  });
});
