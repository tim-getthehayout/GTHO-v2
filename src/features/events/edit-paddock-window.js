/** @file Paddock Window Edit Dialog — SP-10 §12. Edit dates, area, strip-graze config. Resolves OI-0064. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, remove } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';

let editPwSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('edit-pw-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'edit-pw-wrap', style: { zIndex: '220' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => editPwSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'edit-pw-panel' }),
  ]));
}

/**
 * Open the paddock window edit dialog.
 * @param {object} pw — event_paddock_window record
 * @param {object} event — parent event
 * @param {string} operationId
 */
export function openEditPaddockWindowDialog(pw, event, operationId) {
  ensureSheetDOM();
  if (!editPwSheet) editPwSheet = new Sheet('edit-pw-wrap');
  const panel = document.getElementById('edit-pw-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const loc = getById('locations', pw.locationId);
  const locName = loc?.name || 'Paddock';
  const isClosed = !!pw.dateClosed;

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Edit paddock window']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [locName]));

  // Date opened + time
  const dateOpenedInput = el('input', { type: 'date', value: pw.dateOpened || '' });
  const timeOpenedInput = el('input', { type: 'time', value: pw.timeOpened || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date opened']), dateOpenedInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time opened ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeOpenedInput]),
  ]));

  // Date closed + time (only if closed)
  let dateClosedInput = null, timeClosedInput = null;
  if (isClosed) {
    dateClosedInput = el('input', { type: 'date', value: pw.dateClosed || '' });
    timeClosedInput = el('input', { type: 'time', value: pw.timeClosed || '' });
    panel.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Date closed']), dateClosedInput]),
      el('div', { className: 'field' }, [el('label', {}, ['Time closed ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeClosedInput]),
    ]));
  }

  // Area % + strip graze toggle
  const areaPctInput = el('input', { type: 'number', min: '1', max: '100', step: '1', value: pw.areaPct ?? 100 });
  const stripCheck = el('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--green)' } });
  if (pw.isStripGraze) stripCheck.checked = true;
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Area %']), areaPctInput]),
    el('div', { className: 'field' }, [
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [stripCheck, 'Strip graze']),
    ]),
  ]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  function saveChanges() {
    clear(statusEl);
    const newDateOpened = dateOpenedInput.value;
    const newDateClosed = dateClosedInput?.value || null;

    // Range guards
    if (!newDateOpened) { statusEl.appendChild(el('span', {}, ['Date opened is required'])); return; }
    if (newDateOpened < event.dateIn) { statusEl.appendChild(el('span', {}, ['Paddock can\'t open before the event started'])); return; }
    if (event.dateOut && newDateOpened > event.dateOut) { statusEl.appendChild(el('span', {}, ['Paddock can\'t open after the event closed'])); return; }
    if (newDateClosed && newDateClosed < newDateOpened) { statusEl.appendChild(el('span', {}, ['Close date must be after open date'])); return; }
    if (event.dateOut && newDateClosed && newDateClosed > event.dateOut) { statusEl.appendChild(el('span', {}, ['Paddock can\'t stay open after the event closed'])); return; }

    // Same-paddock overlap check
    const siblings = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && w.locationId === pw.locationId && w.id !== pw.id);
    for (const sib of siblings) {
      const sibStart = sib.dateOpened;
      const sibEnd = sib.dateClosed || '9999-12-31';
      const newEnd = newDateClosed || '9999-12-31';
      if (newDateOpened < sibEnd && newEnd > sibStart) {
        statusEl.appendChild(el('span', {}, ['This paddock already has a window during that range']));
        return;
      }
    }

    const changes = {
      dateOpened: newDateOpened,
      timeOpened: timeOpenedInput.value || null,
      areaPct: parseInt(areaPctInput.value, 10) || 100,
      isStripGraze: stripCheck.checked,
    };
    if (isClosed) {
      changes.dateClosed = newDateClosed;
      changes.timeClosed = timeClosedInput?.value || null;
    }

    update('eventPaddockWindows', pw.id, changes, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    editPwSheet.close();
  }

  // Auto-save on blur
  dateOpenedInput.addEventListener('blur', saveChanges);
  if (dateClosedInput) dateClosedInput.addEventListener('blur', saveChanges);
  areaPctInput.addEventListener('blur', saveChanges);

  // Buttons
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: saveChanges }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => editPwSheet.close() }, ['Cancel']),
  ]));

  // Reopen action (OI-0064 — for closed windows)
  if (isClosed) {
    panel.appendChild(el('div', { style: { marginTop: '10px' } }, [
      el('button', { className: 'btn btn-outline btn-sm', style: { width: '100%' }, onClick: () => {
        if (!window.confirm(`Reopen ${locName} on this event? Animals will be recorded as on this paddock from ${pw.dateOpened} with no end date.`)) return;
        update('eventPaddockWindows', pw.id, { dateClosed: null, timeClosed: null }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
        editPwSheet.close();
      } }, ['Reopen paddock window']),
    ]));
  }

  // Delete window
  panel.appendChild(el('div', { style: { marginTop: '8px', paddingTop: '12px', borderTop: '0.5px solid var(--border)' } }, [
    el('button', { className: 'btn btn-outline btn-sm', style: { color: 'var(--red)', borderColor: 'var(--red)', width: '100%' }, onClick: () => {
      // Guard: can't delete last open paddock on active event
      if (!isClosed) {
        const openPws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && !w.dateClosed);
        if (openPws.length <= 1) { window.alert('Cannot delete the last open paddock window on an active event.'); return; }
      }
      if (!window.confirm(`Delete this paddock window? Animals will no longer be recorded as having been on ${locName} from ${pw.dateOpened} to ${pw.dateClosed || 'now'}.`)) return;
      remove('eventPaddockWindows', pw.id, 'event_paddock_windows');
      editPwSheet.close();
    } }, ['Delete window']),
  ]));

  editPwSheet.open();
}
