/** @file Entity: animal_breeding_records — V2_SCHEMA_DESIGN.md §9.7 */

export const FIELDS = {
  id:               { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:      { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:         { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  bredAt:           { type: 'timestamptz', required: true,  sbColumn: 'bred_at' },
  method:           { type: 'text',        required: true,  sbColumn: 'method' },
  sireAnimalId:     { type: 'uuid',        required: false, sbColumn: 'sire_animal_id' },
  sireAiBullId:     { type: 'uuid',        required: false, sbColumn: 'sire_ai_bull_id' },
  semenId:          { type: 'text',        required: false, sbColumn: 'semen_id' },
  technician:       { type: 'text',        required: false, sbColumn: 'technician' },
  expectedCalving:  { type: 'date',        required: false, sbColumn: 'expected_calving' },
  confirmedDate:    { type: 'date',        required: false, sbColumn: 'confirmed_date' },
  notes:            { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:        { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:        { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_METHODS = ['ai', 'bull'];

export function create(data = {}) {
  return {
    id:              data.id              ?? crypto.randomUUID(),
    operationId:     data.operationId     ?? null,
    animalId:        data.animalId        ?? null,
    bredAt:          data.bredAt          ?? null,
    method:          data.method          ?? null,
    sireAnimalId:    data.sireAnimalId    ?? null,
    sireAiBullId:    data.sireAiBullId    ?? null,
    semenId:         data.semenId         ?? null,
    technician:      data.technician      ?? null,
    expectedCalving: data.expectedCalving ?? null,
    confirmedDate:   data.confirmedDate   ?? null,
    notes:           data.notes           ?? null,
    createdAt:       data.createdAt       ?? new Date().toISOString(),
    updatedAt:       data.updatedAt       ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.bredAt) errors.push('bredAt is required');
  if (!record.method) {
    errors.push('method is required');
  } else if (!VALID_METHODS.includes(record.method)) {
    errors.push(`method must be one of: ${VALID_METHODS.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:               record.id,
    operation_id:     record.operationId,
    animal_id:        record.animalId,
    bred_at:          record.bredAt,
    method:           record.method,
    sire_animal_id:   record.sireAnimalId,
    sire_ai_bull_id:  record.sireAiBullId,
    semen_id:         record.semenId,
    technician:       record.technician,
    expected_calving: record.expectedCalving,
    confirmed_date:   record.confirmedDate,
    notes:            record.notes,
    created_at:       record.createdAt,
    updated_at:       record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:              row.id,
    operationId:     row.operation_id,
    animalId:        row.animal_id,
    bredAt:          row.bred_at,
    method:          row.method,
    sireAnimalId:    row.sire_animal_id,
    sireAiBullId:    row.sire_ai_bull_id,
    semenId:         row.semen_id,
    technician:      row.technician,
    expectedCalving: row.expected_calving,
    confirmedDate:   row.confirmed_date,
    notes:           row.notes,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}
