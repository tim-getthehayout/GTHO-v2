/** @file Dashboard screen — §17. Home screen assembly: stats, view toggle, group/location cards, tasks, survey draft, weaning nudge. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe, getVisibleEvents, getVisibleGroups, getActiveFarmId, isCurrentUserDev, resolveGroupCurrentPlacement } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { formatMeasure, formatPerArea, shortUnit } from '../../utils/units.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../utils/date-utils.js';
import { groupWindowPresenceDays } from '../../calcs/partial-day-demand.js';
import { navigate } from '../../ui/router.js';
import { openLocationSheet } from '../locations/index.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { renderTodoCard } from '../todos/todo-card.js';
import { openTodoSheet } from '../todos/todo-sheet.js';
import { formatShortDate } from '../../utils/date-format.js';
import { computeHomeDmi, totalDmiTitle, pastureDmiTitle } from './home-dmi.js';
import { inMetricsPass } from '../../calcs/metrics-memo.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openPlaceWizard } from '../events/place-wizard.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from '../events/submove.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openGroupAddSheet } from '../events/group-windows.js';
import { openEventDetailSheet } from '../events/detail.js';
import { renderDmiChart as renderDmiChartComponent } from '../../ui/dmi-chart.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight, sumMembershipHeads, animalHeadCount, groupDayDmi, groupDayExcretionRates, dmiBasisNote } from '../../calcs/window-helpers.js';
import { getEventStartDate } from '../events/event-start.js';
import { buildDmi8ChartContext, computeDmi8Days } from '../events/dmi-chart-context.js';
import { computeEventDmiActual } from '../../calcs/event-dmi-actual.js';
import { openEditPaddockWindowDialog } from '../events/edit-paddock-window.js';
import { listOpenPaddocksForEvent, formatPaddockDisplayName } from '../../data/current-placement.js';
import { isPureConfinementOnDate, isConfinementLocation } from '../../calcs/location-type.js';
import { pickPreGraze, aggregateOpenPaddockForage } from '../../calcs/feed-forage.js';
import { renderEventFeedRemainingLine, renderInactiveForageSummary } from '../events/confinement-forage-ui.js';
import { FEED_REMAINING_ESTIMATE_CAPTION } from '../../calcs/event-feed-days.js';

// OI-0279 Q1: Home NPK uses the group's member-mix class excretion rates, the
// same as the calendar, Reports and the dev audit; a member without class rates
// takes these defaults (was 0.34 / 0.092 / 0.24 for every group).
import { DEFAULT_EXCRETION_RATES } from '../../calcs/excretion-defaults.js';
import { fertilizerHover, ELEMENTAL_SUFFIX } from '../../calcs/fertilizer-equivalents.js';

const NPK_DEFAULT_EXC = DEFAULT_EXCRETION_RATES;

/** NPK-1 excretion-rate args for a group on a day (OI-0279 member mix). */
function npkRateArgs(gw, day, ctx = groupDmiCtx()) {
  const r = groupDayExcretionRates(gw, day, ctx, NPK_DEFAULT_EXC);
  return { excretionNRate: r.n, excretionPRate: r.p, excretionKRate: r.k };
}

/** Unsubscribe functions */
let unsubs = [];

/** Expanded group cards (mobile) */
const expandedGroups = new Set();

/** Current view mode: 'groups' or 'locations' */
let viewMode = null;

/** Current stats period */
let statsPeriod = null;

/** localStorage keys for preferences */
const VIEW_MODE_KEY = 'gtho_v2_home_view_mode';
const STATS_PERIOD_KEY = 'gtho_v2_home_stats_period';

function getViewMode() {
  if (viewMode) return viewMode;
  viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'locations';
  return viewMode;
}

function setViewMode(mode) {
  viewMode = mode;
  localStorage.setItem(VIEW_MODE_KEY, mode);
}

function getStatsPeriod() {
  if (statsPeriod) return statsPeriod;
  statsPeriod = localStorage.getItem(STATS_PERIOD_KEY) || '7d';
  return statsPeriod;
}

function setStatsPeriod(period) {
  statsPeriod = period;
  localStorage.setItem(STATS_PERIOD_KEY, period);
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderDashboard(container) {
  // L1: one metrics render pass for the whole Home paint (cards + tiles share
  // group-day demand instead of recomputing it per card and per location).
  return inMetricsPass(() => renderDashboardNow(container));
}

function renderDashboardNow(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length || !farms.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('dashboard.title')]));
    return;
  }

  const screenEl = el('div', { 'data-testid': 'dashboard-screen' }, [
    // Stats row
    el('div', { 'data-testid': 'dashboard-stats' }),

    // View toggle
    el('div', { 'data-testid': 'dashboard-toggle' }),

    // Card grid
    el('div', { 'data-testid': 'dashboard-card-grid' }),

    // Open tasks section
    el('div', { 'data-testid': 'dashboard-tasks' }),

    // Survey draft card
    el('div', { 'data-testid': 'dashboard-survey-draft' }),

    // Weaning nudge
    el('div', { 'data-testid': 'dashboard-weaning' }),
  ]);

  container.appendChild(screenEl);

  renderStatsRow(container);
  renderViewToggle(container);
  renderCardGrid(container);
  renderTasksSection(container);
  renderSurveyDraft(container);
  renderWeaningNudge(container);

  // Subscribe to relevant entity changes
  const rerender = () => inMetricsPass(() => {
    if (!screenEl.isConnected) return;
    renderStatsRow(container);
    renderCardGrid(container);
    renderTasksSection(container);
    renderSurveyDraft(container);
    renderWeaningNudge(container);
  });
  unsubs.push(subscribe('groups', rerender));
  unsubs.push(subscribe('events', rerender));
  unsubs.push(subscribe('eventPaddockWindows', rerender));
  unsubs.push(subscribe('eventGroupWindows', rerender));
  unsubs.push(subscribe('animalGroupMemberships', rerender));
  unsubs.push(subscribe('eventFeedEntries', rerender));
  unsubs.push(subscribe('eventFeedChecks', rerender));
  unsubs.push(subscribe('eventFeedCheckItems', rerender));
  unsubs.push(subscribe('todos', () => renderTasksSection(container)));
  unsubs.push(subscribe('surveys', () => renderSurveyDraft(container)));
}

// ---------------------------------------------------------------------------
// §17.3 / §17.4: Stats row
// ---------------------------------------------------------------------------

function renderStatsRow(rootContainer) {
  const statsEl = rootContainer.querySelector('[data-testid="dashboard-stats"]');
  if (!statsEl) return;
  clear(statsEl);

  const period = getStatsPeriod();
  const isDesktop = window.innerWidth >= 900;

  if (isDesktop) {
    statsEl.appendChild(renderDesktopStats(period, rootContainer));
  } else {
    statsEl.appendChild(renderMobileStats(period, rootContainer));
  }
}

function renderDesktopStats(period, rootContainer) {
  const events = getEventsInPeriod(period);
  const unitSys = getUnitSystem();

  // Header line
  const groups = getVisibleGroups().filter(g => !g.archivedAt);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const totalHead = sumMembershipHeads(memberships, getAll('animals'));
  const groupCount = groups.length;
  const activeEvents = getVisibleEvents().filter(e => !e.dateOut);
  const activeCount = activeEvents.length;

  const headerText = `${totalHead} head \u00B7 ${groupCount} groups \u00B7 ${activeCount} active`;

  const statsContainer = el('div', { className: 'dash-stats-desktop' });

  // Header with period pills
  statsContainer.appendChild(el('div', { className: 'dash-stats-header' }, [
    el('div', {}, [
      el('span', { className: 'dash-stats-label' }, [t('dashboard.farmOverview')]),
      el('span', { className: 'dash-stats-summary' }, [headerText]),
    ]),
    renderPeriodPills(['24h', '3d', '7d', '30d', 'All'], period, rootContainer),
  ]));

  if (!events.length && period !== 'All') {
    statsContainer.appendChild(el('div', { className: 'dash-stats-empty' }, [t('dashboard.noEventsInPeriod')]));
    return statsContainer;
  }

  // 5 metric cells
  const metrics = computeDesktopMetrics(events, unitSys, period);
  const grid = el('div', { className: 'dash-stats-grid' });
  for (const m of metrics) {
    grid.appendChild(el('div', { className: 'm-cell', ...(m.title ? { title: m.title } : {}), ...(m.testId ? { 'data-testid': m.testId } : {}) }, [
      el('div', { className: 'mc-value', style: { color: m.color } }, [m.value]),
      el('div', { className: 'mc-label' }, [m.label]),
    ]));
  }
  statsContainer.appendChild(grid);

  return statsContainer;
}

function renderMobileStats(period, rootContainer) {
  const events = getEventsInPeriod(period);
  const unitSys = getUnitSystem();

  const statsContainer = el('div', { className: 'dash-stats-mobile' });

  // Header with period pills (mobile: 4 options, no All)
  statsContainer.appendChild(el('div', { className: 'dash-stats-header' }, [
    el('span', { className: 'dash-stats-label' }, [t('dashboard.grazingPerformance')]),
    renderPeriodPills(['24h', '3d', '7d', '30d'], period, rootContainer),
  ]));

  // 3 metric cells
  const metrics = computeMobileMetrics(events, unitSys, period);
  const grid = el('div', { className: 'dash-stats-grid dash-stats-grid-mobile' });
  for (const m of metrics) {
    grid.appendChild(el('div', { className: 'm-cell', ...(m.title ? { title: m.title } : {}), ...(m.testId ? { 'data-testid': m.testId } : {}) }, [
      el('div', { className: 'mc-value', style: { color: m.color } }, [m.value]),
      el('div', { className: 'mc-label' }, [m.label]),
    ]));
  }
  statsContainer.appendChild(grid);

  return statsContainer;
}

