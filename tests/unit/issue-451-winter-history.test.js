/**
 * @file #451 — winter hay history (045 historical_feedings + historical_animal_basis)
 * in date-range need, stored feed eaten and pasture: the calendar season/Period
 * totals strip (Calendar and List identical) and the Home Total/Pasture DMI.
 * Snapshots only, inclusive period_end, event windows win (sheep clipped at the
 * first event day), 11-18 rule per species, N1 even spread (locked), no
 * inventory / batch effect, and the D2 display (comment 1710): strip note, a
 * read-only Winter history row on Calendar and List, one block per basis row.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as store from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState, setMetricWindow, setView } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, _resetFarmSeasonEditor } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { aggregatePeriodTotals } from '../../src/features/events/rotation-calendar/location-metrics.js';
import {
  basisNeedKgPerDay, historyFeedingDmKg, computeWinterHistory, sliceWinterHistory,
  spreadWinterHistoryHay, spreadHistoryHayEvenly, spreadHistoryHayByNeed, historyDatesInclusive, winterHistoryBlocks, dateRuns,
} from '../../src/calcs/winter-history.js';
import {
  winterHistoryTotals, winterHistoryClipFn, groupSpeciesEver,
} from '../../src/features/events/rotation-calendar/winter-history-metrics.js';
import { WINTER_HISTORY_STRIP_NOTE } from '../../src/features/events/rotation-calendar/winter-history-row.js';
import { homeTotalDmiKg, homePastureDmiKg, homeDmiCtxFromStore, homePeriodRange, computeHomeDmi } from '../../src/features/dashboard/home-dmi.js';
import { SYNC_REGISTRY } from '../../src/data/sync-registry.js';
import { ENTITY_TYPES } from '../../src/data/store.js';
import { localSupabaseRow } from '../../src/data/push-all.js';
import * as HF from '../../src/entities/historical-feeding.js';
import * as HB from '../../src/entities/historical-animal-basis.js';

beforeAll(() => setLocale('en', enLocale));

const basis = (o) => ({ id: o.id || `b-${o.periodStart}-${o.species}`, operationId: 'op', farmId: 'farm', groupId: null, headCount: 10, avgWeightKg: 500, dmiPctSnapshot: 2.5, dmiSource: 'class_default', sourceKey: o.id || 'k', ...o });
const feeding = (o) => ({ id: o.id || `f-${o.date}`, operationId: 'op', farmId: 'farm', quantity: 1, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 400, dmPctSnapshot: 85, species: 'beef_cattle', sourceKey: o.id || 'k', ...o });

describe('#451 calc: need, hay, pasture (fixture)', () => {
  const B = [basis({ species: 'beef_cattle', periodStart: '2026-01-01', periodEnd: '2026-01-10' })];
  const F = [feeding({ id: 'f1', date: '2026-01-03', quantity: 2 }), feeding({ id: 'f2', date: '2026-01-08' })];

  it('need = head × kg × dmi%/100 per day; hay = quantity × weight snapshot × DM% snapshot', () => {
    expect(basisNeedKgPerDay(B[0])).toBeCloseTo(125, 9);
    expect(historyFeedingDmKg(F[0])).toBeCloseTo(680, 9);
    expect(historyFeedingDmKg({ quantity: 3, weightPerUnitKgSnapshot: 293.4743, dmPctSnapshot: 85 })).toBeCloseTo(748.359465, 6);
  });

  it('N1: hay spread evenly over the counted basis days, then the 11-18 rule per day', () => {
    const t = sliceWinterHistory(computeWinterHistory({ basisRows: B, feedingRows: F }), '2025-12-01', '2026-02-28');
    expect(t.needKg).toBeCloseTo(1250, 9);          // 10 days × 125
    expect(t.hayKg).toBeCloseTo(1020, 9);            // 680 + 340
    expect(t.pastureKg).toBeCloseTo(230, 9);         // (125 − 102) × 10
    expect(t.hayOverNeedKg).toBeCloseTo(0, 9);
    expect(t.bySpecies.cattle.days).toBe(10);
    // A window slice sees its share only.
    const part = sliceWinterHistory(computeWinterHistory({ basisRows: B, feedingRows: F }), '2026-01-09', '2026-01-31');
    expect(part.needKg).toBeCloseTo(250, 9);
    expect(part.hayKg).toBeCloseTo(204, 9);
  });

  it('hay over need is reported separately (not netted), per species', () => {
    const big = [feeding({ id: 'big', date: '2026-01-02', quantity: 10 })]; // 3,400 kg over 10 days
    const t = sliceWinterHistory(computeWinterHistory({ basisRows: B, feedingRows: big }), '2026-01-01', '2026-01-31');
    expect(t.pastureKg).toBeCloseTo(0, 9);
    expect(t.hayOverNeedKg).toBeCloseTo(3400 - 1250, 9);
    // Sheep hay never offsets cattle need.
    const sheepHay = [feeding({ id: 's', date: '2026-01-02', quantity: 10, species: 'sheep' })];
    const t2 = sliceWinterHistory(computeWinterHistory({ basisRows: B, feedingRows: sheepHay }), '2026-01-01', '2026-01-31');
    expect(t2.bySpecies.cattle.pastureKg).toBeCloseTo(1250, 9);
    expect(t2.bySpecies.sheep.hayOverNeedKg).toBeCloseTo(3400, 9);
  });

  it('period_end is inclusive (a one-day basis counts one day)', () => {
    expect(historyDatesInclusive('2026-01-01', '2026-01-01')).toEqual(['2026-01-01']);
    expect(historyDatesInclusive('2025-10-01', '2026-03-03')).toHaveLength(154);
    const one = [basis({ species: 'beef_cattle', periodStart: '2026-01-05', periodEnd: '2026-01-05' })];
    expect(sliceWinterHistory(computeWinterHistory({ basisRows: one }), '2026-01-01', '2026-01-31').needKg).toBeCloseTo(125, 9);
    expect(sliceWinterHistory(computeWinterHistory({ basisRows: B }), '2026-01-10', '2026-01-10').needKg).toBeCloseTo(125, 9);
  });

  it('N1 (locked): equal hay per counted basis day, not on delivery dates', () => {
    const need = new Map(historyDatesInclusive('2026-01-01', '2026-01-10').map(d => [d, 125]));
    const hay = spreadWinterHistoryHay(F, need);
    expect([...hay.keys()]).toEqual([...need.keys()]);
    for (const v of hay.values()) expect(v).toBeCloseTo(102, 9);  // 1020 / 10
    expect(hay.get('2026-01-03')).toBeCloseTo(hay.get('2026-01-04'), 9);
    // No counted basis day: hay stays on its delivery dates (all over need).
    const none = spreadWinterHistoryHay(F, new Map());
    expect(none.get('2026-01-03')).toBeCloseTo(680, 9);
    expect(none.get('2026-01-08')).toBeCloseTo(340, 9);
  });

  it('spread choice is one function: even is live; demand-weighted is a tested sibling, not wired', () => {
    const need = new Map([['2026-01-01', 300], ['2026-01-02', 100]]);
    const hay = [feeding({ id: 'h', date: '2026-01-01', quantity: 1, weightPerUnitKgSnapshot: 200, dmPctSnapshot: 100 })]; // 200 kg
    expect([...spreadWinterHistoryHay(hay, need)]).toEqual([...spreadHistoryHayEvenly(hay, need)]);
    const byNeed = spreadHistoryHayByNeed(hay, need);
    expect(byNeed.get('2026-01-01')).toBeCloseTo(150, 9);  // 200 × 300/400
    expect(byNeed.get('2026-01-02')).toBeCloseTo(50, 9);
    // No counted days → delivery dates; no hay → nothing.
    expect(spreadHistoryHayByNeed(hay, new Map()).get('2026-01-01')).toBeCloseTo(200, 9);
    expect(spreadHistoryHayByNeed([], need).size).toBe(0);
    // Live wiring stays even (fixture: 1020 kg over 10 equal-need days).
    const B2 = [basis({ species: 'beef_cattle', periodStart: '2026-01-01', periodEnd: '2026-01-10' })];
    const t = sliceWinterHistory(computeWinterHistory({ basisRows: B2, feedingRows: F }), '2026-01-01', '2026-01-31');
    expect(t.pastureKg).toBeCloseTo(230, 9);
  });

  it('blocks: one per basis row spanning its counted dates, with species hay + pasture', () => {
    const rows = [basis({ id: 'b1', groupLabel: 'Cows', species: 'beef_cattle', periodStart: '2026-01-01', periodEnd: '2026-01-10' })];
    const bl = winterHistoryBlocks(computeWinterHistory({ basisRows: rows, feedingRows: F }));
    expect(bl).toHaveLength(1);
    expect(bl[0]).toMatchObject({ basisId: 'b1', label: 'Cows', headCount: 10, start: '2026-01-01', end: '2026-01-10', days: 10 });
    expect(bl[0].needKgPerDay).toBeCloseTo(125, 9);
    expect(bl[0].speciesHayKg).toBeCloseTo(1020, 9);
    expect(bl[0].speciesPastureKg).toBeCloseTo(230, 9);
    expect(dateRuns(['2026-01-03', '2026-01-01', '2026-01-02', '2026-01-05'])).toEqual([
      { start: '2026-01-01', end: '2026-01-03', days: 3 }, { start: '2026-01-05', end: '2026-01-05', days: 1 },
    ]);
  });
});

describe('#451 event windows win (clip)', () => {
  const classes = [{ id: 'cs', species: 'sheep' }, { id: 'cc', species: 'beef_cattle' }];
  const animals = [{ id: 'ewe', classId: 'cs' }, { id: 'cow', classId: 'cc' }];
  // Sheep group: its only member joins Feb 1 (after the placeholder starts), like prod's Nov 6.
  const memberships = [
    { id: 'm1', animalId: 'ewe', groupId: 'gS', dateJoined: '2026-02-01', dateLeft: null },
    { id: 'm2', animalId: 'cow', groupId: 'gC', dateJoined: '2025-09-01', dateLeft: null },
  ];
  const events = [{ id: 'eS', dateOut: '2026-02-01' }, { id: 'eC', dateOut: null }];
  const paddockWindows = [
    { id: 'pS', eventId: 'eS', locationId: 'L', dateOpened: '2026-01-21', dateClosed: '2026-02-01', areaPct: 100 },
    { id: 'pC', eventId: 'eC', locationId: 'L', dateOpened: '2026-01-06', dateClosed: null, areaPct: 100 },
  ];
  const groupWindows = [
    { id: 'wS', eventId: 'eS', groupId: 'gS', dateJoined: '2026-01-21', dateLeft: '2026-02-01', headCount: 70, avgWeightKg: 45.36 },
    { id: 'wC', eventId: 'eC', groupId: 'gC', dateJoined: '2026-01-06', dateLeft: null, headCount: 1, avgWeightKg: 500 },
  ];
  const ctx = { events, paddockWindows, groupWindows, memberships, animals, animalClasses: classes, animalWeightRecords: [] };

  it('a group with no live members takes the species of anyone ever in it', () => {
    expect([...groupSpeciesEver(ctx).get('gS')]).toEqual(['sheep']);
  });

  it('sheep basis (no group) stops the day before the first sheep event-window day', () => {
    const sheep = basis({ id: 'bs', species: 'sheep', headCount: 80, avgWeightKg: 50, dmiPctSnapshot: 3, periodStart: '2026-01-01', periodEnd: '2026-05-31' });
    const h = computeWinterHistory({ basisRows: [sheep], isClipped: winterHistoryClipFn(ctx) });
    const days = [...h.get('sheep').needByDate.keys()].sort();
    expect(days[0]).toBe('2026-01-01');
    expect(days.at(-1)).toBe('2026-05-31');
    expect(days).not.toContain('2026-01-21');
    expect(days).toContain('2026-01-20');
    // Clipped only while a sheep window has need (Jan 21–31; the window leaves Feb 1).
    expect(days.filter(d => d >= '2026-01-21' && d <= '2026-01-31')).toEqual([]);
  });

  it('sheep block spans Oct 1 – Mar 3 after the clip (sheep windows from Mar 4)', () => {
    const c2 = {
      ...ctx,
      events: [{ id: 'eS2', dateOut: null }],
      paddockWindows: [{ id: 'pS2', eventId: 'eS2', locationId: 'L', dateOpened: '2026-03-04', dateClosed: null, areaPct: 100 }],
      groupWindows: [{ id: 'wS2', eventId: 'eS2', groupId: 'gS', dateJoined: '2026-03-04', dateLeft: null, headCount: 70, avgWeightKg: 45.36 }],
      memberships: [{ id: 'm1', animalId: 'ewe', groupId: 'gS', dateJoined: '2025-09-01', dateLeft: null }],
    };
    const sheep = basis({ id: 'bs', species: 'sheep', groupLabel: 'Sheep', headCount: 80, avgWeightKg: 50, dmiPctSnapshot: 3, periodStart: '2025-10-01', periodEnd: '2026-03-18' });
    const bl = winterHistoryBlocks(computeWinterHistory({ basisRows: [sheep], isClipped: winterHistoryClipFn(c2) }));
    expect(bl.map(b => [b.label, b.start, b.end, b.days])).toEqual([['Sheep', '2025-10-01', '2026-03-03', 154]]);
  });

  it('a basis row with a group is clipped by that group only, not by another group of its species', () => {
    const cowsG = basis({ id: 'bg', species: 'beef_cattle', groupId: 'gC', periodStart: '2026-01-01', periodEnd: '2026-01-31' });
    const otherG = basis({ id: 'bo', species: 'beef_cattle', groupId: 'gOther', periodStart: '2026-01-01', periodEnd: '2026-01-31' });
    const isClipped = winterHistoryClipFn(ctx);
    const h = computeWinterHistory({ basisRows: [cowsG], isClipped });
    expect([...h.get('cattle').needByDate.keys()].sort().at(-1)).toBe('2026-01-05');
    const h2 = computeWinterHistory({ basisRows: [otherG], isClipped });
    expect(h2.get('cattle').needByDate.size).toBe(31);
  });
});

describe('#451 store, strip and Home', () => {
  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const origWidth = window.innerWidth;
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

  function seed({ history = true } = {}) {
    _reset();
    localStorage.clear();
    resetCalendarState();
    _resetFarmSeasonEditor();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op', seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31 });
    put('locations', { id: 'L1', operationId: 'op', farmId: 'farm', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4, archived: false });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-06-01' });
    put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1', dateOpened: '2026-03-04', dateClosed: '2026-06-01', areaPct: 100 });
    put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: '2026-06-01', headCount: 1, avgWeightKg: 500 });
    put('batches', { id: 'bat', operationId: 'op', feedTypeId: 'ft', quantity: 7, remaining: 7 });
    if (history) {
      put('historicalAnimalBasis', basis({ id: 'hb', species: 'beef_cattle', groupLabel: 'Cow-Calf', periodStart: '2026-01-01', periodEnd: '2026-01-10' }));
      put('historicalFeedings', feeding({ id: 'hf1', date: '2026-01-03', quantity: 2 }));
      put('historicalFeedings', feeding({ id: 'hf2', date: '2026-01-08' }));
    }
  }
  const strip = (c, key) => c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`)?.textContent ?? null;
  const lb = (text) => Number(String(text).replace(/[^0-9.]/g, ''));
  function render(view) {
    document.body.innerHTML = '';
    setView(view);
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  }
  function stripFor(view) {
    const c = render(view);
    return { pasture: strip(c, 'pastureDmi'), stored: strip(c, 'storedDmi'), total: strip(c, 'totalDmi') };
  }


  it('the two 045 tables are pull-only entity types (registry yes, push shape no)', () => {
    expect(ENTITY_TYPES).toContain('historicalFeedings');
    expect(ENTITY_TYPES).toContain('historicalAnimalBasis');
    expect(SYNC_REGISTRY.historicalFeedings).toMatchObject({ table: 'historical_feedings' });
    expect(SYNC_REGISTRY.historicalAnimalBasis).toMatchObject({ table: 'historical_animal_basis' });
    seed();
    expect(localSupabaseRow('historical_feedings', 'hf1')).toBeNull();
    expect(localSupabaseRow('historical_animal_basis', 'hb')).toBeNull();
    expect(HF.toSupabaseShape).toBeUndefined();
    expect(HB.toSupabaseShape).toBeUndefined();
    const f = HF.fromSupabaseShape({ id: 'x', operation_id: 'op', date: '2026-01-01', quantity: '4', unit_snapshot: 'bale', weight_per_unit_kg_snapshot: '293.4743', dm_pct_snapshot: '85', species: 'beef_cattle', source_key: 'k' });
    expect(historyFeedingDmKg(f)).toBeCloseTo(4 * 293.4743 * 0.85, 9);
    const b = HB.fromSupabaseShape({ id: 'y', operation_id: 'op', period_start: '2025-10-01', period_end: '2026-03-03', species: 'beef_cattle', head_count: 31, avg_weight_kg: '421.3873', dmi_pct_snapshot: '2.5741', dmi_source: 'class_mix', source_key: 'k' });
    expect(basisNeedKgPerDay(b)).toBeCloseTo(31 * 421.3873 * 0.025741, 9);
  });

  it('Calendar and List strips are identical and include the history (pasture + stored)', () => {
    seed({ history: false });
    setMetricWindow('2026-01-01', '2026-12-31');
    const without = { calendar: stripFor('calendar'), list: stripFor('list') };
    seed({ history: true });
    setMetricWindow('2026-01-01', '2026-12-31');
    const withH = { calendar: stripFor('calendar'), list: stripFor('list') };
    expect(withH.calendar).toEqual(withH.list);
    expect(without.calendar).toEqual(without.list);
    const KG_LB = 2.20462262;
    expect(lb(withH.calendar.pasture) - lb(without.calendar.pasture)).toBeCloseTo(230 * KG_LB, -1);
    expect(lb(withH.calendar.stored) - lb(without.calendar.stored)).toBeCloseTo(1020 * KG_LB, -1);
  });

  it('a window outside the history adds nothing', () => {
    seed();
    const ctx = homeDmiCtxFromStore();
    expect(winterHistoryTotals(ctx, '2026-03-01', '2026-12-31', '2026-12-31').needKg).toBe(0);
    expect(aggregatePeriodTotals([], { history: winterHistoryTotals(ctx, '2026-03-01', '2026-12-31', '2026-12-31') }).winterHistory).toBeNull();
  });

  it("Home 'All' starts at the earliest data date including winter history; unchanged without it", () => {
    expect(homePeriodRange('All', {
      today: '2026-11-24', events: [{ dateIn: '2026-03-04' }], groupWindows: [{ dateJoined: '2026-03-04' }],
      historicalAnimalBasis: [{ periodStart: '2025-10-01' }], historicalFeedings: [{ date: '2025-10-03' }],
    })).toEqual({ start: '2025-10-01', end: '2026-11-24' });
    // A feeding before any basis start also counts as data.
    expect(homePeriodRange('All', {
      today: '2026-11-24', events: [{ dateIn: '2026-03-04' }], historicalAnimalBasis: [{ periodStart: '2025-10-01' }], historicalFeedings: [{ date: '2025-09-28' }],
    }).start).toBe('2025-09-28');
    // No history → as before (earliest event / group-window start).
    expect(homePeriodRange('All', {
      today: '2026-11-24', events: [{ dateIn: '2026-03-04' }], groupWindows: [{ dateJoined: '2026-03-02' }],
    })).toEqual({ start: '2026-03-02', end: '2026-11-24' });
    // Store path: with history, 'All' reaches Jan 1 and counts its need.
    seed();
    const withH = computeHomeDmi('All', { today: '2026-11-24', ctx: homeDmiCtxFromStore() });
    expect(withH.start).toBe('2026-01-01');
    seed({ history: false });
    const without = computeHomeDmi('All', { today: '2026-11-24', ctx: homeDmiCtxFromStore() });
    expect(without.start).toBe('2026-03-04');
    expect(withH.totalDmiKg - without.totalDmiKg).toBeCloseTo(1250, 6);
  });

  it('Home Total adds the history need; Home Pasture matches the strip figure', () => {
    seed();
    const ctx = homeDmiCtxFromStore();
    const total = homeTotalDmiKg('2026-01-01', '2026-01-31', ctx).totalDmiKg;
    expect(total).toBeCloseTo(1250, 6);
    const p = homePastureDmiKg('2026-01-01', '2026-01-31', ctx, '2026-11-24').pastureDmiKg;
    expect(p).toBeCloseTo(230, 6);
  });

  it('no inventory, batch or write effect: reading history never calls add/update/remove', () => {
    seed();
    const before = JSON.stringify(getAll('batches'));
    const spies = ['add', 'update', 'remove'].map(fn => vi.spyOn(store, fn));
    setMetricWindow('2026-01-01', '2026-12-31');
    stripFor('calendar');
    stripFor('list');
    homePastureDmiKg('2026-01-01', '2026-12-31', homeDmiCtxFromStore(), '2026-11-24');
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    expect(JSON.stringify(getAll('batches'))).toBe(before);
    expect(getAll('batchLocationBalances')).toEqual([]);
    expect(getAll('batchAdjustments')).toEqual([]);
  });
});

describe('#451 D2 display: Winter history row, blocks, strip note', () => {
  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const origWidth = window.innerWidth;
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

  function seed({ archived = false } = {}) {
    _reset();
    localStorage.clear();
    resetCalendarState();
    _resetFarmSeasonEditor();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op', seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31 });
    put('locations', { id: 'L1', operationId: 'op', farmId: 'farm', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4, archived });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-06-01' });
    put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1', dateOpened: '2026-03-04', dateClosed: '2026-06-01', areaPct: 100 });
    put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: '2026-06-01', headCount: 1, avgWeightKg: 500 });
    put('historicalAnimalBasis', basis({ id: 'hb', species: 'beef_cattle', groupLabel: 'Cow-Calf', periodStart: '2026-01-01', periodEnd: '2026-01-10' }));
    put('historicalFeedings', feeding({ id: 'hf1', date: '2026-01-03', quantity: 2 }));
    put('historicalFeedings', feeding({ id: 'hf2', date: '2026-01-08' }));
  }
  function render(view) {
    document.body.innerHTML = '';
    setView(view);
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  }
  const q = (c, id) => c.querySelector(`[data-testid="${id}"]`);
  const qa = (c, id) => [...c.querySelectorAll(`[data-testid="${id}"]`)];
  const val = (c, key) => q(c, `winter-history-${key}`)?.querySelector('.loc-mgmt__metric-value')?.textContent ?? null;
  const stripVal = (c, key) => q(c, `loc-mgmt-period-total-${key}`)?.textContent ?? null;
  const lb = (text) => Number(String(text).replace(/[^0-9.]/g, ''));

  it('row + blocks + strip note appear only when the period overlaps history', () => {
    seed();
    setMetricWindow('2026-03-01', '2026-12-31');
    for (const view of ['calendar', 'list']) {
      const c = render(view);
      expect(q(c, 'winter-history-row')).toBeNull();
      expect(qa(c, 'winter-history-block')).toHaveLength(0);
      expect(q(c, 'loc-mgmt-period-totals-winter-note')).toBeNull();
    }
    setMetricWindow('2026-01-01', '2026-12-31');
    for (const view of ['calendar', 'list']) {
      const c = render(view);
      const row = q(c, 'winter-history-row');
      expect(row).not.toBeNull();
      // At the top: the first row in the body, before any location row.
      const rows = [...c.querySelectorAll('.loc-mgmt__row')];
      expect(rows[0]).toBe(row);
      expect(row.textContent).toContain('Winter history');
      const note = q(c, 'loc-mgmt-period-totals-winter-note');
      expect(note.textContent).toBe(WINTER_HISTORY_STRIP_NOTE);
      expect(note.title).toMatch(/Jan 1.*Jan 10/);
      expect(note.title).toMatch(/need .*stored feed .*pasture /);
    }
  });

  it('Calendar: one read-only block per basis row (label, {head} hd, hover); List has no blocks', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-12-31');
    const cal = render('calendar');
    const blocks = qa(cal, 'winter-history-block');
    expect(blocks).toHaveLength(1);
    const b = blocks[0];
    expect(b.dataset.start).toBe('2026-01-01');
    expect(b.dataset.end).toBe('2026-01-10');
    expect(b.querySelector('.winter-history-block__label').textContent).toBe('Cow-Calf');
    expect(b.querySelector('.winter-history-block__head').textContent).toBe('10 hd');
    expect(b.title).toMatch(/10 hd · avg 1,102 lb · DMI 2.5%/);
    expect(b.title).toMatch(/Need 276 lb DM\/day/);
    expect(b.title).toMatch(/winter hay \(spread\): 2,249 lb DM · pasture 507 lb DM/);
    expect(qa(render('list'), 'winter-history-block')).toHaveLength(0);
  });

  it('tap shows the hover only: no navigation, no sheet, no store write', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-12-31');
    const c = render('calendar');
    const hash = window.location.hash;
    const spies = ['add', 'update', 'remove'].map(fn => vi.spyOn(store, fn));
    const b = q(c, 'winter-history-block');
    const tip = b.querySelector('[data-testid="winter-history-block-tip"]');
    expect(tip.hidden).toBe(true);
    b.click();
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toContain('Cow-Calf');
    expect(window.location.hash).toBe(hash);
    expect(document.querySelector('.sheet-wrap.open, .sheet.open, [data-testid="past-event-detail-sheet"]')).toBeNull();
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    const row = q(c, 'winter-history-row');
    expect(row.querySelector('button, a, input')).toBeNull();
  });

  it('List and Calendar show the same history share; strip = location rows + history row', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-12-31');
    const cal = render('calendar');
    const calVals = { need: val(cal, 'need'), stored: val(cal, 'stored'), pasture: val(cal, 'pasture') };
    const calStrip = { pasture: stripVal(cal, 'pastureDmi'), stored: stripVal(cal, 'storedDmi') };
    const list = render('list');
    expect({ need: val(list, 'need'), stored: val(list, 'stored'), pasture: val(list, 'pasture') }).toEqual(calVals);
    expect(calVals).toEqual({ need: '2,756 lb', stored: '2,249 lb', pasture: '507 lb' });
    // Location rows alone (history removed) + the history row = the strip.
    const withH = { pasture: lb(calStrip.pasture), stored: lb(calStrip.stored) };
    seedNoHistory();
    setMetricWindow('2026-01-01', '2026-12-31');
    const bare = render('calendar');
    expect(withH.pasture - lb(stripVal(bare, 'pastureDmi'))).toBeCloseTo(lb(calVals.pasture), 0);
    expect(withH.stored - lb(stripVal(bare, 'storedDmi'))).toBeCloseTo(lb(calVals.stored), 0);
    expect(q(bare, 'winter-history-row')).toBeNull();
  });

  function seedNoHistory() {
    seed();
    for (const t of ['historicalAnimalBasis', 'historicalFeedings']) {
      for (const r of [...store.getAll(t)]) store.remove(t, r.id, t);
    }
  }

  it('not a location: the archive toggle and location filters do not hide it', () => {
    seed({ archived: true });
    put('locations', { id: 'L2', operationId: 'op', farmId: 'farm', name: 'South', type: 'land', landUse: 'pasture', areaHectares: 4, archived: false });
    setMetricWindow('2026-01-01', '2026-12-31');
    for (const view of ['calendar', 'list']) {
      const c = render(view);
      expect(c.querySelector('[data-testid="loc-mgmt-row"][data-location-id="L1"]')).toBeNull();
      expect(q(c, 'winter-history-row')).not.toBeNull();
      expect(q(c, 'winter-history-row').dataset.locationId).toBeUndefined();
    }
  });
});
