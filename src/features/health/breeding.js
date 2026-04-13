/** @file Breeding recording sheet — CP-36. Reusable per V2_UX_FLOWS.md §14.5. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add } from '../../data/store.js';
import * as BreedingEntity from '../../entities/animal-breeding-record.js';

let breedingSheet = null;

export function openBreedingSheet(animal, operationId) {
  if (!breedingSheet) breedingSheet = new Sheet('breeding-sheet-wrap');
  const panel = document.getElementById('breeding-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);
  const aiBulls = getAll('aiBulls').filter(b => !b.archived);
  const animals = getAll('animals').filter(a => a.active && a.sex === 'male');
  const methodState = { value: 'ai' };

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.breedingTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [displayName]));

  // Method toggle
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingMethod')]));
  const methodRow = el('div', { className: 'btn-row', 'data-testid': 'breeding-sheet-method' });
  const renderMethodToggle = () => {
    clear(methodRow);
    methodRow.appendChild(el('button', {
      className: `btn btn-sm ${methodState.value === 'ai' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'breeding-sheet-method-ai',
      onClick: () => { methodState.value = 'ai'; renderMethodToggle(); },
    }, [t('health.breedingMethodAi')]));
    methodRow.appendChild(el('button', {
      className: `btn btn-sm ${methodState.value === 'bull' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'breeding-sheet-method-bull',
      onClick: () => { methodState.value = 'bull'; renderMethodToggle(); },
    }, [t('health.breedingMethodBull')]));
  };
  renderMethodToggle();
  panel.appendChild(methodRow);

  // AI sire selector
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingSireAi')]));
  const aiSelect = el('select', { className: 'auth-select', 'data-testid': 'breeding-sheet-ai-sire' }, [
    el('option', { value: '' }, [t('health.noSire')]),
    ...aiBulls.map(b => el('option', { value: b.id }, [`${b.name}${b.breed ? ` (${b.breed})` : ''}`])),
  ]);
  panel.appendChild(aiSelect);

  // Herd bull selector
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingSireAnimal')]));
  const bullSelect = el('select', { className: 'auth-select', 'data-testid': 'breeding-sheet-bull-sire' }, [
    el('option', { value: '' }, [t('health.noSire')]),
    ...animals.map(a => el('option', { value: a.id }, [a.tagNum || a.name || a.id.slice(0, 8)])),
  ]);
  panel.appendChild(bullSelect);

  // Semen ID (AI only)
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingSemenId')]));
  const semenInput = el('input', { type: 'text', className: 'auth-input', value: '', 'data-testid': 'breeding-sheet-semen' });
  panel.appendChild(semenInput);

  // Technician
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingTechnician')]));
  const techInput = el('input', { type: 'text', className: 'auth-input', value: '', 'data-testid': 'breeding-sheet-tech' });
  panel.appendChild(techInput);

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingDate')]));
  const dateInput = el('input', { type: 'date', className: 'auth-input', value: todayStr, 'data-testid': 'breeding-sheet-date' });
  panel.appendChild(dateInput);

  // Expected calving
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingExpectedCalving')]));
  const expectedInput = el('input', { type: 'date', className: 'auth-input', value: '', 'data-testid': 'breeding-sheet-expected' });
  panel.appendChild(expectedInput);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.breedingNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '', 'data-testid': 'breeding-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'breeding-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'breeding-sheet-save',
      onClick: () => {
        clear(statusEl);
        try {
          const record = BreedingEntity.create({
            operationId,
            animalId: animal.id,
            bredAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            method: methodState.value,
            sireAnimalId: methodState.value === 'bull' ? (bullSelect.value || null) : null,
            sireAiBullId: methodState.value === 'ai' ? (aiSelect.value || null) : null,
            semenId: semenInput.value.trim() || null,
            technician: techInput.value.trim() || null,
            expectedCalving: expectedInput.value || null,
            notes: notesInput.value.trim() || null,
          });
          add('animalBreedingRecords', record, BreedingEntity.validate,
            BreedingEntity.toSupabaseShape, 'animal_breeding_records');
          breedingSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => breedingSheet.close() }, [t('action.cancel')]),
  ]));

  breedingSheet.open();
}

export function renderBreedingSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'breeding-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => breedingSheet && breedingSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'breeding-sheet-panel' }),
  ]);
}
