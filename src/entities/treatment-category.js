/** @file Entity: treatment_categories — V2_SCHEMA_DESIGN.md §9.2 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:        { type: 'text',        required: true,  sbColumn: 'name' },
  isDefault:   { type: 'boolean',     required: false, sbColumn: 'is_default' },
  archived:    { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name:        data.name        ?? '',
    isDefault:   data.isDefault   ?? false,
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
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    name:         record.name,
    is_default:   record.isDefault,
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
    isDefault:   row.is_default,
    archived:    row.archived,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
