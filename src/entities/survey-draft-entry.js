/** @file Entity: survey_draft_entries — V2_SCHEMA_DESIGN.md §6.2 */

export const FIELDS = {
  id:                     { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:            { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  surveyId:               { type: 'uuid',        required: true,  sbColumn: 'survey_id' },
  locationId:             { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  forageHeightCm:         { type: 'numeric',     required: false, sbColumn: 'forage_height_cm' },
  forageCoverPct:         { type: 'numeric',     required: false, sbColumn: 'forage_cover_pct' },
  forageQuality:          { type: 'numeric',     required: false, sbColumn: 'forage_quality' },
  forageCondition:        { type: 'text',        required: false, sbColumn: 'forage_condition' },
  baleRingResidueCount:   { type: 'integer',     required: false, sbColumn: 'bale_ring_residue_count' },
  recoveryMinDays:        { type: 'integer',     required: false, sbColumn: 'recovery_min_days' },
  recoveryMaxDays:        { type: 'integer',     required: false, sbColumn: 'recovery_max_days' },
  notes:                  { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:              { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:              { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_CONDITIONS = ['poor', 'fair', 'good', 'excellent'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    surveyId: data.surveyId ?? null,
    locationId: data.locationId ?? null,
    forageHeightCm: data.forageHeightCm ?? null,
    forageCoverPct: data.forageCoverPct ?? null,
    forageQuality: data.forageQuality ?? null,
    forageCondition: data.forageCondition ?? null,
    baleRingResidueCount: data.baleRingResidueCount ?? null,
    recoveryMinDays: data.recoveryMinDays ?? null,
    recoveryMaxDays: data.recoveryMaxDays ?? null,
    notes: data.notes ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.surveyId) errors.push('surveyId is required');
  if (!record.locationId) errors.push('locationId is required');
  if (record.forageCondition && !VALID_CONDITIONS.includes(record.forageCondition)) {
    errors.push(`forageCondition must be one of: ${VALID_CONDITIONS.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    survey_id: record.surveyId,
    location_id: record.locationId,
    forage_height_cm: record.forageHeightCm,
    forage_cover_pct: record.forageCoverPct,
    forage_quality: record.forageQuality,
    forage_condition: record.forageCondition,
    bale_ring_residue_count: record.baleRingResidueCount,
    recovery_min_days: record.recoveryMinDays,
    recovery_max_days: record.recoveryMaxDays,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    surveyId: row.survey_id,
    locationId: row.location_id,
    forageHeightCm: row.forage_height_cm,
    forageCoverPct: row.forage_cover_pct,
    forageQuality: row.forage_quality,
    forageCondition: row.forage_condition,
    baleRingResidueCount: row.bale_ring_residue_count,
    recoveryMinDays: row.recovery_min_days,
    recoveryMaxDays: row.recovery_max_days,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
