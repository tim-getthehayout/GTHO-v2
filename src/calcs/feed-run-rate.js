/** @file Feed run rate from feed checks: a pure, store-free window aggregate
 * over the FA-26 pool replay. Shared by the Feed screen card and the stored
 * forage scorecard; callers gather rows and decorate event start dates.
 * See session_briefs/FEED_RUN_RATE_PROPOSAL_2026-11-17.md §2.
 */
import { registerCalc } from '../utils/calc-registry.js';
import { feedSnapshot, poolHistory, poolDailyObservation, replayFeedPools } from './feed-pools.js';
import { groupWindowsDailyDmiKg } from './window-helpers.js';
import { foldFeedUnit } from '../utils/feed-units.js';
import { rowInstant } from '../utils/date-utils.js';

export const RUN_RATE_WINDOWS = Object.freeze([7, 14, 30, 60]);
export const DEFAULT_RUN_RATE_DAYS = 30;
/** Fallback price for a round-bale batch with no recorded cost (stored forage budget D5). */
export const FALLBACK_COST_PER_BALE = 56;

const finite = value => typeof value === 'number' && Number.isFinite(value);
const mapOf = rows => Array.isArray(rows) ? Object.fromEntries(rows.map(row => [row.id, row])) : rows || {};
export function shiftDate(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Run-rate days follow group windows: the close day itself is not an open day.
const openOn = (event, date) => !!event.dateIn && event.dateIn <= date && (!event.dateOut || date < event.dateOut);
/** Count figures are shown only for bale-like units; ton/kg/lb pools add to DM only (decision D). */
export const RUN_RATE_COUNT_UNITS = Object.freeze(new Set(['bale', 'sq bale', 'bag']));
const countUnit = unit => (unit && RUN_RATE_COUNT_UNITS.has(unit) ? unit : null);
const holdsFeed = pool => !!pool && (pool.m == null || pool.m !== 0 || (pool.q != null && pool.q !== 0));
const addUnits = (target, unit, value) => { target[unit] = (target[unit] ?? 0) + value; };

/** Delivery-weighted $ per kg DM of the batches delivered into each pool of one event.
 * Unpriced pools (only batchless entries, or batches with no cost and no fallback) are absent. */
export function poolDmPrices({ eventId, entries = [], batches = {} }) {
  batches = mapOf(batches);
  const totals = new Map();
  for (const row of entries) {
    if (row.eventId !== eventId || row.entryType === 'removal' || !row.batchId) continue;
    if (row.kind && row.kind !== 'inventory_feeding') continue;
    const batch = batches[row.batchId]; if (!batch) continue;
    const snap = feedSnapshot(row, batches); if (!snap.feedTypeId) continue;
    const quantity = Number(row.quantity);
    if (!finite(quantity) || quantity <= 0 || !finite(snap.weight) || snap.weight <= 0 || !finite(snap.dmPct) || snap.dmPct <= 0) continue;
    const perUnit = finite(batch.costPerUnit) ? batch.costPerUnit
      : foldFeedUnit(batch.unit) === 'bale' ? FALLBACK_COST_PER_BALE : null;
    if (perUnit == null) continue;
    const key = `${eventId}|${row.locationId}|${snap.feedTypeId}`;
    const sum = totals.get(key) ?? { cost: 0, dm: 0 };
    sum.cost += quantity * perUnit; sum.dm += quantity * snap.weight * snap.dmPct / 100;
    totals.set(key, sum);
  }
  return new Map([...totals].filter(([, sum]) => sum.dm > 0).map(([key, sum]) => [key, sum.cost / sum.dm]));
}

function amountTotals() { return { dmKg: 0, units: {}, cost: 0, unpricedDmKg: 0 }; }
function addAmount(target, dm, units, unit, price) {
  target.dmKg += dm;
  if (units != null && countUnit(unit)) addUnits(target.units, unit, units);
  if (price == null) target.unpricedDmKg += dm; else target.cost += dm * price;
}
function finishCost(total) {
  const priced = total.dmKg - total.unpricedDmKg;
  return { ...total, cost: priced > 1e-9 || (total.dmKg === 0 && total.unpricedDmKg === 0) ? total.cost : null };
}

/**
 * Run rate for the trailing `days` ending `today` (inclusive), farm-wide.
 * `periodStart` (optional, YYYY-MM-DD) clips the window start, e.g. to a season.
 * Measured pool-day d: the pool's checks bracket d with earlier check ≤ d < later
 * check (poolDailyObservation on d, the poolDailyActual / DMI-8 convention).
 * Open event days run dateIn ≤ d < dateOut. A pool is active on d when it is
 * measured or still holds feed after replaying through the end of d.
 * Farm-measured day: at least one active pool and every active pool measured.
 */
export function computeFeedRunRate({ today, days = DEFAULT_RUN_RATE_DAYS, periodStart = null, events = [], entries = [], checks = [], items = [],
  batches = {}, feedTypes = {}, groupWindows = [], memberships = null, animals = [], animalWeightRecords = [], animalClasses = {} }) {
  let start = shiftDate(today, -(days - 1));
  if (periodStart && periodStart > start) start = periodStart > today ? today : periodStart;
  const dates = [];
  for (let date = start; date <= today; date = shiftDate(date, 1)) dates.push(date);
  const relevant = events.filter(event => event.dateIn && event.dateIn <= today && (!event.dateOut || event.dateOut >= start));
  const perDate = new Map(dates.map(date => [date, { active: 0, measured: 0, dmKg: 0, units: {}, unknown: false, rows: [] }]));
  const consumed = amountTotals();
  const residual = { ...amountTotals(), eventsClosed: 0, closesWithoutReading: 0, knownPools: 0 };
  const byEvent = [];

  // Per-event row subsets and id maps, built once (the day loop replays many times).
  const batchMap = mapOf(batches), typeMap = mapOf(feedTypes);
  const itemsByCheck = new Map();
  for (const row of items) { if (!itemsByCheck.has(row.feedCheckId)) itemsByCheck.set(row.feedCheckId, []); itemsByCheck.get(row.feedCheckId).push(row); }
  for (const event of relevant) {
    const eventChecks = checks.filter(row => row.eventId === event.id);
    const input = { eventId: event.id, entries: entries.filter(row => row.eventId === event.id), checks: eventChecks,
      items: eventChecks.flatMap(row => itemsByCheck.get(row.id) ?? []), batches: batchMap, feedTypes: typeMap };
    const history = poolHistory(input);
    const closed = !!event.dateOut && event.dateOut >= start && event.dateOut <= today;
    const eventConsumed = amountTotals();
    const row = { eventId: event.id, closed, consumed: eventConsumed, residual: null, closeWithoutReading: false };
    byEvent.push(row);
    if (closed) residual.eventsClosed += 1;
    if (!history.identities.size) { row.consumed = finishCost(eventConsumed); continue; }
    const prices = poolDmPrices(input);
    for (const date of dates) {
      if (!openOn(event, date)) continue;
      const observed = poolDailyObservation(input, date);
      const after = replayFeedPools(input, { through: rowInstant(date, '23:59:59.999') });
      const day = perDate.get(date);
      for (const key of history.identities.keys()) {
        const obs = observed.get(key);
        if (!obs && !holdsFeed(after.get(key))) continue;
        day.active += 1;
        if (!obs || obs.dm == null) { if (obs) day.unknown = true; continue; }
        day.measured += 1;
        day.dmKg += obs.dm;
        if (obs.units != null && countUnit(obs.unit)) addUnits(day.units, obs.unit, obs.units);
        const price = prices.get(key);
        addAmount(consumed, obs.dm, obs.units, obs.unit, price);
        addAmount(eventConsumed, obs.dm, obs.units, obs.unit, price);
      }
    }
    row.consumed = finishCost(eventConsumed);
    // Residual (left at close): events closed in the window, per pool after full replay.
    if (closed) {
      const eventResidual = { ...amountTotals(), knownPools: 0 };
      const final = replayFeedPools(input);
      const closeKeys = new Set(history.records.filter(rec => rec.order === 1 && rec.check.isCloseReading === true).map(rec => rec.key));
      for (const [key, pool] of final) {
        if (!closeKeys.has(key) || pool.d == null) { if (holdsFeed(pool) || closeKeys.has(key)) row.closeWithoutReading = true; continue; }
        const units = pool.massBased || !pool.unit ? null : pool.q;
        for (const target of [residual, eventResidual]) { addAmount(target, pool.d, units, pool.unit, prices.get(key)); target.knownPools += 1; }
      }
      if (row.closeWithoutReading) residual.closesWithoutReading += 1;
      row.residual = finishResidual(eventResidual, row.closeWithoutReading);
    }
  }

  const measuredDates = dates.filter(date => { const day = perDate.get(date); return day.active > 0 && day.measured === day.active && !day.unknown; });
  const measuredDays = measuredDates.length;
  const rate = { dmKgPerDay: null, unitsPerDay: {}, forecastDmKgPerDay: null, pctOfForecast: null };
  let measuredDm = 0;
  if (measuredDays) {
    let forecast = 0; const units = {};
    for (const date of measuredDates) {
      const day = perDate.get(date);
      measuredDm += day.dmKg;
      for (const [unit, value] of Object.entries(day.units)) addUnits(units, unit, value);
      forecast += groupWindowsDailyDmiKg(date, { groupWindows, memberships, animals, animalClasses, animalWeightRecords });
    }
    rate.dmKgPerDay = measuredDm / measuredDays;
    rate.unitsPerDay = Object.fromEntries(Object.entries(units).map(([unit, value]) => [unit, value / measuredDays]));
    rate.forecastDmKgPerDay = forecast / measuredDays;
    rate.pctOfForecast = rate.forecastDmKgPerDay > 0 ? rate.dmKgPerDay / rate.forecastDmKgPerDay * 100 : null;
  }
  return {
    days, windowDays: dates.length, start, end: today, measuredDays, lastMeasuredDate: measuredDates.at(-1) ?? null,
    hasChecks: checks.some(check => check.date >= start && check.date <= today && relevant.some(event => event.id === check.eventId)),
    rate,
    // includesPartialDays: consumed counts measured pool-days on days another pool was unmeasured.
    consumed: { ...finishCost(consumed), includesPartialDays: consumed.dmKg - measuredDm > 1e-6 },
    residual: finishResidual(residual, residual.closesWithoutReading > 0),
    byEvent,
  };
}

/** Residual with no known pool is unknown (null DM and $), never 0. A real 0-left reading stays 0. */
function finishResidual(total, anyUnknown) {
  const done = finishCost(total);
  if (total.knownPools === 0 && anyUnknown) return { ...done, dmKg: null, cost: null, unknown: true };
  return { ...done, unknown: false };
}

registerCalc({
  name: 'FED-6',
  category: 'feed',
  description: 'Feed run rate over a trailing window from feed checks: consumed and residual (left at close) in units, DM and $, plus stored DMI actual vs forecast',
  formula: 'rate = Σ pool daily actual (DMI-5 pool model) on farm-measured days ÷ measured days; residual = pool amount after full replay for events closed in the window, where a close reading covers the pool; $ = DM × delivery-weighted batch $/kg DM ($56/bale fallback)',
  source: 'session_briefs/FEED_RUN_RATE_PROPOSAL_2026-11-17.md §2',
  notes: 'Pure; no estimates fill unmeasured days. Forecast = group-window predicted DMI (shared with DMI-8) on the same measured days.',
  inputs: [
    { name: 'today', type: 'string', unit: 'YYYY-MM-DD' },
    { name: 'days', type: 'number', unit: 'days (7, 14, 30 or 60)' },
    { name: 'periodStart', type: 'string', unit: 'YYYY-MM-DD (optional; clips the window start)' },
    { name: 'events', type: 'array', unit: '{ id, dateIn (derived start), dateOut }' },
    { name: 'entries / checks / items / batches / feedTypes', type: 'array', unit: 'feed pool replay rows' },
    { name: 'groupWindows / memberships / animals / animalWeightRecords / animalClasses', type: 'array', unit: 'DMI forecast rows' },
  ],
  output: { type: 'object', shape: '{ windowDays, measuredDays, lastMeasuredDate, hasChecks, rate, consumed, residual, byEvent }', unit: 'kg DM / units / $' },
  fn: computeFeedRunRate,
});
