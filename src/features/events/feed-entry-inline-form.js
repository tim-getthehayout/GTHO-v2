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
import { getAll, getById, add, update, remove, runDurableWrite } from '../../data/store.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import { balancesFor, availableDeliveryStock, exceedsAvailableStock, deductDelivery, applyRemainingDelta } from '../feed/batch-balances.js';
import { t } from '../../i18n/i18n.js';
import { isCalendarDate } from '../../utils/form-values.js';

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
    date: clampDateToEvent(getLocalTodayStr(), event),
    lines: [],
    error: null,
  };
}

export function openEditMode(entry) {
  state = {
    mode: 'edit',
    editingEntryId: entry.id,
    date: entry.date,
    lines: [{ batchId: entry.batchId, qty: entry.quantity, ...(entry.sourceLocationId ? { sourceLocationId: entry.sourceLocationId } : {}) }],
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
  if (!isCalendarDate(date)) {
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
    const oldQty = editingEntry?.batchId === line.batchId ? editingEntry.quantity ?? 0 : 0;
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
function validRecord(record) {
  const result = FeedEntryEntity.validate(record);
  if (!result.valid) throw new Error(result.errors.join(', '));
}
function coherent(batchId) {
  const batch = getById('batches', batchId), rows = balancesFor(batchId);
  if (rows.length && Math.abs(rows.reduce((sum, row) => sum + Number(row.quantity), 0) - Number(batch?.remaining)) > 1e-9) throw new Error(t('manualEntry.stockAssessment'));
}
function reversible(entry) {
  coherent(entry.batchId);
  if (entry.entryType === 'removal' || entry.sourceEventId) throw new Error(t('manualEntry.unsupportedFeed'));
  const rows = balancesFor(entry.batchId);
  if (rows.length && !rows.some(row => row.locationId === entry.sourceLocationId)) throw new Error(t('manualEntry.missingSource'));
  if (!getById('batches', entry.batchId)) throw new Error(t('manualEntry.missingSource'));
}
function preflight(entries, previous = null) {
  if (previous) reversible(previous);
  const requested = new Map();
  for (const entry of entries) {
    validRecord(entry);
    coherent(entry.batchId);
    const stock = availableDeliveryStock(entry.batchId, entry.sourceLocationId);
    // An exhausted source can be reused when this edit first restores its old feed.
    const same = previous && previous.batchId === entry.batchId && previous.sourceLocationId === entry.sourceLocationId;
    const row = balancesFor(entry.batchId).find(value => value.locationId === entry.sourceLocationId);
    const available = stock.status === 'ok' ? stock.available : same && row ? Number(row.quantity) : null;
    if (available == null) throw new Error(t('manualEntry.chooseSource'));
    const pool = stock.poolKey || `${entry.batchId}\0${entry.sourceLocationId}`;
    const total = (requested.get(pool) || 0) + entry.quantity;
    const credit = same ? previous.quantity : 0;
    if (exceedsAvailableStock(total, available + credit)) throw new Error(t('manualEntry.stock'));
    requested.set(pool, total);
  }
}
const atomic = (operationId, work) => runDurableWrite(JSON.stringify([operationId, 'manual-feed', crypto.randomUUID(), 1]), work);

export function commitAdd({ operationId, event, locationId, date, lines }) {
  if (lines.some(line => !Number.isFinite(Number(line.qty)) || Number(line.qty) < 0)) throw new Error(t('manualEntry.invalidNumber'));
  const entries = lines.filter(line => Number(line.qty) > 0).map(line => FeedEntryEntity.create({
    operationId, eventId: event.id, locationId, date,
    batchId: line.batchId, sourceLocationId: line.sourceLocationId || null, quantity: Number(line.qty),
  }));
  preflight(entries);
  atomic(operationId, () => {
    for (const entry of entries) {
      const error = deductDelivery(entry.batchId, entry.sourceLocationId, entry.quantity);
      if (error) throw new Error(t('manualEntry.stock'));
      add('eventFeedEntries', entry, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    }
    return entries[0]?.id;
  });
  return entries;
}

export function commitEdit({ entry, newDate, newQty, newBatchId = entry.batchId, newSourceLocationId = entry.sourceLocationId }) {
  const next = { ...entry, date: newDate, quantity: Number(newQty), batchId: newBatchId, sourceLocationId: newSourceLocationId || null };
  validRecord(next);
  // A date-only change to legacy data does not invent a stock location.
  const inventoryChanged = next.quantity !== entry.quantity || next.batchId !== entry.batchId || next.sourceLocationId !== (entry.sourceLocationId || null);
  if (inventoryChanged) preflight([next], entry);
  atomic(entry.operationId, () => {
    if (inventoryChanged) {
      if (applyRemainingDelta(entry.batchId, entry.sourceLocationId, entry.quantity)) throw new Error(t('manualEntry.missingSource'));
      if (deductDelivery(next.batchId, next.sourceLocationId, next.quantity)) throw new Error(t('manualEntry.stock'));
    }
    update('eventFeedEntries', entry.id, next, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    return entry.id;
  });
}

export function commitDelete(entry) {
  reversible(entry);
  atomic(entry.operationId, () => {
    if (applyRemainingDelta(entry.batchId, entry.sourceLocationId, entry.quantity)) throw new Error(t('manualEntry.missingSource'));
    remove('eventFeedEntries', entry.id, 'event_feed_entries');
    return entry.id;
  });
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
    value: state.date || getLocalTodayStr(),
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
    const line = state.lines[0];
    wrap.appendChild(el('select', { 'data-testid': 'feed-form-batch', value: line.batchId, onChange: e => {
      line.batchId = e.target.value; line.sourceLocationId = null; rerender();
    } }, activeBatches.map(batch => el('option', { value: batch.id, selected: batch.id === line.batchId }, [batch.name]))));
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
    const holdings = balancesFor(b.id);
    if (holdings.length) wrap.appendChild(el('select', {
      'data-testid': `feed-form-source-${b.id}`,
      onChange: e => { line.sourceLocationId = e.target.value || null; },
    }, [el('option', { value: '' }, [t('manualEntry.chooseSource')]), ...holdings.map(row => el('option', {
      value: row.locationId, selected: row.locationId === line.sourceLocationId,
    }, [getById('locations', row.locationId)?.name || '?']))]));
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
  const todayStr = getLocalTodayStr();

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
        newBatchId: state.lines[0].batchId,
        newSourceLocationId: state.lines[0].sourceLocationId || null,
        batches,
      });
    } else {
      const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === event.id && !pw.dateClosed).sort((a, b) => `${b.dateOpened}T${b.timeOpened || '00:00'}`.localeCompare(`${a.dateOpened}T${a.timeOpened || '00:00'}`));
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
