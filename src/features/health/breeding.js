/** @file Breeding recording sheet — v1 parity. Supports heat/AI/bull subtypes. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add } from '../../data/store.js';
import * as BreedingEntity from '../../entities/animal-breeding-record.js';

let breedingSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('breeding-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'breeding-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => breedingSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'breeding-sheet-panel', style: { maxHeight: '92vh', overflowY: 'auto' } }),
  ]));
}

export function openBreedingSheet(animal, operationId) {
  ensureSheetDOM();
  if (!breedingSheet) breedingSheet = new Sheet('breeding-sheet-wrap');
  const panel = document.getElementById('breeding-sheet-panel');
  if (!panel) return;
  clear(panel);
  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime = new Date().toTimeString().slice(0, 5);
  const displayName = animal.tagNum || animal.name || `A-${animal.id.slice(0, 5)}`;
  const aiBulls = getAll('aiBulls');
  const males = getAll('animals').filter(a => a.sex === 'male' && !a.culled);

  let subtype = 'heat';

  panel.appendChild(el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '600' } }, ['Log breeding event']),
    el('div', { style: { fontSize: '12px', color: 'var(--text2)' } }, [displayName]),
  ]));

  const dateInput = el('input', { type: 'date', value: todayStr });
  const timeInput = el('input', { type: 'time', value: nowTime });
  panel.appendChild(el('div', { className: 'two', style: { marginBottom: '10px' } }, [
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Time ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), timeInput]),
  ]));

  // Subtype picker
  const subtypeSelect = el('select', { style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', fontFamily: 'inherit' } }, [
    el('option', { value: 'heat' }, ['Observed heat']),
    el('option', { value: 'ai' }, ['Bred \u2014 AI']),
    el('option', { value: 'bull' }, ['Bred \u2014 Bull']),
  ]);
  panel.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Event subtype']), subtypeSelect]));

  // Conditional sections
  const aiSection = el('div', { id: 'ae-evt-ai-fields' });
  const bullSection = el('div', { id: 'ae-evt-bull-fields', style: { display: 'none' } });
  const heatSection = el('div', { id: 'ae-evt-heat-fields' });

  // AI fields
  const aiSireSelect = el('select', { style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', fontFamily: 'inherit' } }, [
    el('option', { value: '' }, ['\u2014 select or type below \u2014']),
    ...aiBulls.map(b => el('option', { value: b.id }, [b.name])),
  ]);
  const aiSireNameInput = el('input', { type: 'text', placeholder: 'Sire name or registration' });
  const aiTechInput = el('input', { type: 'text', placeholder: 'Name' });
  aiSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['AI sire']), aiSireSelect]));
  aiSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Free-form sire name ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['if not in list'])]), aiSireNameInput]));
  aiSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Technician ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), aiTechInput]));

  // Bull fields
  const bullSelect = el('select', { style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '13px', background: 'var(--bg)', fontFamily: 'inherit' } }, [
    el('option', { value: '' }, ['\u2014 select from herd \u2014']),
    ...males.map(m => el('option', { value: m.id }, [m.tagNum || m.name || `A-${m.id.slice(0, 5)}`])),
  ]);
  const bullNameInput = el('input', { type: 'text', placeholder: 'Bull name or tag' });
  bullSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Bull (from animal list)']), bullSelect]));
  bullSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Free-form bull name ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['if not in list'])]), bullNameInput]));

  // Heat fields
  const heatNotesInput = el('textarea', { rows: '2', placeholder: 'e.g. Standing heat, mucus noted', style: { width: '100%', padding: '8px', border: '0.5px solid var(--border2)', borderRadius: 'var(--radius)', fontSize: '14px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' } });
  heatSection.appendChild(el('div', { className: 'field' }, [el('label', {}, ['Notes ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]), heatNotesInput]));

  panel.appendChild(aiSection);
  panel.appendChild(bullSection);
  panel.appendChild(heatSection);

  // Expected calving date
  const calvingDateInput = el('input', { type: 'date' });
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Expected calving date ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional \u2014 auto-calc +283d'])]),
    calvingDateInput,
  ]));

  // Switch sections on subtype change
  subtypeSelect.addEventListener('change', () => {
    subtype = subtypeSelect.value;
    aiSection.style.display = subtype === 'ai' ? 'block' : 'none';
    bullSection.style.display = subtype === 'bull' ? 'block' : 'none';
    heatSection.style.display = subtype === 'heat' ? 'block' : 'none';
    // Auto-calc calving date for AI/bull
    if ((subtype === 'ai' || subtype === 'bull') && dateInput.value && !calvingDateInput.value) {
      const d = new Date(dateInput.value + 'T00:00:00');
      d.setDate(d.getDate() + 283);
      calvingDateInput.value = d.toISOString().slice(0, 10);
    }
  });
  // Initial state
  aiSection.style.display = 'none';
  bullSection.style.display = 'none';
  heatSection.style.display = 'block';

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '16px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      try {
        const data = { operationId, animalId: animal.id, date: dateInput.value, time: timeInput.value || null, method: subtype, expectedCalvingDate: calvingDateInput.value || null };
        if (subtype === 'ai') { data.sireAiBullId = aiSireSelect.value || null; data.sireName = aiSireNameInput.value.trim() || null; data.technician = aiTechInput.value.trim() || null; }
        if (subtype === 'bull') { data.sireAnimalId = bullSelect.value || null; data.sireName = bullNameInput.value.trim() || null; }
        if (subtype === 'heat') { data.notes = heatNotesInput.value.trim() || null; }
        const record = BreedingEntity.create(data);
        add('animalBreedingRecords', record, BreedingEntity.validate, BreedingEntity.toSupabaseShape, 'animal_breeding_records');
        breedingSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save']),
    el('button', { className: 'btn btn-outline', onClick: () => breedingSheet.close() }, ['Cancel']),
  ]));

  breedingSheet.open();
}

export function renderBreedingSheetMarkup() {
  return el('div');
}
