/** @file Entity: treatment_types — V2_SCHEMA_DESIGN.md §9.3 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:        { type: 'text',        required: true,  sbColumn: 'name' },
  categoryId:  { type: 'uuid',        required: true,  sbColumn: 'category_id' },
  archived:    { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name:        data.name        ?? '',
    categoryId:  data.categoryId  ?? null,
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
    id:           record.id,
    operation_id: record.operationId,
    name:         record.name,
    category_id:  record.categoryId,
    archived:     record.archived,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    operationId: row.operation_id,
    name:        row.name,
    categoryId:  row.category_id,
    archived:    row.archived,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
