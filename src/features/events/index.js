/** @file Events screen — CP-17, CP-54. Orchestrates calendar/list view + mobile fallback. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { navigate } from '../../ui/router.js';
import { getAll, getById, add, subscribe, getVisibleEvents, getActiveFarmId } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import * as ObservationEntity from '../../entities/paddock-observation.js';
import { openMoveWizard } from './move-wizard.js';
import { openSubmoveOpenSheet, openSubmoveCloseSheet, openAdvanceStripSheet } from './submove.js';
import { openGroupAddSheet, openGroupRemoveSheet } from './group-windows.js';
import { openCloseEventSheet } from './close.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { readStateFromUrl, getCalendarState } from './calendar-state.js';
import { renderCalendarGrid } from './rotation-calendar/calendar-grid.js';
import { renderEventsLog } from './list-view/events-log.js';
import { renderMobileEventsScreen } from './mobile-events-screen.js';

/** Unsubscribe functions */
let unsubs = [];

/**
 * Create a paddock observation record.
 * @param {string} operationId
 * @param {string} locationId
 * @param {'open'|'close'} type
 * @param {string} sourceId - The paddock window ID
 * @param {string} observedAt - ISO timestamp
 * @param {object} [fields] - Optional observation data fields
 * @param {number} [fields.forageHeightCm]
 * @param {number} [fields.forageCoverPct]
 * @param {number} [fields.residualHeightCm]
 * @param {number} [fields.recoveryMinDays]
 * @param {number} [fields.recoveryMaxDays]
 */
export function createObservation(operationId, locationId, type, sourceId, observedAt, fields = {}) {
  const obs = ObservationEntity.create({
    operationId,
    locationId,
    type,
    source: 'event',
    sourceId,
    observedAt,
    ...fields,
  });
  add('paddockObservations', obs, ObservationEntity.validate,
    ObservationEntity.toSupabaseShape, 'paddock_observations');
}

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderEventsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  const farms = getAll('farms');
  if (!operations.length || !farms.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('event.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = operations[0].id;
  const farmId = farms[0].id;

  // Read calendar state from URL (deep-link support)
  readStateFromUrl();

  // Mobile fallback: no calendar below 900px (§19.7)
  const isMobile = window.innerWidth < 900;

  const screenEl = el('div', { className: 'events-screen', 'data-testid': 'events-screen' });

  if (isMobile) {
    // Mobile: GRZ-11 banner + GRZ-10 events log, no calendar
    renderMobileEventsScreen(screenEl);
  } else {
    // Desktop: calendar or list view based on state
    const calendarContainer = el('div', { 'data-testid': 'calendar-container' });
    renderCalendarGrid(calendarContainer);

    screenEl.appendChild(calendarContainer);

    // If list view is active, also render the events log below the header strip
    const state = getCalendarState();
    if (state.view === 'list') {
      const listContainer = el('div');
      renderEventsLog(listContainer);
      screenEl.appendChild(listContainer);
    }
  }

  // Sheet wrappers (needed by both views for event management actions)
  const sheetsContainer = el('div', { className: 'events-sheets' }, [
    // Create event sheet
    renderCreateEventSheetMarkup(),

    // Sub-move open sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'submove-open-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => submoveOpenSheetRef && submoveOpenSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'submove-open-sheet-panel' }),
    ]),

    // Sub-move close sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'submove-close-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => submoveCloseSheetRef && submoveCloseSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'submove-close-sheet-panel' }),
    ]),

    // Group add sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'group-add-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => groupAddSheetRef && groupAddSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'group-add-sheet-panel' }),
    ]),

    // Group remove sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'group-remove-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => groupRemoveSheetRef && groupRemoveSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'group-remove-sheet-panel' }),
    ]),

    // Move wizard sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'move-wizard-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => moveWizardSheetRef && moveWizardSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'move-wizard-sheet-panel' }),
    ]),

    // Close event sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'close-event-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeEventSheetRef && closeEventSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'close-event-sheet-panel' }),
    ]),

    // Advance strip sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'advance-strip-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => advanceStripSheetRef && advanceStripSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'advance-strip-sheet-panel' }),
    ]),

    // Deliver feed sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'deliver-feed-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => deliverFeedSheetRef && deliverFeedSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'deliver-feed-sheet-panel' }),
    ]),

    // Feed check sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'feed-check-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => feedCheckSheetRef && feedCheckSheetRef.close() }),
      el('div', { className: 'sheet-panel', id: 'feed-check-sheet-panel' }),
    ]),
  ]);

  screenEl.appendChild(sheetsContainer);
  container.appendChild(screenEl);

  // Create event button (floating action for mobile, or accessible from list view)
  // Keep subscriptions for sheet-based event management
  unsubs.push(subscribe('events', () => {
    const state = getCalendarState();
    if (isMobile || state.view === 'list') {
      // Re-render will happen via the calendar grid's own re-render, or via list refresh
    }
  }));
}

