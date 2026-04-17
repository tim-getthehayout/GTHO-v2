/** @file Feed Check Edit Dialog — SP-10 §9 (OI-0084).
 *
 * Per-item edit dialog. Edits one feed line's reading on a single feed check
 * (batch × location × event × check). Range guards + invariant check covering
 * the four cases (A benign / B later breaks / C earlier breaks / D back-fill)
 * from SP-10 §9.
 *
 * Re-snap dialog (Case B) is implemented inline: deletes the impossible later
 * check items + saves the edit in one sequence, then a non-modal toast invites
 * the farmer to enter a new check to re-snap the line.
 */

import { el, clear } from '../../ui/dom.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update, remove } from '../../data/store.js';
import { today, formatDate } from '../../utils/date-utils.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import { openFeedCheckSheet } from '../feed/check.js';

let editFcSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('edit-fc-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'edit-fc-wrap', style: { zIndex: '230' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => editFcSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'edit-fc-panel' }),
  ]));
}

function showToast(message, action) {
  const existing = document.querySelector('[data-testid="edit-fc-toast"]');
  if (existing) existing.remove();
  const children = [el('span', { style: { flex: '1' } }, [message])];
  if (action) {
    children.push(el('button', {
      style: { background: 'transparent', color: 'var(--bg)', border: '0.5px solid var(--bg)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit' },
      onClick: () => { document.querySelector('[data-testid="edit-fc-toast"]')?.remove(); action.handler(); },
    }, [action.label]));
  }
  const toast = el('div', {
    'data-testid': 'edit-fc-toast',
    style: { position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', zIndex: '400', maxWidth: '90%', display: 'flex', alignItems: 'center', gap: '10px' },
  }, children);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 6000);
}

/**
 * Resolve the effective date stored on a check, tolerating the legacy
 * `checkDate` field (the existing add dialog wrote to this name; entity field
 * is `date`). Falls back to createdAt's date portion.
 */
function checkDateOf(check) {
  return check.date || check.checkDate || (check.createdAt ? formatDate(check.createdAt) : null);
}

/**
 * Build the sorted feed-line sequence used for invariant checking.
 *
 * Pure: exported for testing.
 *
 * @param {object} args
 * @param {string} args.eventId
 * @param {string} args.batchId
 * @param {string} args.locationId
 * @param {Array}  args.allChecks - every event_feed_checks record
 * @param {Array}  args.allItems  - every event_feed_check_items record
 * @param {string} [args.editedItemId] - if provided, replace this item's remaining with stagedRemaining
 * @param {number} [args.stagedRemaining]
 * @param {string} [args.stagedDate] - if provided, use this date for the edited item's parent check
 * @param {object} [args.insertCheck] - { date, remaining } to insert (back-fill case D)
 * @returns {Array<{ itemId:string, checkId:string, date:string, time:string, remaining:number, isEdited:boolean }>}
 */
export function buildLineSequence({
  eventId, batchId, locationId,
  allChecks, allItems,
  editedItemId, stagedRemaining, stagedDate,
  insertCheck,
}) {
  const checksOnEvent = allChecks.filter(c => c.eventId === eventId);
  const checkById = new Map(checksOnEvent.map(c => [c.id, c]));
  const itemsOnLine = allItems.filter(i =>
    i.batchId === batchId &&
    i.locationId === locationId &&
    checkById.has(i.feedCheckId)
  );

  const seq = itemsOnLine.map(item => {
    const parent = checkById.get(item.feedCheckId);
    const isEdited = item.id === editedItemId;
    return {
      itemId: item.id,
      checkId: parent.id,
      date: isEdited && stagedDate ? stagedDate : checkDateOf(parent),
      time: parent.time || '',
      remaining: isEdited && stagedRemaining != null ? stagedRemaining : item.remainingQuantity,
      isEdited,
    };
  });

  if (insertCheck) {
    seq.push({
      itemId: '__insert__',
      checkId: '__insert__',
      date: insertCheck.date,
      time: insertCheck.time || '',
      remaining: insertCheck.remaining,
      isEdited: true,
    });
  }

  seq.sort((a, b) => {
    const cmpDate = (a.date || '').localeCompare(b.date || '');
    if (cmpDate !== 0) return cmpDate;
    return (a.time || '').localeCompare(b.time || '');
  });

  return seq;
}

