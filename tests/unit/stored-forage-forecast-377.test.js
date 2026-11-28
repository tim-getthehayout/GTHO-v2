/**
 * #377 slice 1 — stored-forage season forecast (FED-8): Fh1 surplus/deficit,
 * Hc1 "Hay covers through", J1 staleness gating, and the Feed plan card UI.
 * Released ceiling is 52 (no migration in this slice).
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import { _reset, mergeRemote, setSyncAdapter, getAll } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../src/utils/preferences.js';
import * as dates from '../../src/utils/date-utils.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import * as Plan from '../../src/entities/stored-feed-plan.js';
import * as PlanRow from '../../src/entities/stored-feed-plan-row.js';
import {
  computeStoredForageForecast, lastCountInfo, locationMismatches, computeOnHandDm, batchDmFacts,
  STALE_AMBER_DAYS, STALE_HIDE_DAYS,
} from '../../src/calcs/stored-forage-forecast.js';
import { renderStoredFeedPlanCard } from '../../src/features/feed/stored-feed-plan-card.js';
import { computeFarmForecast } from '../../src/features/feed/stored-forage-forecast-block.js';
import { renderFeedScreen } from '../../src/features/feed/index.js';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';

const OP = '00000000-0000-4000-8000-000000377a01';
const FARM = '00000000-0000-4000-8000-000000377a02';
const LOC = '00000000-0000-4000-8000-000000377a03';
const GRP = '00000000-0000-4000-8000-000000377a04';
const CLS = '00000000-0000-4000-8000-000000377c01';
const FT = '00000000-0000-4000-8000-000000377f01';
const PLAN = '00000000-0000-4000-8000-000000377b01';
const TODAY = '2027-01-01';
const PERIOD = { periodStart: '2026-10-01', periodEnd: '2027-09-30' };
const LB_KG = 1 / 2.2046226218;
/** 1,000 lb DM per bale: weight 453.59 kg at 100% DM. */
const BALE_KG = 1000 * LB_KG;
const COW_PCT = 2.5;

function header() {
  return Plan.create({ id: PLAN, operationId: OP, farmId: FARM, ...PERIOD });
}
function pct(id, start, end, p) {
  return PlanRow.create({ id, operationId: OP, planId: PLAN, startDate: start, endDate: end, plannedPct: p });
}
function amt(id, start, end, kg) {
  return PlanRow.create({ id, operationId: OP, planId: PLAN, startDate: start, endDate: end, plannedKgDmPerDay: kg });
}

