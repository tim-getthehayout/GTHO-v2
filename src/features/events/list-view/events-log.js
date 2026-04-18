/**
 * @file Events log (list view) — CP-54.
 * GRZ-10 pattern: parent rows + sub-move threads, filter dropdown, summary metrics.
 * Used by both desktop Calendar/List toggle and mobile fallback.
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.8.
 */

import { el, clear } from '../../../ui/dom.js';
import { t } from '../../../i18n/i18n.js';
import { getAll, getByField, getVisibleEvents } from '../../../data/store.js';
import { getUnitSystem } from '../../../utils/preferences.js';
import { display } from '../../../utils/units.js';
import { daysBetweenInclusive } from '../../../utils/date-utils.js';
import { navigate } from '../../../ui/router.js';
import { buildGroupLabel } from '../rotation-calendar/past-block.js';
import { getEventStartDate } from '../event-start.js';

/**
 * Render the events log.
 * @param {HTMLElement} container
 */
export function renderEventsLog(container) {
  clear(container);

  const unitSystem = getUnitSystem();
  const allEvents = getVisibleEvents ? getVisibleEvents() : getAll('events');
  const allPaddockWindows = getAll('eventPaddockWindows');
  const allGroupWindows = getAll('eventGroupWindows');
  const allGroups = getAll('groups');
  const allLocations = getAll('locations');

  // Filter state
  let filter = 'all'; // 'all' | 'open' | 'closed'

  const wrapper = el('div', { className: 'events-log', dataset: { testid: 'events-log' } });

  function render() {
    clear(wrapper);

    // Filter dropdown
    const filterSelect = el('select', {
      className: 'events-log__filter-select',
      onChange: (e) => { filter = e.target.value; render(); },
      'aria-label': 'Filter events',
    }, [
      el('option', { value: 'all', ...(filter === 'all' ? { selected: 'selected' } : {}) }, [t('filter.all')]),
      el('option', { value: 'open', ...(filter === 'open' ? { selected: 'selected' } : {}) }, [t('filter.open')]),
      el('option', { value: 'closed', ...(filter === 'closed' ? { selected: 'selected' } : {}) }, [t('filter.closed')]),
    ]);

    const filterBar = el('div', { className: 'events-log__filter' }, [filterSelect]);
    wrapper.appendChild(filterBar);

    // Filter events
    let events = [...allEvents];
    if (filter === 'open') events = events.filter(e => !e.dateOut);
    if (filter === 'closed') events = events.filter(e => !!e.dateOut);

    // Sort: open first (by derived start desc), then closed (by dateOut desc)
    const startByEvt = new Map(events.map(e => [e.id, getEventStartDate(e.id) || '']));
    events.sort((a, b) => {
      if (!a.dateOut && b.dateOut) return -1;
      if (a.dateOut && !b.dateOut) return 1;
      const dateA = a.dateOut || startByEvt.get(a.id);
      const dateB = b.dateOut || startByEvt.get(b.id);
      return new Date(dateB) - new Date(dateA);
    });

    if (events.length === 0) {
      wrapper.appendChild(el('div', { className: 'events-log__empty' }, [
        t('event.empty'),
      ]));
      return;
    }

    const list = el('div', { className: 'events-log__list' });

    for (const event of events) {
      const windows = allPaddockWindows.filter(w => w.eventId === event.id);
      const groupWindows = allGroupWindows.filter(gw => gw.eventId === event.id);
      const isActive = !event.dateOut;
      const today = new Date().toISOString().slice(0, 10);
      const eventStart = startByEvt.get(event.id) || '';
      const days = eventStart ? daysBetweenInclusive(eventStart, event.dateOut || today) : 0;

      // Location summary
      const locationNames = [...new Set(
        windows.map(w => {
          const loc = allLocations.find(l => l.id === w.locationId);
          return loc ? loc.name : '—';
        })
      )];
      const locationSummary = locationNames.join(', ');

      // Group summary
      const groups = groupWindows
        .map(gw => allGroups.find(g => g.id === gw.groupId))
        .filter(Boolean)
        .map(g => ({ id: g.id, name: g.name }));
      const groupLabel = buildGroupLabel(groups);

      // Date range
      const dateRange = event.dateOut
        ? `${eventStart} – ${event.dateOut}`
        : `${eventStart} – ongoing`;

      // Badge
      const badge = el('span', {
        className: `events-log__badge events-log__badge--${isActive ? 'active' : 'closed'}`,
      }, [isActive ? t('filter.active') : t('filter.closed')]);

      // Meta row
      const meta = el('div', { className: 'events-log__meta' }, [
        el('span', {}, [dateRange]),
        el('span', {}, [`${days}d`]),
        el('span', {}, [groupLabel.text]),
      ]);

      // Metrics (summary per event)
      const metrics = el('div', { className: 'events-log__metrics' }, [
        el('span', {}, [`AU: —`]),
        el('span', {}, [`Pasture AUDS: —`]),
        el('span', {}, [`ADA: —`]),
        el('span', {}, [`Pasture DMI: —`]),
        el('span', {}, [`Stored Feed DMI: —`]),
      ]);

      // Sub-moves
      const primaryWindow = windows.find(w => !w.parentWindowId) || windows[0];
      const subMoveWindows = windows.filter(w => w.parentWindowId);
      let submovesEl = null;

      if (subMoveWindows.length > 0) {
        const subItems = subMoveWindows.map(sw => {
          const loc = allLocations.find(l => l.id === sw.locationId);
          const smActive = !sw.closedAt;
          return el('div', { className: 'events-log__submove-item' }, [
            el('span', {
              className: `events-log__submove-badge events-log__submove-badge--${smActive ? 'active' : 'returned'}`,
            }, [smActive ? 'Active' : 'Returned']),
            el('span', {}, [loc ? loc.name : '—']),
            el('span', {}, [sw.openedAt ? sw.openedAt.slice(0, 10) : '']),
          ]);
        });
        submovesEl = el('div', { className: 'events-log__submoves' }, subItems);
      }

      const item = el('div', {
        className: 'events-log__item',
        dataset: { testid: 'events-log-item', eventId: event.id },
        onClick: () => navigate('#/events'),
        tabindex: '0',
        role: 'button',
        'aria-label': `${locationSummary}, ${dateRange}`,
      }, [
        el('div', { className: 'events-log__item-header' }, [
          el('span', { className: 'events-log__location' }, [locationSummary]),
          badge,
        ]),
        meta,
        metrics,
        submovesEl,
      ].filter(Boolean));

      list.appendChild(item);
    }

    wrapper.appendChild(list);
  }

  render();
  container.appendChild(wrapper);
}
