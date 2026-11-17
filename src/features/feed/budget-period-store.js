/** @file Last viewed budget period, remembered on this device (D10 slice 1,
 * before the per-farm default setting exists). Viewing writes nothing else.
 */
import { DEFAULT_BUDGET_PERIOD, periodContaining, validatePeriod } from '../../calcs/budget-period.js';

const VIEWED_PERIOD_KEY = 'gtho_v2_budget_viewed_period';

/** The last viewed period if valid, else the default period containing `today`. */
export function getViewedBudgetPeriod(today, def = DEFAULT_BUDGET_PERIOD) {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(VIEWED_PERIOD_KEY) ?? 'null');
    if (saved && validatePeriod(saved, { budget: false }).length === 0) return { start: saved.start, end: saved.end };
  } catch { /* device storage unavailable or malformed */ }
  return periodContaining(today, def);
}

export function setViewedBudgetPeriod(period) {
  if (validatePeriod(period, { budget: false }).length) return false;
  try { globalThis.localStorage?.setItem(VIEWED_PERIOD_KEY, JSON.stringify({ start: period.start, end: period.end })); return true; } catch { return false; }
}
