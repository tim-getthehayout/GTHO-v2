/** @file Entity: farms — V2_SCHEMA_DESIGN.md §1.2 */

export const FIELDS = {
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:   { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  name:          { type: 'text',        required: true,  sbColumn: 'name' },
  address:       { type: 'text',        required: false, sbColumn: 'address' },
  latitude:      { type: 'numeric',     required: false, sbColumn: 'latitude' },
  longitude:     { type: 'numeric',     required: false, sbColumn: 'longitude' },
  areaHectares:  { type: 'numeric',     required: false, sbColumn: 'area_hectares' },
  notes:         { type: 'text',        required: false, sbColumn: 'notes' },
  archived:      { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name: data.name ?? '',
    address: data.address ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    areaHectares: data.areaHectares ?? null,
    notes: data.notes ?? null,
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
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    name: record.name,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    area_hectares: record.areaHectares,
    notes: record.notes,
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
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    areaHectares: row.area_hectares,
    notes: row.notes,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
