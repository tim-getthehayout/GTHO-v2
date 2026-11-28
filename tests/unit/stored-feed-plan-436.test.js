/**
 * #436 / OI-0281 expected stored-feed plan — released ceiling (mocked 52).
 * Held-ceiling behaviour lives in stored-feed-plan-held-436.test.js.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/data/schema-release.js', async original => {
  const actual = await original();
  const RELEASED_SCHEMA_VERSION = 52;
  return {
    ...actual,
    RELEASED_SCHEMA_VERSION,
    HELD_SCHEMA_VERSIONS: [],
    isStoredFeedPlanReleased: (ceiling = RELEASED_SCHEMA_VERSION) => ceiling >= actual.STORED_FEED_PLAN_SCHEMA_VERSION,
    isTableReleased: (table, ceiling = RELEASED_SCHEMA_VERSION) => actual.isTableReleased(table, ceiling),
  };
});

import { _reset, mergeRemote, setSyncAdapter, getAll } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../src/utils/preferences.js';
import * as dates from '../../src/utils/date-utils.js';
import { groupWindowsDailyDmiKg } from '../../src/calcs/window-helpers.js';
import { al1EventDayAllocation } from '../../src/calcs/f1-close-allocation.js';
import * as Plan from '../../src/entities/stored-feed-plan.js';
import * as PlanRow from '../../src/entities/stored-feed-plan-row.js';
import {
  validatePlanLines, plannedStoredDmKg, needOnDate, farmStoredDmiByDate,
  summarizeStoredFeedPlan, lineKind, planForFarm,
} from '../../src/calcs/stored-feed-plan.js';
import { renderStoredFeedPlanCard, homeStoredFeedPlanTile, openStoredFeedPlanSheet } from '../../src/features/feed/stored-feed-plan-card.js';
import { renderFeedScreen } from '../../src/features/feed/index.js';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';
import { renderDashboard } from '../../src/features/dashboard/index.js';
import { isStoredFeedPlanReleased, isTableReleased, RELEASED_SCHEMA_VERSION, HELD_SCHEMA_VERSIONS, STAGED_TABLES } from '../../src/data/schema-release.js';
import { BACKUP_MIGRATIONS } from '../../src/data/backup-migrations.js';

const OP = '00000000-0000-4000-8000-0000000436a1';
const FARM = '00000000-0000-4000-8000-0000000436a2';
const LOC = '00000000-0000-4000-8000-0000000436a3';
const GRP = '00000000-0000-4000-8000-0000000436a4';
const CLS_COW = '00000000-0000-4000-8000-0000000436c1';
const CLS_YOUNG = '00000000-0000-4000-8000-0000000436c2';
const FT = '00000000-0000-4000-8000-0000000436f1';
const PLAN = '00000000-0000-4000-8000-0000000436p1';
const TODAY = '2027-05-20';
const PERIOD = { periodStart: '2026-10-01', periodEnd: '2027-09-30' };
const haySnap = {
  feedTypeId: FT,
  unitSnapshot: 'bale',
  weightPerUnitKgSnapshot: 500,
  dmPctSnapshot: 80,
};
function dmBales(n) { return n * 500 * 0.8; }

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

function eatenByDate(today = TODAY) {
  return farmStoredDmiByDate({
    farmId: FARM, from: PERIOD.periodStart, to: PERIOD.periodEnd, today,
    events: getAll('events'),
    groupWindows: getAll('eventGroupWindows'),
    memberships: getAll('animalGroupMemberships'),
    animals: getAll('animals'),
    animalClasses: getAll('animalClasses'),
    animalWeightRecords: getAll('animalWeightRecords'),
    paddockWindows: getAll('eventPaddockWindows'),
    locations: getAll('locations'),
    groups: getAll('groups'),
    feedEntries: getAll('eventFeedEntries'),
    feedChecks: getAll('eventFeedChecks'),
    feedCheckItems: getAll('eventFeedCheckItems'),
    batches: getAll('batches'),
    feedTypes: getAll('feedTypes'),
  });
}

function header(extra = {}) {
  return Plan.create({
    id: PLAN, operationId: OP, farmId: FARM, ...PERIOD, ...extra,
  });
}

function pctLine(id, start, end, pct) {
  return PlanRow.create({
    id, operationId: OP, planId: PLAN, startDate: start, endDate: end, plannedPct: pct,
  });
}
function amtLine(id, start, end, kg) {
  return PlanRow.create({
    id, operationId: OP, planId: PLAN, startDate: start, endDate: end, plannedKgDmPerDay: kg,
  });
}

/** Standard Oct 1–Mar 31 at 100% + Apr 1–30 at 50%. */
function standardLines() {
  return [
    pctLine('r-winter', '2026-10-01', '2027-03-31', 100),
    pctLine('r-apr', '2027-04-01', '2027-04-30', 50),
  ];
}

