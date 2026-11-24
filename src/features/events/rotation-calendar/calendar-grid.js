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
import { inMetricsPass, memoByStoreVersion } from '../../../calcs/metrics-memo.js';
import {
  getCalendarState, getViewMode, setJump, setMetricWindow, setSort,
  toggleMetricsCollapsed,
} from '../calendar-state.js';
import { getUnitSystem } from '../../../utils/preferences.js';
import { getLocalTodayStr } from '../../../utils/date-utils.js';
import { formatShortDate } from '../../../utils/date-format.js';
import { formatMeasure, formatPerArea, unitSuffix, shortUnit } from '../../../utils/units.js';
import { navigate } from '../../../ui/router.js';
import {
  openLocationSheet,
  openSurveySheet,
  openFeedTypesSheet,
  openSoilTestSheet,
  buildLocationCard,
} from '../../locations/index.js';
import { t } from '../../../i18n/i18n.js';
import { openHarvestSheet } from '../../harvest/index.js';
import { landUseLabel } from '../../locations/land-use-label.js';
import { openAmendmentSheet } from '../../amendments/entry.js';
import { getEventStartDate } from '../event-start.js';
import {
  pastWindowSpan, headCountAtWindowEnd, computePaddockWindowMetrics, eventConnectors,
  headRangeInWindow, formatHeadRange,
} from './past-window.js';
import {
  resolveCanvasRange, dateToPx, enumerateTicks, defaultSpanDays, parseTimelineDay,
} from './timeline.js';
import { renderPastBlock, pastBlockHoverLines } from './past-block.js';
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
  residualNpkNote,
  earliestGroupWindowDate,
  periodStartsBeforeFirstGroupWindow,
} from './location-metrics.js';
import { computeReadiness, lastGrazeDate, readinessBandRange, readyChipKind, READY_CHIP_TEXT } from './readiness.js';
import { sortMetricRows, nextSortState } from './sort-rows.js';
import {
  SCROLL_OWNER_CLASS,
  TIMELINE_CLASS,
  AXIS_CLASS,
  describeScrollArchitecture,
} from './scroll-owner.js';
import { createScrollRail } from './scroll-rail.js';
import { fertilizerCellHover, NPK_ELEMENTAL_HEADING } from '../../../calcs/fertilizer-equivalents.js';
import {
  resolveFarmSeason, formatFarmSeason, validateFarmSeason, MONTH_SHORT,
} from '../../../calcs/farm-season.js';
import {
  areFarmSeasonSettingsReleased, updateFarmSeasonSettings,
} from '../../settings/farm-season-settings.js';

const ROW_HEIGHT = 72;
/** #443: id of the single scroller (the rail's aria-controls target). */
export const SCROLL_BODY_ID = 'loc-mgmt-scroller';
const NAME_WIDTH = 160;
/** List-mode inventory filters (session memory; not Pb). */
let listSearchQuery = '';
// OI-0265 Lg1: legacy six — all | pasture | mixed-use | crop | confinement | storage
let listLandUseFilter = 'all';
let listFarmFilter = 'all'; // OI-0265 Lg1: multi-farm only (legacy farm pills)
/** #402: "Farm default…" inline editor open (session memory) + one-shot saved note. */
let farmSeasonEditorOpen = false;
let farmSeasonSavedNote = false;

/**
 * OI-0278 S1: metric columns in the farm's unit system. `label` is the short
 * in-cell label; `head` is the sort-header text carrying the unit ("DMI (lb)");
 * `title` is the tooltip with the unit. Values in the cells are numbers only
 * (unit in header); per-area parentheticals carry their full unit.
 * Keys stay the OI-0274 ids (deep links / stored sort) — see sort-rows SORT_FIELD.
 * @param {'metric'|'imperial'} [unitSystem]
 */
export function metricCols(unitSystem = getUnitSystem()) {
  const us = unitSystem === 'metric' ? 'metric' : 'imperial';
  const w = unitSuffix('weight', us); // "(lb)" | "(kg)"
  const area = shortUnit('area', us); // "ac" | "ha"
  const perArea = shortUnit('weight', us, { perArea: true }); // "lb/ac" | "kg/ha"
  const areaWord = us === 'metric' ? 'hectare' : 'acre';
  return [
    { key: 'dmiKg', label: 'DMI', head: `DMI ${w}`, title: `Implied pasture DMI ${w}`, family: 'weight' },
    // OI-0274 Dl1: DMI per area is its own metric + sort button, right of DMI.
    {
      key: 'dmiPerAcre',
      label: `DMI/${area}`,
      head: `DMI/${area} ${w}`,
      title: `Implied pasture DMI per ${areaWord} (${perArea}); no area shows —`,
      family: 'weight',
    },
    { key: 'auds', label: 'AUDs', head: 'AUDs', title: 'Animal Unit Days', family: null },
    // #462: narrow heads keep N/P/K; the elemental wording goes in the title.
    { key: 'nKg', label: 'N', head: `N ${w}`, title: `Nitrogen deposited, elemental ${w}`, family: 'npk' },
    { key: 'pKg', label: 'P', head: `P ${w}`, title: `Phosphorus deposited, elemental ${w}`, family: 'npk' },
    { key: 'kKg', label: 'K', head: `K ${w}`, title: `Potassium deposited, elemental ${w}`, family: 'npk' },
    { key: 'avgScore', label: 'Score', head: 'Score', title: 'Average pasture score', family: null },
  ];
}

/** OI-0252 Ls: line 1 = DMI · DMI/ac (OI-0274) · AUDs; line 2 = N · P · K · Score. */
const METRIC_LINE1_KEYS = ['dmiKg', 'dmiPerAcre', 'auds'];
const metricLine1 = (cols) => cols.filter(c => METRIC_LINE1_KEYS.includes(c.key));
const metricLine2 = (cols) => cols.filter(c => !METRIC_LINE1_KEYS.includes(c.key));

/**
 * OI-0252 Wu: one uniform content width from the widest rendered metrics block
 * on this surface (after format + partial markers + per-acre text).
 * #464: the head and the rows must build the SAME metrics-column width so the
 * date axis starts where the row timelines start.
 * - Expanded: the head's `.loc-mgmt__metrics-head-wrap` (toggle + inner head,
 *   with its own border) is sized, not just the inner head; the inner head
 *   stretches inside it (its border is dropped in CSS).
 * - Collapsed: the head tab (toggle + OI-0274 sort note) sets the width and each
 *   row's empty sticky placeholder takes the same width (was display:none → 0).
 * @param {ParentNode} root
 */
