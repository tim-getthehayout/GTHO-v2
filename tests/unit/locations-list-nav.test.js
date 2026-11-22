/** @file Regression: List shows management rows+metrics; location name opens edit sheet. */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
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
  resetCalendarState, getCalendarState, readStateFromUrl, setView,
} from '../../src/features/events/calendar-state.js';
import { renderEventsScreen } from '../../src/features/events/index.js';
import { renderHeaderStrip } from '../../src/features/events/rotation-calendar/header-strip.js';
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LOC = '00000000-0000-4000-8000-0000000000c1';

beforeAll(() => setLocale('en', enLocale));

function seed() {
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
    id: LOC, operationId: OP, farmId: FARM, name: 'North Pasture',
    type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

describe('locations list toggle + name click', () => {
  beforeEach(seed);

  it('does not early-return list with only a header stub', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).not.toMatch(/if \(state\.view === 'list'\) \{\s*container\.appendChild\(headerStrip\);\s*return;/);
    expect(src).toMatch(/omitTimeline:\s*isList/);
  });

  it('Calendar→List toggle paints the same location rows + metrics (no timeline)', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    renderEventsScreen(root);
    expect(getCalendarState().view).toBe('calendar');
    expect(root.querySelector('[data-testid="loc-mgmt-row"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="timeline-scroll"]')).toBeTruthy();

    root.querySelector('[data-testid="view-toggle-list"]').click();

    expect(getCalendarState().view).toBe('list');
    const grid = root.querySelector('[data-testid="calendar-grid"]');
    expect(grid?.dataset.view).toBe('list');
    expect(root.querySelector('[data-testid="loc-mgmt-row"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="loc-mgmt-metrics"]')).toBeTruthy();
    expect(root.textContent).toContain('North Pasture');
    expect(root.querySelector('[data-testid="timeline-scroll"]')).toBeFalsy();
    expect(root.querySelector('[data-testid="events-log"]')).toBeFalsy();
  });

  it('list mode keeps F0 single vertical scroll owner on the body', () => {
    window.history.replaceState(null, '', '#/events?view=list');
    readStateFromUrl();
    expect(getCalendarState().view).toBe('list');

    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);
    const body = container.querySelector('[data-testid="loc-mgmt-body"]');
    expect(body?.getAttribute('data-scroll-owner')).toBe('vertical');
    expect(container.querySelectorAll('[data-testid="loc-mgmt-row"]').length).toBe(1);
    expect(container.querySelector('[data-testid="timeline-scroll"]')).toBeFalsy();
  });

  it('header strip prefers onViewChange over onUpdate for view toggles', () => {
    const onUpdate = vi.fn();
    const onViewChange = vi.fn();
    const strip = renderHeaderStrip({
      selectedGroups: [], period: null, onUpdate, onViewChange,
    });
    document.body.appendChild(strip);
    strip.querySelector('[data-testid="view-toggle-list"]').click();
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(getCalendarState().view).toBe('list');
  });

  it('Calendar name click opens edit sheet in place (does not navigate to #/locations)', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    // Cb: Calendar still wires name → openLocationSheet via opId/fId locals.
    expect(src).toMatch(/openLocationSheet\(loc,\s*opId,\s*fId\)/);
    expect(src).toMatch(/Locations · Surveys · Map/);

    const root = document.createElement('div');
    document.body.appendChild(root);
    renderEventsScreen(root);
    expect(getCalendarState().view).toBe('calendar');
    const name = root.querySelector('[data-testid="paddock-row"]');
    expect(name).toBeTruthy();
    name.click();

    const panel = document.getElementById('loc-edit-panel');
    expect(panel?.textContent).toContain('Edit location');
    const nameInput = panel?.querySelector('input[type="text"]');
    expect(nameInput?.value).toBe('North Pasture');
    expect(window.location.hash.split('?')[0]).not.toBe('#/locations');
  });

  it('List uses Edit button (name is not a click target) and shows list tools', () => {
    const src = readFileSync('src/features/events/rotation-calendar/calendar-grid.js', 'utf8');
    expect(src).toMatch(/loc-mgmt__name--static/);
    expect(src).toMatch(/loc-mgmt-list-toolbar/);

    window.history.replaceState(null, '', '#/events?view=list');
    readStateFromUrl();
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderCalendarGrid(container);

    expect(container.querySelector('[data-testid="loc-mgmt-list-toolbar"]')).toBeTruthy();
    const name = container.querySelector('[data-testid="paddock-row"]');
    expect(name?.className).toContain('loc-mgmt__name--static');
    name.click();
    expect(document.getElementById('loc-edit-panel')).toBeFalsy();

    container.querySelector('[data-testid="loc-mgmt-edit"]').click();
    const panel = document.getElementById('loc-edit-panel');
    expect(panel?.textContent).toContain('Edit location');
    expect(window.location.hash.split('?')[0]).not.toBe('#/locations');
  });
});
