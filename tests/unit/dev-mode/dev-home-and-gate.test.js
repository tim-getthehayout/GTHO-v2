/** @file OI-0138 phase 3 — `/dev` home page renders the 3-tool list with the
 * DEV MODE badge; `requireDev()` gate silently redirects non-dev users.
 */
import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as MemberEntity from '../../../src/entities/operation-member.js';
import { renderDevHome } from '../../../src/features/dev-mode/index.js';
import { requireDev } from '../../../src/ui/router.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const TIM = '00000000-0000-0000-0000-0000000000c1';
const NON_DEV = '00000000-0000-0000-0000-0000000000c2';

vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: vi.fn(),
}));

import { getUser } from '../../../src/features/auth/session.js';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  window.location.hash = '';
  getUser.mockReset();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
});

describe('renderDevHome (OI-0138)', () => {
  it('renders the 3-tool list with the DEV MODE badge', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderDevHome(container);

    expect(container.querySelector('[data-testid="dev-mode-badge"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="dev-mode-tool-event-audit"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="dev-mode-tool-logs"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="dev-mode-tool-schema"]')).toBeTruthy();
  });

  it('Event Audit tool button navigates to #/dev/audit', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderDevHome(container);
    container.querySelector('[data-testid="dev-mode-tool-event-audit"]').click();
    expect(window.location.hash).toBe('#/dev/audit');
  });
});

describe('requireDev gate (OI-0138)', () => {
  it('runs the wrapped renderFn when current user is_dev=true', () => {
    getUser.mockReturnValue({ id: TIM });
    add('operationMembers', MemberEntity.create({
      operationId: OP, userId: TIM, displayName: 'Tim', email: 'tim@x.com', role: 'owner', isDev: true,
    }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');

    const innerFn = vi.fn();
    const guarded = requireDev(innerFn);
    const container = document.createElement('div');
    guarded(container);

    expect(innerFn).toHaveBeenCalledWith(container);
    expect(window.location.hash).toBe('');
  });

  it('redirects to #/ silently when current user is_dev=false', () => {
    getUser.mockReturnValue({ id: NON_DEV });
    add('operationMembers', MemberEntity.create({
      operationId: OP, userId: NON_DEV, displayName: 'Other', email: 'o@x.com', role: 'team_member', isDev: false,
    }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');

    const innerFn = vi.fn();
    const guarded = requireDev(innerFn);
    const container = document.createElement('div');
    guarded(container);

    expect(innerFn).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
  });

  it('redirects when no member row exists for the current user', () => {
    getUser.mockReturnValue({ id: TIM });
    // No member row added — operation has no members (or Tim isn't on it).

    const innerFn = vi.fn();
    const guarded = requireDev(innerFn);
    const container = document.createElement('div');
    guarded(container);

    expect(innerFn).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/');
  });
});
