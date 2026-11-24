/** @file OI-0284 — rows come to rest below the sticky calendar head (Case S: scroll-padding + proximity snap). */
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
import { renderCalendarGrid } from '../../src/features/events/rotation-calendar/calendar-grid.js';
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

  it('the grid publishes the rendered head height on the scroller as --loc-mgmt-head-h', () => {
    vi.stubGlobal('requestAnimationFrame', (cb) => { cb(0); return 0; });
    const c = document.createElement('div');
    document.body.appendChild(c);
    renderCalendarGrid(c);
    const body = c.querySelector('[data-testid="loc-mgmt-body"]');
    const head = body.querySelector('.loc-mgmt__head');
    expect(head).toBeTruthy();
    // jsdom has no layout, so offsetHeight is 0; the var is still a px length from the head.
    expect(body.style.getPropertyValue('--loc-mgmt-head-h')).toBe(`${head.offsetHeight}px`);
  });
});
