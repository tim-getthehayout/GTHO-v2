/**
 * @file Client-side sort for location management rows (S0).
 * Default: Name ↑. Every numeric management column is sortable.
 * Unknown (null) sorts after known values in BOTH directions (the comparator
 * returns before applying the direction). OI-0274 relies on this: DMI/ac with no
 * acreage or unknown DMI sorts last whether lowest- or highest-first.
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
 * OI-0278: the per-area sort keys keep their OI-0274 ids (deep links,
 * `gtho_v2_locations_sort`, `sort-dmiPerAcre` test ids) but read the canonical
 * per-ha fields. Sorting stays on metric values; ha → ac is monotonic, so the
 * order is the same on both unit systems.
 */
export const SORT_FIELD = Object.freeze({
  dmiPerAcre: 'dmiPerHa',
  audsPerAcre: 'audsPerHa',
  nPerAcre: 'nPerHa',
  pPerAcre: 'pPerHa',
  kPerAcre: 'kPerHa',
});

/** OI-0274 Ds1: first tap sorts lowest first for these keys (others: name asc, metrics desc). */
export const FIRST_TAP_ASC = Object.freeze(['name', 'dmiPerAcre']);

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
    const field = SORT_FIELD[key] || key;
    const av = a[field];
    const bv = b[field];
    const aNull = av == null || !Number.isFinite(Number(av));
    const bNull = bv == null || !Number.isFinite(Number(bv));
    if (aNull && bNull) {
      return String(a.locationName || '').localeCompare(String(b.locationName || ''), undefined, { sensitivity: 'base' });
    }
    // Unknowns after knowns in both directions (not multiplied by dir).
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
  return { key, dir: FIRST_TAP_ASC.includes(key) ? 'asc' : 'desc' };
}
