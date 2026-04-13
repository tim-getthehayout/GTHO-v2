/** @file Health reference table sections — CP-32. AI bulls, treatment categories/types, dose units. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove } from '../../data/store.js';
import * as AiBullEntity from '../../entities/ai-bull.js';
import * as TreatmentCategoryEntity from '../../entities/treatment-category.js';
import * as TreatmentTypeEntity from '../../entities/treatment-type.js';
import * as DoseUnitEntity from '../../entities/dose-unit.js';

// ---------------------------------------------------------------------------
// AI Bulls section
// ---------------------------------------------------------------------------

let aiBullSheet = null;

export function renderAiBullsSection(operationId) {
  const bulls = getAll('aiBulls').filter(b => !b.archived);

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-ai-bulls' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('health.aiBulls')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'settings-add-ai-bull',
        onClick: () => openAiBullSheet(null, operationId),
      }, [t('health.addAiBull')]),
    ]),
    bulls.length
      ? el('div', { className: 'ft-list' }, bulls.map(bull =>
          el('div', { className: 'ft-row', 'data-testid': `settings-ai-bull-${bull.id}` }, [
            el('div', {}, [
              el('div', { className: 'ft-row-name' }, [bull.name]),
              el('div', { className: 'ft-row-detail' }, [
                [bull.breed, bull.tag, bull.regNum].filter(Boolean).join(' · ') || '—',
              ]),
            ]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', {
                className: 'btn btn-outline btn-xs',
                onClick: () => openAiBullSheet(bull, operationId),
              }, [t('action.edit')]),
              el('button', {
                className: 'btn btn-outline btn-xs',
                onClick: () => { if (window.confirm(t('health.confirmDelete'))) remove('aiBulls', bull.id, 'ai_bulls'); },
              }, [t('action.delete')]),
            ]),
          ])
        ))
      : el('p', { className: 'form-hint' }, [t('health.bullEmpty')]),
  ]);
}

function openAiBullSheet(existing, operationId) {
  if (!aiBullSheet) aiBullSheet = new Sheet('ai-bull-sheet-wrap');
  const panel = document.getElementById('ai-bull-sheet-panel');
  if (!panel) return;
  clear(panel);

  const inputs = {};
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('health.editAiBull') : t('health.addAiBull')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bullName')]));
  inputs.name = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '', 'data-testid': 'ai-bull-sheet-name' });
  panel.appendChild(inputs.name);

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bullBreed')]));
  inputs.breed = el('input', { type: 'text', className: 'auth-input', value: existing?.breed || '', 'data-testid': 'ai-bull-sheet-breed' });
  panel.appendChild(inputs.breed);

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bullTag')]));
  inputs.tag = el('input', { type: 'text', className: 'auth-input', value: existing?.tag || '', 'data-testid': 'ai-bull-sheet-tag' });
  panel.appendChild(inputs.tag);

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.bullRegNum')]));
  inputs.regNum = el('input', { type: 'text', className: 'auth-input', value: existing?.regNum || '', 'data-testid': 'ai-bull-sheet-reg' });
  panel.appendChild(inputs.regNum);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'ai-bull-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', 'data-testid': 'ai-bull-sheet-save', onClick: () => {
      clear(statusEl);
      const data = { operationId, name: inputs.name.value.trim(), breed: inputs.breed.value.trim() || null, tag: inputs.tag.value.trim() || null, regNum: inputs.regNum.value.trim() || null };
      try {
        if (existing) update('aiBulls', existing.id, data, AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
        else add('aiBulls', AiBullEntity.create(data), AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
        aiBullSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => aiBullSheet.close() }, [t('action.cancel')]),
  ]));

  aiBullSheet.open();
}

// ---------------------------------------------------------------------------
// Treatment categories section
// ---------------------------------------------------------------------------

let categorySheet = null;

export function renderTreatmentCategoriesSection(operationId) {
  const categories = getAll('treatmentCategories').filter(c => !c.archived);

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-treatment-categories' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('health.treatmentCategories')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'settings-add-treatment-category',
        onClick: () => openCategorySheet(null, operationId),
      }, [t('health.addCategory')]),
    ]),
    categories.length
      ? el('div', { className: 'ft-list' }, categories.map(cat =>
          el('div', { className: 'ft-row', 'data-testid': `settings-category-${cat.id}` }, [
            el('span', { className: 'ft-row-name' }, [cat.name + (cat.isDefault ? ' (default)' : '')]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openCategorySheet(cat, operationId) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => { if (window.confirm(t('health.confirmDelete'))) remove('treatmentCategories', cat.id, 'treatment_categories'); } }, [t('action.delete')]),
            ]),
          ])
        ))
      : el('p', { className: 'form-hint' }, [t('health.categoryEmpty')]),
  ]);
}

function openCategorySheet(existing, operationId) {
  if (!categorySheet) categorySheet = new Sheet('treatment-category-sheet-wrap');
  const panel = document.getElementById('treatment-category-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('health.editCategory') : t('health.addCategory')]));
  const nameInput = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '', 'data-testid': 'category-sheet-name' });
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.categoryName')]));
  panel.appendChild(nameInput);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const data = { operationId, name: nameInput.value.trim() };
      try {
        if (existing) update('treatmentCategories', existing.id, data, TreatmentCategoryEntity.validate, TreatmentCategoryEntity.toSupabaseShape, 'treatment_categories');
        else add('treatmentCategories', TreatmentCategoryEntity.create(data), TreatmentCategoryEntity.validate, TreatmentCategoryEntity.toSupabaseShape, 'treatment_categories');
        categorySheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => categorySheet.close() }, [t('action.cancel')]),
  ]));

  categorySheet.open();
}

// ---------------------------------------------------------------------------
// Treatment types section
// ---------------------------------------------------------------------------

let typeSheet = null;

export function renderTreatmentTypesSection(operationId) {
  const types = getAll('treatmentTypes').filter(tt => !tt.archived);
  const categories = getAll('treatmentCategories').filter(c => !c.archived);

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-treatment-types' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('health.treatmentTypes')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'settings-add-treatment-type',
        onClick: () => openTypeSheet(null, operationId, categories),
      }, [t('health.addType')]),
    ]),
    types.length
      ? el('div', { className: 'ft-list' }, types.map(tt => {
          const cat = categories.find(c => c.id === tt.categoryId);
          return el('div', { className: 'ft-row', 'data-testid': `settings-type-${tt.id}` }, [
            el('div', {}, [
              el('span', { className: 'ft-row-name' }, [tt.name]),
              el('div', { className: 'ft-row-detail' }, [cat ? cat.name : '—']),
            ]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openTypeSheet(tt, operationId, categories) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => { if (window.confirm(t('health.confirmDelete'))) remove('treatmentTypes', tt.id, 'treatment_types'); } }, [t('action.delete')]),
            ]),
          ]);
        }))
      : el('p', { className: 'form-hint' }, [t('health.typeEmpty')]),
  ]);
}

function openTypeSheet(existing, operationId, categories) {
  if (!typeSheet) typeSheet = new Sheet('treatment-type-sheet-wrap');
  const panel = document.getElementById('treatment-type-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('health.editType') : t('health.addType')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.typeName')]));
  const nameInput = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '', 'data-testid': 'type-sheet-name' });
  panel.appendChild(nameInput);

  panel.appendChild(el('label', { className: 'form-label' }, [t('health.typeCategory')]));
  const catSelect = el('select', { className: 'auth-select', 'data-testid': 'type-sheet-category' },
    categories.map(c => el('option', { value: c.id }, [c.name])));
  if (existing?.categoryId) catSelect.value = existing.categoryId;
  panel.appendChild(catSelect);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const data = { operationId, name: nameInput.value.trim(), categoryId: catSelect.value || null };
      try {
        if (existing) update('treatmentTypes', existing.id, data, TreatmentTypeEntity.validate, TreatmentTypeEntity.toSupabaseShape, 'treatment_types');
        else add('treatmentTypes', TreatmentTypeEntity.create(data), TreatmentTypeEntity.validate, TreatmentTypeEntity.toSupabaseShape, 'treatment_types');
        typeSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => typeSheet.close() }, [t('action.cancel')]),
  ]));

  typeSheet.open();
}

// ---------------------------------------------------------------------------
// Dose units section (read-only list — seeded at onboarding)
// ---------------------------------------------------------------------------

let doseUnitSheet = null;

export function renderDoseUnitsSection() {
  const units = getAll('doseUnits').filter(u => !u.archived);

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-dose-units' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('health.doseUnits')]),
      el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': 'settings-add-dose-unit',
        onClick: () => openDoseUnitSheet(null),
      }, [t('health.addDoseUnit')]),
    ]),
    units.length
      ? el('div', { className: 'ft-list' }, units.map(u =>
          el('div', { className: 'ft-row', 'data-testid': `settings-dose-unit-${u.id}` }, [
            el('span', { className: 'ft-row-name' }, [u.name]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openDoseUnitSheet(u) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => {
                if (window.confirm(t('health.confirmDelete'))) {
                  update('doseUnits', u.id, { archived: true }, DoseUnitEntity.validate, DoseUnitEntity.toSupabaseShape, 'dose_units');
                }
              }}, [t('action.archive')]),
            ]),
          ])
        ))
      : el('p', { className: 'form-hint' }, [t('health.doseUnitEmpty')]),
  ]);
}

function openDoseUnitSheet(existing) {
  if (!doseUnitSheet) doseUnitSheet = new Sheet('dose-unit-sheet-wrap');
  const panel = document.getElementById('dose-unit-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('health.editDoseUnit') : t('health.addDoseUnit')]));
  const nameInput = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '', 'data-testid': 'dose-unit-sheet-name' });
  panel.appendChild(el('label', { className: 'form-label' }, [t('health.doseUnitName')]));
  panel.appendChild(nameInput);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const data = { name: nameInput.value.trim() };
      try {
        if (existing) update('doseUnits', existing.id, data, DoseUnitEntity.validate, DoseUnitEntity.toSupabaseShape, 'dose_units');
        else add('doseUnits', DoseUnitEntity.create(data), DoseUnitEntity.validate, DoseUnitEntity.toSupabaseShape, 'dose_units');
        doseUnitSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => doseUnitSheet.close() }, [t('action.cancel')]),
  ]));

  doseUnitSheet.open();
}

/**
 * Render sheet markup elements for health reference table sheets.
 * Call this from the settings screen to ensure sheets are in the DOM.
 */
export function renderHealthRefSheetMarkups() {
  return [
    el('div', { className: 'sheet-wrap', id: 'ai-bull-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => aiBullSheet && aiBullSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'ai-bull-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'treatment-category-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => categorySheet && categorySheet.close() }),
      el('div', { className: 'sheet-panel', id: 'treatment-category-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'treatment-type-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => typeSheet && typeSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'treatment-type-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'dose-unit-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => doseUnitSheet && doseUnitSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'dose-unit-sheet-panel' }),
    ]),
  ];
}
