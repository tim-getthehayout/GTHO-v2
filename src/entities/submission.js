/** @file Entity: submissions — V2_SCHEMA_DESIGN.md §11.2 */

export const FIELDS = {
  id:                 { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:        { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  submitterId:        { type: 'uuid',        required: false, sbColumn: 'submitter_id' },
  app:                { type: 'text',        required: false, sbColumn: 'app' },
  type:               { type: 'text',        required: true,  sbColumn: 'type' },
  category:           { type: 'text',        required: false, sbColumn: 'category' },
  area:               { type: 'text',        required: false, sbColumn: 'area' },
  screen:             { type: 'text',        required: false, sbColumn: 'screen' },
  priority:           { type: 'text',        required: false, sbColumn: 'priority' },
  status:             { type: 'text',        required: false, sbColumn: 'status' },
  note:               { type: 'text',        required: false, sbColumn: 'note' },
  version:            { type: 'text',        required: false, sbColumn: 'version' },
  thread:             { type: 'jsonb',       required: false, sbColumn: 'thread' },
  devResponse:        { type: 'text',        required: false, sbColumn: 'dev_response' },
  devResponseTs:      { type: 'timestamptz', required: false, sbColumn: 'dev_response_ts' },
  firstResponseAt:    { type: 'timestamptz', required: false, sbColumn: 'first_response_at' },
  resolvedInVersion:  { type: 'text',        required: false, sbColumn: 'resolved_in_version' },
  resolutionNote:     { type: 'text',        required: false, sbColumn: 'resolution_note' },
  oiNumber:           { type: 'text',        required: false, sbColumn: 'oi_number' },
  linkedTo:           { type: 'uuid',        required: false, sbColumn: 'linked_to' },
  createdAt:          { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:          { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:                data.id                ?? crypto.randomUUID(),
    operationId:       data.operationId       ?? null,
    submitterId:       data.submitterId       ?? null,
    app:               data.app               ?? 'gthy',
    type:              data.type              ?? '',
    category:          data.category          ?? null,
    area:              data.area              ?? null,
    screen:            data.screen            ?? null,
    priority:          data.priority          ?? 'normal',
    status:            data.status            ?? 'open',
    note:              data.note              ?? null,
    version:           data.version           ?? null,
    thread:            data.thread            ?? [],
    devResponse:       data.devResponse       ?? null,
    devResponseTs:     data.devResponseTs     ?? null,
    firstResponseAt:   data.firstResponseAt   ?? null,
    resolvedInVersion: data.resolvedInVersion ?? null,
    resolutionNote:    data.resolutionNote    ?? null,
    oiNumber:          data.oiNumber          ?? null,
    linkedTo:          data.linkedTo          ?? null,
    createdAt:         data.createdAt         ?? new Date().toISOString(),
    updatedAt:         data.updatedAt         ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.type || typeof record.type !== 'string' || record.type.trim() === '') {
    errors.push('type is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:                   record.id,
    operation_id:         record.operationId,
    submitter_id:         record.submitterId,
    app:                  record.app,
    type:                 record.type,
    category:             record.category,
    area:                 record.area,
    screen:               record.screen,
    priority:             record.priority,
    status:               record.status,
    note:                 record.note,
    version:              record.version,
    thread:               record.thread,
    dev_response:         record.devResponse,
    dev_response_ts:      record.devResponseTs,
    first_response_at:    record.firstResponseAt,
    resolved_in_version:  record.resolvedInVersion,
    resolution_note:      record.resolutionNote,
    oi_number:            record.oiNumber,
    linked_to:            record.linkedTo,
    created_at:           record.createdAt,
    updated_at:           record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:                row.id,
    operationId:       row.operation_id,
    submitterId:       row.submitter_id,
    app:               row.app,
    type:              row.type,
    category:          row.category,
    area:              row.area,
    screen:            row.screen,
    priority:          row.priority,
    status:            row.status,
    note:              row.note,
    version:           row.version,
    thread:            row.thread,
    devResponse:       row.dev_response,
    devResponseTs:     row.dev_response_ts,
    firstResponseAt:   row.first_response_at,
    resolvedInVersion: row.resolved_in_version,
    resolutionNote:    row.resolution_note,
    oiNumber:          row.oi_number,
    linkedTo:          row.linked_to,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };
}
