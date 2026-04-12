/** @file Entity: manure_batch_transactions — V2_SCHEMA_DESIGN.md §8.9 */

export const FIELDS = {
  id:              { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:     { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  batchId:         { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  type:            { type: 'text',        required: true,  sbColumn: 'type' },
  transactionDate: { type: 'date',        required: true,  sbColumn: 'transaction_date' },
  volumeKg:        { type: 'numeric',     required: true,  sbColumn: 'volume_kg' },
  sourceEventId:   { type: 'uuid',        required: false, sbColumn: 'source_event_id' },
  amendmentId:     { type: 'uuid',        required: false, sbColumn: 'amendment_id' },
  notes:           { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:       { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:       { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:              data.id              ?? crypto.randomUUID(),
    operationId:     data.operationId     ?? null,
    batchId:         data.batchId         ?? null,
    type:            data.type            ?? null,
    transactionDate: data.transactionDate ?? null,
    volumeKg:        data.volumeKg        ?? null,
    sourceEventId:   data.sourceEventId   ?? null,
    amendmentId:     data.amendmentId     ?? null,
    notes:           data.notes           ?? null,
    createdAt:       data.createdAt       ?? new Date().toISOString(),
    updatedAt:       data.updatedAt       ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.type || typeof record.type !== 'string' || record.type.trim() === '') {
    errors.push('type is required');
  }
  if (!record.transactionDate) errors.push('transactionDate is required');
  if (record.volumeKg === null || record.volumeKg === undefined) {
    errors.push('volumeKg is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:               record.id,
    operation_id:     record.operationId,
    batch_id:         record.batchId,
    type:             record.type,
    transaction_date: record.transactionDate,
    volume_kg:        record.volumeKg,
    source_event_id:  record.sourceEventId,
    amendment_id:     record.amendmentId,
    notes:            record.notes,
    created_at:       record.createdAt,
    updated_at:       record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:              row.id,
    operationId:     row.operation_id,
    batchId:         row.batch_id,
    type:            row.type,
    transactionDate: row.transaction_date,
    volumeKg:        row.volume_kg,
    sourceEventId:   row.source_event_id,
    amendmentId:     row.amendment_id,
    notes:           row.notes,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}
