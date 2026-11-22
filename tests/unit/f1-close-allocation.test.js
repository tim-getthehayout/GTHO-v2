/** @file OI-0258 F1 close-allocation: Al1+Pd1+Mc1+Mx-a+Cv1+Sp-f(demand)+D0. */
import { describe, it, expect } from 'vitest';
import {
  isSyntheticCarryoverEntry,
  f1HaySpans,
  f1MeasuredHayOnEventDay,
  prorateSpanHayByDemand,
  grazingPaddockWindowsOnDate,
  al1EventDayAllocation,
} from '../../src/calcs/f1-close-allocation.js';

const feedTypes = [{ id: 'hay', unit: 'bale' }];
const haySnap = {
  feedTypeId: 'hay',
  unitSnapshot: 'bale',
  weightPerUnitKgSnapshot: 500,
  dmPctSnapshot: 80,
};

function dmBales(n) {
  return n * 500 * 0.8;
}

function item(id, checkId, remaining) {
  return {
    id, feedCheckId: checkId, locationId: 'loc1', batchId: null,
    remainingQuantity: remaining, ...haySnap,
  };
}

describe('isSyntheticCarryoverEntry (Cv1)', () => {
  it('treats sourceEventId and pool_carry as synthetic opening capture', () => {
    expect(isSyntheticCarryoverEntry({ sourceEventId: 'ev0', quantity: 7 })).toBe(true);
    expect(isSyntheticCarryoverEntry({ kind: 'pool_carry', quantity: 7 })).toBe(true);
    expect(isSyntheticCarryoverEntry({ kind: 'inventory_feeding', quantity: 3 })).toBe(false);
    expect(isSyntheticCarryoverEntry({ quantity: 3 })).toBe(false);
  });
});

describe('Al1 known hay without a mid-check', () => {
  const base = {
    eventId: 'ev1',
    openDate: '2026-10-01',
    openTime: null,
    feedTypes,
    batches: [],
  };

  it('leaves deliveries alone (no close) unmeasured', () => {
    const hay = f1MeasuredHayOnEventDay({
      ...base,
      date: '2026-10-05',
      feedEntries: [{
        id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
        quantity: 4, kind: 'inventory_feeding', ...haySnap,
      }],
      feedChecks: [],
      feedCheckItems: [],
    });
    expect(hay.kind).toBe('unknown');
  });

  it('knows days between opening (zero carryover) and close (Al1)', () => {
    const args = {
      ...base,
      feedEntries: [{
        id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
        quantity: 4, kind: 'inventory_feeding', ...haySnap,
      }],
      feedChecks: [
        { id: 'fcClose', eventId: 'ev1', date: '2026-10-10', time: '08:00', isCloseReading: true },
      ],
      feedCheckItems: [item('fci', 'fcClose', 0)],
    };
    const mid = f1MeasuredHayOnEventDay({ ...args, date: '2026-10-05' });
    expect(mid).toEqual({ kind: 'measured', dmKg: expect.any(Number) });
    expect(mid.dmKg).toBeGreaterThan(0);
    const spans = f1HaySpans(args);
    expect(spans.eventSpans).toHaveLength(1);
    expect(spans.eventSpans[0].unknown).toBe(false);
    expect(spans.eventSpans[0].dm).toBeCloseTo(dmBales(4), 8);
  });
});

describe('Cv1 opening carryover once', () => {
  const close = {
    feedChecks: [
      { id: 'fcClose', eventId: 'ev1', date: '2026-10-10', time: '08:00', isCloseReading: true },
    ],
    feedCheckItems: [item('fci', 'fcClose', 0)],
    feedTypes,
    eventId: 'ev1',
    openDate: '2026-10-01',
  };

  it('counts identical synthetic sourceEventId copies once, not 7+7+7', () => {
    const synth = (id) => ({
      id, eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
      quantity: 7, sourceEventId: 'ev0', kind: 'pool_carry', ...haySnap,
    });
    const spans = f1HaySpans({
      ...close,
      feedEntries: [synth('a'), synth('b'), synth('c')],
    });
    expect(spans.eventSpans[0].dm).toBeCloseTo(dmBales(7), 8);
    const day = f1MeasuredHayOnEventDay({
      ...close,
      date: '2026-10-05',
      feedEntries: [synth('a'), synth('b'), synth('c')],
    });
    expect(day.kind).toBe('measured');
  });

  it('adds net new physical deliveries on top of a single carryover', () => {
    const spans = f1HaySpans({
      ...close,
      feedEntries: [
        {
          id: 'carry', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
          quantity: 7, sourceEventId: 'ev0', kind: 'pool_carry', transferId: 't1', ...haySnap,
        },
        {
          id: 'new', eventId: 'ev1', locationId: 'loc1', date: '2026-10-03',
          quantity: 3, kind: 'inventory_feeding', ...haySnap,
        },
      ],
    });
    expect(spans.eventSpans[0].dm).toBeCloseTo(dmBales(10), 8);
  });
});

