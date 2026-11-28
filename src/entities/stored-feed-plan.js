/** @file Entity: stored_feed_plans (052, #436 / OI-0281) — one plan per farm
 * per budget period. Written only once schema 52 is released; before that
 * toSupabaseShape refuses. */
import { RELEASED_SCHEMA_VERSION, STORED_FEED_PLAN_SCHEMA_VERSION } from '../data/schema-release.js';
import { t } from '../i18n/i18n.js';
import { validatePeriod } from '../calcs/budget-period.js';

export const FIELDS = {
  id:          { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId: { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  farmId:      { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  periodStart: { type: 'date',        required: true,  sbColumn: 'period_start' },
  periodEnd:   { type: 'date',        required: true,  sbColumn: 'period_end' },
  notes:       { type: 'text',        required: false, sbColumn: 'notes' },
  createdAt:   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const text = v => (v == null || String(v).trim() === '' ? null : String(v).trim());

export function create(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    farmId: data.farmId ?? null,
    periodStart: data.periodStart ?? null,
    periodEnd: data.periodEnd ?? null,
    notes: text(data.notes),
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.farmId) errors.push('farmId is required');
  errors.push(...validatePeriod({ start: record.periodStart, end: record.periodEnd }, { budget: true }));
  return { valid: errors.length === 0, errors };
}

/** Refuses (throws) before the stored-feed plan schema is released. */
export function assertStoredFeedPlanWritable() {
  if (RELEASED_SCHEMA_VERSION < STORED_FEED_PLAN_SCHEMA_VERSION) {
    throw new Error(t('manualEntry.unreleasedSchema', { version: STORED_FEED_PLAN_SCHEMA_VERSION }));
  }
}

export function toSupabaseShape(record) {
  assertStoredFeedPlanWritable();
  return {
    id: record.id,
    operation_id: record.operationId,
    farm_id: record.farmId,
    period_start: record.periodStart,
    period_end: record.periodEnd,
    notes: record.notes ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    farmId: row.farm_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    notes: row.notes ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
