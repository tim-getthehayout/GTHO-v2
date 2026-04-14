/** @file Weight recording sheet — CP-33. Reusable per V2_UX_FLOWS.md §14.2. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel } from '../../utils/units.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';

let weightSheet = null;

/**
 * Open the weight recording sheet for a specific animal.
 * @param {object} animal — The animal record
 * @param {string} operationId
 */
export function openWeightSheet(animal, operationId) {
  if (!weightSheet) weightSheet = new Sheet('weight-sheet-wrap');
  const panel = document.getElementById('weight-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.weightTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [displayName]));

  // Weight
  const wLabel = `${t('health.weightValue')} (${unitLabel('weight', unitSys)})`;
  panel.appendChild(el('label', { className: 'form-label' }, [wLabel]));
  const weightInput = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '',
    'data-testid': 'weight-sheet-value',
  });
  panel.appendChild(weightInput);

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.weightDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input', value: todayStr,
    'data-testid': 'weight-sheet-date',
  });
  panel.appendChild(dateInput);

  // Source
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.weightSource')]));
  const sourceInput = el('select', {
    className: 'auth-select', 'data-testid': 'weight-sheet-source',
  }, [
    el('option', { value: 'manual' }, [t('health.weightSourceManual')]),
    el('option', { value: 'group_update' }, [t('health.weightSourceGroup')]),
  ]);
  panel.appendChild(sourceInput);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.weightNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '',
    'data-testid': 'weight-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'weight-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'weight-sheet-save',
      onClick: () => {
        clear(statusEl);
        let weightKg = parseFloat(weightInput.value);
        if (!weightKg || weightKg <= 0) {
          statusEl.appendChild(el('span', {}, [t('validation.weightRequired')]));
          return;
        }
        if (unitSys === 'imperial') weightKg = convert(weightKg, 'weight', 'toMetric');

        try {
          const record = WeightRecordEntity.create({
            operationId,
            animalId: animal.id,
            recordedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            weightKg,
            source: sourceInput.value,
            notes: notesInput.value.trim() || null,
          });
          add('animalWeightRecords', record, WeightRecordEntity.validate,
            WeightRecordEntity.toSupabaseShape, 'animal_weight_records');
          weightSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline', onClick: () => weightSheet.close(),
    }, [t('action.cancel')]),
  ]));

  weightSheet.open();
}

/** Sheet markup — call from parent screen to ensure DOM element exists. */
export function renderWeightSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'weight-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => weightSheet && weightSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'weight-sheet-panel' }),
  ]);
}
