/** @file Quick weight sheet — v1 parity. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { add, getAll, maybeSplitForGroup } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel, display } from '../../utils/units.js';
import { animalHeadCount, latestWeightForAnimal } from '../../calcs/window-helpers.js';
import * as WeightRecordEntity from '../../entities/animal-weight-record.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';

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
  const todayStr = getLocalTodayStr();
  const displayName = animal.tagNum || animal.name || animal.eid || `A-${animal.id.slice(0, 5)}`;
  const wUnit = unitLabel('weight', unitSys);
  const isBulk = animal?.isBulk === true;
  const heads = isBulk ? animalHeadCount(animal) : 1;
  const latest = latestWeightForAnimal(getAll('animalWeightRecords'), animal.id);
  let perHeadPrefill = '';
  if (isBulk && latest?.weightKg > 0 && heads > 0) {
    const perKg = latest.weightKg / heads;
    const shown = unitSys === 'imperial' ? convert(perKg, 'weight', 'toImperial') : perKg;
    perHeadPrefill = String(Math.round(shown * 1000) / 1000);
  }
  const currentText = latest?.weightKg ? display(latest.weightKg, 'weight', unitSys, 0) : '\u2014';

  panel.appendChild(el('div', { style: { fontSize: '16px', fontWeight: '600', marginBottom: '4px' } }, [isBulk ? t('animal.weightPerHead') : 'Update weight']));
  panel.appendChild(el('div', { style: { fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' } }, [
    isBulk
      ? `${displayName} \u00B7 ${t('animal.totalWeight')}: ${currentText}`
      : `${displayName} \u00B7 current: ${animal.currentWeightKg ? display(animal.currentWeightKg, 'weight', unitSys, 0) : '\u2014'} ${wUnit}`,
  ]));

  const weightInput = el('input', {
    type: 'number',
    placeholder: '0',
    step: isBulk ? '0.1' : '1',
    value: perHeadPrefill,
    'data-testid': 'weight-sheet-input',
    style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '14px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' },
  });
  const dateInput = el('input', { type: 'date', value: todayStr, style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });
  const noteInput = el('input', { type: 'text', placeholder: 'e.g. Pre-shipping weight', style: { width: '100%', padding: '9px 10px', border: '0.5px solid var(--border2)', borderRadius: '8px', fontSize: '13px', background: 'var(--bg)', boxSizing: 'border-box', fontFamily: 'inherit' } });

  const lotPreview = el('div', { 'data-testid': 'weight-sheet-lot-total', style: { fontSize: '15px', fontWeight: '500' } }, ['\u2014']);
  function refreshLotPreview() {
    clear(lotPreview);
    const perHead = parseFloat(weightInput.value);
    if (!isBulk || !(heads > 0) || !(perHead > 0)) {
      lotPreview.appendChild(el('span', {}, ['\u2014']));
      return;
    }
    const perKg = unitSys === 'imperial' ? convert(perHead, 'weight', 'toMetric') : perHead;
    lotPreview.appendChild(el('span', {}, [display(perKg * heads, 'weight', unitSys, 0)]));
  }
  if (isBulk) weightInput.addEventListener('input', refreshLotPreview);
  refreshLotPreview();

  panel.appendChild(el('div', { className: 'two' }, [
    el('div', { className: 'field' }, [el('label', {}, [isBulk ? `${t('animal.weightPerHead')} (${wUnit})` : `New weight (${wUnit})`]), weightInput]),
    el('div', { className: 'field' }, [el('label', {}, ['Date']), dateInput]),
  ]));
  if (isBulk) {
    panel.appendChild(el('div', { className: 'field' }, [
      el('label', {}, [t('animal.totalWeight')]),
      lotPreview,
    ]));
  }
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
      if (isBulk) {
        if (!(heads > 0)) { statusEl.appendChild(el('span', {}, [t('animal.bulkHeadCountRequired')])); return; }
        weightKg *= heads;
      }
      try {
        const record = WeightRecordEntity.create({ operationId, animalId: animal.id, recordedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(), weightKg, source: 'manual', notes: noteInput.value.trim() || null });
        add('animalWeightRecords', record, WeightRecordEntity.validate, WeightRecordEntity.toSupabaseShape, 'animal_weight_records');

        // OI-0096: split the group window(s) the animal belongs to so the event_group_window
        // stamp reflects the new avg weight on close. No-op if the animal isn't in any group
        // on an open event (maybeSplitForGroup guards internally). An animal can be in
        // multiple active groups in edge cases — loop to cover them all.
        // OI-0137: pass today's date, never the (possibly backdated) weigh date — a backdated
        // changeDate would close the still-open window with date_left < date_joined.
        const todayStr = getLocalTodayStr();
        const memberships = getAll('animalGroupMemberships').filter(m =>
          m.animalId === animal.id && !m.dateLeft,
        );
        for (const m of memberships) {
          maybeSplitForGroup(m.groupId, todayStr);
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
