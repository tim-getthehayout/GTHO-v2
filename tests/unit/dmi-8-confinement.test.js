/** @file OI-0209 — confinement DMI-8 gates, invented-pasture ban, shared feed-days projection. */
import { describe, it, expect, beforeAll } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';
import '../../src/calcs/feed-forage.js';
import { projectEventFeedDays, formatFeedRemainingLabel, FEED_REMAINING_ESTIMATE_CAPTION } from '../../src/calcs/event-feed-days.js';
import { renderDmiChart } from '../../src/ui/dmi-chart.js';

const EVT = 'evt-corral';
const OTHER = 'evt-other';
const LOC = 'loc-corral';
const LOC_LAND = 'loc-land';
const PW = 'pw-corral';
const PW_LAND = 'pw-land';
const BATCH = 'batch-hay';

const TODAY = '2026-11-10';

function corralLoc(overrides = {}) {
  return { type: 'confinement', areaHa: null, forageTypeId: null, noPasture: false, ...overrides };
}

function baseCtx(overrides = {}) {
  return {
    event: { id: EVT, dateIn: TODAY, dateOut: null, sourceEventId: null },
    date: TODAY,
    groupWindows: [{
      id: 'gw-1', eventId: EVT, groupId: 'grp-1',
      headCount: 22, avgWeightKg: 500, animalClassId: null,
      dateJoined: TODAY, dateLeft: null,
    }],
    memberships: null, animals: [], animalWeightRecords: [],
    feedEntries: [],
    feedChecks: [],
    feedCheckItems: [],
    batches: {
      [BATCH]: { weightPerUnitKg: 1765.5 / 2 / 0.85, dmPct: 85 },
    },
    paddockWindows: [{
      id: PW, eventId: EVT, locationId: LOC,
      dateOpened: TODAY, dateClosed: null, noPasture: false,
    }],
    observations: [],
    forageTypes: {},
    locations: { [LOC]: corralLoc() },
    animalClasses: {},
    ...overrides,
  };
}

// Two bales delivered on event start: 1765.5 kg DM total. Demand = 22 * 500 * 0.025 = 275 kg/day.
// After today's intake, remaining = 1490.5 kg → FOR-4 = 5.42 days (live Corral sanity shape).
function twoBales(date = TODAY, quantity = 2) {
  return [{
    id: 'fe-1', eventId: EVT, batchId: BATCH, locationId: LOC,
    date, time: '08:00', quantity, entryType: 'delivery',
  }];
}

describe('DMI-8 confinement (OI-0209)', () => {
  let dmi8;
  let for4;
  beforeAll(() => {
    dmi8 = getCalcByName('DMI-8');
    for4 = getCalcByName('FOR-4');
  });

  it('renders actual stored/deficit DMI for a Corral-shaped fixture, not no_pasture_data', () => {
    const ctx = baseCtx({ feedEntries: twoBales() });
    const result = dmi8.fn(ctx);
    expect(result.status).not.toBe('no_pasture_data');
    expect(result.status).toMatch(/actual|estimated/);
    expect(result.pastureDmiKg).toBe(0);
    expect(result.storedDmiKg).toBe(275);
    expect(result.deficitKg).toBe(0);
    expect(result.totalDmiKg).toBe(275);
    expect(result.remainingStoredDmKg).toBeCloseTo(1490.5, 5);
  });

  it('works without acreage, ignores stale forage, and treats type as authoritative regardless of noPasture', () => {
    const stale = {
      forageTypes: { [LOC]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 } },
      locations: { [LOC]: corralLoc({ areaHa: 4, forageTypeId: 'ft-stale', noPasture: false }) },
      observations: [{
        id: 'obs-stale', locationId: LOC, type: 'open', source: 'event', sourceId: PW,
        forageHeightCm: 30, forageCoverPct: 90, createdAt: '2026-11-01T00:00:00Z',
      }],
      feedEntries: twoBales(),
    };
    const a = dmi8.fn(baseCtx(stale));
    const b = dmi8.fn(baseCtx({
      ...stale,
      locations: { [LOC]: corralLoc({ areaHa: 4, forageTypeId: 'ft-stale', noPasture: true }) },
    }));
    expect(a.pastureDmiKg).toBe(0);
    expect(b.pastureDmiKg).toBe(0);
    expect(a.status).not.toBe('no_pasture_data');
    expect(b.status).not.toBe('no_pasture_data');
  });

  it('never invents pasture on the bracketed-check actual path', () => {
    const result = dmi8.fn(baseCtx({
      date: '2026-11-11',
      event: { id: EVT, dateIn: '2026-11-10', dateOut: null },
      groupWindows: [{
        headCount: 22, avgWeightKg: 500, animalClassId: null,
        dateJoined: '2026-11-10', dateLeft: null,
      }],
      paddockWindows: [{
        id: PW, eventId: EVT, locationId: LOC,
        dateOpened: '2026-11-10', dateClosed: null,
      }],
      feedEntries: twoBales('2026-11-10'),
      feedChecks: [
        { id: 'chk-a', eventId: EVT, date: '2026-11-10', time: '18:00' },
        { id: 'chk-b', eventId: EVT, date: '2026-11-12', time: '18:00' },
      ],
      feedCheckItems: [
        { feedCheckId: 'chk-a', batchId: BATCH, remainingQuantity: 1.5 },
        { feedCheckId: 'chk-b', batchId: BATCH, remainingQuantity: 0.5 },
      ],
    }));
    expect(result.status).toBe('actual');
    expect(result.pastureDmiKg).toBe(0);
    expect(result.deficitKg).toBe(Math.max(0, result.totalDmiKg - result.storedDmiKg));
    expect(Number.isFinite(result.storedDmiKg)).toBe(true);
    expect(result.deficitKg).not.toBeLessThan(0);
    expect(Number.isNaN(result.storedDmiKg)).toBe(false);
    expect(Number.isFinite(result.remainingStoredDmKg)).toBe(true);
  });
});

