/**
 * @file Feed screen — batch location choice and the Batch create / edit, Move
 * and Adjust sheets (CP-25). #486: moved verbatim out of feed/index.js
 * (behavior-preserving split).
 */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, add, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { convert, unitLabel } from '../../utils/units.js';
import * as BatchEntity from '../../entities/batch.js';
import * as BatchAdjustmentEntity from '../../entities/batch-adjustment.js';
import * as LocationEntity from '../../entities/location.js';
import { openLocationMapPicker } from '../map/picker.js';
import {
  balancesFor,
  positiveBalances,
  locationName,
  placeInitialBalance,
  moveBatchQuantity,
  applyRemainingDelta,
} from './batch-balances.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { normalizeFeedUnit, FEED_UNIT_LABEL_KEYS } from '../../utils/feed-units.js';
import { feedUnitSelect } from './feed-unit-picker.js';

export const ADJUST_REASONS = [
  ['reconcile', 'feed.adjustReasonReconcile'],
  ['waste', 'feed.adjustReasonWaste'],
  ['sold', 'feed.adjustReasonSold'],
  ['other', 'feed.adjustReasonOther'],
];

// ---------------------------------------------------------------------------
// Location choice, details, and moves
// ---------------------------------------------------------------------------

function revealBatchPrimaryAction(fromEl) {
  const panel = fromEl.closest?.('.sheet-panel');
  if (!panel) return;
  const primary = panel.querySelector(
    '[data-testid="batch-sheet-save"], [data-testid="batch-move-save"], [data-testid="batch-detail-set-location-save"]',
  );
  if (primary && typeof primary.scrollIntoView === 'function') {
    primary.scrollIntoView({ block: 'nearest' });
  }
}

