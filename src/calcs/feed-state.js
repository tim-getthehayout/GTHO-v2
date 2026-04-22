/** @file Feed state helpers — OI-0135. */

import { getAll } from '../data/store.js';

/**
 * Resolve the live-remaining stored-feed quantity per (batch, location) for an
 * event. Seeds with the sum of `event_feed_entries.quantity` per pair, then
 * overrides with the most recent `event_feed_check_items.remaining_quantity`
 * when a feed check exists for that pair on this event.
 *
 * Used by move-wizard Step 3 render + Step 1 close-reading write path and by
 * submove close's display hint. Keeps both surfaces on identical semantics.
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

  const result = {};
  for (const e of feedEntries) {
    const key = `${e.batchId}|${e.locationId}`;
    result[key] = (result[key] ?? 0) + (Number(e.quantity) || 0);
  }
  const seen = new Set();
  for (const fc of allChecks) {
    const items = checkItems.filter(ci => ci.feedCheckId === fc.id);
    for (const ci of items) {
      const key = `${ci.batchId}|${ci.locationId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result[key] = Number(ci.remainingQuantity) || 0;
    }
  }
  return result;
}
