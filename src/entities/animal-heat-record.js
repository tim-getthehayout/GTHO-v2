/** @file Entity: animal_heat_records — V2_SCHEMA_DESIGN.md §9.8 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:    { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  observedAt:  { type: 'timestamptz', required: true,  sbColumn: 'observed_at' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    animalId:    data.animalId    ?? null,
    observedAt:  data.observedAt  ?? null,
    notes:       data.notes       ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.observedAt) errors.push('observedAt is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    animal_id:    record.animalId,
    observed_at:  record.observedAt,
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
    observedAt:  row.observed_at,
    notes:       row.notes,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
