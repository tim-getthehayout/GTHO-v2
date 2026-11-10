import { normalizeUnitName } from '../utils/unit-standards.js';
import { releasedColumns } from '../data/schema-columns.js';
/** @file Entity: dose_units — V2_SCHEMA_DESIGN.md §9.4 */

export const FIELDS = {
  id:        { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid', required: false, sbColumn: 'operation_id' },
  name:      { type: 'text',        required: true,  sbColumn: 'name' },
  archived:  { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt: { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt: { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:        data.id        ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    name:      normalizeUnitName(data.name),
    archived:  data.archived  ?? false,
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
    ...releasedColumns(44, { operation_id: record.operationId ?? null }),
    id:         record.id,
    name:       normalizeUnitName(record.name),
    archived:   record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    operationId: row.operation_id ?? null,
    id:        row.id,
    name:      row.name,
    archived:  row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
