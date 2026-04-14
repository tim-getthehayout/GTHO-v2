/**
 * @file Calendar grid — CP-54.
 * 3-column layout orchestrator: paddock column (180px) + timeline (flex) + sidebar (260px).
 * Computes block positions and delegates to past-block, future-block, sidebar.
 * See V2_DESIGN_SYSTEM.md §4.3.
 */

import { el, clear } from '../../../ui/dom.js';
import { getAll, getByField } from '../../../data/store.js';
import { getCalendarState, getViewMode, setJump } from '../calendar-state.js';
import { getCalcByName } from '../../../utils/calc-registry.js';
import { getUnitSystem } from '../../../utils/preferences.js';
import { daysBetweenInclusive } from '../../../utils/date-utils.js';
import { renderPaddockColumn } from './paddock-column.js';
import { renderTimeline, dateToPx } from './timeline.js';
import { renderSidebar } from './sidebar.js';
import { renderPastBlock, buildGroupLabel } from './past-block.js';
import { renderEstimatedFutureBlock, renderForecastFutureBlock } from './future-block.js';
import { renderHeaderStrip } from './header-strip.js';
import { renderToolbar } from './toolbar.js';
import { renderLegend } from './legend.js';
import { navigate } from '../../../ui/router.js';

const ROW_HEIGHT = 72;

/**
 * Render the full calendar grid.
 * @param {HTMLElement} container
 */
