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
 */

import { getCalcByName } from '../../../utils/calc-registry.js';
import { daysBetweenInclusive, getLocalTodayStr, rowInstant } from '../../../utils/date-utils.js';
import {
  getLiveWindowHeadCount,
  getLiveWindowAvgWeight,
  groupWindowsDailyDemand,
  eventOpenOn,
} from '../../../calcs/window-helpers.js';
import {
  groupWindowPresenceDays,
  localDayStartMs,
  localDayEndMs,
  localHoursInDay,
} from '../../../calcs/partial-day-demand.js';
import { localInstantMs, poolDailyObservation, poolHistory, replayFeedPools, feedSnapshot } from '../../../calcs/feed-pools.js';
import { openPaddockWindowsOnDate } from '../../../calcs/location-type.js';
import { periodContaining, DEFAULT_BUDGET_PERIOD } from '../../../calcs/budget-period.js';

const HA_TO_ACRES = 2.47105;
const DEFAULT_EXC = { n: 0.145, p: 0.041, k: 0.136 };

/** Derive event start from passed-in windows (store-free for unit tests). */
export function deriveEventStartDate(eventId, { paddockWindows = [], groupWindows = [], event = null } = {}) {
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

/** X1: pasture + mixed-use land only. */
export function isManagementLocation(loc) {
  if (!loc || loc.archived) return false;
  if (loc.type !== 'land') return false;
  const use = loc.landUse || 'pasture';
  return use === 'pasture' || use === 'mixed-use';
}

/** Filter locations to X1 set. */
export function filterManagementLocations(locations = []) {
  return (locations || []).filter(isManagementLocation);
}

/** Default W1 window containing today (Oct 1 – Sep 30). */
export function defaultMetricWindow(today = getLocalTodayStr()) {
  return periodContaining(today, DEFAULT_BUDGET_PERIOD);
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

function acresOf(location) {
  const ha = Number(location?.areaHectares);
  if (!Number.isFinite(ha) || ha <= 0) return null;
  return ha * HA_TO_ACRES;
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
} = {}) {
  const batchMap = mapById(batches);
  const typeMap = mapById(feedTypes);
  const eventChecks = (feedChecks || []).filter(c => c.eventId === eventId);
  const checkIds = new Set(eventChecks.map(c => c.id));
  const items = (feedCheckItems || []).filter(i => checkIds.has(i.feedCheckId));
  const entries = (feedEntries || []).filter(e => e.eventId === eventId);
  const input = {
    eventId,
    entries,
    checks: eventChecks,
    items,
    batches: batchMap,
    feedTypes: typeMap,
  };
  const history = poolHistory(input);
  if (!history.identities.size) return { kind: 'none' };

  const observed = poolDailyObservation(input, date);
  const after = replayFeedPools(input, { through: rowInstant(date, '23:59:59.999') });
  let active = 0;
  let measured = 0;
  let dmKg = 0;
  let unknown = false;
  for (const key of history.identities.keys()) {
    const obs = observed.get(key);
    const pool = after.get(key);
    const holds = !!pool && (pool.m == null || pool.m !== 0 || (pool.q != null && pool.q !== 0));
    if (!obs && !holds) continue;
    active += 1;
    if (!obs || obs.dm == null) {
      if (obs) unknown = true;
      else if (holds) unknown = true;
      continue;
    }
    measured += 1;
    dmKg += obs.dm;
  }
  if (active === 0) return { kind: 'none' };
  if (unknown || measured !== active) return { kind: 'unknown' };
  return { kind: 'measured', dmKg };
}

/**
 * Residual-feed NPK (R1) left on `locationId` from close readings in the window.
 * Missing percent on a positive residual → unknown (null totals), not silent 0.
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
  let unknown = false;
  let any = false;

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
      any = true;
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
        unknown = true;
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
        unknown = true;
        continue;
      }
      nKg += dmMass * pct.n / 100;
      pKg += dmMass * pct.p / 100;
      kKg += dmMass * pct.k / 100;
    }
  }

  if (!any) return { nKg: 0, pKg: 0, kKg: 0, known: true };
  if (unknown) return { nKg: null, pKg: null, kKg: null, known: false };
  return { nKg, pKg, kKg, known: true };
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
  } = ctx;

  const empty = {
    locationId: location?.id,
    locationName: location?.name || '',
    areaHectares: location?.areaHectares ?? null,
    areaAcres: acresOf(location),
    hasAcres: acresOf(location) != null,
    dmiKg: null,
    dmiKnown: false,
    auds: 0,
    audsKnown: true,
    nKg: 0,
    pKg: 0,
    kKg: 0,
    npkKnown: true,
    avgScore: null,
    scoreKnown: false,
    dmiPartial: false,
    npkPartial: false,
    // OI-0250 strip fields (Sz): stored missing-DM → 0; strip pasture ignores F1 sticky
    storedFeedDmiKg: 0,
    stripPastureDmiKg: null,
    stripDmiPartial: false,
    eventCount: 0,
    dmiPerAcre: null,
    audsPerAcre: null,
    nPerAcre: null,
    pPerAcre: null,
    kPerAcre: null,
  };

  if (!location?.id || !windowStart || !windowEnd) return empty;

  const locationsById = new Map((locations || []).map(l => [l.id, l]));
  const locPws = (paddockWindows || []).filter(pw => pw.locationId === location.id);
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
  let npkResidualUnknown = false; // R1 sticky
  let dmiKg = 0;
  let dmiDays = 0;
  let dmiKnownSlices = 0;
  let dmiUnknownSlices = 0;
  let dmiHayUnknown = false; // F1 sticky (column only)
  let storedFeedDmiKg = 0; // OI-0250 Sz strip
  let stripPastureDmiKg = 0;
  let anyDemandDay = false;

  const classMap = Array.isArray(animalClasses)
    ? Object.fromEntries((animalClasses || []).map(c => [c.id, c]))
    : (animalClasses || {});
  const eventsForDemand = (events || []).map(event => ({
    id: event.id,
    dateIn: event.dateIn
      || deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }),
    dateOut: event.dateOut ?? null,
  })).filter(e => e.dateIn);
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
      const openMine = eventOpen.filter(pw => pw.locationId === location.id);
      if (!openMine.length) continue;

      eventIds.add(eventId);
      const share = acreShareForLocation(eventOpen, location.id, locationsById);
      if (!(share > 0)) continue;

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
        auds += dayAuds * share;

        const cls = (animalClasses || []).find(ac => ac.id === gw.animalClassId) || null;
        // OI-0249 Gg: keep known-weight groups; count missing-weight as unknown slices (Zp).
        if (npk1 && liveAvg > 0) {
          const r = npk1.fn({
            headCount: liveHead,
            avgWeightKg: liveAvg,
            days: frac,
            excretionNRate: cls?.excretionNRate ?? DEFAULT_EXC.n,
            excretionPRate: cls?.excretionPRate ?? DEFAULT_EXC.p,
            excretionKRate: cls?.excretionKRate ?? DEFAULT_EXC.k,
          });
          nKg += (r.nKg ?? 0) * share;
          pKg += (r.pKg ?? 0) * share;
          kKg += (r.kKg ?? 0) * share;
          npkKnownSlices += 1;
        } else if (liveHead > 0 && !(liveAvg > 0)) {
          npkUnknownSlices += 1;
        }
      }
    }

    // --- Implied pasture DMI (F1 measured hay; peer-scoped unknown weights) ---
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

    // Per event: demand − measured hay, floor 0, then S1 acre share (known groups only)
    const eventDemand = new Map();
    for (const r of knownRows) {
      if (!(r.kg > 0)) continue;
      eventDemand.set(r.eventId, (eventDemand.get(r.eventId) || 0) + r.kg);
    }

    let dayBlocked = false;
    const pastureByEvent = new Map();
    const storedSzByEvent = new Map();
    const pastureSzByEvent = new Map();
    for (const [eventId, demand] of eventDemand) {
      const hay = measuredHayOnEventDay({
        eventId,
        date,
        feedEntries,
        feedChecks,
        feedCheckItems,
        batches,
        feedTypes,
      });
      // OI-0250 Sz: missing-DM / unmeasured → 0 stored for the period strip (no invent).
      const storedSz = hay.kind === 'measured' ? hay.dmKg : 0;
      storedSzByEvent.set(eventId, storedSz);
      pastureSzByEvent.set(eventId, Math.max(0, demand - storedSz));
      if (hay.kind === 'unknown') {
        dayBlocked = true; // column F1 sticky; strip still uses Sz zeros above
        continue;
      }
      const stored = hay.kind === 'measured' ? hay.dmKg : 0;
      pastureByEvent.set(eventId, Math.max(0, demand - stored));
    }

    // Period-strip attribution (Sz) — runs even when column F1 is blocked.
    for (const pw of openHere) {
      if (!pastureSzByEvent.has(pw.eventId)) continue;
      const pastureSz = pastureSzByEvent.get(pw.eventId);
      const storedSz = storedSzByEvent.get(pw.eventId) || 0;
      const eventOpen = openPaddockWindowsOnDate(paddockWindows, { eventId: pw.eventId, date });
      const myW = effectiveAreaHa(pw, locationsById);
      const weights = eventOpen.map(w => effectiveAreaHa(w, locationsById));
      const sumW = weights.reduce((s, a) => s + a, 0);
      const pwShare = sumW > 0 ? myW / sumW : (1 / Math.max(1, eventOpen.length));
      stripPastureDmiKg += pastureSz * pwShare;
      storedFeedDmiKg += storedSz * pwShare;
    }

    if (dayBlocked) {
      dmiHayUnknown = true; // F1 unmeasured hay — season-sticky (list-parity); column only
      continue;
    }

    for (const pw of openHere) {
      const pasture = pastureByEvent.get(pw.eventId);
      if (!(pasture > 0) && pasture !== 0) continue;
      if (!(pasture >= 0)) continue;

      const eventOpen = openPaddockWindowsOnDate(paddockWindows, { eventId: pw.eventId, date });
      // Each open pw for this location gets its own share of the event remainder.
      // When multiple pws on same loc (strip), split by their effective area within the event.
      const myW = effectiveAreaHa(pw, locationsById);
      const weights = eventOpen.map(w => effectiveAreaHa(w, locationsById));
      const sumW = weights.reduce((s, a) => s + a, 0);
      const pwShare = sumW > 0 ? myW / sumW : (1 / Math.max(1, eventOpen.length));
      dmiKg += pasture * pwShare;
      dmiDays += 1;
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
  if (!residual.known) {
    npkResidualUnknown = true; // R1 — season-sticky (list-parity)
  } else {
    nKg += residual.nKg;
    pKg += residual.pKg;
    kKg += residual.kKg;
  }

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

  const acres = acresOf(location);
  // Zp (weights): sum known slices; dash only when nothing known remains; never-present = 0.
  // F1 hay unknown and R1 residual unknown stay season-sticky (OI-0246 locks).
  const dmiHasKnown = dmiKnownSlices > 0;
  const dmiHasUnknown = dmiUnknownSlices > 0;
  const dmiPartial = dmiHasKnown && dmiHasUnknown;
  const dmiUnknown = dmiHayUnknown || (dmiHasUnknown && !dmiHasKnown);
  const finalDmi = dmiUnknown ? null : dmiKg;
  const dmiKnown = !dmiUnknown && (dmiHasKnown || dmiDays > 0 || !anyDemandDay || finalDmi === 0);
  const npkHasKnown = npkKnownSlices > 0;
  const npkHasUnknown = npkUnknownSlices > 0;
  const npkPartial = npkHasKnown && npkHasUnknown;
  const npkKnown = !npkResidualUnknown && (npkHasKnown || !npkHasUnknown);
  // OI-0250 strip: Sz does not sticky-null on missing-DM; Pp partial = weight unknowns only.
  const stripDmiPartial = dmiHasKnown && dmiHasUnknown;
  const stripPastureUnknown = dmiHasUnknown && !dmiHasKnown;
  const finalStripPasture = stripPastureUnknown ? null : stripPastureDmiKg;

  return {
    locationId: location.id,
    locationName: location.name || '',
    areaHectares: location.areaHectares ?? null,
    areaAcres: acres,
    hasAcres: acres != null,
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
    avgScore,
    scoreKnown: avgScore != null,
    storedFeedDmiKg,
    stripPastureDmiKg: finalStripPasture,
    stripDmiPartial,
    eventCount: eventIds.size,
    dmiPerAcre: acres != null && finalDmi != null ? finalDmi / acres : null,
    audsPerAcre: acres != null ? auds / acres : null,
    nPerAcre: acres != null && npkKnown ? nKg / acres : null,
    pPerAcre: acres != null && npkKnown ? pKg / acres : null,
    kPerAcre: acres != null && npkKnown ? kKg / acres : null,
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

  for (const r of rows || []) {
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
  };
}

/** Format helper: null/unknown → em dash. */
export function formatMetricValue(value, { digits = 0, suffix = '' } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
  return suffix ? `${text}${suffix}` : text;
}

