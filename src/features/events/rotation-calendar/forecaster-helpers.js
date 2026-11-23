/**
 * @file DM forecaster pure helpers — OI-0257 Ag1+St1 (Fx1 parked).
 */

/**
 * CAP-1 stub values that previously painted tan "Hay / stored feed, 0 lb hay"
 * on future blocks when a forecaster period + groups were selected.
 * Kept for tests / Fx1 reference; must not be painted under St1.
 */
export const CAP1_FORECAST_STUB = Object.freeze({
  coverageFraction: 0,
  coversHours: 0,
  shortfallKg: 0,
  surplusHours: 0,
});

/**
 * OI-0257 Ag1: groups offered by the Dry Matter Forecaster picker.
 * Active = not archived (`!archivedAt`). Already-selected IDs are excluded.
 *
 * @param {Array<{id: string, archivedAt?: string|null}>} groups
 * @param {string[]} [selectedIds]
 * @returns {Array<{id: string, archivedAt?: string|null}>}
 */
export function listActiveForecasterGroups(groups = [], selectedIds = []) {
  const selected = new Set(selectedIds || []);
  return (groups || []).filter(g => g && !g.archivedAt && !selected.has(g.id));
}

/**
 * OI-0257 St1: whether calendar-grid may paint `renderForecastFutureBlock`
 * with the CAP-1 stub (`coverageFraction:0` / `shortfallKg:0`).
 *
 * Always false under this lock — future blocks keep green readiness where
 * there is pasture. Real capacity paint waits on Fx1 (parked).
 *
 * @param {object} [_ctx] reserved for Fx1 (real capacity) later
 * @returns {boolean}
 */
export function shouldPaintCap1ForecastStub(_ctx = {}) {
  return false;
}
