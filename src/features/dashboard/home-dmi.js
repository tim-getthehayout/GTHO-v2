/**
 * @file OI-0277 Hd3 — Home Total DMI + Pasture DMI (and Pasture %) for the
 * period pill, counting each group-day once and only inside the period.
 *
 * - Total DMI = Σ over period days of the farm need (`groupWindowsDailyDemand`,
 *   the same daily math Feed and DMI-8 use; `farmDemandWindowsOn` drops the
 *   leave day, needs the event open that day and counts a group once a day).
 *   Herd need, wherever the animals are (hay and confinement days included).
 * - Pasture DMI = the calendar Period totals strip's implied pasture DMI for the
 *   same date range (`buildLocationMetricRows` → `aggregatePeriodTotals`):
 *   Σ max(0, need − hay eaten) on pasture / mixed-use land; archived
 *   locations follow the farm setting (OI-0251 Ap, default included). One formula, reused — not a second implementation.
 * - #451: both add the winter hay history (045) for days in the range: Total adds
 *   its counted need, Pasture its 11-18 pasture (same figure as the strip).
 * - Pasture % = Pasture DMI ÷ Total DMI over the period.
 * Class DMI % is per class through OI-0279's `groupDayDmi` (inside the demand rows).
 */

import { getAll } from '../../data/store.js';
import { getLocalTodayStr } from '../../utils/date-utils.js';
import { inMetricsPass, memoByStoreVersion } from '../../calcs/metrics-memo.js';
import { groupWindowsDailyDemand, dmiBasisNote } from '../../calcs/window-helpers.js';
import {
  buildLocationMetricRows, aggregatePeriodTotals, eachDateInclusive, deriveEventStartDate,
} from '../events/rotation-calendar/location-metrics.js';
import { winterHistoryTotals } from '../events/rotation-calendar/winter-history-metrics.js';

/** Calendar days per period pill, ending today (24h = today only). */
export const HOME_PERIOD_DAYS = Object.freeze({ '24h': 1, '3d': 3, '7d': 7, '30d': 30 });

function shiftDate(ymd, days) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Date range (inclusive YYYY-MM-DD) for a Home period pill.
 * '24h' / '3d' / '7d' / '30d' = the last 1 / 3 / 7 / 30 calendar days ending
 * today; 'All' = earliest event or group-window start → today.
 * @param {string} period
 * @param {{ today?: string, events?: object[], groupWindows?: object[] }} [opts]
 * @returns {{ start: string|null, end: string }}
 */
export function homePeriodRange(period, { today = getLocalTodayStr(), events = [], groupWindows = [] } = {}) {
  if (period !== 'All') {
    const n = HOME_PERIOD_DAYS[period] ?? HOME_PERIOD_DAYS['7d'];
    return { start: shiftDate(today, -(n - 1)), end: today };
  }
  let start = null;
  for (const e of events || []) {
    if (e?.dateIn && (!start || e.dateIn < start)) start = e.dateIn;
  }
  for (const gw of groupWindows || []) {
    if (gw?.dateJoined && (!start || gw.dateJoined < start)) start = gw.dateJoined;
  }
  if (start && start > today) start = today;
  return { start, end: today };
}

/**
 * Events with a usable dateIn: stored dateIn, else the earliest window start
 * (the same derivation the calendar's demand uses).
 */
export function eventsWithDates(events, { paddockWindows = [], groupWindows = [] } = {}) {
  return (events || []).map(event => ({
    id: event.id,
    dateIn: event.dateIn || deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }),
    dateOut: event.dateOut ?? null,
  })).filter(e => e.dateIn);
}

/** Store rows the Home DMI needs (same sets the calendar passes). */
export function homeDmiCtxFromStore() {
  return {
    events: getAll('events'),
    groups: getAll('groups'),
    paddockWindows: getAll('eventPaddockWindows'),
    groupWindows: getAll('eventGroupWindows'),
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
    locations: getAll('locations'),
    observations: getAll('paddockObservations'),
    feedEntries: getAll('eventFeedEntries'),
    feedChecks: getAll('eventFeedChecks'),
    feedCheckItems: getAll('eventFeedCheckItems'),
    batches: getAll('batches'),
    feedTypes: getAll('feedTypes'),
    batchNutritionalProfiles: getAll('batchNutritionalProfiles'),
    farmSettings: getAll('farmSettings')[0] || null,
    historicalFeedings: getAll('historicalFeedings'),
    historicalAnimalBasis: getAll('historicalAnimalBasis'),
  };
}

/**
 * Total DMI (kg) over [start, end]: Σ daily farm need, each group-day once.
 * @returns {{ totalDmiKg: number, rows: object[] }}
 */
