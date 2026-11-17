/** @file DMI-9 implied pasture DMI (window lane) — computed in the FED-6 day loop. */
import { describe, it, expect } from 'vitest';
import { computeFeedRunRate, pastureSpeciesGroup } from '../../src/calcs/feed-run-rate.js';
import { getCalcByName as getCalc } from '../../src/utils/calc-registry.js';

const types = [{ id: 'hay', unit: 'bale' }];
const feed = (id, eventId, date, q) => ({ id, eventId, locationId: 'p', feedTypeId: 'hay', kind: 'inventory_feeding', entryType: 'delivery', batchId: 'b1', date, time: '09:00', quantity: q, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80 });
const check = (id, eventId, date) => ({ id, eventId, date, time: '12:00', isCloseReading: false });
const item = (checkId, q) => ({ id: `i-${checkId}`, feedCheckId: checkId, locationId: 'p', feedTypeId: 'hay', batchId: null, remainingQuantity: q, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80 });
const classes = { cow: { id: 'cow', species: 'beef_cattle', dmiPct: 2.5 }, ewe: { id: 'ewe', species: 'sheep', dmiPct: 3 } };

/** 10 bales 11-01, check 6 on 11-05, +5 on 11-10, check 1 on 11-15: 10 measured days eating 400 kg DM/day. */
function hay({ head = 10, avg = 500, cls = undefined } = {}) {
  return {
    today: '2026-11-30', days: 30, feedTypes: types, animalClasses: classes,
    events: [{ id: 'e', dateIn: '2026-11-01', dateOut: null }],
    entries: [feed('f1', 'e', '2026-11-01', 10), feed('f2', 'e', '2026-11-10', 5)],
    checks: [check('c1', 'e', '2026-11-05'), check('c2', 'e', '2026-11-15')],
    items: [item('c1', 6), item('c2', 1)],
    batches: [{ id: 'b1', feedTypeId: 'hay', unit: 'bale', costPerUnit: 60, weightPerUnitKg: 500, dmPct: 80 }],
    groupWindows: [{ id: 'g', eventId: 'e', dateJoined: '2026-11-01', dateLeft: null, headCount: head, avgWeightKg: avg, animalClassId: cls }],
  };
}

