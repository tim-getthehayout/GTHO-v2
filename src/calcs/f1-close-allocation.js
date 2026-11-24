/** @file OI-0258 F1 close-allocation (Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0).
 * Pure compute-on-read. No SQL / no migration (D0). Sp-w is not implemented.
 *
 * Hay span boundaries stay feed checks (plus a virtual opening anchor so
 * opening carryover + physical deliveries + close is enough — Al1). Inside
 * each check-span, that span's hay is prorated by demand across overlapping
 * grazing (non-`no_pasture`) paddock windows (Sp-f, Mx-a). Pasture DMI for a
 * window = window demand in the span − hay share, floored at 0 (Pd1, L1).
 * Cv1 counts opening carryover once and ignores synthetic Move-wizard /
 * `sourceEventId` / `pool_carry` deliveries as net-new intake.
 */
import { feedSnapshot, poolKey, poolHistory, replayFeedPools, elapsedDayShares, localInstantMs } from './feed-pools.js';
import { rowInstant } from '../utils/date-utils.js';
import { openPaddockWindowsOnDate } from './location-type.js';
import { localDayStartMs, localDayEndMs } from './partial-day-demand.js';
import { passMemo, ref, metricsPassActive } from './metrics-memo.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);

function mapById(rows) {
  if (!rows) return {};
  if (!Array.isArray(rows)) return rows;
  return Object.fromEntries(rows.map(row => [row.id, row]));
}

function snapDm(quantity, snap) {
  if (quantity === 0) return 0;
  if (!finite(quantity)) return null;
  const weight = Number(snap.weight);
  const dmPct = Number(snap.dmPct);
  if (!(weight > 0) || !finite(dmPct) || dmPct < 0 || dmPct > 100) return null;
  return quantity * weight * dmPct / 100;
}

/** True when the entry is Move-wizard / pool carry that re-records opening capture (Cv1). */
export function isSyntheticCarryoverEntry(entry) {
  return !!(entry && (entry.sourceEventId || entry.kind === 'pool_carry'));
}

function carryoverDedupeKey(entry, snap) {
  if (entry.transferId) return `transfer:${entry.transferId}`;
  return [
    'synth',
    entry.sourceEventId || '',
    entry.locationId || '',
    snap.feedTypeId || '',
    String(entry.quantity),
    snap.unit || '',
    entry.date || '',
  ].join('|');
}

export function isGrazingPaddockWindow(pw) {
  return !!pw && !pw.noPasture && !pw.no_pasture;
}

export function grazingPaddockWindowsOnDate(paddockWindows, { eventId, date } = {}) {
  return openPaddockWindowsOnDate(paddockWindows, { eventId, date }).filter(isGrazingPaddockWindow);
}

function effectiveAreaHa(pw, locationsById) {
  const loc = locationsById instanceof Map ? locationsById.get(pw.locationId) : locationsById?.[pw.locationId];
  const ha = Number(loc?.areaHectares);
  const pct = Number(pw.areaPct);
  const area = Number.isFinite(ha) && ha > 0 ? ha : 0;
  const frac = Number.isFinite(pct) && pct > 0 ? pct / 100 : 1;
  return area * frac;
}

function compareStamp(a, b) {
  const stamp = (a.stamp || '').localeCompare(b.stamp || '');
  if (stamp) return stamp;
  const created = (a.createdAt || '').localeCompare(b.createdAt || '');
  if (created) return created;
  return String(a.id || '').localeCompare(String(b.id || ''));
}

/**
 * Per-pool hay spans for one event (Al1 + Mc1 + Cv1).
 * A span exists only between the virtual opening anchor and a later feed
 * check, or between two feed checks. Days after the last check stay unmeasured
 * (open events with no close stay unknown — do not invent an open-event rule).
 */
/** L1: pass-memo key for one event's hay inputs (identity of the row lists). */
function hayArgsKey(a = {}) {
  return `${a.eventId}|${a.openDate}|${a.openTime ?? null}|${ref(a.feedEntries)}|${ref(a.feedChecks)}|${ref(a.feedCheckItems)}|${ref(a.batches)}|${ref(a.feedTypes)}`;
}

export function f1HaySpans(args = {}) {
  return passMemo('f1HaySpans', metricsPassActive() ? hayArgsKey(args) : null, () => computeF1HaySpans(args));
}