function seedBase() {
  mergeRemote('operations', [{ id: OP, name: 'Op', unitSystem: 'metric' }]);
  setUnitSystem('metric');
  mergeRemote('farms', [{ id: FARM, operationId: OP, name: 'Home' }]);
  mergeRemote('farmSettings', [{
    id: 'fs1', farmId: FARM, operationId: OP,
    seasonStartMonth: 10, seasonStartDay: 1, seasonEndMonth: 9, seasonEndDay: 30,
  }]);
  mergeRemote('userPreferences', [{ id: 'p1', userId: 'user', activeFarmId: FARM }]);
  mergeRemote('locations', [{ id: LOC, operationId: OP, farmId: FARM, name: 'Paddock', type: 'land', areaHectares: 4 }]);
  mergeRemote('groups', [{ id: GRP, operationId: OP, name: 'Herd', color: '#000' }]);
  mergeRemote('feedTypes', [{ id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale', dmPct: 80 }]);
}

function seedHerd({ cows = 10, cowWeight = 500, cowPct = 2.5, young = 0, youngWeight = 200, youngPct = 2, joined = '2026-09-01' } = {}) {
  const classes = [
    { id: CLS_COW, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow', dmiPct: cowPct, defaultWeightKg: cowWeight },
  ];
  if (young) {
    classes.push({
      id: CLS_YOUNG, operationId: OP, name: 'Young', species: 'beef_cattle', role: 'young_stock',
      dmiPct: youngPct, defaultWeightKg: youngWeight,
    });
  }
  mergeRemote('animalClasses', classes);
  const animals = [];
  const memberships = [];
  const weights = [];
  for (let i = 0; i < cows; i += 1) {
    const id = `cow-${i}`;
    animals.push({ id, operationId: OP, classId: CLS_COW, sex: 'female', active: true, cullDate: null });
    memberships.push({ id: `m-${id}`, operationId: OP, groupId: GRP, animalId: id, dateJoined: joined, dateLeft: null });
    weights.push({
      id: `w-${id}`, operationId: OP, animalId: id, weightKg: cowWeight,
      recordedAt: `${joined}T12:00:00.000Z`, source: 'manual',
    });
  }
  for (let i = 0; i < young; i += 1) {
    const id = `yg-${i}`;
    animals.push({ id, operationId: OP, classId: CLS_YOUNG, sex: 'female', active: true, cullDate: null });
    memberships.push({ id: `m-${id}`, operationId: OP, groupId: GRP, animalId: id, dateJoined: joined, dateLeft: null });
    weights.push({
      id: `w-${id}`, operationId: OP, animalId: id, weightKg: youngWeight,
      recordedAt: `${joined}T12:00:00.000Z`, source: 'manual',
    });
  }
  mergeRemote('animals', animals);
  mergeRemote('animalGroupMemberships', memberships);
  mergeRemote('animalWeightRecords', weights);
  // Season-long demand event so need(d) is defined on every day in the period,
  // including days that have no measured hay close.
  if (!getAll('events').some(e => e.id === 'ev-season')) {
    mergeRemote('events', [...getAll('events'), {
      id: 'ev-season', operationId: OP, farmId: FARM, dateIn: '2026-09-01', dateOut: null,
    }]);
    mergeRemote('eventPaddockWindows', [...getAll('eventPaddockWindows'), {
      id: 'pw-season', operationId: OP, eventId: 'ev-season', locationId: LOC,
      dateOpened: '2026-09-01', dateClosed: null, areaPct: 100,
    }]);
    mergeRemote('eventGroupWindows', [...getAll('eventGroupWindows'), {
      id: 'gw-season', operationId: OP, eventId: 'ev-season', groupId: GRP,
      dateJoined: '2026-09-01', dateLeft: null, headCount: 0, avgWeightKg: 0,
    }]);
  }
}

/** One-day measured hay event: deliver `bales` on `date`, close at midnight the next morning. */
function seedMeasuredDay(date, bales, tag) {
  const ev = `ev-${tag}`;
  const next = dates.addDays(date, 1);
  mergeRemote('events', [...getAll('events'), { id: ev, operationId: OP, farmId: FARM, dateIn: date, dateOut: next }]);
  mergeRemote('eventPaddockWindows', [...getAll('eventPaddockWindows'), {
    id: `pw-${tag}`, operationId: OP, eventId: ev, locationId: LOC,
    dateOpened: date, dateClosed: next, areaPct: 100,
  }]);
  mergeRemote('eventFeedEntries', [...getAll('eventFeedEntries'), {
    id: `fe-${tag}`, operationId: OP, eventId: ev, locationId: LOC, date,
    quantity: bales, kind: 'inventory_feeding', ...haySnap,
  }]);
  const checkId = `fc-${tag}`;
  mergeRemote('eventFeedChecks', [...getAll('eventFeedChecks'), {
    id: checkId, operationId: OP, eventId: ev, date: next, time: '00:00', isCloseReading: true,
  }]);
  mergeRemote('eventFeedCheckItems', [...getAll('eventFeedCheckItems'), {
    id: `fci-${tag}`, feedCheckId: checkId, locationId: LOC, batchId: null,
    remainingQuantity: 0, ...haySnap,
  }]);
}

function summarize(rows, today = TODAY) {
  return summarizeStoredFeedPlan({
    plan: header(),
    rows,
    eatenByDate: eatenByDate(today),
    today,
    needForDate: { today, demandOpts: demandOpts() },
  });
}

beforeEach(() => {
  setLocale('en', en);
  _reset();
  document.body.replaceChildren();
  setSyncAdapter(null);
  vi.spyOn(dates, 'getLocalTodayStr').mockReturnValue(TODAY);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('#436 held-release bookkeeping at the mocked ceiling 52', () => {
  it('treats 052 as released and keeps the backup 51→52 step', () => {
    expect(RELEASED_SCHEMA_VERSION).toBe(52);
    expect(HELD_SCHEMA_VERSIONS).toEqual([]);
    expect(isStoredFeedPlanReleased()).toBe(true);
    expect(isTableReleased('stored_feed_plans')).toBe(true);
    expect(isTableReleased('stored_feed_plan_rows')).toBe(true);
    expect(STAGED_TABLES[52]).toEqual(['stored_feed_plans', 'stored_feed_plan_rows']);
    expect(BACKUP_MIGRATIONS[51]).toBeTypeOf('function');
    const b = BACKUP_MIGRATIONS[51]({ tables: { operations: [{ schema_version: 51 }] }, schema_version: 51 });
    expect(b.schema_version).toBe(52);
    expect(b.tables.stored_feed_plans).toEqual([]);
    expect(b.tables.stored_feed_plan_rows).toEqual([]);
  });
});

describe('#436 validatePlanLines', () => {
  const plan = { periodStart: '2026-10-01', periodEnd: '2027-09-30' };

  it('accepts the Oct–Mar 100% + Apr 50% shape', () => {
    expect(validatePlanLines(plan, [
      { startDate: '2026-10-01', endDate: '2027-03-31', plannedPct: 100 },
      { startDate: '2027-04-01', endDate: '2027-04-30', plannedPct: 50 },
    ])).toEqual([]);
  });

  it('rejects each invalid case', () => {
    expect(validatePlanLines({ periodStart: 'nope', periodEnd: '2027-09-30' }, [])).toContain('invalid_date');
    expect(validatePlanLines({ periodStart: '2026-10-01', periodEnd: '2026-10-01' }, [])).toContain('end_not_after_start');
    expect(validatePlanLines({ periodStart: '2026-10-01', periodEnd: '2028-10-02' }, [])).toContain('too_long');
    expect(validatePlanLines(plan, [{ startDate: '2027-04-02', endDate: '2027-04-01', plannedPct: 10 }])).toContain('end_before_start');
    expect(validatePlanLines(plan, [{ startDate: '2026-10-01', endDate: '2026-10-02', plannedPct: -1 }])).toContain('pct_out_of_range');
    expect(validatePlanLines(plan, [{ startDate: '2026-10-01', endDate: '2026-10-02', plannedPct: 101 }])).toContain('pct_out_of_range');
    expect(validatePlanLines(plan, [{ startDate: '2026-10-01', endDate: '2026-10-02', plannedKgDmPerDay: -1 }])).toContain('amount_negative');
    expect(validatePlanLines(plan, [{ startDate: '2026-10-01', endDate: '2026-10-02', plannedPct: 50, plannedKgDmPerDay: 10 }])).toContain('both_or_neither');
    expect(validatePlanLines(plan, [{ startDate: '2026-10-01', endDate: '2026-10-02' }])).toContain('both_or_neither');
    expect(validatePlanLines(plan, [{ startDate: '2026-09-30', endDate: '2026-10-02', plannedPct: 10 }])).toContain('outside_period');
    expect(validatePlanLines(plan, [{ startDate: '2027-09-30', endDate: '2027-10-01', plannedPct: 10 }])).toContain('outside_period');
    expect(validatePlanLines(plan, [
      { startDate: '2026-10-01', endDate: '2026-10-10', plannedPct: 100 },
      { startDate: '2026-10-10', endDate: '2026-10-20', plannedPct: 50 },
    ])).toContain('overlapping');
  });

  it('entity validate matches the line codes', () => {
    expect(PlanRow.validate(PlanRow.create({ operationId: OP, planId: PLAN, startDate: '2026-10-02', endDate: '2026-10-01', plannedPct: 10 })).errors).toContain('end_before_start');
    expect(PlanRow.validate(PlanRow.create({ operationId: OP, planId: PLAN, startDate: '2026-10-01', endDate: '2026-10-02' })).errors).toContain('both_or_neither');
    expect(Plan.validate(Plan.create({ operationId: OP, farmId: FARM, periodStart: '2026-10-01', periodEnd: '2026-10-01' })).errors).toContain('end_not_after_start');
  });
});

describe('#436 planned vs eaten', () => {
  beforeEach(() => {
    seedBase();
    seedHerd({ cows: 100 });
  });

  it('Oct 1–Mar 31 at 100% + Apr 1–30 at 50% month summary; uncovered hay is over plan', () => {
    seedMeasuredDay('2026-10-15', 2, 'oct');
    seedMeasuredDay('2027-04-15', 2, 'apr');
    seedMeasuredDay('2027-05-15', 2, 'may');
    const rows = standardLines();
    const needOct = needOnDate('2026-10-15', { today: TODAY, demandOpts: demandOpts() });
    const needApr = needOnDate('2027-04-15', { today: TODAY, demandOpts: demandOpts() });
    const needMay = needOnDate('2027-05-15', { today: TODAY, demandOpts: demandOpts() });
    expect(needOct).toBeCloseTo(100 * 500 * 0.025, 8);
    expect(plannedStoredDmKg('2026-10-15', rows, needOct)).toBeCloseTo(needOct, 8);
    expect(plannedStoredDmKg('2027-04-15', rows, needApr)).toBeCloseTo(needApr * 0.5, 8);
    expect(plannedStoredDmKg('2027-05-15', rows, needMay)).toBe(0);

    const s = summarize(rows);
    const eaten = dmBales(2);
    expect(s.seasonToDate.countedDays).toBe(3);
    expect(s.seasonToDate.eatenKg).toBeCloseTo(eaten * 3, 8);
    expect(s.seasonToDate.plannedKg).toBeCloseTo(needOct + needApr * 0.5 + 0, 8);
    expect(s.seasonToDate.tone).toBe('amber'); // May uncovered + Apr 50% both over
    const oct = s.months.find(m => m.month === '2026-10');
    const apr = s.months.find(m => m.month === '2027-04');
    const may = s.months.find(m => m.month === '2027-05');
    expect(oct.countedDays).toBe(1);
    expect(oct.plannedKg).toBeCloseTo(needOct, 8);
    expect(oct.eatenKg).toBeCloseTo(eaten, 8);
    expect(oct.tone).toBe('green'); // 800 eaten < 1250 planned
    expect(apr.plannedKg).toBeCloseTo(needApr * 0.5, 8);
    expect(apr.eatenKg).toBeCloseTo(eaten, 8);
    expect(apr.tone).toBe('amber');
    expect(may.plannedKg).toBe(0);
    expect(may.eatenKg).toBeCloseTo(eaten, 8);
    expect(may.tone).toBe('amber');
  });

  it('reuses the OI-0280 Al1 storedDmiKg number (no second hay calc)', () => {
    seedMeasuredDay('2026-10-15', 4, 'oct');
    const byDate = eatenByDate();
    const day = byDate.get('2026-10-15');
    expect(day.counted).toBe(true);
    expect(day.eatenKg).toBeCloseTo(dmBales(4), 8);
    const ev = 'ev-oct';
    const evWindows = getAll('eventPaddockWindows').filter(w => w.eventId === ev);
    const evChecks = getAll('eventFeedChecks').filter(c => c.eventId === ev);
    const checkIds = new Set(evChecks.map(c => c.id));
    const alloc = al1EventDayAllocation({
      date: '2026-10-15',
      dates: ['2026-10-15'],
      hayArgs: {
        eventId: ev, openDate: '2026-10-15', openTime: null,
        feedEntries: getAll('eventFeedEntries').filter(e => e.eventId === ev),
        feedChecks: evChecks,
        feedCheckItems: getAll('eventFeedCheckItems').filter(i => checkIds.has(i.feedCheckId)),
        batches: {},
        feedTypes: Object.fromEntries(getAll('feedTypes').map(ft => [ft.id, ft])),
      },
      demandByDate: new Map([['2026-10-15', day.needKg]]),
      paddockWindows: evWindows,
      locationsById: new Map(getAll('locations').map(l => [l.id, l])),
    });
    expect(alloc.storedDmiKg).toBeCloseTo(day.eatenKg, 8);
    expect(summarize(standardLines()).seasonToDate.eatenKg).toBeCloseTo(day.eatenKg, 8);
  });

  it('100% plan with eaten under is green; 50% plan with eaten over is amber; never red', () => {
    seedMeasuredDay('2026-10-15', 2, 'oct');
    const green = summarize([pctLine('r1', '2026-10-01', '2027-03-31', 100)]);
    expect(green.seasonToDate.tone).toBe('green');
    expect(green.seasonToDate.savingsKg).toBeGreaterThan(0);
    const amber = summarize([pctLine('r1', '2026-10-01', '2027-03-31', 50)]);
    expect(amber.seasonToDate.tone).toBe('amber');
    expect(amber.seasonToDate.savingsKg).toBeLessThan(0);
    expect(['green', 'amber', 'none']).toContain(green.seasonToDate.tone);
    expect(green.seasonToDate.tone).not.toBe('red');
    expect(amber.seasonToDate.tone).not.toBe('red');
  });

  it('% line follows the actual herd on past days', () => {
    // 10 cows already in the herd; 10 more join on 2026-11-01.
    const extra = [];
    const mems = [];
    const weights = [];
    for (let i = 0; i < 10; i += 1) {
      const id = `late-${i}`;
      extra.push({ id, operationId: OP, classId: CLS_COW, sex: 'female', active: true, cullDate: null });
      mems.push({ id: `m-${id}`, operationId: OP, groupId: GRP, animalId: id, dateJoined: '2026-11-01', dateLeft: null });
      weights.push({
        id: `w-${id}`, operationId: OP, animalId: id, weightKg: 500,
        recordedAt: '2026-11-01T12:00:00.000Z', source: 'manual',
      });
    }
    mergeRemote('animals', [...getAll('animals'), ...extra]);
    mergeRemote('animalGroupMemberships', [...getAll('animalGroupMemberships'), ...mems]);
    mergeRemote('animalWeightRecords', [...getAll('animalWeightRecords'), ...weights]);
    const rows = [pctLine('r1', '2026-10-01', '2027-03-31', 100)];
    const early = needOnDate('2026-10-15', { today: TODAY, demandOpts: demandOpts() });
    const late = needOnDate('2026-11-15', { today: TODAY, demandOpts: demandOpts() });
    expect(early).toBeCloseTo(100 * 500 * 0.025, 8);
    expect(late).toBeCloseTo(110 * 500 * 0.025, 8);
    expect(plannedStoredDmKg('2026-10-15', rows, early)).toBeCloseTo(early, 8);
    expect(plannedStoredDmKg('2026-11-15', rows, late)).toBeCloseTo(late, 8);
  });

  it('amount line ignores a herd change', () => {
    const rows = [amtLine('r1', '2026-10-01', '2027-03-31', 100)];
    const early = needOnDate('2026-10-15', { today: TODAY, demandOpts: demandOpts() });
    expect(early).toBeGreaterThan(0);
    expect(plannedStoredDmKg('2026-10-15', rows, early)).toBe(100);
    expect(plannedStoredDmKg('2026-11-15', rows, early * 2)).toBe(100);
    expect(lineKind(rows[0])).toBe('amount');
  });

  it('per-class need is the OI-0279 mix', () => {
    _reset();
    seedBase();
    seedHerd({ cows: 1, cowWeight: 600, cowPct: 3, young: 1, youngWeight: 200, youngPct: 2 });
    const need = needOnDate('2026-10-15', { today: TODAY, demandOpts: demandOpts() });
    const expected = groupWindowsDailyDmiKg('2026-10-15', demandOpts());
    expect(need).toBeCloseTo(expected, 8);
    expect(need).toBeCloseTo(600 * 0.03 + 200 * 0.02, 8);
    expect(plannedStoredDmKg('2026-10-15', standardLines(), need)).toBeCloseTo(need, 8);
  });
});

describe('#436 Feed card and Home tile (released)', () => {
  beforeEach(() => {
    seedBase();
    seedHerd();
    seedMeasuredDay('2026-10-15', 2, 'oct');
    mergeRemote('storedFeedPlans', [header()]);
    mergeRemote('storedFeedPlanRows', standardLines());
  });

  it('renders planned vs eaten, savings, this month, season to date, Edit plan, and the month table', () => {
    const card = renderStoredFeedPlanCard();
    document.body.appendChild(card);
    expect(card.getAttribute('data-testid')).toBe('feed-stored-plan-card');
    expect(card.querySelector('[data-testid="feed-plan-edit"]').textContent).toBe('Edit plan');
    expect(card.querySelector('[data-testid="feed-plan-period"]').textContent).toContain('2026-10-01');
    expect(card.querySelector('[data-testid="feed-plan-season-planned"]').textContent).toMatch(/kg/);
    expect(card.querySelector('[data-testid="feed-plan-season-eaten"]').textContent).toMatch(/kg/);
    expect(card.querySelector('[data-testid="feed-plan-season-savings"]').textContent).toMatch(/Savings/);
    expect(card.querySelector('[data-testid="feed-plan-month"]').textContent).toBeTruthy();
    const months = [...card.querySelectorAll('[data-testid="feed-plan-month-row"]')];
    expect(months.length).toBeGreaterThanOrEqual(12);
    expect(months.some(r => r.getAttribute('data-month') === '2026-10')).toBe(true);
    expect(months.some(r => r.getAttribute('data-month') === '2027-04')).toBe(true);
  });

  it('shows kg in metric and lb in imperial', () => {
    setUnitSystem('metric');
    let card = renderStoredFeedPlanCard();
    document.body.appendChild(card);
    expect(card.querySelector('[data-testid="feed-plan-season-eaten"]').textContent).toMatch(/kg/);
    expect(card.querySelector('[data-testid="feed-plan-season-eaten"]').textContent).not.toMatch(/lb/);
    document.body.replaceChildren();
    setUnitSystem('imperial');
    card = renderStoredFeedPlanCard();
    document.body.appendChild(card);
    expect(card.querySelector('[data-testid="feed-plan-season-eaten"]').textContent).toMatch(/lb/);
  });

  it('mounts the card on the Feed screen and the hay-savings tile on Home', () => {
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    renderFeedScreen(feed);
    expect(feed.querySelector('[data-testid="feed-stored-plan-card"]')).toBeTruthy();
    expect(feed.querySelector('[data-testid="feed-screen"]')).toBeTruthy();

    document.body.replaceChildren();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    const home = document.createElement('div');
    document.body.appendChild(home);
    renderDashboard(home);
    const tile = home.querySelector('[data-testid="dashboard-plan-savings"]');
    expect(tile).toBeTruthy();
    expect(tile.textContent).toMatch(/Hay savings/);
    expect(home.querySelector('.dash-stats-grid--plan')).toBeTruthy();
    const model = homeStoredFeedPlanTile('metric');
    expect(model.testId).toBe('dashboard-plan-savings');
    expect(model.color).toMatch(/green|amber/);
  });

  it('rejects overlapping lines in the Edit plan sheet', () => {
    openStoredFeedPlanSheet(getAll('storedFeedPlans')[0], OP, FARM);
    const add = document.querySelector('[data-testid="feed-plan-add-line"]');
    add.click();
    add.click();
    // Both new lines default to the period start, so they overlap.
    document.querySelector('[data-testid="feed-plan-save"]').click();
    expect(document.querySelector('[data-testid="feed-plan-error"]').textContent).toMatch(/overlap/i);
  });
});

describe('#436 planForFarm', () => {
  it('prefers the period containing today, else the latest start', () => {
    const a = { id: 'a', farmId: FARM, periodStart: '2025-10-01', periodEnd: '2026-09-30' };
    const b = { id: 'b', farmId: FARM, periodStart: '2026-10-01', periodEnd: '2027-09-30' };
    expect(planForFarm([a, b], FARM, '2027-01-01').id).toBe('b');
    expect(planForFarm([a], FARM, '2027-01-01').id).toBe('a');
    expect(planForFarm([], FARM, '2027-01-01')).toBeNull();
  });
});
