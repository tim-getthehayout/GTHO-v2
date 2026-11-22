/** @file OI-0260: event DMI-8 charts + days-remaining use the OI-0258 Al1 allocation. */
import { describe, it, expect } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import '../../src/calcs/feed-forage.js';
import { al1EventDayAllocation } from '../../src/calcs/f1-close-allocation.js';
import { projectEventFeedDays } from '../../src/calcs/event-feed-days.js';
import { shouldPaintCap1ForecastStub } from '../../src/features/events/rotation-calendar/forecaster-helpers.js';

const EVT = 'ev1';
const LOC = 'loc-1';
const PW = 'pw-1';

const haySnap = {
  feedTypeId: 'hay',
  unitSnapshot: 'bale',
  weightPerUnitKgSnapshot: 500,
  dmPctSnapshot: 80,
};

function dmBales(n) {
  return n * 500 * 0.8;
}

const event = { id: EVT, dateIn: '2026-10-01', dateOut: null, sourceEventId: null, timeIn: null };
const groupWindows = [{
  eventId: EVT, headCount: 20, avgWeightKg: 500, animalClassId: null,
  dateJoined: '2026-10-01', dateLeft: null,
}];
const paddockWindows = [{
  id: PW, eventId: EVT, locationId: LOC, dateOpened: '2026-10-01',
  dateClosed: null, areaPct: 100,
}];
const observations = [{
  id: 'obs-1', locationId: LOC, type: 'open', source: 'event', sourceId: PW,
  forageHeightCm: 25, forageCoverPct: 80, createdAt: '2026-10-01T00:00:00Z',
}];
const forageTypes = { [LOC]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 } };
const locations = { [LOC]: { areaHa: 2, areaHectares: 2 } };

const physicalDelivery = {
  id: 'fe1', eventId: EVT, locationId: LOC, date: '2026-10-01',
  quantity: 4, kind: 'inventory_feeding', ...haySnap,
};
const closeCheck = { id: 'fcClose', eventId: EVT, date: '2026-10-11', time: '00:00', isCloseReading: true };
const closeItem = {
  id: 'fci', feedCheckId: 'fcClose', locationId: LOC, batchId: null,
  remainingQuantity: 0, ...haySnap,
};

const dates = [
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10',
];

function ctx(overrides = {}) {
  return {
    event,
    groupWindows,
    memberships: null, animals: [], animalWeightRecords: [],
    feedEntries: [physicalDelivery],
    feedChecks: [closeCheck],
    feedCheckItems: [closeItem],
    batches: {},
    paddockWindows,
    observations,
    forageTypes,
    locations,
    animalClasses: {},
    ...overrides,
  };
}

function runDmi8(date, overrides = {}) {
  return getCalcByName('DMI-8').fn({ ...ctx(overrides), date });
}

function expectedAl1(date, overrides = {}) {
  const c = ctx(overrides);
  const demandByDate = new Map(dates.map(d => [d, 250]));
  if (date && !demandByDate.has(date)) demandByDate.set(date, 250);
  const allDates = dates.includes(date) ? dates : [...dates, date];
  return al1EventDayAllocation({
    date,
    dates: allDates,
    hayArgs: {
      eventId: EVT,
      openDate: '2026-10-01',
      openTime: null,
      feedEntries: c.feedEntries,
      feedChecks: c.feedChecks,
      feedCheckItems: c.feedCheckItems,
      batches: c.batches,
    },
    demandByDate,
    paddockWindows: c.paddockWindows,
    locationsById: new Map([[LOC, { id: LOC, areaHa: 2, areaHectares: 2 }]]),
  });
}

