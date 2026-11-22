/**
 * @file Locations + rotation management surface.
 * Single vertical scroll owner (F0): name | sortable metrics | timeline (C1).
 * Phone: metrics under name; timeline scrolls horizontally (P1).
 * X1 pasture+mixed-use; W1 season window; T0 readiness; D0 compute-on-read.
 */

import { el, clear } from '../../../ui/dom.js';
import { getAll } from '../../../data/store.js';
import {
  getCalendarState, getViewMode, setJump, setMetricWindow, setSort,
} from '../calendar-state.js';
import { getUnitSystem } from '../../../utils/preferences.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../../utils/date-utils.js';
import { display } from '../../../utils/units.js';
import { navigate } from '../../../ui/router.js';
import { openLocationSheet } from '../../locations/index.js';
import { getEventStartDate } from '../event-start.js';
import { getLiveWindowHeadCount } from '../../../calcs/window-helpers.js';
import { resolveRange, dateToPx } from './timeline.js';
import { renderPastBlock } from './past-block.js';
import { renderEstimatedFutureBlock, renderForecastFutureBlock } from './future-block.js';
import { renderHeaderStrip } from './header-strip.js';
import { renderToolbar } from './toolbar.js';
import { renderLegend } from './legend.js';
import { renderTodayLine } from './today-line.js';
import {
  filterManagementLocations,
  defaultMetricWindow,
  computeLocationMetrics,
  formatMetricValue,
} from './location-metrics.js';
import { computeReadiness, lastGrazeDate } from './readiness.js';
import { sortMetricRows, nextSortState } from './sort-rows.js';
import {
  VERTICAL_SCROLL_OWNER_CLASS,
  TIMELINE_SCROLL_CLASS,
  bindHorizontalScrollSync,
  describeScrollArchitecture,
} from './scroll-owner.js';

const ROW_HEIGHT = 72;
const NAME_WIDTH = 160;
const METRIC_COLS = [
  { key: 'dmiKg', label: 'DMI', title: 'Implied pasture DMI (kg)' },
  { key: 'auds', label: 'AUDs', title: 'Animal Unit Days' },
  { key: 'nKg', label: 'N', title: 'Nitrogen deposited (kg)' },
  { key: 'pKg', label: 'P', title: 'Phosphorus deposited (kg)' },
  { key: 'kKg', label: 'K', title: 'Potassium deposited (kg)' },
  { key: 'avgScore', label: 'Score', title: 'Average pasture score' },
];

/**
 * Render the locations + rotation management surface.
 * @param {HTMLElement} container
 */
