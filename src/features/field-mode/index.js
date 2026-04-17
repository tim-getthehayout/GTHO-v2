/** @file Field mode home — SP-8 v1 parity. 8 configurable modules, dynamic tile grid, event picker, interactive tasks. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, add, subscribe } from '../../data/store.js';
import { getFieldMode } from '../../utils/preferences.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import { convert } from '../../utils/units.js';
import { formatShortDate } from '../../utils/date-format.js';
import { navigate } from '../../ui/router.js';
import { getUser } from '../auth/session.js';
import { openHarvestSheet } from '../harvest/index.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openFeedCheckSheet } from '../feed/check.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openSurveySheet } from '../locations/index.js';
import { openTodoSheet } from '../todos/todo-sheet.js';
import * as TodoEntity from '../../entities/todo.js';
import * as HeatRecordEntity from '../../entities/animal-heat-record.js';

let unsubs = [];
let expandedEventId = null;
let pickerSheet = null;
let heatPickerSheet = null;

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
    case 'surveysingle': return handleSurveySingle(opId);
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

function handleSurveySingle(opId) {
  // Pasture picker → single survey
  const locs = getAll('locations').filter(l => !l.archived && l.type === 'land' && l.landUse !== 'crop');
  if (!locs.length) { window.alert('No pasture locations'); return; }
  if (locs.length === 1) { openSurveySheet(locs[0].id, opId); return; }
  // Show picker
  ensurePickerSheetDOM();
  if (!pickerSheet) pickerSheet = new Sheet('fm-picker-wrap');
  const panel = document.getElementById('fm-picker-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Select paddock']));
  for (const loc of locs) {
    const areaVal = loc.areaHa ? convert(loc.areaHa, 'area', 'toImperial').toFixed(1) : '';
    panel.appendChild(el('div', {
      style: { padding: '12px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '6px' },
      onClick: () => { pickerSheet.close(); openSurveySheet(loc.id, opId); },
    }, [
      el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [loc.name]),
      el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`${areaVal} ac \u00B7 ${loc.landUse}`]),
    ]));
  }
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '10px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => { pickerSheet.close(); navigate('#/field'); } }, ['\u2302 Done']),
  ]));
  pickerSheet.open();
}

function handleHeat(opId) {
  openHeatPickerSheet(opId);
}

// ─── Heat Picker Sheet (2-step: animal selection → record heat) ────────

function ensureHeatPickerDOM() {
  if (document.getElementById('hp-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'hp-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop' }),
    el('div', { className: 'sheet-panel', id: 'hp-sheet-panel' }),
  ]));
}

function getLastHeatDate(animal) {
  const records = getAll('animalHeatRecords').filter(r => r.animalId === animal.id);
  if (!records.length) return null;
  records.sort((a, b) => (b.observedAt || '').localeCompare(a.observedAt || ''));
  return records[0].observedAt;
}

function openHeatPickerSheet(opId) {
  ensureHeatPickerDOM();
  if (!heatPickerSheet) heatPickerSheet = new Sheet('hp-sheet-wrap');
  renderHeatStep1(opId, 'all', 'all', '');
  heatPickerSheet.open();
}

function renderHeatStep1(opId, eventFilter, groupFilter, query) {
  const panel = document.getElementById('hp-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  // Header
  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, [
    el('h3', { style: { margin: '0', fontSize: '16px' } }, ['Select Animal']),
    el('button', { className: 'btn btn-outline btn-xs', onClick: () => { heatPickerSheet.close(); navigate('#/field'); } }, ['\u2302 Done']),
  ]));

  // Event filter pills
  const openEvents = getAll('events').filter(e => !e.dateOut);
  const evPills = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' } });
  const makeEvPill = (label, value) => {
    const active = eventFilter === value;
    return el('button', {
      type: 'button',
      style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', border: active ? '1.5px solid var(--green)' : '1.5px solid var(--border2)', background: active ? 'var(--green)' : 'transparent', color: active ? 'white' : 'var(--text2)' },
      onClick: () => renderHeatStep1(opId, value, 'all', query),
    }, [label]);
  };
  evPills.appendChild(makeEvPill('All events', 'all'));
  for (const evt of openEvents) {
    const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
    const locName = pws.map(w => { const l = getById('locations', w.locationId); return l?.name || '?'; }).join(', ');
    evPills.appendChild(makeEvPill(locName, evt.id));
  }
  panel.appendChild(evPills);

  // Group filter pills
  let availableGroups = [];
  if (eventFilter === 'all') {
    const allGws = getAll('eventGroupWindows').filter(gw => openEvents.some(e => e.id === gw.eventId) && !gw.dateLeft);
    const seen = new Set();
    for (const gw of allGws) { if (!seen.has(gw.groupId)) { seen.add(gw.groupId); availableGroups.push(gw.groupId); } }
  } else {
    const evGws = getAll('eventGroupWindows').filter(gw => gw.eventId === eventFilter && !gw.dateLeft);
    availableGroups = evGws.map(gw => gw.groupId);
  }
  if (availableGroups.length > 1) {
    const grpPills = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' } });
    const makeGrpPill = (label, value) => {
      const active = groupFilter === value;
      return el('button', {
        type: 'button',
        style: { padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit', border: active ? '1.5px solid var(--teal)' : '1.5px solid var(--border2)', background: active ? 'var(--teal)' : 'transparent', color: active ? 'white' : 'var(--text2)' },
        onClick: () => renderHeatStep1(opId, eventFilter, value, query),
      }, [label]);
    };
    grpPills.appendChild(makeGrpPill('All groups', 'all'));
    for (const gId of availableGroups) {
      const g = getById('groups', gId);
      grpPills.appendChild(makeGrpPill(g?.name || '?', gId));
    }
    panel.appendChild(grpPills);
  }

  // Search input
  const searchInput = el('input', {
    type: 'text', placeholder: 'Search by tag, name, or ID',
    value: query,
    style: { width: '100%', padding: '10px 12px', fontSize: '15px', border: '1.5px solid var(--border2)', borderRadius: '8px', marginBottom: '8px', boxSizing: 'border-box', fontFamily: 'inherit', background: 'var(--bg)', color: 'var(--text)' },
    onInput: () => renderHeatStep1(opId, eventFilter, groupFilter, searchInput.value),
  });
  panel.appendChild(searchInput);

  // Filter animals
  let pool = getAll('animals').filter(a => a.sex === 'female' && !a.culled);

  if (eventFilter !== 'all') {
    const evGws = getAll('eventGroupWindows').filter(gw => gw.eventId === eventFilter && !gw.dateLeft);
    const evGroupIds = new Set(evGws.map(gw => gw.groupId));
    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft && evGroupIds.has(m.groupId));
    const animalIds = new Set(memberships.map(m => m.animalId));
    pool = pool.filter(a => animalIds.has(a.id));
  }

  if (groupFilter !== 'all') {
    const memberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft && m.groupId === groupFilter);
    const animalIds = new Set(memberships.map(m => m.animalId));
    pool = pool.filter(a => animalIds.has(a.id));
  }

  if (query) {
    const q = query.toLowerCase();
    pool = pool.filter(a =>
      (a.tagNum || '').toLowerCase().includes(q) ||
      (a.name || '').toLowerCase().includes(q) ||
      (a.id || '').toLowerCase().includes(q)
    );
  }

  pool.sort((a, b) => (a.tagNum || a.id || '').localeCompare(b.tagNum || b.id || '', undefined, { numeric: true }));

  // Animal list
  const listEl = el('div', { style: { maxHeight: '55vh', overflowY: 'auto' } });
  if (!pool.length) {
    listEl.appendChild(el('div', { className: 'form-hint', style: { padding: '20px', textAlign: 'center' } }, ['No matching animals']));
  } else {
    // Look up group memberships once for display
    const allMemberships = getAll('animalGroupMemberships').filter(m => !m.dateLeft);
    for (const animal of pool) {
      const tag = animal.tagNum || `A-${animal.id.slice(0, 5)}`;
      const membership = allMemberships.find(m => m.animalId === animal.id);
      const group = membership ? getById('groups', membership.groupId) : null;
      const groupName = group?.name || '';
      const nameParts = [animal.name, groupName].filter(Boolean).join(' \u00B7 ');
      const lastHeat = getLastHeatDate(animal);
      const lastLabel = lastHeat ? `Last: ${formatShortDate(lastHeat.slice(0, 10))}` : '';

      listEl.appendChild(el('div', {
        style: { padding: '12px 8px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: '44px' },
        onClick: () => renderHeatStep2(opId, animal, eventFilter, groupFilter, query),
      }, [
        el('div', {}, [
          el('div', { style: { fontSize: '15px', fontWeight: '600' } }, [tag]),
          nameParts ? el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [nameParts]) : null,
        ].filter(Boolean)),
        lastLabel ? el('div', { style: { fontSize: '11px', color: 'var(--text3)' } }, [lastLabel]) : null,
      ].filter(Boolean)));
    }
  }
  panel.appendChild(listEl);

  // Restore focus to search if there was a query
  if (query) {
    requestAnimationFrame(() => { searchInput.focus(); searchInput.setSelectionRange(query.length, query.length); });
  }
}

function renderHeatStep2(opId, animal, eventFilter, groupFilter, query) {
  const panel = document.getElementById('hp-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const tag = animal.tagNum || `A-${animal.id.slice(0, 5)}`;
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  // Header with back button
  panel.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' } }, [
    el('button', { className: 'btn btn-outline btn-xs', onClick: () => renderHeatStep1(opId, eventFilter, groupFilter, query) }, ['\u2190 Back']),
    el('h3', { style: { margin: '0', fontSize: '16px' } }, ['Record Heat']),
  ]));

  // Animal label
  panel.appendChild(el('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '12px' } }, [
    `${tag}${animal.name ? ` \u2014 ${animal.name}` : ''}`,
  ]));

  // Date + time
  const dateInput = el('input', { type: 'date', value: todayStr, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const timeInput = el('input', { type: 'time', value: nowTime, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  panel.appendChild(el('div', { style: { display: 'flex', gap: '10px', marginBottom: '12px' } }, [
    el('div', { style: { flex: '1' } }, [el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, ['Date']), dateInput]),
    el('div', { style: { flex: '1' } }, [el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, ['Time ', el('span', { style: { fontSize: '10px' } }, ['(optional)'])]), timeInput]),
  ]));

  // Notes
  const notesInput = el('textarea', { rows: '2', placeholder: 'Behavior observed, standing heat, etc.', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' } });
  panel.appendChild(el('div', { style: { marginBottom: '12px' } }, [
    el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, ['Notes ', el('span', { style: { fontSize: '10px' } }, ['(optional)'])]),
    notesInput,
  ]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  // Buttons
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-outline', onClick: () => renderHeatStep1(opId, eventFilter, groupFilter, query) }, ['Cancel']),
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      try {
        const dateVal = dateInput.value;
        const timeVal = timeInput.value || '00:00';
        const observedAt = `${dateVal}T${timeVal}:00`;
        const record = HeatRecordEntity.create({ operationId: opId, animalId: animal.id, observedAt, notes: notesInput.value.trim() || null });
        add('animalHeatRecords', record, HeatRecordEntity.validate, HeatRecordEntity.toSupabaseShape, 'animal_heat_records');
        // Toast
        showToast(`Heat recorded \u2014 ${tag}`);
        // Return to Step 1 (stays open for multi-record)
        renderHeatStep1(opId, eventFilter, groupFilter, query);
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save']),
  ]));
}

function showToast(msg) {
  const toast = el('div', {
    style: { position: 'fixed', bottom: '80px', left: '50%', transform: 'translateX(-50%)', background: 'var(--green)', color: 'white', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', zIndex: '500', opacity: '1', transition: 'opacity 0.5s', pointerEvents: 'none', fontFamily: 'inherit' },
  }, [msg]);
  document.body.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; }, 2000);
  setTimeout(() => { toast.remove(); }, 2500);
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

    // Card wrapper
    const card = el('div', {
      style: { background: 'var(--bg)', border: isExpanded ? '1.5px solid var(--teal)' : '0.5px solid var(--border)', borderRadius: '10px', marginBottom: '6px', overflow: 'hidden' },
    });

    // Collapsed row — pure tap target, no competing buttons
    card.appendChild(el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', cursor: 'pointer' },
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
      el('div', { style: { fontSize: '14px', color: 'var(--text3)' } }, [isExpanded ? '\u25BE' : '\u203A']),
    ]));

    // Expanded detail section
    if (isExpanded) {
      const feedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === evt.id);
      const feedChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === evt.id);
      const feedCount = feedEntries.length;
      const checkCount = feedChecks.length;

      // Feed cost estimate
      const batches = getAll('batches');
      const batchMap = new Map(batches.map(b => [b.id, b]));
      let totalCost = 0;
      for (const fe of feedEntries) {
        const batch = batchMap.get(fe.batchId);
        const qty = fe.entryType === 'removal' ? -(fe.quantity ?? 0) : (fe.quantity ?? 0);
        totalCost += qty * (batch?.costPerUnit ?? 0);
      }

      // Feed status line
      const fedToday = feedEntries.some(fe => fe.date === todayStr && fe.entryType !== 'removal');
      const feedParts = [];
      if (fedToday) feedParts.push('Fed today \u2713');
      if (feedCount > 0) feedParts.push(`${feedCount} feed entr${feedCount === 1 ? 'y' : 'ies'}`);
      if (checkCount > 0) feedParts.push(`${checkCount} feed check${checkCount === 1 ? '' : 's'}`);
      const feedStatusLine = feedParts.length ? feedParts.join(' \u00B7 ') : 'No feed entries';

      const detail = el('div', { style: { padding: '8px 12px 10px', borderTop: '0.5px solid var(--border)' } }, [
        // Date in + cost
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' } }, [
          `In: ${evt.dateIn ? formatShortDate(evt.dateIn) : '\u2014'} \u00B7 Est. cost: $${totalCost.toFixed(0)}`,
        ]),
        // Per-group details
        ...gws.map(gw => {
          const g = getById('groups', gw.groupId);
          const wt = gw.avgWeightKg ? (unitSys === 'imperial' ? convert(gw.avgWeightKg, 'weight', 'toImperial') : gw.avgWeightKg) : 0;
          const wtLabel = unitSys === 'imperial' ? 'lbs' : 'kg';
          return el('div', { style: { fontSize: '12px', marginBottom: '2px' } }, [
            `${g?.name || '?'}: ${gw.headCount ?? 0} hd \u00B7 ${Math.round(wt).toLocaleString()} ${wtLabel} avg`,
          ]);
        }),
        // Feed status
        el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '4px' } }, [feedStatusLine]),
        // Move all button — inside expanded section
        el('div', { style: { marginTop: '8px', textAlign: 'right' } }, [
          el('button', { className: 'btn btn-teal btn-sm', style: { padding: '4px 12px' }, onClick: () => openMoveWizard(evt, opId, farmId) }, ['Move all']),
        ]),
      ]);
      card.appendChild(detail);
    }

    container.appendChild(card);
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
