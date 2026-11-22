/** @file Location + rotation management metrics / readiness / sort / scroll (OI-0246). */
import { describe, it, expect, beforeAll } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import {
  isManagementLocation,
  filterManagementLocations,
  defaultMetricWindow,
  eachDateInclusive,
  computeLocationMetrics,
  formatMetricValue,
  clipWindowToRange,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import {
  lastGrazeDate,
  computeReadiness,
  readinessConfidence,
  attachReadiness,
} from '../../src/features/events/rotation-calendar/readiness.js';
import { sortMetricRows, nextSortState } from '../../src/features/events/rotation-calendar/sort-rows.js';
import {
  hasSingleVerticalScrollOwner,
  bindHorizontalScrollSync,
  describeScrollArchitecture,
  VERTICAL_SCROLL_OWNER_CLASS,
  TIMELINE_SCROLL_CLASS,
} from '../../src/features/events/rotation-calendar/scroll-owner.js';
import { el } from '../../src/ui/dom.js';

describe('X1 location filter', () => {
  it('keeps pasture and mixed-use land only', () => {
    const locs = [
      { id: '1', type: 'land', landUse: 'pasture' },
      { id: '2', type: 'land', landUse: 'mixed-use' },
      { id: '3', type: 'land', landUse: 'crop' },
      { id: '4', type: 'confinement' },
      { id: '5', type: 'storage' },
      { id: '6', type: 'land', landUse: 'pasture', archived: true },
    ];
    expect(filterManagementLocations(locs).map(l => l.id)).toEqual(['1', '2']);
    expect(isManagementLocation({ type: 'land' })).toBe(true); // default pasture
  });
});

describe('W1 default window', () => {
  it('returns Oct 1 – Sep 30 containing the date', () => {
    const w = defaultMetricWindow('2026-11-21');
    expect(w.start).toBe('2026-10-01');
    expect(w.end).toBe('2027-09-30');
  });

  it('eachDateInclusive lists days', () => {
    expect(eachDateInclusive('2026-01-01', '2026-01-03')).toEqual([
      '2026-01-01', '2026-01-02', '2026-01-03',
    ]);
  });
});

describe('computeLocationMetrics', () => {
  const loc = { id: 'loc1', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4.047 }; // ~10 acres
  const event = { id: 'ev1', dateOut: '2026-10-10' };
  const pw = { id: 'pw1', eventId: 'ev1', locationId: 'loc1', dateOpened: '2026-10-01', dateClosed: '2026-10-10', areaPct: 100 };
  const gw = {
    id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1',
    dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6,
  };
  const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const animals = Array.from({ length: 10 }, (_, i) => ({
    id: `a${i}`, classId: 'ac1', archived: false, status: 'active',
  }));
  const memberships = animals.map(a => ({
    id: `m${a.id}`, animalId: a.id, groupId: 'g1',
    dateJoined: '2026-01-01', dateLeft: null,
  }));

  const baseCtx = {
    windowStart: '2026-10-01',
    windowEnd: '2026-10-31',
    today: '2026-11-21',
    events: [event],
    paddockWindows: [pw],
    groupWindows: [gw],
    memberships,
    animals,
    animalClasses: [cls],
    animalWeightRecords: animals.map(a => ({
      animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01',
    })),
    locations: [loc],
    observations: [
      { locationId: 'loc1', forageQuality: 60, observedAt: '2026-10-05' },
      { locationId: 'loc1', forageQuality: 80, observedAt: '2026-10-15' },
    ],
    feedEntries: [],
  };

  it('computes AUDs, NPK, avg score; unknowns as null not silent 0 for score-less', () => {
    const m = computeLocationMetrics(loc, baseCtx);
    expect(m.auds).toBeGreaterThan(0);
    expect(m.nKg).toBeGreaterThan(0);
    expect(m.pKg).toBeGreaterThan(0);
    expect(m.kKg).toBeGreaterThan(0);
    expect(m.avgScore).toBe(70);
    expect(m.hasAcres).toBe(true);
    expect(m.audsPerAcre).toBeGreaterThan(0);
    expect(m.eventCount).toBe(1);
  });

  it('derives implied pasture DMI when events have no stored dateIn (real store shape)', () => {
    // OI-0117 dropped events.date_in; demand helpers still need dateIn via child windows.
    // Passing raw store events used to zero every pasture DMI after clear+render.
    expect(baseCtx.events[0].dateIn).toBeUndefined();
    const m = computeLocationMetrics(loc, baseCtx);
    expect(m.dmiKg).toBeGreaterThan(0);
    expect(m.dmiKnown).toBe(true);
  });

  it('returns — for unknown score when no observations', () => {
    const m = computeLocationMetrics(loc, { ...baseCtx, observations: [] });
    expect(m.avgScore).toBeNull();
    expect(formatMetricValue(m.avgScore)).toBe('—');
  });

  it('zero AUDs when no windows in range (known zero, not unknown)', () => {
    const m = computeLocationMetrics(loc, {
      ...baseCtx,
      paddockWindows: [{ ...pw, dateOpened: '2025-01-01', dateClosed: '2025-01-05' }],
      groupWindows: [{ ...gw, dateJoined: '2025-01-01', dateLeft: '2025-01-05' }],
    });
    expect(m.auds).toBe(0);
    expect(formatMetricValue(0)).toBe('0');
  });

  it('clips windows to the metric range', () => {
    const clip = clipWindowToRange(pw, event, '2026-10-05', '2026-10-07', '2026-11-21', {
      paddockWindows: [pw], groupWindows: [gw],
    });
    expect(clip.start).toBe('2026-10-05');
    expect(clip.end).toBe('2026-10-07');
    expect(clip.days).toBe(3);
  });

  it('subtracts stored feed DM from pasture DMI using quantity × weight × dm% snapshots', () => {
    // Real store events omit dateIn; derivation must still yield demand > 0.
    const none = computeLocationMetrics(loc, baseCtx);
    expect(none.dmiKg).toBeGreaterThan(0);

    // 2 × 500 kg × 80% = 800 kg DM on one open day — reduces (floors at 0 for that day)
    const withFeed = computeLocationMetrics(loc, {
      ...baseCtx,
      feedEntries: [{
        id: 'fe1', eventId: 'ev1', locationId: 'loc1', date: '2026-10-05',
        quantity: 2, weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80,
        kind: 'inventory_feeding', feedTypeId: 'hay',
      }],
    });
    expect(withFeed.dmiKg).toBeLessThan(none.dmiKg);
    expect(withFeed.dmiKg).toBeGreaterThanOrEqual(0);
  });

  it('ignores feed entries that only carry a fake dmKg (no snapshots)', () => {
    const none = computeLocationMetrics(loc, baseCtx);
    const fakeOnly = computeLocationMetrics(loc, {
      ...baseCtx,
      feedEntries: [{
        id: 'fe-fake', eventId: 'ev1', locationId: 'loc1', date: '2026-10-05',
        dmKg: 99999,
      }],
    });
    expect(fakeOnly.dmiKg).toBe(none.dmiKg);
  });
});


  it('does not null DMI when a peer location has unknown weights (event-scoped check)', () => {
    const locGood = { id: 'locGood', name: 'J3-4', type: 'land', landUse: 'pasture', areaHectares: 4 };
    const locBad = { id: 'locBad', name: 'Peer', type: 'land', landUse: 'pasture', areaHectares: 4 };
    const clsOk = { id: 'acOk', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, defaultWeightKg: 453.6 };
    const clsBad = { id: 'acBad', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
    const animalsOk = Array.from({ length: 5 }, (_, i) => ({ id: `ok${i}`, classId: 'acOk', archived: false, status: 'active' }));
    const animalsBad = Array.from({ length: 3 }, (_, i) => ({ id: `bad${i}`, classId: 'acBad', archived: false, status: 'active' }));
    const ctx = {
      windowStart: '2026-03-01',
      windowEnd: '2026-10-07',
      today: '2026-11-22',
      events: [
        { id: 'evGood', dateOut: '2026-06-01' },
        { id: 'evBad', dateOut: '2026-06-01' },
      ],
      paddockWindows: [
        { id: 'pwG', eventId: 'evGood', locationId: 'locGood', dateOpened: '2026-04-01', dateClosed: '2026-06-01', areaPct: 100 },
        { id: 'pwB', eventId: 'evBad', locationId: 'locBad', dateOpened: '2026-04-01', dateClosed: '2026-06-01', areaPct: 100 },
      ],
      groupWindows: [
        { id: 'gwG', eventId: 'evGood', groupId: 'gG', animalClassId: 'acOk', dateJoined: '2026-04-01', dateLeft: '2026-06-01', headCount: 5, avgWeightKg: 453.6 },
        { id: 'gwB', eventId: 'evBad', groupId: 'gB', animalClassId: 'acBad', dateJoined: '2026-04-01', dateLeft: '2026-06-01', headCount: 3, avgWeightKg: null },
      ],
      memberships: [
        ...animalsOk.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gG', dateJoined: '2026-01-01', dateLeft: null })),
        ...animalsBad.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gB', dateJoined: '2026-01-01', dateLeft: null })),
      ],
      animals: [...animalsOk, ...animalsBad],
      animalClasses: [clsOk, clsBad],
      animalWeightRecords: animalsOk.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-03-01' })),
      locations: [locGood, locBad],
      observations: [],
      feedEntries: [],
    };
    const good = computeLocationMetrics(locGood, ctx);
    const bad = computeLocationMetrics(locBad, ctx);
    expect(good.auds).toBeGreaterThan(0);
    expect(good.dmiKg).toBeGreaterThan(0);
    expect(good.dmiKnown).toBe(true);
    expect(bad.dmiKg).toBeNull();
    expect(formatMetricValue(bad.dmiKg)).toBe('\u2014');
  });

  it('sums the known group and marks DMI/NPK partial when a same-event group lacks weight (Gg+Zp)', () => {
    const loc = { id: 'locD', name: 'D', type: 'land', landUse: 'pasture', areaHectares: 10 };
    const clsOk = { id: 'acOk', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, defaultWeightKg: 453.6 };
    const clsBad = { id: 'acBad', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
    const aOk = Array.from({ length: 5 }, (_, i) => ({ id: `dOk${i}`, classId: 'acOk', archived: false, status: 'active' }));
    const aBad = Array.from({ length: 3 }, (_, i) => ({ id: `dBad${i}`, classId: 'acBad', archived: false, status: 'active' }));
    const m = computeLocationMetrics(loc, {
      windowStart: '2026-03-01',
      windowEnd: '2026-10-07',
      today: '2026-11-22',
      events: [{ id: 'evD', dateOut: null }],
      paddockWindows: [
        { id: 'pwD', eventId: 'evD', locationId: 'locD', dateOpened: '2026-05-01', dateClosed: null, areaPct: 100 },
      ],
      groupWindows: [
        { id: 'gw1', eventId: 'evD', groupId: 'g1', animalClassId: 'acOk', dateJoined: '2026-05-01', dateLeft: null, headCount: 5, avgWeightKg: 453.6 },
        { id: 'gw2', eventId: 'evD', groupId: 'g2', animalClassId: 'acBad', dateJoined: '2026-05-01', dateLeft: null, headCount: 3, avgWeightKg: null },
      ],
      memberships: [
        ...aOk.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
        ...aBad.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g2', dateJoined: '2026-01-01', dateLeft: null })),
      ],
      animals: [...aOk, ...aBad],
      animalClasses: [clsOk, clsBad],
      animalWeightRecords: aOk.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-03-01' })),
      locations: [loc],
      observations: [],
      feedEntries: [],
    });
    expect(m.auds).toBeGreaterThan(0);
    expect(m.audsKnown).toBe(true);
    expect(m.dmiKg).toBeGreaterThan(0);
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiPartial).toBe(true);
    expect(m.nKg).toBeGreaterThan(0);
    expect(m.npkKnown).toBe(true);
    expect(m.npkPartial).toBe(true);
    expect(m.avgScore).toBeNull();
    expect(m.scoreKnown).toBe(false);
  });


describe('OI-0249 Zp+Gg+Ua+Sc season rollup', () => {
  const loc = { id: 'E1', name: 'E-1', type: 'land', landUse: 'pasture', areaHectares: 4.047 };
  const clsOk = { id: 'acOk', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, defaultWeightKg: 453.6 };
  const clsBad = { id: 'acBad', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const laterAnimals = Array.from({ length: 8 }, (_, i) => ({ id: `lat${i}`, classId: 'acOk', archived: false, status: 'active' }));
  const marchAnimals = Array.from({ length: 4 }, (_, i) => ({ id: `mar${i}`, classId: 'acBad', archived: false, status: 'active' }));

  function e1Ctx(overrides = {}) {
    return {
      windowStart: '2025-10-01',
      windowEnd: '2026-09-30',
      today: '2026-11-22',
      events: [
        { id: 'evMarch', dateOut: '2026-04-03' },
        { id: 'evLater', dateOut: '2026-06-15' },
      ],
      paddockWindows: [
        { id: 'pwM', eventId: 'evMarch', locationId: 'E1', dateOpened: '2026-03-27', dateClosed: '2026-04-03', areaPct: 100 },
        { id: 'pwL', eventId: 'evLater', locationId: 'E1', dateOpened: '2026-05-01', dateClosed: '2026-06-15', areaPct: 100 },
      ],
      groupWindows: [
        // Closed zero snapshot (the E-1 March stay). Rt: trust stored 0; do not re-derive.
        { id: 'gwM', eventId: 'evMarch', groupId: 'gM', animalClassId: 'acBad', dateJoined: '2026-03-27', dateLeft: '2026-04-03', headCount: 4, avgWeightKg: 0 },
        { id: 'gwL', eventId: 'evLater', groupId: 'gL', animalClassId: 'acOk', dateJoined: '2026-05-01', dateLeft: '2026-06-15', headCount: 8, avgWeightKg: 453.6 },
      ],
      memberships: [
        ...marchAnimals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gM', dateJoined: '2026-01-01', dateLeft: '2026-04-03' })),
        ...laterAnimals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gL', dateJoined: '2026-01-01', dateLeft: '2026-06-15' })),
      ],
      animals: [...marchAnimals, ...laterAnimals],
      animalClasses: [clsOk, clsBad],
      animalWeightRecords: laterAnimals.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-04-15' })),
      locations: [loc],
      observations: [
        { locationId: 'E1', forageQuality: 72, observedAt: '2026-05-20' },
      ],
      feedEntries: [],
      ...overrides,
    };
  }

  it('sums the later known stay and marks DMI/NPK partial when an earlier closed snapshot is 0 (Zp)', () => {
    const m = computeLocationMetrics(loc, e1Ctx());
    expect(m.dmiKg).toBeGreaterThan(0);
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiPartial).toBe(true);
    expect(m.nKg).toBeGreaterThan(0);
    expect(m.npkKnown).toBe(true);
    expect(m.npkPartial).toBe(true);
    expect(m.eventCount).toBe(2);
  });

  it('AUDs still add using 0 for the zero-snapshot group and are not marked partial (Ua)', () => {
    const withMarchZero = computeLocationMetrics(loc, e1Ctx());
    const laterOnly = computeLocationMetrics(loc, e1Ctx({
      events: [{ id: 'evLater', dateOut: '2026-06-15' }],
      paddockWindows: [
        { id: 'pwL', eventId: 'evLater', locationId: 'E1', dateOpened: '2026-05-01', dateClosed: '2026-06-15', areaPct: 100 },
      ],
      groupWindows: [
        { id: 'gwL', eventId: 'evLater', groupId: 'gL', animalClassId: 'acOk', dateJoined: '2026-05-01', dateLeft: '2026-06-15', headCount: 8, avgWeightKg: 453.6 },
      ],
    }));
    // Ua: zero-weight group contributes 0 AUDs, so season AUDs match the known stay alone.
    expect(withMarchZero.auds).toBeCloseTo(laterOnly.auds, 6);
    expect(withMarchZero.auds).toBeGreaterThan(0);
    expect(withMarchZero.audsKnown).toBe(true);
    expect(withMarchZero.dmiPartial).toBe(true);
    expect(withMarchZero).not.toHaveProperty('audsPartial');
  });

  it('leaves Score as the survey average when some weights are missing (Sc)', () => {
    const m = computeLocationMetrics(loc, e1Ctx());
    expect(m.avgScore).toBe(72);
    expect(m.scoreKnown).toBe(true);
  });

  it('dashes DMI and NPK when every group in the window is unknown, and still shows 0 AUDs as known', () => {
    const m = computeLocationMetrics(loc, e1Ctx({
      events: [{ id: 'evMarch', dateOut: '2026-04-03' }],
      paddockWindows: [
        { id: 'pwM', eventId: 'evMarch', locationId: 'E1', dateOpened: '2026-03-27', dateClosed: '2026-04-03', areaPct: 100 },
      ],
      groupWindows: [
        { id: 'gwM', eventId: 'evMarch', groupId: 'gM', animalClassId: 'acBad', dateJoined: '2026-03-27', dateLeft: '2026-04-03', headCount: 4, avgWeightKg: 0 },
      ],
      memberships: marchAnimals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gM', dateJoined: '2026-01-01', dateLeft: '2026-04-03' })),
      animals: marchAnimals,
      animalWeightRecords: [],
    }));
    expect(m.dmiKg).toBeNull();
    expect(m.dmiKnown).toBe(false);
    expect(m.dmiPartial).toBe(false);
    expect(formatMetricValue(m.dmiKg)).toBe('\u2014');
    expect(m.nKg).toBeNull();
    expect(m.npkKnown).toBe(false);
    expect(m.npkPartial).toBe(false);
    expect(m.auds).toBe(0);
    expect(m.audsKnown).toBe(true);
    expect(formatMetricValue(m.auds)).toBe('0');
  });

  it('returns known 0 DMI/NPK/AUDs when the paddock was never present in the window (Z1)', () => {
    const m = computeLocationMetrics(loc, e1Ctx({
      paddockWindows: [
        { id: 'pwM', eventId: 'evMarch', locationId: 'E1', dateOpened: '2024-03-27', dateClosed: '2024-04-03', areaPct: 100 },
      ],
      groupWindows: [
        { id: 'gwM', eventId: 'evMarch', groupId: 'gM', animalClassId: 'acBad', dateJoined: '2024-03-27', dateLeft: '2024-04-03', headCount: 4, avgWeightKg: 0 },
      ],
    }));
    expect(m.dmiKg).toBe(0);
    expect(m.dmiKnown).toBe(true);
    expect(m.dmiPartial).toBe(false);
    expect(m.nKg).toBe(0);
    expect(m.npkKnown).toBe(true);
    expect(m.npkPartial).toBe(false);
    expect(m.auds).toBe(0);
    expect(m.audsKnown).toBe(true);
  });
});

describe('readiness T0', () => {
  it('uses REC-1 when survey recovery days present', () => {
    const r = computeReadiness({ id: 'loc1' }, {
      today: '2026-06-15',
      paddockWindows: [{ locationId: 'loc1', eventId: 'e1', dateOpened: '2026-05-01', dateClosed: '2026-06-01' }],
      events: [{ id: 'e1', dateOut: '2026-06-01' }],
      observations: [{
        locationId: 'loc1', observedAt: '2026-06-01',
        recoveryMinDays: 21, recoveryMaxDays: 35,
      }],
    });
    expect(r.mode).toBe('survey');
    expect(r.earliestReturn).toBe('2026-06-22');
    expect(r.windowCloses).toBe('2026-07-06');
    expect(r.confidence).toBe('min'); // today before earliest
  });

  it('falls back to relative days vs peers when no survey recovery', () => {
    const locs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const paddockWindows = [
      { locationId: 'a', eventId: 'e1', dateOpened: '2026-05-01', dateClosed: '2026-05-10' },
      { locationId: 'b', eventId: 'e2', dateOpened: '2026-05-01', dateClosed: '2026-06-01' },
      { locationId: 'c', eventId: 'e3', dateOpened: '2026-05-01', dateClosed: '2026-04-01' },
    ];
    const events = [
      { id: 'e1', dateOut: '2026-05-10' },
      { id: 'e2', dateOut: '2026-06-01' },
      { id: 'e3', dateOut: '2026-04-01' },
    ];
    const rows = attachReadiness(locs, { today: '2026-06-15', paddockWindows, events, observations: [] });
    const byId = Object.fromEntries(rows.map(r => [r.locationId, r.readiness]));
    expect(byId.a.mode).toBe('relative');
    expect(byId.c.relativeRank).toBe(1); // most rested (oldest last graze)
    expect(byId.b.relativeRank).toBe(3); // least rested
  });

  it('never-grazed and active modes', () => {
    expect(computeReadiness({ id: 'x' }, { paddockWindows: [], events: [] }).mode).toBe('never');
    expect(computeReadiness({ id: 'x' }, { hasActiveEvent: true }).mode).toBe('active');
  });

  it('readinessConfidence bands', () => {
    expect(readinessConfidence('2026-06-01', '2026-06-10', '2026-06-20')).toBe('min');
    expect(readinessConfidence('2026-06-25', '2026-06-10', '2026-06-20')).toBe('past_max');
    expect(readinessConfidence('2026-06-12', '2026-06-10', '2026-06-20')).toBe('mid');
  });

  it('lastGrazeDate picks latest close', () => {
    expect(lastGrazeDate('loc1', {
      paddockWindows: [
        { locationId: 'loc1', eventId: 'e1', dateClosed: '2026-05-01' },
        { locationId: 'loc1', eventId: 'e2', dateClosed: '2026-06-01' },
      ],
      events: [{ id: 'e1', dateOut: '2026-05-01' }, { id: 'e2', dateOut: '2026-06-01' }],
    })).toBe('2026-06-01');
  });
});

describe('sort S0', () => {
  const rows = [
    { locationName: 'Bravo', auds: 10, dmiKg: null, nKg: 5 },
    { locationName: 'Alpha', auds: 20, dmiKg: 100, nKg: null },
    { locationName: 'Charlie', auds: 5, dmiKg: 50, nKg: 1 },
  ];

  it('defaults to name ascending', () => {
    expect(sortMetricRows(rows).map(r => r.locationName)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts numeric ascending with nulls last', () => {
    expect(sortMetricRows(rows, { key: 'auds', dir: 'asc' }).map(r => r.locationName))
      .toEqual(['Charlie', 'Bravo', 'Alpha']);
    expect(sortMetricRows(rows, { key: 'dmiKg', dir: 'asc' }).map(r => r.locationName))
      .toEqual(['Charlie', 'Alpha', 'Bravo']); // null last
  });

  it('nextSortState toggles dir', () => {
    expect(nextSortState({ key: 'name', dir: 'asc' }, 'name')).toEqual({ key: 'name', dir: 'desc' });
    expect(nextSortState({ key: 'name', dir: 'asc' }, 'auds')).toEqual({ key: 'auds', dir: 'desc' });
  });
});

describe('F0 single vertical scroll owner', () => {
  it('describeScrollArchitecture forbids independent Y columns', () => {
    const d = describeScrollArchitecture();
    expect(d.vertical).toBe('single-owner');
    expect(d.nameColumnIndependentY).toBe(false);
    expect(d.metricsColumnIndependentY).toBe(false);
    expect(d.sidebarIndependentY).toBe(false);
  });

  it('hasSingleVerticalScrollOwner detects the invariant', () => {
    const root = el('div', { className: 'loc-mgmt' }, [
      el('div', {
        className: VERTICAL_SCROLL_OWNER_CLASS,
        dataset: { scrollOwner: 'vertical', overflowY: 'auto' },
        'data-scroll-owner': 'vertical',
        'data-overflow-y': 'auto',
      }, [
        el('div', { className: 'loc-mgmt__row' }, [
          el('div', { className: 'loc-mgmt__name' }, ['A']),
          el('div', { className: TIMELINE_SCROLL_CLASS, 'data-overflow-x': 'auto' }, ['t']),
        ]),
      ]),
    ]);
    expect(hasSingleVerticalScrollOwner(root)).toBe(true);
  });

  it('fails when a nested name column also scrolls on Y', () => {
    const root = el('div', {}, [
      el('div', {
        className: VERTICAL_SCROLL_OWNER_CLASS,
        'data-scroll-owner': 'vertical',
        'data-overflow-y': 'auto',
      }, [
        el('div', { className: 'paddock-col', 'data-overflow-y': 'auto' }, ['name']),
      ]),
    ]);
    expect(hasSingleVerticalScrollOwner(root)).toBe(false);
  });

  it('bindHorizontalScrollSync mirrors scrollLeft', () => {
    const a = el('div', {});
    const b = el('div', {});
    Object.defineProperty(a, 'scrollLeft', { writable: true, value: 0 });
    Object.defineProperty(b, 'scrollLeft', { writable: true, value: 0 });
    const unsub = bindHorizontalScrollSync([a, b]);
    a.scrollLeft = 40;
    a.dispatchEvent(new Event('scroll'));
    expect(b.scrollLeft).toBe(40);
    unsub();
  });
});
