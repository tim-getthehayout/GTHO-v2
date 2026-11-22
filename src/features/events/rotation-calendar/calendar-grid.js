/**
 * @file Locations + rotation management surface.
 * Single vertical scroll owner (F0): name | sortable metrics | timeline (C1).
 * Phone: metrics under name; timeline scrolls horizontally (P1).
 * X1 pasture+mixed-use; W1 season window; T0 readiness; D0 compute-on-read.
 * OI-0252 Ls+Wu+Sb+Br+Nn+Pp+Uf+D0: stacked DMI/AUDs over NPK/Score, uniform width, List buttons right.
 * OI-0254 Sc1+Rd1+Tk1+Cm1+Cm1a: full-event canvas, per-paddock readiness band, tick hierarchy, collapsible metrics.
 */

import { el, clear } from '../../../ui/dom.js';
import { getAll } from '../../../data/store.js';
import {
  getCalendarState, getViewMode, setJump, setMetricWindow, setSort,
  toggleMetricsCollapsed,
} from '../calendar-state.js';
import { getUnitSystem } from '../../../utils/preferences.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../../utils/date-utils.js';
import { display } from '../../../utils/units.js';
import { navigate } from '../../../ui/router.js';
import {
  openLocationSheet,
  openSurveySheet,
  openFeedTypesSheet,
  openSoilTestSheet,
} from '../../locations/index.js';
import { openHarvestSheet } from '../../harvest/index.js';
import { openAmendmentSheet } from '../../amendments/entry.js';
import { getEventStartDate } from '../event-start.js';
import { getLiveWindowHeadCount } from '../../../calcs/window-helpers.js';
import {
  resolveCanvasRange, dateToPx, enumerateTicks, defaultSpanDays, parseTimelineDay,
} from './timeline.js';
import { renderPastBlock } from './past-block.js';
import { openPastEventDetailSheet } from './past-event-detail-sheet.js';
import { renderEstimatedFutureBlock, renderForecastFutureBlock } from './future-block.js';
import { shouldPaintCap1ForecastStub, CAP1_FORECAST_STUB } from './forecaster-helpers.js';
import { renderHeaderStrip } from './header-strip.js';
import { renderFarmMapScreen, unmountFarmMap } from '../../map/index.js';
import { logger } from '../../../utils/logger.js';
import { renderToolbar } from './toolbar.js';
import { renderLegend } from './legend.js';
import { renderTodayLine } from './today-line.js';
import {
  filterManagementLocations,
  defaultMetricWindow,
  computeLocationMetrics,
  aggregatePeriodTotals,
  formatMetricValue,
} from './location-metrics.js';
import { computeReadiness, lastGrazeDate, readinessBandRange } from './readiness.js';
import { sortMetricRows, nextSortState } from './sort-rows.js';
import {
  VERTICAL_SCROLL_OWNER_CLASS,
  TIMELINE_SCROLL_CLASS,
  bindHorizontalScrollSync,
  describeScrollArchitecture,
} from './scroll-owner.js';

const ROW_HEIGHT = 72;
const NAME_WIDTH = 160;
/** List-mode inventory filters (session memory; not Pb). */
let listSearchQuery = '';
let listLandUseFilter = 'all'; // all | pasture | mixed-use (Ta/X1 only)

const METRIC_COLS = [
  { key: 'dmiKg', label: 'DMI', title: 'Implied pasture DMI (kg)' },
  { key: 'auds', label: 'AUDs', title: 'Animal Unit Days' },
  { key: 'nKg', label: 'N', title: 'Nitrogen deposited (kg)' },
  { key: 'pKg', label: 'P', title: 'Phosphorus deposited (kg)' },
  { key: 'kKg', label: 'K', title: 'Potassium deposited (kg)' },
  { key: 'avgScore', label: 'Score', title: 'Average pasture score' },
];

/** OI-0252 Ls: line 1 = DMI · AUDs; line 2 = N · P · K · Score. */
const METRIC_LINE1 = METRIC_COLS.filter(c => c.key === 'dmiKg' || c.key === 'auds');
const METRIC_LINE2 = METRIC_COLS.filter(c => !METRIC_LINE1.includes(c));

/**
 * OI-0252 Wu: one uniform content width from the widest rendered metrics block
 * on this surface (after format + partial markers + per-acre text).
 * @param {ParentNode} root
 */
export function applyUniformMetricsWidth(root) {
  if (!root) return 0;
  if (root.classList?.contains('loc-mgmt--metrics-collapsed')) return 0;
  const cells = [...root.querySelectorAll('[data-testid="loc-mgmt-metrics"]')];
  const heads = [...root.querySelectorAll('.loc-mgmt__metrics-head')];
  const targets = [...cells, ...heads];
  for (const node of targets) {
    node.style.width = 'auto';
    node.style.minWidth = '';
  }
  let max = 0;
  for (const node of cells) {
    const w = Math.ceil(node.scrollWidth || node.offsetWidth || 0);
    if (w > max) max = w;
  }
  for (const node of heads) {
    const w = Math.ceil(node.scrollWidth || node.offsetWidth || 0);
    if (w > max) max = w;
  }
  if (max <= 0) return 0;
  for (const node of targets) {
    node.style.width = `${max}px`;
    node.style.minWidth = `${max}px`;
  }
  return max;
}

/**
 * @param {object} col
 * @param {object|null|undefined} metrics
 * @param {{ includePerAcre?: boolean }} [opts]
 */