function renderPeriodPills(options, current, rootContainer) {
  const pillRow = el('div', { className: 'dash-period-pills' });
  for (const opt of options) {
    pillRow.appendChild(el('button', {
      className: `dash-period-pill${opt === current ? ' active' : ''}`,
      'data-testid': `period-pill-${opt}`,
      onClick: () => {
        setStatsPeriod(opt);
        renderStatsRow(rootContainer);
      },
    }, [opt]));
  }
  return pillRow;
}

function getEventsInPeriod(period) {
  const allEvents = getAll('events');
  if (period === 'All') return allEvents;

  const now = new Date();
  let cutoffMs;
  switch (period) {
    case '24h': cutoffMs = 24 * 60 * 60 * 1000; break;
    case '3d':  cutoffMs = 3 * 24 * 60 * 60 * 1000; break;
    case '7d':  cutoffMs = 7 * 24 * 60 * 60 * 1000; break;
    case '30d': cutoffMs = 30 * 24 * 60 * 60 * 1000; break;
    default:    cutoffMs = 7 * 24 * 60 * 60 * 1000;
  }

  const cutoff = new Date(now.getTime() - cutoffMs);
  return allEvents.filter(e => {
    const startDate = getEventStartDate(e.id);
    if (!startDate) return false;
    const dateIn = new Date(startDate);
    const dateOut = e.dateOut ? new Date(e.dateOut) : now;
    // Event overlaps the period if it started before now and ended after cutoff
    return dateOut >= cutoff && dateIn <= now;
  });
}

/** Date-time stamp for feed rows. Missing time sorts as 00:00. */
export function feedInstant(date, time) {
  return `${date || ''}T${time || '00:00'}`;
}

/**
 * Stored-feed mass for one event, from raw entries and checks.
 * Latest check is any check (not only a close reading), ordered by date, time, then createdAt.
 * Remaining stored DM is that check's residual plus deliveries and minus removals strictly after it.
 * No check means remaining is 0 (do not invent a residual). Stored consumed is net delivered minus that remaining.
 */
export function eventStoredFeedDm(eventId) {
  const dmi1 = getCalcByName('DMI-1');
  const batches = getAll('batches');
  const batchMap = new Map(batches.map(b => [b.id, b]));
  const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === eventId);
  const entries = feedEntries.map(fe => {
    const b = batchMap.get(fe.batchId);
    const qtyUnits = fe.entryType === 'removal' ? -(fe.quantity ?? 0) : (fe.quantity ?? 0);
    return {
      qtyKg: qtyUnits * (b?.weightPerUnitKg ?? 0),
      dmPct: b?.dmPct ?? 100,
      stamp: feedInstant(fe.date, fe.time),
    };
  });
  const netDeliveredDmKg = dmi1 ? dmi1.fn({ entries, remainingDmKg: 0 }) : 0;
  const checks = getAll('eventFeedChecks')
    .filter(fc => fc.eventId === eventId)
    .sort((a, b) => {
      const byWhen = feedInstant(b.date, b.time).localeCompare(feedInstant(a.date, a.time));
      if (byWhen !== 0) return byWhen;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  const latest = checks[0] || null;
  if (!latest) {
    return {
      hasStoredFeed: feedEntries.length > 0,
      netDeliveredDmKg,
      remainingStoredDmKg: 0,
      storedConsumedKg: Math.max(0, netDeliveredDmKg),
    };
  }
  const checkStamp = feedInstant(latest.date, latest.time);
  let checkDm = 0;
  for (const ci of getAll('eventFeedCheckItems').filter(ci => ci.feedCheckId === latest.id)) {
    const b = batchMap.get(ci.batchId);
    const wpu = b?.weightPerUnitKg ?? 0;
    const dm = b?.dmPct ?? 100;
    checkDm += (ci.remainingQuantity ?? 0) * wpu * (dm / 100);
  }
  let afterDm = 0;
  for (const entry of entries) {
    if (entry.stamp > checkStamp) afterDm += entry.qtyKg * (entry.dmPct / 100);
  }
  const remainingStoredDmKg = Math.max(0, checkDm + afterDm);
  const storedConsumedKg = dmi1
    ? Math.max(0, dmi1.fn({ entries, remainingDmKg: remainingStoredDmKg }))
    : Math.max(0, netDeliveredDmKg - remainingStoredDmKg);
  return {
    hasStoredFeed: feedEntries.length > 0,
    netDeliveredDmKg,
    remainingStoredDmKg,
    storedConsumedKg,
  };
}

/** OI-0279: store rows for groupDayDmi on Home. */
function groupDmiCtx() {
  return {
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
  };
}

/**
 * OI-0075 Bug 7 / OI-0277 Hd3: shared Pasture % for the desktop and mobile
 * stat cards = Pasture DMI ÷ Total DMI over the period pill, both counted per
 * group-day inside the period (see ./home-dmi.js). The old whole-life,
 * inclusive-days stint loop (move days and overlaps twice) is retired.
 *
 * Returns { pasturePercent: number|null, color, subLabel, basisNote }.
 * @param {string} period - '24h' | '3d' | '7d' | '30d' | 'All'
 * @param {object[]} [events] - events in the period (sub-label only)
 * @param {{ today?: string, ctx?: object, homeDmi?: object }} [opts]
 */
export function computePasturePercent(period, events = getEventsInPeriod(period), opts = {}) {
  const r = opts.homeDmi || computeHomeDmi(period, opts);
  if (r.pasturePercent == null) {
    let subLabel = 'no grazing events';
    if (events.length) subLabel = r.totalDmiKg > 0 ? 'pasture DMI unknown' : 'no animals on events';
    return { pasturePercent: null, color: r.color, subLabel, basisNote: r.basisNote || null };
  }
  const closedCount = events.filter(e => e.dateOut).length;
  const openCount = events.length - closedCount;
  const subLabel = closedCount > 0
    ? `${closedCount} closed \u00B7 ${openCount} open`
    : 'open events';
  return { pasturePercent: r.pasturePercent, color: r.color, subLabel, basisNote: r.basisNote || null };
}

function computeDesktopMetrics(events, unitSys, period) {
  const cst1 = getCalcByName('CST-1');
  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = getLocalTodayStr();

  // OI-0277 Hd3: Total DMI (herd need) + Pasture DMI (implied pasture), each
  // group-day once and only inside the period; per-class DMI % (OI-0279).
  // OI-0278 Na: compact "12.3k lb" in the farm unit on Home tiles.
  const homeDmi = computeHomeDmi(period);
  const fmtTile = (kg) => formatMeasure(kg, 'weight', { unitSystem: unitSys, compact: true });

  // Feed cost
  let feedCostTotal = 0;
  if (cst1) {
    for (const event of events) {
      const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
      const batches = getAll('batches');
      const batchMap = new Map(batches.map(b => [b.id, b]));
      const costEntries = feedEntries.map(fe => ({
        qtyUnits: fe.quantity,
        costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0,
      }));
      feedCostTotal += cst1.fn({ entries: costEntries });
    }
  }

  // Pasture % — OI-0277: Pasture DMI ÷ Total DMI over the period (same counting as the tiles).
  const pastureMetric = computePasturePercent(period, events, { homeDmi });
  const pasturePercent = pastureMetric.pasturePercent;
  const pastureSub = pastureMetric.subLabel;
  const pastureColorDesktop = pastureMetric.color;

  // NPK / Acre
  let totalNPK = { n: 0, p: 0, k: 0 };
  let totalHa = 0;
  if (npk1) {
    for (const event of events) {
      const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id);
      for (const gw of gws) {
        const now = gw.dateLeft || event.dateOut || todayStr;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, animals, now });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now });
        const days = groupWindowPresenceDays(gw, {
          eventStartDate: getEventStartDate(event.id),
          eventDateOut: event.dateOut,
          eventTimeOut: event.timeOut,
          throughDate: todayStr,
        });
        const result = npk1.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          days,
          ...npkRateArgs(gw, now, { memberships, animals, animalClasses, animalWeightRecords }),
        });
        totalNPK.n += (result.nKg ?? result.n ?? 0);
        totalNPK.p += (result.pKg ?? result.p ?? 0);
        totalNPK.k += (result.kKg ?? result.k ?? 0);
      }
      for (const pw of pws) {
        const loc = getById('locations', pw.locationId);
        // OI-0075: entity field is areaHectares; areaHa kept as legacy fallback.
        const ha = loc?.areaHectares ?? loc?.areaHa;
        if (ha) {
          totalHa += Number(ha);
        }
      }
    }
  }
  // OI-0278 S2 rows 13–14: canonical kg / ha; the helper converts (lb/ac or kg/ha).
  const npkKgPerHa = totalHa > 0 ? (totalNPK.n + totalNPK.p + totalNPK.k) / totalHa : 0;
  const npkSub = (v) => formatMeasure(v, 'npk', { unitSystem: unitSys, compact: true, unitInHeader: true });
  const npkUnit = shortUnit('npk', unitSys);
  const areaText = formatMeasure(totalHa, 'area', { unitSystem: unitSys });

  // NPK Value
  let npkValue = 0;
  if (npk2 && totalHa > 0) {
    const prices = getAll('npkPriceHistory');
    const latestPrice = prices.length ? prices.sort((a, b) => new Date(b.effectiveDate) - new Date(a.effectiveDate))[0] : null;
    if (latestPrice) {
      npkValue = npk2.fn({
        nKg: totalNPK.n,
        pKg: totalNPK.p,
        kKg: totalNPK.k,
        nPricePerKg: latestPrice.nPricePerKg ?? 0,
        pPricePerKg: latestPrice.pPricePerKg ?? 0,
        kPricePerKg: latestPrice.kPricePerKg ?? 0,
      });
    }
  }
  const npkValuePerHa = totalHa > 0 ? npkValue / totalHa : 0;

  return [
    {
      value: fmtTile(homeDmi.start ? homeDmi.totalDmiKg : null),
      label: 'Total DMI',
      color: 'var(--color-green-base)',
      title: totalDmiTitle(homeDmi),
      testId: 'dashboard-total-dmi',
    },
    {
      value: fmtTile(homeDmi.pastureDmiKg),
      label: 'Pasture DMI',
      color: 'var(--color-green-dark, var(--color-green-base))',
      title: pastureDmiTitle(homeDmi),
      testId: 'dashboard-pasture-dmi',
    },
    {
      value: `$${feedCostTotal.toFixed(2)}`,
      label: 'stored feed',
      color: 'var(--color-amber-base)',
    },
    {
      value: pasturePercent !== null ? `${pasturePercent}%` : '\u2014',
      label: pastureSub || '\u00A0',
      color: pastureColorDesktop,
      title: pastureMetric.basisNote || undefined,
    },
    {
      value: npkKgPerHa > 0 ? formatPerArea(npkKgPerHa, 'npk', { unitSystem: unitSys }) : '\u2014',
      // #462: elemental label + P₂O₅ / K₂O hover (same unit + rounding as the label).
      label: totalHa > 0 ? `N${npkSub(totalNPK.n)}/P${npkSub(totalNPK.p)}/K${npkSub(totalNPK.k)} ${npkUnit} ${ELEMENTAL_SUFFIX} \u00B7 ${areaText}` : '\u00A0',
      title: totalHa > 0 ? fertilizerHover(totalNPK.p, totalNPK.k, { unitSystem: unitSys, compact: true }) || undefined : undefined,
      color: 'var(--color-purple-dark)',
      testId: 'dashboard-npk-per-area',
    },
    {
      // $ per farm area: "$/ac" or "$/ha" (count family = no weight unit).
      value: npkValuePerHa > 0 ? `$${formatPerArea(npkValuePerHa, 'count', { unitSystem: unitSys, decimals: 2 })}` : '\u2014',
      label: totalHa > 0 ? `$${npkValue.toFixed(0)} total \u00B7 ${areaText}` : '\u00A0',
      color: 'var(--color-blue-base)',
      testId: 'dashboard-npk-value-per-area',
    },
  ];
}

