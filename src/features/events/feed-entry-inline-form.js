/** @file Inline §8 Feed Entries Add/Edit form — OI-0085 (v1 parity).
 *
 * Renders inside the Edit Event dialog under the §8 list. Module-level state
 * survives subscriber-triggered re-renders, so the form stays open across
 * unrelated store mutations.
 *
 * Two modes:
 * - add: tap-to-toggle batch selector; multi-batch save creates N event_feed_entries rows
 *   sharing the same date.
 * - edit: batch is locked to the entry's batch; only date + qty editable.
 *   Save updates the row + adjusts batch.remaining by the delta.
 *
 * OI-0117 note on `event.dateIn` reads below: `events.date_in` was dropped
 * from Supabase in migration 028. These pure validators accept an event-like
 * object `{ dateIn, dateOut }` — callers must supply `dateIn` as the DERIVED
 * event start (from `getEventStart()` / `getEventStartDate()`), not a stored
 * column. The field name is retained for ergonomic consistency across the
 * form surface; the value provenance changed.
 */

import { el, clear } from '../../ui/dom.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { today } from '../../utils/date-utils.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as BatchEntity from '../../entities/batch.js';

// ─── Module-level form state ────────────────────────────────────────────────

let state = {
  mode: null, // null | 'add' | 'edit'
  editingEntryId: null,
  date: null,
  lines: [], // [{ batchId, qty }]
  error: null,
};

export function getFormState() {
  return { ...state, lines: state.lines.map(l => ({ ...l })) };
}

export function isFormOpen() {
  return state.mode !== null;
}

/** Reset to a closed form. Exported for tests. */
export function closeForm() {
  state = { mode: null, editingEntryId: null, date: null, lines: [], error: null };
}

/**
 * Compute the default date for a new entry, clamped to the event window.
 * Pure: exported for testing.
 */
export function clampDateToEvent(date, event) {
  if (event.dateIn && date < event.dateIn) return event.dateIn;
  if (event.dateOut && date > event.dateOut) return event.dateOut;
  return date;
}

export function openAddMode(event) {
  state = {
    mode: 'add',
    editingEntryId: null,
    date: clampDateToEvent(today(), event),
    lines: [],
    error: null,
  };
}

export function openEditMode(entry) {
  state = {
    mode: 'edit',
    editingEntryId: entry.id,
    date: entry.date,
    lines: [{ batchId: entry.batchId, qty: entry.quantity }],
    error: null,
  };
}

// ─── Pure validation ────────────────────────────────────────────────────────

/**
 * Validate a save attempt against SP-10 §8 guards.
 *
 * Pure: exported for testing.
 *
 * @param {object} args
 * @param {object} args.event
 * @param {string} args.date
 * @param {Array<{batchId, qty}>} args.lines  - lines with qty > 0 (filter beforehand if needed)
 * @param {'add'|'edit'} args.mode
 * @param {object|null} args.editingEntry - existing entry record when mode==='edit'
 * @param {Array} args.batches            - all batch records
 * @param {string} args.todayStr          - today as YYYY-MM-DD
 * @returns {{ valid:boolean, error:string|null }}
 */
export function validateFeedEntryForm({ event, date, lines, mode, editingEntry, batches, todayStr }) {
  const positiveLines = lines.filter(l => Number(l.qty) > 0);
  if (positiveLines.length === 0) {
    return { valid: false, error: 'Quantity must be greater than zero. To remove feed from this event, use the Move feed out action.' };
  }
  if (!date) {
    return { valid: false, error: 'Date is required.' };
  }
  if (event.dateIn && date < event.dateIn) {
    return { valid: false, error: 'Feed entry date must be on or after the event start date.' };
  }
  if (event.dateOut && date > event.dateOut) {
    return { valid: false, error: 'Feed entry date must be on or before the event end date.' };
  }
  if (date > todayStr) {
    return { valid: false, error: "Feed entry date can't be in the future." };
  }
  for (const line of positiveLines) {
    if (Number(line.qty) <= 0) {
      return { valid: false, error: 'Quantity must be greater than zero. To remove feed from this event, use the Move feed out action.' };
    }
  }
  if (mode === 'edit') {
    const line = positiveLines[0];
    const batch = batches.find(b => b.id === line.batchId);
    if (!batch) return { valid: false, error: 'Batch not found.' };
    const oldQty = editingEntry?.quantity ?? 0;
    const ceiling = (batch.remaining ?? 0) + oldQty;
    if (line.qty > ceiling) {
      return { valid: false, error: `Not enough inventory. Batch has ${ceiling.toFixed(1)} ${batch.unit} available.` };
    }
  }
  return { valid: true, error: null };
}

