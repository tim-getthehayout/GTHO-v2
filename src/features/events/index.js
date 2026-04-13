/** @file Events screen — CP-17. Event create & list with location picker. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert } from '../../utils/units.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import * as ObservationEntity from '../../entities/paddock-observation.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import * as BatchEntity from '../../entities/batch.js';

/** Unsubscribe functions */
let unsubs = [];

/**
 * Create a paddock observation record.
 * @param {string} operationId
 * @param {string} locationId
 * @param {'open'|'close'} type
 * @param {string} sourceId - The paddock window ID
 * @param {string} observedAt - ISO timestamp
 */
function createObservation(operationId, locationId, type, sourceId, observedAt) {
  const obs = ObservationEntity.create({
    operationId,
    locationId,
    type,
    source: 'event',
    sourceId,
    observedAt,
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

  const screenEl = el('div', { 'data-testid': 'events-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('event.title')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'events-create-btn',
        onClick: () => openCreateEventSheet(operationId, farmId),
      }, [t('event.createEvent')]),
    ]),

    // Event list
    el('div', { 'data-testid': 'events-list' }),

    // Create event sheet
    renderCreateEventSheetMarkup(),

    // Sub-move open sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'submove-open-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => submoveOpenSheet && submoveOpenSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'submove-open-sheet-panel' }),
    ]),

    // Sub-move close sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'submove-close-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => submoveCloseSheet && submoveCloseSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'submove-close-sheet-panel' }),
    ]),

    // Group add sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'group-add-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => groupAddSheet && groupAddSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'group-add-sheet-panel' }),
    ]),

    // Group remove sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'group-remove-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => groupRemoveSheet && groupRemoveSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'group-remove-sheet-panel' }),
    ]),

    // Move wizard sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'move-wizard-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => moveWizardSheet && moveWizardSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'move-wizard-sheet-panel' }),
    ]),

    // Close event sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'close-event-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeEventSheet && closeEventSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'close-event-sheet-panel' }),
    ]),

    // Advance strip sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'advance-strip-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => advanceStripSheet && advanceStripSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'advance-strip-sheet-panel' }),
    ]),

    // Deliver feed sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'deliver-feed-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => deliverFeedSheet && deliverFeedSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'deliver-feed-sheet-panel' }),
    ]),

    // Feed check sheet (z-index 210)
    el('div', { className: 'sheet-wrap', id: 'feed-check-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => feedCheckSheet && feedCheckSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'feed-check-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderEventList(container);

  unsubs.push(subscribe('events', () => renderEventList(container)));
  unsubs.push(subscribe('eventPaddockWindows', () => renderEventList(container)));
  unsubs.push(subscribe('eventGroupWindows', () => renderEventList(container)));
}

// ---------------------------------------------------------------------------
// Event list
// ---------------------------------------------------------------------------

function renderEventList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="events-list"]');
  if (!listEl) return;
  clear(listEl);

  const events = getAll('events');

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
        el('div', { className: 'event-card-title' }, [titleText]),
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

function renderPaddockWindowsSection(windows, eventIsActive, evt, operationId) {
  return el('div', { className: 'event-card-section' }, [
    el('div', { className: 'event-card-section-title' }, [t('event.paddockWindows')]),
    ...windows.map((w, idx) => {
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

      return el('div', {
        className: 'window-row',
        'data-testid': `events-paddock-window-${w.id}`,
      }, [
        el('div', {}, [
          el('span', { className: 'window-name' }, [
            locName,
            isPrimary ? ` (${t('event.primary')})` : '',
          ]),
          el('div', { className: 'window-detail' }, [
            w.dateOpened + (w.dateClosed ? ` — ${w.dateClosed}` : ''),
          ]),
        ]),
        el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)' } }, rightSide),
      ]);
    }),
  ]);
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

