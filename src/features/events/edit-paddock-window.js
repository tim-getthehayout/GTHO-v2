/** @file Paddock Window Edit Dialog — SP-10 §12. Edit dates, area, strip-graze config. Resolves OI-0064. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, remove, splitPaddockWindow } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import { getEventStartFloorExcluding } from './event-start.js';

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
  if (!isClosed) {
    // OI-0095: editing area_pct / is_strip_graze on an open window splits the window so
    // the prior area is preserved as historical truth.
    panel.appendChild(el('div', { className: 'form-hint', style: { fontSize: '11px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
      'Saving creates a new window from today forward. The prior area is preserved in the grazing history.',
    ]));
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  function saveChanges() {
    clear(statusEl);
    const newDateOpened = dateOpenedInput.value;
    const newDateClosed = dateClosedInput?.value || null;
    const newAreaPct = parseInt(areaPctInput.value, 10) || 100;
    const newIsStrip = stripCheck.checked;

    // Range guards
    if (!newDateOpened) { statusEl.appendChild(el('span', {}, ['Date opened is required'])); return; }
    // OI-0117: floor the new open date against the earliest OTHER child
    // window — if this paddock is currently the anchor, moving its open date
    // later is allowed so long as it doesn't move the event start past a
    // sibling's opening.
    const floorDate = getEventStartFloorExcluding(event.id, pw.id, 'paddock');
    if (floorDate && newDateOpened < floorDate) { statusEl.appendChild(el('span', {}, ['Paddock can\'t open before the event started'])); return; }
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

    // OI-0095: on an OPEN window, if areaPct / isStripGraze changed, route through
    // splitPaddockWindow so the prior state is preserved as historical truth. Metadata
    // edits (dateOpened, timeOpened) stay as direct update(). On a CLOSED window, direct
    // update() is the historical-correction escape hatch for all fields.
    if (!isClosed) {
      const stateChanged = (newAreaPct !== (pw.areaPct ?? 100)) || (newIsStrip !== !!pw.isStripGraze);
      if (stateChanged) {
        const todayStr = new Date().toISOString().slice(0, 10);
        const newState = { areaPct: newAreaPct, isStripGraze: newIsStrip };
        if (newIsStrip && !pw.isStripGraze) {
          // Turning strip-graze on: fresh stripGroupId
          newState.stripGroupId = crypto.randomUUID();
        } else if (!newIsStrip && pw.isStripGraze) {
          // Turning strip-graze off: clear stripGroupId, reset areaPct to 100 unless explicitly set
          newState.stripGroupId = null;
        }
        splitPaddockWindow(pw.locationId, event.id, todayStr, null, newState);
      }
      // Apply metadata-only changes (dateOpened/timeOpened) to the window the farmer
      // is editing. If a split fired, pw.id is the closed row now; the metadata edit
      // on the closed row is still legitimate (farmer may correct the dateOpened of
      // the original window).
      const metaChanges = {
        dateOpened: newDateOpened,
        timeOpened: timeOpenedInput.value || null,
      };
      if (metaChanges.dateOpened !== pw.dateOpened || metaChanges.timeOpened !== pw.timeOpened) {
        update('eventPaddockWindows', pw.id, metaChanges, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      }
    } else {
      const changes = {
        dateOpened: newDateOpened,
        timeOpened: timeOpenedInput.value || null,
        areaPct: newAreaPct,
        isStripGraze: newIsStrip,
        dateClosed: newDateClosed,
        timeClosed: timeClosedInput?.value || null,
      };
      update('eventPaddockWindows', pw.id, changes, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    }
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
        // OI-0095: same-paddock overlap guard — block if any OTHER PW on this location
        // is currently open (any event). Prevents two overlapping open windows on the
        // same paddock.
        const sameLocationOpen = getAll('eventPaddockWindows').find(w =>
          w.locationId === pw.locationId && w.id !== pw.id && !w.dateClosed,
        );
        if (sameLocationOpen) {
          window.alert('Cannot reopen — this paddock has an open window on another event. Close that first.');
          return;
        }
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
