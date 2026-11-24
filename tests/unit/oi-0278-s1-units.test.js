/** @file OI-0278 S1 — shared units display helper + Calendar/List rows 1–9
 * (brief session_briefs/HOME_DMI_AND_UNITS_2026-11-23.md, Ua+Na; Appendix A rows 1–9). */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/capacity.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  formatMeasure, formatPerArea, unitSuffix, shortUnit, DISPLAY_FAMILIES,
} from '../../src/utils/units.js';
import { resetCalendarState, setView, setSort, setMetricsCollapsed } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, metricCols } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { formatPastureFeedDmiLine, renderPastBlock } from '../../src/features/events/rotation-calendar/past-block.js';
import {
  renderEstimatedFutureBlock, renderForecastFutureBlock, formatHayAmount,
} from '../../src/features/events/rotation-calendar/future-block.js';
import { computeLocationMetrics } from '../../src/features/events/rotation-calendar/location-metrics.js';
import { sortMetricRows, SORT_FIELD } from '../../src/features/events/rotation-calendar/sort-rows.js';
import { getCalcByName } from '../../src/utils/calc-registry.js';

beforeAll(() => setLocale('en', enLocale));

const I = { unitSystem: 'imperial' };
const M = { unitSystem: 'metric' };

describe('formatMeasure', () => {
  it('weight: Ua short labels, Na separators, 0 dp (1 dp under 10)', () => {
    expect(formatMeasure(1234, 'weight', M)).toBe('1,234 kg');
    expect(formatMeasure(1234, 'weight', I)).toBe('2,721 lb');
    expect(formatMeasure(5597.4, 'weight', I)).toBe('12,340 lb');
    expect(formatMeasure(4, 'weight', M)).toBe('4.0 kg');
    expect(formatMeasure(4, 'weight', I)).toBe('8.8 lb');
    expect(formatMeasure(0, 'weight', I)).toBe('0 lb');
    expect(formatMeasure(123.4, 'weight', I)).toBe('272 lb');
  });

  it('null / undefined / NaN / "" → em dash', () => {
    for (const v of [null, undefined, NaN, Infinity, '', 'abc']) {
      expect(formatMeasure(v, 'weight', I)).toBe('—');
      expect(formatPerArea(v, 'weight', I)).toBe('—');
    }
  });

  it('compact only when asked ("12.3k lb"); small values unchanged', () => {
    expect(formatMeasure(5597.4, 'weight', { ...I, compact: true })).toBe('12.3k lb');
    expect(formatMeasure(5597.4, 'weight', { ...M, compact: true })).toBe('5.6k kg');
    expect(formatMeasure(2_000_000, 'weight', { ...M, compact: true })).toBe('2.0M kg');
    expect(formatMeasure(999_960, 'weight', { ...M, compact: true })).toBe('1.0M kg');
    expect(formatMeasure(500, 'weight', { ...M, compact: true })).toBe('500 kg');
    expect(formatMeasure(-5597.4, 'weight', { ...I, compact: true })).toBe('-12.3k lb');
  });

  it('decimals override and unitInHeader (number only)', () => {
    expect(formatMeasure(100, 'weight', { ...M, decimals: 2 })).toBe('100.00 kg');
    expect(formatMeasure(1234, 'weight', { ...I, unitInHeader: true })).toBe('2,721');
    expect(formatMeasure(1234, 'weight', { ...M, unitInHeader: true, compact: true })).toBe('1.2k');
  });

  it('npk 1 dp; area 1 dp (2 dp under 1); length 1 dp', () => {
    expect(formatMeasure(12.34, 'npk', M)).toBe('12.3 kg');
    expect(formatMeasure(12.34, 'npk', I)).toBe('27.2 lb');
    expect(formatMeasure(1234.56, 'npk', M)).toBe('1,234.6 kg');
    expect(formatMeasure(4, 'area', M)).toBe('4.0 ha');
    expect(formatMeasure(4, 'area', I)).toBe('9.9 ac');
    expect(formatMeasure(0.3, 'area', I)).toBe('0.74 ac');
    expect(formatMeasure(0.5, 'area', M)).toBe('0.50 ha');
    expect(formatMeasure(10, 'length', I)).toBe('3.9 in');
    expect(formatMeasure(10, 'length', M)).toBe('10.0 cm');
  });

  it('pricePerWeight: $/kg ↔ $/lb, 2 dp, currency sign leads', () => {
    expect(formatMeasure(1, 'pricePerWeight', M)).toBe('$1.00/kg');
    expect(formatMeasure(1, 'pricePerWeight', I)).toBe('$0.45/lb');
    expect(formatMeasure(2.20462, 'pricePerWeight', I)).toBe('$1.00/lb');
    expect(formatMeasure(1, 'pricePerWeight', { ...I, unitInHeader: true })).toBe('0.45');
  });

  it('nutrientPerDm (Fa): kg/t DM ↔ lb/ton DM = × 2.0', () => {
    expect(formatMeasure(10, 'nutrientPerDm', M)).toBe('10.0 kg/t');
    expect(formatMeasure(10, 'nutrientPerDm', I)).toBe('20.0 lb/ton');
  });

  it('default unitSystem follows the farm (getUnitSystem); no operation → imperial', () => {
    _reset();
    expect(formatMeasure(100, 'weight')).toBe('220 lb');
    add('operations', { id: 'op', name: 'Op', unitSystem: 'metric' }, () => ({ valid: true, errors: [] }), r => r, 'operations');
    expect(formatMeasure(100, 'weight')).toBe('100 kg');
    _reset();
  });

  it('unknown family throws', () => {
    expect(() => formatMeasure(1, 'speed', I)).toThrow('Unknown display family');
    expect(DISPLAY_FAMILIES).toEqual(['weight', 'npk', 'area', 'length', 'pricePerWeight', 'nutrientPerDm', 'count']);
  });
});

