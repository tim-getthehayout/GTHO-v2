/** @file Move Feed Out sheet — SP-10 §8a. Four-step flow: state → check → amount+dest → confirm. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display } from '../../utils/units.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import * as BatchEntity from '../../entities/batch.js';

let moveFeedSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('move-feed-out-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'move-feed-out-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => moveFeedSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'move-feed-out-panel', style: { maxHeight: '90vh', overflowY: 'auto' } }),
  ]));
}

/**
 * Open the Move Feed Out sheet.
 * @param {object} event — source event
 * @param {string} operationId
 * @param {string} farmId
 * @param {object} [opts] — { preselectBatchId, preselectLocationId }
 */
export function openMoveFeedOutSheet(event, operationId, _farmId, opts = {}) {
  ensureSheetDOM();
  if (!moveFeedSheet) moveFeedSheet = new Sheet('move-feed-out-wrap');
  const panel = document.getElementById('move-feed-out-panel');
  if (!panel) return;

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Aggregate feed lines: batch × location
  const entries = getAll('eventFeedEntries').filter(fe => fe.eventId === event.id);
  const batches = getAll('batches');
  const batchMap = new Map(batches.map(b => [b.id, b]));
  const locations = getAll('locations');
  const locMap = new Map(locations.map(l => [l.id, l]));

  // Group by batch+location
  const lines = {};
  for (const fe of entries) {
    const key = `${fe.batchId}|${fe.locationId}`;
    if (!lines[key]) lines[key] = { batchId: fe.batchId, locationId: fe.locationId, delivered: 0, removed: 0 };
    if (fe.entryType === 'removal') lines[key].removed += fe.quantity;
    else lines[key].delivered += fe.quantity;
  }
  const feedLines = Object.values(lines).map(l => ({
    ...l,
    netRemaining: l.delivered - l.removed,
    batch: batchMap.get(l.batchId),
    location: locMap.get(l.locationId),
  })).filter(l => l.netRemaining > 0);

  // State
  const selected = new Set();
  const confirmedRemaining = {};
  const moveAmounts = {};
  let destType = 'batch'; // 'batch' | 'event'
  let destEventId = null;
  let destLocationId = null;

  // Pre-select if provided
  if (opts.preselectBatchId && opts.preselectLocationId) {
    const key = `${opts.preselectBatchId}|${opts.preselectLocationId}`;
    const line = feedLines.find(l => `${l.batchId}|${l.locationId}` === key);
    if (line) selected.add(key);
  }

  renderStep1();

  function renderStep1() {
    clear(panel);
    panel.appendChild(el('div', { className: 'sheet-handle' }));
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Move feed out']));
    panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, ['Select feed lines to move out of this event.']));

    if (!feedLines.length) {
      panel.appendChild(el('div', { className: 'empty' }, ['No remaining feed to move.']));
      panel.appendChild(el('button', { className: 'btn btn-outline', onClick: () => moveFeedSheet.close() }, ['Close']));
      moveFeedSheet.open();
      return;
    }

    for (const line of feedLines) {
      const key = `${line.batchId}|${line.locationId}`;
      const isSelected = selected.has(key);
      const batchName = line.batch?.name || '?';
      const locName = line.location?.name || '?';
      const unit = line.batch?.unit || 'units';

      panel.appendChild(el('div', {
        style: { padding: '10px 12px', background: isSelected ? 'var(--green-l)' : 'var(--bg2)', border: `0.5px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius)', cursor: 'pointer', marginBottom: '6px' },
        onClick: () => { if (isSelected) selected.delete(key); else selected.add(key); renderStep1(); },
      }, [
        el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [`${batchName} \u2192 ${locName}`]),
        el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [`${line.netRemaining} ${unit} remaining`]),
      ]));
    }

    panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
      el('button', { className: 'btn btn-green', disabled: !selected.size, onClick: () => renderStep2() }, ['Next']),
      el('button', { className: 'btn btn-outline', onClick: () => moveFeedSheet.close() }, ['Cancel']),
    ]));

    moveFeedSheet.open();
  }

  function renderStep2() {
    clear(panel);
    panel.appendChild(el('div', { className: 'sheet-handle' }));
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Confirm current remaining']));
    panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, ['Confirm what\'s currently there before moving it. This becomes a feed check on today\'s date when you confirm.']));

    for (const key of selected) {
      const line = feedLines.find(l => `${l.batchId}|${l.locationId}` === key);
      if (!line) continue;
      const batchName = line.batch?.name || '?';
      const unit = line.batch?.unit || 'units';
      const input = el('input', { type: 'number', min: '0', step: '0.01', value: line.netRemaining, style: { width: '100px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', fontWeight: '600', textAlign: 'center' } });
      input.addEventListener('change', () => { confirmedRemaining[key] = parseFloat(input.value) || 0; });
      confirmedRemaining[key] = line.netRemaining;

      panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)' } }, [
        el('div', { style: { fontSize: '13px' } }, [`${batchName}: remaining ${unit}`]),
        input,
      ]));
    }

    panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
      el('button', { className: 'btn btn-green', onClick: () => renderStep3() }, ['Next']),
      el('button', { className: 'btn btn-outline', onClick: () => renderStep1() }, ['Back']),
    ]));
  }

  function renderStep3() {
    clear(panel);
    panel.appendChild(el('div', { className: 'sheet-handle' }));
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Amount and destination']));

    for (const key of selected) {
      const line = feedLines.find(l => `${l.batchId}|${l.locationId}` === key);
      if (!line) continue;
      const remaining = confirmedRemaining[key] || 0;
      const unit = line.batch?.unit || 'units';
      const input = el('input', { type: 'number', min: '0.1', max: String(remaining), step: '0.1', value: remaining, style: { width: '100px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', textAlign: 'center' } });
      input.addEventListener('change', () => { moveAmounts[key] = parseFloat(input.value) || 0; });
      moveAmounts[key] = remaining;

      panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: '13px' } }, [
        el('span', {}, [`${line.batch?.name || '?'}: move ${unit}`]),
        input,
      ]));
    }

    // Destination picker
    panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginTop: '14px', marginBottom: '8px' } }, ['Destination']));
    const destSelect = el('select', { className: 'auth-select' }, [
      el('option', { value: 'batch' }, ['Back to inventory']),
      el('option', { value: 'event' }, ['Existing open event']),
    ]);
    destSelect.addEventListener('change', () => { destType = destSelect.value; renderDestDetails(); });
    panel.appendChild(el('div', { className: 'field' }, [destSelect]));

    const destDetailsEl = el('div');
    panel.appendChild(destDetailsEl);

    function renderDestDetails() {
      clear(destDetailsEl);
      if (destType === 'event') {
        const openEvents = getAll('events').filter(e => !e.dateOut && e.id !== event.id);
        const evtSelect = el('select', { className: 'auth-select' }, [
          el('option', { value: '' }, ['\u2014 pick event \u2014']),
          ...openEvents.map(e => {
            const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === e.id && !pw.dateClosed);
            const locName = pws[0] ? (locMap.get(pws[0].locationId)?.name || '?') : '?';
            return el('option', { value: e.id }, [locName]);
          }),
        ]);
        evtSelect.addEventListener('change', () => { destEventId = evtSelect.value || null; });
        destDetailsEl.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Event']), evtSelect]));
      }
    }
    renderDestDetails();

    const statusEl = el('div', { className: 'auth-error' });
    panel.appendChild(statusEl);

    panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
      el('button', { className: 'btn btn-green', onClick: () => {
        clear(statusEl);
        // Validate
        for (const key of selected) {
          const amt = moveAmounts[key] || 0;
          const rem = confirmedRemaining[key] || 0;
          if (amt > rem) { statusEl.appendChild(el('span', {}, ['Move amount exceeds remaining'])); return; }
          if (amt <= 0) { statusEl.appendChild(el('span', {}, ['Move amount must be > 0'])); return; }
        }
        if (destType === 'event' && !destEventId) { statusEl.appendChild(el('span', {}, ['Select a destination event'])); return; }
        renderStep4();
      } }, ['Next']),
      el('button', { className: 'btn btn-outline', onClick: () => renderStep2() }, ['Back']),
    ]));
  }

  function renderStep4() {
    clear(panel);
    panel.appendChild(el('div', { className: 'sheet-handle' }));
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '10px' } }, ['Confirm move']));

    for (const key of selected) {
      const line = feedLines.find(l => `${l.batchId}|${l.locationId}` === key);
      if (!line) continue;
      const amt = moveAmounts[key] || 0;
      const unit = line.batch?.unit || 'units';
      const destLabel = destType === 'batch' ? 'inventory' : (destEventId ? (locMap.get(getAll('eventPaddockWindows').find(pw => pw.eventId === destEventId && !pw.dateClosed)?.locationId)?.name || 'Event') : '?');

      panel.appendChild(el('div', { style: { fontSize: '13px', padding: '6px 0', borderBottom: '0.5px solid var(--border)' } }, [
        `Move ${amt} ${unit} ${line.batch?.name || '?'} \u2192 ${destLabel}`,
      ]));
    }

    panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginTop: '8px' } }, ['A feed check will be recorded on today\'s date for each line.']));

    const statusEl = el('div', { className: 'auth-error' });
    panel.appendChild(statusEl);

    panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
      el('button', { className: 'btn btn-green', onClick: () => {
        clear(statusEl);
        try {
          for (const key of selected) {
            const line = feedLines.find(l => `${l.batchId}|${l.locationId}` === key);
            if (!line) continue;
            const amt = moveAmounts[key] || 0;
            const rem = confirmedRemaining[key] || 0;

            // 1. Feed check (strike the line)
            const check = FeedCheckEntity.create({ operationId, eventId: event.id, checkDate: todayStr });
            add('eventFeedChecks', check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
            const checkItem = FeedCheckItemEntity.create({ operationId, feedCheckId: check.id, batchId: line.batchId, locationId: line.locationId, remainingQuantity: rem });
            add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');

            // 2. Removal entry on source
            const removal = FeedEntryEntity.create({
              operationId, eventId: event.id, batchId: line.batchId, locationId: line.locationId,
              date: todayStr, quantity: amt, entryType: 'removal',
              destinationType: destType, destinationEventId: destType === 'event' ? destEventId : null,
            });
            add('eventFeedEntries', removal, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

            // 3/4. Destination
            if (destType === 'batch') {
              // Increment batch remaining
              const batch = getById('batches', line.batchId);
              if (batch) update('batches', batch.id, { remaining: (batch.remaining || 0) + amt }, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            } else if (destType === 'event' && destEventId) {
              // Create inbound delivery on destination
              const destPw = getAll('eventPaddockWindows').find(pw => pw.eventId === destEventId && !pw.dateClosed);
              const inbound = FeedEntryEntity.create({
                operationId, eventId: destEventId, batchId: line.batchId,
                locationId: destPw?.locationId || line.locationId,
                date: todayStr, quantity: amt, entryType: 'delivery',
                sourceEventId: event.id,
              });
              add('eventFeedEntries', inbound, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
            }
          }
          moveFeedSheet.close();
        } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
      } }, ['Confirm']),
      el('button', { className: 'btn btn-outline', onClick: () => renderStep3() }, ['Back']),
    ]));
  }

  moveFeedSheet.open();
}