function renderLocationPicker(container, locations, selection) {
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

function getTypeBadgeSmall(loc) {
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
    statusEl.appendChild(el('span', {}, ['Start date is required']));
    return;
  }
  if (!headCount || headCount < 1) {
    statusEl.appendChild(el('span', {}, ['Head count must be at least 1']));
    return;
  }
  if (!avgWeightKg || avgWeightKg <= 0) {
    statusEl.appendChild(el('span', {}, ['Average weight is required']));
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

// ---------------------------------------------------------------------------
// Sub-move open sheet (CP-18)
// ---------------------------------------------------------------------------

let submoveOpenSheet = null;

function openSubmoveOpenSheet(evt, operationId) {
  if (!submoveOpenSheet) {
    submoveOpenSheet = new Sheet('submove-open-sheet-wrap');
  }

  const panel = document.getElementById('submove-open-sheet-panel');
  if (!panel) return;
  clear(panel);

  const locations = getAll('locations').filter(l => !l.archived);
  const todayStr = new Date().toISOString().slice(0, 10);
  const selection = { locationId: null };
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.openWindowTitle')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateOpened')]));
  inputs.dateOpened = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'submove-open-date',
  });
  panel.appendChild(inputs.dateOpened);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeOpened')]));
  inputs.timeOpened = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'submove-open-time',
  });
  panel.appendChild(inputs.timeOpened);

  // Location picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectLocation')]));
  const locPickerEl = el('div', { 'data-testid': 'submove-open-location-picker' });
  renderLocationPicker(locPickerEl, locations, selection);
  panel.appendChild(locPickerEl);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'submove-open-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'submove-open-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.locationId) {
          statusEl.appendChild(el('span', {}, [t('event.selectLocation')]));
          return;
        }
        try {
          const pw = PaddockWindowEntity.create({
            operationId,
            eventId: evt.id,
            locationId: selection.locationId,
            dateOpened: inputs.dateOpened.value,
            timeOpened: inputs.timeOpened.value || null,
          });
          add('eventPaddockWindows', pw, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, selection.locationId, 'open', pw.id, new Date().toISOString());
          submoveOpenSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'submove-open-cancel',
      onClick: () => submoveOpenSheet.close(),
    }, [t('action.cancel')]),
  ]));

  submoveOpenSheet.open();
}

// ---------------------------------------------------------------------------
// Sub-move close sheet (CP-18)
// ---------------------------------------------------------------------------

let submoveCloseSheet = null;

function openSubmoveCloseSheet(paddockWindow, _operationId) {
  if (!submoveCloseSheet) {
    submoveCloseSheet = new Sheet('submove-close-sheet-wrap');
  }

  const panel = document.getElementById('submove-close-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const loc = getById('locations', paddockWindow.locationId);
  const locName = loc ? loc.name : '';
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.closeWindowTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [locName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateClosed')]));
  inputs.dateClosed = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'submove-close-date',
  });
  panel.appendChild(inputs.dateClosed);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeClosed')]));
  inputs.timeClosed = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'submove-close-time',
  });
  panel.appendChild(inputs.timeClosed);

  // TODO: Observation fields (forage height, cover, quality) — Phase 3.3

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'submove-close-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'submove-close-save',
      onClick: () => {
        clear(statusEl);
        try {
          update('eventPaddockWindows', paddockWindow.id, {
            dateClosed: inputs.dateClosed.value,
            timeClosed: inputs.timeClosed.value || null,
          }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(paddockWindow.operationId, paddockWindow.locationId, 'close', paddockWindow.id, new Date().toISOString());
          submoveCloseSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'submove-close-cancel',
      onClick: () => submoveCloseSheet.close(),
    }, [t('action.cancel')]),
  ]));

  submoveCloseSheet.open();
}

// ---------------------------------------------------------------------------
// Group add sheet (CP-18)
// ---------------------------------------------------------------------------

let groupAddSheet = null;

function openGroupAddSheet(evt, operationId) {
  if (!groupAddSheet) {
    groupAddSheet = new Sheet('group-add-sheet-wrap');
  }

  const panel = document.getElementById('group-add-sheet-panel');
  if (!panel) return;
  clear(panel);

  const groups = getAll('groups').filter(g => !g.archived);
  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const selection = { groupId: null };
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.addGroupTitle')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateJoined')]));
  inputs.dateJoined = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'group-add-date',
  });
  panel.appendChild(inputs.dateJoined);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeJoined')]));
  inputs.timeJoined = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'group-add-time',
  });
  panel.appendChild(inputs.timeJoined);

  // Group picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectGroup')]));
  const groupPickerEl = el('div', { 'data-testid': 'group-add-picker' });
  renderGroupPickerSimple(groupPickerEl, groups, selection);
  panel.appendChild(groupPickerEl);

  // Head count
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.headCount')]));
  inputs.headCount = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '',
    'data-testid': 'group-add-head-count',
  });
  panel.appendChild(inputs.headCount);

  // Avg weight
  const wLabel = `${t('event.avgWeight')} (${unitSys === 'imperial' ? 'lbs' : 'kg'})`;
  panel.appendChild(el('label', { className: 'form-label' }, [wLabel]));
  inputs.avgWeight = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '',
    'data-testid': 'group-add-avg-weight',
  });
  panel.appendChild(inputs.avgWeight);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'group-add-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'group-add-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.groupId) {
          statusEl.appendChild(el('span', {}, [t('event.selectGroup')]));
          return;
        }
        const hc = parseInt(inputs.headCount.value, 10);
        let aw = parseFloat(inputs.avgWeight.value);
        if (!hc || hc < 1) {
          statusEl.appendChild(el('span', {}, ['Head count must be at least 1']));
          return;
        }
        if (!aw || aw <= 0) {
          statusEl.appendChild(el('span', {}, ['Average weight is required']));
          return;
        }
        if (unitSys === 'imperial') {
          aw = convert(aw, 'weight', 'toMetric');
        }
        try {
          const gw = GroupWindowEntity.create({
            operationId,
            eventId: evt.id,
            groupId: selection.groupId,
            dateJoined: inputs.dateJoined.value,
            timeJoined: inputs.timeJoined.value || null,
            headCount: hc,
            avgWeightKg: aw,
          });
          add('eventGroupWindows', gw, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          groupAddSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-add-cancel',
      onClick: () => groupAddSheet.close(),
    }, [t('action.cancel')]),
  ]));

  groupAddSheet.open();
}