// Backdrop sheet refs — lazily resolved so each sub-module owns its own Sheet instance.
// These are only used by the backdrop onClick handlers above; the sub-modules create
// and manage the Sheet objects themselves.
const submoveOpenSheetRef   = { close: () => document.getElementById('submove-open-sheet-wrap')?.classList.remove('open') };
const submoveCloseSheetRef  = { close: () => document.getElementById('submove-close-sheet-wrap')?.classList.remove('open') };
const groupAddSheetRef      = { close: () => document.getElementById('group-add-sheet-wrap')?.classList.remove('open') };
const groupRemoveSheetRef   = { close: () => document.getElementById('group-remove-sheet-wrap')?.classList.remove('open') };
const moveWizardSheetRef    = { close: () => document.getElementById('move-wizard-sheet-wrap')?.classList.remove('open') };
const closeEventSheetRef    = { close: () => document.getElementById('close-event-sheet-wrap')?.classList.remove('open') };
const advanceStripSheetRef  = { close: () => document.getElementById('advance-strip-sheet-wrap')?.classList.remove('open') };
const deliverFeedSheetRef   = { close: () => document.getElementById('deliver-feed-sheet-wrap')?.classList.remove('open') };
const feedCheckSheetRef     = { close: () => document.getElementById('feed-check-sheet-wrap')?.classList.remove('open') };

// ---------------------------------------------------------------------------
// Event list
// ---------------------------------------------------------------------------

function renderEventList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="events-list"]');
  if (!listEl) return;
  clear(listEl);

  const events = getVisibleEvents();

  if (!events.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'events-empty' }, [t('event.empty')]));
    return;
  }

  // Sort: active first (dateOut null), then by dateIn descending
  const sorted = [...events].sort((a, b) => {
    const aActive = !a.dateOut;
    const bActive = !b.dateOut;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return (b.dateIn || '').localeCompare(a.dateIn || '');
  });

  const operations = getAll('operations');
  const operationId = operations[0]?.id;

  const list = el('div', { className: 'event-list' });
  for (const evt of sorted) {
    list.appendChild(renderEventCard(evt, operationId));
  }
  listEl.appendChild(list);
}

