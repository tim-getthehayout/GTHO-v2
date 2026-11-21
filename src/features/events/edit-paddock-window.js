/** @file Paddock Window Edit Dialog — SP-10 §12. Edit dates, area, strip-graze config. Resolves OI-0064. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, splitPaddockWindow, getSyncAdapter } from '../../data/store.js';
import { convert } from '../../utils/units.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as PaddockObsEntity from '../../entities/paddock-observation.js';
import { renderPreGrazeCard } from '../observations/pre-graze-card.js';
import { renderPostGrazeCard } from '../observations/post-graze-card.js';
import { getEventStartFloorExcluding } from './event-start.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { isConfinementLocation, wrapInactiveForage } from './confinement-forage-ui.js';
import { showToast } from '../../ui/toast.js';
import { listUnacked } from '../../data/unacked.js';

let editPwSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('edit-pw-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'edit-pw-wrap', style: { zIndex: '220' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => editPwSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'edit-pw-panel' }),
  ]));
}


/** Fresh open/close observation for this paddock window (sourceId first, else newest). */
function findEventObservation(locationId, pwId, type) {
  const allObs = getAll('paddockObservations')
    .filter(o => o.locationId === locationId && o.type === type && o.source === 'event');
  return allObs.find(o => o.sourceId === pwId)
    || allObs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
    || null;
}

/**
 * Persist pre/post-graze card values to paddock_observations.
 * Returns the saved record. Throws on validation / storage / missing enqueue mark.
 * Never reports success unless local save + sync enqueue (when adapter present) succeeded.
 */