function computeMobileMetrics(events, unitSys, period) {
  const cst1 = getCalcByName('CST-1');
  const npk1 = getCalcByName('NPK-1');

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = getLocalTodayStr();

  // Pasture % — OI-0075 Bug 7 / OI-0277: Pasture DMI ÷ Total DMI over the period.
  const pastureMetric = computePasturePercent(period, events);
  const pastureVal = pastureMetric.pasturePercent !== null ? `${pastureMetric.pasturePercent}%` : '\u2014';
  const pastureColor = pastureMetric.color;

  // NPK / Acre
  let totalNPK = 0;
  let totalP = 0;
  let totalK = 0;
  let totalHa = 0;
  if (npk1) {
    for (const event of events) {
      const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id);
      for (const gw of gws) {
        const now = gw.dateLeft || event.dateOut || todayStr;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, animals, now });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now });
        const days = groupWindowPresenceDays(gw, {
          eventStartDate: getEventStartDate(event.id),
          eventDateOut: event.dateOut,
          eventTimeOut: event.timeOut,
          throughDate: todayStr,
        });
        const result = npk1.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          days,
          ...npkRateArgs(gw, now, { memberships, animals, animalClasses, animalWeightRecords }),
        });
        const nKg = (result.nKg ?? result.n ?? 0);
        const pKg = (result.pKg ?? result.p ?? 0);
        const kKg = (result.kKg ?? result.k ?? 0);
        totalNPK += nKg + pKg + kKg;
        totalP += pKg;
        totalK += kKg;
      }
      for (const pw of pws) {
        const loc = getById('locations', pw.locationId);
        const ha = loc?.areaHectares ?? loc?.areaHa;
        if (ha) totalHa += Number(ha);
      }
    }
  }
  // OI-0278 S2 row 15: canonical kg / ha; the helper shows lb/ac or kg/ha.
  const npkKgPerHa = totalHa > 0 ? totalNPK / totalHa : 0;

  // Feed cost / day
  let feedCostTotal = 0;
  let totalDays = 0;
  if (cst1) {
    for (const event of events) {
      const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
      const batches = getAll('batches');
      const batchMap = new Map(batches.map(b => [b.id, b]));
      const costEntries = feedEntries.map(fe => ({
        qtyUnits: fe.quantity,
        costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0,
      }));
      feedCostTotal += cst1.fn({ entries: costEntries });
      const todayStr = getLocalTodayStr();
      const startDate = getEventStartDate(event.id);
      if (startDate) totalDays += daysBetweenInclusive(startDate, event.dateOut || todayStr);
    }
  }
  const costPerDay = totalDays > 0 ? feedCostTotal / totalDays : 0;
  let costColor = 'var(--color-amber-base)';
  // Threshold per §17.4 — need head count for per-head calc (live memberships only)
  const totalHead = sumMembershipHeads(memberships, animals, m => !m.dateLeft) || 1;
  const costPerHdDay = costPerDay / totalHead;
  if (costPerHdDay < 2) costColor = 'var(--color-green-base)';
  else if (costPerHdDay > 5) costColor = 'var(--color-red-base)';

  return [
    {
      value: pastureVal,
      label: 'Pasture %',
      color: pastureColor,
      title: pastureMetric.basisNote || undefined,
    },
    {
      value: npkKgPerHa > 0 ? formatPerArea(npkKgPerHa, 'npk', { unitSystem: unitSys, compact: true }) : '\u2014',
      // #462: elemental label + per-area P₂O₅ / K₂O hover (same unit as the value).
      label: `${unitSys === 'metric' ? 'NPK / Hectare' : 'NPK / Acre'} ${ELEMENTAL_SUFFIX}`,
      title: npkKgPerHa > 0
        ? fertilizerHover(totalP / totalHa, totalK / totalHa, { unitSystem: unitSys, compact: true, perArea: true }) || undefined
        : undefined,
      testId: 'dashboard-npk-per-area',
      color: 'var(--color-purple-dark)',
    },
    {
      value: costPerDay > 0 ? `$${costPerDay.toFixed(2)}/d` : '\u2014',
      label: 'Feed $/day',
      color: costColor,
    },
  ];
}

// ---------------------------------------------------------------------------
// §17.5: View toggle
// ---------------------------------------------------------------------------

function renderViewToggle(rootContainer) {
  const toggleEl = rootContainer.querySelector('[data-testid="dashboard-toggle"]');
  if (!toggleEl) return;
  clear(toggleEl);

  const mode = getViewMode();

  const toggle = el('div', { className: 'dash-view-toggle' }, [
    el('span', { className: 'dash-view-label' }, [t('dashboard.viewLabel')]),
    el('button', {
      className: `dash-view-btn${mode === 'groups' ? ' active' : ''}`,
      'data-testid': 'toggle-groups',
      onClick: () => {
        setViewMode('groups');
        renderViewToggle(rootContainer);
        renderCardGrid(rootContainer);
      },
    }, [t('settings.homeGroups')]),
    el('button', {
      className: `dash-view-btn${mode === 'locations' ? ' active' : ''}`,
      'data-testid': 'toggle-locations',
      onClick: () => {
        setViewMode('locations');
        renderViewToggle(rootContainer);
        renderCardGrid(rootContainer);
      },
    }, [t('settings.homeLocations')]),
  ]);

  toggleEl.appendChild(toggle);
}

// ---------------------------------------------------------------------------
// Card grid — dispatches to groups or locations view
// ---------------------------------------------------------------------------

function renderCardGrid(rootContainer) {
  const gridEl = rootContainer.querySelector('[data-testid="dashboard-card-grid"]');
  if (!gridEl) return;
  clear(gridEl);

  const mode = getViewMode();
  if (mode === 'groups') {
    renderGroupsView(gridEl);
  } else {
    renderLocationsView(gridEl);
  }
}

// ---------------------------------------------------------------------------
// §17.6: Groups view
// ---------------------------------------------------------------------------

function renderGroupsView(gridEl) {
  const groups = getAll('groups').filter(g => !g.archivedAt);
  const unitSys = getUnitSystem();

  if (!groups.length) {
    gridEl.appendChild(el('div', { className: 'dash-empty-card card', 'data-testid': 'dashboard-empty' }, [
      el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: 'var(--space-3)' } }, [t('dashboard.noGroupsTitle')]),
      el('div', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [t('dashboard.noGroupsDesc')]),
      el('button', {
        className: 'btn btn-teal btn-sm',
        onClick: () => navigate('#/settings'),
      }, [t('dashboard.goToSettings')]),
    ]));
    return;
  }

  const operationId = getAll('operations')[0]?.id;
  const farmId = getActiveFarmId() || getAll('farms')[0]?.id;

  const grid = el('div', { className: 'dash-grid' });
  for (const group of groups) {
    grid.appendChild(renderGroupCard(group, unitSys, operationId, farmId));
  }
  gridEl.appendChild(grid);
}

