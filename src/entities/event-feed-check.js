/** @file Entity: event_feed_checks — V2_SCHEMA_DESIGN.md §5.5 */

export const FIELDS = {
  id:             { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  eventId:        { type: 'uuid',        required: true,  sbColumn: 'event_id' },
  date:           { type: 'date',        required: true,  sbColumn: 'date' },
  time:           { type: 'text',        required: false, sbColumn: 'time' },
  isCloseReading: { type: 'boolean',     required: false, sbColumn: 'is_close_reading' },
  notes:          { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    eventId: data.eventId ?? null,
    date: data.date ?? null,
    time: data.time ?? null,
    isCloseReading: data.isCloseReading ?? false,
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (!record.date) errors.push('date is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    date: record.date,
    time: record.time,
    is_close_reading: record.isCloseReading,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    date: row.date,
    time: row.time,
    isCloseReading: row.is_close_reading,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
