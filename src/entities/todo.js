/** @file Entity: todos — V2_SCHEMA_DESIGN.md §11.3 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  title:       { type: 'text',        required: true,  sbColumn: 'title' },
  description: { type: 'text',        required: false, sbColumn: 'description' },
  status:      { type: 'text',        required: false, sbColumn: 'status' },
  note:        { type: 'text',        required: false, sbColumn: 'note' },
  locationId:  { type: 'uuid',        required: false, sbColumn: 'location_id' },
  animalId:    { type: 'uuid',        required: false, sbColumn: 'animal_id' },
  dueDate:     { type: 'date',        required: false, sbColumn: 'due_date' },
  createdBy:   { type: 'uuid',        required: false, sbColumn: 'created_by' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    title:       data.title       ?? '',
    description: data.description ?? null,
    status:      data.status      ?? 'open',
    note:        data.note        ?? null,
    locationId:  data.locationId  ?? null,
    animalId:    data.animalId    ?? null,
    dueDate:     data.dueDate     ?? null,
    createdBy:   data.createdBy   ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.title || typeof record.title !== 'string' || record.title.trim() === '') {
    errors.push('title is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    title:        record.title,
    description:  record.description,
    status:       record.status,
    note:         record.note,
    location_id:  record.locationId,
    animal_id:    record.animalId,
    due_date:     record.dueDate,
    created_by:   record.createdBy,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    operationId: row.operation_id,
    title:       row.title,
    description: row.description,
    status:      row.status,
    note:        row.note,
    locationId:  row.location_id,
    animalId:    row.animal_id,
    dueDate:     row.due_date,
    createdBy:   row.created_by,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
