/** @file Place wizard — OI-0163.
 *
 * Entry point for placing an unplaced group on a destination paddock or
 * adding it to an existing event. Lives separately from `move-wizard.js`
 * so the place flow has no notion of a parent event — the seam is enforced
 * at the file boundary, not by null checks. Step 1 + Step 2 + the
 * destination-creation helpers are imported from `wizard-shared.js`; this
 * orchestrator builds Step 3 (open destination only) and runs steps 6/7/9
 * of V2_UX_FLOWS.md §1.6 on Save (no close, no feed transfer).
 *
 * See OPEN_ITEMS.md → OI-0163 for full design rationale (option-2 split).
 */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById } from '../../data/store.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { logger } from '../../utils/logger.js';
import { convert } from '../../utils/units.js';
import { renderPreGrazeCard } from '../observations/pre-graze-card.js';
import { showToast } from '../../ui/toast.js';
import {
  renderStep1, renderStep2, createDestinationEvent, joinExistingEvent,
} from './wizard-shared.js';

let placeWizardSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('place-wizard-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'place-wizard-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => placeWizardSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'place-wizard-sheet-panel' }),
  ]));
}

/**
 * Open the place wizard for an unplaced group.
 *
 * @param {string} groupId
 * @param {string} operationId
 * @param {string} farmId - operation's active farm; used as the Step 2
 *   farm-chip default
 */
export function openPlaceWizard(groupId, operationId, farmId) {
  // Pre-open empty-group guard. A group with zero active memberships has
  // nothing to place; surface a toast and abort instead of letting the
  // wizard open onto a no-op Save (the destination GW write would skip
  // because headCount < 1, leaving the destination event/paddock with
  // zero groups attached).
  const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === groupId && !m.dateLeft);
  if (memberships.length === 0) {
    showToast(t('group.placeEmptyGroupWarning'));
    return;
  }

  ensureSheetDOM();
  if (!placeWizardSheet) {
    placeWizardSheet = new Sheet('place-wizard-sheet-wrap');
  }

  const panel = document.getElementById('place-wizard-sheet-panel');
  if (!panel) return;
  clear(panel);

  const group = getById('groups', groupId);
  const todayStr = new Date().toISOString().slice(0, 10);

  const state = {
    step: 1,
    groupId,
    destType: null,
    locationId: null,
    existingEventId: null,
    destFarmId: farmId,
    stripGraze: false,
    stripSizePct: 100,
    stripCount: 1,
    dateIn: todayStr,
    timeIn: '',
    // No close-side fields. Place flow has nothing to vacate, so dateOut /
    // timeOut / dateInTouched / timeInTouched do not exist on this state.
  };

  function render() {
    clear(panel);

    panel.appendChild(el('div', { className: 'wiz-dots' }, [
      el('span', { className: `wiz-dot${state.step >= 1 ? ' active' : ''}${state.step > 1 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 2 ? ' active' : ''}${state.step > 2 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 3 ? ' active' : ''}` }),
    ]));

    if (state.step === 1) {
      renderStep1(
        panel, state, render,
        () => placeWizardSheet?.close(),
        t('event.placeStep1Title', { group: group?.name || '' }),
      );
    } else if (state.step === 2) {
      // Pass null as the source so the existing-events filter in shared
      // step 2 includes every open event (place flow has no event to
      // exclude from the candidate list).
      renderStep2(panel, state, render, operationId, null);
    } else {
      renderStep3(panel, state, group, operationId, farmId, render);
    }
  }

  render();
  placeWizardSheet.open();
}

