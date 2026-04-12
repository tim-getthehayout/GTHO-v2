/** @file Entity: animal_calving_records — V2_SCHEMA_DESIGN.md §9.9 */

export const FIELDS = {
  id:             { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  damId:          { type: 'uuid',        required: true,  sbColumn: 'dam_id' },
  calfId:         { type: 'uuid',        required: false, sbColumn: 'calf_id' },
  calvedAt:       { type: 'timestamptz', required: true,  sbColumn: 'calved_at' },
  sireAnimalId:   { type: 'uuid',        required: false, sbColumn: 'sire_animal_id' },
  sireAiBullId:   { type: 'uuid',        required: false, sbColumn: 'sire_ai_bull_id' },
  stillbirth:     { type: 'boolean',     required: false, sbColumn: 'stillbirth' },
  driedOffDate:   { type: 'date',        required: false, sbColumn: 'dried_off_date' },
  notes:          { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:           data.id           ?? crypto.randomUUID(),
    operationId:  data.operationId  ?? null,
    damId:        data.damId        ?? null,
    calfId:       data.calfId       ?? null,
    calvedAt:     data.calvedAt     ?? null,
    sireAnimalId: data.sireAnimalId ?? null,
    sireAiBullId: data.sireAiBullId ?? null,
    stillbirth:   data.stillbirth   ?? false,
    driedOffDate: data.driedOffDate ?? null,
    notes:        data.notes        ?? null,
    createdAt:    data.createdAt    ?? new Date().toISOString(),
    updatedAt:    data.updatedAt    ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.damId) errors.push('damId is required');
  if (!record.calvedAt) errors.push('calvedAt is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:              record.id,
    operation_id:    record.operationId,
    dam_id:          record.damId,
    calf_id:         record.calfId,
    calved_at:       record.calvedAt,
    sire_animal_id:  record.sireAnimalId,
    sire_ai_bull_id: record.sireAiBullId,
    stillbirth:      record.stillbirth,
    dried_off_date:  record.driedOffDate,
    notes:           record.notes,
    created_at:      record.createdAt,
    updated_at:      record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id:           row.id,
    operationId:  row.operation_id,
    damId:        row.dam_id,
    calfId:       row.calf_id,
    calvedAt:     row.calved_at,
    sireAnimalId: row.sire_animal_id,
    sireAiBullId: row.sire_ai_bull_id,
    stillbirth:   row.stillbirth,
    driedOffDate: row.dried_off_date,
    notes:        row.notes,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}
