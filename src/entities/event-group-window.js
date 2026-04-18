/** @file Entity: event_group_windows — V2_SCHEMA_DESIGN.md §5.3 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  eventId:      { type: 'uuid',        required: true,  sbColumn: 'event_id' },
  groupId:      { type: 'uuid',        required: true,  sbColumn: 'group_id' },
  dateJoined:   { type: 'date',        required: true,  sbColumn: 'date_joined' },
  timeJoined:   { type: 'text',        required: false, sbColumn: 'time_joined' },
  dateLeft:     { type: 'date',        required: false, sbColumn: 'date_left' },
  timeLeft:     { type: 'text',        required: false, sbColumn: 'time_left' },
  headCount:    { type: 'integer',     required: true,  sbColumn: 'head_count' },
  avgWeightKg:  { type: 'numeric',     required: true,  sbColumn: 'avg_weight_kg' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    eventId: data.eventId ?? null,
    groupId: data.groupId ?? null,
    dateJoined: data.dateJoined ?? null,
    timeJoined: data.timeJoined ?? null,
    dateLeft: data.dateLeft ?? null,
    timeLeft: data.timeLeft ?? null,
    headCount: data.headCount ?? 0,
    avgWeightKg: data.avgWeightKg ?? 0,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (!record.groupId) errors.push('groupId is required');
  if (!record.dateJoined) errors.push('dateJoined is required');
  // OI-0091: closed windows may legitimately stamp headCount = 0 at close date
  // when the group emptied out. Open windows should still be >= 1.
  const hcMin = record.dateLeft ? 0 : 1;
  if (typeof record.headCount !== 'number' || record.headCount < hcMin) {
    errors.push(record.dateLeft
      ? 'headCount must be a non-negative integer'
      : 'headCount must be a positive integer');
  }
  if (typeof record.avgWeightKg !== 'number' || record.avgWeightKg <= 0) errors.push('avgWeightKg must be a positive number');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    group_id: record.groupId,
    date_joined: record.dateJoined,
    time_joined: record.timeJoined,
    date_left: record.dateLeft,
    time_left: record.timeLeft,
    head_count: record.headCount,
    avg_weight_kg: record.avgWeightKg,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: coerce PostgREST-stringified numerics. head_count is int4 (usually
  // already a number) but coerced defensively; avg_weight_kg is numeric and
  // arrives as a string in practice.
  return {
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    groupId: row.group_id,
    dateJoined: row.date_joined,
    timeJoined: row.time_joined,
    dateLeft: row.date_left,
    timeLeft: row.time_left,
    headCount: row.head_count != null ? Number(row.head_count) : null,
    avgWeightKg: row.avg_weight_kg != null ? Number(row.avg_weight_kg) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
