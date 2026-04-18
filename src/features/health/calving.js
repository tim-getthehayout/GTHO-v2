/** @file Calving recording sheet — CP-37. Reusable per V2_UX_FLOWS.md §14.7. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, splitGroupWindow } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel } from '../../utils/units.js';
import * as CalvingEntity from '../../entities/animal-calving-record.js';
import * as AnimalEntity from '../../entities/animal.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import * as MembershipEntity from '../../entities/animal-group-membership.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../../calcs/window-helpers.js';

/**
 * OI-0094 helper: if the group is on an open event, split its open window so
 * calcs pick up the new live head/weight. No-op when the group isn't placed.
 */
function maybeSplitForGroup(groupId, changeDate) {
  if (!groupId || !changeDate) return;
  const openGW = getAll('eventGroupWindows').find(w => w.groupId === groupId && !w.dateLeft);
  if (!openGW) return;
  const memberships = getAll('animalGroupMemberships');
  const animals = getAll('animals');
  const animalWeightRecords = getAll('animalWeightRecords');
  const ctx = { memberships, animals, animalWeightRecords, now: changeDate };
  const liveHead = getLiveWindowHeadCount({ ...openGW, dateLeft: null }, ctx);
  const liveAvg = getLiveWindowAvgWeight({ ...openGW, dateLeft: null }, ctx);
  splitGroupWindow(groupId, openGW.eventId, changeDate, null, {
    headCount: liveHead, avgWeightKg: liveAvg,
  });
}

let calvingSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('calving-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'calving-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => calvingSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'calving-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
  ]));
}