function renderGroupCard(group, unitSys, operationId, farmId) {
  // OI-0205: shared current-placement resolver (open parent first, latest-joined).
  const placement = resolveGroupCurrentPlacement(group.id);
  const activeGW = placement.groupWindow;
  const activeEvent = placement.event;
  const isOnPasture = placement.placed;

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = getLocalTodayStr();

  // Live values for the active open window (OI-0091).
  const activeLiveHead = activeGW
    ? getLiveWindowHeadCount(activeGW, { memberships, animals, now: todayStr })
    : 0;
  const activeLiveAvg = activeGW
    ? getLiveWindowAvgWeight(activeGW, { memberships, animals, animalClasses, animalWeightRecords, now: todayStr })
    : getLiveWindowAvgWeight(
      { groupId: group.id, dateLeft: null },
      { memberships, animals, animalClasses, animalWeightRecords, now: todayStr },
    );

  // Head count — use live memberships (same logic for groups not on pasture).
  const headCount = sumMembershipHeads(memberships, animals, m => m.groupId === group.id && !m.dateLeft);

  // Average weight. Unplaced groups have no window, so the average still
  // comes from the same live helper (lot total / head for a composite).
  const avgWeightDisplay = activeLiveAvg > 0
    ? formatMeasure(activeLiveAvg, 'weight', { unitSystem: unitSys, decimals: 0 })
    : '';

  // Location info
  let locationName = '';
  let dayCount = 0;
  if (isOnPasture) {
    locationName = placement.displayName;
    const startDate = getEventStartDate(activeEvent.id);
    dayCount = startDate ? daysBetweenInclusive(startDate, todayStr) : 0;
  }

  // Composition line
  const groupAnimalIds = new Set(
    memberships.filter(m => m.groupId === group.id && !m.dateLeft).map(m => m.animalId)
  );
  const groupAnimals = animals.filter(a => groupAnimalIds.has(a.id));
  const classCounts = {};
  const allClasses = getAll('animalClasses');
  for (const a of groupAnimals) {
    const cls = allClasses.find(c => c.id === a.classId);
    const label = cls ? cls.name : 'Unknown';
    classCounts[label] = (classCounts[label] || 0) + animalHeadCount(a);
  }
  const compositionLine = Object.entries(classCounts).map(([label, count]) => `${count} ${label}`).join(' \u00B7 ');

  // Sub-move count
  const subMoveCount = isOnPasture
    ? getAll('eventPaddockWindows').filter(w => w.eventId === activeEvent.id && w.dateClosed).length
    : 0;

  // Feed count and cost
  let feedCount = 0;
  let feedCost = 0;
  if (isOnPasture) {
    const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === activeEvent.id);
    feedCount = feedEntries.length;
    const batches = getAll('batches');
    const batchMap = new Map(batches.map(b => [b.id, b]));
    const cst1 = getCalcByName('CST-1');
    if (cst1) {
      const costEntries = feedEntries.map(fe => ({
        qtyUnits: fe.quantity,
        costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0,
      }));
      feedCost = cst1.fn({ entries: costEntries });
    }
  }

  // NPK deposited
  let npkEl = null;
  if (isOnPasture && activeGW && activeLiveAvg > 0) {
    const npk1 = getCalcByName('NPK-1');
    if (npk1) {
      const days = groupWindowPresenceDays(activeGW, {
        eventStartDate: getEventStartDate(activeEvent.id) || todayStr,
        eventDateOut: activeEvent?.dateOut,
        eventTimeOut: activeEvent?.timeOut,
        throughDate: todayStr,
      });
      const result = npk1.fn({
        headCount: activeLiveHead,
        avgWeightKg: activeLiveAvg,
        days,
        ...npkRateArgs(activeGW, todayStr),
      });
      // OI-0073 Part C: NPK-1 returns {nKg,pKg,kKg}; legacy fallback to {n,p,k}. Prevents NaN.
      // OI-0278 S2 row 17: farm unit via the helper, one unit after the triple.
      const nv = (v) => formatMeasure(v ?? 0, 'npk', { unitSystem: unitSys, unitInHeader: true });
      npkEl = el('div', {
        style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-3)' },
        title: fertilizerHover(result.pKg ?? result.p, result.kKg ?? result.k, { unitSystem: unitSys }) || undefined,
      }, [
        `NPK deposited ${ELEMENTAL_SUFFIX}: N${nv(result.nKg ?? result.n)} P${nv(result.pKg ?? result.p)} K${nv(result.kKg ?? result.k)} ${shortUnit('npk', unitSys)}`,
      ]);
    }
  }

  // Gender breakdown
  let females = 0;
  let males = 0;
  for (const a of groupAnimals) {
    const heads = animalHeadCount(a);
    if (a.sex === 'female') females += heads;
    else if (a.sex === 'male') males += heads;
  }
  const genderLine = [females > 0 ? `${females} female` : null, males > 0 ? `${males} male` : null].filter(Boolean).join(', ') || compositionLine;

  // NPK fert value
  let npkValueStr = '';
  if (npkEl) {
    const npk2 = getCalcByName('NPK-2');
    if (npk2) {
      const prices = getAll('npkPriceHistory').sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
      if (prices) {
        const npk1 = getCalcByName('NPK-1');
        const days2 = groupWindowPresenceDays(activeGW, {
          eventStartDate: (activeEvent && getEventStartDate(activeEvent.id)) || todayStr,
          eventDateOut: activeEvent?.dateOut,
          eventTimeOut: activeEvent?.timeOut,
          throughDate: todayStr,
        });
        const r = npk1.fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg, days: days2, ...npkRateArgs(activeGW, todayStr) });
        const val = npk2.fn({ nKg: r.nKg ?? r.n ?? 0, pKg: r.pKg ?? r.p ?? 0, kKg: r.kKg ?? r.k ?? 0, nPricePerKg: prices.nPricePerKg ?? 0, pPricePerKg: prices.pPricePerKg ?? 0, kPricePerKg: prices.kPricePerKg ?? 0 });
        npkValueStr = ` \u00B7 $${val.toFixed(2)} fert value`;
      }
    }
  }

  // DMI target display
  let dmiTargetDisplay = '';
  let dmiTargetNote = null;
  if (isOnPasture && activeGW) {
    const dmi2 = getCalcByName('DMI-2');
    if (dmi2) {
      const dmiRes = groupDayDmi(activeGW, todayStr, {
        ...groupDmiCtx(), head: activeLiveHead, avgWeightKg: activeLiveAvg,
      });
      // OI-0278 S2 row 18: "1,234 lb/day" (farm unit + "/day").
      dmiTargetDisplay = `${formatMeasure(dmiRes.kg, 'weight', { unitSystem: unitSys })}/day`;
      // OI-0279 Design note: Group-card DMI line names any per-class fallback.
      dmiTargetNote = dmiBasisNote([{ ...dmiRes, groupWindow: activeGW }]);
    }
  }

  // AU — OI-0157-B1: route through ANI-AU registry call.
  const auValue = activeGW
    ? getCalcByName('ANI-AU').fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg })
    : 0;

  // Build v1-parity card
  const isExpanded = expandedGroups.has(group.id) || isOnPasture;

  const card = el('div', {
    className: `grp-card${isExpanded ? ' expanded' : ''}`,
    'data-testid': `dashboard-group-card-${group.id}`,
  });

  // Header
  const header = el('div', { className: 'grp-card-hdr', onClick: () => {
    if (expandedGroups.has(group.id)) expandedGroups.delete(group.id);
    else expandedGroups.add(group.id);
    card.classList.toggle('expanded');
  } }, [
    el('div', { className: 'grp-color-bar', style: { background: group.color || 'var(--green)' } }),
    el('div', { style: { flex: '1', minWidth: '0' } }, [
      el('div', { style: { fontSize: '15px', fontWeight: '600', lineHeight: '1.3' } }, [group.name]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [
        `${headCount} head \u00B7 avg ${avgWeightDisplay} \u00B7 ${locationName || 'not placed'}`,
      ]),
    ]),
    el('svg', { className: 'grp-chevron', width: '18', height: '18', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round' }, [
      el('polyline', { points: '6 9 12 15 18 9' }),
    ]),
  ]);
  card.appendChild(header);

  // Body
  const body = el('div', { className: 'grp-card-body' });

  // Composition
  if (genderLine) body.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' } }, [genderLine]));

  // Location bar
  if (isOnPasture) {
    const locBarParts = [`Day ${dayCount}`];
    if (feedCount > 0) locBarParts.push(`${feedCount} feedings`);
    if (feedCost > 0) locBarParts.push(`$${feedCost.toFixed(2)}`);
    if (auValue > 0) locBarParts.push(`${auValue.toFixed(1)} AU`);

    body.appendChild(el('div', { className: 'grp-loc-bar' }, [
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [
          `\uD83C\uDF3F ${locationName} `,
          el('span', { className: 'badge bg', style: { fontSize: '10px' } }, ['grazing']),
        ]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '2px' } }, [locBarParts.join(' \u00B7 ')]),
        subMoveCount > 0 ? el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '2px' } }, [`${subMoveCount} sub-moves`]) : null,
      ].filter(Boolean)),
    ]));
  } else {
    body.appendChild(el('div', { className: 'grp-loc-bar', style: { opacity: '0.6' } }, [
      el('div', { style: { fontSize: '13px', color: 'var(--text2)' } }, ['Not currently placed']),
    ]));
  }

  // DMI + NPK block
  if (isOnPasture && dmiTargetDisplay) {
    const dmiBlock = el('div', {
      style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' },
      'data-testid': `dashboard-group-dmi-${group.id}`,
      ...(dmiTargetNote ? { title: dmiTargetNote } : {}),
    }, [
      `${t('dmi.targetForecast')} ${dmiTargetDisplay}`,
    ]);
    dmiBlock.appendChild(el('div', { className: 'prog', style: { marginTop: '4px' } }, [
      el('div', { className: 'prog-fill', style: { width: '0%', background: 'var(--amber)' } }),
    ]));
    // NPK line (purple)
    if (npkEl) {
      const npk1b = getCalcByName('NPK-1');
      const days4 = groupWindowPresenceDays(activeGW, {
        eventStartDate: (activeEvent && getEventStartDate(activeEvent.id)) || todayStr,
        eventDateOut: activeEvent?.dateOut,
        eventTimeOut: activeEvent?.timeOut,
        throughDate: todayStr,
      });
      const r2 = npk1b.fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg, days: days4, ...npkRateArgs(activeGW, todayStr) });
      // OI-0278 S2 row 19: farm unit via the helper.
      const nv = (v) => formatMeasure(v ?? 0, 'npk', { unitSystem: unitSys, unitInHeader: true });
      // #462: elemental label + P₂O₅ / K₂O hover.
      dmiBlock.appendChild(el('div', {
        style: { fontSize: '11px', color: 'var(--purple-d)', marginTop: '3px' },
        'data-testid': `dashboard-group-npk-${group.id}`,
        title: fertilizerHover(r2.pKg ?? r2.p, r2.kKg ?? r2.k, { unitSystem: unitSys }) || undefined,
      }, [
        `NPK deposited ${ELEMENTAL_SUFFIX}: N${nv(r2.nKg ?? r2.n)} / P${nv(r2.pKg ?? r2.p)} / K${nv(r2.kKg ?? r2.k)} ${shortUnit('npk', unitSys)}${npkValueStr}`,
      ]));
    }
    body.appendChild(dmiBlock);
  }

  // Action buttons
  body.appendChild(el('div', { className: 'grp-actions' }, [
    isOnPasture
      ? el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-move-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); openMoveWizard(activeEvent, operationId, farmId, { scopedGroupWindowId: activeGW?.id }); } }, ['Move'])
      : el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-place-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); openPlaceWizard(group.id, operationId, farmId); } }, ['Place']),
    el('button', { className: 'btn btn-outline', onClick: (e) => { e.stopPropagation(); navigate('#/animals'); } }, ['Weights']),
    el('button', { className: 'btn btn-outline', onClick: (e) => { e.stopPropagation(); navigate('#/animals'); } }, ['Edit']),
  ]));

  // OI-0157-C: stamp the active-event UUID under the action row when the
  // user is_dev. Gated on `activeEvent` non-null — closed groups with no
  // active event have no UUID to stamp. Same pattern as the open-event card
  // in `buildLocationCard` for cross-tab audit workflow.
  if (activeEvent && isCurrentUserDev(operationId)) {
    body.appendChild(el('div', {
      'data-testid': `dashboard-dev-event-id-${activeEvent.id}`,
      style: {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: 'var(--text2)',
        marginTop: '2px',
        userSelect: 'text',
      },
    }, [activeEvent.id]));
  }

  card.appendChild(body);
  return card;
}