function renderStep3(panel, state, group, operationId, farmId, parentRender) {
  const inputs = {};

  const destLoc = (state.destType === 'new' && state.locationId)
    ? getById('locations', state.locationId)
    : null;
  const destLocationType = destLoc?.type ?? null;

  // Title: "Open at {location}" for new, "Add {group} to {location}" for
  // join. The join target's location comes from the existing event's open
  // paddock window (every active event has at least one).
  let titleText;
  if (state.destType === 'new') {
    titleText = t('event.placeStep3Title', { location: destLoc?.name || '' });
  } else {
    const joinPW = getAll('eventPaddockWindows').find(w => w.eventId === state.existingEventId && !w.dateClosed);
    const joinLoc = joinPW ? getById('locations', joinPW.locationId) : null;
    titleText = t('event.placeStep3TitleJoin', { group: group?.name || '', location: joinLoc?.name || '' });
  }
  panel.appendChild(el('h2', {
    className: 'wizard-step-title',
    'data-testid': 'place-wizard-step-3-title',
  }, [titleText]));

  const openSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.openDest')]),
  ]);

  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateIn')]));
  inputs.dateIn = el('input', {
    type: 'date', className: 'auth-input', value: state.dateIn,
    'data-testid': 'place-wizard-date-in',
  });
  inputs.dateIn.addEventListener('input', () => { state.dateIn = inputs.dateIn.value; });
  openSection.appendChild(inputs.dateIn);

  openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
  inputs.timeIn = el('input', {
    type: 'time', className: 'auth-input', value: state.timeIn,
    'data-testid': 'place-wizard-time-in',
  });
  inputs.timeIn.addEventListener('input', () => { state.timeIn = inputs.timeIn.value; });
  openSection.appendChild(inputs.timeIn);

  // Pre-graze card — only on new + land. Confinement destinations (no
  // residual-height meaning) and the join branch (existing event already
  // has a pre-graze obs from when its paddock window opened) skip it.
  let preGraze = null;
  const farmSettings = getAll('farmSettings')[0] || null;
  if (state.destType === 'new' && destLocationType === 'land') {
    const destLocHa = destLoc?.areaHectares ?? destLoc?.areaHa;
    const paddockAcres = destLocHa != null ? convert(destLocHa, 'area', 'toImperial') : null;
    preGraze = renderPreGrazeCard({ farmSettings, paddockAcres, initialValues: {} });
    preGraze.container.setAttribute('data-testid', 'place-wizard-pre-graze-card');
    openSection.appendChild(preGraze.container);
  }

  panel.appendChild(openSection);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'place-wizard-status' });
  panel.appendChild(statusEl);

  const saveBtn = el('button', {
    className: 'btn btn-green',
    'data-testid': 'place-wizard-save',
  }, [t('action.done')]);
  saveBtn.addEventListener('click', () => {
    executePlaceWizard(state, inputs, group, operationId, farmId, statusEl, preGraze, saveBtn);
  });

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => { state.step = 2; parentRender(); },
    }, [t('action.back')]),
    saveBtn,
  ]));
}

function executePlaceWizard(state, inputs, group, operationId, farmId, statusEl, preGraze, saveBtn) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const dateIn = inputs.dateIn.value;
  const timeIn = inputs.timeIn.value || null;

  if (preGraze) {
    const pv = preGraze.validate();
    if (!pv.valid) {
      statusEl.appendChild(el('span', {}, [pv.errors.join(', ')]));
      return;
    }
  }

  if (!dateIn) {
    statusEl.appendChild(el('span', {}, [t('validation.closeDateRequired')]));
    return;
  }

  if (saveBtn) saveBtn.disabled = true;

  // Live recompute head + avg weight as of dateIn for the placed group.
  // We synthesize a minimal "live window" descriptor so the OI-0091 helpers
  // (`getLiveWindowHeadCount` / `getLiveWindowAvgWeight`) can do their job
  // without us duplicating the membership / weight-record logic.
  const fakeWindow = { groupId: state.groupId, dateLeft: null };
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalClasses = getAll('animalClasses');
  const animalWeightRecords = getAll('animalWeightRecords');
  const headCount = getLiveWindowHeadCount(fakeWindow, { memberships, now: dateIn });
  const avgWeightKg = getLiveWindowAvgWeight(fakeWindow, {
    memberships, animals, animalClasses, animalWeightRecords, now: dateIn,
  });
  const groupSnapshots = [{ groupId: state.groupId, headCount, avgWeightKg }];

  try {
    if (state.destType === 'new') {
      // Steps 6 + 7 + 9 — destination event, paddock window, group window,
      // and the open paddock observation when on land. The helper writes
      // the new event row with no parent link by default (we pass nothing
      // through; the seam is enforced by omission, not by null).
      createDestinationEvent({
        state,
        operationId,
        farmId,
        dateIn,
        timeIn,
        groupSnapshots,
        // Pre-graze observation: only when a card was rendered (new + land).
        // Confinement and join branches pass null so the helper skips the
        // observation write entirely.
        preGrazeValues: preGraze ? preGraze.getValues() : null,
      });
    } else {
      // Join existing event — single group window write.
      joinExistingEvent({
        operationId,
        existingEventId: state.existingEventId,
        groupSnapshots,
        dateJoined: dateIn,
        timeJoined: timeIn,
        logCategory: 'place-wizard',
      });
    }

    placeWizardSheet?.close();
  } catch (err) {
    logger.error('place-wizard', 'Save failed', {
      error: err && err.message ? err.message : String(err),
      groupId: state.groupId,
      operationId,
      destType: state.destType,
      locationId: state.locationId,
      existingEventId: state.existingEventId,
    });
    statusEl.appendChild(el('span', {}, [
      t('event.placeWizardSaveError', { error: err && err.message ? err.message : String(err) }),
    ]));
    if (saveBtn) saveBtn.disabled = false;
  }
}
