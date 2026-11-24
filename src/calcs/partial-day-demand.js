/** @file Partial-day estimated demand (DMI-8 Step 0b) and TIM-3-family presence.
 *
 * Demand fractions use the same localInstantMs / elapsed-hours family as DMI-5
 * (device-local days, DST-aware 23 h / 25 h). Presence hours are the
 * DST-aware equivalent of TIM-3 (0.25 h precision) for NPK-1 / NPK-3 callers.
 * Missing open time → local midnight. Missing close time → 23:59 (TIM-3).
 * Open windows (no close date) run through the end of `throughDate`.
 */

import { localInstantMs } from './feed-pools.js';
import { passMemo, metricsPassActive } from './metrics-memo.js';

/** Local midnight of YYYY-MM-DD, in ms. */
export function localDayStartMs(date) {
  return passMemo('localDayStartMs', metricsPassActive() ? String(date) : null, () => {
    const [y, m, d] = String(date).split('-').map(Number);
    return new Date(y, m - 1, d).getTime();
  });
}

/** Local midnight of the following calendar day, in ms. */
export function localDayEndMs(date) {
  return passMemo('localDayEndMs', metricsPassActive() ? String(date) : null, () => {
    const [y, m, d] = String(date).split('-').map(Number);
    return new Date(y, m - 1, d + 1).getTime();
  });
}

/** Real hours in the local calendar day (24, or 23 / 25 across DST). */
export function localHoursInDay(date) {
  return (localDayEndMs(date) - localDayStartMs(date)) / 3600000;
}

function isStoredFeedDelivery(entry) {
  return !!entry && entry.entryType !== 'removal' && !!entry.date;
}

function presentOnDate(openDate, closeDate, date) {
  if ((openDate || '9999-12-31') > date) return false;
  if (closeDate && closeDate < date) return false;
  return true;
}

/**
 * First-day clock instant (ms) on `dateIn`.
 * Earliest stored-feed delivery on that date when one exists; otherwise
 * earliest presence open (paddock timeOpened, else group timeJoined).
 * Missing time → local midnight.
 */
export function firstDayClockMs(dateIn, { feedEntries = [], paddockWindows = [], groupWindows = [] } = {}) {
  const deliveries = (feedEntries || []).filter((e) => isStoredFeedDelivery(e) && e.date === dateIn);
  if (deliveries.length) {
    return Math.min(...deliveries.map((e) => localInstantMs(e.date, e.time)));
  }
  const pws = (paddockWindows || []).filter((pw) => presentOnDate(pw.dateOpened, pw.dateClosed, dateIn));
  if (pws.length) {
    return Math.min(...pws.map((pw) => (
      pw.dateOpened && pw.dateOpened < dateIn
        ? localDayStartMs(dateIn)
        : localInstantMs(pw.dateOpened || dateIn, pw.timeOpened)
    )));
  }
  const gws = (groupWindows || []).filter((gw) => presentOnDate(gw.dateJoined, gw.dateLeft, dateIn));
  if (gws.length) {
    return Math.min(...gws.map((gw) => (
      gw.dateJoined && gw.dateJoined < dateIn
        ? localDayStartMs(dateIn)
        : localInstantMs(gw.dateJoined || dateIn, gw.timeJoined)
    )));
  }
  return localDayStartMs(dateIn);
}

/**
 * Last-day close instant (ms) on `dateOut`.
 * Latest paddock timeClosed on that date, else latest group timeLeft, else
 * event.timeOut, else 23:59 (TIM-3 missing-close convention).
 */
export function lastDayCloseMs(dateOut, { event = {}, paddockWindows = [], groupWindows = [] } = {}) {
  const fromPaddocks = (paddockWindows || [])
    .filter((pw) => pw.dateClosed === dateOut)
    .map((pw) => localInstantMs(dateOut, pw.timeClosed || '23:59'));
  if (fromPaddocks.length) return Math.max(...fromPaddocks);
  const fromGroups = (groupWindows || [])
    .filter((gw) => gw.dateLeft === dateOut)
    .map((gw) => localInstantMs(dateOut, gw.timeLeft || '23:59'));
  if (fromGroups.length) return Math.max(...fromGroups);
  if (event?.timeOut) return localInstantMs(dateOut, event.timeOut);
  return localInstantMs(dateOut, '23:59');
}