function renderMetricCol(col, metrics, { includePerAcre = true } = {}) {
  const raw = metrics?.[col.key];
  const text = formatMetricValue(raw, { digits: col.key === 'avgScore' ? 0 : 0 });
  const perAcreKey = col.key === 'dmiKg' ? 'dmiPerAcre'
    : col.key === 'auds' ? 'audsPerAcre'
    : col.key === 'nKg' ? 'nPerAcre'
    : col.key === 'pKg' ? 'pPerAcre'
    : col.key === 'kKg' ? 'kPerAcre'
    : null;
  const perAcre = perAcreKey ? metrics?.[perAcreKey] : null;
  // Nn: drop per-acre parentheticals on phone before shortening digits.
  const perAcreText = includePerAcre && perAcre != null && metrics?.hasAcres
    ? ` (${formatMetricValue(perAcre, { digits: 1 })}/ac)`
    : '';
  const isPartial = (col.key === 'dmiKg' && metrics?.dmiPartial)
    || ((col.key === 'nKg' || col.key === 'pKg' || col.key === 'kKg') && metrics?.npkPartial);
  const title = isPartial
    ? `${col.title} (partial — some groups missing weights)`
    : col.title;
  return el('div', {
    className: `loc-mgmt__metric${isPartial ? ' loc-mgmt__metric--partial' : ''}`,
    title,
    dataset: { key: col.key, partial: isPartial ? 'true' : undefined },
  }, [
    el('span', { className: 'loc-mgmt__metric-label' }, [col.label]),
    el('span', { className: 'loc-mgmt__metric-value' }, [
      `${text}${perAcreText}`,
      isPartial
        ? el('span', { className: 'loc-mgmt__metric-partial', dataset: { testid: `loc-mgmt-metric-partial-${col.key}` } }, [' partial'])
        : null,
    ].filter(Boolean)),
  ]);
}

/**
 * OI-0252 Ls+Nn: two stacked metric lines (never flat six-across).
 * @param {object|null|undefined} metrics
 * @param {{ isPhone?: boolean }} [opts]
 */
function renderMetricsCell(metrics, { isPhone = false } = {}) {
  const includePerAcre = !isPhone;
  return el('div', {
    className: 'loc-mgmt__metrics',
    dataset: { testid: 'loc-mgmt-metrics', locationId: metrics?.locationId },
  }, [
    el('div', {
      className: 'loc-mgmt__metrics-line',
      dataset: { testid: 'loc-mgmt-metrics-line1' },
    }, METRIC_LINE1.map(col => renderMetricCol(col, metrics, { includePerAcre }))),
    el('div', {
      className: 'loc-mgmt__metrics-line',
      dataset: { testid: 'loc-mgmt-metrics-line2' },
    }, METRIC_LINE2.map(col => renderMetricCol(col, metrics, { includePerAcre }))),
  ]);
}

/**
 * OI-0252 Ls: stacked sort headers matching metric lines.
 */
function renderMetricsHead(metricBtnsByKey, { grow = false } = {}) {
  const line1 = METRIC_LINE1.map(c => metricBtnsByKey.get(c.key)).filter(Boolean);
  const line2 = METRIC_LINE2.map(c => metricBtnsByKey.get(c.key)).filter(Boolean);
  return el('div', {
    className: `loc-mgmt__metrics-head${grow ? ' loc-mgmt__metrics-head--grow' : ''}`,
  }, [
    el('div', { className: 'loc-mgmt__metrics-line loc-mgmt__metrics-line--head' }, line1),
    el('div', { className: 'loc-mgmt__metrics-line loc-mgmt__metrics-line--head' }, line2),
  ]);
}

/**
 * Render the locations + rotation management surface.
 * @param {HTMLElement} container
 */
