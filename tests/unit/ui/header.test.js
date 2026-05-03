/** @file OI-0153 — header [DEV] chip is updated in place via a stable
 * `updateDevChip(container)` callback registered against `operationMembers`,
 * not by re-invoking `renderHeader(container)`.
 *
 * The pre-OI-0153 callback (`clear(container); renderHeader(container);`)
 * wiped the entire app shell, including the `<main>` content area built
 * by `initRouter(content)` — leaving every route blank after the boot
 * pull's notify settled. This test fixes that contract: notify cycles
 * mutate only the chip; sibling DOM under `container` is preserved.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import {
  _reset,
  add,
  getAll,
  mergeRemote,
} from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as MemberEntity from '../../../src/entities/operation-member.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const TIM = '00000000-0000-0000-0000-0000000000c2';

vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: vi.fn(),
  logout: vi.fn(),
}));

import { getUser } from '../../../src/features/auth/session.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  window.location.hash = '';
  getUser.mockReset();
  getUser.mockReturnValue({ id: TIM, email: 'tim@example.com' });

  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
});

function flagDev(userId, isDev) {
  add('operationMembers', MemberEntity.create({
    operationId: OP, userId, displayName: 'X', email: 'x@y.com', role: 'owner', isDev,
  }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');
}

// Flip is_dev on Tim's existing operation_members row by merging a remote
// version of the same row with a newer updatedAt + the new isDev value.
// This triggers `notify('operationMembers')` exactly the way a Supabase
// pull would.
async function flipIsDev(nextIsDev) {
  const member = getAll('operationMembers').find(m => m.userId === TIM);
  expect(member).toBeTruthy();
  mergeRemote('operationMembers', [{
    ...member,
    isDev: nextIsDev,
    updatedAt: new Date(Date.now() + 60_000).toISOString(),
  }]);
  // OI-0151 microtask-coalesced drain runs on the next microtask.
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('OI-0153 — header dev-chip updates in place; <main> sibling preserved', () => {
  it('toggling is_dev mutates only the chip; renderHeader is not re-invoked', async () => {
    flagDev(TIM, false);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    app.id = 'app';
    document.body.appendChild(app);
    renderHeader(app);

    // Simulate main.js's boot order: content <main> is appended under `app`
    // AFTER renderHeader runs. This is the element OI-0153 protects.
    const mainEl = document.createElement('main');
    mainEl.setAttribute('data-testid', 'app-main');
    mainEl.className = 'app-content';
    mainEl.textContent = 'Dashboard content (built by initRouter)';
    app.appendChild(mainEl);

    // Capture identity of header-built children so we can assert renderHeader
    // did NOT rebuild them on the operationMembers notify.
    const originalSidebar = app.querySelector('[data-testid="dsk-sidebar"]');
    const originalHeader = app.querySelector('[data-testid="app-header"]');
    const originalBottomNav = app.querySelector('[data-testid="bottom-nav"]');
    const originalAnchor = app.querySelector('[data-testid="header-dev-chip-anchor"]');
    expect(originalSidebar).toBeTruthy();
    expect(originalHeader).toBeTruthy();
    expect(originalBottomNav).toBeTruthy();
    expect(originalAnchor).toBeTruthy();

    // Pre-flip: non-dev → no chip; <main> present.
    expect(app.querySelector('[data-testid="header-dev-mode-chip"]')).toBeFalsy();
    expect(app.querySelector('[data-testid="app-main"]')).toBe(mainEl);
    expect(mainEl.textContent).toBe('Dashboard content (built by initRouter)');

    // Flip is_dev: false → true. Chip should appear; nothing else changes.
    await flipIsDev(true);

    expect(app.querySelector('[data-testid="header-dev-mode-chip"]')).toBeTruthy();
    // Identity-stable assertions: header / sidebar / bottom-nav / anchor and
    // most importantly the <main> element are the same node references they
    // were before. If renderHeader had been re-invoked, container would have
    // been cleared and these would be different nodes (or, in the case of
    // <main>, gone entirely because renderHeader doesn't build <main>).
    expect(app.querySelector('[data-testid="dsk-sidebar"]')).toBe(originalSidebar);
    expect(app.querySelector('[data-testid="app-header"]')).toBe(originalHeader);
    expect(app.querySelector('[data-testid="bottom-nav"]')).toBe(originalBottomNav);
    expect(app.querySelector('[data-testid="header-dev-chip-anchor"]')).toBe(originalAnchor);
    expect(app.querySelector('[data-testid="app-main"]')).toBe(mainEl);
    expect(mainEl.textContent).toBe('Dashboard content (built by initRouter)');

    // Flip is_dev: true → false. Chip should disappear; everything else stays.
    await flipIsDev(false);

    expect(app.querySelector('[data-testid="header-dev-mode-chip"]')).toBeFalsy();
    expect(app.querySelector('[data-testid="dsk-sidebar"]')).toBe(originalSidebar);
    expect(app.querySelector('[data-testid="app-main"]')).toBe(mainEl);
    expect(mainEl.textContent).toBe('Dashboard content (built by initRouter)');
  });

  it('chip newly inserted (false → true) lands inside the header-right anchor', async () => {
    flagDev(TIM, false);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    expect(app.querySelector('[data-testid="header-dev-mode-chip"]')).toBeFalsy();

    await flipIsDev(true);

    const chip = app.querySelector('[data-testid="header-dev-mode-chip"]');
    expect(chip).toBeTruthy();
    const anchor = app.querySelector('[data-testid="header-dev-chip-anchor"]');
    expect(anchor.contains(chip)).toBe(true);
    // OI-0153 places the chip leftmost inside the anchor (matching the build
    // path order: chip → sync → build stamp → field mode → user menu).
    expect(anchor.firstElementChild).toBe(chip);
  });

  it('initial dev-true render carries the chip-anchor testid on the parent (OI-0153 contract)', async () => {
    flagDev(TIM, true);

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    // Anchor exists, chip is inside it.
    const anchor = app.querySelector('[data-testid="header-dev-chip-anchor"]');
    const chip = app.querySelector('[data-testid="header-dev-mode-chip"]');
    expect(anchor).toBeTruthy();
    expect(chip).toBeTruthy();
    expect(anchor.contains(chip)).toBe(true);
  });
});

describe('OI-0154 — sidebar + bottom-nav active-class follows hashchange', () => {
  it('initial mount at #/: Dashboard sidebar item has the active class', async () => {
    flagDev(TIM, false);
    window.location.hash = '#/';

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    const dashboardItem = app.querySelector('[data-testid="nav-dashboard"]');
    const animalsItem = app.querySelector('[data-testid="nav-animals"]');
    expect(dashboardItem).toBeTruthy();
    expect(animalsItem).toBeTruthy();
    expect(dashboardItem.classList.contains('active')).toBe(true);
    expect(animalsItem.classList.contains('active')).toBe(false);
  });

  it('hashchange to #/animals moves the active class from Dashboard to Animals; chrome is not rebuilt', async () => {
    flagDev(TIM, false);
    window.location.hash = '#/';

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    // Capture identity of structural elements so we can assert renderHeader
    // did NOT rebuild them on the hashchange.
    const originalSidebar = app.querySelector('[data-testid="dsk-sidebar"]');
    const originalHeader = app.querySelector('[data-testid="app-header"]');
    const originalBottomNav = app.querySelector('[data-testid="bottom-nav"]');
    const dashboardItem = app.querySelector('[data-testid="nav-dashboard"]');
    const animalsItem = app.querySelector('[data-testid="nav-animals"]');
    expect(dashboardItem.classList.contains('active')).toBe(true);

    // Simulate navigation. Assigning location.hash triggers hashchange in
    // jsdom for browsers that support it; dispatching the event explicitly
    // is the deterministic path for the test.
    window.location.hash = '#/animals';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(dashboardItem.classList.contains('active')).toBe(false);
    expect(animalsItem.classList.contains('active')).toBe(true);

    // Identity-stable assertions: the chrome stays put. If renderHeader had
    // been re-invoked the references below would no longer match.
    expect(app.querySelector('[data-testid="dsk-sidebar"]')).toBe(originalSidebar);
    expect(app.querySelector('[data-testid="app-header"]')).toBe(originalHeader);
    expect(app.querySelector('[data-testid="bottom-nav"]')).toBe(originalBottomNav);
    // The same dashboard / animals nodes are still in the DOM (mutated, not
    // replaced) — toggle, not rebuild.
    expect(app.querySelector('[data-testid="nav-dashboard"]')).toBe(dashboardItem);
    expect(app.querySelector('[data-testid="nav-animals"]')).toBe(animalsItem);
  });

  it('hashchange across three routes moves the active class correctly each time', async () => {
    flagDev(TIM, false);
    window.location.hash = '#/';

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    const navigateTo = (h) => {
      window.location.hash = h;
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    };
    const isActive = (testid) => {
      const el = app.querySelector(`[data-testid="${testid}"]`);
      return el ? el.classList.contains('active') : false;
    };

    expect(isActive('nav-dashboard')).toBe(true);

    navigateTo('#/animals');
    expect(isActive('nav-dashboard')).toBe(false);
    expect(isActive('nav-animals')).toBe(true);
    expect(isActive('nav-settings')).toBe(false);

    navigateTo('#/settings');
    expect(isActive('nav-dashboard')).toBe(false);
    expect(isActive('nav-animals')).toBe(false);
    expect(isActive('nav-settings')).toBe(true);

    navigateTo('#/');
    expect(isActive('nav-dashboard')).toBe(true);
    expect(isActive('nav-settings')).toBe(false);
  });

  it('bottom-nav items toggle their active class on hashchange (DOM contract; CSS hookup deferred)', async () => {
    flagDev(TIM, false);
    window.location.hash = '#/';

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    const home = app.querySelector('[data-testid="bnav-home"]');
    const animals = app.querySelector('[data-testid="bnav-animals"]');
    expect(home).toBeTruthy();
    expect(animals).toBeTruthy();
    expect(home.classList.contains('active')).toBe(true);
    expect(animals.classList.contains('active')).toBe(false);

    window.location.hash = '#/animals';
    window.dispatchEvent(new HashChangeEvent('hashchange'));

    expect(home.classList.contains('active')).toBe(false);
    expect(animals.classList.contains('active')).toBe(true);
  });

  it('every sidebar + bottom-nav item carries data-href equal to its route hash (OI-0154 contract)', async () => {
    flagDev(TIM, false);
    window.location.hash = '#/';

    const { renderHeader } = await import('../../../src/ui/header.js');
    const app = document.createElement('div');
    document.body.appendChild(app);
    renderHeader(app);

    // Sidebar — covers all 9 main routes the desktop sidebar exposes.
    const expected = {
      'nav-dashboard': '#/',
      'nav-animals': '#/animals',
      'nav-events': '#/events',
      'nav-locations': '#/locations',
      'nav-feed': '#/feed',
      'nav-todos': '#/todos',
      'nav-reports': '#/reports',
      'nav-settings': '#/settings',
      'nav-feedback': '#/feedback',
    };
    for (const [testid, href] of Object.entries(expected)) {
      const item = app.querySelector(`[data-testid="${testid}"]`);
      expect(item, `sidebar item ${testid} should be present`).toBeTruthy();
      expect(item.getAttribute('data-href'), `sidebar item ${testid} should have data-href`).toBe(href);
    }

    // Bottom nav — covers the 7 mobile-bar routes.
    const bnav = {
      'bnav-home': '#/',
      'bnav-animals': '#/animals',
      'bnav-todos': '#/todos',
      'bnav-events': '#/events',
      'bnav-locations': '#/locations',
      'bnav-feed': '#/feed',
      'bnav-settings': '#/settings',
    };
    for (const [testid, href] of Object.entries(bnav)) {
      const item = app.querySelector(`[data-testid="${testid}"]`);
      expect(item, `bottom-nav item ${testid} should be present`).toBeTruthy();
      expect(item.getAttribute('data-href'), `bottom-nav item ${testid} should have data-href`).toBe(href);
    }
  });
});
