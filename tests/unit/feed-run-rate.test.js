/** @file Feed run rate from feed checks — pure shared calc. */
import { describe, it, expect, vi } from 'vitest';
import { computeFeedRunRate, poolDmPrices, shiftDate, FALLBACK_COST_PER_BALE } from '../../src/calcs/feed-run-rate.js';
import { poolDailyObservation, poolDailyActual, poolKey } from '../../src/calcs/feed-pools.js';
import { groupWindowsDailyDmiKg, farmDemandWindowsOn, eventOpenOn, resetWarnedDuplicateGroupDays } from '../../src/calcs/window-helpers.js';

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
  it('measures days bracketed by two checks with earlier check <= d < later check', () => {
    const r = computeFeedRunRate(openHay());
    expect(r.start).toBe('2026-11-01');
    expect(r.windowDays).toBe(30);
    expect(r.measuredDays).toBe(10);
    expect(r.lastMeasuredDate).toBe('2026-11-14');
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
    // 11-15 (the later check day) holds 1 bale with no next check: active, unmeasured.
    expect(r.measuredDays).toBe(6);
    expect(r.consumed.units.bale).toBeCloseTo(6);
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
    expect(r.lastMeasuredDate).toBe('2026-11-19');
    expect(r.consumed.units.bale).toBeCloseTo(11);
  });
  it('a zero check on d turns the pool off from d, even with another pool unmeasured before', () => {
    const input = openHay();
    input.checks.push(check('c3', 'e', '2026-11-20'));
    input.items.push(item('c3', 'hay', 0));
    // A second pool with feed until a zero check on 11-25, never bracketed.
    input.entries.push(feed('b2', 'e', 'sq', '2026-11-22', 4, { w: 25, dm: 90, unit: 'sq bale' }));
    input.checks.push(check('c4', 'e', '2026-11-25'));
    input.items.push(item('c4', 'sq', 0, { w: 25, dm: 90, unit: 'sq bale' }));
    const r = computeFeedRunRate(input);
    // 11-20 and 11-21 have no active pool; 11-22..11-24 the sq pool is active and unmeasured; 11-25 it is off.
    expect(r.measuredDays).toBe(15);
    expect(r.lastMeasuredDate).toBe('2026-11-19');
  });
  it('days with feed delivered before the first check are active but unmeasured', () => {
    const r = computeFeedRunRate({ ...openHay(), today: '2026-11-04', days: 7 });
    expect(r.measuredDays).toBe(0);
    expect(r.hasChecks).toBe(false);
    expect(r.consumed.dmKg).toBe(0);
  });
  it('the close day is not a run-rate day and does not inflate the forecast', () => {
    const input = openHay();
    input.events = [{ id: 'e', dateIn: '2026-11-01', dateOut: '2026-11-15' }];
    input.checks[1] = { ...input.checks[1], isCloseReading: true };
    input.groupWindows = [{ ...input.groupWindows[0], dateLeft: '2026-11-15' }];
    const r = computeFeedRunRate(input);
    expect(r.measuredDays).toBe(10);
    expect(r.lastMeasuredDate).toBe('2026-11-14');
    expect(r.rate.forecastDmKgPerDay).toBe(125);
    expect(r.residual).toMatchObject({ eventsClosed: 1, closesWithoutReading: 0, unknown: false, units: { bale: 1 }, dmKg: 400 });
  });
  it('per-day DM matches poolDailyActual on the same days (parity)', () => {
    const input = openHay();
    const r = computeFeedRunRate(input);
    const key = poolKey({ eventId: 'e', locationId: 'p', feedTypeId: 'hay' });
    let sum = 0;
    for (let i = 0; i < 30; i += 1) sum += poolDailyActual({ eventId: 'e', ...input }, shiftDate('2026-11-01', i)).get(key) ?? 0;
    expect(r.consumed.dmKg).toBeCloseTo(sum);
    expect(sum).toBeCloseTo(4000);
  });
  it('periodStart clips the window start and byEvent breaks consumed and residual out per event', () => {
    const r = computeFeedRunRate({ ...openHay(), periodStart: '2026-11-10' });
    expect(r.start).toBe('2026-11-10');
    expect(r.windowDays).toBe(21);
    expect(r.measuredDays).toBe(5);
    expect(r.byEvent).toHaveLength(1);
    expect(r.byEvent[0]).toMatchObject({ eventId: 'e', closed: false, residual: null });
    expect(r.byEvent[0].consumed.dmKg).toBe(2000);
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
    expect(r.residual.unknown).toBe(false);
    const byId = Object.fromEntries(r.byEvent.map(row => [row.eventId, row]));
    expect(byId.closed).toMatchObject({ closed: true, closeWithoutReading: false });
    expect(byId.closed.residual.dmKg).toBeCloseTo(67.5);
    expect(byId.noread).toMatchObject({ closed: true, closeWithoutReading: true });
    expect(byId.noread.residual).toMatchObject({ unknown: true, dmKg: null, cost: null });
    expect(byId.empty.residual).toMatchObject({ unknown: false, dmKg: 0 });
    expect(byId.old).toBeUndefined();
  });
  it('residual with no known close reading is unknown, not 0; a real 0-left reading stays 0', () => {
    const base = { today: '2026-11-30', days: 30, feedTypes: types, batches: [{ id: 'b1', unit: 'bale', costPerUnit: 60 }],
      events: [{ id: 'x', dateIn: '2026-11-01', dateOut: '2026-11-20' }], entries: [{ ...feed('f', 'x', 'hay', '2026-11-02', 4), batchId: 'b1' }] };
    const unknown = computeFeedRunRate({ ...base, checks: [], items: [] });
    expect(unknown.residual).toMatchObject({ unknown: true, dmKg: null, cost: null, closesWithoutReading: 1, eventsClosed: 1 });
    const zero = computeFeedRunRate({ ...base, checks: [check('z', 'x', '2026-11-20', true)], items: [item('z', 'hay', 0)] });
    expect(zero.residual).toMatchObject({ unknown: false, dmKg: 0, cost: 0, closesWithoutReading: 0 });
  });
  it('count figures only for bale, sq bale and bag; ton/kg/lb pools add DM only', () => {
    const input = openHay();
    input.feedTypes = [{ id: 'hay', unit: 'ton' }];
    for (const row of [...input.entries, ...input.items]) row.unitSnapshot = 'ton';
    const r = computeFeedRunRate(input);
    expect(r.rate.unitsPerDay).toEqual({});
    expect(r.consumed.units).toEqual({});
    expect(r.rate.dmKgPerDay).toBe(400);
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

/** Orphan fixture: group G left open on event A (closed Jul 27) by a split; G now on event B from Nov 9. */
function orphanHerd() {
  return {
    today: '2026-11-17', days: 30, feedTypes: types,
    events: [{ id: 'evt-a', dateIn: '2026-07-01', dateOut: '2026-07-27' }, { id: 'evt-b', dateIn: '2026-11-09', dateOut: null }],
    entries: [{ ...feed('b1', 'evt-b', 'hay', '2026-11-09', 10), id: 'f-b' }],
    checks: [check('c1', 'evt-b', '2026-11-10'), check('c2', 'evt-b', '2026-11-15')],
    items: [item('c1', 'hay', 6), item('c2', 'hay', 1)],
    batches: [{ id: 'b1', feedTypeId: 'hay', unit: 'bale', costPerUnit: 60, weightPerUnitKg: 500, dmPct: 80 }],
    groups: [{ id: 'grp-g', name: 'Test Herd' }],
    groupWindows: [
      { id: 'gw-orphan', eventId: 'evt-a', groupId: 'grp-g', dateJoined: '2026-07-29', dateLeft: null, headCount: 10, avgWeightKg: 500 },
      { id: 'gw-b', eventId: 'evt-b', groupId: 'grp-g', dateJoined: '2026-11-09', dateLeft: null, headCount: 10, avgWeightKg: 500 },
    ],
  };
}
/** Per-event DMI-8 demand (each event's own windows, as DMI-8 filters them) summed over events open on d. */
const perEventDemandSum = (input, d) => input.events.filter(e => eventOpenOn(e, d))
  .reduce((sum, e) => sum + groupWindowsDailyDmiKg(d, { groupWindows: input.groupWindows.filter(w => w.eventId === e.id) }), 0);

describe('farm demand counts only windows on open events, once per group', () => {
  it('an orphan window on a closed event adds nothing: the forecast is event B\'s demand only', () => {
    const input = orphanHerd();
    const r = computeFeedRunRate(input);
    expect(r.measuredDays).toBe(5);
    // 10 head × 500 kg × 2.5% = 125 kg/day, not 250 with the orphan.
    expect(r.rate.forecastDmKgPerDay).toBe(125);
    for (let d = '2026-10-19'; d <= '2026-11-17'; d = shiftDate(d, 1)) {
      const farm = groupWindowsDailyDmiKg(d, { groupWindows: input.groupWindows, events: input.events, groups: input.groups });
      expect(farm).toBe(perEventDemandSum(input, d));
      expect(farm).toBe(d >= '2026-11-09' ? 125 : 0);
    }
  });
  it('clips each window to its event: days before the event opens or from its close day do not count', () => {
    const events = [{ id: 'evt-c', dateIn: '2026-11-09', dateOut: '2026-11-12' }];
    const groupWindows = [{ id: 'gw-c', eventId: 'evt-c', groupId: 'grp-g', dateJoined: '2026-11-05', dateLeft: null, headCount: 10, avgWeightKg: 500 }];
    const on = d => groupWindowsDailyDmiKg(d, { groupWindows, events });
    expect([on('2026-11-08'), on('2026-11-09'), on('2026-11-11'), on('2026-11-12')]).toEqual([0, 125, 125, 0]);
    // A window whose event is missing never counts.
    expect(groupWindowsDailyDmiKg('2026-11-10', { groupWindows: [{ ...groupWindows[0], eventId: 'evt-gone' }], events })).toBe(0);
  });
  it('a group with two qualifying windows on the same day counts once and warns with the name and date only', () => {
    resetWarnedDuplicateGroupDays();
    const input = orphanHerd();
    input.events.push({ id: 'evt-d', dateIn: '2026-11-01', dateOut: null });
    input.groupWindows.push({ id: 'gw-d', eventId: 'evt-d', groupId: 'grp-g', dateJoined: '2026-11-01', dateLeft: null, headCount: 10, avgWeightKg: 500 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { windows, duplicates } = farmDemandWindowsOn('2026-11-12', input);
      expect(duplicates).toBe(1);
      // The latest-joined window counts.
      expect(windows.map(w => w.id)).toEqual(['gw-b']);
      expect(computeFeedRunRate(input).rate.forecastDmKgPerDay).toBe(125);
      expect(warn).toHaveBeenCalled();
      const messages = warn.mock.calls.map(call => call.join(' '));
      expect(messages.some(m => m.includes('Test Herd') && m.includes('2026-11-12'))).toBe(true);
      for (const m of messages) expect(m).not.toMatch(/grp-g|gw-|evt-/);
    } finally {
      warn.mockRestore();
    }
  });


  it('same-group-day ties break on timeJoined, then createdAt, then id, in either input order', () => {
    const events = [{ id: 'evt-x', dateIn: '2026-11-01', dateOut: null }, { id: 'evt-y', dateIn: '2026-11-01', dateOut: null }];
    const base = { groupId: 'grp-g', dateJoined: '2026-11-09', dateLeft: null, headCount: 10, avgWeightKg: 500 };
    const earlierTime = { ...base, id: 'gw-early-time', eventId: 'evt-x', timeJoined: '08:00', createdAt: '2026-11-09T12:00:00.000Z' };
    const laterTime = { ...base, id: 'gw-late-time', eventId: 'evt-y', timeJoined: '15:00', createdAt: '2026-11-09T09:00:00.000Z' };
    for (const groupWindows of [[earlierTime, laterTime], [laterTime, earlierTime]]) {
      expect(farmDemandWindowsOn('2026-11-12', { groupWindows, events }).windows.map(w => w.id)).toEqual(['gw-late-time']);
    }
    const earlierCreated = { ...base, id: 'gw-early-created', eventId: 'evt-x', timeJoined: '10:00', createdAt: '2026-11-09T09:00:00.000Z' };
    const laterCreated = { ...base, id: 'gw-late-created', eventId: 'evt-y', timeJoined: '10:00', createdAt: '2026-11-09T18:00:00.000Z' };
    for (const groupWindows of [[earlierCreated, laterCreated], [laterCreated, earlierCreated]]) {
      expect(farmDemandWindowsOn('2026-11-12', { groupWindows, events }).windows.map(w => w.id)).toEqual(['gw-late-created']);
    }
    const idA = { ...base, id: 'gw-a', eventId: 'evt-x', timeJoined: '10:00', createdAt: '2026-11-09T12:00:00.000Z' };
    const idB = { ...base, id: 'gw-b', eventId: 'evt-y', timeJoined: '10:00', createdAt: '2026-11-09T12:00:00.000Z' };
    for (const groupWindows of [[idA, idB], [idB, idA]]) {
      expect(farmDemandWindowsOn('2026-11-12', { groupWindows, events }).windows.map(w => w.id)).toEqual(['gw-b']);
    }
  });

  it('the duplicate-group warning fires only once per group and date across repeated calls', () => {
    resetWarnedDuplicateGroupDays();
    const input = orphanHerd();
    input.events.push({ id: 'evt-d', dateIn: '2026-11-01', dateOut: null });
    input.groupWindows.push({ id: 'gw-d', eventId: 'evt-d', groupId: 'grp-g', dateJoined: '2026-11-01', dateLeft: null, headCount: 10, avgWeightKg: 500 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      farmDemandWindowsOn('2026-11-12', input);
      farmDemandWindowsOn('2026-11-12', input);
      const onTwelfth = warn.mock.calls.map(call => call.join(' ')).filter(m => m.includes('Test Herd') && m.includes('2026-11-12'));
      expect(onTwelfth).toHaveLength(1);
      farmDemandWindowsOn('2026-11-13', input);
      const onThirteenth = warn.mock.calls.map(call => call.join(' ')).filter(m => m.includes('Test Herd') && m.includes('2026-11-13'));
      expect(onThirteenth).toHaveLength(1);
    } finally {
      warn.mockRestore();
      resetWarnedDuplicateGroupDays();
    }
  });
});