function seedBase() {
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem: 'imperial' }]);
  setUnitSystem('imperial');
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('farmSettings', [{
    id: 'fs1', farmId: FARM, operationId: OP,
    seasonStartMonth: 10, seasonStartDay: 1, seasonEndMonth: 9, seasonEndDay: 30,
  }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM }]);
  mergeRemote('locations', [{ id: LOC, operationId: OP, farmId: FARM, name: 'Paddock', type: 'land', areaHectares: 4 }]);
  mergeRemote('groups', [{ id: GRP, operationId: OP, name: 'Herd', color: '#000' }]);
  // No dmPct / defaultWeightKg on the feed type: a batch must carry its own.
  mergeRemote('feedTypes', [{ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale' }]);
}

/** `cows` cows at `weight` kg: daily need = cows × weight × 2.5%. Joined well before the plan. */
function seedHerd({ cows = 10, weight = 500 } = {}) {
  mergeRemote('animalClasses', [{
    id: CLS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow', dmiPct: COW_PCT, defaultWeightKg: weight,
  }]);
  const animals = []; const memberships = []; const weights = [];
  for (let i = 0; i < cows; i += 1) {
    const id = `cow-${i}`;
    animals.push({ id, operationId: OP, classId: CLS, sex: 'female', active: true, cullDate: null });
    memberships.push({ id: `m-${id}`, operationId: OP, groupId: GRP, animalId: id, dateJoined: '2026-09-01', dateLeft: null });
    weights.push({ id: `w-${id}`, operationId: OP, animalId: id, weightKg: weight, recordedAt: '2026-09-01T12:00:00.000Z', source: 'manual' });
  }
  mergeRemote('animals', animals);
  mergeRemote('animalGroupMemberships', memberships);
  mergeRemote('animalWeightRecords', weights);
  mergeRemote('events', [{ id: 'ev-season', operationId: OP, farmId: FARM, dateIn: '2026-09-01', dateOut: null }]);
  mergeRemote('eventPaddockWindows', [{
    id: 'pw-season', operationId: OP, eventId: 'ev-season', locationId: LOC, dateOpened: '2026-09-01', dateClosed: null, areaPct: 100,
  }]);
  mergeRemote('eventGroupWindows', [{
    id: 'gw-season', operationId: OP, eventId: 'ev-season', groupId: GRP, dateJoined: '2026-09-01', dateLeft: null, headCount: 0, avgWeightKg: 0,
  }]);
}

function batch(id, extra = {}) {
  return {
    id, operationId: OP, feedTypeId: FT, name: `Hay ${id}`, quantity: 100, remaining: 100, unit: 'bale',
    weightPerUnitKg: BALE_KG, dmPct: 100, purchaseDate: null, archived: false, ...extra,
  };
}
function adjustment(id, batchId, date) {
  return {
    id, batchId, operationId: OP, previousQty: 0, newQty: 0, delta: 0, reason: 'reconcile', adjustmentDate: date,
  };
}
function seedBatches(list, adjustments = [adjustment('adj-1', list[0]?.id, '2026-12-25')]) {
  mergeRemote('batches', list);
  mergeRemote('batchAdjustments', adjustments);
}
function seedPlan(rows) {
  mergeRemote('storedFeedPlans', [header()]);
  mergeRemote('storedFeedPlanRows', rows);
}
function demandOpts() {
  return {
    groupWindows: getAll('eventGroupWindows'),
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
    events: getAll('events'),
    groups: getAll('groups'),
  };
}
function forecastFor(today = TODAY) {
  return computeFarmForecast({
    plan: getAll('storedFeedPlans')[0] ?? null,
    rows: getAll('storedFeedPlanRows'),
    today,
    demandOpts: demandOpts(),
  });
}
function renderCard() {
  const card = renderStoredFeedPlanCard();
  document.body.appendChild(card);
  return card;
}
const q = (root, id) => root.querySelector(`[data-testid="${id}"]`);

beforeEach(() => {
  setLocale('en', en);
  _reset();
  document.body.replaceChildren();
  setSyncAdapter(null);
  vi.spyOn(dates, 'getLocalTodayStr').mockReturnValue(TODAY);
});
afterEach(() => { vi.restoreAllMocks(); });

/** Cows sized so Jan 2 – Mar 31 (89 days) at 100% is exactly 100,000 lb DM. */
const HERD_100K_LB = { cows: 10, weight: (100000 * LB_KG) / 89 / (10 * (COW_PCT / 100)) };

describe('#377 FED-8 registration', () => {
  it('is a registered calc', () => {
    const calc = getCalcByName('FED-8');
    expect(calc).toBeTruthy();
    expect(calc.fn).toBe(computeStoredForageForecast);
  });
});

describe('#377 Fh1 surplus / deficit', () => {
  beforeEach(() => {
    seedBase();
    seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
  });

  it('plan Oct 1–Mar 31 at 100%, on-hand 120,000 lb and remaining 100,000 lb DM shows +20,000 green', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })]);
    const f = forecastFor();
    expect(f.status).toBe('ok');
    expect(f.remainingPlannedKg / LB_KG).toBeCloseTo(100000, 0);
    expect(f.onHandDmKg / LB_KG).toBeCloseTo(120000, 0);
    expect(f.forecastKg / LB_KG).toBeCloseTo(20000, 0);
    expect(f.tone).toBe('green');

    const card = renderCard();
    const head = q(card, 'feed-forecast-headline');
    expect(head.textContent).toBe('Season forecast: +20,000 lb DM surplus');
    expect(head.style.color).toBe('var(--green)');
    expect(q(card, 'feed-forecast-bales').textContent).toBe('≈ 20 round bales of Hay b1 (main batch)');
  });

  it('a deficit is red with a bales equivalent', () => {
    seedBatches([batch('b1', { quantity: 80, remaining: 80 })]);
    const card = renderCard();
    const head = q(card, 'feed-forecast-headline');
    expect(head.textContent).toBe('Season forecast: −20,000 lb DM deficit');
    expect(head.style.color).toBe('var(--red)');
    expect(q(card, 'feed-forecast-bales').textContent).toBe('≈ 20 round bales of Hay b1 (main batch)');
    expect(forecastFor().tone).toBe('red');
  });

  it('shows kg in metric and lb in imperial', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })]);
    setUnitSystem('metric');
    let card = renderCard();
    expect(q(card, 'feed-forecast-headline').textContent).toMatch(/\+9,072 kg DM surplus/);
    document.body.replaceChildren();
    setUnitSystem('imperial');
    card = renderCard();
    expect(q(card, 'feed-forecast-headline').textContent).toMatch(/\+20,000 lb DM surplus/);
  });

  it('% lines use today\'s herd held flat; amount lines are taken as entered; uncovered days are 0', () => {
    _reset(); seedBase(); seedHerd({ cows: 10, weight: 500 }); // need 125 kg/day
    mergeRemote('storedFeedPlans', [header()]);
    mergeRemote('storedFeedPlanRows', [
      pct('p1', '2027-01-02', '2027-01-11', 50), // 10 d × 62.5
      amt('a1', '2027-01-12', '2027-01-21', 40), // 10 d × 40
      // Jan 22 on uncovered
    ]);
    seedBatches([batch('b1', { quantity: 10, remaining: 10 })]);
    const f = forecastFor();
    expect(f.remainingPlannedKg).toBeCloseTo(10 * 62.5 + 10 * 40, 6);
    expect(f.needTodayKg).toBeCloseTo(125, 6);
  });

  it('plans with no remaining days, and past plans, give no forecast block', () => {
    seedBatches([batch('b1')]);
    const f = computeStoredForageForecast({
      plan: header(), rows: getAll('storedFeedPlanRows'), today: '2027-09-30',
      batches: getAll('batches'), feedTypes: getAll('feedTypes'), needForDate: { today: '2027-09-30', demandOpts: demandOpts() },
    });
    expect(f.status).toBe('period_over');
  });
});