// ---------------------------------------------------------------------------
// §17.7: Locations view
// ---------------------------------------------------------------------------

function renderLocationsView(gridEl) {
  const activeEvents = getVisibleEvents().filter(e => !e.dateOut);
  const groups = getVisibleGroups().filter(g => !g.archivedAt);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const animals = getAll('animals');
  const operationId = getAll('operations')[0]?.id;
  const farmId = getActiveFarmId() || getAll('farms')[0]?.id;
  const unitSys = getUnitSystem();

  if (!activeEvents.length && !groups.length) {
    gridEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'dashboard-empty' }, [
      t('dashboard.noActiveEvents'),
    ]));
    return;
  }

  const grid = el('div', { className: 'dash-grid' });

  // Active event cards — one per event (SP-3: v1 parity)
  for (const event of activeEvents) {
    grid.appendChild(buildLocationCard(event, operationId, farmId, unitSys));
  }

  gridEl.appendChild(grid);

  // Unplaced groups section — OI-0205: same resolver as group tiles
  const unplacedGroups = groups.filter(g => !resolveGroupCurrentPlacement(g.id).placed);

  if (unplacedGroups.length) {
    const section = el('div', { style: { marginTop: 'var(--space-5)' } }, [
      el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('dashboard.unplacedGroups')]),
    ]);
    for (const group of unplacedGroups) {
      const hc = sumMembershipHeads(memberships, animals, m => m.groupId === group.id);
      section.appendChild(el('div', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', padding: '10px 14px' } }, [
        el('span', { style: { fontSize: '13px' } }, [`${group.name} \u00B7 ${hc} head`]),
        el('button', { className: 'btn btn-teal btn-sm', 'data-testid': `dashboard-unplaced-place-btn-${group.id}`, onClick: () => openPlaceWizard(group.id, operationId, farmId) }, [t('dashboard.place')]),
      ]));
    }
    gridEl.appendChild(section);
  }
}

// ---------------------------------------------------------------------------
// §17.7a: Location card builder (SP-3 — v1 parity)
// ---------------------------------------------------------------------------

/**
 * OI-0280 Dp3 line: "Target 1,410 · hay eaten 1,020 lb DM/day (72%) · pasture ≈ 390".
 * Units via the OI-0278 helper only. Stored-only windows: "eating X under/over
 * target", amber when > 10 % off; grazing never amber/red, pasture green.
 * @param {ReturnType<typeof computeEventDmiActual>} a
 */
export function renderDmiActualLine(a, eventId, unitSys, dmiNote = null) {
  const num = (kg) => formatMeasure(kg, 'weight', { unitSystem: unitSys, decimals: 0, unitInHeader: true });
  const withUnit = (kg) => formatMeasure(kg, 'weight', { unitSystem: unitSys, decimals: 0 });
  const parts = [
    el('span', {}, [t('dmi.actualTarget', { target: num(a.targetKgPerDay) })]),
    el('span', {}, [t('dmi.actualHayEaten', {
      hay: withUnit(a.hayKgPerDay), pct: a.hayPct == null ? '—' : Math.round(a.hayPct),
    })]),
  ];
  const hints = [];
  if (a.kind !== 'stored') {
    parts.push(el('span', {
      style: { color: 'var(--color-green-dark, var(--color-green-base))' },
      'data-testid': `dashboard-loc-dmi-actual-pasture-${eventId}`,
    }, [t('dmi.actualPasture', { pasture: num(a.pastureKgPerDay) })]));
    const over = num(a.hayOverKgPerDay);
    if (a.hayOverKgPerDay > 0 && over !== '0') {
      parts.push(el('span', {}, [t('dmi.actualHayOver', { over })]));
    }
  }
  if (a.kind !== 'grazing' && a.storedGapKgPerDay != null) {
    const under = a.storedGapKgPerDay < 0;
    let text = t(under ? 'dmi.actualUnder' : 'dmi.actualOver', { gap: num(Math.abs(a.storedGapKgPerDay)) });
    if (a.kind === 'mixed') text += ` ${t('dmi.actualOnStoredDays')}`;
    parts.push(el('span', {}, [text]));
    hints.push(t(under ? 'dmi.actualUnderHint' : 'dmi.actualOverHint'));
  }
  const children = [];
  parts.forEach((p, i) => {
    if (i) children.push(' \u00B7 ');
    children.push(p);
  });
  hints.unshift(t('dmi.actualWindow', { start: a.windowStart, end: a.windowEnd }));
  if (dmiNote) hints.push(dmiNote);
  return el('div', {
    style: {
      fontSize: '12px',
      marginBottom: '2px',
      ...(a.amber ? { color: 'var(--color-amber-dark, #92400E)' } : {}),
    },
    'data-testid': `dashboard-loc-dmi-${eventId}`,
    'data-dmi-actual': a.kind,
    ...(a.amber ? { 'data-amber': 'true' } : {}),
    title: hints.join('. '),
  }, children);
}

