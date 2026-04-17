/** @file Retro-Place Flow — SP-10 Gap option 3 (OI-0083).
 *
 * Atomic two-write transaction: commit the source group window's edited
 * date_joined AND insert a new historical group window on a destination event
 * that fully contains the gap. Picker filter = full containment only.
 *
 * Pre-validates both records before any write; on add() failure after the
 * update() succeeded, manually reverts the update.
 */

import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';

let pickerSheet = null;

function ensurePickerSheetDOM() {
  if (document.getElementById('retro-place-picker-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'retro-place-picker-wrap', style: { zIndex: '230' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => pickerSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'retro-place-picker-panel' }),
  ]));
}

function showToast(message) {
  const existing = document.querySelector('[data-testid="retro-place-toast"]');
  if (existing) existing.remove();
  const toast = el('div', {
    className: 'export-toast',
    'data-testid': 'retro-place-toast',
    style: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', zIndex: '400', maxWidth: '90%' },
  }, [message]);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

/**
 * Compute candidate destination events for a retro-place.
 * Pure: no DOM, no side effects. Exported for testing.
 *
 * @param {object} args - { sourceEventId, gapStart, gapEnd, allEvents }
 * @returns {Array} candidate event records, full-containment only
 */
export function computeCandidateEvents({ sourceEventId, gapStart, gapEnd, allEvents }) {
  return allEvents.filter(e =>
    e.id !== sourceEventId &&
    e.dateIn && e.dateOut &&
    e.dateIn <= gapStart &&
    e.dateOut >= gapEnd
  );
}

/**
 * Compute candidate paddock windows on a destination event that fully contain the gap.
 * Pure: exported for testing.
 *
 * @param {object} args - { destEventId, gapStart, gapEnd, allPaddockWindows }
 * @returns {Array} candidate paddock window records
 */
export function computeCandidatePaddocks({ destEventId, gapStart, gapEnd, allPaddockWindows }) {
  return allPaddockWindows.filter(pw =>
    pw.eventId === destEventId &&
    pw.dateOpened && pw.dateClosed &&
    pw.dateOpened <= gapStart &&
    pw.dateClosed >= gapEnd
  );
}

/**
 * Detect whether the group already has an overlapping window on the destination
 * during the gap range. Pure: exported for testing.
 *
 * @param {object} args - { destEventId, groupId, gapStart, gapEnd, allGroupWindows }
 * @returns {object|null} the conflicting window, or null
 */
export function findConflictingWindow({ destEventId, groupId, gapStart, gapEnd, allGroupWindows }) {
  for (const gw of allGroupWindows) {
    if (gw.eventId !== destEventId) continue;
    if (gw.groupId !== groupId) continue;
    const wStart = gw.dateJoined;
    const wEnd = gw.dateLeft || gapEnd;
    if (wStart <= gapEnd && wEnd >= gapStart) return gw;
  }
  return null;
}

/**
 * Atomically commit the two writes: update source window's dateJoined AND
 * insert the new destination window. Pre-validates both records first;
 * if add() throws after update() succeeded, reverts the update.
 *
 * Exported for testing.
 *
 * @param {object} args - { sourceWindow, newDateJoined, newDestWindow }
 * @returns {object} { sourceUpdated, destAdded }
 * @throws on validation failure or unrecoverable add() error
 */
export function commitRetroPlace({ sourceWindow, newDateJoined, newDestWindow }) {
  const stagedSource = { ...sourceWindow, dateJoined: newDateJoined };
  const sourceCheck = GroupWindowEntity.validate(stagedSource);
  if (!sourceCheck.valid) {
    throw new Error(`Source window invalid: ${sourceCheck.errors.join(', ')}`);
  }
  const destCheck = GroupWindowEntity.validate(newDestWindow);
  if (!destCheck.valid) {
    throw new Error(`Destination window invalid: ${destCheck.errors.join(', ')}`);
  }

  const sourceUpdated = update(
    'eventGroupWindows', sourceWindow.id,
    { dateJoined: newDateJoined },
    GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
  );

  let destAdded;
  try {
    destAdded = add(
      'eventGroupWindows', newDestWindow,
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
    );
  } catch (err) {
    update(
      'eventGroupWindows', sourceWindow.id,
      { dateJoined: sourceWindow.dateJoined },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
    );
    throw err;
  }

  return { sourceUpdated, destAdded };
}

function openConfirmDialog({ groupName, destEvent, paddockName, gapStart, gapEnd, priorJoin, newJoin, onConfirm }) {
  const overlay = el('div', {
    id: 'retro-place-confirm',
    style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '320', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  });

  const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '440px', width: '90%' } });
  card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Confirm retro-place']));
  card.appendChild(el('p', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' } }, [
    `Place ${groupName} on Event #${destEvent.id.slice(0, 8)}, Paddock ${paddockName}, from ${gapStart} to ${gapEnd}.`,
  ]));
  card.appendChild(el('p', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '8px', color: 'var(--text2)' } }, [
    `Event #${destEvent.id.slice(0, 8)} stays closed with its original end date (${destEvent.dateOut}).`,
  ]));
  card.appendChild(el('p', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: 'var(--space-4)', color: 'var(--text2)' } }, [
    `${groupName}'s join date on the current event changes from ${priorJoin} to ${newJoin}.`,
  ]));

  card.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => overlay.remove(),
    }, ['Cancel']),
    el('button', {
      className: 'btn btn-green',
      onClick: () => { overlay.remove(); onConfirm(); },
    }, ['Confirm']),
  ]));

  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function openPaddockPicker(panel, candidates, onSelect) {
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '10px' } }, ['Pick a paddock']));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' } }, [
    'More than one paddock on the destination covers the gap. Pick which one the group was on.',
  ]));

  for (const pw of candidates) {
    const loc = getById('locations', pw.locationId);
    panel.appendChild(el('div', {
      style: { padding: '12px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '6px' },
      onClick: () => onSelect(pw),
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [loc?.name || '?']),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [`Open ${pw.dateOpened} \u2192 ${pw.dateClosed}`]),
    ]));
  }
}

