/** @file OI-0284 — rows come to rest below the sticky calendar head (Case S: scroll-padding + proximity snap),
 * the head height var is kept current by a ResizeObserver, and the pinned head cells paint above the date axis. */
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
  renderCalendarGrid, teardownScrollSurface, observeHeadHeight, HEAD_HEIGHT_VAR,
} from '../../src/features/events/rotation-calendar/calendar-grid.js';
import { resetCalendarState } from '../../src/features/events/calendar-state.js';

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

describe('OI-0284 sticky head never rests over a row', () => {
  it('the single scroller pads its snapport by the head height var and snaps by proximity', () => {
    const body = rule('.loc-mgmt__body');
    expect(body).toBeTruthy();
    expect(body).toMatch(/scroll-padding-top:\s*var\(--loc-mgmt-head-h,\s*0px\)/);
    expect(body).toMatch(/scroll-snap-type:\s*y proximity/);
    expect(body).not.toMatch(/scroll-snap-type:[^;]*mandatory/);
    // OI-0266 ownership unchanged
    expect(body).toMatch(/overflow:\s*auto/);
  });

  it('each row wrapper snaps its top edge (start)', () => {
    expect(rule('.loc-mgmt__body > .loc-mgmt__row')).toMatch(/scroll-snap-align:\s*start/);
  });

  it('head and row sticky-left z-index are unchanged (head 10 over rows 5)', () => {
    expect(rule('.loc-mgmt__head')).toMatch(/position:\s*sticky;[\s\S]*top:\s*0;[\s\S]*z-index:\s*10/);
    const phonePinned = rule('.loc-mgmt--phone:not(.loc-mgmt--list) .loc-mgmt__row--phone > .loc-mgmt__name,\n.loc-mgmt--phone:not(.loc-mgmt--list) .loc-mgmt__row--phone > .loc-mgmt__metrics');
    expect(phonePinned).toMatch(/z-index:\s*5/);
  });

  it('pinned head corner cells sit above the sticky date axis (3 > 2) and stay opaque, inside the head (10)', () => {
    const z = (sel) => Number((rule(sel) || '').match(/z-index:\s*(\d+)/)?.[1]);
    const nameHead = '.loc-mgmt--desktop .loc-mgmt__head--desktop > .loc-mgmt__name-head';
    const metricsHead = '.loc-mgmt--desktop .loc-mgmt__head--desktop > .loc-mgmt__metrics-head-wrap,\n.loc-mgmt--desktop .loc-mgmt__head--desktop > .loc-mgmt__metrics-head';
    const phoneHead = '.loc-mgmt--phone:not(.loc-mgmt--list) .loc-mgmt__head-metrics';
    const axis = z('.timeline-axis');
    expect(axis).toBe(2); // axis not moved / restacked
    for (const sel of [nameHead, metricsHead, phoneHead]) {
      expect(z(sel)).toBe(3);
      expect(z(sel)).toBeGreaterThan(axis);
      expect(z(sel)).toBeLessThan(10);
      expect(rule(sel)).toMatch(/position:\s*sticky/);
      expect(rule(sel)).toMatch(/background:\s*var\(--bg2\)/);
    }
  });

  it('the body and head keep their overflow / ownership (no overflow changes)', () => {
    expect(rule('.loc-mgmt__head')).not.toMatch(/overflow/);
    expect(rule('.loc-mgmt__body')).toMatch(/overflow:\s*auto;/);
    expect(rule('.loc-mgmt__body')).not.toMatch(/overflow-y|overflow-x:/);
  });
});

describe('OI-0284 head height var (ResizeObserver)', () => {
  class FakeRO {
    static instances = [];
    constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; FakeRO.instances.push(this); }
    observe(t) { this.targets.push(t); }
    disconnect() { this.disconnected = true; }
    fire() { this.cb([]); }
  }
  beforeEach(() => { FakeRO.instances = []; });

  function mount() {
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    return c;
  }

  it('observes the head and re-publishes --loc-mgmt-head-h when it resizes', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    const c = mount();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const head = body.querySelector('.loc-mgmt__head');
    const ro = c._locMgmtResizeObserver;
    expect(ro).toBeInstanceOf(FakeRO);
    expect(ro.targets[0]).toBe(head); // head first; OI-0266 connector targets follow
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('0px'); // jsdom: no layout yet
    Object.defineProperty(head, 'offsetHeight', { configurable: true, get: () => 86 });
    ro.fire();
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('86px');
    Object.defineProperty(head, 'offsetHeight', { configurable: true, get: () => 135 });
    ro.fire();
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('135px');
  });

  it('disconnects the head observer on re-render and on teardown (no leaks)', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    const c = mount();
    const first = c._locMgmtResizeObserver;
    renderCalendarGrid(c);
    expect(first.disconnected).toBe(true);
    const second = c._locMgmtResizeObserver;
    expect(second).not.toBe(first);
    expect(second.disconnected).toBe(false);
    teardownScrollSurface(c);
    expect(second.disconnected).toBe(true);
    expect(c._locMgmtResizeObserver).toBeNull();
  });

  it('falls back to 0px when the head is missing (and observes nothing)', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    const body = document.createElement('div');
    body.style.setProperty(HEAD_HEIGHT_VAR, '86px');
    expect(observeHeadHeight(body)).toBeNull();
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('0px');
    expect(FakeRO.instances).toHaveLength(0);
    expect(observeHeadHeight(null)).toBeNull();
  });

  it('one observer per render: head + OI-0266 targets share it, and onResize still runs', () => {
    vi.stubGlobal('ResizeObserver', FakeRO);
    const body = document.createElement('div');
    const head = document.createElement('div');
    head.className = 'loc-mgmt__head';
    body.appendChild(head);
    const onResize = vi.fn();
    const ro = observeHeadHeight(body, { targets: [body], onResize });
    expect(FakeRO.instances).toHaveLength(1);
    expect(ro.targets).toEqual([head, body]);
    Object.defineProperty(head, 'offsetHeight', { configurable: true, get: () => 40 });
    ro.fire();
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('40px');
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('without ResizeObserver (jsdom default) it still sets the var once from the head', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const c = mount();
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    expect(c._locMgmtResizeObserver).toBeNull();
    expect(body.style.getPropertyValue(HEAD_HEIGHT_VAR)).toBe('0px');
  });
});
