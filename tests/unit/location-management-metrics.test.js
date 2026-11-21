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