/**
 * Open the retro-place flow.
 *
 * @param {object} ctx
 * @param {object} ctx.sourceEvent - the event the user is editing
 * @param {object} ctx.sourceWindow - the eventGroupWindow whose dateJoined was edited
 * @param {string} ctx.newDateJoined - the staged new date_joined on the source window
 * @param {string} ctx.gapStart - ISO date (the prior dateJoined value)
 * @param {string} ctx.gapEnd - ISO date (the new dateJoined value)
 * @param {string} ctx.operationId
 */
export function openRetroPlaceFlow(ctx) {
  const { sourceEvent, sourceWindow, newDateJoined, gapStart, gapEnd } = ctx;

  ensurePickerSheetDOM();
  if (!pickerSheet) pickerSheet = new Sheet('retro-place-picker-wrap');
  const panel = document.getElementById('retro-place-picker-panel');
  if (!panel) return;

  const allEvents = getAll('events');
  const candidates = computeCandidateEvents({ sourceEventId: sourceEvent.id, gapStart, gapEnd, allEvents });

  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));
  panel.appendChild(el('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '6px' } }, ['Move to existing event']));
  panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' } }, [
    `Pick the event the group was on from ${gapStart} to ${gapEnd}.`,
  ]));

  if (!candidates.length) {
    panel.appendChild(el('div', { className: 'form-hint', style: { padding: '14px', textAlign: 'center' } }, [
      'No closed event fully contains this gap. Pick a different gap resolution.',
    ]));
    panel.appendChild(el('button', {
      className: 'btn btn-outline',
      style: { marginTop: '10px', width: '100%' },
      onClick: () => pickerSheet.close(),
    }, ['Cancel']));
    pickerSheet.open();
    return;
  }

  const group = getById('groups', sourceWindow.groupId);
  const groupName = group?.name || 'Group';

  for (const evt of candidates) {
    const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === evt.id);
    const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === evt.id);
    const paddockNames = pws.map(pw => { const l = getById('locations', pw.locationId); return l?.name || '?'; }).join(', ');
    const groupChips = gws.map(gw => { const g = getById('groups', gw.groupId); return `${g?.name || '?'} (${gw.headCount})`; }).join(', ');

    panel.appendChild(el('div', {
      style: { padding: '12px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '8px' },
      onClick: () => handleEventPicked(evt, panel, ctx, groupName),
    }, [
      el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [`${evt.dateIn} \u2192 ${evt.dateOut}`]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [`\uD83D\uDCCD ${paddockNames || 'No paddocks'}`]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '2px' } }, [groupChips || 'No groups']),
    ]));
  }

  panel.appendChild(el('button', {
    className: 'btn btn-outline',
    style: { marginTop: '10px', width: '100%' },
    onClick: () => pickerSheet.close(),
  }, ['Cancel']));

  pickerSheet.open();
}

function handleEventPicked(destEvent, panel, ctx, groupName) {
  const { sourceWindow, newDateJoined, gapStart, gapEnd, operationId } = ctx;

  const allPaddocks = getAll('eventPaddockWindows');
  const candidatePaddocks = computeCandidatePaddocks({ destEventId: destEvent.id, gapStart, gapEnd, allPaddockWindows: allPaddocks });

  if (candidatePaddocks.length === 0) {
    showToast(`No paddock on Event #${destEvent.id.slice(0, 8)} covers the full gap. Pick a different event.`);
    return;
  }

  const proceedWithPaddock = (paddockWindow) => {
    const allGroupWindows = getAll('eventGroupWindows');
    const conflict = findConflictingWindow({
      destEventId: destEvent.id,
      groupId: sourceWindow.groupId,
      gapStart, gapEnd,
      allGroupWindows,
    });
    if (conflict) {
      pickerSheet.close();
      showToast(`${groupName} already has a window on Event #${destEvent.id.slice(0, 8)} from ${conflict.dateJoined} to ${conflict.dateLeft || 'now'}. This contradicts the gap you're trying to fill. Cancel this retro-place and review the existing window.`);
      return;
    }

    const loc = getById('locations', paddockWindow.locationId);
    const paddockName = loc?.name || '?';

    openConfirmDialog({
      groupName,
      destEvent,
      paddockName,
      gapStart, gapEnd,
      priorJoin: sourceWindow.dateJoined,
      newJoin: newDateJoined,
      onConfirm: () => {
        const newDestWindow = GroupWindowEntity.create({
          operationId,
          eventId: destEvent.id,
          groupId: sourceWindow.groupId,
          dateJoined: gapStart,
          dateLeft: gapEnd,
          headCount: sourceWindow.headCount,
          avgWeightKg: sourceWindow.avgWeightKg,
        });

        try {
          commitRetroPlace({ sourceWindow, newDateJoined, newDestWindow });
          pickerSheet.close();
        } catch (err) {
          showToast(`Could not save: ${err.message}`);
        }
      },
    });
  };

  if (candidatePaddocks.length === 1) {
    proceedWithPaddock(candidatePaddocks[0]);
  } else {
    openPaddockPicker(panel, candidatePaddocks, (pw) => proceedWithPaddock(pw));
  }
}
