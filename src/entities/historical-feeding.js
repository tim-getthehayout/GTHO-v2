/** @file Entity: historical_feedings (045) — winter hay history, read-only in
 * the app (#451). Pulled through the sync registry; never pushed (no
 * toSupabaseShape in push-all). Snapshots only: weight per unit and DM% are
 * stored on the row, so feed_types is never re-read for the DM figure. */

export const FIELDS = {
  id:                      { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:             { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:                  { type: 'uuid',        required: false, sbColumn: 'farm_id' },
  date:                    { type: 'date',        required: true,  sbColumn: 'date' },
  quantity:                { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  unitSnapshot:            { type: 'text',        required: true,  sbColumn: 'unit_snapshot' },
  weightPerUnitKgSnapshot: { type: 'numeric',     required: true,  sbColumn: 'weight_per_unit_kg_snapshot' },
  dmPctSnapshot:           { type: 'numeric',     required: true,  sbColumn: 'dm_pct_snapshot' },
  feedTypeId:              { type: 'uuid',        required: false, sbColumn: 'feed_type_id' },
  feedTypeLabel:           { type: 'text',        required: false, sbColumn: 'feed_type_label' },
  species:                 { type: 'text',        required: true,  sbColumn: 'species' },
  groupId:                 { type: 'uuid',        required: false, sbColumn: 'group_id' },
  groupLabel:              { type: 'text',        required: false, sbColumn: 'group_label' },
  placeText:               { type: 'text',        required: false, sbColumn: 'place_text' },
  notes:                   { type: 'text',        required: false, sbColumn: 'notes' },
  source:                  { type: 'text',        required: false, sbColumn: 'source' },
  sourceKey:               { type: 'text',        required: true,  sbColumn: 'source_key' },
  createdAt:               { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:               { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const num = v => (v == null || v === '' ? null : Number(v));

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id ?? null,
    date: row.date,
    quantity: num(row.quantity),
    unitSnapshot: row.unit_snapshot,
    weightPerUnitKgSnapshot: num(row.weight_per_unit_kg_snapshot),
    dmPctSnapshot: num(row.dm_pct_snapshot),
    feedTypeId: row.feed_type_id ?? null,
    feedTypeLabel: row.feed_type_label ?? null,
    species: row.species,
    groupId: row.group_id ?? null,
    groupLabel: row.group_label ?? null,
    placeText: row.place_text ?? null,
    notes: row.notes ?? null,
    source: row.source ?? null,
    sourceKey: row.source_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
