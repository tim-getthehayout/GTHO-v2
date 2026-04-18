/** @file Entity: harvest_event_fields — V2_SCHEMA_DESIGN.md §7.2 */

export const FIELDS = {
  id:               { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:      { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  harvestEventId:   { type: 'uuid',        required: true,  sbColumn: 'harvest_event_id' },
  locationId:       { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  feedTypeId:       { type: 'uuid',        required: true,  sbColumn: 'feed_type_id' },
  quantity:         { type: 'numeric',     required: true,  sbColumn: 'quantity' },
  weightPerUnitKg:  { type: 'numeric',     required: false, sbColumn: 'weight_per_unit_kg' },
  dmPct:            { type: 'numeric',     required: false, sbColumn: 'dm_pct' },
  cuttingNumber:    { type: 'integer',     required: false, sbColumn: 'cutting_number' },
  batchId:          { type: 'uuid',        required: false, sbColumn: 'batch_id' },
  notes:            { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:        { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:        { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    harvestEventId: data.harvestEventId ?? null,
    locationId: data.locationId ?? null,
    feedTypeId: data.feedTypeId ?? null,
    quantity: data.quantity ?? 0,
    weightPerUnitKg: data.weightPerUnitKg ?? null,
    dmPct: data.dmPct ?? null,
    cuttingNumber: data.cuttingNumber ?? null,
    batchId: data.batchId ?? null,
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.harvestEventId) errors.push('harvestEventId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (!record.feedTypeId) errors.push('feedTypeId is required');
  if (typeof record.quantity !== 'number') errors.push('quantity is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    harvest_event_id: record.harvestEventId,
    location_id: record.locationId,
    feed_type_id: record.feedTypeId,
    quantity: record.quantity,
    weight_per_unit_kg: record.weightPerUnitKg,
    dm_pct: record.dmPct,
    cutting_number: record.cuttingNumber,
    batch_id: record.batchId,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: validate() uses strict typeof on quantity — stringified values
  // silently reject. weightPerUnitKg rolls up into batch totals.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id: row.id,
    operationId: row.operation_id,
    harvestEventId: row.harvest_event_id,
    locationId: row.location_id,
    feedTypeId: row.feed_type_id,
    quantity: n(row.quantity),
    weightPerUnitKg: n(row.weight_per_unit_kg),
    dmPct: n(row.dm_pct),
    cuttingNumber: n(row.cutting_number),
    batchId: row.batch_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
