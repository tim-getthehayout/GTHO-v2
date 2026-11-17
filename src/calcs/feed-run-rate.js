/** @file Feed run rate from feed checks: a pure, store-free window aggregate
 * over the FA-26 pool replay. Shared by the Feed screen card and the stored
 * forage scorecard; callers gather rows and decorate event start dates.
 * See session_briefs/FEED_RUN_RATE_PROPOSAL_2026-11-17.md §2.
 */
import { registerCalc } from '../utils/calc-registry.js';
import { feedSnapshot, poolHistory, poolDailyObservation, replayFeedPools } from './feed-pools.js';
import { groupWindowsDailyDmiKg, groupWindowsDailyDemand, eventOpenOn } from './window-helpers.js';
import { isPureConfinementOnDate } from './location-type.js';
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
const openOn = eventOpenOn;
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
  batches = {}, feedTypes = {}, groupWindows = [], memberships = null, animals = [], animalWeightRecords = [], animalClasses = {}, groups = [],
  paddockWindows = [], locations = {} }) {
  let start = shiftDate(today, -(days - 1));
  if (periodStart && periodStart > start) start = periodStart > today ? today : periodStart;
  const dates = [];
  for (let date = start; date <= today; date = shiftDate(date, 1)) dates.push(date);
  const relevant = events.filter(event => event.dateIn && event.dateIn <= today && (!event.dateOut || event.dateOut >= start));
  const perDate = new Map(dates.map(date => [date, { active: 0, measured: 0, dmKg: 0, units: {}, unknown: false, rows: [], byEvent: new Map() }]));
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
        day.byEvent.set(event.id, (day.byEvent.get(event.id) ?? 0) + obs.dm);
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
      // Farm demand: only windows on events open that day, once per group (orphans excluded).
      forecast += groupWindowsDailyDmiKg(date, { groupWindows, memberships, animals, animalClasses, animalWeightRecords, events, groups });
    }
    rate.dmKgPerDay = measuredDm / measuredDays;
    rate.unitsPerDay = Object.fromEntries(Object.entries(units).map(([unit, value]) => [unit, value / measuredDays]));
    rate.forecastDmKgPerDay = forecast / measuredDays;
    rate.pctOfForecast = rate.forecastDmKgPerDay > 0 ? rate.dmKgPerDay / rate.forecastDmKgPerDay * 100 : null;
  }
  const demandOpts = { groupWindows, memberships, animals, animalClasses, animalWeightRecords, events, groups };
  const impliedPasture = impliedPastureWindow({ dates, perDate, events: relevant, demandOpts, paddockWindows, locations });
  return {
    days, windowDays: dates.length, start, end: today, measuredDays, lastMeasuredDate: measuredDates.at(-1) ?? null,
    hasChecks: checks.some(check => check.date >= start && check.date <= today && relevant.some(event => event.id === check.eventId)),
    rate,
    // includesPartialDays: consumed counts measured pool-days on days another pool was unmeasured.
    consumed: { ...finishCost(consumed), includesPartialDays: consumed.dmKg - measuredDm > 1e-6 },
    residual: finishResidual(residual, residual.closesWithoutReading > 0),
    byEvent,
    impliedPasture,
  };
}

/** Display species group for DMI-9 rows: Cattle, Sheep, Goats, Other (null = no class species). */
export function pastureSpeciesGroup(species) {
  if (species === 'beef_cattle' || species === 'dairy_cattle') return 'cattle';
  if (species === 'sheep') return 'sheep';
  if (species === 'goat') return 'goat';
  if (species === 'other') return 'other';
  return null;
}

/**
 * A demand row split by species: the window class species, else the members
 * live that day. DM splits by live-weight share (demand is head × weight ×
 * DMI%); heads split by head count. With no member weights, DM follows heads.
 */
function speciesParts(row) {
  if (row.species) return [{ key: pastureSpeciesGroup(row.species), dmShare: 1, headShare: 1 }];
  const mix = row.speciesMix;
  const sum = map => (map ? [...map.values()].reduce((a, b) => a + b, 0) : 0);
  const totalHeads = sum(mix?.heads), totalWeight = sum(mix?.weights);
  if (!(totalHeads > 0)) return [{ key: null, dmShare: 1, headShare: 1 }];
  const parts = new Map();
  for (const [species, heads] of mix.heads) {
    const key = pastureSpeciesGroup(species);
    const part = parts.get(key) ?? { key, dmShare: 0, headShare: 0 };
    part.headShare += heads / totalHeads;
    part.dmShare += totalWeight > 0 ? (mix.weights.get(species) ?? 0) / totalWeight : heads / totalHeads;
    parts.set(key, part);
  }
  return [...parts.values()];
}

function pastureFigures({ demandDmKg, storedDmKg, headDays }, countedDays) {
  const signed = demandDmKg - storedDmKg;
  const shown = Math.max(0, signed);
  const out = {
    demandDmKg, storedDmKg, signedDmKg: signed,
    demandDmKgPerDay: demandDmKg / countedDays, storedDmKgPerDay: storedDmKg / countedDays,
    signedDmKgPerDay: signed / countedDays, signedPct: demandDmKg > 0 ? signed / demandDmKg * 100 : null,
    pastureDmKgPerDay: shown / countedDays, pasturePct: demandDmKg > 0 ? shown / demandDmKg * 100 : null,
    overDemandDmKgPerDay: signed < 0 ? -signed / countedDays : 0, overDemandPct: signed < 0 && demandDmKg > 0 ? -signed / demandDmKg * 100 : 0,
  };
  if (headDays != null) {
    out.avgHead = headDays / countedDays;
    out.pasturePerHeadKg = out.avgHead > 0 ? out.pastureDmKgPerDay / out.avgHead : null;
  }
  return out;
}

