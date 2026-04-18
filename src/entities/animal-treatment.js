/** @file Entity: animal_treatments — V2_SCHEMA_DESIGN.md §9.6 */

export const FIELDS = {
  id:              { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:     { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:        { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  treatmentTypeId: { type: 'uuid',        required: false, sbColumn: 'treatment_type_id' },
  treatedAt:       { type: 'timestamptz', required: true,  sbColumn: 'treated_at' },
  product:         { type: 'text',        required: false, sbColumn: 'product' },
  doseAmount:      { type: 'numeric',     required: false, sbColumn: 'dose_amount' },
  doseUnitId:      { type: 'uuid',        required: false, sbColumn: 'dose_unit_id' },
  withdrawalDate:  { type: 'date',        required: false, sbColumn: 'withdrawal_date' },
  notes:           { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:       { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:       { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:              data.id              ?? crypto.randomUUID(),
    operationId:     data.operationId     ?? null,
    animalId:        data.animalId        ?? null,
    treatmentTypeId: data.treatmentTypeId ?? null,
    treatedAt:       data.treatedAt       ?? null,
    product:         data.product         ?? null,
    doseAmount:      data.doseAmount      ?? null,
    doseUnitId:      data.doseUnitId      ?? null,
    withdrawalDate:  data.withdrawalDate  ?? null,
    notes:           data.notes           ?? null,
    createdAt:       data.createdAt       ?? new Date().toISOString(),
    updatedAt:       data.updatedAt       ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.treatedAt) errors.push('treatedAt is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:                record.id,
    operation_id:      record.operationId,
    animal_id:         record.animalId,
    treatment_type_id: record.treatmentTypeId,
    treated_at:        record.treatedAt,
    product:           record.product,
    dose_amount:       record.doseAmount,
    dose_unit_id:      record.doseUnitId,
    withdrawal_date:   record.withdrawalDate,
    notes:             record.notes,
    created_at:        record.createdAt,
    updated_at:        record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:              row.id,
    operationId:     row.operation_id,
    animalId:        row.animal_id,
    treatmentTypeId: row.treatment_type_id,
    treatedAt:       row.treated_at,
    product:         row.product,
    doseAmount:      row.dose_amount != null ? Number(row.dose_amount) : null,  // OI-0106
    doseUnitId:      row.dose_unit_id,
    withdrawalDate:  row.withdrawal_date,
    notes:           row.notes,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}
