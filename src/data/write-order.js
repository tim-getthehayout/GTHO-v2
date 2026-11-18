/**
 * @file Local write-order clock shared by the sync queue (custom-sync.js) and
 * durable writes (local-storage.js commitDurableWrite).
 *
 * Rows on tables with no updated_at are ordered by when they were written on
 * this device. The clock is strictly increasing: each value is
 * max(Date.now(), previous + 1), with no backward reset, so a device clock
 * that steps back (or is corrected after jumping forward) can never make a
 * newer write rank older. Only relative order matters; the values are read
 * nowhere else.
 *
 * On first use it is seeded from the newest write order already persisted
 * (queue `enqueued_at`, dead-letter `origin_at` or `dead_lettered_at`), so
 * every write after a reload outranks everything saved before it.
 *
 * Separate tabs keep separate clocks (each seeds from storage when it first
 * writes); that is no worse than having no clock.
 */

const SYNC_QUEUE_KEY = '_sync_queue';
const DEAD_LETTER_KEY = '_dead_letter_queue';

let lastMs = null;

function parseMs(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function readList(key) {
  try {
    const raw = localStorage.getItem(key);
    const rows = raw ? JSON.parse(raw) : [];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

/** Newest write order already persisted in the queue and dead letters. */
function persistedMax() {
  let max = 0;
  for (const entry of readList(SYNC_QUEUE_KEY)) {
    const ms = parseMs(entry?.enqueued_at);
    if (ms != null && ms > max) max = ms;
  }
  for (const letter of readList(DEAD_LETTER_KEY)) {
    const ms = parseMs(letter?.origin_at || letter?.dead_lettered_at);
    if (ms != null && ms > max) max = ms;
  }
  return max;
}

/** Next write order, as an ISO string. Strictly greater than every earlier one. */
export function nextWriteOrder() {
  if (lastMs == null) lastMs = persistedMax();
  lastMs = Math.max(Date.now(), lastMs + 1);
  return new Date(lastMs).toISOString();
}

/** Forget the in-memory clock so the next write re-seeds from storage (a reload, in tests). */
export function resetWriteOrderClock() {
  lastMs = null;
}