export function applyUniformMetricsWidth(root) {
  if (!root) return 0;
  const measure = (node) => Math.ceil(Math.max(node.offsetWidth || 0, node.scrollWidth || 0));
  const reset = (node) => { node.style.width = 'auto'; node.style.minWidth = ''; };
  const setWidth = (node, w) => { node.style.width = `${w}px`; node.style.minWidth = `${w}px`; };
  const collapsed = !!(root.classList?.contains('loc-mgmt--metrics-collapsed')
    || root.closest?.('.loc-mgmt--metrics-collapsed'));
  if (collapsed) {
    const tabs = [...root.querySelectorAll('.loc-mgmt__metrics-head--collapsed')];
    const placeholders = [...root.querySelectorAll('[data-testid="loc-mgmt-metrics-collapsed"]')];
    if (!tabs.length) return 0;
    for (const node of [...tabs, ...placeholders]) reset(node);
    let tabMax = 0;
    for (const node of tabs) tabMax = Math.max(tabMax, measure(node));
    if (tabMax <= 0) return 0;
    for (const node of [...tabs, ...placeholders]) setWidth(node, tabMax);
    return tabMax;
  }
  const cells = [...root.querySelectorAll('[data-testid="loc-mgmt-metrics"]')];
  const wraps = [...root.querySelectorAll('.loc-mgmt__metrics-head-wrap')];
  const allHeads = [...root.querySelectorAll('.loc-mgmt__metrics-head')]
    .filter(h => !h.classList.contains('loc-mgmt__metrics-head--collapsed'));
  const innerHeads = allHeads.filter(h => h.parentElement?.classList?.contains('loc-mgmt__metrics-head-wrap'));
  const soloHeads = allHeads.filter(h => !innerHeads.includes(h));
  for (const node of [...cells, ...wraps, ...allHeads]) reset(node);
  let max = 0;
  for (const node of [...cells, ...wraps, ...allHeads]) max = Math.max(max, measure(node));
  // Inner heads stretch inside their wrap (no inline width of their own).
  for (const node of innerHeads) { node.style.width = ''; node.style.minWidth = ''; }
  if (max <= 0) return 0;
  for (const node of [...cells, ...wraps, ...soloHeads]) setWidth(node, max);
  return max;
}

/**
 * OI-0274: the ONE place the DMI/ac value is formatted. OI-0278: via the shared
 * helper from canonical kg/ha → lb/ac (imperial) or kg/ha (metric); the unit
 * sits in the header ("DMI/ac (lb)"). No area or unknown DMI → "—" (OI-0253 style).
 * @param {object|null|undefined} metrics
 * @param {{ unitSystem?: 'metric'|'imperial', compact?: boolean }} [opts]
 * @returns {string}
 */
export function formatDmiPerAcre(metrics, { unitSystem, compact = false } = {}) {
  if (!metrics?.hasArea) return '—';
  return formatPerArea(metrics?.dmiPerHa, 'weight', { unitSystem, compact, unitInHeader: true });
}

/** OI-0278: per-area field + family behind each metric's "(x lb/ac)" parenthetical. */
const PER_AREA_OF = {
  auds: { field: 'audsPerHa', family: 'count' },
  nKg: { field: 'nPerHa', family: 'npk' },
  pKg: { field: 'pPerHa', family: 'npk' },
  kKg: { field: 'kPerHa', family: 'npk' },
};

/**
 * @param {object} col
 * @param {object|null|undefined} metrics
 * @param {{ includePerAcre?: boolean }} [opts]
 */
