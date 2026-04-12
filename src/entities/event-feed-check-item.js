/** @file Entity: event_feed_check_items — V2_SCHEMA_DESIGN.md §5.6 */

export const FIELDS = {
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  feedCheckId:       { type: 'uuid',        required: true,  sbColumn: 'feed_check_id' },
  batchId:           { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  locationId:        { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  remainingQuantity: { type: 'numeric',     required: true,  sbColumn: 'remaining_quantity' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    feedCheckId: data.feedCheckId ?? null,
    batchId: data.batchId ?? null,
    locationId: data.locationId ?? null,
    remainingQuantity: data.remainingQuantity ?? 0,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.feedCheckId) errors.push('feedCheckId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (typeof record.remainingQuantity !== 'number') errors.push('remainingQuantity is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
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
    feedCheckId: row.feed_check_id,
    batchId: row.batch_id,
    locationId: row.location_id,
    remainingQuantity: row.remaining_quantity,
    createdAt: row.created_at,
  };
}
