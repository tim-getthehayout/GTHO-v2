/**
 * @file #436 / OI-0281 — expected stored-feed plan math. Pure compute-on-read.
 * Planned stored DM(d): a % line is planned%(d) × need(d) (OI-0279
 * groupWindowsDailyDmiKg; actual herd on past days, current herd held flat
 * for future days). An amount line is the entered kg DM/day and does not
 * follow herd changes. Days with no line are 0% planned.
 * Used = Σ Al1 storedDmiKg on measured days (the same helper OI-0280 / #435
 * uses — no second hay-eaten calc). Planned and eaten are compared over those
 * counted days only. Savings = planned − eaten (green under plan, amber over,
 * never red).
 */
import { addDays } from '../utils/date-utils.js';
import { validatePeriod, periodMonthRows, periodsOverlap } from './budget-period.js';
import { groupWindowsDailyDmiKg } from './window-helpers.js';
import { al1EventDayAllocation } from './f1-close-allocation.js';
import { deriveEventStartDate, deriveEventStartTime } from '../features/events/rotation-calendar/location-metrics.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const finite = v => v != null && v !== '' && Number.isFinite(Number(v));

/** Inclusive YYYY-MM-DD walk. */
export function eachDateInclusive(start, end) {
  const out = [];
  if (!DATE_RE.test(start ?? '') || !DATE_RE.test(end ?? '') || start > end) return out;
  for (let d = start, n = 0; d <= end && n < 800; d = addDays(d, 1), n += 1) out.push(d);
  return out;
}

export function lineKind(row) {
  const hasPct = finite(row?.plannedPct);
  const hasAmt = finite(row?.plannedKgDmPerDay);
  if (hasPct && !hasAmt) return 'pct';
  if (hasAmt && !hasPct) return 'amount';
  return 'invalid';
}

/** The unique covering line for `date`, or null (uncovered = 0% planned). */
export function lineOnDate(rows, date) {
  return (rows || []).find(r => r.startDate <= date && date <= r.endDate) || null;
}

/**
 * Validate a plan header plus its lines. Returns a list of error codes
 * (empty when valid): invalid_date, end_not_after_start, too_long,
 * end_before_start, pct_out_of_range, amount_negative, both_or_neither,
 * outside_period, overlapping.
 */
export function validatePlanLines(plan, rows = []) {
  const errors = [...validatePeriod({ start: plan?.periodStart, end: plan?.periodEnd }, { budget: true })];
  const seen = [];
  for (const row of rows) {
    if (!DATE_RE.test(row.startDate ?? '') || !DATE_RE.test(row.endDate ?? '')) {
      errors.push('invalid_date');
      continue;
    }
    if (row.endDate < row.startDate) errors.push('end_before_start');
    if (row.startDate < plan.periodStart || row.endDate > plan.periodEnd) errors.push('outside_period');
    const kind = lineKind(row);
    if (kind === 'invalid') errors.push('both_or_neither');
    if (kind === 'pct') {
      const p = Number(row.plannedPct);
      if (p < 0 || p > 100) errors.push('pct_out_of_range');
    }
    if (kind === 'amount' && Number(row.plannedKgDmPerDay) < 0) errors.push('amount_negative');
    const span = { start: row.startDate, end: row.endDate };
    if (seen.some(s => periodsOverlap(s, span))) errors.push('overlapping');
    seen.push(span);
  }
  return errors;
}

/**
 * Farm herd need (kg DM) on `date`. Past and today: OI-0279 actual herd.
 * Future days: today's farm-wide need held flat (OI-0221 §4 / OI-0281).
 */
export function needOnDate(date, { today, demandOpts }) {
  const dt = today && date > today ? today : date;
  return groupWindowsDailyDmiKg(dt, demandOpts) || 0;
}

/** Planned stored DM (kg) on `date` from the covering line, or 0 if uncovered. */
export function plannedStoredDmKg(date, rows, needKg) {
  const line = lineOnDate(rows, date);
  if (!line) return 0;
  const kind = lineKind(line);
  if (kind === 'pct') return (Number(line.plannedPct) / 100) * (needKg || 0);
  if (kind === 'amount') return Number(line.plannedKgDmPerDay) || 0;
  return 0;
}

/**
 * Per-day Al1 hay eaten (kg DM) for one farm, keyed by date. A day is
 * counted when at least one event has a measured Al1 allocation (`storedDmiKg`
 * not null). Unmeasured days are omitted so planned and eaten share the same
 * counted days.
 */