export function mountLocationChoice(container, operationId, selection) {
  clear(container);
  const mode = container.dataset.batchLocationMode === 'pasture' ? 'pasture' : 'storage';
  container.dataset.batchLocationMode = mode;

  const modeButton = (value, label, testId) => el('button', {
    type: 'button',
    className: mode === value ? 'fp active' : 'fp',
    'data-testid': testId,
    'data-active': mode === value ? 'true' : 'false',
    onClick: () => {
      container.dataset.batchLocationMode = value;
      mountLocationChoice(container, operationId, selection);
    },
  }, [label]);

  container.appendChild(el('div', {
    'data-testid': 'batch-location-mode',
    style: { display: 'flex', gap: '8px', marginBottom: '8px' },
  }, [
    modeButton('storage', t('feed.locationModeStorage'), 'batch-location-mode-storage'),
    modeButton('pasture', t('feed.locationModePasture'), 'batch-location-mode-pasture'),
  ]));

  if (mode === 'storage') {
    const nameInput = el('input', {
      type: 'text',
      className: 'auth-input',
      'data-testid': 'batch-storage-name',
      placeholder: t('feed.storageName'),
      style: { marginBottom: '8px' },
    });
    const addStatus = el('div', { className: 'auth-error', 'data-testid': 'batch-storage-status' });
    container.appendChild(el('div', { 'data-testid': 'batch-add-storage' }, [
      nameInput,
      el('button', {
        type: 'button',
        className: 'btn btn-outline btn-sm',
        'data-testid': 'batch-storage-save',
        style: { marginBottom: '8px' },
        onClick: () => {
          clear(addStatus);
          const name = nameInput.value.trim();
          if (!name) {
            addStatus.appendChild(el('span', {}, [t('feed.storageNameRequired')]));
            return;
          }
          const farmId = getAll('farms')[0]?.id || null;
          const record = LocationEntity.create({
            operationId,
            farmId,
            name,
            type: 'storage',
          });
          add('locations', record, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
          selection.locationId = record.id;
          container.dataset.batchLocationMode = 'storage';
          mountLocationChoice(container, operationId, selection);
          revealBatchPrimaryAction(container);
        },
      }, [t('feed.addStorageLocation')]),
      addStatus,
    ]));
  } else {
    container.appendChild(el('button', {
      type: 'button',
      className: 'btn btn-outline btn-sm',
      'data-testid': 'batch-location-map',
      style: { marginBottom: '8px' },
      onClick: () => {
        openLocationMapPicker({
          selectedId: selection.locationId,
          title: t('event.locationPicker.pickOnMap'),
          filter: (loc) => !loc.archived && loc.type === 'land' && loc.landUse === 'pasture',
          onSelect: (id) => {
            const loc = getById('locations', id);
            if (!loc || loc.archived || loc.type !== 'land' || loc.landUse !== 'pasture') return;
            selection.locationId = id;
            container.dataset.batchLocationMode = 'pasture';
            mountLocationChoice(container, operationId, selection);
            revealBatchPrimaryAction(container);
          },
        });
      },
    }, [t('event.locationPicker.pickOnMap')]));
  }

  const locations = getAll('locations').filter(loc => {
    if (loc.archived) return false;
    if (mode === 'storage') return loc.type === 'storage';
    return loc.type === 'land' && loc.landUse === 'pasture';
  }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const list = el('div', {
    'data-testid': 'batch-location-picker',
    style: { maxHeight: '240px', overflow: 'auto' },
  });
  function chooseLocation(id) {
    selection.locationId = id;
    mountLocationChoice(container, operationId, selection);
    revealBatchPrimaryAction(container);
  }
  for (const loc of locations) {
    const selected = selection.locationId === loc.id;
    list.appendChild(el('div', {
      className: selected ? 'loc-picker-item selected' : 'loc-picker-item',
      role: 'button',
      tabIndex: 0,
      'data-testid': `batch-location-item-${loc.id}`,
      'data-selected': selected ? 'true' : 'false',
      onClick: () => chooseLocation(loc.id),
      onKeydown: (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        chooseLocation(loc.id);
      },
    }, [loc.name]));
  }
  container.appendChild(list);
}

export function openBatchMoveSheet(batch, operationId) {
  if (!batchMoveSheet) batchMoveSheet = new Sheet('batch-move-sheet-wrap');
  const panel = document.getElementById('batch-move-sheet-panel');
  if (!panel) return;
  clear(panel);

  const holdings = positiveBalances(batch.id);
  const inputs = {};
  const toSelection = { locationId: null };

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.moveBatch')]));

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.moveFrom')]));
  inputs.fromLocationId = el('select', {
    className: 'auth-select',
    'data-testid': 'batch-move-from',
  }, holdings.map(row => el('option', { value: row.locationId }, [
    `${locationName(row.locationId) || '?'} (${row.quantity})`,
  ])));
  if (holdings.length === 1) inputs.fromLocationId.value = holdings[0].locationId;
  panel.appendChild(inputs.fromLocationId);

  const currentFrom = () => holdings.find(row => row.locationId === inputs.fromLocationId.value) || holdings[0];

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.moveQuantity')]));
  inputs.quantity = el('input', {
    type: 'number',
    className: 'auth-input settings-input',
    'data-testid': 'batch-move-quantity',
    value: currentFrom()?.quantity ?? '',
  });
  panel.appendChild(inputs.quantity);
  inputs.fromLocationId.addEventListener('change', () => {
    inputs.quantity.value = currentFrom()?.quantity ?? '';
  });

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.moveTo')]));
  const toMount = el('div', { 'data-testid': 'batch-move-to' });
  panel.appendChild(toMount);
  mountLocationChoice(toMount, operationId, toSelection);

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.moveDate')]));
  inputs.movedAt = el('input', {
    type: 'date',
    className: 'auth-input',
    'data-testid': 'batch-move-date',
    value: getLocalTodayStr(),
  });
  panel.appendChild(inputs.movedAt);

  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.moveNotes')]));
  inputs.notes = el('textarea', {
    className: 'auth-input',
    'data-testid': 'batch-move-notes',
    style: { minHeight: '50px', resize: 'vertical' },
  });
  panel.appendChild(inputs.notes);

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'batch-move-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row sheet-actions-sticky' }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'batch-move-save',
      onClick: () => {
        clear(statusEl);
        const error = moveBatchQuantity({
          operationId,
          batchId: batch.id,
          fromLocationId: inputs.fromLocationId.value,
          toLocationId: toSelection.locationId,
          quantity: parseFloat(inputs.quantity.value),
          movedAt: inputs.movedAt.value || getLocalTodayStr(),
          notes: inputs.notes.value.trim() || null,
        });
        if (error === 'same') {
          statusEl.appendChild(el('span', {}, [t('feed.moveSameLocation')]));
          return;
        }
        if (error) {
          statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
          return;
        }
        batchMoveSheet.close();
      },
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      onClick: () => batchMoveSheet.close(),
    }, [t('action.cancel')]),
  ]));

  batchMoveSheet.open();
}

// ---------------------------------------------------------------------------
// Batch sheet (create / edit)
// ---------------------------------------------------------------------------

/** #486: this module is the single owner of the batch, move and adjust Sheet instances. */
let batchSheet = null;
let batchMoveSheet = null;

