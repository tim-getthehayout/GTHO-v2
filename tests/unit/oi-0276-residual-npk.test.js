/** @file OI-0276 (amends OI-0246 R1) — leftover hay with no NPK % / weight / DM
 * adds 0 and never blanks manure (excretion) NPK; subtle hover note, no "partial". */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import {
  computeLocationMetrics,
  aggregatePeriodTotals,
  residualFeedNpkForLocation,
  residualNpkNote,
  RESIDUAL_NPK_NOTE_NO_PCT,
  RESIDUAL_NPK_NOTE_NO_WEIGHT_DM,
  formatMetricValue,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';

beforeAll(() => setLocale('en', enLocale));

// Prod-shaped feed types: all three have no N/P/K % (names only; synthetic ids).
const FEED_TYPES_NO_NPK = [
  { id: 'ftAlf', name: 'Alfalfa', unit: 'bale', dmPct: 85, nPct: null, pPct: null, kPct: null },
  { id: 'ftGrass', name: 'Round bale- Grass', unit: 'bale', dmPct: 85, nPct: null, pPct: null, kPct: null },
  { id: 'ftPeanut', name: 'Round Bale- Peanut', unit: 'bale', dmPct: 85, nPct: null, pPct: null, kPct: null },
];

const loc = { id: 'E-3', name: 'E-3', type: 'land', landUse: 'pasture', areaHectares: 4.047 };
const event = { id: 'ev1', dateOut: '2026-10-10' };
const pw = { id: 'pw1', eventId: 'ev1', locationId: 'E-3', dateOpened: '2026-10-01', dateClosed: '2026-10-10', areaPct: 100 };
const gw = {
  id: 'gw1', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1',
  dateJoined: '2026-10-01', dateLeft: '2026-10-10', headCount: 10, avgWeightKg: 453.6,
};
const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
const animals = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
const baseCtx = {
  windowStart: '2026-10-01',
  windowEnd: '2026-10-31',
  today: '2026-11-23',
  events: [event],
  paddockWindows: [pw],
  groupWindows: [gw],
  memberships: animals.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null })),
  animals,
  animalClasses: [cls],
  animalWeightRecords: animals.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01' })),
  locations: [loc],
  observations: [],
  feedEntries: [],
  feedChecks: [],
  feedCheckItems: [],
  batches: [],
  feedTypes: [],
  batchNutritionalProfiles: [],
};
const closeCheck = { id: 'fcClose', eventId: 'ev1', date: '2026-10-10', time: '12:00', isCloseReading: true };
const item = (over = {}) => ({
  id: `fci-${Math.random()}`, feedCheckId: 'fcClose', locationId: 'E-3', feedTypeId: 'ftGrass', batchId: null,
  remainingQuantity: 2, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80, ...over,
});
const withResidual = (items, feedTypes = FEED_TYPES_NO_NPK) => ({
  ...baseCtx, feedChecks: [closeCheck], feedCheckItems: items, feedTypes,
});

