/** @file Pure-helper tests for empty-group-prompt (OI-0090). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { groupIsEmpty, groupEventHistoryCount } from '../../src/features/animals/empty-group-prompt.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const GID = '00000000-0000-0000-0000-0000000000g1';

function seedGroup() {
  add('groups', GroupEntity.create({ id: GID, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}
function seedMembership(id, { dateLeft = null } = {}) {
  add('animalGroupMemberships', MembershipEntity.create({
    id, operationId: OP, animalId: `a-${id}`, groupId: GID, dateJoined: '2026-04-01', dateLeft,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}
function seedEventGw(id) {
  add('events', EventEntity.create({ id: `e-${id}`, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventGroupWindows', GroupWindowEntity.create({
    id, operationId: OP, eventId: `e-${id}`, groupId: GID, dateJoined: '2026-04-01',
    headCount: 5, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

describe('groupIsEmpty', () => {
  beforeEach(() => _reset());

  it('returns true when group has zero open memberships', () => {
    seedGroup();
    expect(groupIsEmpty(GID)).toBe(true);
  });

  it('returns true when every membership has dateLeft set', () => {
    seedGroup();
    seedMembership('m1', { dateLeft: '2026-04-10' });
    seedMembership('m2', { dateLeft: '2026-04-11' });
    expect(groupIsEmpty(GID)).toBe(true);
  });

  it('returns false when any membership is still open', () => {
    seedGroup();
    seedMembership('m1');
    seedMembership('m2', { dateLeft: '2026-04-11' });
    expect(groupIsEmpty(GID)).toBe(false);
  });

  it('returns false for missing groupId', () => {
    expect(groupIsEmpty(null)).toBe(false);
    expect(groupIsEmpty(undefined)).toBe(false);
  });
});

describe('groupEventHistoryCount', () => {
  beforeEach(() => _reset());

  it('returns 0 when group has no event windows', () => {
    seedGroup();
    expect(groupEventHistoryCount(GID)).toBe(0);
  });

  it('counts all event_group_windows regardless of open/closed state', () => {
    seedGroup();
    seedEventGw('gw1');
    seedEventGw('gw2');
    expect(groupEventHistoryCount(GID)).toBe(2);
  });
});
