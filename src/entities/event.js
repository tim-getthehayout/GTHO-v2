/** @file Entity: events — V2_SCHEMA_DESIGN.md §5.1 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:       { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  dateIn:       { type: 'date',        required: true,  sbColumn: 'date_in' },
  timeIn:       { type: 'text',        required: false, sbColumn: 'time_in' },
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
    dateIn: data.dateIn ?? null,
    timeIn: data.timeIn ?? null,
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
  if (!record.dateIn) errors.push('dateIn is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    date_in: record.dateIn,
    time_in: record.timeIn,
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
    dateIn: row.date_in,
    timeIn: row.time_in,
    dateOut: row.date_out,
    timeOut: row.time_out,
    sourceEventId: row.source_event_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