/**
 * Compute consumed for each adjacent interval in a sequence.
 *
 * Pure: exported for testing.
 *
 * consumed(Ti → Ti+1) = remaining(Ti) + sum(deliveries) - sum(removals) - remaining(Ti+1)
 *
 * @param {object} args
 * @param {Array} args.sequence - from buildLineSequence
 * @param {Array} args.entries - event_feed_entries on this line (deliveries + removals)
 * @returns {Array<{ fromIdx:number, toIdx:number, consumed:number }>}
 */
export function computeIntervals({ sequence, entries }) {
  const intervals = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i];
    const b = sequence[i + 1];
    let deliveries = 0;
    let removals = 0;
    for (const e of entries) {
      if (!e.date) continue;
      if (e.date > a.date && e.date <= b.date) {
        if (e.entryType === 'removal') removals += e.quantity;
        else deliveries += e.quantity;
      }
    }
    intervals.push({
      fromIdx: i,
      toIdx: i + 1,
      consumed: a.remaining + deliveries - removals - b.remaining,
    });
  }
  return intervals;
}

/**
 * Classify the invariant outcome for the edited check.
 *
 * Pure: exported for testing.
 *
 * @param {object} args
 * @param {Array} args.sequence
 * @param {Array} args.intervals
 * @returns {{ caseLabel:'A'|'B'|'C', laterBreaks:Array, earlierBreaks:Array }}
 *
 * Case A: all intervals ≥ 0
 * Case B: any later-side interval (where the edited item is the "from" side or earlier) is < 0
 * Case C: only earlier-side intervals are broken
 */
export function classifyInvariant({ sequence, intervals }) {
  const editedIdx = sequence.findIndex(s => s.isEdited);
  const earlierBreaks = [];
  const laterBreaks = [];
  for (const iv of intervals) {
    if (iv.consumed >= 0) continue;
    // "later break" = the broken interval starts at the edited item or later
    // (i.e. the impossible check is to the RIGHT of the edited one).
    if (editedIdx !== -1 && iv.fromIdx >= editedIdx) {
      laterBreaks.push(iv);
    } else {
      earlierBreaks.push(iv);
    }
  }
  if (earlierBreaks.length === 0 && laterBreaks.length === 0) {
    return { caseLabel: 'A', laterBreaks, earlierBreaks };
  }
  if (laterBreaks.length > 0) return { caseLabel: 'B', laterBreaks, earlierBreaks };
  return { caseLabel: 'C', laterBreaks, earlierBreaks };
}

function openConflictDialog({ sequence, earlierBreaks, unit }) {
  const overlay = el('div', {
    style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '320', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  });
  const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '440px', width: '90%' } });
  card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['Edit conflicts with earlier check']));
  card.appendChild(el('p', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '8px' } }, [
    'This edit is inconsistent with an earlier feed check.',
  ]));
  for (const iv of earlierBreaks) {
    const earlier = sequence[iv.fromIdx];
    const later = sequence[iv.toIdx];
    card.appendChild(el('p', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' } }, [
      `Between ${earlier.date} (${earlier.remaining} ${unit}) and ${later.date} (${later.remaining} ${unit}) feed would have to appear from nowhere.`,
    ]));
  }
  card.appendChild(el('p', { style: { fontSize: '13px', marginTop: '10px', marginBottom: 'var(--space-4)' } }, [
    'One of the two checks is wrong. Review them and edit the right one.',
  ]));
  card.appendChild(el('button', {
    className: 'btn btn-outline',
    style: { width: '100%' },
    onClick: () => overlay.remove(),
  }, ['Cancel edit']));
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

