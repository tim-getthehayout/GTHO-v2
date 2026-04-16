/** @file Feed check sheet — CP-28. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add } from '../../data/store.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';

// ---------------------------------------------------------------------------
// Feed Check (CP-28)
// ---------------------------------------------------------------------------

let feedCheckSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('feed-check-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'feed-check-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedCheckSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'feed-check-sheet-panel' }),
  ]));
}

export function openFeedCheckSheet(evt, operationId) {
  ensureSheetDOM();
  if (!feedCheckSheet) {
    feedCheckSheet = new Sheet('feed-check-sheet-wrap');
  }

  const panel = document.getElementById('feed-check-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Get all feed entries for this event, grouped by batch × location
  const entries = getAll('eventFeedEntries').filter(e => e.eventId === evt.id);
  if (!entries.length) {
    panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.feedCheckTitle')]));
    panel.appendChild(el('p', { className: 'form-hint' }, [t('feed.feedCheckEmpty')]));
    panel.appendChild(el('button', {
      className: 'btn btn-outline', style: { marginTop: 'var(--space-4)' },
      onClick: () => feedCheckSheet.close(),
    }, [t('action.cancel')]));
    return;
  }

  // Group entries by batch+location key
  const groupKey = (e) => `${e.batchId}|${e.locationId}`;
  const groups = {};
  for (const e of entries) {
    const key = groupKey(e);
    if (!groups[key]) groups[key] = { batchId: e.batchId, locationId: e.locationId, totalDelivered: 0 };
    groups[key].totalDelivered += e.quantity;
  }

  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.feedCheckTitle')]));

  // Date/time
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryDate')]));
  inputs.date = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'feed-check-date',
  });
  panel.appendChild(inputs.date);

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.deliveryTime')]));
  inputs.time = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'feed-check-time',
  });
  panel.appendChild(inputs.time);

  // One row per batch × location
  const itemInputs = [];
  for (const [key, group] of Object.entries(groups)) {
    const batch = getById('batches', group.batchId);
    const loc = getById('locations', group.locationId);
    const batchName = batch ? batch.name : '?';
    const locName = loc ? loc.name : '?';

    const remainingInput = el('input', {
      type: 'number', className: 'auth-input settings-input',
      value: '', placeholder: '0',
      'data-testid': `feed-check-item-${key.replace('|', '-')}`,
    });

    itemInputs.push({ key, batchId: group.batchId, locationId: group.locationId, input: remainingInput });

    panel.appendChild(el('div', {
      className: 'card-inset',
      style: { marginTop: 'var(--space-3)', padding: 'var(--space-3)' },
    }, [
      el('div', { style: { fontWeight: '500', fontSize: '13px' } }, [
        `${batchName} → ${locName}`,
      ]),
      el('div', { className: 'form-hint' }, [
        `${t('feed.feedCheckStarted')}: ${group.totalDelivered} ${batch?.unit || ''}`,
      ]),
      el('label', { className: 'form-label' }, [t('feed.feedCheckRemaining')]),
      remainingInput,
    ]));
  }

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.feedCheckNotes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input', value: '',
    'data-testid': 'feed-check-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'feed-check-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'feed-check-save',
      onClick: () => {
        clear(statusEl);
        try {
          // Create feed check parent
          const check = FeedCheckEntity.create({
            operationId,
            eventId: evt.id,
            date: inputs.date.value,
            time: inputs.time.value || null,
            notes: inputs.notes.value.trim() || null,
          });
          add('eventFeedChecks', check, FeedCheckEntity.validate,
            FeedCheckEntity.toSupabaseShape, 'event_feed_checks');

          // Create check items
          for (const item of itemInputs) {
            const remaining = parseFloat(item.input.value);
            if (isNaN(remaining)) continue;
            const checkItem = FeedCheckItemEntity.create({
              operationId,
              feedCheckId: check.id,
              batchId: item.batchId,
              locationId: item.locationId,
              remainingQuantity: remaining,
            });
            add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate,
              FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
          }

          feedCheckSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'feed-check-cancel',
      onClick: () => feedCheckSheet.close(),
    }, [t('action.cancel')]),
  ]));

  feedCheckSheet.open();
}