describe('#377 no plan', () => {
  it('returns no result and the card prompts to create a plan', () => {
    seedBase(); seedHerd(); seedBatches([batch('b1')]);
    expect(forecastFor().status).toBe('no_plan');
    const card = renderCard();
    expect(q(card, 'feed-forecast')).toBeNull();
    expect(q(card, 'feed-forecast-no-plan').textContent).toMatch(/Add a plan/);
    expect(q(card, 'feed-plan-edit').textContent).toBe('Add plan');
  });
});

describe('#377 Hc1 covers through', () => {
  const TODAY_MAR = '2027-03-01';
  beforeEach(() => {
    vi.spyOn(dates, 'getLocalTodayStr').mockReturnValue(TODAY_MAR);
    seedBase(); seedHerd({ cows: 10, weight: 500 }); // need 125 kg/day
    seedPlan([
      pct('r-winter', '2026-10-01', '2027-03-31', 100),
      pct('r-apr', '2027-04-01', '2027-04-30', 50),
    ]);
  });
  const stack = kg => seedBatches([batch('b1', { quantity: 1, remaining: 1, weightPerUnitKg: kg, dmPct: 100 })], [adjustment('a1', 'b1', '2027-02-25')]);

  it('lands on the right day across a 100% → 50% April step', () => {
    // Mar 2–31 = 30 d × 125 = 3,750; Apr = 62.5/day. 4,405 − 3,750 = 655 → 10 April days (625), 30 left.
    stack(4405);
    const f = forecastFor(TODAY_MAR);
    expect(f.status).toBe('ok');
    expect(f.coversThrough).toBe('2027-04-10');
    expect(f.reachesPeriodEnd).toBe(false);
    expect(f.carryOverDays).toBeNull();
    // A flat 100% walk would have run out on Apr 5, so the step is honoured.
    expect(Math.floor(4405 / 125)).toBe(35);
  });

  it('a stack that runs dry mid-March covers through the day before', () => {
    stack(125 * 10 + 50); // 10 full days, 50 left over < 125
    expect(forecastFor(TODAY_MAR).coversThrough).toBe('2027-03-11');
  });

  it('reaching the period end reports carry-over ÷ today\'s need when the last day is uncovered', () => {
    // remaining planned = 3,750 + 30 × 62.5 = 5,625. Leftover 4,375 ÷ 125 = 35.
    stack(10000);
    const f = forecastFor(TODAY_MAR);
    expect(f.reachesPeriodEnd).toBe(true);
    expect(f.coversThrough).toBe('2027-09-30');
    expect(f.forecastKg).toBeCloseTo(4375, 6);
    expect(f.carryOverDivisorKg).toBeCloseTo(125, 6);
    expect(f.carryOverDays).toBe(35);
  });

  it('carry-over ÷ the last plan day\'s planned DM when a line covers the period end', () => {
    _reset(); seedBase(); seedHerd({ cows: 10, weight: 500 });
    mergeRemote('storedFeedPlans', [header()]);
    mergeRemote('storedFeedPlanRows', [pct('all', '2026-10-01', '2027-09-30', 50)]); // 62.5/day
    stack(62.5 * 213 + 62.5 * 11 + 5); // Mar 2–Sep 30 = 213 days, then 11 days and 5 kg spare
    const f = forecastFor(TODAY_MAR);
    expect(f.reachesPeriodEnd).toBe(true);
    expect(f.carryOverDivisorKg).toBeCloseTo(62.5, 6);
    expect(f.carryOverDays).toBe(11); // floor((62.5 × 11 + 5) ÷ 62.5)
  });

  it('renders the date and carry-over on the card', () => {
    stack(10000);
    const card = renderCard();
    expect(q(card, 'feed-forecast-covers').textContent).toBe('Hay covers through Sep 30, 2027 (+35 days carry-over)');
    document.body.replaceChildren();
    stack(4405);
    expect(q(renderCard(), 'feed-forecast-covers').textContent).toBe('Hay covers through Apr 10, 2027');
  });
});

