/**
 * @file #402 — farm season default once 049 is applied and released (mocked
 * ceiling 49): the Rotation calendar "Farm default…" editor and the Farm
 * Settings fields round-trip month-days through the normal store path;
 * date-field edits never write the farm default; Season default resets to it.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
vi.mock('../../src/data/schema-release.js', async original => ({ ...await original(), RELEASED_SCHEMA_VERSION: 49, HELD_SCHEMA_VERSIONS: [] }));
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as store from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSetting from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as UserPrefEntity from '../../src/entities/user-preference.js';
import { areFarmSeasonSettingsReleased } from '../../src/features/settings/farm-season-settings.js';
import { renderCalendarGrid, _resetFarmSeasonEditor } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState, setView, getCalendarState } from '../../src/features/events/calendar-state.js';
import { renderSettingsScreen } from '../../src/features/settings/index.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import { periodContaining } from '../../src/calcs/budget-period.js';

beforeAll(() => setLocale('en', en));

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const TODAY = getLocalTodayStr();
const YEAR = TODAY.slice(0, 4);

function seed(fsData = {}) {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSetting.create({ id: 'fs-1', farmId: FARM, operationId: OP, ...fsData }),
    FarmSetting.validate, FarmSetting.toSupabaseShape, 'farm_settings');
  add('userPreferences', UserPrefEntity.create({ operationId: OP, userId: '00000000-0000-4000-8000-0000000000ee' }),
    UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
  add('locations', LocationEntity.create({
    id: '00000000-0000-4000-8000-0000000000c1', operationId: OP, farmId: FARM, name: 'J2', type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function mount() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderCalendarGrid(c);
  return c;
}
const q = (c, id) => c.querySelector(`[data-testid="${id}"]`);
const setVal = (input, v) => {
  input.value = String(v);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};
const farmSettings = () => getAll('farmSettings')[0];
const window_ = c => [q(c, 'metric-window-start').value, q(c, 'metric-window-end').value];

beforeEach(() => {
  _reset();
  localStorage.clear();
  resetCalendarState();
  _resetFarmSeasonEditor();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('#402 released (ceiling 49)', () => {
  it('editors are released', () => {
    expect(areFarmSeasonSettingsReleased()).toBe(true);
  });

  it('unset columns still open on Jan 1 – Dec 31; the editor is prefilled from the saved farm default', () => {
    seed();
    const c = mount();
    expect(window_(c)).toEqual([`${YEAR}-01-01`, `${YEAR}-12-31`]);
    q(c, 'metric-window-farm-default').click();
    expect(q(c, 'farm-season-start-month').value).toBe('1');
    expect(q(c, 'farm-season-start-day').value).toBe('1');
    expect(q(c, 'farm-season-end-month').value).toBe('12');
    expect(q(c, 'farm-season-end-day').value).toBe('31');
    expect(q(c, 'farm-season-label').textContent).toBe(`This farm's season: Jan 1 – Dec 31 (${YEAR})`);
  });

  it('saving round-trips the month-days through the store (and the Supabase shape), then shows the note', () => {
    seed();
    const spy = vi.spyOn(store, 'update');
    const c = mount();
    q(c, 'metric-window-farm-default').click();
    setVal(q(c, 'farm-season-start-month'), 10);
    setVal(q(c, 'farm-season-start-day'), 1);
    setVal(q(c, 'farm-season-end-month'), 9);
    setVal(q(c, 'farm-season-end-day'), 30);
    expect(spy).not.toHaveBeenCalled(); // nothing written until Save
    const want = periodContaining(TODAY, { startMonth: 10, startDay: 1, endMonth: 9, endDay: 30 });
    expect(q(c, 'farm-season-label').textContent).toContain(want.start.slice(0, 4));
    expect(q(c, 'farm-season-label').textContent).toContain(want.end.slice(0, 4));
    q(c, 'farm-season-save').click();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe('farmSettings');
    expect(farmSettings()).toMatchObject({ seasonStartMonth: 10, seasonStartDay: 1, seasonEndMonth: 9, seasonEndDay: 30 });
    const sb = FarmSetting.toSupabaseShape(farmSettings());
    expect(sb).toMatchObject({ season_start_month: 10, season_start_day: 1, season_end_month: 9, season_end_day: 30 });
    expect(FarmSetting.fromSupabaseShape(sb)).toMatchObject({ seasonStartMonth: 10, seasonStartDay: 1, seasonEndMonth: 9, seasonEndDay: 30 });
    // editor closes, note shows, and a device without a custom range follows the new default
    expect(q(c, 'farm-season-editor')).toBeNull();
    expect(q(c, 'farm-season-saved').textContent).toBe('Farm season saved');
    expect(window_(c)).toEqual([want.start, want.end]);
    expect(localStorage.getItem('gtho_v2_locations_metric_window')).toBeNull();
  });

  it('date-field edits never write farm settings (device-only custom range)', () => {
    seed({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 11, seasonEndDay: 30 });
    const spy = vi.spyOn(store, 'update');
    const c = mount();
    setVal(q(c, 'metric-window-start'), `${YEAR}-02-01`);
    setVal(q(c, 'metric-window-end'), `${YEAR}-06-30`);
    expect(spy).not.toHaveBeenCalled();
    expect(farmSettings()).toMatchObject({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 11, seasonEndDay: 30 });
    expect(JSON.parse(localStorage.getItem('gtho_v2_locations_metric_window'))).toEqual({ start: `${YEAR}-02-01`, end: `${YEAR}-06-30` });
  });

  it('a device with a custom range keeps it after a farm save; Season default resets to the farm value', () => {
    seed({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 11, seasonEndDay: 30 });
    const c = mount();
    setVal(q(c, 'metric-window-start'), `${YEAR}-02-01`);
    expect(window_(c)[0]).toBe(`${YEAR}-02-01`);
    q(c, 'metric-window-farm-default').click();
    setVal(q(c, 'farm-season-start-month'), 4);
    q(c, 'farm-season-save').click();
    expect(farmSettings().seasonStartMonth).toBe(4);
    expect(window_(c)[0]).toBe(`${YEAR}-02-01`); // custom range kept
    q(c, 'metric-window-reset').click();
    const want = periodContaining(TODAY, { startMonth: 4, startDay: 1, endMonth: 11, endDay: 30 });
    expect(window_(c)).toEqual([want.start, want.end]);
    expect(getCalendarState().metricStart).toBeNull();
    expect(localStorage.getItem('gtho_v2_locations_metric_window')).toBeNull();
  });

  it('Cancel and invalid input write nothing (inline error)', () => {
    seed();
    const spy = vi.spyOn(store, 'update');
    const c = mount();
    q(c, 'metric-window-farm-default').click();
    setVal(q(c, 'farm-season-end-month'), 1);
    setVal(q(c, 'farm-season-end-day'), 1); // same day as start → invalid
    expect(q(c, 'farm-season-error').textContent).toMatch(/1 to 366 days/);
    q(c, 'farm-season-save').click();
    expect(spy).not.toHaveBeenCalled();
    setVal(q(c, 'farm-season-end-month'), 4);
    setVal(q(c, 'farm-season-end-day'), 31);
    expect(q(c, 'farm-season-error').textContent).toMatch(/not a real date/);
    q(c, 'farm-season-cancel').click();
    expect(q(c, 'farm-season-editor')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    expect(farmSettings().seasonEndMonth).toBeNull();
  });

  it('List view uses the same farm default and editor', () => {
    seed({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 2, seasonEndDay: 28 });
    setView('list');
    const c = mount();
    const want = periodContaining(TODAY, { startMonth: 3, startDay: 1, endMonth: 2, endDay: 28 });
    expect(window_(c)).toEqual([want.start, want.end]);
    expect(q(c, 'metric-window-farm-default')).toBeTruthy();
  });

  it('Farm Settings shows the same month-day fields and saves them on the card Save', () => {
    seed({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 11, seasonEndDay: 30 });
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderSettingsScreen(c);
    expect(q(c, 'settings-farm-seasonStartMonth').value).toBe('3');
    expect(q(c, 'settings-farm-seasonEndDay').value).toBe('30');
    setVal(q(c, 'settings-farm-seasonStartMonth'), 1);
    setVal(q(c, 'settings-farm-seasonEndMonth'), 12);
    setVal(q(c, 'settings-farm-seasonEndDay'), 31);
    expect(q(c, 'settings-farm-season-label').textContent).toBe(`This farm's season: Jan 1 – Dec 31 (${YEAR})`);
    q(c, 'settings-farm-save').click();
    expect(farmSettings()).toMatchObject({ seasonStartMonth: 1, seasonStartDay: 1, seasonEndMonth: 12, seasonEndDay: 31 });
  });

  it('Farm Settings rejects an invalid season and writes nothing', () => {
    seed({ seasonStartMonth: 3, seasonStartDay: 1, seasonEndMonth: 11, seasonEndDay: 30 });
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderSettingsScreen(c);
    const spy = vi.spyOn(store, 'update');
    setVal(q(c, 'settings-farm-seasonEndMonth'), 2);
    setVal(q(c, 'settings-farm-seasonEndDay'), 31);
    q(c, 'settings-farm-save').click();
    expect(spy).not.toHaveBeenCalled();
    expect(q(c, 'settings-farm-status').textContent).toMatch(/not a real date/);
  });
});
