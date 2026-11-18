/** @file Stored-feed intake between checks is spread over local calendar days by
 * elapsed time (DMI-5, shared by the pool path and the older non-pool path).
 * The DST vectors need a real DST zone, so this file pins America/New_York and
 * fails loudly (never skips) if the pin does not take. */
process.env.TZ = 'America/New_York';
import { describe, it, expect } from 'vitest';
import { elapsedDayShares, localInstantMs, poolDailyObservation, poolDailyActual, poolKey } from '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';

const LB = 2.20462;
const BALE_KG = 272.16, BALE_DM = 90; // one round bale of grass hay = 540.0 lb DM
const key = poolKey({ eventId: 'e', locationId: 'corral', feedTypeId: 'hay' });
const types = [{ id: 'hay', unit: 'bale' }];
const near = (actual, expected, tol) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);

// Pool-shape rows.
const feed = (id, date, time, q, { w = BALE_KG, dm = BALE_DM } = {}) => ({ id, eventId: 'e', locationId: 'corral', feedTypeId: 'hay', kind: 'inventory_feeding', entryType: 'delivery', batchId: 'b', date, time, quantity: q, unitSnapshot: 'bale', weightPerUnitKgSnapshot: w, dmPctSnapshot: dm });
const check = (id, date, time) => ({ id, eventId: 'e', date, time });
const item = (checkId, q, { w = BALE_KG, dm = BALE_DM } = {}) => ({ id: `i-${checkId}`, feedCheckId: checkId, locationId: 'corral', feedTypeId: 'hay', batchId: null, remainingQuantity: q, unitSnapshot: 'bale', weightPerUnitKgSnapshot: w, dmPctSnapshot: dm });

/** The corral event with Tim's corrected Nov 16 reading (0.75 bale left).
 * Intervals: 0.75 bale / 24.38 h, 1.00 / 26.03 h, 1.50 / 64.17 h, 0.09 / 26.87 h. */
function corralPool() {
  return {
    eventId: 'e', feedTypes: types,
    entries: [feed('f1', '2026-11-11', '08:00', 3), feed('f2', '2026-11-13', '16:00', 1)],
    checks: [check('c1', '2026-11-11', '14:37'), check('c2', '2026-11-12', '15:00'), check('c3', '2026-11-13', '17:02'), check('c4', '2026-11-16', '09:12'), check('c5', '2026-11-17', '12:04')],
    items: [item('c1', 3), item('c2', 2.25), item('c3', 2.25), item('c4', 0.75), item('c5', 0.66)],
  };
}
/** The same corral history in the older non-pool (batch) shape. */
function corralLegacy() {
  const pool = corralPool();
  return {
    feedEntries: pool.entries.map(({ id, date, time, quantity }) => ({ id, batchId: 'hay', date, time, quantity })),
    feedChecks: pool.checks.map(({ id, date, time }) => ({ id, date, time })),
    feedCheckItems: pool.items.map(({ feedCheckId, remainingQuantity }) => ({ feedCheckId, batchId: 'hay', remainingQuantity })),
    batches: { hay: { weightPerUnitKg: BALE_KG, dmPct: BALE_DM } },
  };
}
/** DMI-8 context: pure confinement, 22 head at 2.5% BW = 66.0 kg (145.5 lb) DM/day. */
function dmi8(date, feed) {
  return {
    event: { id: 'e', dateIn: '2026-11-11' }, date,
    groupWindows: [{ groupId: 'g', headCount: 22, avgWeightKg: 120, dateJoined: '2026-11-11' }], memberships: null, animals: [], animalWeightRecords: [], animalClasses: {},
    paddockWindows: [{ id: 'pw', eventId: 'e', locationId: 'corral', dateOpened: '2026-11-11' }], locations: { corral: { type: 'confinement' } }, forageTypes: {}, observations: [],
    ...feed,
  };
}
const poolDmi8 = (date) => {
  const pool = corralPool();
  return dmi8(date, { feedEntries: pool.entries, feedChecks: pool.checks, feedCheckItems: pool.items, batches: { b: { weightPerUnitKg: BALE_KG, dmPct: BALE_DM, feedTypeId: 'hay' } } });
};
const calc = () => getCalcByName('DMI-8');

