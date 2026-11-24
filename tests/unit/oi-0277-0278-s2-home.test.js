/**
 * @file OI-0277 Hd3 + OI-0278 S2 — Home DMI tiles and Home units.
 *
 * OI-0277: Total DMI (herd need) + Pasture DMI (calendar Period totals path),
 * each group-day counted once and only inside the period pill; Pasture % =
 * Pasture DMI ÷ Total DMI. OI-0278 S2: Home tiles / cards / DMI chart labels
 * through the shared units helper (compact tiles, no doubled units).
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as ForageTypeEntity from '../../src/entities/forage-type.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PaddockWindowEntity from '../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as PaddockObsEntity from '../../src/entities/paddock-observation.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/capacity.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import { formatMeasure } from '../../src/utils/units.js';
import { groupWindowsDailyDmiKg } from '../../src/calcs/window-helpers.js';
import {
  buildLocationMetricRows, aggregatePeriodTotals, eachDateInclusive,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import {
  HOME_PERIOD_DAYS, homePeriodRange, homeDmiCtxFromStore, homeTotalDmiKg,
  homePastureDmiKg, computeHomeDmi, totalDmiTitle, pastureDmiTitle, eventsWithDates,
} from '../../src/features/dashboard/home-dmi.js';
import {
  renderDashboard, buildLocationCard, computePasturePercent,
} from '../../src/features/dashboard/index.js';
import { renderDmiChart } from '../../src/ui/dmi-chart.js';

const OP = '00000000-0000-0000-0000-0000000002aa';
const FARM = '00000000-0000-0000-0000-0000000002bb';
const FT = '00000000-0000-0000-0000-0000000002cc';
const CLASS = '00000000-0000-0000-0000-0000000002cd';
const LOC_A = '00000000-0000-0000-0000-0000000002d1';
const LOC_B = '00000000-0000-0000-0000-0000000002d2';
const LOC_C = '00000000-0000-0000-0000-0000000002d3';
const EVT_A = '00000000-0000-0000-0000-0000000002e1';
const EVT_B = '00000000-0000-0000-0000-0000000002e2';
const PW_A = '00000000-0000-0000-0000-0000000002f1';
const PW_B = '00000000-0000-0000-0000-0000000002f2';
const GROUP = '00000000-0000-0000-0000-000000000301';
const GW_A = '00000000-0000-0000-0000-000000000302';
const GW_B = '00000000-0000-0000-0000-000000000303';
const GW_B2 = '00000000-0000-0000-0000-000000000304';

const DAY_KG = 125; // 10 head × 500 kg × 2.5 %

beforeAll(() => setLocale('en', enLocale));

function shift(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Group of 10 (500 kg, 2.5 %) grazes A from today-5, moves to B on today-2
 * (A closes, B opens the same day). B's land use is configurable.
 */
