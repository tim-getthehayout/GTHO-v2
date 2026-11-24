/** @file OI-0266 — single scroll owner (both axes) + #152 notes (a) connector overlay, (b) re-measure, (c) guard case. */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import '../../src/calcs/core.js';
import '../../src/calcs/advanced.js';
import '../../src/calcs/feed-pools.js';
import '../../src/calcs/feed-forage.js';
import '../../src/calcs/window-helpers.js';
import { _reset, add } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as EventEntity from '../../src/entities/event.js';
import * as PwEntity from '../../src/entities/event-paddock-window.js';
import * as GwEntity from '../../src/entities/event-group-window.js';
import * as GroupEntity from '../../src/entities/group.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import * as scrollOwner from '../../src/features/events/rotation-calendar/scroll-owner.js';
import { hasSingleScrollOwner } from '../../src/features/events/rotation-calendar/scroll-owner.js';
import { pastWindowSpan, headCountAtWindowEnd } from '../../src/features/events/rotation-calendar/past-window.js';
import { renderCalendarGrid, centerTodayOnScroller } from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';
import { renderEventsScreen, unmountEventsCalendar } from '../../src/features/events/index.js';

beforeAll(() => setLocale('en', enLocale));

const ROOT = resolve(__dirname, '../..');
const read = p => readFileSync(resolve(ROOT, p), 'utf8');
const gridSrc = read('src/features/events/rotation-calendar/calendar-grid.js');
const ownerSrc = read('src/features/events/rotation-calendar/scroll-owner.js');
const css = read('src/styles/main.css');

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LID = n => `00000000-0000-4000-8000-0000000000c${n}`;
const PID = n => `00000000-0000-4000-8000-0000000000d${n}`;
const EID = '00000000-0000-4000-8000-0000000000e1';
const EID2 = '00000000-0000-4000-8000-0000000000e2';
const GID = '00000000-0000-4000-8000-0000000000f1';
const iso = (offset) => {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  for (const n of [1, 2, 3]) {
    add('locations', LocationEntity.create({
      id: LID(n), operationId: OP, farmId: FARM, name: `F-${n}`, type: 'land', landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
  add('groups', GroupEntity.create({ id: GID, operationId: OP, name: 'Cows' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('events', EventEntity.create({ id: EID, operationId: OP, farmId: FARM, dateOut: null }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  const pws = [
    { id: PID(1), locationId: LID(1), dateOpened: iso(-10), dateClosed: iso(-3) },
    { id: PID(2), locationId: LID(2), dateOpened: iso(-7), dateClosed: null },
  ];
  for (const p of pws) {
    add('eventPaddockWindows', PwEntity.create({ operationId: OP, eventId: EID, areaPct: 100, ...p }),
      PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
  }
  add('eventGroupWindows', GwEntity.create({
    operationId: OP, eventId: EID, groupId: GID, dateJoined: iso(-10), headCount: 12, avgWeightKg: 450,
  }), GwEntity.validate, GwEntity.toSupabaseShape, 'event_group_windows');
}

function mount() {
  const c = document.createElement('div');
  document.body.appendChild(c);
  renderCalendarGrid(c);
  return c;
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  resetCalendarState();
  window.history.replaceState(null, '', '#/events');
  document.body.innerHTML = '';
  seed();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('OI-0266 single scroller, both axes', () => {
  it('the body is the only scroller; the axis head lives inside it (first child)', () => {
    const c = mount();
    const bodies = c.querySelectorAll('[data-testid="loc-mgmt-body"]');
    expect(bodies).toHaveLength(1);
    const body = bodies[0];
    expect(body.getAttribute('data-scroll-owner')).toBe('both');
    expect(body.getAttribute('data-overflow-x')).toBe('auto');
    expect(body.getAttribute('data-overflow-y')).toBe('auto');
    expect(body.firstElementChild.classList.contains('loc-mgmt__head')).toBe(true);
    expect(body.querySelector('[data-testid="timeline-axis"]')).toBeTruthy();
    expect(hasSingleScrollOwner(c)).toBe(true);
    // the surface holds the body — no head outside the scroller. #443: the
    // display-only scroll rail sits under it and is not itself a scroller.
    const surface = c.querySelector('[data-testid="calendar-grid"]');
    const rail = c.querySelector('[data-testid="calendar-scroll-rail"]');
    expect([...surface.children]).toEqual([body, rail]);
    expect(rail.hasAttribute('data-overflow-x')).toBe(false);
    expect(rail.querySelector('[data-overflow-x], [data-overflow-y], .loc-mgmt__head')).toBeNull();
  });

  it('no per-row horizontal scrollers: strips are non-scrolling .loc-mgmt__timeline', () => {
    const c = mount();
    expect(c.querySelectorAll('.loc-mgmt__timeline-scroll')).toHaveLength(0);
    const rows = c.querySelectorAll('[data-testid="loc-mgmt-row"]');
    const strips = c.querySelectorAll('[data-testid="timeline-strip"]');
    expect(strips.length).toBe(rows.length);
    for (const s of strips) {
      expect(s.classList.contains(scrollOwner.TIMELINE_CLASS)).toBe(true);
      expect(s.getAttribute('data-overflow-x')).toBeNull();
    }
    // CSS: the body owns both axes; strips and axis are overflow: visible.
    expect(css).toMatch(/\.loc-mgmt__body \{[^}]*overflow: auto;/);
    expect(css).not.toMatch(/\.loc-mgmt__body \{[^}]*overflow-x: hidden/);
    expect(css).toMatch(/\.loc-mgmt__timeline \{[^}]*overflow: visible;/);
    expect(css).not.toMatch(/\.loc-mgmt__timeline-scroll/);
  });

  it('header is sticky top; name and metrics are sticky left', () => {
    expect(css).toMatch(/\.loc-mgmt__head \{[^}]*position: sticky;[^}]*top: 0;/);
    expect(css).toMatch(/\.loc-mgmt__name-wrap \{[^}]*position: sticky;[^}]*left: 0;/);
    expect(css).toMatch(/\.loc-mgmt__row--desktop > \.loc-mgmt__metrics \{[^}]*position: sticky;[^}]*left: 160px;/);
    // phone: name + metrics lines pinned to the left edge above each strip
    expect(css).toMatch(/\.loc-mgmt__row--phone > \.loc-mgmt__metrics \{[^}]*position: sticky;/);
  });

  it('bindHorizontalScrollSync is gone and nothing writes scrollLeft from a scroll listener', () => {
    expect(scrollOwner.bindHorizontalScrollSync).toBeUndefined();
    expect(ownerSrc).not.toMatch(/bindHorizontalScrollSync\s*\(/);
    expect(gridSrc).not.toMatch(/bindHorizontalScrollSync/);
    expect(gridSrc).not.toMatch(/addEventListener\(\s*['"]scroll['"]/);
    expect(gridSrc).not.toMatch(/translateX/);
  });

  it('only the #443 rail listens for scroll: one passive, read-only listener on the body', () => {
    const spy = vi.spyOn(EventTarget.prototype, 'addEventListener');
    const c = mount();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const scrollCalls = spy.mock.contexts
      .map((ctx, i) => [ctx, spy.mock.calls[i]])
      .filter(([, [type]]) => type === 'scroll');
    expect(scrollCalls).toHaveLength(1);
    const [target, [, handler, opts]] = scrollCalls[0];
    expect(target).toBe(body);
    expect(opts).toMatchObject({ passive: true });
    // the listener never writes scrollLeft (no OI-0266 write-back)
    let writes = 0;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
    vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (v) {
      writes += 1;
      desc.set.call(this, v);
    });
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
    handler(new Event('scroll'));
    body.dispatchEvent(new Event('scroll'));
    expect(writes).toBe(0);
  });
});

describe('OI-0266 today-centring, arrow keys, jump to today on the single scroller', () => {
  it('centerTodayOnScroller centres today in the visible timeline area', () => {
    const body = document.createElement('div');
    let left = 0;
    Object.defineProperty(body, 'scrollLeft', { get: () => left, set: (v) => { left = v; }, configurable: true });
    Object.defineProperty(body, 'clientWidth', { value: 800, configurable: true });
    expect(centerTodayOnScroller(body, 1000)).toBe(600);
    expect(left).toBe(600);
    expect(centerTodayOnScroller(body, 100)).toBe(0); // never negative
  });

  it('on render, today-centring writes the body scrollLeft (once, from rAF)', () => {
    const queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; });
    let writes = 0;
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
    vi.spyOn(Element.prototype, 'scrollLeft', 'set').mockImplementation(function (v) {
      if (this.classList?.contains('loc-mgmt__body')) writes += 1;
      desc.set.call(this, v);
    });
    mount();
    queue.splice(0).forEach(cb => cb());
    expect(writes).toBe(1);
  });

  it('ArrowLeft/ArrowRight move the single body; Shift moves a week', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const c = mount();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    let left = 500;
    Object.defineProperty(body, 'scrollLeft', { get: () => left, set: (v) => { left = v; }, configurable: true });
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const step = left - 500;
    expect(step).toBeGreaterThan(0);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(left).toBe(500);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    expect(left).toBeCloseTo(500 + step * 7);
  });

  it('re-render replaces (does not stack) the key handler; "t" jumps to today and re-renders once', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    const c = document.createElement('div');
    document.body.appendChild(c);
    const add = vi.spyOn(c, 'addEventListener');
    const remove = vi.spyOn(c, 'removeEventListener');
    renderCalendarGrid(c);
    renderCalendarGrid(c);
    const keyAdds = add.mock.calls.filter(([t]) => t === 'keydown').length;
    const keyRemoves = remove.mock.calls.filter(([t]) => t === 'keydown').length;
    expect(keyAdds - keyRemoves).toBe(1);
    const before = c.querySelector('[data-testid="loc-mgmt-body"]');
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
    const after = c.querySelector('[data-testid="loc-mgmt-body"]');
    expect(after).toBeTruthy();
    expect(after).not.toBe(before);
    expect(c.querySelectorAll('[data-testid="loc-mgmt-body"]')).toHaveLength(1);
  });
});

describe('OI-0266 past-block hover', () => {
  it('no hover fade or opacity transition; focus-visible outline instead', () => {
    expect(css).not.toMatch(/\.past-block:hover/);
    const block = css.match(/\n\.past-block \{[^}]*\}/)[0];
    expect(block).not.toMatch(/transition/);
    expect(css).toMatch(/\.past-block:focus-visible \{[^}]*outline:/);
  });
});

describe('OI-0266 (a)+(b) Cn1 connector overlay inside the single scroller', () => {
  it('overlay is a child of the scrolling body; no follow/translate', () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
    const c = mount();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const overlay = c.querySelector('[data-testid="submove-connectors"]');
    expect(overlay).toBeTruthy();
    expect(overlay.parentElement).toBe(body);
    expect(overlay.querySelector('.loc-mgmt__connectors-inner').style.transform).toBe('');
    expect(overlay.querySelectorAll('[data-testid="submove-connector"]')).toHaveLength(1);
  });

  it('re-measures via ResizeObserver when present, and disconnects on re-render', () => {
    const queue = [];
    vi.stubGlobal('requestAnimationFrame', (cb) => { queue.push(cb); return queue.length; });
    const instances = [];
    class FakeRO {
      constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; instances.push(this); }
      observe(t) { this.targets.push(t); }
      disconnect() { this.disconnected = true; }
    }
    vi.stubGlobal('ResizeObserver', FakeRO);
    const c = mount();
    queue.splice(0).forEach(cb => cb());
    expect(instances).toHaveLength(1);
    const ro = instances[0];
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    expect(ro.targets).toContain(body);
    expect(ro.targets.some(t => t.dataset?.testid === 'loc-mgmt-metrics')).toBe(true);
    // a resize schedules a single re-layout (coalesced)
    const conn = c.querySelector('[data-testid="submove-connector"]');
    conn.style.top = 'stale';
    ro.cb([]); ro.cb([]);
    expect(queue).toHaveLength(1);
    queue.splice(0).forEach(cb => cb());
    expect(conn.style.top).not.toBe('stale');
    renderCalendarGrid(c);
    expect(ro.disconnected).toBe(true);
  });

  it('without ResizeObserver (jsdom) render does not throw', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => mount()).not.toThrow();
  });
});

describe('OI-0266 (c) guard: window still open on a closed event', () => {
  const GWS = [
    { id: 'g1', groupId: 'gA', dateJoined: '2026-10-01', dateLeft: '2026-10-05', headCount: 20 },
    { id: 'g2', groupId: 'gB', dateJoined: '2026-10-07', dateLeft: null, headCount: 9 },
  ];
  const GROUPS = [{ id: 'gA', name: 'Cows' }, { id: 'gB', name: 'Bulls' }];
  const open = { id: 'o', dateOpened: '2026-10-01', dateClosed: null };

  it('NOW ring only when the window has no close date AND the event has no end date', () => {
    expect(pastWindowSpan(open, { id: 'e', dateOut: null }, { today: '2026-11-22' }).isActive).toBe(true);
    const guard = pastWindowSpan(open, { id: 'e', dateOut: '2026-10-05' }, { today: '2026-11-22' });
    expect(guard).toMatchObject({ end: '2026-10-05', days: 5, isActive: false });
    expect(pastWindowSpan({ ...open, dateClosed: '2026-10-04' }, { id: 'e', dateOut: null }, { today: '2026-11-22' }).isActive)
      .toBe(false);
  });

  it('head count is taken at the event close, matching the bar', () => {
    const r = headCountAtWindowEnd(open, {
      eventGroupWindows: GWS, groups: GROUPS, memberships: [], animals: [], today: '2026-11-22',
      event: { id: 'e', dateOut: '2026-10-05' },
    });
    expect(r.endDate).toBe('2026-10-05');
    expect(r.headCount).toBe(20);
    expect(r.groups.map(g => g.name)).toEqual(['Cows']);
  });

  it('an open event keeps counting at today; a closed window keeps its own close date', () => {
    const live = headCountAtWindowEnd(open, {
      eventGroupWindows: GWS, groups: GROUPS, memberships: [], animals: [], today: '2026-11-22',
      event: { id: 'e', dateOut: null },
    });
    expect(live.endDate).toBe('2026-11-22');
    // open group window counts live members (none seeded) — only the presence pick matters here
    expect(live.groups.map(g => g.name)).toEqual(['Bulls']);
    const late = headCountAtWindowEnd({ ...open, dateClosed: '2026-10-08' }, {
      eventGroupWindows: GWS, groups: GROUPS, memberships: [], animals: [], today: '2026-11-22',
      event: { id: 'e', dateOut: '2026-10-05' },
    });
    expect(late.endDate).toBe('2026-10-08');
  });

  it('grid: the guard-case bar has no NOW ring and stops at the event close', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    add('events', EventEntity.create({ id: EID2, operationId: OP, farmId: FARM, dateOut: iso(-20) }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PwEntity.create({
      id: PID(9), operationId: OP, eventId: EID2, locationId: LID(3), areaPct: 100,
      dateOpened: iso(-25), dateClosed: null,
    }), PwEntity.validate, PwEntity.toSupabaseShape, 'event_paddock_windows');
    const c = mount();
    const blocks = [...c.querySelectorAll('[data-testid="past-block"]')];
    const guard = blocks.find(b => b.dataset.paddockWindowId === PID(9));
    expect(guard).toBeTruthy();
    expect(guard.classList.contains('past-block--active')).toBe(false);
    expect(guard.textContent).toMatch(/6\s*d/);
    // the normal open window on the open event still carries the ring
    const live = blocks.find(b => b.dataset.paddockWindowId === PID(2));
    expect(live.classList.contains('past-block--active')).toBe(true);
  });
});

describe('OI-0266 Events screen unmount releases the calendar observers', () => {
  function stubRO() {
    const instances = [];
    class FakeRO {
      constructor(cb) { this.cb = cb; this.disconnected = false; instances.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    }
    vi.stubGlobal('ResizeObserver', FakeRO);
    vi.stubGlobal('requestAnimationFrame', () => 0);
    return instances;
  }
  afterEach(() => unmountEventsCalendar());

  it('leaving the screen (hashchange after the router clears it) disconnects the RO and drops the key handler', () => {
    const instances = stubRO();
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderEventsScreen(app);
    expect(instances).toHaveLength(1);
    const cal = app.querySelector('[data-testid="calendar-container"]');
    const removeSpy = vi.spyOn(cal, 'removeEventListener');
    // still on the screen: a hashchange (e.g. a query change) releases nothing
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(instances[0].disconnected).toBe(false);
    // router clears the app container for another route, then the event reaches us
    app.innerHTML = '';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(instances[0].disconnected).toBe(true);
    expect(removeSpy.mock.calls.some(([t]) => t === 'keydown')).toBe(true);
    expect(cal._locMgmtKeyDown).toBeNull();
  });

  it('re-rendering the Events screen releases the previous calendar first', () => {
    const instances = stubRO();
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderEventsScreen(app);
    renderEventsScreen(app);
    expect(instances).toHaveLength(2);
    expect(instances[0].disconnected).toBe(true);
    expect(instances[1].disconnected).toBe(false);
  });
});
