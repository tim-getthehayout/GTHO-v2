/** @file Entity: animal_weight_records — V2_SCHEMA_DESIGN.md §9.10 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:    { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  recordedAt:  { type: 'timestamptz', required: true,  sbColumn: 'recorded_at' },
  weightKg:    { type: 'numeric',     required: true,  sbColumn: 'weight_kg' },
  source:      { type: 'text',        required: true,  sbColumn: 'source' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_SOURCES = ['manual', 'group_update', 'calving', 'import'];

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    animalId:    data.animalId    ?? null,
    recordedAt:  data.recordedAt  ?? null,
    weightKg:    data.weightKg    ?? null,
    source:      data.source      ?? null,
    notes:       data.notes       ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.recordedAt) errors.push('recordedAt is required');
  if (record.weightKg === null || record.weightKg === undefined) {
    errors.push('weightKg is required');
  }
  if (!record.source) {
    errors.push('source is required');
  } else if (!VALID_SOURCES.includes(record.source)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    animal_id:    record.animalId,
    recorded_at:  record.recordedAt,
    weight_kg:    record.weightKg,
    source:       record.source,
    notes:        record.notes,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    operationId: row.operation_id,
    animalId:    row.animal_id,
    recordedAt:  row.recorded_at,
    weightKg:    row.weight_kg,
    source:      row.source,
    notes:       row.notes,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
