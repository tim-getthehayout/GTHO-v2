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

/** Session toggle: include archived batches in the feed list. */
let showArchived = false;

/** Batch ids whose activity list is expanded past the first page. */
const expandedActivity = new Set();

const ACTIVITY_LIMIT = 8;

const ADJUST_REASONS = [
  ['reconcile', 'feed.adjustReasonReconcile'],
  ['waste', 'feed.adjustReasonWaste'],
  ['sold', 'feed.adjustReasonSold'],
  ['other', 'feed.adjustReasonOther'],
];

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function reasonLabel(reason) {
  const known = ADJUST_REASONS.find(([value]) => value === reason);
  return known ? t(known[1]) : (reason || '');
}

function activitySortKey(date, time) {
  return `${date || '0000-00-00'}T${time || '00:00'}`;
}

/**
 * Most-recent-first activity for one batch.
 * Feed-out rows are display-only. Adjustment rows carry the record for edit.
 * Feed-in is the batch's own original quantity — no extra joins.
 */
function batchActivityRows(batch) {
  const locations = getAll('locations');
  const locName = (id) => locations.find(l => l.id === id)?.name || '';
  const rows = [];

  for (const entry of getAll('eventFeedEntries')) {
    if (entry.batchId !== batch.id) continue;
    const loc = locName(entry.locationId);
    const parts = [
      entry.date || '',
      t('feed.activityOut'),
      `${entry.quantity} ${batch.unit || ''}`.trim(),
    ];
    if (loc) parts.push(loc);
    const createdTime = (entry.time || (entry.createdAt || '').slice(11, 16));
    rows.push({
      label: parts.filter(Boolean).join(' · '),
      sort: activitySortKey(entry.date, createdTime),
      adj: null,
    });
  }

  for (const adj of getAll('batchAdjustments')) {
    if (adj.batchId !== batch.id) continue;
    const date = adj.adjustmentDate || (adj.createdAt || '').slice(0, 10);
    const reason = reasonLabel(adj.reason);
    const parts = [
      date,
      t('feed.activityAdjustment'),
      `${adj.previousQty} → ${adj.newQty}`,
    ];
    if (reason) parts.push(reason);
    rows.push({
      label: parts.filter(Boolean).join(' · '),
      sort: activitySortKey(date, (adj.createdAt || '').slice(11, 16)),
      adj,
    });
  }

  if (batch.quantity != null) {
    const inDate = batch.purchaseDate || (batch.createdAt || '').slice(0, 10);
    rows.push({
      label: [
        inDate,
        t('feed.activityIn'),
        `${batch.quantity} ${batch.unit || ''}`.trim(),
      ].filter(Boolean).join(' · '),
      sort: activitySortKey(inDate, '00:00:00'),
      adj: null,
    });
  }

  rows.sort((a, b) => b.sort.localeCompare(a.sort));
  return rows;
}

