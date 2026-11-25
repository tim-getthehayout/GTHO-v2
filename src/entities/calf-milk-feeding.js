/** @file Entity: calf_milk_feedings (051, #449) — milk fed to calves.
 * Metric storage: volume_l plus kg_per_l_snapshot (the farm factor at entry).
 * Weight is derived on read (volume × snapshot), never stored. Optional calf
 * group (cleared if the group is deleted). Farm-scoped, hard delete. Written
 * only once the dairy schema (51) is released. */
import { assertDairyWritable } from './milk-pickup.js';

export const FIELDS = {
  id:             { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:         { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  fedAt:          { type: 'timestamptz', required: true,  sbColumn: 'fed_at' },
  volumeL:        { type: 'numeric',     required: true,  sbColumn: 'volume_l' },
  kgPerLSnapshot: { type: 'numeric',     required: true,  sbColumn: 'kg_per_l_snapshot' },
  groupId:        { type: 'uuid',        required: false, sbColumn: 'group_id' },
  notes:          { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const text = v => (v == null || String(v).trim() === '' ? null : String(v).trim());
const positive = v => v != null && Number.isFinite(Number(v)) && Number(v) > 0;

export function create(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    fedAt: data.fedAt ?? now,
    volumeL: data.volumeL ?? null,
    kgPerLSnapshot: data.kgPerLSnapshot ?? null,
    groupId: data.groupId ?? null,
    notes: text(data.notes),
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  if (typeof record.fedAt !== 'string' || isNaN(Date.parse(record.fedAt))) errors.push('fedAt must be a valid timestamp');
  if (!positive(record.volumeL)) errors.push('volumeL must be greater than 0');
  if (!positive(record.kgPerLSnapshot)) errors.push('kgPerLSnapshot must be greater than 0');
  return { valid: errors.length === 0, errors };
}

/** Derived calf milk weight (kg) = volume × the snapshot factor. */
export function calfMilkKg(record) {
  const v = Number(record?.volumeL);
  const f = Number(record?.kgPerLSnapshot);
  return Number.isFinite(v) && Number.isFinite(f) ? v * f : 0;
}

export function toSupabaseShape(record) {
  assertDairyWritable();
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    fed_at: record.fedAt,
    volume_l: record.volumeL,
    kg_per_l_snapshot: record.kgPerLSnapshot,
    group_id: record.groupId ?? null,
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
    fedAt: row.fed_at,
    volumeL: row.volume_l != null ? Number(row.volume_l) : null,
    kgPerLSnapshot: row.kg_per_l_snapshot != null ? Number(row.kg_per_l_snapshot) : null,
    groupId: row.group_id ?? null,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
