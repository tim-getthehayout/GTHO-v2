/** @file Batch location balances — remaining stays the sum of balance rows. */

import { getAll, getById, add, update, remove } from '../../data/store.js';
import * as BatchEntity from '../../entities/batch.js';
import * as BalanceEntity from '../../entities/batch-location-balance.js';
import * as MoveEntity from '../../entities/batch-move.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';

export function balancesFor(batchId) {
  return getAll('batchLocationBalances').filter(row => row.batchId === batchId);
}

export function positiveBalances(batchId) {
  return balancesFor(batchId).filter(row => Number(row.quantity) > 0);
}

export function movesFor(batchId) {
  return getAll('batchMoves')
    .filter(row => row.batchId === batchId)
    .sort((a, b) => {
      const byDate = (b.movedAt || '').localeCompare(a.movedAt || '');
      if (byDate !== 0) return byDate;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });
}

export function locationName(locationId) {
  if (!locationId) return '';
  return getById('locations', locationId)?.name || '';
}

/**
 * Card summary. One holding shows the name. Several show "Name (qty) · Name (qty)".
 * No balance rows yet returns null.
 */
export function locationSummaryText(batchId) {
  const rows = balancesFor(batchId);
  if (!rows.length) return null;
  const holding = rows.filter(row => Number(row.quantity) > 0);
  const shown = holding.length ? holding : rows;
  const named = shown.map(row => ({
    name: locationName(row.locationId) || '?',
    qty: row.quantity,
  })).sort((a, b) => a.name.localeCompare(b.name));
  if (named.length === 1) return named[0].name;
  return named.map(row => `${row.name} (${row.qty})`).join(' · ');
}

function upsertBalance(operationId, batchId, locationId, quantity) {
  const existing = balancesFor(batchId).find(row => row.locationId === locationId);
  if (existing) {
    update('batchLocationBalances', existing.id, { quantity },
      BalanceEntity.validate, BalanceEntity.toSupabaseShape, 'batch_location_balances');
    return existing.id;
  }
  const record = BalanceEntity.create({ operationId, batchId, locationId, quantity });
  add('batchLocationBalances', record,
    BalanceEntity.validate, BalanceEntity.toSupabaseShape, 'batch_location_balances');
  return record.id;
}

