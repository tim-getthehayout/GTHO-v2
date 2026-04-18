/** @file Event start-datetime derivation + write-through helpers (OI-0117).
 *
 * Event start is computed from the earliest child window
 * (`event_paddock_windows.dateOpened` or `event_group_windows.dateJoined`) and
 * the matching time field. `events.date_in` / `events.time_in` columns were
 * dropped in migration 028 — this module is the single source of truth.
 *
 * Three exports:
 *   - `getEventStart(eventId)` — read path, returns `{ date, time, sourceWindowId, sourceWindowType } | null`
 *   - `getEventStartDate(eventId)` — convenience wrapper returning just the date string
 *   - `getEventStartFloorExcluding(eventId, excludeWindowId, excludeType)` — edit-dialog guard
 *   - `setEventStart(eventId, newDate, newTime, opts)` — write path
 *
 * Rules baked in (see `github/issues/GH-27_derived-event-start-datetime.md`):
 *   - Sort key is `(date, time, createdAt)`; `null` time sorts BEFORE any explicit
 *     time on the same date.
 *   - Reject-on-narrow when move-later would orphan a sibling that opens between
 *     the current earliest and the new start datetime.
 *   - Tied-earliest on move-later updates ALL tied windows together.
 *     When more than one window will move, caller supplies an async
 *     `opts.confirm(names)` returning boolean; cancel → no-op.
 */

import { getAll, getById, update } from '../../data/store.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import { logger } from '../../utils/logger.js';

/**
 * Shape of a "child window opening" for the derivation sort.
 * @typedef {{ id: string, type: 'paddock' | 'group', date: string, time: string|null, createdAt: string, locationId?: string, groupId?: string }} ChildOpening
 */

function collectOpenings(eventId) {
  const out = [];
  for (const pw of getAll('eventPaddockWindows')) {
    if (pw.eventId !== eventId) continue;
    out.push({
      id: pw.id,
      type: 'paddock',
      date: pw.dateOpened,
      time: pw.timeOpened || null,
      createdAt: pw.createdAt || '',
      locationId: pw.locationId,
    });
  }
  for (const gw of getAll('eventGroupWindows')) {
    if (gw.eventId !== eventId) continue;
    out.push({
      id: gw.id,
      type: 'group',
      date: gw.dateJoined,
      time: gw.timeJoined || null,
      createdAt: gw.createdAt || '',
      groupId: gw.groupId,
    });
  }
  return out;
}

function compareOpenings(a, b) {
  // Date first.
  if (a.date !== b.date) return (a.date || '') < (b.date || '') ? -1 : 1;
  // Null time sorts BEFORE any explicit time on the same date.
  const aNull = a.time == null;
  const bNull = b.time == null;
  if (aNull !== bNull) return aNull ? -1 : 1;
  if (a.time !== b.time) return (a.time || '') < (b.time || '') ? -1 : 1;
  // Stable tiebreak: earliest createdAt wins; paddock before group within the
  // same createdAt for determinism.
  if (a.createdAt !== b.createdAt) return (a.createdAt || '') < (b.createdAt || '') ? -1 : 1;
  if (a.type !== b.type) return a.type === 'paddock' ? -1 : 1;
  return 0;
}

function windowLabel(op) {
  if (op.type === 'paddock') {
    return getById('locations', op.locationId)?.name || `paddock ${op.id.slice(0, 8)}`;
  }
  return getById('groups', op.groupId)?.name || `group ${op.id.slice(0, 8)}`;
}

/**
 * Derive the event's start datetime from its earliest child window.
 * Returns `null` when the event has no child windows (invalid state — logs a warning).
 * @param {string} eventId
 * @returns {{ date: string, time: string|null, sourceWindowId: string, sourceWindowType: 'paddock'|'group' } | null}
 */
export function getEventStart(eventId) {
  const openings = collectOpenings(eventId);
  if (!openings.length) {
    logger.warn('event-start', 'no child windows for event', { eventId });
    return null;
  }
  openings.sort(compareOpenings);
  const earliest = openings[0];
  return {
    date: earliest.date,
    time: earliest.time,
    sourceWindowId: earliest.id,
    sourceWindowType: earliest.type,
  };
}

