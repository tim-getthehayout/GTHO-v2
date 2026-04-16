/** @file Short date formatter — "Mar 24, 26" style. */

const formatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: '2-digit',
});

/**
 * Format a date string as a short display date: "Mar 24, 26".
 * @param {string} dateStr - YYYY-MM-DD or ISO date string
 * @returns {string}
 */
export function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + (dateStr.length === 10 ? 'T00:00:00' : ''));
  if (isNaN(d.getTime())) return dateStr;
  return formatter.format(d);
}