function renderEventCard(evt, operationId) {
  const isActive = !evt.dateOut;
  const paddockWindows = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id);
  const groupWindows = getAll('eventGroupWindows').filter(w => w.eventId === evt.id);
  const unitSys = getUnitSystem();

  // Primary location name (first opened paddock window)
  const sortedPW = [...paddockWindows].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
  const primaryLoc = sortedPW.length ? getById('locations', sortedPW[0].locationId) : null;
  const titleText = primaryLoc ? primaryLoc.name : evt.id.slice(0, 8);

  // Day count
  const todayStr = new Date().toISOString().slice(0, 10);
  const endDate = evt.dateOut || todayStr;
  const dayCount = evt.dateIn ? daysBetweenInclusive(evt.dateIn, endDate) : 0;

  return el('div', {
    className: 'card event-card',
    'data-testid': `events-card-${evt.id}`,
  }, [
    // Header
    el('div', { className: 'event-card-header' }, [
      el('div', {}, [
        el('div', { className: 'event-card-title' }, [
          titleText,
          ...(!getActiveFarmId() ? [renderFarmChip(evt.farmId)] : []),
        ]),
        el('div', { className: 'event-card-date' }, [
          evt.dateIn + (evt.timeIn ? ` ${evt.timeIn}` : ''),
        ]),
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)' } }, [
        el('span', { className: 'form-hint' }, [t('event.daysOn', { days: dayCount })]),
        el('span', {
          className: `badge ${isActive ? 'badge-green' : 'badge-amber'}`,
          'data-testid': `events-status-${evt.id}`,
        }, [isActive ? t('event.status.active') : t('event.status.closed')]),
      ]),
    ]),

    // Cross-farm markers (GH-5)
    ...renderCrossFarmMarkers(evt),

    // Body
    el('div', { className: 'event-card-body' }, [
      // Paddock windows section
      paddockWindows.length ? renderPaddockWindowsSection(sortedPW, isActive, evt, operationId) : null,

      // Group windows section
      groupWindows.length ? renderGroupWindowsSection(groupWindows, unitSys, isActive, evt, operationId) : null,

      // Action buttons for active events
      isActive ? el('div', { className: 'event-card-section' }, [
        el('div', { className: 'btn-row' }, [
          el('button', {
            className: 'btn btn-green btn-sm',
            'data-testid': `events-move-btn-${evt.id}`,
            onClick: () => openMoveWizard(evt, operationId, evt.farmId),
          }, [t('event.moveWizard')]),
          // Advance Strip button — visible when event has open strip graze window
          ...(paddockWindows.some(w => w.isStripGraze && !w.dateClosed) ? [
            el('button', {
              className: 'btn btn-outline btn-sm',
              'data-testid': `events-advance-strip-btn-${evt.id}`,
              onClick: () => openAdvanceStripSheet(evt, operationId),
            }, [t('event.advanceStrip')]),
          ] : []),
          el('button', {
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-submove-btn-${evt.id}`,
            onClick: () => openSubmoveOpenSheet(evt, operationId),
          }, [t('event.subMove')]),
          el('button', {
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-add-group-btn-${evt.id}`,
            onClick: () => openGroupAddSheet(evt, operationId),
          }, [t('event.addGroupTitle')]),
          el('button', {
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-deliver-feed-btn-${evt.id}`,
            onClick: () => openDeliverFeedSheet(evt, operationId),
          }, [t('feed.deliverFeed')]),
          el('button', {
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-feed-check-btn-${evt.id}`,
            onClick: () => openFeedCheckSheet(evt, operationId),
          }, [t('feed.feedCheck')]),
        ]),
        el('div', { className: 'btn-row', style: { marginTop: 'var(--space-2)' } }, [
          el('button', {
            className: 'btn btn-red btn-sm',
            'data-testid': `events-close-event-btn-${evt.id}`,
            onClick: () => openCloseEventSheet(evt, operationId),
          }, [t('event.closeEvent')]),
        ]),
      ]) : null,

      // Feed/metrics placeholders
      el('div', { className: 'event-card-section' }, [
        el('div', { className: 'form-hint', style: { fontStyle: 'italic' } }, [t('event.metricsPlaceholder')]),
      ]),
    ].filter(Boolean)),
  ]);
}

function renderFarmChip(farmId) {
  const farm = getById('farms', farmId);
  return el('span', { className: 'farm-chip' }, [farm?.name || '']);
}

/**
 * Render cross-farm move markers on event cards (GH-5).
 * "← Moved from {farm}" when sourceEventId links to a different farm.
 * "→ Moved to {farm}" when another event's sourceEventId points here from a different farm.
 */
