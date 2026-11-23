/** @file OI-0269 — Events store subscriptions are guarded by isConnected and
 * released once the Events screen has left the app container. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

const track = vi.hoisted(() => ({ subs: [] }));
vi.mock('../../src/data/store.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    subscribe: (type, cb) => {
      const entry = { type, released: false };
      const off = actual.subscribe(type, cb);
      track.subs.push(entry);
      return () => { entry.released = true; off(); };
    },
  };
});

import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { renderEventsScreen, unmountEventsCalendar, LIST_RERENDER_KEYS } from '../../src/features/events/index.js';

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LOC = '00000000-0000-4000-8000-0000000000c1';
let evN = 0;
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0)); };
const addEvent = () => {
  evN += 1;
  add('events', EventEntity.create({
    id: `00000000-0000-4000-8000-0000000001${String(evN).padStart(2, '0')}`,
    operationId: OP, farmId: FARM, dateOut: null,
  }), EventEntity.validate, EventEntity.toSupabaseShape, 'events');
};
const live = () => track.subs.filter(s => !s.released);

beforeAll(() => setLocale('en', enLocale));
beforeEach(() => {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
  track.subs.length = 0;
  vi.stubGlobal('requestAnimationFrame', () => 0);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'North', type: 'land', landUse: 'pasture', areaHectares: 4,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});
afterEach(() => {
  unmountEventsCalendar();
  vi.unstubAllGlobals();
});

function mountEvents() {
  const app = document.createElement('div');
  app.dataset.testid = 'app';
  document.body.appendChild(app);
  renderEventsScreen(app);
  return app;
}
/** What the router does on a route change: clear the app container, render the next screen. */
function goToDashboard(app) {
  app.innerHTML = '';
  const dash = document.createElement('div');
  dash.dataset.testid = 'dashboard-screen';
  app.appendChild(dash);
  return dash;
}

describe('OI-0269 Events subscription leak', () => {
  it('subscribes to events + the List keys while mounted', async () => {
    mountEvents();
    await flush();
    expect(live().map(s => s.type).sort()).toEqual(['events', ...LIST_RERENDER_KEYS].sort());
  });

  it('on Events, an events-store change still re-renders Events', async () => {
    const app = mountEvents();
    await flush();
    const before = app.querySelector('[data-testid="events-screen"]');
    addEvent();
    await flush();
    const after = app.querySelector('[data-testid="events-screen"]');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    // previous render's subscriptions were swapped, not stacked
    expect(live().filter(s => s.type === 'events')).toHaveLength(1);
  });

  it('after leaving to Dashboard, an event change does not repaint Events and releases the subscriptions', async () => {
    const app = mountEvents();
    await flush();
    const dash = goToDashboard(app); // no hashchange — guard path in the store callback
    addEvent();
    await flush();
    expect(app.querySelector('[data-testid="events-screen"]')).toBeNull();
    expect(app.firstElementChild).toBe(dash);
    expect(live()).toHaveLength(0);
    // later changes on any List key or events stay quiet
    addEvent();
    add('locations', LocationEntity.create({
      operationId: OP, farmId: FARM, name: 'South', type: 'land', landUse: 'pasture', areaHectares: 2,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    await flush();
    expect(app.firstElementChild).toBe(dash);
  });

  it('a List-key change after leaving is a no-op and releases the subscriptions (List view)', async () => {
    window.history.replaceState(null, '', '#/events?view=list');
    const app = mountEvents();
    await flush();
    const dash = goToDashboard(app);
    add('locations', LocationEntity.create({
      operationId: OP, farmId: FARM, name: 'West', type: 'land', landUse: 'pasture', areaHectares: 2,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    await flush();
    expect(app.firstElementChild).toBe(dash);
    expect(live()).toHaveLength(0);
  });

  it('the hashchange leave listener also releases the subscriptions', async () => {
    const app = mountEvents();
    await flush();
    goToDashboard(app);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(live()).toHaveLength(0);
  });

  it('a stale callback from an old render never releases the newer render\'s subscriptions', async () => {
    const appA = mountEvents();
    await flush();
    goToDashboard(appA);
    const appB = mountEvents(); // Events mounted again elsewhere (new render owns `unsubs`)
    await flush();
    addEvent();
    await flush();
    expect(appB.querySelector('[data-testid="events-screen"]')).toBeTruthy();
    expect(live().filter(s => s.type === 'events')).toHaveLength(1);
    expect(appA.querySelector('[data-testid="events-screen"]')).toBeNull();
  });
});
