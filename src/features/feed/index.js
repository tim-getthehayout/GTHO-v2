/** @file Feed screen — CP-24+. Feed types, batches, delivery, checks. */
// #486: the screen shell, batch list and tab / filter orchestration live here.
// The Feed Day Goal banner, Feed Types sheet, Batch Details and Batch sheets
// live in sibling modules; every public export is re-exported below so callers
// and tests import from feed/index.js unchanged.
import { el, clear } from '../../ui/dom.js';
import { t } from '../../i18n/i18n.js';
import { getAll, update, subscribe } from '../../data/store.js';
import '../../calcs/feed-forage.js';
import * as BatchEntity from '../../entities/batch.js';
import { locationSummaryText, deleteBatchWithLocations } from './batch-balances.js';
import { renderFeedDayGoalBanner, refreshFeedDayGoalBanner } from './feed-day-goal.js';
import { renderStoredFeedPlanCard, refreshStoredFeedPlanCard, closeStoredFeedPlanSheet } from './stored-feed-plan-card.js';
import { renderFeedTypeList, openFeedTypeSheet, closeFeedTypeSheet, FEED_TYPE_SHEET_ONDEMAND_ATTR } from './feed-types-sheet.js';
import {
  openBatchDetails,
  closeBatchDetails,
  refreshOpenDetail,
  getDetailBatchId,
  setBatchListRenderer,
} from './batch-detail.js';
import {
  openBatchSheet,
  openBatchAdjustSheet,
  closeBatchSheet,
  closeBatchMoveSheet,
  closeBatchAdjustSheet,
} from './batch-sheets.js';

export { farmWideActiveDmiKg } from './feed-day-goal.js';
export { buildFeedTypeRow, openFeedTypeSheet } from './feed-types-sheet.js';

/** Unsubscribe functions */
let unsubs = [];

/** Session toggle: include archived batches in the feed list. */
let showArchived = false;

// ---------------------------------------------------------------------------
// Main render
// ---------------------------------------------------------------------------

