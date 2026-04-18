/** @file Group Window Edit Dialog — SP-10 §7. Edit dates, head count, weight on a group window. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display, unitLabel } from '../../utils/units.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { openResolveDialog } from './resolve-window-change.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';

let editGwSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('edit-gw-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'edit-gw-wrap', style: { zIndex: '220' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => editGwSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'edit-gw-panel' }),
  ]));
}

/**
 * Open the group window edit dialog.
 * @param {object} gw — the event_group_window record
 * @param {object} event — the parent event
 * @param {string} operationId
 */
export function openEditGroupWindowDialog(gw, event, operationId) {
  ensureSheetDOM();
  if (!editGwSheet) editGwSheet = new Sheet('edit-gw-wrap');
  const panel = document.getElementById('edit-gw-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();
  const group = getById('groups', gw.groupId);
  const groupName = group?.name || 'Group';
  const wUnit = unitLabel('weight', unitSys);
  const isClosed = !!gw.dateLeft;

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Edit group window']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [groupName]));

  // Date joined + time
  const dateJoinedInput = el('input', { type: 'date', value: gw.dateJoined || '' });
  const timeJoinedInput = el('input', { type: 'time', value: gw.timeJoined || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date joined']), dateJoinedInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time joined ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeJoinedInput]),
  ]));

  // Date left + time (only if closed)
  let dateLeftInput = null, timeLeftInput = null;
  if (isClosed) {
    dateLeftInput = el('input', { type: 'date', value: gw.dateLeft || '' });
    timeLeftInput = el('input', { type: 'time', value: gw.timeLeft || '' });
    panel.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Date left']), dateLeftInput]),
      el('div', { className: 'field' }, [el('label', {}, ['Time left ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeLeftInput]),
    ]));
  }

  // Head count + avg weight
  //   OI-0094 entry #8: on OPEN windows these are system-generated view-only labels
  //   reading live values via the OI-0091 helpers. Closed windows keep the editable
  //   inputs as the historical-correction escape hatch.
  let headCountInput = null;
  let avgWeightInput = null;
  if (isClosed) {
    headCountInput = el('input', { type: 'number', min: '0', step: '1', value: gw.headCount ?? '' });
    const weightVal = gw.avgWeightKg ? (unitSys === 'imperial' ? convert(gw.avgWeightKg, 'weight', 'toImperial').toFixed(0) : gw.avgWeightKg.toFixed(0)) : '';
    avgWeightInput = el('input', { type: 'number', min: '0', step: '1', value: weightVal });
    panel.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Head count']), headCountInput]),
      el('div', { className: 'field' }, [el('label', {}, [`Avg weight (${wUnit})`]), avgWeightInput]),
    ]));
  } else {
    const memberships = getAll('animalGroupMemberships');
    const animals = getAll('animals');
    const animalWeightRecords = getAll('animalWeightRecords');
    const nowStr = new Date().toISOString().slice(0, 10);
    const headCountDisplay = getLiveWindowHeadCount(gw, { memberships, now: nowStr });
    const avgWeightKgDisplay = getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now: nowStr });
    const weightText = avgWeightKgDisplay > 0 ? display(avgWeightKgDisplay, 'weight', unitSys, 0) : '—';
    panel.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [
        el('label', {}, ['Head count']),
        el('div', { className: 'form-static-value', 'data-testid': 'edit-gw-head-count-live' }, [String(headCountDisplay)]),
      ]),
      el('div', { className: 'field' }, [
        el('label', {}, [`Avg weight (${wUnit})`]),
        el('div', { className: 'form-static-value', 'data-testid': 'edit-gw-avg-weight-live' }, [weightText]),
      ]),
    ]));
    panel.appendChild(el('div', { className: 'form-hint', style: { fontSize: '11px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
      t('event.systemGeneratedCaption'),
    ]));
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  // Save function with date validation
  function saveChanges() {
    clear(statusEl);
    const newDateJoined = dateJoinedInput.value;
    const newDateLeft = dateLeftInput?.value || null;

    // Validation
    if (!newDateJoined) { statusEl.appendChild(el('span', {}, ['Date joined is required'])); return; }
    if (newDateJoined < event.dateIn) { statusEl.appendChild(el('span', {}, ['Group can\'t join before the event started'])); return; }
    if (event.dateOut && newDateJoined > event.dateOut) { statusEl.appendChild(el('span', {}, ['Group can\'t join after the event closed'])); return; }
    if (newDateLeft && newDateLeft < newDateJoined) { statusEl.appendChild(el('span', {}, ['Leave date must be after join date'])); return; }
    if (event.dateOut && newDateLeft && newDateLeft > event.dateOut) { statusEl.appendChild(el('span', {}, ['Group can\'t stay after the event closed'])); return; }

    const changes = {
      dateJoined: newDateJoined,
      timeJoined: timeJoinedInput.value || null,
    };

    if (isClosed) {
      // Closed window — historical correction permitted on headCount/avgWeightKg.
      const newHeadCount = parseInt(headCountInput.value, 10);
      let newWeightKg = parseFloat(avgWeightInput.value);
      if (unitSys === 'imperial' && !isNaN(newWeightKg)) newWeightKg = convert(newWeightKg, 'weight', 'toMetric');
      if (isNaN(newHeadCount) || newHeadCount < 0) { statusEl.appendChild(el('span', {}, ['Head count must be at least 0'])); return; }
      changes.headCount = newHeadCount;
      changes.avgWeightKg = isNaN(newWeightKg) ? gw.avgWeightKg : newWeightKg;
      changes.dateLeft = newDateLeft;
      changes.timeLeft = timeLeftInput?.value || null;
    }
    // OI-0094 entry #8: open windows render system-generated head/weight — do not write those fields.

    update('eventGroupWindows', gw.id, changes, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    editGwSheet.close();
  }

  // Auto-save on blur for each field
  dateJoinedInput.addEventListener('blur', saveChanges);
  if (dateLeftInput) dateLeftInput.addEventListener('blur', saveChanges);
  if (headCountInput) headCountInput.addEventListener('blur', saveChanges);
  if (avgWeightInput) avgWeightInput.addEventListener('blur', saveChanges);

  // Buttons
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: saveChanges }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => editGwSheet.close() }, ['Cancel']),
  ]));

  // Delete window — OI-0094 entry #9: confirm dialog warns this is for cleanup of mistakes only.
  panel.appendChild(el('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border)' } }, [
    el('button', { className: 'btn btn-outline btn-sm', style: { color: 'var(--red)', borderColor: 'var(--red)', width: '100%' }, onClick: () => {
      if (!window.confirm(t('event.deleteWindowConfirm'))) return;
      remove('eventGroupWindows', gw.id, 'event_group_windows');
      editGwSheet.close();
    } }, ['Delete window']),
  ]));

  editGwSheet.open();
}