export function buildLocationCard(event, operationId, farmId, unitSys) {
  const todayStr = getLocalTodayStr();
  const allPws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id);
  const openPws = allPws.filter(w => !w.dateClosed);
  const primaryPw = openPws[0];

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');

  // Location name + acreage (multi-paddock: comma-join names, sum area).
  // OI-0075 Bug 3 root cause: every site here used `loc.areaHa`, but the
  // location entity stores the column as `areaHectares`. That silently made
  // `totalAreaHa` always 0 on real Supabase data, which in turn made the
  // capacity-line gate (`availableDmKg > 0`) fail because FOR-1 never ran
  // (it requires a positive area). Using the entity field name fixes it.
  const locArea = (l) => l?.areaHectares ?? l?.areaHa ?? 0;
  let locName, totalAreaHa = 0;
  if (openPws.length > 1) {
    for (const pw of openPws) {
      totalAreaHa += locArea(getById('locations', pw.locationId));
    }
    locName = formatPaddockDisplayName(listOpenPaddocksForEvent(
      event.id, getAll('eventPaddockWindows'), getAll('locations'),
    )) || '?';
  } else {
    const loc = primaryPw ? getById('locations', primaryPw.locationId) : null;
    locName = loc?.name || '?';
    totalAreaHa = locArea(loc);
  }
  // OI-0278 S2: helper formatting for every unit-bearing value on this card.
  const fmtW = (kg, opts = {}) => formatMeasure(kg, 'weight', { unitSystem: unitSys, ...opts });

  // Groups
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && !gw.dateLeft);
  const liveByGwId = new Map();
  let totalHead = 0, totalWeightKg = 0;
  for (const gw of gws) {
    const liveHead = getLiveWindowHeadCount(gw, { memberships, animals, now: todayStr });
    const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now: todayStr });
    liveByGwId.set(gw.id, { head: liveHead, avg: liveAvg });
    totalHead += liveHead;
    totalWeightKg += liveHead * liveAvg;
  }

  // Calcs
  const cst1 = getCalcByName('CST-1');
  const dmi2 = getCalcByName('DMI-2');
  const dmi4 = getCalcByName('DMI-4');
  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');
  const for1 = getCalcByName('FOR-1');
  const for2 = getCalcByName('FOR-2');
  const for3 = getCalcByName('FOR-3');
  const for4 = getCalcByName('FOR-4');
  const dmi8 = getCalcByName('DMI-8');

  const eventStartDate = getEventStartDate(event.id);
  const dayCount = eventStartDate ? daysBetweenInclusive(eventStartDate, todayStr) : 0;

  // Feed cost
  const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
  const batches = getAll('batches');
  const batchMap = new Map(batches.map(b => [b.id, b]));
  let feedCost = 0;
  if (cst1 && feedEntries.length) {
    feedCost = cst1.fn({ entries: feedEntries.map(fe => ({ qtyUnits: fe.entryType === 'removal' ? -(fe.quantity) : fe.quantity, costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0 })) });
  }
  const hasStoredFeed = feedEntries.length > 0;

  // Event type badge
  const isPureConfinement = isPureConfinementOnDate({
    paddockWindows: allPws,
    locations: getAll('locations'),
    eventId: event.id,
    date: todayStr,
  });
  let eventType = 'grazing';
  if (isPureConfinement) eventType = 'confinement';
  else if (hasStoredFeed && totalAreaHa > 0) eventType = 'stored feed & grazing';
  else if (hasStoredFeed) eventType = 'stored feed';

  // DMI
  let dailyDmiKg = 0;
  const dmiResults = [];
  if (dmi2) {
    const ctx = groupDmiCtx();
    for (const gw of gws) {
      const live = liveByGwId.get(gw.id) || { head: 0, avg: 0 };
      // OI-0279: per-class DMI % from the group's member mix today.
      const d = groupDayDmi(gw, todayStr, { ...ctx, head: live.head, avgWeightKg: live.avg });
      dmiResults.push({ ...d, groupWindow: gw });
      dailyDmiKg += d.kg;
    }
  }
  const dmiNote = dmiBasisNote(dmiResults);

  // Stored feed: every check counts, not only a close reading. Deliveries and
  // removals strictly after that check adjust the residual. No check → residual 0.
  const feedMass = eventStoredFeedDm(event.id);
  const storedConsumedKg = feedMass.storedConsumedKg;
  const remainingStoredDmKg = feedMass.remainingStoredDmKg;

  // Forage / capacity — sum FOR-1 per open PW (A1+B1+C1); shared pickPreGraze.
  // paddock_observations type='open' source='event' (event_observations dropped in migration 029).
  const observations = getAll('paddockObservations')
    .filter((o) => o.type === 'open' && o.source === 'event');
  const locationsMap = {};
  const forageTypesMap = {};
  let forageType = null;
  for (const pw of openPws) {
    const locRow = getById('locations', pw.locationId);
    if (!locRow) continue;
    const locEntry = {
      areaHa: locArea(locRow),
      forageTypeId: locRow.forageTypeId ?? null,
      type: locRow.type ?? null,
      name: locRow.name,
    };
    locationsMap[pw.locationId] = locEntry;
    if (locRow.forageTypeId) {
      const ft = getById('forageTypes', locRow.forageTypeId);
      if (ft) {
        forageTypesMap[pw.locationId] = {
          dmKgPerCmPerHa: ft.dmKgPerCmPerHa,
          minResidualHeightCm: ft.minResidualHeightCm,
          utilizationPct: ft.utilizationPct,
          name: ft.name,
        };
        if (!forageType && !isConfinementLocation(locEntry)) forageType = ft;
      }
    }
  }

  const forageAgg = aggregateOpenPaddockForage(openPws, {
    observations,
    locations: locationsMap,
    forageTypes: forageTypesMap,
    for1Fn: for1?.fn,
  });

  let availableDmKg = forageAgg.availableDmKg;
  let estAuds = 0, daysRemaining = 0, forageHeightDisplay = '';
  // Track why capacity can't be computed so the user sees "what's missing" hints
  // instead of a silent disappearance (OI-0075 Bug 3).
  const capacityBlockers = [];
  const landOpenPws = openPws.filter((pw) => !isConfinementLocation(locationsMap[pw.locationId]));
  const anyForageType = landOpenPws.some((pw) => forageTypesMap[pw.locationId]?.dmKgPerCmPerHa);
  const anyPreGrazeHeight = landOpenPws.some((pw) => !!pickPreGraze(pw, observations)?.forageHeightCm);
  if (landOpenPws.length && !anyForageType) capacityBlockers.push('forage type');
  if (landOpenPws.length && !anyPreGrazeHeight) capacityBlockers.push('forage height');
  if (totalHead <= 0) capacityBlockers.push('animals');
  if (totalAreaHa <= 0) capacityBlockers.push('paddock area');

  if (for1 && availableDmKg > 0) {
    if (for2) estAuds = for2.fn({ availableDmKg, dmPerAudKg: 11 });
  }
  if (forageAgg.heightCm != null) {
    // OI-0278 S2 row 20: "4.0 in" / "10.2 cm" (no trailing inch mark).
    forageHeightDisplay = formatMeasure(forageAgg.heightCm, 'length', { unitSystem: unitSys });
  }

  // Pasture bottoms at 0 and cannot exceed the FOR-1 estimate when we have one.
  // Stored feed on the card stays the consumed amount (deliveries minus residual).
  let pasturePct = 100, storedPct = 0, pastureDmKg = 0, storedDmKg = 0;
  const totalDmiKgPeriod = dailyDmiKg * dayCount;
  const for1Ran = forageAgg.withUsablePreGraze > 0;
  if (dmi4 && totalDmiKgPeriod > 0) {
    const split = dmi4.fn({
      totalDmiKg: totalDmiKgPeriod,
      storedConsumedKg,
      ...(for1Ran ? { availablePastureDmKg: availableDmKg } : {}),
    });
    pasturePct = Math.round(split.pasturePct);
    storedPct = 100 - pasturePct;
    pastureDmKg = split.pastureDmiKg;
    storedDmKg = split.storedDmiKg;
  }

  // Project remaining pasture and hay through today (DMI-8 cascade). The
  // physical check residual does not shrink by itself; each day since the
  // anchor eats estimated DMI, and deliveries after the check stay in the bucket.
  let projected = null;
  if (dmi8) {
    const chartCtx = buildDmi8ChartContext(event.id);
    if (chartCtx?.event?.dateIn) {
      const proj = dmi8.fn({
        event: chartCtx.event,
        date: todayStr,
        groupWindows: chartCtx.groupWindows,
        memberships: chartCtx.memberships,
        animals: chartCtx.animals,
        animalWeightRecords: chartCtx.animalWeightRecords,
        feedEntries: chartCtx.feedEntries,
        feedChecks: chartCtx.feedChecks,
        feedCheckItems: chartCtx.feedCheckItems,
        batches: chartCtx.batches,
        feedTypes: chartCtx.feedTypes,
        paddockWindows: chartCtx.paddockWindows,
        observations: chartCtx.observations,
        forageTypes: chartCtx.forageTypes,
        locations: chartCtx.locations,
        animalClasses: chartCtx.animalClasses,
      });
      if (typeof proj.remainingStoredDmKg === 'number' && typeof proj.remainingPastureDmKg === 'number') {
        projected = proj;
      }
    }
  }

  // No stored feed and no projection: forage-only FOR-3. Otherwise FOR-4 on
  // leftover forage plus hay still out. The label is only for a non-zero hay remainder.
  let daysIncludeStored = false;
  if (dailyDmiKg > 0) {
    if (projected && for4) {
      daysRemaining = for4.fn({
        remainingStoredDmKg: projected.remainingStoredDmKg,
        forageEstimateKg: projected.remainingPastureDmKg,
        groupDmiKgPerDay: dailyDmiKg,
      });
      daysIncludeStored = projected.remainingStoredDmKg > 0;
    } else if (!hasStoredFeed && for3 && availableDmKg > 0) {
      daysRemaining = for3.fn({ availableDmKg, groupDmiKgPerDay: dailyDmiKg });
    } else if (hasStoredFeed && for4) {
      const forageLeftKg = Math.max(0, availableDmKg - pastureDmKg);
      daysRemaining = for4.fn({
        remainingStoredDmKg,
        forageEstimateKg: forageLeftKg,
        groupDmiKgPerDay: dailyDmiKg,
      });
      daysIncludeStored = remainingStoredDmKg > 0;
    }
  }

  // Weight + AU — OI-0157-B1: route through ANI-AU registry call. Math is
  // preserved via the headCount × (totalWeightKg / max(totalHead, 1))
  // back-conversion; for totalHead=0 the empty-group result remains 0.
  const auValue = getCalcByName('ANI-AU').fn({
    headCount: totalHead,
    avgWeightKg: totalWeightKg / Math.max(totalHead, 1),
  });

  // ADA (animal days per acre) — OI-0157-B1: ANI-AUD + ANI-ADA chain.
  // OI-0278 S2 row 21: ADA per canonical ha (AUDs ÷ ha — ANI-ADA's ratio on the
  // stored area); the helper shows "/ac" or "/ha".
  const aUds = getCalcByName('ANI-AUD').fn({ au: auValue, days: dayCount });
  const adaPerHa = totalAreaHa > 0 ? aUds / totalAreaHa : 0;
  const adaText = totalAreaHa > 0 ? `ADA est: ${formatPerArea(adaPerHa, 'count', { unitSystem: unitSys })}` : '';

  // NPK
  let npkLine = null;
  let npkTitle = null;
  if (npk1 && gws.length) {
    let totalN = 0, totalP = 0, totalK = 0;
    for (const gw of gws) {
      const days = groupWindowPresenceDays(gw, {
        eventStartDate: getEventStartDate(event.id),
        eventDateOut: event.dateOut,
        eventTimeOut: event.timeOut,
        throughDate: todayStr,
      });
      const live = liveByGwId.get(gw.id) || { head: 0, avg: 0 };
      const r = npk1.fn({
        headCount: live.head, avgWeightKg: live.avg, days,
        ...npkRateArgs(gw, todayStr),
      });
      totalN += r.nKg ?? r.n ?? 0;
      totalP += r.pKg ?? r.p ?? 0;
      totalK += r.kKg ?? r.k ?? 0;
    }
    // OI-0278 S2 row 22: farm unit via the helper.
    const nv = (v) => formatMeasure(v, 'npk', { unitSystem: unitSys, unitInHeader: true });
    // #462: elemental label + P₂O₅ / K₂O hover.
    let npkText = `NPK ${ELEMENTAL_SUFFIX}: N${nv(totalN)} / P${nv(totalP)} / K${nv(totalK)} ${shortUnit('npk', unitSys)}`;
    npkTitle = fertilizerHover(totalP, totalK, { unitSystem: unitSys });
    if (npk2) {
      const prices = getAll('npkPriceHistory').sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
      if (prices) {
        const val = npk2.fn({ nKg: totalN, pKg: totalP, kKg: totalK, nPricePerKg: prices.nPricePerKg ?? 0, pPricePerKg: prices.pPricePerKg ?? 0, kPricePerKg: prices.kPricePerKg ?? 0 });
        npkText += ` \u00B7 $${val.toFixed(2)} value`;
      }
    }
    npkLine = npkText;
  }

  // Daily DMI display
  // OI-0278 S2 row 23: "1,234 lb/day" in the farm unit.
  const dailyDmiDisplay = dailyDmiKg > 0 ? `${fmtW(dailyDmiKg)}/day` : null;

  // Neighbors sit under the open set. A cohort opened together is the base,
  // not one real paddock plus sub-moves. A sole open window has no sub rows.
  const sortedPws = [...allPws].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  const openSorted = [...openPws].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  const cohortCounts = new Map();
  for (const pw of openSorted) {
    if (!pw.openCohortId) continue;
    cohortCounts.set(pw.openCohortId, (cohortCounts.get(pw.openCohortId) || 0) + 1);
  }
  let baseCohortId = null;
  for (const pw of openSorted) {
    if (pw.openCohortId && cohortCounts.get(pw.openCohortId) >= 2) {
      baseCohortId = pw.openCohortId;
      break;
    }
  }
  let subPaddocks;
  if (baseCohortId) {
    subPaddocks = sortedPws.filter((pw) => pw.openCohortId !== baseCohortId);
  } else if (openSorted.length < 2) {
    subPaddocks = [];
  } else {
    subPaddocks = openSorted;
  }
  const hasSubMoves = subPaddocks.length > 0;

  // --- Build card ---
  const children = [];

  // §1: Left accent bar via border-left
  // §2: Header row
  children.push(el('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-2)' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', { style: { fontSize: '22px', color: 'var(--color-green-base)' } }, ['\uD83C\uDF3F']),
      el('span', { style: { fontSize: '18px', fontWeight: '700' } }, [locName]),
      // OI-0278 S2 row 24: area in the farm unit ("9.9 ac" / "4.0 ha"; was acres labelled ha on metric).
      totalAreaHa > 0 ? el('span', { style: { fontSize: '14px', fontWeight: '400', color: 'var(--text2)' }, 'data-testid': `dashboard-loc-area-${event.id}` }, [formatMeasure(totalAreaHa, 'area', { unitSystem: unitSys })]) : null,
    ].filter(Boolean)),
    // §3: Top-right action buttons
    el('div', { style: { display: 'flex', gap: '6px' } }, [
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `dashboard-edit-btn-${event.id}`,
        onClick: () => openEventDetailSheet(event, operationId, farmId),
      }, [t('action.edit')]),
      el('button', {
        className: 'btn btn-teal btn-xs',
        'data-testid': `dashboard-move-btn-${event.id}`,
        onClick: () => openMoveWizard(event, operationId, farmId),
      }, [t('dashboard.move')]),
    ]),
  ]));

  // OI-0157-C: stamp the full event UUID under the action row when the user
  // is_dev so cross-tab audit (dashboard ↔ #/dev/audit?id=…) works in two
  // clicks instead of three. `userSelect: 'text'` overrides any inherited
  // user-select: none so double-click selection works for copy.
  if (isCurrentUserDev(operationId)) {
    children.push(el('div', {
      'data-testid': `dashboard-dev-event-id-${event.id}`,
      style: {
        fontSize: '10px',
        fontFamily: 'monospace',
        color: 'var(--text2)',
        marginTop: '2px',
        marginBottom: 'var(--space-2)',
        userSelect: 'text',
      },
    }, [event.id]));
  }

  // §4 + §5: Event type badge + summary line
  children.push(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: 'var(--space-2)' } }, [
    el('span', { className: 'dash-chip-green' }, [eventType]),
    `Day ${dayCount} \u00B7 In ${eventStartDate ? formatShortDate(eventStartDate) : '\u2014'} \u00B7 $${feedCost.toFixed(2)}`,
  ]));

  // §6: Weight line
  if (totalHead > 0) {
    children.push(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: 'var(--space-1)' } }, [
      // OI-0278 S2 row 25: herd weight in the farm unit (was lb labelled kg on metric).
      `Weight: ${fmtW(totalWeightKg > 0 ? totalWeightKg : 0)} \u00B7 ${auValue.toFixed(1)} AU`,
    ]));
  }

  // §7: Capacity line (green) — pure confinement uses the shared feed-days
  // projection (OI-0209) and keeps forage information visible but inactive.
  if (isPureConfinement) {
    children.push(renderInactiveForageSummary({
      forageTypeName: forageType?.name,
      heightDisplay: forageHeightDisplay || '',
      testId: `dashboard-confinement-forage-${event.id}`,
    }));
    const feedLine = renderEventFeedRemainingLine(event.id, {
      today: todayStr,
      testId: `dashboard-feed-remaining-${event.id}`,
    }).element;
    if (feedLine) children.push(feedLine);
  } else if (dailyDmiKg > 0 && (availableDmKg > 0 || daysIncludeStored)) {
    const daysText = Number(daysRemaining).toFixed(2);
    let capText = `Est. capacity: ${Math.round(estAuds)} AUDs · ~${daysText} days after today`;
    if (daysIncludeStored) capText += ' (incl. stored feed)';
    if (forageHeightDisplay) capText += ` · ${forageHeightDisplay}`;
    if (forageAgg.partial) capText += ` · ${t('dashboard.partialPreGraze')}`;
    if (adaText) capText += ` · ${adaText}`;
    children.push(el('div', {
      className: 'event-feed-remaining',
      'data-testid': `dashboard-capacity-${event.id}`,
      style: { marginBottom: 'var(--space-1)' },
    }, [
      el('div', { className: 'event-feed-remaining-line' }, [capText]),
      el('div', { className: 'event-feed-remaining-caption' }, [FEED_REMAINING_ESTIMATE_CAPTION]),
    ]));
  } else if (capacityBlockers.length) {
    // Informative hint: tell the user which inputs are missing instead of
    // dropping the row silently. Partial info (ADA) is shown when available.
    const partialParts = [];
    if (forageHeightDisplay) partialParts.push(forageHeightDisplay);
    if (adaText && adaPerHa > 0) partialParts.push(adaText);
    const hintText = `Capacity: add ${capacityBlockers.join(' + ')} to estimate`
      + (partialParts.length ? ` · ${partialParts.join(' · ')}` : '');
    children.push(el('div', {
      style: { fontSize: '12px', color: 'var(--text3, var(--text2))', fontStyle: 'italic', marginBottom: 'var(--space-1)' },
      'data-testid': `dashboard-capacity-hint-${event.id}`,
    }, [hintText]));
  }

  // OI-0280 (#435): target vs hay eaten from feed checks replaces today's DMI
  // line (Dp3, §15); hidden cases (Nc2) keep the "DMI target (forecast)" line.
  const actual = dailyDmiDisplay && dmi8
    ? computeEventDmiActual(buildDmi8ChartContext(event.id), { today: todayStr })
    : null;

  // §8: Breakdown line (gray)
  if (dailyDmiDisplay) {
    // OI-0278 S2 row 23: "Pasture: 1,234 lb DM" (farm unit, whole numbers as before).
    const fmtDm = (kg) => fmtW(kg, { decimals: 0 });
    let breakdownParts = [`Pasture: ${fmtDm(pastureDmKg)} DM`];
    if (hasStoredFeed) breakdownParts.push(`Stored feed: ${fmtDm(storedDmKg)} DM`);
    // OI-0280 §6: the Dp3 line carries "Target"; drop the duplicate here when it shows.
    if (!actual?.show) breakdownParts.push(`${t('dmi.targetForecast')}: ${fmtDm(dailyDmiKg)}/day`);
    children.push(el('div', { style: { fontSize: '12px', color: 'var(--text3, var(--text2))', marginBottom: 'var(--space-2)' } }, [breakdownParts.join(' \u00B7 ')]));
  }

  // §9: standalone "+ Add sub-move" link (OI-0109 removed — Sub-Move button in
  // the 3-up bottom row below supersedes it for quick-access). The in-section
  // link inside SUB-PADDOCKS (rendered when sub-moves exist) stays.

  // §10: Sub-paddocks section
  if (hasSubMoves) {
    children.push(el('div', { className: 'sec', style: { marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' } }, ['SUB-PADDOCKS']));
    for (const pw of subPaddocks) {
      const subLoc = getById('locations', pw.locationId);
      const subName = subLoc?.name || '?';
      const subLocHa = subLoc?.areaHectares ?? subLoc?.areaHa;
      // OI-0278 S2 row 26: one unit ("2.0 ac"; was "2.00 acres ac").
      const subArea = subLocHa ? formatMeasure(subLocHa, 'area', { unitSystem: unitSys }) : '';
      const isActive = !pw.dateClosed;
      children.push(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--border)' } }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, [
          el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: isActive ? 'var(--color-green-base)' : 'var(--text3, #999)', display: 'inline-block' } }),
          el('span', { style: { fontWeight: '600' } }, [subName]),
          subArea ? el('span', { style: { color: 'var(--text2)' } }, [` \u00B7 ${subArea}`]) : null,
          el('span', { style: { color: 'var(--text2)' } }, [` \u00B7 since ${formatShortDate(pw.dateOpened)}`]),
          el('span', { style: { color: isActive ? 'var(--color-green-base)' : 'var(--text3, #999)', fontWeight: '500' } }, [isActive ? ' active' : ' closed']),
        ].filter(Boolean)),
        isActive ? el('button', {
          className: 'btn btn-outline btn-xs',
          onClick: () => openSubmoveCloseSheet(pw, operationId),
        }, [t('event.closeWindow')]) : null,
      ].filter(Boolean)));
    }
    children.push(el('div', { style: { marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' } }, [
      el('a', {
        style: { fontSize: '13px', color: 'var(--color-teal-base)', cursor: 'pointer', textDecoration: 'none' },
        onClick: () => openSubmoveOpenSheet(event, operationId),
      }, ['+ Add sub-move']),
    ]));
  }

  // §11: Groups section
  if (gws.length) {
    children.push(el('div', { className: 'sec', style: { marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' } }, ['GROUPS']));
    for (const gw of gws) {
      const grp = getById('groups', gw.groupId);
      const grpName = grp?.name || '?';
      const live = liveByGwId.get(gw.id) || { head: 0, avg: 0 };
      const gwWeight = live.avg > 0 ? fmtW(live.avg, { decimals: 0 }) : '\u2014';
      children.push(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid var(--border)' } }, [
        el('div', {}, [
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: '600' } }, [
            el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-green-base)', display: 'inline-block' } }),
            grpName,
          ]),
          el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
            `${live.head} head \u00B7 avg ${gwWeight}`,
          ]),
        ]),
        el('button', {
          className: 'btn btn-teal btn-xs',
          'data-testid': `dashboard-group-move-btn-${gw.id}`,
          onClick: () => openMoveWizard(event, operationId, farmId, { scopedGroupWindowId: gw.id }),
        }, [t('dashboard.move')]),
      ]));
    }
    children.push(el('div', { style: { marginTop: 'var(--space-2)', marginBottom: 'var(--space-3)' } }, [
      el('a', {
        style: { fontSize: '13px', color: 'var(--color-teal-base)', cursor: 'pointer', textDecoration: 'none' },
        onClick: () => openGroupAddSheet(event, operationId),
      }, ['+ Add group']),
    ]));
  }

  // §12: DMI 3-day chart (OI-0119 — cascade model, shared chart-context helper)
  if (dmi8) {
    const chartDays = computeDmi8Days(event, dmi8);
    if (chartDays.length) {
      children.push(el('div', { style: { marginBottom: 'var(--space-3)' } }, [
        el('div', { className: 'sec', style: { marginBottom: 'var(--space-2)' } }, ['DMI \u2014 LAST 3 DAYS']),
        renderDmiChartComponent(chartDays, unitSys, {
          compact: true,
          onNoPastureData: (reason, ctx) => {
            if (!ctx?.pwId) return;
            const pw = getById('eventPaddockWindows', ctx.pwId);
            const ownerEvent = pw ? getById('events', pw.eventId) : null;
            if (reason === 'missing_observation' || reason === 'assumed_full_cover') {
              if (pw && ownerEvent) openEditPaddockWindowDialog(pw, ownerEvent, operationId);
            } else if (reason === 'missing_forage_type') {
              // OI-0265 Lk1: open that paddock's location edit sheet in place.
              const loc = pw ? getById('locations', pw.locationId) : null;
              if (loc) openLocationSheet(loc, operationId, loc.farmId);
            }
          },
        }),
      ]));
    }
  }

  // §13–§14: 3-up bottom-row quick actions (OI-0109). Replaces SP-3 / GH-11's
  // two full-width stacked buttons (Feed Check / Feed). Sub-Move is promoted
  // from the buried teal text link to a primary quick-access button. Mirrors
  // v1's .grp-actions small-button row style.
  const btnRowStyle = { padding: '10px 8px', fontSize: '13px', fontWeight: '600', borderRadius: '8px', cursor: 'pointer', flex: '1' };
  children.push(el('div', { style: { display: 'flex', gap: '6px', marginTop: 'var(--space-2)' } }, [
    el('button', {
      className: 'dash-btn-amber',
      style: { ...btnRowStyle },
      'data-testid': `dashboard-feed-check-btn-${event.id}`,
      onClick: () => openFeedCheckSheet(event, operationId),
    }, [t('event.feedCheck')]),
    el('button', {
      style: { ...btnRowStyle, background: 'var(--color-green-base)', border: '1px solid var(--color-green-base)', color: '#fff' },
      'data-testid': `dashboard-feed-btn-${event.id}`,
      onClick: () => openDeliverFeedSheet(event, operationId),
    }, [t('event.deliverFeed')]),
    el('button', {
      style: { ...btnRowStyle, background: 'transparent', border: '1px solid var(--color-teal-base)', color: 'var(--color-teal-base)' },
      'data-testid': `dashboard-submove-btn-${event.id}`,
      onClick: () => openSubmoveOpenSheet(event, operationId),
    }, [t('event.subMove')]),
  ]));

  // §15: DMI/NPK summary
  const summaryParts = [];
  if (actual?.show) {
    summaryParts.push(renderDmiActualLine(actual, event.id, unitSys, dmiNote));
  } else if (dailyDmiDisplay) {
    let dmiLine = `${t('dmi.targetForecast')} ${dailyDmiDisplay}`;
    if (storedPct > 0) dmiLine += ` \u00B7 ${storedPct}% stored \u00B7 ${pasturePct}% est. pasture`;
    summaryParts.push(el('div', { style: { fontSize: '12px', marginBottom: '2px' }, 'data-testid': `dashboard-loc-dmi-${event.id}`, ...(dmiNote ? { title: dmiNote } : {}) }, [dmiLine]));
  }
  if (npkLine) {
    summaryParts.push(el('div', {
      style: { fontSize: '12px', color: 'var(--color-purple-dark, #5B21B6)' },
      'data-testid': `dashboard-loc-npk-${event.id}`,
      ...(npkTitle ? { title: npkTitle } : {}),
    }, [npkLine]));
  }
  if (summaryParts.length) {
    children.push(el('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 'var(--space-2)', marginTop: 'var(--space-3)' } }, summaryParts));
  }

  // §16: Bottom small buttons — REMOVED (no-op)

  return el('div', {
    className: 'card',
    'data-testid': `dashboard-loc-card-${event.id}`,
    style: { borderLeft: '4px solid var(--color-green-base)', position: 'relative' },
  }, children);
}

// ---------------------------------------------------------------------------
// §17.8: Open tasks section
// ---------------------------------------------------------------------------

function renderTasksSection(rootContainer) {
  const tasksEl = rootContainer.querySelector('[data-testid="dashboard-tasks"]');
  if (!tasksEl) return;
  clear(tasksEl);

  const todos = getAll('todos').filter(td => td.status !== 'closed');
  const displayTodos = todos.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);

  const section = el('div', { className: 'dash-tasks-section' }, [
    el('div', { className: 'dash-tasks-header' }, [
      el('span', { className: 'sec' }, [t('todos.openTasks')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'dashboard-all-tasks-btn',
        onClick: () => navigate('#/todos'),
      }, [t('todos.allTasks')]),
    ]),
  ]);

  if (displayTodos.length) {
    const list = el('div', { className: 'todo-list' });
    for (const todo of displayTodos) {
      list.appendChild(renderTodoCard(todo, true));
    }
    section.appendChild(list);
  } else {
    section.appendChild(el('p', { className: 'form-hint' }, [t('todos.noOpenTasks')]));
  }

  // Add task button
  section.appendChild(el('button', {
    className: 'btn btn-outline btn-sm',
    style: { marginTop: 'var(--space-3)', width: '100%' },
    'data-testid': 'dashboard-add-task-btn',
    onClick: () => openTodoSheet(),
  }, [t('todos.addTask')]));

  tasksEl.appendChild(section);
}

