/**
 * @file L1 (t1466u/t1470u lag) — the metrics memo changes no number.
 * A prod-shaped season (closed events with measured and unmeasured hay, an
 * 11-paddock open event, three groups, weight history) is computed with no
 * memo, inside one render pass, and again from the pass cache; every metric row,
 * past-block window metric, Home DMI tile and demand row must be identical.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import {
  computeLocationMetrics, buildLocationMetricRows, aggregatePeriodTotals, defaultMetricWindow, deriveEventStartDate,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import { computePaddockWindowMetrics, pastWindowSpan } from '../../src/features/events/rotation-calendar/past-window.js';
import { computeHomeDmi } from '../../src/features/dashboard/home-dmi.js';
import {
  groupWindowsDailyDemand, groupDayDmi, groupDayExcretionRates, getLiveWindowAvgWeight, groupDayMembers,
} from '../../src/calcs/window-helpers.js';
import { f1HaySpans, f1MeasuredHayOnEventDay } from '../../src/calcs/f1-close-allocation.js';
import {
  inMetricsPass, metricsPassActive, passMemo, memoByStoreVersion, bumpMetricsStoreVersion, _resetMetricsMemo,
} from '../../src/calcs/metrics-memo.js';

const TODAY = '2026-11-24';

function shift(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Season shaped like prod (counts scaled down): 22 paddocks, 12 closed events, one 11-paddock open event. */
function season() {
  const haySnap = { feedTypeId: 'hay', unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 85 };
  const classes = [
    { id: 'c-cow', species: 'beef_cattle', role: 'cow', dmiPct: 2.5, defaultWeightKg: 550, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 },
    { id: 'c-calf', species: 'beef_cattle', role: 'calf', dmiPct: null, defaultWeightKg: 200 },
    { id: 'c-ewe', species: 'sheep', role: 'ewe', dmiPct: 3.0, defaultWeightKg: 70, excretionNRate: 0.42 },
  ];
  const locations = Array.from({ length: 22 }, (_, i) => ({
    id: `L${i}`, name: `P${i}`, type: 'land', landUse: i % 7 === 6 ? 'mixed_use' : 'pasture', areaHectares: 1.5 + (i % 5),
  }));
  const groups = [{ id: 'G1', name: 'Cows' }, { id: 'G2', name: 'Calves' }, { id: 'G3', name: 'Ewes' }];
  const animals = [];
  const memberships = [];
  const weights = [];
  for (let i = 0; i < 60; i++) {
    const cls = i < 30 ? 'c-cow' : (i < 45 ? 'c-calf' : 'c-ewe');
    const grp = i < 30 ? 'G1' : (i < 45 ? 'G2' : 'G3');
    animals.push({ id: `A${i}`, classId: cls, active: true });
    memberships.push({ id: `M${i}`, animalId: `A${i}`, groupId: grp, dateJoined: i % 9 === 0 ? '2026-06-15' : '2026-03-01', dateLeft: i % 13 === 0 ? '2026-09-20' : null });
    if (i % 4 !== 3) {
      weights.push({ id: `W${i}a`, animalId: `A${i}`, weightKg: 300 + i * 3, recordedAt: '2026-04-02T10:00:00Z' });
      weights.push({ id: `W${i}b`, animalId: `A${i}`, weightKg: 320 + i * 3, recordedAt: '2026-08-11T10:00:00Z' });
    }
  }
  const events = [];
  const paddockWindows = [];
  const groupWindows = [];
  const feedEntries = [];
  const feedChecks = [];
  const feedCheckItems = [];
  let start = '2026-04-10';
  for (let e = 0; e < 12; e++) {
    const id = `E${e}`;
    const open = start;
    const close = shift(open, 12);
    events.push({ id, dateOut: close, timeOut: '09:00' });
    const pads = [locations[e % 22], locations[(e + 5) % 22]].slice(0, e % 3 === 0 ? 1 : 2);
    pads.forEach((l, k) => paddockWindows.push({ id: `PW${e}-${k}`, eventId: id, locationId: l.id, dateOpened: open, dateClosed: close, areaPct: 100, noPasture: false }));
    groupWindows.push({ id: `GW${e}-1`, eventId: id, groupId: 'G1', dateJoined: open, dateLeft: close, headCount: 30, avgWeightKg: 500 });
    if (e % 2 === 0) groupWindows.push({ id: `GW${e}-2`, eventId: id, groupId: 'G2', dateJoined: shift(open, 2), dateLeft: close, headCount: 15, avgWeightKg: 210 });
    if (e % 4 === 1) {
      // measured hay: delivery + close reading
      feedEntries.push({ id: `FE${e}`, eventId: id, locationId: pads[0].id, date: open, quantity: 6, kind: 'inventory_feeding', ...haySnap });
      feedChecks.push({ id: `FC${e}`, eventId: id, date: close, time: '08:00', isCloseReading: true });
      feedCheckItems.push({ id: `FCI${e}`, feedCheckId: `FC${e}`, locationId: pads[0].id, batchId: null, remainingQuantity: 1, ...haySnap });
    } else if (e % 4 === 3) {
      // unmeasured hay: delivery, no reading
      feedEntries.push({ id: `FE${e}`, eventId: id, locationId: pads[0].id, date: shift(open, 3), quantity: 4, kind: 'inventory_feeding', ...haySnap });
    }
    start = shift(close, 1);
  }
  // Open event across 11 paddocks (like d4a043d8), hay delivered, no check yet.
  const openId = 'EOPEN';
  events.push({ id: openId, dateOut: null });
  for (let k = 0; k < 11; k++) {
    paddockWindows.push({ id: `PWO-${k}`, eventId: openId, locationId: `L${11 + k}`, dateOpened: k < 6 ? '2026-11-01' : '2026-11-10', dateClosed: k === 3 ? '2026-11-15' : null, areaPct: 100, noPasture: k === 10 });
  }
  groupWindows.push({ id: 'GWO-1', eventId: openId, groupId: 'G1', dateJoined: '2026-11-01', dateLeft: null, headCount: 30, avgWeightKg: 500 });
  groupWindows.push({ id: 'GWO-3', eventId: openId, groupId: 'G3', dateJoined: '2026-11-05', dateLeft: null, headCount: 15, avgWeightKg: 70 });
  feedEntries.push({ id: 'FEO', eventId: openId, locationId: 'L12', date: '2026-11-12', quantity: 5, kind: 'inventory_feeding', ...haySnap });
  return {
    locations, groups, animals, memberships, weights, events, paddockWindows, groupWindows, feedEntries, feedChecks, feedCheckItems, classes,
  };
}

