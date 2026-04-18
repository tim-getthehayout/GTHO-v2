/** @file Entity: events — V2_SCHEMA_DESIGN.md §5.1
 *
 * OI-0117: event start datetime is DERIVED from the earliest child window
 * (`event_paddock_windows.date_opened` / `event_group_windows.date_joined`).
 * Columns `date_in` and `time_in` were dropped in migration 028. Use
 * `getEventStart(eventId)` / `getEventStartDate(eventId)` from
 * `src/features/events/event-start.js` to read the start datetime.
 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:       { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  dateOut:      { type: 'date',        required: false, sbColumn: 'date_out' },
  timeOut:      { type: 'text',        required: false, sbColumn: 'time_out' },
  sourceEventId: { type: 'uuid',       required: false, sbColumn: 'source_event_id' },
  notes:        { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    dateOut: data.dateOut ?? null,
    timeOut: data.timeOut ?? null,
    sourceEventId: data.sourceEventId ?? null,
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    date_out: record.dateOut,
    time_out: record.timeOut,
    source_event_id: record.sourceEventId,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    dateOut: row.date_out,
    timeOut: row.time_out,
    sourceEventId: row.source_event_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
