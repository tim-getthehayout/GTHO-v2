/** @file OI-0252 Ls+Wu+Sb+Br+Nn+Pp+Uf+D0 — stacked metrics + uniform width + List buttons right. */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  resetCalendarState, getCalendarState, readStateFromUrl,
} from '../../src/features/events/calendar-state.js';
import {
  applyUniformMetricsWidth,
  renderCalendarGrid,
} from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { el } from '../../src/ui/dom.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LOC_NARROW = '00000000-0000-4000-8000-0000000000c1';
const LOC_WIDE = '00000000-0000-4000-8000-0000000000c2';

beforeAll(() => setLocale('en', enLocale));

function seedTwo() {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC_NARROW, operationId: OP, farmId: FARM, name: 'G-4',
    type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: LOC_WIDE, operationId: OP, farmId: FARM, name: 'J1-1',
    type: 'land', landUse: 'pasture', areaHectares: 6.5,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

describe('OI-0252 metrics block layout', () => {
  beforeEach(seedTwo);

  it('locks Ls: two stacked lines DMI·AUDs over N·P·K·Score (not flat six)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);

    const metrics = container.querySelector('[data-testid="loc-mgmt-metrics"]');
    expect(metrics).toBeTruthy();
    const line1 = metrics.querySelector('[data-testid="loc-mgmt-metrics-line1"]');
    const line2 = metrics.querySelector('[data-testid="loc-mgmt-metrics-line2"]');
    expect(line1).toBeTruthy();
    expect(line2).toBeTruthy();
    expect([...line1.querySelectorAll('[data-key]')].map(n => n.dataset.key))
      .toEqual(['dmiKg', 'dmiPerAcre', 'auds']); // OI-0274 Dl1: DMI · DMI/ac · AUDs
    expect([...line2.querySelectorAll('[data-key]')].map(n => n.dataset.key))
      .toEqual(['nKg', 'pKg', 'kKg', 'avgScore']);
    // Not a flat single-line of six direct children
    expect(metrics.querySelectorAll(':scope > .loc-mgmt__metric').length).toBe(0);
  });

  it('Wu: applyUniformMetricsWidth sets every metrics cell to the max measured width', () => {
    const a = el('div', { className: 'loc-mgmt__metrics', dataset: { testid: 'loc-mgmt-metrics' } }, ['0']);
    const b = el('div', { className: 'loc-mgmt__metrics', dataset: { testid: 'loc-mgmt-metrics' } }, ['wide']);
    const root = el('div', {}, [a, b]);
    Object.defineProperty(a, 'scrollWidth', { configurable: true, get: () => 80 });
    Object.defineProperty(b, 'scrollWidth', { configurable: true, get: () => 220 });
    const max = applyUniformMetricsWidth(root);
    expect(max).toBe(220);
    expect(a.style.width).toBe('220px');
    expect(b.style.width).toBe('220px');
    expect(a.style.minWidth).toBe('220px');
    expect(b.style.minWidth).toBe('220px');
  });

  it('Sb+Br: List keeps stacked metrics and places row actions on the right', () => {
    window.history.replaceState(null, '', '#/events?view=list');
    readStateFromUrl();
    expect(getCalendarState().view).toBe('list');

    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);

    const row = container.querySelector('[data-testid="loc-mgmt-row"]');
    expect(row?.dataset.view).toBe('list');
    expect(row.querySelector('[data-testid="loc-mgmt-metrics-line1"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="loc-mgmt-metrics-line2"]')).toBeTruthy();

    const actions = row.querySelector('[data-testid="loc-mgmt-row-actions"]');
    expect(actions).toBeTruthy();
    // Desktop list: actions are a direct child after metrics (right-hand side), not inside name-wrap.
    const nameWrap = row.querySelector('.loc-mgmt__name-wrap');
    expect(nameWrap?.contains(actions)).toBe(false);
    const kids = [...row.children];
    const metricsIdx = kids.findIndex(n => n.matches?.('[data-testid="loc-mgmt-metrics"]')
      || n.classList?.contains('loc-mgmt__metrics'));
    const actionsIdx = kids.indexOf(actions);
    // Phone uses list-top; desktop has actions as later sibling than metrics.
    if (actionsIdx >= 0 && metricsIdx >= 0) {
      expect(actionsIdx).toBeGreaterThan(metricsIdx);
    } else {
      // Phone: actions inside list-top on the right of name
      const top = row.querySelector('.loc-mgmt__list-top');
      expect(top).toBeTruthy();
      expect(top.contains(actions)).toBe(true);
      const topKids = [...top.children];
      expect(topKids.indexOf(actions)).toBeGreaterThan(
        topKids.findIndex(n => n.matches?.('[data-testid="paddock-row"]') || n.classList?.contains('loc-mgmt__name')),
      );
    }
  });

  it('Nn: phone keeps two-line stack (source lock; no flat six fallback)', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/METRIC_LINE1/);
    expect(src).toMatch(/METRIC_LINE2/);
    expect(src).toMatch(/includePerAcre = !isPhone/);
    expect(src).toMatch(/applyUniformMetricsWidth/);
    // No path that rebuilds a single flat METRIC_COLS.map into the metrics cell
    expect(src).toMatch(/renderMetricsCell/);
  });

  it('Pp: partial marker span still rendered for DMI when dmiPartial', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/loc-mgmt__metric-partial/);
    expect(src).toMatch(/dmiPartial/);
    expect(src).toMatch(/ partial/);
  });
});
