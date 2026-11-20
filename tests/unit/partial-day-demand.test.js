/** @file Partial-day estimated demand: first/last fractions, presence NPK, DMI-5 unchanged. */
import { describe, it, expect, beforeAll } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/core.js';
import { projectEventFeedDays } from '../../src/calcs/event-feed-days.js';
import {
  estimatedDemandFraction,
  firstDayClockMs,
  presenceHours,
  presenceDays,
  groupWindowPresenceDays,
  localHoursInDay,
} from '../../src/calcs/partial-day-demand.js';
import { localInstantMs } from '../../src/calcs/feed-pools.js';
import { daysBetweenInclusive } from '../../src/utils/date-utils.js';

const EVT = 'evt-e';
const LOC = 'loc-e';
const PW = 'pw-e';
const BATCH = 'batch-e';
const DATE_IN = '2026-11-19';
const TODAY = '2026-11-20';

// 20 hd × 500 kg × 2.5% = 250 kg/day. 12 bales × 103.75 kg DM = 1245 kg = 4.98 demand-days.
// Delivery 15:00 on dateIn → first-day 9/24; through EOD today = 1.375 demand-days → 3.61 left.
const DAILY = 250;
const BALE_DM_KG = 103.75;
const BALE_QTY = 12;

function eEventCtx(overrides = {}) {
  return {
    event: { id: EVT, dateIn: DATE_IN, dateOut: null, sourceEventId: null },
    date: TODAY,
    groupWindows: [{
      id: 'gw-e', eventId: EVT, groupId: 'grp-e',
      headCount: 20, avgWeightKg: 500, animalClassId: null,
      dateJoined: DATE_IN, timeJoined: '15:00', dateLeft: null,
    }],
    memberships: null, animals: [], animalWeightRecords: [],
    feedEntries: [{
      id: 'fe-e', eventId: EVT, batchId: BATCH, locationId: LOC,
      date: DATE_IN, time: '15:00', quantity: BALE_QTY, entryType: 'delivery',
    }],
    feedChecks: [],
    feedCheckItems: [],
    batches: { [BATCH]: { weightPerUnitKg: BALE_DM_KG, dmPct: 100 } },
    paddockWindows: [{
      id: PW, eventId: EVT, locationId: LOC,
      dateOpened: DATE_IN, timeOpened: '08:00', dateClosed: null, areaPct: 100,
    }],
    observations: [],
    forageTypes: {},
    locations: { [LOC]: { type: 'confinement', areaHa: null } },
    animalClasses: {},
    ...overrides,
  };
}

describe('estimated demand fraction', () => {
  it('first-day delivery at 15:00 is 9/24, even when presence opened earlier', () => {
    const ctx = eEventCtx();
    expect(estimatedDemandFraction(DATE_IN, ctx)).toBeCloseTo(9 / 24, 10);
    expect(firstDayClockMs(DATE_IN, ctx)).toBe(localInstantMs(DATE_IN, '15:00'));
  });

  it('middle days and today-through-EOD are 1.0', () => {
    const ctx = eEventCtx();
    expect(estimatedDemandFraction(TODAY, ctx)).toBe(1);
  });

  it('falls back to earliest paddock presence when there is no delivery on dateIn', () => {
    const ctx = eEventCtx({ feedEntries: [] });
    expect(estimatedDemandFraction(DATE_IN, ctx)).toBeCloseTo(16 / 24, 10);
    expect(firstDayClockMs(DATE_IN, ctx)).toBe(localInstantMs(DATE_IN, '08:00'));
  });

  it('falls back to group timeJoined when no paddock window is present', () => {
    const ctx = eEventCtx({ feedEntries: [], paddockWindows: [] });
    expect(firstDayClockMs(DATE_IN, ctx)).toBe(localInstantMs(DATE_IN, '15:00'));
    expect(estimatedDemandFraction(DATE_IN, ctx)).toBeCloseTo(9 / 24, 10);
  });

  it('uses the earliest of multiple deliveries on dateIn', () => {
    const ctx = eEventCtx({
      feedEntries: [
        { id: 'fe-late', eventId: EVT, date: DATE_IN, time: '18:00', quantity: 1, entryType: 'delivery' },
        { id: 'fe-early', eventId: EVT, date: DATE_IN, time: '14:00', quantity: 1, entryType: 'delivery' },
      ],
    });
    expect(firstDayClockMs(DATE_IN, ctx)).toBe(localInstantMs(DATE_IN, '14:00'));
    expect(estimatedDemandFraction(DATE_IN, ctx)).toBeCloseTo(10 / 24, 10);
  });

  it('last-day fraction is midnight through close time', () => {
    const ctx = eEventCtx({
      event: { id: EVT, dateIn: DATE_IN, dateOut: TODAY, timeOut: '12:00' },
      groupWindows: [{
        id: 'gw-e', eventId: EVT, dateJoined: DATE_IN, timeJoined: '15:00',
        dateLeft: TODAY, timeLeft: '12:00', headCount: 20, avgWeightKg: 500,
      }],
      paddockWindows: [{
        id: PW, eventId: EVT, locationId: LOC,
        dateOpened: DATE_IN, timeOpened: '08:00', dateClosed: TODAY, timeClosed: '12:00',
      }],
    });
    expect(estimatedDemandFraction(TODAY, ctx)).toBeCloseTo(12 / 24, 10);
  });
});

