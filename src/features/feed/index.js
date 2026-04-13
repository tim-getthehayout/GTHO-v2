/** @file Feed screen — CP-24+. Feed types, batches, delivery, checks. */

import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove, subscribe } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as FeedTypeEntity from '../../entities/feed-type.js';
import * as BatchEntity from '../../entities/batch.js';
import * as BatchAdjustmentEntity from '../../entities/batch-adjustment.js';

/** Unsubscribe functions */
let unsubs = [];

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderFeedScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('feed.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'feed-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('feed.title')]),

    // Batches section
    el('div', { 'data-testid': 'feed-batches-section' }, [
      el('div', { className: 'screen-action-bar' }, [
        el('h2', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('feed.batches')]),
        el('button', {
          className: 'btn btn-green btn-sm',
          'data-testid': 'feed-add-batch-btn',
          onClick: () => openBatchSheet(null, operationId),
        }, [t('feed.addBatch')]),
      ]),
      // Feed metrics placeholder (daily run rate, DM on hand, days on hand)
      el('div', { className: 'form-hint', style: { fontStyle: 'italic', marginBottom: 'var(--space-4)' } }, [
        t('feed.metricsPlaceholder'),
      ]),
      el('div', { 'data-testid': 'feed-batch-list' }),
    ]),

    // Feed types section
    el('div', { className: 'section-divider' }, [
      el('div', { className: 'screen-action-bar' }, [
        el('h2', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('feed.feedTypes')]),
        el('button', {
          className: 'btn btn-outline btn-sm',
          'data-testid': 'feed-add-type-btn',
          onClick: () => openFeedTypeSheet(null, operationId),
        }, [t('feed.addFeedType')]),
      ]),
      el('div', { 'data-testid': 'feed-type-list' }),
    ]),

    // Feed type sheet
    el('div', { className: 'sheet-wrap', id: 'feed-type-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => feedTypeSheet && feedTypeSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'feed-type-sheet-panel' }),
    ]),

    // Batch sheet
    el('div', { className: 'sheet-wrap', id: 'batch-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => batchSheet && batchSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'batch-sheet-panel' }),
    ]),

    // Batch adjustment sheet
    el('div', { className: 'sheet-wrap', id: 'batch-adjust-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => batchAdjustSheet && batchAdjustSheet.close() }),
      el('div', { className: 'sheet-panel', id: 'batch-adjust-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderBatchList(container, operationId);
  renderFeedTypeList(container);

  unsubs.push(subscribe('feedTypes', () => renderFeedTypeList(container)));
  unsubs.push(subscribe('batches', () => renderBatchList(container, operationId)));
  unsubs.push(subscribe('batchAdjustments', () => renderBatchList(container, operationId)));
}

// ---------------------------------------------------------------------------
// Feed type list
// ---------------------------------------------------------------------------

function renderFeedTypeList(rootContainer) {
  const listEl = rootContainer.querySelector('[data-testid="feed-type-list"]');
  if (!listEl) return;
  clear(listEl);

  const feedTypes = getAll('feedTypes').filter(ft => !ft.archived);
  const operations = getAll('operations');
  const operationId = operations[0]?.id;
  const unitSys = getUnitSystem();

  if (!feedTypes.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'feed-type-empty',
    }, [t('feed.feedTypeEmpty')]));
    return;
  }

  const list = el('div', { className: 'ft-list' });
  for (const ft of feedTypes) {
    const detailParts = [ft.category, ft.unit];
    if (ft.dmPct != null) detailParts.push(`${ft.dmPct}% DM`);
    if (ft.defaultWeightKg != null) {
      detailParts.push(display(ft.defaultWeightKg, 'weight', unitSys, 0) + '/unit');
    }
    if (ft.harvestActive) detailParts.push('harvest');

    list.appendChild(el('div', {
      className: 'ft-row',
      'data-testid': `feed-type-${ft.id}`,
    }, [
      el('div', {}, [
        el('div', { className: 'ft-row-name' }, [ft.name]),
        el('div', { className: 'ft-row-detail' }, [detailParts.join(' · ')]),
      ]),
      el('div', { style: { display: 'flex', gap: 'var(--space-2)' } }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-type-edit-${ft.id}`,
          onClick: () => openFeedTypeSheet(ft, operationId),
        }, [t('action.edit')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-type-delete-${ft.id}`,
          onClick: () => {
            if (window.confirm(t('feed.confirmDeleteFeedType'))) {
              remove('feedTypes', ft.id, 'feed_types');
            }
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
  listEl.appendChild(list);
}

// ---------------------------------------------------------------------------
// Feed type sheet
// ---------------------------------------------------------------------------

let feedTypeSheet = null;

function openFeedTypeSheet(existingFt, operationId) {
  if (!feedTypeSheet) {
    feedTypeSheet = new Sheet('feed-type-sheet-wrap');
  }

  const panel = document.getElementById('feed-type-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingFt;
  const unitSys = getUnitSystem();
  const forageTypes = getAll('forageTypes').filter(ft => !ft.archived);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('feed.editFeedType') : t('feed.createFeedType'),
  ]));

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.feedTypeName')]));
  inputs.name = el('input', {
    type: 'text', className: 'auth-input', value: existingFt?.name || '',
    'data-testid': 'feed-type-sheet-name',
  });
  panel.appendChild(inputs.name);

  // Category
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.category')]));
  inputs.category = el('select', {
    className: 'auth-select', 'data-testid': 'feed-type-sheet-category',
  }, [
    el('option', { value: 'hay' }, [t('feed.categoryHay')]),
    el('option', { value: 'silage' }, [t('feed.categorySilage')]),
    el('option', { value: 'grain' }, [t('feed.categoryGrain')]),
    el('option', { value: 'supplement' }, [t('feed.categorySupplement')]),
    el('option', { value: 'other' }, [t('feed.categoryOther')]),
  ]);
  if (existingFt?.category) inputs.category.value = existingFt.category;
  panel.appendChild(inputs.category);

  // Unit
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.unit')]));
  inputs.unit = el('select', {
    className: 'auth-select', 'data-testid': 'feed-type-sheet-unit',
  }, [
    el('option', { value: 'bale' }, [t('feed.unitBale')]),
    el('option', { value: 'ton' }, [t('feed.unitTon')]),
    el('option', { value: 'kg' }, [t('feed.unitKg')]),
    el('option', { value: 'lb' }, [t('feed.unitLb')]),
  ]);
  if (existingFt?.unit) inputs.unit.value = existingFt.unit;
  panel.appendChild(inputs.unit);

  // DM %
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.dmPct')]));
  inputs.dmPct = el('input', {
    type: 'number', className: 'auth-input settings-input', value: existingFt?.dmPct ?? '',
    'data-testid': 'feed-type-sheet-dm-pct',
  });
  panel.appendChild(inputs.dmPct);

  // Default weight per unit
  const weightLabel = `${t('feed.defaultWeight')} (${unitLabel('weight', unitSys)})`;
  const weightValue = existingFt?.defaultWeightKg != null && unitSys === 'imperial'
    ? convert(existingFt.defaultWeightKg, 'weight', 'toImperial').toFixed(0)
    : (existingFt?.defaultWeightKg ?? '');
  panel.appendChild(el('label', { className: 'form-label' }, [weightLabel]));
  inputs.defaultWeightKg = el('input', {
    type: 'number', className: 'auth-input settings-input', value: weightValue,
    'data-testid': 'feed-type-sheet-weight',
  });
  panel.appendChild(inputs.defaultWeightKg);

  // NPK %
  panel.appendChild(el('label', { className: 'form-label' }, ['N / P / K %']));
  const npkRow = el('div', { style: { display: 'flex', gap: 'var(--space-3)' } });
  inputs.nPct = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'N',
    value: existingFt?.nPct ?? '', 'data-testid': 'feed-type-sheet-n',
  });
  inputs.pPct = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'P',
    value: existingFt?.pPct ?? '', 'data-testid': 'feed-type-sheet-p',
  });
  inputs.kPct = el('input', {
    type: 'number', className: 'auth-input settings-input', placeholder: 'K',
    value: existingFt?.kPct ?? '', 'data-testid': 'feed-type-sheet-k',
  });
  npkRow.appendChild(inputs.nPct);
  npkRow.appendChild(inputs.pPct);
  npkRow.appendChild(inputs.kPct);
  panel.appendChild(npkRow);

  // Cutting number
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.cuttingNumber')]));
  inputs.cuttingNumber = el('input', {
    type: 'number', className: 'auth-input settings-input', value: existingFt?.cuttingNumber ?? '',
    'data-testid': 'feed-type-sheet-cutting',
  });
  panel.appendChild(inputs.cuttingNumber);

  // Forage type
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.forageType')]));
  inputs.forageTypeId = el('select', {
    className: 'auth-select', 'data-testid': 'feed-type-sheet-forage-type',
  }, [
    el('option', { value: '' }, [t('feed.noForageType')]),
    ...forageTypes.map(ft => el('option', { value: ft.id }, [ft.name])),
  ]);
  if (existingFt?.forageTypeId) inputs.forageTypeId.value = existingFt.forageTypeId;
  panel.appendChild(inputs.forageTypeId);

  // Harvest active toggle
  const harvestState = { value: existingFt?.harvestActive ?? false };
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.harvestActive')]));
  const harvestRow = el('div', { className: 'btn-row', 'data-testid': 'feed-type-sheet-harvest' });
  const renderHarvestToggle = () => {
    clear(harvestRow);
    harvestRow.appendChild(el('button', {
      className: `btn btn-sm ${harvestState.value ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'feed-type-sheet-harvest-on',
      onClick: () => { harvestState.value = true; renderHarvestToggle(); },
    }, ['On']));
    harvestRow.appendChild(el('button', {
      className: `btn btn-sm ${!harvestState.value ? 'btn-green' : 'btn-outline'}`,
      'data-testid': 'feed-type-sheet-harvest-off',
      onClick: () => { harvestState.value = false; renderHarvestToggle(); },
    }, ['Off']));
  };
  renderHarvestToggle();
  panel.appendChild(harvestRow);
  panel.appendChild(el('div', { className: 'form-hint' }, [t('feed.harvestActiveHint')]));

  // Status
  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'feed-type-sheet-status' });
  panel.appendChild(statusEl);

  // Actions
  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'feed-type-sheet-save',
      onClick: () => saveFeedType(existingFt, inputs, harvestState, operationId, unitSys, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'feed-type-sheet-cancel',
      onClick: () => feedTypeSheet.close(),
    }, [t('action.cancel')]),
  ]));

  feedTypeSheet.open();
}

function saveFeedType(existingFt, inputs, harvestState, operationId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const parseNum = (input) => {
    const v = input.value;
    return v === '' ? null : parseFloat(v);
  };

  let defaultWeightKg = parseNum(inputs.defaultWeightKg);
  if (defaultWeightKg != null && unitSys === 'imperial') {
    defaultWeightKg = convert(defaultWeightKg, 'weight', 'toMetric');
  }

  const data = {
    operationId,
    name: inputs.name.value.trim(),
    category: inputs.category.value,
    unit: inputs.unit.value,
    dmPct: parseNum(inputs.dmPct),
    nPct: parseNum(inputs.nPct),
    pPct: parseNum(inputs.pPct),
    kPct: parseNum(inputs.kPct),
    defaultWeightKg,
    cuttingNumber: parseNum(inputs.cuttingNumber),
    forageTypeId: inputs.forageTypeId.value || null,
    harvestActive: harvestState.value,
  };

  try {
    if (existingFt) {
      update('feedTypes', existingFt.id, data, FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    } else {
      const record = FeedTypeEntity.create(data);
      add('feedTypes', record, FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    }
    feedTypeSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Batch list (CP-25)
// ---------------------------------------------------------------------------

function renderBatchList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="feed-batch-list"]');
  if (!listEl) return;
  clear(listEl);

  const batches = getAll('batches').filter(b => !b.archived);
  const feedTypes = getAll('feedTypes');
  const ftMap = {};
  for (const ft of feedTypes) ftMap[ft.id] = ft;

  if (!batches.length) {
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'feed-batch-empty',
    }, [t('feed.batchesEmpty')]));
    return;
  }

  for (const batch of batches) {
    const ft = ftMap[batch.feedTypeId];
    const ftName = ft ? ft.name : '';
    const pct = batch.quantity > 0 ? (batch.remaining / batch.quantity) * 100 : 0;
    const progressClass = pct > 50 ? 'progress-green' : pct > 20 ? 'progress-amber' : 'progress-red';

    listEl.appendChild(el('div', {
      className: 'card batch-card',
      'data-testid': `feed-batch-${batch.id}`,
    }, [
      el('div', { className: 'batch-card-head' }, [
        el('div', {}, [
          el('div', { className: 'batch-card-name' }, [batch.name]),
          el('div', { className: 'batch-card-detail' }, [
            [ftName, `${batch.remaining}/${batch.quantity} ${batch.unit}`].filter(Boolean).join(' · '),
          ]),
        ]),
        el('span', { className: 'form-hint' }, [
          `${Math.round(pct)}%`,
        ]),
      ]),
      // Progress bar
      el('div', { className: 'progress-bar' }, [
        el('div', {
          className: `progress-fill ${progressClass}`,
          style: { width: `${Math.max(pct, 0)}%` },
        }),
      ]),
      el('div', { className: 'batch-card-actions' }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-edit-${batch.id}`,
          onClick: () => openBatchSheet(batch, operationId),
        }, [t('action.edit')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-adjust-${batch.id}`,
          onClick: () => openBatchAdjustSheet(batch, operationId),
        }, [t('feed.adjustBatch')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-delete-${batch.id}`,
          onClick: () => {
            if (window.confirm(t('feed.confirmDeleteBatch'))) {
              remove('batches', batch.id, 'batches');
            }
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
}

// ---------------------------------------------------------------------------
// Batch sheet (create / edit)
// ---------------------------------------------------------------------------

let batchSheet = null;

function openBatchSheet(existingBatch, operationId) {
  if (!batchSheet) {
    batchSheet = new Sheet('batch-sheet-wrap');
  }

  const panel = document.getElementById('batch-sheet-panel');
  if (!panel) return;
  clear(panel);

  const isEdit = !!existingBatch;
  const unitSys = getUnitSystem();
  const feedTypes = getAll('feedTypes').filter(ft => !ft.archived);
  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [
    isEdit ? t('feed.editBatch') : t('feed.createBatch'),
  ]));

  // Feed type
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchFeedType')]));
  inputs.feedTypeId = el('select', {
    className: 'auth-select', 'data-testid': 'batch-sheet-feed-type',
  }, feedTypes.map(ft => el('option', { value: ft.id }, [ft.name])));
  if (existingBatch?.feedTypeId) inputs.feedTypeId.value = existingBatch.feedTypeId;
  panel.appendChild(inputs.feedTypeId);

  // Name
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchName')]));
  inputs.name = el('input', {
    type: 'text', className: 'auth-input', value: existingBatch?.name || '',
    'data-testid': 'batch-sheet-name',
  });
  panel.appendChild(inputs.name);

  // Batch number
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchNumber')]));
  inputs.batchNumber = el('input', {
    type: 'text', className: 'auth-input', value: existingBatch?.batchNumber || '',
    'data-testid': 'batch-sheet-number',
  });
  panel.appendChild(inputs.batchNumber);

  // Source
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchSource')]));
  inputs.source = el('select', {
    className: 'auth-select', 'data-testid': 'batch-sheet-source',
  }, [
    el('option', { value: 'purchase' }, [t('feed.batchSourcePurchase')]),
    el('option', { value: 'harvest' }, [t('feed.batchSourceHarvest')]),
    el('option', { value: 'transfer' }, [t('feed.batchSourceTransfer')]),
  ]);
  if (existingBatch?.source) inputs.source.value = existingBatch.source;
  panel.appendChild(inputs.source);

  // Quantity
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchQuantity')]));
  inputs.quantity = el('input', {
    type: 'number', className: 'auth-input settings-input', value: existingBatch?.quantity ?? '',
    'data-testid': 'batch-sheet-quantity',
  });
  panel.appendChild(inputs.quantity);

  // Unit
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchUnit')]));
  inputs.unit = el('input', {
    type: 'text', className: 'auth-input', value: existingBatch?.unit || '',
    placeholder: 'bale, ton, kg...',
    'data-testid': 'batch-sheet-unit',
  });
  panel.appendChild(inputs.unit);

  // Weight per unit
  const wLabel = `${t('feed.batchWeightPerUnit')} (${unitLabel('weight', unitSys)})`;
  const wVal = existingBatch?.weightPerUnitKg != null && unitSys === 'imperial'
    ? convert(existingBatch.weightPerUnitKg, 'weight', 'toImperial').toFixed(0)
    : (existingBatch?.weightPerUnitKg ?? '');
  panel.appendChild(el('label', { className: 'form-label' }, [wLabel]));
  inputs.weightPerUnitKg = el('input', {
    type: 'number', className: 'auth-input settings-input', value: wVal,
    'data-testid': 'batch-sheet-weight',
  });
  panel.appendChild(inputs.weightPerUnitKg);

  // DM %
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchDmPct')]));
  inputs.dmPct = el('input', {
    type: 'number', className: 'auth-input settings-input', value: existingBatch?.dmPct ?? '',
    'data-testid': 'batch-sheet-dm-pct',
  });
  panel.appendChild(inputs.dmPct);

  // Cost per unit
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchCostPerUnit')]));
  inputs.costPerUnit = el('input', {
    type: 'number', className: 'auth-input settings-input', value: existingBatch?.costPerUnit ?? '',
    'data-testid': 'batch-sheet-cost',
  });
  panel.appendChild(inputs.costPerUnit);

  // Purchase date
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchPurchaseDate')]));
  inputs.purchaseDate = el('input', {
    type: 'date', className: 'auth-input', value: existingBatch?.purchaseDate || '',
    'data-testid': 'batch-sheet-purchase-date',
  });
  panel.appendChild(inputs.purchaseDate);

  // Notes
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.batchNotes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input', value: existingBatch?.notes || '',
    'data-testid': 'batch-sheet-notes',
    style: { minHeight: '50px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'batch-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'batch-sheet-save',
      onClick: () => saveBatch(existingBatch, inputs, operationId, unitSys, statusEl),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'batch-sheet-cancel',
      onClick: () => batchSheet.close(),
    }, [t('action.cancel')]),
  ]));

  batchSheet.open();
}