describe('OI-0276 residual hay without NPK % never blanks manure NPK', () => {
  it('all 3 feed types lack NPK %: pasture still shows manure NPK, hay adds 0, note present, no partial', () => {
    const base = computeLocationMetrics(loc, baseCtx);
    expect(base.nKg).toBeGreaterThan(0);
    const m = computeLocationMetrics(loc, withResidual([
      item({ feedTypeId: 'ftAlf', remainingQuantity: 0.5 }),
      item({ feedTypeId: 'ftGrass', remainingQuantity: 2 }),
      item({ feedTypeId: 'ftPeanut', remainingQuantity: 1 }),
    ]));
    expect(m.npkKnown).toBe(true);
    expect(m.nKg).toBeCloseTo(base.nKg, 6);
    expect(m.pKg).toBeCloseTo(base.pKg, 6);
    expect(m.kKg).toBeCloseTo(base.kKg, 6);
    expect(m.nPerAcre).toBeCloseTo(base.nPerAcre, 6);
    expect(formatMetricValue(m.nKg)).not.toBe('\u2014');
    expect(m.npkPartial).toBe(false);
    expect(m.residualNpkSkippedNoPct).toBe(3);
    expect(residualNpkNote(m)).toBe(RESIDUAL_NPK_NOTE_NO_PCT);
    expect(residualNpkNote(m)).not.toMatch(/partial/i);
    expect(RESIDUAL_NPK_NOTE_NO_PCT).toBe('Leftover hay not counted — feed type has no NPK %');
    // DMI / AUDs untouched by R1
    expect(m.auds).toBeCloseTo(base.auds, 6);
  });

  it('residual with known % still adds as today, with no note', () => {
    const base = computeLocationMetrics(loc, baseCtx);
    const m = computeLocationMetrics(loc, withResidual([item({ feedTypeId: 'hay' })], [
      { id: 'hay', unit: 'bale', nPct: 2, pPct: 1, kPct: 3, dmPct: 80 },
    ]));
    // 2 × 500 × 0.80 = 800 kg DM → N 16, P 8, K 24
    expect(m.nKg - base.nKg).toBeCloseTo(16, 5);
    expect(m.pKg - base.pKg).toBeCloseTo(8, 5);
    expect(m.kKg - base.kKg).toBeCloseTo(24, 5);
    expect(residualNpkNote(m)).toBeNull();
  });

  it('known + unknown residual on one pasture: known adds, unknown adds 0', () => {
    const base = computeLocationMetrics(loc, baseCtx);
    const m = computeLocationMetrics(loc, withResidual([
      item({ feedTypeId: 'hay' }),
      item({ feedTypeId: 'ftGrass', remainingQuantity: 5 }),
    ], [{ id: 'hay', unit: 'bale', nPct: 2, pPct: 1, kPct: 3, dmPct: 80 }, ...FEED_TYPES_NO_NPK]));
    expect(m.nKg - base.nKg).toBeCloseTo(16, 5);
    expect(m.residualNpkSkippedNoPct).toBe(1);
    expect(m.npkPartial).toBe(false);
  });

  it('residual missing weight or DM adds 0, never blanks, and carries the weight/DM note', () => {
    const base = computeLocationMetrics(loc, baseCtx);
    const r = residualFeedNpkForLocation('E-3', {
      windowStart: '2026-10-01', windowEnd: '2026-10-31', events: [event],
      feedChecks: [closeCheck],
      feedCheckItems: [item({ feedTypeId: null, batchId: 'b1', weightPerUnitKgSnapshot: null, dmPctSnapshot: null })],
      batches: [{ id: 'b1', feedTypeId: 'hay', weightPerUnitKg: null, dmPct: null }],
      feedTypes: [{ id: 'hay', unit: 'bale', nPct: 2, pPct: 1, kPct: 3 }],
    });
    expect(r).toMatchObject({ nKg: 0, pKg: 0, kKg: 0, known: true, skippedNoWeightDm: 1, skippedNoPct: 0 });
    const m = computeLocationMetrics(loc, {
      ...baseCtx,
      feedChecks: [closeCheck],
      feedCheckItems: [item({ feedTypeId: null, batchId: 'b1', weightPerUnitKgSnapshot: null, dmPctSnapshot: null })],
      batches: [{ id: 'b1', feedTypeId: 'hay', weightPerUnitKg: null, dmPct: null }],
      feedTypes: [{ id: 'hay', unit: 'bale', nPct: 2, pPct: 1, kPct: 3 }],
    });
    expect(m.npkKnown).toBe(true);
    expect(m.nKg).toBeCloseTo(base.nKg, 6);
    expect(m.residualNpkSkippedNoWeightDm).toBe(1);
    expect(residualNpkNote(m)).toBe(RESIDUAL_NPK_NOTE_NO_WEIGHT_DM);
  });

  it('missing animal weight still marks NPK partial (OI-0249 unchanged)', () => {
    const clsOk = { ...cls, id: 'acOk', defaultWeightKg: 453.6 };
    const clsBad = { ...cls, id: 'acBad' };
    const aOk = Array.from({ length: 5 }, (_, i) => ({ id: `ok${i}`, classId: 'acOk', archived: false, status: 'active' }));
    const aBad = Array.from({ length: 3 }, (_, i) => ({ id: `bad${i}`, classId: 'acBad', archived: false, status: 'active' }));
    const m = computeLocationMetrics(loc, {
      ...withResidual([item({ feedTypeId: 'ftGrass' })]),
      events: [{ id: 'ev1', dateOut: '2026-10-10' }],
      groupWindows: [
        { ...gw, id: 'gwOk', groupId: 'gOk', animalClassId: 'acOk', headCount: 5 },
        { ...gw, id: 'gwBad', groupId: 'gBad', animalClassId: 'acBad', headCount: 3, avgWeightKg: null },
      ],
      memberships: [
        ...aOk.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gOk', dateJoined: '2026-01-01', dateLeft: null })),
        ...aBad.map(a => ({ id: `m${a.id}`, animalId: a.id, groupId: 'gBad', dateJoined: '2026-01-01', dateLeft: null })),
      ],
      animals: [...aOk, ...aBad],
      animalClasses: [clsOk, clsBad],
      animalWeightRecords: aOk.map(a => ({ animalId: a.id, weightKg: 453.6, recordedAt: '2026-09-01' })),
    });
    expect(m.nKg).toBeGreaterThan(0);
    expect(m.npkKnown).toBe(true);
    expect(m.npkPartial).toBe(true);
    expect(m.residualNpkSkippedNoPct).toBe(1);
  });

  it('period totals (OI-0250) follow the rule: numeric N/P/K + summed skip counts, no partial from hay', () => {
    const a = computeLocationMetrics(loc, withResidual([item({ feedTypeId: 'ftGrass' })]));
    const b = computeLocationMetrics({ ...loc, id: 'F-3', name: 'F-3' }, baseCtx);
    const tot = aggregatePeriodTotals([a, b]);
    expect(tot.nKg).toBeCloseTo(a.nKg + b.nKg, 6);
    expect(tot.npkPartial).toBe(false);
    expect(tot.residualNpkSkippedNoPct).toBe(1);
    expect(residualNpkNote(tot)).toBe(RESIDUAL_NPK_NOTE_NO_PCT);
  });
});

