/** @file Tests for the Cull Sheet save/reactivate flow (OI-0086 / GH-13). */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CULL_REASONS,
  buildAnimalLabel,
  confirmCull,
  reactivateAnimal,
} from '../../src/features/animals/cull-sheet.js';
import { _reset, add, getById, getAll, setSyncAdapter } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const ANIMAL_ID = '00000000-0000-0000-0000-0000000000bb';
const GROUP_A = '00000000-0000-0000-0000-0000000000c1';
const GROUP_B = '00000000-0000-0000-0000-0000000000c2';

function mkAnimal(overrides = {}) {
  return AnimalEntity.create({
    id: ANIMAL_ID, operationId: OP, sex: 'female',
    tagNum: '203', name: 'A-0042', active: true,
    ...overrides,
  });
}
function mkMembership(id, groupId, overrides = {}) {
  return MembershipEntity.create({
    id, operationId: OP, animalId: ANIMAL_ID, groupId,
    dateJoined: '2026-01-01',
    ...overrides,
  });
}

describe('cull-sheet: CULL_REASONS', () => {
  it('exports all 9 v1 reason options', () => {
    expect(CULL_REASONS).toEqual([
      'Sold',
      'Died (natural)',
      'Died (injury)',
      'Euthanized',
      'Culled (production)',
      'Culled (health)',
      'Culled (age)',
      'Culled (temperament)',
      'Other',
    ]);
  });
});

describe('cull-sheet: buildAnimalLabel', () => {
  it('joins systemId, tag, and weight', () => {
    const animal = mkAnimal({ name: 'A-0042', tagNum: '203' });
    const label = buildAnimalLabel({ animal, latestWeightKg: 508, unitSys: 'imperial' });
    expect(label).toContain('A-0042');
    expect(label).toContain('Tag 203');
    expect(label).toMatch(/lbs|kg/);
  });

  it('omits weight when no latest weight', () => {
    const animal = mkAnimal();
    const label = buildAnimalLabel({ animal, latestWeightKg: null, unitSys: 'imperial' });
    expect(label).not.toMatch(/lbs|kg/);
  });

  it('falls back to id slice when no name/eid', () => {
    const animal = mkAnimal({ name: null, eid: null });
    const label = buildAnimalLabel({ animal, latestWeightKg: null, unitSys: 'imperial' });
    expect(label).toContain(ANIMAL_ID.slice(0, 8));
  });
});

