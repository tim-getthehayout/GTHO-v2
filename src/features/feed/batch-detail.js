/**
 * @file Feed screen — Batch Details sheet and the batch activity list.
 * #486: moved verbatim out of feed/index.js (behavior-preserving split).
 */
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { Sheet } from '../../ui/sheet.js';
import { getAll, getById, update } from '../../data/store.js';
import { getUnitSystem } from '../../utils/preferences.js';
import { display } from '../../utils/units.js';
import * as BatchEntity from '../../entities/batch.js';
import {
  balancesFor,
  positiveBalances,
  movesFor,
  locationName,
  placeInitialBalance,
  deleteBatchWithLocations,
} from './batch-balances.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import {
  ADJUST_REASONS,
  mountLocationChoice,
  openBatchMoveSheet,
  openBatchSheet,
  openBatchAdjustSheet,
} from './batch-sheets.js';

/** Batch ids whose activity list is expanded past the first page. */
const expandedActivity = new Set();

const ACTIVITY_LIMIT = 8;

/** #486: this module is the single owner of the detail Sheet and the open batch id. */
let batchDetailSheet = null;
let detailBatchId = null;

/**
 * #486: the batch list lives in feed/index.js, which imports this module. To
 * avoid a circular import, index registers its list renderer here once at load.
 * @type {((rootContainer: HTMLElement, operationId: string) => void) | null}
 */
let batchListRenderer = null;

/** Register the Feed screen's batch list renderer (called once by feed/index.js). */
export function setBatchListRenderer(fn) {
  batchListRenderer = fn;
}

/** Id of the batch whose detail sheet is open, or null. */
export function getDetailBatchId() {
  return detailBatchId;
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
export function batchActivityRows(batch) {
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
    const source = locName(entry.sourceLocationId);
    if (source) parts.push(t('feed.activityFrom', { name: source }));
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

export function renderBatchActivity(batch, operationId, rootContainer, showAll = false) {
  const rows = batchActivityRows(batch);
  if (!rows.length) return null;

  const expanded = showAll || expandedActivity.has(batch.id);
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
        if (batchListRenderer) batchListRenderer(rootContainer, operationId);
      },
    }, [t('feed.activityEarlier', { count: hidden })]));
  }

  return list;
}

export function closeBatchDetails() {
  detailBatchId = null;
  if (batchDetailSheet) batchDetailSheet.close();
}

export function refreshOpenDetail(operationId) {
  if (!detailBatchId) return;
  const wrap = document.getElementById('batch-detail-sheet-wrap');
  if (!wrap || !wrap.classList.contains('open')) return;
  openBatchDetails(detailBatchId, operationId);
}

function detailField(label, value) {
  return el('div', { className: 'batch-card-detail' }, [
    `${label}: ${value == null || value === '' ? '—' : value}`,
  ]);
}

