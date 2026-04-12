/** @file Entity: animal_classes — V2_SCHEMA_DESIGN.md §3.1 */

export const FIELDS = {
  id:               { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:      { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:             { type: 'text',        required: true,  sbColumn: 'name' },
  species:          { type: 'text',        required: true,  sbColumn: 'species' },
  role:             { type: 'text',        required: true,  sbColumn: 'role' },
  defaultWeightKg:  { type: 'numeric',     required: false, sbColumn: 'default_weight_kg' },
  dmiPct:           { type: 'numeric',     required: false, sbColumn: 'dmi_pct' },
  dmiPctLactating:  { type: 'numeric',     required: false, sbColumn: 'dmi_pct_lactating' },
  excretionNRate:   { type: 'numeric',     required: false, sbColumn: 'excretion_n_rate' },
  excretionPRate:   { type: 'numeric',     required: false, sbColumn: 'excretion_p_rate' },
  excretionKRate:   { type: 'numeric',     required: false, sbColumn: 'excretion_k_rate' },
  weaningAgeDays:   { type: 'integer',     required: false, sbColumn: 'weaning_age_days' },
  archived:         { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:        { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:        { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_SPECIES = ['beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name: data.name ?? '',
    species: data.species ?? 'beef_cattle',
    role: data.role ?? '',
    defaultWeightKg: data.defaultWeightKg ?? null,
    dmiPct: data.dmiPct ?? null,
    dmiPctLactating: data.dmiPctLactating ?? null,
    excretionNRate: data.excretionNRate ?? null,
    excretionPRate: data.excretionPRate ?? null,
    excretionKRate: data.excretionKRate ?? null,
    weaningAgeDays: data.weaningAgeDays ?? null,
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
  if (!record.species || !VALID_SPECIES.includes(record.species)) {
    errors.push(`species must be one of: ${VALID_SPECIES.join(', ')}`);
  }
  if (!record.role || typeof record.role !== 'string' || record.role.trim() === '') {
    errors.push('role is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    name: record.name,
    species: record.species,
    role: record.role,
    default_weight_kg: record.defaultWeightKg,
    dmi_pct: record.dmiPct,
    dmi_pct_lactating: record.dmiPctLactating,
    excretion_n_rate: record.excretionNRate,
    excretion_p_rate: record.excretionPRate,
    excretion_k_rate: record.excretionKRate,
    weaning_age_days: record.weaningAgeDays,
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
    species: row.species,
    role: row.role,
    defaultWeightKg: row.default_weight_kg,
    dmiPct: row.dmi_pct,
    dmiPctLactating: row.dmi_pct_lactating,
    excretionNRate: row.excretion_n_rate,
    excretionPRate: row.excretion_p_rate,
    excretionKRate: row.excretion_k_rate,
    weaningAgeDays: row.weaning_age_days,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