function ctxOf(s, win) {
  return {
    windowStart: win.start,
    windowEnd: win.end,
    today: TODAY,
    events: s.events,
    paddockWindows: s.paddockWindows,
    groupWindows: s.groupWindows,
    memberships: s.memberships,
    animals: s.animals,
    animalClasses: s.classes,
    animalWeightRecords: s.weights,
    locations: s.locations,
    observations: [],
    feedEntries: s.feedEntries,
    feedChecks: s.feedChecks,
    feedCheckItems: s.feedCheckItems,
    batches: [],
    feedTypes: [{ id: 'hay', unit: 'bale' }],
    batchNutritionalProfiles: [],
  };
}

function homeCtx(s) {
  const c = ctxOf(s, { start: null, end: null });
  return { ...c, groups: s.groups };
}

/** Everything the Calendar, List and Home read, in one plain object. */
function everything(s) {
  const out = {};
  for (const win of [defaultMetricWindow('2026-06-01'), defaultMetricWindow(TODAY), { start: '2026-11-01', end: '2026-11-30' }]) {
    const ctx = ctxOf(s, win);
    const rows = buildLocationMetricRows(s.locations, ctx);
    out[`rows ${win.start}`] = rows;
    out[`totals ${win.start}`] = aggregatePeriodTotals(rows);
    out[`direct ${win.start}`] = s.locations.map(loc => computeLocationMetrics(loc, ctx));
    out[`windows ${win.start}`] = s.paddockWindows.map((pw) => {
      const event = s.events.find(e => e.id === pw.eventId);
      const loc = s.locations.find(l => l.id === pw.locationId);
      const span = pastWindowSpan(pw, event, { today: TODAY, fallbackStart: deriveEventStartDate(event.id, ctx) });
      return span ? computePaddockWindowMetrics(pw, loc, event, span, ctx) : null;
    });
  }
  const hc = homeCtx(s);
  for (const period of ['24h', '3d', '7d', '30d', 'All']) out[`home ${period}`] = computeHomeDmi(period, { today: TODAY, ctx: hc });
  const opts = { groupWindows: s.groupWindows, memberships: s.memberships, animals: s.animals, animalClasses: s.classes, animalWeightRecords: s.weights };
  for (const dt of ['2026-04-12', '2026-06-20', '2026-09-21', '2026-11-12', TODAY]) {
    out[`demand ${dt}`] = groupWindowsDailyDemand(dt, opts);
    out[`demand farm ${dt}`] = groupWindowsDailyDemand(dt, { ...opts, events: s.events, groups: s.groups });
    for (const gw of s.groupWindows) {
      out[`gdd ${gw.id} ${dt}`] = groupDayDmi(gw, dt, opts);
      out[`exc ${gw.id} ${dt}`] = groupDayExcretionRates(gw, dt, opts);
      out[`avg ${gw.id} ${dt}`] = getLiveWindowAvgWeight(gw, { ...opts, now: dt });
      out[`mem ${gw.id} ${dt}`] = groupDayMembers(gw, dt, opts);
    }
  }
  for (const ev of s.events) {
    const hay = { eventId: ev.id, openDate: deriveEventStartDate(ev.id, { paddockWindows: s.paddockWindows, groupWindows: s.groupWindows, event: ev }), feedEntries: s.feedEntries, feedChecks: s.feedChecks, feedCheckItems: s.feedCheckItems, batches: [], feedTypes: [{ id: 'hay', unit: 'bale' }] };
    out[`spans ${ev.id}`] = f1HaySpans(hay);
    out[`hayday ${ev.id}`] = ['2026-04-15', '2026-07-01', '2026-11-13'].map(date => f1MeasuredHayOnEventDay({ ...hay, date }));
  }
  return out;
}