function persistObservationCard({ card, existingObs, operationId, locationId, pwId, type }) {
  const values = card.getValues();
  let saved;
  if (existingObs) {
    saved = update('paddockObservations', existingObs.id, values,
      PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
  } else {
    const newObs = PaddockObsEntity.create({
      operationId,
      locationId,
      observedAt: new Date().toISOString(),
      type,
      source: 'event',
      sourceId: pwId,
      ...values,
    });
    saved = add('paddockObservations', newObs,
      PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
  }
  const adapter = getSyncAdapter();
  if (adapter && typeof adapter.enqueueWrite === 'function') {
    const marked = listUnacked().some(m => m.table === 'paddock_observations' && m.id === saved.id);
    if (!marked) {
      throw new Error('Observation saved locally but was not queued for sync');
    }
  }
  return saved;
}

/**
 * Open the paddock window edit dialog.
 * @param {object} pw — event_paddock_window record
 * @param {object} event — parent event
 * @param {string} operationId
 */
export function openEditPaddockWindowDialog(pw, event, operationId) {
  ensureSheetDOM();
  if (!editPwSheet) editPwSheet = new Sheet('edit-pw-wrap');
  const panel = document.getElementById('edit-pw-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const loc = getById('locations', pw.locationId);
  const locName = loc?.name || 'Paddock';
  const isClosed = !!pw.dateClosed;

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Edit paddock window']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [locName]));

  // Date opened + time
  const dateOpenedInput = el('input', { type: 'date', value: pw.dateOpened || '' });
  const timeOpenedInput = el('input', { type: 'time', value: pw.timeOpened || '' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date opened']), dateOpenedInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time opened ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeOpenedInput]),
  ]));

  // Date closed + time (only if closed)
  let dateClosedInput = null, timeClosedInput = null;
  if (isClosed) {
    dateClosedInput = el('input', { type: 'date', value: pw.dateClosed || '' });
    timeClosedInput = el('input', { type: 'time', value: pw.timeClosed || '' });
    panel.appendChild(el('div', { className: 'two' }, [
      el('div', { className: 'field' }, [el('label', {}, ['Date closed']), dateClosedInput]),
      el('div', { className: 'field' }, [el('label', {}, ['Time closed ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeClosedInput]),
    ]));
  }

  // Area % + strip graze toggle
  const areaPctInput = el('input', { type: 'number', min: '1', max: '100', step: '1', value: pw.areaPct ?? 100 });
  const stripCheck = el('input', { type: 'checkbox', style: { width: '18px', height: '18px', accentColor: 'var(--green)' } });
  if (pw.isStripGraze) stripCheck.checked = true;
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Area %']), areaPctInput]),
    el('div', { className: 'field' }, [
      el('label', { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } }, [stripCheck, 'Strip graze']),
    ]),
  ]));
  if (!isClosed) {
    // OI-0095: editing area_pct / is_strip_graze on an open window splits the window so
    // the prior area is preserved as historical truth.
    panel.appendChild(el('div', { className: 'form-hint', style: { fontSize: '11px', color: 'var(--text2)', marginBottom: 'var(--space-3)' } }, [
      'Saving creates a new window from today forward. The prior area is preserved in the grazing history.',
    ]));
  }

  // OI-0118: pre-graze + post-graze observation cards.
  // OI-0124 Phase 1: use OI-0075 fallback — Location entity field is areaHectares.
  const farmSettings = getAll('farmSettings')[0] || null;
  const locHa = loc?.areaHectares ?? loc?.areaHa;
  const paddockAcres = locHa != null
    ? convert(locHa, 'area', 'toImperial')
    : null;

  // Pre-graze renders on open AND closed windows — historical pre-graze is
  // editable here (Event Detail no longer duplicates inline pre-graze cards).
  let preGrazeObs = findEventObservation(pw.locationId, pw.id, 'open');

  const preGrazeCard = renderPreGrazeCard({
    farmSettings,
    paddockAcres,
    initialValues: preGrazeObs ? {
      forageHeightCm: preGrazeObs.forageHeightCm,
      forageCoverPct: preGrazeObs.forageCoverPct,
      forageQuality: preGrazeObs.forageQuality,
      forageCondition: preGrazeObs.forageCondition,
      baleRingResidueCount: preGrazeObs.baleRingResidueCount,
      notes: preGrazeObs.notes,
    } : {},
  });

  const preGrazeSavedEl = el('span', {
    style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' },
    'data-testid': `edit-pw-pregraze-saved-${pw.id}`,
  }, [t('settings.saved')]);
  const preGrazeSaveBtn = el('button', {
    className: 'btn btn-outline btn-xs',
    'data-testid': `edit-pw-pregraze-save-${pw.id}`,
    onClick: () => {
      try {
        preGrazeObs = findEventObservation(pw.locationId, pw.id, 'open');
        preGrazeObs = persistObservationCard({
          card: preGrazeCard,
          existingObs: preGrazeObs,
          operationId,
          locationId: pw.locationId,
          pwId: pw.id,
          type: 'open',
        });
        preGrazeSavedEl.style.opacity = '1';
        setTimeout(() => { preGrazeSavedEl.style.opacity = '0'; }, 2000);
      } catch (err) {
        showToast(err?.message || t('event.saveFailed'), 'edit-pw-pregraze-save-error');
      }
    },
  }, [t('action.save')]);

  const preGrazeWrap = el('div', {
    className: 'card',
    style: { marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' },
    'data-testid': `edit-pw-pregraze-${pw.id}`,
  }, [
    preGrazeCard.container,
    el('div', { style: { display: 'flex', alignItems: 'center', marginTop: '8px' } }, [
      preGrazeSaveBtn, preGrazeSavedEl,
    ]),
  ]);
  panel.appendChild(isConfinementLocation(loc)
    ? wrapInactiveForage(preGrazeWrap, `edit-pw-pregraze-inactive-${pw.id}`)
    : preGrazeWrap);

  // Post-graze only on closed windows (Event Detail no longer duplicates inline cards).
  let postGrazeCard = null;
  let postGrazeObs = null;
  if (isClosed) {
    postGrazeObs = findEventObservation(pw.locationId, pw.id, 'close');

    postGrazeCard = renderPostGrazeCard({
      farmSettings,
      initialValues: postGrazeObs ? {
        residualHeightCm: postGrazeObs.residualHeightCm,
        recoveryMinDays: postGrazeObs.recoveryMinDays,
        recoveryMaxDays: postGrazeObs.recoveryMaxDays,
        notes: postGrazeObs.notes,
      } : {},
    });

    const postGrazeSavedEl = el('span', {
      style: { fontSize: '11px', color: 'var(--color-green-base)', opacity: '0', transition: 'opacity 0.3s', marginLeft: '8px' },
      'data-testid': `edit-pw-postgraze-saved-${pw.id}`,
    }, [t('settings.saved')]);
    const postGrazeSaveBtn = el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': `edit-pw-postgraze-save-${pw.id}`,
      onClick: () => {
        try {
          postGrazeObs = findEventObservation(pw.locationId, pw.id, 'close');
          postGrazeObs = persistObservationCard({
            card: postGrazeCard,
            existingObs: postGrazeObs,
            operationId,
            locationId: pw.locationId,
            pwId: pw.id,
            type: 'close',
          });
          postGrazeSavedEl.style.opacity = '1';
          setTimeout(() => { postGrazeSavedEl.style.opacity = '0'; }, 2000);
        } catch (err) {
          showToast(err?.message || t('event.saveFailed'), 'edit-pw-postgraze-save-error');
        }
      },
    }, [t('action.save')]);

    const postGrazeWrap = el('div', {
      className: 'card',
      style: { marginBottom: 'var(--space-3)' },
      'data-testid': `edit-pw-postgraze-${pw.id}`,
    }, [
      postGrazeCard.container,
      el('div', { style: { display: 'flex', alignItems: 'center', marginTop: '8px' } }, [
        postGrazeSaveBtn, postGrazeSavedEl,
      ]),
    ]);
    panel.appendChild(isConfinementLocation(loc)
      ? wrapInactiveForage(postGrazeWrap, `edit-pw-postgraze-inactive-${pw.id}`)
      : postGrazeWrap);
  }

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  /**
   * Persist window fields + observation cards.
   * @param {{ close?: boolean }} opts — green Save closes; blur must NOT close
   *   (closing on blur raced the small-card Save tap on iOS and silently dropped forage).
   * @returns {boolean} true when window + observation writes succeeded
   */
  function saveChanges(opts = {}) {
    const shouldClose = opts.close === true;
    clear(statusEl);
    const newDateOpened = dateOpenedInput.value;
    const newDateClosed = dateClosedInput?.value || null;
    const newAreaPct = parseInt(areaPctInput.value, 10) || 100;
    const newIsStrip = stripCheck.checked;

    // Range guards
    if (!newDateOpened) { statusEl.appendChild(el('span', {}, ['Date opened is required'])); return false; }
    // Floor the new open date against the earliest OTHER child window — if this
    // paddock is currently the anchor, moving its open date later is allowed so
    // long as it doesn't move the event start past a sibling's opening.
    // `getEventStartFloorExcluding` returns `{ date, time, name }` — compare
    // against `.date`, not the object. `string < object` coerced the object to
    // `"[object Object]"` which sorts AFTER any "2026-…" string, so the guard
    // fired unconditionally on every multi-window event.
    const floorDate = getEventStartFloorExcluding(event.id, pw.id, 'paddock');
    if (floorDate && newDateOpened < floorDate.date) { statusEl.appendChild(el('span', {}, ["Paddock can't open before the event started"])); return false; }
    if (event.dateOut && newDateOpened > event.dateOut) { statusEl.appendChild(el('span', {}, ["Paddock can't open after the event closed"])); return false; }
    if (newDateClosed && newDateClosed < newDateOpened) { statusEl.appendChild(el('span', {}, ['Close date must be after open date'])); return false; }
    if (event.dateOut && newDateClosed && newDateClosed > event.dateOut) { statusEl.appendChild(el('span', {}, ["Paddock can't stay open after the event closed"])); return false; }

    // Same-paddock overlap check
    const siblings = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && w.locationId === pw.locationId && w.id !== pw.id);
    for (const sib of siblings) {
      const sibStart = sib.dateOpened;
      const sibEnd = sib.dateClosed || '9999-12-31';
      const newEnd = newDateClosed || '9999-12-31';
      if (newDateOpened < sibEnd && newEnd > sibStart) {
        statusEl.appendChild(el('span', {}, ['This paddock already has a window during that range']));
        return false;
      }
    }

    try {
      // On an OPEN window, if areaPct / isStripGraze changed, route through
      // splitPaddockWindow so the prior state is preserved as historical truth. Metadata
      // edits (dateOpened, timeOpened) stay as direct update(). On a CLOSED window, direct
      // update() is the historical-correction escape hatch for all fields.
      if (!isClosed) {
        const stateChanged = (newAreaPct !== (pw.areaPct ?? 100)) || (newIsStrip !== !!pw.isStripGraze);
        if (stateChanged) {
          const todayStr = getLocalTodayStr();
          const newState = { areaPct: newAreaPct, isStripGraze: newIsStrip };
          if (newIsStrip && !pw.isStripGraze) {
            // Turning strip-graze on: fresh stripGroupId
            newState.stripGroupId = crypto.randomUUID();
          } else if (!newIsStrip && pw.isStripGraze) {
            // Turning strip-graze off: clear stripGroupId, reset areaPct to 100 unless explicitly set
            newState.stripGroupId = null;
          }
          splitPaddockWindow(pw.locationId, event.id, todayStr, null, newState);
        }
        // Apply metadata-only changes (dateOpened/timeOpened) to the window the farmer
        // is editing. If a split fired, pw.id is the closed row now; the metadata edit
        // on the closed row is still legitimate (farmer may correct the dateOpened of
        // the original window).
        const metaChanges = {
          dateOpened: newDateOpened,
          timeOpened: timeOpenedInput.value || null,
        };
        if (metaChanges.dateOpened !== pw.dateOpened || metaChanges.timeOpened !== pw.timeOpened) {
          update('eventPaddockWindows', pw.id, metaChanges, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
        }
      } else {
        const changes = {
          dateOpened: newDateOpened,
          timeOpened: timeOpenedInput.value || null,
          areaPct: newAreaPct,
          isStripGraze: newIsStrip,
          dateClosed: newDateClosed,
          timeClosed: timeClosedInput?.value || null,
        };
        update('eventPaddockWindows', pw.id, changes, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      }

      // Main Save must also persist forage — previously only windows were written,
      // so green Save / blur silently dropped pre-graze (and post-graze) edits.
      if (!isConfinementLocation(loc)) {
        preGrazeObs = persistObservationCard({
          card: preGrazeCard,
          existingObs: findEventObservation(pw.locationId, pw.id, 'open'),
          operationId,
          locationId: pw.locationId,
          pwId: pw.id,
          type: 'open',
        });
        if (postGrazeCard) {
          postGrazeObs = persistObservationCard({
            card: postGrazeCard,
            existingObs: findEventObservation(pw.locationId, pw.id, 'close'),
            operationId,
            locationId: pw.locationId,
            pwId: pw.id,
            type: 'close',
          });
        }
      }
    } catch (err) {
      const msg = err?.message || t('event.saveFailed');
      statusEl.appendChild(el('span', {}, [msg]));
      showToast(msg, 'edit-pw-save-error');
      return false;
    }

    if (shouldClose) editPwSheet.close();
    return true;
  }

  // Auto-save window+forage on blur — but do NOT close. Closing here raced the
  // small-card Save tap (blur fires first on iOS) and dropped forage edits.
  const saveOnBlur = () => { saveChanges({ close: false }); };
  dateOpenedInput.addEventListener('blur', saveOnBlur);
  if (dateClosedInput) dateClosedInput.addEventListener('blur', saveOnBlur);
  areaPctInput.addEventListener('blur', saveOnBlur);

  // Buttons
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '14px' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': `edit-pw-save-${pw.id}`,
      onClick: () => { saveChanges({ close: true }); },
    }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => editPwSheet.close() }, ['Cancel']),
  ]));

  // Reopen action (OI-0064 — for closed windows)
  if (isClosed) {
    panel.appendChild(el('div', { style: { marginTop: '10px' } }, [
      el('button', { className: 'btn btn-outline btn-sm', style: { width: '100%' }, onClick: () => {
        // OI-0095: same-paddock overlap guard — block if any OTHER PW on this location
        // is currently open (any event). Prevents two overlapping open windows on the
        // same paddock.
        const sameLocationOpen = getAll('eventPaddockWindows').find(w =>
          w.locationId === pw.locationId && w.id !== pw.id && !w.dateClosed,
        );
        if (sameLocationOpen) {
          window.alert('Cannot reopen — this paddock has an open window on another event. Close that first.');
          return;
        }
        if (!window.confirm(`Reopen ${locName} on this event? Animals will be recorded as on this paddock from ${pw.dateOpened} with no end date.`)) return;
        update('eventPaddockWindows', pw.id, { dateClosed: null, timeClosed: null }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
        editPwSheet.close();
      } }, ['Reopen paddock window']),
    ]));
  }

  // Delete window
  panel.appendChild(el('div', { style: { marginTop: '8px', paddingTop: '12px', borderTop: '0.5px solid var(--border)' } }, [
    el('button', { className: 'btn btn-outline btn-sm', style: { color: 'var(--red)', borderColor: 'var(--red)', width: '100%' }, onClick: () => {
      // Guard: can't delete last open paddock on active event
      if (!isClosed) {
        const openPws = getAll('eventPaddockWindows').filter(w => w.eventId === event.id && !w.dateClosed);
        if (openPws.length <= 1) { window.alert('Cannot delete the last open paddock window on an active event.'); return; }
      }
      if (!window.confirm(`Delete this paddock window? Animals will no longer be recorded as having been on ${locName} from ${pw.dateOpened} to ${pw.dateClosed || 'now'}.`)) return;
      remove('eventPaddockWindows', pw.id, 'event_paddock_windows');
      editPwSheet.close();
    } }, ['Delete window']),
  ]));

  editPwSheet.open();
}
