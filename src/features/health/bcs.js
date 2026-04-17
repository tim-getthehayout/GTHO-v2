/** @file BCS (Body Condition Score) sheet — v1 parity with chip selector. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getById, add } from '../../data/store.js';
import * as BcsScoreEntity from '../../entities/animal-bcs-score.js';

let bcsSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('bcs-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'bcs-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => bcsSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'bcs-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
  ]));
}

export function openBcsSheet(animal, operationId) {
  ensureSheetDOM();
  if (!bcsSheet) bcsSheet = new Sheet('bcs-sheet-wrap');
  const panel = document.getElementById('bcs-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const displayName = animal.tagNum || animal.name || `A-${animal.id.slice(0, 5)}`;
  const cls = animal.classId ? getById('animalClasses', animal.classId) : null;
  const maxScore = (cls?.species === 'sheep' || cls?.species === 'goat') ? 5 : 9;
  let selectedScore = null;

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Body condition score']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [displayName]),
  ]));

  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time', value: nowTime });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '10px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  panel.appendChild(el('div', { style: { fontSize: '13px', fontWeight: '500', marginBottom: '6px' } }, [
    'Body condition score ',
    el('span', { style: { fontSize: '11px', color: 'var(--text2)' } }, [`1 = emaciated \u00B7 ${Math.ceil(maxScore / 2)} = ideal \u00B7 ${maxScore} = obese`]),
  ]));

  const chipsEl = el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' } });
  function renderChips() {
    clear(chipsEl);
    for (let i = 1; i <= maxScore; i++) {
      chipsEl.appendChild(el('button', { className: `bcs-chip${selectedScore === i ? ' on' : ''}`, type: 'button', onClick: () => { selectedScore = i; renderChips(); } }, [String(i)]));
    }
  }
  renderChips();
  panel.appendChild(chipsEl);

  const notesInput = el('textarea', { rows: '2', placeholder: 'e.g. Thin over ribs, gaining condition', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' } });
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), notesInput]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      if (!selectedScore) { statusEl.appendChild(el('span', {}, ['Select a score'])); return; }
      try {
        const record = BcsScoreEntity.create({ operationId, animalId: animal.id, score: selectedScore, date: dateInput.value, time: timeInput.value || null, notes: notesInput.value.trim() || null });
        add('animalBcsScores', record, BcsScoreEntity.validate, BcsScoreEntity.toSupabaseShape, 'animal_bcs_scores');
        bcsSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => bcsSheet.close() }, ['Cancel']),
  ]));

  bcsSheet.open();
}

export function renderBcsSheetMarkup() {
  return el('div');
}
