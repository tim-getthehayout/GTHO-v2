/** @file Entity: historical_animal_basis (045) — winter herd basis, read-only in
 * the app (#451). Pulled through the sync registry; never pushed. Need per day
 * = head_count × avg_weight_kg × dmi_pct_snapshot / 100 over
 * period_start..period_end inclusive. */

export const FIELDS = {
  id:             { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:         { type: 'uuid',        required: false, sbColumn: 'farm_id' },
  periodStart:    { type: 'date',        required: true,  sbColumn: 'period_start' },
  periodEnd:      { type: 'date',        required: true,  sbColumn: 'period_end' },
  species:        { type: 'text',        required: true,  sbColumn: 'species' },
  groupId:        { type: 'uuid',        required: false, sbColumn: 'group_id' },
  groupLabel:     { type: 'text',        required: false, sbColumn: 'group_label' },
  classId:        { type: 'uuid',        required: false, sbColumn: 'class_id' },
  classLabel:     { type: 'text',        required: false, sbColumn: 'class_label' },
  headCount:      { type: 'integer',     required: true,  sbColumn: 'head_count' },
  avgWeightKg:    { type: 'numeric',     required: true,  sbColumn: 'avg_weight_kg' },
  dmiPctSnapshot: { type: 'numeric',     required: true,  sbColumn: 'dmi_pct_snapshot' },
  dmiSource:      { type: 'text',        required: true,  sbColumn: 'dmi_source' },
  source:         { type: 'text',        required: false, sbColumn: 'source' },
  notes:          { type: 'text',        required: false, sbColumn: 'notes' },
  sourceKey:      { type: 'text',        required: true,  sbColumn: 'source_key' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const num = v => (v == null || v === '' ? null : Number(v));

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    species: row.species,
    groupId: row.group_id ?? null,
    groupLabel: row.group_label ?? null,
    classId: row.class_id ?? null,
    classLabel: row.class_label ?? null,
    headCount: num(row.head_count),
    avgWeightKg: num(row.avg_weight_kg),
    dmiPctSnapshot: num(row.dmi_pct_snapshot),
    dmiSource: row.dmi_source,
    source: row.source ?? null,
    notes: row.notes ?? null,
    sourceKey: row.source_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
