/** @file Budget period dates (D10): default, validation, prior year, month rows. */
import { describe, it, expect } from 'vitest';
import { DEFAULT_BUDGET_PERIOD, periodContaining, validatePeriod, priorPeriod, periodMonthRows, shiftYears, periodsOverlap, periodDays } from '../../src/calcs/budget-period.js';

describe('budget period', () => {
  it('defaults to Oct 1 – Sep 30: this year Oct 1, 2026 – Sep 30, 2027 vs Oct 1, 2025 – Sep 30, 2026', () => {
    expect(DEFAULT_BUDGET_PERIOD).toEqual({ startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 });
    const now = periodContaining('2026-11-17');
    expect(now).toEqual({ start: '2026-10-01', end: '2027-09-30' });
    expect(priorPeriod(now)).toEqual({ start: '2025-10-01', end: '2026-09-30' });
    expect(periodContaining('2026-09-30')).toEqual({ start: '2025-10-01', end: '2026-09-30' });
    expect(periodContaining('2026-10-01')).toEqual({ start: '2026-10-01', end: '2027-09-30' });
    expect(periodContaining('2026-07-04', { startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 })).toEqual({ start: '2026-01-01', end: '2026-12-31' });
  });
  it('validates: end after start; budgets 1–366 days; a viewed range may be any length', () => {
    expect(validatePeriod({ start: '2026-10-01', end: '2027-09-30' })).toEqual([]);
    expect(validatePeriod({ start: '2026-10-01', end: '2026-10-01' })).toEqual(['end_not_after_start']);
    expect(validatePeriod({ start: '2026-10-01', end: '2026-09-01' })).toEqual(['end_not_after_start']);
    expect(validatePeriod({ start: '2027-10-01', end: '2028-09-30' })).toEqual([]);
    expect(periodDays({ start: '2027-10-01', end: '2028-09-30' })).toBe(366);
    expect(validatePeriod({ start: '2026-10-01', end: '2027-10-02' })).toEqual(['too_long']);
    expect(validatePeriod({ start: '2020-01-01', end: '2026-12-31' }, { budget: false })).toEqual([]);
    expect(validatePeriod({ start: 'x', end: '2026-01-01' })).toEqual(['invalid_date']);
  });
  it('saved budgets overlap check is inclusive; a shorter non-annual budget is allowed', () => {
    expect(validatePeriod({ start: '2026-11-17', end: '2027-09-30' })).toEqual([]);
    expect(periodsOverlap({ start: '2025-10-01', end: '2026-09-30' }, { start: '2026-10-01', end: '2027-09-30' })).toBe(false);
    expect(periodsOverlap({ start: '2025-10-01', end: '2026-10-01' }, { start: '2026-10-01', end: '2027-09-30' })).toBe(true);
  });
  it('shifting by a year maps Feb 29 to Feb 28', () => {
    expect(shiftYears('2028-02-29', -1)).toBe('2027-02-28');
    expect(priorPeriod({ start: '2027-12-01', end: '2028-02-29' })).toEqual({ start: '2026-12-01', end: '2027-02-28' });
  });
  it('month rows are clipped to the period with labelled partial edge months', () => {
    const rows = periodMonthRows({ start: '2026-10-15', end: '2027-01-10' });
    expect(rows).toEqual([
      { month: '2026-10', start: '2026-10-15', end: '2026-10-31', days: 17, partial: true },
      { month: '2026-11', start: '2026-11-01', end: '2026-11-30', days: 30, partial: false },
      { month: '2026-12', start: '2026-12-01', end: '2026-12-31', days: 31, partial: false },
      { month: '2027-01', start: '2027-01-01', end: '2027-01-10', days: 10, partial: true },
    ]);
    expect(periodMonthRows(periodContaining('2026-11-17'))).toHaveLength(12);
  });
});