function hoursFromToOnDay(date, startMs, endMs) {
  const dayStart = localDayStartMs(date);
  const dayEnd = localDayEndMs(date);
  const from = Math.max(dayStart, startMs);
  const to = Math.min(dayEnd, endMs);
  if (to <= from) return 0;
  return (to - from) / 3600000;
}

/**
 * Estimated-path demand fraction for a local calendar date (0–1).
 * Middle days are 1.0. First day uses the delivery/presence clock through
 * end of that day (or through close when dateIn === dateOut). Last day uses
 * midnight through the close instant.
 */
export function estimatedDemandFraction(date, {
  event = {},
  feedEntries = [],
  paddockWindows = [],
  groupWindows = [],
} = {}) {
  const dateIn = event.dateIn;
  const dateOut = event.dateOut || null;
  if (!date || !dateIn) return 1;
  const isFirst = date === dateIn;
  const isLast = !!dateOut && date === dateOut;
  if (!isFirst && !isLast) return 1;

  const dayHours = localHoursInDay(date);
  if (!(dayHours > 0)) return 1;

  const ctx = { event, feedEntries, paddockWindows, groupWindows };
  const startMs = isFirst ? firstDayClockMs(dateIn, ctx) : localDayStartMs(date);
  const endMs = isLast ? lastDayCloseMs(dateOut, ctx) : localDayEndMs(date);
  const hours = hoursFromToOnDay(date, startMs, endMs);
  const fraction = hours / dayHours;
  if (fraction <= 0) return 0;
  if (fraction >= 1) return 1;
  return fraction;
}

/**
 * Presence duration in hours (TIM-3 family, DST-aware, 0.25 h precision).
 * Open windows with no close date end at local end-of-day of `throughDate`.
 */
export function presenceHours({
  dateOpened,
  timeOpened,
  dateClosed = null,
  timeClosed = null,
  throughDate = null,
} = {}) {
  if (!dateOpened) return 0;
  const openMs = localInstantMs(dateOpened, timeOpened);
  let closeMs;
  if (dateClosed) {
    closeMs = localInstantMs(dateClosed, timeClosed || '23:59');
  } else if (throughDate) {
    closeMs = localDayEndMs(throughDate);
  } else {
    return 0;
  }
  const hours = (closeMs - openMs) / 3600000;
  if (!(hours > 0)) return 0;
  return Math.round(hours * 4) / 4;
}

/** Presence duration in days (presenceHours / 24) for NPK-1. */
export function presenceDays(args) {
  return presenceHours(args) / 24;
}

/** NPK-1 days for a group window: presence, not TIM-1 inclusive days. */
export function groupWindowPresenceDays(gw, {
  eventStartDate,
  eventDateOut = null,
  eventTimeOut = null,
  throughDate,
} = {}) {
  const dateOpened = gw?.dateJoined || eventStartDate;
  const closedDate = gw?.dateLeft || eventDateOut || null;
  let closedTime = null;
  if (gw?.dateLeft) closedTime = gw.timeLeft;
  else if (eventDateOut && !gw?.dateLeft) closedTime = eventTimeOut;
  return presenceDays({
    dateOpened,
    timeOpened: gw?.timeJoined,
    dateClosed: closedDate,
    timeClosed: closedTime,
    throughDate,
  });
}

/** NPK-3 durationHours for a paddock window: TIM-3 presence, not days×24. */
export function paddockWindowPresenceHours(pw, {
  eventDateOut = null,
  eventTimeOut = null,
  throughDate,
} = {}) {
  const closedDate = pw?.dateClosed || eventDateOut || null;
  let closedTime = null;
  if (pw?.dateClosed) closedTime = pw.timeClosed;
  else if (eventDateOut && !pw?.dateClosed) closedTime = eventTimeOut;
  return presenceHours({
    dateOpened: pw?.dateOpened,
    timeOpened: pw?.timeOpened,
    dateClosed: closedDate,
    timeClosed: closedTime,
    throughDate,
  });
}
