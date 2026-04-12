/** @file Entity: animal_group_memberships — V2_SCHEMA_DESIGN.md §3.4 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:     { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  groupId:      { type: 'uuid',        required: true,  sbColumn: 'group_id' },
  dateJoined:   { type: 'date',        required: true,  sbColumn: 'date_joined' },
  dateLeft:     { type: 'date',        required: false, sbColumn: 'date_left' },
  reason:       { type: 'text',        required: false, sbColumn: 'reason' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    animalId: data.animalId ?? null,
    groupId: data.groupId ?? null,
    dateJoined: data.dateJoined ?? null,
    dateLeft: data.dateLeft ?? null,
    reason: data.reason ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.groupId) errors.push('groupId is required');
  if (!record.dateJoined) errors.push('dateJoined is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    animal_id: record.animalId,
    group_id: record.groupId,
    date_joined: record.dateJoined,
    date_left: record.dateLeft,
    reason: record.reason,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    animalId: row.animal_id,
    groupId: row.group_id,
    dateJoined: row.date_joined,
    dateLeft: row.date_left,
    reason: row.reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
