import { releasedColumns } from '../data/schema-columns.js';

/** @file Entity: event_feed_check_items — V2_SCHEMA_DESIGN.md §5.6 */

export const FIELDS = {
  feedTypeId: { type: 'uuid', required: false, sbColumn: 'feed_type_id' },
  unitSnapshot: { type: 'text', required: false, sbColumn: 'unit_snapshot' },
  weightPerUnitKgSnapshot: { type: 'numeric', required: false, sbColumn: 'weight_per_unit_kg_snapshot' },
  dmPctSnapshot: { type: 'numeric', required: false, sbColumn: 'dm_pct_snapshot' },
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:       { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  feedCheckId:       { type: 'uuid',        required: true,  sbColumn: 'feed_check_id' },
  batchId:           { type: 'uuid',        required: false,  sbColumn: 'batch_id' },
  locationId:        { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  remainingQuantity: { type: 'numeric',     required: true,  sbColumn: 'remaining_quantity' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
    feedTypeId: data.feedTypeId ?? null,
    unitSnapshot: data.unitSnapshot ?? null,
    weightPerUnitKgSnapshot: data.weightPerUnitKgSnapshot ?? null,
    dmPctSnapshot: data.dmPctSnapshot ?? null,
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    feedCheckId: data.feedCheckId ?? null,
    batchId: data.batchId ?? null,
    locationId: data.locationId ?? null,
    remainingQuantity: data.remainingQuantity ?? 0,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.feedCheckId) errors.push('feedCheckId is required');
  if (!record.batchId && !record.feedTypeId) errors.push('batchId or feedTypeId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (typeof record.remainingQuantity !== 'number') errors.push('remainingQuantity is required');
  for (const key of ['feedTypeId', 'unitSnapshot']) if (record[key] != null && (typeof record[key] !== 'string' || !record[key].trim())) errors.push(`${key} must be nonempty text or null`);
  if (record.weightPerUnitKgSnapshot != null && (!Number.isFinite(record.weightPerUnitKgSnapshot) || record.weightPerUnitKgSnapshot <= 0)) errors.push('weightPerUnitKgSnapshot must be positive and finite');
  if (record.dmPctSnapshot != null && (!Number.isFinite(record.dmPctSnapshot) || record.dmPctSnapshot < 0 || record.dmPctSnapshot > 100)) errors.push('dmPctSnapshot must be between 0 and 100');
  if (record.feedTypeId && record.batchId) errors.push('pool checks cannot retain batch identity');
  if (record.feedTypeId && (!Number.isFinite(record.remainingQuantity) || record.remainingQuantity < 0)) errors.push('pool remainder must be finite and nonnegative');
  if (record.feedTypeId && record.remainingQuantity > 0 && (!record.unitSnapshot || !(record.weightPerUnitKgSnapshot > 0) || record.dmPctSnapshot == null)) errors.push('positive pool check needs conversion snapshots');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    ...releasedColumns(43, {
      feed_type_id: record.feedTypeId ?? null,
      unit_snapshot: record.unitSnapshot ?? null,
      weight_per_unit_kg_snapshot: record.weightPerUnitKgSnapshot ?? null,
      dm_pct_snapshot: record.dmPctSnapshot ?? null,
    }),
    id: record.id,
    operation_id: record.operationId,
    feed_check_id: record.feedCheckId,
    batch_id: record.batchId,
    location_id: record.locationId,
    remaining_quantity: record.remainingQuantity,
    created_at: record.createdAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    feedTypeId: row.feed_type_id ?? null,
    unitSnapshot: row.unit_snapshot ?? null,
    weightPerUnitKgSnapshot: row.weight_per_unit_kg_snapshot != null ? Number(row.weight_per_unit_kg_snapshot) : null,
    dmPctSnapshot: row.dm_pct_snapshot != null ? Number(row.dm_pct_snapshot) : null,
    id: row.id,
    operationId: row.operation_id,
    feedCheckId: row.feed_check_id,
    batchId: row.batch_id,
    locationId: row.location_id,
    // PostgREST returns numeric columns as strings (arbitrary-precision);
    // coerce to Number so downstream math and typeof checks work.
    remainingQuantity: row.remaining_quantity != null ? Number(row.remaining_quantity) : null,
    createdAt: row.created_at,
  };
}
