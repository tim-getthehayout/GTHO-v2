/**
 * @file #465 Ls1 — List view shows the same Period totals strip as Calendar
 * (season bar → strip → List table), aggregated over the same management rows
 * and window, with units, the #459 pre-window note and the #462 elemental
 * heading and per-cell P / K hover.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState, setMetricWindow, setView } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';

beforeAll(() => setLocale('en', enLocale));

const ok = () => ({ valid: true, errors: [] });
const put = (type, rec) => add(type, rec, ok, r => r, type);
const origWidth = window.innerWidth;
const KEYS = ['pastureDmi', 'storedDmi', 'totalDmi', 'n', 'p', 'k'];

function seed(unitSystem = 'imperial') {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
  put('operations', { id: 'op', name: 'Op', unitSystem });
  put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
  put('farmSettings', {
    id: 'fs', farmId: 'farm', operationId: 'op',
    seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31,
  });
  for (const [id, name] of [['L1', 'North'], ['L2', 'South']]) {
    put('locations', { id, operationId: 'op', farmId: 'farm', name, type: 'land', landUse: 'pasture', areaHectares: 4 });
  }
  put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
  put('animalClasses', {
    id: 'ac1', operationId: 'op', species: 'beef_cattle', role: 'cow',
    dmiPct: 2.5, excretionNRate: 0.35, excretionPRate: 0.08, excretionKRate: 0.25, defaultWeightKg: 545,
  });
  put('animals', { id: 'a1', classId: 'ac1', active: true, operationId: 'op' });
  put('animalGroupMemberships', { id: 'm1', operationId: 'op', animalId: 'a1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: null });
  put('animalWeightRecords', { id: 'w1', operationId: 'op', animalId: 'a1', weightKg: 545, recordedAt: '2026-03-04' });
  put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-06-01' });
  put('eventPaddockWindows', { id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1', dateOpened: '2026-03-04', dateClosed: '2026-06-01', areaPct: 100 });
  put('eventGroupWindows', { id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: '2026-06-01', headCount: 1, avgWeightKg: 545 });
  put('events', { id: 'ev2', operationId: 'op', farmId: 'farm', dateOut: '2026-09-01' });
  put('eventPaddockWindows', { id: 'pw2', operationId: 'op', eventId: 'ev2', locationId: 'L2', dateOpened: '2026-06-01', dateClosed: '2026-09-01', areaPct: 100 });
  put('eventGroupWindows', { id: 'gw2', operationId: 'op', eventId: 'ev2', groupId: 'g1', dateJoined: '2026-06-01', dateLeft: '2026-09-01', headCount: 1, avgWeightKg: 545 });
}

function mount() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderCalendarGrid(c);
  return c;
}

function stripSnapshot(c) {
  const out = {};
  for (const key of KEYS) {
    const cell = c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`);
    out[key] = cell ? { text: cell.textContent, title: cell.title } : null;
  }
  out.heading = c.querySelector('[data-testid="loc-mgmt-period-totals-npk-heading"]')?.textContent ?? null;
  return out;
}

describe('#465 List Period totals strip', () => {
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; });

  for (const unitSystem of ['imperial', 'metric']) {
    it(`renders on List with values identical to Calendar (${unitSystem})`, () => {
      seed(unitSystem);
      setMetricWindow('2026-01-01', '2026-12-31');
      setView('calendar');
      const cal = stripSnapshot(mount());
      document.body.innerHTML = '';
      setView('list');
      const c = mount();
      expect(c.querySelector('[data-testid="loc-mgmt-body"]').dataset.view).toBe('list');
      const list = stripSnapshot(c);
      for (const key of KEYS) expect(list[key], key).toBeTruthy();
      expect(list).toEqual(cal);
      const unit = unitSystem === 'metric' ? 'kg' : 'lb';
      expect(list.n.text).toContain(`Total N (${unit})`);
      expect(list.heading).toBe('N · P · K (elemental)');
      expect(list.p.title).toMatch(new RegExp(`As fertilizer: [\\d,.]+ ${unit} P₂O₅$`));
      expect(list.k.title).toMatch(new RegExp(`As fertilizer: [\\d,.]+ ${unit} K₂O$`));
      expect(list.n.title).not.toContain('As fertilizer');
      // #459 pre-window note: window starts before the first group window.
      expect(list.n.title).toContain('Totals start on');
    });
  }

  it('order on List: season bar → totals strip → List table', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-12-31');
    setView('list');
    const c = mount();
    const kids = [...c.children];
    const strip = c.querySelector('[data-testid="loc-mgmt-period-totals"]');
    const idx = kids.indexOf(strip);
    expect(idx).toBeGreaterThan(0);
    expect(kids[idx - 1].querySelector('[data-testid="loc-mgmt-period-totals"]')).toBeNull();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const bodyIdx = kids.findIndex(k => k === body || k.contains(body));
    expect(bodyIdx).toBeGreaterThan(idx);
    expect(c.querySelector('[data-testid="loc-mgmt-legend"], .loc-mgmt__legend')).toBeNull();
  });

  it('List search filters the table but not the totals (same rows as Calendar)', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-12-31');
    setView('calendar');
    const cal = stripSnapshot(mount());
    document.body.innerHTML = '';
    setView('list');
    const c = mount();
    const search = c.querySelector('[data-testid="loc-mgmt-list-search"]');
    search.value = 'North';
    search.dispatchEvent(new Event('input'));
    expect(c.querySelectorAll('[data-testid="loc-mgmt-metrics"]').length).toBe(1);
    expect(stripSnapshot(c)).toEqual(cal);
    search.value = '';
    search.dispatchEvent(new Event('input'));
  });

  it('changing the season window updates the List strip like Calendar', () => {
    seed();
    setView('list');
    setMetricWindow('2026-01-01', '2026-12-31');
    const full = stripSnapshot(mount());
    document.body.innerHTML = '';
    setMetricWindow('2026-03-04', '2026-05-31');
    const part = stripSnapshot(mount());
    expect(part.n.text).not.toBe(full.n.text);
    document.body.innerHTML = '';
    setView('calendar');
    expect(stripSnapshot(mount())).toEqual(part);
  });
});
