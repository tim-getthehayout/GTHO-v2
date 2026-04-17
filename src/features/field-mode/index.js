/** @file Field mode home — SP-8 v1 parity. 8 configurable modules, dynamic tile grid, event picker, interactive tasks. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, subscribe } from '../../data/store.js';
import { getFieldMode } from '../../utils/preferences.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { convert } from '../../utils/units.js';
import { navigate } from '../../ui/router.js';
import { getUser } from '../auth/session.js';
import { openHarvestSheet } from '../harvest/index.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openSurveySheet } from '../locations/index.js';
import { openHeatSheet } from '../health/heat.js';
import { openTodoSheet } from '../todos/todo-sheet.js';
import * as TodoEntity from '../../entities/todo.js';

let unsubs = [];
let expandedEventId = null;
let pickerSheet = null;

// ─── Module Definitions ─────────────────────────────────────────────────

export const FIELD_MODULES = [
  { key: 'feed',         icon: '\uD83C\uDF3E', labelKey: 'fieldMode.feedAnimals' },
  { key: 'move',         icon: '\uD83D\uDC04', labelKey: 'fieldMode.moveAnimals' },
  { key: 'harvest',      icon: '\uD83D\uDE9C', labelKey: 'fieldMode.harvest' },
  { key: 'feedcheck',    icon: '\uD83D\uDCCB', labelKey: 'fieldMode.feedCheck' },
  { key: 'surveybulk',   icon: '\uD83D\uDCCB', labelKey: 'fieldMode.survey' },
  { key: 'surveysingle', icon: '\uD83D\uDCCB', labelKey: 'fieldMode.surveySingle' },
  { key: 'animals',      icon: '\uD83D\uDC04', labelKey: 'fieldMode.animals' },
  { key: 'heat',         icon: '\uD83C\uDF21\uFE0F', labelKey: 'fieldMode.recordHeat' },
];

export const FIELD_MODULES_DEFAULT = ['feed', 'harvest', 'surveybulk', 'animals'];

function getActiveModuleKeys() {
  const user = getUser();
  const prefs = getAll('userPreferences').find(p => p.userId === user?.id);
  return prefs?.fieldModeQuickActions || FIELD_MODULES_DEFAULT;
}

function getOperationId() {
  return getAll('operations')[0]?.id;
}

function getFarmId() {
  return getAll('farms')[0]?.id;
}

// ─── Main Screen ────────────────────────────────────────────────────────

export function renderFieldModeHome(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];
  expandedEventId = null;

  const screenEl = el('div', { 'data-testid': 'field-mode-screen', style: { padding: 'var(--space-4)' } });

  // Sub-heading (Part 9)
  screenEl.appendChild(el('div', { style: { marginBottom: 'var(--space-4)' } }, [
    el('div', { style: { fontSize: '17px', fontWeight: '600' } }, [t('fieldMode.homeTitle')]),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [t('fieldMode.homeHint')]),
  ]));

  // Tile grid container
  const tileGridEl = el('div', { 'data-testid': 'field-mode-tiles-wrap' });
  screenEl.appendChild(tileGridEl);

  // Events section
  const eventsEl = el('div', { 'data-testid': 'field-mode-events' });
  screenEl.appendChild(eventsEl);

  // Tasks section
  const tasksEl = el('div', { 'data-testid': 'field-mode-tasks' });
  screenEl.appendChild(tasksEl);

  container.appendChild(screenEl);

  function renderAll() {
    renderTileGrid(tileGridEl);
    renderActiveEvents(eventsEl);
    renderTasks(tasksEl);
  }

  renderAll();
  unsubs.push(subscribe('events', () => renderActiveEvents(eventsEl)));
  unsubs.push(subscribe('eventPaddockWindows', () => renderActiveEvents(eventsEl)));
  unsubs.push(subscribe('eventGroupWindows', () => renderActiveEvents(eventsEl)));
  unsubs.push(subscribe('todos', () => renderTasks(tasksEl)));
  unsubs.push(subscribe('userPreferences', () => renderTileGrid(tileGridEl)));
}

// ─── Tile Grid (Part 3) ────────────────────────────────────────────────

function renderTileGrid(container) {
  clear(container);
  const activeKeys = getActiveModuleKeys();
  const activeTiles = FIELD_MODULES.filter(m => activeKeys.includes(m.key));

  if (!activeTiles.length) {
    container.appendChild(el('div', { className: 'form-hint', style: { textAlign: 'center', padding: '20px' } }, [t('fieldMode.noModules')]));
    return;
  }

  const grid = el('div', { className: 'field-mode-tiles', style: { marginBottom: 'var(--space-5)' } });
  for (const mod of activeTiles) {
    grid.appendChild(el('button', {
      className: 'field-mode-tile',
      'data-testid': `field-mode-tile-${mod.key}`,
      onClick: () => handleModuleTap(mod.key),
    }, [
      el('div', { className: 'field-mode-tile-icon' }, [mod.icon]),
      t(mod.labelKey),
    ]));
  }
  container.appendChild(grid);
}

// ─── Module Handlers (Part 4) ───────────────────────────────────────────

function handleModuleTap(key) {
  const opId = getOperationId();
  const farmId = getFarmId();

  switch (key) {
    case 'feed': return handleFeed(opId);
    case 'move': return handleMove(opId, farmId);
    case 'harvest': return openHarvestSheet(opId, { fieldMode: true });
    case 'feedcheck': return handleFeedCheck(opId);
    case 'surveybulk': return openSurveySheet(null, opId);
    case 'surveysingle': return navigate('#/locations'); // interim — OI-0077
    case 'animals': return navigate('#/animals');
    case 'heat': return handleHeat(opId);
  }
}

function handleFeed(opId) {
  const openEvents = getAll('events').filter(e => !e.dateOut);
  if (!openEvents.length) { window.alert(t('fieldMode.noOpenEvents')); return; }
  if (openEvents.length === 1) { openDeliverFeedSheet(openEvents[0], opId); return; }
  openFieldModePickerSheet('feed', openEvents, (evt) => openDeliverFeedSheet(evt, opId));
}

function handleMove(opId, farmId) {
  const openEvents = getAll('events').filter(e => !e.dateOut);
  if (!openEvents.length) { window.alert(t('fieldMode.noOpenEvents')); return; }
  if (openEvents.length === 1) { openMoveWizard(openEvents[0], opId, farmId); return; }
  openFieldModePickerSheet('move', openEvents, (evt) => openMoveWizard(evt, opId, farmId));
}

function handleFeedCheck(opId) {
  const eventsWithFeed = getAll('events').filter(e => {
    if (e.dateOut) return false;
    return getAll('eventFeedEntries').some(fe => fe.eventId === e.id);
  });
  if (!eventsWithFeed.length) { window.alert(t('fieldMode.noStoredFeed')); return; }
  if (eventsWithFeed.length === 1) { openFeedCheckSheet(eventsWithFeed[0], opId); return; }
  openFieldModePickerSheet('feedcheck', eventsWithFeed, (evt) => openFeedCheckSheet(evt, opId));
}

function handleHeat(opId) {
  // Interim: find first female animal in an active event group, open heat sheet
  const openEvents = getAll('events').filter(e => !e.dateOut);
  const gws = getAll('eventGroupWindows').filter(gw => openEvents.some(e => e.id === gw.eventId) && !gw.dateLeft);
  const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft && gws.some(gw => gw.groupId === m.groupId));
  const females = getAll('animals').filter(a => a.sex === 'female' && !a.culled && memberships.some(m => m.animalId === a.id));
  if (!females.length) { window.alert('No female animals in active events'); return; }
  // Open heat sheet for first female — OI-0078 will add dedicated picker
  openHeatSheet(females[0], opId);
}

// ─── Event Picker Sheet (Part 5) ───────────────────────────────────────

function ensurePickerSheetDOM() {
  if (document.getElementById('fm-picker-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'fm-picker-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop' }),
    el('div', { className: 'sheet-panel', id: 'fm-picker-panel' }),
  ]));
}

function openFieldModePickerSheet(_type, events, onSelect) {
  ensurePickerSheetDOM();
  if (!pickerSheet) pickerSheet = new Sheet('fm-picker-wrap');
  const panel = document.getElementById('fm-picker-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Select event']));

  for (const evt of events) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
    const gws = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
    const locName = pws.map(w => { const l = getById('locations', w.locationId); return l?.name || '?'; }).join(', ');
    const groupNames = gws.map(w => { const g = getById('groups', w.groupId); return g?.name || '?'; }).join(', ');

    panel.appendChild(el('div', {
      style: { padding: '12px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '6px' },
      onClick: () => { pickerSheet.close(); onSelect(evt); },
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [`\uD83D\uDCCD ${locName}`]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [groupNames]),
    ]));
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '10px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => { pickerSheet.close(); navigate('#/field'); } }, ['\u2302 Done']),
  ]));

  pickerSheet.open();
}

// ─── Active Events (Part 7 — expandable cards) ─────────────────────────

function renderActiveEvents(container) {
  clear(container);
  const events = getAll('events').filter(e => !e.dateOut);
  const todayStr = new Date().toISOString().slice(0, 10);
  const unitSys = getUnitSystem();
  const opId = getOperationId();
  const farmId = getFarmId();

  container.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-4) 0 var(--space-2)' } }, [
    el('h3', { className: 'sec', style: { margin: '0' } }, [t('fieldMode.activeEvents')]),
  ]));

  if (!events.length) {
    container.appendChild(el('p', { className: 'form-hint' }, [t('fieldMode.noActiveEvents')]));
    return;
  }

  for (const evt of events) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
    const gws = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
    const locNames = pws.map(w => { const loc = getById('locations', w.locationId); return loc?.name || '?'; }).join(', ');
    const locAcres = pws.reduce((sum, w) => { const loc = getById('locations', w.locationId); return sum + (loc?.areaHa ? convert(loc.areaHa, 'area', 'toImperial') : 0); }, 0);
    const groupNames = gws.map(w => { const g = getById('groups', w.groupId); return g?.name || '?'; }).join(' \u00B7 ');
    const dayCount = evt.dateIn ? daysBetweenInclusive(evt.dateIn, todayStr) : 0;
    const subMoves = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && w.dateClosed).length;
    const isExpanded = expandedEventId === evt.id;

    // Collapsed row
    const row = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: 'var(--bg)', border: isExpanded ? '1.5px solid var(--teal)' : '0.5px solid var(--border)', borderRadius: '10px', marginBottom: '6px', cursor: 'pointer' },
      onClick: () => { expandedEventId = isExpanded ? null : evt.id; renderActiveEvents(container); },
    }, [
      el('div', { style: { width: '4px', borderRadius: '2px', flexShrink: '0', alignSelf: 'stretch', background: 'var(--green)', minHeight: '36px' } }),
      el('div', { style: { flex: '1' } }, [
        el('div', { style: { display: 'flex', gap: '6px' } }, [
          el('span', { style: { fontSize: '13px', fontWeight: '500' } }, [`\uD83C\uDF3F ${locNames}`]),
          locAcres > 0 ? el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, [`${locAcres.toFixed(1)} ac`]) : null,
        ].filter(Boolean)),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginTop: '2px' } }, [
          `${groupNames} \u00B7 Day ${dayCount}${subMoves > 0 ? ` \u00B7 ${subMoves} sub-moves` : ''}`,
        ]),
      ]),
      el('button', { className: 'btn btn-teal btn-sm', style: { padding: '3px 8px' }, onClick: (e) => { e.stopPropagation(); openMoveWizard(evt, opId, farmId); } }, ['Move all']),
      el('div', { style: { fontSize: '14px', color: 'var(--text3)' } }, [isExpanded ? '\u25BE' : '\u203A']),
    ]);

    container.appendChild(row);
  }
}

// ─── Tasks (Part 8 — interactive) ──────────────────────────────────────

function renderTasks(container) {
  clear(container);
  const todos = getAll('todos').filter(td => td.status !== 'closed');
  const todayStr = new Date().toISOString().slice(0, 10);

  container.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 'var(--space-4) 0 var(--space-2)' } }, [
    el('h3', { className: 'sec', style: { margin: '0' } }, [t('fieldMode.tasks')]),
    el('button', { className: 'btn btn-green btn-xs', onClick: () => openTodoSheet() }, ['+ Add']),
  ]));

  if (!todos.length) {
    container.appendChild(el('p', { className: 'form-hint' }, [t('fieldMode.noTasks')]));
    return;
  }

  const display = todos.slice(0, 4);
  for (const todo of display) {
    let dueColor = 'var(--text3)';
    let dueLabel = todo.dueDate ? `Due ${todo.dueDate}` : '';
    if (todo.dueDate) {
      if (todo.dueDate < todayStr) { dueColor = 'var(--red)'; dueLabel = `Overdue \u00B7 ${todo.dueDate}`; }
      else if (todo.dueDate === todayStr) { dueColor = 'var(--amber)'; dueLabel = 'Due today'; }
    }

    container.appendChild(el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: '10px', marginBottom: '6px' },
    }, [
      // Checkbox
      el('div', {
        style: { width: '18px', height: '18px', borderRadius: '4px', border: '1.5px solid var(--border2)', flexShrink: '0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
        onClick: (e) => {
          e.stopPropagation();
          update('todos', todo.id, { status: 'closed', closedAt: new Date().toISOString() }, TodoEntity.validate, TodoEntity.toSupabaseShape, 'todos');
        },
      }),
      // Content
      el('div', { style: { flex: '1', cursor: 'pointer' }, onClick: () => openTodoSheet(todo) }, [
        el('div', { style: { fontSize: '13px' } }, [todo.title || '']),
        dueLabel ? el('div', { style: { fontSize: '11px', color: dueColor } }, [dueLabel]) : null,
      ].filter(Boolean)),
    ]));
  }

  if (todos.length > 4) {
    container.appendChild(el('div', { style: { textAlign: 'center', marginTop: '4px' } }, [
      el('a', { href: '#/todos', style: { fontSize: '12px', color: 'var(--teal)', textDecoration: 'none' } }, ['View all']),
    ]));
  }
}
