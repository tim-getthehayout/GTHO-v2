/** @file Soil test recording — CP-39. Per-paddock soil tests with 13-element panel. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update, remove, subscribe } from '../../data/store.js';
import * as SoilTestEntity from '../../entities/soil-test.js';

let unsubs = [];
const NUTRIENT_KEYS = ['n', 'p', 'k', 's', 'ca', 'mg', 'cu', 'fe', 'mn', 'mo', 'zn', 'b', 'cl'];

export function renderSoilTestsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('amendment.soilTests')]));
    return;
  }
  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'soil-tests-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('amendment.soilTests')]),
      el('button', {
        className: 'btn btn-green btn-sm', 'data-testid': 'soil-tests-add-btn',
        onClick: () => openSoilTestSheet(null, operationId),
      }, [t('amendment.addSoilTest')]),
    ]),
    el('div', { 'data-testid': 'soil-tests-list' }),
    el('div', { className: 'sheet-wrap', id: 'soil-test-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => soilTestSheet && soilTestSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'soil-test-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderSoilTestList(container, operationId);
  unsubs.push(subscribe('soilTests', () => renderSoilTestList(container, operationId)));
}

function renderSoilTestList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="soil-tests-list"]');
  if (!listEl) return;
  clear(listEl);

  const tests = getAll('soilTests');
  if (!tests.length) {
    listEl.appendChild(el('p', { className: 'form-hint', 'data-testid': 'soil-tests-empty' }, [t('amendment.soilTestEmpty')]));
    return;
  }

  const sorted = [...tests].sort((a, b) => (b.testedAt || '').localeCompare(a.testedAt || ''));

  for (const test of sorted) {
    const loc = getById('locations', test.locationId);
    const locName = loc ? loc.name : '?';
    const npk = `N:${test.n ?? '—'} P:${test.p ?? '—'} K:${test.k ?? '—'}`;
    const date = test.testedAt ? test.testedAt.slice(0, 10) : '?';

    listEl.appendChild(el('div', {
      className: 'card', style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `soil-test-${test.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [locName]),
          el('div', { className: 'ft-row-detail' }, [`${date} · ${npk} · pH ${test.ph ?? '—'}`]),
        ]),
        el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSoilTestSheet(test, operationId) }, [t('action.edit')]),
          el('button', { className: 'btn btn-outline btn-xs', onClick: () => {
            if (window.confirm(t('amendment.confirmDelete'))) remove('soilTests', test.id, 'soil_tests');
          }}, [t('action.delete')]),
        ]),
      ]),
    ]));
  }
}

let soilTestSheet = null;

function openSoilTestSheet(existing, operationId) {
  if (!soilTestSheet) soilTestSheet = new Sheet('soil-test-sheet-wrap');
  const panel = document.getElementById('soil-test-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existing;
  const locations = getAll('locations').filter(l => !l.archived && l.type === 'land');
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [isEdit ? t('amendment.editSoilTest') : t('amendment.addSoilTest')]));

  // Location
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestLocation')]));
  inputs.locationId = el('select', { className: 'auth-select', 'data-testid': 'soil-test-location' },
    locations.map(l => el('option', { value: l.id }, [l.name])));
  if (existing?.locationId) inputs.locationId.value = existing.locationId;
  panel.appendChild(inputs.locationId);

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestDate')]));
  inputs.testedAt = el('input', { type: 'date', className: 'auth-input', value: existing?.testedAt?.slice(0, 10) || todayStr, 'data-testid': 'soil-test-date' });
  panel.appendChild(inputs.testedAt);

  // Extraction method
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestMethod')]));
  inputs.extractionMethod = el('input', { type: 'text', className: 'auth-input', value: existing?.extractionMethod || '', 'data-testid': 'soil-test-method' });
  panel.appendChild(inputs.extractionMethod);

  // Unit
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestUnit')]));
  inputs.unit = el('input', { type: 'text', className: 'auth-input', value: existing?.unit || 'ppm', 'data-testid': 'soil-test-unit' });
  panel.appendChild(inputs.unit);

  // 13-element nutrient panel
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestNutrients')]));
  const nutrientGrid = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' } });
  for (const key of NUTRIENT_KEYS) {
    inputs[key] = el('input', {
      type: 'number', className: 'auth-input settings-input', placeholder: key.toUpperCase(),
      value: existing?.[key] ?? '', 'data-testid': `soil-test-${key}`,
      style: { fontSize: '12px' },
    });
    nutrientGrid.appendChild(inputs[key]);
  }
  panel.appendChild(nutrientGrid);

  // pH, buffer pH, CEC, base saturation, organic matter
  const extraFields = [
    { key: 'ph', label: t('amendment.soilTestPh') },
    { key: 'bufferPh', label: t('amendment.soilTestBufferPh') },
    { key: 'cec', label: t('amendment.soilTestCec') },
    { key: 'baseSaturation', label: t('amendment.soilTestBaseSat') },
    { key: 'organicMatter', label: t('amendment.soilTestOm') },
  ];
  for (const f of extraFields) {
    panel.appendChild(el('label', { className: 'form-label' }, [f.label]));
    inputs[f.key] = el('input', {
      type: 'number', className: 'auth-input settings-input',
      value: existing?.[f.key] ?? '', 'data-testid': `soil-test-${f.key}`,
    });
    panel.appendChild(inputs[f.key]);
  }

  // Lab
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestLab')]));
  inputs.lab = el('input', { type: 'text', className: 'auth-input', value: existing?.lab || '', 'data-testid': 'soil-test-lab' });
  panel.appendChild(inputs.lab);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.soilTestNotes')]));
  inputs.notes = el('textarea', { className: 'auth-input', value: existing?.notes || '', 'data-testid': 'soil-test-notes', style: { minHeight: '40px', resize: 'vertical' } });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'soil-test-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', 'data-testid': 'soil-test-save', onClick: () => {
      clear(statusEl);
      const parseNum = v => v === '' ? null : parseFloat(v);
      const data = {
        operationId,
        locationId: inputs.locationId.value,
        testedAt: new Date(inputs.testedAt.value + 'T12:00:00Z').toISOString(),
        extractionMethod: inputs.extractionMethod.value.trim() || null,
        unit: inputs.unit.value.trim() || 'ppm',
        ph: parseNum(inputs.ph.value), bufferPh: parseNum(inputs.bufferPh.value),
        cec: parseNum(inputs.cec.value), baseSaturation: parseNum(inputs.baseSaturation.value),
        organicMatter: parseNum(inputs.organicMatter.value),
        lab: inputs.lab.value.trim() || null,
        notes: inputs.notes.value.trim() || null,
      };
      for (const key of NUTRIENT_KEYS) data[key] = parseNum(inputs[key].value);

      try {
        if (isEdit) update('soilTests', existing.id, data, SoilTestEntity.validate, SoilTestEntity.toSupabaseShape, 'soil_tests');
        else add('soilTests', SoilTestEntity.create(data), SoilTestEntity.validate, SoilTestEntity.toSupabaseShape, 'soil_tests');
        soilTestSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => soilTestSheet.close() }, [t('action.cancel')]),
  ]));

  soilTestSheet.open();
}