export function renderCalendarGrid(container, { onViewChange } = {}) {
  clear(container);

  const state = getCalendarState();
  // OI-0263 Lf-B: Map view mounts the farm map under the View toggle; any other
  // view unmounts it (Leaflet instance removed, not left running off-screen).
  if (state.view === 'map') {
    renderMapView(container, { onViewChange });
    return;
  }
  unmountFarmMap();

  const viewMode = getViewMode();
  const unitSystem = getUnitSystem();
  const today = getLocalTodayStr();
  const isPhone = typeof window !== 'undefined' && window.innerWidth < 900;

  const allLocations = getAll('locations');
  const allEvents = getAll('events');
  const allPaddockWindows = getAll('eventPaddockWindows');
  const allGroupWindows = getAll('eventGroupWindows');
  const allGroups = getAll('groups');
  const allMemberships = getAll('animalGroupMemberships');
  const allAnimals = getAll('animals');
  const allClasses = getAll('animalClasses');
  const allWeights = getAll('animalWeightRecords');
  const allObservations = getAll('paddockObservations');
  const allFeedEntries = getAll('eventFeedEntries');
  const allFeedChecks = getAll('eventFeedChecks');
  const allFeedCheckItems = getAll('eventFeedCheckItems');
  const allBatches = getAll('batches');
  const allFeedTypes = getAll('feedTypes');
  const allBatchProfiles = getAll('batchNutritionalProfiles');
  const farmSettings = getAll('farmSettings')[0] || {};
  const operationId = allLocations[0]?.operationId
    || getAll('operations')[0]?.id
    || null;
  const farmId = allLocations[0]?.farmId || getAll('farms')[0]?.id || null;

  // X1 filter (pasture + mixed-use). Optional confinement toggle ignored for X1 surface.
  let locations = filterManagementLocations(allLocations);
  if (!locations.length) {
    container.appendChild(renderEmptyState());
    return;
  }

  const defaultWin = defaultMetricWindow(today);
  const windowStart = state.metricStart || defaultWin.start;
  const windowEnd = state.metricEnd || defaultWin.end;

  // La: List search + Ta type pills (within X1 only)
  if (state.view === 'list') {
    if (listLandUseFilter === 'pasture' || listLandUseFilter === 'mixed-use') {
      locations = locations.filter(l => (l.landUse || 'pasture') === listLandUseFilter);
    }
    if (listSearchQuery.trim()) {
      const q = listSearchQuery.trim().toLowerCase();
      locations = locations.filter(l => {
        const name = (l.name || '').toLowerCase();
        const code = (l.fieldCode || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      });
    }
  }

  const metricCtx = {
    windowStart,
    windowEnd,
    today,
    events: allEvents,
    paddockWindows: allPaddockWindows,
    groupWindows: allGroupWindows,
    memberships: allMemberships,
    animals: allAnimals,
    animalClasses: allClasses,
    animalWeightRecords: allWeights,
    locations: allLocations,
    observations: allObservations,
    feedEntries: allFeedEntries,
    feedChecks: allFeedChecks,
    feedCheckItems: allFeedCheckItems,
    batches: allBatches,
    feedTypes: allFeedTypes,
    batchNutritionalProfiles: allBatchProfiles,
  };

  let metricRows = locations.map(loc => computeLocationMetrics(loc, metricCtx));
  metricRows = sortMetricRows(metricRows, { key: state.sortKey || 'name', dir: state.sortDir || 'asc' });
  // Reorder locations to match sort
  const byId = new Map(locations.map(l => [l.id, l]));
  locations = metricRows.map(r => byId.get(r.locationId)).filter(Boolean);
  const metricsById = new Map(metricRows.map(r => [r.locationId, r]));

  const peerLast = new Map();
  for (const loc of locations) {
    peerLast.set(loc.id, lastGrazeDate(loc.id, {
      paddockWindows: allPaddockWindows, events: allEvents, today,
    }));
  }
  const readinessById = new Map();
  for (const loc of locations) {
    const hasActive = allPaddockWindows.some(pw =>
      pw.locationId === loc.id && !pw.dateClosed
      && allEvents.some(e => e.id === pw.eventId && !e.dateOut));
    readinessById.set(loc.id, computeReadiness(loc, {
      today,
      paddockWindows: allPaddockWindows,
      events: allEvents,
      observations: allObservations,
      peerLastGrazeDates: peerLast,
      defaultRecoveryMinDays: farmSettings.defaultRecoveryMinDays ?? 21,
      defaultRecoveryMaxDays: farmSettings.defaultRecoveryMaxDays ?? 35,
      hasActiveEvent: hasActive,
    }));
  }

  // Active / strip / linked maps
  const activeEvents = {};
  const linkedPaddocks = {};
  const stripInfo = {};
  for (const loc of locations) {
    const windows = allPaddockWindows.filter(w => w.locationId === loc.id && !w.dateClosed && !w.closedAt);
    if (windows.length > 0) {
      const window = windows[0];
      const event = allEvents.find(e => e.id === window.eventId);
      if (event && !event.dateOut) activeEvents[loc.id] = event;
      if (window.isStripGraze) {
        const stripWindows = allPaddockWindows.filter(w => w.stripGroupId === window.stripGroupId);
        stripInfo[loc.id] = {
          currentStrip: stripWindows.filter(w => w.closedAt || w.dateClosed).length + 1,
          totalStrips: stripWindows.length,
        };
      }
    }
    if (loc.linkedPaddockId) {
      const primary = locations.find(l => l.id === loc.linkedPaddockId);
      if (primary) linkedPaddocks[loc.id] = primary;
    }
  }

  const selectedGroups = state.groups
    .map(gId => allGroups.find(g => g.id === gId))
    .filter(Boolean)
    .map(g => ({ id: g.id, name: g.name }));

  const onUpdate = () => renderCalendarGrid(container, { onViewChange });
  const isList = state.view === 'list';

  const headerStrip = renderHeaderStrip({
    selectedGroups, period: state.period, onUpdate, onViewChange,
  });

  const periodBar = renderPeriodBar({ windowStart, windowEnd, onUpdate });
  // List = Locations tools + season metrics (La); Calendar keeps rotation toolbar.
  const toolbar = isList
    ? renderListTools({ onUpdate, operationId, farmId })
    : renderToolbar(onUpdate);
  // OI-0250 Sb: period totals under season metrics bar, above color key (Calendar only).
  const periodTotals = isList ? null : aggregatePeriodTotals(metricRows);
  const totalsStrip = periodTotals ? renderPeriodTotalsStrip(periodTotals) : null;
  const legend = isList ? null : renderLegend(viewMode);

  // OI-0254 Sc1: canvas = all past event starts → latest ready-by (close-event recovery).
  const eventStarts = [];
  for (const loc of locations) {
    for (const pw of allPaddockWindows) {
      if (pw.locationId !== loc.id) continue;
      const event = allEvents.find(e => e.id === pw.eventId);
      if (!event) continue;
      const startIso = getEventStartDate(event.id)
        || (pw.dateOpened ? String(pw.dateOpened).slice(0, 10) : null)
        || (event.dateIn ? String(event.dateIn).slice(0, 10) : null);
      if (startIso) eventStarts.push(startIso);
    }
  }
  const readyByDates = [];
  for (const loc of locations) {
    const band = readinessBandRange(readinessById.get(loc.id));
    if (band?.end) readyByDates.push(band.end);
  }
  const range = resolveCanvasRange({
    zoom: state.zoom,
    today,
    eventStarts,
    readyByDates,
  });
  const totalWidth = Math.max(4, dateToPx(range.end, range.start, range.pxPerDay));
  const now = parseTimelineDay(today) || new Date(`${today}T00:00:00`);
  const todayPx = dateToPx(now, range.start, range.pxPerDay);
  const metricsCollapsed = !isList && !!state.metricsCollapsed;

  // Sticky header row (outside vertical scroller)
  const sort = { key: state.sortKey || 'name', dir: state.sortDir || 'asc' };
  const head = renderTableHead({
    sort, onUpdate, isPhone, range, totalWidth, todayPx, zoom: state.zoom,
    omitTimeline: isList,
    metricsCollapsed,
  });

  // Single vertical scroll owner — F0
  const body = el('div', {
    className: VERTICAL_SCROLL_OWNER_CLASS,
    dataset: {
      testid: 'loc-mgmt-body',
      scrollOwner: 'vertical',
      overflowY: 'auto',
      architecture: describeScrollArchitecture().vertical,
      view: isList ? 'list' : 'calendar',
    },
    'data-scroll-owner': 'vertical',
    'data-overflow-y': 'auto',
  });

  const timelineScrollers = [];

  locations.forEach((loc) => {
    const metrics = metricsById.get(loc.id);
    const readiness = readinessById.get(loc.id);
    const row = renderManagementRow({
      loc,
      metrics,
      readiness,
      unitSystem,
      isPhone,
      range,
      totalWidth,
      todayPx,
      viewMode,
      selectedGroups,
      state,
      activeEvents,
      linkedPaddocks,
      stripInfo,
      allEvents,
      allPaddockWindows,
      allGroupWindows,
      allGroups,
      allMemberships,
      allAnimals,
      metricsForPast: metrics,
      omitTimeline: isList,
      isList,
      operationId,
      farmId,
      metricsCollapsed,
    });
    const ts = row.querySelector(`.${TIMELINE_SCROLL_CLASS}`);
    if (ts) timelineScrollers.push(ts);
    body.appendChild(row);
  });

  // Axis scroller at top of timeline column — sync with rows
  const axisScroller = head.querySelector(`.${TIMELINE_SCROLL_CLASS}`);
  if (axisScroller) timelineScrollers.unshift(axisScroller);

  const unsubH = bindHorizontalScrollSync(timelineScrollers);
  container._locMgmtUnsubH = unsubH;

  // Center today
  requestAnimationFrame(() => {
    const first = timelineScrollers[0];
    if (first) {
      const viewWidth = first.clientWidth || 300;
      const left = Math.max(0, todayPx - viewWidth / 2);
      for (const s of timelineScrollers) s.scrollLeft = left;
    }
  });

  const surface = el('div', {
    className: [
      'loc-mgmt',
      isList ? 'loc-mgmt--list' : '',
      isPhone ? 'loc-mgmt--phone' : 'loc-mgmt--desktop',
      metricsCollapsed ? 'loc-mgmt--metrics-collapsed' : '',
    ].filter(Boolean).join(' '),
    dataset: {
      testid: 'calendar-grid',
      view: isList ? 'list' : 'calendar',
      metricsCollapsed: metricsCollapsed ? '1' : '0',
    },
  }, [head, body]);

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    const first = timelineScrollers[0];
    if (!first) return;
    switch (e.key) {
      case 'ArrowLeft':
        first.scrollLeft -= e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
        break;
      case 'ArrowRight':
        first.scrollLeft += e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
        break;
      case 't':
      case 'T':
        if (!e.ctrlKey && !e.metaKey) {
          setJump('today');
          onUpdate();
        }
        break;
    }
  };

  container.appendChild(headerStrip);
  if (toolbar) container.appendChild(toolbar);
  container.appendChild(periodBar);
  if (totalsStrip) container.appendChild(totalsStrip);
  if (legend) container.appendChild(legend);
  container.appendChild(surface);
  // OI-0252 Wu: measure after attach so widest row (incl. partial markers) sets shared width.
  applyUniformMetricsWidth(surface);
  requestAnimationFrame(() => applyUniformMetricsWidth(surface));
  container.setAttribute('tabindex', '0');
  container.addEventListener('keydown', onKeyDown);
}

