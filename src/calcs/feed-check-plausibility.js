/** Implausible-intake check between consecutive pool readings. Pure: no DOM, writes or clock. */
import { registerCalc } from '../utils/calc-registry.js';
import { rowInstant } from '../utils/date-utils.js';
import { isConfinementLocation, openPaddockWindowsOnDate } from './location-type.js';
import { hasUnknownLiveWindowWeights, groupWindowsDailyDmiKg } from './window-helpers.js';
import { poolKey, poolHistory, replayFeedPools, poolDailyObservation, feedSnapshot } from './feed-pools.js';

const holdsFeed = pool => !!pool && (pool.m == null || pool.m !== 0 || (pool.q != null && pool.q !== 0));
const LOW_PCT = 50;
const HIGH_PCT = 400;
const MIN_HOURS = 12;

function locFrom(locations, locationId) {
  if (!locations) return null;
  if (typeof locations.get === 'function') return locations.get(locationId);
  if (Array.isArray(locations)) return locations.find(row => row.id === locationId) || null;
  return locations[locationId] || null;
}

function localDateFromMs(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function nextLocalDate(date) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return localDateFromMs(d.getTime());
}

function dayStartMs(date) {
  return new Date(`${date}T00:00:00`).getTime();
}

/** Call `fn(date, hours)` for each local day that intersects [fromMs, toMs). Hours are real elapsed time (DST). */
export function forEachIntervalDay(fromMs, toMs, fn) {
  if (!(toMs > fromMs)) return;
  let date = localDateFromMs(fromMs);
  const last = localDateFromMs(toMs - 1);
  while (date <= last) {
    const hours = Math.max(0, (Math.min(dayStartMs(nextLocalDate(date)), toMs) - Math.max(dayStartMs(date), fromMs)) / 3_600_000);
    if (hours > 0) fn(date, hours);
    date = nextLocalDate(date);
  }
}

function intervalPoint(anchor) {
  return { date: anchor.check.date, time: anchor.check.time || null, stamp: anchor.stamp };
}

function proposedKeys(poolInput, proposedCheck) {
  const keys = new Set();
  for (const row of poolInput.items || []) {
    if (row.feedCheckId !== proposedCheck.id) continue;
    const snap = feedSnapshot(row, poolInput.batches);
    if (!snap.feedTypeId) continue;
    keys.add(poolKey({ eventId: poolInput.eventId, locationId: row.locationId, feedTypeId: snap.feedTypeId }));
  }
  return keys;
}

function intervalIntakeDm(poolInput, key, prev, next) {
  const before = replayFeedPools(poolInput, { through: next.stamp, excludeCheckId: next.id }).get(key);
  const after = replayFeedPools({
    ...poolInput,
    entries: [],
    checks: [next.check],
    items: (poolInput.items || []).filter(row => row.feedCheckId === next.id),
  }).get(key);
  if (before?.d == null || after?.d == null) return null;
  return before.d - after.d;
}

function expectedDemand(fromMs, toMs, demand) {
  let weighted = 0, hours = 0, unknown = false, anyWindow = false;
  const groupWindows = demand.groupWindows || [];
  const classList = demand.animalClasses
    ? (Array.isArray(demand.animalClasses) ? demand.animalClasses : Object.values(demand.animalClasses))
    : null;
  forEachIntervalDay(fromMs, toMs, (date, h) => {
    const live = groupWindows.filter(gw => gw.dateJoined <= date && (!gw.dateLeft || gw.dateLeft > date));
    if (live.length) anyWindow = true;
    if (demand.memberships && live.some(gw => hasUnknownLiveWindowWeights(gw, {
      memberships: demand.memberships,
      animals: demand.animals,
      animalWeightRecords: demand.animalWeightRecords,
      animalClasses: classList,
      now: date,
    }))) unknown = true;
    weighted += groupWindowsDailyDmiKg(date, demand) * h;
    hours += h;
  });
  if (unknown || !anyWindow || !(hours > 0)) return { skip: true, expected: 0 };
  const expected = weighted / hours;
  if (!(expected > 0)) return { skip: true, expected };
  return { skip: false, expected };
}

function hasPastureInInterval(paddockWindows, locations, eventId, fromMs, toMs) {
  let pasture = false;
  forEachIntervalDay(fromMs, toMs, date => {
    const open = openPaddockWindowsOnDate(paddockWindows, { eventId, date });
    if (open.some(pw => !isConfinementLocation(locFrom(locations, pw.locationId)))) pasture = true;
  });
  return pasture;
}

function hasOtherActivePool(poolInput, excludeKey, fromMs, toMs) {
  const history = poolHistory(poolInput);
  let found = false;
  forEachIntervalDay(fromMs, toMs, date => {
    const observed = poolDailyObservation(poolInput, date);
    const after = replayFeedPools(poolInput, { through: rowInstant(date, '23:59:59.999') });
    for (const key of history.identities.keys()) {
      if (key === excludeKey) continue;
      const obs = observed.get(key);
      if (!obs && !holdsFeed(after.get(key))) continue;
      found = true;
    }
  });
  return found;
}