function computeF1HaySpans({
  eventId,
  openDate,
  openTime = null,
  feedEntries = [],
  feedChecks = [],
  feedCheckItems = [],
  batches = {},
  feedTypes = {},
} = {}) {
  const batchMap = mapById(batches);
  const typeMap = mapById(feedTypes);
  const entries = (feedEntries || []).filter(row => row.eventId === eventId);
  const checks = (feedChecks || []).filter(row => row.eventId === eventId).slice().sort((a, b) => compareStamp({
    stamp: rowInstant(a.date, a.time), createdAt: a.createdAt, id: a.id,
  }, {
    stamp: rowInstant(b.date, b.time), createdAt: b.createdAt, id: b.id,
  }));
  const checkIds = new Set(checks.map(row => row.id));
  const items = (feedCheckItems || []).filter(row => checkIds.has(row.feedCheckId));
  const identities = new Map();
  const remember = (row, snap) => {
    if (!snap.feedTypeId) return;
    const id = { eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId };
    identities.set(poolKey(id), id);
  };
  for (const row of entries) remember(row, feedSnapshot(row, batchMap));
  for (const row of items) remember(row, feedSnapshot(row, batchMap));

  const empty = {
    identities, entries, checks, items, batches: batchMap, feedTypes: typeMap,
    opening: new Map(), poolSpans: [], eventSpans: [],
  };
  if (!openDate || !identities.size) return empty;

  const seenCarry = new Set();
  const opening = new Map();
  for (const row of entries.filter(isSyntheticCarryoverEntry)) {
    const snap = feedSnapshot(row, batchMap);
    if (!snap.feedTypeId) continue;
    const key = poolKey({ eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId });
    const dedupe = carryoverDedupeKey(row, snap);
    if (seenCarry.has(dedupe)) continue;
    seenCarry.add(dedupe);
    const qty = Number(row.quantity);
    const sign = row.entryType === 'removal' ? -1 : 1;
    const dm = snapDm(sign * (finite(qty) ? qty : NaN), snap);
    const cur = opening.get(key) || { dm: 0, unknown: false };
    if (dm == null) cur.unknown = true;
    else if (!cur.unknown) cur.dm += dm;
    opening.set(key, cur);
  }

  const openStamp = rowInstant(openDate, openTime);
  const openMs = localInstantMs(openDate, openTime);

  const remainingAtCheck = (check, key) => {
    const children = items.filter((row) => {
      if (row.feedCheckId !== check.id) return false;
      const snap = feedSnapshot(row, batchMap);
      return snap.feedTypeId && poolKey({ eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId }) === key;
    });
    if (!children.length) return null;
    let dm = 0;
    for (const child of children) {
      const value = snapDm(Number(child.remainingQuantity), feedSnapshot(child, batchMap));
      if (value == null) return { dm: null, unknown: true };
      dm += value;
    }
    return { dm, unknown: false };
  };

  const intervalIntake = (key, prev, next, inclusiveStart) => {
    let delivered = 0;
    for (const row of entries) {
      if (isSyntheticCarryoverEntry(row)) continue;
      const snap = feedSnapshot(row, batchMap);
      if (!snap.feedTypeId) continue;
      if (poolKey({ eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId }) !== key) continue;
      const stamp = rowInstant(row.date, row.time);
      const inSpan = inclusiveStart
        ? stamp >= prev.stamp && stamp <= next.stamp
        : stamp > prev.stamp && stamp <= next.stamp;
      if (!inSpan) continue;
      const qty = Number(row.quantity);
      const sign = row.entryType === 'removal' ? -1 : 1;
      const dm = snapDm(sign * (finite(qty) ? qty : NaN), snap);
      if (dm == null) return { dm: null, unknown: true };
      delivered += dm;
    }
    if (prev.unknown || next.unknown || prev.dm == null || next.dm == null) return { dm: null, unknown: true };
    return { dm: Math.max(0, prev.dm + delivered - next.dm), unknown: false };
  };

  const poolSpans = [];
  const readingsByKey = new Map();
  for (const [key] of identities) {
    const openRem = opening.get(key) || { dm: 0, unknown: false };
    const anchors = [{
      date: openDate, time: openTime, stamp: openStamp, ms: openMs,
      dm: openRem.dm, unknown: openRem.unknown, virtual: true,
    }];
    for (const check of checks) {
      const rem = remainingAtCheck(check, key);
      if (!rem) continue;
      anchors.push({
        date: check.date, time: check.time, stamp: rowInstant(check.date, check.time),
        ms: localInstantMs(check.date, check.time),
        dm: rem.dm, unknown: rem.unknown, virtual: false, check,
      });
    }
    readingsByKey.set(key, anchors);
    for (let i = 0; i + 1 < anchors.length; i += 1) {
      const part = intervalIntake(key, anchors[i], anchors[i + 1], anchors[i].virtual);
      poolSpans.push({
        key,
        startDate: anchors[i].date,
        startTime: anchors[i].time,
        endDate: anchors[i + 1].date,
        endTime: anchors[i + 1].time,
        startMs: anchors[i].ms,
        endMs: anchors[i + 1].ms,
        startStamp: anchors[i].stamp,
        endStamp: anchors[i + 1].stamp,
        dm: part.dm,
        unknown: part.unknown,
      });
    }
  }

  const eventSpans = mergePoolSpans(poolSpans);
  return {
    identities, entries, checks, items, batches: batchMap, feedTypes: typeMap,
    opening, poolSpans, eventSpans, readingsByKey,
    input: { eventId, entries, checks, items, batches: batchMap, feedTypes: typeMap },
  };
}

