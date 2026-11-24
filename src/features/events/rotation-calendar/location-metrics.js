/**
 * @file Location management metrics over a date window (compute-on-read).
 * LOCKED formula: S1+F1(DMI)+L1+H0+C1+Z1 with NPK Ns+R1+Kc.
 * W1 window, M0 columns, A1 totals+per-acre, N1 separate N/P/K, X1 pasture+mixed-use.
 * Unknowns are null (UI shows "—"), never silent 0. Never-present → known 0 (Z1).
 * OI-0250 Sb strip: aggregatePeriodTotals — En pasture/stored/total + Nk; Sz missing-DM=0.
 * OI-0249 Zp+Gg: season DMI/NPK sum known group-weight slices and mark partial;
 * dash only when nothing known remains. AUDs (Ua) and Score (Sc) unchanged.
 * Closed snapshots trusted as stored (Rt). F1 unmeasured-hay and R1 residual
 * unknowns stay season-sticky (list-parity locks not reopened).
 * OI-0258 Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0: hay known from opening
 * carryover + physical deliveries + close (no mid-check required); span hay
 * prorated by demand across grazing windows. Sp-w is not implemented.
 * OI-0256 Lv1+Mt1+Mx1: no_pasture → known Pasture 0 / 100% stored on that window;
 * omit no_pasture from pasture DMI+AUD inference; keep in NPK deposits.
 */

import { getCalcByName } from '../../../utils/calc-registry.js';
import { passMemo, ref, metricsPassActive } from '../../../calcs/metrics-memo.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../../utils/date-utils.js';
import {
  getLiveWindowHeadCount,
  getLiveWindowAvgWeight,
  groupWindowsDailyDemand,
  groupDayExcretionRates,
  dmiBasisNote,
  eventOpenOn,
} from '../../../calcs/window-helpers.js';
import {
  groupWindowPresenceDays,
  localDayStartMs,
  localDayEndMs,
  localHoursInDay,
} from '../../../calcs/partial-day-demand.js';
import { localInstantMs, feedSnapshot } from '../../../calcs/feed-pools.js';
import { openPaddockWindowsOnDate } from '../../../calcs/location-type.js';
import {
  f1HaySpans,
  f1MeasuredHayOnEventDay,
  prorateSpanHayByDemand,
  grazingPaddockWindowsOnDate,
  acreShareAmong,
} from '../../../calcs/f1-close-allocation.js';
import { periodContaining } from '../../../calcs/budget-period.js';
import { resolveFarmSeason } from '../../../calcs/farm-season.js';

const DEFAULT_EXC = { n: 0.145, p: 0.041, k: 0.136 };

/** Derive event start from passed-in windows (store-free for unit tests). */
export function deriveEventStartDate(eventId, opts = {}) {
  const { paddockWindows = [], groupWindows = [], event = null } = opts;
  return passMemo('eventStartDate', metricsPassActive()
    ? `${eventId}|${ref(paddockWindows)}|${ref(groupWindows)}|${ref(event)}` : null,
  () => computeEventStartDate(eventId, { paddockWindows, groupWindows, event }));
}

function computeEventStartDate(eventId, { paddockWindows = [], groupWindows = [], event = null } = {}) {
  let earliest = null;
  for (const pw of paddockWindows) {
    if (pw.eventId !== eventId || !pw.dateOpened) continue;
    if (!earliest || pw.dateOpened < earliest) earliest = pw.dateOpened;
  }
  for (const gw of groupWindows) {
    if (gw.eventId !== eventId || !gw.dateJoined) continue;
    if (!earliest || gw.dateJoined < earliest) earliest = gw.dateJoined;
  }
  return earliest || event?.dateIn || null;
}

/** Earliest clock on `openDate` among windows that start that day; null → midnight. */
export function deriveEventStartTime(eventId, openDate, { paddockWindows = [], groupWindows = [] } = {}) {
  if (!eventId || !openDate) return null;
  let earliest = null;
  for (const pw of paddockWindows) {
    if (pw.eventId !== eventId || pw.dateOpened !== openDate || !pw.timeOpened) continue;
    if (!earliest || pw.timeOpened < earliest) earliest = pw.timeOpened;
  }
  for (const gw of groupWindows) {
    if (gw.eventId !== eventId || gw.dateJoined !== openDate || !gw.timeJoined) continue;
    if (!earliest || gw.timeJoined < earliest) earliest = gw.timeJoined;
  }
  return earliest;
}

/** X1: pasture + mixed-use land only. OI-0271: canonical stored value is 'mixed_use' (entity + DB CHECK). */
export function isManagementLocation(loc) {
  if (!loc || loc.archived) return false;
  if (loc.type !== 'land') return false;
  const use = loc.landUse || 'pasture';
  return use === 'pasture' || use === 'mixed_use';
}