function renderCrossFarmMarkers(evt) {
  const markers = [];
  const farms = getAll('farms');
  const farmMap = new Map(farms.map(f => [f.id, f.name]));

  // Incoming: this event has sourceEventId from a different farm
  if (evt.sourceEventId) {
    const sourceEvt = getById('events', evt.sourceEventId);
    if (sourceEvt && sourceEvt.farmId !== evt.farmId) {
      const srcFarmName = farmMap.get(sourceEvt.farmId) || '?';
      markers.push(el('div', {
        className: 'cross-farm-marker',
        'data-testid': `cross-farm-from-${evt.id}`,
        style: { cursor: 'pointer' },
        onClick: () => navigate(`#/events`),
      }, [`\u2190 Moved from ${srcFarmName}`]));
    }
  }

  // Outgoing: another event's sourceEventId points to this event from a different farm
  const destEvents = getAll('events').filter(e => e.sourceEventId === evt.id && e.farmId !== evt.farmId);
  for (const dest of destEvents) {
    const destFarmName = farmMap.get(dest.farmId) || '?';
    markers.push(el('div', {
      className: 'cross-farm-marker',
      'data-testid': `cross-farm-to-${evt.id}`,
      style: { cursor: 'pointer' },
      onClick: () => navigate(`#/events`),
    }, [`\u2192 Moved to ${destFarmName}`]));
  }

  return markers;
}

function renderPaddockWindowsSection(windows, eventIsActive, evt, operationId) {
  // Group strip windows by stripGroupId for progress bar rendering
  const stripGroups = new Map();
  for (const w of windows) {
    if (w.isStripGraze && w.stripGroupId) {
      if (!stripGroups.has(w.stripGroupId)) stripGroups.set(w.stripGroupId, []);
      stripGroups.get(w.stripGroupId).push(w);
    }
  }

  const children = [
    el('div', { className: 'event-card-section-title' }, [t('event.paddockWindows')]),
  ];

  // Render strip progress bars (§3.15)
  for (const [groupId, strips] of stripGroups) {
    const sorted = [...strips].sort((a, b) => (a.dateOpened || '').localeCompare(b.dateOpened || ''));
    const loc = getById('locations', sorted[0].locationId);
    const locName = loc ? loc.name : '';
    const totalStrips = sorted[0].areaPct > 0 ? Math.round(100 / sorted[0].areaPct) : sorted.length;
    const completedCount = sorted.filter(s => s.dateClosed).length;
    const currentIdx = sorted.findIndex(s => !s.dateClosed);

    children.push(el('div', {
      className: 'strip-progress',
      'data-testid': `strip-progress-${groupId}`,
    }, [
      el('div', { className: 'strip-progress-label' }, [
        `Strip ${currentIdx >= 0 ? currentIdx + 1 : completedCount} of ${totalStrips}${locName ? ` — ${locName}` : ''}`,
      ]),
      el('div', { className: 'strip-progress-bars' },
        Array.from({ length: totalStrips }, (_, i) => {
          let state;
          if (i < completedCount) state = 'completed';
          else if (i === currentIdx) state = 'active';
          else state = 'upcoming';
          const pct = sorted[i]?.areaPct ?? sorted[0]?.areaPct ?? (100 / totalStrips);
          return el('div', {
            className: `strip-bar strip-${state}`,
            style: { width: `${pct}%` },
            'data-testid': `strip-bar-${groupId}-${i}`,
          });
        })
      ),
    ]));
  }

  // Render individual window rows
  for (let idx = 0; idx < windows.length; idx++) {
    const w = windows[idx];
    const loc = getById('locations', w.locationId);
    const locName = loc ? loc.name : w.locationId.slice(0, 8);
    const isOpen = !w.dateClosed;
    const isPrimary = idx === 0;

    const rightSide = [];
    rightSide.push(el('span', {
      className: `badge ${isOpen ? 'badge-green' : 'badge-amber'}`,
    }, [isOpen ? t('event.windowOpen') : t('event.windowClosed')]));

    // Close button for non-primary open windows on active events
    if (eventIsActive && isOpen) {
      if (isPrimary) {
        rightSide.push(el('button', {
          className: 'btn btn-outline btn-xs',
          disabled: 'true',
          title: t('event.primaryCannotClose'),
          'data-testid': `events-close-window-${w.id}`,
          style: { opacity: '0.4', cursor: 'not-allowed', marginLeft: 'var(--space-2)' },
        }, [t('event.closeWindow')]));
      } else {
        rightSide.push(el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `events-close-window-${w.id}`,
          style: { marginLeft: 'var(--space-2)' },
          onClick: () => openSubmoveCloseSheet(w, operationId),
        }, [t('event.closeWindow')]));
      }
    }

    children.push(el('div', {
      className: 'window-row',
      'data-testid': `events-paddock-window-${w.id}`,
    }, [
      el('div', {}, [
        el('span', { className: 'window-name' }, [
          locName,
          isPrimary ? ` (${t('event.primary')})` : '',
          w.isStripGraze && w.areaPct < 100 ? ` (${w.areaPct}%)` : '',
        ]),
        el('div', { className: 'window-detail' }, [
          w.dateOpened + (w.dateClosed ? ` — ${w.dateClosed}` : ''),
        ]),
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, rightSide),
    ]));
  }

  return el('div', { className: 'event-card-section' }, children);
}

