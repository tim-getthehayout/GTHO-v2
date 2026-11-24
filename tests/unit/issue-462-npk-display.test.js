/**
 * @file #462 — deposited N/P/K stays elemental, labelled "elemental", with an
 * `As fertilizer: {p} P₂O₅ · {k} K₂O` hover (P × 2.291, K × 1.205); amendment
 * product N/P/K entry relabelled elemental with a bag-grade hint (item 8).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  P_TO_P2O5,
  K_TO_K2O,
  NPK_ELEMENTAL_HEADING,
  fertilizerEquivalents,
  fertilizerHover,
  fertilizerCellHover,
  appendFertilizerHover,
} from '../../src/calcs/fertilizer-equivalents.js';
import { resetCalendarState, setMetricWindow } from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, metricCols } from '../../src/features/events/rotation-calendar/calendar-grid.js';

const LB_PER_KG = 2.20462;

beforeAll(() => setLocale('en', enLocale));

describe('#462 conversion constants (shared module)', () => {
  it('pins P → P₂O₅ at 2.291 and K → K₂O at 1.205', () => {
    expect(P_TO_P2O5).toBe(2.291);
    expect(K_TO_K2O).toBe(1.205);
  });

  it('935.7 lb P gives 2,143.7 lb P₂O₅; K × 1.205', () => {
    const { p2o5, k2o } = fertilizerEquivalents({ p: 935.7, k: 100 });
    expect(Number(p2o5.toFixed(1))).toBe(2143.7);
    expect(k2o).toBeCloseTo(120.5, 9);
  });

  it('hover reads in the farm unit with the cell rounding (imperial)', () => {
    const pKg = 935.7 / LB_PER_KG;
    const kKg = 1000 / LB_PER_KG;
    expect(fertilizerHover(pKg, kKg, { unitSystem: 'imperial' }))
      .toBe('As fertilizer: 2,143.7 lb P₂O₅ · 1,205.0 lb K₂O');
  });

  it('hover reads in kg on metric; the ratios do not depend on the unit', () => {
    expect(fertilizerHover(935.7, 1000, { unitSystem: 'metric' }))
      .toBe('As fertilizer: 2,143.7 kg P₂O₅ · 1,205.0 kg K₂O');
  });

  it('per-area hover uses the per-area unit', () => {
    expect(fertilizerHover(10, 10, { unitSystem: 'metric', perArea: true }))
      .toBe('As fertilizer: 22.9 kg/ha P₂O₅ · 12.1 kg/ha K₂O');
  });

  it('single-cell hover (Design 1610): P → P₂O₅ only, K → K₂O only, N none; unit follows the system', () => {
    expect(fertilizerCellHover('p', 935.7 / LB_PER_KG, { unitSystem: 'imperial' })).toBe('As fertilizer: 2,143.7 lb P₂O₅');
    expect(fertilizerCellHover('k', 1000 / LB_PER_KG, { unitSystem: 'imperial' })).toBe('As fertilizer: 1,205.0 lb K₂O');
    expect(fertilizerCellHover('p', 935.7, { unitSystem: 'metric' })).toBe('As fertilizer: 2,143.7 kg P₂O₅');
    expect(fertilizerCellHover('k', 1000, { unitSystem: 'metric' })).toBe('As fertilizer: 1,205.0 kg K₂O');
    expect(fertilizerCellHover('n', 100, { unitSystem: 'metric' })).toBeNull();
    expect(fertilizerCellHover('p', null, { unitSystem: 'metric' })).toBeNull();
  });

  it('unknown P or K gives no hover; append keeps the existing title first', () => {
    expect(fertilizerHover(null, 1, { unitSystem: 'metric' })).toBeNull();
    expect(fertilizerHover(1, undefined, { unitSystem: 'metric' })).toBeNull();
    expect(appendFertilizerHover('Base', 'As fertilizer: x')).toBe('Base. As fertilizer: x');
    expect(appendFertilizerHover('', 'As fertilizer: x')).toBe('As fertilizer: x');
    expect(appendFertilizerHover('Base', null)).toBe('Base');
  });

  it('every deposited N/P/K surface imports the shared module instead of repeating the numbers', () => {
    const files = [
      'src/features/events/rotation-calendar/calendar-grid.js',
      'src/features/events/detail.js',
      'src/features/dashboard/index.js',
      'src/features/reports/index.js',
    ];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).toMatch(/calcs\/fertilizer-equivalents\.js/);
      expect(src, f).toMatch(/fertilizer(Cell)?Hover\(/);
      expect(src, f).not.toMatch(/2\.291|1\.205/);
    }
  });

  it('event detail and reports N/P/K no longer use the raw-kg / toMetric path (OI-0278 rows 34, 43)', () => {
    const detail = readFileSync('src/features/events/detail.js', 'utf8');
    expect(detail).not.toMatch(/toDisplay\(totalN\)/);
    expect(detail).toMatch(/NPK \$\{ELEMENTAL_SUFFIX\}: N/);
    const reports = readFileSync('src/features/reports/index.js', 'utf8');
    expect(reports).not.toMatch(/info\.nKg\.toFixed\(1\)\} kg/);
    const dash = readFileSync('src/features/dashboard/index.js', 'utf8');
    expect(dash.match(/NPK deposited \$\{ELEMENTAL_SUFFIX\}/g)?.length).toBe(2);
    expect(dash).toMatch(/NPK \$\{ELEMENTAL_SUFFIX\}: N/);
    expect(dash).toMatch(/'NPK \/ Hectare' : 'NPK \/ Acre'\} \$\{ELEMENTAL_SUFFIX\}/);
  });
});

describe('#462 calendar strip and schedule / list N, P, K columns', () => {
  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const origWidth = window.innerWidth;

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
      id: 'm1', operationId: 'op', animalId: 'a1', groupId: 'g1', dateJoined: '2026-03-04', dateLeft: null,
    });
    put('animalWeightRecords', { id: 'w1', operationId: 'op', animalId: 'a1', weightKg: 545, recordedAt: '2026-03-04' });
    put('events', { id: 'ev1', operationId: 'op', farmId: 'farm', dateOut: '2026-11-20' });
    put('eventPaddockWindows', {
      id: 'pw1', operationId: 'op', eventId: 'ev1', locationId: 'L1',
      dateOpened: '2026-03-04', dateClosed: '2026-11-20', areaPct: 100,
    });
    put('eventGroupWindows', {
      id: 'gw1', operationId: 'op', eventId: 'ev1', groupId: 'g1',
      dateJoined: '2026-03-04', dateLeft: '2026-11-20', headCount: 1, avgWeightKg: 545,
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

  for (const unitSystem of ['imperial', 'metric']) {
    it(`strip shows the elemental heading and the P₂O₅ / K₂O hover on Total N/P/K (${unitSystem})`, () => {
      seed(unitSystem);
      setMetricWindow('2026-03-04', '2026-11-24');
      const c = mount();
      const heading = c.querySelector('[data-testid="loc-mgmt-period-totals-npk-heading"]');
      expect(heading?.textContent).toBe(NPK_ELEMENTAL_HEADING);
      expect(NPK_ELEMENTAL_HEADING).toBe('N · P · K (elemental)');
      const unit = unitSystem === 'metric' ? 'kg' : 'lb';
      const nCell = c.querySelector('[data-testid="loc-mgmt-period-total-n"]');
      expect(nCell.title).toMatch(new RegExp(`^Total nitrogen for the period, elemental \\(${unit}\\)`));
      expect(nCell.title).not.toContain('As fertilizer');
      expect(nCell.dataset.fertilizerHover).not.toBe('true');
      const pCell = c.querySelector('[data-testid="loc-mgmt-period-total-p"]');
      expect(pCell.dataset.fertilizerHover).toBe('true');
      expect(pCell.title).toMatch(new RegExp(`elemental \\(${unit}\\)\\. As fertilizer: [\\d,.]+ ${unit} P₂O₅$`));
      const kCell = c.querySelector('[data-testid="loc-mgmt-period-total-k"]');
      expect(kCell.dataset.fertilizerHover).toBe('true');
      expect(kCell.title).toMatch(new RegExp(`elemental \\(${unit}\\)\\. As fertilizer: [\\d,.]+ ${unit} K₂O$`));
      for (const key of ['pastureDmi', 'storedDmi', 'totalDmi']) {
        const cell = c.querySelector(`[data-testid="loc-mgmt-period-total-${key}"]`);
        expect(cell.title, key).not.toContain('As fertilizer');
      }
    });
  }

  it('strip hover numbers are the cell values × 2.291 / × 1.205 at the cell rounding', () => {
    seed('imperial');
    setMetricWindow('2026-03-04', '2026-11-24');
    const c = mount();
    const num = (s) => Number(String(s).replace(/,/g, ''));
    const pCell = c.querySelector('[data-testid="loc-mgmt-period-total-p"]');
    const kCell = c.querySelector('[data-testid="loc-mgmt-period-total-k"]');
    const pShown = num(pCell.querySelector('.loc-mgmt__period-total-value').firstChild.textContent);
    const kShown = num(kCell.querySelector('.loc-mgmt__period-total-value').firstChild.textContent);
    const mp = pCell.title.match(/As fertilizer: ([\d,.]+) lb P₂O₅$/);
    const mk = kCell.title.match(/As fertilizer: ([\d,.]+) lb K₂O$/);
    expect(mp).toBeTruthy();
    expect(mk).toBeTruthy();
    expect(Math.abs(num(mp[1]) - pShown * 2.291)).toBeLessThan(0.3);
    expect(Math.abs(num(mk[1]) - kShown * 1.205)).toBeLessThan(0.3);
  });

  it('phone strip keeps N/P/K labels (no heading); the elemental wording stays in the titles', () => {
    seed('imperial');
    window.innerWidth = 400;
    setMetricWindow('2026-03-04', '2026-11-24');
    const c = mount();
    expect(c.querySelector('[data-testid="loc-mgmt-period-totals-npk-heading"]')).toBeNull();
    const cell = c.querySelector('[data-testid="loc-mgmt-period-total-n"]');
    expect(cell.title).toContain('elemental');
    expect(cell.title).not.toContain('As fertilizer:');
    const pCell = c.querySelector('[data-testid="loc-mgmt-period-total-p"]');
    expect(pCell.title).toContain('elemental');
    expect(pCell.title).toMatch(/As fertilizer: [\d,.k]+ lb P₂O₅$/);
  });

  it('narrow N/P/K column heads keep N/P/K; elemental wording is in their titles', () => {
    for (const us of ['imperial', 'metric']) {
      const cols = metricCols(us);
      const w = us === 'metric' ? '(kg)' : '(lb)';
      const byKey = Object.fromEntries(cols.map(c => [c.key, c]));
      expect(byKey.nKg.head).toBe(`N ${w}`);
      expect(byKey.pKg.head).toBe(`P ${w}`);
      expect(byKey.kKg.head).toBe(`K ${w}`);
      expect(byKey.nKg.title).toBe(`Nitrogen deposited, elemental ${w}`);
      expect(byKey.pKg.title).toBe(`Phosphorus deposited, elemental ${w}`);
      expect(byKey.kKg.title).toBe(`Potassium deposited, elemental ${w}`);
    }
  });

  for (const unitSystem of ['imperial', 'metric']) {
    it(`per-paddock P and K cells carry their own fertilizer hover; N / DMI / AUDs / Score do not (${unitSystem})`, () => {
      seed(unitSystem);
      setMetricWindow('2026-03-04', '2026-11-24');
      const c = mount();
      const unit = unitSystem === 'metric' ? 'kg' : 'lb';
      const row = c.querySelector('[data-testid="loc-mgmt-metrics"][data-location-id="L1"]');
      expect(row).toBeTruthy();
      const p = row.querySelector('.loc-mgmt__metric[data-key="pKg"]');
      const k = row.querySelector('.loc-mgmt__metric[data-key="kKg"]');
      expect(p.dataset.fertilizerHover).toBe('true');
      expect(k.dataset.fertilizerHover).toBe('true');
      expect(p.title).toMatch(new RegExp(`elemental \\(${unit}\\)\\. As fertilizer: [\\d,.]+ ${unit} P₂O₅$`));
      expect(k.title).toMatch(new RegExp(`elemental \\(${unit}\\)\\. As fertilizer: [\\d,.]+ ${unit} K₂O$`));
      const n = row.querySelector('.loc-mgmt__metric[data-key="nKg"]');
      expect(n.title).toBe(`Nitrogen deposited, elemental (${unit})`);
      expect(n.dataset.fertilizerHover).not.toBe('true');
    });
  }

  it('DMI / AUDs / Score cells carry no fertilizer hover', () => {
    seed('imperial');
    setMetricWindow('2026-03-04', '2026-11-24');
    const c = mount();
    const row = c.querySelector('[data-testid="loc-mgmt-metrics"][data-location-id="L1"]');
    expect(row).toBeTruthy();
    for (const key of ['dmiKg', 'auds', 'avgScore']) {
      const cell = row.querySelector(`.loc-mgmt__metric[data-key="${key}"]`);
      expect(cell?.title || '', key).not.toContain('As fertilizer');
    }
  });
});

describe('#462 item 8: amendment product N/P/K entry (elemental, bag-grade hint)', () => {
  it('pins the locked copy', () => {
    expect(enLocale.amendment.productNpk).toBe('N / P / K % (elemental)');
    expect(enLocale.amendment.productNpkPlaceholderN).toBe('N %');
    expect(enLocale.amendment.productNpkPlaceholderP).toBe('P % (elemental)');
    expect(enLocale.amendment.productNpkPlaceholderK).toBe('K % (elemental)');
    expect(enLocale.amendment.productNpkHint).toBe(
      'Bag grades list P₂O₅ and K₂O. For a bag grade, divide P by 2.29 and K by 1.2 (e.g. 10-10-10 → 10 / 4.37 / 8.33).',
    );
  });

  it('bag-grade hint example uses the hint divisors: 10 ÷ 2.29 = 4.37, 10 ÷ 1.2 = 8.33 (Design 1610)', () => {
    expect((10 / 2.29).toFixed(2)).toBe('4.37');
    expect((10 / 1.2).toFixed(2)).toBe('8.33');
    expect(enLocale.amendment.productNpkHint).toContain('divide P by 2.29 and K by 1.2');
    expect(enLocale.amendment.productNpkHint).toContain('10 / 4.37 / 8.33');
    // The display hover keeps the precise shared constants.
    expect(P_TO_P2O5).toBe(2.291);
    expect(K_TO_K2O).toBe(1.205);
  });

  it('the product form renders the label, placeholders and hint; the list row reads elemental', async () => {
    _reset();
    document.body.innerHTML = '';
    const ok = () => ({ valid: true, errors: [] });
    add('inputProductCategories', { id: 'cat', operationId: 'op', name: 'Fertilizer', archived: false }, ok, r => r, 'inputProductCategories');
    add('inputProducts', { id: 'prod', operationId: 'op', name: 'Triple 10', categoryId: 'cat', nPct: 10, pPct: 4.37, kPct: 8.3 }, ok, r => r, 'inputProducts');
    const { renderProductsSection, renderAmendmentRefSheetMarkups } = await import('../../src/features/amendments/reference-tables.js');
    document.body.append(...renderAmendmentRefSheetMarkups());
    const section = renderProductsSection('op');
    document.body.append(section);
    expect(section.textContent).toContain('NPK: 10%/4.37%/8.3% (elemental)');
    const addBtn = section.querySelector('[data-testid="settings-add-product"]');
    addBtn.click();
    const panel = document.querySelector('#product-sheet-panel');
    expect([...panel.querySelectorAll('label')].map(l => l.textContent)).toContain('N / P / K % (elemental)');
    expect(panel.querySelector('[data-testid="product-npk-n"]').placeholder).toBe('N %');
    expect(panel.querySelector('[data-testid="product-npk-p"]').placeholder).toBe('P % (elemental)');
    expect(panel.querySelector('[data-testid="product-npk-k"]').placeholder).toBe('K % (elemental)');
    expect(panel.querySelector('[data-testid="product-npk-hint"]').textContent).toBe(enLocale.amendment.productNpkHint);
    _reset();
    document.body.innerHTML = '';
  });
});
