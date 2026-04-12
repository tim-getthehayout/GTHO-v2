/** @file Entity: amendments — V2_SCHEMA_DESIGN.md §8.6 */

export const FIELDS = {
  id:               { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:      { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  appliedAt:        { type: 'timestamptz', required: true,  sbColumn: 'applied_at' },
  sourceType:       { type: 'text',        required: true,  sbColumn: 'source_type' },
  inputProductId:   { type: 'uuid',        required: false, sbColumn: 'input_product_id' },
  manureBatchId:    { type: 'uuid',        required: false, sbColumn: 'manure_batch_id' },
  spreaderId:       { type: 'uuid',        required: false, sbColumn: 'spreader_id' },
  totalQty:         { type: 'numeric',     required: false, sbColumn: 'total_qty' },
  qtyUnitId:        { type: 'uuid',        required: false, sbColumn: 'qty_unit_id' },
  costOverride:     { type: 'numeric',     required: false, sbColumn: 'cost_override' },
  notes:            { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:        { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:        { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:             data.id             ?? crypto.randomUUID(),
    operationId:    data.operationId    ?? null,
    appliedAt:      data.appliedAt      ?? null,
    sourceType:     data.sourceType     ?? null,
    inputProductId: data.inputProductId ?? null,
    manureBatchId:  data.manureBatchId  ?? null,
    spreaderId:     data.spreaderId     ?? null,
    totalQty:       data.totalQty       ?? null,
    qtyUnitId:      data.qtyUnitId      ?? null,
    costOverride:   data.costOverride   ?? null,
    notes:          data.notes          ?? null,
    createdAt:      data.createdAt      ?? new Date().toISOString(),
    updatedAt:      data.updatedAt      ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.appliedAt) errors.push('appliedAt is required');
  if (!record.sourceType || typeof record.sourceType !== 'string' || record.sourceType.trim() === '') {
    errors.push('sourceType is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:               record.id,
    operation_id:     record.operationId,
    applied_at:       record.appliedAt,
    source_type:      record.sourceType,
    input_product_id: record.inputProductId,
    manure_batch_id:  record.manureBatchId,
    spreader_id:      record.spreaderId,
    total_qty:        record.totalQty,
    qty_unit_id:      record.qtyUnitId,
    cost_override:    record.costOverride,
    notes:            record.notes,
    created_at:       record.createdAt,
    updated_at:       record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:             row.id,
    operationId:    row.operation_id,
    appliedAt:      row.applied_at,
    sourceType:     row.source_type,
    inputProductId: row.input_product_id,
    manureBatchId:  row.manure_batch_id,
    spreaderId:     row.spreader_id,
    totalQty:       row.total_qty,
    qtyUnitId:      row.qty_unit_id,
    costOverride:   row.cost_override,
    notes:          row.notes,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}