function renderGroupWindowsSection(windows, unitSys, eventIsActive, _evt, _operationId) {
  return el('div', { className: 'event-card-section' }, [
    el('div', { className: 'event-card-section-title' }, [t('event.groupWindows')]),
    ...windows.map(w => {
      const group = getById('groups', w.groupId);
      const groupName = group ? group.name : w.groupId.slice(0, 8);
      const isOpen = !w.dateLeft;

      const rightSide = [];
      rightSide.push(el('span', {
        className: `badge ${isOpen ? 'badge-green' : 'badge-amber'}`,
      }, [isOpen ? t('event.windowOpen') : t('event.windowClosed')]));

      if (eventIsActive && isOpen) {
        rightSide.push(el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `events-remove-group-${w.id}`,
          style: { marginLeft: 'var(--space-2)' },
          onClick: () => openGroupRemoveSheet(w),
        }, [t('action.close')]));
      }

      return el('div', {
        className: 'window-row',
        'data-testid': `events-group-window-${w.id}`,
      }, [
        el('div', {}, [
          el('span', { className: 'window-name' }, [groupName]),
          el('div', { className: 'window-detail' }, [
            `${w.headCount} head · ${display(w.avgWeightKg, 'weight', unitSys, 0)} avg`,
          ]),
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, rightSide),
      ]);
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Create event sheet
// ---------------------------------------------------------------------------

let createEventSheet = null;

function renderCreateEventSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'create-event-sheet-wrap' }, [
    el('div', {
      className: 'sheet-backdrop',
      onClick: () => createEventSheet && createEventSheet.close(),
    }),
    el('div', { className: 'sheet-panel', id: 'create-event-sheet-panel' }),
  ]);
}

function openCreateEventSheet(operationId, farmId) {
  if (!createEventSheet) {
    createEventSheet = new Sheet('create-event-sheet-wrap');
  }

  const panel = document.getElementById('create-event-sheet-panel');
  if (!panel) return;
  clear(panel);

  const locations = getAll('locations').filter(l => !l.archived);
  const groups = getAll('groups').filter(g => !g.archived);
  const unitSys = getUnitSystem();

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.createEvent')]));

  if (!locations.length) {
    panel.appendChild(el('p', { className: 'form-hint' }, [t('event.noLocations')]));
    return;
  }

  if (!groups.length) {
    panel.appendChild(el('p', { className: 'form-hint' }, [t('event.noGroups')]));
    return;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};
  const selection = { locationId: null, groupId: null };

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateIn')]));
  inputs.dateIn = el('input', {
    type: 'date',
    className: 'auth-input',
    value: todayStr,
    'data-testid': 'create-event-date',
  });
  panel.appendChild(inputs.dateIn);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
  inputs.timeIn = el('input', {
    type: 'time',
    className: 'auth-input',
    value: '',
    'data-testid': 'create-event-time',
  });
  panel.appendChild(inputs.timeIn);

  // Location picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectLocation')]));
  const locPickerEl = el('div', { 'data-testid': 'create-event-location-picker' });
  renderLocationPicker(locPickerEl, locations, selection);
  panel.appendChild(locPickerEl);

  // Group picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectGroup')]));
  const groupPickerEl = el('div', { 'data-testid': 'create-event-group-picker' });
  renderGroupPicker(groupPickerEl, groups, selection, unitSys);
  panel.appendChild(groupPickerEl);

  // Head count (editable snapshot)
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.headCount')]));
  inputs.headCount = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: '',
    'data-testid': 'create-event-head-count',
  });
  panel.appendChild(inputs.headCount);

  // Avg weight (editable snapshot)
  const weightLabel = `${t('event.avgWeight')} (${unitSys === 'imperial' ? 'lbs' : 'kg'})`;
  panel.appendChild(el('label', { className: 'form-label' }, [weightLabel]));
  inputs.avgWeight = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    value: '',
    'data-testid': 'create-event-avg-weight',
  });
  panel.appendChild(inputs.avgWeight);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.notes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    value: '',
    'data-testid': 'create-event-notes',
    style: { minHeight: '50px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'create-event-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'create-event-save',
      onClick: () => saveEvent(selection, inputs, operationId, farmId, unitSys, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'create-event-cancel',
      onClick: () => createEventSheet.close(),
    }, [t('action.cancel')]),
  ]));

  createEventSheet.open();
}