function renderMetricCol(col, metrics, { includePerAcre = true, compact = false, unitSystem } = {}) {
  const raw = metrics?.[col.key];
  // OI-0274 Dp1: DMI/ac is a metric of its own and shows on phone too.
  // OI-0278 S1: unit-bearing values via the shared helper (unit in the header);
  // Na compact ("12.3k") on phone only. AUDs / Score are not unit-bound.
  const text = col.key === 'dmiPerAcre'
    ? formatDmiPerAcre(metrics, { unitSystem, compact })
    : col.family
      ? formatMeasure(raw, col.family, { unitSystem, compact, unitInHeader: true })
      : formatMetricValue(raw, { digits: 0 });
  // OI-0274 Do0: DMI no longer carries a "(x/ac)" suffix; AUDs/N/P/K keep theirs.
  const perArea = PER_AREA_OF[col.key] || null;
  const perAreaVal = perArea ? metrics?.[perArea.field] : null;
  // Nn: drop per-acre parentheticals on phone before shortening digits.
  const perAcreText = includePerAcre && perAreaVal != null && metrics?.hasArea
    ? ` (${formatPerArea(perAreaVal, perArea.family, { unitSystem })})`
    : '';
  const isPartial = (col.key === 'dmiKg' && metrics?.dmiPartial)
    || ((col.key === 'nKg' || col.key === 'pKg' || col.key === 'kKg') && metrics?.npkPartial);
  // OI-0285: partial reason names weights only when weights caused it.
  const dmiWeightReason = col.key !== 'dmiKg' || metrics?.dmiWeightUnknown !== false;
  const baseTitle = isPartial
    ? `${col.title} (partial${dmiWeightReason ? ' — some groups missing weights' : ''})`
    : col.title;
  // OI-0276: leftover hay without NPK % / weight / DM adds 0 — subtle hover note only.
  const isNpk = col.key === 'nKg' || col.key === 'pKg' || col.key === 'kKg';
  const hayNote = isNpk ? residualNpkNote(metrics) : null;
  // OI-0279: name any per-class DMI % fallback on the DMI cells.
  const isDmi = col.key === 'dmiKg' || col.key === 'dmiPerAcre';
  const basisNote = isDmi ? metrics?.dmiBasisNote || null : null;
  // OI-0285: hay never measured (missing unit, or a closed event) is not counted (Zp).
  const dmiHayNote = isDmi && metrics?.dmiHayUnknown ? t('event.dmiHayNotCounted') : null;
  // OI-0285 B: open event, no feed check since the feed went out — hay 0 estimate,
  // shown with the ~ marker and "Feed check needed" (DMI and DMI/area alike).
  const feedCheckNeeded = isDmi && !!metrics?.dmiFeedCheckNeeded && text !== '—';
  const checkNote = feedCheckNeeded ? t('event.dmiFeedCheckNeeded') : null;
  const shownText = feedCheckNeeded ? `~${text}` : text;
  // #462 (Design 1610): P cell → P₂O₅, K cell → K₂O hover (same unit + rounding); N none.
  const fertNote = col.key === 'pKg' || col.key === 'kKg'
    ? fertilizerCellHover(col.key === 'pKg' ? 'p' : 'k', raw, { unitSystem })
    : null;
  const title = [baseTitle, hayNote, checkNote, dmiHayNote, basisNote, fertNote].filter(Boolean).join('. ');
  return el('div', {
    className: `loc-mgmt__metric${isPartial ? ' loc-mgmt__metric--partial' : ''}`,
    title,
    dataset: {
      key: col.key,
      partial: isPartial ? 'true' : undefined,
      ...(hayNote ? { residualNote: 'true' } : {}),
      ...(basisNote ? { dmiBasisNote: 'true' } : {}),
      ...(dmiHayNote ? { dmiHayNote: 'true' } : {}),
      ...(feedCheckNeeded ? { feedCheckNeeded: 'true' } : {}),
      ...(fertNote ? { fertilizerHover: 'true' } : {}),
    },
  }, [
    el('span', {
      className: `loc-mgmt__metric-label${col.key === 'dmiPerAcre' ? ' loc-mgmt__metric-label--per-acre' : ''}`,
    }, [col.label]),
    el('span', { className: 'loc-mgmt__metric-value' }, [
      `${shownText}${perAcreText}`,
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
function renderMetricsCell(metrics, { isPhone = false, unitSystem = getUnitSystem() } = {}) {
  const includePerAcre = !isPhone;
  const cols = metricCols(unitSystem);
  const opts = { includePerAcre, compact: isPhone, unitSystem };
  return el('div', {
    className: 'loc-mgmt__metrics',
    dataset: { testid: 'loc-mgmt-metrics', locationId: metrics?.locationId },
  }, [
    el('div', {
      className: 'loc-mgmt__metrics-line',
      dataset: { testid: 'loc-mgmt-metrics-line1' },
    }, metricLine1(cols).map(col => renderMetricCol(col, metrics, opts))),
    el('div', {
      className: 'loc-mgmt__metrics-line',
      dataset: { testid: 'loc-mgmt-metrics-line2' },
    }, metricLine2(cols).map(col => renderMetricCol(col, metrics, opts))),
  ]);
}

/**
 * OI-0252 Ls: stacked sort headers matching metric lines.
 */
function renderMetricsHead(metricBtnsByKey, { grow = false } = {}) {
  const cols = metricCols();
  const line1 = metricLine1(cols).map(c => metricBtnsByKey.get(c.key)).filter(Boolean);
  const line2 = metricLine2(cols).map(c => metricBtnsByKey.get(c.key)).filter(Boolean);
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
export function renderCalendarGrid(container, opts = {}) {
  // L1: one metrics render pass per Calendar/List paint (season rows, past-block
  // labels and the totals strip share group-day demand and hay spans).
  return inMetricsPass(() => renderCalendarGridNow(container, opts));
}

function renderCalendarGridNow(container, { onViewChange } = {}) {
  teardownScrollSurface(container);
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
  // OI-0265 Lg1: crop / confinement / storage (non-X1) locations show as legacy
  // cards on the List view only; Calendar keeps pasture/mixed rows.
  const managementIds = new Set(locations.map(l => l.id));
  let legacyCardLocations = state.view === 'list'
    ? allLocations.filter(l => !l.archived && !managementIds.has(l.id))
    : [];
  if (!locations.length && !legacyCardLocations.length) {
    container.appendChild(renderEmptyState({ operationId, farmId }));
    return;
  }

  // #402: farm season default (Jan 1 – Dec 31 fallback until 049 is applied).
  const defaultWin = defaultMetricWindow(today, farmSettings);
  const windowStart = state.metricStart || defaultWin.start;
  const windowEnd = state.metricEnd || defaultWin.end;

  // La: List search + Ta type pills (within X1 only)
  const allFarms = getAll('farms');
  const isMultiFarm = allFarms.length > 1;
  if (state.view === 'list') {
    if (listLandUseFilter === 'pasture' || listLandUseFilter === 'mixed_use') {
      locations = locations.filter(l => (l.landUse || 'pasture') === listLandUseFilter);
      legacyCardLocations = [];
    } else if (listLandUseFilter !== 'all') {
      // Legacy rule (locations/index.js): confinement/storage by type, else land + landUse.
      locations = [];
      legacyCardLocations = legacyCardLocations.filter(l => matchesLegacyTypeFilter(l, listLandUseFilter));
    }
    if (isMultiFarm && listFarmFilter !== 'all') {
      locations = locations.filter(l => l.farmId === listFarmFilter);
      legacyCardLocations = legacyCardLocations.filter(l => l.farmId === listFarmFilter);
    }
    if (listSearchQuery.trim()) {
      const q = listSearchQuery.trim().toLowerCase();
      const hit = (l) => {
        const name = (l.name || '').toLowerCase();
        const code = (l.fieldCode || '').toLowerCase();
        return name.includes(q) || code.includes(q);
      };
      locations = locations.filter(hit);
      legacyCardLocations = legacyCardLocations.filter(hit);
    }
    legacyCardLocations.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
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

  // L1: metricCtx is the store at this version; a row is reused until the next
  // store notify (or a new day / metric window). Copies, so sort/reads are safe.
  let metricRows = locations.map(loc => ({
    ...memoByStoreVersion(`cal-row|${loc.id}|${windowStart}|${windowEnd}|${today}`,
      () => computeLocationMetrics(loc, metricCtx)),
  }));
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

  // OI-0273: “Ready” / “Ready (est.)” chip by the name (Calendar + List, phone too).
  const minRestDays = farmSettings.defaultRecoveryMinDays ?? 21;
  const readyChipById = new Map();
  for (const loc of locations) {
    readyChipById.set(loc.id, readyChipKind(readinessById.get(loc.id), {
      today,
      minRestDays,
      isActive: !!activeEvents[loc.id] || !!linkedPaddocks[loc.id],
    }));
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

  const periodBar = renderPeriodBar({ windowStart, windowEnd, onUpdate, farmSettings, today });
  // List = Locations tools + season metrics (La); Calendar keeps rotation toolbar.
  const toolbar = isList
    ? renderListTools({ onUpdate, operationId, farmId, farms: isMultiFarm ? allFarms : [] })
    : renderToolbar(onUpdate);
  // OI-0250 Sb: period totals under season metrics bar, above color key.
  // #465 Ls1: List shows the same strip (season bar → strip → List table). It
  // aggregates the same management-location rows and window as Calendar (not
  // the List search / type / farm pills), so List and Calendar totals match.
  const totalsRows = isList
    ? filterManagementLocations(allLocations).map(loc => ({
      ...memoByStoreVersion(`cal-row|${loc.id}|${windowStart}|${windowEnd}|${today}`,
        () => computeLocationMetrics(loc, metricCtx)),
    }))
    : metricRows;
  const periodTotals = aggregatePeriodTotals(totalsRows);
  const earliestGw = earliestGroupWindowDate(allGroupWindows);
  const preWindowNote = periodStartsBeforeFirstGroupWindow(windowStart, earliestGw)
    ? t('event.periodTotalsPreWindow', { date: formatShortDate(earliestGw) })
    : null;
  const totalsStrip = periodTotals ? renderPeriodTotalsStrip(periodTotals, { unitSystem, isPhone, preWindowNote }) : null;
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

  // OI-0266: header row lives INSIDE the single scroller, sticky to the top.
  const sort = { key: state.sortKey || 'name', dir: state.sortDir || 'asc' };
  const head = renderTableHead({
    sort, onUpdate, isPhone, range, totalWidth, todayPx, zoom: state.zoom,
    omitTimeline: isList,
    metricsCollapsed,
  });

  // F0 / OI-0266: ONE scroll owner for both axes. The axis (head) is sticky to
  // the top; name + metrics are sticky to the left. Nothing else scrolls.
  const body = el('div', {
    className: SCROLL_OWNER_CLASS,
    id: SCROLL_BODY_ID,
    dataset: {
      testid: 'loc-mgmt-body',
      architecture: describeScrollArchitecture().vertical,
      view: isList ? 'list' : 'calendar',
    },
    'data-scroll-owner': 'both',
    'data-overflow-y': 'auto',
    'data-overflow-x': 'auto',
  }, [head]);

  const rowByLoc = new Map();

  locations.forEach((loc) => {
    const metrics = metricsById.get(loc.id);
    const readiness = readinessById.get(loc.id);
    const row = renderManagementRow({
      loc,
      metrics,
      readiness,
      readyChip: readyChipById.get(loc.id) || null,
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
      metricCtx: isList ? null : metricCtx,
    });
    rowByLoc.set(loc.id, row);
    body.appendChild(row);
  });

  // OI-0265 Lg1: legacy cards after the pasture/mixed rows (List only), sorted by name.
  if (isList && legacyCardLocations.length) {
    body.appendChild(el('div', {
      className: 'loc-mgmt__legacy-cards',
      dataset: { testid: 'loc-mgmt-legacy-cards' },
    }, legacyCardLocations.map(loc => buildLocationCard(loc, operationId, loc.farmId || farmId, unitSystem))));
  }
  if (isList && !locations.length && !legacyCardLocations.length) {
    body.appendChild(el('div', {
      className: 'empty',
      dataset: { testid: 'loc-mgmt-list-empty' },
    }, ['No locations match this filter']));
  }

  // OI-0264 Cn1: sub-move connectors between paddock rows of one event.
  const connectorLayer = isList ? null : buildConnectorLayer({
    paddockWindows: allPaddockWindows, rowByLoc, range, totalWidth,
  });
  if (connectorLayer) body.appendChild(connectorLayer.overlay);

  // #443: always-visible horizontal rail under the scroller (Calendar only).
  // Display-only: it reads body.scrollLeft and writes it only from its own input.
  const rail = isList ? null : createScrollRail(body, {
    isPhone,
    controlsId: SCROLL_BODY_ID,
    getOrigin: () => timelineOriginX(body),
    stepPx: range.pxPerDay,
  });
  container._locMgmtRail = rail;

  // Centre today on the single scroller (calendar only). The connector overlay
  // sits inside the scrolling content, so it needs no scroll listener at all.
  requestAnimationFrame(() => {
    if (!isList) centerTodayOnScroller(body, todayPx);
    if (connectorLayer) connectorLayer.layout(body);
    if (rail && body.isConnected) rail.sync();
  });
  // OI-0266 (b): re-measure connectors when layout resizes (window, metrics
  // width / collapse). OI-0284: the same observer watches the sticky head and
  // keeps --loc-mgmt-head-h current. #443: the rail re-measures from the same
  // observer (still ONE per render). Guarded — jsdom has no ResizeObserver.
  let onResize = null;
  const resizeTargets = [];
  if (connectorLayer || rail) {
    let pending = false;
    onResize = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        if (!body.isConnected) return;
        // #464: keep head and row metrics widths matched after a resize.
        applyUniformMetricsWidth(body);
        if (connectorLayer) connectorLayer.layout(body);
        if (rail) rail.sync();
      });
    };
    resizeTargets.push(body);
    const firstRow = body.querySelector(`.loc-mgmt__row`);
    if (firstRow) resizeTargets.push(firstRow);
    const firstMetrics = body.querySelector('[data-testid="loc-mgmt-metrics"]');
    if (firstMetrics) resizeTargets.push(firstMetrics);
  }
  container._locMgmtResizeObserver = observeHeadHeight(body, { targets: resizeTargets, onResize });

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
  }, rail ? [body, rail.el] : [body]);

  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (isList) return;
    switch (e.key) {
      case 'ArrowLeft':
        body.scrollLeft -= e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
        break;
      case 'ArrowRight':
        body.scrollLeft += e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
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
  container._locMgmtKeyDown = onKeyDown;
}

/** OI-0266: drop the previous render's key handler and resize observer.
 * Also called by the Events screen when it is left. */
export function teardownScrollSurface(container) {
  if (!container) return;
  if (container._locMgmtKeyDown) {
    container.removeEventListener('keydown', container._locMgmtKeyDown);
    container._locMgmtKeyDown = null;
  }
  if (container._locMgmtResizeObserver) {
    container._locMgmtResizeObserver.disconnect();
    container._locMgmtResizeObserver = null;
  }
  if (container._locMgmtRail) {
    container._locMgmtRail.destroy();
    container._locMgmtRail = null;
  }
}

/** OI-0284: CSS var the scroller's scroll-padding-top reads (main.css). */
export const HEAD_HEIGHT_VAR = '--loc-mgmt-head-h';

/**
 * OI-0284: set --loc-mgmt-head-h on the single scroller from the sticky head's
 * rendered height (main.css scroll-padding-top reads it), and keep it current
 * with a ResizeObserver on the head (rotate / narrow-width wrap). Falls back to
 * 0px when the head is missing. The same observer also watches `targets` and
 * calls `onResize` (OI-0266 connector re-measure), so each render owns ONE
 * observer, disconnected by teardownScrollSurface on re-render / unmount.
 * Returns null when there is nothing to observe or no ResizeObserver.
 */
export function observeHeadHeight(body, { targets = [], onResize = null } = {}) {
  if (!body) return null;
  const head = body.querySelector('.loc-mgmt__head');
  const apply = () => {
    body.style.setProperty(HEAD_HEIGHT_VAR, `${head ? head.offsetHeight || 0 : 0}px`);
  };
  apply();
  const RO = typeof globalThis !== 'undefined' ? globalThis.ResizeObserver : undefined;
  if (typeof RO !== 'function' || (!head && !targets.length)) return null;
  const ro = new RO(() => {
    apply();
    if (onResize) onResize();
  });
  if (head) ro.observe(head);
  targets.forEach(t => ro.observe(t));
  return ro;
}

/**
 * OI-0266: x of the timeline origin inside the single scroller's content
 * (name + metrics on desktop; row padding on phone).
 */
function timelineOriginX(body) {
  const inner = body.querySelector(`.${TIMELINE_CLASS} .loc-mgmt__timeline-inner`)
    || body.querySelector('.loc-mgmt__timeline-inner');
  if (!inner) return 0;
  const bodyRect = body.getBoundingClientRect();
  const r = inner.getBoundingClientRect();
  return r.left - bodyRect.left + body.scrollLeft;
}

/**
 * OI-0266: centre today in the visible timeline area of the single scroller.
 * Writes scrollLeft once (on open / jump to today) — never from a scroll event.
 */
export function centerTodayOnScroller(body, todayPx) {
  if (!body) return 0;
  const origin = timelineOriginX(body);
  const viewWidth = Math.max(0, (body.clientWidth || 300) - origin) || 300;
  const left = Math.max(0, todayPx - viewWidth / 2);
  body.scrollLeft = left;
  return left;
}

/**
 * OI-0264 Cn1 — one pointer-events:none overlay in the body; a vertical line at
 * each later window's open date from the source bar's row to the new bar's row
 * (arrow at the new bar). Skips same-row pairs, unrendered rows, and dates
 * outside the visible range. Vertical positions come from rendered rows.
 */
function buildConnectorLayer({ paddockWindows, rowByLoc, range, totalWidth }) {
  const byEvent = new Map();
  for (const pw of paddockWindows || []) {
    if (!byEvent.has(pw.eventId)) byEvent.set(pw.eventId, []);
    byEvent.get(pw.eventId).push(pw);
  }
  const specs = [];
  for (const wins of byEvent.values()) {
    if (wins.length < 2) continue;
    for (const c of eventConnectors(wins)) {
      if (c.fromLocationId === c.toLocationId) continue;
      if (!rowByLoc.has(c.fromLocationId) || !rowByLoc.has(c.toLocationId)) continue;
      const d = parseTimelineDay(c.date);
      if (!d || d < range.start || d > range.end) continue;
      specs.push({ ...c, x: dateToPx(d, range.start, range.pxPerDay) });
    }
  }
  if (!specs.length) return null;
  const inner = el('div', {
    className: 'loc-mgmt__connectors-inner',
    style: { width: `${totalWidth}px` },
  });
  // OI-0266 (a): the overlay lives inside the single scrolling content, so it
  // scrolls with the rows natively — no scroll listener, no transform follow.
  const nodes = specs.map((c) => {
    const node = el('div', {
      className: 'loc-mgmt__connector',
      style: { left: `${c.x}px` },
      dataset: {
        testid: 'submove-connector',
        date: c.date,
        fromLocationId: c.fromLocationId,
        toLocationId: c.toLocationId,
        toPwId: c.toPwId,
      },
    });
    inner.appendChild(node);
    return { c, node };
  });
  const overlay = el('div', {
    className: 'loc-mgmt__connectors',
    'aria-hidden': 'true',
    dataset: { testid: 'submove-connectors' },
  }, [inner]);

  const rowCenterY = (row, bodyRect, body) => {
    const area = row.querySelector('.loc-mgmt__block-area') || row;
    const r = area.getBoundingClientRect();
    return r.top - bodyRect.top + body.scrollTop + r.height / 2;
  };
  return {
    overlay,
    layout(body) {
      if (!body) return;
      // L1: read every position first, then write — one layout instead of one
      // forced layout per connector (the overlay never moves the rows).
      const bodyRect = body.getBoundingClientRect();
      const originX = timelineOriginX(body);
      const scrollHeight = body.scrollHeight;
      const ys = nodes.map(({ c }) => [
        rowCenterY(rowByLoc.get(c.fromLocationId), bodyRect, body),
        rowCenterY(rowByLoc.get(c.toLocationId), bodyRect, body),
      ]);
      overlay.style.left = `${originX}px`;
      overlay.style.width = `${totalWidth}px`;
      overlay.style.height = `${scrollHeight}px`;
      nodes.forEach(({ node }, i) => {
        const [yFrom, yTo] = ys[i];
        node.style.top = `${Math.min(yFrom, yTo)}px`;
        node.style.height = `${Math.abs(yTo - yFrom)}px`;
        node.dataset.dir = yTo >= yFrom ? 'down' : 'up';
      });
    },
  };
}

/** OI-0265 Lg1: legacy Locations type-pill rule (locations/index.js renderLocationList). */
export function matchesLegacyTypeFilter(loc, filter) {
  if (filter === 'all') return true;
  if (filter === 'confinement') return loc.type === 'confinement';
  if (filter === 'storage') return loc.type === 'storage';
  return loc.type === 'land' && loc.landUse === filter;
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
 * La: Locations-parity tools for List mode (search, legacy type + farm pills, Add/Survey/Surveys/…).
 * Calendar toolbar stays unchanged (Cb).
 */
function renderListTools({ onUpdate, operationId, farmId, farms = [] }) {
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
    pill('Mixed-Use', 'mixed_use'),
    pill('Crop', 'crop'),
    pill('Confinement', 'confinement'),
    pill(t('location.filter.storage'), 'storage'),
  ]);

  // OI-0265 Lg1: legacy farm pills (multi-farm only), same amber look + rule.
  const farmPill = (label, value) => {
    const isActive = listFarmFilter === value;
    return el('button', {
      type: 'button',
      dataset: { testid: `loc-mgmt-list-farm-${value}` },
      style: {
        padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer',
        border: `1.5px solid ${isActive ? 'var(--amber-d)' : 'var(--border2)'}`,
        background: isActive ? 'var(--amber-d)' : 'transparent',
        color: isActive ? 'white' : 'var(--text2)',
      },
      onClick: () => { listFarmFilter = value; onUpdate(); },
    }, [label]);
  };
  const farmRow = farms.length > 1
    ? el('div', {
      className: 'loc-mgmt__list-farms',
      dataset: { testid: 'loc-mgmt-list-farms' },
      style: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
    }, [farmPill('All farms', 'all'), ...farms.map(f => farmPill(f.name, f.id))])
    : null;

  const tools = el('div', {
    className: 'loc-mgmt__list-actions',
    dataset: { testid: 'loc-mgmt-list-tools' },
  }, [
    el('button', {
      type: 'button',
      className: 'btn btn-green btn-sm',
      dataset: { testid: 'loc-mgmt-list-add' },
      onClick: () => openLocationSheet(null, operationId, farmId),
    }, ['+ Add']),
    // OI-0263 Tb1: Map launcher removed — Map is the third View (Calendar | List | Map).
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      onClick: () => openSurveySheet(null, operationId),
    }, ['\uD83D\uDCCB Survey']),
    // OI-0265 Sv-A: past + draft surveys live on #/surveys.
    el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      dataset: { testid: 'loc-mgmt-list-surveys' },
      onClick: () => navigate('#/surveys'),
    }, ['Surveys']),
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
      // OI-0265 In-A: past inputs live on #/amendments.
      el('a', {
        href: '#/amendments',
        className: 'loc-mgmt__list-inputs-label loc-mgmt__link',
        dataset: { testid: 'loc-mgmt-list-inputs-link' },
        onClick: (e) => { e.preventDefault(); navigate('#/amendments'); },
      }, ['Inputs & amendments']),
    ]),
    farmRow ? el('div', { className: 'loc-mgmt__list-toolbar-row' }, [farmRow]) : null,
  ].filter(Boolean));
}