export function farmStoredDmiByDate({
  farmId, from, to, today,
  events = [], groupWindows = [], memberships, animals, animalClasses, animalWeightRecords,
  paddockWindows = [], locations = [], groups = [],
  feedEntries = [], feedChecks = [], feedCheckItems = [], batches = {}, feedTypes = {},
} = {}) {
  const end = today && to > today ? today : to;
  const dates = eachDateInclusive(from, end);
  const byDate = new Map();
  if (!dates.length) return byDate;

  const farmEvents = events.filter(e => !farmId || e.farmId === farmId).map(event => {
    if (event.dateIn) return event;
    const dateIn = deriveEventStartDate(event.id, { paddockWindows, groupWindows, event }) || event.dateIn;
    return dateIn ? { ...event, dateIn } : event;
  });
  const demandOpts = {
    groupWindows, memberships, animals, animalClasses, animalWeightRecords,
    events: farmEvents, groups,
  };
  const demandByDate = new Map(dates.map(d => [d, needOnDate(d, { today, demandOpts })]));
  const locationsById = new Map((Array.isArray(locations) ? locations : Object.values(locations || {})).map(loc => [
    loc.id, { ...loc, areaHectares: loc.areaHectares ?? loc.areaHa },
  ]));
  const batchesMap = batches && typeof batches === 'object' && !Array.isArray(batches)
    ? batches
    : Object.fromEntries((batches || []).map(b => [b.id, b]));
  const typesMap = feedTypes && typeof feedTypes === 'object' && !Array.isArray(feedTypes)
    ? feedTypes
    : Object.fromEntries((feedTypes || []).map(ft => [ft.id, ft]));

  for (const event of farmEvents) {
    const eventId = event.id;
    const same = row => !row?.eventId || row.eventId === eventId;
    const evWindows = paddockWindows.filter(same);
    const evGroups = groupWindows.filter(same);
    const evEntries = feedEntries.filter(same);
    const evChecks = feedChecks.filter(same);
    const checkIds = new Set(evChecks.map(c => c.id));
    const evItems = feedCheckItems.filter(i => checkIds.has(i.feedCheckId));
    if (!evEntries.length || !evChecks.length) continue;
    const openDate = deriveEventStartDate(eventId, { paddockWindows: evWindows, groupWindows: evGroups, event }) || event.dateIn;
    if (!openDate) continue;
    const hayArgs = {
      eventId,
      openDate,
      openTime: deriveEventStartTime(eventId, openDate, { paddockWindows: evWindows, groupWindows: evGroups }),
      feedEntries: evEntries,
      feedChecks: evChecks,
      feedCheckItems: evItems,
      batches: batchesMap,
      feedTypes: typesMap,
    };
    const evDates = dates.filter(d => d >= openDate && (!event.dateOut || d <= event.dateOut));
    for (const date of evDates) {
      const alloc = al1EventDayAllocation({
        date,
        dates: evDates,
        hayArgs,
        demandByDate,
        paddockWindows: evWindows,
        locationsById,
      });
      if (alloc.storedDmiKg == null) continue;
      const cur = byDate.get(date) || { eatenKg: 0, needKg: demandByDate.get(date) || 0, counted: false };
      cur.eatenKg += alloc.storedDmiKg;
      cur.counted = true;
      byDate.set(date, cur);
    }
  }
  return byDate;
}

function emptyBucket() {
  return { plannedKg: 0, eatenKg: 0, savingsKg: 0, countedDays: 0, tone: 'none' };
}

function finishBucket(b) {
  b.savingsKg = b.plannedKg - b.eatenKg;
  b.tone = b.countedDays > 0 ? (b.savingsKg >= 0 ? 'green' : 'amber') : 'none';
  return b;
}

/**
 * Season-to-date, this-month and per-month planned vs eaten for one plan.
 * `eatenByDate` is farmStoredDmiByDate() output. `today` clips "to date".
 * `wasteKg` is the OI-0224 residual-at-close figure (optional, shown beside used).
 */
export function summarizeStoredFeedPlan({ plan, rows = [], eatenByDate = new Map(), today, needForDate, wasteKg = null } = {}) {
  const empty = {
    period: plan ? { start: plan.periodStart, end: plan.periodEnd } : null,
    seasonToDate: emptyBucket(),
    thisMonth: emptyBucket(),
    months: [],
    wasteKg,
  };
  if (!plan?.periodStart || !plan?.periodEnd) return empty;

  const thisMonthKey = (today || '').slice(0, 7);
  const months = periodMonthRows({ start: plan.periodStart, end: plan.periodEnd }).map(m => ({
    ...m, ...emptyBucket(),
  }));
  const monthOf = d => months.find(m => m.start <= d && d <= m.end);
  const demandOpts = needForDate && needForDate.demandOpts;
  const todayOpt = needForDate && needForDate.today;

  const season = emptyBucket();
  const thisMonth = emptyBucket();
  const to = today && today < plan.periodEnd ? today : plan.periodEnd;
  for (const date of eachDateInclusive(plan.periodStart, to)) {
    const day = eatenByDate.get(date);
    if (!day?.counted) continue;
    const needKg = day.needKg != null
      ? day.needKg
      : (demandOpts ? needOnDate(date, { today: todayOpt, demandOpts }) : 0);
    const plannedKg = plannedStoredDmKg(date, rows, needKg);
    const eatenKg = day.eatenKg || 0;
    const add = (b) => {
      b.plannedKg += plannedKg;
      b.eatenKg += eatenKg;
      b.countedDays += 1;
    };
    add(season);
    const month = monthOf(date);
    if (month) add(month);
    if (thisMonthKey && date.startsWith(thisMonthKey)) add(thisMonth);
  }
  return {
    period: { start: plan.periodStart, end: plan.periodEnd },
    seasonToDate: finishBucket(season),
    thisMonth: finishBucket(thisMonth),
    months: months.map(finishBucket),
    wasteKg,
  };
}

/** Pick the plan for `farmId` whose period contains `today`, else the latest by period start. */
export function planForFarm(plans, farmId, today) {
  const mine = (plans || []).filter(p => p.farmId === farmId);
  if (!mine.length) return null;
  const containing = mine.filter(p => p.periodStart <= today && today <= p.periodEnd);
  const list = containing.length ? containing : mine;
  return [...list].sort((a, b) => (a.periodStart < b.periodStart ? 1 : -1))[0];
}
