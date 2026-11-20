/** @file Composite / bulk split heads off a composite. */
import { describe, it, expect, beforeEach } from 'vitest';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import {
  validateHeadsToSplit,
  suggestSplitGroupName,
  confirmCompositeHeadSplit,
  confirmPartialCompositeSplit,
  confirmWholeCompositeMove,
  undoCompositeSplit,
  clearSplitUndo,
  getLastSplitUndo,
} from '../../src/features/animals/split-heads.js';
import { groupIsEmpty } from '../../src/features/animals/empty-group-prompt.js';
import { _reset, add, getById, getAll, setSyncAdapter } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as EventEntity from '../../src/entities/event.js';
import * as WeightRecordEntity from '../../src/entities/animal-weight-record.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';
import { animalHeadCount } from '../../src/calcs/window-helpers.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const COMPOSITE_ID = '00000000-0000-0000-0000-0000000000bb';
const GROUP_A = '00000000-0000-0000-0000-0000000000c1';
const GROUP_B = '00000000-0000-0000-0000-0000000000c2';
const FARM_ID = '00000000-0000-0000-0000-0000000000f1';
const EVT_ID = '00000000-0000-0000-0000-0000000000d1';
const CLASS_ID = '00000000-0000-0000-0000-0000000000e1';

function mkComposite(overrides = {}) {
  return AnimalEntity.create({
    id: COMPOSITE_ID,
    operationId: OP,
    classId: CLASS_ID,
    name: 'Heifer lot',
    sex: 'female',
    isBulk: true,
    bulkHeadCount: 10,
    active: true,
    ...overrides,
  });
}

function seedSourceGroup({ heads = 10, weightKg = 5000, withWindow = false } = {}) {
  add('groups', GroupEntity.create({
    id: GROUP_A, operationId: OP, farmId: FARM_ID, name: 'Breeding', color: '#090',
  }), GroupEntity.validate);
  const composite = mkComposite({ bulkHeadCount: heads });
  add('animals', composite, AnimalEntity.validate);
  add('animalGroupMemberships', MembershipEntity.create({
    id: 'mem-comp', operationId: OP, animalId: COMPOSITE_ID, groupId: GROUP_A,
    dateJoined: '2026-01-01',
  }), MembershipEntity.validate);
  if (weightKg != null) {
    add('animalWeightRecords', WeightRecordEntity.create({
      id: 'wt-comp', operationId: OP, animalId: COMPOSITE_ID,
      recordedAt: '2026-01-15T12:00:00.000Z', weightKg, source: 'manual',
    }), WeightRecordEntity.validate);
  }
  if (withWindow) {
    add('events', EventEntity.create({
      id: EVT_ID, operationId: OP, farmId: FARM_ID, 
    }), EventEntity.validate);
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-open', operationId: OP, eventId: EVT_ID, groupId: GROUP_A,
      dateJoined: getLocalTodayStr(), headCount: heads, avgWeightKg: weightKg ? weightKg / heads : 450,
    }), GroupWindowEntity.validate);
  }
  return composite;
}

function seedDestGroup() {
  add('groups', GroupEntity.create({
    id: GROUP_B, operationId: OP, farmId: FARM_ID, name: 'Yearlings', color: '#00a',
  }), GroupEntity.validate);
}

beforeEach(() => {
  localStorage.clear();
  _reset();
  setSyncAdapter(null);
  clearSplitUndo();
  setLocale('en', en);
});

describe('bulk split: validateHeadsToSplit (S2)', () => {
  it('accepts integers 1…H inclusive', () => {
    expect(validateHeadsToSplit(1, 10)).toEqual({ ok: true, heads: 1 });
    expect(validateHeadsToSplit(10, 10)).toEqual({ ok: true, heads: 10 });
    expect(validateHeadsToSplit('5', 10)).toEqual({ ok: true, heads: 5 });
  });

  it('rejects 0, >H, non-integers, empty', () => {
    expect(validateHeadsToSplit(0, 10).ok).toBe(false);
    expect(validateHeadsToSplit(11, 10).ok).toBe(false);
    expect(validateHeadsToSplit(1.5, 10).ok).toBe(false);
    expect(validateHeadsToSplit('', 10).ok).toBe(false);
  });
});