describe('L1 metrics memo — identical numbers', () => {
  beforeEach(() => _resetMetricsMemo());

  it('the fixture exercises measured hay, unknown hay, partial and known rows', () => {
    const s = season();
    const rows = buildLocationMetricRows(s.locations, ctxOf(s, defaultMetricWindow('2026-06-01')));
    expect(rows.some(r => r.dmiKnown && r.dmiKg > 0)).toBe(true);
    expect(rows.some(r => r.auds > 0)).toBe(true);
    const nov = buildLocationMetricRows(s.locations, ctxOf(s, defaultMetricWindow(TODAY)));
    expect(nov.filter(r => r.eventCount > 0).length).toBeGreaterThanOrEqual(10);
  });

  it('a render pass returns exactly what the uncached calcs return', () => {
    const s = season();
    const plain = everything(s);
    expect(metricsPassActive()).toBe(false);
    const cached = inMetricsPass(() => {
      expect(metricsPassActive()).toBe(true);
      const first = everything(s);
      const again = everything(s); // second read is served from the pass cache
      expect(again).toEqual(first);
      return first;
    });
    expect(cached).toEqual(plain);
    expect(metricsPassActive()).toBe(false);
  }, 120000);

  it('a nested pass joins the outer one and closes with it', () => {
    let inner = null;
    inMetricsPass(() => { inMetricsPass(() => { inner = metricsPassActive(); }); expect(metricsPassActive()).toBe(true); });
    expect(inner).toBe(true);
    expect(metricsPassActive()).toBe(false);
  });

  it('callers cannot corrupt the cache through a returned demand array', () => {
    const s = season();
    const opts = { groupWindows: s.groupWindows, memberships: s.memberships, animals: s.animals, animalClasses: s.classes, animalWeightRecords: s.weights };
    inMetricsPass(() => {
      const a = groupWindowsDailyDemand('2026-11-12', opts);
      const n = a.length;
      a.push({ kg: 999 });
      a.length = 0;
      expect(groupWindowsDailyDemand('2026-11-12', opts)).toHaveLength(n);
      const exc = groupDayExcretionRates(s.groupWindows[0], '2026-04-12', opts);
      exc.n = 99;
      expect(groupDayExcretionRates(s.groupWindows[0], '2026-04-12', opts).n).not.toBe(99);
    });
  });

  it('a store notify inside a pass drops the pass cache', () => {
    let calls = 0;
    inMetricsPass(() => {
      passMemo('t', 'k', () => ++calls);
      passMemo('t', 'k', () => ++calls);
      expect(calls).toBe(1);
      bumpMetricsStoreVersion();
      passMemo('t', 'k', () => ++calls);
      expect(calls).toBe(2);
    });
  });

  it('outside a pass nothing is cached (unit-test callers see no memo)', () => {
    let calls = 0;
    passMemo('t', 'k', () => ++calls);
    passMemo('t', 'k', () => ++calls);
    expect(calls).toBe(2);
  });

  it('store-version memo reuses a row until the next notify', () => {
    let calls = 0;
    const a = memoByStoreVersion('row|L1', () => ({ n: ++calls }));
    const b = memoByStoreVersion('row|L1', () => ({ n: ++calls }));
    expect(b).toBe(a);
    expect(calls).toBe(1);
    bumpMetricsStoreVersion();
    const c = memoByStoreVersion('row|L1', () => ({ n: ++calls }));
    expect(c.n).toBe(2);
  });
});
