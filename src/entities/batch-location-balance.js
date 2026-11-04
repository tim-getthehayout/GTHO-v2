/** @file Entity: batch_location_balances — quantity of one batch at one location. */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  batchId:     { type: 'uuid',        required: true,  sbColumn: 'batch_id' },
  locationId:  { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  quantity:    { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    batchId: data.batchId ?? null,
    locationId: data.locationId ?? null,
    quantity: data.quantity ?? 0,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.batchId) errors.push('batchId is required');
  if (!record.locationId) errors.push('locationId is required');
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
    location_id: record.locationId,
    quantity: record.quantity,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    batchId: row.batch_id,
    locationId: row.location_id,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
