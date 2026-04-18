/** @file Entity: paddock_observations — V2_SCHEMA_DESIGN.md §6.3 */

export const FIELDS = {
  id:                     { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:            { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  locationId:             { type: 'uuid',        required: true,  sbColumn: 'location_id' },
  observedAt:             { type: 'timestamptz', required: true,  sbColumn: 'observed_at' },
  type:                   { type: 'text',        required: true,  sbColumn: 'type' },
  source:                 { type: 'text',        required: true,  sbColumn: 'source' },
  sourceId:               { type: 'uuid',        required: false, sbColumn: 'source_id' },
  forageHeightCm:         { type: 'numeric',     required: false, sbColumn: 'forage_height_cm' },
  forageCoverPct:         { type: 'numeric',     required: false, sbColumn: 'forage_cover_pct' },
  forageQuality:          { type: 'numeric',     required: false, sbColumn: 'forage_quality' },
  forageCondition:        { type: 'text',        required: false, sbColumn: 'forage_condition' },
  baleRingResidueCount:   { type: 'integer',     required: false, sbColumn: 'bale_ring_residue_count' },
  residualHeightCm:       { type: 'numeric',     required: false, sbColumn: 'residual_height_cm' },
  recoveryMinDays:        { type: 'integer',     required: false, sbColumn: 'recovery_min_days' },
  recoveryMaxDays:        { type: 'integer',     required: false, sbColumn: 'recovery_max_days' },
  notes:                  { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:              { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:              { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_TYPES = ['open', 'close'];
const VALID_SOURCES = ['event', 'survey'];
const VALID_CONDITIONS = ['poor', 'fair', 'good', 'excellent'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    locationId: data.locationId ?? null,
    observedAt: data.observedAt ?? null,
    type: data.type ?? 'open',
    source: data.source ?? 'event',
    sourceId: data.sourceId ?? null,
    forageHeightCm: data.forageHeightCm ?? null,
    forageCoverPct: data.forageCoverPct ?? null,
    forageQuality: data.forageQuality ?? null,
    forageCondition: data.forageCondition ?? null,
    baleRingResidueCount: data.baleRingResidueCount ?? null,
    residualHeightCm: data.residualHeightCm ?? null,
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
  if (!record.locationId) errors.push('locationId is required');
  if (!record.observedAt) errors.push('observedAt is required');
  if (!record.type || !VALID_TYPES.includes(record.type)) {
    errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (!record.source || !VALID_SOURCES.includes(record.source)) {
    errors.push(`source must be one of: ${VALID_SOURCES.join(', ')}`);
  }
  if (record.forageCondition && !VALID_CONDITIONS.includes(record.forageCondition)) {
    errors.push(`forageCondition must be one of: ${VALID_CONDITIONS.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    location_id: record.locationId,
    observed_at: record.observedAt,
    type: record.type,
    source: record.source,
    source_id: record.sourceId,
    forage_height_cm: record.forageHeightCm,
    forage_cover_pct: record.forageCoverPct,
    forage_quality: record.forageQuality,
    forage_condition: record.forageCondition,
    bale_ring_residue_count: record.baleRingResidueCount,
    residual_height_cm: record.residualHeightCm,
    recovery_min_days: record.recoveryMinDays,
    recovery_max_days: record.recoveryMaxDays,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: coerce PostgREST-stringified numeric/integer columns.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id: row.id,
    operationId: row.operation_id,
    locationId: row.location_id,
    observedAt: row.observed_at,
    type: row.type,
    source: row.source,
    sourceId: row.source_id,
    forageHeightCm: n(row.forage_height_cm),
    forageCoverPct: n(row.forage_cover_pct),
    forageQuality: n(row.forage_quality),
    forageCondition: row.forage_condition,
    baleRingResidueCount: n(row.bale_ring_residue_count),
    residualHeightCm: n(row.residual_height_cm),
    recoveryMinDays: n(row.recovery_min_days),
    recoveryMaxDays: n(row.recovery_max_days),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
