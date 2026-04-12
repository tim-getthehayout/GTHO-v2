/** @file Entity: input_products — V2_SCHEMA_DESIGN.md §8.3 */

export const FIELDS = {
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:   { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:          { type: 'text',        required: true,  sbColumn: 'name' },
  categoryId:    { type: 'uuid',        required: true,  sbColumn: 'category_id' },
  nPct:          { type: 'numeric',     required: false, sbColumn: 'n_pct' },
  pPct:          { type: 'numeric',     required: false, sbColumn: 'p_pct' },
  kPct:          { type: 'numeric',     required: false, sbColumn: 'k_pct' },
  sPct:          { type: 'numeric',     required: false, sbColumn: 's_pct' },
  caPct:         { type: 'numeric',     required: false, sbColumn: 'ca_pct' },
  mgPct:         { type: 'numeric',     required: false, sbColumn: 'mg_pct' },
  cuPct:         { type: 'numeric',     required: false, sbColumn: 'cu_pct' },
  fePct:         { type: 'numeric',     required: false, sbColumn: 'fe_pct' },
  mnPct:         { type: 'numeric',     required: false, sbColumn: 'mn_pct' },
  moPct:         { type: 'numeric',     required: false, sbColumn: 'mo_pct' },
  znPct:         { type: 'numeric',     required: false, sbColumn: 'zn_pct' },
  bPct:          { type: 'numeric',     required: false, sbColumn: 'b_pct' },
  clPct:         { type: 'numeric',     required: false, sbColumn: 'cl_pct' },
  costPerUnit:   { type: 'numeric',     required: false, sbColumn: 'cost_per_unit' },
  unitId:        { type: 'uuid',        required: false, sbColumn: 'unit_id' },
  archived:      { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name:        data.name        ?? '',
    categoryId:  data.categoryId  ?? null,
    nPct:        data.nPct        ?? null,
    pPct:        data.pPct        ?? null,
    kPct:        data.kPct        ?? null,
    sPct:        data.sPct        ?? null,
    caPct:       data.caPct       ?? null,
    mgPct:       data.mgPct       ?? null,
    cuPct:       data.cuPct       ?? null,
    fePct:       data.fePct       ?? null,
    mnPct:       data.mnPct       ?? null,
    moPct:       data.moPct       ?? null,
    znPct:       data.znPct       ?? null,
    bPct:        data.bPct        ?? null,
    clPct:       data.clPct       ?? null,
    costPerUnit: data.costPerUnit ?? null,
    unitId:      data.unitId      ?? null,
    archived:    data.archived    ?? false,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  if (!record.categoryId) errors.push('categoryId is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:            record.id,
    operation_id:  record.operationId,
    name:          record.name,
    category_id:   record.categoryId,
    n_pct:         record.nPct,
    p_pct:         record.pPct,
    k_pct:         record.kPct,
    s_pct:         record.sPct,
    ca_pct:        record.caPct,
    mg_pct:        record.mgPct,
    cu_pct:        record.cuPct,
    fe_pct:        record.fePct,
    mn_pct:        record.mnPct,
    mo_pct:        record.moPct,
    zn_pct:        record.znPct,
    b_pct:         record.bPct,
    cl_pct:        record.clPct,
    cost_per_unit: record.costPerUnit,
    unit_id:       record.unitId,
    archived:      record.archived,
    created_at:    record.createdAt,
    updated_at:    record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    operationId: row.operation_id,
    name:        row.name,
    categoryId:  row.category_id,
    nPct:        row.n_pct,
    pPct:        row.p_pct,
    kPct:        row.k_pct,
    sPct:        row.s_pct,
    caPct:       row.ca_pct,
    mgPct:       row.mg_pct,
    cuPct:       row.cu_pct,
    fePct:       row.fe_pct,
    mnPct:       row.mn_pct,
    moPct:       row.mo_pct,
    znPct:       row.zn_pct,
    bPct:        row.b_pct,
    clPct:       row.cl_pct,
    costPerUnit: row.cost_per_unit,
    unitId:      row.unit_id,
    archived:    row.archived,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
