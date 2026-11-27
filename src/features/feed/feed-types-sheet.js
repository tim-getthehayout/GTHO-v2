/**
 * @file Feed screen — Feed Types list, row builder and the create / edit sheet.
 * #486: moved verbatim out of feed/index.js (behavior-preserving split).
 */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, add, update, remove } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display, convert, unitLabel } from '../../utils/units.js';
import * as FeedTypeEntity from '../../entities/feed-type.js';
import { normalizeFeedUnit } from '../../utils/feed-units.js';
import { feedUnitSelect } from './feed-unit-picker.js';

// ---------------------------------------------------------------------------
// Feed type list
// ---------------------------------------------------------------------------

export function renderFeedTypeList(rootContainer) {
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
  for (const ft of feedTypes) list.appendChild(buildFeedTypeRow(ft, operationId, unitSys));
  listEl.appendChild(list);
}

/**
 * One Feeds-screen feed-type row (category · unit · DM % · weight in user units ·
 * cut · harvest) with Edit (Feeds dialog) and Delete (confirm).
 * OI-0265 Ft1: also used by the Locations & Rotation Feed types dialog.
 */
export function buildFeedTypeRow(ft, operationId, unitSys = getUnitSystem()) {
  const detailParts = [ft.category, ft.unit].filter(Boolean);
  if (ft.dmPct != null && !isNaN(ft.dmPct)) detailParts.push(`${ft.dmPct}% DM`);
  if (ft.defaultWeightKg != null && !isNaN(ft.defaultWeightKg)) {
    detailParts.push(display(ft.defaultWeightKg, 'weight', unitSys, 0) + '/unit');
  }
  if (ft.cuttingNumber != null && !isNaN(ft.cuttingNumber)) detailParts.push(`${ft.cuttingNumber} cut`);
  if (ft.harvestActive) detailParts.push('harvest');

  return el('div', {
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
  ]);
}

// ---------------------------------------------------------------------------
// Feed type sheet
// ---------------------------------------------------------------------------

/** Owner of the Feeds-screen feed-type Sheet instance (#486: single owner). */
let feedTypeSheet = null;

/** Close the feed-type sheet if it was ever opened (Feed screen backdrop). */
export function closeFeedTypeSheet() {
  if (feedTypeSheet) feedTypeSheet.close();
}

/** OI-0265 Ft1: id of the on-demand (outside the Feed screen) dialog wrapper. */
export const FEED_TYPE_SHEET_ONDEMAND_ATTR = 'data-on-demand';

/**
 * OI-0265 Ft1: the Feeds-screen dialog DOM lives in the Feed screen; elsewhere
 * (Feed types dialog, harvest) create it on demand at body level, stacked above
 * the Feed types dialog (z 220).
 */
function ensureFeedTypeSheetDOM() {
  if (document.getElementById('feed-type-sheet-panel')) return;
  document.body.appendChild(el('div', {
    className: 'sheet-wrap', id: 'feed-type-sheet-wrap', style: { zIndex: '230' },
    [FEED_TYPE_SHEET_ONDEMAND_ATTR]: 'true',
  }, [
    el('div', { className: 'sheet-backdrop', onClick: () => feedTypeSheet && feedTypeSheet.close() }),
    el('div', { className: 'sheet-panel', id: 'feed-type-sheet-panel', style: { maxHeight: 'min(90dvh, 90vh)', overflowY: 'auto' } }),
  ]));
}

/**
 * The canonical feed-type create/edit dialog (Feeds screen).
 * OI-0265 Ft1: exported so the Feed types dialog's Edit / "+ Add feed type" use it.
 * @param {object|null} existingFt
 * @param {string} operationId
 */
export function openFeedTypeSheet(existingFt, operationId) {
  if (!feedTypeSheet) {
    feedTypeSheet = new Sheet('feed-type-sheet-wrap');
  }

  ensureFeedTypeSheetDOM();
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
  inputs.unit = feedUnitSelect({
    className: 'auth-select', 'data-testid': 'feed-type-sheet-unit',
  }, existingFt?.unit);
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

  const unit = normalizeFeedUnit(inputs.unit.value);
  if (!unit) {
    statusEl.appendChild(el('span', {}, [t('feed.unitInvalid')]));
    return;
  }

  const data = {
    operationId,
    name: inputs.name.value.trim(),
    category: inputs.category.value,
    unit,
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