function renderGroupPickerSimple(container, groups, selection) {
  clear(container);
  for (const group of groups) {
    const isSelected = selection.groupId === group.id;
    container.appendChild(el('div', {
      className: `loc-picker-item${isSelected ? ' selected' : ''}`,
      'data-testid': `group-add-item-${group.id}`,
      onClick: () => {
        selection.groupId = group.id;
        renderGroupPickerSimple(container, groups, selection);
      },
    }, [el('span', {}, [group.name])]));
  }
}

// ---------------------------------------------------------------------------
// Group remove sheet (CP-18)
// ---------------------------------------------------------------------------

let groupRemoveSheet = null;

function openGroupRemoveSheet(groupWindow) {
  if (!groupRemoveSheet) {
    groupRemoveSheet = new Sheet('group-remove-sheet-wrap');
  }

  const panel = document.getElementById('group-remove-sheet-panel');
  if (!panel) return;
  clear(panel);

  const group = getById('groups', groupWindow.groupId);
  const groupName = group ? group.name : '';
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.removeGroupTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [groupName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateLeft')]));
  inputs.dateLeft = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'group-remove-date',
  });
  panel.appendChild(inputs.dateLeft);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeLeft')]));
  inputs.timeLeft = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'group-remove-time',
  });
  panel.appendChild(inputs.timeLeft);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'group-remove-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'group-remove-save',
      onClick: () => {
        clear(statusEl);
        try {
          update('eventGroupWindows', groupWindow.id, {
            dateLeft: inputs.dateLeft.value,
            timeLeft: inputs.timeLeft.value || null,
          }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          groupRemoveSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'group-remove-cancel',
      onClick: () => groupRemoveSheet.close(),
    }, [t('action.cancel')]),
  ]));

  groupRemoveSheet.open();
}

// ---------------------------------------------------------------------------
// Move Wizard (CP-19)
// ---------------------------------------------------------------------------

let moveWizardSheet = null;

function openMoveWizard(sourceEvent, operationId, farmId) {
  if (!moveWizardSheet) {
    moveWizardSheet = new Sheet('move-wizard-sheet-wrap');
  }

  const panel = document.getElementById('move-wizard-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Wizard state
  const state = {
    step: 1,
    destType: null,        // 'new' | 'join'
    locationId: null,
    existingEventId: null,
    stripGraze: false,
    stripSizePct: 100,
    stripCount: 1,
    // Close-out
    dateOut: todayStr,
    timeOut: '',
    // New event
    dateIn: todayStr,
    timeIn: '',
  };

  function render() {
    clear(panel);

    // Dots
    panel.appendChild(el('div', { className: 'wiz-dots' }, [
      el('span', { className: `wiz-dot${state.step >= 1 ? ' active' : ''}${state.step > 1 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 2 ? ' active' : ''}${state.step > 2 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 3 ? ' active' : ''}` }),
    ]));

    if (state.step === 1) renderStep1(panel, state, render);
    else if (state.step === 2) renderStep2(panel, state, render, operationId, sourceEvent);
    else renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys);
  }

  render();
  moveWizardSheet.open();
}

// Step 1: Destination type
function renderStep1(panel, state, render) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.step1Title')]));

  const grid = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } });

  grid.appendChild(el('div', {
    className: `dest-type-card${state.destType === 'new' ? ' selected' : ''}`,
    'data-testid': 'move-wizard-dest-new',
    onClick: () => { state.destType = 'new'; render(); },
  }, [t('event.newLocation')]));

  grid.appendChild(el('div', {
    className: `dest-type-card${state.destType === 'join' ? ' selected' : ''}`,
    'data-testid': 'move-wizard-dest-join',
    onClick: () => { state.destType = 'join'; render(); },
  }, [t('event.joinExisting')]));

  panel.appendChild(grid);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-step-1-next',
      disabled: !state.destType ? 'true' : undefined,
      onClick: () => {
        if (state.destType) { state.step = 2; render(); }
      },
    }, [t('action.next')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => moveWizardSheet.close(),
    }, [t('action.cancel')]),
  ]));
}