/** When the batch has balance rows, remaining becomes their sum. */
export function syncRemaining(batchId) {
  const rows = balancesFor(batchId);
  if (!rows.length) return;
  const batch = getById('batches', batchId);
  if (!batch) return;
  const remaining = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  if (Number(batch.remaining) === remaining) return;
  update('batches', batchId, { remaining },
    BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
}

/** First placement: one balance and one move with a null source. */
export function placeInitialBalance({ operationId, batchId, locationId, quantity, movedAt, notes }) {
  upsertBalance(operationId, batchId, locationId, quantity);
  const move = MoveEntity.create({
    operationId,
    batchId,
    fromLocationId: null,
    toLocationId: locationId,
    quantity,
    movedAt: movedAt || getLocalTodayStr(),
    notes: notes || null,
  });
  add('batchMoves', move, MoveEntity.validate, MoveEntity.toSupabaseShape, 'batch_moves');
  syncRemaining(batchId);
  return move;
}

/**
 * Move quantity from one holding to another.
 * @returns {string|null} error message, or null on success
 */
export function moveBatchQuantity({ operationId, batchId, fromLocationId, toLocationId, quantity, movedAt, notes }) {
  if (!fromLocationId || !toLocationId) return 'location';
  if (fromLocationId === toLocationId) return 'same';
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return 'quantity';
  const from = balancesFor(batchId).find(row => row.locationId === fromLocationId);
  if (!from || quantity > Number(from.quantity)) return 'tooMuch';
  const to = balancesFor(batchId).find(row => row.locationId === toLocationId);
  const toQty = Number(to?.quantity || 0) + quantity;
  upsertBalance(operationId, batchId, fromLocationId, Number(from.quantity) - quantity);
  upsertBalance(operationId, batchId, toLocationId, toQty);
  const move = MoveEntity.create({
    operationId,
    batchId,
    fromLocationId,
    toLocationId,
    quantity,
    movedAt: movedAt || getLocalTodayStr(),
    notes: notes || null,
  });
  add('batchMoves', move, MoveEntity.validate, MoveEntity.toSupabaseShape, 'batch_moves');
  syncRemaining(batchId);
  return null;
}

/**
 * Apply a change in the batch total onto one balance.
 * Batches with no balances only update remaining (not yet placed).
 * @returns {string|null}
 */
export function applyRemainingDelta(batchId, locationId, delta) {
  const batch = getById('batches', batchId);
  if (!batch) return 'missing';
  const rows = balancesFor(batchId);
  if (!rows.length) {
    const remaining = Number(batch.remaining) + delta;
    if (remaining < 0) return 'tooMuch';
    update('batches', batchId, { remaining },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    return null;
  }
  const targetId = rows.length === 1 ? rows[0].locationId : locationId;
  const target = rows.find(row => row.locationId === targetId);
  if (!target) return 'location';
  const next = Number(target.quantity) + delta;
  if (next < 0) return 'tooMuch';
  upsertBalance(batch.operationId, batchId, target.locationId, next);
  syncRemaining(batchId);
  return null;
}

/** Tiny slack so 0.1 + 0.2 is not treated as more than 0.3. */
const STOCK_EPSILON = 1e-9;

/** The exact quantity deductDelivery will draw from for this batch and store. */
export function availableDeliveryStock(batchId, sourceLocationId) {
  const batch = getById('batches', batchId);
  if (!batch) return { status: 'missing' };
  const rows = balancesFor(batchId);
  if (!rows.length) {
    return { status: 'ok', available: Number(batch.remaining), poolKey: batchId };
  }
  const source = rows.find(row => row.locationId === sourceLocationId && Number(row.quantity) > 0);
  if (!source) return { status: 'location' };
  return {
    status: 'ok',
    available: Number(source.quantity),
    poolKey: `${batchId}\0${source.locationId}`,
  };
}

/** True when requested stock is short of available, using the deduction's comparison. */
export function exceedsAvailableStock(requested, available) {
  return Number(requested) - Number(available) > STOCK_EPSILON;
}

/** Deduct a delivery from one positive balance and keep remaining in sync. */
export function deductDelivery(batchId, sourceLocationId, quantity) {
  const stock = availableDeliveryStock(batchId, sourceLocationId);
  if (stock.status !== 'ok') return stock.status;
  if (exceedsAvailableStock(quantity, stock.available)) return 'tooMuch';
  const batch = getById('batches', batchId);
  const rows = balancesFor(batchId);
  if (!rows.length) {
    update('batches', batchId, { remaining: Math.max(0, stock.available - quantity) },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    return null;
  }
  upsertBalance(batch.operationId, batchId, sourceLocationId, Math.max(0, stock.available - quantity));
  syncRemaining(batchId);
  return null;
}

export function deleteBatchWithLocations(batchId) {
  const balanceIds = balancesFor(batchId).map(row => row.id);
  const moveIds = getAll('batchMoves').filter(row => row.batchId === batchId).map(row => row.id);
  for (const id of balanceIds) remove('batchLocationBalances', id, 'batch_location_balances');
  for (const id of moveIds) remove('batchMoves', id, 'batch_moves');
  remove('batches', batchId, 'batches');
}

/** Preflight an explicit return without repairing or relocating existing stock. */
export function validateDeliveryRestore(batchId, locationId, quantity) {
  const batch = getById('batches', batchId), rows = balancesFor(batchId);
  if (!batch) return 'missing';
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(Number(batch.remaining) + quantity)) return 'quantity';
  if (rows.length && Math.abs(rows.reduce((sum, row) => sum + Number(row.quantity), 0) - Number(batch.remaining)) > STOCK_EPSILON) return 'drift';
  if (rows.length && !locationId) return 'location';
  if (locationId && getById('locations', locationId)?.operationId !== batch.operationId) return 'location';
  if (!rows.length && locationId && Number(batch.remaining) > 0) return 'unlocated';
  return null;
}
export function restoreDelivery(batchId, locationId, quantity) {
  const error = validateDeliveryRestore(batchId, locationId, quantity);
  if (error) return error;
  const batch = getById('batches', batchId), rows = balancesFor(batchId);
  if (!rows.length && !locationId) return applyRemainingDelta(batchId, null, quantity);
  const current = rows.find(row => row.locationId === locationId);
  upsertBalance(batch.operationId, batchId, locationId, Number(current?.quantity ?? 0) + quantity);
  syncRemaining(batchId);
  return null;
}