/** OI-0263 Lf-B+Ex1: View toggle + farm map (with Back/Close) inside Locations & Rotation. */
function renderMapView(container, { onViewChange } = {}) {
  const state = getCalendarState();
  const allGroups = getAll('groups');
  const selectedGroups = state.groups
    .map(gId => allGroups.find(g => g.id === gId))
    .filter(Boolean)
    .map(g => ({ id: g.id, name: g.name }));
  const onUpdate = () => renderCalendarGrid(container, { onViewChange });
  container.appendChild(renderHeaderStrip({
    selectedGroups, period: state.period, onUpdate, onViewChange,
  }));
  const host = el('div', {
    className: 'loc-mgmt-map',
    dataset: { testid: 'loc-mgmt-map-view', view: 'map' },
  });
  container.appendChild(host);
  renderFarmMapScreen(host).catch((err) => {
    logger.warn('map', 'Map view failed to load', { message: err?.message || String(err) });
  });
}

/**
 * La: Locations-parity tools for List mode (search, X1 type pills, Add/Map/Survey/…).
 * Calendar toolbar stays unchanged (Cb).
 */
function renderListTools({ onUpdate, operationId, farmId }) {
  const searchInput = el('input', {
    type: 'search',
    className: 'loc-mgmt__list-search',
    placeholder: 'Filter locations…',
    value: listSearchQuery,
    dataset: { testid: 'loc-mgmt-list-search' },
    'aria-label': 'Filter locations by name or field code',
  });
  searchInput.addEventListener('input', () => {
    listSearchQuery = searchInput.value;
    onUpdate();
  });

  const pill = (label, value) => el('button', {
    type: 'button',
    className: `btn btn-xs ${listLandUseFilter === value ? 'btn-green' : 'btn-outline'}`,
    dataset: { testid: `loc-mgmt-list-filter-${value}` },
    onClick: () => { listLandUseFilter = value; onUpdate(); },
  }, [label]);

  const filters = el('div', {
    className: 'loc-mgmt__list-filters',
    dataset: { testid: 'loc-mgmt-list-filters' },
  }, [
    pill('All', 'all'),
    pill('Pasture', 'pasture'),
    pill('Mixed-Use', 'mixed-use'),
  ]);

  const tools = el('div', {
    className: 'loc-mgmt__list-actions',
    dataset: { testid: 'loc-mgmt-list-tools' },
  }, [
    el('button', {
      type: 'button',
      className: 'btn btn-green btn-sm',
      onClick: () => openLocationSheet(null, operationId, farmId),
    }, ['+ Add']),
    // OI-0263 Tb1: Map launcher removed — Map is the third View (Calendar | List | Map).
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      onClick: () => openSurveySheet(null, operationId),
    }, ['\uD83D\uDCCB Survey']),
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      onClick: () => openHarvestSheet(operationId),
    }, ['\uD83C\uDF3E Harvest']),
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      onClick: () => openFeedTypesSheet(operationId),
    }, ['\u2699 Feed types']),
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      onClick: () => openAmendmentSheet(null, operationId),
    }, ['Apply input']),
  ]);

  return el('div', {
    className: 'loc-mgmt__list-toolbar',
    dataset: { testid: 'loc-mgmt-list-toolbar' },
  }, [
    el('div', { className: 'loc-mgmt__list-toolbar-row' }, [tools, searchInput]),
    el('div', { className: 'loc-mgmt__list-toolbar-row' }, [
      filters,
      el('span', { className: 'loc-mgmt__list-inputs-label' }, ['Inputs & amendments']),
    ]),
  ]);
}

