/** @file Entity: animal_bcs_scores — V2_SCHEMA_DESIGN.md §9.5 */

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  animalId:    { type: 'uuid',        required: true,  sbColumn: 'animal_id' },
  scoredAt:    { type: 'timestamptz', required: true,  sbColumn: 'scored_at' },
  score:       { type: 'numeric',     required: true,  sbColumn: 'score' },
  likelyCull:  { type: 'boolean',     required: false, sbColumn: 'likely_cull' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id:          data.id          ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    animalId:    data.animalId    ?? null,
    scoredAt:    data.scoredAt    ?? null,
    score:       data.score       ?? null,
    likelyCull:  data.likelyCull  ?? false,
    notes:       data.notes       ?? null,
    createdAt:   data.createdAt   ?? new Date().toISOString(),
    updatedAt:   data.updatedAt   ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.animalId) errors.push('animalId is required');
  if (!record.scoredAt) errors.push('scoredAt is required');
  if (record.score === null || record.score === undefined) {
    errors.push('score is required');
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id:           record.id,
    operation_id: record.operationId,
    animal_id:    record.animalId,
    scored_at:    record.scoredAt,
    score:        record.score,
    likely_cull:  record.likelyCull,
    notes:        record.notes,
    created_at:   record.createdAt,
    updated_at:   record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: score is numeric — must coerce for downstream averages and
  // strict typeof checks.
  return {
    id:          row.id,
    operationId: row.operation_id,
    animalId:    row.animal_id,
    scoredAt:    row.scored_at,
    score:       row.score != null ? Number(row.score) : null,
    likelyCull:  row.likely_cull,
    notes:       row.notes,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}