export function renderCalendarGrid(container, { onViewChange } = {}) {
  clear(container);

  const state = getCalendarState();
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
  const farmSettings = getAll('farmSettings')[0] || {};

  // X1 filter (pasture + mixed-use). Optional confinement toggle ignored for X1 surface.
  let locations = filterManagementLocations(allLocations);
  if (!locations.length) {
    container.appendChild(renderEmptyState());
    return;
  }

  const defaultWin = defaultMetricWindow(today);
  const windowStart = state.metricStart || defaultWin.start;
  const windowEnd = state.metricEnd || defaultWin.end;

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
  // List = same X1 rows + agreed metrics; timeline omitted (C1/P1 should-fix).
  const toolbar = isList ? null : renderToolbar(onUpdate);
  const legend = isList ? null : renderLegend(viewMode);

  const range = resolveRange(state.anchor, state.zoom);
  const totalWidth = Math.max(4, dateToPx(range.end, range.start, range.pxPerDay));
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const todayPx = dateToPx(now, range.start, range.pxPerDay);

  // Sticky header row (outside vertical scroller)
  const sort = { key: state.sortKey || 'name', dir: state.sortDir || 'asc' };
  const head = renderTableHead({
    sort, onUpdate, isPhone, range, totalWidth, todayPx, zoom: state.zoom,
    omitTimeline: isList,
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
    className: `loc-mgmt${isList ? ' loc-mgmt--list' : ''}${isPhone ? ' loc-mgmt--phone' : ' loc-mgmt--desktop'}`,
    dataset: { testid: 'calendar-grid', view: isList ? 'list' : 'calendar' },
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
  if (legend) container.appendChild(legend);
  container.appendChild(surface);
  container.setAttribute('tabindex', '0');
  container.addEventListener('keydown', onKeyDown);
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

function renderTableHead({ sort, onUpdate, isPhone, range, totalWidth, todayPx, zoom, omitTimeline = false }) {
  const nameBtn = sortHeaderButton('name', 'Name', sort, onUpdate);
  const metricBtns = METRIC_COLS.map(col => sortHeaderButton(col.key, col.label, sort, onUpdate, col.title));

  if (omitTimeline) {
    if (isPhone) {
      return el('div', { className: 'loc-mgmt__head loc-mgmt__head--phone loc-mgmt__head--list' }, [
        el('div', { className: 'loc-mgmt__head-metrics' }, [nameBtn, ...metricBtns]),
      ]);
    }
    return el('div', { className: 'loc-mgmt__head loc-mgmt__head--desktop loc-mgmt__head--list' }, [
      el('div', { className: 'loc-mgmt__name-head', style: { width: `${NAME_WIDTH}px` } }, [nameBtn]),
      el('div', { className: 'loc-mgmt__metrics-head loc-mgmt__metrics-head--grow' }, metricBtns),
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

  if (isPhone) {
    return el('div', { className: 'loc-mgmt__head loc-mgmt__head--phone' }, [
      el('div', { className: 'loc-mgmt__head-metrics' }, [nameBtn, ...metricBtns]),
      el('div', { className: 'loc-mgmt__head-timeline' }, [timelineHead]),
    ]);
  }

  return el('div', { className: 'loc-mgmt__head loc-mgmt__head--desktop' }, [
    el('div', { className: 'loc-mgmt__name-head', style: { width: `${NAME_WIDTH}px` } }, [nameBtn]),
    el('div', { className: 'loc-mgmt__metrics-head' }, metricBtns),
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

function buildAxis(start, end, zoom, pxPerDay, totalWidth) {
  const labels = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const leftPx = dateToPx(cursor, start, pxPerDay);
    let label;
    if (zoom === 'day') {
      label = cursor.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      cursor.setDate(cursor.getDate() + 1);
    } else if (zoom === 'week') {
      label = cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      cursor.setDate(cursor.getDate() + 7);
    } else if (zoom === 'month') {
      label = cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      label = cursor.toLocaleDateString(undefined, { month: 'short' });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    labels.push(el('span', {
      className: 'timeline-axis__label',
      style: { left: `${leftPx}px` },
    }, [label]));
  }
  return el('div', {
    className: 'timeline-axis timeline-axis--top',
    style: { width: `${totalWidth}px`, position: 'relative' },
  }, labels);
}

function renderManagementRow(opts) {
  const {
    loc, metrics, readiness, unitSystem, isPhone, range, totalWidth, todayPx,
    viewMode, selectedGroups, state, activeEvents, linkedPaddocks, stripInfo,
    allEvents, allPaddockWindows, allGroupWindows, allGroups, allMemberships, allAnimals,
    omitTimeline = false,
  } = opts;

  const areaDisplay = loc.areaHectares != null
    ? display(loc.areaHectares, 'area', unitSystem)
    : 'no acres';
  const status = statusTag(loc, activeEvents[loc.id], linkedPaddocks[loc.id], stripInfo[loc.id], readiness);

  const nameCell = el('div', {
    className: 'loc-mgmt__name',
    dataset: { testid: 'paddock-row', locationId: loc.id },
    onClick: () => openLocationSheet(loc, loc.operationId, loc.farmId),
    role: 'button',
    tabindex: '0',
  }, [
    el('div', { className: 'loc-mgmt__name-text' }, [loc.name]),
    el('div', { className: 'loc-mgmt__area' }, [
      areaDisplay,
      metrics?.hasAcres ? '' : el('span', { className: 'loc-mgmt__no-acres' }, [' · no acres']),
    ].filter(Boolean)),
    status ? el('div', { className: 'loc-mgmt__tag' }, [status]) : null,
  ].filter(Boolean));

  const metricCell = el('div', {
    className: 'loc-mgmt__metrics',
    dataset: { testid: 'loc-mgmt-metrics', locationId: loc.id },
  }, METRIC_COLS.map(col => {
    const raw = metrics?.[col.key];
    const text = formatMetricValue(raw, { digits: col.key === 'avgScore' ? 0 : 0 });
    const perAcreKey = col.key === 'dmiKg' ? 'dmiPerAcre'
      : col.key === 'auds' ? 'audsPerAcre'
      : col.key === 'nKg' ? 'nPerAcre'
      : col.key === 'pKg' ? 'pPerAcre'
      : col.key === 'kKg' ? 'kPerAcre'
      : null;
    const perAcre = perAcreKey ? metrics?.[perAcreKey] : null;
    const perAcreText = perAcre != null && metrics?.hasAcres
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
  }));

  if (omitTimeline) {
    if (isPhone) {
      return el('div', {
        className: 'loc-mgmt__row loc-mgmt__row--phone loc-mgmt__row--list',
        dataset: { testid: 'loc-mgmt-row', locationId: loc.id, view: 'list' },
        style: { minHeight: `${ROW_HEIGHT}px` },
      }, [nameCell, metricCell]);
    }
    metricCell.classList.add('loc-mgmt__metrics--grow');
    return el('div', {
      className: 'loc-mgmt__row loc-mgmt__row--desktop loc-mgmt__row--list',
      dataset: { testid: 'loc-mgmt-row', locationId: loc.id, view: 'list' },
      style: { height: `${ROW_HEIGHT}px` },
    }, [
      el('div', { className: 'loc-mgmt__name-wrap', style: { width: `${NAME_WIDTH}px`, flex: `0 0 ${NAME_WIDTH}px` } }, [nameCell]),
      metricCell,
    ]);
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

      // Wire real metrics into past block (retire zeros)
      const audsLabel = m.audsKnown ? Math.round(m.auds) : null;
      const dmiLabel = m.dmiKnown && m.dmiKg != null ? Math.round(m.dmiKg) : null;
      blockArea.appendChild(renderPastBlock({
        leftPx,
        widthPx: pastWidthPx,
        groups: eventGroups,
        auds: audsLabel != null ? audsLabel : 0,
        days,
        pasturePct: m.dmiKnown && m.dmiKg != null && m.dmiKg > 0 ? 100 : 0,
        feedPct: 0,
        dmi: dmiLabel != null ? dmiLabel : 0,
        headCount,
        isActive,
        isStripGraze: pw.isStripGraze || false,
        strips,
        stripNote: null,
        isLinkedSecondary: !!linkedPaddocks[loc.id],
        linkedPrimaryName: linkedPaddocks[loc.id]?.name,
        eventId: event.id,
        onClickBlock: () => navigate('#/events'),
      }));
    }
  }

  // Future readiness block
  const nowD = new Date();
  nowD.setHours(0, 0, 0, 0);
  if (range.end > nowD) {
    const futureLeftPx = dateToPx(nowD, range.start, range.pxPerDay);
    const futureWidthPx = Math.max(4, dateToPx(range.end, range.start, range.pxPerDay) - futureLeftPx);
    // Do not shadow the destructured `readiness` param (TDZ blank-screen crash).
    const readinessState = readiness || { mode: 'never' };
    const hasActiveEvent = !!activeEvents[loc.id];
    const isNeverGrazed = readinessState.mode === 'never';

    if (viewMode === 'forecast' && selectedGroups.length > 0 && state.period != null) {
      blockArea.appendChild(renderForecastFutureBlock({
        leftPx: Math.max(0, futureLeftPx),
        widthPx: futureWidthPx,
        coverageFraction: 0,
        coversHours: 0,
        shortfallLbsHay: 0,
        surplusHours: 0,
        isNeverGrazed,
        isGrazingInProgress: hasActiveEvent,
        hayEstimateLbs: '?',
        locationId: loc.id,
        forageInactive: false,
        onClickBlock: (_id, action) => {
          if (action === 'survey') navigate('#/locations');
        },
      }));
    } else {
      const fb = renderEstimatedFutureBlock({
        leftPx: Math.max(0, futureLeftPx),
        widthPx: futureWidthPx,
        minDate: readinessState.earliestReturn
          ? formatShort(readinessState.earliestReturn)
          : (readinessState.mode === 'relative' ? readinessState.label : ''),
        maxDate: readinessState.windowCloses ? formatShort(readinessState.windowCloses) : '',
        confidence: readinessState.confidence || 'min',
        isNeverGrazed,
        isGrazingInProgress: hasActiveEvent,
        hayEstimateLbs: '?',
        locationId: loc.id,
        forageInactive: false,
        onClickBlock: (_id, action) => {
          if (action === 'survey') navigate('#/locations');
        },
      });
      // Relative-mode label overlay when no survey ticks
      if (readinessState.mode === 'relative' && !hasActiveEvent) {
        fb.appendChild(el('span', {
          className: 'future-block__relative',
          dataset: { testid: 'readiness-relative' },
        }, [readinessState.label]));
      }
      blockArea.appendChild(fb);
    }
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
    style: { height: `${ROW_HEIGHT}px` },
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