describe('formatPerArea / unitSuffix / shortUnit', () => {
  it('input is per ha: kg/ha on metric, lb/ac on imperial (never kg/ac)', () => {
    expect(formatPerArea(100, 'weight', M)).toBe('100.0 kg/ha');
    expect(formatPerArea(100, 'weight', I)).toBe('89.2 lb/ac');
    expect(formatPerArea(100, 'npk', I)).toBe('89.2 lb/ac');
    expect(formatPerArea(10, 'count', I)).toBe('4.0/ac');
    expect(formatPerArea(10, 'count', M)).toBe('10.0/ha');
    expect(formatPerArea(100, 'weight', { ...I, unitInHeader: true })).toBe('89.2');
    expect(formatPerArea(5000, 'weight', { ...M, compact: true })).toBe('5.0k kg/ha');
  });

  it('unitSuffix gives header text', () => {
    expect(unitSuffix('weight', 'imperial')).toBe('(lb)');
    expect(unitSuffix('weight', 'metric')).toBe('(kg)');
    expect(unitSuffix('area', 'imperial')).toBe('(ac)');
    expect(unitSuffix('pricePerWeight', 'imperial')).toBe('($/lb)');
    expect(unitSuffix('nutrientPerDm', 'metric')).toBe('(kg/t)');
    expect(unitSuffix('count', 'metric')).toBe('');
  });

  it('shortUnit incl. per-area', () => {
    expect(shortUnit('weight', 'imperial', { perArea: true })).toBe('lb/ac');
    expect(shortUnit('weight', 'metric', { perArea: true })).toBe('kg/ha');
    expect(shortUnit('area', 'metric')).toBe('ha');
  });
});

