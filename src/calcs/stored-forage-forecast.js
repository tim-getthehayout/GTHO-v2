/**
 * @file #377 slice 1 — stored-forage season forecast (calc FED-8). Pure
 * compute-on-read; no store, no DOM.
 *
 * Forecast (Fh1) = on-hand DM today − remaining planned stored DM from
 * TOMORROW through the plan period end. Planned DM per day comes from the
 * #436 helpers (`needOnDate` / `plannedStoredDmKg`): a % line is planned% ×
 * the herd's daily need with TODAY's herd held flat for every future day, an
 * amount line is the entered kg DM/day, and a day no line covers is 0.
 *
 * On-hand DM is the Feed screen's Σ live batches `remaining` × kg/unit × DM%,
 * with one deliberate difference: a missing weight or DM% is UNKNOWN, never
 * the Feed screen's "1 kg" / "100%" stand-ins. Any unknown batch hides the
 * forecast (J1) instead of printing a wrong number.
 *
 * Covers through (Hc1): walk on-hand forward day by day from tomorrow,
 * subtracting that day's planned stored DM. The date is the last day that was
 * fully covered (a day planned at 0 is trivially covered). When the walk
 * reaches the period end the leftover is reported as carry-over days:
 *   carry-over days = floor(leftover DM ÷ divisor), where
 *   divisor = planned stored DM on the period's LAST day when a line covers it
 *             and that figure is > 0 (the "last plan day's need"), else
 *             today's herd need (last day uncovered, or planned at 0).
 * A divisor of 0 (no animals, nothing planned) leaves carry-over unknown (null).
 *
 * Staleness (J1): last count = the latest `batch_adjustments.adjustment_date`
 * across live batches, or the latest live batch `purchase_date` when that is
 * later (a batch that arrived after the last count was counted on arrival).
 * Up to 30 days is normal, 31–60 is amber, over 60 / never counted hides the
 * forecast. Unknown weight or DM and `remaining` ≠ located balances also hide
 * it. "Live" = not archived.
 */
import { registerCalc } from '../utils/calc-registry.js';
import { addDays } from '../utils/date-utils.js';
import { eachDateInclusive, lineOnDate, needOnDate, plannedStoredDmKg } from './stored-feed-plan.js';

export const STALE_AMBER_DAYS = 30;
export const STALE_HIDE_DAYS = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EPS = 1e-6;
const finite = v => v != null && v !== '' && Number.isFinite(Number(v));

function asList(x) {
  if (Array.isArray(x)) return x;
  return x && typeof x === 'object' ? Object.values(x) : [];
}

