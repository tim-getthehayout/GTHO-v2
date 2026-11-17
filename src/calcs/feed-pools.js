/** Event feed is keyed by event, physical location and type, never original lot.
 * Pure replay: no writes, backfill, clock reads or mutable defaults for new rows. */
import { rowInstant } from '../utils/date-utils.js';
import { foldFeedUnit, POOL_COUNT_UNITS } from '../utils/feed-units.js';
export const poolKey = row => `${row.eventId}|${row.locationId}|${row.feedTypeId}`;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validWeight = value => finite(value) && value > 0;
const validDm = value => finite(value) && value >= 0 && value <= 100;
const mapOf = rows => Array.isArray(rows) ? Object.fromEntries(rows.map(row => [row.id, row])) : rows || {};

export function feedSnapshot(row, batches) {
  const batch = mapOf(batches)[row.batchId];
  const modern = !!(row.kind || row.feedTypeId);
  return {
    feedTypeId: modern ? row.feedTypeId : batch?.feedTypeId,
    // Fold on read: legacy spellings (e.g. `Bale`) count as their canonical unit; history is not rewritten.
    unit: foldFeedUnit(modern ? row.unitSnapshot : batch?.unit),
    weight: modern ? row.weightPerUnitKgSnapshot : batch?.weightPerUnitKg,
    dmPct: modern ? row.dmPctSnapshot : batch?.dmPct,
  };
}
function mass(quantity, snap) {
  // A confirmed empty observation has known zero masses without a conversion.
  if (quantity === 0) return { m: 0, d: 0 };
  const m = validWeight(snap.weight) ? quantity * snap.weight : null;
  return { m, d: m != null && validDm(snap.dmPct) ? m * snap.dmPct / 100 : null };
}
function empty(identity) { return { ...identity, q: 0, m: 0, d: 0, unit: null, massBased: false, estimate: false, lastCheck: null }; }
function add(pool, quantity, snap, feedTypes, sign = 1) {
  if (quantity === 0) return;
  const amount = mass(quantity, snap);
  const typeUnit = foldFeedUnit(feedTypes[snap.feedTypeId]?.unit);
  const verified = POOL_COUNT_UNITS.has(snap.unit) && (!typeUnit || typeUnit === snap.unit);
  const wasEmpty = pool.q === 0 && pool.m === 0;
  if (wasEmpty) Object.assign(pool, { unit: snap.unit, massBased: !verified, estimate: false });
  if (!verified || (pool.unit && pool.unit !== snap.unit)) pool.massBased = true;
  if (!wasEmpty && pool.q > 0 && pool.m != null && amount.m != null && Math.abs(pool.m / pool.q - snap.weight) > 1e-9) pool.estimate = true;
  const q = pool.massBased ? null : (pool.q ?? 0) + sign * quantity;
  pool.m = pool.m == null || amount.m == null ? null : pool.m + sign * amount.m;
  pool.d = pool.d == null || amount.d == null ? null : pool.d + sign * amount.d;
  pool.q = pool.massBased ? pool.m : q;
  if (pool.massBased) pool.unit = 'kg';
  if (pool.m != null && Math.abs(pool.m) < 1e-8) Object.assign(pool, { q: 0, m: 0, d: 0, unit: null, massBased: false, estimate: false });
}
export function poolConversion(pool) {
  if (!pool || pool.q == null || pool.q <= 0 || pool.m == null || pool.d == null || pool.m <= 0) return null;
  return { feedTypeId: pool.feedTypeId, unitSnapshot: pool.massBased ? 'kg' : pool.unit,
    weightPerUnitKgSnapshot: pool.massBased ? 1 : pool.m / pool.q, dmPctSnapshot: 100 * pool.d / pool.m };
}
export function poolReading(pool, quantity, unit = pool?.unit) {
  if (!pool) throw new Error('The selected feed pool is unavailable.');
  if (!finite(quantity) || quantity < 0) throw new Error('Pool quantity must be finite and nonnegative.');
  const conversion = poolConversion(pool);
  if (quantity > 0 && (!conversion || foldFeedUnit(unit) !== conversion.unitSnapshot)) throw new Error('A positive pool reading needs verified conversion and the displayed unit.');
  if (quantity > 0 && (pool.q == null || quantity > pool.q + 1e-8)) throw new Error('Pool quantity exceeds available feed.');
  return { feedTypeId: pool.feedTypeId, locationId: pool.locationId, batchId: null,
    unitSnapshot: conversion?.unitSnapshot ?? null, weightPerUnitKgSnapshot: conversion?.weightPerUnitKgSnapshot ?? null,
    dmPctSnapshot: conversion?.dmPctSnapshot ?? null, remainingQuantity: quantity };
}

