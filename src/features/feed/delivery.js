/** @file Deliver feed (Log feeding) sheet — CP-27. V1 parity: batch cards + inline stepper + summary. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add } from '../../data/store.js';
import { reviewSave, inputField } from '../assistant/entry-review.js';
import { bindEntryFields } from '../assistant/entry-fields.js';
import { FEEDING_ENTRY_FIELDS } from './delivery-entry-fields.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../utils/date-utils.js';
import { getEventStartDate } from '../events/event-start.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import {
  positiveBalances, deductDelivery, locationName,
  availableDeliveryStock, exceedsAvailableStock,
} from './batch-balances.js';
import { allocateFeedingLines, reconcileAllocatedLines } from '../assistant/feeding-clarification.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';

let deliverFeedSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('deliver-feed-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'deliver-feed-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => deliverFeedSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'deliver-feed-sheet-panel' }),
  ]));
}

const KG_TO_LBS = 2.20462;

function unitLabel(unit) {
  const map = { 'round-bale': 'bales', 'square-bale': 'bales', bale: 'bales', tub: 'tubs', bag: 'bags', ton: 'tons', lb: 'lbs', kg: 'kg' };
  return map[unit] || (unit ? unit + 's' : 'units');
}

export function openDeliverFeedSheet(evt, operationId, options = {}) {
  ensureSheetDOM();
  if (!deliverFeedSheet) deliverFeedSheet = new Sheet('deliver-feed-sheet-wrap');

  const panel = document.getElementById('deliver-feed-sheet-panel');
  if (!panel) return;
  clear(panel);

  // Handle bar
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const batches = getAll('batches').filter(b => !b.archived && b.remaining > 0);
  const activePWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
  const todayStr = getLocalTodayStr();
  const nowTime = new Date().toTimeString().slice(0, 5);

  // OI-0140: paddock disambiguation. localStorage insertion order isn't deterministic,
  // so the pre-fix shortcut (indexing the unsorted array at zero) was effectively
  // arbitrary on multi-window events (strip-graze).
  // Sort most-recently-opened first; default the picker to the top option; let the user
  // override via a <select> when there's >1 open paddock window. The save loop below
  // reads `selectedLocationId` (mutable closure) at write time, not the seed value.
  const sortedActivePWs = [...activePWs].sort((a, b) => {
    const aStamp = `${a.dateOpened || ''}T${a.timeOpened || '00:00'}`;
    const bStamp = `${b.dateOpened || ''}T${b.timeOpened || '00:00'}`;
    return bStamp.localeCompare(aStamp);
  });
  let selectedLocationId = sortedActivePWs[0]?.locationId || null;
  let selectedLocationIds = selectedLocationId ? [selectedLocationId] : [];
  let quantityBasis = null;
  let allocatedLines = null;
  let carryover = null;
  const initialLoc = selectedLocationId ? getById('locations', selectedLocationId) : null;
  const locName = initialLoc?.name || '?';

  // Groups + day count
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === evt.id && !gw.dateLeft);
  const groupNames = gws.map(gw => { const g = getById('groups', gw.groupId); return g?.name || ''; }).filter(Boolean).join(', ');
  const evtStart = getEventStartDate(evt.id);
  const dayCount = evtStart ? daysBetweenInclusive(evtStart, todayStr) : 0;

  // No batches
  if (!batches.length) {
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [`${locName} \u2014 ${t('feed.logFeeding')}`]));
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.noBatchesOnHand')]));
    panel.appendChild(el('button', { className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' }, onClick: () => deliverFeedSheet.close() }, [t('action.cancel')]));
    deliverFeedSheet.open();
    return;
  }

  // State: selected lines
  let selectedLines = []; // { batchId, qty, sourceLocationId }

  // Group batches by feed type
  const feedTypes = getAll('feedTypes');
  const batchesByType = {};
  for (const batch of batches) {
    const ft = batch.feedTypeId ? feedTypes.find(f => f.id === batch.feedTypeId) : null;
    const typeName = ft?.name || 'Other';
    if (!batchesByType[typeName]) batchesByType[typeName] = [];
    batchesByType[typeName].push(batch);
  }

  // DOM refs
  const batchListEl = el('div');
  const summaryEl = el('div');

  function toggleBatch(batchId) {
    const idx = selectedLines.findIndex(l => l.batchId === batchId);
    if (idx >= 0) selectedLines.splice(idx, 1);
    else {
      const holdings = positiveBalances(batchId);
      selectedLines.push({
        batchId,
        qty: 0,
        sourceLocationId: holdings.length === 1 ? holdings[0].locationId : null,
      });
    }
    renderBatches();
    renderSummary();
  }

  function sourcePicker(batch, line) {
    const holdings = positiveBalances(batch.id);
    if (holdings.length <= 1) return null;
    const select = el('select', {
      'data-testid': `feed-delivery-source-${batch.id}`,
      style: { marginTop: '8px', width: '100%', padding: '6px 8px' },
    }, [
      el('option', { value: '' }, [t('feed.fromLocation')]),
      ...holdings.map(row => el('option', { value: row.locationId }, [
        `${locationName(row.locationId) || '?'} (${row.quantity})`,
      ])),
    ]);
    select.value = line.sourceLocationId || '';
    select.addEventListener('change', () => {
      line.sourceLocationId = select.value || null;
    });
    return el('div', { onClick: (e) => e.stopPropagation() }, [
      el('div', { style: { fontSize: '12px', marginBottom: '4px' } }, [t('feed.fromLocation')]),
      select,
    ]);
  }

  function adjQty(lineIdx, delta) {
    const line = selectedLines[lineIdx];
    line.qty = Math.max(0, Math.round((line.qty + delta) * 10) / 10);
    renderBatches();
    renderSummary();
  }

  function renderBatches() {
    clear(batchListEl);
    for (const [typeName, typeBatches] of Object.entries(batchesByType)) {
      // Category header
      batchListEl.appendChild(el('div', { style: { fontSize: '11px', fontWeight: '600', color: 'var(--text2)', margin: '8px 0 4px', textTransform: 'uppercase', letterSpacing: '.4px' } }, [typeName]));

      for (const batch of typeBatches) {
        const lineIdx = selectedLines.findIndex(l => l.batchId === batch.id);
        const isSelected = lineIdx >= 0;
        const line = isSelected ? selectedLines[lineIdx] : null;
        const units = unitLabel(batch.unit);
        const detailParts = [`${batch.remaining} ${units}`];
        if (batch.dmPct) detailParts.push(`${batch.dmPct}% DM`);
        if (batch.costPerUnit) detailParts.push(`$${batch.costPerUnit.toFixed(2)}/${batch.unit || 'unit'}`);

        const cardChildren = [];

        // Batch selector row
        cardChildren.push(el('div', {
          className: `batch-sel${isSelected ? ' on' : ''}`,
          style: { border: 'none', borderRadius: '0', background: 'transparent', margin: '0' },
          onClick: () => toggleBatch(batch.id),
        }, [
          el('div', {}, [
            el('div', { style: { fontSize: '13px', fontWeight: '600' } }, [batch.name]),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [detailParts.join(' \u00B7 ')]),
          ]),
          el('div', { className: 'chk' }, isSelected ? [
            el('svg', { width: '12', height: '12', viewBox: '0 0 12 12', fill: 'none' }, [
              el('polyline', { points: '2,6 5,9 10,3', stroke: 'white', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
            ]),
          ] : []),
        ]));

        // Inline stepper (when selected)
        if (isSelected) {
          const qty = line.qty;

          // Detail line
          let detailLine = '';
          if (qty > 0) {
            const parts = [];
            if (batch.weightPerUnitKg) {
              const asFedLbs = qty * batch.weightPerUnitKg * KG_TO_LBS;
              parts.push(`${Math.round(asFedLbs).toLocaleString()} lbs as-fed`);
              if (batch.dmPct) parts.push(`${Math.round(asFedLbs * batch.dmPct / 100).toLocaleString()} lbs DM`);
            }
            if (batch.costPerUnit) parts.push(`$${(qty * batch.costPerUnit).toFixed(2)}`);
            detailLine = parts.join(' \u00B7 ');
          }

          cardChildren.push(el('div', {
            style: { padding: '8px 10px 4px', background: 'var(--green-l)', borderTop: '0.5px solid var(--green-l2)' },
            onClick: (e) => e.stopPropagation(),
          }, [
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, [
              el('div', { style: { flex: '1', fontSize: '12px', color: 'var(--green-d)', fontWeight: '500' } }, [`${t('feed.quantity')} (${units})`]),
              el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } }, [
                el('button', { className: 'qty-btn', style: { background: 'var(--green-l2)' }, type: 'button', onClick: () => adjQty(lineIdx, -0.5) }, ['\u2212']),
                el('span', { className: 'qty-val', style: { minWidth: '32px', textAlign: 'center' } }, [qty.toString()]),
                el('button', { className: 'qty-btn', style: { background: 'var(--green-l2)' }, type: 'button', onClick: () => adjQty(lineIdx, 0.5) }, ['+']),
              ]),
            ]),
            detailLine ? el('div', { style: { fontSize: '11px', color: 'var(--green-d)', marginTop: '3px', opacity: '.8' } }, [detailLine]) : null,
            sourcePicker(batch, line),
          ].filter(Boolean)));
        }

        batchListEl.appendChild(el('div', {
          style: { border: `0.5px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`, borderRadius: 'var(--radius)', marginBottom: '4px', overflow: 'hidden', background: isSelected ? 'var(--green-l)' : 'var(--bg)' },
        }, cardChildren));
      }
    }
  }

  function renderSummary() {
    clear(summaryEl);
    let totalDmi = 0, totalCost = 0;
    for (const line of selectedLines) {
      if (line.qty <= 0) continue;
      const batch = getById('batches', line.batchId);
      if (!batch) continue;
      const asFed = batch.weightPerUnitKg ? line.qty * batch.weightPerUnitKg * KG_TO_LBS : line.qty;
      totalDmi += asFed * ((batch.dmPct || 0) / 100);
      totalCost += line.qty * (batch.costPerUnit || 0);
    }
    summaryEl.appendChild(el('div', { className: 'card-inset', style: { marginTop: '10px' } }, [
      el('div', { className: 'two' }, [
        el('div', {}, [
          el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.feedDMI')]),
          el('div', { style: { fontSize: '18px', fontWeight: '700' } }, [`${Math.round(totalDmi).toLocaleString()} lbs`]),
        ]),
        el('div', {}, [
          el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.feedCost')]),
          el('div', { style: { fontSize: '18px', fontWeight: '700', color: 'var(--amber)' } }, [`$${totalCost.toFixed(2)}`]),
        ]),
      ]),
    ]));
  }

  // --- Header ---
  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', {}, [
      el('div', { style: { fontSize: '16px', fontWeight: '600' } }, [t('feed.logFeeding')]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [`${groupNames} \u00B7 Day ${dayCount}`]),
    ]),
  ]));

  // OI-0140: chip text reflects whatever the picker currently points at; on
  // single-window events it's static (no picker rendered), on multi-window
  // events it tracks the <select>'s value via updateChip().
  const chipText = el('span', { 'data-testid': 'feed-delivery-location-chip', style: { fontWeight: '500' } }, ['']);
  function locationLabels(ids) {
    return ids.map(id => getById('locations', id)?.name || '?');
  }
  function updateChip() {
    const ids = selectedLocationIds.length ? selectedLocationIds : (selectedLocationId ? [selectedLocationId] : []);
    const names = locationLabels(ids);
    chipText.textContent = names.length ? `→ ${names.join(', ')}` : '→ ?';
  }
  updateChip();

  const chipRow = el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, [chipText]);
  if (sortedActivePWs.length > 1) {
    const paddockSelect = el('select', {
      'data-testid': 'feed-delivery-paddock-picker',
      style: { padding: '6px 8px', border: '0.5px solid var(--border2)', borderRadius: '6px', background: 'var(--bg)', fontSize: '13px', fontFamily: 'inherit', color: 'var(--text)' },
    });
    for (const pw of sortedActivePWs) {
      const loc = getById('locations', pw.locationId);
      paddockSelect.appendChild(el('option', { value: pw.locationId }, [loc?.name || '?']));
    }
    paddockSelect.value = selectedLocationId;
    paddockSelect.addEventListener('change', () => {
      selectedLocationId = paddockSelect.value;
      selectedLocationIds = [selectedLocationId];
      updateChip();
      updateBasisRow();
    });
    chipRow.appendChild(el('label', { style: { fontSize: '12px', color: 'var(--text2)', marginLeft: 'auto' } }, [t('feed.deliverTo')]));
    chipRow.appendChild(paddockSelect);
  }
  panel.appendChild(chipRow);
  const basisRow = el('div', { 'data-testid': 'feed-delivery-quantity-basis', style: { fontSize: '13px', marginBottom: '10px', display: 'none' } });
  function updateBasisRow() {
    const multi = selectedLocationIds.length > 1;
    basisRow.style.display = multi ? '' : 'none';
    if (!multi) return;
    const names = locationLabels(selectedLocationIds).join(', ');
    clear(basisRow);
    const total = el('input', { type: 'radio', name: 'feed-qty-basis', value: 'total', 'data-testid': 'feed-quantity-basis-total' });
    const per = el('input', { type: 'radio', name: 'feed-qty-basis', value: 'per-paddock', 'data-testid': 'feed-quantity-basis-per-paddock' });
    total.checked = quantityBasis === 'total';
    per.checked = quantityBasis === 'per-paddock';
    total.addEventListener('change', () => { if (total.checked) quantityBasis = 'total'; });
    per.addEventListener('change', () => { if (per.checked) quantityBasis = 'per-paddock'; });
    basisRow.append(
      el('div', { style: { marginBottom: '4px', color: 'var(--text2)' } }, [`Quantity for ${names}`]),
      el('label', { style: { marginRight: '12px' } }, [total, ' Total across paddocks']),
      el('label', {}, [per, ' Same amount per paddock']),
    );
  }
  panel.appendChild(basisRow);
  updateBasisRow();
  const carryoverEl = el('div', { 'data-testid': 'feed-delivery-carryover', style: { fontSize: '13px', marginBottom: '10px', display: 'none' } });
  function carryoverItems() {
    if (!carryover) return [];
    if (Array.isArray(carryover.items) && carryover.items.length) return carryover.items;
    if (carryover.remainingQuantity != null || carryover.batchId) {
      return [{
        batchId: carryover.batchId ?? null,
        locationId: carryover.locationId ?? selectedLocationId,
        remainingQuantity: carryover.remainingQuantity,
      }];
    }
    return [];
  }
  function writeCarryoverFromForm() {
    if (!carryover) return;
    const timing = carryoverEl.querySelector('[data-testid="feed-carryover-timing"]')?.value || carryover.timing || null;
    const time = carryoverEl.querySelector('[data-testid="feed-carryover-time"]')?.value || (timing === 'same-instant' ? null : (carryover.time || null));
    const rows = [...carryoverEl.querySelectorAll('[data-testid="feed-carryover-item"]')].map(row => ({
      batchId: row.querySelector('[data-testid="feed-carryover-batch"]')?.value || null,
      locationId: row.querySelector('[data-testid="feed-carryover-location"]')?.value || null,
      remainingQuantity: Number(row.querySelector('[data-testid="feed-carryover-remaining"]')?.value),
    }));
    if (rows.length) carryover = { ...carryover, timing, time, items: rows, remainingQuantity: rows[0]?.remainingQuantity, batchId: rows[0]?.batchId, locationId: rows[0]?.locationId };
    else carryover = { ...carryover, timing, time };
  }
  function updateCarryover() {
    const items = carryoverItems();
    if (!items.length) {
      carryoverEl.style.display = 'none';
      clear(carryoverEl);
      return;
    }
    carryoverEl.style.display = '';
    clear(carryoverEl);
    const timing = el('select', { 'data-testid': 'feed-carryover-timing', onChange: () => { writeCarryoverFromForm(); updateCarryover(); } });
    for (const [value, label] of [['before', 'Before the delivery'], ['same-instant', 'At the same time'], ['after', 'After the delivery']]) {
      timing.appendChild(el('option', { value, selected: carryover.timing === value }, [label]));
    }
    if (carryover.timing) timing.value = carryover.timing;
    const whenFields = [el('div', { className: 'field', style: { marginBottom: '8px' } }, [el('label', {}, ['When']), timing])];
    if (carryover.timing && carryover.timing !== 'same-instant') {
      const time = el('input', {
        type: 'time',
        'data-testid': 'feed-carryover-time',
        value: carryover.time || '',
        onInput: writeCarryoverFromForm,
        onChange: writeCarryoverFromForm,
      });
      whenFields.push(el('div', { className: 'field', style: { marginBottom: '8px' } }, [el('label', {}, ['Check time']), time]));
    }
    carryoverEl.append(
      el('div', { style: { fontWeight: '600', marginBottom: '4px' } }, ['Remaining feed (saved as a feed check, not a delivery)']),
      ...whenFields,
    );
    items.forEach((item, index) => {
      const batchSel = el('select', { 'data-testid': 'feed-carryover-batch', onChange: writeCarryoverFromForm });
      for (const batch of batches) batchSel.appendChild(el('option', { value: batch.id, selected: batch.id === item.batchId }, [batch.name || batch.id]));
      if (item.batchId) batchSel.value = item.batchId;
      const locSel = el('select', { 'data-testid': 'feed-carryover-location', onChange: writeCarryoverFromForm });
      const locIds = sortedActivePWs.map(pw => pw.locationId);
      for (const id of locIds) {
        const loc = getById('locations', id);
        locSel.appendChild(el('option', { value: id, selected: id === item.locationId }, [loc?.name || id]));
      }
      if (item.locationId) locSel.value = item.locationId;
      const remaining = el('input', {
        type: 'number', min: '0', step: '0.01',
        'data-testid': 'feed-carryover-remaining',
        value: item.remainingQuantity != null ? String(item.remainingQuantity) : '',
        onInput: writeCarryoverFromForm,
      });
      carryoverEl.appendChild(el('div', { 'data-testid': 'feed-carryover-item', 'data-index': String(index), style: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '8px' } }, [
        el('div', { className: 'field' }, [el('label', {}, ['Batch']), batchSel]),
        el('div', { className: 'field' }, [el('label', {}, ['Paddock']), locSel]),
        el('div', { className: 'field' }, [el('label', {}, ['Remaining']), remaining]),
      ]));
    });
  }
  panel.appendChild(carryoverEl);
  updateCarryover();

  // Date/time row
  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time', value: nowTime });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '10px' } }, [
    el('div', { className: 'field' }, [
      el('label', {}, ['Date']),
      dateInput,
    ]),
    el('div', { className: 'field' }, [
      el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]),
      timeInput,
    ]),
  ]));

  // Select feed heading
  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '600', marginBottom: '2px' } }, [t('feed.selectFeedHeading')]));
  panel.appendChild(el('div', { style: { fontSize: '11px', color: 'var(--text2)', marginBottom: '8px' } }, [t('feed.selectFeedHint')]));

  // Batch list + summary
  panel.appendChild(batchListEl);
  panel.appendChild(summaryEl);
  renderBatches();
  renderSummary();

  // Status
  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  // Button row
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', {
      className: 'btn btn-green',
      onClick: reviewSave(options.review, () => {
        clear(statusEl);
        const linesToSave = selectedLines.filter(l => l.qty > 0);
        if (!linesToSave.length) {
          statusEl.appendChild(el('span', {}, [t('validation.quantityPositive')]));
          return;
        }
        try {
          const targets = selectedLocationIds.length ? selectedLocationIds : (selectedLocationId ? [selectedLocationId] : []);
          const plan = allocatedLines
            ? reconcileAllocatedLines(allocatedLines, { lines: linesToSave, locationIds: targets })
            : allocateFeedingLines(linesToSave, targets, quantityBasis);
          if (plan.status !== 'allocated') {
            statusEl.appendChild(el('span', {}, [plan.question || 'How should the quantity be allocated?']));
            return;
          }
          const leftover = carryover && (carryover.remainingQuantity != null || carryover.items?.length) ? carryover : null;
          const visibleLocationIds = new Set(sortedActivePWs.map(pw => pw.locationId));
          const visibleBatchIds = new Set(batches.map(batch => batch.id));
          const leftoverItems = leftover
            ? (Array.isArray(leftover.items) && leftover.items.length
              ? leftover.items
              : (leftover.remainingQuantity != null && targets.length === 1
                ? [{ locationId: leftover.locationId ?? targets[0], batchId: leftover.batchId ?? linesToSave[0]?.batchId, remainingQuantity: leftover.remainingQuantity }]
                : null))
            : null;
          if (leftover) {
            if (leftover.timing !== 'same-instant' && !leftover.time) {
              statusEl.appendChild(el('span', {}, ['What time was the remaining feed checked?']));
              return;
            }
            if (!leftoverItems) {
              statusEl.appendChild(el('span', {}, ['How should the remaining quantity be split across the paddocks?']));
              return;
            }
            const seenLeftover = new Set();
            for (const item of leftoverItems) {
              if (!visibleBatchIds.has(item.batchId) || !visibleLocationIds.has(item.locationId)) {
                statusEl.appendChild(el('span', {}, ['Remaining feed must use a batch and paddock shown on this review.']));
                return;
              }
              if (typeof item.remainingQuantity !== 'number' || !Number.isFinite(item.remainingQuantity) || item.remainingQuantity < 0) {
                statusEl.appendChild(el('span', {}, ['Remaining feed quantity must be a non-negative number.']));
                return;
              }
              const key = `${item.batchId}:${item.locationId}`;
              if (seenLeftover.has(key)) {
                statusEl.appendChild(el('span', {}, ['Remaining feed cannot repeat the same batch and paddock.']));
                return;
              }
              seenLeftover.add(key);
            }
          }
          const plannedEntries = [];
          for (const part of plan.allocations) {
            for (const line of part.lines.filter(item => item.qty > 0 || item.quantity > 0)) {
              const qty = line.qty ?? line.quantity;
              const holdings = positiveBalances(line.batchId);
              const sourceLocationId = holdings.length === 1
                ? holdings[0].locationId
                : (line.sourceLocationId || null);
              if (holdings.length > 1 && !sourceLocationId) {
                statusEl.appendChild(el('span', {}, [t('feed.locationRequired')]));
                return;
              }
              plannedEntries.push({
                batchId: line.batchId,
                sourceLocationId,
                qty,
                record: FeedEntryEntity.create({
                  operationId, eventId: evt.id,
                  batchId: line.batchId, locationId: part.locationId,
                  sourceLocationId,
                  date: dateInput.value, time: timeInput.value || null,
                  quantity: qty,
                }),
              });
            }
          }
          const plannedCheck = leftover ? FeedCheckEntity.create({
            operationId, eventId: evt.id,
            date: dateInput.value, time: leftover.timing === 'same-instant' ? (timeInput.value || null) : leftover.time,
          }) : null;
          const plannedItems = leftover
            ? leftoverItems.map(item => FeedCheckItemEntity.create({
              operationId, feedCheckId: plannedCheck.id,
              batchId: item.batchId, locationId: item.locationId,
              remainingQuantity: item.remainingQuantity,
            }))
            : [];
          const pendingRows = [
            ...plannedEntries.map(row => ({ validate: FeedEntryEntity.validate, record: row.record })),
            ...(plannedCheck ? [{ validate: FeedCheckEntity.validate, record: plannedCheck }] : []),
            ...plannedItems.map(record => ({ validate: FeedCheckItemEntity.validate, record })),
          ];
          for (const row of pendingRows) {
            const result = row.validate(row.record);
            if (!result.valid) {
              statusEl.appendChild(el('span', {}, [result.errors.join(', ')]));
              return;
            }
          }
          const requestedByPool = new Map();
          for (const row of plannedEntries) {
            const stock = availableDeliveryStock(row.batchId, row.sourceLocationId);
            if (stock.status !== 'ok') {
              statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
              return;
            }
            const prev = requestedByPool.get(stock.poolKey);
            requestedByPool.set(stock.poolKey, {
              available: stock.available,
              qty: (prev?.qty ?? 0) + row.qty,
            });
          }
          for (const { available, qty } of requestedByPool.values()) {
            if (exceedsAvailableStock(qty, available)) {
              statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
              return;
            }
          }
          for (const row of plannedEntries) {
            const deducted = deductDelivery(row.batchId, row.sourceLocationId, row.qty);
            if (deducted) {
              statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
              return;
            }
            add('eventFeedEntries', row.record, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
          }
          if (plannedCheck) {
            add('eventFeedChecks', plannedCheck, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
            for (const item of plannedItems) {
              add('eventFeedCheckItems', item, FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
            }
          }
          if (!options.review) deliverFeedSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      }),
    }, [t('feed.saveFeeding')]),
    el('button', { className: 'btn btn-outline', onClick: () => deliverFeedSheet.close() }, [t('action.cancel')]),
  ]));

  options.review?.bind({ ui: 'Log feeding sheet', close: () => deliverFeedSheet.close(), entityType: 'eventFeedEntries', status: statusEl, fields: bindEntryFields(FEEDING_ENTRY_FIELDS, {
    date: inputField(dateInput),time: inputField(timeInput),
    locationId: { required: true,get: () => selectedLocationId,set: value => {
      if (!sortedActivePWs.some(window => window.locationId === value)) throw new Error('invalid-feeding-paddock');
      selectedLocationId = value;
      if (!selectedLocationIds.includes(value)) selectedLocationIds = [value];
      updateChip(); updateBasisRow();
      const picker = panel.querySelector('[data-testid="feed-delivery-paddock-picker"]'); if (picker) picker.value = value;
    } },
    locationIds: { get: () => selectedLocationIds.length > 1 ? globalThis.structuredClone(selectedLocationIds) : undefined, set: value => {
      const ids = Array.isArray(value) ? value : [];
      if (ids.some(id => !sortedActivePWs.some(window => window.locationId === id))) throw new Error('invalid-feeding-paddock');
      selectedLocationIds = [...ids];
      if (ids[0]) selectedLocationId = ids[0];
      updateChip(); updateBasisRow();
    } },
    quantityBasis: { get: () => quantityBasis ?? undefined, set: value => { quantityBasis = value ?? null; updateBasisRow(); } },
    allocatedLines: { get: () => allocatedLines ?? undefined, set: value => { allocatedLines = value ?? null; } },
    carryover: { get: () => carryover ?? undefined, set: value => { carryover = value ?? null; updateCarryover(); } },
    lines: { required: true,get: () => globalThis.structuredClone(selectedLines),set: value => {
      if (!Array.isArray(value) || value.some(line => !batches.some(batch => batch.id === line.batchId && batch.operationId === operationId) || !Number.isFinite(line.qty ?? line.quantity) || (line.qty ?? line.quantity) < 0)) throw new Error('invalid-feeding-lines');
      selectedLines = value.map(({ batchId,qty,quantity,sourceLocationId,allocations }) => ({ batchId,qty: qty ?? quantity,sourceLocationId: sourceLocationId || null, allocations })); renderBatches();renderSummary();
    } },
  }) });
  deliverFeedSheet.open();
}