// Step 2: Location picker (new) or event picker (join)
function renderStep2(panel, state, render, operationId, sourceEvent) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    state.destType === 'new' ? t('event.step2Title') : t('event.step2ExistingTitle'),
  ]));

  if (state.destType === 'new') {
    // Location picker
    const locations = getAll('locations').filter(l => !l.archived);
    const selection = { locationId: state.locationId };
    const pickerEl = el('div', { 'data-testid': 'move-wizard-location-picker' });
    renderLocationPicker(pickerEl, locations, selection);

    // Sync selection back to wizard state on click
    pickerEl.addEventListener('click', () => {
      state.locationId = selection.locationId;
    });
    panel.appendChild(pickerEl);

    // Strip graze toggle
    const stripToggle = el('div', { style: { marginTop: 'var(--space-4)' } });
    const stripCheckbox = el('input', {
      type: 'checkbox',
      'data-testid': 'move-wizard-strip-graze',
      ...(state.stripGraze ? { checked: 'true' } : {}),
    });
    stripCheckbox.addEventListener('change', () => {
      state.stripGraze = stripCheckbox.checked;
      render();
    });
    stripToggle.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' } }, [
      stripCheckbox,
      el('span', { className: 'form-label', style: { margin: '0' } }, [t('event.stripGraze')]),
    ]));
    panel.appendChild(stripToggle);

    // Strip size inputs (only if strip graze enabled)
    if (state.stripGraze) {
      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripSize')]));
      const stripSizeInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripSizePct,
        'data-testid': 'move-wizard-strip-size',
      });
      stripSizeInput.addEventListener('input', () => {
        const val = parseFloat(stripSizeInput.value) || 0;
        state.stripSizePct = val;
        state.stripCount = val > 0 ? Math.ceil(100 / val) : 1;
      });
      panel.appendChild(stripSizeInput);

      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripCount')]));
      const stripCountInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripCount,
        'data-testid': 'move-wizard-strip-count',
      });
      stripCountInput.addEventListener('input', () => {
        const val = parseInt(stripCountInput.value, 10) || 1;
        state.stripCount = val;
        state.stripSizePct = val > 0 ? Math.round(100 / val) : 100;
      });
      panel.appendChild(stripCountInput);
    }
  } else {
    // Existing event picker
    const activeEvents = getAll('events').filter(e => !e.dateOut && e.id !== sourceEvent.id);
    if (!activeEvents.length) {
      panel.appendChild(el('p', { className: 'form-hint' }, [t('event.noActiveEvents')]));
    } else {
      for (const evt of activeEvents) {
        const pw = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
        const locNames = pw.map(w => {
          const loc = getById('locations', w.locationId);
          return loc ? loc.name : '?';
        }).join(', ');
        const isSelected = state.existingEventId === evt.id;

        panel.appendChild(el('div', {
          className: `loc-picker-item${isSelected ? ' selected' : ''}`,
          'data-testid': `move-wizard-event-${evt.id}`,
          onClick: () => { state.existingEventId = evt.id; render(); },
        }, [
          el('div', {}, [
            el('span', { style: { fontWeight: '500' } }, [locNames || evt.id.slice(0, 8)]),
            el('div', { className: 'window-detail' }, [evt.dateIn]),
          ]),
        ]));
      }
    }
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => { state.step = 1; render(); },
    }, [t('action.back')]),
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-step-2-next',
      onClick: () => {
        if (state.destType === 'new' && !state.locationId) return;
        if (state.destType === 'join' && !state.existingEventId) return;
        state.step = 3;
        render();
      },
    }, [t('action.next')]),
  ]));
}

// Step 3: Close & Move
function renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.step3Title')]));

  const inputs = {};

  // Close source section
  const closeSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.closeSource')]),
  ]);

  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateOut')]));
  inputs.dateOut = el('input', {
    type: 'date', className: 'auth-input', value: state.dateOut,
    'data-testid': 'move-wizard-date-out',
  });
  closeSection.appendChild(inputs.dateOut);

  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeOut')]));
  inputs.timeOut = el('input', {
    type: 'time', className: 'auth-input', value: state.timeOut,
    'data-testid': 'move-wizard-time-out',
  });
  closeSection.appendChild(inputs.timeOut);

  panel.appendChild(closeSection);

  // Open destination section (only for new location)
  if (state.destType === 'new') {
    const openSection = el('div', { className: 'close-open-section' }, [
      el('div', { className: 'close-open-section-title' }, [t('event.openDest')]),
    ]);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateIn')]));
    inputs.dateIn = el('input', {
      type: 'date', className: 'auth-input', value: state.dateIn,
      'data-testid': 'move-wizard-date-in',
    });
    openSection.appendChild(inputs.dateIn);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
    inputs.timeIn = el('input', {
      type: 'time', className: 'auth-input', value: state.timeIn,
      'data-testid': 'move-wizard-time-in',
    });
    openSection.appendChild(inputs.timeIn);

    panel.appendChild(openSection);
  }

  // Feed transfer placeholder
  panel.appendChild(el('div', {
    className: 'form-hint',
    style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
  }, [t('event.feedTransferPlaceholder')]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'move-wizard-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => { state.step = 2; panel.parentElement && openMoveWizard.__rerender && openMoveWizard.__rerender(); },
    }, [t('action.back')]),
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-save',
      onClick: () => executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, unitSys, statusEl),
    }, [t('action.done')]),
  ]));

  // Override back button to re-render properly
  const backBtn = panel.querySelector('.btn-outline');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.step = 2;
      openMoveWizard(sourceEvent, operationId, farmId);
    }, { once: true });
  }
}

function executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const dateOut = inputs.dateOut.value;
  const timeOut = inputs.timeOut.value || null;

  if (!dateOut) {
    statusEl.appendChild(el('span', {}, ['Close date is required']));
    return;
  }

  try {
    // --- CLOSE SOURCE (Steps 1-5 of save sequence) ---

    // Step 1: Feed check (placeholder — Phase 3.3)
    // TODO: Create feed check with is_close_reading when feed system is built

    // Step 2: Close all open paddock windows
    const sourcePWs = getAll('eventPaddockWindows').filter(w => w.eventId === sourceEvent.id && !w.dateClosed);
    for (const pw of sourcePWs) {
      update('eventPaddockWindows', pw.id, {
        dateClosed: dateOut,
        timeClosed: timeOut,
      }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      createObservation(operationId, pw.locationId, 'close', pw.id, new Date().toISOString());
    }

    // Step 3: Close all open group windows
    const sourceGWs = getAll('eventGroupWindows').filter(w => w.eventId === sourceEvent.id && !w.dateLeft);
    for (const gw of sourceGWs) {
      update('eventGroupWindows', gw.id, {
        dateLeft: dateOut,
        timeLeft: timeOut,
      }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    }

    // Step 4: Set source event date_out
    update('events', sourceEvent.id, {
      dateOut,
      timeOut,
    }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

    // Step 5: Close observations already created in Step 2 loop above

    // --- CREATE DESTINATION (Steps 6-9) ---

    if (state.destType === 'new') {
      const dateIn = inputs.dateIn.value || dateOut;
      const timeIn = inputs.timeIn.value || null;

      // Step 6: Create new event
      const newEvent = EventEntity.create({
        operationId,
        farmId,
        dateIn,
        timeIn,
      });
      add('events', newEvent, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

      // Create paddock window at destination
      const pwData = {
        operationId,
        eventId: newEvent.id,
        locationId: state.locationId,
        dateOpened: dateIn,
        timeOpened: timeIn,
      };

      // Step 9: Strip graze flags
      if (state.stripGraze) {
        pwData.isStripGraze = true;
        pwData.stripGroupId = crypto.randomUUID();
        pwData.areaPct = state.stripSizePct;
      }

      const newPW = PaddockWindowEntity.create(pwData);
      add('eventPaddockWindows', newPW, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

      // Create group windows for all groups that were on the source event
      for (const gw of sourceGWs) {
        const newGW = GroupWindowEntity.create({
          operationId,
          eventId: newEvent.id,
          groupId: gw.groupId,
          dateJoined: dateIn,
          timeJoined: timeIn,
          headCount: gw.headCount,
          avgWeightKg: gw.avgWeightKg,
        });
        add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
      }

      // Step 7: Open observation for destination paddock
      createObservation(operationId, state.locationId, 'open', newPW.id, new Date().toISOString());

      // Step 8: Feed transfer (placeholder — Phase 3.3)
      // TODO: Create feed transfer entries

    } else {
      // Join existing event — add group windows
      const dateIn = dateOut;
      const timeIn = timeOut;

      for (const gw of sourceGWs) {
        const newGW = GroupWindowEntity.create({
          operationId,
          eventId: state.existingEventId,
          groupId: gw.groupId,
          dateJoined: dateIn,
          timeJoined: timeIn,
          headCount: gw.headCount,
          avgWeightKg: gw.avgWeightKg,
        });
        add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
      }
    }

    moveWizardSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Close Event — no move (CP-20)
// ---------------------------------------------------------------------------

let closeEventSheet = null;

function openCloseEventSheet(evt, _operationId) {
  if (!closeEventSheet) {
    closeEventSheet = new Sheet('close-event-sheet-wrap');
  }

  const panel = document.getElementById('close-event-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.closeEventTitle')]));

  // Date out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateOut')]));
  inputs.dateOut = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'close-event-date-out',
  });
  panel.appendChild(inputs.dateOut);

  // Time out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeOut')]));
  inputs.timeOut = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'close-event-time-out',
  });
  panel.appendChild(inputs.timeOut);

  // Feed check placeholder
  panel.appendChild(el('div', {
    className: 'form-hint',
    style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
  }, [t('event.feedPlaceholder')]));

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'close-event-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-red',
      'data-testid': 'close-event-save',
      onClick: () => {
        clear(statusEl);
        const dateOut = inputs.dateOut.value;
        const timeOut = inputs.timeOut.value || null;
        if (!dateOut) {
          statusEl.appendChild(el('span', {}, ['Close date is required']));
          return;
        }
        try {
          // Close all open paddock windows + create close observations
          const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
          for (const pw of pws) {
            update('eventPaddockWindows', pw.id, {
              dateClosed: dateOut,
              timeClosed: timeOut,
            }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
            createObservation(pw.operationId, pw.locationId, 'close', pw.id, new Date().toISOString());
          }
          // Close all open group windows
          const gws = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
          for (const gw of gws) {
            update('eventGroupWindows', gw.id, {
              dateLeft: dateOut,
              timeLeft: timeOut,
            }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
          }
          // Set event date_out
          update('events', evt.id, {
            dateOut,
            timeOut,
          }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
          closeEventSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.closeEvent')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'close-event-cancel',
      onClick: () => closeEventSheet.close(),
    }, [t('action.cancel')]),
  ]));

  closeEventSheet.open();
}