describe('#377 J1 staleness', () => {
  beforeEach(() => {
    seedBase(); seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
  });
  const countedDaysAgo = n => dates.addDays(TODAY, -n);

  it('boundaries: ≤30 normal, 31–60 amber, >60 hidden', () => {
    const level = n => lastCountInfo({
      batches: [batch('b1')], adjustments: [adjustment('a', 'b1', countedDaysAgo(n))], today: TODAY,
    }).level;
    expect(STALE_AMBER_DAYS).toBe(30);
    expect(STALE_HIDE_DAYS).toBe(60);
    expect(level(0)).toBe('ok');
    expect(level(30)).toBe('ok');
    expect(level(31)).toBe('amber');
    expect(level(60)).toBe('amber');
    expect(level(61)).toBe('hide');
  });

  it('45 days since the last count shows the forecast with an amber note', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })], [adjustment('a', 'b1', countedDaysAgo(45))]);
    const card = renderCard();
    expect(q(card, 'feed-forecast-headline')).toBeTruthy();
    const note = q(card, 'feed-forecast-stale');
    expect(note.textContent).toBe('Last counted 45 days ago');
    expect(note.style.color).toBe('var(--amber)');
  });

  it('30 days or less shows no staleness note', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })], [adjustment('a', 'b1', countedDaysAgo(30))]);
    const card = renderCard();
    expect(q(card, 'feed-forecast-headline')).toBeTruthy();
    expect(q(card, 'feed-forecast-stale')).toBeNull();
  });

  it('75 days since the last count hides the forecast and shows Count your hay', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })], [adjustment('a', 'b1', countedDaysAgo(75))]);
    const f = forecastFor();
    expect(f.status).toBe('hidden');
    expect(f.blockers).toEqual(['stale']);
    expect(f.forecastKg).toBeUndefined();
    const card = renderCard();
    expect(q(card, 'feed-forecast-headline')).toBeNull();
    expect(q(card, 'feed-forecast-covers')).toBeNull();
    expect(q(card, 'feed-forecast-count-hay').textContent).toBe('Count your hay');
    expect(q(card, 'feed-forecast-reason-stale').textContent).toMatch(/75 days/);
    // The plan card itself stays.
    expect(q(card, 'feed-plan-edit')).toBeTruthy();
    expect(q(card, 'feed-plan-season')).toBeTruthy();
  });

  it('never counted hides the forecast', () => {
    seedBatches([batch('b1')], []);
    const f = forecastFor();
    expect(f.status).toBe('hidden');
    expect(f.blockers).toContain('never_counted');
  });

  it('a batch that arrived after the last count counts as counted on its purchase date', () => {
    seedBatches([
      batch('b1', { quantity: 60, remaining: 60 }),
      batch('b2', { quantity: 60, remaining: 60, purchaseDate: countedDaysAgo(3) }),
    ], [adjustment('a', 'b1', countedDaysAgo(90))]);
    const info = lastCountInfo({ batches: getAll('batches'), adjustments: getAll('batchAdjustments'), today: TODAY });
    expect(info.lastCountDate).toBe(countedDaysAgo(3));
    expect(info.level).toBe('ok');
    expect(forecastFor().status).toBe('ok');
  });

  it('archived batches do not count towards the last count', () => {
    seedBatches([
      batch('b1', { quantity: 120, remaining: 120 }),
      batch('b2', { archived: true }),
    ], [adjustment('a', 'b1', countedDaysAgo(80)), adjustment('a2', 'b2', countedDaysAgo(1))]);
    expect(forecastFor().status).toBe('hidden');
  });

  it('saving a recount refreshes the card on the Feed screen', async () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })], [adjustment('a', 'b1', countedDaysAgo(75))]);
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    renderFeedScreen(feed);
    expect(q(feed, 'feed-forecast-headline')).toBeNull();
    mergeRemote('batchAdjustments', [...getAll('batchAdjustments'), adjustment('a2', 'b1', countedDaysAgo(0))]);
    await Promise.resolve(); // store notifications drain on a microtask
    expect(q(feed, 'feed-forecast-headline')).toBeTruthy();
    expect(q(feed, 'feed-forecast-count-hay')).toBeNull();
  });

  it('Count your hay opens the Adjust sheet on Reconcile', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })], [adjustment('a', 'b1', countedDaysAgo(75))]);
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    renderFeedScreen(feed);
    q(feed, 'feed-forecast-count-hay').click();
    const panel = document.getElementById('batch-adjust-sheet-panel');
    expect(panel.querySelector('[data-testid="batch-adjust-new-qty"]')).toBeTruthy();
    expect(panel.querySelector('[data-testid="batch-adjust-reason"]').value).toBe('reconcile');
    expect(panel.textContent).toContain('Hay b1');
  });
});

