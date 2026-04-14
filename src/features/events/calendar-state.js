/**
 * @file Calendar state module — CP-54.
 * URL query schema, defaults, reducers, session persistence.
 * See V2_UX_FLOWS.md §19.9 for full specification.
 *
 * State is NOT persisted to user_preferences (deferred per §19.9).
 * Lives in session memory + URL only.
 */

// ── Defaults (§19.9) ─────────────────────────────────────────────
const DEFAULTS = {
  zoom: 'week',
  anchor: 'today',
  groups: [],
  period: null,
  showConfinement: false,
  view: 'calendar',
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

// ── URL serialization (§19.9) ─────────────────────────────────────

function syncUrl() {
  const params = new URLSearchParams();

  if (state.zoom !== DEFAULTS.zoom) params.set('zoom', state.zoom);
  if (state.anchor !== DEFAULTS.anchor) params.set('anchor', state.anchor);
  if (state.groups.length > 0) params.set('groups', state.groups.join(','));
  if (state.period != null) params.set('period', String(state.period));
  if (state.showConfinement) params.set('showConfinement', '1');
  if (state.view !== DEFAULTS.view) params.set('view', state.view);

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
  if (qIdx === -1) {
    state = { ...DEFAULTS, groups: [] };
    return state;
  }

  const params = new URLSearchParams(hash.slice(qIdx + 1));

  const zoom = params.get('zoom');
  const anchor = params.get('anchor');
  const groupsStr = params.get('groups');
  const periodStr = params.get('period');
  const confStr = params.get('showConfinement');
  const view = params.get('view');

  state = {
    zoom: VALID_ZOOM.includes(zoom) ? zoom : DEFAULTS.zoom,
    anchor: VALID_ANCHOR_PRESETS.includes(anchor) || isIsoDate(anchor) ? anchor : DEFAULTS.anchor,
    groups: groupsStr ? groupsStr.split(',').filter(Boolean) : [],
    period: periodStr && Number(periodStr) > 0 ? Number(periodStr) : null,
    showConfinement: confStr === '1',
    view: VALID_VIEW.includes(view) ? view : DEFAULTS.view,
  };

  return state;
}

// ── Helpers ────────────────────────────────────────────────────────

function isIsoDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

/** Reset to defaults (for testing). */
export function resetCalendarState() {
  state = { ...DEFAULTS, groups: [] };
}
