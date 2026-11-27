/** @file Budget period dates (stored forage budget D10): the configurable
 * start/end, the default Oct 1 – Sep 30, validation, the prior-year period
 * and month rows clipped to the period. Pure; dates are YYYY-MM-DD.
 * See session_briefs/IMPLIED_PASTURE_DMI_2026-11-17.md §2.
 */

import { addDays } from '../utils/date-utils.js';

/** Default period for new farms (Q4): Oct 1 – Sep 30. */
export const DEFAULT_BUDGET_PERIOD = Object.freeze({ startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 });
export const MAX_BUDGET_DAYS = 366;

const pad = n => String(n).padStart(2, '0');
const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(Math.min(d, daysInMonth(y, m)))}`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive day count from start to end (end ≥ start). */
export function periodDays({ start, end }) {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
}

/** Same calendar date `years` later (negative = earlier); Feb 29 maps to Feb 28. */
export function shiftYears(date, years) {
  const [y, m, d] = date.split('-').map(Number);
  return ymd(y + years, m, d);
}

/** The default period (start/end month-day) containing `today`. */
export function periodContaining(today, def = DEFAULT_BUDGET_PERIOD) {
  const year = Number(today.slice(0, 4));
  let start = ymd(year, def.startMonth, def.startDay);
  if (start > today) start = ymd(year - 1, def.startMonth, def.startDay);
  const startYear = Number(start.slice(0, 4));
  const wraps = def.endMonth < def.startMonth || (def.endMonth === def.startMonth && def.endDay < def.startDay);
  const end = ymd(wraps ? startYear + 1 : startYear, def.endMonth, def.endDay);
  return { start, end };
}

/**
 * Validate a period. `budget` (a budget or the default period) needs
 * 1–366 days; a viewed history range only needs end after start (D1).
 * Returns a list of error codes, empty when valid.
 */
export function validatePeriod({ start, end } = {}, { budget = true } = {}) {
  if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '')) return ['invalid_date'];
  const errors = [];
  if (end <= start) errors.push('end_not_after_start');
  else if (budget && periodDays({ start, end }) > MAX_BUDGET_DAYS) errors.push('too_long');
  return errors;
}

/** True when two saved budgets for one farm overlap (inclusive dates). */
export function periodsOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

/** Prior-year comparison: the same dates one year earlier for the viewed period (N). */
export function priorPeriod({ start, end }) {
  return { start: shiftYears(start, -1), end: shiftYears(end, -1) };
}

/** Month rows clipped to the period; a mid-month edge is a partial row with its own dates. */
export function periodMonthRows({ start, end }) {
  const rows = [];
  let cursor = start;
  while (cursor <= end) {
    const [y, m] = cursor.split('-').map(Number);
    const monthStart = ymd(y, m, 1), monthEnd = ymd(y, m, daysInMonth(y, m));
    const rowEnd = monthEnd < end ? monthEnd : end;
    rows.push({ month: `${y}-${pad(m)}`, start: cursor, end: rowEnd, days: periodDays({ start: cursor, end: rowEnd }), partial: cursor !== monthStart || rowEnd !== monthEnd });
    cursor = addDays(rowEnd, 1);
  }
  return rows;
}