function renderPeriodBar({ windowStart, windowEnd, onUpdate, farmSettings = {}, today = getLocalTodayStr() }) {
  // Pb: the date fields are this device's custom view (never the farm default).
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

  // #402: "Farm default…" only once migration 049 is applied and released
  // (columns absent → hidden, no write attempt) and the farm has a settings row.
  const canEditFarm = areFarmSeasonSettingsReleased() && !!farmSettings?.id;
  const farmBtn = canEditFarm ? el('button', {
    type: 'button',
    className: ['toolbar__pill', farmSeasonEditorOpen ? 'toolbar__pill--active' : ''].filter(Boolean).join(' '),
    dataset: { testid: 'metric-window-farm-default' },
    'aria-expanded': farmSeasonEditorOpen ? 'true' : 'false',
    onClick: () => {
      farmSeasonEditorOpen = !farmSeasonEditorOpen;
      farmSeasonSavedNote = false;
      onUpdate();
    },
  }, ['Farm default…']) : null;

  const savedNote = farmSeasonSavedNote
    ? el('span', { className: 'loc-mgmt__period-note', dataset: { testid: 'farm-season-saved' }, role: 'status' }, ['Farm season saved'])
    : null;
  farmSeasonSavedNote = false; // shown once

  const hint = el('div', {
    className: 'loc-mgmt__period-hint',
    dataset: { testid: 'metric-window-device-hint' },
  }, ['Custom dates apply to this device only.']);

  const editor = canEditFarm && farmSeasonEditorOpen
    ? renderFarmSeasonEditor({ farmSettings, today, onUpdate })
    : null;

  return el('div', {
    className: 'loc-mgmt__period',
    dataset: { testid: 'metric-window-bar' },
  }, [
    el('span', { className: 'loc-mgmt__period-label' }, ['Season metrics:']),
    startInput,
    el('span', {}, ['–']),
    endInput,
    resetBtn,
    farmBtn,
    savedNote,
    // OI-0265 Lk1: "Locations · Surveys · Map" link retired (Surveys + Map live in List tools / View).
    hint,
    editor,
  ].filter(Boolean));
}

