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
const openOn = (event, date) => !!event.dateIn && event.dateIn <= date && (!event.dateOut || date <= event.dateOut);
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

function amountTotals() { return { dmKg: 0, units: {}, cost: 0, unpricedDmKg: 0, unknownDmKg: false }; }
function addAmount(target, dm, units, unit, price) {
  if (dm == null) { target.unknownDmKg = true; return; }
  target.dmKg += dm;
  if (units != null && unit) addUnits(target.units, unit, units);
  if (price == null) target.unpricedDmKg += dm; else target.cost += dm * price;
}
function finishCost(total) {
  const priced = total.dmKg - total.unpricedDmKg;
  return { ...total, cost: priced > 1e-9 || (total.dmKg === 0 && total.unpricedDmKg === 0) ? total.cost : null };
}

/**
 * Run rate for the trailing `days` ending `today` (inclusive), farm-wide.
 * Measured pool-day d: the pool's checks bracket d with the earlier check date
 * exclusive and the later inclusive (poolDailyObservation on d − 1).
 * Farm-measured day: at least one pool holds feed and every such pool is measured.
 */
export function computeFeedRunRate({ today, days = DEFAULT_RUN_RATE_DAYS, events = [], entries = [], checks = [], items = [],
  batches = {}, feedTypes = {}, groupWindows = [], memberships = null, animals = [], animalWeightRecords = [], animalClasses = {} }) {
  const start = shiftDate(today, -(days - 1));
  const dates = Array.from({ length: days }, (_, i) => shiftDate(start, i));
  const relevant = events.filter(event => event.dateIn && event.dateIn <= today && (!event.dateOut || event.dateOut >= start));
  const perDate = new Map(dates.map(date => [date, { active: 0, measured: 0, dmKg: 0, units: {}, cost: 0, unpricedDmKg: 0, unknown: false }]));
  const consumed = amountTotals();
  const residual = { ...amountTotals(), eventsClosed: 0, closesWithoutReading: 0 };

  for (const event of relevant) {
    const input = { eventId: event.id, entries, checks, items, batches, feedTypes };
    const history = poolHistory(input);
    if (!history.identities.size) {
      if (event.dateOut && event.dateOut >= start && event.dateOut <= today) residual.eventsClosed += 1;
      continue;
    }
    const prices = poolDmPrices(input);
    for (const date of dates) {
      if (!openOn(event, date)) continue;
      const observed = poolDailyObservation(input, shiftDate(date, -1));
      const before = replayFeedPools(input, { through: rowInstant(shiftDate(date, -1), '23:59:59.999') });
      const deliveredToday = new Set(history.records.filter(row => row.order === 0 && row.sign > 0 && row.stamp.slice(0, 10) === date).map(row => row.key));
      const day = perDate.get(date);
      for (const key of history.identities.keys()) {
        const row = observed.get(key);
        const active = !!row || holdsFeed(before.get(key)) || deliveredToday.has(key);
        if (!active) continue;
        day.active += 1;
        if (!row || row.dm == null) { if (row) day.unknown = true; continue; }
        day.measured += 1;
        day.dmKg += row.dm;
        if (row.units != null && row.unit) addUnits(day.units, row.unit, row.units);
        const price = prices.get(key);
        if (price == null) day.unpricedDmKg += row.dm; else day.cost += row.dm * price;
        addAmount(consumed, row.dm, row.units, row.unit, price);
      }
    }
    // Residual (left at close): events closed in the window, per pool after full replay.
    if (event.dateOut && event.dateOut >= start && event.dateOut <= today) {
      residual.eventsClosed += 1;
      const final = replayFeedPools(input);
      const closeKeys = new Set(history.records.filter(row => row.order === 1 && row.check.isCloseReading === true).map(row => row.key));
      let missing = false;
      for (const [key, pool] of final) {
        if (!closeKeys.has(key)) { if (holdsFeed(pool)) missing = true; continue; }
        if (pool.d == null) { missing = true; continue; }
        addAmount(residual, pool.d, pool.massBased || !pool.unit ? null : pool.q, pool.unit, prices.get(key));
      }
      if (missing) residual.closesWithoutReading += 1;
    }
  }

  const measuredDates = dates.filter(date => { const day = perDate.get(date); return day.active > 0 && day.measured === day.active && !day.unknown; });
  const measuredDays = measuredDates.length;
  const rate = { dmKgPerDay: null, unitsPerDay: {}, forecastDmKgPerDay: null, pctOfForecast: null };
  if (measuredDays) {
    let dm = 0, forecast = 0; const units = {};
    for (const date of measuredDates) {
      const day = perDate.get(date);
      dm += day.dmKg;
      for (const [unit, value] of Object.entries(day.units)) addUnits(units, unit, value);
      forecast += groupWindowsDailyDmiKg(date, { groupWindows, memberships, animals, animalClasses, animalWeightRecords });
    }
    rate.dmKgPerDay = dm / measuredDays;
    rate.unitsPerDay = Object.fromEntries(Object.entries(units).map(([unit, value]) => [unit, value / measuredDays]));
    rate.forecastDmKgPerDay = forecast / measuredDays;
    rate.pctOfForecast = rate.forecastDmKgPerDay > 0 ? rate.dmKgPerDay / rate.forecastDmKgPerDay * 100 : null;
  }
  return {
    days, start, end: today, measuredDays, lastMeasuredDate: measuredDates.at(-1) ?? null,
    hasChecks: checks.some(check => check.date >= start && check.date <= today && relevant.some(event => event.id === check.eventId)),
    rate, consumed: finishCost(consumed), residual: finishCost(residual),
  };
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
    { name: 'events', type: 'array', unit: '{ id, dateIn (derived start), dateOut }' },
    { name: 'entries / checks / items / batches / feedTypes', type: 'array', unit: 'feed pool replay rows' },
    { name: 'groupWindows / memberships / animals / animalWeightRecords / animalClasses', type: 'array', unit: 'DMI forecast rows' },
  ],
  output: { type: 'object', shape: '{ measuredDays, lastMeasuredDate, hasChecks, rate, consumed, residual }', unit: 'kg DM / units / $' },
  fn: computeFeedRunRate,
});
