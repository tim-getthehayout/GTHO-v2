/** Compiled compatibility ceiling, NOT the highest written migration.
 * Release/publish is gated on Tim's approval, backup, and verified 042–044 applies.
 * No runtime/localStorage flag may opt an unapplied schema into writes. */
export const RELEASED_SCHEMA_VERSION = 44;
export const HELD_SCHEMA_VERSIONS = [];
// Retain this proof manifest after promotion: restore must still prove every
// prerequisite column. Entries <= the compiled ceiling are released, not held.
// The legacy export name is shared by the independent column-proof API.
export const STAGED_COLUMNS = {
  44: { dose_units: ['operation_id'], input_product_units: ['operation_id'] },
  42: { ai_bulls: ['epds'], animal_breeding_records: ['sire_name'] },
  43: {
    event_feed_check_items: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot'],
    event_feed_entries: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot', 'kind', 'transfer_id', 'return_batch_id', 'return_storage_location_id'],
  },
};
