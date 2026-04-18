/** @file Entity: event_feed_check_items — V2_SCHEMA_DESIGN.md §5.6 */

export const FIELDS = {
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:       { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  feedCheckId:       { type: 'uuid',        required: true,  sbColumn: 'feed_check_id' },
  batchId:           { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  locationId:        { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  remainingQuantity: { type: 'numeric',     required: true,  sbColumn: 'remaining_quantity' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
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
  if (!record.batchId) errors.push('batchId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (typeof record.remainingQuantity !== 'number') errors.push('remainingQuantity is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
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
