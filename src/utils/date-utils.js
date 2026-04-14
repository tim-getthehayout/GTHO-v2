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
 * Add days to a date. Returns a new Date.
 * @param {Date|string} date
 * @param {number} days - Can be negative
 * @returns {Date}
 */
export function addDays(date, days) {
  const d = date instanceof Date ? new Date(date) : new Date(date);
  d.setDate(d.getDate() + days);
  return d;
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
