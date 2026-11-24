/**
 * @file Metric memo (L1, t1466u/t1470u lag). Two caches, neither changes a number:
 *
 * 1. Render pass (`inMetricsPass`). While one synchronous render runs, the hot
 *    group-day and hay helpers return the same result for the same inputs
 *    instead of recomputing them for every location row, past block and day.
 *    Inputs are keyed by object identity, which is only safe while nothing can
 *    change them: the pass ends with the render and any store notify clears it.
 * 2. Store version (`memoByStoreVersion`). A whole location metric row, keyed by
 *    the store version plus the caller's own key (location, window, today …),
 *    so going back to a screen reuses rows. Only for callers whose context is
 *    read from the store at that version. Any store notify bumps the version.
 *
 * Outside a pass, and before the store version is set, everything computes
 * directly — unit tests calling the calcs see no cache.
 */

let pass = null;
let passDepth = 0;
let refIds = new WeakMap();
let nextRef = 0;

let storeVersion = 0;
const versionCache = new Map();
let versionCacheAt = -1;
const VERSION_CACHE_MAX = 5000;

/** Run `fn` inside a render pass (nested calls join the outer pass). */
export function inMetricsPass(fn) {
  if (passDepth === 0) pass = new Map();
  passDepth += 1;
  try {
    return fn();
  } finally {
    passDepth -= 1;
    if (passDepth === 0) pass = null;
  }
}

/** True while a render pass is open. */
export function metricsPassActive() {
  return pass !== null;
}

/** Stable small id for an object (identity), or '-' for null/undefined. */
export function ref(obj) {
  if (obj == null) return '-';
  if (typeof obj !== 'object' && typeof obj !== 'function') return `v${String(obj)}`;
  let id = refIds.get(obj);
  if (id === undefined) {
    nextRef += 1;
    id = nextRef;
    refIds.set(obj, id);
  }
  return id;
}

/**
 * Pass-scoped memo. Outside a pass (or with a null key) it just computes.
 * @template T
 * @param {string} name
 * @param {string|null} key
 * @param {() => T} compute
 * @returns {T}
 */
export function passMemo(name, key, compute) {
  if (!pass || key == null) return compute();
  let bucket = pass.get(name);
  if (!bucket) {
    bucket = new Map();
    pass.set(name, bucket);
  }
  if (bucket.has(key)) return bucket.get(key);
  const value = compute();
  bucket.set(key, value);
  return value;
}

/** Called by the store on every notify / reload: drops both caches. */
export function bumpMetricsStoreVersion() {
  storeVersion += 1;
  if (pass) pass.clear();
  versionCache.clear();
  versionCacheAt = storeVersion;
}

/** Current store version (test hook / diagnostics). */
export function metricsStoreVersion() {
  return storeVersion;
}

/**
 * Store-version memo for a caller whose inputs all come from the store at the
 * current version, plus `key` (everything else the result depends on).
 * @template T
 * @param {string} key
 * @param {() => T} compute
 * @returns {T}
 */
export function memoByStoreVersion(key, compute) {
  if (versionCacheAt !== storeVersion) {
    versionCache.clear();
    versionCacheAt = storeVersion;
  }
  if (versionCache.has(key)) return versionCache.get(key);
  const value = compute();
  if (versionCache.size >= VERSION_CACHE_MAX) versionCache.clear();
  versionCache.set(key, value);
  return value;
}

/** Test hook: forget everything. */
export function _resetMetricsMemo() {
  pass = null;
  passDepth = 0;
  refIds = new WeakMap();
  nextRef = 0;
  versionCache.clear();
  versionCacheAt = -1;
  storeVersion += 1;
}
