/** @file Entity: milk_pickups (051, #449) — processor milk pickups.
 * Metric storage: weight_kg. Farm-scoped, hard delete. Written only once the
 * dairy schema (51) is released; before that toSupabaseShape refuses. */
import { RELEASED_SCHEMA_VERSION, DAIRY_SCHEMA_VERSION } from '../data/schema-release.js';
import { t } from '../i18n/i18n.js';

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:      { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  pickedUpAt:  { type: 'timestamptz', required: true,  sbColumn: 'picked_up_at' },
  weightKg:    { type: 'numeric',     required: true,  sbColumn: 'weight_kg' },
  driver:      { type: 'text',        required: false, sbColumn: 'driver' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const text = v => (v == null || String(v).trim() === '' ? null : String(v).trim());

export function create(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    pickedUpAt: data.pickedUpAt ?? now,
    weightKg: data.weightKg ?? null,
    driver: text(data.driver),
    notes: text(data.notes),
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  if (typeof record.pickedUpAt !== 'string' || isNaN(Date.parse(record.pickedUpAt))) errors.push('pickedUpAt must be a valid timestamp');
  const w = Number(record.weightKg);
  if (record.weightKg == null || !Number.isFinite(w) || w <= 0) errors.push('weightKg must be greater than 0');
  return { valid: errors.length === 0, errors };
}

/** Refuses (throws) before the dairy schema is released: nothing is written early. */
export function assertDairyWritable() {
  if (RELEASED_SCHEMA_VERSION < DAIRY_SCHEMA_VERSION) {
    throw new Error(t('manualEntry.unreleasedSchema', { version: DAIRY_SCHEMA_VERSION }));
  }
}

export function toSupabaseShape(record) {
  assertDairyWritable();
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    picked_up_at: record.pickedUpAt,
    weight_kg: record.weightKg,
    driver: record.driver ?? null,
    notes: record.notes ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    pickedUpAt: row.picked_up_at,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    driver: row.driver ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
