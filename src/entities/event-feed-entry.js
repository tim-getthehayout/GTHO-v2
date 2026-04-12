/** @file Entity: event_feed_entries — V2_SCHEMA_DESIGN.md §5.4 */

export const FIELDS = {
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:   { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  eventId:       { type: 'uuid',        required: true,  sbColumn: 'event_id' },
  batchId:       { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  locationId:    { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  date:          { type: 'date',        required: true,  sbColumn: 'date' },
  time:          { type: 'text',        required: false, sbColumn: 'time' },
  quantity:      { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  sourceEventId: { type: 'uuid',        required: false, sbColumn: 'source_event_id' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    eventId: data.eventId ?? null,
    batchId: data.batchId ?? null,
    locationId: data.locationId ?? null,
    date: data.date ?? null,
    time: data.time ?? null,
    quantity: data.quantity ?? 0,
    sourceEventId: data.sourceEventId ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (!record.date) errors.push('date is required');
  if (typeof record.quantity !== 'number' || record.quantity <= 0) errors.push('quantity must be a positive number');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    batch_id: record.batchId,
    location_id: record.locationId,
    date: record.date,
    time: record.time,
    quantity: record.quantity,
    source_event_id: record.sourceEventId,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    batchId: row.batch_id,
    locationId: row.location_id,
    date: row.date,
    time: row.time,
    quantity: row.quantity,
    sourceEventId: row.source_event_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
