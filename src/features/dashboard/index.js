/** @file Dashboard screen — §17. Home screen assembly: stats, view toggle, group/location cards, tasks, survey draft, weaning nudge. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe, getVisibleEvents, getVisibleGroups, getVisibleLocations, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { navigate } from '../../ui/router.js';
import { getCalcByName } from '../../utils/calc-registry.js';
import { renderTodoCard } from '../todos/todo-card.js';
import { openTodoSheet } from '../todos/todo-sheet.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openCloseEventSheet } from '../events/close.js';
import { openCreateSurveySheet } from '../surveys/index.js';

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
  const groups = getVisibleGroups().filter(g => !g.archived);
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

  // Pasture DMI
  let totalDmiKg = 0;
  for (const event of events) {
    const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id);
    for (const gw of gws) {
      if (dmi2) {
        const cls = gw.animalClassId ? getById('animalClasses', gw.animalClassId) : null;
        const dmiKgPerDay = dmi2.fn({
          headCount: gw.headCount ?? 0,
          avgWeightKg: gw.avgWeightKg ?? 0,
          dmiPct: cls?.dmiPct ?? 2.5,
          dmiPctLactating: cls?.dmiPctLactating ?? (cls?.dmiPct ?? 2.5),
          isLactating: false,
        });
        const todayStr = new Date().toISOString().slice(0, 10);
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, gw.dateLeft || event.dateOut || todayStr);
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
        const todayStr = new Date().toISOString().slice(0, 10);
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, gw.dateLeft || event.dateOut || todayStr);
        const result = npk1.fn({
          headCount: gw.headCount ?? 0,
          avgWeightKg: gw.avgWeightKg ?? 0,
          days,
          excretionNRate: cls?.excretionN ?? 0.34,
          excretionPRate: cls?.excretionP ?? 0.092,
          excretionKRate: cls?.excretionK ?? 0.24,
        });
        totalNPK.n += result.n;
        totalNPK.p += result.p;
        totalNPK.k += result.k;
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
        const todayStr = new Date().toISOString().slice(0, 10);
        const days = daysBetweenInclusive(gw.dateJoined || event.dateIn, gw.dateLeft || event.dateOut || todayStr);
        const result = npk1.fn({
          headCount: gw.headCount ?? 0,
          avgWeightKg: gw.avgWeightKg ?? 0,
          days,
          excretionNRate: cls?.excretionN ?? 0.34,
          excretionPRate: cls?.excretionP ?? 0.092,
          excretionKRate: cls?.excretionK ?? 0.24,
        });
        totalNPK += (result.n + result.p + result.k) * 2.20462;
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
  // Threshold per §17.4 — need head count for per-head calc
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const totalHead = memberships.length || 1;
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
  const groups = getAll('groups').filter(g => !g.archived);
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
  // Find active event for this group
  const groupWindows = getAll('eventGroupWindows');
  const activeGW = groupWindows.find(gw => gw.groupId === group.id && !gw.dateLeft);
  const activeEvent = activeGW ? getById('events', activeGW.eventId) : null;
  const isOnPasture = !!(activeEvent && !activeEvent.dateOut);

  // Head count
  const memberships = getAll('animalGroupMemberships');
  const headCount = memberships.filter(m => m.groupId === group.id && !m.dateLeft).length;

  // Average weight
  const avgWeightDisplay = activeGW?.avgWeightKg
    ? display(activeGW.avgWeightKg, 'weight', unitSys, 0)
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
    const todayStr = new Date().toISOString().slice(0, 10);
    dayCount = daysBetweenInclusive(activeEvent.dateIn, todayStr);
  }

  const isExpanded = expandedGroups.has(group.id) || isOnPasture;

  // Composition line
  const animals = getAll('animals');
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
        headCount: activeGW.headCount ?? 0,
        avgWeightKg: activeGW.avgWeightKg ?? 0,
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
  if (isOnPasture && activeGW && activeGW.avgWeightKg > 0) {
    const npk1 = getCalcByName('NPK-1');
    if (npk1) {
      const cls = activeGW.animalClassId ? getById('animalClasses', activeGW.animalClassId) : null;
      const todayStr = new Date().toISOString().slice(0, 10);
      const days = daysBetweenInclusive(activeGW.dateJoined || activeEvent.dateIn, todayStr);
      const result = npk1.fn({
        headCount: activeGW.headCount ?? 0,
        avgWeightKg: activeGW.avgWeightKg ?? 0,
        days,
        excretionNRate: cls?.excretionN ?? 0.34,
        excretionPRate: cls?.excretionP ?? 0.092,
        excretionKRate: cls?.excretionK ?? 0.24,
      });
      const nLbs = (result.n * 2.20462).toFixed(1);
      const pLbs = (result.p * 2.20462).toFixed(1);
      const kLbs = (result.k * 2.20462).toFixed(1);
      npkEl = el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
        `NPK deposited: N${nLbs} P${pLbs} K${kLbs} lbs`,
      ]);
    }
  }

  // Build card
  const card = el('div', {
    className: 'card dash-grp-card',
    'data-testid': `dashboard-group-card-${group.id}`,
  }, [
    // Header
    el('div', {
      className: 'dash-grp-header',
      onClick: () => {
        if (expandedGroups.has(group.id)) expandedGroups.delete(group.id);
        else expandedGroups.add(group.id);
        const body = card.querySelector('.dash-grp-body');
        const chev = card.querySelector('.dash-grp-chevron');
        if (body) body.classList.toggle('expanded');
        if (chev) chev.classList.toggle('expanded');
      },
    }, [
      el('div', { className: 'dash-grp-header-left' }, [
        group.color
          ? el('div', { className: 'dash-grp-color', style: { background: group.color } })
          : null,
        el('div', {}, [
          el('div', { className: 'dash-grp-name' }, [group.name]),
          el('div', { className: 'dash-grp-meta' }, [
            `${headCount} head`,
            avgWeightDisplay ? ` \u00B7 avg ${avgWeightDisplay}` : '',
            locationName ? ` \u00B7 ${locationName}` : isOnPasture ? '' : ' \u00B7 Not placed',
          ]),
        ]),
      ].filter(Boolean)),
      el('span', { className: `dash-grp-chevron${isExpanded ? ' expanded' : ''}` }, ['\u25BC']),
    ]),

    // Body
    el('div', { className: `dash-grp-body${isExpanded ? ' expanded' : ''}` }, [
      // Composition
      compositionLine ? el('div', { className: 'dash-grp-composition' }, [compositionLine]) : null,

      // Location bar
      isOnPasture ? el('div', { className: 'grp-loc-bar' }, [
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' } }, [
          el('span', { style: { fontWeight: '500' } }, [locationName]),
          el('span', { className: 'badge badge-green' }, [t('dashboard.grazing')]),
          el('span', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('dashboard.dayLabel', { count: dayCount })]),
          subMoveCount > 0
            ? el('span', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('dashboard.subMovesLabel', { count: subMoveCount })])
            : null,
          feedCount > 0
            ? el('span', { style: { fontSize: '12px', color: 'var(--text2)' } }, [t('dashboard.feedingsLabel', { count: feedCount })])
            : null,
          feedCost > 0
            ? el('span', { style: { fontSize: '12px', color: 'var(--text2)' } }, [`$${feedCost.toFixed(2)}`])
            : null,
        ].filter(Boolean)),
      ]) : null,

      // DMI
      dmiEl,

      // NPK
      npkEl,

      // Action buttons
      el('div', { className: 'dash-actions' }, [
        isOnPasture
          ? el('button', {
              className: 'btn btn-teal btn-sm',
              'data-testid': `dashboard-move-btn-${group.id}`,
              onClick: (e) => { e.stopPropagation(); openMoveWizard(activeEvent, operationId, farmId); },
            }, [t('dashboard.move')])
          : el('button', {
              className: 'btn btn-teal btn-sm',
              'data-testid': `dashboard-place-btn-${group.id}`,
              onClick: (e) => { e.stopPropagation(); navigate('#/events'); },
            }, [t('dashboard.place')]),
        el('button', {
          className: 'btn btn-outline btn-sm',
          onClick: (e) => { e.stopPropagation(); navigate('#/animals'); },
        }, [t('dashboard.weights')]),
        isOnPasture
          ? el('button', {
              className: 'btn btn-outline btn-sm',
              onClick: (e) => { e.stopPropagation(); openCloseEventSheet(activeEvent, operationId); },
            }, [t('action.edit')])
          : el('button', {
              className: 'btn btn-outline btn-sm',
              onClick: (e) => { e.stopPropagation(); navigate('#/animals'); },
            }, [t('action.edit')]),
      ]),
    ].filter(Boolean)),
  ]);

  return card;
}

// ---------------------------------------------------------------------------
// §17.7: Locations view
// ---------------------------------------------------------------------------

function renderLocationsView(gridEl) {
  const activeEvents = getVisibleEvents().filter(e => !e.dateOut);
  const groups = getVisibleGroups().filter(g => !g.archived);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
  const operationId = getAll('operations')[0]?.id;
  const farmId = getActiveFarmId() || getAll('farms')[0]?.id;

  if (!activeEvents.length && !groups.length) {
    gridEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'dashboard-empty' }, [
      t('dashboard.noActiveEvents'),
    ]));
    return;
  }

  const grid = el('div', { className: 'dash-grid' });

  // Active event cards — one per event
  for (const event of activeEvents) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && !w.dateClosed);
    const primaryPw = pws[0];
    const loc = primaryPw ? getById('locations', primaryPw.locationId) : null;
    const locName = loc ? loc.name : '?';
    const landUse = loc?.landUse || 'pasture';

    // Groups in this event
    const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === event.id && !gw.dateLeft);
    const groupLines = gws.map(gw => {
      const grp = getById('groups', gw.groupId);
      return grp ? `${grp.name} (${gw.headCount ?? '?'} head)` : '';
    }).filter(Boolean);

    const todayStr = new Date().toISOString().slice(0, 10);
    const dayCount = daysBetweenInclusive(event.dateIn, todayStr);

    // Feed status
    const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
    const feedCount = feedEntries.length;
    let feedCost = 0;
    const cst1 = getCalcByName('CST-1');
    if (cst1 && feedCount) {
      const batches = getAll('batches');
      const batchMap = new Map(batches.map(b => [b.id, b]));
      feedCost = cst1.fn({ entries: feedEntries.map(fe => ({ qtyUnits: fe.quantity, costPerUnit: batchMap.get(fe.batchId)?.costPerUnit ?? 0 })) });
    }

    // Strip graze status — progress bar per §3.15
    const stripPws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && w.isStripGraze);
    let stripEl = null;
    if (stripPws.length > 0) {
      const sorted = [...stripPws].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
      const totalStrips = sorted[0].areaPct > 0 ? Math.round(100 / sorted[0].areaPct) : sorted.length;
      const completedCount = sorted.filter(s => s.dateClosed).length;
      const currentIdx = sorted.findIndex(s => !s.dateClosed);
      stripEl = el('div', { className: 'strip-progress' }, [
        el('div', { className: 'strip-progress-label' }, [
          `Strip ${currentIdx >= 0 ? currentIdx + 1 : completedCount} of ${totalStrips}`,
        ]),
        el('div', { className: 'strip-progress-bars' },
          Array.from({ length: totalStrips }, (_, i) => {
            let barState;
            if (i < completedCount) barState = 'completed';
            else if (i === currentIdx) barState = 'active';
            else barState = 'upcoming';
            const pct = sorted[i]?.areaPct ?? sorted[0]?.areaPct ?? (100 / totalStrips);
            return el('div', {
              className: `strip-bar strip-${barState}`,
              style: { width: `${pct}%` },
            });
          })
        ),
      ]);
    }

    // Type badge
    const badgeClass = { pasture: 'badge-green', 'mixed-use': 'badge-teal', confinement: 'badge-amber', crop: 'badge-purple' }[landUse] || 'badge-green';

    grid.appendChild(el('div', { className: 'card', 'data-testid': `dashboard-loc-card-${event.id}` }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' } }, [
        el('span', { style: { fontSize: '14px', fontWeight: '600' } }, [locName]),
        el('span', { className: `badge ${badgeClass}` }, [landUse]),
      ]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-2)' } }, [
        groupLines.join(' \u00B7 '),
      ]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: 'var(--space-2)' } }, [
        t('dashboard.dayLabel', { count: dayCount }),
        feedCount > 0 ? ` \u00B7 ${t('dashboard.feedingsLabel', { count: feedCount })} \u00B7 $${feedCost.toFixed(2)}` : '',
      ]),
      stripEl,
      el('div', { className: 'dash-actions' }, [
        el('button', { className: 'btn btn-teal btn-sm', onClick: () => openMoveWizard(event, operationId, farmId) }, [t('dashboard.move')]),
        el('button', { className: 'btn btn-outline btn-sm', onClick: () => openCreateSurveySheet(operationId) }, [t('dashboard.survey')]),
        el('button', { className: 'btn btn-outline btn-sm', onClick: () => openCloseEventSheet(event, operationId) }, [t('action.edit')]),
      ]),
    ].filter(Boolean)));
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

  const groups = getAll('groups').filter(g => !g.archived);
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