describe('time zone pin', () => {
  it('runs in a real DST zone (America/New_York)', () => {
    expect(new Date(2026, 9, 31, 12).getTimezoneOffset()).toBe(240);
    expect(new Date(2026, 10, 2, 12).getTimezoneOffset()).toBe(300);
    expect((localInstantMs('2026-11-02', '00:00') - localInstantMs('2026-11-01', null)) / 3600000).toBe(25);
    expect((localInstantMs('2027-03-15', '00:00') - localInstantMs('2027-03-14', '00:00')) / 3600000).toBe(23);
  });
});

describe('corral fixture (corrected 0.75; lb DM/day)', () => {
  const expected = { '2026-11-11': 398.6, '2026-11-12': 435.8, '2026-11-13': 441.3, '2026-11-14': 303.0, '2026-11-15': 303.0, '2026-11-16': 142.9 };
  for (const [date, lb] of Object.entries(expected)) {
    it(`pool path ${date} = ${lb} lb`, () => near(poolDailyActual(corralPool(), date).get(key) * LB, lb, 0.1));
    it(`legacy path ${date} = ${lb} lb, same as the pool path`, () => {
      const legacy = calc().fn(dmi8(date, corralLegacy())).storedDmiKg;
      near(legacy * LB, lb, 0.1);
      expect(legacy).toBeCloseTo(poolDailyActual(corralPool(), date).get(key), 9);
    });
  }
  it('Nov 16 is 9.2 h at the 64.17 h rate plus 14.8 h at the 26.87 h rate', () => {
    const slow = 1.5 * BALE_KG * 0.9 / ((localInstantMs('2026-11-16', '09:12') - localInstantMs('2026-11-13', '17:02')) / 3600000);
    const last = 0.09 * BALE_KG * 0.9 / ((localInstantMs('2026-11-17', '12:04') - localInstantMs('2026-11-16', '09:12')) / 3600000);
    expect(poolDailyActual(corralPool(), '2026-11-16').get(key)).toBeCloseTo(9.2 * slow + 14.8 * last, 9);
  });
  it('count units follow the same split', () => {
    const row = poolDailyObservation(corralPool(), '2026-11-14');
    expect(row.get(key).unit).toBe('bale');
    expect(row.get(key).units).toBeCloseTo(1.5 * 24 / ((localInstantMs('2026-11-16', '09:12') - localInstantMs('2026-11-13', '17:02')) / 3600000), 9);
  });
  it('DMI-8 deficits: none Nov 11–15, 2.6 lb on Nov 16; Nov 17 stays estimated', () => {
    for (const date of ['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']) {
      expect(calc().fn(poolDmi8(date))).toMatchObject({ status: 'actual', deficitKg: 0, pastureDmiKg: 0 });
    }
    const nov16 = calc().fn(poolDmi8('2026-11-16'));
    expect(nov16.status).toBe('actual');
    near(nov16.totalDmiKg * LB, 145.5, 0.1);
    near(nov16.deficitKg * LB, 2.6, 0.1);
    expect(calc().fn(poolDmi8('2026-11-17')).status).toBe('estimated');
    // The older path already labels the anchored open-stretch cascade 'actual';
    // this PR does not change its status predicate.
    expect(calc().fn(dmi8('2026-11-17', corralLegacy())).status).toBe('actual');
    expect(poolDailyActual(corralPool(), '2026-11-17').has(key)).toBe(false);
  });
});