/** Close the create / edit batch sheet if it was ever opened (Feed screen backdrop). */
export function closeBatchSheet() {
  if (batchSheet) batchSheet.close();
}

/** Close the batch move sheet if it was ever opened (Feed screen backdrop). */
export function closeBatchMoveSheet() {
  if (batchMoveSheet) batchMoveSheet.close();
}

export function openBatchSheet(existingBatch, operationId) {
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
    el('option', { value: 'opening' }, [t('feed.batchSourceOpening')]),
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
  const typeUnit = () => normalizeFeedUnit(getById('feedTypes', inputs.feedTypeId.value)?.unit);
  inputs.unit = feedUnitSelect({
    className: 'auth-select', 'data-testid': 'batch-sheet-unit',
  }, existingBatch ? existingBatch.unit : typeUnit(), { requireChoice: true });
  let acceptedUnit = inputs.unit.value;
  // Moving away from the feed type's unit needs confirmation; declining restores it.
  inputs.unit.addEventListener('change', () => {
    const expected = typeUnit();
    if (expected && inputs.unit.value && inputs.unit.value !== expected
      && !window.confirm(t('feed.unitMismatchConfirm', { unit: t(FEED_UNIT_LABEL_KEYS[expected]) }))) {
      inputs.unit.value = acceptedUnit;
      return;
    }
    acceptedUnit = inputs.unit.value;
  });
  // A new batch follows its feed type's unit; an existing batch's unit is never changed silently.
  if (!existingBatch) {
    inputs.feedTypeId.addEventListener('change', () => {
      const expected = typeUnit();
      if (expected) { inputs.unit.value = expected; acceptedUnit = expected; }
    });
  }
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

  const locationSelection = { locationId: null };
  const needsLocation = !existingBatch || balancesFor(existingBatch.id).length === 0;
  if (needsLocation) {
    panel.appendChild(el('label', { className: 'form-label' }, [t('feed.location')]));
    const locationMount = el('div', { 'data-testid': 'batch-sheet-location' });
    panel.appendChild(locationMount);
    mountLocationChoice(locationMount, operationId, locationSelection);
  }

  const statusEl = el('div', { className: 'auth-error', 'data-testid': 'batch-sheet-status' });
  panel.appendChild(statusEl);

  panel.appendChild(el('div', { className: 'btn-row sheet-actions-sticky' }, [
    el('button', {
      className: 'btn btn-green',
      'data-testid': 'batch-sheet-save',
      onClick: () => saveBatch(existingBatch, inputs, operationId, unitSys, statusEl, locationSelection),
    }, [t('action.save')]),
    el('button', {
      className: 'btn btn-outline',
      'data-testid': 'batch-sheet-cancel',
      onClick: () => batchSheet.close(),
    }, [t('action.cancel')]),
  ]));

  batchSheet.open();
}