// ─── Save commits ───────────────────────────────────────────────────────────

/**
 * Add mode commit. Creates one event_feed_entries row per line with qty > 0
 * and decrements each batch's remaining.
 *
 * @returns {Array<object>} the created entry records
 */
export function commitAdd({ operationId, event, locationId, date, lines, batches }) {
  const created = [];
  const positive = lines.filter(l => Number(l.qty) > 0);
  for (const line of positive) {
    const batch = batches.find(b => b.id === line.batchId);
    const entry = FeedEntryEntity.create({
      operationId,
      eventId: event.id,
      batchId: line.batchId,
      locationId,
      date,
      quantity: Number(line.qty),
    });
    add('eventFeedEntries', entry, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    if (batch) {
      const newRemaining = Math.max(0, (batch.remaining ?? 0) - Number(line.qty));
      update('batches', batch.id, { remaining: newRemaining }, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    }
    created.push(entry);
  }
  return created;
}

/**
 * Edit mode commit. Updates one entry's date + quantity and adjusts the
 * batch's remaining by the delta (oldQty - newQty).
 */
export function commitEdit({ entry, newDate, newQty, batches }) {
  const oldQty = entry.quantity ?? 0;
  const delta = oldQty - Number(newQty); // positive = freeing inventory; negative = consuming more
  update(
    'eventFeedEntries', entry.id,
    { date: newDate, quantity: Number(newQty) },
    FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries'
  );
  const batch = batches.find(b => b.id === entry.batchId);
  if (batch) {
    const newRemaining = Math.max(0, (batch.remaining ?? 0) + delta);
    update('batches', batch.id, { remaining: newRemaining }, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  }
}

// ─── Render ─────────────────────────────────────────────────────────────────

/**
 * Render the inline form into the given container.
 * No-op if formState.mode is null (caller should clear container first).
 *
 * @param {HTMLElement} container - the form's mount point (cleared by caller)
 * @param {object} ctx - { event, operationId, onAfterSave, onAfterCancel }
 */
export function renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel }) {
  if (!isFormOpen()) return;

  const isEdit = state.mode === 'edit';
  const allBatches = getAll('batches');
  const activeBatches = allBatches.filter(b => !b.archived);

  const card = el('div', { className: 'card-inset', style: { marginBottom: '10px' } });

  // Date field
  const dateInput = el('input', {
    type: 'date',
    value: state.date || today(),
    onChange: (e) => { state.date = e.target.value; },
  });
  card.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Date']),
    dateInput,
  ]));

  // Batch selector — locked in edit mode (single fixed line)
  card.appendChild(buildBatchSelector(activeBatches, isEdit, () => renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel })));

  // Per-selected-batch qty stepper
  card.appendChild(buildQtyStepperRows(activeBatches, () => renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel })));

  // Inline error
  if (state.error) {
    card.appendChild(el('div', {
      className: 'auth-error',
      style: { marginTop: '6px' },
    }, [el('span', {}, [state.error])]));
  }

  // Action row
  card.appendChild(el('div', { className: 'btn-row', style: { marginTop: '10px' } }, [
    el('button', {
      className: 'btn btn-green btn-xs',
      'data-testid': 'feed-form-save',
      onClick: () => handleSave(event, operationId, container, { onAfterSave, onAfterCancel }),
    }, [isEdit ? 'Save changes' : 'Add to event']),
    el('button', {
      className: 'btn btn-outline btn-xs',
      onClick: () => {
        closeForm();
        clear(container);
        if (onAfterCancel) onAfterCancel();
      },
    }, ['Cancel']),
  ]));

  clear(container);
  container.appendChild(card);
}

