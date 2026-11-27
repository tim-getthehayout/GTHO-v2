/**
 * @file OI-0280 (#435) — per-event DMI target vs actual (hay eaten from feed
 * checks) for the Home event card. Pure compute-on-read, D0. Shipped without
 * the OI-0281 plan term (Design ruling, Sq2 path: no math rework later).
 *
 * Window (Wn3 + Ec1): with ≥ 2 feed checks, the span between the last two
 * checks; with one check, the event's opening anchor (Al1) → that check.
 * Per counted day the numbers are the Al1 allocation (OI-0258 / OI-0260, the
 * same `prorateSpanHayByDemand` source as the DMI-8 "Actual" bars):
 *   hay = hayByDate, need = in-span need (OI-0238 partial days), pasture =
 *   pastureByDate = max(0, need − hay). Days are counted as the elapsed time of
 *   the measured spans, so per-day values divide totals by the same days.
 * Day kind (gap-context rule, t1384u): stored-only when every open window that
 * day is a confinement location or flagged 100% Stored Feed (no_pasture);
 * otherwise grazing. Land use does not decide.
 * Hidden (Nc2, remaining cases): no feed check yet, no stored feed on the
 * event, or no measured day in the window (e.g. a check missing its unit).
 */
import { f1HaySpans, f1MeasuredHayOnEventDay, prorateSpanHayByDemand, NO_PASTURE_ONLY_DAY_HAY_SPAN_FALLBACK } from './f1-close-allocation.js';
import { groupWindowsDailyDmiKg } from './window-helpers.js';
import { isConfinementLocation, openPaddockWindowsOnDate } from './location-type.js';
import { localDayStartMs, localDayEndMs } from './partial-day-demand.js';
import { rowInstant, addDays } from '../utils/date-utils.js';
import { deriveEventStartDate, deriveEventStartTime } from '../features/events/rotation-calendar/location-metrics.js';

/** Dp3: amber when |hay − target| / target is MORE than 10 % (10 % exactly is not). */
export const DMI_ACTUAL_AMBER_RATIO = 0.10;

function locOf(locations, id) {
  if (!locations) return null;
  if (typeof locations.get === 'function') return locations.get(id);
  if (Array.isArray(locations)) return locations.find(l => l.id === id) || null;
  return locations[id] || null;
}

/** Gap-context rule: true when no open window on `date` can be grazed. */
export function isStoredOnlyEventDay({ paddockWindows, locations, eventId, date }) {
  const open = openPaddockWindowsOnDate(paddockWindows, { eventId, date });
  if (!open.length) return false;
  return open.every(pw => pw.noPasture || pw.no_pasture
    || isConfinementLocation(locOf(locations, pw.locationId)));
}

/**
 * @param {object} ctx - DMI-8 chart context shape (`buildDmi8ChartContext`):
 *   event (dateIn decorated), groupWindows, memberships, animals,
 *   animalWeightRecords, animalClasses, feedEntries, feedChecks, feedCheckItems,
 *   batches, feedTypes, paddockWindows, locations ({ [id]: { type, areaHa } }).
 * @param {{ today?: string }} [opts]
 * @returns {{ show: false, reason: 'no_check'|'no_stored_feed'|'no_measured_days'|'no_event' }
 *   | { show: true, kind: 'stored'|'grazing'|'mixed', targetKgPerDay: number,
 *       hayKgPerDay: number, hayPct: number|null, days: number,
 *       pastureKgPerDay: number, hayOverKgPerDay: number,
 *       storedGapKgPerDay: number|null, storedDays: number, grazingDays: number,
 *       amber: boolean, windowStart: string, windowEnd: string, checks: number }}
 */
