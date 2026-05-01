/** @file OI-0138 — store helpers `isCurrentUserDev` + `isCurrentUserOwnerOrAdmin`
 * gate the Dev Mode shelf and the per-row Dev Mode toggle. The helpers read
 * `state.operationMembers` directly, joining on the authenticated `getUser()?.id`
 * from the auth session. Both must default to false defensively when the user
 * isn't authenticated, the operation isn't passed, or the member row isn't
 * loaded yet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _reset, add, isCurrentUserDev, isCurrentUserOwnerOrAdmin } from '../../../src/data/store.js';
import * as MemberEntity from '../../../src/entities/operation-member.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const OTHER_OP = '00000000-0000-0000-0000-0000000000bb';
const TIM = '00000000-0000-0000-0000-0000000000c1';
const OTHER = '00000000-0000-0000-0000-0000000000c2';

vi.mock('../../../src/features/auth/session.js', () => ({
  getUser: vi.fn(),
}));

import { getUser } from '../../../src/features/auth/session.js';

function seedMember({ userId, operationId, role = 'team_member', isDev = false }) {
  add('operationMembers', MemberEntity.create({
    operationId, userId, displayName: 'Test', email: 't@x.com', role, isDev,
  }), MemberEntity.validate, MemberEntity.toSupabaseShape, 'operation_members');
}

describe('isCurrentUserDev (OI-0138)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
    getUser.mockReset();
  });

  it('returns true when current user has is_dev=true on the operation', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, role: 'owner', isDev: true });
    expect(isCurrentUserDev(OP)).toBe(true);
  });

  it('returns false when member exists but is_dev=false', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, role: 'owner', isDev: false });
    expect(isCurrentUserDev(OP)).toBe(false);
  });

  it('returns false when user isn\'t authenticated', () => {
    getUser.mockReturnValue(null);
    seedMember({ userId: TIM, operationId: OP, isDev: true });
    expect(isCurrentUserDev(OP)).toBe(false);
  });

  it('returns false when operationId is missing', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, isDev: true });
    expect(isCurrentUserDev(null)).toBe(false);
    expect(isCurrentUserDev(undefined)).toBe(false);
  });

  it('returns false when membership exists on a different operation', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OTHER_OP, isDev: true });
    expect(isCurrentUserDev(OP)).toBe(false);
  });

  it('returns false when no member row exists for current user', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: OTHER, operationId: OP, isDev: true });
    expect(isCurrentUserDev(OP)).toBe(false);
  });
});

describe('isCurrentUserOwnerOrAdmin (OI-0138)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
    getUser.mockReset();
  });

  it('returns true for owner', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, role: 'owner' });
    expect(isCurrentUserOwnerOrAdmin(OP)).toBe(true);
  });

  it('returns true for admin', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, role: 'admin' });
    expect(isCurrentUserOwnerOrAdmin(OP)).toBe(true);
  });

  it('returns false for team_member', () => {
    getUser.mockReturnValue({ id: TIM });
    seedMember({ userId: TIM, operationId: OP, role: 'team_member' });
    expect(isCurrentUserOwnerOrAdmin(OP)).toBe(false);
  });

  it('returns false when not authenticated', () => {
    getUser.mockReturnValue(null);
    seedMember({ userId: TIM, operationId: OP, role: 'owner' });
    expect(isCurrentUserOwnerOrAdmin(OP)).toBe(false);
  });
});