function openResnapDialog({ sequence, laterBreaks, unit, onConfirm }) {
  const overlay = el('div', {
    style: { position: 'fixed', top: '0', left: '0', right: '0', bottom: '0', background: 'rgba(0,0,0,0.5)', zIndex: '320', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    onClick: (e) => { if (e.target === overlay) overlay.remove(); },
  });
  const card = el('div', { className: 'card', style: { padding: 'var(--space-5)', maxWidth: '460px', width: '90%' } });
  card.appendChild(el('h3', { style: { marginBottom: 'var(--space-3)' } }, ['This edit makes a later check impossible']));
  card.appendChild(el('p', { style: { fontSize: '13px', lineHeight: '1.6', marginBottom: '10px' } }, [
    'Saving this would mean feed appeared from nowhere on a later date.',
  ]));
  card.appendChild(el('p', { style: { fontSize: '13px', marginBottom: '6px' } }, [
    'To proceed, the following later check(s) will be deleted:',
  ]));
  const toDeleteIds = new Set();
  for (const iv of laterBreaks) {
    const later = sequence[iv.toIdx];
    toDeleteIds.add(later.itemId);
    card.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '4px' } }, [
      `\u2022 ${later.date} \u2014 ${later.remaining} ${unit}`,
    ]));
  }
  card.appendChild(el('p', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '10px', marginBottom: 'var(--space-4)' } }, [
    'After saving, enter a new feed check to re-measure what\'s actually there now.',
  ]));
  card.appendChild(el('div', { className: 'btn-row' }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => overlay.remove(),
    }, ['Cancel edit']),
    el('button', {
      className: 'btn btn-green',
      onClick: () => { overlay.remove(); onConfirm(Array.from(toDeleteIds)); },
    }, ['Delete later checks and save']),
  ]));
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/**
 * Apply an edited remaining + (optionally) edited parent date/time/notes,
 * plus delete the given later check items if any. Pre-validates everything
 * before any mutation; on a sync failure the whole batch is best-effort.
 *
 * Pure: exported for testing.
 *
 * @returns {{ deletedItemIds:Array<string>, deletedCheckIds:Array<string> }}
 */
export function commitFeedCheckEdit({
  check, item,
  newDate, newTime, newNotes, newRemaining,
  deleteItemIds = [],
  allChecks, allItems,
}) {
  const stagedItem = { ...item, remainingQuantity: newRemaining };
  const itemCheck = FeedCheckItemEntity.validate(stagedItem);
  if (!itemCheck.valid) {
    throw new Error(`Item invalid: ${itemCheck.errors.join(', ')}`);
  }

  const checkChanged = newDate !== checkDateOf(check) || (newTime || '') !== (check.time || '') || (newNotes || '') !== (check.notes || '');
  if (checkChanged) {
    const stagedCheck = { ...check, date: newDate, time: newTime || null, notes: newNotes || null };
    const ck = FeedCheckEntity.validate(stagedCheck);
    if (!ck.valid) {
      throw new Error(`Check invalid: ${ck.errors.join(', ')}`);
    }
  }

  update(
    'eventFeedCheckItems', item.id,
    { remainingQuantity: newRemaining },
    FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items'
  );

  if (checkChanged) {
    update(
      'eventFeedChecks', check.id,
      { date: newDate, time: newTime || null, notes: newNotes || null },
      FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks'
    );
  }

  const deletedItemIds = [];
  const deletedCheckIds = [];
  const checkById = new Map(allChecks.map(c => [c.id, c]));
  const itemsByParent = new Map();
  for (const i of allItems) {
    if (!itemsByParent.has(i.feedCheckId)) itemsByParent.set(i.feedCheckId, []);
    itemsByParent.get(i.feedCheckId).push(i);
  }

  for (const id of deleteItemIds) {
    const target = allItems.find(i => i.id === id);
    if (!target) continue;
    remove('eventFeedCheckItems', id, 'event_feed_check_items');
    deletedItemIds.push(id);

    const siblings = (itemsByParent.get(target.feedCheckId) || []).filter(i => i.id !== id && !deleteItemIds.includes(i.id));
    if (siblings.length === 0 && checkById.has(target.feedCheckId)) {
      remove('eventFeedChecks', target.feedCheckId, 'event_feed_checks');
      deletedCheckIds.push(target.feedCheckId);
    }
  }

  return { deletedItemIds, deletedCheckIds };
}

/**
 * Open the per-item Feed Check Edit dialog.
 *
 * @param {object} check - event_feed_checks record (parent: date/time/notes)
 * @param {object} item  - event_feed_check_items record (child: batch/location/remainingQuantity)
 * @param {object} event - parent event
 * @param {string} operationId
 */