export function computeEventDmiActual(ctx, { today } = {}) {
  const event = ctx?.event;
  if (!event?.id) return { show: false, reason: 'no_event' };
  const eventId = event.id;
  const sameEvent = row => !row?.eventId || row.eventId === eventId;
  const feedEntries = (ctx.feedEntries || []).filter(sameEvent);
  const feedChecks = (ctx.feedChecks || []).filter(sameEvent);
  const checkIds = new Set(feedChecks.map(c => c.id));
  const feedCheckItems = (ctx.feedCheckItems || []).filter(i => checkIds.has(i.feedCheckId));
  const paddockWindows = (ctx.paddockWindows || []).filter(sameEvent);
  const groupWindows = (ctx.groupWindows || []).filter(sameEvent);

  const checks = feedChecks
    .filter(c => c.date && (!today || c.date <= today))
    .sort((a, b) => rowInstant(a.date, a.time).localeCompare(rowInstant(b.date, b.time)));
  if (!checks.length) return { show: false, reason: 'no_check' };
  if (!feedEntries.length) return { show: false, reason: 'no_stored_feed' };

  const openDate = deriveEventStartDate(eventId, { paddockWindows, groupWindows, event }) || event.dateIn;
  if (!openDate) return { show: false, reason: 'no_event' };
  const hayArgs = {
    eventId,
    openDate,
    openTime: deriveEventStartTime(eventId, openDate, { paddockWindows, groupWindows }),
    feedEntries,
    feedChecks,
    feedCheckItems,
    batches: ctx.batches || {},
    feedTypes: ctx.feedTypes || {},
  };
  const spans = f1HaySpans(hayArgs);
  if (!spans.identities.size) return { show: false, reason: 'no_stored_feed' };

  const last = checks[checks.length - 1];
  const prev = checks.length >= 2 ? checks[checks.length - 2] : null;
  const fromStamp = prev ? rowInstant(prev.date, prev.time) : rowInstant(openDate, hayArgs.openTime);
  const toStamp = rowInstant(last.date, last.time);
  const windowSpans = (spans.eventSpans || []).filter(span => span.startStamp >= fromStamp
    && span.endStamp <= toStamp && span.endStamp > span.startStamp);
  const known = windowSpans.filter(span => !span.unknown && span.dm != null);
  if (!known.length) return { show: false, reason: 'no_measured_days' };

  // Same daily need DMI-8 / Al1 use (OI-0279 per-class; last-day windows kept).
  const demandOpts = {
    groupWindows, memberships: ctx.memberships, animals: ctx.animals,
    animalClasses: ctx.animalClasses, animalWeightRecords: ctx.animalWeightRecords,
  };
  const dailyDemand = (dt) => {
    if (event.dateOut && dt === event.dateOut) {
      return groupWindowsDailyDmiKg(dt, {
        ...demandOpts,
        groupWindows: groupWindows.map(gw => (gw.dateLeft === dt ? { ...gw, dateLeft: addDays(dt, 1) } : gw)),
      });
    }
    return groupWindowsDailyDmiKg(dt, demandOpts);
  };
  const dates = [];
  for (let d = openDate, n = 0; d <= last.date && n < 800; d = addDays(d, 1), n += 1) dates.push(d);
  const demandByDate = new Map(dates.map(d => [d, dailyDemand(d)]));
  const locationsById = new Map(Object.entries(ctx.locations || {}).map(([id, loc]) => [
    id, { ...loc, areaHectares: loc.areaHectares ?? loc.areaHa },
  ]));

  let need = 0;
  let hay = 0;
  let pasture = 0;
  let hayOver = 0;
  let storedNeed = 0;
  let storedHay = 0;
  let storedDays = 0;
  let grazingDays = 0;
  let days = 0;
  const dayKind = new Map();
  for (const span of known) {
    const alloc = prorateSpanHayByDemand({
      hayDm: span.dm,
      spanStartMs: span.startMs,
      spanEndMs: span.endMs,
      dates,
      eventId,
      paddockWindows,
      demandByDate,
      locationsById,
      noPastureOnlyDayHay: NO_PASTURE_ONLY_DAY_HAY_SPAN_FALLBACK,
    });
    for (const [date, dayNeed] of alloc.demandByDate) {
      // §8: hay-unknown days (a pool holding feed with no reading across the
      // day — the DMI-8 "Forecast" days) are left out of the window.
      if (!dayKind.has(date)) dayKind.set(date, f1MeasuredHayOnEventDay({ ...hayArgs, date }).kind);
      if (dayKind.get(date) === 'unknown') continue;
      const dayHay = alloc.hayByDate.get(date) || 0;
      const from = Math.max(localDayStartMs(date), span.startMs);
      const to = Math.min(localDayEndMs(date), span.endMs);
      const frac = to > from ? (to - from) / (localDayEndMs(date) - localDayStartMs(date)) : 0;
      days += frac;
      need += dayNeed;
      hay += dayHay;
      if (isStoredOnlyEventDay({ paddockWindows, locations: ctx.locations, eventId, date })) {
        storedDays += frac;
        storedNeed += dayNeed;
        storedHay += dayHay;
      } else {
        grazingDays += frac;
        pasture += alloc.pastureByDate.get(date) || 0;
        hayOver += Math.max(0, dayHay - dayNeed);
      }
    }
  }
  if (!(days > 0) || !(need > 0)) return { show: false, reason: 'no_measured_days' };

  const kind = storedDays > 0 && grazingDays > 0 ? 'mixed' : (storedDays > 0 ? 'stored' : 'grazing');
  const targetKgPerDay = need / days;
  const hayKgPerDay = hay / days;
  const ratio = need > 0 ? Math.abs(hay - need) / need : 0;
  return {
    show: true,
    kind,
    targetKgPerDay,
    hayKgPerDay,
    hayPct: need > 0 ? (hay / need) * 100 : null,
    days,
    pastureKgPerDay: grazingDays > 0 ? pasture / grazingDays : 0,
    hayOverKgPerDay: grazingDays > 0 ? hayOver / grazingDays : 0,
    // Stored-only days: + over target, − under target (DMI estimate miss).
    storedGapKgPerDay: storedDays > 0 ? (storedHay - storedNeed) / storedDays : null,
    storedDays,
    grazingDays,
    // Dp3: only all-stored-only windows go amber; exactly 10 % is not amber.
    amber: kind === 'stored' && ratio - DMI_ACTUAL_AMBER_RATIO > 1e-9,
    windowStart: prev ? prev.date : openDate,
    windowEnd: last.date,
    checks: checks.length,
  };
}