export function renderCalendarGrid(container) {
  clear(container);

  const state = getCalendarState();
  const viewMode = getViewMode();
  const unitSystem = getUnitSystem();

  // ── Data gathering ─────────────────────────────────────────────
  const allLocations = getAll('locations');
  const allEvents = getAll('events');
  const allPaddockWindows = getAll('eventPaddockWindows');
  const allGroupWindows = getAll('eventGroupWindows');
  const allGroups = getAll('groups');

  // Filter locations: exclude confinement unless toggled on
  const locations = allLocations.filter(loc => {
    if (loc.locationType === 'confinement' && !state.showConfinement) return false;
    return loc.locationType !== 'other';
  });

  if (locations.length === 0) {
    container.appendChild(renderEmptyState());
    return;
  }

  // ── Compute active events + linked paddocks + strip info ───────
  const activeEvents = {};
  const linkedPaddocks = {};
  const stripInfo = {};

  for (const loc of locations) {
    const windows = allPaddockWindows.filter(w => w.locationId === loc.id && !w.closedAt);
    if (windows.length > 0) {
      const window = windows[0];
      const event = allEvents.find(e => e.id === window.eventId);
      if (event) activeEvents[loc.id] = event;

      if (window.isStripGraze) {
        const stripWindows = allPaddockWindows.filter(
          w => w.stripGroupId === window.stripGroupId
        );
        const closedStrips = stripWindows.filter(w => w.closedAt).length;
        stripInfo[loc.id] = {
          currentStrip: closedStrips + 1,
          totalStrips: stripWindows.length,
        };
      }
    }

    if (loc.linkedPaddockId) {
      const primary = locations.find(l => l.id === loc.linkedPaddockId);
      if (primary) linkedPaddocks[loc.id] = primary;
    }
  }

  // ── Selected groups for forecaster ─────────────────────────────
  const selectedGroups = state.groups
    .map(gId => allGroups.find(g => g.id === gId))
    .filter(Boolean)
    .map(g => ({ id: g.id, name: g.name }));

  // ── Callback ───────────────────────────────────────────────────
  const onUpdate = () => renderCalendarGrid(container);

  // ── Header strip ───────────────────────────────────────────────
  const headerStrip = renderHeaderStrip({
    selectedGroups,
    period: state.period,
    onUpdate,
  });

  // If List view is selected, return early (events-screen handles list rendering)
  if (state.view === 'list') {
    container.appendChild(headerStrip);
    return;
  }

  // ── Toolbar ────────────────────────────────────────────────────
  const toolbar = renderToolbar(onUpdate);

  // ── Legend ─────────────────────────────────────────────────────
  const legend = renderLegend(viewMode);

  // ── Timeline ───────────────────────────────────────────────────
  const { container: timelineContainer, range, blockArea } = renderTimeline({
    anchor: state.anchor,
    zoom: state.zoom,
  });

  // ── Render blocks per paddock row ──────────────────────────────
  const paddockSummaries = [];

  locations.forEach((loc, rowIdx) => {
    const rowContainer = el('div', {
      className: 'timeline__row',
      style: { top: `${rowIdx * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` },
    });

    // Find events that overlap this location within the visible range
    const locWindows = allPaddockWindows.filter(w => w.locationId === loc.id);
    let rowAuds = 0;
    let rowPasturePct = 0;
    let rowNKg = 0;
    let rowPKg = 0;
    let rowKKg = 0;
    let rowEventCount = 0;

    for (const pw of locWindows) {
      const event = allEvents.find(e => e.id === pw.eventId);
      if (!event) continue;

      const eventStart = new Date(event.dateIn);
      const eventEnd = event.dateOut ? new Date(event.dateOut) : new Date();

      // Check overlap with visible range
      if (eventEnd < range.start || eventStart > range.end) continue;

      rowEventCount++;

      // Compute block position
      const blockStart = new Date(Math.max(eventStart.getTime(), range.start.getTime()));
      const blockEnd = new Date(Math.min(eventEnd.getTime(), range.end.getTime()));
      const leftPx = dateToPx(blockStart, range.start, range.pxPerDay);
      const widthPx = Math.max(4, dateToPx(blockEnd, range.start, range.pxPerDay) - leftPx);

      // Gather groups for this event
      const eventGroupWindows = allGroupWindows.filter(gw => gw.eventId === event.id && !gw.closedAt);
      const eventGroups = eventGroupWindows
        .map(gw => allGroups.find(g => g.id === gw.groupId))
        .filter(Boolean)
        .map(g => ({ id: g.id, name: g.name }));

      const days = daysBetweenInclusive(event.dateIn, event.dateOut || new Date().toISOString().slice(0, 10));
      const isActive = !event.dateOut;

      // Strips for active strip-grazed events
      const strips = pw.isStripGraze && isActive
        ? allPaddockWindows
            .filter(w => w.stripGroupId === pw.stripGroupId)
            .map(w => ({ areaPct: w.areaPct || 100 }))
        : [];

      const stripNote = pw.isStripGraze && !isActive && stripInfo[loc.id]
        ? `Strip ${stripInfo[loc.id].currentStrip}/${stripInfo[loc.id].totalStrips}`
        : null;

      const isLinkedSecondary = !!linkedPaddocks[loc.id];

      // Only render past blocks (left of Today)
      const now = new Date();
      now.setHours(0, 0, 0, 0);

      if (blockStart < now) {
        const pastEnd = new Date(Math.min(blockEnd.getTime(), now.getTime()));
        const pastLeftPx = leftPx;
        const pastWidthPx = Math.max(4, dateToPx(pastEnd, range.start, range.pxPerDay) - pastLeftPx);

        rowContainer.appendChild(renderPastBlock({
          leftPx: pastLeftPx,
          widthPx: pastWidthPx,
          groups: eventGroups,
          auds: Math.round(rowAuds),
          days,
          pasturePct: 0,
          feedPct: 0,
          dmi: 0,
          headCount: eventGroups.length > 0 ? eventGroupWindows.reduce((s, gw) => s + (gw.headCount || 0), 0) : 0,
          isActive,
          isStripGraze: pw.isStripGraze || false,
          strips,
          stripNote,
          isLinkedSecondary,
          linkedPrimaryName: linkedPaddocks[loc.id]?.name,
          eventId: event.id,
          onClickBlock: (eventId) => navigate(`#/events`),
        }));
      }
    }

    // Future blocks
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const hasActiveEvent = !!activeEvents[loc.id];
    const isNeverGrazed = locWindows.length === 0;

    if (range.end > now) {
      const futureLeftPx = dateToPx(now, range.start, range.pxPerDay);
      const futureWidthPx = Math.max(4, dateToPx(range.end, range.start, range.pxPerDay) - futureLeftPx);

      if (viewMode === 'forecast' && selectedGroups.length > 0 && state.period != null) {
        rowContainer.appendChild(renderForecastFutureBlock({
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
          onClickBlock: (locId, action) => {
            if (action === 'survey') navigate('#/locations');
          },
        }));
      } else {
        rowContainer.appendChild(renderEstimatedFutureBlock({
          leftPx: Math.max(0, futureLeftPx),
          widthPx: futureWidthPx,
          minDate: '',
          maxDate: '',
          confidence: 'min',
          isNeverGrazed,
          isGrazingInProgress: hasActiveEvent,
          hayEstimateLbs: '?',
          locationId: loc.id,
          onClickBlock: (locId, action) => {
            if (action === 'survey') navigate('#/locations');
          },
        }));
      }
    }

    blockArea.appendChild(rowContainer);

    paddockSummaries.push({
      locationId: loc.id,
      locationName: loc.name,
      auds: rowAuds,
      pasturePct: rowPasturePct,
      nKg: rowNKg,
      pKg: rowPKg,
      kKg: rowKKg,
      eventCount: rowEventCount,
      isNeverGrazed,
    });
  });

  // Set block area height
  blockArea.style.height = `${locations.length * ROW_HEIGHT}px`;

  // ── Paddock column ─────────────────────────────────────────────
  const paddockCol = renderPaddockColumn({
    locations,
    activeEvents,
    linkedPaddocks,
    stripInfo,
    unitSystem,
  });

  // ── Sidebar ────────────────────────────────────────────────────
  const dateRangeLabel = `${range.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${range.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  const sidebar = renderSidebar({
    paddockSummaries,
    totals: {
      auds: paddockSummaries.reduce((s, p) => s + p.auds, 0),
      avgFeedCost: 0,
    },
    dateRangeLabel,
    unitSystem,
    onRowClick: () => {},
  });

  // ── Keyboard shortcuts (§19.9) ─────────────────────────────────
  const onKeyDown = (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    switch (e.key) {
      case 'ArrowLeft':
        timelineContainer.scrollLeft -= e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
        break;
      case 'ArrowRight':
        timelineContainer.scrollLeft += e.shiftKey ? range.pxPerDay * 7 : range.pxPerDay;
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

  // ── Assemble ───────────────────────────────────────────────────
  const grid = el('div', { className: 'calendar-grid', dataset: { testid: 'calendar-grid' } }, [
    paddockCol,
    timelineContainer,
    sidebar,
  ]);

  container.appendChild(headerStrip);
  container.appendChild(toolbar);
  container.appendChild(legend);
  container.appendChild(grid);

  // Attach keyboard handler
  container.setAttribute('tabindex', '0');
  container.addEventListener('keydown', onKeyDown);
}

/**
 * Render the empty state when no paddocks exist.
 * @returns {HTMLElement}
 */
function renderEmptyState() {
  return el('div', {
    className: 'calendar-empty',
    dataset: { testid: 'calendar-empty' },
  }, [
    el('h2', {}, ['No paddocks yet']),
    el('p', {}, ['Add locations in Fields to start using the rotation calendar.']),
    el('button', {
      className: 'btn btn--primary',
      onClick: () => navigate('#/locations'),
      type: 'button',
    }, ['+ Add location']),
  ]);
}