describe('Mc1 mid-check spans', () => {
  it('splits hay at the mid-check, not only at close', () => {
    const args = {
      eventId: 'ev1',
      openDate: '2026-10-01',
      feedTypes,
      feedEntries: [{
        id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
        quantity: 6, kind: 'inventory_feeding', ...haySnap,
      }],
      feedChecks: [
        { id: 'fcMid', eventId: 'ev1', date: '2026-10-05', time: '08:00', isCloseReading: false },
        { id: 'fcClose', eventId: 'ev1', date: '2026-10-10', time: '08:00', isCloseReading: true },
      ],
      feedCheckItems: [item('m', 'fcMid', 4), item('c', 'fcClose', 0)],
    };
    const spans = f1HaySpans(args);
    expect(spans.eventSpans.length).toBeGreaterThanOrEqual(2);
    const known = spans.eventSpans.filter(s => !s.unknown);
    // Opening 0 + 6 delivered, mid remaining 4 → first span ate 2; mid 4 to close 0 → 4.
    expect(known.map(s => s.dm)).toEqual([
      expect.closeTo(dmBales(2), 8),
      expect.closeTo(dmBales(4), 8),
    ]);
  });
});

describe('Sp-f demand proration and Mx-a', () => {
  const locA = { id: 'locA', areaHectares: 4 };
  const locB = { id: 'locB', areaHectares: 4 };
  const locC = { id: 'locC', areaHectares: 4 };
  const locationsById = new Map([['locA', locA], ['locB', locB], ['locC', locC]]);

  it('prorates span hay by window demand, not equally by days', () => {
    const pwA = { id: 'pwA', eventId: 'ev1', locationId: 'locA', dateOpened: '2026-10-01', dateClosed: '2026-10-04', areaPct: 100 };
    const pwB = { id: 'pwB', eventId: 'ev1', locationId: 'locB', dateOpened: '2026-10-04', dateClosed: '2026-10-07', areaPct: 100 };
    // Span midnight Oct 1 → midnight Oct 7. A has 3 days demand 30, B has 3 days demand 10.
    const demandByDate = new Map([
      ['2026-10-01', 30], ['2026-10-02', 30], ['2026-10-03', 30],
      ['2026-10-04', 10], ['2026-10-05', 10], ['2026-10-06', 10],
    ]);
    const hayDm = 40;
    const alloc = prorateSpanHayByDemand({
      hayDm,
      spanStartMs: new Date(2026, 9, 1).getTime(),
      spanEndMs: new Date(2026, 9, 7).getTime(),
      dates: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'],
      eventId: 'ev1',
      paddockWindows: [pwA, pwB],
      demandByDate,
      locationsById,
    });
    const demandA = 30 * 3;
    const demandB = 10 * 3;
    expect(alloc.demandByPw.get('pwA')).toBeCloseTo(demandA, 8);
    expect(alloc.demandByPw.get('pwB')).toBeCloseTo(demandB, 8);
    expect(alloc.hayByPw.get('pwA')).toBeCloseTo(hayDm * demandA / (demandA + demandB), 8);
    expect(alloc.hayByPw.get('pwB')).toBeCloseTo(hayDm * demandB / (demandA + demandB), 8);
    expect(alloc.pastureByPw.get('pwA')).toBeCloseTo(demandA - alloc.hayByPw.get('pwA'), 8);
    expect(alloc.pastureByPw.get('pwB')).toBeCloseTo(demandB - alloc.hayByPw.get('pwB'), 8);
    // Event-level daily rollup is the same Sp-f shares (OI-0260).
    const hayDaysA = ['2026-10-01', '2026-10-02', '2026-10-03'];
    const hayDaysB = ['2026-10-04', '2026-10-05', '2026-10-06'];
    for (const date of hayDaysA) {
      expect(alloc.hayByDate.get(date)).toBeCloseTo(hayDm * 30 / (demandA + demandB), 8);
      expect(alloc.pastureByDate.get(date)).toBeCloseTo(30 - alloc.hayByDate.get(date), 8);
    }
    for (const date of hayDaysB) {
      expect(alloc.hayByDate.get(date)).toBeCloseTo(hayDm * 10 / (demandA + demandB), 8);
      expect(alloc.pastureByDate.get(date)).toBeCloseTo(10 - alloc.hayByDate.get(date), 8);
    }
    const haySum = [...alloc.hayByDate.values()].reduce((s, v) => s + v, 0);
    const pwSum = [...alloc.hayByPw.values()].reduce((s, v) => s + v, 0);
    expect(haySum).toBeCloseTo(hayDm, 8);
    expect(haySum).toBeCloseTo(pwSum, 8);
  });

  it('omits no_pasture windows from hay/pasture allocation (Mx-a)', () => {
    const graze = { id: 'pwG', eventId: 'ev1', locationId: 'locA', dateOpened: '2026-10-01', dateClosed: '2026-10-03', areaPct: 100 };
    const conf = { id: 'pwC', eventId: 'ev1', locationId: 'locC', dateOpened: '2026-10-01', dateClosed: '2026-10-03', areaPct: 100, noPasture: true };
    expect(grazingPaddockWindowsOnDate([graze, conf], { eventId: 'ev1', date: '2026-10-01' }).map(pw => pw.id)).toEqual(['pwG']);
    const alloc = prorateSpanHayByDemand({
      hayDm: 10,
      spanStartMs: new Date(2026, 9, 1).getTime(),
      spanEndMs: new Date(2026, 9, 3).getTime(),
      dates: ['2026-10-01', '2026-10-02'],
      eventId: 'ev1',
      paddockWindows: [graze, conf],
      demandByDate: new Map([['2026-10-01', 20], ['2026-10-02', 20]]),
      locationsById,
    });
    expect(alloc.demandByPw.has('pwC')).toBe(false);
    expect(alloc.hayByPw.has('pwC')).toBe(false);
    expect(alloc.hayByPw.get('pwG')).toBeCloseTo(10, 8);
    expect(alloc.pastureByPw.get('pwG')).toBeCloseTo(40 - 10, 8);
  });

  it('floors pasture at 0 when hay exceeds demand (L1)', () => {
    const pwA = { id: 'pwA', eventId: 'ev1', locationId: 'locA', dateOpened: '2026-10-01', dateClosed: '2026-10-03', areaPct: 100 };
    const alloc = prorateSpanHayByDemand({
      hayDm: 100,
      spanStartMs: new Date(2026, 9, 1).getTime(),
      spanEndMs: new Date(2026, 9, 3).getTime(),
      dates: ['2026-10-01', '2026-10-02'],
      eventId: 'ev1',
      paddockWindows: [pwA],
      demandByDate: new Map([['2026-10-01', 10], ['2026-10-02', 10]]),
      locationsById,
    });
    expect(alloc.pastureByPw.get('pwA')).toBe(0);
    expect(alloc.pastureByDate.get('2026-10-01')).toBe(0);
    expect(alloc.pastureByDate.get('2026-10-02')).toBe(0);
  });
});

