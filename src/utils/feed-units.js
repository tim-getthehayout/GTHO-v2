/** @file Shared closed feed-unit list for feed types, batches and pool counting.
 * Stored values are the canonical strings below. Legacy spellings are folded on
 * read and normalized on save; existing records are never rewritten here.
 */

/** Closed list, in picker order. `bale` is a round bale and is labelled so. */
export const FEED_UNITS = Object.freeze(['bale', 'sq bale', 'ton', 'kg', 'lb', 'bag']);

/** Locale key for each canonical unit's picker label. */
export const FEED_UNIT_LABEL_KEYS = Object.freeze({
  bale: 'feed.unitBale',
  'sq bale': 'feed.unitSqBale',
  ton: 'feed.unitTon',
  kg: 'feed.unitKg',
  lb: 'feed.unitLb',
  bag: 'feed.unitBag',
});

/** Units an event feed pool may count in (every list unit); others fall back to mass (kg). */
export const POOL_COUNT_UNITS = Object.freeze(new Set(FEED_UNITS));

const ALIASES = Object.freeze({
  bal: 'bale',
  rb: 'bale',
  'round bale': 'bale',
  'square bale': 'sq bale',
  'small square': 'sq bale',
});

// Hyphens fold to spaces first, so legacy `round-bale` / `sq-bale` reach the alias lookup.
const clean = value => value.toLowerCase().replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
const known = value => (FEED_UNITS.includes(value) ? value : ALIASES[value] ?? null);

/**
 * Normalize a typed or stored unit to its canonical list value.
 * Lower-case, hyphens to spaces, trim and collapse spaces, singular form, then aliases.
 * @returns {string|null} canonical unit, or null when not on the list
 */
export function normalizeFeedUnit(value) {
  if (typeof value !== 'string') return null;
  const cleaned = clean(value);
  if (!cleaned) return null;
  return known(cleaned) ?? (cleaned.endsWith('s') ? known(cleaned.slice(0, -1)) : null);
}

/**
 * Read-side fold for comparisons: canonical when recognised, otherwise the
 * cleaned original so unknown values never match a list unit by accident.
 */
export function foldFeedUnit(value) {
  if (typeof value !== 'string') return value ?? null;
  return normalizeFeedUnit(value) ?? (clean(value) || null);
}

/** Canonical value for a derived write, or the original when unrecognised. */
export function canonicalOrOriginal(value) {
  return normalizeFeedUnit(value) ?? value;
}
