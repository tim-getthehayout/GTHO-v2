/** @file Move wizard — CP-19. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel } from '../../utils/units.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { createObservation, renderLocationPicker } from './index.js';
import * as FeedEntryEntity from '../../entities/event-feed-entry.js';
import * as FeedCheckEntity from '../../entities/event-feed-check.js';
import * as FeedCheckItemEntity from '../../entities/event-feed-check-item.js';
import { getFarmSettings, renderPostGrazeFields, renderPreGrazeFields } from './observation-fields.js';

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
    // Farm chip — scopes location picker to a specific farm (GH-5)
    const allFarms = getAll('farms').filter(f => !f.archived);
    if (allFarms.length > 1) {
      const destFarm = allFarms.find(f => f.id === state.destFarmId);
      const farmChip = el('div', { className: 'wizard-farm-chip', 'data-testid': 'move-wizard-farm-chip' }, [
        el('span', {}, [`Farm: ${destFarm?.name || '?'}`]),
        el('select', {
          className: 'auth-select', style: { marginLeft: 'var(--space-2)', maxWidth: '160px' },
          'data-testid': 'move-wizard-farm-select',
        }, allFarms.map(f => el('option', { value: f.id, ...(f.id === state.destFarmId ? { selected: 'true' } : {}) }, [f.name]))),
      ]);
      farmChip.querySelector('select').addEventListener('change', (e) => {
        state.destFarmId = e.target.value;
        state.locationId = null; // Reset location when farm changes
        render();
      });
      panel.appendChild(farmChip);
    }

    // Location picker — filtered by destination farm
    const locations = getAll('locations').filter(l => !l.archived && l.farmId === state.destFarmId);
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
      const loc = state.locationId ? getById('locations', state.locationId) : null;
      const paddockAreaHa = loc?.areaHectares || 0;
      const unitSys = getUnitSystem();
      const areaUnit = unitLabel('area', unitSys);

      // Area input (acres or hectares depending on unit system)
      const displayArea = paddockAreaHa > 0
        ? (unitSys === 'imperial'
          ? convert(paddockAreaHa * state.stripSizePct / 100, 'area', 'toImperial')
          : paddockAreaHa * state.stripSizePct / 100)
        : '';
      panel.appendChild(el('label', { className: 'form-label' }, [`${t('event.stripArea')} (${areaUnit})`]));
      const stripAreaInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: displayArea !== '' ? parseFloat(displayArea.toFixed(2)) : '',
        'data-testid': 'move-wizard-strip-area',
        ...(paddockAreaHa <= 0 ? { disabled: 'true', placeholder: t('event.selectLocationFirst') } : {}),
      });
      stripAreaInput.addEventListener('input', () => {
        if (paddockAreaHa <= 0) return;
        let areaInHa = parseFloat(stripAreaInput.value) || 0;
        if (unitSys === 'imperial') {
          areaInHa = convert(areaInHa, 'area', 'toMetric');
        }
        state.stripSizePct = paddockAreaHa > 0 ? Math.round((areaInHa / paddockAreaHa) * 100) : 100;
        state.stripCount = state.stripSizePct > 0 ? Math.ceil(100 / state.stripSizePct) : 1;
        // Update percentage input without re-rendering
        if (pctInput) pctInput.value = state.stripSizePct;
        if (countInput) countInput.value = state.stripCount;
      });
      panel.appendChild(stripAreaInput);

      // Percentage input
      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripSize')]));
      const pctInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripSizePct,
        'data-testid': 'move-wizard-strip-size',
      });
      pctInput.addEventListener('input', () => {
        const val = parseFloat(pctInput.value) || 0;
        state.stripSizePct = val;
        state.stripCount = val > 0 ? Math.ceil(100 / val) : 1;
        // Update area input
        if (paddockAreaHa > 0 && stripAreaInput) {
          let areaVal = paddockAreaHa * val / 100;
          if (unitSys === 'imperial') areaVal = convert(areaVal, 'area', 'toImperial');
          stripAreaInput.value = parseFloat(areaVal.toFixed(2));
        }
        if (countInput) countInput.value = state.stripCount;
      });
      panel.appendChild(pctInput);

      // Count input
      panel.appendChild(el('label', { className: 'form-label' }, [t('event.stripCount')]));
      const countInput = el('input', {
        type: 'number',
        className: 'auth-input settings-input',
        value: state.stripCount,
        'data-testid': 'move-wizard-strip-count',
      });
      countInput.addEventListener('input', () => {
        const val = parseInt(countInput.value, 10) || 1;
        state.stripCount = val;
        state.stripSizePct = val > 0 ? Math.round(100 / val) : 100;
        // Update area + pct inputs
        if (pctInput) pctInput.value = state.stripSizePct;
        if (paddockAreaHa > 0 && stripAreaInput) {
          let areaVal = paddockAreaHa * state.stripSizePct / 100;
          if (unitSys === 'imperial') areaVal = convert(areaVal, 'area', 'toImperial');
          stripAreaInput.value = parseFloat(areaVal.toFixed(2));
        }
      });
      panel.appendChild(countInput);
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

  // Post-graze observation fields on close-out section (OI-0040)
  const farmSettings = getFarmSettings();
  const postGraze = renderPostGrazeFields(farmSettings);
  closeSection.appendChild(postGraze.container);

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
    openSection.appendChild(inputs.dateIn);

    openSection.appendChild(el('label', { className: 'form-label' }, [t('event.timeIn')]));
    inputs.timeIn = el('input', {
      type: 'time', className: 'auth-input', value: state.timeIn,
      'data-testid': 'move-wizard-time-in',
    });
    openSection.appendChild(inputs.timeIn);

    // Pre-graze observation fields on destination section (OI-0041)
    preGraze = renderPreGrazeFields(farmSettings);
    openSection.appendChild(preGraze.container);

    panel.appendChild(openSection);
  }

  // Feed transfer section (CP-29)
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === sourceEvent.id);
  const transferToggles = [];

  if (feedEntries.length) {
    const feedSection = el('div', { className: 'close-open-section', style: { marginTop: 'var(--space-4)' } }, [
      el('div', { className: 'close-open-section-title' }, [t('event.feedTransfer')]),
    ]);

    // Group feed entries by batch × location
    const feedGroups = {};
    for (const entry of feedEntries) {
      const key = `${entry.batchId}|${entry.locationId}`;
      if (!feedGroups[key]) feedGroups[key] = { batchId: entry.batchId, locationId: entry.locationId, total: 0 };
      feedGroups[key].total += entry.quantity;
    }

    for (const [key, group] of Object.entries(feedGroups)) {
      const batch = getById('batches', group.batchId);
      const loc = getById('locations', group.locationId);
      const batchName = batch ? batch.name : '?';
      const locName = loc ? loc.name : '?';

      const checkbox = el('input', {
        type: 'checkbox',
        checked: 'true',
        'data-testid': `move-wizard-transfer-${key.replace('|', '-')}`,
      });
      transferToggles.push({ key, batchId: group.batchId, locationId: group.locationId, total: group.total, checkbox });

      feedSection.appendChild(el('label', {
        style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '6px 0', cursor: 'pointer' },
      }, [
        checkbox,
        el('span', { style: { fontSize: '13px' } }, [
          `${batchName} → ${locName}: ${group.total} ${batch?.unit || ''}`,
        ]),
      ]));
    }

    panel.appendChild(feedSection);
  } else {
    panel.appendChild(el('div', {
      className: 'form-hint',
      style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
    }, [t('event.feedTransferNone')]));
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

  try {
    // --- CLOSE SOURCE (Steps 1-5 of save sequence) ---

    // Step 1: Create close-reading feed check if feed entries exist
    const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === sourceEvent.id);
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

      // Create check items with remaining = 0 (all consumed or transferred)
      const feedGroups = {};
      for (const entry of feedEntries) {
        const key = `${entry.batchId}|${entry.locationId}`;
        if (!feedGroups[key]) feedGroups[key] = { batchId: entry.batchId, locationId: entry.locationId };
      }
      for (const group of Object.values(feedGroups)) {
        const checkItem = FeedCheckItemEntity.create({
          operationId,
          feedCheckId: check.id,
          batchId: group.batchId,
          locationId: group.locationId,
          remainingQuantity: 0,
        });
        add('eventFeedCheckItems', checkItem, FeedCheckItemEntity.validate,
          FeedCheckItemEntity.toSupabaseShape, 'event_feed_check_items');
      }
    }

    // Step 2: Close all open paddock windows
    const sourcePWs = getAll('eventPaddockWindows').filter(w => w.eventId === sourceEvent.id && !w.dateClosed);
    for (const pw of sourcePWs) {
      update('eventPaddockWindows', pw.id, {
        dateClosed: dateOut,
        timeClosed: timeOut,
      }, PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
      createObservation(operationId, pw.locationId, 'close', pw.id, new Date().toISOString(),
        postGraze ? postGraze.getValues() : {});
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
      // Cross-farm move: use destination farm, link back via sourceEventId
      const isCrossFarm = state.destFarmId && state.destFarmId !== farmId;
      const newEvent = EventEntity.create({
        operationId,
        farmId: state.destFarmId || farmId,
        dateIn,
        timeIn,
        sourceEventId: isCrossFarm ? sourceEvent.id : null,
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
      createObservation(operationId, state.locationId, 'open', newPW.id, new Date().toISOString(),
        preGraze ? preGraze.getValues() : {});

      // Step 8: Feed transfer — create entries on destination with source_event_id
      if (transferToggles && transferToggles.length) {
        for (const toggle of transferToggles) {
          if (!toggle.checkbox.checked) continue;
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
