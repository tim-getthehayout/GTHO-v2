/** @file Entity: input_product_units — V2_SCHEMA_DESIGN.md §8.2 */

export const FIELDS = {
  id:        { type: 'uuid',        required: false, sbColumn: 'id' },
  name:      { type: 'text',        required: true,  sbColumn: 'name' },
  archived:  { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt: { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt: { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:        data.id       ?? crypto.randomUUID(),
    name:      data.name     ?? '',
    archived:  data.archived ?? false,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:         record.id,
    name:       record.name,
    archived:   record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:        row.id,
    name:      row.name,
    archived:  row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
