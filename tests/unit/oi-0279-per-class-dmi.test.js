/** @file OI-0279 — per-class DMI % from the group's members, one shared group-day function. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  groupDayDmi, groupDayExcretionRates, classDmiPct, dmiBasisNote,
  groupWindowsDailyDemand, groupWindowsDailyDmiKg, DEFAULT_DMI_PCT,
} from '../../src/calcs/window-helpers.js';
import { _reset, add, getAll } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import { computeFeedRunRate } from '../../src/calcs/feed-run-rate.js';
import { buildDmi8ChartContext } from '../../src/features/events/dmi-chart-context.js';
import { computeLocationMetrics, aggregatePeriodTotals } from '../../src/features/events/rotation-calendar/location-metrics.js';
import { renderDmiChart } from '../../src/ui/dmi-chart.js';
import { computeDmi8Days } from '../../src/features/events/dmi-chart-context.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import { buildLocationCard } from '../../src/features/dashboard/index.js';
import { openEventDetailSheet } from '../../src/features/events/detail.js';
import { convert, display } from '../../src/utils/units.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';

const cow = { id: 'c-cow', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 545, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
const calf = { id: 'c-calf', species: 'beef_cattle', role: 'calf', dmiPct: 3, defaultWeightKg: 113, excretionNRate: 0.2, excretionPRate: 0.05, excretionKRate: 0.1 };
const classes = [cow, calf];
const mem = (animalId, groupId = 'g', dateJoined = '2026-01-01', dateLeft = null) => ({ id: `m-${animalId}`, animalId, groupId, dateJoined, dateLeft });
const wt = (animalId, weightKg, date = '2026-01-01') => ({ id: `w-${animalId}-${date}`, animalId, weightKg, recordedAt: `${date}T08:00:00Z` });
const openGw = (extra = {}) => ({ id: 'gw', eventId: 'e', groupId: 'g', dateJoined: '2026-03-01', dateLeft: null, headCount: 99, avgWeightKg: 999, ...extra });

describe('OI-0279 groupDayDmi — effective DMI % per group-day', () => {
  it('mixed classes weight each class % by live weight (cow 2.5% + calf 3%)', () => {
    const ctx = {
      memberships: [mem('a1'), mem('a2')],
      animals: [{ id: 'a1', classId: 'c-cow' }, { id: 'a2', classId: 'c-calf' }],
      animalClasses: classes,
      animalWeightRecords: [wt('a1', 500), wt('a2', 150)],
    };
    const d = groupDayDmi(openGw(), '2026-03-10', ctx);
    const pct = (500 * 2.5 + 150 * 3) / 650;
    expect(d.dmiPct).toBeCloseTo(pct);
    expect(d.head).toBe(2);
    expect(d.avgWeightKg).toBeCloseTo(325);
    expect(d.kg).toBeCloseTo(2 * 325 * pct / 100);
    expect(d.basis).toBe('members');
    expect(dmiBasisNote(d)).toBeNull();
    // Map-shaped classes give the same answer.
    const asMap = groupDayDmi(openGw(), '2026-03-10', { ...ctx, animalClasses: { 'c-cow': cow, 'c-calf': calf } });
    expect(asMap.kg).toBeCloseTo(d.kg);
  });

  it('uses the class default weight × heads when a member has no weight record', () => {
    const d = groupDayDmi(openGw(), '2026-03-10', {
      memberships: [mem('a1'), mem('a2')],
      animals: [{ id: 'a1', classId: 'c-cow' }, { id: 'a2', classId: 'c-calf' }],
      animalClasses: classes, animalWeightRecords: [wt('a1', 500)],
    });
    expect(d.dmiPct).toBeCloseTo((500 * 2.5 + 113 * 3) / 613);
  });

  it('composites weigh in at their lot total (weight record) or class default × heads', () => {
    const ctx = {
      memberships: [mem('lotCow'), mem('lotCalf')],
      animals: [
        { id: 'lotCow', classId: 'c-cow', isBulk: true, bulkHeadCount: 10 },
        { id: 'lotCalf', classId: 'c-calf', isBulk: true, bulkHeadCount: 10 },
      ],
      animalClasses: classes,
      animalWeightRecords: [wt('lotCow', 5000)], // lot total; calves at 113 × 10
    };
    const d = groupDayDmi(openGw(), '2026-03-10', ctx);
    expect(d.head).toBe(20);
    expect(d.dmiPct).toBeCloseTo((5000 * 2.5 + 1130 * 3) / 6130);
  });

  it('an unclassed member counts at 2.5% and marks the basis members+default with a note', () => {
    const d = groupDayDmi(openGw(), '2026-03-10', {
      memberships: [mem('a1'), mem('a2'), mem('a3')],
      animals: [{ id: 'a1', classId: 'c-calf' }, { id: 'a2' }, { id: 'a3' }],
      animalClasses: classes,
      animalWeightRecords: [wt('a1', 100), wt('a2', 100), wt('a3', 100)],
    });
    expect(d.dmiPct).toBeCloseTo((100 * 3 + 200 * 2.5) / 300);
    expect(d.basis).toBe('members+default');
    expect(d.fallbacks.noClassHeads).toBe(2);
    expect(dmiBasisNote(d)).toBe('2 head at default 2.5% (no class)');
  });

  it('a member with no weight and no class default is left out of the weighting', () => {
    const d = groupDayDmi(openGw(), '2026-03-10', {
      memberships: [mem('a1'), mem('a2')],
      animals: [{ id: 'a1', classId: 'c-calf' }, { id: 'a2' }],
      animalClasses: classes, animalWeightRecords: [wt('a1', 100)],
    });
    expect(d.dmiPct).toBeCloseTo(3);
    expect(d.basis).toBe('members');
  });

  it('a class with no DMI % takes the seed rate for its species + role, else 2.5%', () => {
    expect(classDmiPct({ species: 'goat', role: 'doe', dmiPct: null })).toEqual({ pct: 3.5, source: 'seed' });
    expect(classDmiPct({ species: 'sheep', role: 'lamb' })).toEqual({ pct: 4, source: 'seed' });
    expect(classDmiPct({ species: 'other', role: 'x', dmiPct: null })).toEqual({ pct: DEFAULT_DMI_PCT, source: 'no-rate' });
    expect(classDmiPct(null)).toEqual({ pct: 2.5, source: 'no-class' });
    expect(classDmiPct({ species: 'goat', role: 'doe', dmiPct: 2 })).toEqual({ pct: 2, source: 'class' });
    const d = groupDayDmi(openGw(), '2026-03-10', {
      memberships: [mem('a1')], animals: [{ id: 'a1', classId: 'kid' }],
      animalClasses: [{ id: 'kid', species: 'goat', role: 'kid', dmiPct: null, defaultWeightKg: 18 }],
      animalWeightRecords: [],
    });
    expect(d.dmiPct).toBe(4);
    expect(d.basis).toBe('members+default');
    expect(dmiBasisNote(d)).toBe('1 head at standard class DMI % (class has no DMI %)');
  });

  it('W0: no member live that day → window default 2.5% × stored head × avg', () => {
    const gw = openGw({ dateLeft: '2026-03-20', headCount: 10, avgWeightKg: 400 });
    const d = groupDayDmi(gw, '2026-03-10', { memberships: [], animals: [], animalClasses: classes, animalWeightRecords: [] });
    expect(d).toMatchObject({ dmiPct: 2.5, basis: 'window-default', head: 10, avgWeightKg: 400 });
    expect(d.kg).toBeCloseTo(100);
    expect(dmiBasisNote(d)).toBe('1 group window at default 2.5% (no members that day)');
    // Without memberships at all (pure calc callers) the same rule holds.
    expect(groupDayDmi(gw, '2026-03-10').kg).toBeCloseTo(100);
  });

  it('closed window: stored head/avg × that day\'s member mix', () => {
    const gw = openGw({ dateJoined: '2026-03-01', dateLeft: '2026-03-20', headCount: 4, avgWeightKg: 300 });
    const ctx = {
      memberships: [mem('a1'), mem('a2', 'g', '2026-01-01', '2026-03-10')],
      animals: [{ id: 'a1', classId: 'c-cow' }, { id: 'a2', classId: 'c-calf' }],
      animalClasses: classes, animalWeightRecords: [wt('a1', 500), wt('a2', 100)],
    };
    const before = groupDayDmi(gw, '2026-03-05', ctx);
    expect(before.head).toBe(4);
    expect(before.avgWeightKg).toBe(300);
    expect(before.dmiPct).toBeCloseTo((500 * 2.5 + 100 * 3) / 600);
    const after = groupDayDmi(gw, '2026-03-15', ctx);
    expect(after.dmiPct).toBeCloseTo(2.5); // the calf left on 03-10
    expect(after.kg).toBeCloseTo(4 * 300 * 0.025);
    // Window totals read at the leave day use the last present day's mix.
    expect(groupDayDmi(gw, '2026-03-20', ctx).dmiPct).toBeCloseTo(2.5);
  });

  it('groupWindowsDailyDemand rows carry the effective %, basis and kg; the daily total sums them', () => {
    const ctx = {
      groupWindows: [openGw()],
      memberships: [mem('a1'), mem('a2')],
      animals: [{ id: 'a1', classId: 'c-cow' }, { id: 'a2' }],
      animalClasses: { 'c-cow': cow },
      animalWeightRecords: [wt('a1', 500), wt('a2', 500)],
    };
    const [row] = groupWindowsDailyDemand('2026-03-10', ctx);
    expect(row.species).toBeNull();
    expect(row.dmiPct).toBeCloseTo(2.5);
    expect(row.basis).toBe('members+default');
    expect(groupWindowsDailyDmiKg('2026-03-10', ctx)).toBeCloseTo(row.kg);
    expect(row.kg).toBeCloseTo(2 * 500 * 0.025);
  });

  it('NPK excretion rates come from the same member mix; no members → defaults', () => {
    const ctx = {
      memberships: [mem('a1'), mem('a2')],
      animals: [{ id: 'a1', classId: 'c-cow' }, { id: 'a2', classId: 'c-calf' }],
      animalClasses: classes, animalWeightRecords: [wt('a1', 300), wt('a2', 100)],
    };
    const r = groupDayExcretionRates(openGw(), '2026-03-10', ctx);
    expect(r.n).toBeCloseTo((300 * 0.145 + 100 * 0.2) / 400);
    expect(r.p).toBeCloseTo((300 * 0.041 + 100 * 0.05) / 400);
    expect(r.k).toBeCloseTo((300 * 0.136 + 100 * 0.1) / 400);
    expect(groupDayExcretionRates(openGw(), '2026-03-10', { ...ctx, memberships: [] }, { n: 1, p: 2, k: 3 })).toEqual({ n: 1, p: 2, k: 3 });
  });

  it('the basis note counts one group window once across days', () => {
    const gw = openGw();
    const row = { groupWindow: gw, basis: 'members+default', head: 3, fallbacks: { noClassHeads: 2, noRateHeads: 0, seedHeads: 0 } };
    expect(dmiBasisNote([row, row, row])).toBe('2 head at default 2.5% (no class)');
  });
});

describe('OI-0279 one fixture, identical per-day demand on every surface', () => {
  const ok = () => ({ valid: true, errors: [] });
  const id = (r) => r;
  const put = (type, rec) => add(type, rec, ok, id, type);
  const today = getLocalTodayStr();
  const iso = (offset) => {
    const d = new Date(`${today}T12:00:00`); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  beforeAll(() => setLocale('en', en));
  beforeEach(() => {
    _reset();
    localStorage.clear();
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem: 'metric' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op' });
    put('locations', { id: 'L', operationId: 'op', farmId: 'farm', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4 });
    put('groups', { id: 'g', operationId: 'op', name: 'Herd' });
    put('animalClasses', { ...cow, operationId: 'op', name: 'Cow' });
    put('animalClasses', { ...calf, operationId: 'op', name: 'Calf' });
    put('animals', { id: 'a1', operationId: 'op', classId: 'c-cow', active: true, sex: 'female' });
    put('animals', { id: 'a2', operationId: 'op', classId: 'c-calf', active: true, sex: 'male' });
    put('animals', { id: 'a3', operationId: 'op', classId: null, active: true, sex: 'female' });
    for (const a of ['a1', 'a2', 'a3']) put('animalGroupMemberships', { ...mem(a), operationId: 'op' });
    put('animalWeightRecords', { ...wt('a1', 500), operationId: 'op' });
    put('animalWeightRecords', { ...wt('a2', 150), operationId: 'op' });
    put('animalWeightRecords', { ...wt('a3', 400), operationId: 'op' });
    put('events', { id: 'e', operationId: 'op', farmId: 'farm', dateOut: null });
    put('eventPaddockWindows', { id: 'pw', operationId: 'op', eventId: 'e', locationId: 'L', dateOpened: iso(-5), timeOpened: '08:00', dateClosed: null, areaPct: 100 });
    put('eventGroupWindows', { id: 'gw', operationId: 'op', eventId: 'e', groupId: 'g', dateJoined: iso(-5), timeJoined: '08:00', dateLeft: null, headCount: 3, avgWeightKg: 350 });
  });

  function expected() {
    const gw = getAll('eventGroupWindows')[0];
    return groupDayDmi(gw, today, {
      memberships: getAll('animalGroupMemberships'), animals: getAll('animals'),
      animalClasses: getAll('animalClasses'), animalWeightRecords: getAll('animalWeightRecords'),
    });
  }

  it('DMI-8, FED-6, calendar, Home and Event detail all give the per-class demand', () => {
    const exp = expected();
    const pct = (500 * 2.5 + 150 * 3 + 400 * 2.5) / 1050;
    expect(exp.dmiPct).toBeCloseTo(pct);
    expect(exp.kg).toBeCloseTo(3 * 350 * pct / 100);
    expect(exp.basis).toBe('members+default');

    // DMI-8: the chart context now carries every class (was empty).
    const ctx = buildDmi8ChartContext('e');
    expect(Object.keys(ctx.animalClasses).sort()).toEqual(['c-calf', 'c-cow']);
    expect(groupWindowsDailyDmiKg(today, ctx)).toBeCloseTo(exp.kg);
    const days = computeDmi8Days({ id: 'e' }, getCalcByName('DMI-8'), { today });
    expect(days[days.length - 1].basisNote).toBe('1 head at default 2.5% (no class)');

    // FED-6 / DMI-9: farm demand on a day with no feed.
    const classMap = Object.fromEntries(getAll('animalClasses').map(c => [c.id, c]));
    const fed6 = computeFeedRunRate({
      today, days: 1, feedTypes: [], animalClasses: classMap,
      events: [{ id: 'e', dateIn: iso(-5), dateOut: null }],
      entries: [], checks: [], items: [], batches: [],
      groupWindows: getAll('eventGroupWindows'), memberships: getAll('animalGroupMemberships'),
      animals: getAll('animals'), animalWeightRecords: getAll('animalWeightRecords'),
    });
    expect(fed6.impliedPasture.demandDmKgPerDay).toBeCloseTo(exp.kg);

    // Calendar: one no-hay pasture day at the only location = that day's demand.
    const loc = getAll('locations')[0];
    const m = computeLocationMetrics(loc, {
      windowStart: today, windowEnd: today, today,
      events: getAll('events'), paddockWindows: getAll('eventPaddockWindows'), groupWindows: getAll('eventGroupWindows'),
      memberships: getAll('animalGroupMemberships'), animals: getAll('animals'), animalClasses: getAll('animalClasses'),
      animalWeightRecords: getAll('animalWeightRecords'), locations: getAll('locations'),
    });
    expect(m.dmiKg).toBeCloseTo(exp.kg);
    expect(m.dmiBasisNote).toBe('1 head at default 2.5% (no class)');

    // Home location card.
    const card = buildLocationCard({ id: 'e' }, 'op', 'farm', 'imperial');
    const homeLine = card.querySelector('[data-testid="dashboard-loc-dmi-e"]');
    expect(homeLine.textContent).toContain(`${convert(exp.kg, 'weight', 'toImperial').toFixed(0)} lbs/day`);
    expect(homeLine.title).toBe('1 head at default 2.5% (no class)');

    // Event detail DMI line.
    openEventDetailSheet({ id: 'e' }, 'op', 'farm');
    const detailLine = document.querySelector('[data-testid="detail-dmi-line"]');
    expect(detailLine.textContent).toContain(`${display(exp.kg, 'weight', 'metric', 1)} kg/day`);
    expect(detailLine.title).toBe('1 head at default 2.5% (no class)');
  });
});

describe('OI-0279 tooltip notes', () => {
  it('Period totals join the per-location notes onto the DMI totals', () => {
    const t = aggregatePeriodTotals([
      { stripPastureDmiKg: 10, storedFeedDmiKg: 0, dmiBasisNote: '1 head at default 2.5% (no class)' },
      { stripPastureDmiKg: 5, storedFeedDmiKg: 0, dmiBasisNote: null },
    ]);
    expect(t.dmiBasisNote).toBe('1 head at default 2.5% (no class)');
    expect(aggregatePeriodTotals([{ stripPastureDmiKg: 1, storedFeedDmiKg: 0 }]).dmiBasisNote).toBeNull();
  });
  it('the DMI-8 chart shows the day notes on hover; none when every class applies', () => {
    const day = (basisNote) => ({ date: '2026-03-10', label: 'Tue', result: { status: 'estimated', totalDmiKg: 10, pastureDmiKg: 10, storedDmiKg: 0 }, basisNote });
    const withNote = renderDmiChart([day(null), day('2 head at default 2.5% (no class)')], 'metric');
    expect(withNote.querySelector('[data-testid="dmi-chart-basis-note"]').title).toBe('2 head at default 2.5% (no class)');
    expect(renderDmiChart([day(null)], 'metric').querySelector('[data-testid="dmi-chart-basis-note"]')).toBeNull();
  });
});

describe('OI-0279 grep: no class reads off group windows or animals by the wrong field', () => {
  // Pending Design (OI-0279 report): the weaning nudge reads animal.animalClassId;
  // fixing it turns weaning nudges on, which Design has not scoped.
  const ALLOWED = new Set(['src/features/dashboard/index.js:a.animalClassId']);
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.(js|mjs)$/.test(name)) out.push(p);
    }
    return out;
  }
  it('no .animalClassId reads in src/ (besides the one held for Design)', () => {
    const root = join(__dirname, '../..');
    const hits = [];
    for (const file of walk(join(root, 'src'))) {
      const rel = relative(root, file).replaceAll('\\', '/');
      for (const match of readFileSync(file, 'utf8').matchAll(/([\w$?]+)\.animalClassId\b/g)) {
        const key = `${rel}:${match[0]}`;
        if (!ALLOWED.has(key)) hits.push(key);
      }
    }
    expect(hits).toEqual([]);
  });
});