function renderPeriodBar({ windowStart, windowEnd, onUpdate }) {
  const startInput = el('input', {
    type: 'date',
    className: 'loc-mgmt__period-input',
    value: windowStart,
    dataset: { testid: 'metric-window-start' },
    'aria-label': 'Metric window start',
    onChange: (e) => {
      setMetricWindow(e.target.value, windowEnd);
      onUpdate();
    },
  });
  const endInput = el('input', {
    type: 'date',
    className: 'loc-mgmt__period-input',
    value: windowEnd,
    dataset: { testid: 'metric-window-end' },
    'aria-label': 'Metric window end',
    onChange: (e) => {
      setMetricWindow(windowStart, e.target.value);
      onUpdate();
    },
  });
  const resetBtn = el('button', {
    type: 'button',
    className: 'toolbar__pill',
    dataset: { testid: 'metric-window-reset' },
    onClick: () => {
      setMetricWindow(null, null);
      onUpdate();
    },
  }, ['Season default']);

  return el('div', {
    className: 'loc-mgmt__period',
    dataset: { testid: 'metric-window-bar' },
  }, [
    el('span', { className: 'loc-mgmt__period-label' }, ['Season metrics:']),
    startInput,
    el('span', {}, ['–']),
    endInput,
    resetBtn,
    el('a', {
      href: '#/locations',
      className: 'loc-mgmt__link',
      onClick: (e) => { e.preventDefault(); navigate('#/locations'); },
    }, ['Locations · Surveys · Map']),
  ]);
}


/**
 * OI-0250 Sb: period totals strip — Pasture / Stored-feed / Total DMI + Total N/P/K.
 * Calendar only; sits under season metrics bar and above the color key.
 */
function renderPeriodTotalsStrip(totals) {
  const cell = (key, label, value, partial, title) => el('div', {
    className: `loc-mgmt__period-total${partial ? ' loc-mgmt__period-total--partial' : ''}`,
    title,
    dataset: {
      key,
      testid: `loc-mgmt-period-total-${key}`,
      partial: partial ? 'true' : undefined,
    },
  }, [
    el('span', { className: 'loc-mgmt__period-total-label' }, [label]),
    el('span', { className: 'loc-mgmt__period-total-value' }, [
      formatMetricValue(value, { digits: 0 }),
      partial
        ? el('span', {
          className: 'loc-mgmt__metric-partial',
          dataset: { testid: `loc-mgmt-period-total-partial-${key}` },
        }, [' partial'])
        : null,
    ].filter(Boolean)),
  ]);

  return el('div', {
    className: 'loc-mgmt__period-totals',
    dataset: { testid: 'loc-mgmt-period-totals' },
    role: 'region',
    'aria-label': 'Period totals for locations in view',
  }, [
    el('span', { className: 'loc-mgmt__period-totals-label' }, ['Period totals:']),
    cell('pastureDmi', 'Pasture DMI', totals.pastureDmiKg, !!totals.dmiPartial,
      'Implied pasture DMI for the period in view (kg)'),
    cell('storedDmi', 'Stored-feed DMI', totals.storedFeedDmiKg, false,
      'Measured stored-feed DMI eaten (kg); missing-DM counts as 0'),
    cell('totalDmi', 'Total DMI', totals.totalDmiKg, !!totals.dmiPartial,
      'Pasture DMI + stored-feed DMI for the period (kg)'),
    cell('n', 'Total N', totals.nKg, !!totals.npkPartial, 'Total nitrogen for the period (kg)'),
    cell('p', 'Total P', totals.pKg, !!totals.npkPartial, 'Total phosphorus for the period (kg)'),
    cell('k', 'Total K', totals.kKg, !!totals.npkPartial, 'Total potassium for the period (kg)'),
  ]);
}

function renderMetricsCollapseToggle({ collapsed, onUpdate }) {
  return el('button', {
    type: 'button',
    className: 'loc-mgmt__metrics-toggle',
    dataset: { testid: 'metrics-collapse-toggle', collapsed: collapsed ? '1' : '0' },
    title: collapsed ? 'Expand metrics column' : 'Collapse metrics column',
    'aria-expanded': collapsed ? 'false' : 'true',
    'aria-label': collapsed ? 'Expand metrics column' : 'Collapse metrics column',
    onClick: () => {
      toggleMetricsCollapsed();
      onUpdate();
    },
  }, [collapsed ? '▸ Metrics' : '▾ Metrics']);
}

function renderTableHead({
  sort, onUpdate, isPhone, range, totalWidth, todayPx, zoom,
  omitTimeline = false, metricsCollapsed = false,
}) {
  const nameBtn = sortHeaderButton('name', 'Name', sort, onUpdate);
  const metricBtns = METRIC_COLS.map(col => sortHeaderButton(col.key, col.label, sort, onUpdate, col.title));
  const metricBtnsByKey = new Map(METRIC_COLS.map((col, i) => [col.key, metricBtns[i]]));
  const collapseToggle = omitTimeline
    ? null
    : renderMetricsCollapseToggle({ collapsed: metricsCollapsed, onUpdate });

  if (omitTimeline) {
    if (isPhone) {
      return el('div', { className: 'loc-mgmt__head loc-mgmt__head--phone loc-mgmt__head--list' }, [
        el('div', { className: 'loc-mgmt__head-metrics' }, [
          nameBtn,
          renderMetricsHead(metricBtnsByKey, { grow: true }),
        ]),
      ]);
    }
    return el('div', { className: 'loc-mgmt__head loc-mgmt__head--desktop loc-mgmt__head--list' }, [
      el('div', { className: 'loc-mgmt__name-head', style: { width: `${NAME_WIDTH}px` } }, [nameBtn]),
      renderMetricsHead(metricBtnsByKey, { grow: true }),
      el('div', { className: 'loc-mgmt__list-actions-head', 'aria-hidden': 'true' }),
    ]);
  }

  const axis = buildAxis(range.start, range.end, zoom, range.pxPerDay, totalWidth);
  const todayLine = renderTodayLine(todayPx);
  const timelineHead = el('div', {
    className: TIMELINE_SCROLL_CLASS,
    dataset: { testid: 'timeline-axis-scroll' },
  }, [
    el('div', {
      className: 'loc-mgmt__timeline-inner',
      style: { width: `${totalWidth}px`, position: 'relative', height: '40px' },
    }, [axis, todayLine]),
  ]);

  const metricsHead = metricsCollapsed
    ? el('div', {
      className: 'loc-mgmt__metrics-head loc-mgmt__metrics-head--collapsed',
      dataset: { testid: 'loc-mgmt-metrics-head-collapsed' },
    }, [collapseToggle])
    : el('div', { className: 'loc-mgmt__metrics-head-wrap' }, [
      collapseToggle,
      renderMetricsHead(metricBtnsByKey),
    ]);

  if (isPhone) {
    return el('div', { className: 'loc-mgmt__head loc-mgmt__head--phone' }, [
      el('div', { className: 'loc-mgmt__head-metrics' }, [
        nameBtn,
        metricsHead,
      ]),
      el('div', { className: 'loc-mgmt__head-timeline' }, [timelineHead]),
    ]);
  }

  return el('div', { className: 'loc-mgmt__head loc-mgmt__head--desktop' }, [
    el('div', { className: 'loc-mgmt__name-head', style: { width: `${NAME_WIDTH}px` } }, [nameBtn]),
    metricsHead,
    el('div', { className: 'loc-mgmt__timeline-head' }, [timelineHead]),
  ]);
}

