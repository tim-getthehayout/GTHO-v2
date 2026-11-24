/** @file #443 — always-visible horizontal scroll rail on the Rotation calendar (display-only). */
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
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import {
  renderCalendarGrid, teardownScrollSurface, SCROLL_BODY_ID,
} from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { createScrollRail, railGeometry, bottomNavOffset, RAIL_MIN_THUMB_PX } from '../../src/features/events/rotation-calendar/scroll-rail.js';
import { resetCalendarState, setView } from '../../src/features/events/calendar-state.js';
import { hasSingleScrollOwner } from '../../src/features/events/rotation-calendar/scroll-owner.js';

beforeAll(() => setLocale('en', enLocale));

const css = readFileSync(resolve(__dirname, '../../src/styles/main.css'), 'utf8');
const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  return m ? m[1] : null;
};

const OP = '00000000-0000-4000-8000-0000000000aa';
const FARM = '00000000-0000-4000-8000-0000000000bb';
const LID = n => `00000000-0000-4000-8000-0000000000c${n}`;

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  for (const n of [1, 2]) {
    add('locations', LocationEntity.create({
      id: LID(n), operationId: OP, farmId: FARM, name: `F-${n}`, type: 'land', landUse: 'pasture', areaHectares: 4,
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  }
}

/** A fake scroller with controllable geometry (jsdom has no layout). */
function fakeBody({ scrollWidth = 3000, clientWidth = 1000, left = 0 } = {}) {
  const body = document.createElement('div');
  body.id = 'scroller';
  const geo = { scrollWidth, clientWidth, left };
  Object.defineProperty(body, 'scrollLeft', {
    configurable: true,
    get: () => geo.left,
    set: (v) => { geo.left = Math.max(0, Math.min(v, geo.scrollWidth - geo.clientWidth)); },
  });
  Object.defineProperty(body, 'scrollWidth', { configurable: true, get: () => geo.scrollWidth });
  Object.defineProperty(body, 'clientWidth', { configurable: true, get: () => geo.clientWidth });
  document.body.appendChild(body);
  return { body, geo };
}

/** Rail with a sized track (origin = pinned columns width). */
function railFor(body, { origin = 200, trackWidth = 720, stepPx = 10, isPhone = false } = {}) {
  const rail = createScrollRail(body, { controlsId: body.id, getOrigin: () => origin, stepPx, isPhone });
  document.body.appendChild(rail.el);
  const track = rail.el.querySelector('[role="scrollbar"]');
  Object.defineProperty(track, 'clientWidth', { configurable: true, get: () => trackWidth });
  track.getBoundingClientRect = () => ({ left: 100, top: 0, right: 100 + trackWidth, bottom: 14, width: trackWidth, height: 14 });
  rail.sync();
  return { rail, track, thumb: rail.el.querySelector('.loc-mgmt__rail-thumb') };
}

const ptr = (type, init) => {
  const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent;
  return new Ctor(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, ...init });
};

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

describe('#443 rail geometry', () => {
  it('thumb = visible ÷ timeline width; position follows scrollLeft; pct for aria', () => {
    // visible timeline = 1000 − 200 = 800; max = 2000; timeline = 2800
    const g = railGeometry({ scrollLeft: 1000, scrollWidth: 3000, clientWidth: 1000, origin: 200, trackWidth: 700 });
    expect(g.overflow).toBe(true);
    expect(g.visible).toBe(800);
    expect(g.max).toBe(2000);
    expect(g.ratio).toBeCloseTo(800 / 2800);
    expect(g.thumbWidth).toBeCloseTo(200);
    expect(g.thumbLeft).toBeCloseTo(250); // (700 − 200) × 0.5
    expect(g.pct).toBe(50);
  });

  it('no overflow → hidden geometry; a very long timeline keeps a grabbable thumb', () => {
    expect(railGeometry({ scrollLeft: 0, scrollWidth: 1000, clientWidth: 1000, origin: 200, trackWidth: 700 }).overflow).toBe(false);
    const long = railGeometry({ scrollLeft: 0, scrollWidth: 500000, clientWidth: 1000, origin: 200, trackWidth: 700 });
    expect(long.thumbWidth).toBe(RAIL_MIN_THUMB_PX);
  });
});

describe('#443 rail behaviour (display-only, drives body.scrollLeft)', () => {
  it('the thumb tracks scrollLeft (native scroll → repaint, read-only)', () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
    const { body, geo } = fakeBody();
    const { track, thumb } = railFor(body);
    expect(thumb.style.left).toBe('0px');
    expect(track.getAttribute('aria-valuenow')).toBe('0');
    // trackpad / Shift+wheel / swipe change scrollLeft natively, then fire scroll
    geo.left = 2000;
    body.dispatchEvent(new Event('scroll'));
    const g = railGeometry({ scrollLeft: 2000, scrollWidth: 3000, clientWidth: 1000, origin: 200, trackWidth: 720 });
    expect(thumb.style.left).toBe(`${Math.round(g.thumbLeft)}px`);
    expect(thumb.style.width).toBe(`${Math.round(g.thumbWidth)}px`);
    expect(track.getAttribute('aria-valuenow')).toBe('100');
    expect(geo.left).toBe(2000); // the listener never wrote it back
  });

  it('dragging the thumb sets scrollLeft (pointer capture)', () => {
    const { body, geo } = fakeBody();
    const { thumb } = railFor(body);
    const capture = vi.fn();
    thumb.setPointerCapture = capture;
    thumb.releasePointerCapture = vi.fn();
    const g = railGeometry({ scrollLeft: 0, scrollWidth: 3000, clientWidth: 1000, origin: 200, trackWidth: 720 });
    const free = 720 - g.thumbWidth;
    thumb.dispatchEvent(ptr('pointerdown', { clientX: 110 }));
    expect(capture).toHaveBeenCalledWith(1);
    thumb.dispatchEvent(ptr('pointermove', { clientX: 110 + free / 2 }));
    expect(geo.left).toBeCloseTo(1000, 0);
    thumb.dispatchEvent(ptr('pointermove', { clientX: 110 + free * 5 }));
    expect(geo.left).toBe(2000); // clamped to the end
    thumb.dispatchEvent(ptr('pointerup', { clientX: 110 }));
    thumb.dispatchEvent(ptr('pointermove', { clientX: 110 }));
    expect(geo.left).toBe(2000); // released: moves no longer drag
  });

  it('‹ › buttons and track clicks step one visible width', () => {
    const { body, geo } = fakeBody({ left: 1000 });
    const { rail } = railFor(body);
    const prev = rail.el.querySelector('[data-testid="calendar-scroll-rail-prev"]');
    const next = rail.el.querySelector('[data-testid="calendar-scroll-rail-next"]');
    next.click();
    expect(geo.left).toBe(1800); // + (1000 − 200)
    prev.click();
    prev.click();
    expect(geo.left).toBe(200);
    // click the track left of the thumb → page back; right of it → page forward
    const track = rail.el.querySelector('[role="scrollbar"]');
    track.dispatchEvent(ptr('pointerdown', { clientX: 100 + 715 }));
    expect(geo.left).toBe(1000);
    track.dispatchEvent(ptr('pointerdown', { clientX: 101 }));
    expect(geo.left).toBe(200);
  });

  it('the rail hides when nothing overflows and re-appears when it does', () => {
    const { body, geo } = fakeBody({ scrollWidth: 1000, clientWidth: 1000 });
    const { rail } = railFor(body);
    expect(rail.el.hidden).toBe(true);
    geo.scrollWidth = 4000;
    rail.sync();
    expect(rail.el.hidden).toBe(false);
  });

  it('spans only the timeline: starts after the pinned columns', () => {
    const { body } = fakeBody();
    const { rail } = railFor(body, { origin: 312 });
    expect(rail.el.style.marginLeft).toBe('312px');
  });

  it('accessibility: role=scrollbar, aria-controls, valuemin/max/now %, arrow keys when focused', () => {
    const { body, geo } = fakeBody({ left: 500 });
    const { track } = railFor(body, { stepPx: 10 });
    expect(track.getAttribute('role')).toBe('scrollbar');
    expect(track.getAttribute('aria-controls')).toBe('scroller');
    expect(track.getAttribute('aria-orientation')).toBe('horizontal');
    expect(track.getAttribute('aria-valuemin')).toBe('0');
    expect(track.getAttribute('aria-valuemax')).toBe('100');
    expect(track.getAttribute('aria-valuenow')).toBe('25');
    expect(track.getAttribute('tabindex')).toBe('0');
    const key = (k, init = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
      track.dispatchEvent(e);
      return e;
    };
    const outer = vi.fn();
    document.body.addEventListener('keydown', outer);
    key('ArrowRight');
    expect(geo.left).toBe(510);
    key('ArrowLeft', { shiftKey: true });
    expect(geo.left).toBe(440);
    key('PageDown');
    expect(geo.left).toBe(1240);
    key('Home');
    expect(geo.left).toBe(0);
    key('End');
    expect(geo.left).toBe(2000);
    expect(track.getAttribute('aria-valuenow')).toBe('100');
    expect(outer).not.toHaveBeenCalled(); // surface arrow keys don't step twice
  });

  it('destroy removes the scroll listener', () => {
    const { body } = fakeBody();
    const remove = vi.spyOn(body, 'removeEventListener');
    const { rail } = railFor(body);
    rail.destroy();
    expect(remove.mock.calls.some(([type]) => type === 'scroll')).toBe(true);
  });
});

