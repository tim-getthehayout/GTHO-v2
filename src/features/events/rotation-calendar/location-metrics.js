/**
 * @file Location management metrics over a date window (compute-on-read).
 * AGREED: W1 window, M0 DMI/AUDs/NPK/score, A1 totals+per-acre, N1 separate N/P/K,
 * X1 pasture + mixed-use only. Unknowns are null (UI shows "—"), never silent 0.
 */

import { getCalcByName } from '../../../utils/calc-registry.js';
import { daysBetweenInclusive, getLocalTodayStr } from '../../../utils/date-utils.js';
import {
  getLiveWindowHeadCount,
  getLiveWindowAvgWeight,
  hasUnknownLiveWindowWeights,
  groupWindowsDailyDemand,
} from '../../../calcs/window-helpers.js';
import { groupWindowPresenceDays } from '../../../calcs/partial-day-demand.js';
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

function clipPresenceDays(gw, { eventStartDate, eventDateOut, eventTimeOut, windowStart, windowEnd, throughDate }) {
  const full = groupWindowPresenceDays(gw, {
    eventStartDate,
    eventDateOut,
    eventTimeOut,
    throughDate,
  });
  if (!(full > 0) || !eventStartDate) return 0;
  const gwStart = gw.dateJoined || eventStartDate;
  const gwEnd = gw.dateLeft || eventDateOut || throughDate;
  const overlapStart = [gwStart, windowStart].filter(Boolean).sort().pop();
  const overlapEnd = [gwEnd, windowEnd].filter(Boolean).sort()[0];
  if (!overlapStart || !overlapEnd || overlapEnd < overlapStart) return 0;
  const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
  const span = daysBetweenInclusive(gwStart, gwEnd);
  if (!(span > 0)) return 0;
  return full * (overlapDays / span);
}