// ---------------------------------------------------------------------------
// Location picker with sections
// ---------------------------------------------------------------------------

export function renderLocationPicker(container, locations, selection) {
  clear(container);

  // Classify locations into sections
  const allPaddockWindows = getAll('eventPaddockWindows');
  const inUseLocationIds = new Set();
  for (const w of allPaddockWindows) {
    if (!w.dateClosed) inUseLocationIds.add(w.locationId);
  }

  const ready = [];
  const inUse = [];
  const confinement = [];

  for (const loc of locations) {
    if (loc.type === 'confinement') {
      confinement.push(loc);
    } else if (inUseLocationIds.has(loc.id)) {
      inUse.push(loc);
    } else {
      // Without paddock_observations we can't determine recovery status yet.
      // All non-in-use land locations are "Ready" for now.
      ready.push(loc);
    }
  }

  const sections = [
    { key: 'ready', label: t('event.locationPicker.ready'), locs: ready },
    { key: 'inUse', label: t('event.locationPicker.inUse'), locs: inUse },
    { key: 'confinement', label: t('event.locationPicker.confinement'), locs: confinement },
  ];

  for (const section of sections) {
    if (!section.locs.length) continue;

    container.appendChild(el('div', { className: 'loc-picker-section' }, [
      el('div', {
        className: 'loc-picker-section-title',
        'data-testid': `location-picker-section-${section.key}`,
      }, [section.label]),
      ...section.locs.map(loc => {
        const isSelected = selection.locationId === loc.id;
        return el('div', {
          className: `loc-picker-item${isSelected ? ' selected' : ''}`,
          'data-testid': `location-picker-item-${loc.id}`,
          onClick: () => {
            selection.locationId = loc.id;
            renderLocationPicker(container, locations, selection);
          },
        }, [
          el('span', {}, [loc.name]),
          getTypeBadgeSmall(loc),
        ]);
      }),
    ]));
  }
}

export function getTypeBadgeSmall(loc) {
  if (loc.type === 'confinement') {
    return el('span', { className: 'badge badge-amber' }, [t('location.type.confinement')]);
  }
  const badgeMap = {
    pasture: { cls: 'badge-green', label: t('location.landUse.pasture') },
    mixed_use: { cls: 'badge-teal', label: t('location.landUse.mixedUse') },
    crop: { cls: 'badge-purple', label: t('location.landUse.crop') },
  };
  const b = badgeMap[loc.landUse] || { cls: 'badge-green', label: t('location.type.land') };
  return el('span', { className: `badge ${b.cls}` }, [b.label]);
}

// ---------------------------------------------------------------------------
// Group picker
// ---------------------------------------------------------------------------