export function openBatchDetails(batchId, operationId) {
  const batch = getById('batches', batchId);
  if (!batch) return;
  if (!batchDetailSheet) batchDetailSheet = new Sheet('batch-detail-sheet-wrap');
  const panel = document.getElementById('batch-detail-sheet-panel');
  if (!panel) return;
  clear(panel);
  detailBatchId = batchId;

  const ft = getById('feedTypes', batch.feedTypeId);
  const unitSys = getUnitSystem();
  const weight = batch.weightPerUnitKg == null
    ? '—'
    : display(batch.weightPerUnitKg, 'weight', unitSys, 0);

  panel.appendChild(el('h2', { className: 'wizard-step-title' }, [batch.name]));
  panel.appendChild(detailField(t('feed.batchFeedType'), ft?.name || '—'));
  panel.appendChild(detailField(t('feed.batchNumber'), batch.batchNumber));
  panel.appendChild(detailField(t('feed.batchSource'), batch.source));
  panel.appendChild(detailField(t('feed.batchQuantity'), `${batch.quantity} ${batch.unit || ''}`.trim()));
  panel.appendChild(detailField(t('feed.batchRemaining'), `${batch.remaining} ${batch.unit || ''}`.trim()));
  panel.appendChild(detailField(t('feed.batchWeightPerUnit'), weight));
  panel.appendChild(detailField(t('feed.batchDmPct'), batch.dmPct));
  panel.appendChild(detailField(t('feed.batchCostPerUnit'), batch.costPerUnit));
  panel.appendChild(detailField(t('feed.batchPurchaseDate'), batch.purchaseDate));
  panel.appendChild(detailField(t('feed.batchNotes'), batch.notes));

  panel.appendChild(el('h3', {
    className: 'settings-section-title',
    style: { marginTop: 'var(--space-4)' },
  }, [t('feed.balances')]));
  const balanceRows = balancesFor(batch.id);
  const balanceList = el('div', { 'data-testid': `feed-batch-balances-${batch.id}` });
  const locationSelection = { locationId: null };
  if (!balanceRows.length) {
    balanceList.appendChild(el('p', { className: 'form-hint' }, [t('feed.noLocation')]));
    const mount = el('div', { 'data-testid': 'batch-detail-set-location' });
    balanceList.appendChild(mount);
    mountLocationChoice(mount, operationId, locationSelection);
  } else {
    for (const row of balanceRows) {
      balanceList.appendChild(el('div', { className: 'batch-card-detail' }, [
        `${locationName(row.locationId) || '?'} — ${row.quantity} ${batch.unit || ''}`.trim(),
      ]));
    }
  }
  panel.appendChild(balanceList);

  if (positiveBalances(batch.id).length) {
    panel.appendChild(el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': `feed-batch-move-${batch.id}`,
      style: { marginTop: '8px' },
      onClick: () => openBatchMoveSheet(batch, operationId),
    }, [t('feed.move')]));
  }

  panel.appendChild(el('h3', {
    className: 'settings-section-title',
    style: { marginTop: 'var(--space-4)' },
  }, [t('feed.locationHistory')]));
  const history = el('div', { 'data-testid': `feed-batch-moves-${batch.id}` });
  const moveRows = movesFor(batch.id);
  if (!moveRows.length) {
    history.appendChild(el('p', { className: 'form-hint' }, ['—']));
  } else {
    for (const move of moveRows) {
      const from = move.fromLocationId ? (locationName(move.fromLocationId) || '?') : '—';
      const to = locationName(move.toLocationId) || '?';
      const note = move.notes ? ` · ${move.notes}` : '';
      history.appendChild(el('div', { className: 'batch-card-detail' }, [
        `${move.movedAt} · ${from} → ${to} · ${move.quantity} ${batch.unit || ''}${note}`.trim(),
      ]));
    }
  }
  panel.appendChild(history);

  panel.appendChild(el('h3', {
    className: 'settings-section-title',
    style: { marginTop: 'var(--space-4)' },
  }, [t('feed.activityTitle')]));
  const activity = renderBatchActivity(batch, operationId, panel, true);
  panel.appendChild(activity || el('p', { className: 'form-hint' }, ['—']));

  const setLocationButton = balanceRows.length ? null : el('button', {
    className: 'btn btn-green btn-sm',
    'data-testid': 'batch-detail-set-location-save',
    onClick: () => {
      if (!locationSelection.locationId) return;
      placeInitialBalance({
        operationId,
        batchId: batch.id,
        locationId: locationSelection.locationId,
        quantity: Number(batch.remaining),
        movedAt: getLocalTodayStr(),
      });
    },
  }, [t('feed.setLocation')]);

  panel.appendChild(el('div', { className: 'btn-row sheet-actions-sticky' }, [
    setLocationButton,
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': `feed-batch-detail-edit-${batch.id}`,
      onClick: () => openBatchSheet(batch, operationId),
    }, [t('action.edit')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': `feed-batch-detail-adjust-${batch.id}`,
      onClick: () => openBatchAdjustSheet(batch, operationId),
    }, [t('feed.adjustBatch')]),
    batch.archived
      ? el('button', {
        className: 'btn btn-outline btn-sm',
        onClick: () => {
          update('batches', batch.id, { archived: false },
            BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
        },
      }, [t('action.restore')])
      : el('button', {
        className: 'btn btn-outline btn-sm',
        'data-testid': `feed-batch-detail-archive-${batch.id}`,
        onClick: () => {
          if (window.confirm(t('feed.confirmArchiveBatch'))) {
            update('batches', batch.id, { archived: true },
              BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            closeBatchDetails();
          }
        },
      }, [t('action.archive')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      'data-testid': `feed-batch-detail-delete-${batch.id}`,
      onClick: () => {
        if (window.confirm(t('feed.confirmDeleteBatch'))) {
          closeBatchDetails();
          deleteBatchWithLocations(batch.id);
        }
      },
    }, [t('action.delete')]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      onClick: () => closeBatchDetails(),
    }, [t('action.cancel')]),
  ]));

  batchDetailSheet.open();
}
