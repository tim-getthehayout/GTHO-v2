/** @file Shared helpers for group- and paddock-window bounds when an event
 * close changes, and for same-day overlap warnings. */

import { getAll, getById, update, closeGroupWindow, beginBatch, endBatch } from '../../data/store.js';
import * as GroupWindowEntity from '../../entities/event-group-window.js';
import * as PaddockWindowEntity from '../../entities/event-paddock-window.js';
import { compareWindowInstants } from '../../utils/date-utils.js';
import { formatShortDate } from '../../utils/date-format.js';
import { t } from '../../i18n/i18n.js';

/**
 * Classify every group window on an event against a close instant C.
 *
 * @param {object[]} windows
 * @param {string} closeDate
 * @param {string|null} closeTime
 * @returns {{ toClose: object[], toClamp: object[], toReview: object[], unchanged: object[] }}
 */
export function classifyGroupWindowsForClose(windows, closeDate, closeTime = null) {
  const toClose = [];
  const toClamp = [];
  const toReview = [];
  const unchanged = [];
  for (const gw of windows || []) {
    const joinedAfter = compareWindowInstants(gw.dateJoined, gw.timeJoined, closeDate, closeTime) > 0;
    if (joinedAfter) {
      toReview.push(gw);
      continue;
    }
    if (!gw.dateLeft) {
      toClose.push(gw);
      continue;
    }
    const leftAfter = compareWindowInstants(gw.dateLeft, gw.timeLeft, closeDate, closeTime) > 0;
    if (leftAfter) toClamp.push(gw);
    else unchanged.push(gw);
  }
  return { toClose, toClamp, toReview, unchanged };
}

/**
 * Load and classify group windows for an event close.
 * @param {string} eventId
 * @param {string} closeDate
 * @param {string|null} closeTime
 * @param {object} [opts]
 * @param {string[]|null} [opts.scopedGroupWindowIds] when the event itself is not closing, only these windows
 * @param {boolean} [opts.eventClosing] when true, classify every window on the event
 */
export function classifyEventGroupWindowsForClose(eventId, closeDate, closeTime = null, opts = {}) {
  if (!eventId || !closeDate) {
    return { toClose: [], toClamp: [], toReview: [], unchanged: [] };
  }
  let windows = getAll('eventGroupWindows').filter((w) => w.eventId === eventId);
  if (!opts.eventClosing && Array.isArray(opts.scopedGroupWindowIds)) {
    const scoped = new Set(opts.scopedGroupWindowIds);
    windows = windows.filter((w) => scoped.has(w.id));
  }
  return classifyGroupWindowsForClose(windows, closeDate, closeTime);
}

/**
 * Classify every paddock window on an event against a close instant C.
 *
 * @param {object[]} windows
 * @param {string} closeDate
 * @param {string|null} closeTime
 * @returns {{ toClose: object[], toClamp: object[], toConflict: object[], unchanged: object[] }}
 */
export function classifyPaddockWindowsForClose(windows, closeDate, closeTime = null) {
  const toClose = [];
  const toClamp = [];
  const toConflict = [];
  const unchanged = [];
  for (const pw of windows || []) {
    const openedAfter = compareWindowInstants(pw.dateOpened, pw.timeOpened, closeDate, closeTime) > 0;
    if (openedAfter) {
      toConflict.push(pw);
      continue;
    }
    if (!pw.dateClosed) {
      toClose.push(pw);
      continue;
    }
    const closedAfter = compareWindowInstants(pw.dateClosed, pw.timeClosed, closeDate, closeTime) > 0;
    if (closedAfter) toClamp.push(pw);
    else unchanged.push(pw);
  }
  return { toClose, toClamp, toConflict, unchanged };
}

export function isZeroLengthAt(gw, date, time = null) {
  if (!gw?.dateJoined || !gw?.dateLeft) return false;
  return compareWindowInstants(gw.dateJoined, gw.timeJoined, date, time) === 0
    && compareWindowInstants(gw.dateLeft, gw.timeLeft, date, time) === 0;
}

