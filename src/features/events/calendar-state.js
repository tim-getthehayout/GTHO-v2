/**
 * @file Calendar state module — CP-54.
 * URL query schema, defaults, reducers, session persistence.
 * See V2_UX_FLOWS.md §19.9 for full specification.
 *
 * Most state lives in session memory + URL only (not user_preferences).
 * Per-device localStorage prefs (this browser only):
 * - Pb: chosen season metric window (`gtho_v2_locations_metric_window`).
 * - OI-0267 Pd1: Metrics collapse open/closed (`gtho_v2_locations_metrics_collapsed`).
 * - OI-0274 Dm1: row sort `{ key, dir }` (`gtho_v2_locations_sort`); an explicit
 *   URL sortKey/sortDir wins when present.
 */
import { SORT_KEYS } from './rotation-calendar/sort-rows.js';


// ── Defaults (§19.9) ─────────────────────────────────────────────
const DEFAULTS = {
  zoom: 'week',
  anchor: 'today',
  groups: [],
  period: null,
  showConfinement: false,
  view: 'calendar',
  metricStart: null, // W1 window start YYYY-MM-DD; null → periodContaining(today)
  metricEnd: null,
  sortKey: 'name',
  sortDir: 'asc',
  // OI-0254 Cm1+Cm1a: metrics column collapse; default expanded when unset.
  // OI-0267 Pd1: last chosen state is remembered per device (not in the URL).
  metricsCollapsed: false,
};

const VALID_ZOOM = ['day', 'week', 'month', 'last90'];
const VALID_ANCHOR_PRESETS = ['today', 'last30', 'thisYear'];
// OI-0263 Lf-B+Tb1: Map is the third Locations & Rotation view.
const VALID_VIEW = ['calendar', 'list', 'map'];

/** OI-0263: canonical hash for the Map view (old `#/map` links redirect here). */
export const MAP_VIEW_HASH = '#/events?view=map';

/** OI-0265 Rd1: canonical hash for the List view (old `#/locations` links redirect here). */
export const LIST_VIEW_HASH = '#/events?view=list';

/**
 * OI-0263: true for the legacy `#/map` route or any `#/events?…view=map` hash.
 * @param {string|null|undefined} hash
 */
export function isMapViewHash(hash) {
  if (!hash) return false;
  const str = String(hash);
  const qIdx = str.indexOf('?');
  const path = qIdx === -1 ? str : str.slice(0, qIdx);
  if (path === '#/map') return true;
  if (path !== '#/events' || qIdx === -1) return false;
  return new URLSearchParams(str.slice(qIdx + 1)).get('view') === 'map';
}

// ── Session state ─────────────────────────────────────────────────
let state = { ...DEFAULTS, groups: [] };

/** @returns {Readonly<typeof state>} */
export function getCalendarState() {
  return state;
}

/**
 * Derived: which view mode is active based on forecaster group selection.
 * @returns {'estimated' | 'forecast'}
 */
export function getViewMode() {
  return state.groups.length > 0 && state.period != null ? 'forecast' : 'estimated';
}

// ── Reducers ──────────────────────────────────────────────────────

export function setZoom(zoom) {
  if (VALID_ZOOM.includes(zoom)) {
    state = { ...state, zoom };
    syncUrl();
  }
}

export function setJump(anchor) {
  if (VALID_ANCHOR_PRESETS.includes(anchor) || isIsoDate(anchor)) {
    state = { ...state, anchor };
    syncUrl();
  }
}

export function addForecasterGroup(groupId) {
  if (groupId && !state.groups.includes(groupId)) {
    state = { ...state, groups: [...state.groups, groupId] };
    syncUrl();
  }
}

export function removeForecasterGroup(groupId) {
  state = { ...state, groups: state.groups.filter(id => id !== groupId) };
  syncUrl();
}

export function clearForecasterGroups() {
  state = { ...state, groups: [], period: null };
  syncUrl();
}

export function setPeriod(days) {
  const n = days != null ? Number(days) : null;
  state = { ...state, period: n != null && n > 0 ? n : null };
  syncUrl();
}

export function toggleConfinement() {
  state = { ...state, showConfinement: !state.showConfinement };
  syncUrl();
}

export function setView(view) {
  if (VALID_VIEW.includes(view)) {
    state = { ...state, view };
    syncUrl();
  }
}