function renderGroupPicker(container, groups, selection, unitSys) {
  clear(container);

  // Calculate head count per group from memberships
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const classes = getAll('animalClasses');
  const classMap = {};
  for (const c of classes) classMap[c.id] = c;

  for (const group of groups) {
    const activeMembers = memberships.filter(m => m.groupId === group.id && !m.dateLeft);
    const headCount = activeMembers.length;

    // Calculate avg weight from class defaults
    let totalWeight = 0;
    let weightCount = 0;
    for (const m of activeMembers) {
      const animal = animals.find(a => a.id === m.animalId);
      if (animal?.classId && classMap[animal.classId]?.defaultWeightKg) {
        totalWeight += classMap[animal.classId].defaultWeightKg;
        weightCount++;
      }
    }
    const avgWeightKg = weightCount > 0 ? totalWeight / weightCount : 0;

    const isSelected = selection.groupId === group.id;
    const detailParts = [`${headCount} head`];
    if (avgWeightKg > 0) {
      detailParts.push(display(avgWeightKg, 'weight', unitSys, 0) + ' avg');
    }

    container.appendChild(el('div', {
      className: `loc-picker-item${isSelected ? ' selected' : ''}`,
      'data-testid': `group-picker-item-${group.id}`,
      onClick: () => {
        selection.groupId = group.id;
        // Auto-fill head count and avg weight
        const hcInput = document.querySelector('[data-testid="create-event-head-count"]');
        const awInput = document.querySelector('[data-testid="create-event-avg-weight"]');
        if (hcInput) hcInput.value = headCount;
        if (awInput) {
          awInput.value = unitSys === 'imperial' && avgWeightKg > 0
            ? Math.round(avgWeightKg * 2.20462)
            : Math.round(avgWeightKg);
        }
        renderGroupPicker(container, groups, selection, unitSys);
      },
    }, [
      el('div', {}, [
        el('span', { style: { fontWeight: '500' } }, [group.name]),
        el('div', { className: 'window-detail' }, [detailParts.join(' · ')]),
      ]),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Save event (creates event + paddock window + group window)
// ---------------------------------------------------------------------------

function saveEvent(selection, inputs, operationId, farmId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  if (!selection.locationId) {
    statusEl.appendChild(el('span', {}, [t('event.selectLocation')]));
    return;
  }
  if (!selection.groupId) {
    statusEl.appendChild(el('span', {}, [t('event.selectGroup')]));
    return;
  }

  const dateIn = inputs.dateIn.value;
  const timeIn = inputs.timeIn.value || null;
  const headCount = parseInt(inputs.headCount.value, 10);
  let avgWeightKg = parseFloat(inputs.avgWeight.value);

  if (!dateIn) {
    statusEl.appendChild(el('span', {}, [t('validation.startDateRequired')]));
    return;
  }
  if (!headCount || headCount < 1) {
    statusEl.appendChild(el('span', {}, [t('validation.headCountMin')]));
    return;
  }
  if (!avgWeightKg || avgWeightKg <= 0) {
    statusEl.appendChild(el('span', {}, [t('validation.avgWeightRequired')]));
    return;
  }

  // Convert weight to metric if imperial
  if (unitSys === 'imperial') {
    avgWeightKg = convert(avgWeightKg, 'weight', 'toMetric');
  }

  try {
    // 1. Create event
    const event = EventEntity.create({
      operationId,
      farmId,
      dateIn,
      timeIn,
      notes: inputs.notes.value.trim() || null,
    });
    add('events', event, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

    // 2. Create paddock window
    const paddockWindow = PaddockWindowEntity.create({
      operationId,
      eventId: event.id,
      locationId: selection.locationId,
      dateOpened: dateIn,
      timeOpened: timeIn,
    });
    add('eventPaddockWindows', paddockWindow, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

    // Create open observation for the paddock
    createObservation(operationId, selection.locationId, 'open', paddockWindow.id, new Date().toISOString());

    // 3. Create group window
    const groupWindow = GroupWindowEntity.create({
      operationId,
      eventId: event.id,
      groupId: selection.groupId,
      dateJoined: dateIn,
      timeJoined: timeIn,
      headCount,
      avgWeightKg,
    });
    add('eventGroupWindows', groupWindow, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');

    createEventSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}