// ---------------------------------------------------------------------------
// Advance Strip (OI-0006)
// ---------------------------------------------------------------------------

let advanceStripSheet = null;

function openAdvanceStripSheet(evt, operationId) {
  if (!advanceStripSheet) {
    advanceStripSheet = new Sheet('advance-strip-sheet-wrap');
  }

  const panel = document.getElementById('advance-strip-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Find the open strip graze window
  const allPWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id);
  const openStrip = allPWs.find(w => w.isStripGraze && !w.dateClosed);
  if (!openStrip) return;

  // Count strips in this group
  const stripGroupWindows = allPWs.filter(w => w.stripGroupId === openStrip.stripGroupId);
  const completedStrips = stripGroupWindows.filter(w => w.dateClosed).length;
  const currentStripNum = completedStrips + 1;
  // Estimate total from area_pct (each strip is same size)
  const totalStrips = openStrip.areaPct > 0 ? Math.round(100 / openStrip.areaPct) : 1;

  const loc = getById('locations', openStrip.locationId);
  const locName = loc ? loc.name : '';

  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.advanceStrip')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [
    t('event.stripOf', { current: currentStripNum, total: totalStrips }) + ' — ' + locName,
  ]));

  // Phase 1: Close current strip
  const closeSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.closeWindow')]),
  ]);
  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateClosed')]));
  inputs.dateClosed = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'advance-strip-date-closed',
  });
  closeSection.appendChild(inputs.dateClosed);
  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeClosed')]));
  inputs.timeClosed = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'advance-strip-time-closed',
  });
  closeSection.appendChild(inputs.timeClosed);
  panel.appendChild(closeSection);

  // Phase 2: Open next strip (if not ending early)
  const openSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.openWindow')]),
  ]);
  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateOpened')]));
  inputs.dateOpened = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'advance-strip-date-opened',
  });
  openSection.appendChild(inputs.dateOpened);
  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeOpened')]));
  inputs.timeOpened = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'advance-strip-time-opened',
  });
  openSection.appendChild(inputs.timeOpened);
  panel.appendChild(openSection);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'advance-strip-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'advance-strip-save',
      onClick: () => {
        clear(statusEl);
        try {
          // Close current strip window
          update('eventPaddockWindows', openStrip.id, {
            dateClosed: inputs.dateClosed.value,
            timeClosed: inputs.timeClosed.value || null,
          }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, openStrip.locationId, 'close', openStrip.id, new Date().toISOString());

          // Open next strip window
          const nextPW = PaddockWindowEntity.create({
            operationId,
            eventId: evt.id,
            locationId: openStrip.locationId,
            dateOpened: inputs.dateOpened.value,
            timeOpened: inputs.timeOpened.value || null,
            isStripGraze: true,
            stripGroupId: openStrip.stripGroupId,
            areaPct: openStrip.areaPct,
          });
          add('eventPaddockWindows', nextPW, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, openStrip.locationId, 'open', nextPW.id, new Date().toISOString());

          advanceStripSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.advanceStrip')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'advance-strip-end-early',
      onClick: () => {
        clear(statusEl);
        try {
          // Close current strip without opening next
          update('eventPaddockWindows', openStrip.id, {
            dateClosed: inputs.dateClosed.value,
            timeClosed: inputs.timeClosed.value || null,
          }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, openStrip.locationId, 'close', openStrip.id, new Date().toISOString());
          advanceStripSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.endStripEarly')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'advance-strip-cancel',
      onClick: () => advanceStripSheet.close(),
    }, [t('action.cancel')]),
  ]));

  advanceStripSheet.open();
}

