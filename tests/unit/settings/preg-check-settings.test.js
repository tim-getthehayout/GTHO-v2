/**
 * @file Preg-check settings helper — Pv validation + Pg0 gate.
 */
import { describe, it, expect } from 'vitest';
import {
  validatePregCheckThresholds,
  arePregCheckSettingsReleased,
  updateFarmPregCheckSettings,
  PREG_CHECK_SOFT_MAX_DAYS,
  areReturnToCycleSettingsReleased,
  validateReturnToCycleDays,
  updateFarmReturnToCycleSettings,
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
  it('is visible at current RELEASED ceiling 49', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(49);
    expect(arePregCheckSettingsReleased()).toBe(true);
    expect(arePregCheckSettingsReleased(45)).toBe(false);
    expect(arePregCheckSettingsReleased(47)).toBe(true);
  });

  it('updateFarmPregCheckSettings still validates before write', () => {
    expect(() => updateFarmPregCheckSettings('fs1', {
      pregCheckMinDaysSinceExposureCattle: -1,
      pregCheckMinDaysPostCalvingCattle: 45,
      pregCheckMinDaysSinceExposureSheep: 25,
      pregCheckMinDaysPostCalvingSheep: 30,
      pregCheckMinDaysSinceExposureGoat: 25,
      pregCheckMinDaysPostCalvingGoat: 30,
    })).toThrow(/non-negative integers/i);
    expect(() => updateFarmPregCheckSettings('', {
      pregCheckMinDaysSinceExposureCattle: 35,
      pregCheckMinDaysPostCalvingCattle: 45,
      pregCheckMinDaysSinceExposureSheep: 25,
      pregCheckMinDaysPostCalvingSheep: 30,
      pregCheckMinDaysSinceExposureGoat: 25,
      pregCheckMinDaysPostCalvingGoat: 30,
    })).toThrow(/id is required/i);
  });
});

describe('return-to-cycle settings gate (schema 48 released)', () => {
  it('visible at current RELEASED ceiling 49', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(49);
    expect(areReturnToCycleSettingsReleased()).toBe(true);
    expect(areReturnToCycleSettingsReleased(47)).toBe(false);
    expect(areReturnToCycleSettingsReleased(48)).toBe(true);
  });

  it('updateFarmReturnToCycleSettings still validates before write', () => {
    expect(() => updateFarmReturnToCycleSettings('fs1', {
      returnToCycleDaysCattle: -1,
      returnToCycleDaysSheep: 25,
      returnToCycleDaysGoat: 25,
    })).toThrow(/non-negative integer/i);
    expect(() => updateFarmReturnToCycleSettings('', {
      returnToCycleDaysCattle: 45,
      returnToCycleDaysSheep: 25,
      returnToCycleDaysGoat: 25,
    })).toThrow(/id is required/i);
  });
});