describe('DST days use real elapsed hours', () => {
  // Zero-intake readings a day either side keep the first-reading and
  // last-reading rules out of the vector, so each day shows only this interval.
  const dstPool = (days, from, to, eatenKg) => ({
    eventId: 'e', feedTypes: types,
    entries: [feed('f', days[0], '00:00', 1, { w: 100, dm: 100 })],
    checks: [check('a', days[0], '12:00'), check('b', from, '12:00'), check('c', to, '12:00'), check('d', days[1], '12:00')],
    items: [item('a', 1, { w: 100, dm: 100 }), item('b', 1, { w: 100, dm: 100 }), item('c', 1 - eatenKg / 100, { w: 100, dm: 100 }), item('d', 1 - eatenKg / 100, { w: 100, dm: 100 })],
  });
  it('fall back: Oct 31 12:00 → Nov 2 12:00, 49 kg over 49 h → 12 / 25 / 12 kg', () => {
    const input = dstPool(['2026-10-30', '2026-11-03'], '2026-10-31', '2026-11-02', 49);
    expect(poolDailyActual(input, '2026-10-31').get(key)).toBeCloseTo(12, 9);
    expect(poolDailyActual(input, '2026-11-01').get(key)).toBeCloseTo(25, 9);
    expect(poolDailyActual(input, '2026-11-02').get(key)).toBeCloseTo(12, 9);
  });
  it('spring forward: Mar 13 2027 12:00 → Mar 15 12:00, 47 kg over 47 h → 12 / 23 / 12 kg', () => {
    const input = dstPool(['2027-03-12', '2027-03-16'], '2027-03-13', '2027-03-15', 47);
    expect(poolDailyActual(input, '2027-03-13').get(key)).toBeCloseTo(12, 9);
    expect(poolDailyActual(input, '2027-03-14').get(key)).toBeCloseTo(23, 9);
    expect(poolDailyActual(input, '2027-03-15').get(key)).toBeCloseTo(12, 9);
  });
  it('the shared split gives the same hour shares to both paths', () => {
    const readings = [{ date: '2026-10-31', time: '12:00' }, { date: '2026-11-02', time: '12:00' }, { date: '2026-11-03', time: '12:00' }];
    expect(elapsedDayShares(readings, '2026-11-01')).toEqual([{ index: 0, share: 25 / 49 }]);
    // First reading's own date: the 12 h before it take the first interval's rate.
    expect(elapsedDayShares(readings, '2026-10-31')).toEqual([{ index: 0, share: 24 / 49 }]);
    expect(elapsedDayShares(readings, '2026-11-03')).toBeNull();
    expect(elapsedDayShares(readings, '2026-10-30')).toBeNull();
  });
  it('bare two readings, Oct 31 12:00 → Nov 2 12:00, 49 kg: Oct 31 = 24 kg (first-reading day), Nov 1 = 25 kg, Nov 2 not measured', () => {
    const input = {
      eventId: 'e', feedTypes: types,
      entries: [feed('f', '2026-10-31', '00:00', 1, { w: 100, dm: 100 })],
      checks: [check('a', '2026-10-31', '12:00'), check('b', '2026-11-02', '12:00')],
      items: [item('a', 1, { w: 100, dm: 100 }), item('b', 0.51, { w: 100, dm: 100 })],
    };
    expect(poolDailyActual(input, '2026-10-31').get(key)).toBeCloseTo(24, 9);
    expect(poolDailyActual(input, '2026-11-01').get(key)).toBeCloseTo(25, 9);
    expect(poolDailyActual(input, '2026-11-02').has(key)).toBe(false);
  });
  it('time-less readings across the fall-back day split by real hours: 24/49 and 25/49 (the one exception to time-less = calendar days)', () => {
    const readings = [{ date: '2026-10-31', time: null }, { date: '2026-11-02', time: null }, { date: '2026-11-03', time: null }];
    expect(elapsedDayShares(readings, '2026-10-31')).toEqual([{ index: 0, share: 24 / 49 }]);
    expect(elapsedDayShares(readings, '2026-11-01')).toEqual([{ index: 0, share: 25 / 49 }]);
  });
});

