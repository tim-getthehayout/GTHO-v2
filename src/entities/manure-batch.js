/** @file Entity: manure_batches — V2_SCHEMA_DESIGN.md §8.8 */

export const FIELDS = {
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:       { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  label:             { type: 'text',        required: true,  sbColumn: 'label' },
  sourceLocationId:  { type: 'uuid',        required: false, sbColumn: 'source_location_id' },
  estimatedVolumeKg: { type: 'numeric',     required: false, sbColumn: 'estimated_volume_kg' },
  nKg:               { type: 'numeric',     required: false, sbColumn: 'n_kg' },
  pKg:               { type: 'numeric',     required: false, sbColumn: 'p_kg' },
  kKg:               { type: 'numeric',     required: false, sbColumn: 'k_kg' },
  sKg:               { type: 'numeric',     required: false, sbColumn: 's_kg' },
  caKg:              { type: 'numeric',     required: false, sbColumn: 'ca_kg' },
  mgKg:              { type: 'numeric',     required: false, sbColumn: 'mg_kg' },
  cuKg:              { type: 'numeric',     required: false, sbColumn: 'cu_kg' },
  feKg:              { type: 'numeric',     required: false, sbColumn: 'fe_kg' },
  mnKg:              { type: 'numeric',     required: false, sbColumn: 'mn_kg' },
  moKg:              { type: 'numeric',     required: false, sbColumn: 'mo_kg' },
  znKg:              { type: 'numeric',     required: false, sbColumn: 'zn_kg' },
  bKg:               { type: 'numeric',     required: false, sbColumn: 'b_kg' },
  clKg:              { type: 'numeric',     required: false, sbColumn: 'cl_kg' },
  captureDate:       { type: 'date',        required: false, sbColumn: 'capture_date' },
  notes:             { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:         { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:                data.id                ?? crypto.randomUUID(),
    operationId:       data.operationId       ?? null,
    label:             data.label             ?? '',
    sourceLocationId:  data.sourceLocationId  ?? null,
    estimatedVolumeKg: data.estimatedVolumeKg ?? null,
    nKg:               data.nKg               ?? null,
    pKg:               data.pKg               ?? null,
    kKg:               data.kKg               ?? null,
    sKg:               data.sKg               ?? null,
    caKg:              data.caKg              ?? null,
    mgKg:              data.mgKg              ?? null,
    cuKg:              data.cuKg              ?? null,
    feKg:              data.feKg              ?? null,
    mnKg:              data.mnKg              ?? null,
    moKg:              data.moKg              ?? null,
    znKg:              data.znKg              ?? null,
    bKg:               data.bKg               ?? null,
    clKg:              data.clKg              ?? null,
    captureDate:       data.captureDate       ?? null,
    notes:             data.notes             ?? null,
    createdAt:         data.createdAt         ?? new Date().toISOString(),
    updatedAt:         data.updatedAt         ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.label || typeof record.label !== 'string' || record.label.trim() === '') {
    errors.push('label is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:                  record.id,
    operation_id:        record.operationId,
    label:               record.label,
    source_location_id:  record.sourceLocationId,
    estimated_volume_kg: record.estimatedVolumeKg,
    n_kg:                record.nKg,
    p_kg:                record.pKg,
    k_kg:                record.kKg,
    s_kg:                record.sKg,
    ca_kg:               record.caKg,
    mg_kg:               record.mgKg,
    cu_kg:               record.cuKg,
    fe_kg:               record.feKg,
    mn_kg:               record.mnKg,
    mo_kg:               record.moKg,
    zn_kg:               record.znKg,
    b_kg:                record.bKg,
    cl_kg:               record.clKg,
    capture_date:        record.captureDate,
    notes:               record.notes,
    created_at:          record.createdAt,
    updated_at:          record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: estimated_volume_kg + 14 nutrient cols all numeric.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id:                row.id,
    operationId:       row.operation_id,
    label:             row.label,
    sourceLocationId:  row.source_location_id,
    estimatedVolumeKg: n(row.estimated_volume_kg),
    nKg:               n(row.n_kg),
    pKg:               n(row.p_kg),
    kKg:               n(row.k_kg),
    sKg:               n(row.s_kg),
    caKg:              n(row.ca_kg),
    mgKg:              n(row.mg_kg),
    cuKg:              n(row.cu_kg),
    feKg:              n(row.fe_kg),
    mnKg:              n(row.mn_kg),
    moKg:              n(row.mo_kg),
    znKg:              n(row.zn_kg),
    bKg:               n(row.b_kg),
    clKg:              n(row.cl_kg),
    captureDate:       row.capture_date,
    notes:             row.notes,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}
