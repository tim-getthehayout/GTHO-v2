/** @file Date arithmetic and formatting helpers. Timezone-aware using operation timezone. */

/**
 * Get today's date as YYYY-MM-DD in the given timezone.
 * @param {string} [timezone='UTC']
 * @returns {string}
 */
export function today(timezone = 'UTC') {
  return formatDate(new Date(), timezone);
}

/**
 * Format a Date (or ISO string) as YYYY-MM-DD in the given timezone.
 * @param {Date|string} date
 * @param {string} [timezone='UTC']
 * @returns {string}
 */
export function formatDate(date, timezone = 'UTC') {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  return `${year}-${month}-${day}`;
}

/**
 * Format a Date (or ISO string) as a human-readable datetime string.
 * @param {Date|string} date
 * @param {string} [timezone='UTC']
 * @returns {string}
 */
export function formatDateTime(date, timezone = 'UTC') {
  const d = date instanceof Date ? date : new Date(date);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

/**
 * Add calendar days to a `YYYY-MM-DD` date string; returns `YYYY-MM-DD`.
 *
 * Local-calendar math (parse at local midnight, `setDate`, format local
 * Y-M-D) so DST shifts never move the date. Handles negative days, month
 * ends, leap years and year boundaries. A malformed input yields
 * `'NaN-NaN-NaN'` (never throws), which callers' `<`/`<=` loop guards treat
 * as past the end.
 *
 * #481: the one `addDays` for src/ (was duplicated in calcs/budget-period,
 * calcs/event-dmi-actual and rotation-calendar/past-window). The old
 * Date-returning version had no runtime callers.
 *
 * @param {string} ymd - `YYYY-MM-DD`
 * @param {number} days - Can be negative
 * @returns {string}
 */
export function addDays(ymd, days) {
  const d = new Date(`${ymd}T00:00:00`);
  d.setDate(d.getDate() + days);
  const pad = (v) => String(v).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Difference in calendar days between two dates (inclusive).
 * daysBetween('2024-01-01', '2024-01-03') === 3
 * @param {Date|string} start
 * @param {Date|string} end
 * @returns {number}
 */
export function daysBetweenInclusive(start, end) {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const ms = e.getTime() - s.getTime();
  return Math.round(ms / 86_400_000) + 1;
}


/**
 * Strip time from a date, returning midnight UTC.
 * @param {Date|string} date
 * @returns {Date}
 */
export function startOfDay(date) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Check if a date string is valid ISO format (YYYY-MM-DD or full ISO).
 * @param {string} str
 * @returns {boolean}
 */
export function isValidDateString(str) {
  if (typeof str !== 'string') return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

/**
 * Parse a YYYY-MM-DD string into a Date at midnight UTC.
 * @param {string} str
 * @returns {Date|null}
 */
export function parseDate(str) {
  if (!isValidDateString(str)) return null;
  // For YYYY-MM-DD, append T00:00:00Z to ensure UTC
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return new Date(str + 'T00:00:00Z');
  }
  return new Date(str);
}

/**
 * Get today's date as YYYY-MM-DD using the device-local calendar date.
 * Unlike `new Date().toISOString().slice(0, 10)` (UTC), this does not roll
 * over to tomorrow in the evening for users west of UTC.
 * @returns {string}
 */
export function getLocalTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Feed/check ordering: a missing clock is midnight; equality is captured by the check. */
export function rowInstant(date, time) {
  const [hour, minute, seconds = '00'] = (time || '00:00').split(':');
  const [second, fraction = ''] = seconds.split('.');
  return `${date || ''}T${hour}:${minute}:${second}.${fraction.padEnd(3, '0')}`;
}

/** True when a clock time is present. */
export function hasClock(time) {
  return time != null && String(time).trim() !== '';
}

function normalizeClock(time) {
  const [hour = '00', minute = '00', rest = '00'] = String(time).trim().split(':');
  const [second = '00'] = rest.split('.');
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

/**
 * Compare two (date, time) instants.
 * When a time is missing on either side, compare dates only.
 * @returns {-1|0|1}
 */
export function compareWindowInstants(dateA, timeA, dateB, timeB) {
  const a = dateA || '';
  const b = dateB || '';
  if (!hasClock(timeA) || !hasClock(timeB)) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const instantA = `${a}T${normalizeClock(timeA)}`;
  const instantB = `${b}T${normalizeClock(timeB)}`;
  return instantA < instantB ? -1 : instantA > instantB ? 1 : 0;
}