function saveBatch(existingBatch, inputs, operationId, unitSys, statusEl) {
  clear(statusEl);
  statusEl.className = 'auth-error';

  const parseNum = (input) => {
    const v = input.value;
    return v === '' ? null : parseFloat(v);
  };

  let weightPerUnitKg = parseNum(inputs.weightPerUnitKg);
  if (weightPerUnitKg != null && unitSys === 'imperial') {
    weightPerUnitKg = convert(weightPerUnitKg, 'weight', 'toMetric');
  }

  const quantity = parseNum(inputs.quantity) ?? 0;

  const data = {
    operationId,
    feedTypeId: inputs.feedTypeId.value || null,
    name: inputs.name.value.trim(),
    batchNumber: inputs.batchNumber.value.trim() || null,
    source: inputs.source.value,
    quantity,
    remaining: existingBatch ? existingBatch.remaining : quantity,
    unit: inputs.unit.value.trim(),
    weightPerUnitKg,
    dmPct: parseNum(inputs.dmPct),
    costPerUnit: parseNum(inputs.costPerUnit),
    purchaseDate: inputs.purchaseDate.value || null,
    notes: inputs.notes.value.trim() || null,
  };

  try {
    if (existingBatch) {
      update('batches', existingBatch.id, data, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    } else {
      const record = BatchEntity.create(data);
      add('batches', record, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    }
    batchSheet.close();
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
  }
}

// ---------------------------------------------------------------------------
// Batch adjustment sheet (CP-25)
// ---------------------------------------------------------------------------

let batchAdjustSheet = null;

function openBatchAdjustSheet(batch, operationId) {
  if (!batchAdjustSheet) {
    batchAdjustSheet = new Sheet('batch-adjust-sheet-wrap');
  }

  const panel = document.getElementById('batch-adjust-sheet-panel');
  if (!panel) return;
  clear(panel);

  const inputs = {};

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.adjustBatchTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [
    `${batch.name} — ${batch.remaining}/${batch.quantity} ${batch.unit}`,
  ]));

  // New quantity
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustNewQty')]));
  inputs.newQty = el('input', {
    type: 'number', className: 'auth-input settings-input', value: batch.remaining,
    'data-testid': 'batch-adjust-new-qty',
  });
  panel.appendChild(inputs.newQty);

  // Reason
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustReason')]));
  inputs.reason = el('select', {
    className: 'auth-select', 'data-testid': 'batch-adjust-reason',
  }, [
    el('option', { value: 'reconcile' }, [t('feed.adjustReasonReconcile')]),
    el('option', { value: 'waste' }, [t('feed.adjustReasonWaste')]),
    el('option', { value: 'sold' }, [t('feed.adjustReasonSold')]),
    el('option', { value: 'other' }, [t('feed.adjustReasonOther')]),
  ]);
  panel.appendChild(inputs.reason);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'batch-adjust-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row', style: { marginTop: 'var(--space-5)' } }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'batch-adjust-save',
      onClick: () => {
        clear(statusEl);
        const newQty = parseFloat(inputs.newQty.value);
        if (isNaN(newQty) || newQty < 0) {
          statusEl.appendChild(el('span', {}, ['Quantity must be 0 or greater']));
          return;
        }
        const delta = newQty - batch.remaining;
        try {
          // Create adjustment record
          const adj = BatchAdjustmentEntity.create({
            batchId: batch.id,
            operationId,
            previousQty: batch.remaining,
            newQty,
            delta,
            reason: inputs.reason.value,
          });
          add('batchAdjustments', adj, BatchAdjustmentEntity.validate,
            BatchAdjustmentEntity.toSupabaseShape, 'batch_adjustments');

          // Update batch remaining
          update('batches', batch.id, { remaining: newQty },
            BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');

          batchAdjustSheet.close();
        } catch (err) {
          statusEl.appendChild(el('span', {}, [err.message]));
        }
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'batch-adjust-cancel',
      onClick: () => batchAdjustSheet.close(),
    }, [t('action.cancel')]),
  ]));

  batchAdjustSheet.open();
}
