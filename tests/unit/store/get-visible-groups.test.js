/**
 * @file OI-0133 — getVisibleGroups now derives a group's current farm from
 * its most recent open `event_group_window → event.farmId` rather than
 * reading a stored `groups.farmId` column. The column was dropped in
 * migration 032; the previous stored-copy-of-derivable-fact pattern
 * silently drifted on every cross-farm move (same OI-0117 class of bug).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _reset, add, update, getAll, getVisibleGroups, getGroupCurrentFarm, setActiveFarm,
} from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as UserPrefEntity from '../../../src/entities/user-preference.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM_A = '00000000-0000-0000-0000-0000000000a1';
const FARM_B = '00000000-0000-0000-0000-0000000000a2';
const GROUP_ON_A = '00000000-0000-0000-0000-0000000000c1';
const GROUP_ON_B = '00000000-0000-0000-0000-0000000000c2';
const GROUP_UNPLACED = '00000000-0000-0000-0000-0000000000c3';
const EVENT_ON_A = '00000000-0000-0000-0000-0000000000e1';
const EVENT_ON_B = '00000000-0000-0000-0000-0000000000e2';

const USER_ID = '00000000-0000-0000-0000-0000000000ff';

function seedBase() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('userPreferences', UserPrefEntity.create({ operationId: OP, userId: USER_ID, activeFarmId: null }),
    UserPrefEntity.validate, UserPrefEntity.toSupabaseShape, 'user_preferences');
  add('farms', FarmEntity.create({ id: FARM_A, operationId: OP, name: 'Farm A' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farms', FarmEntity.create({ id: FARM_B, operationId: OP, name: 'Farm B' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: GROUP_ON_A, operationId: OP, name: 'On Farm A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_ON_B, operationId: OP, name: 'On Farm B' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GROUP_UNPLACED, operationId: OP, name: 'Unplaced' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('events', EventEntity.create({ id: EVENT_ON_A, operationId: OP, farmId: FARM_A, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('events', EventEntity.create({ id: EVENT_ON_B, operationId: OP, farmId: FARM_B, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventGroupWindows', GroupWindowEntity.create({
    operationId: OP, eventId: EVENT_ON_A, groupId: GROUP_ON_A, dateJoined: '2026-04-01', headCount: 5, avgWeightKg: 400,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  add('eventGroupWindows', GroupWindowEntity.create({
    operationId: OP, eventId: EVENT_ON_B, groupId: GROUP_ON_B, dateJoined: '2026-04-01', headCount: 5, avgWeightKg: 400,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  seedBase();
});

describe('OI-0133 — getVisibleGroups filters via getGroupCurrentFarm', () => {
  it('group with open window on active farm → included', () => {
    setActiveFarm(FARM_A);
    const visible = getVisibleGroups().map(g => g.id);
    expect(visible).toContain(GROUP_ON_A);
    expect(visible).not.toContain(GROUP_ON_B);
  });

  it('group with open window on a different farm → excluded', () => {
    setActiveFarm(FARM_B);
    const visible = getVisibleGroups().map(g => g.id);
    expect(visible).toContain(GROUP_ON_B);
    expect(visible).not.toContain(GROUP_ON_A);
  });

  it('group with no open window shows in the "All farms" view (activeFarmId === null)', () => {
    setActiveFarm(null);
    const visible = getVisibleGroups().map(g => g.id);
    expect(visible).toContain(GROUP_UNPLACED);
    expect(visible).toContain(GROUP_ON_A);
    expect(visible).toContain(GROUP_ON_B);
  });

  it('group with no open window is excluded from any per-farm view', () => {
    setActiveFarm(FARM_A);
    expect(getVisibleGroups().map(g => g.id)).not.toContain(GROUP_UNPLACED);
    setActiveFarm(FARM_B);
    expect(getVisibleGroups().map(g => g.id)).not.toContain(GROUP_UNPLACED);
  });
});

describe('OI-0133 — getGroupCurrentFarm helper', () => {
  it('returns the event farmId for the group\'s most recent open window', () => {
    expect(getGroupCurrentFarm(GROUP_ON_A)).toBe(FARM_A);
    expect(getGroupCurrentFarm(GROUP_ON_B)).toBe(FARM_B);
  });

  it('returns null for a group with no open window', () => {
    expect(getGroupCurrentFarm(GROUP_UNPLACED)).toBeNull();
  });

  it('closed windows do not count — only open ones contribute', () => {
    // Close the only window for GROUP_ON_A.
    const openW = getAll('eventGroupWindows').find(w => w.groupId === GROUP_ON_A);
    update('eventGroupWindows', openW.id, { dateLeft: '2026-04-10' },
      GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    expect(getGroupCurrentFarm(GROUP_ON_A)).toBeNull();
  });

  it('picks the most recent open window when multiple are open (dateJoined DESC)', () => {
    // Add a second open window for GROUP_ON_A on FARM_B, later date → wins.
    add('eventGroupWindows', GroupWindowEntity.create({
      operationId: OP, eventId: EVENT_ON_B, groupId: GROUP_ON_A, dateJoined: '2026-04-15', headCount: 5, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    expect(getGroupCurrentFarm(GROUP_ON_A)).toBe(FARM_B);
  });
});