export function leftEqualsClose(gw, closeDate, closeTime = null) {
  if (!gw?.dateLeft || !closeDate) return false;
  return compareWindowInstants(gw.dateLeft, gw.timeLeft, closeDate, closeTime) === 0;
}

/**
 * A later window of the same group on another event: join instant is on or
 * after this window's leave (or, if still open, after this window's join).
 */
export function findLaterGroupWindow(gw, allWindows = getAll('eventGroupWindows')) {
  const floorDate = gw.dateLeft || gw.dateJoined;
  const floorTime = gw.dateLeft ? gw.timeLeft : gw.timeJoined;
  return (allWindows || []).find((other) => {
    if (other.id === gw.id || other.groupId !== gw.groupId) return false;
    if (other.eventId === gw.eventId) return false;
    return compareWindowInstants(other.dateJoined, other.timeJoined, floorDate, floorTime) >= 0;
  }) || null;
}

/**
 * Plan window edits when a close is moved later (not cleared): windows that
 * ended exactly at the old close move to the new close, except zero-length
 * windows at the old close and windows whose group has a later window elsewhere.
 */
export function planMoveCloseLater(windows, oldDate, oldTime, newDate, newTime, allWindows) {
  const toExtend = [];
  const heldZeroLength = [];
  const heldLater = [];
  const unchanged = [];
  for (const gw of windows || []) {
    if (!leftEqualsClose(gw, oldDate, oldTime)) {
      unchanged.push(gw);
      continue;
    }
    if (isZeroLengthAt(gw, oldDate, oldTime)) {
      heldZeroLength.push(gw);
      continue;
    }
    if (findLaterGroupWindow(gw, allWindows)) {
      heldLater.push(gw);
      continue;
    }
    toExtend.push(gw);
  }
  return { toExtend, heldZeroLength, heldLater, unchanged };
}

/**
 * Apply a close classification in one notification batch: open windows with
 * join ≤ C close at C (live head/weight stamped); closed windows with left > C
 * and join ≤ C have left clamped to C (head/weight unchanged); joined-after
 * windows become zero-length at C when acceptZeroLength is true. Unchanged
 * windows are not written. Optional paddockClamps are written in the same
 * batch (date_closed/time_closed set to C).
 *
 * @returns {string[]} ids that were written
 */
export function applyGroupWindowClosePlan(plan, closeDate, closeTime = null, { acceptZeroLength = false, paddockClamps = [] } = {}) {
  const written = [];
  beginBatch();
  try {
    for (const gw of plan.toClose || []) {
      closeGroupWindow(gw.groupId, gw.eventId, closeDate, closeTime);
      written.push(gw.id);
    }
    for (const gw of plan.toClamp || []) {
      update(
        'eventGroupWindows', gw.id,
        { dateLeft: closeDate, timeLeft: closeTime },
        GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows',
      );
      written.push(gw.id);
    }
    if (acceptZeroLength) {
      for (const gw of plan.toReview || []) {
        update(
          'eventGroupWindows', gw.id,
          {
            dateJoined: closeDate,
            timeJoined: closeTime,
            dateLeft: closeDate,
            timeLeft: closeTime,
          },
          GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows',
        );
        written.push(gw.id);
      }
    }
    for (const pw of paddockClamps || []) {
      update(
        'eventPaddockWindows', pw.id,
        { dateClosed: closeDate, timeClosed: closeTime },
        PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
      );
      written.push(pw.id);
    }
  } finally {
    endBatch();
  }
  return written;
}

/**
 * Apply a move-close-later plan: extend matching windows to the new close.
 */
export function applyMoveCloseLaterPlan(plan, newDate, newTime = null) {
  const written = [];
  beginBatch();
  try {
    for (const gw of plan.toExtend || []) {
      update(
        'eventGroupWindows', gw.id,
        { dateLeft: newDate, timeLeft: newTime },
        GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows',
      );
      written.push(gw.id);
    }
  } finally {
    endBatch();
  }
  return written;
}