/** Filter locations to X1 set. */
export function filterManagementLocations(locations = []) {
  return (locations || []).filter(isManagementLocation);
}

/**
 * Default W1 window containing today: the farm season default (#402), or the
 * calendar year Jan 1 – Dec 31 when the farm has none (columns absent before
 * migration 049, or unset). Pass the farm_settings record.
 */
export function defaultMetricWindow(today = getLocalTodayStr(), farmSettings = null) {
  return periodContaining(today, resolveFarmSeason(farmSettings));
}

/** Inclusive YYYY-MM-DD day list from start to end. */
export function eachDateInclusive(start, end) {
  const out = [];
  if (!start || !end || end < start) return out;
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

function effectiveAreaHa(pw, locationsById) {
  const loc = locationsById.get(pw.locationId);
  const ha = Number(loc?.areaHectares);
  const pct = Number(pw.areaPct);
  const area = Number.isFinite(ha) && ha > 0 ? ha : 0;
  const frac = Number.isFinite(pct) && pct > 0 ? pct / 100 : 1;
  return area * frac;
}

/** OI-0278: canonical area in hectares; no / zero area → null. Per-area metrics are per ha. */
function areaHaOf(location) {
  const ha = Number(location?.areaHectares);
  if (!Number.isFinite(ha) || ha <= 0) return null;
  return ha;
}

function mapById(rows) {
  if (!rows) return {};
  if (!Array.isArray(rows)) return rows;
  return Object.fromEntries(rows.map(r => [r.id, r]));
}

function groupPresentOnDate(gw, date) {
  if (!gw || !date) return false;
  const open = gw.dateJoined || '9999-12-31';
  if (open > date) return false;
  if (gw.dateLeft && gw.dateLeft <= date) return false;
  return true;
}

/**
 * TIM-3 presence fraction (0–1) for a group window on one local calendar day.
 * Open through end-of-day of `throughDate` when the window has no close.
 */
export function groupPresenceFractionOnDate(gw, date, {
  eventDateOut = null,
  eventTimeOut = null,
  throughDate = null,
} = {}) {
  if (!groupPresentOnDate(gw, date)) return 0;
  const openDate = gw.dateJoined;
  if (!openDate) return 0;
  const openMs = openDate < date
    ? localDayStartMs(date)
    : localInstantMs(openDate, gw.timeJoined);
  let closeMs;
  if (gw.dateLeft) {
    closeMs = gw.dateLeft > date
      ? localDayEndMs(date)
      : localInstantMs(gw.dateLeft, gw.timeLeft || '23:59');
  } else if (eventDateOut) {
    closeMs = eventDateOut > date
      ? localDayEndMs(date)
      : localInstantMs(eventDateOut, eventTimeOut || '23:59');
  } else if (throughDate) {
    closeMs = throughDate > date ? localDayEndMs(date) : localDayEndMs(throughDate);
  } else {
    return 0;
  }
  const dayStart = localDayStartMs(date);
  const dayEnd = localDayEndMs(date);
  const from = Math.max(dayStart, openMs);
  const to = Math.min(dayEnd, closeMs);
  if (to <= from) return 0;
  const hours = (to - from) / 3600000;
  const dayHours = localHoursInDay(date);
  if (!(dayHours > 0)) return 0;
  const frac = hours / dayHours;
  if (frac <= 0) return 0;
  if (frac >= 1) return 1;
  return Math.round(frac * 10000) / 10000;
}

/**
 * Overlap clip of a paddock window against [windowStart, windowEnd].
 * Returns null when no overlap.
 */
export function clipWindowToRange(pw, event, windowStart, windowEnd, today, ctx = {}) {
  const eventStart = deriveEventStartDate(event.id, {
    paddockWindows: ctx.paddockWindows || [],
    groupWindows: ctx.groupWindows || [],
    event,
  }) || event.dateIn || pw.dateOpened;
  if (!eventStart) return null;
  const open = pw.dateOpened || eventStart;
  const close = pw.dateClosed || event.dateOut || today;
  const start = [open, windowStart].sort().pop();
  const end = [close, windowEnd].sort()[0];
  if (!start || !end || end < start) return null;
  return { start, end, days: daysBetweenInclusive(start, end) };
}

/** OI-0256 Lv1: window flagged 100% stored feed. */
export function isNoPasturePw(pw) {
  return !!pw?.noPasture;
}

/** OI-0256 Mx1: windows that participate in pasture DMI + AUD inference. */
export function pastureInferenceWindows(eventOpen = []) {
  return (eventOpen || []).filter((pw) => !isNoPasturePw(pw));
}

/** Acre share within an explicit window pool (Mx1 pasture vs all-open NPK). */
export function acreShareInPool(pool, locationId, locationsById) {
  return acreShareForLocation(pool || [], locationId, locationsById);
}

/** Effective-area weight for one paddock window. */
export function paddockWindowAreaWeight(pw, locationsById) {
  return effectiveAreaHa(pw, locationsById);
}

function acreShareForLocation(eventOpen, locationId, locationsById) {
  if (!eventOpen.length) return 0;
  const weights = eventOpen.map(pw => effectiveAreaHa(pw, locationsById));
  const sumW = weights.reduce((s, a) => s + a, 0);
  const mine = eventOpen.filter(pw => pw.locationId === locationId);
  const myW = mine.reduce((s, pw) => s + effectiveAreaHa(pw, locationsById), 0);
  if (sumW > 0) return myW / sumW;
  return mine.length / Math.max(1, eventOpen.length);
}

/**
 * Resolve N/P/K percents for a residual batch: latest nutritional profile, else feed type.
 * Returns { n, p, k } with nulls when missing.
 */
function finitePct(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function resolveResidualNpkPercents({ batchId, feedTypeId, batchNutritionalProfiles = [], feedTypes = {} } = {}) {
  const types = mapById(feedTypes);
  let n = null;
  let p = null;
  let k = null;
  if (batchId) {
    const latest = (batchNutritionalProfiles || [])
      .filter(pr => pr.batchId === batchId)
      .slice()
      .sort((a, b) => String(b.testedAt || '').localeCompare(String(a.testedAt || '')))[0];
    if (latest) {
      n = finitePct(latest.nPct);
      p = finitePct(latest.pPct);
      k = finitePct(latest.kPct);
    }
  }
  const ftId = feedTypeId || null;
  const ft = ftId ? types[ftId] : null;
  if (n == null) n = finitePct(ft?.nPct);
  if (p == null) p = finitePct(ft?.pPct);
  if (k == null) k = finitePct(ft?.kPct);
  return { n, p, k };
}

/**
 * Measured hay status for one event on one date (F1).
 * @returns {{ kind: 'none' } | { kind: 'measured', dmKg: number } | { kind: 'unknown' }}
 */
export function measuredHayOnEventDay({
  eventId,
  date,
  feedEntries = [],
  feedChecks = [],
  feedCheckItems = [],
  batches = {},
  feedTypes = {},
  openDate = null,
  openTime = null,
  paddockWindows = [],
  groupWindows = [],
  event = null,
} = {}) {
  const start = openDate
    || deriveEventStartDate(eventId, { paddockWindows, groupWindows, event });
  const startTime = openTime !== null && openTime !== undefined
    ? openTime
    : deriveEventStartTime(eventId, start, { paddockWindows, groupWindows });
  let inferred = start;
  if (!inferred) {
    const dates = [
      ...(feedEntries || []).filter(row => row.eventId === eventId).map(row => row.date),
      ...(feedChecks || []).filter(row => row.eventId === eventId).map(row => row.date),
    ].filter(Boolean).sort();
    inferred = dates[0] || null;
  }
  if (!inferred) return { kind: 'none' };
  return f1MeasuredHayOnEventDay({
    eventId,
    date,
    openDate: inferred,
    openTime: startTime,
    feedEntries,
    feedChecks,
    feedCheckItems,
    batches,
    feedTypes,
  });
}

/** OI-0276: subtle hover notes when leftover hay is not counted in NPK (no "partial"). */
export const RESIDUAL_NPK_NOTE_NO_PCT = 'Leftover hay not counted — feed type has no NPK %';
export const RESIDUAL_NPK_NOTE_NO_WEIGHT_DM = 'Leftover hay not counted — feed has no weight or DM %';

/** OI-0276: hover note for a metrics row / totals with skipped residual hay, else null. */
export function residualNpkNote(metrics) {
  if (!metrics) return null;
  const notes = [];
  if (metrics.residualNpkSkippedNoPct) notes.push(RESIDUAL_NPK_NOTE_NO_PCT);
  if (metrics.residualNpkSkippedNoWeightDm) notes.push(RESIDUAL_NPK_NOTE_NO_WEIGHT_DM);
  return notes.length ? notes.join('; ') : null;
}

/**
 * Residual-feed NPK (R1) left on `locationId` from close readings in the window.
 * OI-0276 (amends R1): a positive residual with no N/P/K %, or no weight / DM,
 * contributes 0 and is reported as skipped — it never nulls the totals.
 * `known` stays true; `skippedNoPct` / `skippedNoWeightDm` count the skips.
 */
export function residualFeedNpkForLocation(locationId, {
  windowStart,
  windowEnd,
  events = [],
  feedChecks = [],
  feedCheckItems = [],
  batches = {},
  feedTypes = {},
  batchNutritionalProfiles = [],
} = {}) {
  const batchMap = mapById(batches);
  const typeMap = mapById(feedTypes);
  let nKg = 0;
  let pKg = 0;
  let kKg = 0;
  let skippedNoPct = 0;
  let skippedNoWeightDm = 0;

  for (const check of feedChecks || []) {
    if (!check?.isCloseReading) continue;
    if (!check.date || check.date < windowStart || check.date > windowEnd) continue;
    const event = (events || []).find(e => e.id === check.eventId);
    if (!event?.dateOut) continue;
    // Residual only counts when the close reading is in-window for a closed event.
    const items = (feedCheckItems || []).filter(i => i.feedCheckId === check.id && i.locationId === locationId);
    for (const item of items) {
      const qty = Number(item.remainingQuantity);
      if (!(Number.isFinite(qty)) || qty <= 0) continue;
      const batch = item.batchId ? batchMap[item.batchId] : null;
      const snap = item.feedTypeId
        ? {
          feedTypeId: item.feedTypeId,
          weight: item.weightPerUnitKgSnapshot,
          dmPct: item.dmPctSnapshot,
        }
        : feedSnapshot(item, batchMap);
      const weight = Number(snap.weight ?? item.weightPerUnitKgSnapshot ?? batch?.weightPerUnitKg);
      const dmPct = Number(snap.dmPct ?? item.dmPctSnapshot ?? batch?.dmPct);
      if (!(Number.isFinite(weight) && weight > 0) || !(Number.isFinite(dmPct) && dmPct > 0)) {
        skippedNoWeightDm += 1; // OI-0276: adds 0
        continue;
      }
      const dmMass = qty * weight * dmPct / 100;
      const feedTypeId = snap.feedTypeId || item.feedTypeId || batch?.feedTypeId || null;
      const pct = resolveResidualNpkPercents({
        batchId: item.batchId,
        feedTypeId,
        batchNutritionalProfiles,
        feedTypes: typeMap,
      });
      if (pct.n == null || pct.p == null || pct.k == null) {
        skippedNoPct += 1; // OI-0276: adds 0
        continue;
      }
      nKg += dmMass * pct.n / 100;
      pKg += dmMass * pct.p / 100;
      kKg += dmMass * pct.k / 100;
    }
  }

  return { nKg, pKg, kKg, known: true, skippedNoPct, skippedNoWeightDm };
}

/**
 * Compute management metrics for one location over [windowStart, windowEnd].
 */
export function computeLocationMetrics(location, ctx) {
  const {
    windowStart,
    windowEnd,
    today = getLocalTodayStr(),
    events = [],
    paddockWindows = [],
    groupWindows = [],
    memberships = [],
    animals = [],
    animalClasses = [],
    animalWeightRecords = [],
    locations = [],
    observations = [],
    feedEntries = [],
    feedChecks = [],
    feedCheckItems = [],
    batches = [],
    feedTypes = [],
    batchNutritionalProfiles = [],
    // OI-0264 Mw1: restrict this location's contribution to one paddock window
    // (past-block label). Full paddockWindows still drive acre shares + Al1.
    onlyPaddockWindowId = null,
  } = ctx;

  const empty = {
    locationId: location?.id,
    locationName: location?.name || '',
    areaHectares: location?.areaHectares ?? null,
    hasArea: areaHaOf(location) != null,
    dmiKg: null,
    dmiKnown: false,
    auds: 0,
    audsKnown: true,
    nKg: 0,
    pKg: 0,
    kKg: 0,
    npkKnown: true,
    residualNpkSkippedNoPct: 0,
    residualNpkSkippedNoWeightDm: 0,
    avgScore: null,
    scoreKnown: false,
    dmiPartial: false,
    npkPartial: false,
    // OI-0250 strip fields (Sz): stored missing-DM → 0; strip pasture ignores F1 sticky
    storedFeedDmiKg: 0,
    stripPastureDmiKg: null,
    stripDmiPartial: false,
    dmiBasisNote: null,
    eventCount: 0,
    // OI-0278: per-area metrics are canonical per hectare; display converts.
    dmiPerHa: null,
    audsPerHa: null,
    nPerHa: null,
    pPerHa: null,
    kPerHa: null,
  };

  if (!location?.id || !windowStart || !windowEnd) return empty;

  const locationsById = new Map((locations || []).map(l => [l.id, l]));
  const isMine = (pw) => pw.locationId === location.id
    && (!onlyPaddockWindowId || pw.id === onlyPaddockWindowId);
  const locPws = (paddockWindows || []).filter(isMine);
  // Acre share of "mine" in a pool; identical to the location share unless scoped to one window.
  const scopedShare = (pool) => {
    if (!pool.length) return 0;
    const sumW = pool.reduce((sum, pw) => sum + effectiveAreaHa(pw, locationsById), 0);
    const mine = pool.filter(isMine);
    const myW = mine.reduce((sum, pw) => sum + effectiveAreaHa(pw, locationsById), 0);
    if (sumW > 0) return myW / sumW;
    return mine.length / Math.max(1, pool.length);
  };
  const shareInPool = (pool) => (onlyPaddockWindowId
    ? scopedShare(pool)
    : acreShareForLocation(pool, location.id, locationsById));
  const aniAu = getCalcByName('ANI-AU');
  const aniAud = getCalcByName('ANI-AUD');
  const npk1 = getCalcByName('NPK-1');

  let auds = 0;
  let nKg = 0;
  let pKg = 0;
  let kKg = 0;
  let eventIds = new Set();
  let npkKnownSlices = 0;
  let npkUnknownSlices = 0;
  let dmiKg = 0;
  let dmiDays = 0;
  let dmiKnownSlices = 0;
  let dmiUnknownSlices = 0;
  let dmiHayUnknown = false; // F1 sticky (column only)
  let storedFeedDmiKg = 0; // OI-0250 Sz strip
  let stripPastureDmiKg = 0;
  let anyDemandDay = false;
  const eventDemandByDate = new Map();
  const eventsNeedingHay = new Set();
  const demandRowsUsed = []; // OI-0279 basis note

  // L1: one class map and one demand event list per render pass (same inputs →
  // same objects), so the group-day demand memo is shared across location rows.
  const classMap = passMemo('lmClassMap', metricsPassActive() ? String(ref(animalClasses)) : null,
    () => (Array.isArray(animalClasses)
      ? Object.fromEntries((animalClasses || []).map(c => [c.id, c]))
      : (animalClasses || {})));
  const eventsForDemand = passMemo('lmEventsForDemand', metricsPassActive()
    // Keyed by the event objects, not the list: every past block of one event
    // (Mw1 passes a fresh [event]) shares one demand per day.
    ? `${(events || []).map(ref).join(',')}|${ref(paddockWindows)}|${ref(groupWindows)}` : null,
  () => (events || []).map(event => ({
    id: event.id,
    dateIn: event.dateIn
      || deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }),
    dateOut: event.dateOut ?? null,
  })).filter(e => e.dateIn));
  const eventsById = new Map((events || []).map(e => [e.id, e]));
  const demandOpts = {
    groupWindows,
    memberships,
    animals,
    animalClasses: classMap,
    animalWeightRecords,
    events: eventsForDemand,
    groups: [],
  };

  const through = windowEnd > today ? today : windowEnd;
  for (const date of eachDateInclusive(windowStart, through)) {
    const openHere = openPaddockWindowsOnDate(locPws, { date });
    if (openHere.length) anyDemandDay = true;

    // --- AUDs + excretion NPK (Kc) via S1 day×acres among open paddocks ---
    const eventIdsToday = new Set([
      ...openHere.map(pw => pw.eventId),
      // Also walk events whose group is present even if this loc's pw list was empty that day
    ]);
    // Prefer events that touch this location historically (any pw), open today farm-wide
    for (const pw of locPws) eventIdsToday.add(pw.eventId);

    for (const eventId of eventIdsToday) {
      const event = eventsById.get(eventId);
      if (!event) continue;
      const eventStart = deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }) || event.dateIn;
      if (!eventStart) continue;
      const decorated = { id: event.id, dateIn: eventStart, dateOut: event.dateOut ?? null };
      if (!eventOpenOn(decorated, date)) continue;

      const eventOpen = openPaddockWindowsOnDate(paddockWindows, { eventId, date });
      const openMine = eventOpen.filter(isMine);
      if (!openMine.length) continue;

      eventIds.add(eventId);
      // OI-0256 Mx1: NPK keeps all open windows; on mixed events AUDs omit no_pasture
      // (infer from other open windows). Solo no_pasture still keeps its own AUDs.
      const pasturePool = pastureInferenceWindows(eventOpen);
      const mineNoPastureOnly = openMine.every(isNoPasturePw);
      let audShare;
      if (mineNoPastureOnly && pasturePool.length === 0) {
        audShare = shareInPool(eventOpen);
      } else if (mineNoPastureOnly) {
        audShare = 0;
      } else {
        audShare = shareInPool(pasturePool.length ? pasturePool : eventOpen);
      }
      const npkShare = shareInPool(eventOpen);
      if (!(audShare > 0) && !(npkShare > 0)) continue;

      const gws = (groupWindows || []).filter(gw => gw.eventId === eventId && groupPresentOnDate(gw, date));
      for (const gw of gws) {
        const now = gw.dateLeft || event.dateOut || today;
        const liveHead = getLiveWindowHeadCount(gw, { memberships, animals, now });
        if (!(liveHead > 0)) continue;
        const frac = groupPresenceFractionOnDate(gw, date, {
          eventDateOut: event.dateOut,
          eventTimeOut: event.timeOut,
          throughDate: today,
        });
        if (!(frac > 0)) continue;

        const liveAvg = getLiveWindowAvgWeight(gw, {
          memberships, animals, animalClasses, animalWeightRecords, now,
        });

        const au = aniAu
          ? aniAu.fn({ headCount: liveHead, avgWeightKg: liveAvg || 0 })
          : (liveHead * (liveAvg || 0)) / 453.6;
        const dayAuds = aniAud ? aniAud.fn({ au, days: frac }) : au * frac;
        if (audShare > 0) auds += dayAuds * audShare;

        // OI-0279: class rates from the group's member mix that day.
        const exc = groupDayExcretionRates(gw, date, { memberships, animals, animalClasses: classMap, animalWeightRecords }, DEFAULT_EXC);
        // OI-0249 Gg: keep known-weight groups; count missing-weight as unknown slices (Zp).
        // OI-0256 Mx1: no_pasture window still participates in NPK deposits.
        if (npkShare > 0 && npk1 && liveAvg > 0) {
          const r = npk1.fn({
            headCount: liveHead,
            avgWeightKg: liveAvg,
            days: frac,
            excretionNRate: exc.n,
            excretionPRate: exc.p,
            excretionKRate: exc.k,
          });
          nKg += (r.nKg ?? 0) * npkShare;
          pKg += (r.pKg ?? 0) * npkShare;
          kKg += (r.kKg ?? 0) * npkShare;
          npkKnownSlices += 1;
        } else if (npkShare > 0 && liveHead > 0 && !(liveAvg > 0)) {
          npkUnknownSlices += 1;
        }
      }
    }

    // --- Implied pasture DMI (F1 / OI-0258; peer-scoped unknown weights) ---
    if (!openHere.length) continue;

    const rows = groupWindowsDailyDemand(date, demandOpts);
    if (!rows.length) continue;

    const openEventIds = new Set(openHere.map(pw => pw.eventId));
    const relevantRows = rows.filter(r => openEventIds.has(r.eventId));
    if (!relevantRows.length) continue;

    // OI-0249 Gg: skip only the missing-weight group; keep other groups that day.
    const knownRows = [];
    for (const row of relevantRows) {
      if (!(row.head > 0)) continue;
      if (Number.isFinite(row.avgWeightKg) && row.avgWeightKg > 0) {
        knownRows.push(row);
        dmiKnownSlices += 1;
      } else {
        dmiUnknownSlices += 1;
      }
    }

    for (const r of knownRows) {
      if (!(r.kg > 0)) continue;
      demandRowsUsed.push(r);
      if (!eventDemandByDate.has(r.eventId)) eventDemandByDate.set(r.eventId, new Map());
      const byDate = eventDemandByDate.get(r.eventId);
      byDate.set(date, (byDate.get(date) || 0) + r.kg);
      eventsNeedingHay.add(r.eventId);
    }
  }

  // OI-0258: after the day walk, allocate each event's hay spans (Al1/Mc1/Cv1)
  // by demand across grazing windows (Sp-f, Mx-a). Unknown hay days stay
  // season-sticky on the column (C0/F1); the Sz strip uses stored 0 those days.
  const metricDates = eachDateInclusive(windowStart, through);
  for (const eventId of eventsNeedingHay) {
    const event = eventsById.get(eventId);
    const openDate = deriveEventStartDate(eventId, { paddockWindows, groupWindows, event })
      || event?.dateIn
      || null;
    const openTime = deriveEventStartTime(eventId, openDate, { paddockWindows, groupWindows });
    const decorated = event
      ? { id: event.id, dateIn: openDate, dateOut: event.dateOut ?? null }
      : { id: eventId, dateIn: openDate, dateOut: null };
    const demandByDate = eventDemandByDate.get(eventId) || new Map();
    const hayArgs = {
      eventId,
      openDate,
      openTime,
      feedEntries,
      feedChecks,
      feedCheckItems,
      batches,
      feedTypes,
    };
    const spans = f1HaySpans(hayArgs);

    const addDemandOnly = (date, { stripOnly = false } = {}) => {
      const demand = demandByDate.get(date) || 0;
      const grazing = grazingPaddockWindowsOnDate(paddockWindows, { eventId, date });
      if (!grazing.length) return;
      const share = onlyPaddockWindowId
        ? scopedShare(grazing)
        : acreShareAmong(grazing, location.id, locationsById);
      if (!(share > 0) && share !== 0) return;
      const pasture = Math.max(0, demand * share);
      stripPastureDmiKg += pasture;
      if (!stripOnly) {
        dmiKg += pasture;
        if (grazing.some(isMine)) dmiDays += 1;
      }
    };

    if (!spans.identities.size) {
      for (const date of metricDates) {
        if (openDate && !eventOpenOn(decorated, date)) continue;
        addDemandOnly(date);
      }
      continue;
    }

    const overlapsKnownSpan = (date) => {
      const dayStart = localDayStartMs(date);
      const dayEnd = localDayEndMs(date);
      return spans.eventSpans.some(span => !span.unknown && span.dm != null
        && span.startMs < dayEnd && span.endMs > dayStart);
    };
    for (const date of metricDates) {
      if (openDate && !eventOpenOn(decorated, date)) continue;
      const hay = f1MeasuredHayOnEventDay({ ...hayArgs, date });
      if (hay.kind === 'unknown') {
        // OI-0256 Mt1: no_pasture-only at this location stays known Pasture 0, not F1 sticky.
        const grazingHere = grazingPaddockWindowsOnDate(paddockWindows, { eventId, date })
          .some(isMine);
        if (grazingHere) dmiHayUnknown = true;
        addDemandOnly(date, { stripOnly: true });
        continue;
      }
      if (hay.kind === 'none' && !overlapsKnownSpan(date)) {
        addDemandOnly(date);
      }
    }

    for (const span of spans.eventSpans) {
      if (span.unknown || span.dm == null) continue;
      const alloc = prorateSpanHayByDemand({
        hayDm: span.dm,
        spanStartMs: span.startMs,
        spanEndMs: span.endMs,
        dates: metricDates,
        eventId,
        paddockWindows,
        demandByDate,
        locationsById,
      });
      for (const [pwId, pasture] of alloc.pastureByPw) {
        const pw = alloc.pwById.get(pwId);
        if (!pw || !isMine(pw)) continue;
        dmiKg += pasture;
        stripPastureDmiKg += pasture;
        storedFeedDmiKg += alloc.hayByPw.get(pwId) || 0;
        dmiDays += 1;
      }
    }
  }

  // R1: residual-feed NPK on this location (close readings), does not change DMI/AUDs
  const residual = residualFeedNpkForLocation(location.id, {
    windowStart,
    windowEnd: through,
    events,
    feedChecks,
    feedCheckItems,
    batches,
    feedTypes,
    batchNutritionalProfiles,
  });
  // OI-0276: always add what is known; skipped residual (no % / weight / DM)
  // adds 0 and never blanks manure NPK. R1 season-sticky unknown retired.
  nKg += residual.nKg;
  pKg += residual.pKg;
  kKg += residual.kKg;

  // Avg pasture score from observations in window (forageQuality 1–100)
  const scores = (observations || [])
    .filter(o => o.locationId === location.id
      && o.forageQuality != null
      && Number.isFinite(Number(o.forageQuality))
      && (!o.observedAt || (o.observedAt.slice(0, 10) >= windowStart && o.observedAt.slice(0, 10) <= windowEnd)))
    .map(o => Number(o.forageQuality));
  const scorePool = scores.length
    ? scores
    : (observations || [])
      .filter(o => o.locationId === location.id && o.forageQuality != null && Number.isFinite(Number(o.forageQuality)))
      .map(o => Number(o.forageQuality));
  const avgScore = scorePool.length
    ? scorePool.reduce((s, v) => s + v, 0) / scorePool.length
    : null;

  const ha = areaHaOf(location);
  // Zp (weights): sum known slices; dash only when nothing known remains; never-present = 0.
  // F1 hay unknown stays season-sticky (OI-0246 lock). OI-0276: R1 residual
  // unknown no longer blanks NPK (skipped residual adds 0, hover note only).
  const dmiHasKnown = dmiKnownSlices > 0;
  const dmiHasUnknown = dmiUnknownSlices > 0;
  const dmiPartial = dmiHasKnown && dmiHasUnknown;
  const dmiUnknown = dmiHayUnknown || (dmiHasUnknown && !dmiHasKnown);
  const finalDmi = dmiUnknown ? null : dmiKg;
  const dmiKnown = !dmiUnknown && (dmiHasKnown || dmiDays > 0 || !anyDemandDay || finalDmi === 0);
  const npkHasKnown = npkKnownSlices > 0;
  const npkHasUnknown = npkUnknownSlices > 0;
  const npkPartial = npkHasKnown && npkHasUnknown;
  const npkKnown = npkHasKnown || !npkHasUnknown;
  // OI-0250 strip: Sz does not sticky-null on missing-DM; Pp partial = weight unknowns only.
  const stripDmiPartial = dmiHasKnown && dmiHasUnknown;
  const stripPastureUnknown = dmiHasUnknown && !dmiHasKnown;
  const finalStripPasture = stripPastureUnknown ? null : stripPastureDmiKg;

  return {
    locationId: location.id,
    locationName: location.name || '',
    areaHectares: location.areaHectares ?? null,
    hasArea: ha != null,
    dmiKg: finalDmi,
    dmiKnown: dmiKnown || finalDmi === 0,
    dmiPartial,
    auds,
    audsKnown: true,
    nKg: npkKnown ? nKg : null,
    pKg: npkKnown ? pKg : null,
    kKg: npkKnown ? kKg : null,
    npkKnown,
    npkPartial,
    residualNpkSkippedNoPct: residual.skippedNoPct,
    residualNpkSkippedNoWeightDm: residual.skippedNoWeightDm,
    avgScore,
    scoreKnown: avgScore != null,
    storedFeedDmiKg,
    stripPastureDmiKg: finalStripPasture,
    stripDmiPartial,
    dmiBasisNote: dmiBasisNote(demandRowsUsed),
    eventCount: eventIds.size,
    dmiPerHa: ha != null && finalDmi != null ? finalDmi / ha : null,
    audsPerHa: ha != null ? auds / ha : null,
    nPerHa: ha != null && npkKnown ? nKg / ha : null,
    pPerHa: ha != null && npkKnown ? pKg / ha : null,
    kPerHa: ha != null && npkKnown ? kKg / ha : null,
  };
}

