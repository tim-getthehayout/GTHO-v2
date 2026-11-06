/** @file Composite animals: head count, average weight, and reduce-on-add. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../../src/data/store.js';
import {
  animalHeadCount,
  getLiveWindowHeadCount,
  getLiveWindowAvgWeight,
  reduceCompositeTotals,
} from '../../../src/calcs/window-helpers.js';
import { planCompositeReductions, applyCompositeReductions } from '../../../src/features/animals/composite.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as ClassEntity from '../../../src/entities/animal-class.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const GROUP = '00000000-0000-0000-0000-0000000000b1';
const SHEEP = '00000000-0000-0000-0000-0000000000c1';
const CATTLE = '00000000-0000-0000-0000-0000000000c2';
const LOT = '00000000-0000-0000-0000-0000000000d1';
const EWE = '00000000-0000-0000-0000-0000000000d2';
const COW = '00000000-0000-0000-0000-0000000000d3';

describe('composite head count and weight', () => {
  it('counts an individual as 1 and a composite as its head count', () => {
    expect(animalHeadCount({ isBulk: false })).toBe(1);
    expect(animalHeadCount(undefined)).toBe(1);
    expect(animalHeadCount({ isBulk: true, bulkHeadCount: 40 })).toBe(40);
    expect(animalHeadCount({ isBulk: true, bulkHeadCount: 0 })).toBe(0);
  });

  it('adds bulk head count into an open window and leaves a closed snapshot alone', () => {
    const gw = { groupId: 'g', dateLeft: null, headCount: 1 };
    const memberships = [
      { groupId: 'g', animalId: 'lot', dateJoined: '2026-11-01', dateLeft: null },
      { groupId: 'g', animalId: 'cow', dateJoined: '2026-11-01', dateLeft: null },
    ];
    const animals = [
      { id: 'lot', isBulk: true, bulkHeadCount: 40 },
      { id: 'cow', isBulk: false },
    ];
    expect(getLiveWindowHeadCount(gw, { memberships, animals, now: '2026-11-06' })).toBe(41);
    expect(getLiveWindowHeadCount(gw, { memberships, now: '2026-11-06' })).toBe(2);
    expect(getLiveWindowHeadCount(
      { ...gw, dateLeft: '2026-11-05', headCount: 12 },
      { memberships, animals, now: '2026-11-06' },
    )).toBe(12);
  });

  it('treats a composite weight record as the lot total when averaging', () => {
    const gw = { groupId: 'g', dateLeft: null, avgWeightKg: 0 };
    const memberships = [
      { groupId: 'g', animalId: 'lot', dateJoined: '2026-11-01' },
      { groupId: 'g', animalId: 'cow', dateJoined: '2026-11-01' },
    ];
    const animals = [
      { id: 'lot', isBulk: true, bulkHeadCount: 10, classId: 'sheep' },
      { id: 'cow', isBulk: false, classId: 'cow' },
    ];
    const animalWeightRecords = [
      { animalId: 'lot', weightKg: 500, date: '2026-11-01' },
      { animalId: 'cow', weightKg: 500, date: '2026-11-01' },
    ];
    const avg = getLiveWindowAvgWeight(gw, {
      memberships, animals, animalClasses: [], animalWeightRecords, now: '2026-11-06',
    });
    expect(avg).toBeCloseTo(1000 / 11, 5);
  });

  it('uses class default per head when a composite has no weight record', () => {
    const gw = { groupId: 'g', dateLeft: null, avgWeightKg: 0 };
    const memberships = [{ groupId: 'g', animalId: 'lot', dateJoined: '2026-11-01' }];
    const animals = [{ id: 'lot', isBulk: true, bulkHeadCount: 4, classId: 'sheep' }];
    const avg = getLiveWindowAvgWeight(gw, {
      memberships,
      animals,
      animalClasses: [{ id: 'sheep', defaultWeightKg: 50 }],
      animalWeightRecords: [],
      now: '2026-11-06',
    });
    expect(avg).toBe(50);
  });

  it('subtracts the same share of total weight and floors at 0', () => {
    expect(reduceCompositeTotals({ headBefore: 10, weightKg: 500, headsToRemove: 2 }))
      .toEqual({ headAfter: 8, weightKgAfter: 400 });
    expect(reduceCompositeTotals({ headBefore: 3, weightKg: 90, headsToRemove: 10 }))
      .toEqual({ headAfter: 0, weightKgAfter: 0 });
    expect(reduceCompositeTotals({ headBefore: 4, weightKg: null, headsToRemove: 1 }).weightKgAfter)
      .toBeNull();
  });
});

describe('planCompositeReductions', () => {
  beforeEach(() => {
    _reset();
    add('animalClasses', ClassEntity.create({
      id: SHEEP, operationId: OP, name: 'Ewe', species: 'sheep', role: 'ewe',
    }), ClassEntity.validate, ClassEntity.toSupabaseShape, 'animal_classes');
    add('animalClasses', ClassEntity.create({
      id: CATTLE, operationId: OP, name: 'Cow', species: 'beef_cattle', role: 'cow',
    }), ClassEntity.validate, ClassEntity.toSupabaseShape, 'animal_classes');
    add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Flock' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('animals', AnimalEntity.create({
      id: LOT, operationId: OP, sex: 'female', classId: SHEEP, isBulk: true, bulkHeadCount: 10, name: 'Ewe lot',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animals', AnimalEntity.create({
      id: EWE, operationId: OP, sex: 'female', classId: SHEEP, name: 'Tag 1',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animals', AnimalEntity.create({
      id: COW, operationId: OP, sex: 'female', classId: CATTLE, name: 'Cow 1',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: LOT, groupId: GROUP, dateJoined: '2026-11-01',
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    add('animalWeightRecords', WeightEntity.create({
      operationId: OP, animalId: LOT, recordedAt: '2026-11-01T12:00:00Z', weightKg: 500, source: 'manual',
    }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
  });

  it('matches species and ignores a different species', () => {
    const sheep = planCompositeReductions({ groupId: GROUP, incomingAnimalIds: [EWE] });
    expect(sheep.plans).toHaveLength(1);
    expect(sheep.plans[0].headsToRemove).toBe(1);
    expect(sheep.ambiguous).toHaveLength(0);
    const cattle = planCompositeReductions({ groupId: GROUP, incomingAnimalIds: [COW] });
    expect(cattle.plans).toHaveLength(0);
  });

  it('does not guess when two composites share a species', () => {
    const second = '00000000-0000-0000-0000-0000000000d4';
    add('animals', AnimalEntity.create({
      id: second, operationId: OP, sex: 'female', classId: SHEEP, isBulk: true, bulkHeadCount: 5, name: 'Other lot',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalGroupMemberships', MembershipEntity.create({
      operationId: OP, animalId: second, groupId: GROUP, dateJoined: '2026-11-01',
    }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
    const plan = planCompositeReductions({ groupId: GROUP, incomingAnimalIds: [EWE] });
    expect(plan.plans).toHaveLength(0);
    expect(plan.ambiguous).toHaveLength(1);
  });

  it('applies an accepted reduction to head count and total weight', () => {
    const { plans } = planCompositeReductions({ groupId: GROUP, incomingAnimalIds: [EWE, EWE] });
    plans[0].headsToRemove = 2;
    applyCompositeReductions(plans, OP);
    const lot = getAll('animals').find(a => a.id === LOT);
    expect(lot.bulkHeadCount).toBe(8);
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === LOT);
    expect(weights[weights.length - 1].weightKg).toBe(400);
  });
});