/**
 * DMI-9 window lane: implied pasture = predicted herd DMI − stored feed eaten
 * (FED-6 consumed) over the counted days: farm-measured days plus no-hay days
 * (no pool active on any open event). Netted over the window, then floored at 0;
 * the signed value is kept. Unknown, never 0. History basis rows (045) are not
 * part of the window lane on the client.
 */
function impliedPastureWindow({ dates, perDate, events, demandOpts, paddockWindows, locations }) {
  const dropped = { noWeight: 0, confinement: 0, storedWithoutDemand: 0 };
  const total = { demandDmKg: 0, storedDmKg: 0 };
  const species = new Map();
  let countedDays = 0, noHayDays = 0, measuredCounted = 0, anyCandidate = false;
  for (const date of dates) {
    const day = perDate.get(date);
    const measured = day.active > 0 && day.measured === day.active && !day.unknown;
    const noHay = day.active === 0;
    if (!measured && !noHay) continue;
    anyCandidate = true;
    if (noHay && events.some(event => openOn(event, date) && isPureConfinementOnDate({ paddockWindows, locations, eventId: event.id, date }))) { dropped.confinement += 1; continue; }
    const rows = groupWindowsDailyDemand(date, demandOpts);
    if (rows.some(row => row.head > 0 && !(finite(row.avgWeightKg) && row.avgWeightKg > 0))) { dropped.noWeight += 1; continue; }
    // Stored by species: each event's eaten DM split by its windows' demand share on d.
    const stored = new Map();
    let orphan = false;
    for (const [eventId, dm] of day.byEvent) {
      const own = rows.filter(row => row.eventId === eventId && row.kg > 0);
      const ownKg = own.reduce((sum, row) => sum + row.kg, 0);
      if (!(ownKg > 0)) { if (dm > 1e-9) orphan = true; continue; }
      for (const row of own) for (const { key, dmShare } of speciesParts(row)) stored.set(key, (stored.get(key) ?? 0) + dm * row.kg * dmShare / ownKg);
    }
    if (orphan) { dropped.storedWithoutDemand += 1; continue; }
    countedDays += 1;
    if (noHay) noHayDays += 1; else measuredCounted += 1;
    for (const row of rows) {
      for (const { key, dmShare, headShare } of speciesParts(row)) {
        const sp = species.get(key) ?? { demandDmKg: 0, storedDmKg: 0, headDays: 0 };
        sp.demandDmKg += row.kg * dmShare; sp.headDays += row.head * headShare; species.set(key, sp);
      }
      total.demandDmKg += row.kg;
    }
    for (const [key, dm] of stored) {
      const sp = species.get(key) ?? { demandDmKg: 0, storedDmKg: 0, headDays: 0 };
      sp.storedDmKg += dm; species.set(key, sp);
      total.storedDmKg += dm;
    }
  }
  const base = { windowDays: dates.length, countedDays, measuredDays: measuredCounted, noHayDays, dropped };
  if (!countedDays) return { ...base, status: 'unknown', reason: anyCandidate ? 'no_usable_days' : 'no_counted_days', bySpecies: {} };
  if (!(total.demandDmKg > 0)) return { ...base, status: 'no_animals', reason: null, bySpecies: {} };
  const bySpecies = {};
  for (const [key, sp] of species) {
    if (key == null || !(sp.demandDmKg > 0)) continue;
    bySpecies[key] = pastureFigures(sp, countedDays);
  }
  return { ...base, status: 'ok', reason: null, ...pastureFigures(total, countedDays), bySpecies };
}

/** Residual with no known pool is unknown (null DM and $), never 0. A real 0-left reading stays 0. */
function finishResidual(total, anyUnknown) {
  const done = finishCost(total);
  if (total.knownPools === 0 && anyUnknown) return { ...done, dmKg: null, cost: null, unknown: true };
  return { ...done, unknown: false };
}

registerCalc({
  name: 'DMI-9',
  category: 'dmi',
  description: 'Implied pasture DMI over a run-rate window: predicted herd DMI minus stored feed eaten (FED-6 consumed), herd lb DM/day, per-head per species, % of demand',
  formula: 'signed = Σ demand − Σ stored over counted days D (farm-measured + no-hay days); pasture/day = max(0, signed) ÷ |D|; % = max(0, signed) ÷ Σ demand × 100; over-demand when signed < 0',
  source: 'session_briefs/IMPLIED_PASTURE_DMI_2026-11-17.md §1',
  notes: 'Window lane; computed in the same day loop as FED-6 (field impliedPasture). Unknown, never 0. The period lane (fed basis, 045 history) waits for the budget view.',
  inputs: [{ name: 'FED-6 inputs', type: 'object', unit: 'plus paddockWindows / locations for the confinement rule' }],
  output: { type: 'object', shape: '{ status, reason, countedDays, windowDays, measuredDays, noHayDays, dropped, demandDmKg, storedDmKg, signedDmKgPerDay, signedPct, pastureDmKgPerDay, pasturePct, overDemandDmKgPerDay, overDemandPct, bySpecies }', unit: 'kg DM' },
  fn: input => computeFeedRunRate(input).impliedPasture,
});

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
    { name: 'groups', type: 'array', unit: '{ id, name } (optional; names for the duplicate-window warning)' },
  ],
  output: { type: 'object', shape: '{ windowDays, measuredDays, lastMeasuredDate, hasChecks, rate, consumed, residual, byEvent }', unit: 'kg DM / units / $' },
  fn: computeFeedRunRate,
});