describe('#443 rail on the calendar surface', () => {
  function mount() {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  }

  it('Calendar: rail pinned under (outside) the single scroller, aria-controls points at it', () => {
    const c = mount();
    const surface = c.querySelector('[data-testid="calendar-grid"]');
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const rail = c.querySelector('[data-testid="calendar-scroll-rail"]');
    expect(rail).toBeTruthy();
    expect(rail.parentElement).toBe(surface);
    expect(body.contains(rail)).toBe(false);
    expect(surface.lastElementChild).toBe(rail);
    expect(body.id).toBe(SCROLL_BODY_ID);
    expect(rail.querySelector('[role="scrollbar"]').getAttribute('aria-controls')).toBe(SCROLL_BODY_ID);
    expect(hasSingleScrollOwner(c)).toBe(true);
  });

  it('List view has no rail (no timeline)', () => {
    setView('list');
    const c = mount();
    expect(c.querySelector('[data-testid="calendar-scroll-rail"]')).toBeNull();
  });

  it('re-measures on resize through the OI-0284 observer — still one observer per render', () => {
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
    expect(ro.targets[0].classList.contains('loc-mgmt__head')).toBe(true);
    expect(ro.targets).toContain(body);
    const rail = c.querySelector('[data-testid="calendar-scroll-rail"]');
    // no overflow in jsdom → hidden; give the scroller overflow and resize
    Object.defineProperty(body, 'scrollWidth', { configurable: true, get: () => 5000 });
    Object.defineProperty(body, 'clientWidth', { configurable: true, get: () => 900 });
    expect(rail.hidden).toBe(true);
    ro.cb([]); ro.cb([]);
    expect(queue).toHaveLength(1); // coalesced with the connector re-layout
    queue.splice(0).forEach(cb => cb());
    expect(rail.hidden).toBe(false);
    renderCalendarGrid(c);
    expect(ro.disconnected).toBe(true);
    expect(instances).toHaveLength(2);
  });

  it('teardown drops the rail listener with the observer and key handler', () => {
    const c = mount();
    const rail = c._locMgmtRail;
    const destroy = vi.spyOn(rail, 'destroy');
    teardownScrollSurface(c);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(c._locMgmtRail).toBeNull();
  });

  it('size + theme: ≥12px desktop track, ≥24px phone touch height, theme tokens only', () => {
    expect(rule('.loc-mgmt__rail-track')).toMatch(/height:\s*14px/);
    expect(rule('.loc-mgmt__rail--phone .loc-mgmt__rail-track')).toMatch(/height:\s*24px/);
    expect(rule('.loc-mgmt__rail[hidden]')).toMatch(/display:\s*none/);
    for (const sel of ['.loc-mgmt__rail', '.loc-mgmt__rail-track', '.loc-mgmt__rail-thumb', '.loc-mgmt__rail-btn']) {
      const r = rule(sel);
      expect(r).toBeTruthy();
      expect(r).not.toMatch(/#[0-9a-f]{3,6}\b|rgba?\(/i);
    }
    // the rail is not a scroller and the body's overflow is untouched
    expect(rule('.loc-mgmt__rail')).not.toMatch(/overflow/);
    expect(rule('.loc-mgmt__body')).toMatch(/overflow:\s*auto;/);
  });
});

describe('#443 Design Q1: rail pinned to the viewport bottom (sticky)', () => {
  const lastOverflow = (body) => [...(body || '').matchAll(/overflow:\s*([a-z]+)/g)].map(m => m[1]).pop();

  it('the rail is position: sticky at the bottom (offset var, 0 by default)', () => {
    const r = rule('.loc-mgmt__rail');
    expect(r).toMatch(/position:\s*sticky;/);
    expect(r).toMatch(/bottom:\s*var\(--loc-mgmt-rail-bottom,\s*0px\);/);
    // paints over the row cells it overlays while pinned (pinned columns are z 5, head z 10)
    expect(Number(r.match(/z-index:\s*(\d+)/)[1])).toBeGreaterThan(10);
  });

  it('no ancestor scroll container captures the sticky: .loc-mgmt clips, calendar app-content is visible on desktop', () => {
    // the calendar keeps its height; overflow clip is not a scroll container
    const surface = rule('.loc-mgmt');
    expect(surface).toMatch(/height:\s*calc\(100vh - 320px\);/);
    expect(lastOverflow(surface)).toBe('clip');
    expect(css).toMatch(/@media \(min-width: 900px\)\s*\{\s*\.app-content:has\(\.loc-mgmt__rail\)\s*\{\s*overflow:\s*visible;\s*\}/);
  });

  it('phone: the offset is the fixed tab bar height; 0 when absent, hidden, or not fixed', () => {
    expect(bottomNavOffset(document)).toBe(0);
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.style.position = 'fixed';
    Object.defineProperty(nav, 'offsetHeight', { configurable: true, get: () => 43 });
    document.body.appendChild(nav);
    expect(bottomNavOffset(document)).toBe(43);
    nav.style.display = 'none'; // desktop / field mode
    expect(bottomNavOffset(document)).toBe(0);
    nav.style.display = '';
    nav.style.position = 'static';
    expect(bottomNavOffset(document)).toBe(0);
  });

  it('sync() writes the tab bar height to the rail so it sits just above it', () => {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';
    nav.style.position = 'fixed';
    let h = 43;
    Object.defineProperty(nav, 'offsetHeight', { configurable: true, get: () => h });
    document.body.appendChild(nav);
    const { body } = fakeBody();
    const { rail } = railFor(body, { isPhone: true });
    expect(rail.el.style.getPropertyValue('--loc-mgmt-rail-bottom')).toBe('43px');
    h = 0;
    rail.sync();
    expect(rail.el.style.getPropertyValue('--loc-mgmt-rail-bottom')).toBe('0px');
    expect(body.scrollLeft).toBe(0); // still display-only
    rail.destroy();
  });
});
