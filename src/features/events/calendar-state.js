/**
 * @file Calendar state module — CP-54.
 * URL query schema, defaults, reducers, session persistence.
 * See V2_UX_FLOWS.md §19.9 for full specification.
 *
 * Most state lives in session memory + URL only (not user_preferences).
 * Pb: chosen season metric window is remembered in this browser via localStorage.
 */

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
  // OI-0254 Cm1+Cm1a: metrics column collapse; default expanded (session only).
  metricsCollapsed: false,
};

const VALID_ZOOM = ['day', 'week', 'month', 'last90'];
const VALID_ANCHOR_PRESETS = ['today', 'last30', 'thisYear'];
const VALID_VIEW = ['calendar', 'list'];

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
  const k = typeof key === 'string' && key ? key : 'name';
  const d = dir === 'desc' ? 'desc' : 'asc';
  state = { ...state, sortKey: k, sortDir: d };
  syncUrl();
}

/** OI-0254 Cm1 — collapse/expand Rotation metrics column (session; not URL). */
export function setMetricsCollapsed(collapsed) {
  state = { ...state, metricsCollapsed: !!collapsed };
}

/** OI-0254 Cm1 — toggle; Cm1a default is expanded (false). */
export function toggleMetricsCollapsed() {
  state = { ...state, metricsCollapsed: !state.metricsCollapsed };
}

// ── URL serialization (§19.9) ─────────────────────────────────────

function syncUrl() {
  const params = new URLSearchParams();

  if (state.zoom !== DEFAULTS.zoom) params.set('zoom', state.zoom);
  if (state.anchor !== DEFAULTS.anchor) params.set('anchor', state.anchor);
  if (state.groups.length > 0) params.set('groups', state.groups.join(','));
  if (state.period != null) params.set('period', String(state.period));
  if (state.showConfinement) params.set('showConfinement', '1');
  if (state.view !== DEFAULTS.view) params.set('view', state.view);
  if (state.metricStart) params.set('metricStart', state.metricStart);
  if (state.metricEnd) params.set('metricEnd', state.metricEnd);
  if (state.sortKey !== DEFAULTS.sortKey) params.set('sortKey', state.sortKey);
  if (state.sortDir !== DEFAULTS.sortDir) params.set('sortDir', state.sortDir);

  const qs = params.toString();
  const newHash = '#/events' + (qs ? '?' + qs : '');
  history.replaceState(null, '', newHash);
}

/**
 * Read calendar state from the current URL hash.
 * Called once on mount; omitted params fall back to defaults.
 */
export function readStateFromUrl() {
  const hash = window.location.hash || '';
  const qIdx = hash.indexOf('?');
  const stored = readStoredMetricWindow();

  if (qIdx === -1) {
    state = {
      ...DEFAULTS,
      groups: [],
      // Pb: restore remembered season window when hash has no query.
      metricStart: stored?.start || null,
      metricEnd: stored?.end || null,
      // OI-0254 Cm1a: URL remount keeps default expanded.
      metricsCollapsed: false,
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

  state = {
    zoom: VALID_ZOOM.includes(zoom) ? zoom : DEFAULTS.zoom,
    anchor: VALID_ANCHOR_PRESETS.includes(anchor) || isIsoDate(anchor) ? anchor : DEFAULTS.anchor,
    groups: groupsStr ? groupsStr.split(',').filter(Boolean) : [],
    period: periodStr && Number(periodStr) > 0 ? Number(periodStr) : null,
    showConfinement: confStr === '1',
    view: VALID_VIEW.includes(view) ? view : DEFAULTS.view,
    metricStart: resolvedStart,
    metricEnd: resolvedEnd,
    sortKey: sortKey || DEFAULTS.sortKey,
    sortDir: sortDir === 'desc' ? 'desc' : 'asc',
    // OI-0254 Cm1a: collapse is session-only; URL read resets to expanded.
    metricsCollapsed: false,
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
  try { globalThis.localStorage?.removeItem(METRIC_WINDOW_KEY); } catch { /* ignore */ }
}

/** Reset to defaults (for testing). */
export function resetCalendarState() {
  state = { ...DEFAULTS, groups: [] };
  clearStoredMetricWindow();
}
