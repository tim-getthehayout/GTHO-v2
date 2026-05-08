/** @file Wizard shared steps + helpers (OI-0163-A).
 *
 * Extracted from `move-wizard.js` so the place wizard (`place-wizard.js`)
 * can reuse them. Pure refactor — every existing move-wizard test continues
 * to pass with at most import-path updates.
 *
 * What lives here:
 *   - `renderStep1` — destination type picker (New / Join)
 *   - `renderStep2` — farm chip + location picker (new) or existing-event
 *     picker (join), plus strip-graze toggle/sizing inputs
 *   - `createDestinationEvent` — write the new event + paddock window +
 *     group windows + open paddock observation. `sourceEventId` is nullable
 *     (move passes the source event's id; place passes null).
 *   - `joinExistingEvent` — append group windows to an existing event.
 *     `sourceEventId` does not appear here; the only side effect is
 *     `event_group_window` writes.
 *
 * What stays in `move-wizard.js`:
 *   - `openMoveWizard`, `renderStep3` (close-source + open-dest + feed
 *     transfer combined), `executeMoveWizard` (now calls the helpers below).
 *   - All OI-0066 / OI-0101 / OI-0136 / OI-0139 / OI-0161 / OI-0162 logic
 *     that is move-specific.
 */

import { el } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, getById, add } from '../../data/store.js';
import { logger } from '../../utils/logger.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel } from '../../utils/units.js';
import * as EventEntity from '../../entities/event.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { createObservation, renderLocationPicker } from './index.js';
import { getEventStartDate } from './event-start.js';

/**
 * Step 1 — destination type picker (New / Join existing).
 *
 * @param {HTMLElement} panel - sheet panel to render into
 * @param {object} state - wizard state object (mutated in place)
 * @param {Function} render - re-render hook to call after mutation
 * @param {Function} closeWizard - close handler injected by the caller so
 *   move-wizard and place-wizard each route Cancel through their own sheet
 * @param {string} [titleText] - optional title override; defaults to the
 *   move-wizard's "Where to?" framing. Place wizard passes a group-aware
 *   "Place {group}" string.
 */
export function renderStep1(panel, state, render, closeWizard, titleText) {
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [titleText || t('event.step1Title')]));

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
      onClick: () => { if (typeof closeWizard === 'function') closeWizard(); },
    }, [t('action.cancel')]),
  ]));
}

/**
 * Step 2 — location picker (new) or existing-event picker (join).
 *
 * @param {HTMLElement} panel
 * @param {object} state
 * @param {Function} render
 * @param {string} operationId
 * @param {object|null} sourceEvent - `null` when the wizard has no source
 *   event (place wizard). The "join existing" branch's filter excludes the
 *   source from the candidate list when sourceEvent is non-null; when null,
 *   every open event is a candidate.
 */
export function renderStep2(panel, state, render, operationId, sourceEvent) {
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
    // Existing event picker. When sourceEvent is non-null (move wizard) the
    // candidate list excludes the source itself; when sourceEvent is null
    // (place wizard) every open event is a candidate.
    const activeEvents = getAll('events').filter(e =>
      !e.dateOut && (sourceEvent ? e.id !== sourceEvent.id : true));
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
            el('div', { className: 'window-detail' }, [getEventStartDate(evt.id) || '']),
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

/**
 * Create the destination event + paddock window + group windows + open
 * paddock observation. Used by both move-wizard's "new" branch and
 * place-wizard's only-branch save sequence (steps 6, 7, 9 of §1.6).
 *
 * @param {object} args
 * @param {object} args.state - wizard state (reads `locationId`, `destFarmId`,
 *   `stripGraze`, `stripSizePct`)
 * @param {string} args.operationId
 * @param {string} args.farmId - falls back to this when state.destFarmId is null
 * @param {string|null} args.sourceEventId - move wizard passes the source's
 *   id; place wizard passes null (no source)
 * @param {string} args.dateIn
 * @param {string|null} args.timeIn
 * @param {Array<{groupId: string, headCount: number, avgWeightKg: number}>} args.groupSnapshots
 *   one entry per group window to write at the destination
 * @param {object|null} args.preGrazeValues - observation values; when null,
 *   the open paddock observation is skipped entirely (place wizard uses
 *   null on confinement destinations). Move wizard always passes a value
 *   object (possibly `{}`) so the existing behavior of always writing an
 *   observation row is preserved.
 * @returns {{newEvent: object, newPW: object}}
 */
export function createDestinationEvent({
  state, operationId, farmId, sourceEventId = null,
  dateIn, timeIn, groupSnapshots, preGrazeValues,
}) {
  // Step 6: Create new event
  const newEvent = EventEntity.create({
    operationId,
    farmId: state.destFarmId || farmId,
    sourceEventId,
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

  // Create group windows for every snapshot with at least one head.
  // OI-0091: stamp live values as of dateIn. For the move wizard, the
  // caller captures sourceGroupState before closing source GWs so the
  // values reflect the as-of-close-out state. For the place wizard,
  // each snapshot's headCount/avgWeightKg comes from a live recompute
  // against the group's current memberships.
  for (const gs of groupSnapshots) {
    if (gs.headCount < 1) continue;
    const newGW = GroupWindowEntity.create({
      operationId,
      eventId: newEvent.id,
      groupId: gs.groupId,
      dateJoined: dateIn,
      timeJoined: timeIn,
      headCount: gs.headCount,
      avgWeightKg: gs.avgWeightKg,
    });
    add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }

  // Step 7: Open paddock observation. When preGrazeValues is null, skip
  // entirely — that's the place-wizard's confinement-destination path.
  // Move wizard always passes a value object (possibly `{}`) so the
  // existing "always write observation" behavior is preserved verbatim.
  if (preGrazeValues !== null) {
    createObservation(operationId, state.locationId, 'open', newPW.id, new Date().toISOString(),
      preGrazeValues);
  }

  return { newEvent, newPW };
}

/**
 * Append group windows to an existing event. The duplicate-open guard
 * skips any group that already has an open window on the destination event
 * (logs a warn with the caller's category and continues).
 *
 * @param {object} args
 * @param {string} args.operationId
 * @param {string} args.existingEventId
 * @param {Array<{groupId: string, headCount: number, avgWeightKg: number}>} args.groupSnapshots
 * @param {string} args.dateJoined
 * @param {string|null} args.timeJoined
 * @param {string} args.logCategory - logger category for the
 *   duplicate-open-window guard ('move-wizard' or 'place-wizard')
 */
export function joinExistingEvent({
  operationId, existingEventId, groupSnapshots, dateJoined, timeJoined, logCategory,
}) {
  for (const gs of groupSnapshots) {
    if (gs.headCount < 1) continue;
    const existingOpen = getAll('eventGroupWindows')
      .find(w => w.groupId === gs.groupId && w.eventId === existingEventId && !w.dateLeft);
    if (existingOpen) {
      logger.warn(logCategory || 'wizard-shared', 'duplicate-open-window guard: skipping', {
        groupId: gs.groupId, eventId: existingEventId, existingWindowId: existingOpen.id,
      });
      continue;
    }
    const newGW = GroupWindowEntity.create({
      operationId,
      eventId: existingEventId,
      groupId: gs.groupId,
      dateJoined,
      timeJoined,
      headCount: gs.headCount,
      avgWeightKg: gs.avgWeightKg,
    });
    add('eventGroupWindows', newGW, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}
