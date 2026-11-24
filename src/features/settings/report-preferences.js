/** @file OI-0251 Ap/Ud — farm reporting preference "include archived locations
 * in metrics" (farm_settings.include_archived_locations_in_metrics, schema 54).
 * One write path shared by Farm Settings and the Report preferences dialog
 * (Rotation calendar + List). Writable only once schema 54 is released; reads
 * treat an absent/unset column as true (includeArchivedInMetrics). */
import { update } from '../../data/store.js';
import { RELEASED_SCHEMA_VERSION, ARCHIVED_METRICS_SCHEMA_VERSION } from '../../data/schema-release.js';
import {
  validate as validateFarmSetting,
  toSupabaseShape as fsToSb,
} from '../../entities/farm-setting.js';

export const REPORT_PREFS_TITLE = 'Report preferences';
export const INCLUDE_ARCHIVED_LABEL = 'Include archived locations in metrics';
export const INCLUDE_ARCHIVED_HINT = 'Season DMI/NPK, the period totals strip and reports. Lists and pickers always hide archived locations.';
export const INCLUDE_ARCHIVED_HELD_NOTE = 'Available after the database update (schema 54). Archived locations are included until then.';

/** Pg0-style gate: the column exists only once 054 is applied and released. */
export function isArchivedMetricsSettingReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= ARCHIVED_METRICS_SCHEMA_VERSION;
}

/** Save the preference (the only writer of the column). */
export function updateIncludeArchivedInMetrics(farmSettingsId, include) {
  if (!farmSettingsId) throw new Error('farmSettings id is required');
  if (!isArchivedMetricsSettingReleased()) throw new Error(`Report preferences require schema ${ARCHIVED_METRICS_SCHEMA_VERSION}`);
  return update('farmSettings', farmSettingsId, { includeArchivedLocationsInMetrics: !!include },
    validateFarmSetting, fsToSb, 'farm_settings');
}