describe('compatibility', () => {
  const untimed = time => ({
    eventId: 'e', feedTypes: types,
    entries: [feed('f1', '2026-11-05', time, 4, { w: 100, dm: 100 }), feed('f2', '2026-11-07', time, 2, { w: 100, dm: 100 })],
    checks: [check('a', '2026-11-05', time), check('b', '2026-11-09', time), check('c', '2026-11-12', time)],
    items: [item('a', 4, { w: 100, dm: 100 }), item('b', 2, { w: 100, dm: 100 }), item('c', 0.5, { w: 100, dm: 100 })],
  });
  /** The calendar-day predicate and values the app used before the elapsed-time split. */
  const calendarDay = (input, date) => {
    const sorted = [...input.checks].sort((x, y) => x.date.localeCompare(y.date));
    const prev = sorted.filter(row => row.date <= date).at(-1), next = sorted.find(row => row.date > date);
    if (!prev || !next) return undefined;
    const rem = id => input.items.find(row => row.feedCheckId === id).remainingQuantity * 100;
    const fed = input.entries.filter(row => row.date > prev.date && row.date <= next.date).reduce((sum, row) => sum + row.quantity * 100, 0);
    const days = Math.round((new Date(`${next.date}T00:00:00Z`) - new Date(`${prev.date}T00:00:00Z`)) / 86400000);
    return Math.max(0, (rem(prev.id) + fed - rem(next.id)) / days);
  };
  const days = Array.from({ length: 12 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`);
  for (const time of [null, '']) {
    it(`time-less checks (${JSON.stringify(time)}) give exactly the calendar-day values and the same measured days`, () => {
      const input = untimed(time);
      for (const date of days) expect(poolDailyActual(input, date).get(key)).toBe(calendarDay(input, date));
    });
  }
  it('timed checks keep the same measured-day set and statuses as the calendar predicate', () => {
    const input = corralPool();
    for (const date of ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18']) {
      const measured = input.checks.some(row => row.date <= date) && input.checks.some(row => row.date > date);
      expect(poolDailyActual(input, date).has(key)).toBe(measured);
    }
  });
  it('a same-day 08:00 / 17:00 pair now lands on that date, in both paths', () => {
    const pool = {
      eventId: 'e', feedTypes: types,
      entries: [feed('f', '2026-11-05', '07:00', 6, { w: 100, dm: 100 })],
      checks: [check('a', '2026-11-05', '08:00'), check('b', '2026-11-05', '17:00'), check('c', '2026-11-06', '08:00')],
      items: [item('a', 6, { w: 100, dm: 100 }), item('b', 4, { w: 100, dm: 100 }), item('c', 3.25, { w: 100, dm: 100 })],
    };
    // 08:00 → 17:00 ate 200 kg in 9 h (also the rate for the 8 h before 08:00);
    // 17:00 → next 08:00 ate 75 kg in 15 h, 7 of them on Nov 5.
    const nov5 = 200 + 8 * 200 / 9 + 7 * 75 / 15;
    expect(poolDailyActual(pool, '2026-11-05').get(key)).toBeCloseTo(nov5, 9);
    const legacy = dmi8('2026-11-05', {
      event: { id: 'e', dateIn: '2026-11-05' },
      groupWindows: [{ groupId: 'g', headCount: 22, avgWeightKg: 120, dateJoined: '2026-11-05' }],
      paddockWindows: [{ id: 'pw', eventId: 'e', locationId: 'corral', dateOpened: '2026-11-05' }],
      feedEntries: [{ id: 'f', batchId: 'hay', date: '2026-11-05', time: '07:00', quantity: 6 }],
      feedChecks: pool.checks.map(({ id, date, time }) => ({ id, date, time })),
      feedCheckItems: pool.items.map(({ feedCheckId, remainingQuantity }) => ({ feedCheckId, batchId: 'hay', remainingQuantity })),
      batches: { hay: { weightPerUnitKg: 100, dmPct: 100 } },
    });
    expect(calc().fn(legacy).storedDmiKg).toBeCloseTo(nov5, 9);
  });
  it('a zero-length interval contributes nothing', () => {
    const readings = [{ date: '2026-11-05', time: '09:00' }, { date: '2026-11-05', time: '09:00' }, { date: '2026-11-06', time: '09:00' }];
    expect(elapsedDayShares(readings, '2026-11-05')).toEqual([{ index: 1, share: 1 }]);
  });
  it('a null-DM interval overlapping the day makes the day unknown', () => {
    const input = corralPool();
    input.items[3] = item('c4', 0.75, { w: null });
    expect(poolDailyActual(input, '2026-11-16').get(key)).toBeNull();
    expect(poolDailyActual(input, '2026-11-14').get(key)).toBeNull();
    expect(poolDailyActual(input, '2026-11-12').get(key)).not.toBeNull();
  });
});