/** Build contributions and independent per-pool anchors. Equal-time feedings
 * sort BEFORE checks: the observation captures them, never adds them twice. */
export function poolHistory({ eventId, entries = [], checks = [], items = [], batches = {}, feedTypes = {} }) {
  batches = mapOf(batches); feedTypes = mapOf(feedTypes);
  const records = [], identities = new Map();
  const identity = (row, snap) => ({ eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId });
  for (const row of entries.filter(row => row.eventId === eventId)) {
    const snap = feedSnapshot(row, batches); if (!snap.feedTypeId) continue;
    const id = identity(row, snap), key = poolKey(id); identities.set(key, id);
    records.push({ key, identity: id, stamp: rowInstant(row.date, row.time), order: 0, id: row.id || '', createdAt: row.createdAt || '', row, snap, quantity: Number(row.quantity), sign: row.entryType === 'removal' ? -1 : 1 });
  }
  for (const check of checks.filter(row => row.eventId === eventId)) {
    const groups = new Map();
    for (const row of items.filter(row => row.feedCheckId === check.id)) {
      const snap = feedSnapshot(row, batches); if (!snap.feedTypeId) continue;
      const id = identity(row, snap), key = poolKey(id); identities.set(key, id);
      if (!groups.has(key)) groups.set(key, { key, identity: id, stamp: rowInstant(check.date, check.time), order: 1, id: check.id, createdAt: check.createdAt || '', check, children: [] });
      groups.get(key).children.push({ row, snap, quantity: Number(row.remainingQuantity) });
    }
    records.push(...groups.values());
  }
  records.sort((a,b)=>a.stamp.localeCompare(b.stamp) || a.order-b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { records, identities, feedTypes };
}
export function replayFeedPools(input, { through = '9999-12-31T23:59:59', excludeCheckId = null } = {}) {
  const history = poolHistory(input), pools = new Map([...history.identities].map(([key,id])=>[key,empty(id)]));
  for (const record of history.records) {
    if (record.stamp > through || (record.order === 1 && record.id === excludeCheckId)) continue;
    const pool = pools.get(record.key);
    if (record.order === 0) add(pool, record.quantity, record.snap, history.feedTypes, record.sign);
    else {
      // A partial header replaces ONLY represented pools. Legacy batch children
      // are grouped for reading, never rewritten or deleted by replay.
      const anchor = empty(record.identity);
      for (const child of record.children) add(anchor, child.quantity, child.snap, history.feedTypes);
      // Mixed/unverified unit mode is sticky until an explicit empty reading.
      if (pool.massBased && anchor.m !== 0) Object.assign(anchor, { massBased: true, unit: 'kg', q: anchor.m });
      anchor.lastCheck = record.check;
      pools.set(record.key, anchor);
    }
  }
  return pools;
}

/** Local instant (ms) from a stored date + clock, built in the device's local
 * zone (the app's local-calendar convention). A missing clock is local
 * midnight, the same rule as `rowInstant`. */
export function localInstantMs(date, time) {
  const [y, m, d] = String(date).split('-').map(Number);
  const [hour, minute, seconds] = rowInstant(date, time).slice(11).split(':');
  const [second, fraction] = seconds.split('.');
  return new Date(y, m - 1, d, Number(hour), Number(minute), Number(second), Number(`0.${fraction}`) * 1000).getTime();
}

/** Shared elapsed-time day split for stored-feed intake between readings
 * (DMI-5 pool path and the older non-pool path). `readings` are instant-ordered
 * `{ date, time }`; interval i runs readings[i] → readings[i + 1]. Returns null
 * when `date` is not measured (no reading dated ≤ date, or none dated > date),
 * else `[{ index, share }]` so that intake(date) = Σ intake_i × share, where
 * share = real hours of the local day inside interval i ÷ the interval's real
 * hours (a fall-back day has 25 h, a spring-forward day 23 h). Zero-length
 * intervals contribute nothing. On the first reading's own date, the hours
 * before that reading take the first interval's hourly rate. */
export function elapsedDayShares(readings, date) {
  if (!readings.some(row => row.date <= date) || !readings.some(row => row.date > date)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const dayStart = new Date(y, m - 1, d).getTime(), dayEnd = new Date(y, m - 1, d + 1).getTime();
  const at = readings.map(row => localInstantMs(row.date, row.time));
  const shares = new Map();
  const put = (index, share) => { if (share > 0) shares.set(index, (shares.get(index) ?? 0) + share); };
  let first = -1;
  for (let i = 0; i + 1 < at.length; i += 1) {
    const span = at[i + 1] - at[i];
    if (!(span > 0)) continue;
    if (first < 0) first = i;
    put(i, (Math.min(dayEnd, at[i + 1]) - Math.max(dayStart, at[i])) / span);
  }
  if (first >= 0 && readings[0].date === date) put(first, (at[0] - dayStart) / (at[first + 1] - at[first]));
  return [...shares].map(([index, share]) => ({ index, share }));
}

/** Independent observations, keeping strict-after/inclusive endpoints. */
export function poolDailyActual(input, date) {
  return new Map([...poolDailyObservation(input, date)].map(([key, row]) => [key, row.dm]));
}

/** The same observation as poolDailyActual, plus the count-unit rate when every
 * anchor child and delivery in every interval overlapping the day is verified in
 * one count unit (`units`/`unit`; both null for mass-based or mixed intervals).
 * Each interval's intake is spread over local days by elapsed time
 * (`elapsedDayShares`); the measured-day predicate is unchanged. */
export function poolDailyObservation(input, date) {
  const history = poolHistory(input), result = new Map(), sticky = new Map();
  const massBasedThrough = (stamp, key) => {
    if (!sticky.has(stamp)) sticky.set(stamp, replayFeedPools(input, { through: stamp }));
    return !!sticky.get(stamp).get(key)?.massBased;
  };
  const dm = anchor => anchor.children.reduce((sum,child)=>{ const value=mass(child.quantity,child.snap).d; return sum == null || value == null ? null : sum+value; },0);
  const interval = (key, prev, next) => {
    const between = history.records.filter(row=>row.key===key && row.order===0 && row.stamp>prev.stamp && row.stamp<=next.stamp);
    let delivered=0;
    for (const row of between) { const d=mass(row.quantity,row.snap).d; delivered=delivered==null||d==null?null:delivered+row.sign*d; }
    const a=dm(prev),b=dm(next);
    const value = a==null||b==null||delivered==null?null:Math.max(0,a+delivered-b);
    // Count units only when every non-zero row agrees on one verified count unit.
    let unit = null, counted = true;
    const count = (quantity, snap) => {
      if (quantity === 0) return 0;
      const typeUnit = foldFeedUnit(history.feedTypes[snap.feedTypeId]?.unit);
      if (!POOL_COUNT_UNITS.has(snap.unit) || (typeUnit && typeUnit !== snap.unit) || (unit && unit !== snap.unit)) { counted = false; return 0; }
      unit = snap.unit; return quantity;
    };
    const qa = prev.children.reduce((sum,child)=>sum+count(child.quantity,child.snap),0);
    const qb = next.children.reduce((sum,child)=>sum+count(child.quantity,child.snap),0);
    const qd = between.reduce((sum,row)=>sum+row.sign*count(row.quantity,row.snap),0);
    // Replay's sticky mass mode (mixed units before this interval) also wins.
    if (counted && value != null && massBasedThrough(prev.stamp, key)) counted = false;
    const units = counted && value != null ? Math.max(0,qa+qd-qb) : null;
    return { dm: value, units, unit: units == null ? null : unit };
  };
  for (const [key] of history.identities) {
    const anchors = history.records.filter(row=>row.key===key && row.order===1);
    const shares = elapsedDayShares(anchors.map(row => ({ date: row.check.date, time: row.check.time })), date);
    if (!shares) continue;
    let value = 0, units = 0, unit = null, counted = true;
    for (const { index, share } of shares) {
      const part = interval(key, anchors[index], anchors[index + 1]);
      value = value == null || part.dm == null ? null : value + part.dm * share;
      if (part.units == null || (unit && part.unit && part.unit !== unit)) counted = false;
      else { unit = unit || part.unit; units += part.units * share; }
    }
    const rate = counted && value != null ? units : null;
    result.set(key,{ dm:value, units: rate, unit: rate == null ? null : unit });
  }
  return result;
}
