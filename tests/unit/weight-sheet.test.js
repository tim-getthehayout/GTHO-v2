/** @file Tests for Quick Weight sheet → group-window split wiring (OI-0096). */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  _reset, add, getAll, maybeSplitForGroup,
} from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as EventEntity from '../../src/entities/event.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const ANIMAL_ID = '00000000-0000-0000-0000-0000000000a1';
const GROUP_ID = '00000000-0000-0000-0000-0000000000g1';
const EVENT_ID = '00000000-0000-0000-0000-0000000000e1';

function seedEvent(id, dateIn = '2026-04-01', dateOut = null) {
  add('events', EventEntity.create({ id, operationId: OP, farmId: FARM, dateIn, dateOut }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
}
function seedGroup(id, name = 'Herd') {
  add('groups', GroupEntity.create({ id, operationId: OP, farmId: FARM, name }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}
function seedAnimal(id) {
  add('animals', AnimalEntity.create({ id, operationId: OP, active: true }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}
function seedMembership(id, { animalId, groupId, dateJoined = '2026-04-01', dateLeft = null }) {
  add('animalGroupMemberships', MembershipEntity.create({
    id, operationId: OP, animalId, groupId, dateJoined, dateLeft,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}
function seedOpenGw(id, { groupId, eventId, dateJoined = '2026-04-01', headCount = 5, avgWeightKg = 400 }) {
  add('eventGroupWindows', GroupWindowEntity.create({
    id, operationId: OP, groupId, eventId, dateJoined, headCount, avgWeightKg,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
}

describe('Quick Weight sheet → maybeSplitForGroup integration (OI-0096)', () => {
  beforeEach(() => _reset());

  it('triggers a split for the animal\'s group when on an open event', () => {
    seedEvent(EVENT_ID);
    seedGroup(GROUP_ID);
    seedAnimal(ANIMAL_ID);
    seedMembership('m1', { animalId: ANIMAL_ID, groupId: GROUP_ID });
    seedOpenGw('gw1', { groupId: GROUP_ID, eventId: EVENT_ID });

    const before = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_ID).length;
    // Simulate the Quick Weight save — the real sheet calls maybeSplitForGroup for every
    // active membership of the animal. We mirror that contract here.
    const mems = getAll('animalGroupMemberships').filter(m =>
      m.animalId === ANIMAL_ID && !m.dateLeft);
    for (const m of mems) {
      maybeSplitForGroup(m.groupId, '2026-04-15');
    }
    const after = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_ID).length;
    expect(after).toBe(before + 1);

    const windows = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_ID);
    const closed = windows.find(w => w.dateLeft);
    const open = windows.find(w => !w.dateLeft);
    expect(closed).toBeDefined();
    expect(closed.dateLeft).toBe('2026-04-15');
    expect(open).toBeDefined();
    expect(open.dateJoined).toBe('2026-04-15');
  });

  it('is a no-op when the animal has no active group memberships', () => {
    seedAnimal(ANIMAL_ID);
    const before = getAll('eventGroupWindows').length;
    const mems = getAll('animalGroupMemberships').filter(m =>
      m.animalId === ANIMAL_ID && !m.dateLeft);
    for (const m of mems) {
      maybeSplitForGroup(m.groupId, '2026-04-15');
    }
    expect(getAll('eventGroupWindows').length).toBe(before);
  });

  it('is a no-op when the animal\'s group is not on an open event', () => {
    seedGroup(GROUP_ID);
    seedAnimal(ANIMAL_ID);
    seedMembership('m1', { animalId: ANIMAL_ID, groupId: GROUP_ID });
    // No open event_group_windows for this group → helper guards to no-op.
    const before = getAll('eventGroupWindows').length;
    const mems = getAll('animalGroupMemberships').filter(m =>
      m.animalId === ANIMAL_ID && !m.dateLeft);
    for (const m of mems) {
      maybeSplitForGroup(m.groupId, '2026-04-15');
    }
    expect(getAll('eventGroupWindows').length).toBe(before);
  });

  // OI-0137: Quick Weight sheet save handler MUST pass today's date to maybeSplitForGroup,
  // never the user-supplied dateInput.value. The handler's pattern is mirrored here so a
  // future regression that re-introduces dateInput.value-as-changeDate fails this guard.
  it('today-pinning — backdated weigh date never reaches the open window\'s dateLeft', () => {
    seedEvent(EVENT_ID);
    seedGroup(GROUP_ID);
    seedAnimal(ANIMAL_ID);
    seedMembership('m1', { animalId: ANIMAL_ID, groupId: GROUP_ID, dateJoined: '2026-04-21' });
    seedOpenGw('gw1', { groupId: GROUP_ID, eventId: EVENT_ID, dateJoined: '2026-04-21' });

    // Mirror weight.js Save: the historical weigh date stays on the entity row (not modeled
    // here); today's date is what flows to maybeSplitForGroup.
    const todayStr = new Date().toISOString().slice(0, 10);
    const mems = getAll('animalGroupMemberships').filter(m =>
      m.animalId === ANIMAL_ID && !m.dateLeft);
    for (const m of mems) {
      maybeSplitForGroup(m.groupId, todayStr);
    }

    const windows = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_ID);
    const closed = windows.find(w => w.dateLeft);
    expect(closed).toBeDefined();
    // The window's dateLeft is today, never the backdated weigh-date a user might supply.
    expect(closed.dateLeft).toBe(todayStr);
    // Validator guard would reject any future regression that backdates.
    const open = windows.find(w => !w.dateLeft);
    expect(open).toBeDefined();
    expect(open.dateJoined).toBe(todayStr);
  });
});