describe('DMI-9 implied pasture, window lane', () => {
  it('is registered as its own calc reading the FED-6 field', () => {
    const calc = getCalc('DMI-9');
    expect(calc.category).toBe('dmi');
    expect(calc.fn(hay({ head: 100, cls: 'cow' }))).toEqual(computeFeedRunRate(hay({ head: 100, cls: 'cow' })).impliedPasture);
  });
  it('pasture = demand − stored eaten over farm-measured days, per day, % of demand and per head per species', () => {
    const p = computeFeedRunRate(hay({ head: 100, cls: 'cow' })).impliedPasture;
    expect(p).toMatchObject({ status: 'ok', countedDays: 10, measuredDays: 10, noHayDays: 0, windowDays: 30, demandDmKg: 12500, storedDmKg: 4000, signedDmKg: 8500 });
    expect(p.pastureDmKgPerDay).toBeCloseTo(850);
    expect(p.pasturePct).toBeCloseTo(68);
    expect(p.overDemandDmKgPerDay).toBe(0);
    expect(p.bySpecies.cattle.pasturePerHeadKg).toBeCloseTo(8.5);
    expect(p.bySpecies.cattle.avgHead).toBe(100);
    expect(p).not.toHaveProperty('pasturePerHeadKg');
  });
  it('shares the FED-6 forecast and consumed on the same days, so pasture % + stored % = 100', () => {
    const r = computeFeedRunRate(hay({ head: 100, cls: 'cow' }));
    expect(r.impliedPasture.demandDmKgPerDay).toBeCloseTo(r.rate.forecastDmKgPerDay);
    expect(r.impliedPasture.storedDmKgPerDay).toBeCloseTo(r.rate.dmKgPerDay);
    expect(r.impliedPasture.pasturePct + r.rate.pctOfForecast).toBeCloseTo(100);
  });
  it('stored above demand floors pasture at 0 and reports the over-demand figure; the signed value is kept', () => {
    const p = computeFeedRunRate(hay()).impliedPasture;
    expect(p).toMatchObject({ status: 'ok', pastureDmKgPerDay: 0, pasturePct: 0, signedDmKg: -2750 });
    expect(p.overDemandDmKgPerDay).toBeCloseTo(275);
    expect(p.overDemandPct).toBeCloseTo(220);
    expect(p.signedDmKgPerDay).toBeCloseTo(-275);
    expect(p.signedPct).toBeCloseTo(-220);
  });
  it('nets signed days over the window before the floor', () => {
    // A second event with no hay and its own herd: demand counts on the measured days.
    const input = hay();
    input.events.push({ id: 'e2', dateIn: '2026-11-01', dateOut: null });
    input.groupWindows.push({ id: 'g2', eventId: 'e2', dateJoined: '2026-11-01', dateLeft: null, headCount: 30, avgWeightKg: 500 });
    const p = computeFeedRunRate(input).impliedPasture;
    expect(p.demandDmKg).toBe(5000);
    expect(p.signedDmKg).toBe(1000);
    expect(p.pastureDmKgPerDay).toBeCloseTo(100);
  });
  it('days with no pool active anywhere count as no-hay days (stored 0 known)', () => {
    const input = { ...hay({ head: 10, cls: 'cow' }), entries: [], checks: [], items: [], days: 7 };
    const p = computeFeedRunRate(input).impliedPasture;
    expect(p).toMatchObject({ status: 'ok', countedDays: 7, noHayDays: 7, measuredDays: 0, storedDmKg: 0 });
    expect(p.pastureDmKgPerDay).toBeCloseTo(125);
    expect(p.pasturePct).toBeCloseTo(100);
  });
  it('a no-hay day on a pure confinement event is not counted (no grazing there)', () => {
    const input = { ...hay({ head: 10, cls: 'cow' }), entries: [], checks: [], items: [], days: 7,
      paddockWindows: [{ id: 'pw', eventId: 'e', locationId: 'barn', dateOpened: '2026-11-01', dateClosed: null }], locations: { barn: { id: 'barn', type: 'confinement' } } };
    const p = computeFeedRunRate(input).impliedPasture;
    expect(p).toMatchObject({ status: 'unknown', reason: 'no_usable_days', countedDays: 0, dropped: { confinement: 7, noWeight: 0, storedWithoutDemand: 0 } });
    input.locations.barn.type = 'land';
    expect(computeFeedRunRate(input).impliedPasture.countedDays).toBe(7);
  });
  it('unknown, never 0, with no counted day', () => {
    const p = computeFeedRunRate({ ...hay(), today: '2026-11-04', days: 7, periodStart: '2026-11-01' }).impliedPasture;
    expect(p).toMatchObject({ status: 'unknown', reason: 'no_counted_days', countedDays: 0 });
    expect(p).not.toHaveProperty('pastureDmKgPerDay');
  });
  it('drops a day with head but no usable weight and says so', () => {
    const p = computeFeedRunRate(hay({ avg: 0 })).impliedPasture;
    expect(p).toMatchObject({ status: 'unknown', reason: 'no_usable_days', dropped: { noWeight: 10 } });
  });
  it('drops a day when feed was eaten on an event with no animals (no demand source)', () => {
    const input = hay(); input.groupWindows = [];
    const p = computeFeedRunRate(input).impliedPasture;
    expect(p).toMatchObject({ status: 'unknown', dropped: { storedWithoutDemand: 10 } });
  });
  it('zero demand on every counted day reads No animals', () => {
    const input = { ...hay(), entries: [], checks: [], items: [], groupWindows: [], days: 7 };
    expect(computeFeedRunRate(input).impliedPasture).toMatchObject({ status: 'no_animals', countedDays: 7 });
  });
  it('splits an event\'s eaten feed across species by demand share and omits species with no demand', () => {
    const input = hay({ head: 100, cls: 'cow' });
    input.groupWindows.push({ id: 'g2', eventId: 'e', dateJoined: '2026-11-01', dateLeft: null, headCount: 50, avgWeightKg: 50, animalClassId: 'ewe' });
    const p = computeFeedRunRate(input).impliedPasture;
    // Cattle 1250 kg/day, sheep 50 × 50 × 3% = 75 kg/day; stored 400 kg/day split 1250:75.
    expect(p.bySpecies.cattle.demandDmKgPerDay).toBeCloseTo(1250);
    expect(p.bySpecies.sheep.demandDmKgPerDay).toBeCloseTo(75);
    expect(p.bySpecies.cattle.storedDmKgPerDay + p.bySpecies.sheep.storedDmKgPerDay).toBeCloseTo(400);
    expect(p.bySpecies.sheep.storedDmKgPerDay).toBeCloseTo(400 * 75 / 1325);
    expect(p.bySpecies.sheep.pasturePerHeadKg).toBeCloseTo((75 - 400 * 75 / 1325) / 50);
    expect(p.bySpecies).not.toHaveProperty('goat');
    expect(Object.keys(p.bySpecies)).toEqual(['cattle', 'sheep']);
  });
  it('a window with no class takes species from its live members, DM by live-weight share and heads by count', () => {
    const input = hay();
    input.animalClasses = { cow: { ...classes.cow, defaultWeightKg: 500 }, ewe: { ...classes.ewe, defaultWeightKg: 50 } };
    input.groupWindows = [{ id: 'g', eventId: 'e', groupId: 'grp', dateJoined: '2026-11-01', dateLeft: null, headCount: 2, avgWeightKg: 275 }];
    input.animals = [{ id: 'a1', classId: 'cow' }, { id: 'a2', classId: 'ewe' }];
    input.memberships = [{ id: 'm1', animalId: 'a1', groupId: 'grp', dateJoined: '2026-11-01' }, { id: 'm2', animalId: 'a2', groupId: 'grp', dateJoined: '2026-11-01' }];
    input.animalWeightRecords = [];
    const p = computeFeedRunRate(input).impliedPasture;
    expect(p.demandDmKgPerDay).toBeCloseTo(2 * 275 * 0.025);
    expect(p.bySpecies.cattle.avgHead).toBeCloseTo(1);
    expect(p.bySpecies.sheep.avgHead).toBeCloseTo(1);
    // 1 cow at 500 kg and 1 ewe at 50 kg: 13.75 kg/day splits 12.5 / 1.25 by weight.
    expect(p.bySpecies.cattle.demandDmKgPerDay).toBeCloseTo(12.5);
    expect(p.bySpecies.sheep.demandDmKgPerDay).toBeCloseTo(1.25);
    expect(p.bySpecies.sheep.storedDmKgPerDay).toBeCloseTo(400 * 1.25 / 13.75);
  });
  it('a closed window still takes species from the members live on that date (a sheep group that moved mid-window)', () => {
    const input = hay();
    input.events.push({ id: 'e2', dateIn: '2026-11-10', dateOut: null });
    input.animalClasses = { ewe: { ...classes.ewe, defaultWeightKg: 50 } };
    input.animals = [{ id: 'flock', classId: 'ewe', isBulk: true, bulkHeadCount: 40 }];
    input.memberships = [{ id: 'm', animalId: 'flock', groupId: 'sheep', dateJoined: '2026-11-01' }];
    input.animalWeightRecords = [];
    input.groupWindows = [
      { id: 'g1', eventId: 'e', groupId: 'sheep', dateJoined: '2026-11-01', dateLeft: '2026-11-10', headCount: 40, avgWeightKg: 50 },
      { id: 'g2', eventId: 'e2', groupId: 'sheep', dateJoined: '2026-11-10', dateLeft: null, headCount: 40, avgWeightKg: 50 },
    ];
    const p = computeFeedRunRate(input).impliedPasture;
    // Nov 5–9 on the closed window are sheep; Nov 10–14 the feed on e has no animals (dropped).
    expect(p.dropped.storedWithoutDemand).toBe(5);
    expect(p.countedDays).toBe(5);
    expect(Object.keys(p.bySpecies)).toEqual(['sheep']);
    expect(p.bySpecies.sheep.avgHead).toBe(40);
    expect(p.bySpecies.sheep.demandDmKg).toBeCloseTo(p.demandDmKg);
    // With no member live that day, the closed window has no species row.
    input.memberships = [{ id: 'm', animalId: 'flock', groupId: 'sheep', dateJoined: '2026-11-20' }];
    expect(computeFeedRunRate(input).impliedPasture.bySpecies).toEqual({});
  });
  it('maps species to display groups', () => {
    expect(['beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other', null].map(pastureSpeciesGroup)).toEqual(['cattle', 'cattle', 'sheep', 'goat', 'other', null]);
  });
  it('leaves the FED-6 result otherwise unchanged and is pure', () => {
    const input = hay({ head: 100, cls: 'cow' });
    const before = JSON.stringify(input);
    const r = computeFeedRunRate(input);
    expect(JSON.stringify(input)).toBe(before);
    expect(r.measuredDays).toBe(10);
    expect(r.rate.dmKgPerDay).toBeCloseTo(400);
  });
});