describe('cull-sheet: confirmCull', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('persists active=false + all three cull fields to the store', () => {
    const animal = mkAnimal();
    add('animals', animal, AnimalEntity.validate);

    confirmCull({
      animal,
      cullDate: '2026-04-17',
      cullReason: 'Sold',
      cullNotes: 'Buyer: Johnson Ranch, $1,200',
    });

    const updated = getById('animals', ANIMAL_ID);
    expect(updated.active).toBe(false);
    expect(updated.cullDate).toBe('2026-04-17');
    expect(updated.cullReason).toBe('Sold');
    expect(updated.cullNotes).toBe('Buyer: Johnson Ranch, $1,200');
  });

  it('null-coerces empty notes', () => {
    const animal = mkAnimal();
    add('animals', animal, AnimalEntity.validate);

    confirmCull({ animal, cullDate: '2026-04-17', cullReason: 'Sold', cullNotes: '' });

    expect(getById('animals', ANIMAL_ID).cullNotes).toBeNull();
  });

  it('closes every open animal_group_memberships with dateLeft = cullDate and reason = cull', () => {
    const animal = mkAnimal();
    add('animals', animal, AnimalEntity.validate);
    const memA = mkMembership('mem-a', GROUP_A);
    const memB = mkMembership('mem-b', GROUP_B);
    const memClosed = mkMembership('mem-old', GROUP_A, { dateLeft: '2025-01-01', reason: 'move' });
    add('animalGroupMemberships', memA, MembershipEntity.validate);
    add('animalGroupMemberships', memB, MembershipEntity.validate);
    add('animalGroupMemberships', memClosed, MembershipEntity.validate);

    const result = confirmCull({
      animal, cullDate: '2026-04-17', cullReason: 'Sold', cullNotes: null,
    });

    expect(result.closedMembershipIds.sort()).toEqual(['mem-a', 'mem-b']);
    expect(getById('animalGroupMemberships', 'mem-a').dateLeft).toBe('2026-04-17');
    expect(getById('animalGroupMemberships', 'mem-a').reason).toBe('cull');
    expect(getById('animalGroupMemberships', 'mem-b').dateLeft).toBe('2026-04-17');
    // The pre-existing closed membership stays untouched
    expect(getById('animalGroupMemberships', 'mem-old').dateLeft).toBe('2025-01-01');
    expect(getById('animalGroupMemberships', 'mem-old').reason).toBe('move');
  });

  it('queues sync push for both the animal update and each membership close (6-param trap)', () => {
    const animal = mkAnimal();
    add('animals', animal, AnimalEntity.validate);
    const mem = mkMembership('mem-a', GROUP_A);
    add('animalGroupMemberships', mem, MembershipEntity.validate);

    const pushMock = vi.fn().mockResolvedValue({ success: true });
    setSyncAdapter({ push: pushMock });

    confirmCull({ animal, cullDate: '2026-04-17', cullReason: 'Sold', cullNotes: 'note' });

    const tables = pushMock.mock.calls.map(c => c[0]);
    expect(tables).toContain('animals');
    expect(tables).toContain('animal_group_memberships');

    const animalsCall = pushMock.mock.calls.find(c => c[0] === 'animals');
    expect(animalsCall[1].active).toBe(false);
    expect(animalsCall[1].cull_date).toBe('2026-04-17');
    expect(animalsCall[1].cull_reason).toBe('Sold');
    expect(animalsCall[1].cull_notes).toBe('note');
    expect(animalsCall[2]).toBe('update');

    const memCall = pushMock.mock.calls.find(c => c[0] === 'animal_group_memberships');
    expect(memCall[1].date_left).toBe('2026-04-17');
    expect(memCall[1].reason).toBe('cull');
  });

  it('uses the supplied cullDate even when backdated (no today() leak)', () => {
    const animal = mkAnimal();
    add('animals', animal, AnimalEntity.validate);
    const mem = mkMembership('mem-a', GROUP_A);
    add('animalGroupMemberships', mem, MembershipEntity.validate);

    confirmCull({ animal, cullDate: '2026-04-01', cullReason: 'Sold', cullNotes: null });

    expect(getById('animals', ANIMAL_ID).cullDate).toBe('2026-04-01');
    expect(getById('animalGroupMemberships', 'mem-a').dateLeft).toBe('2026-04-01');
  });

  // OI-0137: a backdated cull must NOT close the group's open event_group_window
  // with date_left = backdated. The historical date stays on the membership row;
  // the window split uses today.
  it('backdated cull does not stamp the open event_group_window with the backdated date', () => {
    const EVT_ID = '00000000-0000-0000-0000-0000000000d1';
    const SECOND_ANIMAL = '00000000-0000-0000-0000-0000000000e1';
    const todayStr = new Date().toISOString().slice(0, 10);

    // Two animals in GROUP_A, both with open memberships.
    const culled = mkAnimal();
    const remaining = AnimalEntity.create({
      id: SECOND_ANIMAL, operationId: OP, sex: 'female',
      tagNum: '204', name: 'A-0043', active: true,
    });
    add('animals', culled, AnimalEntity.validate);
    add('animals', remaining, AnimalEntity.validate);

    const memCulled = mkMembership('mem-culled', GROUP_A);
    const memRemaining = MembershipEntity.create({
      id: 'mem-remaining', operationId: OP, animalId: SECOND_ANIMAL, groupId: GROUP_A,
      dateJoined: '2026-01-01',
    });
    add('animalGroupMemberships', memCulled, MembershipEntity.validate);
    add('animalGroupMemberships', memRemaining, MembershipEntity.validate);

    // Open event_group_window for GROUP_A joined "today" — mirrors live data shape.
    const openGW = GroupWindowEntity.create({
      id: 'gw-open', operationId: OP, eventId: EVT_ID, groupId: GROUP_A,
      dateJoined: todayStr, headCount: 2, avgWeightKg: 450,
    });
    add('eventGroupWindows', openGW, GroupWindowEntity.validate);

    // Cull the first animal with a date 8 months in the past.
    confirmCull({ animal: culled, cullDate: '2025-08-30', cullReason: 'Sold', cullNotes: null });

    // Historical date must stay on the membership entity row.
    expect(getById('animalGroupMemberships', 'mem-culled').dateLeft).toBe('2025-08-30');

    // The original open window must NOT be stamped with the backdated date.
    // (splitGroupWindow may close it with today and open a successor — that's fine.)
    const originalGW = getById('eventGroupWindows', 'gw-open');
    expect(originalGW.dateLeft).not.toBe('2025-08-30');

    // After the split the group still has exactly one open window (location not lost).
    const openWindowsAfter = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_A && !w.dateLeft);
    expect(openWindowsAfter).toHaveLength(1);

    // The new open window reflects the post-cull live count of 1 remaining animal.
    expect(openWindowsAfter[0].headCount).toBe(1);
    expect(openWindowsAfter[0].dateJoined).toBe(todayStr);
  });
});

describe('cull-sheet: reactivateAnimal', () => {
  beforeEach(() => {
    localStorage.clear();
    _reset();
    setSyncAdapter(null);
  });

  it('clears all four cull fields and sets active=true', () => {
    const animal = mkAnimal({
      active: false,
      cullDate: '2026-04-17',
      cullReason: 'Sold',
      cullNotes: 'note',
    });
    add('animals', animal, AnimalEntity.validate);

    reactivateAnimal({ animal });

    const updated = getById('animals', ANIMAL_ID);
    expect(updated.active).toBe(true);
    expect(updated.cullDate).toBeNull();
    expect(updated.cullReason).toBeNull();
    expect(updated.cullNotes).toBeNull();
  });

  it('queues a sync push with all four reset fields', () => {
    const animal = mkAnimal({ active: false, cullDate: '2026-04-17', cullReason: 'Sold', cullNotes: 'n' });
    add('animals', animal, AnimalEntity.validate);

    const pushMock = vi.fn().mockResolvedValue({ success: true });
    setSyncAdapter({ push: pushMock });

    reactivateAnimal({ animal });

    expect(pushMock).toHaveBeenCalledTimes(1);
    const [table, row, op] = pushMock.mock.calls[0];
    expect(table).toBe('animals');
    expect(op).toBe('update');
    expect(row.active).toBe(true);
    expect(row.cull_date).toBeNull();
    expect(row.cull_reason).toBeNull();
    expect(row.cull_notes).toBeNull();
  });

  it('does not touch existing closed memberships', () => {
    const animal = mkAnimal({ active: false, cullDate: '2026-04-17', cullReason: 'Sold' });
    add('animals', animal, AnimalEntity.validate);
    const memClosed = mkMembership('mem-a', GROUP_A, { dateLeft: '2026-04-17', reason: 'cull' });
    add('animalGroupMemberships', memClosed, MembershipEntity.validate);

    reactivateAnimal({ animal });

    expect(getById('animalGroupMemberships', 'mem-a').dateLeft).toBe('2026-04-17');
    expect(getById('animalGroupMemberships', 'mem-a').reason).toBe('cull');
  });
});