function buildBatchSelector(activeBatches, isEdit, rerender) {
  const wrap = el('div', { style: { marginBottom: '8px' } });

  if (isEdit) {
    // Locked: show only the selected batch as a non-toggleable card
    const lockedLine = state.lines[0];
    const lockedBatch = activeBatches.find(b => b.id === lockedLine?.batchId);
    if (lockedBatch) {
      wrap.appendChild(el('div', {
        className: 'batch-sel on',
        style: { cursor: 'default', opacity: '0.85' },
      }, [
        el('div', {}, [
          el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [lockedBatch.name]),
          el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
            `${(lockedBatch.remaining ?? 0).toFixed(1)} ${lockedBatch.unit}s remaining \u00B7 batch locked in edit mode`,
          ]),
        ]),
        el('div', { className: 'chk' }, [el('span', { style: { color: 'white', fontSize: '14px' } }, ['\u2713'])]),
      ]));
    }
    return wrap;
  }

  for (const b of activeBatches) {
    const on = state.lines.find(l => l.batchId === b.id);
    wrap.appendChild(el('div', {
      className: `batch-sel${on ? ' on' : ''}`,
      style: { marginBottom: '4px' },
      onClick: () => {
        const idx = state.lines.findIndex(l => l.batchId === b.id);
        if (idx === -1) {
          state.lines.push({ batchId: b.id, qty: 0 });
        } else {
          state.lines.splice(idx, 1);
        }
        rerender();
      },
    }, [
      el('div', {}, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [b.name]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [
          `${(b.remaining ?? 0).toFixed(1)} ${b.unit}s remaining`,
        ]),
      ]),
      el('div', { className: 'chk' }, on ? [el('span', { style: { color: 'white', fontSize: '14px' } }, ['\u2713'])] : []),
    ]));
  }
  return wrap;
}

function buildQtyStepperRows(activeBatches, rerender) {
  const wrap = el('div', {});
  for (let i = 0; i < state.lines.length; i++) {
    const line = state.lines[i];
    const b = activeBatches.find(x => x.id === line.batchId);
    if (!b) continue;
    const qtyInput = el('input', {
      type: 'number',
      step: '0.5',
      min: '0',
      value: String(line.qty),
      className: 'qty-val',
      style: { minWidth: '60px', padding: '4px 6px', border: '0.5px solid var(--border2)', borderRadius: '6px', textAlign: 'center', fontFamily: 'inherit' },
      onInput: (e) => {
        const v = parseFloat(e.target.value);
        line.qty = isNaN(v) ? 0 : v;
      },
    });
    wrap.appendChild(el('div', {
      style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' },
    }, [
      el('div', { style: { flex: '1', fontSize: '14px', fontWeight: '500' } }, [
        b.name,
        el('span', { style: { fontSize: '11px', color: 'var(--text2)', marginLeft: '4px' } }, [` ${b.unit}s`]),
      ]),
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
        el('button', {
          className: 'qty-btn',
          type: 'button',
          onClick: () => { line.qty = Math.max(0, Math.round((line.qty - 0.5) * 10) / 10); rerender(); },
        }, ['\u2212']),
        qtyInput,
        el('button', {
          className: 'qty-btn',
          type: 'button',
          onClick: () => { line.qty = Math.round((line.qty + 0.5) * 10) / 10; rerender(); },
        }, ['+']),
      ]),
    ]));
  }
  return wrap;
}

function handleSave(event, operationId, container, { onAfterSave }) {
  const batches = getAll('batches');
  const todayStr = today();

  // Read current date input live in case it wasn't onChange-fired
  const dateEl = container.querySelector('input[type="date"]');
  if (dateEl) state.date = dateEl.value;

  const verdict = validateFeedEntryForm({
    event,
    date: state.date,
    lines: state.lines,
    mode: state.mode,
    editingEntry: state.mode === 'edit' ? getById('eventFeedEntries', state.editingEntryId) : null,
    batches,
    todayStr,
  });

  if (!verdict.valid) {
    state.error = verdict.error;
    renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel: null });
    return;
  }

  try {
    if (state.mode === 'edit') {
      const existing = getById('eventFeedEntries', state.editingEntryId);
      if (!existing) {
        state.error = 'Entry no longer exists.';
        renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel: null });
        return;
      }
      commitEdit({
        entry: existing,
        newDate: state.date,
        newQty: state.lines[0].qty,
        batches,
      });
    } else {
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id && !pw.dateClosed);
      const locationId = pws[0]?.locationId || null;
      if (!locationId) {
        state.error = 'No open paddock on this event to attribute the feed entry to.';
        renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel: null });
        return;
      }
      commitAdd({
        operationId,
        event,
        locationId,
        date: state.date,
        lines: state.lines,
        batches,
      });
    }
  } catch (err) {
    state.error = err.message;
    renderInlineFeedForm(container, { event, operationId, onAfterSave, onAfterCancel: null });
    return;
  }

  closeForm();
  clear(container);
  if (onAfterSave) onAfterSave();
}
