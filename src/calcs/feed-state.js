/** @file Feed state helpers — OI-0135, OI-0139. */

import { getAll } from '../data/store.js';

/**
 * Resolve the live-remaining stored-feed quantity per (batch, location) for an
 * event. Per pair:
 *   - If at least one prior feed check exists, live = `latestCheck.remainingQuantity
 *     + Σ deliveries with (date, time) strictly after the latest check's (date, time)`.
 *   - If no prior check exists, fall back to `Σ all deliveries` for the pair.
 *
 * The strict `>` timestamp comparison is load-bearing — a delivery saved at the
 * exact same `(date, time)` as the latest check is treated as captured BY the
 * check, not in addition to it. Prevents double-count when a farmer takes a
 * check and logs a delivery in the same minute.
 *
 * Used by move-wizard Step 3 render + Step 1 close-reading write, sub-move
 * close's display hint, and the feed-check sheet's prefill (OI-0139). Single
 * source of truth across all four surfaces.
 *
 * @param {string} eventId
 * @returns {Object<string, number>} keyed by `${batchId}|${locationId}`
 */
export function getLiveRemainingForMove(eventId) {
  const feedEntries = getAll('eventFeedEntries').filter(e => e.eventId === eventId);
  const allChecks = getAll('eventFeedChecks')
    .filter(fc => fc.eventId === eventId)
    .sort((a, b) => {
      const ad = `${a.date}T${a.time || '00:00'}`;
      const bd = `${b.date}T${b.time || '00:00'}`;
      return bd.localeCompare(ad); // most recent first
    });
  const checkItems = getAll('eventFeedCheckItems');

  // 1. Seed every (batch, location) pair with the lifetime delivery sum.
  const result = {};
  for (const e of feedEntries) {
    const key = `${e.batchId}|${e.locationId}`;
    result[key] = (result[key] ?? 0) + (Number(e.quantity) || 0);
  }

  // 2. For every pair that has at least one check, override the seed with
  //    `latestCheck.remainingQuantity + Σ deliveries strictly after the check`.
  const seen = new Set();
  for (const fc of allChecks) {
    const fcStamp = `${fc.date}T${fc.time || '00:00'}`;
    const items = checkItems.filter(ci => ci.feedCheckId === fc.id);
    for (const ci of items) {
      const key = `${ci.batchId}|${ci.locationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const postCheckDeliveries = feedEntries
        .filter(e => e.batchId === ci.batchId && e.locationId === ci.locationId)
        .filter(e => `${e.date}T${e.time || '00:00'}` > fcStamp)
        .reduce((sum, e) => sum + (Number(e.quantity) || 0), 0);
      result[key] = (Number(ci.remainingQuantity) || 0) + postCheckDeliveries;
    }
  }
  return result;
}