describe('OI-0260 DMI-8 charts use Al1+Cv1+Sp-f (acceptance 1, 3)', () => {
  it('on a closed hay span, chart bars match the shared Al1 helper (not a second split)', () => {
    const mid = runDmi8('2026-10-05');
    const al1 = expectedAl1('2026-10-05');
    expect(al1.kind).toBe('measured');
    expect(mid.status).toBe('actual');
    expect(mid.storedDmiKg).toBeCloseTo(al1.storedDmiKg, 8);
    expect(mid.pastureDmiKg).toBeCloseTo(al1.pastureDmiKg, 8);
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(4) / 10, 8);
    // L1: pasture = demand − hay share
    expect(mid.pastureDmiKg).toBeCloseTo(250 - mid.storedDmiKg, 8);
    expect(mid.deficitKg).toBe(0);
  });

  it('floors pasture at 0 when the Al1 hay share exceeds demand (L1)', () => {
    // 20 bales = 8000 kg over 10 days = 800 kg/day vs demand 250.
    const heavy = {
      ...physicalDelivery,
      id: 'fe-heavy',
      quantity: 20,
    };
    const mid = runDmi8('2026-10-05', { feedEntries: [heavy] });
    const al1 = expectedAl1('2026-10-05', { feedEntries: [heavy] });
    expect(al1.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(al1.storedDmiKg, 8);
    expect(mid.pastureDmiKg).toBe(0);
    expect(mid.deficitKg).toBe(0);
  });

  it('counts synthetic sourceEventId copies once (Cv1)', () => {
    const synth = (id) => ({
      id, eventId: EVT, locationId: LOC, date: '2026-10-01',
      quantity: 7, sourceEventId: 'ev0', kind: 'pool_carry', ...haySnap,
    });
    const entries = [synth('a'), synth('b'), synth('c')];
    const mid = runDmi8('2026-10-05', { feedEntries: entries });
    const al1 = expectedAl1('2026-10-05', { feedEntries: entries });
    expect(al1.kind).toBe('measured');
    expect(mid.storedDmiKg).toBeCloseTo(al1.storedDmiKg, 8);
    expect(mid.storedDmiKg).toBeCloseTo(dmBales(7) / 10, 8);
  });
});

describe('OI-0260 days-remaining / estimated demand use the same allocation (acceptance 2, Ch1)', () => {
  it('projectEventFeedDays remaining matches the DMI-8 Al1 walk, not a second hay story', () => {
    const dmi8 = runDmi8('2026-10-05');
    const al1 = expectedAl1('2026-10-05');
    // Five measured days at the same hay share, opening remaining = 4 bales.
    expect(dmi8.remainingStoredDmKg).toBeCloseTo(dmBales(4) - 5 * al1.storedDmiKg, 6);
    const projected = projectEventFeedDays({
      dmi8Fn: getCalcByName('DMI-8').fn,
      for4Fn: getCalcByName('FOR-4').fn,
      ctx: ctx(),
      today: '2026-10-05',
    });
    expect(projected.visible).toBe(true);
    expect(projected.remainingStoredDmKg).toBeCloseTo(dmi8.remainingStoredDmKg, 8);
    expect(projected.remainingPastureDmKg).toBeCloseTo(dmi8.remainingPastureDmKg, 8);
    expect(projected.demandKg).toBe(250);
    const expectedDays = (dmi8.remainingStoredDmKg + dmi8.remainingPastureDmKg) / 250;
    expect(projected.days).toBeCloseTo(expectedDays, 8);
  });
});

describe('OI-0260 Fw0: after the last known span, keep the existing cascade forecast (acceptance 4)', () => {
  it('does not keep applying the Al1 hay run-rate once the known span has ended', () => {
    // Mid-check closes the known span; leftover hay remains but the next days
    // are not measured. Plenty of pasture → existing cascade uses pasture first
    // (stored 0). An Fw1 Al1 run-rate would keep showing the span's hay/day.
    const midCheck = { id: 'fcMid', eventId: EVT, date: '2026-10-06', time: '00:00' };
    const midItem = {
      id: 'fciMid', feedCheckId: 'fcMid', locationId: LOC, batchId: null,
      remainingQuantity: 2, ...haySnap,
    };
    const overrides = { feedChecks: [midCheck], feedCheckItems: [midItem] };

    const inside = runDmi8('2026-10-03', overrides);
    const after = runDmi8('2026-10-08', overrides);
    const al1Inside = expectedAl1('2026-10-03', overrides);
    const al1After = expectedAl1('2026-10-08', overrides);

    expect(al1Inside.kind).toBe('measured');
    expect(inside.storedDmiKg).toBeCloseTo(al1Inside.storedDmiKg, 8);
    expect(inside.storedDmiKg).toBeGreaterThan(0);

    expect(al1After.kind).not.toBe('measured');
    expect(after.storedDmiKg).toBe(0);
    expect(after.pastureDmiKg).toBe(250);
    expect(after.deficitKg).toBe(0);
  });
});

describe('OI-0260 Cp0 / D0 (acceptance 5–7)', () => {
  it('does not start painting the CAP-1 tan future-block stub (Cp0)', () => {
    expect(shouldPaintCap1ForecastStub()).toBe(false);
    expect(shouldPaintCap1ForecastStub({ enabled: true })).toBe(false);
  });
});