function effectiveAreaHa(pw, locationsById) {
  const loc = locationsById.get(pw.locationId);
  const ha = Number(loc?.areaHectares);
  const pct = Number(pw.areaPct);
  const area = Number.isFinite(ha) && ha > 0 ? ha : 0;
  const frac = Number.isFinite(pct) && pct > 0 ? pct / 100 : 1;
  return area * frac;
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

/**
 * Compute management metrics for one location over [windowStart, windowEnd].
 * Returns totals; per-acre fields are null when acres unknown.
 * DMI/score use null for unknown (never silent 0 when data is missing).
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
  let npkUnknown = false;
  let dmiKg = 0;
  let dmiDays = 0;
  let dmiUnknown = false;
  let anyDemandDay = false;

  // AUDs + NPK: walk events that touched this location in the window
  const eventIdsTouched = new Set(locPws.map(pw => pw.eventId));
  for (const eventId of eventIdsTouched) {
    const event = (events || []).find(e => e.id === eventId);
    if (!event) continue;
    const eventStart = deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }) || event.dateIn;
    if (!eventStart) continue;

    const eventPws = (paddockWindows || []).filter(pw => pw.eventId === eventId);
    const myPws = eventPws.filter(pw => pw.locationId === location.id);
    const clipped = myPws
      .map(pw => ({ pw, clip: clipWindowToRange(pw, event, windowStart, windowEnd, today, { paddockWindows, groupWindows }) }))
      .filter(x => x.clip);
    if (!clipped.length) continue;

    eventIds.add(eventId);
    const gws = (groupWindows || []).filter(gw => gw.eventId === eventId);
    const shareDenom = Math.max(1, eventPws.length);
    // Prefer area-weighted share when acres known on any open window
    let areaWeights = eventPws.map(pw => effectiveAreaHa(pw, locationsById));
    const areaSum = areaWeights.reduce((s, a) => s + a, 0);
    const myArea = myPws.reduce((s, pw) => s + effectiveAreaHa(pw, locationsById), 0);
    const share = areaSum > 0 ? myArea / areaSum : (myPws.length / shareDenom);

    for (const gw of gws) {
      const now = gw.dateLeft || event.dateOut || today;
      const liveHead = getLiveWindowHeadCount(gw, { memberships, animals, now });
      const liveAvg = getLiveWindowAvgWeight(gw, {
        memberships, animals, animalClasses, animalWeightRecords, now,
      });
      const days = clipPresenceDays(gw, {
        eventStartDate: eventStart,
        eventDateOut: event.dateOut,
        eventTimeOut: event.timeOut,
        windowStart,
        windowEnd,
        throughDate: today,
      });
      if (!(days > 0) || !(liveHead > 0)) continue;

      if (hasUnknownLiveWindowWeights(gw, {
        memberships, animals, animalClasses, animalWeightRecords, now,
      })) {
        npkUnknown = true;
      }

      const au = aniAu
        ? aniAu.fn({ headCount: liveHead, avgWeightKg: liveAvg || 0 })
        : (liveHead * (liveAvg || 0)) / 453.6;
      const eventAuds = aniAud ? aniAud.fn({ au, days }) : au * days;
      auds += eventAuds * share;

      const cls = (animalClasses || []).find(ac => ac.id === gw.animalClassId) || null;
      if (npk1 && liveAvg > 0) {
        const r = npk1.fn({
          headCount: liveHead,
          avgWeightKg: liveAvg,
          days,
          excretionNRate: cls?.excretionNRate ?? DEFAULT_EXC.n,
          excretionPRate: cls?.excretionPRate ?? DEFAULT_EXC.p,
          excretionKRate: cls?.excretionKRate ?? DEFAULT_EXC.k,
        });
        nKg += (r.nKg ?? 0) * share;
        pKg += (r.pKg ?? 0) * share;
        kKg += (r.kKg ?? 0) * share;
      } else if (liveHead > 0 && !(liveAvg > 0)) {
        npkUnknown = true;
      }
    }
  }

  // Implied pasture DMI: presence-weighted share of daily demand − stored, days loc open
  const classMap = Array.isArray(animalClasses)
    ? Object.fromEntries((animalClasses || []).map(c => [c.id, c]))
    : (animalClasses || {});
  const demandOpts = {
    groupWindows,
    memberships,
    animals,
    animalClasses: classMap,
    animalWeightRecords,
    events,
    groups: [],
  };
  const feedByEventDate = indexFeedDmByEventDate(feedEntries || []);

  for (const date of eachDateInclusive(windowStart, windowEnd > today ? today : windowEnd)) {
    const openHere = openPaddockWindowsOnDate(locPws, { date });
    if (!openHere.length) continue;
    anyDemandDay = true;

    const rows = groupWindowsDailyDemand(date, demandOpts);
    if (!rows.length) continue;

    // Unknown weights on any contributing row → DMI unknown for the whole location day
    if (rows.some(row => {
      if (!(row.head > 0)) return false;
      return !(Number.isFinite(row.avgWeightKg) && row.avgWeightKg > 0);
    })) {
      dmiUnknown = true;
      continue;
    }

    for (const pw of openHere) {
      const eventRows = rows.filter(r => r.eventId === pw.eventId && r.kg > 0);
      const demand = eventRows.reduce((s, r) => s + r.kg, 0);
      if (!(demand > 0)) continue;

      const eventOpen = openPaddockWindowsOnDate(paddockWindows, { eventId: pw.eventId, date });
      const weights = eventOpen.map(w => effectiveAreaHa(w, locationsById));
      const sumW = weights.reduce((s, a) => s + a, 0);
      const myW = effectiveAreaHa(pw, locationsById);
      const share = sumW > 0 ? myW / sumW : (1 / Math.max(1, eventOpen.length));

      const stored = feedByEventDate.get(`${pw.eventId}|${date}`) || 0;
      const pasture = Math.max(0, demand - stored) * share;
      dmiKg += pasture;
      dmiDays += 1;
    }
  }

  // Avg pasture score from observations in window (forageQuality 1–100)
  const scores = (observations || [])
    .filter(o => o.locationId === location.id
      && o.forageQuality != null
      && Number.isFinite(Number(o.forageQuality))
      && (!o.observedAt || (o.observedAt.slice(0, 10) >= windowStart && o.observedAt.slice(0, 10) <= windowEnd)))
    .map(o => Number(o.forageQuality));
  // If none in window, fall back to all-time average for this location (still compute-on-read)
  const scorePool = scores.length
    ? scores
    : (observations || [])
      .filter(o => o.locationId === location.id && o.forageQuality != null && Number.isFinite(Number(o.forageQuality)))
      .map(o => Number(o.forageQuality));
  const avgScore = scorePool.length
    ? scorePool.reduce((s, v) => s + v, 0) / scorePool.length
    : null;

  const acres = acresOf(location);
  const dmiKnown = !dmiUnknown && (dmiDays > 0 || !anyDemandDay);
  // When never open in window: DMI is known 0 (no presence), not unknown
  const finalDmi = dmiUnknown ? null : dmiKg;
  const finalAuds = auds;
  const npkKnown = !npkUnknown;

  return {
    locationId: location.id,
    locationName: location.name || '',
    areaHectares: location.areaHectares ?? null,
    areaAcres: acres,
    hasAcres: acres != null,
    dmiKg: finalDmi,
    dmiKnown: dmiKnown || finalDmi === 0,
    auds: finalAuds,
    audsKnown: true,
    nKg: npkKnown ? nKg : null,
    pKg: npkKnown ? pKg : null,
    kKg: npkKnown ? kKg : null,
    npkKnown,
    avgScore,
    scoreKnown: avgScore != null,
    eventCount: eventIds.size,
    dmiPerAcre: acres != null && finalDmi != null ? finalDmi / acres : null,
    audsPerAcre: acres != null ? finalAuds / acres : null,
    nPerAcre: acres != null && npkKnown ? nKg / acres : null,
    pPerAcre: acres != null && npkKnown ? pKg / acres : null,
    kPerAcre: acres != null && npkKnown ? kKg / acres : null,
  };
}

function acresOf(location) {
  const ha = Number(location?.areaHectares);
  if (!Number.isFinite(ha) || ha <= 0) return null;
  return ha * HA_TO_ACRES;
}

/** Stored DM kg by eventId|date from feed-entry snapshots (quantity × weight × dm%). */
function indexFeedDmByEventDate(feedEntries) {
  const map = new Map();
  for (const fe of feedEntries) {
    if (!fe?.eventId || !fe?.date) continue;
    // Same formula as feed-run-rate / Event Detail: entry snapshots only (no fe.dmKg).
    const quantity = Number(fe.quantity);
    const weight = Number(fe.weightPerUnitKgSnapshot);
    const dmPct = Number(fe.dmPctSnapshot);
    if (!(Number.isFinite(quantity) && quantity > 0)) continue;
    if (!(Number.isFinite(weight) && weight > 0)) continue;
    if (!(Number.isFinite(dmPct) && dmPct > 0)) continue;
    const dm = quantity * weight * dmPct / 100;
    const key = `${fe.eventId}|${fe.date}`;
    map.set(key, (map.get(key) || 0) + dm);
  }
  return map;
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

/** Format helper: null/unknown → em dash. */
export function formatMetricValue(value, { digits = 0, suffix = '' } = {}) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  const text = digits === 0 ? String(Math.round(n)) : n.toFixed(digits);
  return suffix ? `${text}${suffix}` : text;
}
