/** @file Entity: npk_price_history — V2_SCHEMA_DESIGN.md §8.10 */

export const FIELDS = {
  id:            { type: 'uuid',        required: false, sbColumn: 'id' },
  farmId:        { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  operationId:   { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  effectiveDate: { type: 'date',        required: true,  sbColumn: 'effective_date' },
  nPricePerKg:   { type: 'numeric',     required: true,  sbColumn: 'n_price_per_kg' },
  pPricePerKg:   { type: 'numeric',     required: true,  sbColumn: 'p_price_per_kg' },
  kPricePerKg:   { type: 'numeric',     required: true,  sbColumn: 'k_price_per_kg' },
  notes:         { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:     { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:     { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:            data.id            ?? crypto.randomUUID(),
    farmId:        data.farmId        ?? null,
    operationId:   data.operationId   ?? null,
    effectiveDate: data.effectiveDate ?? null,
    nPricePerKg:   data.nPricePerKg   ?? null,
    pPricePerKg:   data.pPricePerKg   ?? null,
    kPricePerKg:   data.kPricePerKg   ?? null,
    notes:         data.notes         ?? null,
    createdAt:     data.createdAt     ?? new Date().toISOString(),
    updatedAt:     data.updatedAt     ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.farmId) errors.push('farmId is required');
  if (!record.operationId) errors.push('operationId is required');
  if (!record.effectiveDate) errors.push('effectiveDate is required');
  if (record.nPricePerKg === null || record.nPricePerKg === undefined) {
    errors.push('nPricePerKg is required');
  }
  if (record.pPricePerKg === null || record.pPricePerKg === undefined) {
    errors.push('pPricePerKg is required');
  }
  if (record.kPricePerKg === null || record.kPricePerKg === undefined) {
    errors.push('kPricePerKg is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:              record.id,
    farm_id:         record.farmId,
    operation_id:    record.operationId,
    effective_date:  record.effectiveDate,
    n_price_per_kg:  record.nPricePerKg,
    p_price_per_kg:  record.pPricePerKg,
    k_price_per_kg:  record.kPricePerKg,
    notes:           record.notes,
    created_at:      record.createdAt,
    updated_at:      record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:            row.id,
    farmId:        row.farm_id,
    operationId:   row.operation_id,
    effectiveDate: row.effective_date,
    nPricePerKg:   row.n_price_per_kg,
    pPricePerKg:   row.p_price_per_kg,
    kPricePerKg:   row.k_price_per_kg,
    notes:         row.notes,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}