function renderBatchActivity(batch, operationId, rootContainer) {
  const rows = batchActivityRows(batch);
  if (!rows.length) return null;

  const expanded = expandedActivity.has(batch.id);
  const visible = expanded ? rows : rows.slice(0, ACTIVITY_LIMIT);
  const hidden = rows.length - visible.length;
  const list = el('div', {
    'data-testid': `feed-batch-activity-${batch.id}`,
    style: { marginTop: 'var(--space-2)' },
  });

  for (const row of visible) {
    const lineChildren = [el('span', {}, [row.label])];
    if (row.adj) {
      lineChildren.push(el('button', {
        className: 'btn btn-outline btn-xs',
        'data-testid': `feed-batch-adj-edit-${row.adj.id}`,
        onClick: () => openBatchAdjustSheet(batch, operationId, row.adj),
      }, [t('action.edit')]));
    }
    list.appendChild(el('div', {
      className: 'batch-card-detail',
      style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
    }, lineChildren));
  }

  if (hidden > 0) {
    list.appendChild(el('button', {
      className: 'btn btn-outline btn-xs',
      'data-testid': `feed-batch-activity-more-${batch.id}`,
      style: { marginTop: '4px' },
      onClick: () => {
        expandedActivity.add(batch.id);
        renderBatchList(rootContainer, operationId);
      },
    }, [t('feed.activityEarlier', { count: hidden })]));
  }

  return list;
}

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

    // Feed day goal banner (CP-26)
    renderFeedDayGoalBanner(),

    // Batches section
    el('div', { 'data-testid': 'feed-batches-section' }, [
      el('div', { className: 'screen-action-bar', style: { flexWrap: 'wrap', gap: '8px' } }, [
        el('h2', { className: 'settings-section-title', style: { marginBottom: '0' } }, [t('feed.batches')]),
        el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, [
          el('button', {
            className: showArchived ? 'fp active' : 'fp',
            'data-testid': 'feed-show-archived',
            onClick: () => {
              showArchived = !showArchived;
              renderBatchList(container, operationId);
            },
          }, [showArchived ? t('feed.hideArchived') : t('feed.showArchived')]),
          el('button', {
            className: 'btn btn-green btn-sm',
            'data-testid': 'feed-add-batch-btn',
            onClick: () => openBatchSheet(null, operationId),
          }, [t('feed.addBatch')]),
        ]),
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
  unsubs.push(subscribe('batches', () => {
    renderBatchList(container, operationId);
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('batchAdjustments', () => {
    renderBatchList(container, operationId);
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('eventFeedEntries', () => {
    renderBatchList(container, operationId);
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('farmSettings', () => refreshFeedDayGoalBanner(container)));
}


// ---------------------------------------------------------------------------
// Feed day goal banner (CP-26)
// ---------------------------------------------------------------------------

function refreshFeedDayGoalBanner(container) {
  const old = container.querySelector('[data-testid="feed-day-goal-banner"]');
  if (!old) return;
  old.replaceWith(renderFeedDayGoalBanner());
}

function renderFeedDayGoalBanner() {
  const farmSettings = getAll('farmSettings')[0];
  const goal = farmSettings?.feedDayGoal ?? 90;
  const unitSys = getUnitSystem();

  // DM on hand: sum(batch.remaining × dm_pct/100) for non-archived batches
  const batches = getAll('batches').filter(b => !b.archived);
  const feedTypes = getAll('feedTypes');
  const ftMap = new Map(feedTypes.map(ft => [ft.id, ft]));
  let totalDmKg = 0;
  for (const b of batches) {
    const dm = b.dmPct ?? ftMap.get(b.feedTypeId)?.dmPct ?? 100;
    totalDmKg += (b.remaining ?? 0) * (dm / 100);
  }

  // Daily run rate: average daily DM delivered over last 30 days
  const entries = getAll('eventFeedEntries');
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  const recentEntries = entries.filter(e => e.date >= cutoffStr);
  let recentDmKg = 0;
  for (const e of recentEntries) {
    const batch = batches.find(b => b.id === e.batchId) || getAll('batches').find(b => b.id === e.batchId);
    const dm = batch?.dmPct ?? ftMap.get(batch?.feedTypeId)?.dmPct ?? 100;
    recentDmKg += (e.quantity ?? 0) * (dm / 100);
  }
  const daySpan = Math.max(1, Math.round((today - cutoff) / (1000 * 60 * 60 * 24)));
  const dailyRunRateKg = recentEntries.length > 0 ? recentDmKg / daySpan : 0;

  // Days on hand
  const daysOnHand = dailyRunRateKg > 0 ? Math.round(totalDmKg / dailyRunRateKg) : null;

  // Progress bar: green ≥ goal, amber 33–99%, red < 33%
  let pct = 0;
  let progressClass = 'progress-green';
  if (daysOnHand != null && goal > 0) {
    pct = Math.min((daysOnHand / goal) * 100, 100);
    if (pct < 33) progressClass = 'progress-red';
    else if (pct < 100) progressClass = 'progress-amber';
  }

  // Format DM on hand and run rate in user's unit system
  const dmOnHandDisplay = display(totalDmKg, 'weight', unitSys, 0);
  const runRateDisplay = dailyRunRateKg > 0
    ? `${display(dailyRunRateKg, 'weight', unitSys, 0)}/day`
    : '—';

  return el('div', {
    className: 'card',
    style: { marginBottom: 'var(--space-5)' },
    'data-testid': 'feed-day-goal-banner',
  }, [
    el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } }, [
      el('div', {}, [
        el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--text2)' } }, [
          t('feed.feedDayGoalLabel'),
        ]),
        el('div', { style: { fontSize: '20px', fontWeight: '600', marginTop: '2px' } }, [
          daysOnHand != null
            ? `${daysOnHand} / ${goal} days`
            : t('feed.daysOnHandValue', { goal }),
        ]),
      ]),
      el('div', { className: 'form-hint' }, [t('feed.feedDayGoalHint')]),
    ]),
    // Three stat cells: DM on Hand, Daily Run Rate, Days on Hand
    el('div', { style: { display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' } }, [
      el('div', { 'data-testid': 'feed-dm-on-hand' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.dmOnHand')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [dmOnHandDisplay]),
      ]),
      el('div', { 'data-testid': 'feed-run-rate' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.runRate')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [runRateDisplay]),
      ]),
      el('div', { 'data-testid': 'feed-days-on-hand' }, [
        el('div', { style: { fontSize: '11px', color: 'var(--text2)' } }, [t('feed.daysOnHand')]),
        el('div', { style: { fontSize: '14px', fontWeight: '600' } }, [daysOnHand != null ? `${daysOnHand}` : '—']),
      ]),
    ]),
    el('div', { className: 'progress-bar', style: { marginTop: 'var(--space-3)' } }, [
      el('div', {
        className: `progress-fill ${progressClass}`,
        style: { width: `${pct}%` },
      }),
    ]),
  ]);
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
    const detailParts = [ft.category, ft.unit].filter(Boolean);
    if (ft.dmPct != null && !isNaN(ft.dmPct)) detailParts.push(`${ft.dmPct}% DM`);
    if (ft.defaultWeightKg != null && !isNaN(ft.defaultWeightKg)) {
      detailParts.push(display(ft.defaultWeightKg, 'weight', unitSys, 0) + '/unit');
    }
    if (ft.cuttingNumber != null && !isNaN(ft.cuttingNumber)) detailParts.push(`${ft.cuttingNumber} cut`);
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

function syncArchivedPill(rootContainer) {
  const pill = rootContainer.querySelector('[data-testid="feed-show-archived"]');
  if (!pill) return;
  pill.className = showArchived ? 'fp active' : 'fp';
  pill.replaceChildren(document.createTextNode(
    showArchived ? t('feed.hideArchived') : t('feed.showArchived'),
  ));
}

function renderBatchList(rootContainer, operationId) {
  const listEl = rootContainer.querySelector('[data-testid="feed-batch-list"]');
  if (!listEl) return;
  clear(listEl);
  syncArchivedPill(rootContainer);

  const allBatches = getAll('batches');
  const archivedCount = allBatches.filter(b => b.archived).length;
  const batches = showArchived ? allBatches : allBatches.filter(b => !b.archived);
  const feedTypes = getAll('feedTypes');
  const ftMap = {};
  for (const ft of feedTypes) ftMap[ft.id] = ft;

  if (!batches.length) {
    const emptyKey = !showArchived && archivedCount > 0
      ? 'feed.batchesEmptyWithArchived'
      : 'feed.batchesEmpty';
    const emptyText = emptyKey === 'feed.batchesEmptyWithArchived'
      ? t(emptyKey, { count: archivedCount })
      : t(emptyKey);
    listEl.appendChild(el('p', {
      className: 'form-hint',
      'data-testid': 'feed-batch-empty',
    }, [emptyText]));
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
      renderBatchActivity(batch, operationId, rootContainer),
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
        batch.archived
          ? el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `feed-batch-restore-${batch.id}`,
            onClick: () => {
              update('batches', batch.id, { archived: false },
                BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            },
          }, [t('action.restore')])
          : el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `feed-batch-archive-${batch.id}`,
            onClick: () => {
              if (window.confirm(t('feed.confirmArchiveBatch'))) {
                update('batches', batch.id, { archived: true },
                  BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
              }
            },
          }, [t('action.archive')]),
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

function reasonSelectOptions(current) {
  const options = ADJUST_REASONS.map(([value, key]) => el('option', { value }, [t(key)]));
  if (current && !ADJUST_REASONS.some(([value]) => value === current)) {
    options.push(el('option', { value: current }, [current]));
  }
  return options;
}

function openBatchAdjustSheet(batch, operationId, existingAdj = null) {
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
    value: existingDate || todayDateString(),
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
        const adjustmentDate = inputs.adjustmentDate.value || todayDateString();
        try {
          if (existingAdj) {
            const delta = newQty - Number(existingAdj.previousQty);
            update('batchAdjustments', existingAdj.id, {
              newQty,
              delta,
              reason: inputs.reason.value,
              adjustmentDate,
            }, BatchAdjustmentEntity.validate, BatchAdjustmentEntity.toSupabaseShape, 'batch_adjustments');

            const qtyDiff = newQty - Number(existingAdj.newQty);
            if (qtyDiff !== 0) {
              update('batches', batch.id, { remaining: Number(batch.remaining) + qtyDiff },
                BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            }
          } else {
            const delta = newQty - batch.remaining;
            const adj = BatchAdjustmentEntity.create({
              batchId: batch.id,
              operationId,
              previousQty: batch.remaining,
              newQty,
              delta,
              reason: inputs.reason.value,
              adjustmentDate,
            });
            add('batchAdjustments', adj, BatchAdjustmentEntity.validate,
              BatchAdjustmentEntity.toSupabaseShape, 'batch_adjustments');

            update('batches', batch.id, { remaining: newQty },
              BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
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