describe('bulk split: suggestSplitGroupName (S1)', () => {
  it('appends " split" to the source group name', () => {
    expect(suggestSplitGroupName('Breeding')).toBe('Breeding split');
  });
});

describe('bulk split: N < H new composite + reduce source (S5)', () => {
  it('creates a living split-off lot and reduces source heads/weight', () => {
    seedSourceGroup({ heads: 10, weightKg: 5000 });
    seedDestGroup();
    const result = confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 3,
      splitDate: '2026-11-20',
      notes: 'moved to yearlings',
      operationId: OP,
      runWindowSplits: false,
    });
    expect(result.kind).toBe('partial');
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(7);
    expect(getById('animals', COMPOSITE_ID).active).toBe(true);

    const newAnimal = getById('animals', result.newAnimalId);
    expect(newAnimal.isBulk).toBe(true);
    expect(newAnimal.bulkHeadCount).toBe(3);
    expect(newAnimal.active).toBe(true);
    expect(newAnimal.classId).toBe(CLASS_ID);
    expect(newAnimal.sex).toBe('female');
    expect(newAnimal.notes).toBe('moved to yearlings');

    // Source membership stays open
    expect(getById('animalGroupMemberships', 'mem-comp').dateLeft).toBeNull();

    // Dest membership for new animal with reason=split
    const destMem = getAll('animalGroupMemberships').find(
      m => m.animalId === result.newAnimalId && m.groupId === GROUP_B && !m.dateLeft,
    );
    expect(destMem).toBeTruthy();
    expect(destMem.reason).toBe('split');
    expect(destMem.dateJoined).toBe('2026-11-20');

    // Proportional weight: 5000 * 3/10 = 1500 to new; 3500 remaining
    const weights = getAll('animalWeightRecords').filter(w => w.id !== 'wt-comp');
    const srcW = weights.find(w => w.animalId === COMPOSITE_ID);
    const newW = weights.find(w => w.animalId === result.newAnimalId);
    expect(srcW.weightKg).toBe(3500);
    expect(newW.weightKg).toBe(1500);
  });

  it('requires split date (S4)', () => {
    seedSourceGroup({ heads: 5 });
    seedDestGroup();
    expect(() => confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 2,
      splitDate: '',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    })).toThrow(/date/i);
  });

  it('does not create a second composite when N = H via confirmCompositeHeadSplit', () => {
    seedSourceGroup({ heads: 4 });
    seedDestGroup();
    const before = getAll('animals').length;
    const result = confirmCompositeHeadSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 4,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(result.kind).toBe('whole-move');
    expect(getAll('animals').length).toBe(before);
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(4);
    expect(getById('animalGroupMemberships', 'mem-comp').dateLeft).toBe('2026-11-20');
    expect(getById('animalGroupMemberships', 'mem-comp').reason).toBe('split');
    const destMem = getAll('animalGroupMemberships').find(
      m => m.animalId === COMPOSITE_ID && m.groupId === GROUP_B && !m.dateLeft,
    );
    expect(destMem).toBeTruthy();
    expect(groupIsEmpty(GROUP_A)).toBe(true);
  });
});

describe('bulk split: S1 destination new vs existing', () => {
  it('joins an existing destination group', () => {
    seedSourceGroup({ heads: 8 });
    seedDestGroup();
    confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 2,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(getAll('animalGroupMemberships').some(m => m.groupId === GROUP_B && !m.dateLeft)).toBe(true);
  });

  it('accepts a newly created destination group id', () => {
    seedSourceGroup({ heads: 8 });
    const newG = GroupEntity.create({
      id: '00000000-0000-0000-0000-0000000000c9',
      operationId: OP, farmId: FARM_ID, name: 'Breeding split', color: '#111',
    });
    add('groups', newG, GroupEntity.validate);
    const result = confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: newG.id,
      headsToSplit: 2,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      createdGroupId: newG.id,
      runWindowSplits: false,
    });
    expect(getById('animals', result.newAnimalId)).toBeTruthy();
    expect(getAll('animalGroupMemberships').some(m => m.groupId === newG.id)).toBe(true);
  });
});

