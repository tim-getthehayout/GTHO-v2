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

/** Unsubscribe functions */
let unsubs = [];

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
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-submove-btn-${evt.id}`,
            onClick: () => openSubmoveOpenSheet(evt, operationId),
          }, [t('event.subMove')]),
          el('button', {
            className: 'btn btn-outline btn-sm',
            'data-testid': `events-add-group-btn-${evt.id}`,
            onClick: () => openGroupAddSheet(evt, operationId),
          }, [t('event.addGroupTitle')]),
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

