/** @file Event observation entity — pre-graze and post-graze observations on events. */

export const FIELDS = {
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:       { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  eventId:           { type: 'uuid',        required: true,  sbColumn: 'event_id' },
  paddockWindowId:   { type: 'uuid',        required: false, sbColumn: 'paddock_window_id' },
  observationPhase:  { type: 'text',        required: false, sbColumn: 'observation_phase' },
  forageHeightCm:    { type: 'numeric',     required: false, sbColumn: 'forage_height_cm' },
  forageCoverPct:    { type: 'numeric',     required: false, sbColumn: 'forage_cover_pct' },
  forageQuality:     { type: 'integer',     required: false, sbColumn: 'forage_quality' },
  forageCondition:   { type: 'text',        required: false, sbColumn: 'forage_condition' },
  storedFeedOnly:    { type: 'boolean',     required: false, sbColumn: 'stored_feed_only' },
  postGrazeHeightCm: { type: 'numeric',     required: false, sbColumn: 'post_graze_height_cm' },
  recoveryMinDays:   { type: 'integer',     required: false, sbColumn: 'recovery_min_days' },
  recoveryMaxDays:   { type: 'integer',     required: false, sbColumn: 'recovery_max_days' },
  notes:             { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:         { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_PHASES = ['pre_graze', 'post_graze'];
const VALID_CONDITIONS = ['dry', 'fair', 'good', 'lush'];

/**
 * Create a new event observation record with defaults.
 * @param {object} data
 * @returns {object}
 */
export function create(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || crypto.randomUUID(),
    operationId: data.operationId || null,
    eventId: data.eventId || null,
    paddockWindowId: data.paddockWindowId || null,
    observationPhase: data.observationPhase || null,
    forageHeightCm: data.forageHeightCm ?? null,
    forageCoverPct: data.forageCoverPct ?? null,
    forageQuality: data.forageQuality ?? null,
    forageCondition: data.forageCondition || null,
    storedFeedOnly: data.storedFeedOnly ?? false,
    postGrazeHeightCm: data.postGrazeHeightCm ?? null,
    recoveryMinDays: data.recoveryMinDays ?? null,
    recoveryMaxDays: data.recoveryMaxDays ?? null,
    notes: data.notes || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  };
}

/**
 * Validate an event observation record.
 * @param {object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.eventId) errors.push('eventId is required');
  if (record.observationPhase && !VALID_PHASES.includes(record.observationPhase)) {
    errors.push(`observationPhase must be one of: ${VALID_PHASES.join(', ')}`);
  }
  if (record.forageQuality != null && (record.forageQuality < 1 || record.forageQuality > 100)) {
    errors.push('forageQuality must be between 1 and 100');
  }
  if (record.forageCondition && !VALID_CONDITIONS.includes(record.forageCondition)) {
    errors.push(`forageCondition must be one of: ${VALID_CONDITIONS.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Convert entity record to Supabase shape (camelCase → snake_case).
 * @param {object} record
 * @returns {object}
 */
export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    event_id: record.eventId,
    paddock_window_id: record.paddockWindowId,
    observation_phase: record.observationPhase,
    forage_height_cm: record.forageHeightCm,
    forage_cover_pct: record.forageCoverPct,
    forage_quality: record.forageQuality,
    forage_condition: record.forageCondition,
    stored_feed_only: record.storedFeedOnly,
    post_graze_height_cm: record.postGrazeHeightCm,
    recovery_min_days: record.recoveryMinDays,
    recovery_max_days: record.recoveryMaxDays,
    notes: record.notes,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

/**
 * Convert Supabase row to entity record (snake_case → camelCase).
 * @param {object} row
 * @returns {object}
 */
export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    eventId: row.event_id,
    paddockWindowId: row.paddock_window_id,
    observationPhase: row.observation_phase,
    forageHeightCm: row.forage_height_cm != null ? Number(row.forage_height_cm) : null,
    forageCoverPct: row.forage_cover_pct != null ? Number(row.forage_cover_pct) : null,
    forageQuality: row.forage_quality != null ? Number(row.forage_quality) : null,
    forageCondition: row.forage_condition,
    storedFeedOnly: row.stored_feed_only ?? false,
    postGrazeHeightCm: row.post_graze_height_cm != null ? Number(row.post_graze_height_cm) : null,
    recoveryMinDays: row.recovery_min_days != null ? Number(row.recovery_min_days) : null,
    recoveryMaxDays: row.recovery_max_days != null ? Number(row.recovery_max_days) : null,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