/** Half-open day coverage: dateJoined ≤ d < dateLeft (open left covers onward). */
export function windowCoversDay(window, day) {
  if (!window?.dateJoined || !day) return false;
  if (window.dateJoined > day) return false;
  if (window.dateLeft && window.dateLeft <= day) return false;
  return true;
}

/**
 * Overlap of two half-open date ranges. end is exclusive, or null if open-ended.
 * @returns {{ start: string, end: string|null }|null}
 */
export function overlappingDays(a, b) {
  if (!a?.dateJoined || !b?.dateJoined) return null;
  const start = a.dateJoined >= b.dateJoined ? a.dateJoined : b.dateJoined;
  const endA = a.dateLeft || null;
  const endB = b.dateLeft || null;
  if (endA && start >= endA) return null;
  if (endB && start >= endB) return null;
  const end = endA && endB ? (endA < endB ? endA : endB) : (endA || endB);
  return { start, end };
}

/**
 * Windows of the same group (other than ignored ids) that would share a day
 * with the proposed window.
 */
export function findGroupDayOverlaps(proposed, { ignoreWindowIds = [], windows = null, todayStr = null } = {}) {
  if (!proposed?.groupId || !proposed?.dateJoined) return [];
  const ignore = new Set(ignoreWindowIds);
  const all = windows || getAll('eventGroupWindows');
  const overlaps = [];
  for (const other of all) {
    if (other.groupId !== proposed.groupId) continue;
    if (other.id && ignore.has(other.id)) continue;
    const range = overlappingDays(proposed, other);
    if (!range) continue;
    const event = getById('events', other.eventId);
    overlaps.push({
      window: other,
      event,
      eventLabel: eventDisplayName(other.eventId),
      start: range.start,
      end: range.end || todayStr,
    });
  }
  return overlaps;
}

/**
 * Short date, with time when present (HH:mm). Used by the overlap warning
 * (dates) and the joined-after review (dates and times).
 */
export function formatWindowInstant(date, time = null) {
  const dateLabel = formatShortDate(date);
  const timeLabel = time ? String(time).slice(0, 5) : '';
  if (!dateLabel) return timeLabel;
  return timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel;
}

/** Paddock-name label for an event; never an id. Live windows first, names deduped. */
export function eventDisplayName(eventId) {
  const windows = getAll('eventPaddockWindows')
    .filter((w) => w.eventId === eventId)
    .sort((a, b) => {
      const aOpen = a.dateClosed ? 1 : 0;
      const bOpen = b.dateClosed ? 1 : 0;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return (a.dateOpened || '').localeCompare(b.dateOpened || '')
        || (a.timeOpened || '').localeCompare(b.timeOpened || '');
    });
  const seen = new Set();
  const names = [];
  for (const w of windows) {
    const name = getById('locations', w.locationId)?.name;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  if (names.length) return names.join(', ');
  return t('event.unnamedEvent');
}

/**
 * Non-blocking overlap copy. X and Y are short dates.
 * When eventLabel is provided, the other event is named.
 */
export function overlapWarningText({ start, end, eventLabel = '' } = {}) {
  const startLabel = formatShortDate(start);
  const endLabel = formatShortDate(end);
  if (eventLabel) {
    return t('event.groupOverlapWarningNamed', { start: startLabel, end: endLabel, event: eventLabel });
  }
  return t('event.groupOverlapWarning', { start: startLabel, end: endLabel });
}

/**
 * Arrival is earlier than departure under the missing-time date-only rule.
 */
export function arrivalEarlierThanDeparture(arrivalDate, arrivalTime, departureDate, departureTime) {
  if (!arrivalDate || !departureDate) return false;
  return compareWindowInstants(arrivalDate, arrivalTime, departureDate, departureTime) < 0;
}

/**
 * Fill or clear a warning node. Does not block save.
 * @returns {boolean} whether a warning is showing
 */
export function renderOverlapWarning(el, text) {
  if (!el) return false;
  el.textContent = text || '';
  el.hidden = !text;
  return Boolean(text);
}
