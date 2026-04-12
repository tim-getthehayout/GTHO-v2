/** @file Entity: user_preferences — V2_SCHEMA_DESIGN.md §1.5 */

export const FIELDS = {
  id:                      { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:             { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  userId:                  { type: 'uuid',        required: true,  sbColumn: 'user_id' },
  homeViewMode:            { type: 'text',        required: false, sbColumn: 'home_view_mode' },
  defaultViewMode:         { type: 'text',        required: false, sbColumn: 'default_view_mode' },
  statPeriodDays:          { type: 'integer',     required: false, sbColumn: 'stat_period_days' },
  fieldModeQuickActions:   { type: 'text[]',      required: false, sbColumn: 'field_mode_quick_actions' },
  createdAt:               { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:               { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const VALID_HOME_VIEWS = ['groups', 'locations'];
const VALID_VIEW_MODES = ['field', 'detail'];

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    userId: data.userId ?? null,
    homeViewMode: data.homeViewMode ?? 'groups',
    defaultViewMode: data.defaultViewMode ?? 'detail',
    statPeriodDays: data.statPeriodDays ?? 14,
    fieldModeQuickActions: data.fieldModeQuickActions ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.userId) errors.push('userId is required');
  if (record.homeViewMode && !VALID_HOME_VIEWS.includes(record.homeViewMode)) {
    errors.push(`homeViewMode must be one of: ${VALID_HOME_VIEWS.join(', ')}`);
  }
  if (record.defaultViewMode && !VALID_VIEW_MODES.includes(record.defaultViewMode)) {
    errors.push(`defaultViewMode must be one of: ${VALID_VIEW_MODES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    operation_id: record.operationId,
    user_id: record.userId,
    home_view_mode: record.homeViewMode,
    default_view_mode: record.defaultViewMode,
    stat_period_days: record.statPeriodDays,
    field_mode_quick_actions: record.fieldModeQuickActions,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    userId: row.user_id,
    homeViewMode: row.home_view_mode,
    defaultViewMode: row.default_view_mode,
    statPeriodDays: row.stat_period_days,
    fieldModeQuickActions: row.field_mode_quick_actions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
