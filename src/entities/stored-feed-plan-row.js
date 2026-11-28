/** @file Entity: stored_feed_plan_rows (052, #436 / OI-0281) — a date-range
 * line on a stored-feed plan. Exactly one of plannedPct or plannedKgDmPerDay.
 * Written only once schema 52 is released; before that toSupabaseShape refuses. */
import { assertStoredFeedPlanWritable } from './stored-feed-plan.js';

export const FIELDS = {
  id:                { type: 'uuid',        required: false, sbColumn: 'id' },
  operationId:       { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  planId:            { type: 'uuid',        required: true,  sbColumn: 'plan_id' },
  startDate:         { type: 'date',        required: true,  sbColumn: 'start_date' },
  endDate:           { type: 'date',        required: true,  sbColumn: 'end_date' },
  plannedPct:        { type: 'numeric',     required: false, sbColumn: 'planned_pct' },
  plannedKgDmPerDay: { type: 'numeric',     required: false, sbColumn: 'planned_kg_dm_per_day' },
  createdAt:         { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:         { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const finite = v => v != null && v !== '' && Number.isFinite(Number(v));

export function create(data = {}) {
  const now = new Date().toISOString();
  const hasPct = finite(data.plannedPct);
  const hasAmt = finite(data.plannedKgDmPerDay);
  return {
    id: data.id ?? crypto.randomUUID(),
    operationId: data.operationId ?? null,
    planId: data.planId ?? null,
    startDate: data.startDate ?? null,
    endDate: data.endDate ?? null,
    plannedPct: hasPct ? Number(data.plannedPct) : null,
    plannedKgDmPerDay: hasAmt ? Number(data.plannedKgDmPerDay) : null,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
  };
}

export function validate(record) {
  const errors = [];
  if (!record.operationId) errors.push('operationId is required');
  if (!record.planId) errors.push('planId is required');
  if (!DATE_RE.test(record.startDate ?? '') || !DATE_RE.test(record.endDate ?? '')) errors.push('invalid_date');
  else if (record.endDate < record.startDate) errors.push('end_before_start');
  const hasPct = finite(record.plannedPct);
  const hasAmt = finite(record.plannedKgDmPerDay);
  if (hasPct === hasAmt) errors.push('both_or_neither');
  if (hasPct) {
    const p = Number(record.plannedPct);
    if (p < 0 || p > 100) errors.push('pct_out_of_range');
  }
  if (hasAmt && Number(record.plannedKgDmPerDay) < 0) errors.push('amount_negative');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  assertStoredFeedPlanWritable();
  return {
    id: record.id,
    operation_id: record.operationId,
    plan_id: record.planId,
    start_date: record.startDate,
    end_date: record.endDate,
    planned_pct: record.plannedPct,
    planned_kg_dm_per_day: record.plannedKgDmPerDay,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  return {
    id: row.id,
    operationId: row.operation_id,
    planId: row.plan_id,
    startDate: row.start_date,
    endDate: row.end_date,
    plannedPct: row.planned_pct != null ? Number(row.planned_pct) : null,
    plannedKgDmPerDay: row.planned_kg_dm_per_day != null ? Number(row.planned_kg_dm_per_day) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