function saveBatch(existingBatch, inputs, operationId, unitSys, statusEl, locationSelection) {
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
  const unit = normalizeFeedUnit(inputs.unit.value);
  if (!unit) {
    statusEl.appendChild(el('span', {}, [t('feed.unitInvalid')]));
    return;
  }
  if (!existingBatch && !locationSelection?.locationId) {
    statusEl.appendChild(el('span', {}, [t('feed.locationRequired')]));
    return;
  }

  const data = {
    operationId,
    feedTypeId: inputs.feedTypeId.value || null,
    name: inputs.name.value.trim(),
    batchNumber: inputs.batchNumber.value.trim() || null,
    source: inputs.source.value,
    quantity,
    remaining: existingBatch ? existingBatch.remaining : quantity,
    unit,
    weightPerUnitKg,
    dmPct: parseNum(inputs.dmPct),
    costPerUnit: parseNum(inputs.costPerUnit),
    purchaseDate: inputs.purchaseDate.value || null,
    notes: inputs.notes.value.trim() || null,
  };

  try {
    if (existingBatch) {
      update('batches', existingBatch.id, data, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
      if (balancesFor(existingBatch.id).length === 0 && locationSelection?.locationId) {
        placeInitialBalance({
          operationId,
          batchId: existingBatch.id,
          locationId: locationSelection.locationId,
          quantity: Number(existingBatch.remaining),
          movedAt: data.purchaseDate || getLocalTodayStr(),
        });
      }
    } else {
      const record = BatchEntity.create(data);
      add('batches', record, BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
      placeInitialBalance({
        operationId,
        batchId: record.id,
        locationId: locationSelection.locationId,
        quantity,
        movedAt: data.purchaseDate || getLocalTodayStr(),
      });
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

/** Close the batch adjustment sheet if it was ever opened (Feed screen backdrop). */
export function closeBatchAdjustSheet() {
  if (batchAdjustSheet) batchAdjustSheet.close();
}

function reasonSelectOptions(current) {
  const options = ADJUST_REASONS.map(([value, key]) => el('option', { value }, [t(key)]));
  if (current && !ADJUST_REASONS.some(([value]) => value === current)) {
    options.push(el('option', { value: current }, [current]));
  }
  return options;
}

export function openBatchAdjustSheet(batch, operationId, existingAdj = null) {
  if (!batchAdjustSheet) {
    batchAdjustSheet = new Sheet('batch-adjust-sheet-wrap');
  }

  const panel = document.getElementById('batch-adjust-sheet-panel');
  if (!panel) return;
  clear(panel);

  const inputs = {};
  const existingDate = existingAdj
    ? (existingAdj.adjustmentDate || (existingAdj.createdAt || '').slice(0, 10))
    : '';

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [t('feed.adjustBatchTitle')]));
  panel.appendChild(el('p', { className: 'form-hint', style: { marginBottom: 'var(--space-4)' } }, [
    `${batch.name} — ${batch.remaining}/${batch.quantity} ${batch.unit}`,
  ]));

  const balanceRows = balancesFor(batch.id);
  if (balanceRows.length > 1) {
    panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustLocation')]));
    inputs.locationId = el('select', {
      className: 'auth-select',
      'data-testid': 'batch-adjust-location',
    }, balanceRows.map(row => el('option', { value: row.locationId }, [
      `${locationName(row.locationId) || '?'} (${row.quantity})`,
    ])));
    panel.appendChild(inputs.locationId);
  }

  // New quantity
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustNewQty')]));
  inputs.newQty = el('input', {
    type: 'number', className: 'auth-input settings-input',
    value: existingAdj ? existingAdj.newQty : batch.remaining,
    'data-testid': 'batch-adjust-new-qty',
  });
  panel.appendChild(inputs.newQty);

  // Effective date — above the reason dropdown
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustDate')]));
  inputs.adjustmentDate = el('input', {
    type: 'date', className: 'auth-input',
    value: existingDate || getLocalTodayStr(),
    'data-testid': 'batch-adjust-date',
  });
  panel.appendChild(inputs.adjustmentDate);

  // Reason
  panel.appendChild(el('label', { className: 'form-label' }, [t('feed.adjustReason')]));
  inputs.reason = el('select', {
    className: 'auth-select', 'data-testid': 'batch-adjust-reason',
  }, reasonSelectOptions(existingAdj?.reason));
  if (existingAdj?.reason) inputs.reason.value = existingAdj.reason;
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
          statusEl.appendChild(el('span', {}, [t('validation.quantityNonNegative')]));
          return;
        }
        const adjustmentDate = inputs.adjustmentDate.value || getLocalTodayStr();
        try {
          if (existingAdj) {
            const qtyDiff = newQty - Number(existingAdj.newQty);
            if (qtyDiff !== 0) {
              const balanceError = applyRemainingDelta(batch.id, inputs.locationId?.value || null, qtyDiff);
              if (balanceError) {
                statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
                return;
              }
            }
            update('batchAdjustments', existingAdj.id, {
              newQty,
              delta: newQty - Number(existingAdj.previousQty),
              reason: inputs.reason.value,
              adjustmentDate,
            }, BatchAdjustmentEntity.validate, BatchAdjustmentEntity.toSupabaseShape, 'batch_adjustments');
          } else {
            const delta = newQty - batch.remaining;
            const balanceError = applyRemainingDelta(batch.id, inputs.locationId?.value || null, delta);
            if (balanceError) {
              statusEl.appendChild(el('span', {}, [t('feed.moveTooMuch')]));
              return;
            }
            const fresh = getById('batches', batch.id);
            const adj = BatchAdjustmentEntity.create({
              batchId: batch.id,
              operationId,
              previousQty: batch.remaining,
              newQty: fresh?.remaining ?? newQty,
              delta: (fresh?.remaining ?? newQty) - Number(batch.remaining),
              reason: inputs.reason.value,
              adjustmentDate,
            });
            add('batchAdjustments', adj, BatchAdjustmentEntity.validate,
              BatchAdjustmentEntity.toSupabaseShape, 'batch_adjustments');
          }

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
