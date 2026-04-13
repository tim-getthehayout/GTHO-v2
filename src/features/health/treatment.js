/** @file Treatment recording sheet — CP-35. Reusable per V2_UX_FLOWS.md §14.4. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add } from '../../data/store.js';
import * as TreatmentEntity from '../../entities/animal-treatment.js';

let treatmentSheet = null;

/**
 * Open the treatment recording sheet for a specific animal.
 * @param {object} animal
 * @param {string} operationId
 */
export function openTreatmentSheet(animal, operationId) {
  if (!treatmentSheet) treatmentSheet = new Sheet('treatment-sheet-wrap');
  const panel = document.getElementById('treatment-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);
  const treatmentTypes = getAll('treatmentTypes').filter(tt => !tt.archived);
  const categories = getAll('treatmentCategories').filter(c => !c.archived);
  const doseUnits = getAll('doseUnits').filter(u => !u.archived);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.treatmentTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [displayName]));

  // Treatment type
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentType')]));
  const typeSelect = el('select', { className: 'auth-select', 'data-testid': 'treatment-sheet-type' }, [
    el('option', { value: '' }, [t('health.noTreatmentType')]),
    ...treatmentTypes.map(tt => {
      const cat = categories.find(c => c.id === tt.categoryId);
      return el('option', { value: tt.id }, [`${tt.name}${cat ? ` (${cat.name})` : ''}`]);
    }),
  ]);
  panel.appendChild(typeSelect);

  // Product
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentProduct')]));
  const productInput = el('input', {
    type: 'text', className: 'auth-input', value: '', 'data-testid': 'treatment-sheet-product',
  });
  panel.appendChild(productInput);

  // Dose amount + unit (inline)
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentDose')]));
  const doseRow = el('div', { style: { display: 'flex', gap: 'var(--space-3)' } });
  const doseAmountInput = el('input', {
    type: 'number', className: 'auth-input settings-input', value: '', 'data-testid': 'treatment-sheet-dose',
  });
  const doseUnitSelect = el('select', { className: 'auth-select', style: { maxWidth: '120px' }, 'data-testid': 'treatment-sheet-dose-unit' }, [
    el('option', { value: '' }, ['—']),
    ...doseUnits.map(u => el('option', { value: u.id }, [u.name])),
  ]);
  doseRow.appendChild(doseAmountInput);
  doseRow.appendChild(doseUnitSelect);
  panel.appendChild(doseRow);

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input', value: todayStr, 'data-testid': 'treatment-sheet-date',
  });
  panel.appendChild(dateInput);

  // Withdrawal date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentWithdrawal')]));
  const withdrawalInput = el('input', {
    type: 'date', className: 'auth-input', value: '', 'data-testid': 'treatment-sheet-withdrawal',
  });
  panel.appendChild(withdrawalInput);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.treatmentNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '', 'data-testid': 'treatment-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'treatment-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'treatment-sheet-save',
      onClick: () => {
        clear(statusEl);
        try {
          const record = TreatmentEntity.create({
            operationId,
            animalId: animal.id,
            treatmentTypeId: typeSelect.value || null,
            treatedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            product: productInput.value.trim() || null,
            doseAmount: doseAmountInput.value ? parseFloat(doseAmountInput.value) : null,
            doseUnitId: doseUnitSelect.value || null,
            withdrawalDate: withdrawalInput.value || null,
            notes: notesInput.value.trim() || null,
          });
          add('animalTreatments', record, TreatmentEntity.validate,
            TreatmentEntity.toSupabaseShape, 'animal_treatments');
          treatmentSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => treatmentSheet.close() }, [t('action.cancel')]),
  ]));

  treatmentSheet.open();
}

export function renderTreatmentSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'treatment-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => treatmentSheet && treatmentSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'treatment-sheet-panel' }),
  ]);
}