function mergePoolSpans(poolSpans) {
  const groups = new Map();
  for (const span of poolSpans) {
    const id = `${span.startStamp}|${span.endStamp}`;
    const cur = groups.get(id) || {
      startDate: span.startDate, startTime: span.startTime,
      endDate: span.endDate, endTime: span.endTime,
      startMs: span.startMs, endMs: span.endMs,
      startStamp: span.startStamp, endStamp: span.endStamp,
      dm: 0, unknown: false,
    };
    if (span.unknown || span.dm == null) cur.unknown = true;
    else if (!cur.unknown) cur.dm += span.dm;
    groups.set(id, cur);
  }
  return [...groups.values()].sort((a, b) => a.startStamp.localeCompare(b.startStamp) || a.endStamp.localeCompare(b.endStamp));
}

function poolHoldsOnDate(history, input, key, date) {
  const after = replayFeedPools(input, { through: rowInstant(date, '23:59:59.999') });
  const pool = after.get(key);
  return !!pool && (pool.m == null || pool.m !== 0 || (pool.q != null && pool.q !== 0));
}

/**
 * Measured hay status for one event on one date (F1 / Al1).
 * OI-0285 B: an `unknown` day carries `pendingCheck: true` when the only reason
 * is that a pool still holds feed past its latest reading (no feed check since —
 * nothing to measure yet). A span with a missing unit / DM stays plain unknown.
 * Callers that do not read `pendingCheck` see the same result as before.
 * @returns {{ kind: 'none' } | { kind: 'measured', dmKg: number } | { kind: 'unknown', pendingCheck: boolean }}
 */
export function f1MeasuredHayOnEventDay(args) {
  return passMemo('f1MeasuredHay', metricsPassActive() ? `${hayArgsKey(args)}|${args.date}` : null,
    () => computeF1MeasuredHayOnEventDay(args));
}

function computeF1MeasuredHayOnEventDay(args) {
  const { date } = args;
  const spans = f1HaySpans(args);
  if (!spans.identities.size) return { kind: 'none' };
  const history = poolHistory(spans.input);
  let dmKg = 0;
  let measured = 0;
  let active = 0;
  let unknown = false;
  let hardUnknown = false; // OI-0285 B: a missing unit / DM, not just "no check yet"
  for (const key of spans.identities.keys()) {
    const readings = (spans.readingsByKey.get(key) || []).map(row => ({ date: row.date, time: row.time }));
    const shares = elapsedDayShares(readings, date);
    const holds = poolHoldsOnDate(history, spans.input, key, date);
    if (!shares) {
      if (holds) unknown = true;
      continue;
    }
    active += 1;
    const poolSpans = spans.poolSpans.filter(span => span.key === key);
    let value = 0;
    let partUnknown = false;
    for (const { index, share } of shares) {
      // elapsedDayShares indexes intervals between the pool's readings, which
      // match poolSpans in the same order (virtual open + checks that include
      // this pool).
      const span = poolSpans[index];
      if (!span || span.unknown || span.dm == null) { partUnknown = true; break; }
      value += span.dm * share;
    }
    if (partUnknown) {
      unknown = true;
      hardUnknown = true;
      continue;
    }
    measured += 1;
    dmKg += value;
  }
  if (unknown) return { kind: 'unknown', pendingCheck: !hardUnknown };
  if (active === 0) return holdsAny(spans, date) ? { kind: 'unknown', pendingCheck: true } : { kind: 'none' };
  if (measured !== active) return { kind: 'unknown', pendingCheck: false };
  return { kind: 'measured', dmKg };
}

