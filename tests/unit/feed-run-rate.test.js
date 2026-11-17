/** @file Feed run rate from feed checks — pure shared calc. */
import { describe, it, expect } from 'vitest';
import { computeFeedRunRate, poolDmPrices, shiftDate, FALLBACK_COST_PER_BALE } from '../../src/calcs/feed-run-rate.js';
import { poolDailyObservation, poolDailyActual, poolKey } from '../../src/calcs/feed-pools.js';

const types = [{ id: 'hay', unit: 'bale' }, { id: 'sq', unit: 'sq bale' }];
const feed = (id, eventId, feedTypeId, date, q, { w = 500, dm = 80, unit = 'bale', batchId = id, time = '09:00', loc = 'p' } = {}) =>
  ({ id, eventId, locationId: loc, feedTypeId, kind: 'inventory_feeding', entryType: 'delivery', batchId, date, time, quantity: q, unitSnapshot: unit, weightPerUnitKgSnapshot: w, dmPctSnapshot: dm });
const check = (id, eventId, date, isCloseReading = false) => ({ id, eventId, date, time: '12:00', isCloseReading });
const item = (checkId, feedTypeId, q, { w = 500, dm = 80, unit = 'bale', loc = 'p' } = {}) =>
  ({ id: `i-${checkId}-${feedTypeId}`, feedCheckId: checkId, locationId: loc, feedTypeId, batchId: null, remainingQuantity: q, unitSnapshot: unit, weightPerUnitKgSnapshot: w, dmPctSnapshot: dm });

/** One open round-bale event: 10 bales 11-01, check 6 on 11-05, +5 on 11-10, check 1 on 11-15. */
function openHay() {
  return {
    today: '2026-11-30', days: 30, feedTypes: types,
    events: [{ id: 'e', dateIn: '2026-11-01', dateOut: null }],
    entries: [feed('b1', 'e', 'hay', '2026-11-01', 10), feed('b1', 'e', 'hay', '2026-11-10', 5)].map((row, i) => ({ ...row, id: `f${i}` })),
    checks: [check('c1', 'e', '2026-11-05'), check('c2', 'e', '2026-11-15')],
    items: [item('c1', 'hay', 6), item('c2', 'hay', 1)],
    batches: [{ id: 'b1', feedTypeId: 'hay', unit: 'bale', costPerUnit: 60, weightPerUnitKg: 500, dmPct: 80 }],
    groupWindows: [{ id: 'g', eventId: 'e', dateJoined: '2026-11-01', dateLeft: null, headCount: 10, avgWeightKg: 500 }],
  };
}

describe('pool daily observation', () => {
  it('keeps poolDailyActual DM identical and adds the count-unit rate', () => {
    const input = { eventId: 'e', ...openHay() };
    const key = poolKey({ eventId: 'e', locationId: 'p', feedTypeId: 'hay' });
    const row = poolDailyObservation(input, '2026-11-08').get(key);
    expect(row).toEqual({ dm: 400, units: 1, unit: 'bale' });
    expect(poolDailyActual(input, '2026-11-08').get(key)).toBe(400);
  });
  it('mixed or unverified units report DM only', () => {
    const input = { eventId: 'e', ...openHay() };
    input.entries[1] = { ...input.entries[1], unitSnapshot: 'flake' };
    const row = poolDailyObservation(input, '2026-11-08').get(poolKey({ eventId: 'e', locationId: 'p', feedTypeId: 'hay' }));
    expect(row).toEqual({ dm: 400, units: null, unit: null });
  });
});

