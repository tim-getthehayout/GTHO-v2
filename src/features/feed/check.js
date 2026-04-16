/** @file Feed check sheet — CP-28. V1 parity: triple-sync stepper + pct + slider. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add } from '../../data/store.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';

let feedCheckSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('feed-check-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'feed-check-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedCheckSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'feed-check-sheet-panel' }),
  ]));
}

const KG_TO_LBS = 2.20462;

function unitLabel(unit) {
  const map = { 'round-bale': 'bales', 'square-bale': 'bales', bale: 'bales', tub: 'tubs', bag: 'bags', ton: 'tons', lb: 'lbs', kg: 'kg' };
  return map[unit] || (unit ? unit + 's' : 'units');
}

export function openFeedCheckSheet(evt, operationId) {
  ensureSheetDOM();
  if (!feedCheckSheet) feedCheckSheet = new Sheet('feed-check-sheet-wrap');

  const panel = document.getElementById('feed-check-sheet-panel');
  if (!panel) return;
  clear(panel);

  // Handle bar
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);

  // Get feed entries for this event, grouped by batch×location
  const entries = getAll('eventFeedEntries').filter(e => e.eventId === evt.id);
  if (!entries.length) {
    panel.appendChild(el('div', { style: { fontSize: '15px', fontWeight: '600', marginBottom: '14px' } }, [t('feed.feedCheckTitle')]));
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.feedCheckEmpty')]));
    panel.appendChild(el('button', { className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' }, onClick: () => feedCheckSheet.close() }, [t('action.cancel')]));
    feedCheckSheet.open();
    return;
  }

  // Group by batch+location
  const groupKey = (e) => `${e.batchId}|${e.locationId}`;
  const groups = {};
  for (const e of entries) {
    const key = groupKey(e);
    if (!groups[key]) groups[key] = { batchId: e.batchId, locationId: e.locationId, totalDelivered: 0 };
    groups[key].totalDelivered += e.quantity;
  }

  // Get last check data
  const allChecks = getAll('eventFeedChecks').filter(fc => fc.eventId === evt.id).sort((a, b) => (b.checkDate || b.createdAt || '').localeCompare(a.checkDate || a.createdAt || ''));
  const allCheckItems = getAll('eventFeedCheckItems');
  const lastCheck = allChecks[0];
  const lastCheckItems = lastCheck ? allCheckItems.filter(i => i.feedCheckId === lastCheck.id) : [];

  // Location + group context
  const pws = getAll('eventPaddockWindows').filter(pw => pw.eventId === evt.id && !pw.dateClosed);
  const loc = pws[0] ? getById('locations', pws[0].locationId) : null;
  const gws = getAll('eventGroupWindows').filter(gw => gw.eventId === evt.id && !gw.dateLeft);
  const groupNames = gws.map(gw => { const g = getById('groups', gw.groupId); return g?.name || ''; }).filter(Boolean).join(', ');

  // Build item state array
  const items = Object.entries(groups).map(([key, group]) => {
    const batch = getById('batches', group.batchId);
    const ftList = getAll('feedTypes');
    const ft = batch?.feedTypeId ? ftList.find(f => f.id === batch.feedTypeId) : null;
    const feedName = ft ? `${ft.name} (${unitLabel(batch?.unit)})` : (batch?.name || '?') + ` (${unitLabel(batch?.unit)})`;
    const startedUnits = group.totalDelivered;
    const lastItem = lastCheckItems.find(i => i.batchId === group.batchId && i.locationId === group.locationId);
    const lastCheckUnits = lastItem ? lastItem.remainingQuantity : null;
    const remaining = lastCheckUnits != null ? lastCheckUnits : startedUnits;
    return {
      key, batchId: group.batchId, locationId: group.locationId,
      feedName, startedUnits, lastCheckUnits, remaining,
      weightPerUnitKg: batch?.weightPerUnitKg ?? null,
      dmPct: batch?.dmPct ?? null,
      unit: batch?.unit || '',
      // DOM refs (set during render)
      unitsInput: null, pctInput: null, slider: null, consumedEl: null,
    };
  });

  // --- Header ---
  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '14px' } }, [
    el('div', { style: { fontSize: '15px', fontWeight: '600' } }, [t('feed.feedCheckTitle')]),
    el('button', { style: { fontSize: '12px', color: 'var(--text2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }, type: 'button', onClick: () => feedCheckSheet.close() }, [t('action.cancel')]),
  ]));

  // Context line
  if (loc || groupNames) {
    panel.appendChild(el('div', { style: { fontSize: '12px', color: 'var(--text2)', marginBottom: '8px' } }, [
      `\uD83C\uDF3F ${loc?.name || ''} \u00B7 ${groupNames}`,
    ]));
  }

  // Date/time row
  const dateInput = el('input', { type: 'date', value: todayStr, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const timeInput = el('input', { type: 'time', value: nowTime, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  panel.appendChild(el('div', { style: { display: 'flex', gap: '10px', marginBottom: '14px' } }, [
    el('div', { style: { flex: '1' } }, [
      el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, ['Date']),
      dateInput,
    ]),
    el('div', { style: { flex: '1' } }, [
      el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, ['Time']),
      timeInput,
    ]),
  ]));

  // --- Sync functions ---
  function updateUI(idx, skipUnits, skipPct) {
    const item = items[idx];
    const pct = item.startedUnits > 0 ? (item.remaining / item.startedUnits) * 100 : 0;
    if (!skipUnits && item.unitsInput) item.unitsInput.value = item.remaining.toFixed(2);
    if (!skipPct && item.pctInput) item.pctInput.value = pct.toFixed(1);
    if (item.slider) item.slider.value = pct.toFixed(1);
    // Consumed banner
    if (item.consumedEl) {
      clear(item.consumedEl);
      const consumed = Math.max(0, item.startedUnits - item.remaining);
      let consumedText = `${consumed.toFixed(2)} ${unitLabel(item.unit)}`;
      if (item.weightPerUnitKg && item.dmPct) {
        const dmiLbs = consumed * item.weightPerUnitKg * KG_TO_LBS * (item.dmPct / 100);
        consumedText += ` \u00B7 ~${Math.round(dmiLbs)} lbs DMI`;
      }
      item.consumedEl.appendChild(el('span', { style: { fontSize: '11px', color: 'var(--amber-d)' } }, [t('feed.feedCheckConsumed')]));
      item.consumedEl.appendChild(el('span', { style: { fontSize: '13px', fontWeight: '500', color: 'var(--amber-d)' } }, [consumedText]));
    }
  }

  function fcAdj(idx, delta) {
    const item = items[idx];
    item.remaining = Math.round(Math.max(0, Math.min(item.startedUnits, item.remaining + delta)) * 100) / 100;
    updateUI(idx);
  }

  function fcUnitsChanged(idx) {
    const item = items[idx];
    const val = parseFloat(item.unitsInput.value);
    if (!isNaN(val)) item.remaining = Math.max(0, Math.min(item.startedUnits, val));
    updateUI(idx, true);
  }

  function fcPctChanged(idx) {
    const item = items[idx];
    const pct = parseFloat(item.pctInput.value);
    if (!isNaN(pct)) item.remaining = Math.round(item.startedUnits * Math.max(0, Math.min(100, pct)) / 100 * 100) / 100;
    updateUI(idx, false, true);
  }

  function fcSliderChanged(idx) {
    const item = items[idx];
    const pct = parseFloat(item.slider.value);
    if (!isNaN(pct)) item.remaining = Math.round(item.startedUnits * pct / 100 * 100) / 100;
    updateUI(idx);
  }

  // --- Render item cards ---
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const units = unitLabel(item.unit);
    const pct = item.startedUnits > 0 ? (item.remaining / item.startedUnits) * 100 : 100;

    // Last check info
    let infoLine = `Started: ${item.startedUnits.toFixed(1)} ${units}`;
    if (item.lastCheckUnits != null && lastCheck) {
      const d = new Date(lastCheck.checkDate || lastCheck.createdAt);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
      const time = lastCheck.time || d.toTimeString().slice(0, 5);
      infoLine += ` \u00B7 Last check: ${item.lastCheckUnits.toFixed(2)} ${units} (${dayName} ${time})`;
    } else {
      infoLine += ` \u00B7 ${t('feed.feedCheckNoPrior')}`;
    }

    // Units input (stepper)
    item.unitsInput = el('input', {
      type: 'number', value: item.remaining.toFixed(2), step: '0.01', min: '0', max: item.startedUnits.toString(),
      style: { flex: '1', textAlign: 'center', border: 'none', fontSize: '16px', fontWeight: '500', padding: '8px 0', background: 'transparent', color: 'var(--text)', outline: 'none', width: '50px', fontFamily: 'inherit' },
    });
    item.unitsInput.addEventListener('input', () => fcUnitsChanged(idx));

    // Pct input
    item.pctInput = el('input', {
      type: 'number', value: pct.toFixed(1), min: '0', max: '100', step: '0.5',
      style: { width: '100%', padding: '10px 12px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '16px', fontWeight: '500', background: 'var(--bg)', textAlign: 'center', boxSizing: 'border-box', fontFamily: 'inherit', color: 'var(--text)' },
    });
    item.pctInput.addEventListener('input', () => fcPctChanged(idx));

    // Slider
    item.slider = el('input', {
      type: 'range', min: '0', max: '100', value: pct.toFixed(1), step: '0.5',
      style: { width: '100%', accentColor: '#BA7517' },
    });
    item.slider.addEventListener('input', () => fcSliderChanged(idx));

    // Consumed banner
    item.consumedEl = el('div', { style: { background: 'var(--amber-l)', borderRadius: '8px', padding: '8px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } });

    const card = el('div', { className: 'card', style: { padding: '14px', marginBottom: '10px' } }, [
      // Header
      el('div', { style: { marginBottom: '10px' } }, [
        el('div', { style: { fontSize: '13px', fontWeight: '500' } }, [item.feedName]),
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [infoLine]),
      ]),
      // Two-column input row
      el('div', { style: { display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '12px' } }, [
        // Left: remaining units stepper
        el('div', { style: { flex: '1' } }, [
          el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, [`Remaining ${units}`]),
          el('div', { style: { display: 'flex', alignItems: 'center', border: '0.5px solid var(--amber)', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg)' } }, [
            el('button', {
              style: { width: '36px', height: '38px', border: 'none', background: 'var(--amber-l)', color: 'var(--amber-d)', fontSize: '18px', cursor: 'pointer', fontWeight: '500', fontFamily: 'inherit' },
              type: 'button', onClick: () => fcAdj(idx, -0.10),
            }, ['\u2212']),
            item.unitsInput,
            el('button', {
              style: { width: '36px', height: '38px', border: 'none', background: 'var(--amber-l)', color: 'var(--amber-d)', fontSize: '18px', cursor: 'pointer', fontWeight: '500', fontFamily: 'inherit' },
              type: 'button', onClick: () => fcAdj(idx, 0.10),
            }, ['+']),
          ]),
        ]),
        // Right: remaining %
        el('div', { style: { flex: '1' } }, [
          el('label', { style: { fontSize: '11px', color: 'var(--text2)', display: 'block', marginBottom: '4px' } }, [t('feed.feedCheckRemainingPct')]),
          item.pctInput,
        ]),
      ]),
      // Slider
      el('div', { style: { marginBottom: '8px' } }, [
        item.slider,
        el('div', { style: { display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text3)', marginTop: '2px' } }, [
          el('span', {}, ['0%']), el('span', {}, ['50%']), el('span', {}, ['100%']),
        ]),
      ]),
      // Consumed banner
      item.consumedEl,
    ]);

    panel.appendChild(card);
    updateUI(idx); // Initialize consumed display
  }

  // Save button
  panel.appendChild(el('button', {
    style: { width: '100%', padding: '12px', fontSize: '14px', fontWeight: '600', borderRadius: '8px', border: 'none', background: 'var(--amber)', color: 'white', cursor: 'pointer', fontFamily: 'inherit', marginTop: '10px' },
    type: 'button',
    onClick: () => {
      const check = FeedCheckEntity.create({
        operationId, eventId: evt.id,
        checkDate: dateInput.value, time: timeInput.value || null,
      });
      add('eventFeedChecks', check, FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');

      for (const item of items) {
        const checkItem = FeedCheckItemEntity.create({
          operationId, feedCheckId: check.id,
          batchId: item.batchId, locationId: item.locationId,
          remainingQuantity: item.remaining,
        });
        add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
      }

      feedCheckSheet.close();
    },
  }, [t('feed.feedCheckSaveBtn')]));

  feedCheckSheet.open();
}
