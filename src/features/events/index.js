/** @file Events screen — CP-17. Event create & list with location picker. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, subscribe } from '../../data/store.js';
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

  const list = el('div', { className: 'event-list' });
  for (const evt of sorted) {
    list.appendChild(renderEventCard(evt));
  }
  listEl.appendChild(list);
}

function renderEventCard(evt) {
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
      paddockWindows.length ? renderPaddockWindowsSection(sortedPW) : null,

      // Group windows section
      groupWindows.length ? renderGroupWindowsSection(groupWindows, unitSys) : null,

      // Feed/metrics placeholders
      el('div', { className: 'event-card-section' }, [
        el('div', { className: 'form-hint', style: { fontStyle: 'italic' } }, [t('event.metricsPlaceholder')]),
      ]),
    ].filter(Boolean)),
  ]);
}

function renderPaddockWindowsSection(windows) {
  return el('div', { className: 'event-card-section' }, [
    el('div', { className: 'event-card-section-title' }, [t('event.paddockWindows')]),
    ...windows.map((w, idx) => {
      const loc = getById('locations', w.locationId);
      const locName = loc ? loc.name : w.locationId.slice(0, 8);
      const isOpen = !w.dateClosed;
      const isPrimary = idx === 0;

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
        el('span', {
          className: `badge ${isOpen ? 'badge-green' : 'badge-amber'}`,
        }, [isOpen ? t('event.windowOpen') : t('event.windowClosed')]),
      ]);
    }),
  ]);
}

function renderGroupWindowsSection(windows, unitSys) {
  return el('div', { className: 'event-card-section' }, [
    el('div', { className: 'event-card-section-title' }, [t('event.groupWindows')]),
    ...windows.map(w => {
      const group = getById('groups', w.groupId);
      const groupName = group ? group.name : w.groupId.slice(0, 8);
      const isOpen = !w.dateLeft;

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
        el('span', {
          className: `badge ${isOpen ? 'badge-green' : 'badge-amber'}`,
        }, [isOpen ? t('event.windowOpen') : t('event.windowClosed')]),
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

