/** @file Dashboard screen — CP-21. Group cards with location status, move action, FAB. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { navigate } from '../../ui/router.js';

/** Unsubscribe functions */
let unsubs = [];

/** Expanded group cards (mobile) */
const expandedGroups = new Set();

/** FAB menu open state */
let fabOpen = false;

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
    el('h1', { className: 'screen-heading' }, [t('dashboard.title')]),

    // Group cards grid
    el('div', { 'data-testid': 'dashboard-group-grid' }),

    // FAB
    renderFAB(),
  ]);

  container.appendChild(screenEl);
  renderGroupGrid(container);

  unsubs.push(subscribe('groups', () => renderGroupGrid(container)));
  unsubs.push(subscribe('events', () => renderGroupGrid(container)));
  unsubs.push(subscribe('eventPaddockWindows', () => renderGroupGrid(container)));
  unsubs.push(subscribe('eventGroupWindows', () => renderGroupGrid(container)));
  unsubs.push(subscribe('animalGroupMemberships', () => renderGroupGrid(container)));
}

// ---------------------------------------------------------------------------
// Group grid
// ---------------------------------------------------------------------------

function renderGroupGrid(rootContainer) {
  const gridEl = rootContainer.querySelector('[data-testid="dashboard-group-grid"]');
  if (!gridEl) return;
  clear(gridEl);

  const groups = getAll('groups').filter(g => !g.archived);

  if (!groups.length) {
    gridEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'dashboard-empty',
    }, [t('dashboard.noGroups')]));
    return;
  }

  const grid = el('div', { className: 'dash-grid' });
  for (const group of groups) {
    grid.appendChild(renderGroupCard(group));
  }
  gridEl.appendChild(grid);
}

function renderGroupCard(group) {
  const unitSys = getUnitSystem();

  // Find active event for this group
  const groupWindows = getAll('eventGroupWindows');
  const activeGW = groupWindows.find(gw => gw.groupId === group.id && !gw.dateLeft);
  const activeEvent = activeGW ? getById('events', activeGW.eventId) : null;

  // Head count from memberships
  const memberships = getAll('animalGroupMemberships');
  const headCount = memberships.filter(m => m.groupId === group.id && !m.dateLeft).length;

  // Location info
  let locationName = t('dashboard.notOnEvent');
  let dayCount = 0;
  let isOnPasture = false;

  if (activeEvent && !activeEvent.dateOut) {
    isOnPasture = true;
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === activeEvent.id && !w.dateClosed);
    if (pws.length) {
      const loc = getById('locations', pws[0].locationId);
      locationName = loc ? loc.name : '?';
    }
    const todayStr = new Date().toISOString().slice(0, 10);
    dayCount = daysBetweenInclusive(activeEvent.dateIn, todayStr);
  }

  const isExpanded = expandedGroups.has(group.id);

  const card = el('div', {
    className: 'card dash-grp-card',
    'data-testid': `dashboard-group-card-${group.id}`,
  }, [
    // Header (clickable to expand on mobile)
    el('div', {
      className: 'dash-grp-header',
      onClick: () => {
        if (isExpanded) expandedGroups.delete(group.id);
        else expandedGroups.add(group.id);
        // Re-render just this card's body
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
            t('dashboard.headCount', { count: headCount }),
            activeGW ? ` · ${display(activeGW.avgWeightKg, 'weight', unitSys, 0)} avg` : '',
          ]),
        ]),
      ].filter(Boolean)),
      el('span', { className: `dash-grp-chevron${isExpanded ? ' expanded' : ''}` }, ['\u25BC']),
    ]),

    // Body (collapsible on mobile)
    el('div', { className: `dash-grp-body${isExpanded ? ' expanded' : ''}` }, [
      // Location bar
      el('div', { className: 'dash-loc-bar' }, [
        el('div', {}, [
          el('span', { style: { fontWeight: '500' } }, [locationName]),
          isOnPasture
            ? el('span', { className: 'badge badge-green', style: { marginLeft: 'var(--space-2)' } }, [
                t('dashboard.daysOn', { days: dayCount }),
              ])
            : null,
        ].filter(Boolean)),
      ]),

      // Metrics placeholder
      el('div', { className: 'form-hint', style: { fontStyle: 'italic', marginBottom: 'var(--space-3)' } }, [
        t('dashboard.metricsPlaceholder'),
      ]),

      // Action buttons
      isOnPasture ? el('div', { className: 'dash-actions' }, [
        el('button', {
          className: 'btn btn-green btn-sm',
          'data-testid': `dashboard-move-btn-${group.id}`,
          onClick: (e) => {
            e.stopPropagation();
            // Navigate to events and trigger move wizard
            navigate('#/events');
            // The move wizard needs the source event — we'll use a setTimeout to let the route render
            setTimeout(() => {
              const moveBtn = document.querySelector(`[data-testid="events-move-btn-${activeEvent.id}"]`);
              if (moveBtn) moveBtn.click();
            }, 100);
          },
        }, [t('dashboard.move')]),
      ]) : null,
    ].filter(Boolean)),
  ]);

  return card;
}

// ---------------------------------------------------------------------------
// FAB
// ---------------------------------------------------------------------------

function renderFAB() {
  const fabWrap = el('div', { className: 'fab-wrap', 'data-testid': 'dashboard-fab' });

  const menu = el('div', { className: 'fab-menu', 'data-testid': 'dashboard-fab-menu' }, [
    el('button', {
      className: 'fab-menu-item',
      'data-testid': 'dashboard-fab-event',
      onClick: () => { fabOpen = false; navigate('#/events'); },
    }, [t('dashboard.createEvent')]),
    el('button', {
      className: 'fab-menu-item',
      'data-testid': 'dashboard-fab-location',
      onClick: () => { fabOpen = false; navigate('#/locations'); },
    }, [t('dashboard.addLocation')]),
    el('button', {
      className: 'fab-menu-item',
      'data-testid': 'dashboard-fab-group',
      onClick: () => { fabOpen = false; navigate('#/animals'); },
    }, [t('dashboard.addGroup')]),
  ]);

  const btn = el('button', {
    className: 'fab-btn',
    'data-testid': 'dashboard-fab-btn',
    onClick: () => {
      fabOpen = !fabOpen;
      menu.classList.toggle('open', fabOpen);
    },
  }, ['+']);

  fabWrap.appendChild(menu);
  fabWrap.appendChild(btn);

  return fabWrap;
}
