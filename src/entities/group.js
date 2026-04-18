/** @file Entity: groups — V2_SCHEMA_DESIGN.md §3.3 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:       { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  name:         { type: 'text',        required: true,  sbColumn: 'name' },
  color:        { type: 'text',        required: false, sbColumn: 'color' },
  // OI-0090 / SP-11: `archived boolean` upgraded to `archived_at timestamptz`
  // (NULL = active, timestamp = archived on that date).
  archivedAt:   { type: 'timestamptz', required: false, sbColumn: 'archived_at' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    name: data.name ?? '',
    color: data.color ?? null,
    archivedAt: data.archivedAt ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  if (record.archivedAt !== null && record.archivedAt !== undefined) {
    if (typeof record.archivedAt !== 'string' || isNaN(Date.parse(record.archivedAt))) {
      errors.push('archivedAt must be a valid ISO timestamp or null');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    name: record.name,
    color: record.color,
    archived_at: record.archivedAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    name: row.name,
    color: row.color,
    archivedAt: row.archived_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