export function setMetricWindow(start, end) {
  const s = isIsoDate(start) ? start : null;
  const e = isIsoDate(end) ? end : null;
  state = { ...state, metricStart: s, metricEnd: e };
  // Pb: persist chosen window; Season default (null,null) clears stored override.
  writeStoredMetricWindow(s, e);
  syncUrl();
}

export function setSort(key, dir) {
  const k = SORT_KEYS.includes(key) ? key : 'name';
  const d = dir === 'desc' ? 'desc' : 'asc';
  state = { ...state, sortKey: k, sortDir: d };
  // OI-0274 Dm1: remember the sort on this device.
  writeStoredSort(k, d);
  syncUrl();
}

/** OI-0254 Cm1 — collapse/expand Rotation metrics column (not URL). OI-0267 Pd1: persisted per device. */
export function setMetricsCollapsed(collapsed) {
  state = { ...state, metricsCollapsed: !!collapsed };
  writeStoredMetricsCollapsed(state.metricsCollapsed);
}

/** OI-0254 Cm1 — toggle; Cm1a default is expanded (false). OI-0267 Pd1: persisted per device. */
export function toggleMetricsCollapsed() {
  setMetricsCollapsed(!state.metricsCollapsed);
}

// ── URL serialization (§19.9) ─────────────────────────────────────

function syncUrl() {
  history.replaceState(null, '', calendarHashFor());
}

/**
 * The `#/events?…` hash for the current calendar state with optional overrides
 * (OI-0263: the Map toggle pushes a real history entry so Back returns to the view).
 * @param {Partial<typeof state>} [overrides]
 * @returns {string}
 */
export function calendarHashFor(overrides = {}) {
  const s = { ...state, ...overrides };
  const params = new URLSearchParams();

  if (s.zoom !== DEFAULTS.zoom) params.set('zoom', s.zoom);
  if (s.anchor !== DEFAULTS.anchor) params.set('anchor', s.anchor);
  if (s.groups.length > 0) params.set('groups', s.groups.join(','));
  if (s.period != null) params.set('period', String(s.period));
  if (s.showConfinement) params.set('showConfinement', '1');
  if (s.view !== DEFAULTS.view) params.set('view', s.view);
  if (s.metricStart) params.set('metricStart', s.metricStart);
  if (s.metricEnd) params.set('metricEnd', s.metricEnd);
  if (s.sortKey !== DEFAULTS.sortKey) params.set('sortKey', s.sortKey);
  if (s.sortDir !== DEFAULTS.sortDir) params.set('sortDir', s.sortDir);

  const qs = params.toString();
  const newHash = '#/events' + (qs ? '?' + qs : '');
  return newHash;
}

/**
 * Read calendar state from the current URL hash.
 * Called once on mount; omitted params fall back to defaults.
 */
export function readStateFromUrl() {
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  const stored = readStoredMetricWindow();
  // OI-0267 Pd1: restore the last chosen collapse state (unset/invalid → expanded, Cm1a).
  const storedCollapsed = readStoredMetricsCollapsed();
  // OI-0274 Dm1: restore the remembered sort (unset/invalid → name asc).
  const storedSort = readStoredSort();

  if (qIdx === -1) {
    state = {
      ...DEFAULTS,
      groups: [],
      // Pb: restore remembered season window when hash has no query.
      metricStart: stored?.start || null,
      metricEnd: stored?.end || null,
      sortKey: storedSort?.key || DEFAULTS.sortKey,
      sortDir: storedSort?.dir || DEFAULTS.sortDir,
      metricsCollapsed: storedCollapsed,
    };
    return state;
  }

  const params = new URLSearchParams(hash.slice(qIdx + 1));

  const zoom = params.get('zoom');
  const anchor = params.get('anchor');
  const groupsStr = params.get('groups');
  const periodStr = params.get('period');
  const confStr = params.get('showConfinement');
  const view = params.get('view');

  const metricStart = params.get('metricStart');
  const metricEnd = params.get('metricEnd');
  const sortKey = params.get('sortKey');
  const sortDir = params.get('sortDir');

  const urlStart = isIsoDate(metricStart) ? metricStart : null;
  const urlEnd = isIsoDate(metricEnd) ? metricEnd : null;
  // URL deep-link wins when present; otherwise restore Pb storage.
  const resolvedStart = urlStart || stored?.start || null;
  const resolvedEnd = urlEnd || stored?.end || null;
  if (urlStart && urlEnd) writeStoredMetricWindow(urlStart, urlEnd);
  // OI-0274 Dm1: an explicit, valid URL sortKey wins; otherwise the stored sort.
  const urlSort = SORT_KEYS.includes(sortKey)
    ? { key: sortKey, dir: sortDir === 'desc' ? 'desc' : 'asc' }
    : null;
  const resolvedSort = urlSort || storedSort || { key: DEFAULTS.sortKey, dir: DEFAULTS.sortDir };

  state = {
    zoom: VALID_ZOOM.includes(zoom) ? zoom : DEFAULTS.zoom,
    anchor: VALID_ANCHOR_PRESETS.includes(anchor) || isIsoDate(anchor) ? anchor : DEFAULTS.anchor,
    groups: groupsStr ? groupsStr.split(',').filter(Boolean) : [],
    period: periodStr && Number(periodStr) > 0 ? Number(periodStr) : null,
    showConfinement: confStr === '1',
    view: VALID_VIEW.includes(view) ? view : DEFAULTS.view,
    metricStart: resolvedStart,
    metricEnd: resolvedEnd,
    sortKey: resolvedSort.key,
    sortDir: resolvedSort.dir,
    // OI-0267 Pd1: collapse is per device (not in the URL); unset → expanded (Cm1a).
    metricsCollapsed: storedCollapsed,
  };

  return state;
}

