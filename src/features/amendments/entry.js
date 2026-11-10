/** @file Amendment entry — CP-40. Amendment flow with NPK preview and multi-paddock distribution. */

import { el, clear } from '../../ui/dom.js';
import { openLocationMapPicker } from '../map/picker.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, remove, subscribe, runDurableWrite } from '../../data/store.js';
import * as AmendmentEntity from '../../entities/amendment.js';
import * as AmendmentLocationEntity from '../../entities/amendment-location.js';
import { isCalendarDate, optionalFormNumber } from '../../utils/form-values.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert } from '../../utils/units.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';

let unsubs = [];

export function renderAmendmentsScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('amendment.amendments')]));
    return;
  }
  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'amendments-screen' }, [
    el('div', { className: 'screen-action-bar' }, [
      el('h1', { className: 'screen-heading', style: { marginBottom: '0' } }, [t('amendment.amendments')]),
      el('button', {
        className: 'btn btn-green btn-sm',
        'data-testid': 'amendments-add-btn',
        onClick: () => openAmendmentSheet(null, operationId),
      }, [t('amendment.addAmendment')]),
    ]),
    el('div', { 'data-testid': 'amendments-list' }),
  ]);

  container.appendChild(screenEl);
  renderAmendmentList(container, operationId);
  unsubs.push(subscribe('amendments', () => renderAmendmentList(container, operationId)));
  unsubs.push(subscribe('amendmentLocations', () => renderAmendmentList(container, operationId)));
}