describe('#377 unknown weight / DM is unknown, never 1 kg', () => {
  beforeEach(() => {
    seedBase(); seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
  });

  it('a batch with no DM% hides the forecast and shows Count your hay', () => {
    seedBatches([batch('b1', { quantity: 120, remaining: 120 }), batch('b2', { dmPct: null, name: 'Mystery' })]);
    const f = forecastFor();
    expect(f.status).toBe('hidden');
    expect(f.blockers).toEqual(['unknown_weight_dm']);
    expect(f.countBatchId).toBe('b2');
    const card = renderCard();
    expect(q(card, 'feed-forecast-headline')).toBeNull();
    expect(q(card, 'feed-forecast-count-hay')).toBeTruthy();
    expect(q(card, 'feed-forecast-reason-unknown_weight_dm').textContent).toContain('Mystery');
  });

  it('a batch with no weight hides it too (not 1 kg per unit)', () => {
    seedBatches([batch('b1', { weightPerUnitKg: null })]);
    expect(forecastFor().blockers).toContain('unknown_weight_dm');
    const facts = batchDmFacts(getAll('batches')[0], getAll('feedTypes'));
    expect(facts.dmKg).toBeNull();
    expect(facts.unknownWeight).toBe(true);
  });

  it('falls back to the feed type default weight and DM% when the batch has none', () => {
    mergeRemote('feedTypes', [{ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale', dmPct: 80, defaultWeightKg: 500 }]);
    seedBatches([batch('b1', { weightPerUnitKg: null, dmPct: null, remaining: 10, quantity: 10 })]);
    const onHand = computeOnHandDm({ batches: getAll('batches'), feedTypes: getAll('feedTypes') });
    expect(onHand.unknown).toEqual([]);
    expect(onHand.dmKg).toBeCloseTo(10 * 500 * 0.8, 6);
  });
});

describe('#377 remaining vs located balances', () => {
  beforeEach(() => {
    seedBase(); seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })]);
  });

  it('matching balances are fine; a batch with no balance rows is not a mismatch', () => {
    expect(locationMismatches({ batches: getAll('batches'), balances: [] })).toEqual([]);
    mergeRemote('batchLocationBalances', [
      { id: 'bal1', operationId: OP, batchId: 'b1', locationId: LOC, quantity: 120 },
    ]);
    expect(forecastFor().status).toBe('ok');
  });

  it('remaining ≠ Σ located balances hides the forecast', () => {
    mergeRemote('batchLocationBalances', [
      { id: 'bal1', operationId: OP, batchId: 'b1', locationId: LOC, quantity: 100 },
    ]);
    const f = forecastFor();
    expect(f.status).toBe('hidden');
    expect(f.blockers).toEqual(['location_mismatch']);
    expect(f.countBatchId).toBe('b1');
    expect(q(renderCard(), 'feed-forecast-count-hay')).toBeTruthy();
  });
});