function evaluateInterval(poolInput, key, prev, next, ctx) {
  const fromMs = new Date(prev.stamp).getTime();
  const toMs = new Date(next.stamp).getTime();
  const elapsedHours = (toMs - fromMs) / 3_600_000;
  const impliedDm = intervalIntakeDm(poolInput, key, prev, next);
  if (impliedDm == null) return null;
  const elapsedDays = elapsedHours / 24;
  const impliedDmKgPerDay = elapsedDays > 0 ? impliedDm / elapsedDays : impliedDm;
  if (impliedDm < 0) {
    const demand = expectedDemand(fromMs, toMs, ctx.demand);
    return {
      poolKey: key,
      interval: { from: intervalPoint(prev), to: intervalPoint(next) },
      impliedDmKgPerDay,
      expectedDmKgPerDay: demand.expected,
      pct: demand.expected > 0 ? impliedDmKgPerDay / demand.expected * 100 : 0,
      kind: 'negative',
    };
  }
  if (!(elapsedHours >= MIN_HOURS)) return null;
  const demand = expectedDemand(fromMs, toMs, ctx.demand);
  if (demand.skip) return null;
  const pct = impliedDmKgPerDay / demand.expected * 100;
  const pasture = hasPastureInInterval(ctx.paddockWindows, ctx.locations, ctx.eventId, fromMs, toMs);
  const otherPools = hasOtherActivePool(poolInput, key, fromMs, toMs);
  const upperOnly = pasture || otherPools;
  let kind = null;
  if (pct > HIGH_PCT) kind = 'high';
  else if (!upperOnly && pct < LOW_PCT) kind = 'low';
  if (!kind) return null;
  return {
    poolKey: key,
    interval: { from: intervalPoint(prev), to: intervalPoint(next) },
    impliedDmKgPerDay,
    expectedDmKgPerDay: demand.expected,
    pct,
    kind,
  };
}

/**
 * Implied DM/day between neighbouring readings of the pools on `proposedCheck`,
 * compared with hour-weighted expected demand (`groupWindowsDailyDmiKg`).
 * @returns {Array<{ poolKey, interval, impliedDmKgPerDay, expectedDmKgPerDay, pct, kind }>}
 */
export function feedCheckPlausibility({
  poolInput,
  proposedCheck,
  event,
  paddockWindows = [],
  locations = {},
  groupWindows = [],
  memberships,
  animals = [],
  animalClasses = {},
  animalWeightRecords = [],
} = {}) {
  if (!poolInput || !proposedCheck) return [];
  const demand = { groupWindows, memberships, animals, animalClasses, animalWeightRecords };
  const ctx = {
    demand,
    paddockWindows,
    locations,
    eventId: event?.id || poolInput.eventId,
  };
  const history = poolHistory(poolInput);
  const warnings = [];
  for (const key of proposedKeys(poolInput, proposedCheck)) {
    const anchors = history.records.filter(row => row.key === key && row.order === 1);
    const index = anchors.findIndex(row => row.id === proposedCheck.id);
    if (index < 0) continue;
    const self = anchors[index];
    const prev = index > 0 ? anchors[index - 1] : null;
    const next = anchors[index + 1] || null;
    if (prev) {
      const warning = evaluateInterval(poolInput, key, prev, self, ctx);
      if (warning) warnings.push(warning);
    }
    if (next) {
      const warning = evaluateInterval(poolInput, key, self, next, ctx);
      if (warning) warnings.push(warning);
    }
  }
  return warnings;
}

registerCalc({
  name: 'FED-7',
  category: 'feed',
  description: 'Non-blocking check of implied stored-feed intake between consecutive pool readings against the event’s expected daily DMI',
  formula: 'impliedDmPerDay = (prevRemainingDm + Σ stored DM fed in (prev, new] − newRemainingDm) / (elapsedHours / 24); warn < 50% or > 400% of hour-weighted groupWindowsDailyDmiKg on a pure-confinement single-pool event, and > 400% only when pasture or another pool is active; skip first reading, < 12 h, and unknown or zero demand',
  source: 'session_briefs/FEED_CHECK_PLAUSIBILITY_2026-11-17.md §3.1',
  notes: 'Pure helper. Ledger preview builds the same proposed state as a pool-check write and calls this before commit. Does not change daily bar allocation.',
  inputs: [
    { name: 'poolInput', type: 'object', unit: 'eventId, entries, checks, items, batches, feedTypes' },
    { name: 'proposedCheck', type: 'object', unit: '{ id, date, time } already present in poolInput.checks' },
    { name: 'event / paddockWindows / locations', type: 'object', unit: 'pasture vs confinement during the interval' },
    { name: 'groupWindows / memberships / animals / animalClasses / animalWeightRecords', type: 'array', unit: 'expected demand (groupWindowsDailyDmiKg)' },
  ],
  output: { type: 'array', shape: '[{ poolKey, interval:{from,to}, impliedDmKgPerDay, expectedDmKgPerDay, pct, kind }]', unit: 'kg DM/day' },
  fn: feedCheckPlausibility,
});
