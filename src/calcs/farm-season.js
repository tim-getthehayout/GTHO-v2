/** @file #402 — farm season default (per-farm start/end month-day). Pure.
 * The default the Rotation calendar / List season metrics open on and that
 * "Season default" reloads. Stored on farm_settings (migration 049, held until
 * applied); when the columns are absent or unset the app falls back to the
 * calendar year Jan 1 – Dec 31 (Tim, card t1477s5820). Resolved to concrete
 * dates with `periodContaining` (start after end wraps the year).
 * Viewing or picking a period never writes this (Db / Q5).
 */
import { periodContaining, validatePeriod } from './budget-period.js';

/** App fallback and 049 column default: calendar year. */
export const FARM_SEASON_FALLBACK = Object.freeze({ startMonth: 1, startDay: 1, endMonth: 12, endDay: 31 });

export const SEASON_FIELD_KEYS = Object.freeze(['seasonStartMonth', 'seasonStartDay', 'seasonEndMonth', 'seasonEndDay']);

export const MONTH_SHORT = Object.freeze(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);

/** Most days a month can have (Feb 29 allowed; non-leap years clamp to Feb 28). */
const MAX_DAY = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** True for a real month-day (1–12, 1–28/29/30/31). */
export function isValidMonthDay(month, day) {
  return Number.isInteger(month) && Number.isInteger(day)
    && month >= 1 && month <= 12 && day >= 1 && day <= MAX_DAY[month - 1];
}

/** True when the end month-day is before the start (the season spans two years). */
export function seasonWraps(def) {
  return def.endMonth < def.startMonth || (def.endMonth === def.startMonth && def.endDay < def.startDay);
}

/**
 * The farm's season default from a farm_settings record. Missing, partial or
 * invalid values (columns absent before 049, or unset) → FARM_SEASON_FALLBACK.
 * @param {object|null|undefined} fs farm_settings (camelCase)
 */
export function resolveFarmSeason(fs) {
  const def = {
    startMonth: fs?.seasonStartMonth, startDay: fs?.seasonStartDay,
    endMonth: fs?.seasonEndMonth, endDay: fs?.seasonEndDay,
  };
  if (isValidMonthDay(def.startMonth, def.startDay) && isValidMonthDay(def.endMonth, def.endDay)) {
    return { ...def };
  }
  return { ...FARM_SEASON_FALLBACK };
}

/** The farm season (concrete start/end) containing `today`. */
export function farmSeasonWindow(today, fs) {
  return periodContaining(today, resolveFarmSeason(fs));
}

/**
 * Validate an edited season (month-days as numbers or strings).
 * Rules: real month-days; the resolved season must be 1–366 days
 * (`validatePeriod` budget rule), which rules out start = end.
 * @returns {{ valid: boolean, errors: string[], normalized: object|null }}
 */
export function validateFarmSeason(values = {}, today = '2026-01-01') {
  const num = v => (v === '' || v == null ? NaN : Number(v));
  const def = {
    startMonth: num(values.startMonth ?? values.seasonStartMonth),
    startDay: num(values.startDay ?? values.seasonStartDay),
    endMonth: num(values.endMonth ?? values.seasonEndMonth),
    endDay: num(values.endDay ?? values.seasonEndDay),
  };
  const errors = [];
  if (!isValidMonthDay(def.startMonth, def.startDay)) errors.push('Season start is not a real date');
  if (!isValidMonthDay(def.endMonth, def.endDay)) errors.push('Season end is not a real date');
  if (!errors.length && validatePeriod(periodContaining(today, def)).length) {
    errors.push('Season must be 1 to 366 days (start and end cannot be the same day)');
  }
  if (errors.length) return { valid: false, errors, normalized: null };
  return {
    valid: true,
    errors: [],
    normalized: {
      seasonStartMonth: def.startMonth,
      seasonStartDay: def.startDay,
      seasonEndMonth: def.endMonth,
      seasonEndDay: def.endDay,
    },
  };
}

const fmt = (iso, withYear) => {
  const [y, m, d] = iso.split('-').map(Number);
  return withYear ? `${MONTH_SHORT[m - 1]} ${d}, ${y}` : `${MONTH_SHORT[m - 1]} ${d}`;
};

/**
 * "Jan 1 – Dec 31 (2026)" for a season inside one year; a wrapping season
 * shows both years: "Oct 1, 2026 – Sep 30, 2027". Dates are the season
 * containing `today`.
 */
export function formatFarmSeason(def, today) {
  const { start, end } = periodContaining(today, def);
  if (start.slice(0, 4) === end.slice(0, 4)) return `${fmt(start, false)} – ${fmt(end, false)} (${start.slice(0, 4)})`;
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}
