/** @file Tests for store.splitGroupWindow / closeGroupWindow — OI-0091. */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _reset, add, update, getAll, closeGroupWindow, splitGroupWindow,
} from '../../src/data/store.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupEntity from '../../src/entities/group.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVENT_ID = '00000000-0000-0000-0000-0000000000e1';
const GROUP_ID = '00000000-0000-0000-0000-0000000000g1';

function seedGroup() {
  add('groups', GroupEntity.create({ id: GROUP_ID, operationId: OP, farmId: FARM, name: 'Shenk Culls' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}

function seedEvent() {
  add('events', EventEntity.create({ id: EVENT_ID, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}

function seedAnimal(id) {
  add('animals', AnimalEntity.create({ id, operationId: OP, active: true }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedMembership(id, animalId, { dateJoined = '2026-04-01', dateLeft = null } = {}) {
  add('animalGroupMemberships', MembershipEntity.create({
    id, operationId: OP, animalId, groupId: GROUP_ID, dateJoined, dateLeft,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function seedOpenWindow(id, { headCount = 10, avgWeightKg = 450, dateJoined = '2026-04-01' } = {}) {
  add('eventGroupWindows', GroupWindowEntity.create({
    id, operationId: OP, eventId: EVENT_ID, groupId: GROUP_ID,
    dateJoined, headCount, avgWeightKg,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

describe('closeGroupWindow', () => {
  beforeEach(() => {
    _reset();
    seedGroup();
    seedEvent();
  });

  it('stamps live head count and dateLeft on the open window', () => {
    for (let i = 1; i <= 10; i++) {
      seedAnimal(`a${i}`);
      seedMembership(`m${i}`, `a${i}`);
    }
    seedOpenWindow('gw-1', { headCount: 10, avgWeightKg: 450 });
    // Close 4 memberships before the close
    for (let i = 1; i <= 4; i++) {
      update('animalGroupMemberships', `m${i}`, { dateLeft: '2026-04-15' },
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
    const { closedId } = closeGroupWindow(GROUP_ID, EVENT_ID, '2026-04-20', null);
    expect(closedId).toBe('gw-1');
    const gw = getAll('eventGroupWindows').find(w => w.id === 'gw-1');
    expect(gw.dateLeft).toBe('2026-04-20');
    expect(gw.headCount).toBe(6);
  });

  it('logs warn and returns {closedId: null} when no open window exists', () => {
    const { closedId } = closeGroupWindow(GROUP_ID, EVENT_ID, '2026-04-20', null);
    expect(closedId).toBeNull();
  });
});

describe('splitGroupWindow', () => {
  beforeEach(() => {
    _reset();
    seedGroup();
    seedEvent();
    for (let i = 1; i <= 10; i++) {
      seedAnimal(`a${i}`);
      seedMembership(`m${i}`, `a${i}`);
    }
    seedOpenWindow('gw-1', { headCount: 10, avgWeightKg: 450 });
  });

  it('closes current window and opens a new window with newState', () => {
    // Cull 4 first (memberships dateLeft = 2026-04-15).
    for (let i = 1; i <= 4; i++) {
      update('animalGroupMemberships', `m${i}`, { dateLeft: '2026-04-15' },
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
    const { closedId, newId } = splitGroupWindow(GROUP_ID, EVENT_ID, '2026-04-15', null, {
      headCount: 6, avgWeightKg: 440,
    });
    expect(closedId).toBe('gw-1');
    expect(newId).toBeTruthy();

    const windows = getAll('eventGroupWindows').filter(w => w.eventId === EVENT_ID && w.groupId === GROUP_ID);
    expect(windows).toHaveLength(2);

    const closed = windows.find(w => w.id === closedId);
    const opened = windows.find(w => w.id === newId);
    expect(closed.dateLeft).toBe('2026-04-15');
    expect(closed.headCount).toBe(6);
    expect(opened.dateJoined).toBe('2026-04-15');
    expect(opened.dateLeft).toBeNull();
    expect(opened.headCount).toBe(6);
    expect(opened.avgWeightKg).toBe(440);
  });

  it('routes to closeGroupWindow when newState.headCount < 1 (no new window opens)', () => {
    // Cull everyone.
    for (let i = 1; i <= 10; i++) {
      update('animalGroupMemberships', `m${i}`, { dateLeft: '2026-04-15' },
        MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    }
    const { closedId, newId } = splitGroupWindow(GROUP_ID, EVENT_ID, '2026-04-15', null, {
      headCount: 0, avgWeightKg: 0,
    });
    expect(closedId).toBe('gw-1');
    expect(newId).toBeNull();

    const windows = getAll('eventGroupWindows').filter(w => w.eventId === EVENT_ID);
    expect(windows).toHaveLength(1);
    expect(windows[0].dateLeft).toBe('2026-04-15');
    expect(windows[0].headCount).toBe(0);
  });
});