// ── Helpers ────────────────────────────────────────────────────────

function isIsoDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

const METRIC_WINDOW_KEY = 'gtho_v2_locations_metric_window';

function readStoredMetricWindow() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(METRIC_WINDOW_KEY) ?? 'null');
    if (saved && isIsoDate(saved.start) && isIsoDate(saved.end) && saved.end >= saved.start) {
      return { start: saved.start, end: saved.end };
    }
  } catch { /* device storage unavailable or malformed */ }
  return null;
}

function writeStoredMetricWindow(start, end) {
  try {
    if (isIsoDate(start) && isIsoDate(end) && end >= start) {
      globalThis.localStorage?.setItem(METRIC_WINDOW_KEY, JSON.stringify({ start, end }));
      return true;
    }
    globalThis.localStorage?.removeItem(METRIC_WINDOW_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Test helper: clear Pb storage. */
export function clearStoredMetricWindow() {
  try { globalThis.localStorage?.removeItem(METRIC_WINDOW_KEY); } catch { /* test helper: storage unavailable */ }
}

// OI-0267 Pd1 — Metrics collapse per device.
const METRICS_COLLAPSED_KEY = 'gtho_v2_locations_metrics_collapsed';

function readStoredMetricsCollapsed() {
  try {
    return JSON.parse(globalThis.localStorage?.getItem(METRICS_COLLAPSED_KEY) ?? 'null') === true;
  } catch { /* storage unavailable or malformed → expanded (Cm1a) */ }
  return false;
}

function writeStoredMetricsCollapsed(collapsed) {
  try {
    globalThis.localStorage?.setItem(METRICS_COLLAPSED_KEY, JSON.stringify(!!collapsed));
    return true;
  } catch {
    return false;
  }
}

// OI-0274 Dm1 — row sort per device.
const SORT_STORAGE_KEY = 'gtho_v2_locations_sort';

function readStoredSort() {
  try {
    const saved = JSON.parse(globalThis.localStorage?.getItem(SORT_STORAGE_KEY) ?? 'null');
    if (saved && SORT_KEYS.includes(saved.key) && (saved.dir === 'asc' || saved.dir === 'desc')) {
      return { key: saved.key, dir: saved.dir };
    }
  } catch { /* storage unavailable or malformed → name asc */ }
  return null;
}

function writeStoredSort(key, dir) {
  try {
    globalThis.localStorage?.setItem(SORT_STORAGE_KEY, JSON.stringify({ key, dir }));
    return true;
  } catch {
    return false;
  }
}

/** Test helper: clear OI-0267 Pd1 + OI-0274 Dm1 storage. */
export function clearStoredLocationsPrefs() {
  try {
    globalThis.localStorage?.removeItem(METRICS_COLLAPSED_KEY);
    globalThis.localStorage?.removeItem(SORT_STORAGE_KEY);
  } catch { /* test helper: storage unavailable */ }
}

/** Reset to defaults (for testing). */
export function resetCalendarState() {
  state = { ...DEFAULTS, groups: [] };
  clearStoredMetricWindow();
  clearStoredLocationsPrefs();
}