function dayDiff(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Live batches: not archived. */
export function liveBatches(batches) {
  return asList(batches).filter(b => b && !b.archived);
}

/**
 * Per-batch DM facts. Weight = batch kg/unit, else the feed type default;
 * DM% = batch, else the feed type. Either missing → that part is unknown and
 * `dmKg` is null (never 1 kg, never 100%).
 */
export function batchDmFacts(batch, feedTypes) {
  const ft = asList(feedTypes).find(f => f.id === batch.feedTypeId) || null;
  const weightRaw = batch.weightPerUnitKg ?? ft?.defaultWeightKg ?? null;
  const dmRaw = batch.dmPct ?? ft?.dmPct ?? null;
  const weightKg = finite(weightRaw) ? Number(weightRaw) : null;
  const dmPct = finite(dmRaw) ? Number(dmRaw) : null;
  const remaining = finite(batch.remaining) ? Number(batch.remaining) : 0;
  const dmKg = weightKg != null && dmPct != null ? remaining * weightKg * (dmPct / 100) : null;
  return {
    batchId: batch.id,
    remaining,
    weightKg,
    dmPct,
    unknownWeight: weightKg == null,
    unknownDm: dmPct == null,
    dmKg,
    dmKgPerUnit: weightKg != null && dmPct != null ? weightKg * (dmPct / 100) : null,
  };
}

/** On-hand DM today (kg) over live batches, plus the batches with an unknown weight or DM. */
export function computeOnHandDm({ batches = [], feedTypes = [] } = {}) {
  const facts = liveBatches(batches).map(b => batchDmFacts(b, feedTypes));
  const unknown = facts.filter(f => f.dmKg == null);
  const known = facts.filter(f => f.dmKg != null);
  return {
    dmKg: known.reduce((sum, f) => sum + f.dmKg, 0),
    facts,
    unknown: unknown.map(f => ({ batchId: f.batchId, weight: f.unknownWeight, dm: f.unknownDm })),
  };
}

/** Live batches whose located balance rows do not add up to `remaining`. */
export function locationMismatches({ batches = [], balances = [] } = {}) {
  const rows = asList(balances);
  const out = [];
  for (const b of liveBatches(batches)) {
    const mine = rows.filter(r => r.batchId === b.id);
    if (!mine.length) continue;
    const located = mine.reduce((sum, r) => sum + (finite(r.quantity) ? Number(r.quantity) : 0), 0);
    if (Math.abs(located - (finite(b.remaining) ? Number(b.remaining) : 0)) > EPS) out.push(b.id);
  }
  return out;
}

/** Last count over live batches and how stale it is. `level`: ok | amber | hide | never. */
export function lastCountInfo({ batches = [], adjustments = [], today } = {}) {
  const live = liveBatches(batches);
  const liveIds = new Set(live.map(b => b.id));
  let last = null;
  const take = d => { if (DATE_RE.test(d ?? '') && (last == null || d > last)) last = d; };
  for (const adj of asList(adjustments)) {
    if (!liveIds.has(adj.batchId)) continue;
    take(adj.adjustmentDate || String(adj.createdAt || '').slice(0, 10));
  }
  for (const b of live) take(b.purchaseDate);
  if (last == null) return { lastCountDate: null, daysAgo: null, level: 'never' };
  const daysAgo = Math.max(0, dayDiff(last, today));
  let level = 'ok';
  if (daysAgo > STALE_HIDE_DAYS) level = 'hide';
  else if (daysAgo > STALE_AMBER_DAYS) level = 'amber';
  return { lastCountDate: last, daysAgo, level };
}

/**
 * Walk `onHandKg` forward from `fromDate` through `toDate`, subtracting the
 * planned stored DM each day. Returns the last fully covered day (null when
 * not even the first day is covered), the leftover and whether it reached `toDate`.
 */
function walkOnHand({ onHandKg, rows, fromDate, toDate, needKg }) {
  let balance = onHandKg;
  let lastCovered = null;
  let reached = true;
  let coveredDays = 0;
  for (const date of eachDateInclusive(fromDate, toDate)) {
    const planned = plannedStoredDmKg(date, rows, needKg);
    if (balance - planned < -EPS) { reached = false; break; }
    balance -= planned;
    lastCovered = date;
    coveredDays += 1;
  }
  return { balance, lastCovered, reachesEnd: reached, coveredDays };
}

/**
 * Season forecast for one plan.
 *
 * @param {object} input
 * @param {object|null} input.plan  `{ periodStart, periodEnd }` or null (no plan saved)
 * @param {object[]} input.rows  the plan's lines
 * @param {string} input.today  YYYY-MM-DD
 * @param {object[]} input.batches
 * @param {object[]} input.feedTypes
 * @param {object[]} [input.adjustments]  batch_adjustments rows
 * @param {object[]} [input.balances]  batch_location_balances rows
 * @param {{ today: string, demandOpts: object }} input.needForDate  #436 need(d) inputs
 * @returns {object} `status`: no_plan | period_over | hidden | ok
 */
export function computeStoredForageForecast({
  plan, rows = [], today, batches = [], feedTypes = [], adjustments = [], balances = [], needForDate,
} = {}) {
  if (!plan?.periodStart || !plan?.periodEnd) return { status: 'no_plan' };
  const period = { start: plan.periodStart, end: plan.periodEnd };
  if (today >= plan.periodEnd) return { status: 'period_over', period };

  const onHand = computeOnHandDm({ batches, feedTypes });
  const count = lastCountInfo({ batches, adjustments, today });
  const mismatched = locationMismatches({ batches, balances });
  const live = onHand.facts;

  const blockers = [];
  if (!live.length) blockers.push('no_batches');
  if (count.level === 'never' && live.length) blockers.push('never_counted');
  if (count.level === 'hide') blockers.push('stale');
  if (onHand.unknown.length) blockers.push('unknown_weight_dm');
  if (mismatched.length) blockers.push('location_mismatch');

  if (blockers.length) {
    // The batch "Count your hay" opens: a location mismatch first, then an
    // unknown weight/DM batch, else the main (largest) live batch.
    const main = [...onHand.facts].filter(f => f.dmKg != null && f.remaining > 0).sort((a, b) => b.dmKg - a.dmKg)[0];
    const countBatchId = mismatched[0] ?? onHand.unknown[0]?.batchId ?? main?.batchId ?? live[0]?.batchId ?? null;
    return {
      status: 'hidden', period, blockers, count, countBatchId,
      unknownBatchIds: onHand.unknown.map(u => u.batchId), mismatchedBatchIds: mismatched,
    };
  }

  const needTodayKg = needOnDate(today, needForDate || {});
  const tomorrow = addDays(today, 1);
  const remainingDays = eachDateInclusive(tomorrow, plan.periodEnd);
  const remainingPlannedKg = remainingDays.reduce(
    (sum, date) => sum + plannedStoredDmKg(date, rows, needTodayKg), 0,
  );
  const forecastKg = onHand.dmKg - remainingPlannedKg;

  const walk = walkOnHand({
    onHandKg: onHand.dmKg, rows, fromDate: tomorrow, toDate: plan.periodEnd, needKg: needTodayKg,
  });
  let carryOverDays = null;
  let carryOverDivisorKg = null;
  if (walk.reachesEnd) {
    const lastPlanned = lineOnDate(rows, plan.periodEnd)
      ? plannedStoredDmKg(plan.periodEnd, rows, needTodayKg)
      : 0;
    carryOverDivisorKg = lastPlanned > 0 ? lastPlanned : needTodayKg;
    carryOverDays = carryOverDivisorKg > 0 ? Math.floor((walk.balance + EPS) / carryOverDivisorKg) : null;
  }

  const main = [...onHand.facts].filter(f => f.dmKg != null && f.remaining > 0).sort((a, b) => b.dmKg - a.dmKg)[0] || null;
  const mainBatch = main ? {
    batchId: main.batchId,
    dmKgPerUnit: main.dmKgPerUnit,
    equivalentUnits: main.dmKgPerUnit > 0 ? Math.abs(forecastKg) / main.dmKgPerUnit : null,
  } : null;

  return {
    status: 'ok',
    period,
    onHandDmKg: onHand.dmKg,
    remainingPlannedKg,
    forecastKg,
    tone: forecastKg >= 0 ? 'green' : 'red',
    needTodayKg,
    coversThrough: walk.lastCovered ?? today,
    coveredDays: walk.coveredDays,
    reachesPeriodEnd: walk.reachesEnd,
    carryOverDays,
    carryOverDivisorKg,
    mainBatch,
    count,
    stale: count.level === 'amber',
  };
}

registerCalc({
  name: 'FED-8',
  category: 'feed',
  description: 'Stored-forage season forecast: on-hand DM today minus remaining planned stored DM to the period end (surplus or deficit), the last day on-hand covers, carry-over days past the period end, and count-staleness gating',
  formula: 'forecast = Σ live batches remaining × kg/unit × DM% − Σ planned stored DM(d) for d = tomorrow..period end; planned(d) = pct × need(today, held flat) or the entered kg DM/day, 0 if no line; covers through = last d with balance − planned(d) ≥ 0 walking from tomorrow; carry-over days = floor(leftover ÷ last-day planned DM, else today\'s need)',
  source: 'session_briefs/STORED_FORAGE_REST_377_2026-11-28.md (Fh1, Hc1, J1; LOCK t1752s6901)',
  notes: 'Pure. Unknown weight or DM% is unknown, never 1 kg. Hidden (no number) when the last count is over 60 days old or never, any live batch has an unknown weight or DM, or remaining disagrees with located balances. No plan returns no result. Uses the #436 plannedStoredDmKg / needOnDate helpers.',
  inputs: [
    { name: 'plan', type: 'object', unit: '{ periodStart, periodEnd } (#436 stored_feed_plans)' },
    { name: 'rows', type: 'array', unit: 'stored_feed_plan_rows (pct or kg DM/day lines)' },
    { name: 'today', type: 'string', unit: 'YYYY-MM-DD' },
    { name: 'batches / feedTypes', type: 'array', unit: 'live batches and feed-type defaults' },
    { name: 'adjustments / balances', type: 'array', unit: 'batch_adjustments and batch_location_balances rows' },
    { name: 'needForDate', type: 'object', unit: '{ today, demandOpts } for #436 needOnDate' },
  ],
  output: { type: 'object', shape: '{ status, forecastKg, tone, remainingPlannedKg, onHandDmKg, coversThrough, reachesPeriodEnd, carryOverDays, mainBatch, count, blockers }', unit: 'kg DM' },
  fn: computeStoredForageForecast,
});
