/** Compiled compatibility ceiling, NOT the highest written migration.
 * Release/publish is gated on Tim's approval, backup, and verified applies.
 * Schema 46 (animals.confirmed_bred_date), schema 47 (farm_settings
 * per-species preg-check thresholds), schema 48 (farm_settings
 * return-to-cycle days), and schema 49 (farm_settings season default
 * month-days, #402) are released after verified apply.
 * No runtime/localStorage flag may opt an unapplied schema into writes. */
export const RELEASED_SCHEMA_VERSION = 49;
// OI-0251 Ap: farm_settings.include_archived_locations_in_metrics (054, file
// only). Held until Tim yes + verified backup apply + a separate RELEASED bump
// (which also needs 050–053 released first). Reads treat absent as true.
export const ARCHIVED_METRICS_SCHEMA_VERSION = 54;
export const HELD_SCHEMA_VERSIONS = [54];
// Retain this proof manifest after promotion: restore must still prove every
// prerequisite column. Entries <= the compiled ceiling are released, not held.
// The legacy export name is shared by the independent column-proof API.
export const STAGED_COLUMNS = {
  54: { farm_settings: ['include_archived_locations_in_metrics'] },
  49: {
    farm_settings: [
      'season_start_month',
      'season_start_day',
      'season_end_month',
      'season_end_day',
    ],
  },
  48: {
    farm_settings: [
      'return_to_cycle_days_cattle',
      'return_to_cycle_days_sheep',
      'return_to_cycle_days_goat',
    ],
  },
  47: {
    farm_settings: [
      'preg_check_min_days_since_exposure_cattle',
      'preg_check_min_days_post_calving_cattle',
      'preg_check_min_days_since_exposure_sheep',
      'preg_check_min_days_post_calving_sheep',
      'preg_check_min_days_since_exposure_goat',
      'preg_check_min_days_post_calving_goat',
    ],
  },
  46: { animals: ['confirmed_bred_date'] },
  45: {
    historical_feedings: ['operation_id', 'source_key', 'species', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot'],
    historical_animal_basis: ['operation_id', 'source_key', 'species', 'head_count', 'avg_weight_kg', 'dmi_pct_snapshot'],
  },
  44: { dose_units: ['operation_id'], input_product_units: ['operation_id'] },
  42: { ai_bulls: ['epds'], animal_breeding_records: ['sire_name'] },
  43: {
    event_feed_check_items: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot'],
    event_feed_entries: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot', 'kind', 'transfer_id', 'return_batch_id', 'return_storage_location_id'],
  },
};

// Whole tables created by a staged migration. Until the ceiling reaches the
// version, backup export/restore must not touch them (they may not exist yet).
// Kept after release, like STAGED_COLUMNS; entries <= the ceiling are released.
export const STAGED_TABLES = {
  45: ['historical_feedings', 'historical_animal_basis'],
};

/** True when `table` is not created by a schema above the compiled ceiling. */
export function isTableReleased(table, ceiling = RELEASED_SCHEMA_VERSION) {
  return !Object.entries(STAGED_TABLES).some(([version, tables]) => Number(version) > ceiling && tables.includes(table));
}
