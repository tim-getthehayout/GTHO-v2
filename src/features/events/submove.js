/** @file Sub-move open/close sheets and advance strip sheet — CP-18, OI-0006. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, closePaddockWindow } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import { createObservation, renderLocationPicker } from './index.js';
import { convert } from '../../utils/units.js';
import { renderPreGrazeCard } from '../observations/pre-graze-card.js';
import { renderPostGrazeCard } from '../observations/post-graze-card.js';

// ---------------------------------------------------------------------------
// Sub-move open sheet (CP-18)
// ---------------------------------------------------------------------------

let submoveOpenSheet = null;

function ensureSubmoveOpenDOM() {
  if (document.getElementById('submove-open-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'submove-open-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => submoveOpenSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'submove-open-sheet-panel' }),
  ]));
}

export function openSubmoveOpenSheet(evt, operationId) {
  ensureSubmoveOpenDOM();
  if (!submoveOpenSheet) {
    submoveOpenSheet = new Sheet('submove-open-sheet-wrap');
  }

  const panel = document.getElementById('submove-open-sheet-panel');
  if (!panel) return;
  clear(panel);

  const locations = getAll('locations').filter(l => !l.archived);
  const todayStr = new Date().toISOString().slice(0, 10);
  const selection = { locationId: null };
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.openWindowTitle')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateOpened')]));
  inputs.dateOpened = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'submove-open-date',
  });
  panel.appendChild(inputs.dateOpened);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeOpened')]));
  inputs.timeOpened = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'submove-open-time',
  });
  panel.appendChild(inputs.timeOpened);

  // Pre-graze observation card (OI-0112 surface #4). Rendered BEFORE the
  // location picker wiring so the picker's onSelect callback can late-bind
  // paddockAcres into the existing card via setPaddockAcres — OI-0114 NC-1.
  const farmSettings = getAll('farmSettings')[0] || null;
  const preGraze = renderPreGrazeCard({ farmSettings, paddockAcres: null, initialValues: {} });

  // Location picker
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.selectLocation')]));
  const locPickerEl = el('div', { 'data-testid': 'submove-open-location-picker' });
  renderLocationPicker(locPickerEl, locations, selection, {
    onSelect: (loc) => {
      // location.areaHectares → acres for the imperial-native BRC-1 calc.
      const acres = loc?.areaHectares != null
        ? convert(loc.areaHectares, 'area', 'toImperial')
        : null;
      preGraze.setPaddockAcres(acres);
    },
  });
  panel.appendChild(locPickerEl);

  panel.appendChild(preGraze.container);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'submove-open-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'submove-open-save',
      onClick: () => {
        clear(statusEl);
        if (!selection.locationId) {
          statusEl.appendChild(el('span', {}, [t('event.selectLocation')]));
          return;
        }
        const pgv = preGraze.validate();
        if (!pgv.valid) { statusEl.appendChild(el('span', {}, [pgv.errors.join(', ')])); return; }
        try {
          const pw = PaddockWindowEntity.create({
            operationId,
            eventId: evt.id,
            locationId: selection.locationId,
            dateOpened: inputs.dateOpened.value,
            timeOpened: inputs.timeOpened.value || null,
          });
          add('eventPaddockWindows', pw, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, selection.locationId, 'open', pw.id, new Date().toISOString(), preGraze.getValues());
          submoveOpenSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'submove-open-cancel',
      onClick: () => submoveOpenSheet.close(),
    }, [t('action.cancel')]),
  ]));

  submoveOpenSheet.open();
}

// ---------------------------------------------------------------------------
// Sub-move close sheet (CP-18)
// ---------------------------------------------------------------------------

let submoveCloseSheet = null;

function ensureSubmoveCloseDOM() {
  if (document.getElementById('submove-close-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'submove-close-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => submoveCloseSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'submove-close-sheet-panel' }),
  ]));
}

export function openSubmoveCloseSheet(paddockWindow, _operationId) {
  ensureSubmoveCloseDOM();
  if (!submoveCloseSheet) {
    submoveCloseSheet = new Sheet('submove-close-sheet-wrap');
  }

  const panel = document.getElementById('submove-close-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const loc = getById('locations', paddockWindow.locationId);
  const locName = loc ? loc.name : '';
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.closeWindowTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [locName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.dateClosed')]));
  inputs.dateClosed = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'submove-close-date',
  });
  panel.appendChild(inputs.dateClosed);

  // Time
  panel.appendChild(el('label', { className: 'form-label' }, [t('event.timeClosed')]));
  inputs.timeClosed = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'submove-close-time',
  });
  panel.appendChild(inputs.timeClosed);

  // Post-graze observation card (OI-0112 surface #5).
  const farmSettings2 = getAll('farmSettings')[0] || null;
  const postGraze = renderPostGrazeCard({ farmSettings: farmSettings2 });
  panel.appendChild(postGraze.container);

  // OI-0119: forced feed-check card when the event has any stored-feed
  // deliveries. Strikes a clean actual/estimated boundary on sub-move close.
  const eventFeedEntries = getAll('eventFeedEntries').filter(fe => fe.eventId === paddockWindow.eventId);
  const hasStoredFeed = eventFeedEntries.length > 0;
  const feedCheckInputs = []; // { batchId, locationId, input, unitLabel }
  if (hasStoredFeed) {
    panel.appendChild(el('div', {
      className: 'close-open-section-title',
      style: { marginTop: 'var(--space-4)' },
      'data-testid': 'submove-close-feed-check-title',
    }, [t('feed.feedCheck')]));
    panel.appendChild(el('div', { className: 'form-hint', style: { marginBottom: 'var(--space-2)' } }, [
      'Record remaining stored feed so consumption since the last check is locked in.',
    ]));

    const groups = {};
    for (const entry of eventFeedEntries) {
      const key = `${entry.batchId}|${entry.locationId}`;
      if (!groups[key]) groups[key] = { batchId: entry.batchId, locationId: entry.locationId, total: 0 };
      groups[key].total += (entry.quantity ?? 0);
    }

    for (const group of Object.values(groups)) {
      const batch = getById('batches', group.batchId);
      const groupLoc = getById('locations', group.locationId);
      const batchName = batch ? batch.name : '?';
      const groupLocName = groupLoc ? groupLoc.name : '?';
      const remainingInput = el('input', {
        type: 'number', className: 'auth-input settings-input',
        value: '0', placeholder: '0', min: '0',
        'data-testid': `submove-close-feed-${group.batchId}-${group.locationId}`,
      });
      feedCheckInputs.push({ batchId: group.batchId, locationId: group.locationId, input: remainingInput });
      panel.appendChild(el('div', {
        className: 'card-inset',
        style: { marginTop: 'var(--space-2)', padding: 'var(--space-3)' },
      }, [
        el('div', { style: { fontWeight: '500', fontSize: '13px' } }, [`${batchName} \u2192 ${groupLocName}`]),
        el('div', { className: 'form-hint' }, [
          `${t('feed.feedCheckStarted')}: ${group.total} ${batch?.unit || ''}`,
        ]),
        el('label', { className: 'form-label' }, [t('feed.feedCheckRemaining')]),
        remainingInput,
      ]));
    }
  }

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'submove-close-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'submove-close-save',
      onClick: () => {
        clear(statusEl);
        const pgv = postGraze.validate();
        if (!pgv.valid) { statusEl.appendChild(el('span', {}, [pgv.errors.join(', ')])); return; }

        // OI-0119: block Save when stored feed exists and any feed-check input
        // is blank or negative.
        if (hasStoredFeed) {
          for (const item of feedCheckInputs) {
            const v = item.input.value.trim();
            if (v === '' || Number.isNaN(Number(v)) || Number(v) < 0) {
              statusEl.appendChild(el('span', {}, ['Record remaining for every delivered feed before closing.']));
              return;
            }
          }
        }

        try {
          // OI-0095: terminal close — route through closePaddockWindow.
          closePaddockWindow(
            paddockWindow.locationId,
            paddockWindow.eventId,
            inputs.dateClosed.value,
            inputs.timeClosed.value || null,
          );
          createObservation(paddockWindow.operationId, paddockWindow.locationId, 'close', paddockWindow.id, new Date().toISOString(), postGraze.getValues());

          // OI-0119: write the feed check + items so DMI-8 converts the prior
          // interval's storedDmiKg from estimated → actual on re-read.
          if (hasStoredFeed && feedCheckInputs.length) {
            const check = FeedCheckEntity.create({
              operationId: paddockWindow.operationId,
              eventId: paddockWindow.eventId,
              date: inputs.dateClosed.value,
              time: inputs.timeClosed.value || null,
              isCloseReading: false,
            });
            add('eventFeedChecks', check,
              FeedCheckEntity.validate, FeedCheckEntity.toSupabaseShape, 'event_feed_checks');
            for (const item of feedCheckInputs) {
              const checkItem = FeedCheckItemEntity.create({
                operationId: paddockWindow.operationId,
                feedCheckId: check.id,
                batchId: item.batchId,
                locationId: item.locationId,
                remainingQuantity: Number(item.input.value) || 0,
              });
              add('eventFeedCheckItems', checkItem,
                FeedCheckItemEntity.validate, FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
            }
          }

          submoveCloseSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'submove-close-cancel',
      onClick: () => submoveCloseSheet.close(),
    }, [t('action.cancel')]),
  ]));

  submoveCloseSheet.open();
}

// ---------------------------------------------------------------------------
// Advance Strip (OI-0006)
// ---------------------------------------------------------------------------

let advanceStripSheet = null;

export function openAdvanceStripSheet(evt, operationId) {
  if (!advanceStripSheet) {
    advanceStripSheet = new Sheet('advance-strip-sheet-wrap');
  }

  const panel = document.getElementById('advance-strip-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Find the open strip graze window
  const allPWs = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id);
  const openStrip = allPWs.find(w => w.isStripGraze && !w.dateClosed);
  if (!openStrip) return;

  // Count strips in this group
  const stripGroupWindows = allPWs.filter(w => w.stripGroupId === openStrip.stripGroupId);
  const completedStrips = stripGroupWindows.filter(w => w.dateClosed).length;
  const currentStripNum = completedStrips + 1;
  // Estimate total from area_pct (each strip is same size)
  const totalStrips = openStrip.areaPct > 0 ? Math.round(100 / openStrip.areaPct) : 1;

  const loc = getById('locations', openStrip.locationId);
  const locName = loc ? loc.name : '';

  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.advanceStrip')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [
    t('event.stripOf', { current: currentStripNum, total: totalStrips }) + ' — ' + locName,
  ]));

  // Phase 1: Close current strip
  const closeSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.closeWindow')]),
  ]);
  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateClosed')]));
  inputs.dateClosed = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'advance-strip-date-closed',
  });
  closeSection.appendChild(inputs.dateClosed);
  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeClosed')]));
  inputs.timeClosed = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'advance-strip-time-closed',
  });
  closeSection.appendChild(inputs.timeClosed);
  panel.appendChild(closeSection);

  // Phase 2: Open next strip (if not ending early)
  const openSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.openWindow')]),
  ]);
  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateOpened')]));
  inputs.dateOpened = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'advance-strip-date-opened',
  });
  openSection.appendChild(inputs.dateOpened);
  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeOpened')]));
  inputs.timeOpened = el('input', {
    type: 'time', className: 'auth-input', value: '',
    'data-testid': 'advance-strip-time-opened',
  });
  openSection.appendChild(inputs.timeOpened);
  panel.appendChild(openSection);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'advance-strip-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'advance-strip-save',
      onClick: () => {
        clear(statusEl);
        try {
          // OI-0095: Advance Strip is the architectural exemplar for paddock splits.
          // Route the close through closePaddockWindow so the helper contract is uniform;
          // the open half uses add() directly because this UI lets the farmer enter
          // distinct close/open dates (e.g., strip grazing with a gap between strips).
          const { closedId } = closePaddockWindow(
            openStrip.locationId,
            evt.id,
            inputs.dateClosed.value,
            inputs.timeClosed.value || null,
          );
          if (closedId) {
            createObservation(operationId, openStrip.locationId, 'close', closedId, new Date().toISOString());
          }

          // Open next strip window
          const nextPW = PaddockWindowEntity.create({
            operationId,
            eventId: evt.id,
            locationId: openStrip.locationId,
            dateOpened: inputs.dateOpened.value,
            timeOpened: inputs.timeOpened.value || null,
            isStripGraze: true,
            stripGroupId: openStrip.stripGroupId,
            areaPct: openStrip.areaPct,
          });
          add('eventPaddockWindows', nextPW, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
          createObservation(operationId, openStrip.locationId, 'open', nextPW.id, new Date().toISOString());

          advanceStripSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.advanceStrip')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'advance-strip-end-early',
      onClick: () => {
        clear(statusEl);
        try {
          // OI-0095: terminal close (end strip graze early) — route through closePaddockWindow.
          closePaddockWindow(
            openStrip.locationId,
            evt.id,
            inputs.dateClosed.value,
            inputs.timeClosed.value || null,
          );
          createObservation(operationId, openStrip.locationId, 'close', openStrip.id, new Date().toISOString());
          advanceStripSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('event.endStripEarly')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'advance-strip-cancel',
      onClick: () => advanceStripSheet.close(),
    }, [t('action.cancel')]),
  ]));

  advanceStripSheet.open();
}