function holdsAny(spans, date) {
  const history = poolHistory(spans.input);
  for (const key of spans.identities.keys()) {
    if (poolHoldsOnDate(history, spans.input, key, date)) return true;
  }
  return false;
}

/**
 * Prorate one known check-span's hay by demand across grazing paddock windows
 * (Sp-f, Mx-a). `demandByDate` is that event's known-weight demand (kg) per
 * local date. Window demand uses the fraction of the local day inside the span.
 */
/** How event-level daily hay treats days whose only open windows are no_pasture.
 * Locations F1 does not set this; it keeps Mx-a (grazing windows only) via
 * `prorateSpanHayByDemand` without the option.
 * - 'span-fallback' (al1EventDayAllocation default): include those days only
 *   when the span has no grazing day (all-no_pasture / OI-0256 Mt1). Mixed
 *   spans keep hay on grazing days only (pending Tim).
 * - 'always': also spread hay onto no_pasture-only days in a mixed span.
 */
export const NO_PASTURE_ONLY_DAY_HAY_SPAN_FALLBACK = 'span-fallback';
export const NO_PASTURE_ONLY_DAY_HAY_ALWAYS = 'always';

export function prorateSpanHayByDemand({
  hayDm,
  spanStartMs,
  spanEndMs,
  dates = [],
  eventId,
  paddockWindows = [],
  demandByDate = new Map(),
  locationsById = new Map(),
  noPastureOnlyDayHay,
} = {}) {
  const demandByPw = new Map();
  const pwById = new Map();
  const demandByDateInSpan = new Map();
  const noPastureOnlyDates = new Set();
  const noPastureOnlyCandidates = [];
  for (const date of dates) {
    const dayStart = localDayStartMs(date);
    const dayEnd = localDayEndMs(date);
    const from = Math.max(dayStart, spanStartMs);
    const to = Math.min(dayEnd, spanEndMs);
    if (!(to > from)) continue;
    const dayHours = dayEnd - dayStart;
    if (!(dayHours > 0)) continue;
    const frac = (to - from) / dayHours;
    const demand = Number(demandByDate.get(date) || 0);
    const open = openPaddockWindowsOnDate(paddockWindows, { eventId, date });
    const grazing = open.filter(isGrazingPaddockWindow);
    const noPastureOnly = !grazing.length && open.some(pw => !isGrazingPaddockWindow(pw));
    if (!(demand > 0) || !(frac > 0)) continue;
    if (grazing.length) {
      demandByDateInSpan.set(date, demand * frac);
      const weights = grazing.map(pw => effectiveAreaHa(pw, locationsById));
      const sumW = weights.reduce((sum, value) => sum + value, 0);
      grazing.forEach((pw, i) => {
        const share = sumW > 0 ? weights[i] / sumW : 1 / grazing.length;
        demandByPw.set(pw.id, (demandByPw.get(pw.id) || 0) + demand * share * frac);
        pwById.set(pw.id, pw);
      });
    } else if (noPastureOnly) {
      noPastureOnlyCandidates.push({ date, dateDemand: demand * frac });
    }
  }
  // Event-chart option (OI-0260). Unset = F1/Mx-a: grazing days only.
  const includeNoPastureOnly = noPastureOnlyDayHay === NO_PASTURE_ONLY_DAY_HAY_ALWAYS
    || (noPastureOnlyDayHay === NO_PASTURE_ONLY_DAY_HAY_SPAN_FALLBACK && demandByDateInSpan.size === 0);
  if (includeNoPastureOnly) {
    for (const { date, dateDemand } of noPastureOnlyCandidates) {
      demandByDateInSpan.set(date, dateDemand);
      noPastureOnlyDates.add(date);
    }
  }
  const totalDemand = [...demandByPw.values()].reduce((sum, value) => sum + value, 0);
  const dateDemandTotal = [...demandByDateInSpan.values()].reduce((sum, value) => sum + value, 0);
  const hayByPw = new Map();
  const pastureByPw = new Map();
  const hayByDate = new Map();
  const pastureByDate = new Map();
  const knownHay = finite(hayDm) ? hayDm : 0;
  for (const [pwId, demand] of demandByPw) {
    const hayShare = totalDemand > 0 ? knownHay * (demand / totalDemand) : 0;
    hayByPw.set(pwId, hayShare);
    pastureByPw.set(pwId, Math.max(0, demand - hayShare));
  }
  // Event-level daily rollup. When no_pasture-only days are included, use
  // dateDemandTotal so hayByDate still sums to the span; hayByPw stays Mx-a.
  const dateTotal = dateDemandTotal > 0 ? dateDemandTotal : totalDemand;
  for (const [date, dateDemand] of demandByDateInSpan) {
    const hay = dateTotal > 0 ? knownHay * (dateDemand / dateTotal) : 0;
    hayByDate.set(date, hay);
    // Mt1: no_pasture-only days are 100% stored; leftover demand is not pasture.
    pastureByDate.set(date, noPastureOnlyDates.has(date) ? 0 : Math.max(0, dateDemand - hay));
  }
  // OI-0280: `demandByDate` = each counted day's in-span need (same keys as
  // hayByDate / pastureByDate) — read-only extra, no allocation change.
  return {
    demandByPw, hayByPw, pastureByPw, pwById, totalDemand, hayByDate, pastureByDate, dateDemandTotal,
    demandByDate: demandByDateInSpan,
  };
}