export function openCalvingSheet(dam, operationId) {
  ensureSheetDOM();
  if (!calvingSheet) calvingSheet = new Sheet('calving-sheet-wrap');
  const panel = document.getElementById('calving-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const unitSys = getUnitSystem();
  const displayName = dam.tagNum || dam.name || dam.eid || dam.id.slice(0, 8);
  const classes = getAll('animalClasses').filter(c => !c.archived);
  const groups = getAll('groups').filter(g => !g.archived);
  const cls = dam.classId ? getById('animalClasses', dam.classId) : null;
  const isDairy = cls?.species === 'dairy_cattle';

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.calvingTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [displayName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingDate')]));
  const dateInput = el('input', { type: 'date', className: 'auth-input', value: todayStr, 'data-testid': 'calving-sheet-date' });
  panel.appendChild(dateInput);

  // Stillbirth
  const stillbirthCheck = el('input', { type: 'checkbox', 'data-testid': 'calving-sheet-stillbirth' });
  panel.appendChild(el('label', {
    className: 'form-label',
    style: { display: 'flex', alignItems: 'center', gap: 'var(--space-3)', cursor: 'pointer', marginTop: 'var(--space-3)' },
  }, [stillbirthCheck, t('health.calvingStillbirth')]));

  // Calf details
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingCalfTag')]));
  const calfTagInput = el('input', { type: 'text', className: 'auth-input', value: '', 'data-testid': 'calving-sheet-calf-tag' });
  panel.appendChild(calfTagInput);

  // Calf sex
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingCalfSex')]));
  const calfSexState = { value: 'female' };
  const sexRow = el('div', { className: 'btn-row', 'data-testid': 'calving-sheet-calf-sex' });
  const renderSex = () => {
    clear(sexRow);
    sexRow.appendChild(el('button', {
      className: `btn btn-sm ${calfSexState.value === 'female' ? 'btn-green' : 'btn-outline'}`,
      onClick: () => { calfSexState.value = 'female'; renderSex(); },
    }, [t('animal.sexFemale')]));
    sexRow.appendChild(el('button', {
      className: `btn btn-sm ${calfSexState.value === 'male' ? 'btn-green' : 'btn-outline'}`,
      onClick: () => { calfSexState.value = 'male'; renderSex(); },
    }, [t('animal.sexMale')]));
  };
  renderSex();
  panel.appendChild(sexRow);

  // Calf weight
  const wLabel = `${t('health.calvingCalfWeight')} (${unitLabel('weight', unitSys)})`;
  panel.appendChild(el('label', { className: 'form-label' }, [wLabel]));
  const calfWeightInput = el('input', { type: 'number', className: 'auth-input settings-input', value: '', 'data-testid': 'calving-sheet-calf-weight' });
  panel.appendChild(calfWeightInput);

  // Calf class
  const calfClasses = classes.filter(c => c.role === 'calf' || c.role === 'lamb' || c.role === 'kid' || c.role === 'young');
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingCalfClass')]));
  const calfClassSelect = el('select', { className: 'auth-select', 'data-testid': 'calving-sheet-calf-class' }, [
    el('option', { value: '' }, ['—']),
    ...calfClasses.map(c => el('option', { value: c.id }, [c.name])),
  ]);
  panel.appendChild(calfClassSelect);

  // Calf group
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingCalfGroup')]));
  const calfGroupSelect = el('select', { className: 'auth-select', 'data-testid': 'calving-sheet-calf-group' }, [
    el('option', { value: '' }, [t('animal.noGroup')]),
    ...groups.map(g => el('option', { value: g.id }, [g.name])),
  ]);
  panel.appendChild(calfGroupSelect);

  // Dried off date (dairy only)
  if (isDairy) {
    panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingDriedOff')]));
    const driedInput = el('input', { type: 'date', className: 'auth-input', value: '', 'data-testid': 'calving-sheet-dried-off' });
    panel.appendChild(driedInput);
  }

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.calvingNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '', 'data-testid': 'calving-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'calving-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'calving-sheet-save',
      onClick: () => {
        clear(statusEl);
        try {
          const calvedAt = new Date(dateInput.value + 'T12:00:00Z').toISOString();
          let calfId = null;

          // Create calf animal (unless stillbirth with no tag)
          if (!stillbirthCheck.checked || calfTagInput.value.trim()) {
            const calf = AnimalEntity.create({
              operationId,
              tagNum: calfTagInput.value.trim() || null,
              sex: calfSexState.value,
              classId: calfClassSelect.value || null,
              birthDate: dateInput.value,
              damId: dam.id,
              sireAnimalId: dam.sireAnimalId || null,
            });
            add('animals', calf, AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
            calfId = calf.id;

            // Record birth weight if provided
            let calfWeightKg = parseFloat(calfWeightInput.value);
            if (calfWeightKg > 0) {
              if (unitSys === 'imperial') calfWeightKg = convert(calfWeightKg, 'weight', 'toMetric');
              const wr = WeightRecordEntity.create({
                operationId, animalId: calf.id,
                recordedAt: calvedAt, weightKg: calfWeightKg, source: 'calving',
              });
              add('animalWeightRecords', wr, WeightRecordEntity.validate,
                WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
            }

            // Assign calf to group
            if (calfGroupSelect.value) {
              const membership = MembershipEntity.create({
                operationId, animalId: calf.id,
                groupId: calfGroupSelect.value,
                dateJoined: dateInput.value, reason: 'calving',
              });
              add('animalGroupMemberships', membership, MembershipEntity.validate,
                MembershipEntity.toSupabaseShape, 'animal_group_memberships');

              // OI-0094 entry #5: split the group's open event window so calcs reflect the new calf.
              maybeSplitForGroup(calfGroupSelect.value, dateInput.value);
            }
          }

          // Create calving record
          const driedOffEl = panel.querySelector('[data-testid="calving-sheet-dried-off"]');
          const calvingRecord = CalvingEntity.create({
            operationId,
            damId: dam.id,
            calfId,
            calvedAt,
            stillbirth: stillbirthCheck.checked,
            driedOffDate: driedOffEl?.value || null,
            notes: notesInput.value.trim() || null,
          });
          add('animalCalvingRecords', calvingRecord, CalvingEntity.validate,
            CalvingEntity.toSupabaseShape, 'animal_calving_records');

          calvingSheet.close();

          // A27: Class reassignment prompt (non-blocking)
          if (cls && cls.role === 'heifer') {
            const cowClasses = classes.filter(c => c.role === 'cow' && c.species === cls.species);
            if (cowClasses.length && window.confirm(t('health.calvingReassignPrompt'))) {
              update('animals', dam.id, { classId: cowClasses[0].id },
                AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
            }
          }
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => calvingSheet.close() }, [t('action.cancel')]),
  ]));

  calvingSheet.open();
}

export function renderCalvingSheetMarkup() {
  return el('div');
}
