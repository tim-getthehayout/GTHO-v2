/** @file Heat observation recording sheet — CP-36. Reusable per V2_UX_FLOWS.md §14.6. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add } from '../../data/store.js';
import * as HeatRecordEntity from '../../entities/animal-heat-record.js';

let heatSheet = null;

export function openHeatSheet(animal, operationId) {
  if (!heatSheet) heatSheet = new Sheet('heat-sheet-wrap');
  const panel = document.getElementById('heat-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || animal.id.slice(0, 8);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('health.heatTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-3)' } }, [displayName]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.heatDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input', value: todayStr, 'data-testid': 'heat-sheet-date',
  });
  panel.appendChild(dateInput);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.heatNotes')]));
  const notesInput = el('textarea', {
    className: 'auth-input', value: '', 'data-testid': 'heat-sheet-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'heat-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green', 'data-testid': 'heat-sheet-save',
      onClick: () => {
        clear(statusEl);
        try {
          const record = HeatRecordEntity.create({
            operationId,
            animalId: animal.id,
            observedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            notes: notesInput.value.trim() || null,
          });
          add('animalHeatRecords', record, HeatRecordEntity.validate,
            HeatRecordEntity.toSupabaseShape, 'animal_heat_records');
          heatSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => heatSheet.close() }, [t('action.cancel')]),
  ]));

  heatSheet.open();
}

export function renderHeatSheetMarkup() {
  return el('div', { className: 'sheet-wrap', id: 'heat-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => heatSheet && heatSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'heat-sheet-panel' }),
  ]);
}