describe('computeFeedRunRate', () => {
  it('measures only days bracketed by two checks (earlier date exclusive, later inclusive)', () => {
    const r = computeFeedRunRate(openHay());
    expect(r.start).toBe('2026-11-01');
    expect(r.measuredDays).toBe(10);
    expect(r.lastMeasuredDate).toBe('2026-11-15');
    expect(r.rate.unitsPerDay).toEqual({ bale: 1 });
    expect(r.rate.dmKgPerDay).toBe(400);
    expect(r.consumed.units).toEqual({ bale: 10 });
    expect(r.consumed.dmKg).toBe(4000);
    // $60 a bale over 400 kg DM a bale.
    expect(r.consumed.cost).toBeCloseTo(600);
    expect(r.rate.forecastDmKgPerDay).toBe(125);
    expect(r.rate.pctOfForecast).toBeCloseTo(320);
    expect(r.residual).toMatchObject({ eventsClosed: 0, closesWithoutReading: 0, dmKg: 0 });
  });
  it('trailing windows end today inclusive', () => {
    const r = computeFeedRunRate({ ...openHay(), today: '2026-11-15', days: 7 });
    expect(r.start).toBe('2026-11-09');
    expect(r.measuredDays).toBe(7);
    expect(r.consumed.units.bale).toBeCloseTo(7);
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('a farm day is measured only when every pool holding feed is measured', () => {
    const input = openHay();
    // A second, unchecked pool on the same event holds feed all month.
    input.entries.push(feed('b2', 'e', 'sq', '2026-11-01', 20, { w: 25, dm: 90, unit: 'sq bale' }));
    const r = computeFeedRunRate(input);
    expect(r.measuredDays).toBe(0);
    expect(r.rate.dmKgPerDay).toBeNull();
    // Measured pool-days still count toward the window's consumed total.
    expect(r.consumed.dmKg).toBe(4000);
  });
  it('a pool emptied by a zero check stops being active', () => {
    const input = openHay();
    input.checks.push(check('c3', 'e', '2026-11-20'));
    input.items.push(item('c3', 'hay', 0));
    const r = computeFeedRunRate(input);
    expect(r.measuredDays).toBe(15);
    expect(r.consumed.units.bale).toBeCloseTo(11);
  });
  it('missing conversion leaves the day unmeasured; no checks gives the empty state', () => {
    const input = openHay();
    input.items[1] = { ...input.items[1], weightPerUnitKgSnapshot: null };
    expect(computeFeedRunRate(input).measuredDays).toBe(0);
    const none = computeFeedRunRate({ ...openHay(), checks: [], items: [] });
    expect(none).toMatchObject({ measuredDays: 0, hasChecks: false, lastMeasuredDate: null });
    expect(none.rate).toMatchObject({ dmKgPerDay: null, unitsPerDay: {} });
  });
  it('residual is what close readings left, less later moves out; open events add none', () => {
    const input = {
      today: '2026-11-30', days: 30, feedTypes: types,
      events: [
        { id: 'closed', dateIn: '2026-11-01', dateOut: '2026-11-20' },
        { id: 'noread', dateIn: '2026-11-01', dateOut: '2026-11-22' },
        { id: 'empty', dateIn: '2026-11-01', dateOut: '2026-11-23' },
        { id: 'old', dateIn: '2026-09-01', dateOut: '2026-10-15' },
      ],
      entries: [
        feed('sqb', 'closed', 'sq', '2026-11-01', 20, { w: 25, dm: 90, unit: 'sq bale' }),
        { ...feed('mv', 'closed', 'sq', '2026-11-21', 1, { w: 25, dm: 90, unit: 'sq bale', batchId: null }), kind: 'pool_removal', entryType: 'removal', destinationType: 'batch' },
        { ...feed('nr', 'noread', 'hay', '2026-11-02', 4), batchId: 'b1' },
        { ...feed('em', 'empty', 'hay', '2026-11-02', 2), batchId: 'b1' },
        { ...feed('ol', 'old', 'hay', '2026-09-02', 2), batchId: 'b1' },
      ],
      checks: [check('close', 'closed', '2026-11-20', true), check('zero', 'empty', '2026-11-10'), check('oldclose', 'old', '2026-10-15', true)],
      items: [item('close', 'sq', 4, { w: 25, dm: 90, unit: 'sq bale' }), item('zero', 'hay', 0), item('oldclose', 'hay', 1)],
      batches: [{ id: 'sqb', feedTypeId: 'sq', unit: 'sq bale', costPerUnit: null }, { id: 'b1', feedTypeId: 'hay', unit: 'bale', costPerUnit: 60 }],
    };
    const r = computeFeedRunRate(input);
    expect(r.residual.eventsClosed).toBe(3);
    expect(r.residual.closesWithoutReading).toBe(1);
    expect(r.residual.units).toEqual({ 'sq bale': 3 });
    expect(r.residual.dmKg).toBeCloseTo(67.5);
    // A sq-bale batch with no recorded cost has no fallback: "no cost", not $0.
    expect(r.residual.cost).toBeNull();
    expect(r.residual.unpricedDmKg).toBeCloseTo(67.5);
  });
  it('prices pool DM at the delivery-weighted batch cost with the $56 round-bale fallback', () => {
    const entries = [feed('priced', 'e', 'hay', '2026-11-01', 1), feed('nocost', 'e', 'hay', '2026-11-01', 1, { w: 250 }),
      { ...feed('carry', 'e', 'hay', '2026-11-01', 3, { batchId: null }), kind: 'pool_carry' }];
    const prices = poolDmPrices({ eventId: 'e', entries, batches: [{ id: 'priced', unit: 'bale', costPerUnit: 60 }, { id: 'nocost', unit: 'Bales', costPerUnit: null }] });
    expect(prices.get(poolKey({ eventId: 'e', locationId: 'p', feedTypeId: 'hay' }))).toBeCloseTo((60 + FALLBACK_COST_PER_BALE) / (400 + 200));
    const carryOnly = poolDmPrices({ eventId: 'e', entries: [entries[2]], batches: [] });
    expect(carryOnly.size).toBe(0);
  });
  it('mass-based pools add to DM only and is pure', () => {
    const input = openHay();
    input.entries[0] = { ...input.entries[0], unitSnapshot: 'flake' };
    const before = JSON.stringify(input);
    const r = computeFeedRunRate(input);
    expect(r.rate.unitsPerDay).toEqual({});
    expect(r.rate.dmKgPerDay).toBe(400);
    expect(JSON.stringify(input)).toBe(before);
  });
});