describe('E-event end-of-today remaining', () => {
  let dmi8, for4;
  beforeAll(() => {
    dmi8 = getCalcByName('DMI-8');
    for4 = getCalcByName('FOR-4');
  });

  it('is ≈ 3.61 after end of today, not 2.98', () => {
    const ctx = eEventCtx();
    const result = dmi8.fn(ctx);
    expect(result.status).toBe('estimated');
    expect(result.dailyDemandKg).toBe(DAILY);
    expect(result.totalDmiKg).toBe(DAILY); // today is a full EOD day
    const firstDay = dmi8.fn({ ...ctx, date: DATE_IN });
    expect(firstDay.totalDmiKg).toBeCloseTo(DAILY * (9 / 24), 5);
    const projection = projectEventFeedDays({ dmi8Fn: dmi8.fn, for4Fn: for4.fn, ctx, today: TODAY });
    expect(projection.visible).toBe(true);
    expect(projection.demandKg).toBe(DAILY);
    expect(projection.days).toBe(3.61);
    // Prior whole-day model consumed 2.0 demand-days → 2.98.
    const wholeDayLeft = (BALE_DM_KG * BALE_QTY - 2 * DAILY) / DAILY;
    expect(Math.round(wholeDayLeft * 100) / 100).toBe(2.98);
  });

  it('pasture-only first-day bars follow presence open, not midnight', () => {
    const ctx = eEventCtx({
      feedEntries: [],
      date: DATE_IN,
      locations: { [LOC]: { type: 'land', areaHa: 4 } },
      forageTypes: { [LOC]: { dmKgPerCmPerHa: 200, minResidualHeightCm: 5, utilizationPct: 100 } },
      observations: [{
        id: 'obs-e', locationId: LOC, type: 'open', source: 'event', sourceId: PW,
        forageHeightCm: 30, forageCoverPct: 100, createdAt: `${DATE_IN}T00:00:00Z`,
      }],
    });
    const result = dmi8.fn(ctx);
    expect(result.status).toBe('estimated');
    expect(result.totalDmiKg).toBeCloseTo(DAILY * (16 / 24), 5);
    expect(result.pastureDmiKg + result.storedDmiKg + result.deficitKg).toBeCloseTo(result.totalDmiKg, 5);
  });
});

describe('DMI-5 bracketed path is unchanged', () => {
  let dmi8;
  beforeAll(() => { dmi8 = getCalcByName('DMI-8'); });

  it('keeps the existing untimed check-to-check fixture (25 kg stored / 225 pasture)', () => {
    const EVT2 = 'evt-1';
    const LOC2 = 'loc-1';
    const PW2 = 'pw-1';
    const result = dmi8.fn({
      event: { id: EVT2, dateIn: '2026-04-10', dateOut: null, sourceEventId: null },
      date: '2026-04-12',
      groupWindows: [{ headCount: 20, avgWeightKg: 500, animalClassId: null, dateJoined: '2026-04-10', dateLeft: null }],
      memberships: null, animals: [], animalWeightRecords: [],
      feedEntries: [],
      feedChecks: [
        { id: 'chk-1', date: '2026-04-11' },
        { id: 'chk-2', date: '2026-04-13' },
      ],
      feedCheckItems: [
        { feedCheckId: 'chk-1', batchId: 'b-1', locationId: LOC2, remainingQuantity: 200 },
        { feedCheckId: 'chk-2', batchId: 'b-1', locationId: LOC2, remainingQuantity: 150 },
      ],
      batches: { 'b-1': { weightPerUnitKg: 1, dmPct: 100 } },
      paddockWindows: [{ id: PW2, eventId: EVT2, locationId: LOC2, dateOpened: '2026-04-10', dateClosed: null, areaPct: 100 }],
      observations: [{ id: 'obs-1', locationId: LOC2, type: 'open', source: 'event', sourceId: PW2, forageHeightCm: 25, forageCoverPct: 80, createdAt: '2026-04-10T00:00:00Z' }],
      forageTypes: { [LOC2]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 } },
      locations: { [LOC2]: { areaHa: 2 } },
      animalClasses: {},
    });
    expect(result.status).toBe('actual');
    expect(result.totalDmiKg).toBe(250);
    expect(result.storedDmiKg).toBe(25);
    expect(result.pastureDmiKg).toBe(225);
    expect(result.deficitKg).toBe(0);
  });
});

describe('NPK presence duration', () => {
  it('afternoon start through end of the next day is less than TIM-1 days × 24', () => {
    const hours = presenceHours({
      dateOpened: DATE_IN, timeOpened: '15:00',
      throughDate: TODAY,
    });
    const tim1Days = daysBetweenInclusive(DATE_IN, TODAY);
    expect(hours).toBe(33);
    expect(hours).toBeLessThan(tim1Days * 24);
    expect(presenceDays({
      dateOpened: DATE_IN, timeOpened: '15:00',
      throughDate: TODAY,
    })).toBeCloseTo(33 / 24, 10);
  });

  it('groupWindowPresenceDays uses timeJoined, not a whole first day', () => {
    const days = groupWindowPresenceDays({
      dateJoined: DATE_IN, timeJoined: '15:00', dateLeft: null,
    }, { eventStartDate: DATE_IN, throughDate: TODAY });
    expect(days).toBeCloseTo(33 / 24, 10);
    expect(days).toBeLessThan(daysBetweenInclusive(DATE_IN, TODAY));
  });
});

describe('local day length', () => {
  it('is 24 hours on a non-DST date', () => {
    expect(localHoursInDay('2026-11-19')).toBe(24);
  });
});
