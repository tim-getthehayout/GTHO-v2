/** @file Entity: surveys — V2_SCHEMA_DESIGN.md §6.1 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  surveyDate:   { type: 'date',        required: true,  sbColumn: 'survey_date' },
  type:         { type: 'text',        required: true,  sbColumn: 'type' },
  status:       { type: 'text',        required: false, sbColumn: 'status' },
  notes:        { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:    { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_TYPES = ['bulk', 'single'];
const VALID_STATUSES = ['draft', 'committed'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    surveyDate: data.surveyDate ?? null,
    type: data.type ?? 'bulk',
    status: data.status ?? 'draft',
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.surveyDate) errors.push('surveyDate is required');
  if (!record.type || !VALID_TYPES.includes(record.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (record.status && !VALID_STATUSES.includes(record.status)) {
    errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    survey_date: record.surveyDate,
    type: record.type,
    status: record.status,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    surveyDate: row.survey_date,
    type: row.type,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
