/** @file Move wizard — CP-19. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { createObservation, renderLocationPicker } from './index.js';

// ---------------------------------------------------------------------------
// Move Wizard (CP-19)
// ---------------------------------------------------------------------------

let moveWizardSheet = null;

export function openMoveWizard(sourceEvent, operationId, farmId) {
  if (!moveWizardSheet) {
    moveWizardSheet = new Sheet('move-wizard-sheet-wrap');
  }

  const panel = document.getElementById('move-wizard-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);

  // Wizard state
  const state = {
    step: 1,
    destType: null,        // 'new' | 'join'
    locationId: null,
    existingEventId: null,
    stripGraze: false,
    stripSizePct: 100,
    stripCount: 1,
    // Close-out
    dateOut: todayStr,
    timeOut: '',
    // New event
    dateIn: todayStr,
    timeIn: '',
  };

  function render() {
    clear(panel);

    // Dots
    panel.appendChild(el('div', { className: 'wiz-dots' }, [
      el('span', { className: `wiz-dot${state.step >= 1 ? ' active' : ''}${state.step > 1 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 2 ? ' active' : ''}${state.step > 2 ? ' done' : ''}` }),
      el('span', { className: `wiz-dot${state.step >= 3 ? ' active' : ''}` }),
    ]));

    if (state.step === 1) renderStep1(panel, state, render);
    else if (state.step === 2) renderStep2(panel, state, render, operationId, sourceEvent);
    else renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys);
  }

  render();
  moveWizardSheet.open();
}

// Step 1: Destination type
function renderStep1(panel, state, render) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.step1Title')]));

  const grid = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' } });

  grid.appendChild(el('div', {
    className: `dest-type-card${state.destType === 'new' ? ' selected' : ''}`,
    'data-testid': 'move-wizard-dest-new',
    onClick: () => { state.destType = 'new'; render(); },
  }, [t('event.newLocation')]));

  grid.appendChild(el('div', {
    className: `dest-type-card${state.destType === 'join' ? ' selected' : ''}`,
    'data-testid': 'move-wizard-dest-join',
    onClick: () => { state.destType = 'join'; render(); },
  }, [t('event.joinExisting')]));

  panel.appendChild(grid);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-step-1-next',
      disabled: !state.destType ? 'true' : undefined,
      onClick: () => {
        if (state.destType) { state.step = 2; render(); }
      },
    }, [t('action.next')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => moveWizardSheet.close(),
    }, [t('action.cancel')]),
  ]));
}

// Step 2: Location picker (new) or event picker (join)
function renderStep2(panel, state, render, operationId, sourceEvent) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    state.destType === 'new' ? t('event.step2Title') : t('event.step2ExistingTitle'),
  ]));

  if (state.destType === 'new') {
    // Location picker
    const locations = getAll('locations').filter(l => !l.archived);
    const selection = { locationId: state.locationId };
    const pickerEl = el('div', { 'data-testid': 'move-wizard-location-picker' });
    renderLocationPicker(pickerEl, locations, selection);

    // Sync selection back to wizard state on click
    pickerEl.addEventListener('click', () => {
      state.locationId = selection.locationId;
    });
    panel.appendChild(pickerEl);

    // Strip graze toggle
    const stripToggle = el('div', { style: { marginTop: 'var(--space-4)' } });
    const stripCheckbox = el('input', {
      type: 'checkbox',
      'data-testid': 'move-wizard-strip-graze',
      ...(state.stripGraze ? { checked: 'true' } : {}),
    });
    stripCheckbox.addEventListener('change', () => {
      state.stripGraze = stripCheckbox.checked;
      render();
    });
    stripToggle.appendChild(el('label', { style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer' } }, [
      stripCheckbox,
      el('span', { className: 'form-label', style: { margin: '0' } }, [t('event.stripGraze')]),
    ]));
    panel.appendChild(stripToggle);

    // Strip size inputs (only if strip graze enabled)
    if (state.stripGraze) {
      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripSize')]));
      const stripSizeInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripSizePct,
        'data-testid': 'move-wizard-strip-size',
      });
      stripSizeInput.addEventListener('input', () => {
        const val = parseFloat(stripSizeInput.value) || 0;
        state.stripSizePct = val;
        state.stripCount = val > 0 ? Math.ceil(100 / val) : 1;
      });
      panel.appendChild(stripSizeInput);

      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripCount')]));
      const stripCountInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripCount,
        'data-testid': 'move-wizard-strip-count',
      });
      stripCountInput.addEventListener('input', () => {
        const val = parseInt(stripCountInput.value, 10) || 1;
        state.stripCount = val;
        state.stripSizePct = val > 0 ? Math.round(100 / val) : 100;
      });
      panel.appendChild(stripCountInput);
    }
  } else {
    // Existing event picker
    const activeEvents = getAll('events').filter(e => !e.dateOut && e.id !== sourceEvent.id);
    if (!activeEvents.length) {
      panel.appendChild(el('p', { className: 'form-hint' }, [t('event.noActiveEvents')]));
    } else {
      for (const evt of activeEvents) {
        const pw = getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed);
        const locNames = pw.map(w => {
          const loc = getById('locations', w.locationId);
          return loc ? loc.name : '?';
        }).join(', ');
        const isSelected = state.existingEventId === evt.id;

        panel.appendChild(el('div', {
          className: `loc-picker-item${isSelected ? ' selected' : ''}`,
          'data-testid': `move-wizard-event-${evt.id}`,
          onClick: () => { state.existingEventId = evt.id; render(); },
        }, [
          el('div', {}, [
            el('span', { style: { fontWeight: '500' } }, [locNames || evt.id.slice(0, 8)]),
            el('div', { className: 'window-detail' }, [evt.dateIn]),
          ]),
        ]));
      }
    }
  }

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-outline',
      onClick: () => { state.step = 1; render(); },
    }, [t('action.back')]),
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'move-wizard-step-2-next',
      onClick: () => {
        if (state.destType === 'new' && !state.locationId) return;
        if (state.destType === 'join' && !state.existingEventId) return;
        state.step = 3;
        render();
      },
    }, [t('action.next')]),
  ]));
}

// Step 3: Close & Move
function renderStep3(panel, state, sourceEvent, operationId, farmId, unitSys) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('event.step3Title')]));

  const inputs = {};

  // Close source section
  const closeSection = el('div', { className: 'close-open-section' }, [
    el('div', { className: 'close-open-section-title' }, [t('event.closeSource')]),
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

  panel.appendChild(closeSection);

  // Open destination section (only for new location)
  if (state.destType === 'new') {
    const openSection = el('div', { className: 'close-open-section' }, [
      el('div', { className: 'close-open-section-title' }, [t('event.openDest')]),
    ]);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.dateIn')]));
    inputs.dateIn = el('input', {
      type: 'date', className: 'auth-input', value: state.dateIn,
      'data-testid': 'move-wizard-date-in',
    });
    openSection.appendChild(inputs.dateIn);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
    inputs.timeIn = el('input', {
      type: 'time', className: 'auth-input', value: state.timeIn,
      'data-testid': 'move-wizard-time-in',
    });
    openSection.appendChild(inputs.timeIn);

    panel.appendChild(openSection);
  }

  // Feed transfer placeholder
  panel.appendChild(el('div', {
    className: 'form-hint',
    style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
  }, [t('event.feedTransferPlaceholder')]));

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
      onClick: () => executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, unitSys, statusEl),
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

function executeMoveWizard(state, inputs, sourceEvent, operationId, farmId, _unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const dateOut = inputs.dateOut.value;
  const timeOut = inputs.timeOut.value || null;

  if (!dateOut) {
    statusEl.appendChild(el('span', {}, ['Close date is required']));
    return;
  }

  try {
    // --- CLOSE SOURCE (Steps 1-5 of save sequence) ---

    // Step 1: Feed check (placeholder — Phase 3.3)
    // TODO: Create feed check with is_close_reading when feed system is built

    // Step 2: Close all open paddock windows
    const sourcePWs = getAll('eventPaddockWindows').filter(w => w.eventId === sourceEvent.id && !w.dateClosed);
    for (const pw of sourcePWs) {
      update('eventPaddockWindows', pw.id, {
        dateClosed: dateOut,
        timeClosed: timeOut,
      }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      createObservation(operationId, pw.locationId, 'close', pw.id, new Date().toISOString());
    }

    // Step 3: Close all open group windows
    const sourceGWs = getAll('eventGroupWindows').filter(w => w.eventId === sourceEvent.id && !w.dateLeft);
    for (const gw of sourceGWs) {
      update('eventGroupWindows', gw.id, {
        dateLeft: dateOut,
        timeLeft: timeOut,
      }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    }

    // Step 4: Set source event date_out
    update('events', sourceEvent.id, {
      dateOut,
      timeOut,
    }, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

    // Step 5: Close observations already created in Step 2 loop above

    // --- CREATE DESTINATION (Steps 6-9) ---

    if (state.destType === 'new') {
      const dateIn = inputs.dateIn.value || dateOut;
      const timeIn = inputs.timeIn.value || null;

      // Step 6: Create new event
      const newEvent = EventEntity.create({
        operationId,
        farmId,
        dateIn,
        timeIn,
      });
      add('events', newEvent, EventEntity.validate, EventEntity.toSupabaseShape, 'events');

      // Create paddock window at destination
      const pwData = {
        operationId,
        eventId: newEvent.id,
        locationId: state.locationId,
        dateOpened: dateIn,
        timeOpened: timeIn,
      };

      // Step 9: Strip graze flags
      if (state.stripGraze) {
        pwData.isStripGraze = true;
        pwData.stripGroupId = crypto.randomUUID();
        pwData.areaPct = state.stripSizePct;
      }

      const newPW = PaddockWindowEntity.create(pwData);
      add('eventPaddockWindows', newPW, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');

      // Create group windows for all groups that were on the source event
      for (const gw of sourceGWs) {
        const newGW = GroupWindowEntity.create({
          operationId,
          eventId: newEvent.id,
          groupId: gw.groupId,
          dateJoined: dateIn,
          timeJoined: timeIn,
          headCount: gw.headCount,
          avgWeightKg: gw.avgWeightKg,
        });
        add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
      }

      // Step 7: Open observation for destination paddock
      createObservation(operationId, state.locationId, 'open', newPW.id, new Date().toISOString());

      // Step 8: Feed transfer (placeholder — Phase 3.3)
      // TODO: Create feed transfer entries

    } else {
      // Join existing event — add group windows
      const dateIn = dateOut;
      const timeIn = timeOut;

      for (const gw of sourceGWs) {
        const newGW = GroupWindowEntity.create({
          operationId,
          eventId: state.existingEventId,
          groupId: gw.groupId,
          dateJoined: dateIn,
          timeJoined: timeIn,
          headCount: gw.headCount,
          avgWeightKg: gw.avgWeightKg,
        });
        add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
      }
    }

    moveWizardSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}