/**
 * Build metric rows for all X1 locations.
 */
export function buildLocationMetricRows(locations, ctx) {
  return filterManagementLocations(locations).map(loc => computeLocationMetrics(loc, {
    ...ctx,
    locations,
  }));
}

/**
 * OI-0250 period-totals strip: sum Af visible location rows.
 * En pasture/stored/total; Nk separate N/P/K; Sz stored always numeric;
 * Pp partial only from unknown-weight (non-DM) slices.
 */
export function aggregatePeriodTotals(rows = []) {
  let pastureSum = 0;
  let storedSum = 0;
  let nSum = 0;
  let pSum = 0;
  let kSum = 0;
  let pastureKnown = false;
  let pastureNullLoc = false;
  let pasturePartial = false;
  let npkKnown = false;
  let npkNullLoc = false;
  let npkPartial = false;
  let residualNpkSkippedNoPct = 0;
  let residualNpkSkippedNoWeightDm = 0;
  const basisNotes = new Set();

  for (const r of rows || []) {
    if (r?.dmiBasisNote) basisNotes.add(r.dmiBasisNote);
    residualNpkSkippedNoPct += Number(r?.residualNpkSkippedNoPct) || 0;
    residualNpkSkippedNoWeightDm += Number(r?.residualNpkSkippedNoWeightDm) || 0;
    const stored = Number(r?.storedFeedDmiKg);
    storedSum += Number.isFinite(stored) ? stored : 0;

    if (r?.stripPastureDmiKg != null && Number.isFinite(Number(r.stripPastureDmiKg))) {
      pastureSum += Number(r.stripPastureDmiKg);
      pastureKnown = true;
    } else if (r && r.stripPastureDmiKg == null) {
      pastureNullLoc = true;
    }
    if (r?.stripDmiPartial) pasturePartial = true;

    if (r?.npkKnown && r?.nKg != null && Number.isFinite(Number(r.nKg))) {
      nSum += Number(r.nKg);
      pSum += Number.isFinite(Number(r.pKg)) ? Number(r.pKg) : 0;
      kSum += Number.isFinite(Number(r.kKg)) ? Number(r.kKg) : 0;
      npkKnown = true;
    } else if (r && r.npkKnown === false) {
      npkNullLoc = true;
    }
    if (r?.npkPartial) npkPartial = true;
  }

  // Idle never-present locs contribute stripPastureDmiKg/NPK 0 (Z1), which must not
  // poison farm Period totals when every grazed loc is unknown (F1-null): show — not 0.
  const pastureIdlePoison = pastureSum === 0 && pastureNullLoc;
  const pastureDmiKg = pastureKnown && !pastureIdlePoison ? pastureSum : null;
  const totalDmiKg = pastureDmiKg != null ? pastureDmiKg + storedSum : null;
  const dmiPartial = Boolean(pastureKnown && !pastureIdlePoison && (pasturePartial || pastureNullLoc));
  const npkIdlePoison = nSum === 0 && pSum === 0 && kSum === 0 && npkNullLoc;
  const nKg = npkKnown && !npkIdlePoison ? nSum : null;
  const pKg = npkKnown && !npkIdlePoison ? pSum : null;
  const kKg = npkKnown && !npkIdlePoison ? kSum : null;

  return {
    pastureDmiKg,
    storedFeedDmiKg: storedSum,
    totalDmiKg,
    dmiPartial,
    nKg,
    pKg,
    kKg,
    npkKnown,
    npkPartial: Boolean(npkKnown && !npkIdlePoison && (npkPartial || npkNullLoc)),
    residualNpkSkippedNoPct,
    residualNpkSkippedNoWeightDm,
    // OI-0279: per-location fallback notes (a group may appear at several locations).
    dmiBasisNote: basisNotes.size ? [...basisNotes].join('; ') : null,
  };
}

/** Format helper: null/unknown → em dash. */
export function formatMetricValue(value, { digits = 0, suffix = '' } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
  return suffix ? `${text}${suffix}` : text;
}

