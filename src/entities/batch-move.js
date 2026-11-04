/** @file Entity: batch_moves — append-only transfer of a batch between locations. */

export const FIELDS = {
  id:             { type: 'uuid',    required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',    required: true,  sbColumn: 'operation_id' },
  batchId:        { type: 'uuid',    required: true,  sbColumn: 'batch_id' },
  fromLocationId: { type: 'uuid',    required: false, sbColumn: 'from_location_id' },
  toLocationId:   { type: 'uuid',    required: true,  sbColumn: 'to_location_id' },
  quantity:       { type: 'numeric', required: true,  sbColumn: 'quantity' },
  movedAt:        { type: 'date',    required: true,  sbColumn: 'moved_at' },
  notes:          { type: 'text',    required: false, sbColumn: 'notes' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    batchId: data.batchId ?? null,
    fromLocationId: data.fromLocationId ?? null,
    toLocationId: data.toLocationId ?? null,
    quantity: data.quantity ?? 0,
    movedAt: data.movedAt ?? new Date().toISOString().slice(0, 10),
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.toLocationId) errors.push('toLocationId is required');
  if (!record.movedAt) errors.push('movedAt is required');
  if (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity)) {
    errors.push('quantity is required');
  } else if (record.quantity < 0) {
    errors.push('quantity must be zero or greater');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    batch_id: record.batchId,
    from_location_id: record.fromLocationId,
    to_location_id: record.toLocationId,
    quantity: record.quantity,
    moved_at: record.movedAt,
    notes: record.notes,
    created_at: record.createdAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    batchId: row.batch_id,
    fromLocationId: row.from_location_id,
    toLocationId: row.to_location_id,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    movedAt: row.moved_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