// ---------------------------------------------------------------------------
// §17.12: Survey draft card
// ---------------------------------------------------------------------------

function renderSurveyDraft(rootContainer) {
  const el2 = rootContainer.querySelector('[data-testid="dashboard-survey-draft"]');
  if (!el2) return;
  clear(el2);

  const surveys = getAll('surveys');
  const draft = surveys.find(s => s.status === 'draft');
  if (!draft) return;

  const loc = draft.locationId ? getById('locations', draft.locationId) : null;
  const locName = loc ? loc.name : '';
  const dateStr = draft.surveyDate || '';

  el2.appendChild(el('div', { className: 'card ban-amber', 'data-testid': 'dashboard-survey-draft-card' }, [
    el('div', { style: { fontSize: '14px', fontWeight: '600', marginBottom: 'var(--space-2)' } }, [t('dashboard.surveyInProgress')]),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
      locName ? `${locName} \u00B7 ${dateStr}` : dateStr,
    ]),
    el('button', {
      className: 'btn btn-sm',
      style: { background: 'var(--color-amber-base)', color: 'var(--white, #fff)' },
      onClick: () => navigate('#/surveys'),
    }, [t('dashboard.continueSurvey')]),
  ]));
}

// ---------------------------------------------------------------------------
// §17.13: Weaning nudge
// ---------------------------------------------------------------------------

