/** @file Shared farm_settings preg-check threshold update + validation (Ps0). */
import { update } from '../../data/store.js';
import { RELEASED_SCHEMA_VERSION } from '../../data/schema-release.js';
import {
  validate as validateFarmSetting,
  toSupabaseShape as fsToSb,
} from '../../entities/farm-setting.js';

export const PREG_CHECK_SOFT_MAX_DAYS = 365;

export const PREG_CHECK_FIELD_KEYS = Object.freeze([
  'pregCheckMinDaysSinceExposureCattle',
  'pregCheckMinDaysPostCalvingCattle',
  'pregCheckMinDaysSinceExposureSheep',
  'pregCheckMinDaysPostCalvingSheep',
  'pregCheckMinDaysSinceExposureGoat',
  'pregCheckMinDaysPostCalvingGoat',
]);

export const PREG_CHECK_SPECIES_SECTIONS = Object.freeze([
  {
    family: 'cattle',
    label: 'Cattle',
    exposureKey: 'pregCheckMinDaysSinceExposureCattle',
    postKey: 'pregCheckMinDaysPostCalvingCattle',
  },
  {
    family: 'sheep',
    label: 'Sheep',
    exposureKey: 'pregCheckMinDaysSinceExposureSheep',
    postKey: 'pregCheckMinDaysPostCalvingSheep',
  },
  {
    family: 'goat',
    label: 'Goat',
    exposureKey: 'pregCheckMinDaysSinceExposureGoat',
    postKey: 'pregCheckMinDaysPostCalvingGoat',
  },
]);

/** Pg0: button/editors hidden until schema 47 is released. */
export function arePregCheckSettingsReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= 47;
}

/**
 * Pv: required non-negative integers; soft max 365.
 * @param {Record<string, unknown>} values camelCase threshold fields
 * @returns {{ valid: boolean, errors: string[], normalized: Record<string, number>|null }}
 */
export function validatePregCheckThresholds(values = {}) {
  const errors = [];
  const normalized = {};
  for (const section of PREG_CHECK_SPECIES_SECTIONS) {
    for (const key of [section.exposureKey, section.postKey]) {
      const raw = values[key];
      if (raw === '' || raw == null) {
        errors.push(`${section.label}: both thresholds are required`);
        continue;
      }
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isInteger(n) || n < 0) {
        errors.push(`${section.label}: thresholds must be non-negative integers`);
        continue;
      }
      if (n > PREG_CHECK_SOFT_MAX_DAYS) {
        errors.push(`${section.label}: thresholds must be ≤ ${PREG_CHECK_SOFT_MAX_DAYS}`);
        continue;
      }
      normalized[key] = n;
    }
  }
  const uniq = [...new Set(errors)];
  if (uniq.length) return { valid: false, errors: uniq, normalized: null };
  return { valid: true, errors: [], normalized };
}

/**
 * Ps0 / Ps-farm0: same write path as Farm settings.
 * @param {string} farmSettingsId
 * @param {Record<string, number>} changes validated threshold fields only
 */
export function updateFarmPregCheckSettings(farmSettingsId, changes) {
  if (!farmSettingsId) throw new Error('farmSettings id is required');
  if (!arePregCheckSettingsReleased()) {
    throw new Error('Preg-check settings require schema 47');
  }
  const check = validatePregCheckThresholds(changes);
  if (!check.valid) throw new Error(check.errors.join('; '));
  return update(
    'farmSettings',
    farmSettingsId,
    check.normalized,
    validateFarmSetting,
    fsToSb,
    'farm_settings',
  );
}


/** Soft max shared with preg-check editors. */
export const RETURN_TO_CYCLE_SOFT_MAX_DAYS = PREG_CHECK_SOFT_MAX_DAYS;

export const RETURN_TO_CYCLE_FIELD_KEYS = Object.freeze([
  'returnToCycleDaysCattle',
  'returnToCycleDaysSheep',
  'returnToCycleDaysGoat',
]);

export const RETURN_TO_CYCLE_SPECIES_SECTIONS = Object.freeze([
  { family: 'cattle', label: 'Cattle', key: 'returnToCycleDaysCattle', defaultDays: 45 },
  { family: 'sheep', label: 'Sheep', key: 'returnToCycleDaysSheep', defaultDays: 25 },
  { family: 'goat', label: 'Goat', key: 'returnToCycleDaysGoat', defaultDays: 25 },
]);

/** Pg0-style: return-to-cycle editors visible once schema 48 is released. */
export function areReturnToCycleSettingsReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= 48;
}

/**
 * Validate return-to-cycle days (one int per species).
 * @param {Record<string, unknown>} values camelCase fields
 * @returns {{ valid: boolean, errors: string[], normalized: Record<string, number>|null }}
 */
export function validateReturnToCycleDays(values = {}) {
  const errors = [];
  const normalized = {};
  for (const section of RETURN_TO_CYCLE_SPECIES_SECTIONS) {
    const raw = values[section.key];
    if (raw === '' || raw == null) {
      errors.push(`${section.label}: return-to-cycle days are required`);
      continue;
    }
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${section.label}: return-to-cycle days must be a non-negative integer`);
      continue;
    }
    if (n > RETURN_TO_CYCLE_SOFT_MAX_DAYS) {
      errors.push(`${section.label}: return-to-cycle days must be ≤ ${RETURN_TO_CYCLE_SOFT_MAX_DAYS}`);
      continue;
    }
    normalized[section.key] = n;
  }
  const uniq = [...new Set(errors)];
  if (uniq.length) return { valid: false, errors: uniq, normalized: null };
  return { valid: true, errors: [], normalized };
}

/**
 * Ps0 write path for return-to-cycle days (same farm_settings update helper).
 * @param {string} farmSettingsId
 * @param {Record<string, number>} changes validated fields only
 */
export function updateFarmReturnToCycleSettings(farmSettingsId, changes) {
  if (!farmSettingsId) throw new Error('farmSettings id is required');
  if (!areReturnToCycleSettingsReleased()) {
    throw new Error('Return-to-cycle settings require schema 48');
  }
  const check = validateReturnToCycleDays(changes);
  if (!check.valid) throw new Error(check.errors.join('; '));
  return update(
    'farmSettings',
    farmSettingsId,
    check.normalized,
    validateFarmSetting,
    fsToSb,
    'farm_settings',
  );
}
