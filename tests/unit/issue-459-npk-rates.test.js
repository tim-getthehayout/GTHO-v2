/**
 * @file #459 — per-class NRCS/ASAE excretion rates, unknown-class fallback,
 * and Calendar strip hover note when the period starts before the first
 * group window.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale, t } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  ANIMAL_CLASSES_BY_SPECIES,
  SEED_EXCRETION_RATES,
} from '../../src/features/onboarding/seed-data.js';
import { DEFAULT_EXCRETION_RATES } from '../../src/calcs/excretion-defaults.js';
import { formatShortDate } from '../../src/utils/date-format.js';
import {
  earliestGroupWindowDate,
  periodStartsBeforeFirstGroupWindow,
} from '../../src/features/events/rotation-calendar/location-metrics.js';
import { resetCalendarState, setMetricWindow } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';

beforeAll(() => setLocale('en', enLocale));

const LOCKED = {
  beef_cattle: {
    cow: { n: 0.35, p: 0.08, k: 0.25 },
    bull: { n: 0.35, p: 0.08, k: 0.25 },
    heifer: { n: 0.45, p: 0.08, k: 0.29 },
    steer: { n: 0.45, p: 0.08, k: 0.29 },
    calf: { n: 0.45, p: 0.08, k: 0.29 },
  },
  dairy_cattle: {
    cow: { n: 0.71, p: 0.12, k: 0.33 },
    heifer: { n: 0.27, p: 0.05, k: 0.12 },
    bull: { n: 0.30, p: 0.042, k: 0.10 },
    steer: { n: 0.27, p: 0.05, k: 0.12 },
    calf: { n: 0.42, p: 0.05, k: 0.11 },
  },
  sheep: {
    ewe: { n: 0.45, p: 0.07, k: 0.30 },
    ram: { n: 0.45, p: 0.07, k: 0.30 },
    wether: { n: 0.45, p: 0.07, k: 0.30 },
    lamb: { n: 0.45, p: 0.07, k: 0.30 },
  },
  goat: {
    doe: { n: 0.45, p: 0.11, k: 0.31 },
    buck: { n: 0.45, p: 0.11, k: 0.31 },
    wether: { n: 0.45, p: 0.11, k: 0.31 },
    kid: { n: 0.45, p: 0.11, k: 0.31 },
  },
};

describe('#459 seed and fallback excretion rates', () => {
  it('pins every seed class (18) to the locked NRCS / ASAE table, including goats at 0.45/0.11/0.31', () => {
    const seen = [];
    for (const [species, roles] of Object.entries(LOCKED)) {
      const rows = ANIMAL_CLASSES_BY_SPECIES[species];
      expect(rows, species).toBeTruthy();
      for (const [role, rates] of Object.entries(roles)) {
        const row = rows.find(r => r.role === role);
        expect(row, `${species}/${role} missing from seed`).toBeTruthy();
        expect(row.excretionNRate, `${species}/${role} N`).toBeCloseTo(rates.n, 3);
        expect(row.excretionPRate, `${species}/${role} P`).toBeCloseTo(rates.p, 3);
        expect(row.excretionKRate, `${species}/${role} K`).toBeCloseTo(rates.k, 3);
        expect(SEED_EXCRETION_RATES[species][role]).toEqual(rates);
        seen.push(`${species}/${role}`);
      }
    }
    const allSeed = Object.entries(ANIMAL_CLASSES_BY_SPECIES).flatMap(
      ([sp, rows]) => rows.map(r => `${sp}/${r.role}`),
    );
    expect(allSeed.sort()).toEqual(seen.sort());
    expect(seen).toHaveLength(18);
  });

  it('unknown-class fallback is the beef cow row 0.35/0.08/0.25', () => {
    expect(DEFAULT_EXCRETION_RATES).toEqual({ n: 0.35, p: 0.08, k: 0.25 });
    expect(DEFAULT_EXCRETION_RATES).toEqual(SEED_EXCRETION_RATES.beef_cattle.cow);
  });

  it('pins the shared fallback 0.35/0.08/0.25 and keeps those literals only in excretion-defaults.js', () => {
    expect(DEFAULT_EXCRETION_RATES).toEqual({ n: 0.35, p: 0.08, k: 0.25 });
    // #462 design note: the NPK-1 registry example no longer carries 0.145, so no file is exempt.
    const skipOld = new Set();
    const oldHits = [];
    const fallbackHits = [];
    const fallbackRe = /\{\s*n:\s*0\.35\s*,\s*p:\s*0\.08\s*,\s*k:\s*0\.25\s*\}/;
    function walk(dir) {
      for (const name of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, name.name);
        if (name.isDirectory()) {
          if (name.name === 'node_modules') continue;
          walk(p);
          continue;
        }
        if (!name.name.endsWith('.js')) continue;
        const rel = p.replace(/^\.\//, '');
        const src = readFileSync(p, 'utf8');
        if (/0\.145/.test(src) && !skipOld.has(rel)) oldHits.push(rel);
        if (fallbackRe.test(src) && rel !== 'src/calcs/excretion-defaults.js') fallbackHits.push(rel);
      }
    }
    walk('src');
    expect(oldHits).toEqual([]);
    expect(fallbackHits).toEqual([]);
    const core = readFileSync('src/calcs/core.js', 'utf8');
    expect(core).not.toMatch(/0\.145/);
    expect(core).toMatch(/excretionNRate: DEFAULT_EXCRETION_RATES\.n/);
    const defaultsSrc = readFileSync('src/calcs/excretion-defaults.js', 'utf8');
    expect(defaultsSrc).toMatch(fallbackRe);
  });
});

describe('#459 pre-first-window strip note', () => {
  it('earliestGroupWindowDate is the min dateJoined', () => {
    expect(earliestGroupWindowDate([])).toBeNull();
    expect(earliestGroupWindowDate([
      { dateJoined: '2026-03-19' },
      { dateJoined: '2026-03-04' },
      { dateJoined: '2026-07-05' },
    ])).toBe('2026-03-04');
  });

  it('periodStartsBeforeFirstGroupWindow is a strict date comparison', () => {
    expect(periodStartsBeforeFirstGroupWindow('2026-03-01', '2026-03-04')).toBe(true);
    expect(periodStartsBeforeFirstGroupWindow('2026-03-04', '2026-03-04')).toBe(false);
    expect(periodStartsBeforeFirstGroupWindow('2026-03-05', '2026-03-04')).toBe(false);
    expect(periodStartsBeforeFirstGroupWindow('2026-01-01', null)).toBe(false);
  });

  it('formats the first-window date with formatShortDate and uses the locked hover copy', () => {
    expect(formatShortDate('2026-03-04')).toBe('Mar 4, 26');
    expect(t('event.periodTotalsPreWindow', { date: formatShortDate('2026-03-04') }))
      .toBe('Totals start on Mar 4, 26. Earlier days have no grazing records.');
    expect(enLocale.event.periodTotalsPreWindow).toBe('Totals start on {date}. Earlier days have no grazing records.');
  });

  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const origWidth = window.innerWidth;

  function seed({ firstWindow = '2026-03-04' } = {}) {
    _reset();
    localStorage.clear();
    resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('farmSettings', {
      id: 'fs', farmId: 'farm', operationId: 'op',
      seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31,
    });
    put('locations', {
      id: 'L1', operationId: 'op', farmId: 'farm', name: 'Paddock',
      type: 'land', landUse: 'pasture', areaHectares: 4,
    });
    put('groups', { id: 'g1', operationId: 'op', name: 'Cows' });
    put('animalClasses', {
      id: 'ac1', operationId: 'op', species: 'beef_cattle', role: 'cow',
      dmiPct: 2.5, excretionNRate: 0.35, excretionPRate: 0.08, excretionKRate: 0.25,
      defaultWeightKg: 545,
    });
    put('animals', { id: 'a1', classId: 'ac1', active: true, operationId: 'op' });
    put('animalGroupMemberships', {
      id: 'm1', operationId: 'op', animalId: 'a1', groupId: 'g1',
      dateJoined: firstWindow, dateLeft: null,
    });
    put('animalWeightRecords', {
      id: 'w1', operationId: 'op', animalId: 'a1', weightKg: 545, recordedAt: firstWindow,
    });
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-11-20' });
    put('eventPaddockWindows', {
      id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1',
      dateOpened: firstWindow, dateClosed: '2026-11-20', areaPct: 100,
    });
    put('eventGroupWindows', {
      id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1',
      dateJoined: firstWindow, dateLeft: '2026-11-20', headCount: 1, avgWeightKg: 545,
    });
  }

  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; });

  function mount() {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  }

  const NOTE = 'Totals start on Mar 4, 26. Earlier days have no grazing records.';
  const DMI_KEYS = ['pastureDmi', 'storedDmi', 'totalDmi'];
  const NPK_KEYS = ['n', 'p', 'k'];

  it('shows the hover note on Total N/P/K and DMI cells when the period starts before the first group window', () => {
    seed();
    setMetricWindow('2026-01-01', '2026-11-24');
    const c = mount();
    for (const key of [...DMI_KEYS, ...NPK_KEYS]) {
      const cell = c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`);
      expect(cell, key).toBeTruthy();
      expect(cell.dataset.preWindowNote, key).toBe('true');
      expect(cell.title, key).toContain(NOTE);
    }
  });

  it('does not show the note when the period starts on the first group window', () => {
    seed();
    setMetricWindow('2026-03-04', '2026-11-24');
    const c = mount();
    for (const key of [...DMI_KEYS, ...NPK_KEYS]) {
      const cell = c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`);
      expect(cell, key).toBeTruthy();
      expect(cell.dataset.preWindowNote, key).not.toBe('true');
      expect(cell.title || '', key).not.toContain('have no grazing records');
    }
  });
});