describe('OI-0276 grid: hover note on N/P/K and Total N/P/K, no partial marker', () => {
  const ok = () => ({ valid: true, errors: [] });
  const id = (r) => r;
  const put = (type, rec) => add(type, rec, ok, id, type);
  const iso = (offset) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  beforeEach(() => {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    put('operations', { id: 'op', name: 'Op', unitSystem: 'metric' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op' });
    put('locations', { id: 'E-3', operationId: 'op', farmId: 'farm', name: 'E-3', type: 'land', landUse: 'pasture', areaHectares: 4 });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('animalClasses', { ...cls, operationId: 'op' });
    for (const a of animals) {
      put('animals', { ...a, operationId: 'op' });
      put('animalGroupMemberships', { id: `m${a.id}`, operationId: 'op', animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null });
      put('animalWeightRecords', { id: `w${a.id}`, operationId: 'op', animalId: a.id, weightKg: 453.6, recordedAt: '2026-01-01' });
    }
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: iso(-2) });
    put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'E-3', dateOpened: iso(-12), dateClosed: iso(-2), areaPct: 100 });
    put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1', dateJoined: iso(-12), dateLeft: iso(-2), headCount: 10, avgWeightKg: 453.6 });
    for (const ft of FEED_TYPES_NO_NPK) put('feedTypes', { ...ft, operationId: 'op' });
    put('eventFeedChecks', { id: 'fcClose', operationId: 'op', eventId: 'ev1', date: iso(-2), time: '12:00', isCloseReading: true });
    put('eventFeedCheckItems', { id: 'fci1', operationId: 'op', feedCheckId: 'fcClose', locationId: 'E-3', feedTypeId: 'ftGrass', batchId: null, remainingQuantity: 2, unitSnapshot: 'bale', weightPerUnitKgSnapshot: 500, dmPctSnapshot: 80 });
  });

  it('N/P/K cells show a number with the hover note and no partial marker', () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const row = c.querySelector('[data-testid="loc-mgmt-metrics"][data-location-id="E-3"]');
    expect(row).toBeTruthy();
    for (const key of ['nKg', 'pKg', 'kKg']) {
      const cell = row.querySelector(`.loc-mgmt__metric[data-key="${key}"]`);
      expect(cell.dataset.residualNote).toBe('true');
      expect(cell.title).toContain(RESIDUAL_NPK_NOTE_NO_PCT);
      expect(cell.querySelector('.loc-mgmt__metric-value').textContent).not.toMatch(/^—/);
      expect(cell.querySelector('.loc-mgmt__metric-partial')).toBeNull();
      expect(cell.dataset.partial).not.toBe('true');
    }
    for (const key of ['n', 'p', 'k']) {
      const tot = c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`);
      expect(tot.title).toContain(RESIDUAL_NPK_NOTE_NO_PCT);
      expect(tot.querySelector('.loc-mgmt__period-total-value').textContent).not.toMatch(/^—/);
      expect(tot.querySelector('.loc-mgmt__metric-partial')).toBeNull();
    }
  });
});