describe('#377 main batch and screen integration', () => {
  it('the bales equivalent uses the largest live batch by remaining DM', () => {
    seedBase(); seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
    // 100 lb DM/unit (small) vs 1,000 lb DM/bale; the second has more DM.
    seedBatches([
      batch('small', { quantity: 50, remaining: 50, weightPerUnitKg: 100 * LB_KG, unit: 'sq bale' }),
      batch('big', { quantity: 120, remaining: 120 }),
      batch('old', { quantity: 500, remaining: 500, archived: true }),
    ], [adjustment('a', 'big', '2026-12-30')]);
    const f = forecastFor();
    expect(f.mainBatch.batchId).toBe('big');
    expect(q(renderCard(), 'feed-forecast-bales').textContent).toContain('of Hay big');
  });

  it('mounts on the Feed screen and leaves the days-on-hand banner unchanged', () => {
    seedBase(); seedHerd(HERD_100K_LB);
    seedPlan([pct('r-winter', '2026-10-01', '2027-03-31', 100)]);
    seedBatches([batch('b1', { quantity: 120, remaining: 120 })]);
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    renderFeedScreen(feed);
    expect(q(feed, 'feed-forecast-headline')).toBeTruthy();
    const banner = q(feed, 'feed-day-goal-banner');
    expect(banner).toBeTruthy();
    expect(q(banner, 'feed-dm-on-hand').textContent).toMatch(/120000 lbs/); // the banner keeps its own formatting
    expect(q(banner, 'feed-days-on-hand')).toBeTruthy();
  });
});