export function homeTotalDmiKg(start, end, ctx) {
  let totalDmiKg = 0;
  const rows = [];
  const events = eventsWithDates(ctx.events, ctx);
  for (const dt of eachDateInclusive(start, end)) {
    for (const row of groupWindowsDailyDemand(dt, {
      groupWindows: ctx.groupWindows,
      memberships: ctx.memberships,
      animals: ctx.animals,
      animalClasses: ctx.animalClasses,
      animalWeightRecords: ctx.animalWeightRecords,
      events,
      groups: ctx.groups,
    })) {
      totalDmiKg += row.kg || 0;
      rows.push(row);
    }
  }
  // #451: winter history need (basis days not covered by an event window).
  totalDmiKg += winterHistoryTotals(ctx, start, end, end).needKg;
  return { totalDmiKg, rows };
}

/**
 * Pasture DMI (kg) over [start, end] — the calendar Period totals path.
 * @returns {{ pastureDmiKg: number|null, dmiPartial: boolean, basisNote: string|null }}
 */
export function homePastureDmiKg(start, end, ctx, today = getLocalTodayStr()) {
  const rows = buildLocationMetricRows(ctx.locations || [], {
    ...ctx,
    windowStart: start,
    windowEnd: end,
    today,
  });
  const totals = aggregatePeriodTotals(rows, { history: winterHistoryTotals(ctx, start, end, today) });
  return { pastureDmiKg: totals.pastureDmiKg, dmiPartial: !!totals.dmiPartial, basisNote: totals.dmiBasisNote };
}

function pastureColor(pct) {
  if (pct == null) return 'var(--color-teal-base)';
  if (pct >= 75) return 'var(--color-green-base)';
  if (pct >= 50) return 'var(--color-amber-base)';
  return 'var(--color-red-base)';
}

/**
 * OI-0277 Hd3: Home Total DMI, Pasture DMI and Pasture % for a period pill.
 * @param {string} period - '24h' | '3d' | '7d' | '30d' | 'All'
 * @param {{ today?: string, ctx?: object }} [opts]
 */
export function computeHomeDmi(period, opts = {}) {
  const today = opts.today === undefined ? getLocalTodayStr() : opts.today;
  // L1: same period + day + store version → same tiles (Home renders it twice and
  // again on every notify of an unrelated type). A caller-supplied ctx is not cached.
  if (opts.ctx === undefined) {
    const r = memoByStoreVersion(`homeDmi|${period}|${today}`,
      () => inMetricsPass(() => computeHomeDmiFor(period, today, homeDmiCtxFromStore())));
    return { ...r };
  }
  return inMetricsPass(() => computeHomeDmiFor(period, today, opts.ctx));
}

function computeHomeDmiFor(period, today, ctx) {
  const { start, end } = homePeriodRange(period, { today, events: eventsWithDates(ctx.events, ctx), groupWindows: ctx.groupWindows });
  if (!start) {
    return {
      start: null, end, totalDmiKg: 0, pastureDmiKg: null, pasturePercent: null,
      dmiPartial: false, basisNote: null, pastureBasisNote: null, color: pastureColor(null),
    };
  }
  const { totalDmiKg, rows } = homeTotalDmiKg(start, end, ctx);
  const pasture = homePastureDmiKg(start, end, ctx, today);
  const pasturePercent = totalDmiKg > 0 && pasture.pastureDmiKg != null
    ? Math.max(0, Math.min(100, Math.round((pasture.pastureDmiKg / totalDmiKg) * 100)))
    : null;
  return {
    start,
    end,
    totalDmiKg,
    pastureDmiKg: pasture.pastureDmiKg,
    pasturePercent,
    dmiPartial: pasture.dmiPartial,
    basisNote: dmiBasisNote(rows),
    pastureBasisNote: pasture.basisNote,
    color: pastureColor(pasturePercent),
  };
}

/** Tooltip for the Total DMI tile. */
export function totalDmiTitle(r) {
  const parts = [`Herd DMI need ${r.start || '—'} to ${r.end}: each group-day counted once (move days and overlapping windows once), wherever the animals were, hay and confinement days included`];
  if (r.basisNote) parts.push(r.basisNote);
  return parts.join('. ');
}

/** Tooltip for the Pasture DMI tile (states the land scope, as the calendar Period totals). */
export function pastureDmiTitle(r) {
  const parts = [`Implied pasture DMI ${r.start || '—'} to ${r.end}: need minus hay eaten, on pasture and mixed-use land only (archived locations per Report preferences; confinement / hay-only days count 0) — same as the calendar Period totals`];
  if (r.dmiPartial) parts.push('partial — some groups missing weights');
  if (r.pastureBasisNote) parts.push(r.pastureBasisNote);
  return parts.join('. ');
}