function renderWeaningNudge(rootContainer) {
  const nudgeEl = rootContainer.querySelector('[data-testid="dashboard-weaning"]');
  if (!nudgeEl) return;
  clear(nudgeEl);

  const groups = getAll('groups').filter(g => !g.archivedAt);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const now = new Date();

  for (const group of groups) {
    const weaningTargetDays = group.weaningTargetDays;
    if (!weaningTargetDays) continue;

    const groupAnimalIds = new Set(memberships.filter(m => m.groupId === group.id).map(m => m.animalId));
    const calves = animals.filter(a => {
      if (!groupAnimalIds.has(a.id)) return false;
      if (!a.birthDate) return false;
      const cls = animalClasses.find(c => c.id === a.animalClassId);
      const role = cls?.role || '';
      return ['calf', 'lamb', 'kid', 'young'].includes(role);
    });

    if (!calves.length) continue;

    const qualifyingCalves = calves.filter(calf => {
      const birthDate = new Date(calf.birthDate);
      const ageMs = now.getTime() - birthDate.getTime();
      const ageDays = ageMs / (24 * 60 * 60 * 1000);
      return ageDays >= (weaningTargetDays - 14);
    });

    if (!qualifyingCalves.length) continue;

    const avgDays = Math.round(qualifyingCalves.reduce((sum, c) => {
      return sum + (now.getTime() - new Date(c.birthDate).getTime()) / (24 * 60 * 60 * 1000);
    }, 0) / qualifyingCalves.length);

    nudgeEl.appendChild(el('div', { className: 'card ban-teal', 'data-testid': `dashboard-weaning-${group.id}` }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600', marginBottom: 'var(--space-2)' } }, [t('dashboard.weaningAlert')]),
      el('div', { style: { fontSize: '13px' } }, [
        `Group ${group.name} has ${qualifyingCalves.length} calves at ${avgDays} days \u2014 weaning target is ${weaningTargetDays} days.`,
      ]),
    ]));
  }
}
