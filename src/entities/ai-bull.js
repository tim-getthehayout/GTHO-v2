/** @file Entity: ai_bulls — V2_SCHEMA_DESIGN.md §9.1 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:        { type: 'text',        required: true,  sbColumn: 'name' },
  breed:       { type: 'text',        required: false, sbColumn: 'breed' },
  tag:         { type: 'text',        required: false, sbColumn: 'tag' },
  regNum:      { type: 'text',        required: false, sbColumn: 'reg_num' },
  archived:    { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name:        data.name        ?? '',
    breed:       data.breed       ?? null,
    tag:         data.tag         ?? null,
    regNum:      data.regNum      ?? null,
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
    breed:        record.breed,
    tag:          record.tag,
    reg_num:      record.regNum,
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
    breed:       row.breed,
    tag:         row.tag,
    regNum:      row.reg_num,
    archived:    row.archived,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