describe('rows 1/3/4 — metric columns, per-ha metrics, sort keys', () => {
  it('row 1: headers and tooltips carry the farm unit', () => {
    const imp = Object.fromEntries(metricCols('imperial').map(c => [c.key, c]));
    const met = Object.fromEntries(metricCols('metric').map(c => [c.key, c]));
    expect(imp.dmiKg.head).toBe('DMI (lb)');
    expect(imp.nKg.head).toBe('N (lb)');
    expect(imp.dmiPerAcre.head).toBe('DMI/ac (lb)');
    expect(imp.dmiPerAcre.label).toBe('DMI/ac');
    expect(imp.dmiPerAcre.title).toContain('(lb/ac)');
    expect(met.dmiKg.head).toBe('DMI (kg)');
    // #462: elemental wording in the narrow column title.
    expect(met.kKg.title).toBe('Potassium deposited, elemental (kg)');
    expect(met.dmiPerAcre.head).toBe('DMI/ha (kg)');
    expect(met.dmiPerAcre.title).toContain('(kg/ha)');
    expect(imp.auds.head).toBe('AUDs');
    for (const c of metricCols('imperial')) expect(c.title).not.toMatch(/\(kg/);
  });

  it('row 4: per-area metrics are per ha; the OI-0274 sort ids read them', () => {
    expect(SORT_FIELD).toEqual({
      dmiPerAcre: 'dmiPerHa', audsPerAcre: 'audsPerHa', nPerAcre: 'nPerHa', pPerAcre: 'pPerHa', kPerAcre: 'kPerHa',
    });
    const rows = [
      { locationId: 'a', locationName: 'A', nPerHa: 3 },
      { locationId: 'b', locationName: 'B', nPerHa: 1 },
    ];
    expect(sortMetricRows(rows, { key: 'nPerAcre', dir: 'asc' }).map(r => r.locationId)).toEqual(['b', 'a']);
    const src = readFileSync('src/features/events/rotation-calendar/location-metrics.js', 'utf8');
    expect(src).not.toMatch(/HA_TO_ACRES|2\.47105|PerAcre/);
  });
});

describe('rows 1–6 — Calendar + List render in both unit systems', () => {
  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const iso = (offset) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const origWidth = window.innerWidth;

  function seed(unitSystem) {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op' });
    put('locations', { id: 'L-graze', operationId: 'op', farmId: 'farm', name: 'Grazed', type: 'land', landUse: 'pasture', areaHectares: 4 });
    put('locations', { id: 'L-noac', operationId: 'op', farmId: 'farm', name: 'No area', type: 'land', landUse: 'pasture', areaHectares: null });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('animalClasses', { ...cls, operationId: 'op' });
    for (let i = 0; i < 10; i++) {
      put('animals', { id: `a${i}`, classId: 'ac1', archived: false, status: 'active', operationId: 'op' });
      put('animalGroupMemberships', { id: `m${i}`, operationId: 'op', animalId: `a${i}`, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null });
      put('animalWeightRecords', { id: `w${i}`, operationId: 'op', animalId: `a${i}`, weightKg: 453.6, recordedAt: '2026-01-01' });
    }
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: iso(-2) });
    put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L-graze', dateOpened: iso(-12), dateClosed: iso(-2), areaPct: 100 });
    put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', dateJoined: iso(-12), dateLeft: iso(-2), headCount: 10, avgWeightKg: 453.6 });
  }

  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); });

  const mount = () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  };
  const cellVal = (c, loc, key) => c.querySelector(`[data-testid="loc-mgmt-metrics"][data-location-id="${loc}"] .loc-mgmt__metric[data-key="${key}"] .loc-mgmt__metric-value`)?.textContent;
  const num = (t) => Number(String(t).split(' ')[0].replace(/,/g, ''));

  function readAll(unitSystem, { view = 'calendar', phone = false } = {}) {
    seed(unitSystem);
    if (view === 'list') setView('list');
    if (phone) window.innerWidth = 400;
    const c = mount();
    const head = (k) => c.querySelector(`[data-testid="sort-${k}"]`)?.textContent;
    const total = (k) => c.querySelector(`[data-testid="loc-mgmt-period-total-${k}"]`);
    const areas = [...c.querySelectorAll('.loc-mgmt__area')].map(n => n.textContent);
    return { c, head, total, areas };
  }

  it('desktop Calendar imperial vs metric: same canonical values, converted; units in headers', () => {
    const imp = readAll('imperial');
    const met = readAll('metric');
    // Row 1: header units.
    expect(imp.head('dmiKg')).toBe('DMI (lb)');
    expect(imp.head('nKg')).toBe('N (lb)');
    expect(imp.head('dmiPerAcre')).toBe('DMI/ac (lb)');
    expect(met.head('dmiKg')).toBe('DMI (kg)');
    expect(met.head('dmiPerAcre')).toBe('DMI/ha (kg)');
    // Row 2: values numbers-only (unit in header), with separators, converted.
    const dmiI = cellVal(imp.c, 'L-graze', 'dmiKg');
    const dmiM = cellVal(met.c, 'L-graze', 'dmiKg');
    expect(dmiI).toMatch(/^\d{1,3}(,\d{3})*$/);
    expect(dmiM).toMatch(/^\d{1,3}(,\d{3})*$/);
    expect(num(dmiI) / num(dmiM)).toBeCloseTo(2.20462, 2);
    // DMI/ac: lb/ac = kg/ha × 0.892179; never kg/ac (= kg/ha ÷ 2.47).
    const perI = num(cellVal(imp.c, 'L-graze', 'dmiPerAcre'));
    const perM = num(cellVal(met.c, 'L-graze', 'dmiPerAcre'));
    expect(perM).toBeCloseTo(num(dmiM) / 4, 0);
    expect(perI / perM).toBeCloseTo(0.892179, 2);
    // Row 3: per-area parentheticals carry the full unit.
    expect(cellVal(imp.c, 'L-graze', 'nKg')).toMatch(/^[\d,]+\.\d \(\d+\.\d lb\/ac\)$/);
    expect(cellVal(met.c, 'L-graze', 'nKg')).toMatch(/^[\d,]+\.\d \(\d+\.\d kg\/ha\)$/);
    expect(cellVal(imp.c, 'L-graze', 'auds')).toMatch(/\(\d+\.\d\/ac\)$/);
    expect(cellVal(met.c, 'L-graze', 'auds')).toMatch(/\(\d+\.\d\/ha\)$/);
    expect(cellVal(met.c, 'L-noac', 'dmiPerAcre')).toBe('—');
    // Row 5: period totals strip labels + values.
    expect(imp.total('totalDmi').querySelector('.loc-mgmt__period-total-label').textContent).toBe('Total DMI (lb)');
    expect(imp.total('n').querySelector('.loc-mgmt__period-total-label').textContent).toBe('Total N (lb)');
    expect(met.total('pastureDmi').querySelector('.loc-mgmt__period-total-label').textContent).toBe('Pasture DMI (kg)');
    expect(imp.total('totalDmi').title).toContain('(lb)');
    expect(imp.total('totalDmi').title).not.toContain('(kg)');
    const tI = num(imp.total('totalDmi').querySelector('.loc-mgmt__period-total-value').textContent);
    const tM = num(met.total('totalDmi').querySelector('.loc-mgmt__period-total-value').textContent);
    expect(tI / tM).toBeCloseTo(2.20462, 2);
    // Row 6: area via the helper; no area → "no area" (once).
    expect(imp.areas).toContain('9.9 ac');
    expect(met.areas).toContain('4.0 ha');
    expect(imp.areas).toContain('no area');
    expect(imp.c.textContent).not.toMatch(/no acres|acres/);
  });

  it('phone: compact values (Na) on Calendar + List; parentheticals hidden', () => {
    for (const view of ['calendar', 'list']) {
      const { c, head } = readAll('imperial', { view, phone: true });
      expect(head('dmiKg')).toBe('DMI (lb)');
      const v = cellVal(c, 'L-graze', 'dmiKg');
      expect(v).toMatch(/^\d+(\.\d)?k$|^\d{1,3}$/);
      expect(cellVal(c, 'L-graze', 'nKg')).not.toMatch(/\//);
    }
  });

  it('List desktop shares the same cells (List metric farm)', () => {
    const { c, head } = readAll('metric', { view: 'list' });
    expect(head('dmiPerAcre')).toBe('DMI/ha (kg)');
    expect(cellVal(c, 'L-graze', 'nKg')).toMatch(/kg\/ha\)$/);
  });

  it('collapsed sort note uses the farm area unit', () => {
    seed('metric');
    setMetricsCollapsed(true);
    setSort('dmiPerAcre', 'asc');
    const c = mount();
    expect(c.querySelector('[data-testid="loc-mgmt-collapsed-sort-note"]').textContent).toBe('Sorted by DMI/ha, low first');
  });

  it('computeLocationMetrics: per-ha fields, hasArea', () => {
    seed('imperial');
    const loc = { id: 'L-graze', areaHectares: 4, name: 'Grazed' };
    const m = computeLocationMetrics(loc, {
      windowStart: iso(-30), windowEnd: iso(0), today: iso(0),
      events: [{ id: 'ev1', dateOut: iso(-2) }],
      paddockWindows: [{ id: 'pw1', eventId: 'ev1', locationId: 'L-graze', dateOpened: iso(-12), dateClosed: iso(-2), areaPct: 100 }],
      groupWindows: [{ id: 'gw1', eventId: 'ev1', groupId: 'g1', dateJoined: iso(-12), dateLeft: iso(-2), headCount: 10, avgWeightKg: 453.6 }],
      memberships: [], animals: [], animalClasses: [cls], animalWeightRecords: [],
      locations: [loc], observations: [], feedEntries: [], feedChecks: [], feedCheckItems: [],
      batches: [], feedTypes: [],
    });
    expect(m.hasArea).toBe(true);
    expect(m.auds).toBeGreaterThan(0);
    expect(m.audsPerHa).toBeCloseTo(m.auds / 4, 9);
    expect(m.dmiKg).not.toBeNull();
    expect(m.dmiPerHa).toBeCloseTo(m.dmiKg / 4, 9);
    expect(m).not.toHaveProperty('dmiPerAcre');
    expect(m).not.toHaveProperty('hasAcres');
  });
});