// ---------------------------------------------------------------------------
// Deliver Feed (CP-27)
// ---------------------------------------------------------------------------

let deliverFeedSheet = null;

function openDeliverFeedSheet(evt, operationId) {
  if (!deliverFeedSheet) {
    deliverFeedSheet = new Sheet('deliver-feed-sheet-wrap');
  }

  const panel = document.getElementById('deliver-feed-sheet-panel');
  if (!panel) return;
  clear(panel);

  const batches = getAll('batches').filter(b => !b.archived && b.remaining > 0);
  const activePWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};
  const selection = { batchId: null, locationId: null };

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.deliverFeedTitle')]));

  if (!batches.length) {
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.noBatches')]));
    panel.appendChild(el('button', {
      className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' },
      onClick: () => deliverFeedSheet.close(),
    }, [t('action.cancel')]));
    return;
  }

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryDate')]));
  inputs.date = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'deliver-feed-date',
  });
  panel.appendChild(inputs.date);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryTime')]));
  inputs.time = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'deliver-feed-time',
  });
  panel.appendChild(inputs.time);

  // Batch selector
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.selectBatch')]));
  const batchPickerEl = el('div', { 'data-testid': 'deliver-feed-batch-picker' });
  for (const batch of batches) {
    const ftList = getAll('feedTypes');
    const ft = ftList.find(f => f.id === batch.feedTypeId);
    const ftName = ft ? ft.name : '';
    batchPickerEl.appendChild(el('div', {
      className: `loc-picker-item${selection.batchId === batch.id ? ' selected' : ''}`,
      'data-testid': `deliver-feed-batch-${batch.id}`,
      onClick: () => {
        selection.batchId = batch.id;
        // Re-render picker selection state
        for (const child of batchPickerEl.children) {
          child.classList.remove('selected');
        }
        batchPickerEl.querySelector(`[data-testid="deliver-feed-batch-${batch.id}"]`)?.classList.add('selected');
      },
    }, [
      el('div', {}, [
        el('span', { style: { fontWeight: '500' } }, [batch.name]),
        el('div', { className: 'window-detail' }, [
          `${ftName} · ${batch.remaining} ${batch.unit} remaining`,
        ]),
      ]),
    ]));
  }
  panel.appendChild(batchPickerEl);

  // Paddock selector (from active paddock windows)
  if (activePWs.length > 1) {
    panel.appendChild(el('label', { className: 'form-label' }, [t('feed.selectPaddock')]));
    const paddockPickerEl = el('div', { 'data-testid': 'deliver-feed-paddock-picker' });
    for (const pw of activePWs) {
      const loc = getById('locations', pw.locationId);
      const locName = loc ? loc.name : '?';
      paddockPickerEl.appendChild(el('div', {
        className: `loc-picker-item${selection.locationId === pw.locationId ? ' selected' : ''}`,
        'data-testid': `deliver-feed-paddock-${pw.locationId}`,
        onClick: () => {
          selection.locationId = pw.locationId;
          for (const child of paddockPickerEl.children) {
            child.classList.remove('selected');
          }
          paddockPickerEl.querySelector(`[data-testid="deliver-feed-paddock-${pw.locationId}"]`)?.classList.add('selected');
        },
      }, [el('span', {}, [locName])]));
    }
    panel.appendChild(paddockPickerEl);
  } else if (activePWs.length === 1) {
    selection.locationId = activePWs[0].locationId;
  }

  // Quantity with ±0.5 adjusters
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryQty')]));
  inputs.quantity = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '1',
    step: '0.5', min: '0.5',
    'data-testid': 'deliver-feed-quantity',
  });
  const qtyRow = el('div', { style: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center' } }, [
    el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'deliver-feed-qty-minus',
      onClick: () => {
        const val = parseFloat(inputs.quantity.value) || 0;
        if (val > 0.5) inputs.quantity.value = (val - 0.5).toString();
      },
    }, ['-0.5']),
    inputs.quantity,
    el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'deliver-feed-qty-plus',
      onClick: () => {
        const val = parseFloat(inputs.quantity.value) || 0;
        inputs.quantity.value = (val + 0.5).toString();
      },
    }, ['+0.5']),
  ]);
  panel.appendChild(qtyRow);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'deliver-feed-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'deliver-feed-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.batchId) {
          statusEl.appendChild(el('span', {}, [t('feed.selectBatch')]));
          return;
        }
        if (!selection.locationId) {
          statusEl.appendChild(el('span', {}, [t('feed.selectPaddock')]));
          return;
        }
        const qty = parseFloat(inputs.quantity.value);
        if (!qty || qty <= 0) {
          statusEl.appendChild(el('span', {}, ['Quantity must be greater than 0']));
          return;
        }
        try {
          // Create feed entry
          const entry = FeedEntryEntity.create({
            operationId,
            eventId: evt.id,
            batchId: selection.batchId,
            locationId: selection.locationId,
            date: inputs.date.value,
            time: inputs.time.value || null,
            quantity: qty,
          });
          add('eventFeedEntries', entry, FeedEntryEntity.validate,
            FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

          // Decrement batch remaining
          const batch = getById('batches', selection.batchId);
          if (batch) {
            const newRemaining = Math.max(0, batch.remaining - qty);
            update('batches', batch.id, { remaining: newRemaining },
              BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
          }

          deliverFeedSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'deliver-feed-cancel',
      onClick: () => deliverFeedSheet.close(),
    }, [t('action.cancel')]),
  ]));

  deliverFeedSheet.open();
}

