/** @file Entity: app_logs — V2_SCHEMA_DESIGN.md §11.1 */

// Write-once: no updated_at. operation_id is stored but has no FK constraint.
// user_id is nullable — logs may be written before authentication.

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  userId:      { type: 'uuid',        required: false, sbColumn: 'user_id' },
  operationId: { type: 'uuid',        required: false, sbColumn: 'operation_id' },
  sessionId:   { type: 'text',        required: false, sbColumn: 'session_id' },
  level:       { type: 'text',        required: false, sbColumn: 'level' },
  source:      { type: 'text',        required: true,  sbColumn: 'source' },
  message:     { type: 'text',        required: true,  sbColumn: 'message' },
  stack:       { type: 'text',        required: false, sbColumn: 'stack' },
  context:     { type: 'jsonb',       required: false, sbColumn: 'context' },
  appVersion:  { type: 'text',        required: false, sbColumn: 'app_version' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    userId:      data.userId      ?? null,
    operationId: data.operationId ?? null,
    sessionId:   data.sessionId   ?? null,
    level:       data.level       ?? 'error',
    source:      data.source      ?? '',
    message:     data.message     ?? '',
    stack:       data.stack       ?? null,
    context:     data.context     ?? null,
    appVersion:  data.appVersion  ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.source || typeof record.source !== 'string' || record.source.trim() === '') {
    errors.push('source is required');
  }
  if (!record.message || typeof record.message !== 'string' || record.message.trim() === '') {
    errors.push('message is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    user_id:      record.userId,
    operation_id: record.operationId,
    session_id:   record.sessionId,
    level:        record.level,
    source:       record.source,
    message:      record.message,
    stack:        record.stack,
    context:      record.context,
    app_version:  record.appVersion,
    created_at:   record.createdAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:          row.id,
    userId:      row.user_id,
    operationId: row.operation_id,
    sessionId:   row.session_id,
    level:       row.level,
    source:      row.source,
    message:     row.message,
    stack:       row.stack,
    context:     row.context,
    appVersion:  row.app_version,
    createdAt:   row.created_at,
  };
}
