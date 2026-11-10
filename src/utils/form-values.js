/** Strict adapters for the date/time and numeric values entered in forms. */
import { t } from '../i18n/i18n.js';
export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const parsed = new Date(value + 'T00:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function localFormTimestamp(date, time = '') {
  const clock = time || '00:00';
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,3})?)?$/.test(clock)) throw new Error(t('manualEntry.invalidDate'));
  return `${date}T${clock.length === 5 ? clock + ':00' : clock}`;
}
export function optionalFormNumber(value) {
  if (value.trim() === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(t('manualEntry.invalidNumber'));
  return number;
}

export function isValidTimestamp(value) {
  return typeof value === 'string' && isCalendarDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
