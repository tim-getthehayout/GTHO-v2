/** @file Entity: feed_types — V2_SCHEMA_DESIGN.md §4.1 */

export const FIELDS = {
  id:              { type: 'uuid',     required: false, sbColumn: 'id' },
  operationId:     { type: 'uuid',     required: true,  sbColumn: 'operation_id' },
  name:            { type: 'text',     required: true,  sbColumn: 'name' },
  category:        { type: 'text',     required: true,  sbColumn: 'category' },
  unit:            { type: 'text',     required: true,  sbColumn: 'unit' },
  dmPct:           { type: 'numeric',  required: false, sbColumn: 'dm_pct' },
  nPct:            { type: 'numeric',  required: false, sbColumn: 'n_pct' },
  pPct:            { type: 'numeric',  required: false, sbColumn: 'p_pct' },
  kPct:            { type: 'numeric',  required: false, sbColumn: 'k_pct' },
  defaultWeightKg: { type: 'numeric',  required: false, sbColumn: 'default_weight_kg' },
  cuttingNumber:   { type: 'smallint', required: false, sbColumn: 'cutting_number' },
  forageTypeId:    { type: 'uuid',     required: false, sbColumn: 'forage_type_id' },
  harvestActive:   { type: 'boolean',  required: false, sbColumn: 'harvest_active' },
  archived:        { type: 'boolean',  required: false, sbColumn: 'archived' },
  createdAt:       { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:       { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name: data.name ?? '',
    category: data.category ?? '',
    unit: data.unit ?? '',
    dmPct: data.dmPct ?? null,
    nPct: data.nPct ?? null,
    pPct: data.pPct ?? null,
    kPct: data.kPct ?? null,
    defaultWeightKg: data.defaultWeightKg ?? null,
    cuttingNumber: data.cuttingNumber ?? null,
    forageTypeId: data.forageTypeId ?? null,
    harvestActive: data.harvestActive ?? false,
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
  if (!record.category || typeof record.category !== 'string' || record.category.trim() === '') {
    errors.push('category is required');
  }
  if (!record.unit || typeof record.unit !== 'string' || record.unit.trim() === '') {
    errors.push('unit is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    name: record.name,
    category: record.category,
    unit: record.unit,
    dm_pct: record.dmPct,
    n_pct: record.nPct,
    p_pct: record.pPct,
    k_pct: record.kPct,
    default_weight_kg: record.defaultWeightKg,
    cutting_number: record.cuttingNumber,
    forage_type_id: record.forageTypeId,
    harvest_active: record.harvestActive,
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: feed_type numerics feed DMI calcs and weight-per-unit rollups.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id: row.id,
    operationId: row.operation_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    dmPct: n(row.dm_pct),
    nPct: n(row.n_pct),
    pPct: n(row.p_pct),
    kPct: n(row.k_pct),
    defaultWeightKg: n(row.default_weight_kg),
    cuttingNumber: n(row.cutting_number),
    forageTypeId: row.forage_type_id,
    harvestActive: row.harvest_active,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
