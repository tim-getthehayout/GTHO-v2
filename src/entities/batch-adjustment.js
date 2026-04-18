/** @file Entity: batch_adjustments — V2_SCHEMA_DESIGN.md §4.3 */

export const FIELDS = {
  id:           { type: 'uuid',        required: false, sbColumn: 'id' },
  batchId:      { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  operationId:  { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  adjustedBy:   { type: 'uuid',        required: false, sbColumn: 'adjusted_by' },
  previousQty:  { type: 'numeric',     required: true,  sbColumn: 'previous_qty' },
  newQty:       { type: 'numeric',     required: true,  sbColumn: 'new_qty' },
  delta:        { type: 'numeric',     required: true,  sbColumn: 'delta' },
  reason:       { type: 'text',        required: false, sbColumn: 'reason' },
  createdAt:    { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    batchId: data.batchId ?? null,
    operationId: data.operationId ?? null,
    adjustedBy: data.adjustedBy ?? null,
    previousQty: data.previousQty ?? 0,
    newQty: data.newQty ?? 0,
    delta: data.delta ?? 0,
    reason: data.reason ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.batchId) errors.push('batchId is required');
  if (!record.operationId) errors.push('operationId is required');
  if (typeof record.previousQty !== 'number') errors.push('previousQty is required');
  if (typeof record.newQty !== 'number') errors.push('newQty is required');
  if (typeof record.delta !== 'number') errors.push('delta is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    batch_id: record.batchId,
    operation_id: record.operationId,
    adjusted_by: record.adjustedBy,
    previous_qty: record.previousQty,
    new_qty: record.newQty,
    delta: record.delta,
    reason: record.reason,
    created_at: record.createdAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: all three quantity cols have strict typeof validate — must coerce.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id: row.id,
    batchId: row.batch_id,
    operationId: row.operation_id,
    adjustedBy: row.adjusted_by,
    previousQty: n(row.previous_qty),
    newQty: n(row.new_qty),
    delta: n(row.delta),
    reason: row.reason,
    createdAt: row.created_at,
  };
}
