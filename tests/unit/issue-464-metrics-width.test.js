/**
 * @file #464 — Calendar head and rows build the SAME metrics-column width, so
 * the date axis origin equals the row timeline origin: expanded (wrap incl. its
 * border), collapsed (empty sticky row placeholder sized to the head tab), and
 * collapsed with a metric sort (tab includes the OI-0274 sort note).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { el } from '../../src/ui/dom.js';
import {
  resetCalendarState, setMetricWindow, setMetricsCollapsed, setSort, setView,
} from '../../src/features/events/calendar-state.js';
import { renderCalendarGrid, applyUniformMetricsWidth } from '../../src/features/events/rotation-calendar/calendar-grid.js';

beforeAll(() => setLocale('en', enLocale));

const mockWidth = (node, w) => {
  Object.defineProperty(node, 'offsetWidth', { configurable: true, get: () => (node.style.width && node.style.width !== 'auto' ? parseFloat(node.style.width) : w) });
  Object.defineProperty(node, 'scrollWidth', { configurable: true, get: () => Math.max(0, w - 1) });
};

describe('#464 applyUniformMetricsWidth (mocked widths)', () => {
  it('expanded: the head wrap (toggle + inner head + its border) and every row cell get one width', () => {
    const inner = el('div', { className: 'loc-mgmt__metrics-head' }, ['heads']);
    const wrap = el('div', { className: 'loc-mgmt__metrics-head-wrap' }, [el('button', {}, ['▾ Metrics']), inner]);
    const a = el('div', { className: 'loc-mgmt__metrics', dataset: { testid: 'loc-mgmt-metrics' } }, ['a']);
    const b = el('div', { className: 'loc-mgmt__metrics', dataset: { testid: 'loc-mgmt-metrics' } }, ['b']);
    const root = el('div', { className: 'loc-mgmt' }, [wrap, a, b]);
    mockWidth(a, 180); mockWidth(b, 212); mockWidth(inner, 200); mockWidth(wrap, 201);
    const max = applyUniformMetricsWidth(root);
    expect(max).toBe(212);
    expect(wrap.style.width).toBe('212px');
    expect(a.style.width).toBe('212px');
    expect(b.style.width).toBe('212px');
    // Inner head stretches inside the wrap (no inline width of its own).
    expect(inner.style.width).toBe('');
    // Head metrics width === row metrics width.
    expect(wrap.offsetWidth).toBe(a.offsetWidth);
  });

  it('expanded: a wrap wider than the rows (wide toggle) sets the rows to the wrap width', () => {
    const inner = el('div', { className: 'loc-mgmt__metrics-head' }, ['h']);
    const wrap = el('div', { className: 'loc-mgmt__metrics-head-wrap' }, [inner]);
    const a = el('div', { className: 'loc-mgmt__metrics', dataset: { testid: 'loc-mgmt-metrics' } }, ['a']);
    const root = el('div', { className: 'loc-mgmt' }, [wrap, a]);
    mockWidth(a, 150); mockWidth(inner, 160); mockWidth(wrap, 161);
    expect(applyUniformMetricsWidth(root)).toBe(161);
    expect(a.style.width).toBe('161px');
    expect(wrap.style.width).toBe('161px');
  });

  for (const [label, tabW] of [['collapsed, name sort', 72], ['collapsed, sorted by DMI/ac (Tim case)', 214]]) {
    it(`${label}: every row placeholder takes the head tab width`, () => {
      const tab = el('div', { className: 'loc-mgmt__metrics-head loc-mgmt__metrics-head--collapsed' }, ['▸ Metrics']);
      const p1 = el('div', { className: 'loc-mgmt__metrics loc-mgmt__metrics--collapsed', dataset: { testid: 'loc-mgmt-metrics-collapsed' } });
      const p2 = el('div', { className: 'loc-mgmt__metrics loc-mgmt__metrics--collapsed', dataset: { testid: 'loc-mgmt-metrics-collapsed' } });
      const root = el('div', { className: 'loc-mgmt loc-mgmt--metrics-collapsed' }, [tab, p1, p2]);
      mockWidth(tab, tabW); mockWidth(p1, 0); mockWidth(p2, 0);
      expect(applyUniformMetricsWidth(root)).toBe(tabW);
      expect(p1.style.width).toBe(`${tabW}px`);
      expect(p2.style.width).toBe(`${tabW}px`);
      expect(p1.offsetWidth).toBe(tab.offsetWidth);
    });
  }

  it('collapsed state is also detected from an ancestor (ResizeObserver passes the scroller)', () => {
    const tab = el('div', { className: 'loc-mgmt__metrics-head loc-mgmt__metrics-head--collapsed' }, ['▸']);
    const p = el('div', { className: 'loc-mgmt__metrics loc-mgmt__metrics--collapsed', dataset: { testid: 'loc-mgmt-metrics-collapsed' } });
    const body = el('div', {}, [tab, p]);
    el('div', { className: 'loc-mgmt loc-mgmt--metrics-collapsed' }, [body]);
    mockWidth(tab, 90); mockWidth(p, 0);
    expect(applyUniformMetricsWidth(body)).toBe(90);
    expect(p.style.width).toBe('90px');
  });
});

describe('#464 rendered calendar', () => {
  const ok = () => ({ valid: true, errors: [] });
  const put = (type, rec) => add(type, rec, ok, r => r, type);
  const origWidth = window.innerWidth;
  function seed() {
    _reset(); localStorage.clear(); resetCalendarState();
    window.history.replaceState(null, '', '#/events');
    document.body.innerHTML = '';
    put('operations', { id: 'op', name: 'Op', unitSystem: 'imperial' });
    put('farms', { id: 'farm', operationId: 'op', name: 'Farm' });
    put('locations', { id: 'L1', operationId: 'op', farmId: 'farm', name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4 });
    put('locations', { id: 'L2', operationId: 'op', farmId: 'farm', name: 'South', type: 'land', landUse: 'pasture', areaHectares: 2 });
  }
  beforeEach(() => { vi.stubGlobal('requestAnimationFrame', () => 0); window.innerWidth = 1280; });
  afterEach(() => { window.innerWidth = origWidth; _reset(); document.body.innerHTML = ''; });

  it('collapsed rows render a placeholder per row (not omitted) next to the visible head tab', () => {
    seed();
    setView('calendar');
    setMetricWindow('2026-01-01', '2026-12-31');
    setMetricsCollapsed(true);
    setSort('dmiPerAcre', 'asc');
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    expect(c.querySelector('[data-testid="loc-mgmt-metrics-head-collapsed"]')).toBeTruthy();
    expect(c.querySelector('[data-testid="loc-mgmt-collapsed-sort-note"]')?.textContent).toBe('Sorted by DMI/ac, low first');
    const rows = c.querySelectorAll('.loc-mgmt__row');
    expect(rows.length).toBe(2);
    for (const row of rows) {
      const ph = row.querySelector('[data-testid="loc-mgmt-metrics-collapsed"]');
      expect(ph).toBeTruthy();
      expect(ph.nextElementSibling?.classList.contains('loc-mgmt__timeline-wrap')).toBe(true);
    }
  });

  it('CSS: desktop placeholder is not display:none; the wrap carries the only border; phone/List stay hidden', () => {
    const css = readFileSync('src/styles/main.css', 'utf8');
    expect(css).not.toMatch(/^\.loc-mgmt__metrics--collapsed \{\s*display: none !important;/m);
    expect(css).toMatch(/\.loc-mgmt__metrics-head-wrap > \.loc-mgmt__metrics-head \{\s*border-right: none;/);
    expect(css).toMatch(/\.loc-mgmt--phone \.loc-mgmt__metrics--collapsed,\s*\.loc-mgmt--list \.loc-mgmt__metrics--collapsed \{\s*display: none !important;/);
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).not.toMatch(/contains\('loc-mgmt--metrics-collapsed'\)\) return 0;/);
    expect(src).toMatch(/\/\/ #464: keep head and row metrics widths matched after a resize\.\n\s*applyUniformMetricsWidth\(body\);/);
  });
});
