/** @file Entity: forage_types — V2_SCHEMA_DESIGN.md §2.2 */

export const FIELDS = {
  id:                   { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:          { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:                 { type: 'text',        required: true,  sbColumn: 'name' },
  dmPct:                { type: 'numeric',     required: false, sbColumn: 'dm_pct' },
  nPerTonneDm:          { type: 'numeric',     required: false, sbColumn: 'n_per_tonne_dm' },
  pPerTonneDm:          { type: 'numeric',     required: false, sbColumn: 'p_per_tonne_dm' },
  kPerTonneDm:          { type: 'numeric',     required: false, sbColumn: 'k_per_tonne_dm' },
  dmKgPerCmPerHa:       { type: 'numeric',     required: false, sbColumn: 'dm_kg_per_cm_per_ha' },
  minResidualHeightCm:  { type: 'numeric',     required: false, sbColumn: 'min_residual_height_cm' },
  utilizationPct:       { type: 'numeric',     required: false, sbColumn: 'utilization_pct' },
  notes:                { type: 'text',        required: false, sbColumn: 'notes' },
  isSeeded:             { type: 'boolean',     required: false, sbColumn: 'is_seeded' },
  archived:             { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:            { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:            { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name: data.name ?? '',
    dmPct: data.dmPct ?? null,
    nPerTonneDm: data.nPerTonneDm ?? null,
    pPerTonneDm: data.pPerTonneDm ?? null,
    kPerTonneDm: data.kPerTonneDm ?? null,
    dmKgPerCmPerHa: data.dmKgPerCmPerHa ?? null,
    minResidualHeightCm: data.minResidualHeightCm ?? null,
    utilizationPct: data.utilizationPct ?? null,
    notes: data.notes ?? null,
    isSeeded: data.isSeeded ?? false,
    archived: data.archived ?? false,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    name: record.name,
    dm_pct: record.dmPct,
    n_per_tonne_dm: record.nPerTonneDm,
    p_per_tonne_dm: record.pPerTonneDm,
    k_per_tonne_dm: record.kPerTonneDm,
    dm_kg_per_cm_per_ha: record.dmKgPerCmPerHa,
    min_residual_height_cm: record.minResidualHeightCm,
    utilization_pct: record.utilizationPct,
    notes: record.notes,
    is_seeded: record.isSeeded,
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    name: row.name,
    dmPct: row.dm_pct,
    nPerTonneDm: row.n_per_tonne_dm,
    pPerTonneDm: row.p_per_tonne_dm,
    kPerTonneDm: row.k_per_tonne_dm,
    dmKgPerCmPerHa: row.dm_kg_per_cm_per_ha,
    minResidualHeightCm: row.min_residual_height_cm,
    utilizationPct: row.utilization_pct,
    notes: row.notes,
    isSeeded: row.is_seeded,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
