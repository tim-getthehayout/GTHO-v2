/** @file One-time data-fix routines invoked from app boot.
 *
 * Each fix guards itself with a per-device localStorage flag so it runs at most
 * once per device. These are NOT schema migrations (no schema_version bump, no
 * CP-55/CP-56 impact) — they are app-side repairs that route through the normal
 * store helpers so sync queues normally.
 */

import { getAll, closePaddockWindow } from './store.js';
import { logger } from '../utils/logger.js';

const FLAG_PADDOCK_ORPHAN_CLEANUP = 'gtho.oneTimeFix.paddockOrphanCleanupDone';

function readFlag(name) {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(name) === 'true';
  } catch {
    return false;
  }
}

function setFlag(name) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(name, 'true');
  } catch {
    /* no-op */
  }
}

/**
 * OI-0095 Part B (app-side cleanup, not a migration):
 * Close any orphaned open event_paddock_windows whose parent event already has
 * dateOut set. Uses the normal `closePaddockWindow` helper so the sync adapter
 * queues updates like any other app mutation.
 *
 * Guarded by a per-device flag — runs at most once, and is a no-op thereafter.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.force=false] if true, ignore the flag (useful for tests).
 * @returns {{ scanned: number, closed: number }}
 */
export function closePaddockWindowOrphans({ force = false } = {}) {
  if (!force && readFlag(FLAG_PADDOCK_ORPHAN_CLEANUP)) {
    return { scanned: 0, closed: 0 };
  }

  const events = getAll('events');
  const closedEventIdToEvent = new Map();
  for (const e of events) {
    if (e.dateOut) closedEventIdToEvent.set(e.id, e);
  }

  const orphans = getAll('eventPaddockWindows').filter(
    pw => pw.dateClosed == null && closedEventIdToEvent.has(pw.eventId),
  );

  let closed = 0;
  for (const pw of orphans) {
    const evt = closedEventIdToEvent.get(pw.eventId);
    const result = closePaddockWindow(pw.locationId, pw.eventId, evt.dateOut, evt.timeOut || null);
    if (result.closedId) closed += 1;
    logger.info('orphan-cleanup', 'closed dangling paddock window', {
      pwId: pw.id, eventId: pw.eventId, locationId: pw.locationId, closedTo: evt.dateOut,
    });
  }

  setFlag(FLAG_PADDOCK_ORPHAN_CLEANUP);
  logger.info('orphan-cleanup', `paddock orphan cleanup complete — ${closed} rows touched`, {
    scanned: orphans.length, closed,
  });
  return { scanned: orphans.length, closed };
}

/** Reset all one-time-fix flags. Tests only. */
export function _resetOneTimeFixFlags() {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(FLAG_PADDOCK_ORPHAN_CLEANUP);
  } catch {
    /* no-op */
  }
}