function seed({ today, unitSystem = 'imperial', bLandUse = 'pasture', bType = 'land', bArchived = false, dupWindow = false } = {}) {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  const d5 = shift(today, -5);
  const d2 = shift(today, -2);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('forageTypes', ForageTypeEntity.create({
    id: FT, operationId: OP, name: 'Mixed', dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 65, dmPct: 22,
  }), ForageTypeEntity.validate, ForageTypeEntity.toSupabaseShape, 'forage_types');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow',
    dmiPct: 2.5, dmiPctLactating: 3.0, defaultWeightKg: 500,
    excretionNRate: 0.34, excretionPRate: 0.092, excretionKRate: 0.24,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  for (let i = 0; i < 10; i++) {
    const aid = `00000000-0000-0000-0000-00000000b${i.toString().padStart(3, '0')}`;
    add('animals', AnimalEntity.create({
      id: aid, operationId: OP, tagNum: `B${i}`, active: true, animalClassId: CLASS, dateBorn: '2024-01-01', sex: 'F',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: aid, groupId: GROUP, dateJoined: d5, dateLeft: null,
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  }
  add('locations', LocationEntity.create({
    id: LOC_A, operationId: OP, farmId: FARM, name: 'A', type: 'land', landUse: 'pasture', areaHectares: 4, forageTypeId: FT,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_B, operationId: OP, farmId: FARM, name: 'B', type: bType, landUse: bType === 'land' ? bLandUse : null,
    areaHectares: 2, forageTypeId: FT, archived: bArchived,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('events', EventEntity.create({ id: EVT_A, operationId: OP, farmId: FARM, type: 'graze', dateIn: d5, dateOut: d2 }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('events', EventEntity.create({ id: EVT_B, operationId: OP, farmId: FARM, type: 'graze', dateIn: d2, dateOut: null }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_A, operationId: OP, eventId: EVT_A, locationId: LOC_A, dateOpened: d5, dateClosed: d2, areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventPaddockWindows', PaddockWindowEntity.create({
    id: PW_B, operationId: OP, eventId: EVT_B, locationId: LOC_B, dateOpened: d2, areaPct: 100,
  }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_A, operationId: OP, eventId: EVT_A, groupId: GROUP, animalClassId: CLASS,
    dateJoined: d5, dateLeft: d2, headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    id: GW_B, operationId: OP, eventId: EVT_B, groupId: GROUP, animalClassId: CLASS,
    dateJoined: d2, headCount: 10, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  if (dupWindow) {
    // Overlapping second open window for the same group (data glitch) — counted once.
    add('eventGroupWindows', GroupWindowEntity.create({
      id: GW_B2, operationId: OP, eventId: EVT_B, groupId: GROUP, animalClassId: CLASS,
      dateJoined: shift(today, -1), headCount: 10, avgWeightKg: 500,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}

const TODAY = '2026-06-10';

describe('OI-0277 homePeriodRange', () => {
  it('24h / 3d / 7d / 30d are the last N calendar days ending today', () => {
    expect(HOME_PERIOD_DAYS).toEqual({ '24h': 1, '3d': 3, '7d': 7, '30d': 30 });
    expect(homePeriodRange('24h', { today: TODAY })).toEqual({ start: TODAY, end: TODAY });
    expect(homePeriodRange('3d', { today: TODAY })).toEqual({ start: '2026-06-08', end: TODAY });
    expect(homePeriodRange('7d', { today: TODAY })).toEqual({ start: '2026-06-04', end: TODAY });
    expect(homePeriodRange('30d', { today: TODAY })).toEqual({ start: '2026-05-12', end: TODAY });
  });

  it('All starts at the earliest event / group-window start; nothing → null start', () => {
    expect(homePeriodRange('All', { today: TODAY })).toEqual({ start: null, end: TODAY });
    expect(homePeriodRange('All', {
      today: TODAY, events: [{ dateIn: '2026-03-01' }], groupWindows: [{ dateJoined: '2026-02-15' }],
    })).toEqual({ start: '2026-02-15', end: TODAY });
  });

  it('eventsWithDates derives a missing dateIn from the earliest window', () => {
    const out = eventsWithDates([{ id: 'e1', dateOut: null }, { id: 'e2' }], {
      paddockWindows: [{ eventId: 'e1', dateOpened: '2026-05-02' }],
      groupWindows: [{ eventId: 'e1', dateJoined: '2026-05-01' }],
    });
    expect(out).toEqual([{ id: 'e1', dateIn: '2026-05-01', dateOut: null }]);
  });
});

describe('OI-0277 Total DMI — each group-day once, inside the period', () => {
  beforeEach(() => seed({ today: TODAY }));

  it('counts the move day once (leave day on A excluded) — 7d = 6 group-days', () => {
    const ctx = homeDmiCtxFromStore();
    const { start, end } = homePeriodRange('7d', { today: TODAY });
    const { totalDmiKg, rows } = homeTotalDmiKg(start, end, ctx);
    // A: today-5 .. today-3 (3 days, leave day today-2 excluded); B: today-2 .. today (3 days).
    expect(totalDmiKg).toBeCloseTo(6 * DAY_KG, 6);
    expect(rows).toHaveLength(6);
    // Move day (today-2) is B's, not A's and B's.
    expect(rows.map(r => r.eventId)).toEqual([EVT_A, EVT_A, EVT_A, EVT_B, EVT_B, EVT_B]);
  });

  it('equals Σ groupWindowsDailyDmiKg over the period (one formula)', () => {
    const ctx = homeDmiCtxFromStore();
    const { start, end } = homePeriodRange('30d', { today: TODAY });
    let expected = 0;
    for (const dt of eachDateInclusive(start, end)) {
      expected += groupWindowsDailyDmiKg(dt, { ...ctx, events: eventsWithDates(ctx.events, ctx) });
    }
    expect(homeTotalDmiKg(start, end, ctx).totalDmiKg).toBeCloseTo(expected, 6);
    expect(expected).toBeCloseTo(6 * DAY_KG, 6);
  });

  it('clips to the period: 24h = 1 day, 3d = 3 days', () => {
    expect(computeHomeDmi('24h', { today: TODAY }).totalDmiKg).toBeCloseTo(DAY_KG, 6);
    expect(computeHomeDmi('3d', { today: TODAY }).totalDmiKg).toBeCloseTo(3 * DAY_KG, 6);
    expect(computeHomeDmi('All', { today: TODAY }).totalDmiKg).toBeCloseTo(6 * DAY_KG, 6);
  });

  it('an overlapping second window for the same group is still counted once a day', () => {
    seed({ today: TODAY, dupWindow: true });
    expect(computeHomeDmi('7d', { today: TODAY }).totalDmiKg).toBeCloseTo(6 * DAY_KG, 6);
  });
});

describe('OI-0277 Pasture DMI + Pasture %', () => {
  it('all-pasture: Pasture DMI = Total DMI → 100 % green', () => {
    seed({ today: TODAY });
    const r = computeHomeDmi('7d', { today: TODAY });
    expect(r.pastureDmiKg).toBeCloseTo(6 * DAY_KG, 6);
    expect(r.pasturePercent).toBe(100);
    expect(r.color).toBe('var(--color-green-base)');
  });

  it('Pasture DMI is the calendar Period totals figure for the same range', () => {
    seed({ today: TODAY });
    const ctx = homeDmiCtxFromStore();
    const { start, end } = homePeriodRange('7d', { today: TODAY });
    const rows = buildLocationMetricRows(ctx.locations, { ...ctx, windowStart: start, windowEnd: end, today: TODAY });
    const expected = aggregatePeriodTotals(rows).pastureDmiKg;
    expect(homePastureDmiKg(start, end, ctx, TODAY).pastureDmiKg).toBeCloseTo(expected, 6);
  });

  it('confinement days count in Total but not Pasture (3 of 6 days → 50 % amber)', () => {
    seed({ today: TODAY, bType: 'confinement' });
    const r = computeHomeDmi('7d', { today: TODAY });
    expect(r.totalDmiKg).toBeCloseTo(6 * DAY_KG, 6);
    expect(r.pastureDmiKg).toBeCloseTo(3 * DAY_KG, 6);
    expect(r.pasturePercent).toBe(50);
    expect(r.color).toBe('var(--color-amber-base)');
  });

  it('archived and non-pasture land are excluded from Pasture DMI', () => {
    seed({ today: TODAY, bArchived: true });
    expect(computeHomeDmi('3d', { today: TODAY }).pasturePercent).toBe(0);
    seed({ today: TODAY, bLandUse: 'crop' });
    const r = computeHomeDmi('3d', { today: TODAY });
    expect(r.pastureDmiKg).toBe(0);
    expect(r.color).toBe('var(--color-red-base)');
    seed({ today: TODAY, bLandUse: 'mixed_use' });
    expect(computeHomeDmi('3d', { today: TODAY }).pasturePercent).toBe(100);
  });

  it('no events → nulls and the teal colour', () => {
    _reset();
    const all = computeHomeDmi('All', { today: TODAY });
    expect(all).toMatchObject({ start: null, totalDmiKg: 0, pastureDmiKg: null, pasturePercent: null });
    expect(all.color).toBe('var(--color-teal-base)');
    const week = computeHomeDmi('7d', { today: TODAY });
    expect(week.totalDmiKg).toBe(0);
    expect(week.pasturePercent).toBeNull();
  });

  it('computePasturePercent sub-labels', () => {
    seed({ today: TODAY });
    const events = getAll('events');
    const r = computePasturePercent('7d', events, { today: TODAY });
    expect(r.pasturePercent).toBe(100);
    expect(r.subLabel).toBe('1 closed \u00B7 1 open');
    expect(computePasturePercent('7d', [], { homeDmi: { pasturePercent: null, totalDmiKg: 0 } }).subLabel).toBe('no grazing events');
    expect(computePasturePercent('7d', events, { homeDmi: { pasturePercent: null, totalDmiKg: 0 } }).subLabel).toBe('no animals on events');
    expect(computePasturePercent('7d', events, { homeDmi: { pasturePercent: null, totalDmiKg: 10 } }).subLabel).toBe('pasture DMI unknown');
  });

  it('tooltips state the scope of each tile', () => {
    seed({ today: TODAY });
    const r = computeHomeDmi('7d', { today: TODAY });
    expect(totalDmiTitle(r)).toMatch(/each group-day counted once/);
    expect(totalDmiTitle(r)).toMatch(/wherever the animals were/);
    expect(totalDmiTitle(r)).toContain('2026-06-04 to 2026-06-10');
    expect(pastureDmiTitle(r)).toMatch(/pasture and mixed-use land only/);
    expect(pastureDmiTitle(r)).toMatch(/archived/);
    expect(pastureDmiTitle({ ...r, dmiPartial: true })).toMatch(/partial/);
  });
});

describe('OI-0277 / OI-0278 S2 — Home desktop tiles (compact, farm unit)', () => {
  function tiles(unitSystem, period = '7d') {
    const today = getLocalTodayStr();
    seed({ today, unitSystem });
    localStorage.setItem('gtho_v2_home_stats_period', period);
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderDashboard(root);
    const q = (id) => root.querySelector(`[data-testid="${id}"]`);
    return { q, today };
  }

  it('imperial: Total + Pasture DMI tiles in compact lb', () => {
    const { q } = tiles('imperial');
    const total = q('dashboard-total-dmi');
    const pasture = q('dashboard-pasture-dmi');
    expect(total).toBeTruthy();
    expect(pasture).toBeTruthy();
    const expected = formatMeasure(6 * DAY_KG, 'weight', { unitSystem: 'imperial', compact: true });
    expect(expected).toBe('1.7k lb');
    expect(total.textContent).toContain('1.7k lb');
    expect(pasture.textContent).toContain('1.7k lb');
    expect(total.textContent).not.toMatch(/lbs/);
    expect(total.title).toMatch(/each group-day counted once/);
    expect(pasture.title).toMatch(/pasture and mixed-use land only/);
  });

  it('metric: tiles in kg, 30d compacts past 1,000', () => {
    const { q } = tiles('metric', '30d');
    expect(q('dashboard-total-dmi').textContent).toContain('750 kg');
    expect(q('dashboard-total-dmi').textContent).not.toMatch(/lb/);
  });

  it('NPK per-area tiles carry one unit (no "lbs/ac ac")', () => {
    const { q } = tiles('imperial');
    const npk = q('dashboard-npk-per-area');
    expect(npk).toBeTruthy();
    expect(npk.textContent).toMatch(/lb\/ac/);
    expect(npk.textContent).not.toMatch(/lbs|ac ac|\/ac\/ac/);
    const money = q('dashboard-npk-value-per-area');
    // No fertilizer prices in the fixture → "—" value; the label names acres once.
    expect(money.textContent).toMatch(/^(—|\$[\d.,]+\/ac)/);
    expect(money.textContent).toMatch(/[\d.]+ ac$/);
    expect(money.textContent).not.toMatch(/acres|ac ac|\/ac\/ac/);
    const metric = tiles('metric');
    expect(metric.q('dashboard-npk-per-area').textContent).toMatch(/kg\/ha/);
    expect(metric.q('dashboard-npk-per-area').textContent).not.toMatch(/lb|ac\b/);
  });
});

describe('OI-0278 S2 — location card units (no doubled units)', () => {
  function card(unitSystem) {
    const today = getLocalTodayStr();
    seed({ today, unitSystem });
    add('paddockObservations', PaddockObsEntity.create({
      operationId: OP, locationId: LOC_B, type: 'open', source: 'event', sourceId: PW_B,
      observedAt: `${shift(today, -2)}T12:00:00Z`, forageHeightCm: 20, forageCoverPct: 80,
    }), PaddockObsEntity.validate, PaddockObsEntity.toSupabaseShape, 'paddock_observations');
    return buildLocationCard({ id: EVT_B, dateIn: shift(today, -2), dateOut: null }, OP, FARM, unitSystem);
  }

  it('imperial: area "4.9 ac", height in "in", ADA "/ac", lb DM / lb/day', () => {
    const c = card('imperial');
    const text = c.textContent;
    const area = c.querySelector(`[data-testid="dashboard-loc-area-${EVT_B}"]`).textContent;
    expect(area).toBe(formatMeasure(2, 'area', { unitSystem: 'imperial' }));
    expect(area).toMatch(/ ac$/);
    expect(text).not.toMatch(/acres ac|lbs|ac ac|"/);
    expect(text).toContain(formatMeasure(20, 'length', { unitSystem: 'imperial' }));
    expect(text).toMatch(/ADA est: [\d.,]+\/ac/);
    const dmi = c.querySelector(`[data-testid="dashboard-loc-dmi-${EVT_B}"]`);
    expect(dmi.textContent).toMatch(/lb\/day/);
    const npk = c.querySelector(`[data-testid="dashboard-loc-npk-${EVT_B}"]`);
    // #462: label reads elemental.
    expect(npk.textContent).toMatch(/^NPK \(elemental\): N[\d.,]+ \/ P[\d.,]+ \/ K[\d.,]+ lb$/);
  });

  it('metric: area "2.00 ha", cm, ADA "/ha", kg (no lb anywhere)', () => {
    const c = card('metric');
    const text = c.textContent;
    const area = c.querySelector(`[data-testid="dashboard-loc-area-${EVT_B}"]`).textContent;
    expect(area).toBe(formatMeasure(2, 'area', { unitSystem: 'metric' }));
    expect(area).toMatch(/ ha$/);
    expect(text).toContain(formatMeasure(20, 'length', { unitSystem: 'metric' }));
    expect(text).toMatch(/ADA est: [\d.,]+\/ha/);
    expect(text).not.toMatch(/\blbs?\b|acres|"/);
    expect(c.querySelector(`[data-testid="dashboard-loc-dmi-${EVT_B}"]`).textContent).toMatch(/kg\/day/);
  });
});

describe('OI-0278 S2 — group card units', () => {
  it('DMI target "x lb/day" with a basis tooltip; avg weight "lb" once', () => {
    seed({ today: getLocalTodayStr() });
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderDashboard(root);
    root.querySelector('[data-testid="toggle-groups"]').click();
    const gc = root.querySelector(`[data-testid="dashboard-group-card-${GROUP}"]`).textContent;
    expect(gc).toMatch(/avg [\d,]+ lb/);
    expect(gc).not.toMatch(/lbs|lb lb/);
    const dmi = root.querySelector(`[data-testid="dashboard-group-dmi-${GROUP}"]`);
    expect(dmi).toBeTruthy();
    expect(dmi.textContent).toMatch(/[\d,]+ lb\/day/);
    expect(dmi.title).toBeTruthy();
  });
});

describe('OI-0278 S2 — DMI chart labels', () => {
  const days = [
    { date: '2026-06-08', label: 'Mon', result: { status: 'actual', totalDmiKg: 1000, storedDmiKg: 400, pastureDmiKg: 600 } },
    { date: '2026-06-09', label: 'Tue', result: { status: 'estimated', totalDmiKg: 1000, storedDmiKg: 400, pastureDmiKg: 400, deficitKg: 200 } },
    { date: '2026-06-10', label: 'Wed', result: { status: 'actual', totalDmiKg: 500, storedDmiKg: 0, pastureDmiKg: 500 } },
  ];

  it('imperial: "lb DMI today" (not "lbs"), numbers only on bars', () => {
    const chart = renderDmiChart(days, 'imperial');
    const text = chart.textContent;
    expect(text).toContain('lb DMI today');
    expect(text).not.toMatch(/lbs/);
    expect(text).toContain(formatMeasure(500, 'weight', { unitSystem: 'imperial', unitInHeader: true, decimals: 0 }));
    expect(text).toContain('1,102'); // today 500 kg → 1,102 lb
    expect(text).toContain('2,205'); // 1,000 kg bar
    expect(text).toContain('+441 deficit');
  });

  it('metric: "kg DMI today", kg numbers', () => {
    const text = renderDmiChart(days, 'metric').textContent;
    expect(text).toContain('kg DMI today');
    expect(text).toContain('1,000');
    expect(text).toContain('+200 deficit');
    expect(text).not.toMatch(/\blbs?\b/);
  });
});
