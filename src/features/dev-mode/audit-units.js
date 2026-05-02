/** @file OI-0145 — Audit page unit-system helper.
 *
 * Thin wrapper over `src/utils/units.js`. The audit page exposes a 3-way
 * toggle (Metric / Standard / Hybrid) that controls how every unit-bearing
 * value renders. Default is Metric so the diagnostic surface anchors to
 * ground-truth on first open. User selection persists across sessions via
 * localStorage so the toggle is sticky.
 *
 * `formatAuditValue(value, measureType, decimals)` is the single render-
 * site helper — every unit-bearing value in `src/features/dev-mode/` MUST
 * route through it (grep contract: no `.toFixed(N) + ' kg|cm|ha|...'`
 * literals in dev-mode files).
 */

import { display } from '../../utils/units.js';

const STORAGE_KEY = 'dev-audit-unit-mode';
export const VALID_MODES = ['metric', 'standard', 'hybrid'];
export const DEFAULT_MODE = 'metric';

/**
 * Read the current audit unit mode from localStorage. Defaults to 'metric'
 * when unset or when the stored value isn't recognized.
 * @returns {'metric' | 'standard' | 'hybrid'}
 */
export function getAuditUnitMode() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(v) ? v : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}

/**
 * Persist the audit unit mode. Throws on invalid mode.
 * @param {'metric' | 'standard' | 'hybrid'} mode
 */
export function setAuditUnitMode(mode) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Invalid audit unit mode: ${mode}`);
  }
  localStorage.setItem(STORAGE_KEY, mode);
}

/**
 * Format a unit-bearing value for the audit page using the current mode.
 *
 * - measureType is one of the keys in `units.js` CONVERSIONS map: `weight`,
 *   `area`, `length`, `temperature`, `volume`, `yieldRate`, `dmYieldDensity`.
 * - measureType `null` / `undefined` returns the raw value with no unit
 *   suffix — for unitless inputs (head counts, percentages, day counts).
 * - In `metric` and `standard` modes, returns a string. In `hybrid` mode
 *   returns `{ primary, secondary }` so the caller can apply distinct CSS
 *   to the parenthetical (mute the imperial annotation).
 *
 * @param {*} value
 * @param {string|null} [measureType]
 * @param {number} [decimals=2]
 * @returns {string | { primary: string, secondary: string }}
 */
export function formatAuditValue(value, measureType = null, decimals = 2) {
  // Unitless or non-numeric values render verbatim (with one decimal-place
  // pass through .toFixed when the value is a finite number AND a measure
  // type wasn't supplied — keeps numeric scalars uniform with the unit-bearing
  // counterparts). String / null / undefined go through unchanged.
  if (measureType == null) {
    if (value == null) return '—';
    if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(decimals);
    return String(value);
  }

  if (value == null || (typeof value === 'number' && !Number.isFinite(value))) {
    return '—';
  }

  const mode = getAuditUnitMode();
  if (mode === 'standard') {
    return display(value, measureType, 'imperial', decimals);
  }
  if (mode === 'hybrid') {
    return {
      primary: display(value, measureType, 'metric', decimals),
      secondary: display(value, measureType, 'imperial', decimals),
    };
  }
  // metric (default)
  return display(value, measureType, 'metric', decimals);
}

/**
 * Convenience: format a kg DM/day value, honoring the current mode and
 * appending the ' DM/day' suffix that `units.js` doesn't carry as a first-
 * class measure type. Falls through to `formatAuditValue(value, 'weight')`
 * and post-fixes the DM suffix.
 *
 * @param {number} valueKg
 * @param {number} [decimals=2]
 * @returns {string | { primary: string, secondary: string }}
 */
export function formatAuditDmPerDay(valueKg, decimals = 2) {
  const formatted = formatAuditValue(valueKg, 'weight', decimals);
  if (formatted == null || formatted === '—') return '—';
  if (typeof formatted === 'string') return `${formatted} DM/day`;
  return {
    primary: `${formatted.primary} DM/day`,
    secondary: `${formatted.secondary} DM/day`,
  };
}

/**
 * Convenience: format a kg DM total (no /day) — same DM suffix idea.
 *
 * @param {number} valueKg
 * @param {number} [decimals=2]
 * @returns {string | { primary: string, secondary: string }}
 */
export function formatAuditDmTotal(valueKg, decimals = 2) {
  const formatted = formatAuditValue(valueKg, 'weight', decimals);
  if (formatted == null || formatted === '—') return '—';
  if (typeof formatted === 'string') return `${formatted} DM`;
  return {
    primary: `${formatted.primary} DM`,
    secondary: `${formatted.secondary} DM`,
  };
}