describe('bulk split: undo reverse-write (S6/S7)', () => {
  it('undoes N < H: restores source heads/weight, deletes new composite + membership', () => {
    seedSourceGroup({ heads: 10, weightKg: 5000 });
    seedDestGroup();
    const result = confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 4,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(6);
    expect(getById('animals', result.newAnimalId)).toBeTruthy();

    expect(undoCompositeSplit(result.undo)).toBe(true);
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(10);
    expect(getById('animals', result.newAnimalId)).toBeUndefined();
    expect(getAll('animalGroupMemberships').filter(m => m.groupId === GROUP_B).length).toBe(0);
    // Reduction weight record removed; original remains
    expect(getAll('animalWeightRecords').filter(w => w.animalId === COMPOSITE_ID).map(w => w.id)).toEqual(['wt-comp']);
    expect(getLastSplitUndo()).toBeNull();
  });

  it('undoes N = H whole-move: restores source membership, removes dest membership', () => {
    seedSourceGroup({ heads: 5 });
    seedDestGroup();
    const result = confirmWholeCompositeMove({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(getById('animalGroupMemberships', 'mem-comp').dateLeft).toBe('2026-11-20');
    expect(undoCompositeSplit(result.undo)).toBe(true);
    expect(getById('animalGroupMemberships', 'mem-comp').dateLeft).toBeNull();
    expect(getById('animalGroupMemberships', result.newMembershipId)).toBeUndefined();
    expect(groupIsEmpty(GROUP_A)).toBe(false);
  });

  it('undo deletes a created destination group when emptied', () => {
    seedSourceGroup({ heads: 6 });
    const newG = GroupEntity.create({
      id: '00000000-0000-0000-0000-0000000000ca',
      operationId: OP, farmId: FARM_ID, name: 'Breeding split', color: '#222',
    });
    add('groups', newG, GroupEntity.validate);
    const result = confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: newG.id,
      headsToSplit: 2,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      createdGroupId: newG.id,
      runWindowSplits: false,
    });
    expect(getById('groups', newG.id)).toBeTruthy();
    undoCompositeSplit(result.undo);
    expect(getById('groups', newG.id)).toBeUndefined();
  });
});

describe('bulk split: OI-0137 window behavior', () => {
  it('splits the source open window when heads change', () => {
    seedSourceGroup({ heads: 10, weightKg: 5000, withWindow: true });
    seedDestGroup();
    confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 3,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: true,
    });
    const gws = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_A);
    expect(gws.length).toBeGreaterThanOrEqual(1);
    const closed = gws.find(w => w.id === 'gw-open');
    expect(closed.dateLeft).toBe(getLocalTodayStr());
    // New open window should reflect reduced live head (7)
    const open = gws.find(w => !w.dateLeft);
    expect(open).toBeTruthy();
    expect(open.headCount).toBe(7);
  });

  it('undo reverses window splits', () => {
    seedSourceGroup({ heads: 10, weightKg: 5000, withWindow: true });
    seedDestGroup();
    const result = confirmPartialCompositeSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 2,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: true,
    });
    const openAfter = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_A && !w.dateLeft);
    expect(openAfter.length).toBe(1);
    undoCompositeSplit(result.undo);
    const gw = getById('eventGroupWindows', 'gw-open');
    expect(gw.dateLeft).toBeNull();
    expect(getAll('eventGroupWindows').filter(w => w.groupId === GROUP_A && w.id !== 'gw-open')).toHaveLength(0);
  });
});

describe('bulk split: empty source after N = H', () => {
  it('source group is empty after whole-composite move (prompt caller)', () => {
    seedSourceGroup({ heads: 3 });
    seedDestGroup();
    confirmWholeCompositeMove({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(groupIsEmpty(GROUP_A)).toBe(true);
    expect(animalHeadCount(getById('animals', COMPOSITE_ID))).toBe(3);
  });
});

describe('bulk split: no migration smoke (S7)', () => {
  it('store-only writes; no schema helpers required', () => {
    seedSourceGroup({ heads: 4 });
    seedDestGroup();
    confirmCompositeHeadSplit({
      sourceAnimal: getById('animals', COMPOSITE_ID),
      sourceGroupId: GROUP_A,
      targetGroupId: GROUP_B,
      headsToSplit: 1,
      splitDate: '2026-11-20',
      notes: null,
      operationId: OP,
      runWindowSplits: false,
    });
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(3);
  });
});
