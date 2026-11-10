/** Event feed is keyed by event, physical location and type, never original lot.
 * Pure replay: no writes, backfill, clock reads or mutable defaults for new rows. */
import { rowInstant } from '../utils/date-utils.js';
export const poolKey = row => `${row.eventId}|${row.locationId}|${row.feedTypeId}`;
const canonicalUnits = new Set(['bale', 'kg', 'lb', 'ton']); // existing feed-type picker
const finite = value => typeof value === 'number' && Number.isFinite(value);
const validWeight = value => finite(value) && value > 0;
const validDm = value => finite(value) && value >= 0 && value <= 100;
const mapOf = rows => Array.isArray(rows) ? Object.fromEntries(rows.map(row => [row.id, row])) : rows || {};

export function feedSnapshot(row, batches) {
  const batch = mapOf(batches)[row.batchId];
  const modern = !!(row.kind || row.feedTypeId);
  return {
    feedTypeId: modern ? row.feedTypeId : batch?.feedTypeId,
    unit: modern ? row.unitSnapshot : batch?.unit,
    weight: modern ? row.weightPerUnitKgSnapshot : batch?.weightPerUnitKg,
    dmPct: modern ? row.dmPctSnapshot : batch?.dmPct,
  };
}
function mass(quantity, snap) {
  const m = validWeight(snap.weight) ? quantity * snap.weight : null;
  return { m, d: m != null && validDm(snap.dmPct) ? m * snap.dmPct / 100 : null };
}
function empty(identity) { return { ...identity, q: 0, m: 0, d: 0, unit: null, massBased: false, estimate: false, lastCheck: null }; }
function add(pool, quantity, snap, feedTypes, sign = 1) {
  if (quantity === 0) return;
  const amount = mass(quantity, snap);
  const verified = canonicalUnits.has(snap.unit) && (!feedTypes[snap.feedTypeId]?.unit || feedTypes[snap.feedTypeId].unit === snap.unit);
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
  if (quantity > 0 && (!conversion || unit !== conversion.unitSnapshot)) throw new Error('A positive pool reading needs verified conversion and the displayed unit.');
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

/** Independent linear observations, keeping strict-after/inclusive endpoints. */
export function poolDailyActual(input, date) {
  const history = poolHistory(input), result = new Map();
  for (const [key] of history.identities) {
    const anchors = history.records.filter(row=>row.key===key && row.order===1);
    const prev = anchors.filter(row=>row.check.date<=date).at(-1), next = anchors.find(row=>row.check.date>date);
    if (!prev || !next) continue;
    const dm = anchor => anchor.children.reduce((sum,child)=>{ const value=mass(child.quantity,child.snap).d; return sum == null || value == null ? null : sum+value; },0);
    let delivered=0;
    for (const row of history.records.filter(row=>row.key===key && row.order===0 && row.stamp>prev.stamp && row.stamp<=next.stamp)) { const d=mass(row.quantity,row.snap).d; delivered=delivered==null||d==null?null:delivered+row.sign*d; }
    const a=dm(prev),b=dm(next),days=Math.max(1,Math.round((new Date(next.check.date+'T00:00:00')-new Date(prev.check.date+'T00:00:00'))/86400000));
    result.set(key,a==null||b==null||delivered==null?null:Math.max(0,(a+delivered-b)/days));
  }
  return result;
}