function renderAmendmentList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="amendments-list"]');
  if (!listEl) return;
  clear(listEl);

  const amendments = getAll('amendments').filter(a => a.operationId === operationId);
  if (!amendments.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'amendments-empty',
    }, [t('amendment.amendmentEmpty')]));
    return;
  }

  const sorted = [...amendments].sort((a, b) => (b.appliedAt || '').localeCompare(a.appliedAt || ''));
  const inputProducts = getAll('inputProducts');
  const manureBatches = getAll('manureBatches');
  const inputProductUnits = getAll('inputProductUnits');

  for (const amendment of sorted) {
    const date = amendment.appliedAt ? amendment.appliedAt.slice(0, 10) : '?';
    let sourceName = amendment.sourceType;
    if (amendment.sourceType === 'product' && amendment.inputProductId) {
      const prod = inputProducts.find(p => p.id === amendment.inputProductId);
      if (prod) sourceName = prod.name;
    } else if (amendment.sourceType === 'manure' && amendment.manureBatchId) {
      const batch = manureBatches.find(b => b.id === amendment.manureBatchId);
      if (batch) sourceName = batch.label;
    }

    let qtyLabel = '';
    if (amendment.totalQty != null) {
      const unit = amendment.qtyUnitId
        ? inputProductUnits.find(u => u.id === amendment.qtyUnitId)
        : null;
      qtyLabel = `${amendment.totalQty}${unit ? ' ' + unit.name : ''}`;
    }

    const amendLocs = getAll('amendmentLocations').filter(al => al.amendmentId === amendment.id);
    const paddockNames = amendLocs.map(al => {
      const loc = getById('locations', al.locationId);
      return loc ? loc.name : '?';
    }).join(', ');

    listEl.appendChild(el('div', {
      className: 'card',
      style: { padding: '12px 14px', marginBottom: 'var(--space-3)' },
      'data-testid': `amendment-${amendment.id}`,
    }, [
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } }, [
        el('div', {}, [
          el('div', { style: { fontWeight: '600', fontSize: '14px' } }, [sourceName]),
          el('div', { className: 'ft-row-detail' }, [
            [date, qtyLabel, paddockNames].filter(Boolean).join(' · '),
          ]),
          amendment.costOverride != null
            ? el('div', { className: 'form-hint' }, [t('event.costDisplay', { value: amendment.costOverride })])
            : el('span', {}),
        ]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `amendment-delete-${amendment.id}`,
          onClick: () => {
            if (window.confirm(t('amendment.confirmDelete'))) {
              const locs = getAll('amendmentLocations').filter(al => al.amendmentId === amendment.id);
              for (const loc of locs) remove('amendmentLocations', loc.id, 'amendment_locations');
              remove('amendments', amendment.id, 'amendments');
            }
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
}

let amendmentSheet = null;

export function openAmendmentSheet(existing, operationId) {
  if (!document.getElementById('amendment-sheet-wrap')) document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'amendment-sheet-wrap' }, [
    el('div', { className: 'sheet-backdrop', onClick: () => amendmentSheet?.close() }),
    el('div', { className: 'sheet-panel', id: 'amendment-sheet-panel' }),
  ]));
  const executionKey = JSON.stringify([operationId, 'amendment', crypto.randomUUID(), 1]);
  let committed = false;
  if (!amendmentSheet) amendmentSheet = new Sheet('amendment-sheet-wrap');
  const panel = document.getElementById('amendment-sheet-panel');
  if (!panel) return;
  clear(panel);

  const todayStr = getLocalTodayStr();
  const inputProducts = getAll('inputProducts').filter(p => !p.archived);
  const manureBatches = getAll('manureBatches').filter(b => b.operationId === operationId);
  const inputProductUnits = getAll('inputProductUnits').filter(u => !u.archived);
  const locations = getAll('locations').filter(l => !l.archived && l.type === 'land');
  const spreaders = getAll('spreaders').filter(s => !s.archived);

  const sourceState = { value: existing?.sourceType || 'product' };
  const selectedLocations = new Set(
    existing ? getAll('amendmentLocations').filter(al => al.amendmentId === existing.id).map(al => al.locationId) : []
  );

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('amendment.addAmendment')]));

  // Date
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.amendmentDate')]));
  const dateInput = el('input', {
    type: 'date', className: 'auth-input',
    value: existing?.appliedAt?.slice(0, 10) || todayStr,
    'data-testid': 'amendment-date',
  });
  panel.appendChild(dateInput);

  // Source type toggle
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.sourceType')]));
  const sourceRow = el('div', { className: 'btn-row', 'data-testid': 'amendment-source-type' });
  const renderSourceToggle = () => {
    clear(sourceRow);
    sourceRow.appendChild(el('button', {
      className: `btn btn-sm ${sourceState.value === 'product' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'amendment-source-product',
      onClick: () => { sourceState.value = 'product'; renderSourceToggle(); renderSourcePicker(); },
    }, [t('amendment.sourceProduct')]));
    sourceRow.appendChild(el('button', {
      className: `btn btn-sm ${sourceState.value === 'manure' ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'amendment-source-manure',
      onClick: () => { sourceState.value = 'manure'; renderSourceToggle(); renderSourcePicker(); },
    }, [t('amendment.sourceManure')]));
  };
  renderSourceToggle();
  panel.appendChild(sourceRow);

  // Source picker (product or manure batch)
  const sourcePickerEl = el('div', {});
  panel.appendChild(sourcePickerEl);

  let productSelect = null;
  let manureBatchSelect = null;

  const renderSourcePicker = () => {
    clear(sourcePickerEl);
    if (sourceState.value === 'product') {
      sourcePickerEl.appendChild(el('label', { className: 'form-label' }, [t('amendment.product')]));
      productSelect = el('select', {
        className: 'auth-select', 'data-testid': 'amendment-product',
      }, [
        el('option', { value: '' }, ['—']),
        ...inputProducts.map(p => el('option', { value: p.id }, [p.name])),
      ]);
      if (existing?.inputProductId) productSelect.value = existing.inputProductId;
      productSelect.addEventListener('change', updateNpkPreview);
      sourcePickerEl.appendChild(productSelect);
    } else {
      sourcePickerEl.appendChild(el('label', { className: 'form-label' }, [t('amendment.manureBatch')]));
      manureBatchSelect = el('select', {
        className: 'auth-select', 'data-testid': 'amendment-manure-batch',
      }, [
        el('option', { value: '' }, ['—']),
        ...manureBatches.map(b => el('option', { value: b.id }, [b.label])),
      ]);
      if (existing?.manureBatchId) manureBatchSelect.value = existing.manureBatchId;
      manureBatchSelect.addEventListener('change', updateNpkPreview);
      sourcePickerEl.appendChild(manureBatchSelect);
    }
    updateNpkPreview();
  };
  // Initialize the picker only once its preview and quantity controls exist.

  // Quantity + unit
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.quantity')]));
  const qtyRow = el('div', { style: { display: 'flex', gap: 'var(--space-3)' } });
  const qtyInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.totalQty ?? '',
    'data-testid': 'amendment-qty',
  });
  const unitSelect = el('select', {
    className: 'auth-select', style: { maxWidth: '120px' },
    'data-testid': 'amendment-unit',
  }, [
    el('option', { value: '' }, ['—']),
    ...inputProductUnits.map(u => el('option', { value: u.id }, [u.name])),
  ]);
  if (existing?.qtyUnitId) unitSelect.value = existing.qtyUnitId;
  qtyInput.addEventListener('input', updateNpkPreview);
  qtyRow.appendChild(qtyInput);
  qtyRow.appendChild(unitSelect);
  panel.appendChild(qtyRow);

  // Spreader
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.spreader')]));
  const spreaderSelect = el('select', {
    className: 'auth-select', 'data-testid': 'amendment-spreader',
  }, [
    el('option', { value: '' }, ['—']),
    ...spreaders.map(s => el('option', { value: s.id }, [s.name])),
  ]);
  if (existing?.spreaderId) spreaderSelect.value = existing.spreaderId;
  panel.appendChild(spreaderSelect);

  // Cost override
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.costOverride')]));
  const costInput = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existing?.costOverride ?? '',
    'data-testid': 'amendment-cost',
  });
  panel.appendChild(costInput);

  // NPK preview
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.npkPreview')]));
  const npkPreviewEl = el('div', {
    className: 'form-hint',
    'data-testid': 'amendment-npk-preview',
    style: { marginBottom: 'var(--space-3)', fontFamily: 'monospace' },
  });
  panel.appendChild(npkPreviewEl);
  renderSourcePicker();
  unitSelect.addEventListener('change', updateNpkPreview);

  function updateNpkPreview() {
    clear(npkPreviewEl);
    const qty = parseFloat(qtyInput.value);
    if (!Number.isFinite(qty) || qty <= 0) {
      npkPreviewEl.appendChild(el('span', {}, [t('amendment.npkPreviewEmpty')]));
      return;
    }
    // A label-only unit has no conversion metadata: never assume bags/litres are kg.
    if (getById('inputProductUnits', unitSelect.value)?.name !== 'kg') { npkPreviewEl.appendChild(el('span', {}, [t('amendment.npkPreviewNoData')])); return; }
    let nPct = null, pPct = null, kPct = null;
    if (sourceState.value === 'product' && productSelect && productSelect.value) {
      const prod = inputProducts.find(p => p.id === productSelect.value);
      if (prod) { nPct = prod.nPct; pPct = prod.pPct; kPct = prod.kPct; }
    } else if (sourceState.value === 'manure' && manureBatchSelect && manureBatchSelect.value) {
      const batch = manureBatches.find(b => b.id === manureBatchSelect.value);
      if (batch) {
        // For manure, nKg/pKg/kKg are per-batch totals; we show ratios if volume is set
        if (batch.estimatedVolumeKg && batch.estimatedVolumeKg > 0) {
          nPct = batch.nKg != null ? (batch.nKg / batch.estimatedVolumeKg) * 100 : null;
          pPct = batch.pKg != null ? (batch.pKg / batch.estimatedVolumeKg) * 100 : null;
          kPct = batch.kKg != null ? (batch.kKg / batch.estimatedVolumeKg) * 100 : null;
        }
      }
    }
    if (nPct == null && pPct == null && kPct == null) {
      npkPreviewEl.appendChild(el('span', {}, [t('amendment.npkPreviewNoData')]));
      return;
    }
    const nKg = nPct != null ? ((nPct / 100) * qty).toFixed(2) : '—';
    const pKg = pPct != null ? ((pPct / 100) * qty).toFixed(2) : '—';
    const kKg = kPct != null ? ((kPct / 100) * qty).toFixed(2) : '—';
    npkPreviewEl.appendChild(el('span', {}, [`N: ${nKg} kg  P: ${pKg} kg  K: ${kKg} kg`]));
  }

  // Paddock multi-select
  panel.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
    el('label', { className: 'form-label', style: { margin: '0' } }, [t('amendment.paddocks')]),
    el('button', { type: 'button', className: 'btn btn-outline btn-sm', onClick: () => openLocationMapPicker({
      title: 'Add a paddock',
      onSelect: (id) => {
        selectedLocations.add(id);
        const box = document.getElementById(`amend-loc-${id}`);
        if (box) box.checked = true;
      },
    }) }, ['Pick on map']),
  ]));
  const paddockListEl = el('div', { 'data-testid': 'amendment-paddocks', style: { marginBottom: 'var(--space-3)' } });
  for (const loc of locations) {
    const checked = selectedLocations.has(loc.id);
    const row = el('div', {
      style: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: '4px' },
    });
    const cb = el('input', {
      type: 'checkbox', id: `amend-loc-${loc.id}`,
      'data-testid': `amendment-loc-${loc.id}`,
    });
    cb.checked = checked;
    cb.addEventListener('change', () => {
      if (cb.checked) selectedLocations.add(loc.id);
      else selectedLocations.delete(loc.id);
    });
    row.appendChild(cb);
    row.appendChild(el('label', { htmlFor: `amend-loc-${loc.id}`, style: { cursor: 'pointer' } }, [loc.name]));
    const hectares = loc.areaHectares ?? loc.areaHa;
    if (hectares != null) { const imperial = getUnitSystem() === 'imperial'; row.appendChild(el('span', { className: 'form-hint' }, [`${(imperial ? convert(hectares, 'area', 'toImperial') : hectares).toFixed(2)} ${imperial ? 'ac' : 'ha'}`])); }
    paddockListEl.appendChild(row);
  }
  panel.appendChild(paddockListEl);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('amendment.notes')]));
  const notesInput = el('textarea', {
    className: 'auth-input',
    value: existing?.notes || '',
    'data-testid': 'amendment-notes',
    style: { minHeight: '40px', resize: 'vertical' },
  });
  panel.appendChild(notesInput);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'amendment-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'amendment-save',
      onClick: () => {
        clear(statusEl);
        try {
          if (committed) return;
          if (!isCalendarDate(dateInput.value)) throw new Error(t('manualEntry.invalidDate'));
          const qty = optionalFormNumber(qtyInput.value), cost = optionalFormNumber(costInput.value);
          if (qty === null || qty <= 0 || (cost !== null && cost < 0)) throw new Error(t('manualEntry.invalidNumber'));
          const product = getById('inputProducts', productSelect?.value), manure = getById('manureBatches', manureBatchSelect?.value);
          const unit = getById('inputProductUnits', unitSelect.value);
          if (!unit || unit.archived || (sourceState.value === 'product' ? !product || product.archived : !manure || manure.operationId !== operationId)) throw new Error(t('manualEntry.invalidReference'));
          if (spreaderSelect.value && !getById('spreaders', spreaderSelect.value)) throw new Error(t('manualEntry.invalidReference'));
          if (!selectedLocations.size || [...selectedLocations].some(id => { const loc = getById('locations', id); return !loc || loc.archived || loc.type !== 'land' || loc.operationId !== operationId; })) throw new Error(t('manualEntry.invalidReference'));

          const amendmentData = AmendmentEntity.create({
            operationId,
            appliedAt: new Date(dateInput.value + 'T12:00:00Z').toISOString(),
            sourceType: sourceState.value,
            inputProductId: sourceState.value === 'product' && productSelect?.value ? productSelect.value : null,
            manureBatchId: sourceState.value === 'manure' && manureBatchSelect?.value ? manureBatchSelect.value : null,
            spreaderId: spreaderSelect.value || null,
            totalQty: qty,
            qtyUnitId: unitSelect.value || null,
            costOverride: cost,
            notes: notesInput.value.trim() || null,
          });

          const allocations = [];
          const valid = AmendmentEntity.validate(amendmentData); if (!valid.valid) throw new Error(valid.errors.join('; '));

          // Create amendment_location records, splitting nutrients by area
          const locationArr = [...selectedLocations];
          const locCount = locationArr.length;
          if (locCount > 0) {
            for (const locationId of locationArr) {
              const loc = getById('locations', locationId);
              const locAreaHa = loc?.areaHectares ?? loc?.areaHa ?? null;

              // Split qty evenly across paddocks
              const locQty = qty != null ? qty / locCount : null;

              // Compute per-location nutrient kg from product composition
              let nKg = null, pKg = null, kKg = null;
              if (qty != null) {
                if (sourceState.value === 'product' && productSelect?.value && unit.name === 'kg') {
                  const prod = inputProducts.find(p => p.id === productSelect.value);
                  if (prod) {
                    nKg = prod.nPct != null ? (prod.nPct / 100) * qty / locCount : null;
                    pKg = prod.pPct != null ? (prod.pPct / 100) * qty / locCount : null;
                    kKg = prod.kPct != null ? (prod.kPct / 100) * qty / locCount : null;
                  }
                }
              }

              const alData = AmendmentLocationEntity.create({
                operationId,
                amendmentId: amendmentData.id,
                locationId,
                qty: locQty,
                nKg,
                pKg,
                kKg,
                areaHa: locAreaHa,
              });
              const valid = AmendmentLocationEntity.validate(alData); if (!valid.valid) throw new Error(valid.errors.join('; '));
              if ([alData.nKg, alData.pKg, alData.kKg, alData.qty].some(value => value !== null && !Number.isFinite(value))) throw new Error(t('manualEntry.invalidNumber'));
              allocations.push(alData);
            }
          }

          runDurableWrite(executionKey, () => {
            add('amendments', amendmentData, AmendmentEntity.validate, AmendmentEntity.toSupabaseShape, 'amendments');
            for (const allocation of allocations) add('amendmentLocations', allocation, AmendmentLocationEntity.validate, AmendmentLocationEntity.toSupabaseShape, 'amendment_locations');
            return amendmentData.id;
          });
          committed = true;
          amendmentSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => amendmentSheet.close(),
    }, [t('action.cancel')]),
  ]));

  amendmentSheet.open();
}