function sortHeaderButton(key, label, sort, onUpdate, title) {
  const active = sort.key === key;
  const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
  return el('button', {
    type: 'button',
    className: `loc-mgmt__sort${active ? ' loc-mgmt__sort--active' : ''}`,
    title: title || label,
    dataset: { testid: `sort-${key}` },
    onClick: () => {
      const next = nextSortState(sort, key);
      setSort(next.key, next.dir);
      onUpdate();
    },
  }, [`${label}${arrow}`]);
}

/**
 * OI-0261 Ml1 — month tick label: month name only ("Dec"); the year shows only on
 * January ("Jan 2027") so a month tick never reads like a day-of-month ("Dec 26").
 * @param {Date} date
 * @returns {string}
 */
export function monthTickLabel(date) {
  return date.getMonth() === 0
    ? date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : date.toLocaleDateString(undefined, { month: 'short' });
}

/** OI-0254 Tk1 — large=month start, medium=Saturday, small=other days. */
function buildAxis(start, end, zoom, pxPerDay, totalWidth) {
  const ticks = enumerateTicks(start, end);
  const nodes = [];
  for (const tick of ticks) {
    const leftPx = dateToPx(tick.date, start, pxPerDay);
    nodes.push(el('span', {
      className: `timeline-axis__tick timeline-axis__tick--${tick.kind}`,
      style: { left: `${leftPx}px` },
      dataset: { testid: `timeline-tick-${tick.kind}`, iso: tick.iso },
      'aria-hidden': 'true',
    }));
    // Labels: months always; Saturdays when zoom is day/week (room to read).
    const showLabel = tick.kind === 'month'
      || (tick.kind === 'saturday' && (zoom === 'day' || zoom === 'week'));
    if (showLabel) {
      const label = tick.kind === 'month'
        ? monthTickLabel(tick.date)
        : tick.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      nodes.push(el('span', {
        className: `timeline-axis__label timeline-axis__label--${tick.kind}`,
        style: { left: `${leftPx}px` },
      }, [label]));
    }
  }
  return el('div', {
    className: 'timeline-axis timeline-axis--top timeline-axis--ticks',
    style: { width: `${totalWidth}px`, position: 'relative' },
    dataset: { testid: 'timeline-axis-ticks' },
  }, nodes);
}

