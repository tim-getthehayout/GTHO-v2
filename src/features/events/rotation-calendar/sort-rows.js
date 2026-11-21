/**
 * @file Client-side sort for location management rows (S0).
 * Default: Name ↑. Every numeric management column is sortable.
 * Unknown (null) sorts after known values in ascending, before in descending.
 */

export const SORT_KEYS = Object.freeze([
  'name',
  'dmiKg',
  'auds',
  'nKg',
  'pKg',
  'kKg',
  'avgScore',
  'dmiPerAcre',
  'audsPerAcre',
  'nPerAcre',
  'pPerAcre',
  'kPerAcre',
]);

/**
 * @param {Array<object>} rows - metric rows from computeLocationMetrics
 * @param {{ key: string, dir: 'asc'|'desc' }} sort
 */
export function sortMetricRows(rows, sort = { key: 'name', dir: 'asc' }) {
  const key = SORT_KEYS.includes(sort?.key) ? sort.key : 'name';
  const dir = sort?.dir === 'desc' ? 'desc' : 'asc';
  const mult = dir === 'asc' ? 1 : -1;
  const list = (rows || []).slice();

  list.sort((a, b) => {
    if (key === 'name') {
      const an = String(a.locationName || a.name || '');
      const bn = String(b.locationName || b.name || '');
      return mult * an.localeCompare(bn, undefined, { sensitivity: 'base' });
    }
    const av = a[key];
    const bv = b[key];
    const aNull = av == null || !Number.isFinite(Number(av));
    const bNull = bv == null || !Number.isFinite(Number(bv));
    if (aNull && bNull) {
      return String(a.locationName || '').localeCompare(String(b.locationName || ''), undefined, { sensitivity: 'base' });
    }
    // Unknowns after knowns when ascending; before when descending
    if (aNull) return 1;
    if (bNull) return -1;
    const diff = Number(av) - Number(bv);
    if (diff !== 0) return mult * (diff < 0 ? -1 : 1);
    return String(a.locationName || '').localeCompare(String(b.locationName || ''), undefined, { sensitivity: 'base' });
  });

  return list;
}

/** Toggle helper for header clicks. */
export function nextSortState(current, key) {
  if (!SORT_KEYS.includes(key)) return { key: 'name', dir: 'asc' };
  if (current?.key === key) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: key === 'name' ? 'asc' : 'desc' };
}