export function renderFeedScreen(container) {
  unsubs.forEach(fn => fn());
  unsubs = [];
  // OI-0265 Ft1: drop an on-demand dialog wrapper so the screen's own is the only one.
  document.querySelectorAll(`#feed-type-sheet-wrap[${FEED_TYPE_SHEET_ONDEMAND_ATTR}]`).forEach(n => n.remove());
  closeStoredFeedPlanSheet();

  const operations = getAll('operations');
  if (!operations.length) {
    container.appendChild(el('h1', { className: 'screen-heading' }, [t('feed.title')]));
    container.appendChild(el('p', {}, [t('error.generic')]));
    return;
  }

  const operationId = operations[0].id;

  const screenEl = el('div', { 'data-testid': 'feed-screen' }, [
    el('h1', { className: 'screen-heading' }, [t('feed.title')]),

    // #436 / OI-0281 stored-feed plan card (hidden while schema 052 is held)
    renderStoredFeedPlanCard(),

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
      el('div', { className: 'sheet-backdrop', onClick: () => closeFeedTypeSheet() }),
      el('div', { className: 'sheet-panel', id: 'feed-type-sheet-panel' }),
    ]),

    // Batch sheet
    el('div', { className: 'sheet-wrap', id: 'batch-sheet-wrap' }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeBatchSheet() }),
      el('div', { className: 'sheet-panel', id: 'batch-sheet-panel' }),
    ]),

    // Batch adjustment sheet
    el('div', { className: 'sheet-wrap', id: 'batch-adjust-sheet-wrap', style: { zIndex: '210' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeBatchAdjustSheet() }),
      el('div', { className: 'sheet-panel', id: 'batch-adjust-sheet-panel' }),
    ]),

    el('div', { className: 'sheet-wrap', id: 'batch-detail-sheet-wrap', style: { zIndex: '220' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeBatchDetails() }),
      el('div', { className: 'sheet-panel', id: 'batch-detail-sheet-panel' }),
    ]),

    el('div', { className: 'sheet-wrap', id: 'batch-move-sheet-wrap', style: { zIndex: '230' } }, [
      el('div', { className: 'sheet-backdrop', onClick: () => closeBatchMoveSheet() }),
      el('div', { className: 'sheet-panel', id: 'batch-move-sheet-panel' }),
    ]),
  ]);

  container.appendChild(screenEl);
  renderBatchList(container, operationId);
  renderFeedTypeList(container);

  unsubs.push(subscribe('feedTypes', () => {
    renderFeedTypeList(container);
    refreshFeedDayGoalBanner(container);
  }));
  const refreshBatches = () => {
    renderBatchList(container, operationId);
    refreshOpenDetail(operationId);
  };
  unsubs.push(subscribe('batches', () => {
    refreshBatches();
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('batchAdjustments', () => {
    refreshBatches();
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('eventFeedEntries', () => {
    refreshBatches();
    refreshFeedDayGoalBanner(container);
  }));
  unsubs.push(subscribe('batchLocationBalances', refreshBatches));
  unsubs.push(subscribe('batchMoves', refreshBatches));
  unsubs.push(subscribe('locations', () => renderBatchList(container, operationId)));
  unsubs.push(subscribe('farmSettings', () => refreshFeedDayGoalBanner(container)));
  unsubs.push(subscribe('animals', () => refreshFeedDayGoalBanner(container)));
  unsubs.push(subscribe('animalWeightRecords', () => refreshFeedDayGoalBanner(container)));
  unsubs.push(subscribe('animalClasses', () => refreshFeedDayGoalBanner(container)));
  for (const key of ['events', 'eventFeedChecks', 'eventFeedCheckItems', 'eventGroupWindows', 'animalGroupMemberships']) {
    unsubs.push(subscribe(key, () => refreshFeedDayGoalBanner(container)));
  }
  const refreshPlan = () => refreshStoredFeedPlanCard(container);
  for (const key of [
    'storedFeedPlans', 'storedFeedPlanRows', 'farmSettings', 'animals', 'animalWeightRecords',
    'animalClasses', 'events', 'eventFeedChecks', 'eventFeedCheckItems', 'eventGroupWindows',
    'animalGroupMemberships', 'eventFeedEntries', 'eventPaddockWindows', 'batches', 'feedTypes', 'locations',
    // #377 forecast: a recount (adjustment) or relocated stock changes staleness / the location check.
    'batchAdjustments', 'batchLocationBalances',
  ]) {
    unsubs.push(subscribe(key, refreshPlan));
  }
}

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

    const summary = locationSummaryText(batch.id);
    listEl.appendChild(el('div', {
      className: 'card batch-card',
      'data-testid': `feed-batch-${batch.id}`,
      onClick: () => openBatchDetails(batch.id, operationId),
    }, [
      el('div', { className: 'batch-card-head' }, [
        el('div', {}, [
          el('div', { className: 'batch-card-name' }, [batch.name]),
          el('div', { className: 'batch-card-detail' }, [
            [ftName, `${batch.remaining}/${batch.quantity} ${batch.unit}`].filter(Boolean).join(' · '),
          ]),
          el('div', {
            className: 'batch-card-detail',
            'data-testid': `feed-batch-locations-${batch.id}`,
          }, [summary || t('feed.noLocation')]),
        ]),
        el('span', { className: 'form-hint' }, [
          `${Math.round(pct)}%`,
        ]),
      ]),
      el('div', { className: 'progress-bar' }, [
        el('div', {
          className: `progress-fill ${progressClass}`,
          style: { width: `${Math.max(pct, 0)}%` },
        }),
      ]),
      el('div', { className: 'batch-card-actions' }, [
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-details-${batch.id}`,
          onClick: (e) => {
            e.stopPropagation();
            openBatchDetails(batch.id, operationId);
          },
        }, [t('feed.details')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-edit-${batch.id}`,
          onClick: (e) => {
            e.stopPropagation();
            openBatchSheet(batch, operationId);
          },
        }, [t('action.edit')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-adjust-${batch.id}`,
          onClick: (e) => {
            e.stopPropagation();
            openBatchAdjustSheet(batch, operationId);
          },
        }, [t('feed.adjustBatch')]),
        batch.archived
          ? el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `feed-batch-restore-${batch.id}`,
            onClick: (e) => {
              e.stopPropagation();
              update('batches', batch.id, { archived: false },
                BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
            },
          }, [t('action.restore')])
          : el('button', {
            className: 'btn btn-outline btn-xs',
            'data-testid': `feed-batch-archive-${batch.id}`,
            onClick: (e) => {
              e.stopPropagation();
              if (window.confirm(t('feed.confirmArchiveBatch'))) {
                update('batches', batch.id, { archived: true },
                  BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
              }
            },
          }, [t('action.archive')]),
        el('button', {
          className: 'btn btn-outline btn-xs',
          'data-testid': `feed-batch-delete-${batch.id}`,
          onClick: (e) => {
            e.stopPropagation();
            if (window.confirm(t('feed.confirmDeleteBatch'))) {
              if (getDetailBatchId() === batch.id) closeBatchDetails();
              deleteBatchWithLocations(batch.id);
            }
          },
        }, [t('action.delete')]),
      ]),
    ]));
  }
}

setBatchListRenderer(renderBatchList);