export function openEditFeedCheckDialog(check, item, event, operationId) {
  ensureSheetDOM();
  if (!editFcSheet) editFcSheet = new Sheet('edit-fc-wrap');
  const panel = document.getElementById('edit-fc-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const batch = getById('batches', item.batchId);
  const loc = getById('locations', item.locationId);
  const unit = batch?.unit || 'units';

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Edit feed check']));
  panel.appendChild(el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } }, [
    el('span', { style: { fontSize: '11px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '3px 8px', color: 'var(--text2)' } }, [batch?.name || '?']),
    el('span', { style: { fontSize: '11px', background: 'var(--bg2)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '3px 8px', color: 'var(--text2)' } }, [loc?.name || '?']),
  ]));

  const initialDate = checkDateOf(check) || today();
  const dateInput = el('input', { type: 'date', value: initialDate });
  const timeInput = el('input', { type: 'time', value: check.time || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  const remainingInput = el('input', { type: 'number', min: '0', step: '0.01', value: String(item.remainingQuantity ?? 0) });
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, [`Remaining (${unit})`]),
    remainingInput,
  ]));

  const notesInput = el('input', { type: 'text', value: check.notes || '' });
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]),
    notesInput,
  ]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  function attemptSave() {
    clear(statusEl);
    const newDate = dateInput.value;
    const newTime = timeInput.value || null;
    const newNotes = notesInput.value || null;
    const newRemaining = parseFloat(remainingInput.value);

    if (!newDate) { statusEl.appendChild(el('span', {}, ['Date is required'])); return; }
    if (newDate < event.dateIn) { statusEl.appendChild(el('span', {}, ['Feed check date must be on or after the event start date.'])); return; }
    if (event.dateOut && newDate > event.dateOut) { statusEl.appendChild(el('span', {}, ['Feed check date must be on or before the event end date.'])); return; }
    if (newDate > today()) { statusEl.appendChild(el('span', {}, ["Feed check date can't be in the future."])); return; }
    if (isNaN(newRemaining) || newRemaining < 0) { statusEl.appendChild(el('span', {}, ["Remaining amount can't be negative."])); return; }

    const allChecks = getAll('eventFeedChecks');
    const allItems = getAll('eventFeedCheckItems');
    const allEntries = getAll('eventFeedEntries').filter(e =>
      e.eventId === event.id && e.batchId === item.batchId && e.locationId === item.locationId
    );

    const sequence = buildLineSequence({
      eventId: event.id,
      batchId: item.batchId,
      locationId: item.locationId,
      allChecks, allItems,
      editedItemId: item.id,
      stagedRemaining: newRemaining,
      stagedDate: newDate,
    });
    const intervals = computeIntervals({ sequence, entries: allEntries });
    const verdict = classifyInvariant({ sequence, intervals });

    if (verdict.caseLabel === 'A') {
      try {
        commitFeedCheckEdit({
          check, item,
          newDate, newTime, newNotes, newRemaining,
          deleteItemIds: [],
          allChecks, allItems,
        });
        editFcSheet.close();
      } catch (err) {
        statusEl.appendChild(el('span', {}, [err.message]));
      }
      return;
    }

    if (verdict.caseLabel === 'C') {
      openConflictDialog({ sequence, earlierBreaks: verdict.earlierBreaks, unit });
      return;
    }

    openResnapDialog({
      sequence, laterBreaks: verdict.laterBreaks, unit,
      onConfirm: (toDeleteIds) => {
        try {
          commitFeedCheckEdit({
            check, item,
            newDate, newTime, newNotes, newRemaining,
            deleteItemIds: toDeleteIds,
            allChecks, allItems,
          });
          editFcSheet.close();
          showToast('Enter a new feed check to re-snap the line \u2192', {
            label: 'Feed check',
            handler: () => openFeedCheckSheet(event, operationId),
          });
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    });
  }

  function attemptDelete() {
    const dateLbl = checkDateOf(check) || '?';
    const remLbl = `${item.remainingQuantity} ${unit}`;
    const batchLbl = batch?.name || '?';
    const locLbl = loc?.name || '?';
    if (!window.confirm(`Delete this feed check? ${batchLbl} \u2192 ${locLbl}, ${remLbl} on ${dateLbl}.`)) return;

    remove('eventFeedCheckItems', item.id, 'event_feed_check_items');
    const siblings = getAll('eventFeedCheckItems').filter(i => i.feedCheckId === check.id && i.id !== item.id);
    if (siblings.length === 0) {
      remove('eventFeedChecks', check.id, 'event_feed_checks');
    }
    editFcSheet.close();
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', { className: 'btn btn-green', onClick: attemptSave }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => editFcSheet.close() }, ['Cancel']),
  ]));

  panel.appendChild(el('div', { style: { marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border)' } }, [
    el('button', {
      className: 'btn btn-outline btn-sm',
      style: { color: 'var(--red)', borderColor: 'var(--red)', width: '100%' },
      onClick: attemptDelete,
    }, ['Delete']),
  ]));

  editFcSheet.open();
}