/**
 * Convenience: just the date string. Many consumers only care about the date
 * (for `daysBetweenInclusive`, "In [date]" display, etc.). Returns null if the
 * event has no child windows.
 * @param {string} eventId
 * @returns {string|null}
 */
export function getEventStartDate(eventId) {
  const start = getEventStart(eventId);
  return start ? start.date : null;
}

/**
 * Edit-dialog guard: given an event and the window the farmer is currently
 * editing, return the earliest opening across the event's OTHER windows. The
 * edit dialog compares `newDateOpened` against this floor, not the event's
 * (derived) start — because the window being edited is itself the floor most
 * of the time, and excluding it is what allows the farmer to legitimately move
 * the event's start earlier.
 *
 * Returns `null` when there are no sibling windows (the window being edited
 * is the only child, so there's no lower floor to respect).
 *
 * @param {string} eventId
 * @param {string} excludeWindowId
 * @param {'paddock'|'group'} excludeType
 * @returns {{ date: string, time: string|null, name: string } | null}
 */
export function getEventStartFloorExcluding(eventId, excludeWindowId, excludeType) {
  const siblings = collectOpenings(eventId)
    .filter(op => !(op.id === excludeWindowId && op.type === excludeType));
  if (!siblings.length) return null;
  siblings.sort(compareOpenings);
  const floor = siblings[0];
  return { date: floor.date, time: floor.time, name: windowLabel(floor) };
}

/**
 * Apply a new start datetime to the event by updating the earliest child
 * window(s). See the module header for rules.
 *
 * @param {string} eventId
 * @param {string} newDate
 * @param {string|null} newTime
 * @param {object} [opts]
 * @param {(names: string[]) => Promise<boolean>|boolean} [opts.confirm]
 *   Called when more than one tied window will be updated on a move-later.
 *   Return false to abort (no writes happen).
 * @returns {Promise<{ updated: number, blockedBy?: { name: string, date: string, time: string|null } } | { cancelled: true }>}
 */
export async function setEventStart(eventId, newDate, newTime, opts = {}) {
  if (!newDate) throw new Error('setEventStart: newDate is required');
  const normalizedTime = newTime === '' ? null : newTime;
  const openings = collectOpenings(eventId);
  if (!openings.length) {
    throw new Error(`setEventStart: event ${eventId} has no child windows`);
  }
  openings.sort(compareOpenings);
  const current = openings[0];

  const currentDate = current.date;
  const currentTime = current.time;

  const isSame = (d, t, d2, t2) => d === d2 && (t || null) === (t2 || null);
  if (isSame(currentDate, currentTime, newDate, normalizedTime)) {
    return { updated: 0 };
  }

  // The "earliest set": every opening tied with the current minimum.
  const earliestSet = openings.filter(op => op.date === currentDate && (op.time || null) === (currentTime || null));

  // Reject-on-narrow: moving LATER cannot skip over any non-earliest sibling.
  const isLater = (newDate > currentDate) || (newDate === currentDate && (normalizedTime || '') > (currentTime || ''));
  if (isLater) {
    const blocker = openings.find(op => {
      if (earliestSet.some(e => e.id === op.id && e.type === op.type)) return false;
      // op opens at >= current minimum. If it opens BEFORE the proposed new
      // start, it would be orphaned (opens before event start).
      if (op.date < newDate) return true;
      if (op.date === newDate && (op.time || '') < (normalizedTime || '')) return true;
      return false;
    });
    if (blocker) {
      return {
        updated: 0,
        blockedBy: {
          name: windowLabel(blocker),
          date: blocker.date,
          time: blocker.time,
        },
      };
    }
  }

  // Tied-earliest on move-later: confirm if more than one window will move.
  if (isLater && earliestSet.length > 1 && typeof opts.confirm === 'function') {
    const names = earliestSet.map(op => windowLabel(op));
    const ok = await Promise.resolve(opts.confirm(names));
    if (!ok) return { cancelled: true };
  }

  // Apply updates to every window in the earliest set.
  let updated = 0;
  for (const op of earliestSet) {
    if (op.type === 'paddock') {
      update('eventPaddockWindows', op.id,
        { dateOpened: newDate, timeOpened: normalizedTime },
        PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    } else {
      update('eventGroupWindows', op.id,
        { dateJoined: newDate, timeJoined: normalizedTime },
        GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    }
    updated += 1;
  }
  return { updated };
}
