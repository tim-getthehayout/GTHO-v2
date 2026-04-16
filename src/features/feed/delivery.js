/** @file Deliver feed (Log feeding) sheet — CP-27. V1 parity: batch cards + inline stepper + summary. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { daysBetweenInclusive } from '../../utils/date-utils.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as BatchEntity from '../../entities/batch.js';

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

export function openDeliverFeedSheet(evt, operationId) {
  ensureSheetDOM();
  if (!deliverFeedSheet) deliverFeedSheet = new Sheet('deliver-feed-sheet-wrap');

  const panel = document.getElementById('deliver-feed-sheet-panel');
  if (!panel) return;
  clear(panel);

  // Handle bar
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const batches = getAll('batches').filter(b => !b.archived && b.remaining > 0);
  const activePWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  // Location context
  const primaryPw = activePWs[0];
  const loc = primaryPw ? getById('locations', primaryPw.locationId) : null;
  const locName = loc?.name || '?';
  const locationId = primaryPw?.locationId || null;

  // Groups + day count
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === evt.id && !gw.dateLeft);
  const groupNames = gws.map(gw => { const g = getById('groups', gw.groupId); return g?.name || ''; }).filter(Boolean).join(', ');
  const dayCount = daysBetweenInclusive(evt.dateIn, todayStr);

  // No batches
  if (!batches.length) {
    panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '12px' } }, [`${locName} \u2014 ${t('feed.logFeeding')}`]));
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.noBatchesOnHand')]));
    panel.appendChild(el('button', { className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' }, onClick: () => deliverFeedSheet.close() }, [t('action.cancel')]));
    deliverFeedSheet.open();
    return;
  }

  // State: selected lines
  let selectedLines = []; // { batchId, qty }

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
    else selectedLines.push({ batchId, qty: 0 });
    renderBatches();
    renderSummary();
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
      el('div', { style: { fontSize: '16px', fontWeight: '600' } }, [`${locName} \u2014 ${t('feed.logFeeding')}`]),
      el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [`${groupNames} \u00B7 Day ${dayCount}`]),
    ]),
  ]));

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
      onClick: () => {
        clear(statusEl);
        const linesToSave = selectedLines.filter(l => l.qty > 0);
        if (!linesToSave.length) {
          statusEl.appendChild(el('span', {}, [t('validation.quantityPositive')]));
          return;
        }
        try {
          for (const line of linesToSave) {
            const entry = FeedEntryEntity.create({
              operationId, eventId: evt.id,
              batchId: line.batchId, locationId,
              date: dateInput.value, time: timeInput.value || null,
              quantity: line.qty,
            });
            add('eventFeedEntries', entry, FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
            const batch = getById('batches', line.batchId);
            if (batch) {
              update('batches', batch.id, { remaining: Math.max(0, batch.remaining - line.qty) }, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            }
          }
          deliverFeedSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('feed.saveFeeding')]),
    el('button', { className: 'btn btn-outline', onClick: () => deliverFeedSheet.close() }, [t('action.cancel')]),
  ]));

  deliverFeedSheet.open();
}