describe('al1EventDayAllocation (OI-0260 shared helper)', () => {
  const hayArgs = {
    eventId: 'ev1',
    openDate: '2026-10-01',
    openTime: null,
    feedTypes,
    batches: [],
    feedEntries: [{
      id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
      quantity: 4, kind: 'inventory_feeding', ...haySnap,
    }],
    feedChecks: [
      { id: 'fcClose', eventId: 'ev1', date: '2026-10-11', time: '00:00', isCloseReading: true },
    ],
    feedCheckItems: [item('fci', 'fcClose', 0)],
  };
  const pw = { id: 'pwA', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01', dateClosed: null, areaPct: 100 };
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const demandByDate = new Map(dates.map(d => [d, 250]));
  const locationsById = new Map([['loc1', { id: 'loc1', areaHectares: 4 }]]);
  const common = { dates, hayArgs, demandByDate, paddockWindows: [pw], locationsById };

  it('marks mid-span days measured and prorates hay by demand (Sp-f)', () => {
    const mid = al1EventDayAllocation({ ...common, date: '2026-10-05' });
    expect(mid.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(4) / 10, 8);
    expect(mid.pastureDmiKg).toBeCloseTo(250 - mid.storedDmiKg, 8);
  });

  it('floors pasture at 0 when hay exceeds that day\'s demand (L1)', () => {
    const tight = new Map(dates.map(d => [d, 10]));
    const mid = al1EventDayAllocation({ ...common, demandByDate: tight, date: '2026-10-05' });
    expect(mid.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(4) / 10, 8);
    expect(mid.pastureDmiKg).toBe(0);
  });

  it('does not invent a second hay story: daily hay sums to the Al1 span', () => {
    let stored = 0;
    for (const date of dates) {
      stored += al1EventDayAllocation({ ...common, date }).storedDmiKg;
    }
    expect(stored).toBeCloseTo(dmBales(4), 8);
  });

  it('counts synthetic sourceEventId carryover once (Cv1)', () => {
    const synth = (id) => ({
      id, eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
      quantity: 7, sourceEventId: 'ev0', kind: 'pool_carry', ...haySnap,
    });
    const cvArgs = {
      ...hayArgs,
      feedEntries: [synth('a'), synth('b'), synth('c')],
    };
    const mid = al1EventDayAllocation({ ...common, hayArgs: cvArgs, date: '2026-10-05' });
    expect(mid.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(7) / 10, 8);
  });

  it('leaves days after the last known span unmeasured (Fw0 hook)', () => {
    const after = al1EventDayAllocation({ ...common, date: '2026-10-12' });
    expect(after.kind).not.toBe('measured');
    expect(after.storedDmiKg).toBeNull();
  });

  it('leaves deliveries without a close unmeasured', () => {
    const openOnly = {
      ...hayArgs,
      feedChecks: [],
      feedCheckItems: [],
    };
    const mid = al1EventDayAllocation({ ...common, hayArgs: openOnly, date: '2026-10-05' });
    expect(mid.kind).toBe('unknown');
    expect(mid.storedDmiKg).toBeNull();
  });
});

describe('noPastureOnlyDayHay (OI-0260 event-chart switch)', () => {
  const hayArgs = {
    eventId: 'ev1',
    openDate: '2026-10-01',
    openTime: null,
    feedTypes,
    batches: [],
    feedEntries: [{
      id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-01',
      quantity: 4, kind: 'inventory_feeding', ...haySnap,
    }],
    feedChecks: [
      { id: 'fcClose', eventId: 'ev1', date: '2026-10-11', time: '00:00', isCloseReading: true },
    ],
    feedCheckItems: [item('fci', 'fcClose', 0)],
  };
  const dates = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
    '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const demandByDate = new Map(dates.map(d => [d, 250]));
  const locationsById = new Map([['loc1', { id: 'loc1', areaHectares: 4 }]]);

  it('all-no_pasture span still gives each day a hay share, pasture 0 (Mt1)', () => {
    const pw = {
      id: 'pwNP', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01',
      dateClosed: null, areaPct: 100, noPasture: true,
    };
    const mid = al1EventDayAllocation({
      date: '2026-10-05', dates, hayArgs, demandByDate, paddockWindows: [pw], locationsById,
    });
    expect(mid.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(4) / 10, 8);
    expect(mid.pastureDmiKg).toBe(0);
    let stored = 0;
    for (const date of dates) {
      const day = al1EventDayAllocation({
        date, dates, hayArgs, demandByDate, paddockWindows: [pw], locationsById,
      });
      stored += day.storedDmiKg;
      expect(day.pastureDmiKg).toBe(0);
    }
    expect(stored).toBeCloseTo(dmBales(4), 8);
  });

  it('Locations F1 path (no option) still omits no_pasture-only days (Mx-a)', () => {
    const pw = {
      id: 'pwNP', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01',
      dateClosed: null, areaPct: 100, noPasture: true,
    };
    const alloc = prorateSpanHayByDemand({
      hayDm: dmBales(4),
      spanStartMs: new Date(2026, 9, 1).getTime(),
      spanEndMs: new Date(2026, 9, 11).getTime(),
      dates,
      eventId: 'ev1',
      paddockWindows: [pw],
      demandByDate,
      locationsById,
    });
    expect(alloc.hayByPw.size).toBe(0);
    expect(alloc.hayByDate.size).toBe(0);
    expect(alloc.totalDemand).toBe(0);
  });

  it('mixed default (span-fallback): hay stays on grazing days; later no_pasture-only days get 0', () => {
    // Grazing window closes after Oct 3 (dateClosed exclusive). no_pasture stays open.
    // Document current default only — Tim is deciding whether the event chart
    // should set noPastureOnlyDayHay to 'always'.
    const pwG = {
      id: 'pwG', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01',
      dateClosed: '2026-10-04', areaPct: 100,
    };
    const pwN = {
      id: 'pwN', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01',
      dateClosed: null, areaPct: 100, noPasture: true,
    };
    const midGraze = al1EventDayAllocation({
      date: '2026-10-02', dates, hayArgs, demandByDate,
      paddockWindows: [pwG, pwN], locationsById,
    });
    const later = al1EventDayAllocation({
      date: '2026-10-06', dates, hayArgs, demandByDate,
      paddockWindows: [pwG, pwN], locationsById,
    });
    expect(midGraze.kind).toBe('measured');
    // Three grazing days (Oct 1–3) take the whole 4-bale span.
    expect(midGraze.storedDmiKg).toBeCloseTo(dmBales(4) / 3, 8);
    expect(later.kind).toBe('measured');
    expect(later.storedDmiKg).toBe(0);
    expect(later.pastureDmiKg).toBe(0);
  });
});