function renderManagementRow(opts) {
  const {
    loc, metrics, readiness, unitSystem, isPhone, range, totalWidth, todayPx,
    viewMode, selectedGroups, state, activeEvents, linkedPaddocks, stripInfo,
    allEvents, allPaddockWindows, allGroupWindows, allGroups, allMemberships, allAnimals,
    omitTimeline = false,
    isList = false,
    operationId = null,
    farmId = null,
    metricsCollapsed = false,
  } = opts;

  const areaDisplay = loc.areaHectares != null
    ? display(loc.areaHectares, 'area', unitSystem)
    : 'no acres';
  const status = statusTag(loc, activeEvents[loc.id], linkedPaddocks[loc.id], stripInfo[loc.id], readiness);
  const opId = operationId || loc.operationId;
  const fId = farmId || loc.farmId;

  // Cb: Calendar name-click still opens card edit. La: List name is not a button.
  const nameProps = {
    className: isList ? 'loc-mgmt__name loc-mgmt__name--static' : 'loc-mgmt__name',
    dataset: { testid: 'paddock-row', locationId: loc.id },
  };
  if (!isList) {
    nameProps.onClick = () => openLocationSheet(loc, opId, fId);
    nameProps.role = 'button';
    nameProps.tabindex = '0';
  }

  const typeBadge = isList
    ? el('span', {
      className: 'badge bg',
      style: { fontSize: '10px', marginLeft: '6px' },
    }, [loc.landUse || 'pasture'])
    : null;
  const codeLine = isList && loc.fieldCode
    ? el('div', { className: 'loc-mgmt__code' }, [loc.fieldCode])
    : null;

  const nameCell = el('div', nameProps, [
    el('div', { className: 'loc-mgmt__name-text' }, [
      loc.name,
      typeBadge,
    ].filter(Boolean)),
    codeLine,
    el('div', { className: 'loc-mgmt__area' }, [
      areaDisplay,
      metrics?.hasAcres ? '' : el('span', { className: 'loc-mgmt__no-acres' }, [' · no acres']),
    ].filter(Boolean)),
    status ? el('div', { className: 'loc-mgmt__tag' }, [status]) : null,
  ].filter(Boolean));

  const listActions = isList
    ? el('div', {
      className: 'loc-mgmt__row-actions',
      dataset: { testid: 'loc-mgmt-row-actions', locationId: loc.id },
    }, [
      el('button', {
        type: 'button',
        className: 'btn btn-outline btn-xs',
        dataset: { testid: 'loc-mgmt-edit' },
        onClick: (e) => { e.stopPropagation(); openLocationSheet(loc, opId, fId); },
      }, ['Edit']),
      el('button', {
        type: 'button',
        className: 'btn btn-outline btn-xs',
        dataset: { testid: 'loc-mgmt-survey' },
        onClick: (e) => { e.stopPropagation(); openSurveySheet(loc.id, opId); },
      }, ['\uD83D\uDCCB Survey']),
      el('button', {
        type: 'button',
        className: 'btn btn-outline btn-xs',
        dataset: { testid: 'loc-mgmt-soil' },
        onClick: (e) => { e.stopPropagation(); openSoilTestSheet(loc, opId); },
      }, ['\u270E Soil']),
    ])
    : null;

  const metricsForCell = metrics ? { ...metrics, locationId: loc.id } : { locationId: loc.id };
  const metricCell = metricsCollapsed
    ? el('div', {
      className: 'loc-mgmt__metrics loc-mgmt__metrics--collapsed',
      dataset: { testid: 'loc-mgmt-metrics-collapsed', locationId: loc.id },
      'aria-hidden': 'true',
    })
    : renderMetricsCell(metricsForCell, { isPhone });

  if (omitTimeline) {
    // Br: List action buttons on the right-hand side (original Locations list parity).
    if (isPhone) {
      return el('div', {
        className: 'loc-mgmt__row loc-mgmt__row--phone loc-mgmt__row--list',
        dataset: { testid: 'loc-mgmt-row', locationId: loc.id, view: 'list' },
        style: { minHeight: `${ROW_HEIGHT + 28}px` },
      }, [
        el('div', { className: 'loc-mgmt__list-top' }, [nameCell, listActions].filter(Boolean)),
        metricCell,
      ]);
    }
    return el('div', {
      className: 'loc-mgmt__row loc-mgmt__row--desktop loc-mgmt__row--list',
      dataset: { testid: 'loc-mgmt-row', locationId: loc.id, view: 'list' },
      style: { minHeight: `${ROW_HEIGHT}px`, height: 'auto' },
    }, [
      el('div', { className: 'loc-mgmt__name-wrap', style: { width: `${NAME_WIDTH}px`, flex: `0 0 ${NAME_WIDTH}px` } }, [nameCell]),
      metricCell,
      listActions,
    ].filter(Boolean));
  }

  // Timeline strip with past + future blocks
  const blockArea = el('div', {
    className: 'loc-mgmt__block-area',
    style: { width: `${totalWidth}px`, height: `${ROW_HEIGHT}px`, position: 'relative' },
  });

  const locWindows = allPaddockWindows.filter(w => w.locationId === loc.id);
  const m = metrics || {};

  for (const pw of locWindows) {
    const event = allEvents.find(e => e.id === pw.eventId);
    if (!event) continue;
    const eventStartDate = getEventStartDate(event.id);
    if (!eventStartDate) continue;
    const eventStart = new Date(eventStartDate + 'T00:00:00');
    const eventEnd = event.dateOut ? new Date(event.dateOut + 'T00:00:00') : new Date();
    if (eventEnd < range.start || eventStart > range.end) continue;

    const eventGroupWindows = allGroupWindows.filter(gw => gw.eventId === event.id && !gw.closedAt);
    const eventGroups = eventGroupWindows
      .map(gw => allGroups.find(g => g.id === gw.groupId))
      .filter(Boolean)
      .map(g => ({ id: g.id, name: g.name }));

    const days = daysBetweenInclusive(eventStartDate, event.dateOut || getLocalTodayStr());
    const isActive = !event.dateOut;
    const blockStart = new Date(Math.max(eventStart.getTime(), range.start.getTime()));
    const blockEnd = new Date(Math.min(eventEnd.getTime(), range.end.getTime()));
    const leftPx = dateToPx(blockStart, range.start, range.pxPerDay);
    const nowD = new Date();
    nowD.setHours(0, 0, 0, 0);

    if (blockStart < nowD) {
      const pastEnd = new Date(Math.min(blockEnd.getTime(), nowD.getTime()));
      const pastWidthPx = Math.max(4, dateToPx(pastEnd, range.start, range.pxPerDay) - leftPx);
      const strips = pw.isStripGraze && isActive
        ? allPaddockWindows.filter(w => w.stripGroupId === pw.stripGroupId).map(w => ({ areaPct: w.areaPct || 100 }))
        : [];
      const headCount = eventGroupWindows.reduce((s, gw) => {
        const nowStr = gw.dateLeft || event.dateOut || getLocalTodayStr();
        return s + getLiveWindowHeadCount(gw, { memberships: allMemberships, animals: allAnimals, now: nowStr });
      }, 0);

      // Wire real metrics into past block (OI-0253 B1: unknown → null → "—", not 0)
      // OI-0256: storedFeedOnly (no_pasture) is known Pasture 0 / Feed 100% / DMI 0.
      const audsLabel = m.audsKnown ? Math.round(m.auds) : null;
      const dmiKnownVal = m.dmiKnown && m.dmiKg != null;
      const dmiLabel = dmiKnownVal ? Math.round(m.dmiKg) : null;
      const storedFeedOnly = !!pw.noPasture;
      blockArea.appendChild(renderPastBlock({
        leftPx,
        widthPx: pastWidthPx,
        groups: eventGroups,
        auds: audsLabel != null ? audsLabel : 0,
        days,
        pasturePct: storedFeedOnly ? 0 : (dmiKnownVal ? (m.dmiKg > 0 ? 100 : 0) : null),
        feedPct: storedFeedOnly ? 100 : 0,
        dmi: storedFeedOnly ? 0 : dmiLabel,
        headCount,
        isActive,
        isStripGraze: pw.isStripGraze || false,
        strips,
        stripNote: null,
        isLinkedSecondary: !!linkedPaddocks[loc.id],
        linkedPrimaryName: linkedPaddocks[loc.id]?.name,
        storedFeedOnly,
        eventId: event.id,
        onClickBlock: () => openPastEventDetailSheet({ eventId: event.id, paddockWindowId: pw.id }),
      }));
    }
  }

  // OI-0254 Rd1: per-paddock close-event readiness band (earliest→latest), not Today→range.end.
  const nowD = parseTimelineDay(getLocalTodayStr()) || new Date();
  // Do not shadow the destructured `readiness` param (TDZ blank-screen crash).
  const readinessState = readiness || { mode: 'never' };
  const hasActiveEvent = !!activeEvents[loc.id];
  const isNeverGrazed = readinessState.mode === 'never';
  const band = readinessBandRange(readinessState);

  // Modest clip for never/active/forecast placeholders so they do not stretch to another paddock's ready-by.
  const stubEnd = new Date(nowD);
  stubEnd.setDate(stubEnd.getDate() + Math.max(14, defaultSpanDays(state.zoom || 'week')));
  if (stubEnd.getTime() > range.end.getTime()) stubEnd.setTime(range.end.getTime());

  // OI-0257 St1: never paint CAP-1 stub zeros (tan "0 lbs hay"); keep green readiness
  // where there is pasture. Real forecast capacity paint waits on Fx1 (parked).
  if (
    shouldPaintCap1ForecastStub({ viewMode, selectedGroups, period: state.period })
    && viewMode === 'forecast'
    && selectedGroups.length > 0
    && state.period != null
    && range.end > nowD
  ) {
    const futureLeftPx = dateToPx(nowD, range.start, range.pxPerDay);
    const futureWidthPx = Math.max(4, dateToPx(stubEnd, range.start, range.pxPerDay) - futureLeftPx);
    blockArea.appendChild(renderForecastFutureBlock({
      leftPx: Math.max(0, futureLeftPx),
      widthPx: futureWidthPx,
      ...CAP1_FORECAST_STUB,
      isNeverGrazed,
      isGrazingInProgress: hasActiveEvent,
      hayEstimateLbs: '?',
      locationId: loc.id,
      forageInactive: false,
      onClickBlock: (_id, action) => {
        if (action === 'survey') navigate('#/locations');
      },
    }));
  } else if (hasActiveEvent) {
    const futureLeftPx = dateToPx(nowD, range.start, range.pxPerDay);
    const futureWidthPx = Math.max(4, dateToPx(stubEnd, range.start, range.pxPerDay) - futureLeftPx);
    blockArea.appendChild(renderEstimatedFutureBlock({
      leftPx: Math.max(0, futureLeftPx),
      widthPx: futureWidthPx,
      minDate: '',
      maxDate: '',
      confidence: 'min',
      isNeverGrazed: false,
      isGrazingInProgress: true,
      hayEstimateLbs: '?',
      locationId: loc.id,
      forageInactive: false,
      onClickBlock: () => {},
    }));
  } else if (isNeverGrazed) {
    const futureLeftPx = dateToPx(nowD, range.start, range.pxPerDay);
    const futureWidthPx = Math.max(4, dateToPx(stubEnd, range.start, range.pxPerDay) - futureLeftPx);
    blockArea.appendChild(renderEstimatedFutureBlock({
      leftPx: Math.max(0, futureLeftPx),
      widthPx: futureWidthPx,
      minDate: '',
      maxDate: '',
      confidence: 'min',
      isNeverGrazed: true,
      isGrazingInProgress: false,
      hayEstimateLbs: '?',
      locationId: loc.id,
      forageInactive: false,
      onClickBlock: (_id, action) => {
        if (action === 'survey') navigate('#/locations');
      },
    }));
  } else if (band) {
    const bandStart = parseTimelineDay(band.start);
    const bandEnd = parseTimelineDay(band.end);
    if (bandStart && bandEnd && bandEnd >= range.start && bandStart <= range.end) {
      const clipStart = new Date(Math.max(bandStart.getTime(), range.start.getTime()));
      const clipEnd = new Date(Math.min(bandEnd.getTime(), range.end.getTime()));
      const leftPx = dateToPx(clipStart, range.start, range.pxPerDay);
      const widthPx = Math.max(4, dateToPx(clipEnd, range.start, range.pxPerDay) - leftPx);
      blockArea.appendChild(renderEstimatedFutureBlock({
        leftPx: Math.max(0, leftPx),
        widthPx,
        minDate: formatShort(band.start),
        maxDate: formatShort(band.end),
        confidence: readinessState.confidence || 'min',
        label: readinessState.label || '',
        isNeverGrazed: false,
        isGrazingInProgress: false,
        hayEstimateLbs: '?',
        locationId: loc.id,
        forageInactive: false,
        onClickBlock: (_id, action) => {
          if (action === 'survey') navigate('#/locations');
        },
      }));
    }
  } else if (readinessState.mode === 'relative') {
    // Relative: label near Today — no shared Today→range.end green wash.
    const leftPx = Math.max(0, dateToPx(nowD, range.start, range.pxPerDay));
    blockArea.appendChild(el('div', {
      className: 'future-block future-block--relative-only',
      style: { left: `${leftPx}px`, width: 'auto', minWidth: '120px' },
      dataset: { testid: 'readiness-relative', locationId: loc.id },
    }, [
      el('span', { className: 'future-block__relative' }, [readinessState.label || '']),
    ]));
  }

  const timelineScroll = el('div', {
    className: TIMELINE_SCROLL_CLASS,
    dataset: { testid: 'timeline-scroll', locationId: loc.id },
  }, [
    el('div', {
      className: 'loc-mgmt__timeline-inner',
      style: { width: `${totalWidth}px`, position: 'relative' },
    }, [blockArea, renderTodayLine(todayPx)]),
  ]);

  if (isPhone) {
    return el('div', {
      className: 'loc-mgmt__row loc-mgmt__row--phone',
      dataset: { testid: 'loc-mgmt-row', locationId: loc.id },
      style: { minHeight: `${ROW_HEIGHT + 48}px` },
    }, [
      nameCell,
      metricCell,
      timelineScroll,
    ]);
  }

  return el('div', {
    className: 'loc-mgmt__row loc-mgmt__row--desktop',
    dataset: { testid: 'loc-mgmt-row', locationId: loc.id },
    style: { minHeight: `${ROW_HEIGHT}px`, height: 'auto' },
  }, [
    el('div', { className: 'loc-mgmt__name-wrap', style: { width: `${NAME_WIDTH}px`, flex: `0 0 ${NAME_WIDTH}px` } }, [nameCell]),
    metricCell,
    el('div', { className: 'loc-mgmt__timeline-wrap' }, [timelineScroll]),
  ]);
}

function statusTag(loc, activeEvent, linked, strip, readiness) {
  if (linked) return `Linked to ${linked.name}`;
  if (activeEvent && strip) return `● Active · strip ${strip.currentStrip}/${strip.totalStrips}`;
  if (activeEvent) return '● Active';
  if (readiness?.mode === 'never') return 'Never grazed';
  if (readiness?.mode === 'relative') return readiness.label;
  if (readiness?.mode === 'survey') return readiness.label;
  return '';
}

function formatShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderEmptyState() {
  return el('div', {
    className: 'calendar-empty',
    dataset: { testid: 'calendar-empty' },
  }, [
    el('h2', {}, ['No pasture locations yet']),
    el('p', {}, ['Add pasture or mixed-use locations to manage rotations and season metrics.']),
    el('button', {
      className: 'btn btn--primary',
      onClick: () => navigate('#/locations'),
      type: 'button',
    }, ['+ Add location']),
  ]);
}
