/** @file Entity: amendment_locations — V2_SCHEMA_DESIGN.md §8.7 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  amendmentId: { type: 'uuid',        required: true,  sbColumn: 'amendment_id' },
  locationId:  { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  qty:         { type: 'numeric',     required: false, sbColumn: 'qty' },
  nKg:         { type: 'numeric',     required: false, sbColumn: 'n_kg' },
  pKg:         { type: 'numeric',     required: false, sbColumn: 'p_kg' },
  kKg:         { type: 'numeric',     required: false, sbColumn: 'k_kg' },
  sKg:         { type: 'numeric',     required: false, sbColumn: 's_kg' },
  caKg:        { type: 'numeric',     required: false, sbColumn: 'ca_kg' },
  mgKg:        { type: 'numeric',     required: false, sbColumn: 'mg_kg' },
  cuKg:        { type: 'numeric',     required: false, sbColumn: 'cu_kg' },
  feKg:        { type: 'numeric',     required: false, sbColumn: 'fe_kg' },
  mnKg:        { type: 'numeric',     required: false, sbColumn: 'mn_kg' },
  moKg:        { type: 'numeric',     required: false, sbColumn: 'mo_kg' },
  znKg:        { type: 'numeric',     required: false, sbColumn: 'zn_kg' },
  bKg:         { type: 'numeric',     required: false, sbColumn: 'b_kg' },
  clKg:        { type: 'numeric',     required: false, sbColumn: 'cl_kg' },
  areaHa:      { type: 'numeric',     required: false, sbColumn: 'area_ha' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    amendmentId: data.amendmentId ?? null,
    locationId:  data.locationId  ?? null,
    qty:         data.qty         ?? null,
    nKg:         data.nKg         ?? null,
    pKg:         data.pKg         ?? null,
    kKg:         data.kKg         ?? null,
    sKg:         data.sKg         ?? null,
    caKg:        data.caKg        ?? null,
    mgKg:        data.mgKg        ?? null,
    cuKg:        data.cuKg        ?? null,
    feKg:        data.feKg        ?? null,
    mnKg:        data.mnKg        ?? null,
    moKg:        data.moKg        ?? null,
    znKg:        data.znKg        ?? null,
    bKg:         data.bKg         ?? null,
    clKg:        data.clKg        ?? null,
    areaHa:      data.areaHa      ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.amendmentId) errors.push('amendmentId is required');
  if (!record.locationId) errors.push('locationId is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    amendment_id: record.amendmentId,
    location_id:  record.locationId,
    qty:          record.qty,
    n_kg:         record.nKg,
    p_kg:         record.pKg,
    k_kg:         record.kKg,
    s_kg:         record.sKg,
    ca_kg:        record.caKg,
    mg_kg:        record.mgKg,
    cu_kg:        record.cuKg,
    fe_kg:        record.feKg,
    mn_kg:        record.mnKg,
    mo_kg:        record.moKg,
    zn_kg:        record.znKg,
    b_kg:         record.bKg,
    cl_kg:        record.clKg,
    area_ha:      record.areaHa,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: qty + 12 nutrient kg cols + area_ha all numeric.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id:          row.id,
    operationId: row.operation_id,
    amendmentId: row.amendment_id,
    locationId:  row.location_id,
    qty:         n(row.qty),
    nKg:         n(row.n_kg),
    pKg:         n(row.p_kg),
    kKg:         n(row.k_kg),
    sKg:         n(row.s_kg),
    caKg:        n(row.ca_kg),
    mgKg:        n(row.mg_kg),
    cuKg:        n(row.cu_kg),
    feKg:        n(row.fe_kg),
    mnKg:        n(row.mn_kg),
    moKg:        n(row.mo_kg),
    znKg:        n(row.zn_kg),
    bKg:         n(row.b_kg),
    clKg:        n(row.cl_kg),
    areaHa:      n(row.area_ha),
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