/**
 * #402: inline farm season editor (start/end month + day). Writes farm_settings
 * only on Save, through the normal store/sync path; Cancel discards.
 */
function renderFarmSeasonEditor({ farmSettings, today, onUpdate }) {
  const current = resolveFarmSeason(farmSettings);
  const monthSelect = (value, testid, label) => el('select', {
    className: 'loc-mgmt__season-month',
    dataset: { testid },
    'aria-label': label,
  }, MONTH_SHORT.map((m, i) => el('option', {
    value: String(i + 1),
    selected: i + 1 === value,
  }, [m])));
  const dayInput = (value, testid, label) => el('input', {
    type: 'number',
    min: '1',
    max: '31',
    step: '1',
    inputmode: 'numeric',
    className: 'loc-mgmt__season-day',
    value: String(value),
    dataset: { testid },
    'aria-label': label,
  });
  const startMonth = monthSelect(current.startMonth, 'farm-season-start-month', 'Farm season start month');
  const startDay = dayInput(current.startDay, 'farm-season-start-day', 'Farm season start day');
  const endMonth = monthSelect(current.endMonth, 'farm-season-end-month', 'Farm season end month');
  const endDay = dayInput(current.endDay, 'farm-season-end-day', 'Farm season end day');

  const values = () => ({
    startMonth: startMonth.value, startDay: startDay.value,
    endMonth: endMonth.value, endDay: endDay.value,
  });
  const label = el('div', { className: 'loc-mgmt__season-label', dataset: { testid: 'farm-season-label' } });
  const errorEl = el('div', { className: 'auth-error', dataset: { testid: 'farm-season-error' }, role: 'alert' });
  const refresh = () => {
    clear(label);
    clear(errorEl);
    const check = validateFarmSeason(values(), today);
    if (check.valid) {
      const def = {
        startMonth: check.normalized.seasonStartMonth, startDay: check.normalized.seasonStartDay,
        endMonth: check.normalized.seasonEndMonth, endDay: check.normalized.seasonEndDay,
      };
      label.appendChild(document.createTextNode(`This farm's season: ${formatFarmSeason(def, today)}`));
    } else {
      errorEl.appendChild(document.createTextNode(check.errors.join('; ')));
    }
    return check;
  };
  for (const input of [startMonth, startDay, endMonth, endDay]) {
    input.addEventListener('change', refresh);
    input.addEventListener('input', refresh);
  }

  const save = el('button', {
    type: 'button',
    className: 'btn btn-green btn-sm',
    dataset: { testid: 'farm-season-save' },
    onClick: () => {
      const check = refresh();
      if (!check.valid) return;
      try {
        updateFarmSeasonSettings(farmSettings.id, check.normalized);
      } catch (err) {
        clear(errorEl);
        errorEl.appendChild(document.createTextNode(err.message));
        return;
      }
      farmSeasonEditorOpen = false;
      farmSeasonSavedNote = true;
      onUpdate();
    },
  }, ['Save']);
  const cancel = el('button', {
    type: 'button',
    className: 'btn btn-outline btn-sm',
    dataset: { testid: 'farm-season-cancel' },
    onClick: () => {
      farmSeasonEditorOpen = false;
      onUpdate();
    },
  }, ['Cancel']);

  const editor = el('div', {
    className: 'loc-mgmt__season-editor',
    dataset: { testid: 'farm-season-editor' },
  }, [
    el('div', { className: 'loc-mgmt__season-row' }, [
      el('span', { className: 'loc-mgmt__period-label' }, ['Farm default season: start']),
      startMonth, startDay,
      el('span', { className: 'loc-mgmt__period-label' }, ['end']),
      endMonth, endDay,
    ]),
    label,
    errorEl,
    el('div', { className: 'loc-mgmt__season-row' }, [save, cancel]),
  ]);
  refresh();
  return editor;
}