describe('shared end-of-today feed-days projection (OI-0209)', () => {
  let dmi8;
  let for4;
  beforeAll(() => {
    dmi8 = getCalcByName('DMI-8');
    for4 = getCalcByName('FOR-4');
  });

  function project(overrides = {}) {
    const ctx = baseCtx({ feedEntries: twoBales(), ...overrides });
    return { ctx, projection: projectEventFeedDays({ dmi8Fn: dmi8.fn, for4Fn: for4.fn, ctx, today: overrides.date || TODAY }) };
  }

  it('Corral-shaped two-bale fixture estimates 5.42 days after today', () => {
    const { projection } = project();
    expect(projection.visible).toBe(true);
    expect(projection.isPureConfinement).toBe(true);
    expect(projection.days).toBe(5.42);
    expect(formatFeedRemainingLabel(projection.days)).toBe('Est. feed remaining: ~5.42 days');
    expect(FEED_REMAINING_ESTIMATE_CAPTION).toBe('end-of-today daily-model estimate');
  });

  it('valid depleted / empty feed shows 0, not a forage CTA', () => {
    const empty = project({ feedEntries: [] });
    expect(empty.projection.visible).toBe(true);
    expect(empty.projection.days).toBe(0);
    expect(empty.projection.reason).toBe('depleted');

    const depleted = project({
      feedEntries: twoBales(),
      feedChecks: [{ id: 'chk-0', eventId: EVT, date: TODAY, time: '19:00' }],
      feedCheckItems: [{ feedCheckId: 'chk-0', batchId: BATCH, remainingQuantity: 0 }],
    });
    expect(depleted.projection.visible).toBe(true);
    expect(depleted.projection.days).toBe(0);
  });

  it('hides the estimate when demand is zero or weights/DM conversion are invalid', () => {
    expect(project({
      groupWindows: [{ headCount: 0, avgWeightKg: 500, dateJoined: TODAY, dateLeft: null }],
    }).projection.visible).toBe(false);

    expect(project({
      groupWindows: [{ headCount: 22, avgWeightKg: 0, dateJoined: TODAY, dateLeft: null }],
    }).projection.visible).toBe(false);

    expect(project({
      batches: { [BATCH]: { weightPerUnitKg: null, dmPct: 85 } },
    }).projection.visible).toBe(false);

    expect(project({
      batches: { [BATCH]: { weightPerUnitKg: 800, dmPct: null } },
    }).projection.visible).toBe(false);
  });

  it('never returns NaN, infinite or negative days', () => {
    const { projection } = project();
    expect(Number.isFinite(projection.days)).toBe(true);
    expect(projection.days).toBeGreaterThanOrEqual(0);
  });

  it('is event-scoped: unrelated inventory does not change the estimate', () => {
    const baseline = project().projection.days;
    const withOther = project({
      feedEntries: [
        ...twoBales(),
        {
          id: 'fe-other', eventId: OTHER, batchId: BATCH, locationId: LOC,
          date: TODAY, time: '08:00', quantity: 50, entryType: 'delivery',
        },
      ],
    }).projection.days;
    expect(withOther).toBe(baseline);
  });

  it('accounts for later deliveries after a check, removals and check re-anchors', () => {
    const afterCheck = project({
      feedEntries: [
        ...twoBales(),
        {
          id: 'fe-late', eventId: EVT, batchId: BATCH, locationId: LOC,
          date: TODAY, time: '20:00', quantity: 1, entryType: 'delivery',
        },
      ],
      feedChecks: [{ id: 'chk-mid', eventId: EVT, date: TODAY, time: '12:00' }],
      feedCheckItems: [{ feedCheckId: 'chk-mid', batchId: BATCH, remainingQuantity: 1 }],
    });
    const noLate = project({
      feedEntries: twoBales(),
      feedChecks: [{ id: 'chk-mid', eventId: EVT, date: TODAY, time: '12:00' }],
      feedCheckItems: [{ feedCheckId: 'chk-mid', batchId: BATCH, remainingQuantity: 1 }],
    });
    expect(afterCheck.projection.days).toBeGreaterThan(noLate.projection.days);

    const removed = project({
      feedEntries: [
        ...twoBales(),
        {
          id: 'fe-rm', eventId: EVT, batchId: BATCH, locationId: LOC,
          date: TODAY, time: '09:00', quantity: 1, entryType: 'removal',
        },
      ],
    });
    expect(removed.projection.days).toBeLessThan(5.42);
  });

  it('includes composite head and group demand when memberships are live', () => {
    const animals = [
      { id: 'a-1', classId: null, isBulk: false },
      { id: 'a-bulk', classId: null, isBulk: true, bulkHeadCount: 21 },
    ];
    const memberships = [
      { groupId: 'grp-1', animalId: 'a-1', dateJoined: TODAY, dateLeft: null },
      { groupId: 'grp-1', animalId: 'a-bulk', dateJoined: TODAY, dateLeft: null },
    ];
    const { projection } = project({
      memberships,
      animals,
      animalWeightRecords: [
        { animalId: 'a-1', weightKg: 500, recordedAt: TODAY },
        { animalId: 'a-bulk', weightKg: 21 * 500, recordedAt: TODAY },
      ],
      groupWindows: [{
        id: 'gw-1', eventId: EVT, groupId: 'grp-1',
        headCount: 1, avgWeightKg: 400, animalClassId: null,
        dateJoined: TODAY, dateLeft: null,
      }],
    });
    expect(projection.visible).toBe(true);
    expect(projection.demandKg).toBeCloseTo(22 * 500 * 0.025, 5);
    expect(projection.days).toBe(5.42);
  });

  it('a confinement window in a mixed event contributes no pasture even with stale forage', () => {
    const ctx = baseCtx({
      paddockWindows: [
        { id: PW, eventId: EVT, locationId: LOC, dateOpened: TODAY, dateClosed: null },
        { id: PW_LAND, eventId: EVT, locationId: LOC_LAND, dateOpened: TODAY, dateClosed: null, areaPct: 100 },
      ],
      locations: {
        [LOC]: corralLoc({ areaHa: 3, forageTypeId: 'ft-stale' }),
        [LOC_LAND]: { type: 'land', areaHa: 2, forageTypeId: 'ft-land' },
      },
      forageTypes: {
        [LOC]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 },
        [LOC_LAND]: { dmKgPerCmPerHa: 110, minResidualHeightCm: 5, utilizationPct: 100 },
      },
      observations: [
        {
          id: 'obs-c', locationId: LOC, type: 'open', source: 'event', sourceId: PW,
          forageHeightCm: 40, forageCoverPct: 100, createdAt: '2026-11-01T00:00:00Z',
        },
        {
          id: 'obs-l', locationId: LOC_LAND, type: 'open', source: 'event', sourceId: PW_LAND,
          forageHeightCm: 25, forageCoverPct: 80, createdAt: '2026-11-01T00:00:00Z',
        },
      ],
      feedEntries: twoBales(),
    });
    const result = dmi8.fn(ctx);
    expect(result.status).not.toBe('no_pasture_data');
    // Land window can supply pasture; confinement stale forage must not inflate it
    // beyond what the land FOR-1 would provide on its own.
    const landOnly = dmi8.fn({
      ...ctx,
      paddockWindows: ctx.paddockWindows.filter((w) => w.id === PW_LAND),
      locations: { [LOC_LAND]: ctx.locations[LOC_LAND] },
    });
    expect(result.pastureDmiKg).toBeLessThanOrEqual(landOnly.pastureDmiKg + 1e-6);
  });

  it('pure-pasture land events still gate on forage type', () => {
    const result = dmi8.fn(baseCtx({
      locations: { [LOC]: { type: 'land', areaHa: 2, forageTypeId: null } },
      forageTypes: {},
      observations: [],
      feedEntries: [],
    }));
    expect(result.status).toBe('no_pasture_data');
    expect(result.reason).toBe('missing_forage_type');
  });

  it('dashboard and detail share the same projection object contract', () => {
    const { projection } = project();
    const again = projectEventFeedDays({
      dmi8Fn: dmi8.fn, for4Fn: for4.fn, ctx: baseCtx({ feedEntries: twoBales() }), today: TODAY,
    });
    expect(again).toEqual(projection);
  });
});

describe('DMI chart placeholder vs fed-feed bars (OI-0209)', () => {
  let dmi8;
  beforeAll(() => { dmi8 = getCalcByName('DMI-8'); });

  it('does not render the 24px Set-forage-type placeholder when confinement has fed feed', () => {
    const result = dmi8.fn(baseCtx({ feedEntries: twoBales() }));
    const root = renderDmiChart([{ date: TODAY, label: 'Tue', result }], 'imperial', { compact: true });
    document.body.appendChild(root);
    const text = root.textContent;
    expect(text).not.toContain('Set forage type');
    expect(text).not.toContain('Add pre-graze');
    const px = [...root.querySelectorAll('div')]
      .map((el) => parseFloat(el.style.height))
      .filter((h) => Number.isFinite(h));
    expect(px.some((h) => h > 24)).toBe(true);
    expect(text).toContain('(est.)');
    root.remove();
  });
});
