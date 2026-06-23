/** @file Move wizard — CP-19. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, closeGroupWindow, closePaddockWindow } from '../../data/store.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';
import { logger } from '../../utils/logger.js';
import { maybeShowEmptyGroupPrompt } from '../animals/empty-group-prompt.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert } from '../../utils/units.js';
import * as EventEntity from '../../entities/event.js';
import { createObservation } from './index.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import { renderPreGrazeCard } from '../observations/pre-graze-card.js';
import { renderPostGrazeCard } from '../observations/post-graze-card.js';
import { getLiveRemainingForMove } from '../../calcs/feed-state.js';
import { showToast } from '../../ui/toast.js';
import {
  renderStep1, renderStep2, createDestinationEvent, joinExistingEvent,
} from './wizard-shared.js';
import { checkWindowCloses } from './window-close-guard.js';
import { openDateConflictDialog } from './date-conflict-dialog.js';

// ---------------------------------------------------------------------------
// Move Wizard (CP-19)
// ---------------------------------------------------------------------------

let moveWizardSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('move-wizard-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'move-wizard-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => moveWizardSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'move-wizard-sheet-panel' }),
  ]));
}

export function openMoveWizard(sourceEvent, operationId, farmId, opts = {}) {
  ensureSheetDOM();
  if (!moveWizardSheet) {
    moveWizardSheet = new Sheet('move-wizard-sheet-wrap');
  }

  const panel = document.getElementById('move-wizard-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);

  // OI-0066: scoped variant — the wizard moves one group off the source event
  // instead of the whole event. The source event stays open as long as any
  // other open group window remains; it only closes when the last group leaves.
  // Scoped mode also skips feed transfer (feed stays with the source event's
  // remaining groups).
  const scopedGroupWindowId = opts.scopedGroupWindowId || null;

  // Wizard state
  const state = {
    step: 1,
    destType: null,        // 'new' | 'join'
    locationId: null,
    existingEventId: null,
    destFarmId: farmId,    // Farm chip selection (default = source farm)
    stripGraze: false,
    stripSizePct: 100,
    stripCount: 1,
    // Close-out
    dateOut: todayStr,
    timeOut: '',
    // New event
    dateIn: todayStr,
    timeIn: '',
    // OI-0101: one-way mirror — dateOut/timeOut auto-populate dateIn/timeIn
    // until the farmer types into the open-side input once; after that the
    // mirror stops. Editing the open values never rewrites close values.
    dateInTouched: false,
    timeInTouched: false,
    // OI-0066: scoped-move context. When set, close-out limits to this GW;
    // paddock-window + source-event close run only if the last group is leaving.
    scopedGroupWindowId,
  };

  function render() {
    clear(panel);

    // Dots
    panel.appendChild(el('div', { className: 'wiz-dots' }, [
      el('span', { className: `wiz-dot${state.step >= 1 ? ' active' : ''}${state.step > 1 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 2 ? ' active' : ''}${state.step > 2 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 3 ? ' active' : ''}` }),
    ]));

    if (state.step === 1) renderStep1(panel, state, render, () => moveWizardSheet?.close());
    else if (state.step === 2) renderStep2(panel, state, render, operationId, sourceEvent);
    else renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys);
  }

  render();
  moveWizardSheet.open();
}

// Step 3: Close & Move
function renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.step3Title')]));

  const inputs = {};

  // OI-0161: derive `mode`, source/destination location types, and the
  // group/paddock names once at function entry. Step 3 copy + observation
  // card visibility gate off these. See OPEN_ITEMS.md → OI-0161 for the
  // full gating tables; the short form:
  //   - mode `'scoped-remaining'` (some groups stay): no post-graze obs.
  //   - mode `'scoped-last'` + land: behaviorally a paddock close → obs.
  //   - mode `'scoped-last'` + confinement: no obs (corral has no residual).
  //   - mode `'full-event'` + land: legacy obs path preserved.
  //   - mode `'full-event'` + confinement: no obs.
  const scopedMode = !!state.scopedGroupWindowId;
  const allOpenGWs = getAll('eventGroupWindows').filter(w =>
    w.eventId === sourceEvent.id && !w.dateLeft);
  const remainingAfterMove = scopedMode
    ? allOpenGWs.filter(w => w.id !== state.scopedGroupWindowId).length
    : 0;
  const mode = !scopedMode
    ? 'full-event'
    : (remainingAfterMove > 0 ? 'scoped-remaining' : 'scoped-last');

  // Source paddock window — first open PW on the event. Both scoped and
  // full-event paths use the same lookup; the wizard already operates at
  // event level for the full-event close, and a scoped move's source
  // paddock is whichever PW is currently open.
  const sourcePW = getAll('eventPaddockWindows').find(w =>
    w.eventId === sourceEvent.id && !w.dateClosed);
  const sourceLoc = sourcePW ? getById('locations', sourcePW.locationId) : null;
  const sourceLocationType = sourceLoc?.type ?? 'land'; // defensive default
  const sourcePaddockName = sourceLoc?.name ?? 'paddock';

  const sourceGW = scopedMode
    ? allOpenGWs.find(w => w.id === state.scopedGroupWindowId)
    : null;
  const sourceGroup = sourceGW ? getById('groups', sourceGW.groupId) : null;
  const sourceGroupName = sourceGroup?.name ?? 'group';

  // Destination location type (only meaningful when destType === 'new').
  const destLoc = (state.destType === 'new' && state.locationId)
    ? getById('locations', state.locationId)
    : null;
  const destLocationType = destLoc?.type ?? null;

  // OI-0161: close-section title reflects the mode. The substituted
  // `closePaddockNamed` is distinct from the long-standing literal
  // `event.closePaddock` ("Close paddock", used by the per-paddock
  // close button at `detail.js:503`) — duplicate keys in en.json
  // silently collide, so OI-0161 carries its own key.
  let closeSectionTitle;
  if (mode === 'scoped-remaining') {
    closeSectionTitle = t('event.moveGroupOutOf', { group: sourceGroupName, paddock: sourcePaddockName });
  } else if (mode === 'scoped-last') {
    closeSectionTitle = t('event.closePaddockNamed', { paddock: sourcePaddockName });
  } else {
    closeSectionTitle = t('event.closeSource');
  }

  // Close source section
  const closeSection = el('div', { className: 'close-open-section' }, [
    el('div', {
      className: 'close-open-section-title',
      'data-testid': 'move-wizard-close-section-title',
    }, [closeSectionTitle]),
  ]);

  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateOut')]));
  inputs.dateOut = el('input', {
    type: 'date', className: 'auth-input', value: state.dateOut,
    'data-testid': 'move-wizard-date-out',
  });
  closeSection.appendChild(inputs.dateOut);

  closeSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeOut')]));
  inputs.timeOut = el('input', {
    type: 'time', className: 'auth-input', value: state.timeOut,
    'data-testid': 'move-wizard-time-out',
  });
  closeSection.appendChild(inputs.timeOut);

  // OI-0101 one-way mirror: cascade dateOut→dateIn and timeOut→timeIn until
  // the farmer touches the dest-side input. Listeners attach to dest inputs
  // below in the `destType === 'new'` block once they exist in the DOM.
  inputs.dateOut.addEventListener('input', () => {
    state.dateOut = inputs.dateOut.value;
    if (!state.dateInTouched && inputs.dateIn) {
      inputs.dateIn.value = inputs.dateOut.value;
      state.dateIn = inputs.dateOut.value;
    }
  });
  inputs.timeOut.addEventListener('input', () => {
    state.timeOut = inputs.timeOut.value;
    if (!state.timeInTouched && inputs.timeIn) {
      inputs.timeIn.value = inputs.timeOut.value;
      state.timeIn = inputs.timeOut.value;
    }
  });

  // Post-graze observation card on close-out section (OI-0112 surface #2).
  // OI-0161: gated on mode + sourceLocationType. Render only when the
  // paddock is actually being vacated (mode === 'scoped-last' or
  // 'full-event') AND the source is a pasture (residual height + recovery
  // window are pasture concepts; confinement / dry-lot has neither).
  // When not rendered: `postGraze` stays null and the executeMoveWizard
  // `if (postGraze)` guards (lines 574, 724) skip validation + getValues.
  const farmSettings = getAll('farmSettings')[0] || null;
  let postGraze = null;
  if ((mode === 'full-event' || mode === 'scoped-last') && sourceLocationType === 'land') {
    postGraze = renderPostGrazeCard({ farmSettings });
    postGraze.container.setAttribute('data-testid', 'move-wizard-post-graze-card');
    closeSection.appendChild(postGraze.container);
  }

  panel.appendChild(closeSection);

  // Open destination section (only for new location)
  let preGraze = null;
  if (state.destType === 'new') {
    const openSection = el('div', { className: 'close-open-section' }, [
      el('div', { className: 'close-open-section-title' }, [t('event.openDest')]),
    ]);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateIn')]));
    inputs.dateIn = el('input', {
      type: 'date', className: 'auth-input', value: state.dateIn,
      'data-testid': 'move-wizard-date-in',
    });
    // OI-0101: first keystroke flips the mirror-stop flag.
    inputs.dateIn.addEventListener('input', () => {
      state.dateInTouched = true;
      state.dateIn = inputs.dateIn.value;
    });
    openSection.appendChild(inputs.dateIn);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
    inputs.timeIn = el('input', {
      type: 'time', className: 'auth-input', value: state.timeIn,
      'data-testid': 'move-wizard-time-in',
    });
    inputs.timeIn.addEventListener('input', () => {
      state.timeInTouched = true;
      state.timeIn = inputs.timeIn.value;
    });
    openSection.appendChild(inputs.timeIn);

    // Pre-graze observation card on destination section (OI-0112 surface #1).
    // OI-0124 Phase 1: use OI-0075 fallback — Location entity field is areaHectares.
    // OI-0161: gated on destLocationType. Pre-graze height has no meaning
    // at a confinement / dry-lot, so skip the card entirely on that
    // destination type. Existing-event ('join') path is already gated by
    // the enclosing `state.destType === 'new'` block above.
    if (destLocationType === 'land') {
      const destLocHa = destLoc?.areaHectares ?? destLoc?.areaHa;
      const paddockAcres = destLocHa != null
        ? convert(destLocHa, 'area', 'toImperial')
        : null;
      preGraze = renderPreGrazeCard({ farmSettings, paddockAcres, initialValues: {} });
      preGraze.container.setAttribute('data-testid', 'move-wizard-pre-graze-card');
      openSection.appendChild(preGraze.container);
    }

    panel.appendChild(openSection);
  }

  // Feed transfer section (CP-29; OI-0104: 2-way radio + residual capture)
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === sourceEvent.id);
  const transferToggles = [];
  let feedSection = null;

  if (feedEntries.length) {
    feedSection = el('div', { className: 'close-open-section', style: { marginTop: 'var(--space-4)' } }, [
      el('div', { className: 'close-open-section-title' }, [t('event.feedTransfer')]),
    ]);

    // OI-0135: group labels read live-remaining (most-recent feed-check item per
    // batch × location, falling back to delivery total). Replaces the prior
    // sum-of-delivery-quantities figure, which ignored consumption recorded
    // after delivery and silently inflated both the residual close-reading
    // stamp and the destination delivery row.
    const liveRemaining = getLiveRemainingForMove(sourceEvent.id);
    const feedGroups = {};
    for (const entry of feedEntries) {
      const key = `${entry.batchId}|${entry.locationId}`;
      if (!feedGroups[key]) {
        feedGroups[key] = {
          batchId: entry.batchId,
          locationId: entry.locationId,
          total: liveRemaining[key] ?? 0,
        };
      }
    }

    for (const [key, group] of Object.entries(feedGroups)) {
      // OI-0162-A: skip (batch, location) pairs with 0 live remaining.
      // Pre-OI-0162 the wizard rendered a Move/Residual radio for every
      // delivered pair regardless of consumption. Default = Move → on
      // Save, Step 8 tried to write a destination FeedEntry with
      // quantity=0, which `event-feed-entry.js:46` rejects with a throw.
      // The throw was caught silently AFTER source-side closes had
      // already committed (Bug B). Skip-on-zero drops the trigger; the
      // independent close-reading walk in `executeMoveWizard` (Steps 1)
      // still stamps `remainingQuantity: 0` for these pairs so OI-0135
      // / OI-0139 invariants are intact.
      if (group.total <= 0) continue;
      const batch = getById('batches', group.batchId);
      const loc = getById('locations', group.locationId);
      const batchName = batch ? batch.name : '?';
      const locName = loc ? loc.name : '?';
      const unit = batch?.unit || '';
      const safeKey = key.replace('|', '-');
      // OI-0136: the required residual-qty input is constructed here so the
      // Save handler can read `toggle.residualInput.value` at validation time.
      // The wrapper toggles alongside the radio selection so neither label
      // nor input is visible when Move is the active choice.
      const residualInput = el('input', {
        type: 'number', className: 'auth-input settings-input',
        value: String(group.total), min: '0', step: 'any',
        'data-testid': `move-wizard-residual-input-${safeKey}`,
      });
      const toggle = {
        key,
        batchId: group.batchId,
        locationId: group.locationId,
        total: group.total,
        choice: 'move',  // default
        residualInput,
      };
      const radioName = `move-wizard-transfer-${safeKey}`;
      const moveRadio = el('input', {
        type: 'radio', name: radioName, value: 'move',
        checked: 'true',
        'data-testid': `move-wizard-transfer-move-${safeKey}`,
      });
      const residualRadio = el('input', {
        type: 'radio', name: radioName, value: 'residual',
        'data-testid': `move-wizard-transfer-residual-${safeKey}`,
      });
      const residualInputWrap = el('div', {
        style: { paddingLeft: '24px', marginTop: 'var(--space-2)', display: 'none' },
      }, [
        el('label', { className: 'form-label', style: { fontSize: '12px' } }, [
          `${t('event.feedTransferResidualAmountLabel', { loc: locName })}${unit ? ` (${unit})` : ''}`,
        ]),
        residualInput,
      ]);
      moveRadio.addEventListener('change', () => {
        if (moveRadio.checked) {
          toggle.choice = 'move';
          residualInputWrap.style.display = 'none';
        }
      });
      residualRadio.addEventListener('change', () => {
        if (residualRadio.checked) {
          toggle.choice = 'residual';
          residualInputWrap.style.display = '';
        }
      });
      transferToggles.push(toggle);

      feedSection.appendChild(el('div', {
        style: { padding: '8px 0', borderBottom: '1px solid var(--border)' },
      }, [
        el('div', {
          style: { fontSize: '13px', fontWeight: '600', marginBottom: '6px' },
          'data-testid': `move-wizard-transfer-label-${safeKey}`,
        }, [
          `${batchName} → ${locName}`,
          el('span', { style: { color: 'var(--text2)', fontWeight: '400' } }, [
            ` — remaining: ${group.total} ${unit}`,
          ]),
        ]),
        el('label', {
          style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0', cursor: 'pointer' },
        }, [
          moveRadio,
          el('span', { style: { fontSize: '13px' } }, [t('event.feedTransferMoveLabel')]),
        ]),
        el('label', {
          style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '4px 0', cursor: 'pointer' },
        }, [
          residualRadio,
          el('div', {}, [
            el('div', { style: { fontSize: '13px' } }, [t('event.feedTransferResidualLabel')]),
            el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('event.feedTransferResidualCaption')]),
          ]),
        ]),
        residualInputWrap,
      ]));
    }
  }

  // OI-0104 Step 3 reorder: feed transfer sits under Close section (between
  // post-graze observation card and Open destination section). Append order:
  //   closeSection → feedSection (if any) → openSection (if destType==='new')
  // OI-0162-A: when feedEntries exist but every (batch, location) pair has
  // 0 live remaining, transferToggles ends up empty after the skip-on-zero
  // pass above. Surface an italic hint so the wizard doesn't render an
  // empty feed-transfer block.
  if (feedSection && transferToggles.length > 0) {
    closeSection.appendChild(feedSection);
  } else if (feedEntries.length === 0) {
    closeSection.appendChild(el('div', {
      className: 'form-hint',
      style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
    }, [t('event.feedTransferNone')]));
  } else if (transferToggles.length === 0) {
    closeSection.appendChild(el('div', {
      className: 'form-hint',
      style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
      'data-testid': 'move-wizard-feed-transfer-all-zero',
    }, [t('event.feedTransferAllZero')]));
  }

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'move-wizard-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => { state.step = 2; panel.parentElement && openMoveWizard.__rerender && openMoveWizard.__rerender(); },
    }, [t('action.back')]),
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-save',
      onClick: () => executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, unitSys, statusEl, transferToggles, postGraze, preGraze),
    }, [t('action.done')]),
  ]));

  // Override back button to re-render properly
  const backBtn = panel.querySelector('.btn-outline');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.step = 2;
      openMoveWizard(sourceEvent, operationId, farmId);
    }, { once: true });
  }
}

function executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, _unitSys, statusEl, transferToggles, postGraze, preGraze) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const dateOut = inputs.dateOut.value;
  const timeOut = inputs.timeOut.value || null;

  // Validate observation fields (OI-0040/OI-0041)
  if (postGraze) {
    const pv = postGraze.validate();
    if (!pv.valid) { statusEl.appendChild(el('span', {}, [pv.errors.join(', ')])); return; }
  }
  if (preGraze) {
    const pv = preGraze.validate();
    if (!pv.valid) { statusEl.appendChild(el('span', {}, [pv.errors.join(', ')])); return; }
  }

  if (!dateOut) {
    statusEl.appendChild(el('span', {}, [t('validation.closeDateRequired')]));
    return;
  }

  // OI-0136: block Save when any Residual line's input is blank, non-numeric,
  // or negative. Parity with OI-0119 sub-move close.
  if (transferToggles && transferToggles.length) {
    for (const toggle of transferToggles) {
      if (toggle.choice !== 'residual') continue;
      const v = toggle.residualInput ? toggle.residualInput.value.trim() : '';
      if (v === '' || Number.isNaN(Number(v)) || Number(v) < 0) {
        statusEl.appendChild(el('span', {}, [t('event.feedTransferResidualAmountBlocked')]));
        return;
      }
    }
  }

  // OI-0162-B Layer 1 — pre-flight FeedEntry validation.
  // Build the destination delivery records in memory first; if any fail
  // FeedEntryEntity.validate (notably the `quantity > 0` invariant), paint
  // errors and return early without writing anything. After OI-0162-A's
  // skip-on-zero pass, every Move-choice toggle has total > 0 by
  // construction — this pre-flight is a defense against future entity-
  // validator additions and against any state.locationId resolving to
  // null mid-write.
  if (transferToggles && transferToggles.length) {
    const dateInPreview = inputs.dateIn?.value || dateOut;
    const timeInPreview = inputs.timeIn?.value || null;
    for (const toggle of transferToggles) {
      if (toggle.choice !== 'move') continue;
      const dryRun = FeedEntryEntity.create({
        operationId,
        eventId: '00000000-0000-0000-0000-000000000000', // placeholder; only shape matters here
        batchId: toggle.batchId,
        locationId: state.locationId || toggle.locationId,
        date: dateInPreview,
        time: timeInPreview,
        quantity: toggle.total,
        sourceEventId: sourceEvent.id,
      });
      const v = FeedEntryEntity.validate(dryRun);
      if (!v.valid) {
        statusEl.appendChild(el('span', {}, [v.errors.join(', ')]));
        return;
      }
    }
  }

  // OI-0162-C: idempotency guards — refuse to act on an already-closed
  // source. Pre-OI-0162 a re-run on the same closed event silently wrote
  // a duplicate destination event with no group windows (orphan event;
  // produced 01b1617f in production on 2026-05-06). Hoisted from the
  // mid-function computation at the old line ~761; the duplicate
  // computation below is replaced by reads of these locals.
  const isScoped = !!state.scopedGroupWindowId;
  const allOpenSourceGWs = getAll('eventGroupWindows')
    .filter(w => w.eventId === sourceEvent.id && !w.dateLeft);
  const sourceGWs = isScoped
    ? allOpenSourceGWs.filter(w => w.id === state.scopedGroupWindowId)
    : allOpenSourceGWs;

  if (!isScoped && sourceEvent.dateOut) {
    statusEl.appendChild(el('span', {}, [t('event.moveWizardSourceClosed')]));
    return;
  }
  if (sourceGWs.length === 0) {
    statusEl.appendChild(el('span', {}, [t('event.moveWizardNothingToMove')]));
    return;
  }

  // OI-0185 — pre-flight source-window close dates BEFORE any write fires.
  // The pre-OI-0185 path closed group windows first, then threw on a source
  // paddock window whose date_opened post-dated the move-out (live repro
  // 2026-06-14: E-series source PW opened 06-14, move-out 06-06, four group
  // windows stamped `left 06-06`, no destination created, 46 head orphaned).
  // Source PW pre-flight only applies when the close branch will actually fire
  // — that's the `lastGroupLeaving` predicate the write path uses below.
  const remainingAfterClose = allOpenSourceGWs.filter(w => !sourceGWs.some(closed => closed.id === w.id));
  const willCloseSourcePaddocks = remainingAfterClose.length === 0;
  const conflicts = checkWindowCloses(sourceEvent.id, dateOut, timeOut, {
    scopedGroupWindowIds: isScoped ? [state.scopedGroupWindowId] : null,
    includePaddockWindows: willCloseSourcePaddocks,
  });
  if (conflicts.length > 0) {
    // OI-0186 — guided correction. Resume re-enters executeMoveWizard with the
    // same args; the pre-flight runs again, so a residual conflict simply
    // re-opens the dialog rather than slipping through.
    openDateConflictDialog({
      conflicts,
      operationId,
      event: sourceEvent,
      onResume: () => executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, _unitSys, statusEl, transferToggles, postGraze, preGraze),
    });
    return;
  }

  try {
    // --- CLOSE SOURCE (Steps 1-5 of save sequence) ---

    // OI-0066: scoped moves leave the source event open for remaining groups
    // and keep their feed on the source event. Full-event moves run the
    // full close sequence as before. `isScoped`, `allOpenSourceGWs`, and
    // `sourceGWs` are hoisted to the top of executeMoveWizard for OI-0162-C
    // so the idempotency guards can read them.

    // Step 1: Create close-reading feed check if feed entries exist
    // Skipped in scoped mode — feed stays with the groups still on the source.
    const feedEntries = isScoped ? [] : getAll('eventFeedEntries').filter(e => e.eventId === sourceEvent.id);
    if (feedEntries.length) {
      const check = FeedCheckEntity.create({
        operationId,
        eventId: sourceEvent.id,
        date: dateOut,
        time: timeOut,
        isCloseReading: true,
      });
      add('eventFeedChecks', check, FeedCheckEntity.validate,
        FeedCheckEntity.toSupabaseShape, 'event_feed_checks');

      // OI-0104 + OI-0135 + OI-0136: per-line close-reading remainingQuantity
      // comes from the farmer's Move/Residual choice captured in transferToggles.
      // Move lines stamp 0 (all transferred to new paddock); Residual lines
      // stamp the farmer-confirmed value from the forced input (defaults to
      // live-remaining from OI-0135's helper).
      //
      // Fall-back for groups with no matching toggle (should not happen since
      // transferToggles is built from the same feedGroups earlier in the render
      // pass): treat as Move, remainingQuantity = 0.
      const toggleByKey = new Map((transferToggles || []).map(tog => [tog.key, tog]));
      const liveRemainingWrite = getLiveRemainingForMove(sourceEvent.id);
      const feedGroups = {};
      for (const entry of feedEntries) {
        const key = `${entry.batchId}|${entry.locationId}`;
        if (!feedGroups[key]) {
          feedGroups[key] = {
            batchId: entry.batchId,
            locationId: entry.locationId,
            total: liveRemainingWrite[key] ?? 0,
          };
        }
      }
      for (const [groupKey, group] of Object.entries(feedGroups)) {
        const toggle = toggleByKey.get(groupKey);
        const choice = toggle?.choice || 'move';
        let remaining = 0;
        if (choice === 'residual') {
          // OI-0136: farmer-entered value from the forced input wins; the
          // live-remaining default is only a seed. Validation on Save already
          // rejected blank/negative/non-numeric, so a numeric coercion here
          // is safe.
          remaining = toggle?.residualInput
            ? Number(toggle.residualInput.value)
            : group.total;
        }
        const checkItem = FeedCheckItemEntity.create({
          operationId,
          feedCheckId: check.id,
          batchId: group.batchId,
          locationId: group.locationId,
          remainingQuantity: remaining,
        });
        add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate,
          FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');

        // OI-0104 placeholder for OI-0092: when the farmer elects to leave the
        // remaining feed as residual, log a capture signal so the future residual-
        // deposit → fertility-ledger path (OI-0092) can consume it. Real ledger
        // write (table/column TBD per OI-0092) lands in a follow-up PR.
        if (choice === 'residual' && remaining > 0) {
          logger.info('residual-capture', 'feed left as residual on close', {
            eventId: sourceEvent.id,
            batchId: group.batchId,
            locationId: group.locationId,
            remainingQty: remaining,
            closeReadingCheckItemId: checkItem.id,
          });
        }
      }
    }

    // Step 3: Close group windows (OI-0091 — live values stamped).
    // OI-0066: scoped move closes only the one GW; full event move closes all.
    // OI-0162-C: `allOpenSourceGWs` and `sourceGWs` are hoisted to the
    // top of executeMoveWizard (used by the refuse-to-act guards).
    // Snapshot before closing so the destination write has live values.
    const sourceGroupState = [];
    {
      const memberships = getAll('animalGroupMemberships');
      const animals = getAll('animals');
      const animalClasses = getAll('animalClasses');
      const animalWeightRecords = getAll('animalWeightRecords');
      for (const gw of sourceGWs) {
        const liveHead = getLiveWindowHeadCount(gw, { memberships, now: dateOut });
        const liveAvg = getLiveWindowAvgWeight(gw, { memberships, animals, animalClasses, animalWeightRecords, now: dateOut });
        sourceGroupState.push({ groupId: gw.groupId, operationId: gw.operationId, headCount: liveHead, avgWeightKg: liveAvg });
      }
    }
    for (const gw of sourceGWs) {
      closeGroupWindow(gw.groupId, sourceEvent.id, dateOut, timeOut);
    }
    // OI-0090: if a source group is now empty (e.g., all animals were culled
    // mid-event), surface the archive prompt.
    const emptiedSourceGroups = sourceGroupState.filter(s => s.headCount < 1).map(s => s.groupId);
    for (const gid of emptiedSourceGroups) maybeShowEmptyGroupPrompt(gid);

    // OI-0066: the source event stays open as long as at least one group
    // window on it is still open. Only close the event and its paddock
    // windows when the last group leaves.
    const remainingOpenGWs = allOpenSourceGWs.filter(w => w.id !== state.scopedGroupWindowId || !isScoped)
      .filter(w => !sourceGWs.some(closed => closed.id === w.id));
    const lastGroupLeaving = remainingOpenGWs.length === 0;

    if (lastGroupLeaving) {
      // Step 2: Close all open paddock windows (OI-0095: route through closePaddockWindow).
      const sourcePWs = getAll('eventPaddockWindows').filter(w => w.eventId === sourceEvent.id && !w.dateClosed);
      for (const pw of sourcePWs) {
        closePaddockWindow(pw.locationId, sourceEvent.id, dateOut, timeOut);
        createObservation(operationId, pw.locationId, 'close', pw.id, new Date().toISOString(),
          postGraze ? postGraze.getValues() : {});
      }

      // Step 4: Set source event date_out.
      update('events', sourceEvent.id, {
        dateOut,
        timeOut,
      }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    }
    // else (scoped move with groups still remaining): source event stays
    // open, paddock windows stay open, other groups keep grazing.

    // Step 5: Close observations already created above (when applicable)

    // --- CREATE DESTINATION (Steps 6-9) ---

    if (state.destType === 'new') {
      const dateIn = inputs.dateIn.value || dateOut;
      const timeIn = inputs.timeIn.value || null;

      // Steps 6 + 7 + 9 — create the destination event, paddock window,
      // group windows, and the open paddock observation. OI-0122:
      // sourceEventId is always set on rotations (same-farm AND cross-farm)
      // so DMI-8 chart's date-routing bridge can reach back to the prior
      // event. OI-0091: live head/avg values are captured into
      // sourceGroupState above, so the destination GW writes use the
      // as-of-close-out snapshot.
      const { newEvent } = createDestinationEvent({
        state,
        operationId,
        farmId,
        sourceEventId: sourceEvent.id,
        dateIn,
        timeIn,
        groupSnapshots: sourceGroupState,
        preGrazeValues: preGraze ? preGraze.getValues() : {},
      });

      // Step 8: Feed transfer — only 'move' lines write a destination delivery row.
      // 'residual' lines are already captured by the close-reading remainingQuantity
      // stamp above (Step 1); the fertility-ledger write lands with OI-0092.
      if (transferToggles && transferToggles.length) {
        for (const toggle of transferToggles) {
          if (toggle.choice !== 'move') continue;
          const transferEntry = FeedEntryEntity.create({
            operationId,
            eventId: newEvent.id,
            batchId: toggle.batchId,
            locationId: state.locationId,
            date: dateIn,
            time: timeIn,
            quantity: toggle.total,
            sourceEventId: sourceEvent.id,
          });
          add('eventFeedEntries', transferEntry, FeedEntryEntity.validate,
            FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
        }
      }

    } else {
      // Join existing event — add group windows (OI-0091: live values, duplicate-open guard)
      joinExistingEvent({
        operationId,
        existingEventId: state.existingEventId,
        groupSnapshots: sourceGroupState,
        dateJoined: dateOut,
        timeJoined: timeOut,
        logCategory: 'move-wizard',
      });
    }

    // OI-0162-B: success path — wizard closes from the finally block.
  } catch (err) {
    // OI-0162-B Layer 2 — log + toast + finally-close. Pre-OI-0162 the
    // catch handler appended the error message to `statusEl` and left the
    // wizard open, but partial commits had already landed (source closed,
    // destination event created with zero group windows, etc.). The user
    // saw "the wizard is still open with an error" and re-clicked Save
    // (Bug C territory). Now: log with full context, surface the toast so
    // the user knows to review the source + destination, and let the
    // finally block close the wizard so a re-click can't compound the
    // partial commit.
    logger.error('move-wizard', err && err.message ? err.message : String(err), {
      sourceEventId: sourceEvent.id,
      operationId,
      farmId,
      destFarmId: state.destFarmId,
      locationId: state.locationId,
      scopedGroupWindowId: state.scopedGroupWindowId,
    });
    showToast(t('event.moveWizardSaveErrorToast'), 'move-wizard-save-error-toast');
  } finally {
    moveWizardSheet.close();
  }
}