/**
 * OI-0260: event-level daily hay/pasture from the same Al1+Cv1+Sp-f allocation
 * Locations F1 already uses. Kind follows f1MeasuredHayOnEventDay (measured /
 * unknown / none). Measured amounts are Sp-f demand proration (not a second
 * elapsed-time split). `noPastureOnlyDayHay` (default 'span-fallback') is the
 * event-chart switch for no_pasture-only days; Locations F1 does not pass it
 * and stays Mx-a. No SQL.
 */
export function al1EventDayAllocation({
  date,
  dates = [],
  hayArgs,
  demandByDate = new Map(),
  paddockWindows = [],
  locationsById = new Map(),
  noPastureOnlyDayHay = NO_PASTURE_ONLY_DAY_HAY_SPAN_FALLBACK,
} = {}) {
  const kindInfo = f1MeasuredHayOnEventDay({ ...hayArgs, date });
  if (kindInfo.kind !== 'measured') {
    return { kind: kindInfo.kind, storedDmiKg: null, pastureDmiKg: null };
  }
  const spans = f1HaySpans(hayArgs);
  const metricDates = dates.length ? dates : [date];
  let storedDmiKg = 0;
  let pastureDmiKg = 0;
  for (const span of spans.eventSpans) {
    if (span.unknown || span.dm == null) continue;
    const alloc = prorateSpanHayByDemand({
      hayDm: span.dm,
      spanStartMs: span.startMs,
      spanEndMs: span.endMs,
      dates: metricDates,
      eventId: hayArgs.eventId,
      paddockWindows,
      demandByDate,
      locationsById,
      noPastureOnlyDayHay,
    });
    storedDmiKg += alloc.hayByDate.get(date) || 0;
    pastureDmiKg += alloc.pastureByDate.get(date) || 0;
  }
  return { kind: 'measured', storedDmiKg, pastureDmiKg };
}

/** Acre (effective-area) share of `windows` belonging to `locationId` (Mx-a grazing set). */
export function acreShareAmong(windows, locationId, locationsById) {
  if (!windows.length) return 0;
  const weights = windows.map(pw => effectiveAreaHa(pw, locationsById));
  const sumW = weights.reduce((sum, value) => sum + value, 0);
  const mine = windows.filter(pw => pw.locationId === locationId);
  const myW = mine.reduce((sum, pw) => sum + effectiveAreaHa(pw, locationsById), 0);
  if (sumW > 0) return myW / sumW;
  return mine.length / Math.max(1, windows.length);
}
