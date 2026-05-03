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
