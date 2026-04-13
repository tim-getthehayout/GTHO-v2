/** @file Amendment reference table sections — CP-38. Products, categories, spreaders, units. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as ProductCategoryEntity from '../../entities/input-product-category.js';
import * as ProductEntity from '../../entities/input-product.js';
import * as SpreaderEntity from '../../entities/spreader.js';

// ---------------------------------------------------------------------------
// Product categories
// ---------------------------------------------------------------------------

let categorySheet = null;

export function renderProductCategoriesSection(operationId) {
  const categories = getAll('inputProductCategories').filter(c => !c.archived);
  return el('div', { className: 'card settings-card', 'data-testid': 'settings-product-categories' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('amendment.productCategories')]),
      el('button', {
        className: 'btn btn-outline btn-xs', 'data-testid': 'settings-add-product-category',
        onClick: () => openProductCategorySheet(null, operationId),
      }, [t('amendment.addCategory')]),
    ]),
    categories.length
      ? el('div', { className: 'ft-list' }, categories.map(cat =>
          el('div', { className: 'ft-row' }, [
            el('span', { className: 'ft-row-name' }, [cat.name + (cat.isDefault ? ' (default)' : '')]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openProductCategorySheet(cat, operationId) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => { if (window.confirm(t('amendment.confirmDelete'))) remove('inputProductCategories', cat.id, 'input_product_categories'); } }, [t('action.delete')]),
            ]),
          ])
        ))
      : el('p', { className: 'form-hint' }, [t('amendment.categoryEmpty')]),
  ]);
}

function openProductCategorySheet(existing, operationId) {
  if (!categorySheet) categorySheet = new Sheet('product-category-sheet-wrap');
  const panel = document.getElementById('product-category-sheet-panel');
  if (!panel) return;
  clear(panel);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('amendment.editCategory') : t('amendment.addCategory')]));
  const nameInput = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '' });
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.categoryName')]));
  panel.appendChild(nameInput);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const data = { operationId, name: nameInput.value.trim() };
      try {
        if (existing) update('inputProductCategories', existing.id, data, ProductCategoryEntity.validate, ProductCategoryEntity.toSupabaseShape, 'input_product_categories');
        else add('inputProductCategories', ProductCategoryEntity.create(data), ProductCategoryEntity.validate, ProductCategoryEntity.toSupabaseShape, 'input_product_categories');
        categorySheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => categorySheet.close() }, [t('action.cancel')]),
  ]));
  categorySheet.open();
}

// ---------------------------------------------------------------------------
// Input products
// ---------------------------------------------------------------------------

let productSheet = null;

export function renderProductsSection(operationId) {
  const products = getAll('inputProducts').filter(p => !p.archived);
  const categories = getAll('inputProductCategories').filter(c => !c.archived);

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-input-products' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('amendment.products')]),
      el('button', {
        className: 'btn btn-outline btn-xs', 'data-testid': 'settings-add-product',
        onClick: () => openProductSheet(null, operationId, categories),
      }, [t('amendment.addProduct')]),
    ]),
    products.length
      ? el('div', { className: 'ft-list' }, products.map(p => {
          const cat = categories.find(c => c.id === p.categoryId);
          const npk = [p.nPct, p.pPct, p.kPct].map(v => v != null ? `${v}%` : '—').join('/');
          return el('div', { className: 'ft-row' }, [
            el('div', {}, [
              el('div', { className: 'ft-row-name' }, [p.name]),
              el('div', { className: 'ft-row-detail' }, [`${cat ? cat.name : '—'} · NPK: ${npk}`]),
            ]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openProductSheet(p, operationId, categories) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => { if (window.confirm(t('amendment.confirmDelete'))) remove('inputProducts', p.id, 'input_products'); } }, [t('action.delete')]),
            ]),
          ]);
        }))
      : el('p', { className: 'form-hint' }, [t('amendment.productEmpty')]),
  ]);
}

function openProductSheet(existing, operationId, categories) {
  if (!productSheet) productSheet = new Sheet('product-sheet-wrap');
  const panel = document.getElementById('product-sheet-panel');
  if (!panel) return;
  clear(panel);

  const inputs = {};
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('amendment.editProduct') : t('amendment.addProduct')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.productName')]));
  inputs.name = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '' });
  panel.appendChild(inputs.name);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.productCategory')]));
  inputs.categoryId = el('select', { className: 'auth-select' }, categories.map(c => el('option', { value: c.id }, [c.name])));
  if (existing?.categoryId) inputs.categoryId.value = existing.categoryId;
  panel.appendChild(inputs.categoryId);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.productNpk')]));
  const npkRow = el('div', { style: { display: 'flex', gap: 'var(--space-3)' } });
  inputs.nPct = el('input', { type: 'number', className: 'auth-input settings-input', placeholder: 'N', value: existing?.nPct ?? '' });
  inputs.pPct = el('input', { type: 'number', className: 'auth-input settings-input', placeholder: 'P', value: existing?.pPct ?? '' });
  inputs.kPct = el('input', { type: 'number', className: 'auth-input settings-input', placeholder: 'K', value: existing?.kPct ?? '' });
  npkRow.appendChild(inputs.nPct);
  npkRow.appendChild(inputs.pPct);
  npkRow.appendChild(inputs.kPct);
  panel.appendChild(npkRow);

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.productCost')]));
  inputs.costPerUnit = el('input', { type: 'number', className: 'auth-input settings-input', value: existing?.costPerUnit ?? '' });
  panel.appendChild(inputs.costPerUnit);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      const parseNum = v => v === '' ? null : parseFloat(v);
      const data = {
        operationId, name: inputs.name.value.trim(),
        categoryId: inputs.categoryId.value || null,
        nPct: parseNum(inputs.nPct.value), pPct: parseNum(inputs.pPct.value), kPct: parseNum(inputs.kPct.value),
        costPerUnit: parseNum(inputs.costPerUnit.value),
      };
      try {
        if (existing) update('inputProducts', existing.id, data, ProductEntity.validate, ProductEntity.toSupabaseShape, 'input_products');
        else add('inputProducts', ProductEntity.create(data), ProductEntity.validate, ProductEntity.toSupabaseShape, 'input_products');
        productSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => productSheet.close() }, [t('action.cancel')]),
  ]));
  productSheet.open();
}

// ---------------------------------------------------------------------------
// Spreaders
// ---------------------------------------------------------------------------

let spreaderSheet = null;

export function renderSpreadersSection(operationId) {
  const spreaders = getAll('spreaders').filter(s => !s.archived);
  const unitSys = getUnitSystem();

  return el('div', { className: 'card settings-card', 'data-testid': 'settings-spreaders' }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('h3', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('amendment.spreaders')]),
      el('button', {
        className: 'btn btn-outline btn-xs', 'data-testid': 'settings-add-spreader',
        onClick: () => openSpreaderSheet(null, operationId),
      }, [t('amendment.addSpreader')]),
    ]),
    spreaders.length
      ? el('div', { className: 'ft-list' }, spreaders.map(s =>
          el('div', { className: 'ft-row' }, [
            el('div', {}, [
              el('div', { className: 'ft-row-name' }, [s.name]),
              el('div', { className: 'ft-row-detail' }, [display(s.capacityKg, 'weight', unitSys, 0)]),
            ]),
            el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => openSpreaderSheet(s, operationId) }, [t('action.edit')]),
              el('button', { className: 'btn btn-outline btn-xs', onClick: () => { if (window.confirm(t('amendment.confirmDelete'))) remove('spreaders', s.id, 'spreaders'); } }, [t('action.delete')]),
            ]),
          ])
        ))
      : el('p', { className: 'form-hint' }, [t('amendment.spreaderEmpty')]),
  ]);
}

function openSpreaderSheet(existing, operationId) {
  if (!spreaderSheet) spreaderSheet = new Sheet('spreader-sheet-wrap');
  const panel = document.getElementById('spreader-sheet-panel');
  if (!panel) return;
  clear(panel);

  const unitSys = getUnitSystem();
  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [existing ? t('amendment.editSpreader') : t('amendment.addSpreader')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.spreaderName')]));
  const nameInput = el('input', { type: 'text', className: 'auth-input', value: existing?.name || '' });
  panel.appendChild(nameInput);

  const capLabel = `${t('amendment.spreaderCapacity')} (${unitLabel('weight', unitSys)})`;
  panel.appendChild(el('label', { className: 'form-label' }, [capLabel]));
  const capVal = existing?.capacityKg != null && unitSys === 'imperial'
    ? convert(existing.capacityKg, 'weight', 'toImperial').toFixed(0) : (existing?.capacityKg ?? '');
  const capInput = el('input', { type: 'number', className: 'auth-input settings-input', value: capVal });
  panel.appendChild(capInput);

  const statusEl = el('div', { className: 'auth-error' });
  panel.appendChild(statusEl);
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', { className: 'btn btn-green', onClick: () => {
      clear(statusEl);
      let capacityKg = parseFloat(capInput.value);
      if (unitSys === 'imperial' && capacityKg) capacityKg = convert(capacityKg, 'weight', 'toMetric');
      const data = { operationId, name: nameInput.value.trim(), capacityKg: capacityKg || null };
      try {
        if (existing) update('spreaders', existing.id, data, SpreaderEntity.validate, SpreaderEntity.toSupabaseShape, 'spreaders');
        else add('spreaders', SpreaderEntity.create(data), SpreaderEntity.validate, SpreaderEntity.toSupabaseShape, 'spreaders');
        spreaderSheet.close();
      } catch (err) { statusEl.appendChild(el('span', {}, [err.message])); }
    }}, [t('action.save')]),
    el('button', { className: 'btn btn-outline', onClick: () => spreaderSheet.close() }, [t('action.cancel')]),
  ]));
  spreaderSheet.open();
}

// ---------------------------------------------------------------------------
// Product units (read-only, seeded at onboarding)
// ---------------------------------------------------------------------------

export function renderProductUnitsSection() {
  const units = getAll('inputProductUnits').filter(u => !u.archived);
  return el('div', { className: 'card settings-card', 'data-testid': 'settings-product-units' }, [
    el('h3', { className: 'settings-section-title' }, [t('amendment.productUnits')]),
    units.length
      ? el('div', { className: 'ft-list' }, units.map(u =>
          el('div', { className: 'ft-row' }, [el('span', { className: 'ft-row-name' }, [u.name])])
        ))
      : el('p', { className: 'form-hint' }, [t('amendment.productUnitEmpty')]),
  ]);
}

export function renderAmendmentRefSheetMarkups() {
  return [
    el('div', { className: 'sheet-wrap', id: 'product-category-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => categorySheet && categorySheet.close() }),
      el('div', { className: 'sheet-panel', id: 'product-category-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'product-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => productSheet && productSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'product-sheet-panel' }),
    ]),
    el('div', { className: 'sheet-wrap', id: 'spreader-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => spreaderSheet && spreaderSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'spreader-sheet-panel' }),
    ]),
  ];
}