// ---------------------------------------------------------------------------
// Feed Check (CP-28)
// ---------------------------------------------------------------------------

let feedCheckSheet = null;

function openFeedCheckSheet(evt, operationId) {
  if (!feedCheckSheet) {
    feedCheckSheet = new Sheet('feed-check-sheet-wrap');
  }

  const panel = document.getElementById('feed-check-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Get all feed entries for this event, grouped by batch × location
  const entries = getAll('eventFeedEntries').filter(e => e.eventId === evt.id);
  if (!entries.length) {
    panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.feedCheckTitle')]));
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.feedCheckEmpty')]));
    panel.appendChild(el('button', {
      className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' },
      onClick: () => feedCheckSheet.close(),
    }, [t('action.cancel')]));
    return;
  }

  // Group entries by batch+location key
  const groupKey = (e) => `${e.batchId}|${e.locationId}`;
  const groups = {};
  for (const e of entries) {
    const key = groupKey(e);
    if (!groups[key]) groups[key] = { batchId: e.batchId, locationId: e.locationId, totalDelivered: 0 };
    groups[key].totalDelivered += e.quantity;
  }

  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.feedCheckTitle')]));

  // Date/time
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryDate')]));
  inputs.date = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'feed-check-date',
  });
  panel.appendChild(inputs.date);

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryTime')]));
  inputs.time = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'feed-check-time',
  });
  panel.appendChild(inputs.time);

  // One row per batch × location
  const itemInputs = [];
  for (const [key, group] of Object.entries(groups)) {
    const batch = getById('batches', group.batchId);
    const loc = getById('locations', group.locationId);
    const batchName = batch ? batch.name : '?';
    const locName = loc ? loc.name : '?';

    const remainingInput = el('input', {
      type: 'number', className: 'auth-input settings-input',
      value: '', placeholder: '0',
      'data-testid': `feed-check-item-${key.replace('|', '-')}`,
    });

    itemInputs.push({ key, batchId: group.batchId, locationId: group.locationId, input: remainingInput });

    panel.appendChild(el('div', {
      className: 'card-inset',
      style: { marginTop: 'var(--space-3)', padding: 'var(--space-3)' },
    }, [
      el('div', { style: { fontWeight: '500', fontSize: '13px' } }, [
        `${batchName} → ${locName}`,
      ]),
      el('div', { className: 'form-hint' }, [
        `${t('feed.feedCheckStarted')}: ${group.totalDelivered} ${batch?.unit || ''}`,
      ]),
      el('label', { className: 'form-label' }, [t('feed.feedCheckRemaining')]),
      remainingInput,
    ]));
  }

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.feedCheckNotes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input', value: '',
    'data-testid': 'feed-check-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'feed-check-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'feed-check-save',
      onClick: () => {
        clear(statusEl);
        try {
          // Create feed check parent
          const check = FeedCheckEntity.create({
            operationId,
            eventId: evt.id,
            date: inputs.date.value,
            time: inputs.time.value || null,
            notes: inputs.notes.value.trim() || null,
          });
          add('eventFeedChecks', check, FeedCheckEntity.validate,
            FeedCheckEntity.toSupabaseShape, 'event_feed_checks');

          // Create check items
          for (const item of itemInputs) {
            const remaining = parseFloat(item.input.value);
            if (isNaN(remaining)) continue;
            const checkItem = FeedCheckItemEntity.create({
              feedCheckId: check.id,
              batchId: item.batchId,
              locationId: item.locationId,
              remainingQuantity: remaining,
            });
            add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate,
              FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
          }

          feedCheckSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'feed-check-cancel',
      onClick: () => feedCheckSheet.close(),
    }, [t('action.cancel')]),
  ]));

  feedCheckSheet.open();
}

