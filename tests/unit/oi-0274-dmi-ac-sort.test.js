/** @file OI-0274 (Dl1+Do0+Ds1+Dp1+Dm1+Dc1) DMI/ac as its own sortable metric,
 * OI-0275 (Lc0) List parity, OI-0267 (Pd1) Metrics collapse remembered per device. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  resetCalendarState, readStateFromUrl, getCalendarState, setSort, setView,
  setMetricsCollapsed, toggleMetricsCollapsed,
} from '../../src/features/events/calendar-state.js';
import {
  renderCalendarGrid, formatDmiPerAcre, collapsedSortNote,
} from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { sortMetricRows, nextSortState } from '../../src/features/events/rotation-calendar/sort-rows.js';

beforeAll(() => setLocale('en', enLocale));

const SORT_LS = 'gtho_v2_locations_sort';
const COLLAPSE_LS = 'gtho_v2_locations_metrics_collapsed';

describe('OI-0274 sort rules (unit)', () => {
  const rows = [
    { locationId: 'a', locationName: 'A', dmiPerAcre: 50 },
    { locationId: 'n', locationName: 'NoAcres', dmiPerAcre: null },
    { locationId: 'b', locationName: 'B', dmiPerAcre: 10 },
    { locationId: 'u', locationName: 'Unknown', dmiPerAcre: undefined },
    { locationId: 'c', locationName: 'C', dmiPerAcre: 30 },
  ];

  it('Ds1: first tap on DMI/ac is lowest first; second tap flips', () => {
    const first = nextSortState({ key: 'name', dir: 'asc' }, 'dmiPerAcre');
    expect(first).toEqual({ key: 'dmiPerAcre', dir: 'asc' });
    expect(nextSortState(first, 'dmiPerAcre')).toEqual({ key: 'dmiPerAcre', dir: 'desc' });
  });

  it('other keys keep their first-tap direction (metrics high first, name A→Z)', () => {
    expect(nextSortState({ key: 'name', dir: 'asc' }, 'dmiKg')).toEqual({ key: 'dmiKg', dir: 'desc' });
    expect(nextSortState({ key: 'name', dir: 'asc' }, 'auds')).toEqual({ key: 'auds', dir: 'desc' });
    expect(nextSortState({ key: 'dmiKg', dir: 'desc' }, 'name')).toEqual({ key: 'name', dir: 'asc' });
  });

  it('no acreage / unknown DMI sorts last in BOTH directions', () => {
    expect(sortMetricRows(rows, { key: 'dmiPerAcre', dir: 'asc' }).map(r => r.locationId))
      .toEqual(['b', 'c', 'a', 'n', 'u']);
    expect(sortMetricRows(rows, { key: 'dmiPerAcre', dir: 'desc' }).map(r => r.locationId))
      .toEqual(['a', 'c', 'b', 'n', 'u']);
  });

  it('formatDmiPerAcre: one decimal; no acreage or unknown → —', () => {
    expect(formatDmiPerAcre({ hasAcres: true, dmiPerAcre: 12.345 })).toBe('12.3');
    expect(formatDmiPerAcre({ hasAcres: false, dmiPerAcre: null })).toBe('—');
    expect(formatDmiPerAcre({ hasAcres: true, dmiPerAcre: null })).toBe('—');
    expect(formatDmiPerAcre(null)).toBe('—');
  });

  it('Dc1 note text: DMI/ac low first; none for name', () => {
    expect(collapsedSortNote({ key: 'dmiPerAcre', dir: 'asc' })).toBe('Sorted by DMI/ac, low first');
    expect(collapsedSortNote({ key: 'dmiPerAcre', dir: 'desc' })).toBe('Sorted by DMI/ac, high first');
    expect(collapsedSortNote({ key: 'auds', dir: 'desc' })).toBe('Sorted by AUDs, high first');
    expect(collapsedSortNote({ key: 'name', dir: 'asc' })).toBeNull();
  });
});

describe('OI-0274 Dm1 sort persistence (calendar-state)', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
  });

  it('setSort writes { key, dir } and a remount with no URL sort restores it', () => {
    setSort('dmiPerAcre', 'asc');
    expect(JSON.parse(localStorage.getItem(SORT_LS))).toEqual({ key: 'dmiPerAcre', dir: 'asc' });
    window.history.replaceState(null, '', '#/events');
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('dmiPerAcre');
    expect(getCalendarState().sortDir).toBe('asc');
    window.history.replaceState(null, '', '#/events?zoom=month');
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('dmiPerAcre');
  });

  it('an explicit URL sortKey/sortDir wins over the stored sort', () => {
    setSort('dmiPerAcre', 'asc');
    window.history.replaceState(null, '', '#/events?sortKey=auds&sortDir=desc');
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('auds');
    expect(getCalendarState().sortDir).toBe('desc');
  });

  it('unset / invalid / throwing storage → name asc', () => {
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('name');
    localStorage.setItem(SORT_LS, JSON.stringify({ key: 'bogus', dir: 'asc' }));
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('name');
    localStorage.setItem(SORT_LS, '{not json');
    readStateFromUrl();
    expect(getCalendarState().sortKey).toBe('name');
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private'); });
    try {
      readStateFromUrl();
      expect(getCalendarState().sortKey).toBe('name');
      expect(getCalendarState().sortDir).toBe('asc');
    } finally { spy.mockRestore(); }
  });
});

describe('OI-0267 Pd1 Metrics collapse remembered per device', () => {
  beforeEach(() => {
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
  });

  it('collapse then remount stays collapsed; expand then remount stays expanded', () => {
    toggleMetricsCollapsed();
    expect(localStorage.getItem(COLLAPSE_LS)).toBe('true');
    window.history.replaceState(null, '', '#/events?zoom=month');
    readStateFromUrl();
    expect(getCalendarState().metricsCollapsed).toBe(true);
    window.history.replaceState(null, '', '#/events');
    readStateFromUrl();
    expect(getCalendarState().metricsCollapsed).toBe(true);
    setMetricsCollapsed(false);
    readStateFromUrl();
    expect(getCalendarState().metricsCollapsed).toBe(false);
  });

  it('unset or invalid → expanded (Cm1a); not added to the URL', () => {
    readStateFromUrl();
    expect(getCalendarState().metricsCollapsed).toBe(false);
    localStorage.setItem(COLLAPSE_LS, 'garbage');
    readStateFromUrl();
    expect(getCalendarState().metricsCollapsed).toBe(false);
    setMetricsCollapsed(true);
    setSort('auds', 'desc'); // forces a URL sync
    expect(window.location.hash).not.toMatch(/collapse/i);
  });

  it('throwing localStorage falls back silently to expanded', () => {
    const g = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('private'); });
    const s = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('private'); });
    try {
      expect(() => setMetricsCollapsed(true)).not.toThrow();
      readStateFromUrl();
      expect(getCalendarState().metricsCollapsed).toBe(false);
    } finally { g.mockRestore(); s.mockRestore(); }
  });
});

describe('OI-0274/0275 grid: DMI/ac metric, sort button, phone, collapsed note, List parity', () => {
  const ok = () => ({ valid: true, errors: [] });
  const id = (r) => r;
  const put = (type, rec) => add(type, rec, ok, id, type);
  const iso = (offset) => {
    const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const cls = { id: 'ac1', species: 'beef_cattle', dmiPct: 2.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 };
  const animals = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, classId: 'ac1', archived: false, status: 'active' }));
  const origWidth = window.innerWidth;

  beforeEach(() => {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    vi.stubGlobal('requestAnimationFrame', () => 0);
    window.innerWidth = 1280;
    put('operations', { id: 'op', name: 'Op', unitSystem: 'metric' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', { id: 'fs', farmId: 'farm', operationId: 'op' });
    // Grazed (known DMI/ac), idle with acres (0 DMI/ac), and no acreage (—).
    put('locations', { id: 'L-graze', operationId: 'op', farmId: 'farm', name: 'Grazed', type: 'land', landUse: 'pasture', areaHectares: 4 });
    put('locations', { id: 'L-idle', operationId: 'op', farmId: 'farm', name: 'Idle', type: 'land', landUse: 'pasture', areaHectares: 2 });
    put('locations', { id: 'L-noac', operationId: 'op', farmId: 'farm', name: 'Aaa no acres', type: 'land', landUse: 'pasture', areaHectares: null });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('animalClasses', { ...cls, operationId: 'op' });
    for (const a of animals) {
      put('animals', { ...a, operationId: 'op' });
      put('animalGroupMemberships', { id: `m${a.id}`, operationId: 'op', animalId: a.id, groupId: 'g1', dateJoined: '2026-01-01', dateLeft: null });
      put('animalWeightRecords', { id: `w${a.id}`, operationId: 'op', animalId: a.id, weightKg: 453.6, recordedAt: '2026-01-01' });
    }
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: iso(-2) });
    put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L-graze', dateOpened: iso(-12), dateClosed: iso(-2), areaPct: 100 });
    put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', animalClassId: 'ac1', dateJoined: iso(-12), dateLeft: iso(-2), headCount: 10, avgWeightKg: 453.6 });
  });
  afterEach(() => { window.innerWidth = origWidth; });

  const mount = () => {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  };
  const rowOrder = (c) => [...c.querySelectorAll('[data-testid="loc-mgmt-metrics"]')].map(n => n.dataset.locationId);
  const cell = (c, locId, key) => c.querySelector(`[data-testid="loc-mgmt-metrics"][data-location-id="${locId}"] .loc-mgmt__metric[data-key="${key}"]`);

  function checkDmiAc(c) {
    const line1 = c.querySelector('[data-testid="loc-mgmt-metrics"][data-location-id="L-graze"] [data-testid="loc-mgmt-metrics-line1"]');
    expect([...line1.querySelectorAll('.loc-mgmt__metric')].map(n => n.dataset.key)).toEqual(['dmiKg', 'dmiPerAcre', 'auds']);
    const dmiAc = cell(c, 'L-graze', 'dmiPerAcre');
    expect(dmiAc.querySelector('.loc-mgmt__metric-label').textContent).toBe('DMI/ac');
    const v = dmiAc.querySelector('.loc-mgmt__metric-value').textContent;
    expect(v).toMatch(/^\d+\.\d$/);
    expect(v).not.toMatch(/[()]/);
    // Do0: DMI total has no "(x/ac)" suffix any more.
    expect(cell(c, 'L-graze', 'dmiKg').querySelector('.loc-mgmt__metric-value').textContent).not.toMatch(/\/ac/);
    expect(cell(c, 'L-noac', 'dmiPerAcre').querySelector('.loc-mgmt__metric-value').textContent).toBe('—');
    expect(c.querySelector('[data-testid="sort-dmiPerAcre"]')).toBeTruthy();
  }

  it('desktop Calendar: DMI/ac right of DMI, no parentheses, own sort button; AUDs keep (x/ac)', () => {
    const c = mount();
    checkDmiAc(c);
    expect(cell(c, 'L-graze', 'auds').querySelector('.loc-mgmt__metric-value').textContent).toMatch(/\(\d+(\.\d)?\/ac\)/);
  });

  it('Dp1 phone: DMI/ac shows; other per-acre suffixes stay hidden', () => {
    window.innerWidth = 400;
    const c = mount();
    checkDmiAc(c);
    expect(cell(c, 'L-graze', 'auds').querySelector('.loc-mgmt__metric-value').textContent).not.toMatch(/\/ac/);
  });

  it('tapping DMI/ac sorts lowest first, no-acre last; second tap flips, no-acre still last; persisted', () => {
    let c = mount();
    expect(rowOrder(c)).toEqual(['L-noac', 'L-graze', 'L-idle']); // name asc
    c.querySelector('[data-testid="sort-dmiPerAcre"]').click();
    document.body.innerHTML = '';
    c = mount();
    expect(rowOrder(c)).toEqual(['L-idle', 'L-graze', 'L-noac']);
    expect(JSON.parse(localStorage.getItem('gtho_v2_locations_sort'))).toEqual({ key: 'dmiPerAcre', dir: 'asc' });
    c.querySelector('[data-testid="sort-dmiPerAcre"]').click();
    document.body.innerHTML = '';
    c = mount();
    expect(rowOrder(c)).toEqual(['L-graze', 'L-idle', 'L-noac']);
    // Remount from a clean URL (reload) restores the stored sort.
    window.history.replaceState(null, '', '#/events');
    readStateFromUrl();
    document.body.innerHTML = '';
    c = mount();
    expect(rowOrder(c)).toEqual(['L-graze', 'L-idle', 'L-noac']);
    expect(c.querySelector('[data-testid="sort-dmiPerAcre"]').textContent).toBe('DMI/ac ↓');
  });

  it('Dc1: collapsed Calendar shows the sort note; default name sort shows none', () => {
    setMetricsCollapsed(true);
    let c = mount();
    expect(c.querySelector('[data-testid="loc-mgmt-collapsed-sort-note"]')).toBeNull();
    setSort('dmiPerAcre', 'asc');
    document.body.innerHTML = '';
    c = mount();
    expect(c.querySelector('[data-testid="loc-mgmt-collapsed-sort-note"]').textContent).toBe('Sorted by DMI/ac, low first');
    // The sort still applies while collapsed.
    const names = [...c.querySelectorAll('.loc-mgmt__metrics--collapsed')].map(n => n.dataset.locationId);
    expect(names).toEqual(['L-idle', 'L-graze', 'L-noac']);
  });

  it('OI-0275 Lc0 List: same DMI/ac metric + button, sort carries over, always expanded, no note', () => {
    setSort('dmiPerAcre', 'asc');
    setMetricsCollapsed(true); // Calendar-only; List ignores it
    setView('list');
    const c = mount();
    checkDmiAc(c);
    expect(rowOrder(c)).toEqual(['L-idle', 'L-graze', 'L-noac']);
    expect(c.querySelector('[data-testid="metrics-collapse-toggle"]')).toBeNull();
    expect(c.querySelector('[data-testid="loc-mgmt-collapsed-sort-note"]')).toBeNull();
    expect(c.querySelector('.loc-mgmt__metrics--collapsed')).toBeNull();
  });

  it('List phone also shows DMI/ac', () => {
    window.innerWidth = 400;
    setView('list');
    const c = mount();
    checkDmiAc(c);
  });
});
