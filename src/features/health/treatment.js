/** @file Treatment recording sheet — v1 parity. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add } from '../../data/store.js';
import * as TreatmentEntity from '../../entities/animal-treatment.js';

let treatmentSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('treatment-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'treatment-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => treatmentSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'treatment-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
  ]));
}

export function openTreatmentSheet(animal, operationId) {
  ensureSheetDOM();
  if (!treatmentSheet) treatmentSheet = new Sheet('treatment-sheet-wrap');
  const panel = document.getElementById('treatment-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const displayName = animal.tagNum || animal.name || `A-${animal.id.slice(0, 5)}`;
  const treatmentTypes = getAll('treatmentTypes').filter(tt => !tt.archived);

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Log treatment']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [displayName]),
  ]));

  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time', value: nowTime });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '10px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  // Treatment type picker
  const typeSelect = el('select', { style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', fontFamily: 'inherit' } }, [
    el('option', { value: '' }, ['\u2014 select \u2014']),
    ...treatmentTypes.map(tt => el('option', { value: tt.id }, [tt.name])),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Treatment type']), typeSelect]));

  // Product/drug + dose
  const productInput = el('input', { type: 'text', placeholder: 'e.g. Draxxin' });
  const doseInput = el('input', { type: 'text', placeholder: 'e.g. 3ml' });
  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, ['Product / drug ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), productInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Dose ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), doseInput]),
  ]));

  // Withdrawal date
  const withdrawalInput = el('input', { type: 'date' });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Withdrawal date ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), withdrawalInput]));

  // Notes
  const notesInput = el('textarea', { rows: '2', placeholder: 'Additional notes…', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), notesInput]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!typeSelect.value) { statusEl.appendChild(el('span', {}, ['Select a treatment type'])); return; }
      try {
        const record = TreatmentEntity.create({ operationId, animalId: animal.id, treatmentTypeId: typeSelect.value, date: dateInput.value, time: timeInput.value || null, product: productInput.value.trim() || null, dose: doseInput.value.trim() || null, withdrawalDate: withdrawalInput.value || null, notes: notesInput.value.trim() || null });
        add('animalTreatments', record, TreatmentEntity.validate, TreatmentEntity.toSupabaseShape, 'animal_treatments');
        treatmentSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => treatmentSheet.close() }, ['Cancel']),
  ]));

  treatmentSheet.open();
}

export function renderTreatmentSheetMarkup() {
  return el('div');
}
