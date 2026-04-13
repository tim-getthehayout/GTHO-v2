/** @file Deliver feed sheet — CP-27. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as BatchEntity from '../../entities/batch.js';

// ---------------------------------------------------------------------------
// Deliver Feed (CP-27)
// ---------------------------------------------------------------------------

let deliverFeedSheet = null;

export function openDeliverFeedSheet(evt, operationId) {
  if (!deliverFeedSheet) {
    deliverFeedSheet = new Sheet('deliver-feed-sheet-wrap');
  }

  const panel = document.getElementById('deliver-feed-sheet-panel');
  if (!panel) return;
  clear(panel);

  const batches = getAll('batches').filter(b => !b.archived && b.remaining > 0);
  const activePWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};
  const selection = { batchId: null, locationId: null };

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.deliverFeedTitle')]));

  if (!batches.length) {
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.noBatches')]));
    panel.appendChild(el('button', {
      className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' },
      onClick: () => deliverFeedSheet.close(),
    }, [t('action.cancel')]));
    return;
  }

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryDate')]));
  inputs.date = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'deliver-feed-date',
  });
  panel.appendChild(inputs.date);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryTime')]));
  inputs.time = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'deliver-feed-time',
  });
  panel.appendChild(inputs.time);

  // Batch selector
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.selectBatch')]));
  const batchPickerEl = el('div', { 'data-testid': 'deliver-feed-batch-picker' });
  for (const batch of batches) {
    const ftList = getAll('feedTypes');
    const ft = ftList.find(f => f.id === batch.feedTypeId);
    const ftName = ft ? ft.name : '';
    batchPickerEl.appendChild(el('div', {
      className: `loc-picker-item${selection.batchId === batch.id ? ' selected' : ''}`,
      'data-testid': `deliver-feed-batch-${batch.id}`,
      onClick: () => {
        selection.batchId = batch.id;
        // Re-render picker selection state
        for (const child of batchPickerEl.children) {
          child.classList.remove('selected');
        }
        batchPickerEl.querySelector(`[data-testid="deliver-feed-batch-${batch.id}"]`)?.classList.add('selected');
      },
    }, [
      el('div', {}, [
        el('span', { style: { fontWeight: '500' } }, [batch.name]),
        el('div', { className: 'window-detail' }, [
          `${ftName} · ${batch.remaining} ${batch.unit} remaining`,
        ]),
      ]),
    ]));
  }
  panel.appendChild(batchPickerEl);

  // Paddock selector (from active paddock windows)
  if (activePWs.length > 1) {
    panel.appendChild(el('label', { className: 'form-label' }, [t('feed.selectPaddock')]));
    const paddockPickerEl = el('div', { 'data-testid': 'deliver-feed-paddock-picker' });
    for (const pw of activePWs) {
      const loc = getById('locations', pw.locationId);
      const locName = loc ? loc.name : '?';
      paddockPickerEl.appendChild(el('div', {
        className: `loc-picker-item${selection.locationId === pw.locationId ? ' selected' : ''}`,
        'data-testid': `deliver-feed-paddock-${pw.locationId}`,
        onClick: () => {
          selection.locationId = pw.locationId;
          for (const child of paddockPickerEl.children) {
            child.classList.remove('selected');
          }
          paddockPickerEl.querySelector(`[data-testid="deliver-feed-paddock-${pw.locationId}"]`)?.classList.add('selected');
        },
      }, [el('span', {}, [locName])]));
    }
    panel.appendChild(paddockPickerEl);
  } else if (activePWs.length === 1) {
    selection.locationId = activePWs[0].locationId;
  }

  // Quantity with ±0.5 adjusters
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryQty')]));
  inputs.quantity = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '1',
    step: '0.5', min: '0.5',
    'data-testid': 'deliver-feed-quantity',
  });
  const qtyRow = el('div', { style: { display: 'flex', gap: 'var(--space-2)', alignItems: 'center' } }, [
    el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'deliver-feed-qty-minus',
      onClick: () => {
        const val = parseFloat(inputs.quantity.value) || 0;
        if (val > 0.5) inputs.quantity.value = (val - 0.5).toString();
      },
    }, ['-0.5']),
    inputs.quantity,
    el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': 'deliver-feed-qty-plus',
      onClick: () => {
        const val = parseFloat(inputs.quantity.value) || 0;
        inputs.quantity.value = (val + 0.5).toString();
      },
    }, ['+0.5']),
  ]);
  panel.appendChild(qtyRow);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'deliver-feed-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'deliver-feed-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.batchId) {
          statusEl.appendChild(el('span', {}, [t('feed.selectBatch')]));
          return;
        }
        if (!selection.locationId) {
          statusEl.appendChild(el('span', {}, [t('feed.selectPaddock')]));
          return;
        }
        const qty = parseFloat(inputs.quantity.value);
        if (!qty || qty <= 0) {
          statusEl.appendChild(el('span', {}, ['Quantity must be greater than 0']));
          return;
        }
        try {
          // Create feed entry
          const entry = FeedEntryEntity.create({
            operationId,
            eventId: evt.id,
            batchId: selection.batchId,
            locationId: selection.locationId,
            date: inputs.date.value,
            time: inputs.time.value || null,
            quantity: qty,
          });
          add('eventFeedEntries', entry, FeedEntryEntity.validate,
            FeedEntryEntity.toSupabaseShape, 'event_feed_entries');

          // Decrement batch remaining
          const batch = getById('batches', selection.batchId);
          if (batch) {
            const newRemaining = Math.max(0, batch.remaining - qty);
            update('batches', batch.id, { remaining: newRemaining },
              BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
          }

          deliverFeedSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'deliver-feed-cancel',
      onClick: () => deliverFeedSheet.close(),
    }, [t('action.cancel')]),
  ]));

  deliverFeedSheet.open();
}
