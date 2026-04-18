/**
 * @file Mobile events screen — CP-54.
 * GRZ-11 active-rotation banner + GRZ-10 events log.
 * Rendered when viewport < 900px. No calendar on mobile (§19.7).
 * See V2_DESIGN_SYSTEM.md §4.3 and V2_UX_FLOWS.md §19.7.
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getVisibleEvents } from '../../data/store.js';
import { renderEventsLog } from './list-view/events-log.js';
import { getEventStartDate } from './event-start.js';

/**
 * Render the GRZ-11 active-rotation banner.
 * Shows paddock chips with status colors, date in, feeding count, groups.
 * @returns {HTMLElement|null}
 */
function renderActiveRotationBanner() {
  const allEvents = getVisibleEvents ? getVisibleEvents() : getAll('events');
  const activeEvents = allEvents.filter(e => !e.dateOut);

  if (activeEvents.length === 0) return null;

  const allPaddockWindows = getAll('eventPaddockWindows');
  const allGroupWindows = getAll('eventGroupWindows');
  const allGroups = getAll('groups');
  const allLocations = getAll('locations');
  const allFeedEntries = getAll('eventFeedEntries');

  const chips = [];

  for (const event of activeEvents) {
    const windows = allPaddockWindows.filter(w => w.eventId === event.id && !w.closedAt);
    const groupWindows = allGroupWindows.filter(gw => gw.eventId === event.id && !gw.closedAt);
    const feedCount = allFeedEntries.filter(fe => fe.eventId === event.id).length;

    for (const pw of windows) {
      const loc = allLocations.find(l => l.id === pw.locationId);
      if (!loc) continue;

      const groups = groupWindows
        .map(gw => allGroups.find(g => g.id === gw.groupId))
        .filter(Boolean);

      const groupText = groups.length > 0
        ? groups.map(g => g.name).join(', ')
        : '—';

      const isActive = !pw.closedAt;

      chips.push(el('div', {
        className: `active-rotation-banner__chip${isActive ? ' active-rotation-banner__chip--active' : ''}`,
        dataset: { testid: 'rotation-chip' },
      }, [
        el('span', {
          className: `active-rotation-banner__chip-dot${!isActive ? ' active-rotation-banner__chip-dot--left' : ''}`,
        }),
        el('span', {}, [loc.name]),
      ]));
    }

    // Detail line under chips for this event
    const today = new Date().toISOString().slice(0, 10);
    const startDate = getEventStartDate(event.id);
    const days = startDate ? Math.max(1, Math.round((new Date(today) - new Date(startDate)) / 86400000) + 1) : 1;

    chips.push(el('div', { className: 'active-rotation-banner__detail' }, [
      t('event.detailSummary', { days, feedings: allFeedEntries.filter(fe => fe.eventId === event.id).length, groups: groupWindows.length }),
    ]));
  }

  return el('div', {
    className: 'active-rotation-banner',
    dataset: { testid: 'active-rotation-banner' },
  }, [
    el('div', { className: 'active-rotation-banner__title' }, [
      `${activeEvents.length} Active Rotation${activeEvents.length !== 1 ? 's' : ''}`,
    ]),
    el('div', { className: 'active-rotation-banner__chips' }, chips),
  ]);
}

/**
 * Render the full mobile events screen.
 * @param {HTMLElement} container
 */
export function renderMobileEventsScreen(container) {
  clear(container);

  const wrapper = el('div', {
    className: 'mobile-events',
    dataset: { testid: 'mobile-events-screen' },
  });

  // GRZ-11: Active rotation banner
  const banner = renderActiveRotationBanner();
  if (banner) wrapper.appendChild(banner);

  // GRZ-10: Events log
  const logContainer = el('div');
  renderEventsLog(logContainer);
  wrapper.appendChild(logContainer);

  container.appendChild(wrapper);
}
