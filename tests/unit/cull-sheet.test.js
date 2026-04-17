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
