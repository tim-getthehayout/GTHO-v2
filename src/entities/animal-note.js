/** @file Entity: animal_notes — OI-0003 resolution, D9 amendment */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:     { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  notedAt:      { type: 'timestamptz', required: true,  sbColumn: 'noted_at' },
  note:         { type: 'text',        required: true,  sbColumn: 'note' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    animalId: data.animalId ?? null,
    notedAt: data.notedAt ?? new Date().toISOString(),
    note: data.note ?? '',
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.notedAt) errors.push('notedAt is required');
  if (!record.note || typeof record.note !== 'string' || record.note.trim() === '') {
    errors.push('note is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    animal_id: record.animalId,
    noted_at: record.notedAt,
    note: record.note,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    animalId: row.animal_id,
    notedAt: row.noted_at,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
