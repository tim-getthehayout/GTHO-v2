/** @file Entity: animals — V2_SCHEMA_DESIGN.md §3.2 */

export const FIELDS = {
  id:             { type: 'uuid',    required: false, sbColumn: 'id' },
  operationId:    { type: 'uuid',    required: true,  sbColumn: 'operation_id' },
  classId:        { type: 'uuid',    required: false, sbColumn: 'class_id' },
  tagNum:         { type: 'text',    required: false, sbColumn: 'tag_num' },
  eid:            { type: 'text',    required: false, sbColumn: 'eid' },
  name:           { type: 'text',    required: false, sbColumn: 'name' },
  sex:            { type: 'text',    required: true,  sbColumn: 'sex' },
  damId:          { type: 'uuid',    required: false, sbColumn: 'dam_id' },
  sireAnimalId:   { type: 'uuid',    required: false, sbColumn: 'sire_animal_id' },
  sireAiBullId:   { type: 'uuid',    required: false, sbColumn: 'sire_ai_bull_id' },
  birthDate:      { type: 'date',    required: false, sbColumn: 'birth_date' },
  weaned:         { type: 'boolean', required: false, sbColumn: 'weaned' },
  weanedDate:     { type: 'date',    required: false, sbColumn: 'weaned_date' },
  confirmedBred:  { type: 'boolean', required: false, sbColumn: 'confirmed_bred' },
  notes:          { type: 'text',    required: false, sbColumn: 'notes' },
  active:         { type: 'boolean', required: false, sbColumn: 'active' },
  cullDate:       { type: 'date',    required: false, sbColumn: 'cull_date' },
  cullReason:     { type: 'text',    required: false, sbColumn: 'cull_reason' },
  cullNotes:      { type: 'text',    required: false, sbColumn: 'cull_notes' },
  createdAt:      { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:      { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    classId: data.classId ?? null,
    tagNum: data.tagNum ?? null,
    eid: data.eid ?? null,
    name: data.name ?? null,
    sex: data.sex ?? 'female',
    damId: data.damId ?? null,
    sireAnimalId: data.sireAnimalId ?? null,
    sireAiBullId: data.sireAiBullId ?? null,
    birthDate: data.birthDate ?? null,
    weaned: data.weaned ?? null,
    weanedDate: data.weanedDate ?? null,
    // OI-0099: confirmed_bred column is NOT NULL DEFAULT false in the DB (migration 026).
    // `?? false` matches the DB default so new records validate and old-backup records
    // (missing the key before schema_version 26) also resolve to false on read.
    confirmedBred: data.confirmedBred ?? false,
    notes: data.notes ?? null,
    active: data.active ?? true,
    cullDate: data.cullDate ?? null,
    cullReason: data.cullReason ?? null,
    cullNotes: data.cullNotes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.sex || typeof record.sex !== 'string') {
    errors.push('sex is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    class_id: record.classId,
    tag_num: record.tagNum,
    eid: record.eid,
    name: record.name,
    sex: record.sex,
    dam_id: record.damId,
    sire_animal_id: record.sireAnimalId,
    sire_ai_bull_id: record.sireAiBullId,
    birth_date: record.birthDate,
    weaned: record.weaned,
    weaned_date: record.weanedDate,
    confirmed_bred: record.confirmedBred ?? false,
    notes: record.notes,
    active: record.active,
    cull_date: record.cullDate,
    cull_reason: record.cullReason,
    cull_notes: record.cullNotes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    classId: row.class_id,
    tagNum: row.tag_num,
    eid: row.eid,
    name: row.name,
    sex: row.sex,
    damId: row.dam_id,
    sireAnimalId: row.sire_animal_id,
    sireAiBullId: row.sire_ai_bull_id,
    birthDate: row.birth_date,
    weaned: row.weaned,
    weanedDate: row.weaned_date,
    // Coerce missing (old backup) → false so downstream code can trust the boolean.
    confirmedBred: row.confirmed_bred ?? false,
    notes: row.notes,
    active: row.active,
    cullDate: row.cull_date,
    cullReason: row.cull_reason,
    cullNotes: row.cull_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
