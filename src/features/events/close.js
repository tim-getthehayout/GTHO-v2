import { poolWritesEnabled, liveFeedPools, writePoolCheck, poolExecutionKey } from '../feed/pool-ledger.js';
/** @file Close event sheet — CP-20/CP-30. Full version with feed check + confinement NPK. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, closeGroupWindow, closePaddockWindow, runDurableWrite } from '../../data/store.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import * as ManureTxEntity from '../../entities/manure-batch-transaction.js';
import { createObservation } from './index.js';
import { renderPostGrazeCard } from '../observations/post-graze-card.js';
import { checkWindowCloses } from './window-close-guard.js';
import { openDateConflictDialog } from './date-conflict-dialog.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { isConfinementLocation, wrapInactiveForage } from './confinement-forage-ui.js';

let closeEventSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('close-event-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'close-event-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => closeEventSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'close-event-sheet-panel' }),
  ]));
}

export function openCloseEventSheet(evt, operationId) {
  ensureSheetDOM();
  if (!closeEventSheet) {
    closeEventSheet = new Sheet('close-event-sheet-wrap');
  }

  const panel = document.getElementById('close-event-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = getLocalTodayStr();
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.closeEventTitle')]));

  // Date out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateOut')]));
  inputs.dateOut = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'close-event-date-out',
  });
  panel.appendChild(inputs.dateOut);

  // Time out
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeOut')]));
  inputs.timeOut = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'close-event-time-out',
  });
  panel.appendChild(inputs.timeOut);

  // Optional feed check (CP-30) — show if feed entries exist
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === evt.id);
  const feedCheckInputs = [];

  if (feedEntries.length) {
    panel.appendChild(el('div', {
      className: 'close-open-section-title',
      style: { marginTop: 'var(--space-4)' },
    }, [t('feed.feedCheck')]));

    // Group by batch × location
    const feedGroups = poolWritesEnabled() ? Object.fromEntries([...liveFeedPools(evt.id)].map(([,pool])=>[`${pool.feedTypeId}|${pool.locationId}`,{feedTypeId:pool.feedTypeId,locationId:pool.locationId,total:pool.q??'?',unit:pool.unit||'kg'}])) : {};
    for (const entry of poolWritesEnabled() ? [] : feedEntries) {
      const key = `${entry.batchId}|${entry.locationId}`;
      if (!feedGroups[key]) feedGroups[key] = { batchId: entry.batchId, locationId: entry.locationId, total: 0 };
      feedGroups[key].total += entry.quantity;
    }

    for (const [key, group] of Object.entries(feedGroups)) {
      const batch = getById('batches', group.batchId);
      const loc = getById('locations', group.locationId);
      const batchName = group.feedTypeId ? getById('feedTypes',group.feedTypeId)?.name || '?' : batch ? batch.name : '?';
      const locName = loc ? loc.name : '?';

      const remainingInput = el('input', {
        type: 'number', className: 'auth-input settings-input',
        value: '0', placeholder: '0',
        'data-testid': `close-event-feed-${key.replace('|', '-')}`,
      });
      feedCheckInputs.push({ batchId: group.batchId, feedTypeId:group.feedTypeId, unit:group.unit, locationId: group.locationId, input: remainingInput });

      panel.appendChild(el('div', {
        className: 'card-inset',
        style: { marginTop: 'var(--space-2)', padding: 'var(--space-3)' },
      }, [
        el('div', { style: { fontWeight: '500', fontSize: '13px' } }, [
          `${batchName} → ${locName}`,
        ]),
        el('div', { className: 'form-hint' }, [
          `${t('feed.feedCheckStarted')}: ${group.total} ${group.unit || batch?.unit || ''}`,
        ]),
        el('label', { className: 'form-label' }, [t('feed.feedCheckRemaining')]),
        remainingInput,
      ]));
    }
  }

  // Confinement NPK info
  const pws = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id);
  const confinementPWs = pws.filter(w => {
    const loc = getById('locations', w.locationId);
    return loc && loc.capturePercent && loc.capturePercent > 0;
  });
  if (confinementPWs.length) {
    panel.appendChild(el('div', {
      className: 'form-hint',
      style: { marginTop: 'var(--space-4)', fontStyle: 'italic' },
    }, ['Confinement NPK will be routed to manure batches on close.']));
  }

  // Post-graze observation card (OI-0112 surface #3).
  const farmSettings = getAll('farmSettings')[0] || null;
  const closingWindows = (getAll('eventPaddockWindows') || [])
    .filter((w) => w.eventId === evt.id && !w.dateClosed);
  const postGraze = renderPostGrazeCard({ farmSettings });
  const postGrazeWrap = el('div', { 'data-testid': 'close-event-postgraze' });
  const landWindows = closingWindows.filter((w) => !isConfinementLocation(getById('locations', w.locationId)));
  const confinementWindows = closingWindows.filter((w) => isConfinementLocation(getById('locations', w.locationId)));
  if (landWindows.length) postGrazeWrap.appendChild(postGraze.container);
  for (const pw of confinementWindows) {
    const loc = getById('locations', pw.locationId);
    const card = renderPostGrazeCard({ farmSettings });
    const node = el('div', {}, [el('div', { className: 'form-label' }, [loc?.name || pw.locationId]), card.container]);
    postGrazeWrap.appendChild(wrapInactiveForage(node, `close-event-postgraze-inactive-${pw.locationId}`));
  }
  panel.appendChild(postGrazeWrap);

  inputs.poolExecutionKey=poolExecutionKey(operationId,'close-pools');
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'close-event-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-red',
      'data-testid': 'close-event-save',
      onClick: () => executeClose(evt, operationId, inputs, feedCheckInputs, confinementPWs, statusEl, postGraze, landWindows),
    }, [t('event.closeEvent')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'close-event-cancel',
      onClick: () => closeEventSheet.close(),
    }, [t('action.cancel')]),
  ]));

  closeEventSheet.open();
}

function executeClose(evt, operationId, inputs, feedCheckInputs, confinementPWs, statusEl, postGraze, landWindows) {
  clear(statusEl);
  const dateOut = inputs.dateOut.value;
  const timeOut = inputs.timeOut.value || null;
  if (!dateOut) {
    statusEl.appendChild(el('span', {}, [t('validation.closeDateRequired')]));
    return;
  }

  if (postGraze && (landWindows ?? []).length) {
    const obsValidation = postGraze.validate();
    if (!obsValidation.valid) {
      statusEl.appendChild(el('span', {}, [obsValidation.errors.join(', ')]));
      return;
    }
  }

  // Re-close overlap warning: check if any group on this event is also on another open event
  const openGwsHere = getAll('eventGroupWindows').filter(gw => gw.eventId === evt.id && !gw.dateLeft);
  const conflicts = [];
  for (const gw of openGwsHere) {
    const otherOpenGws = getAll('eventGroupWindows').filter(
      g => g.groupId === gw.groupId && g.id !== gw.id && !g.dateLeft
    );
    for (const other of otherOpenGws) {
      const otherEvt = getById('events', other.eventId);
      if (otherEvt && !otherEvt.dateOut) {
        const group = getById('groups', gw.groupId);
        conflicts.push(`${group?.name || 'A group'} is also on "${otherEvt.name || 'another event'}" (still open)`);
      }
    }
  }
  if (conflicts.length) {
    const msg = conflicts.join('\n') + '\n\nClosing this event will close these groups here but leave them on the other event(s). Proceed?';
    if (!window.confirm(msg)) return;
  }

  // OI-0185 + OI-0186 — pre-flight every open source window's proposed close
  // BEFORE any write fires. On conflict, abort with zero writes and hand the
  // structured conflict list to the guided-correction dialog. The dialog
  // resumes the close (via onResume) after a one-tap fix or "Fix all"; the
  // re-entered executeClose runs the pre-flight again so a partial fix that
  // left a residual conflict simply re-opens the dialog.
  const closeConflicts = checkWindowCloses(evt.id, dateOut, timeOut);
  if (closeConflicts.length > 0) {
    openDateConflictDialog({
      conflicts: closeConflicts,
      operationId,
      event: evt,
      onResume: () => executeClose(evt, operationId, inputs, feedCheckInputs, confinementPWs, statusEl, postGraze, landWindows),
    });
    return;
  }

  try {
    const write=()=>{
    // 1. Create feed check if feed was delivered
    if(feedCheckInputs.length && poolWritesEnabled())writePoolCheck({operationId,eventId:evt.id,date:dateOut,time:timeOut,isCloseReading:true,readings:feedCheckInputs.map(row=>({feedTypeId:row.feedTypeId,locationId:row.locationId,remainingQuantity:row.input.value.trim()===''?NaN:Number(row.input.value),unit:row.unit}))});
    else if (feedCheckInputs.length) {
      const check = FeedCheckEntity.create({
        operationId,
        eventId: evt.id,
        date: dateOut,
        time: timeOut,
        isCloseReading: true,
      });
      add('eventFeedChecks', check, FeedCheckEntity.validate,
        FeedCheckEntity.toSupabaseShape, 'event_feed_checks');

      for (const item of feedCheckInputs) {
        const remaining = parseFloat(item.input.value) || 0;
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
    }

    // 2. Close all open paddock windows + create close observations (OI-0095: helper)
    const openPWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
    for (const pw of openPWs) {
      closePaddockWindow(pw.locationId, evt.id, dateOut, timeOut);
      if (isConfinementLocation(getById('locations', pw.locationId))) continue;
      createObservation(pw.operationId, pw.locationId, 'close', pw.id, new Date().toISOString(),
        postGraze ? postGraze.getValues() : {});
    }

    // 3. Close all open group windows (OI-0091: stamp live head/avg values)
    const openGWs = getAll('eventGroupWindows').filter(w => w.eventId === evt.id && !w.dateLeft);
    for (const gw of openGWs) {
      closeGroupWindow(gw.groupId, evt.id, dateOut, timeOut);
    }

    // 4. Set event date_out
    update('events', evt.id, {
      dateOut,
      timeOut,
    }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

    // 5. Confinement NPK routing — create manure_batch_transaction for capture locations
    // volumeKg=0 is a deliberate placeholder (OI-0014 verified 2026-04-13):
    // Real volume = excretion_rate × avg_weight × head_count × duration × capture_pct/100
    // This requires NPK-1 calc inputs (group windows, animal classes, event duration).
    // Reports will compute via NPK-1 at display time, not from this stored value.
    // The stored record's purpose is to link the event to the manure batch for tracing.
    for (const pw of confinementPWs) {
      // Find or use a default manure batch for this location
      const manureBatches = getAll('manureBatches').filter(
        mb => mb.sourceLocationId === pw.locationId
      );
      if (manureBatches.length) {
        const tx = ManureTxEntity.create({
          operationId,
          batchId: manureBatches[0].id,
          type: 'input',
          transactionDate: dateOut,
          volumeKg: 0, // Populated by calc engine
          sourceEventId: evt.id,
          notes: 'Auto-created on event close (confinement capture)',
        });
        add('manureBatchTransactions', tx, ManureTxEntity.validate,
          ManureTxEntity.toSupabaseShape, 'manure_batch_transactions');
      }
    }

    return evt.id;
    };
    if(poolWritesEnabled())runDurableWrite(inputs.poolExecutionKey,write);else write();
    closeEventSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}
