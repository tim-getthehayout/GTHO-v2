/** Compiled compatibility ceiling, NOT the highest written migration.
 * Release/publish is gated on Tim's approval, backup, and verified applies.
 * Schema 46 (animals.confirmed_bred_date), schema 47 (farm_settings
 * per-species preg-check thresholds), schema 48 (farm_settings
 * return-to-cycle days), schema 49 (farm_settings season default
 * month-days, #402), schema 50 (farm_settings
 * include_archived_locations_in_metrics, OI-0251), schema 51 (#449 dairy
 * milk) and schema 52 (#436 / OI-0281 stored feed plan) are released after
 * verified apply.
 * No runtime/localStorage flag may opt an unapplied schema into writes. */
export const RELEASED_SCHEMA_VERSION = 52;
// OI-0251 Ap: farm_settings.include_archived_locations_in_metrics (050),
// released after verified apply. Reads still treat absent/null as true.
export const ARCHIVED_METRICS_SCHEMA_VERSION = 50;
// #449 dairy milk (051): milk_pickups, calf_milk_feedings, farm_settings dairy
// columns and groups.is_milking. Released after verified apply on v2 prod
// (2026-11-25 11:56:53 ET, ledger 20261125165653 dairy_milk; Tim card t1652s6519).
export const DAIRY_SCHEMA_VERSION = 51;
export const STORED_FEED_PLAN_SCHEMA_VERSION = 52;
// #436 / OI-0281 stored-feed plan (052): stored_feed_plans + stored_feed_plan_rows.
// Released after verified apply of 052. This release PR raises the ceiling;
// open it only after that apply. STAGED_COLUMNS[52] / STAGED_TABLES[52] stay as proofs.
export const HELD_SCHEMA_VERSIONS = [];
// Retain this proof manifest after promotion: restore must still prove every
// prerequisite column. Entries <= the compiled ceiling are released, not held.
// The legacy export name is shared by the independent column-proof API.
export const STAGED_COLUMNS = {
  52: {
    stored_feed_plans: ['operation_id', 'farm_id', 'period_start', 'period_end'],
    stored_feed_plan_rows: ['operation_id', 'plan_id', 'start_date', 'end_date'],
  },
  51: {
    farm_settings: ['dairy_mode', 'milk_kg_per_l', 'milk_grazing_offset_days', 'milk_totals_mode'],
    groups: ['is_milking'],
    milk_pickups: ['operation_id', 'farm_id', 'picked_up_at', 'weight_kg'],
    calf_milk_feedings: ['operation_id', 'farm_id', 'fed_at', 'volume_l', 'kg_per_l_snapshot'],
  },
  50: { farm_settings: ['include_archived_locations_in_metrics'] },
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
  51: ['milk_pickups', 'calf_milk_feedings'],
  52: ['stored_feed_plans', 'stored_feed_plan_rows'],
};

/** #449: true once the dairy schema (051) is released in this build. */
export function isDairySchemaReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= DAIRY_SCHEMA_VERSION;
}

/** #436: true once the stored-feed plan schema (052) is released in this build. */
export function isStoredFeedPlanReleased(ceiling = RELEASED_SCHEMA_VERSION) {
  return ceiling >= STORED_FEED_PLAN_SCHEMA_VERSION;
}

/** True when `table` is not created by a schema above the compiled ceiling. */
export function isTableReleased(table, ceiling = RELEASED_SCHEMA_VERSION) {
  return !Object.entries(STAGED_TABLES).some(([version, tables]) => Number(version) > ceiling && tables.includes(table));
}
