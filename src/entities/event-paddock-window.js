/** @file Entity: event_paddock_windows — V2_SCHEMA_DESIGN.md §5.2 */

export const FIELDS = {
  id:            { type: 'uuid',    required: false, sbColumn: 'id' },
  operationId:   { type: 'uuid',    required: true,  sbColumn: 'operation_id' },
  eventId:       { type: 'uuid',    required: true,  sbColumn: 'event_id' },
  locationId:    { type: 'uuid',    required: true,  sbColumn: 'location_id' },
  dateOpened:    { type: 'date',    required: true,  sbColumn: 'date_opened' },
  timeOpened:    { type: 'text',    required: false, sbColumn: 'time_opened' },
  dateClosed:    { type: 'date',    required: false, sbColumn: 'date_closed' },
  timeClosed:    { type: 'text',    required: false, sbColumn: 'time_closed' },
  noPasture:     { type: 'boolean', required: false, sbColumn: 'no_pasture' },
  isStripGraze:  { type: 'boolean', required: false, sbColumn: 'is_strip_graze' },
  stripGroupId:  { type: 'uuid',    required: false, sbColumn: 'strip_group_id' },
  areaPct:       { type: 'numeric', required: false, sbColumn: 'area_pct' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    eventId: data.eventId ?? null,
    locationId: data.locationId ?? null,
    dateOpened: data.dateOpened ?? null,
    timeOpened: data.timeOpened ?? null,
    dateClosed: data.dateClosed ?? null,
    timeClosed: data.timeClosed ?? null,
    noPasture: data.noPasture ?? false,
    isStripGraze: data.isStripGraze ?? false,
    stripGroupId: data.stripGroupId ?? null,
    areaPct: data.areaPct ?? 100,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (!record.dateOpened) errors.push('dateOpened is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    location_id: record.locationId,
    date_opened: record.dateOpened,
    time_opened: record.timeOpened,
    date_closed: record.dateClosed,
    time_closed: record.timeClosed,
    no_pasture: record.noPasture,
    is_strip_graze: record.isStripGraze,
    strip_group_id: record.stripGroupId,
    area_pct: record.areaPct,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: area_pct is numeric (strip-graze proportional band); drives
  // dashboard + rotation calendar math.
  return {
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    locationId: row.location_id,
    dateOpened: row.date_opened,
    timeOpened: row.time_opened,
    dateClosed: row.date_closed,
    timeClosed: row.time_closed,
    noPasture: row.no_pasture,
    isStripGraze: row.is_strip_graze,
    stripGroupId: row.strip_group_id,
    areaPct: row.area_pct != null ? Number(row.area_pct) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
