/** @file Dashboard screen — §17. Home screen assembly: stats, view toggle, group/location cards, tasks, survey draft, weaning nudge. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe, getVisibleEvents, getVisibleGroups, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { navigate } from '../../ui/router.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { renderTodoCard } from '../todos/todo-card.js';
import { openTodoSheet } from '../todos/todo-sheet.js';
import { formatShortDate } from '../../utils/date-format.js';
import { unitLabel } from '../../utils/units.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openCloseEventSheet } from '../events/close.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet } from '../events/submove.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openGroupAddSheet } from '../events/group-windows.js';
import { openEventDetailSheet } from '../events/detail.js';
import { renderDmiChart as renderDmiChartComponent } from '../../ui/dmi-chart.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';

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
  const rerender = () => {
    renderStatsRow(container);
    renderCardGrid(container);
    renderTasksSection(container);
    renderSurveyDraft(container);
    renderWeaningNudge(container);
  };
  unsubs.push(subscribe('groups', rerender));
  unsubs.push(subscribe('events', rerender));
  unsubs.push(subscribe('eventPaddockWindows', rerender));
  unsubs.push(subscribe('eventGroupWindows', rerender));
  unsubs.push(subscribe('animalGroupMemberships', rerender));
  unsubs.push(subscribe('eventFeedEntries', rerender));
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
  const totalHead = memberships.length;
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
  const metrics = computeDesktopMetrics(events, unitSys);
  const grid = el('div', { className: 'dash-stats-grid' });
  for (const m of metrics) {
    grid.appendChild(el('div', { className: 'm-cell' }, [
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
  const metrics = computeMobileMetrics(events, unitSys);
  const grid = el('div', { className: 'dash-stats-grid dash-stats-grid-mobile' });
  for (const m of metrics) {
    grid.appendChild(el('div', { className: 'm-cell' }, [
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
    const dateIn = new Date(e.dateIn);
    const dateOut = e.dateOut ? new Date(e.dateOut) : now;
    // Event overlaps the period if it started before now and ended after cutoff
    return dateOut >= cutoff && dateIn <= now;
  });
}

function computeDesktopMetrics(events, _unitSys) {
  const cst1 = getCalcByName('CST-1');
  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');
  const dmi2 = getCalcByName('DMI-2');

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pasture DMI
  let totalDmiKg = 0;
  for (const event of events) {
    const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
    for (const gw of gws) {
      if (dmi2) {
        const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
        const now = gw.dateLeft || event.dateOut || todayStr;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now });
        const dmiKgPerDay = dmi2.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          dmiPct: cls?.dmiPct ?? 2.5,
          dmiPctLactating: cls?.dmiPctLactating ?? (cls?.dmiPct ?? 2.5),
          isLactating: false,
        });
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, now);
        totalDmiKg += dmiKgPerDay * days;
      }
    }
  }
  const dmiLbs = convert(totalDmiKg, 'weight', 'toImperial');
  const dmiDisplay = dmiLbs >= 1000 ? `${(dmiLbs / 1000).toFixed(1)}k` : Math.round(dmiLbs).toString();

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

  // Pasture % (avg from closed events, or estimate from open)
  let pasturePercent = null;
  let pastureSub = '';
  const closedEvents = events.filter(e => e.dateOut);
  const openEvents = events.filter(e => !e.dateOut);
  if (closedEvents.length) {
    // Average pasture% from closed events (placeholder — actual calculation depends on DMI-4)
    pastureSub = `avg, ${closedEvents.length} closed events`;
    pasturePercent = null; // Requires feed check data not yet available
  }
  if (pasturePercent === null && openEvents.length) {
    pastureSub = 'estimated, open events';
  }
  if (!events.length) {
    pastureSub = 'no grazing events';
  }

  // NPK / Acre
  let totalNPK = { n: 0, p: 0, k: 0 };
  let totalAcres = 0;
  if (npk1) {
    for (const event of events) {
      const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id);
      for (const gw of gws) {
        const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
        const now = gw.dateLeft || event.dateOut || todayStr;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now });
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, now);
        const result = npk1.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          days,
          excretionNRate: cls?.excretionNRate ?? 0.34,
          excretionPRate: cls?.excretionPRate ?? 0.092,
          excretionKRate: cls?.excretionKRate ?? 0.24,
        });
        totalNPK.n += (result.nKg ?? result.n ?? 0);
        totalNPK.p += (result.pKg ?? result.p ?? 0);
        totalNPK.k += (result.kKg ?? result.k ?? 0);
      }
      for (const pw of pws) {
        const loc = getById('locations', pw.locationId);
        if (loc?.areaHa) {
          totalAcres += convert(loc.areaHa, 'area', 'toImperial');
        }
      }
    }
  }
  const npkPerAcre = totalAcres > 0 ? ((totalNPK.n + totalNPK.p + totalNPK.k) * 2.20462) / totalAcres : 0;
  const npkSubN = (totalNPK.n * 2.20462).toFixed(0);
  const npkSubP = (totalNPK.p * 2.20462).toFixed(0);
  const npkSubK = (totalNPK.k * 2.20462).toFixed(0);

  // NPK Value
  let npkValue = 0;
  if (npk2 && totalAcres > 0) {
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
  const npkValuePerAcre = totalAcres > 0 ? npkValue / totalAcres : 0;

  return [
    {
      value: dmiDisplay,
      label: 'lbs DM',
      color: 'var(--color-green-base)',
    },
    {
      value: `$${feedCostTotal.toFixed(2)}`,
      label: 'stored feed',
      color: 'var(--color-amber-base)',
    },
    {
      value: pasturePercent !== null ? `${pasturePercent}%` : '\u2014',
      label: pastureSub || '\u00A0',
      color: 'var(--color-teal-base)',
    },
    {
      value: npkPerAcre > 0 ? `${npkPerAcre.toFixed(1)} /ac` : '\u2014',
      label: totalAcres > 0 ? `N${npkSubN}/P${npkSubP}/K${npkSubK} lbs \u00B7 ${totalAcres.toFixed(2)} ac` : '\u00A0',
      color: 'var(--color-purple-dark)',
    },
    {
      value: npkValuePerAcre > 0 ? `$${npkValuePerAcre.toFixed(2)}/ac` : '\u2014',
      label: totalAcres > 0 ? `$${npkValue.toFixed(0)} total \u00B7 ${totalAcres.toFixed(2)} ac` : '\u00A0',
      color: 'var(--color-blue-base)',
    },
  ];
}

function computeMobileMetrics(events, _unitSys) {
  const cst1 = getCalcByName('CST-1');
  const npk1 = getCalcByName('NPK-1');

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Pasture % — placeholder
  const pastureVal = '\u2014';
  const pastureColor = 'var(--color-teal-base)';

  // NPK / Acre
  let totalNPK = 0;
  let totalAcres = 0;
  if (npk1) {
    for (const event of events) {
      const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id);
      for (const gw of gws) {
        const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
        const now = gw.dateLeft || event.dateOut || todayStr;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, now });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now });
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, now);
        const result = npk1.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          days,
          excretionNRate: cls?.excretionNRate ?? 0.34,
          excretionPRate: cls?.excretionPRate ?? 0.092,
          excretionKRate: cls?.excretionKRate ?? 0.24,
        });
        const nKg = (result.nKg ?? result.n ?? 0);
        const pKg = (result.pKg ?? result.p ?? 0);
        const kKg = (result.kKg ?? result.k ?? 0);
        totalNPK += (nKg + pKg + kKg) * 2.20462;
      }
      for (const pw of pws) {
        const loc = getById('locations', pw.locationId);
        if (loc?.areaHa) totalAcres += convert(loc.areaHa, 'area', 'toImperial');
      }
    }
  }
  const npkPerAcre = totalAcres > 0 ? totalNPK / totalAcres : 0;

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
      const todayStr = new Date().toISOString().slice(0, 10);
      totalDays += daysBetweenInclusive(event.dateIn, event.dateOut || todayStr);
    }
  }
  const costPerDay = totalDays > 0 ? feedCostTotal / totalDays : 0;
  let costColor = 'var(--color-amber-base)';
  // Threshold per §17.4 — need head count for per-head calc (live memberships only)
  const totalHead = memberships.filter(m => !m.dateLeft).length || 1;
  const costPerHdDay = costPerDay / totalHead;
  if (costPerHdDay < 2) costColor = 'var(--color-green-base)';
  else if (costPerHdDay > 5) costColor = 'var(--color-red-base)';

  return [
    {
      value: pastureVal,
      label: 'Pasture %',
      color: pastureColor,
    },
    {
      value: npkPerAcre > 0 ? `${npkPerAcre.toFixed(1)} /ac` : '\u2014',
      label: 'NPK / Acre',
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
  // OI-0073 Part A: prefer GW linked to an open event; tie-break by most-recent dateJoined.
  const groupWindows = getAll('eventGroupWindows');
  const events = getAll('events');
  const eventMap = new Map(events.map(e => [e.id, e]));
  const candidateGWs = groupWindows.filter(gw => gw.groupId === group.id && !gw.dateLeft);
  const sortByDateJoinedDesc = (a, b) => (b.dateJoined || '').localeCompare(a.dateJoined || '');
  const openEventCandidates = candidateGWs.filter(gw => {
    const evt = eventMap.get(gw.eventId);
    return evt && !evt.dateOut;
  });
  const activeGW = openEventCandidates.sort(sortByDateJoinedDesc)[0]
    || candidateGWs.slice().sort(sortByDateJoinedDesc)[0]
    || null;
  const activeEvent = activeGW ? eventMap.get(activeGW.eventId) : null;
  const isOnPasture = !!(activeEvent && !activeEvent.dateOut);

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const todayStr = new Date().toISOString().slice(0, 10);

  // Live values for the active open window (OI-0091).
  const activeLiveHead = activeGW
    ? getLiveWindowHeadCount(activeGW, { memberships, now: todayStr })
    : 0;
  const activeLiveAvg = activeGW
    ? getLiveWindowAvgWeight(activeGW, { memberships, animals, animalWeightRecords, now: todayStr })
    : 0;

  // Head count — use live memberships (same logic for groups not on pasture).
  const headCount = memberships.filter(m => m.groupId === group.id && !m.dateLeft).length;

  // Average weight
  const avgWeightDisplay = activeLiveAvg > 0
    ? display(activeLiveAvg, 'weight', unitSys, 0)
    : '';

  // Location info
  let locationName = '';
  let dayCount = 0;
  if (isOnPasture) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === activeEvent.id && !w.dateClosed);
    if (pws.length) {
      const loc = getById('locations', pws[0].locationId);
      locationName = loc ? loc.name : '?';
    }
    dayCount = daysBetweenInclusive(activeEvent.dateIn, todayStr);
  }

  // Composition line
  const groupAnimalIds = new Set(
    memberships.filter(m => m.groupId === group.id && !m.dateLeft).map(m => m.animalId)
  );
  const groupAnimals = animals.filter(a => groupAnimalIds.has(a.id));
  const classCounts = {};
  const allClasses = getAll('animalClasses');
  for (const a of groupAnimals) {
    const cls = allClasses.find(c => c.id === a.animalClassId);
    const label = cls ? cls.name : 'Unknown';
    classCounts[label] = (classCounts[label] || 0) + 1;
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

  // DMI target + progress
  let dmiEl = null;
  if (isOnPasture && activeGW) {
    const dmi2 = getCalcByName('DMI-2');
    if (dmi2 && group.dmiTarget > 0) {
      const cls = activeGW.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
      const dmiKgPerDay = dmi2.fn({
        headCount: activeLiveHead,
        avgWeightKg: activeLiveAvg,
        dmiPct: cls?.dmiPct ?? 2.5,
        dmiPctLactating: cls?.dmiPctLactating ?? (cls?.dmiPct ?? 2.5),
        isLactating: false,
      });
      const target = convert(group.dmiTarget, 'weight', 'toImperial');
      const consumed = convert(dmiKgPerDay, 'weight', 'toImperial');
      const pct = target > 0 ? Math.min(100, (consumed / target) * 100) : 0;
      dmiEl = el('div', { style: { marginBottom: 'var(--space-3)' } }, [
        el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [
          `DMI: ${consumed.toFixed(0)} / ${target.toFixed(0)} lbs`,
        ]),
        el('div', { className: 'progress-bar' }, [
          el('div', {
            className: `progress-fill ${pct >= 90 ? 'progress-green' : 'progress-amber'}`,
            style: { width: `${pct}%` },
          }),
        ]),
      ]);
    }
  }

  // NPK deposited
  let npkEl = null;
  if (isOnPasture && activeGW && activeLiveAvg > 0) {
    const npk1 = getCalcByName('NPK-1');
    if (npk1) {
      const cls = activeGW.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
      const days = daysBetweenInclusive(activeGW.dateJoined || activeEvent.dateIn, todayStr);
      const result = npk1.fn({
        headCount: activeLiveHead,
        avgWeightKg: activeLiveAvg,
        days,
        excretionNRate: cls?.excretionNRate ?? 0.34,
        excretionPRate: cls?.excretionPRate ?? 0.092,
        excretionKRate: cls?.excretionKRate ?? 0.24,
      });
      // OI-0073 Part C: NPK-1 returns {nKg,pKg,kKg}; legacy fallback to {n,p,k}. Prevents NaN.
      const nLbs = ((result.nKg ?? result.n ?? 0) * 2.20462).toFixed(1);
      const pLbs = ((result.pKg ?? result.p ?? 0) * 2.20462).toFixed(1);
      const kLbs = ((result.kKg ?? result.k ?? 0) * 2.20462).toFixed(1);
      npkEl = el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
        `NPK deposited: N${nLbs} P${pLbs} K${kLbs} lbs`,
      ]);
    }
  }

  // Gender breakdown
  const females = groupAnimals.filter(a => a.sex === 'female').length;
  const males = groupAnimals.filter(a => a.sex === 'male').length;
  const genderLine = [females > 0 ? `${females} female` : null, males > 0 ? `${males} male` : null].filter(Boolean).join(', ') || compositionLine;

  // NPK fert value
  let npkValueStr = '';
  if (npkEl) {
    const npk2 = getCalcByName('NPK-2');
    if (npk2) {
      const prices = getAll('npkPriceHistory').sort((a, b) => (b.effectiveDate || '').localeCompare(a.effectiveDate || ''))[0];
      if (prices) {
        const npk1 = getCalcByName('NPK-1');
        const cls2 = activeGW?.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
        const days2 = daysBetweenInclusive(activeGW?.dateJoined || activeEvent?.dateIn || todayStr, todayStr);
        const r = npk1.fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg, days: days2, excretionNRate: cls2?.excretionNRate ?? 0.34, excretionPRate: cls2?.excretionPRate ?? 0.092, excretionKRate: cls2?.excretionKRate ?? 0.24 });
        const val = npk2.fn({ nKg: r.nKg ?? r.n ?? 0, pKg: r.pKg ?? r.p ?? 0, kKg: r.kKg ?? r.k ?? 0, nPricePerKg: prices.nPricePerKg ?? 0, pPricePerKg: prices.pPricePerKg ?? 0, kPricePerKg: prices.kPricePerKg ?? 0 });
        npkValueStr = ` \u00B7 $${val.toFixed(2)} fert value`;
      }
    }
  }

  // DMI target display
  let dmiTargetDisplay = '';
  if (isOnPasture && activeGW) {
    const dmi2 = getCalcByName('DMI-2');
    if (dmi2) {
      const cls3 = activeGW.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
      const dmiKg = dmi2.fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg, dmiPct: cls3?.dmiPct ?? 2.5, dmiPctLactating: cls3?.dmiPctLactating ?? 2.5, isLactating: false });
      dmiTargetDisplay = convert(dmiKg, 'weight', 'toImperial').toFixed(0);
    }
  }

  // AU
  const auValue = activeGW ? (activeLiveHead * activeLiveAvg) / 453.6 : 0;

  // Build v1-parity card
  const isExpanded = expandedGroups.has(group.id) || isOnPasture;
  const wUnit = unitLabel('weight', unitSys);

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
    const todayStr3 = new Date().toISOString().slice(0, 10);
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
    const dmiBlock = el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '10px' } }, [
      `DMI target ${dmiTargetDisplay} lbs/day`,
    ]);
    dmiBlock.appendChild(el('div', { className: 'prog', style: { marginTop: '4px' } }, [
      el('div', { className: 'prog-fill', style: { width: '0%', background: 'var(--amber)' } }),
    ]));
    // NPK line (purple)
    if (npkEl) {
      const cls4 = activeGW?.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
      const npk1b = getCalcByName('NPK-1');
      const days4 = daysBetweenInclusive(activeGW?.dateJoined || activeEvent?.dateIn || todayStr, todayStr);
      const r2 = npk1b.fn({ headCount: activeLiveHead, avgWeightKg: activeLiveAvg, days: days4, excretionNRate: cls4?.excretionNRate ?? 0.34, excretionPRate: cls4?.excretionPRate ?? 0.092, excretionKRate: cls4?.excretionKRate ?? 0.24 });
      const nL = convert(r2.nKg ?? r2.n ?? 0, 'weight', 'toImperial').toFixed(1);
      const pL = convert(r2.pKg ?? r2.p ?? 0, 'weight', 'toImperial').toFixed(1);
      const kL = convert(r2.kKg ?? r2.k ?? 0, 'weight', 'toImperial').toFixed(1);
      dmiBlock.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--purple-d)', marginTop: '3px' } }, [
        `NPK deposited: N${nL} / P${pL} / K${kL} lbs${npkValueStr}`,
      ]));
    }
    body.appendChild(dmiBlock);
  }

  // Action buttons
  body.appendChild(el('div', { className: 'grp-actions' }, [
    isOnPasture
      ? el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-move-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); openMoveWizard(activeEvent, operationId, farmId); } }, ['Move'])
      : el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-place-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); navigate('#/events'); } }, ['Place']),
    el('button', { className: 'btn btn-outline', onClick: (e) => { e.stopPropagation(); navigate('#/animals'); } }, ['Weights']),
    el('button', { className: 'btn btn-outline', onClick: (e) => { e.stopPropagation(); navigate('#/animals'); } }, ['Edit']),
  ]));

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

  // Unplaced groups section
  const placedGroupIds = new Set();
  for (const event of activeEvents) {
    const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && !gw.dateLeft);
    for (const gw of gws) placedGroupIds.add(gw.groupId);
  }
  const unplacedGroups = groups.filter(g => !placedGroupIds.has(g.id));

  if (unplacedGroups.length) {
    const section = el('div', { style: { marginTop: 'var(--space-5)' } }, [
      el('div', { className: 'sec', style: { marginBottom: 'var(--space-3)' } }, [t('dashboard.unplacedGroups')]),
    ]);
    for (const group of unplacedGroups) {
      const hc = memberships.filter(m => m.groupId === group.id).length;
      section.appendChild(el('div', { className: 'card', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)', padding: '10px 14px' } }, [
        el('span', { style: { fontSize: '13px' } }, [`${group.name} \u00B7 ${hc} head`]),
        el('button', { className: 'btn btn-teal btn-sm', onClick: () => navigate('#/events') }, [t('dashboard.place')]),
      ]));
    }
    gridEl.appendChild(section);
  }
}

// ---------------------------------------------------------------------------
// §17.7a: Location card builder (SP-3 — v1 parity)
// ---------------------------------------------------------------------------

export function buildLocationCard(event, operationId, farmId, unitSys) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const allPws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id);
  const openPws = allPws.filter(w => !w.dateClosed);
  const primaryPw = openPws[0];

  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');

  // Location name + acreage (multi-paddock: comma-join names, sum area)
  let locName, totalAreaHa = 0;
  if (openPws.length > 1) {
    const names = openPws.map(pw => {
      const loc = getById('locations', pw.locationId);
      if (loc?.areaHa) totalAreaHa += loc.areaHa;
      return loc?.name || '?';
    });
    locName = names.join(', ');
  } else {
    const loc = primaryPw ? getById('locations', primaryPw.locationId) : null;
    locName = loc?.name || '?';
    totalAreaHa = loc?.areaHa || 0;
  }
  const areaDisplay = totalAreaHa > 0 ? display(totalAreaHa, 'area', unitSys, 2) : '';
  const areaUnit = unitSys === 'imperial' ? 'ac' : 'ha';

  // Groups
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && !gw.dateLeft);
  const liveByGwId = new Map();
  let totalHead = 0, totalWeightKg = 0;
  for (const gw of gws) {
    const liveHead = getLiveWindowHeadCount(gw, { memberships, now: todayStr });
    const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now: todayStr });
    liveByGwId.set(gw.id, { head: liveHead, avg: liveAvg });
    totalHead += liveHead;
    totalWeightKg += liveHead * liveAvg;
  }

  // Calcs
  const cst1 = getCalcByName('CST-1');
  const dmi2 = getCalcByName('DMI-2');
  const dmi4 = getCalcByName('DMI-4');
  const dmi1 = getCalcByName('DMI-1');
  const npk1 = getCalcByName('NPK-1');
  const npk2 = getCalcByName('NPK-2');
  const for1 = getCalcByName('FOR-1');
  const for2 = getCalcByName('FOR-2');
  const for3 = getCalcByName('FOR-3');

  const dayCount = daysBetweenInclusive(event.dateIn, todayStr);

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
  let eventType = 'grazing';
  if (hasStoredFeed && totalAreaHa > 0) eventType = 'stored feed & grazing';
  else if (hasStoredFeed) eventType = 'stored feed';

  // DMI
  let dailyDmiKg = 0;
  if (dmi2) {
    for (const gw of gws) {
      const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
      const live = liveByGwId.get(gw.id) || { head: 0, avg: 0 };
      dailyDmiKg += dmi2.fn({
        headCount: live.head, avgWeightKg: live.avg,
        dmiPct: cls?.dmiPct ?? 2.5, dmiPctLactating: cls?.dmiPctLactating ?? 2.5, isLactating: false,
      });
    }
  }

  // Stored feed consumed (from DMI-1)
  let storedConsumedKg = 0;
  if (dmi1 && feedEntries.length) {
    storedConsumedKg = dmi1.fn({ entries: feedEntries.map(fe => ({ qtyKg: (fe.entryType === 'removal' ? -(fe.quantity ?? 0) : (fe.quantity ?? 0)), dmPct: 100 })), remainingDmKg: 0 });
  }

  // Pasture/stored split
  let pasturePct = 100, storedPct = 0, pastureDmKg = 0, storedDmKg = 0;
  const totalDmiKgPeriod = dailyDmiKg * dayCount;
  if (dmi4 && totalDmiKgPeriod > 0) {
    const split = dmi4.fn({ totalDmiKg: totalDmiKgPeriod, storedConsumedKg });
    pasturePct = Math.round(split.pasturePct);
    storedPct = 100 - pasturePct;
    pastureDmKg = split.pastureDmiKg;
    storedDmKg = split.storedDmiKg;
  }

  // Forage / capacity
  const loc = primaryPw ? getById('locations', primaryPw.locationId) : null;
  const forageType = loc?.forageTypeId ? getById('forageTypes', loc.forageTypeId) : null;
  const obs = getAll('eventObservations')
    .filter(o => o.eventId === event.id && (o.observationPhase === 'pre_graze' || !o.observationPhase))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

  let availableDmKg = 0, estAuds = 0, daysRemaining = 0, forageHeightDisplay = '';
  if (for1 && obs?.forageHeightCm && totalAreaHa > 0) {
    const residualCm = forageType?.minResidualHeightCm ?? 5;
    const dmPerCmPerHa = forageType?.dmKgPerCmPerHa ?? 110;
    const coverPct = obs.forageCoverPct ?? 80;
    availableDmKg = for1.fn({
      forageHeightCm: obs.forageHeightCm, residualHeightCm: residualCm,
      areaHectares: totalAreaHa, areaPct: 100, coverPct, dmKgPerCmPerHa: dmPerCmPerHa,
    });
    if (for2) estAuds = for2.fn({ availableDmKg, dmPerAudKg: 11 });
    if (for3 && dailyDmiKg > 0) daysRemaining = for3.fn({ availableDmKg, groupDmiKgPerDay: dailyDmiKg });
    forageHeightDisplay = display(obs.forageHeightCm, 'length', unitSys, 1);
  }

  // Weight + AU
  const totalWeightDisplay = display(totalWeightKg, 'weight', unitSys, 0);
  const wUnit = unitLabel('weight', unitSys);
  const auValue = totalWeightKg / 453.6;

  // ADA (animal days per acre)
  const totalAcres = totalAreaHa > 0 ? convert(totalAreaHa, 'area', 'toImperial') : 0;
  const adaPerAc = totalAcres > 0 ? (auValue * dayCount / totalAcres) : 0;

  // NPK
  let npkLine = null;
  if (npk1 && gws.length) {
    let totalN = 0, totalP = 0, totalK = 0;
    for (const gw of gws) {
      const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
      const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, todayStr);
      const live = liveByGwId.get(gw.id) || { head: 0, avg: 0 };
      const r = npk1.fn({
        headCount: live.head, avgWeightKg: live.avg, days,
        excretionNRate: cls?.excretionNRate ?? 0.34, excretionPRate: cls?.excretionPRate ?? 0.092, excretionKRate: cls?.excretionKRate ?? 0.24,
      });
      totalN += r.nKg ?? r.n ?? 0;
      totalP += r.pKg ?? r.p ?? 0;
      totalK += r.kKg ?? r.k ?? 0;
    }
    const nDisp = convert(totalN, 'weight', 'toImperial').toFixed(1);
    const pDisp = convert(totalP, 'weight', 'toImperial').toFixed(1);
    const kDisp = convert(totalK, 'weight', 'toImperial').toFixed(1);
    let npkText = `NPK: N${nDisp} / P${pDisp} / K${kDisp} lbs`;
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
  const dailyDmiDisplay = dailyDmiKg > 0 ? convert(dailyDmiKg, 'weight', 'toImperial').toFixed(0) : null;

  // --- Sub-paddocks (non-anchor windows) ---
  const sortedPws = [...allPws].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  const subPaddocks = sortedPws.slice(1);
  const hasSubMoves = subPaddocks.length > 0;

  // --- Build card ---
  const children = [];

  // §1: Left accent bar via border-left
  // §2: Header row
  children.push(el('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 'var(--space-2)' } }, [
    el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
      el('span', { style: { fontSize: '22px', color: 'var(--color-green-base)' } }, ['\uD83C\uDF3F']),
      el('span', { style: { fontSize: '18px', fontWeight: '700' } }, [locName]),
      totalAreaHa > 0 ? el('span', { style: { fontSize: '14px', fontWeight: '400', color: 'var(--text2)' } }, [`${convert(totalAreaHa, 'area', 'toImperial').toFixed(2)} ${areaUnit}`]) : null,
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

  // §4 + §5: Event type badge + summary line
  children.push(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: 'var(--space-2)' } }, [
    el('span', { style: { background: '#F4F8EC', color: '#3B6D11', fontSize: '12px', borderRadius: '4px', padding: '2px 6px', marginRight: '6px' } }, [eventType]),
    `Day ${dayCount} \u00B7 In ${formatShortDate(event.dateIn)} \u00B7 $${feedCost.toFixed(2)}`,
  ]));

  // §6: Weight line
  if (totalHead > 0) {
    children.push(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: 'var(--space-1)' } }, [
      `Weight: ${totalWeightKg > 0 ? convert(totalWeightKg, 'weight', 'toImperial').toLocaleString('en-US', { maximumFractionDigits: 0 }) : '0'} ${wUnit} \u00B7 ${auValue.toFixed(1)} AU`,
    ]));
  }

  // §7: Capacity line (green)
  if (availableDmKg > 0 && dailyDmiKg > 0) {
    let capText = `Est. capacity: ${Math.round(estAuds)} AUDs \u00B7 ~${daysRemaining} days remaining`;
    if (hasStoredFeed) capText += ' (incl. stored feed)';
    if (forageHeightDisplay) capText += ` \u00B7 ${forageHeightDisplay}"`;
    if (totalAcres > 0) capText += ` \u00B7 ADA est: ${adaPerAc.toFixed(1)}/ac`;
    children.push(el('div', { style: { fontSize: '12px', color: 'var(--color-green-dark, #3B6D11)', fontWeight: '500', marginBottom: 'var(--space-1)' } }, [capText]));
  }

  // §8: Breakdown line (gray)
  if (dailyDmiDisplay) {
    const fmtNum = (n) => Math.round(n).toLocaleString('en-US');
    let breakdownParts = [`Pasture: ${fmtNum(convert(pastureDmKg, 'weight', 'toImperial'))} lbs DM`];
    if (hasStoredFeed) breakdownParts.push(`Stored feed: ${fmtNum(convert(storedDmKg, 'weight', 'toImperial'))} lbs DM`);
    breakdownParts.push(`DMI demand: ${fmtNum(convert(dailyDmiKg, 'weight', 'toImperial'))} lbs/day`);
    children.push(el('div', { style: { fontSize: '12px', color: 'var(--text3, var(--text2))', marginBottom: 'var(--space-2)' } }, [breakdownParts.join(' \u00B7 ')]));
  }

  // §9: + Add sub-move (if no sub-moves, appears here above sub-paddocks section)
  if (!hasSubMoves) {
    children.push(el('div', { style: { marginBottom: 'var(--space-3)' } }, [
      el('a', {
        style: { fontSize: '13px', color: 'var(--color-teal-base)', cursor: 'pointer', textDecoration: 'none' },
        onClick: () => openSubmoveOpenSheet(event, operationId),
      }, ['+ Add sub-move']),
    ]));
  }

  // §10: Sub-paddocks section
  if (hasSubMoves) {
    children.push(el('div', { className: 'sec', style: { marginTop: 'var(--space-3)', marginBottom: 'var(--space-2)' } }, ['SUB-PADDOCKS']));
    for (const pw of subPaddocks) {
      const subLoc = getById('locations', pw.locationId);
      const subName = subLoc?.name || '?';
      const subArea = subLoc?.areaHa ? `${display(subLoc.areaHa, 'area', unitSys, 2)} ${areaUnit}` : '';
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
      const gwWeight = live.avg > 0 ? display(live.avg, 'weight', unitSys, 0) : '\u2014';
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
          onClick: () => openMoveWizard(event, operationId, farmId),
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

  // §12: DMI 3-day chart
  const dmi8 = getCalcByName('DMI-8');
  if (dmi8) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const todayStr2 = new Date().toISOString().slice(0, 10);
    const chartDays = [];

    // Build context for DMI-8
    const chartGws = gws;
    const chartFeedChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === event.id);
    const chartFeedCheckItems = getAll('eventFeedCheckItems').filter(fci => chartFeedChecks.some(fc => fc.id === fci.feedCheckId));
    const chartPws = allPws;
    const chartObs = getAll('eventObservations').filter(o => o.eventId === event.id);
    const chartForageTypes = {};
    const chartLocations = {};
    for (const pw of allPws) {
      const pwLoc = getById('locations', pw.locationId);
      if (pwLoc) {
        chartLocations[pw.locationId] = { areaHa: pwLoc.areaHa };
        if (pwLoc.forageTypeId) {
          const ft = getById('forageTypes', pwLoc.forageTypeId);
          if (ft) chartForageTypes[pw.locationId] = { dmKgPerCmPerHa: ft.dmKgPerCmPerHa, minResidualHeightCm: ft.minResidualHeightCm, utilizationPct: ft.utilizationPct };
        }
      }
    }
    const chartAnimalClasses = {};
    for (const gw of gws) {
      if (gw.animalClassId) {
        const cls = getById('animalClasses', gw.animalClassId);
        if (cls) chartAnimalClasses[gw.animalClassId] = { dmiPct: cls.dmiPct, dmiPctLactating: cls.dmiPctLactating };
      }
    }

    // Source event bridge (lazy)
    let srcCtx = null;
    function getSrcCtx() {
      if (srcCtx !== null) return srcCtx;
      if (!event.sourceEventId) { srcCtx = false; return false; }
      const srcEvt = getById('events', event.sourceEventId);
      if (!srcEvt) { srcCtx = false; return false; }
      const sGws = getAll('eventGroupWindows').filter(gw => gw.eventId === srcEvt.id);
      const sFe = getAll('eventFeedEntries').filter(fe => fe.eventId === srcEvt.id);
      const sFc = getAll('eventFeedChecks').filter(fc => fc.eventId === srcEvt.id);
      const sFci = getAll('eventFeedCheckItems').filter(fci => sFc.some(fc => fc.id === fci.feedCheckId));
      const sPws = getAll('eventPaddockWindows').filter(pw => pw.eventId === srcEvt.id);
      const sObs = getAll('eventObservations').filter(o => o.eventId === srcEvt.id);
      const sFt = {}, sLoc = {}, sAc = {};
      for (const pw of sPws) {
        const l = getById('locations', pw.locationId);
        if (l) { sLoc[pw.locationId] = { areaHa: l.areaHa }; if (l.forageTypeId) { const f = getById('forageTypes', l.forageTypeId); if (f) sFt[pw.locationId] = { dmKgPerCmPerHa: f.dmKgPerCmPerHa, minResidualHeightCm: f.minResidualHeightCm, utilizationPct: f.utilizationPct }; } }
      }
      for (const gw of sGws) { if (gw.animalClassId) { const c = getById('animalClasses', gw.animalClassId); if (c) sAc[gw.animalClassId] = { dmiPct: c.dmiPct, dmiPctLactating: c.dmiPctLactating }; } }
      srcCtx = { event: srcEvt, gws: sGws, fe: sFe, fc: sFc, fci: sFci, pws: sPws, obs: sObs, ft: sFt, loc: sLoc, ac: sAc };
      return srcCtx;
    }

    for (let i = 2; i >= 0; i--) {
      const d = new Date(todayStr2 + 'T00:00:00');
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateStr < event.dateIn) {
        const src = getSrcCtx();
        if (!src) continue;
        const dayName = dayNames[d.getDay()];
        const result = dmi8.fn({ event: src.event, date: dateStr, groupWindows: src.gws, memberships, animals, animalWeightRecords, feedEntries: src.fe, feedChecks: src.fc, feedCheckItems: src.fci, paddockWindows: src.pws, observations: src.obs, forageTypes: src.ft, locations: src.loc, animalClasses: src.ac });
        chartDays.push({ date: dateStr, label: dayName, result });
        continue;
      }
      const dayName = dayNames[d.getDay()];
      const label = i === 0 ? `${dayName} \u2713` : dayName;
      const result = dmi8.fn({
        event, date: dateStr, groupWindows: chartGws,
        memberships, animals, animalWeightRecords,
        feedEntries, feedChecks: chartFeedChecks,
        feedCheckItems: chartFeedCheckItems, paddockWindows: chartPws, observations: chartObs,
        forageTypes: chartForageTypes, locations: chartLocations, animalClasses: chartAnimalClasses,
      });
      chartDays.push({ date: dateStr, label, result });
    }

    if (chartDays.length) {
      children.push(el('div', { style: { marginBottom: 'var(--space-3)' } }, [
        el('div', { className: 'sec', style: { marginBottom: 'var(--space-2)' } }, ['DMI \u2014 LAST 3 DAYS']),
        renderDmiChartComponent(chartDays, unitSys, { compact: true }),
      ]));
    }
  }

  // §13: Large Feed check button (amber)
  children.push(el('button', {
    style: { width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600', borderRadius: '8px', background: '#FDF6EA', border: '1px solid #E5C76B', color: '#8B6914', cursor: 'pointer', marginBottom: '8px' },
    'data-testid': `dashboard-feed-check-btn-${event.id}`,
    onClick: () => openFeedCheckSheet(event, operationId),
  }, [t('event.feedCheck')]));

  // §14: Large Feed button (green) — NEW
  children.push(el('button', {
    style: { width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600', borderRadius: '8px', background: 'var(--color-green-base)', border: '1px solid var(--color-green-base)', color: '#fff', cursor: 'pointer' },
    'data-testid': `dashboard-feed-btn-${event.id}`,
    onClick: () => openDeliverFeedSheet(event, operationId),
  }, [t('event.deliverFeed')]));

  // §15: DMI/NPK summary
  const summaryParts = [];
  if (dailyDmiDisplay) {
    let dmiLine = `DMI ${dailyDmiDisplay} lbs/day`;
    if (storedPct > 0) dmiLine += ` \u00B7 ${storedPct}% stored \u00B7 ${pasturePct}% est. pasture`;
    summaryParts.push(el('div', { style: { fontSize: '12px', marginBottom: '2px' } }, [dmiLine]));
  }
  if (npkLine) {
    summaryParts.push(el('div', { style: { fontSize: '12px', color: 'var(--color-purple-dark, #5B21B6)' } }, [npkLine]));
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
