/** @file Entity: batch_nutritional_profiles — V2_SCHEMA_DESIGN.md §10.1 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  batchId:     { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  testedAt:    { type: 'date',        required: true,  sbColumn: 'tested_at' },
  source:      { type: 'text',        required: true,  sbColumn: 'source' },
  dmPct:       { type: 'numeric',     required: false, sbColumn: 'dm_pct' },
  proteinPct:  { type: 'numeric',     required: false, sbColumn: 'protein_pct' },
  adfPct:      { type: 'numeric',     required: false, sbColumn: 'adf_pct' },
  ndfPct:      { type: 'numeric',     required: false, sbColumn: 'ndf_pct' },
  tdnPct:      { type: 'numeric',     required: false, sbColumn: 'tdn_pct' },
  rfv:         { type: 'numeric',     required: false, sbColumn: 'rfv' },
  nPct:        { type: 'numeric',     required: false, sbColumn: 'n_pct' },
  pPct:        { type: 'numeric',     required: false, sbColumn: 'p_pct' },
  kPct:        { type: 'numeric',     required: false, sbColumn: 'k_pct' },
  caPct:       { type: 'numeric',     required: false, sbColumn: 'ca_pct' },
  mgPct:       { type: 'numeric',     required: false, sbColumn: 'mg_pct' },
  sPct:        { type: 'numeric',     required: false, sbColumn: 's_pct' },
  lab:         { type: 'text',        required: false, sbColumn: 'lab' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    batchId:     data.batchId     ?? null,
    testedAt:    data.testedAt    ?? null,
    source:      data.source      ?? '',
    dmPct:       data.dmPct       ?? null,
    proteinPct:  data.proteinPct  ?? null,
    adfPct:      data.adfPct      ?? null,
    ndfPct:      data.ndfPct      ?? null,
    tdnPct:      data.tdnPct      ?? null,
    rfv:         data.rfv         ?? null,
    nPct:        data.nPct        ?? null,
    pPct:        data.pPct        ?? null,
    kPct:        data.kPct        ?? null,
    caPct:       data.caPct       ?? null,
    mgPct:       data.mgPct       ?? null,
    sPct:        data.sPct        ?? null,
    lab:         data.lab         ?? null,
    notes:       data.notes       ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.testedAt) errors.push('testedAt is required');
  if (!record.source || typeof record.source !== 'string' || record.source.trim() === '') {
    errors.push('source is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    batch_id:     record.batchId,
    tested_at:    record.testedAt,
    source:       record.source,
    dm_pct:       record.dmPct,
    protein_pct:  record.proteinPct,
    adf_pct:      record.adfPct,
    ndf_pct:      record.ndfPct,
    tdn_pct:      record.tdnPct,
    rfv:          record.rfv,
    n_pct:        record.nPct,
    p_pct:        record.pPct,
    k_pct:        record.kPct,
    ca_pct:       record.caPct,
    mg_pct:       record.mgPct,
    s_pct:        record.sPct,
    lab:          record.lab,
    notes:        record.notes,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: every lab-result column is a PostgREST-stringified numeric.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id:          row.id,
    operationId: row.operation_id,
    batchId:     row.batch_id,
    testedAt:    row.tested_at,
    source:      row.source,
    dmPct:       n(row.dm_pct),
    proteinPct:  n(row.protein_pct),
    adfPct:      n(row.adf_pct),
    ndfPct:      n(row.ndf_pct),
    tdnPct:      n(row.tdn_pct),
    rfv:         n(row.rfv),
    nPct:        n(row.n_pct),
    pPct:        n(row.p_pct),
    kPct:        n(row.k_pct),
    caPct:       n(row.ca_pct),
    mgPct:       n(row.mg_pct),
    sPct:        n(row.s_pct),
    lab:         row.lab,
    notes:       row.notes,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
