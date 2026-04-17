/** @file Heat observation recording sheet — v1 parity. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add } from '../../data/store.js';
import * as HeatRecordEntity from '../../entities/animal-heat-record.js';

let heatSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('heat-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'heat-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => heatSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'heat-sheet-panel' }),
  ]));
}

export function openHeatSheet(animal, operationId) {
  ensureSheetDOM();
  if (!heatSheet) heatSheet = new Sheet('heat-sheet-wrap');
  const panel = document.getElementById('heat-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const displayName = animal.tagNum || animal.name || `A-${animal.id.slice(0, 5)}`;

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Record heat']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [displayName]),
  ]));

  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time', value: nowTime });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '10px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  const notesInput = el('textarea', { rows: '2', placeholder: 'e.g. Standing heat, mucus noted', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), notesInput]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      try {
        const record = HeatRecordEntity.create({ operationId, animalId: animal.id, date: dateInput.value, time: timeInput.value || null, notes: notesInput.value.trim() || null });
        add('animalHeatRecords', record, HeatRecordEntity.validate, HeatRecordEntity.toSupabaseShape, 'animal_heat_records');
        heatSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => heatSheet.close() }, ['Cancel']),
  ]));

  heatSheet.open();
}

export function renderHeatSheetMarkup() {
  return el('div');
}
