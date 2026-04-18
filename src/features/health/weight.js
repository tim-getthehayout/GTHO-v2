/** @file Quick weight sheet — v1 parity. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add, getAll, maybeSplitForGroup } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel, display } from '../../utils/units.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';

let weightSheet = null;

function ensureSheetDOM() {
  if (document.getElementById('weight-sheet-wrap')) return;
  document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'weight-sheet-wrap', style: { zIndex: '210' } }, [
    el('div', { className: 'sheet-backdrop', onClick: () => weightSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'weight-sheet-panel' }),
  ]));
}

export function openWeightSheet(animal, operationId) {
  ensureSheetDOM();
  if (!weightSheet) weightSheet = new Sheet('weight-sheet-wrap');
  const panel = document.getElementById('weight-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('div', { className: 'sheet-handle' }));

  const unitSys = getUnitSystem();
  const todayStr = new Date().toISOString().slice(0, 10);
  const displayName = animal.tagNum || animal.name || animal.eid || `A-${animal.id.slice(0, 5)}`;
  const wUnit = unitLabel('weight', unitSys);

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, ['Update weight']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [
    `${displayName} \u00B7 current: ${animal.currentWeightKg ? display(animal.currentWeightKg, 'weight', unitSys, 0) : '\u2014'} ${wUnit}`,
  ]));

  const weightInput = el('input', { type: 'number', placeholder: '0', step: '1', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const dateInput = el('input', { type: 'date', value: todayStr, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const noteInput = el('input', { type: 'text', placeholder: 'e.g. Pre-shipping weight', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [`New weight (${wUnit})`]), weightInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
  ]));
  panel.appendChild(el('div', { className: 'field' }, [
    el('label', {}, ['Note ', el('span', { style: { fontSize: '10px', color: 'var(--text2)' } }, ['optional'])]),
    noteInput,
  ]));

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: '12px' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      let weightKg = parseFloat(weightInput.value);
      if (!weightKg || weightKg <= 0) { statusEl.appendChild(el('span', {}, [t('validation.weightRequired')])); return; }
      if (unitSys === 'imperial') weightKg = convert(weightKg, 'weight', 'toMetric');
      try {
        const record = WeightRecordEntity.create({ operationId, animalId: animal.id, recordedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(), weightKg, source: 'manual', notes: noteInput.value.trim() || null });
        add('animalWeightRecords', record, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');

        // OI-0096: split the group window(s) the animal belongs to so the event_group_window
        // stamp reflects the new avg weight on close. No-op if the animal isn't in any group
        // on an open event (maybeSplitForGroup guards internally). An animal can be in
        // multiple active groups in edge cases — loop to cover them all.
        const memberships = getAll('animalGroupMemberships').filter(m =>
          m.animalId === animal.id && !m.dateLeft,
        );
        for (const m of memberships) {
          maybeSplitForGroup(m.groupId, dateInput.value);
        }

        weightSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    } }, ['Save weight']),
    el('button', { className: 'btn btn-outline', onClick: () => weightSheet.close() }, ['Cancel']),
  ]));

  weightSheet.open();
}

export function renderWeightSheetMarkup() {
  return el('div');
}
