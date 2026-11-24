/** @file #402 — farm season default write path (shared by Farm Settings and
 * the Rotation calendar "Farm default…" editor). Same store/sync path as the
 * other farm_settings editors. Visible once schema 49 is released. */
import { update } from '../../data/store.js';
import { RELEASED_SCHEMA_VERSION } from '../../data/schema-release.js';
import {
  validate as validateFarmSetting,
  toSupabaseShape as fsToSb,
} from '../../entities/farm-setting.js';
import { validateFarmSeason } from '../../calcs/farm-season.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';

/** Pg0-style gate: the season columns exist only once 049 is applied and released. */
export function areFarmSeasonSettingsReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= 49;
}

/**
 * Save the farm season default (the only writer of these columns).
 * @param {string} farmSettingsId
 * @param {object} values start/end month-day (seasonStartMonth… or startMonth… keys)
 */
export function updateFarmSeasonSettings(farmSettingsId, values) {
  if (!farmSettingsId) throw new Error('farmSettings id is required');
  if (!areFarmSeasonSettingsReleased()) throw new Error('Farm season settings require schema 49');
  const check = validateFarmSeason(values, getLocalTodayStr());
  if (!check.valid) throw new Error(check.errors.join('; '));
  return update('farmSettings', farmSettingsId, check.normalized, validateFarmSetting, fsToSb, 'farm_settings');
}
