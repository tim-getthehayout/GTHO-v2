/** @file Entity: batches — V2_SCHEMA_DESIGN.md §4.2 */

export const FIELDS = {
  id:               { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:      { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  feedTypeId:       { type: 'uuid',        required: true,  sbColumn: 'feed_type_id' },
  name:             { type: 'text',        required: true,  sbColumn: 'name' },
  batchNumber:      { type: 'text',        required: false, sbColumn: 'batch_number' },
  source:           { type: 'text',        required: false, sbColumn: 'source' },
  quantity:         { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  remaining:        { type: 'numeric',     required: true,  sbColumn: 'remaining' },
  unit:             { type: 'text',        required: true,  sbColumn: 'unit' },
  weightPerUnitKg:  { type: 'numeric',     required: false, sbColumn: 'weight_per_unit_kg' },
  dmPct:            { type: 'numeric',     required: false, sbColumn: 'dm_pct' },
  costPerUnit:      { type: 'numeric',     required: false, sbColumn: 'cost_per_unit' },
  purchaseDate:     { type: 'date',        required: false, sbColumn: 'purchase_date' },
  notes:            { type: 'text',        required: false, sbColumn: 'notes' },
  archived:         { type: 'boolean',     required: false, sbColumn: 'archived' },
  createdAt:        { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:        { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    feedTypeId: data.feedTypeId ?? null,
    name: data.name ?? '',
    batchNumber: data.batchNumber ?? null,
    source: data.source ?? 'purchase',
    quantity: data.quantity ?? 0,
    remaining: data.remaining ?? data.quantity ?? 0,
    unit: data.unit ?? '',
    weightPerUnitKg: data.weightPerUnitKg ?? null,
    dmPct: data.dmPct ?? null,
    costPerUnit: data.costPerUnit ?? null,
    purchaseDate: data.purchaseDate ?? null,
    notes: data.notes ?? null,
    archived: data.archived ?? false,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.feedTypeId) errors.push('feedTypeId is required');
  if (!record.name || typeof record.name !== 'string' || record.name.trim() === '') {
    errors.push('name is required');
  }
  if (typeof record.quantity !== 'number') errors.push('quantity is required');
  if (typeof record.remaining !== 'number') errors.push('remaining is required');
  if (!record.unit || typeof record.unit !== 'string' || record.unit.trim() === '') {
    errors.push('unit is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    feed_type_id: record.feedTypeId,
    name: record.name,
    batch_number: record.batchNumber,
    source: record.source,
    quantity: record.quantity,
    remaining: record.remaining,
    unit: record.unit,
    weight_per_unit_kg: record.weightPerUnitKg,
    dm_pct: record.dmPct,
    cost_per_unit: record.costPerUnit,
    purchase_date: record.purchaseDate,
    notes: record.notes,
    archived: record.archived,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    feedTypeId: row.feed_type_id,
    name: row.name,
    batchNumber: row.batch_number,
    source: row.source,
    quantity: row.quantity,
    remaining: row.remaining,
    unit: row.unit,
    weightPerUnitKg: row.weight_per_unit_kg,
    dmPct: row.dm_pct,
    costPerUnit: row.cost_per_unit,
    purchaseDate: row.purchase_date,
    notes: row.notes,
    archived: row.archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
