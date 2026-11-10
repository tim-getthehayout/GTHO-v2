/** Compiled compatibility ceiling, NOT the highest written migration.
 * Advance only after Tim's separate approval, backup, apply and column verification.
 * No runtime/localStorage flag may opt an unapplied schema into writes. */
export const RELEASED_SCHEMA_VERSION = 41;
export const HELD_SCHEMA_VERSIONS = [42, 43];
export const STAGED_COLUMNS = {
  42: { ai_bulls: ['epds'], animal_breeding_records: ['sire_name'] },
  43: {
    event_feed_check_items: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot'],
    event_feed_entries: ['feed_type_id', 'unit_snapshot', 'weight_per_unit_kg_snapshot', 'dm_pct_snapshot', 'kind', 'transfer_id', 'return_batch_id', 'return_storage_location_id'],
  },
};
