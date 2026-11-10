import { poolWritesEnabled } from '../feed/pool-ledger.js';
import { renderPoolTransferForm } from '../feed/pool-forms.js';
/** @file Move Feed Out sheet — SP-10 §8a. Four-step flow: state → check → amount+dest → confirm. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, runDurableWrite } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, display } from '../../utils/units.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import { getLiveRemainingForMove } from '../../calcs/feed-state.js';
import { validateDeliveryRestore, restoreDelivery } from '../feed/batch-balances.js';
import { openLocationNames } from './open-cohort.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';

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

  if (poolWritesEnabled()) { renderPoolTransferForm(panel, event, operationId, { ...opts, close: () => moveFeedSheet.close() }); moveFeedSheet.open(); return; }

  const unitSys = getUnitSystem();
  const todayStr = getLocalTodayStr();

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
    netRemaining: getLiveRemainingForMove(event.id)[`${l.batchId}|${l.locationId}`] ?? 0,
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
  const returnLocations = {};
  const executionKey = JSON.stringify([operationId, 'move-feed-out', crypto.randomUUID(), 1]);
  let committed = false;

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
      const input = el('input', { 'data-testid': `move-check-${line.batchId}-${line.locationId}`, type: 'number', min: '0', step: '0.01', value: line.netRemaining, style: { width: '100px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', fontWeight: '600', textAlign: 'center' } });
      input.addEventListener('change', () => { if (input.isConnected) confirmedRemaining[key] = input.value.trim() === '' ? NaN : Number(input.value); });
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
      const input = el('input', { 'data-testid': `move-amount-${line.batchId}-${line.locationId}`, type: 'number', min: '0.1', max: String(remaining), step: '0.1', value: remaining, style: { width: '100px', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', textAlign: 'center' } });
      input.addEventListener('change', () => { if (input.isConnected) moveAmounts[key] = input.value.trim() === '' ? NaN : Number(input.value); });
      moveAmounts[key] = remaining;

      panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '0.5px solid var(--border)', fontSize: '13px' } }, [
        el('span', {}, [`${line.batch?.name || '?'}: move ${unit}`]),
        input,
      ]));
    }

    // Destination picker
    panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginTop: '14px', marginBottom: '8px' } }, ['Destination']));
    const destSelect = el('select', { className: 'auth-select', 'data-testid': 'move-destination-type', value: destType }, [
      el('option', { value: 'batch' }, ['Back to inventory']),
      el('option', { value: 'event' }, ['Existing open event']),
    ]);
    destSelect.value = destType;
    destSelect.addEventListener('change', () => { destType = destSelect.value; renderDestDetails(); });
    panel.appendChild(el('div', { className: 'field' }, [destSelect]));

    const destDetailsEl = el('div');
    panel.appendChild(destDetailsEl);

    function renderDestDetails() {
      clear(destDetailsEl);
      if (destType === 'batch') {
        for (const key of selected) {
          const line = feedLines.find(row => `${row.batchId}|${row.locationId}` === key);
          const original = [...new Set(entries.filter(row => row.batchId === line.batchId && row.locationId === line.locationId && row.entryType !== 'removal').map(row => row.sourceLocationId).filter(Boolean))];
          if (!(key in returnLocations)) returnLocations[key] = original.length === 1 ? original[0] : null;
          const available = locations.filter(row => row.type === 'storage' || original.includes(row.id));
          const picker = el('select', { className: 'auth-select', 'data-testid': `move-return-${line.batchId}-${line.locationId}` }, [el('option', { value: '' }, [t('manualEntry.pickStorage')]), ...available.map(row => el('option', { value: row.id }, [row.name]))]);
          picker.value = returnLocations[key] || ''; picker.addEventListener('change', () => { if (picker.isConnected) returnLocations[key] = picker.value || null; });
          destDetailsEl.appendChild(el('div', { className: 'field' }, [el('label', {}, [line.batch?.name || '?']), picker]));
        }
      } else if (destType === 'event') {
        const openEvents = getAll('events').filter(e => !e.dateOut && e.id !== event.id);
        const evtSelect = el('select', { className: 'auth-select', 'data-testid': 'move-destination-event' }, [
          el('option', { value: '' }, ['\u2014 pick event \u2014']),
          ...openEvents.map(e => {
            const names = openLocationNames(e.id);
            const locName = names.length ? names.join(', ') : '?';
            return el('option', { value: e.id }, [locName]);
          }),
        ]);
        evtSelect.value = destEventId || '';
        const paddocks = el('div');
        function renderPaddocks() {
          clear(paddocks);
          const windows = getAll('eventPaddockWindows').filter(row => row.eventId === destEventId && !row.dateClosed);
          const picker = el('select', { className: 'auth-select', 'data-testid': 'move-destination-location' }, [el('option', { value: '' }, [t('manualEntry.pickDestination')]), ...windows.map(row => el('option', { value: row.locationId }, [locMap.get(row.locationId)?.name || '?']))]);
          picker.value = destLocationId || ''; picker.addEventListener('change', () => { if (picker.isConnected) destLocationId = picker.value || null; });
          paddocks.appendChild(picker);
        }
        evtSelect.addEventListener('change', () => { if (!evtSelect.isConnected) return; destEventId = evtSelect.value || null; destLocationId = null; renderPaddocks(); });
        destDetailsEl.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Event']), evtSelect]));
        destDetailsEl.appendChild(paddocks); renderPaddocks();
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
          if (!Number.isFinite(moveAmounts[key]) || !Number.isFinite(confirmedRemaining[key]) || rem < 0) { statusEl.textContent = t('manualEntry.invalidNumber'); return; }
          if (amt > rem) { statusEl.appendChild(el('span', {}, ['Move amount exceeds remaining'])); return; }
          if (amt <= 0) { statusEl.appendChild(el('span', {}, ['Move amount must be > 0'])); return; }
        }
        if (destType === 'event' && (!destEventId || !destLocationId)) { statusEl.appendChild(el('span', {}, ['Select a destination event'])); return; }
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
      const targetLocationId = destType === 'batch' ? returnLocations[key] : destLocationId;
      const destLabel = getById('locations', targetLocationId)?.name || (destType === 'batch' ? t('manualEntry.unlocatedInventory') : '?');

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
          if (committed) return;
          const source = getById('events', event.id);
          if (!source || source.operationId !== operationId || source.dateOut) throw new Error(t('manualEntry.closedSource'));
          const observed = new Date();
          // The staged observation precedes the physical removal. Give the two
          // ordered actions distinct instants even within one clock tick.
          const moved = new Date(observed.getTime() + 1);
          const parts = date => ({ date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`, time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}` });
          const rows = [];
          if (destType === 'event' && (!destEventId || destEventId === event.id || getById('events', destEventId)?.operationId !== operationId || getById('events', destEventId).dateOut || getById('locations', destLocationId)?.operationId !== operationId || !getAll('eventPaddockWindows').some(row => row.eventId === destEventId && row.locationId === destLocationId && !row.dateClosed))) throw new Error(t('manualEntry.pickDestination'));
          for (const key of selected) {
            const line = feedLines.find(row => `${row.batchId}|${row.locationId}` === key), amt = moveAmounts[key], rem = confirmedRemaining[key];
            if (!line || getById('batches', line.batchId)?.operationId !== operationId || getById('locations', line.locationId)?.operationId !== operationId || !Number.isFinite(amt) || !Number.isFinite(rem) || amt <= 0 || rem < amt) throw new Error(t('manualEntry.invalidNumber'));
            const check = FeedCheckEntity.create({ operationId, eventId: event.id, ...parts(observed) });
            const item = FeedCheckItemEntity.create({ operationId, feedCheckId: check.id, batchId: line.batchId, locationId: line.locationId, remainingQuantity: rem });
            const removal = FeedEntryEntity.create({ operationId, eventId: event.id, batchId: line.batchId, locationId: line.locationId, ...parts(moved), quantity: amt, entryType: 'removal', destinationType: destType, destinationEventId: destType === 'event' ? destEventId : null });
            const inbound = destType === 'event' ? FeedEntryEntity.create({ operationId, eventId: destEventId, batchId: line.batchId, locationId: destLocationId, ...parts(moved), quantity: amt, sourceEventId: event.id }) : null;
            for (const [entity, record] of [[FeedCheckEntity, check], [FeedCheckItemEntity, item], [FeedEntryEntity, removal], ...(inbound ? [[FeedEntryEntity, inbound]] : [])]) {
              const result = entity.validate(record); if (!result.valid) throw new Error(result.errors.join('; '));
            }
            if (destType === 'batch') {
              const error = validateDeliveryRestore(line.batchId, returnLocations[key], amt);
              if (error) throw new Error(t('manualEntry.returnInventoryError', { reason: error }));
            }
            rows.push({ check, item, removal, inbound, batchId: line.batchId, storage: returnLocations[key], amount: amt });
          }
          if (!rows.length) throw new Error(t('manualEntry.invalidNumber'));
          // Validate cumulative returns too, before creating any compound row.
          const totals = new Map();
          if (destType === 'batch') for (const row of rows) totals.set(row.batchId, (totals.get(row.batchId) || 0) + row.amount);
          for (const [batchId, quantity] of totals) if (!Number.isFinite(quantity) || !Number.isFinite(Number(getById('batches', batchId).remaining) + quantity)) throw new Error(t('manualEntry.invalidNumber'));
          runDurableWrite(executionKey, () => {
            for (const row of rows) {
              add('eventFeedChecks', row.check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
              add('eventFeedCheckItems', row.item, FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
              add('eventFeedEntries', row.removal, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
              if (row.inbound) add('eventFeedEntries', row.inbound, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
              else { const error = restoreDelivery(row.batchId, row.storage, row.amount); if (error) throw new Error(t('manualEntry.returnInventoryError', { reason: error })); }
            }
            return rows[0].removal.id;
          });
          committed = true;
          moveFeedSheet.close();
        } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
      } }, ['Confirm']),
      el('button', { className: 'btn btn-outline', onClick: () => renderStep3() }, ['Back']),
    ]));
  }

  moveFeedSheet.open();
}
