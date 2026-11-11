import { RELEASED_SCHEMA_VERSION } from '../data/schema-release.js';
/** @file Entity: operations — V2_SCHEMA_DESIGN.md §1.1, CP-55 schema_version */

export const FIELDS = {
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  name:          { type: 'text',        required: true,  sbColumn: 'name' },
  timezone:      { type: 'text',        required: false, sbColumn: 'timezone' },
  currency:      { type: 'text',        required: false, sbColumn: 'currency' },
  unitSystem:    { type: 'text',        required: false, sbColumn: 'unit_system' },
  schemaVersion: { type: 'integer',     required: false, sbColumn: 'schema_version' },
  archived:      { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

/**
 * Create a new operation record with defaults.
 * @param {object} data
 * @returns {object}
 */
export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    name: data.name ?? '',
    timezone: data.timezone ?? null,
    currency: data.currency ?? 'USD',
    unitSystem: data.unitSystem ?? 'imperial',
    schemaVersion: data.schemaVersion ?? RELEASED_SCHEMA_VERSION,
    archived: data.archived ?? false,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Validate an operation record.
 * @param {object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(record) {
  const errors = [];
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  const validUnits = ['metric', 'imperial'];
  if (record.unitSystem && !validUnits.includes(record.unitSystem)) {
    errors.push(`unitSystem must be one of: ${validUnits.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Convert camelCase JS record to snake_case Supabase shape.
 * @param {object} record
 * @returns {object}
 */
export function toSupabaseShape(record) {
  return {
    id: record.id,
    name: record.name,
    timezone: record.timezone,
    currency: record.currency,
    unit_system: record.unitSystem,
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/**
 * Convert snake_case Supabase row to camelCase JS record.
 * @param {object} row
 * @returns {object}
 */
export function fromSupabaseShape(row) {
  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    currency: row.currency,
    unitSystem: row.unit_system,
    schemaVersion: row.schema_version,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Ordinary server-shaped pushes must never replay a cached schema stamp.
 * INSERT is the onboarding creation exception; its stamp is compiled, not cached.
 * CP-56 bypasses this ordinary push path and resolves its stamp independently.
 */
export function operationPushShape(row, operation = 'upsert') {
  const shape = { ...row };
  delete shape.schema_version;
  if (operation === 'insert') shape.schema_version = RELEASED_SCHEMA_VERSION;
  return shape;
}

/** Only onboarding uses this serializer; ordinary toSupabaseShape omits the stamp. */
export function toOnboardingSupabaseShape(record) {
  return operationPushShape(toSupabaseShape(record), 'insert');
}