describe('rows 7–9 — past block, future block / CAP-1, dead sidebar', () => {
  it('row 7: past-block DMI in the farm unit ("272 lb DMI")', () => {
    expect(formatPastureFeedDmiLine({ pasturePct: 80, feedPct: 20, dmi: 123.4, headCount: 9, unitSystem: 'imperial' }))
      .toBe('Pasture 80% · Feed 20% · 272 lb DMI · 9 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: 80, feedPct: 20, dmi: 123.4, headCount: 9, unitSystem: 'metric' }))
      .toBe('Pasture 80% · Feed 20% · 123 kg DMI · 9 hd');
    expect(formatPastureFeedDmiLine({ pasturePct: null, feedPct: null, dmi: null, headCount: 9 }))
      .toBe('Pasture —% · Feed —% · — DMI · 9 hd');
    _reset();
    const node = renderPastBlock({
      leftPx: 0, widthPx: 200, groups: [{ id: 'g1', name: 'Cows' }], auds: 3, days: 4,
      pasturePct: 100, feedPct: 0, dmi: 5597.4, headCount: 10, isActive: false, isStripGraze: false,
      isLinkedSecondary: false, eventId: 'e1', onClickBlock: () => {},
    });
    expect(node.textContent).toContain('12,340 lb DMI');
  });

  it('row 8: CAP-1 returns kg; future blocks show hay via the helper', () => {
    const r = getCalcByName('CAP-1').fn({ forecastDmKg: 600, groupDmiKgPerDay: [{ dmiKgPerDay: 400 }], periodDays: 3 });
    expect(r.shortfallKg).toBe(600);
    expect(r).not.toHaveProperty('shortfallLbsHay');
    _reset();
    expect(formatHayAmount(600)).toBe('1,323 lb hay');
    expect(formatHayAmount(null)).toBe('? lb hay');
    const tan = renderForecastFutureBlock({
      leftPx: 0, widthPx: 100, coverageFraction: 0.5, coversHours: 36, shortfallKg: 600, surplusHours: 0,
      isNeverGrazed: false, isGrazingInProgress: false, locationId: 'l', onClickBlock: () => {},
    }).querySelector('.future-block__segment--tan');
    expect(tan.textContent).toBe('1,323 lb hay');
    const never = renderEstimatedFutureBlock({
      leftPx: 0, widthPx: 40, minDate: '', maxDate: '', confidence: 'min',
      isNeverGrazed: true, isGrazingInProgress: false, hayEstimateKg: null,
      locationId: 'l', onClickBlock: () => {},
    });
    expect(never.textContent).toBe('Est. ? lb hay needed \u2014 survey to confirm');
    expect(never.getAttribute('aria-label')).toBe('Never grazed, estimated ? lb hay needed');
    const src = readFileSync('src/features/events/rotation-calendar/future-block.js', 'utf8')
      + readFileSync('src/calcs/capacity.js', 'utf8');
    expect(src).not.toMatch(/lbs hay|2\.20462/);
  });

  it('row 8 on a metric farm: kg hay', () => {
    _reset();
    add('operations', { id: 'op', name: 'Op', unitSystem: 'metric' }, () => ({ valid: true, errors: [] }), r => r, 'operations');
    expect(formatHayAmount(600)).toBe('600 kg hay');
    expect(formatHayAmount(undefined)).toBe('? kg hay');
    _reset();
  });

  it('row 9: dead rotation-calendar sidebar.js is deleted', () => {
    expect(existsSync('src/features/events/rotation-calendar/sidebar.js')).toBe(false);
  });

  it('S1 files no longer use display() long labels or "no acres"', () => {
    const grid = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(grid).not.toMatch(/\bdisplay\(/);
    expect(grid).not.toMatch(/'no acres'|' · no acres'/);
    expect(grid).not.toMatch(/\(kg\)'|\(kg\/ac\)/);
  });
});