/** Test hook: reset the #402 editor session state. */
export function _resetFarmSeasonEditor() {
  farmSeasonEditorOpen = false;
  farmSeasonSavedNote = false;
}


/**
 * OI-0250 Sb: period totals strip — Pasture / Stored-feed / Total DMI + Total N/P/K.
 * Calendar only; sits under season metrics bar and above the color key.
 */
function renderPeriodTotalsStrip(totals, { unitSystem = getUnitSystem(), isPhone = false, preWindowNote = null } = {}) {
  // OI-0278 S1: unit in the label ("Total DMI (lb)"); values via the helper.
  const w = unitSuffix('weight', unitSystem);
  // OI-0276: same hover note on Total N/P/K when leftover hay was not counted.
  const hayNote = residualNpkNote(totals);
  // OI-0279: per-class DMI % fallback note on the DMI totals.
  const dmiNote = totals.dmiBasisNote ? `. ${totals.dmiBasisNote}` : '';
  const cell = (key, label, value, partial, title, note = null, family = 'weight') => {
    // #462 (Design 1610): Total P → P₂O₅, Total K → K₂O hover after any other notes; N none.
    const fertNote = key === 'p' || key === 'k'
      ? fertilizerCellHover(key, value, { unitSystem, compact: isPhone })
      : null;
    const notes = [note, preWindowNote, fertNote].filter(Boolean);
    return el('div', {
    className: `loc-mgmt__period-total${partial ? ' loc-mgmt__period-total--partial' : ''}`,
    title: notes.length ? `${title}. ${notes.join('. ')}` : title,
    dataset: {
      key,
      testid: `loc-mgmt-period-total-${key}`,
      partial: partial ? 'true' : undefined,
      ...(note ? { residualNote: 'true' } : {}),
      ...(preWindowNote ? { preWindowNote: 'true' } : {}),
      ...(fertNote ? { fertilizerHover: 'true' } : {}),
    },
  }, [
    el('span', { className: 'loc-mgmt__period-total-label' }, [label]),
    el('span', { className: 'loc-mgmt__period-total-value' }, [
      formatMeasure(value, family, { unitSystem, compact: isPhone, unitInHeader: true }),
      partial
        ? el('span', {
          className: 'loc-mgmt__metric-partial',
          dataset: { testid: `loc-mgmt-period-total-partial-${key}` },
        }, [' partial'])
        : null,
    ].filter(Boolean)),
  ]);
  };

  return el('div', {
    className: 'loc-mgmt__period-totals',
    dataset: { testid: 'loc-mgmt-period-totals' },
    role: 'region',
    'aria-label': 'Period totals for locations in view',
  }, [
    el('span', { className: 'loc-mgmt__period-totals-label' }, ['Period totals:']),
    cell('pastureDmi', `Pasture DMI ${w}`, totals.pastureDmiKg, !!totals.dmiPartial,
      `Implied pasture DMI for the period in view ${w}${dmiNote}`),
    cell('storedDmi', `Stored-feed DMI ${w}`, totals.storedFeedDmiKg, false,
      `Measured stored-feed DMI eaten ${w}; missing-DM counts as 0`),
    cell('totalDmi', `Total DMI ${w}`, totals.totalDmiKg, !!totals.dmiPartial,
      `Pasture DMI + stored-feed DMI for the period ${w}${dmiNote}`),
    // #462: strip heading reads elemental where there's room (desktop);
    // on phone the elemental wording stays in the cell titles.
    isPhone ? null : el('span', {
      className: 'loc-mgmt__period-totals-label loc-mgmt__period-totals-label--npk',
      dataset: { testid: 'loc-mgmt-period-totals-npk-heading' },
    }, [NPK_ELEMENTAL_HEADING]),
    cell('n', `Total N ${w}`, totals.nKg, !!totals.npkPartial, `Total nitrogen for the period, elemental ${w}`, hayNote, 'npk'),
    cell('p', `Total P ${w}`, totals.pKg, !!totals.npkPartial, `Total phosphorus for the period, elemental ${w}`, hayNote, 'npk'),
    cell('k', `Total K ${w}`, totals.kKg, !!totals.npkPartial, `Total potassium for the period, elemental ${w}`, hayNote, 'npk'),
  ].filter(Boolean));
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
  const cols = metricCols();
  const metricBtns = cols.map(col => sortHeaderButton(col.key, col.head, sort, onUpdate, col.title));
  const metricBtnsByKey = new Map(cols.map((col, i) => [col.key, metricBtns[i]]));
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
    className: AXIS_CLASS,
    dataset: { testid: 'timeline-axis' },
  }, [
    el('div', {
      className: 'loc-mgmt__timeline-inner',
      style: { width: `${totalWidth}px`, position: 'relative', height: '40px' },
    }, [axis, todayLine]),
  ]);

  // OI-0274 Dc1: the sort still applies while collapsed; say which one (not for name).
  const sortNote = metricsCollapsed ? collapsedSortNote(sort) : null;
  const metricsHead = metricsCollapsed
    ? el('div', {
      className: 'loc-mgmt__metrics-head loc-mgmt__metrics-head--collapsed',
      dataset: { testid: 'loc-mgmt-metrics-head-collapsed' },
    }, [
      collapseToggle,
      sortNote
        ? el('span', { className: 'loc-mgmt__sort-note', dataset: { testid: 'loc-mgmt-collapsed-sort-note' } }, [sortNote])
        : null,
    ].filter(Boolean))
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

/** Labels for sort keys with no header button (URL / stored deep links); OI-0278: farm area unit. */
function sortNoteLabels(unitSystem) {
  const area = shortUnit('area', unitSystem);
  return {
    audsPerAcre: `AUDs/${area}`, nPerAcre: `N/${area}`, pPerAcre: `P/${area}`, kPerAcre: `K/${area}`,
  };
}

/**
 * OI-0274 Dc1: note shown by the collapsed Metrics tab, e.g.
 * "Sorted by DMI/ac, low first". Default name sort → null (no note).
 * @param {{ key: string, dir: 'asc'|'desc' }} sort
 * @returns {string|null}
 */
export function collapsedSortNote(sort, unitSystem = getUnitSystem()) {
  const key = sort?.key || 'name';
  if (key === 'name') return null;
  const label = metricCols(unitSystem).find(c => c.key === key)?.label || sortNoteLabels(unitSystem)[key];
  if (!label) return null;
  return `Sorted by ${label}, ${sort?.dir === 'desc' ? 'high first' : 'low first'}`;
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
    metricCtx = null,
    readyChip = null,
  } = opts;

  // OI-0278 S1: area via the helper ("12.3 ac" / "5.0 ha"); none → "no area".
  const hasArea = Number(loc.areaHectares) > 0;
  const areaDisplay = hasArea
    ? formatMeasure(loc.areaHectares, 'area', { unitSystem })
    : 'no area';
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
      dataset: { testid: 'loc-mgmt-land-use-badge', locationId: loc.id },
    }, [landUseLabel(loc.landUse)])
    : null;
  const codeLine = isList && loc.fieldCode
    ? el('div', { className: 'loc-mgmt__code' }, [loc.fieldCode])
    : null;

  // OI-0273: small chip just right of the name (shared Calendar / List cell).
  const readyChipEl = readyChip
    ? el('span', {
      className: `loc-mgmt__ready-chip loc-mgmt__ready-chip--${readyChip === 'ready' ? 'ready' : 'est'}`,
      title: readyChip === 'ready'
        ? 'Ready to graze: past its earliest return date'
        : 'Estimated ready: rested at least the farm default minimum (no entered rest days or survey)',
      dataset: { testid: 'loc-mgmt-ready-chip', locationId: loc.id, kind: readyChip },
    }, [READY_CHIP_TEXT[readyChip]])
    : null;

  const nameCell = el('div', nameProps, [
    el('div', { className: 'loc-mgmt__name-text' }, [
      // OI-0273: own span so the name can ellipsis on phone before the chip wraps.
      el('span', { className: 'loc-mgmt__name-label' }, [loc.name]),
      readyChipEl,
      typeBadge,
    ].filter(Boolean)),
    codeLine,
    el('div', { className: 'loc-mgmt__area' }, [
      hasArea ? areaDisplay : el('span', { className: 'loc-mgmt__no-acres' }, [areaDisplay]),
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
    : renderMetricsCell(metricsForCell, { isPhone, unitSystem });

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
  const todayStr = getLocalTodayStr();
  const nowMid = new Date();
  nowMid.setHours(0, 0, 0, 0);

  // OI-0264 Pw1+Hc1+Mw1: one past block per paddock window (its own dates,
  // head count at its end, label metrics scoped to it).
  for (const pw of locWindows) {
    const event = allEvents.find(e => e.id === pw.eventId);
    if (!event) continue;
    const span = pastWindowSpan(pw, event, { today: todayStr, fallbackStart: getEventStartDate(event.id) });
    if (!span) continue;
    const winStart = new Date(span.start + 'T00:00:00');
    const winEnd = new Date(span.end + 'T00:00:00');
    if (winEnd < range.start || winStart > range.end) continue;

    const isActive = span.isActive;
    const blockStart = new Date(Math.max(winStart.getTime(), range.start.getTime()));
    const blockEnd = new Date(Math.min(winEnd.getTime(), range.end.getTime()));
    const leftPx = dateToPx(blockStart, range.start, range.pxPerDay);

    if (blockStart < nowMid) {
      const pastEnd = new Date(Math.min(blockEnd.getTime(), nowMid.getTime()));
      const pastWidthPx = Math.max(4, dateToPx(pastEnd, range.start, range.pxPerDay) - leftPx);
      const strips = pw.isStripGraze && isActive
        ? allPaddockWindows.filter(w => w.stripGroupId === pw.stripGroupId).map(w => ({ areaPct: w.areaPct || 100 }))
        : [];
      const eventGws = allGroupWindows.filter(gw => gw.eventId === event.id);
      const hc = headCountAtWindowEnd(pw, {
        eventGroupWindows: eventGws,
        groups: allGroups,
        memberships: allMemberships,
        animals: allAnimals,
        today: todayStr,
        event, // OI-0266 (c): open window on a closed event counts at the event close
      });
      // Mw1: List-metrics calc over this window only (OI-0256 stored-feed first,
      // OI-0253 unknown → null → "—").
      const wm = metricCtx
        ? memoByStoreVersion(`cal-win|${pw.id}|${loc.id}|${event.id}|${span.start}|${span.end}|${todayStr}`,
          () => computePaddockWindowMetrics(pw, loc, event, span, metricCtx))
        : { auds: null, dmi: null, pasturePct: null, feedPct: null, storedFeedOnly: !!pw.noPasture };
      const storedFeedOnly = wm.storedFeedOnly;
      // #466 Hd1 (display only): head range over the block + per-group hover lines.
      // An unknown head keeps the existing count (headCountAtWindowEnd, still the calc input).
      const hr = headRangeInWindow(span, {
        eventGroupWindows: eventGws, groups: allGroups, memberships: allMemberships, animals: allAnimals,
      });
      const hoverLines = pastBlockHoverLines({
        storedFeedEventKg: wm.raw ? (wm.raw.eventStoredFeedDmiKg ?? null) : null,
        hayOverNeedKg: wm.raw ? (wm.raw.eventHayOverNeedKg ?? null) : null,
        storedFeedUnknown: !!wm.raw?.dmiHayUnknown,
        groupLines: hr.lines,
      });
      blockArea.appendChild(renderPastBlock({
        leftPx,
        widthPx: pastWidthPx,
        groups: hc.groups,
        auds: wm.auds != null ? Math.round(wm.auds) : 0,
        days: span.days,
        pasturePct: wm.pasturePct,
        feedPct: wm.feedPct,
        // OI-0278 S1: pass canonical kg; past-block formats it in the farm unit.
        dmi: storedFeedOnly ? 0 : (wm.dmi != null ? wm.dmi : null),
        // OI-0285 B: hay-0 estimate on an open event with no check since → "~".
        dmiEstimate: !storedFeedOnly && !!wm.raw?.dmiFeedCheckNeeded,
        headCount: hc.headCount,
        headLabel: hr.unknown ? null : formatHeadRange(hr),
        hoverLines,
        isActive,
        isStripGraze: pw.isStripGraze || false,
        strips,
        stripNote: null,
        isLinkedSecondary: !!linkedPaddocks[loc.id],
        linkedPrimaryName: linkedPaddocks[loc.id]?.name,
        storedFeedOnly,
        eventId: event.id,
        paddockWindowId: pw.id,
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

  // OI-0257 St1: never paint CAP-1 stub zeros (tan "0 lb hay"); keep green readiness
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
      hayEstimateKg: null,
      locationId: loc.id,
      forageInactive: false,
      onClickBlock: (_id, action) => {
        if (action === 'survey') openSurveySheet(loc.id, opId); // OI-0265 Lk1
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
      hayEstimateKg: null,
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
      hayEstimateKg: null,
      locationId: loc.id,
      forageInactive: false,
      onClickBlock: (_id, action) => {
        if (action === 'survey') openSurveySheet(loc.id, opId); // OI-0265 Lk1
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
        hayEstimateKg: null,
        locationId: loc.id,
        forageInactive: false,
        onClickBlock: (_id, action) => {
          if (action === 'survey') openSurveySheet(loc.id, opId); // OI-0265 Lk1
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

  // OI-0266: the strip does not scroll by itself; the single body owns X.
  const timelineScroll = el('div', {
    className: TIMELINE_CLASS,
    dataset: { testid: 'timeline-strip', locationId: loc.id },
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

function renderEmptyState({ operationId = null, farmId = null } = {}) {
  return el('div', {
    className: 'calendar-empty',
    dataset: { testid: 'calendar-empty' },
  }, [
    el('h2', {}, ['No pasture locations yet']),
    el('p', {}, ['Add pasture or mixed-use locations to manage rotations and season metrics.']),
    el('button', {
      className: 'btn btn--primary',
      onClick: () => openLocationSheet(null, operationId, farmId), // OI-0265 Lk1
      type: 'button',
      dataset: { testid: 'calendar-empty-add-location' },
    }, ['+ Add location']),
  ]);
}
