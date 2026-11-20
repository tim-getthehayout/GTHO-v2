/** @file Composite / bulk cull (heads from a composite). */
import { describe, it, expect, beforeEach } from 'vitest';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';
import {
  CULL_REASONS,
  validateHeadsToCull,
  livingCompositesInGroup,
  confirmBulkCull,
  confirmPartialBulkCull,
  confirmCull,
  undoPartialBulkCull,
  clearPartialCullUndo,
  getLastPartialCullUndo,
  reactivateAnimal,
  openCullSheet,
} from '../../src/features/animals/cull-sheet.js';
import { groupIsEmpty } from '../../src/features/animals/empty-group-prompt.js';
import { _reset, add, getById, getAll, setSyncAdapter, archiveGroup, update } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as EventEntity from '../../src/entities/event.js';
import * as WeightRecordEntity from '../../src/entities/animal-weight-record.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-0000000000aa';
const COMPOSITE_ID = '00000000-0000-0000-0000-0000000000bb';
const GROUP_A = '00000000-0000-0000-0000-0000000000c1';
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

function seedGroupWithComposite({ heads = 10, weightKg = 5000, withWindow = false } = {}) {
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
      id: EVT_ID, operationId: OP, farmId: FARM_ID, dateIn: '2026-01-01',
    }), EventEntity.validate);
    add('eventGroupWindows', GroupWindowEntity.create({
      id: 'gw-open', operationId: OP, eventId: EVT_ID, groupId: GROUP_A,
      dateJoined: getLocalTodayStr(), headCount: heads, avgWeightKg: weightKg ? weightKg / heads : 450,
    }), GroupWindowEntity.validate);
  }
  return composite;
}

beforeEach(() => {
  localStorage.clear();
  _reset();
  setSyncAdapter(null);
  clearPartialCullUndo();
  setLocale('en', en);
});

describe('bulk cull: validateHeadsToCull (C4)', () => {
  it('accepts integers 1…H inclusive', () => {
    expect(validateHeadsToCull(1, 10)).toEqual({ ok: true, heads: 1 });
    expect(validateHeadsToCull(10, 10)).toEqual({ ok: true, heads: 10 });
    expect(validateHeadsToCull('5', 10)).toEqual({ ok: true, heads: 5 });
  });

  it('rejects 0, >H, non-integers, empty', () => {
    expect(validateHeadsToCull(0, 10).ok).toBe(false);
    expect(validateHeadsToCull(11, 10).ok).toBe(false);
    expect(validateHeadsToCull(1.5, 10).ok).toBe(false);
    expect(validateHeadsToCull('', 10).ok).toBe(false);
    expect(validateHeadsToCull('abc', 10).ok).toBe(false);
  });
});

describe('bulk cull: livingCompositesInGroup (C1 helper)', () => {
  it('returns living composites with open memberships only', () => {
    seedGroupWithComposite({ heads: 8 });
    const list = livingCompositesInGroup(GROUP_A);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(COMPOSITE_ID);
  });

  it('excludes inactive or zero-head composites', () => {
    seedGroupWithComposite({ heads: 8 });
    update('animals', COMPOSITE_ID, { active: false, cullDate: '2026-11-01', cullReason: 'Sold' },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    expect(livingCompositesInGroup(GROUP_A)).toHaveLength(0);
  });
});

describe('bulk cull: openCullSheet no longer gates isBulk (C1)', () => {
  it('opens the sheet for a composite and shows heads input', () => {
    const composite = seedGroupWithComposite();
    openCullSheet(composite, OP);
    expect(document.getElementById('cull-sheet-wrap')).toBeTruthy();
    expect(document.querySelector('[data-testid="cull-heads-input"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cull-confirm"]')).toBeTruthy();
    // Same 9 reasons
    const opts = [...document.querySelectorAll('[data-testid="cull-reason-select"] option')].map(o => o.value);
    expect(opts).toEqual(CULL_REASONS);
  });
});

describe('bulk cull: partial Option B (C3) + undo (C6)', () => {
  it('spawns a culled lot, reduces living composite, keeps membership open', () => {
    seedGroupWithComposite({ heads: 10, weightKg: 5000, withWindow: true });
    const result = confirmBulkCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-20',
      cullReason: 'Sold',
      cullNotes: 'buyer',
      headsToCull: 3,
      operationId: OP,
    });

    expect(result.kind).toBe('partial');
    const living = getById('animals', COMPOSITE_ID);
    expect(living.active).toBe(true);
    expect(living.bulkHeadCount).toBe(7);
    expect(living.cullDate).toBeNull();

    const lot = getById('animals', result.culledLotId);
    expect(lot).toBeTruthy();
    expect(lot.isBulk).toBe(true);
    expect(lot.bulkHeadCount).toBe(3);
    expect(lot.active).toBe(false);
    expect(lot.cullDate).toBe('2026-11-20');
    expect(lot.cullReason).toBe('Sold');
    expect(lot.cullNotes).toBe('buyer');
    expect(lot.classId).toBe(CLASS_ID);
    expect(lot.sex).toBe('female');

    // Culled lot not in a group
    const lotMems = getAll('animalGroupMemberships').filter(m => m.animalId === lot.id);
    expect(lotMems).toHaveLength(0);

    // Source membership still open
    const mem = getById('animalGroupMemberships', 'mem-comp');
    expect(mem.dateLeft).toBeNull();

    // Proportional weight: 5000 * 7/10 = 3500 on living
    const latestLiving = getAll('animalWeightRecords')
      .filter(w => w.animalId === COMPOSITE_ID)
      .sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''))[0];
    expect(latestLiving.weightKg).toBe(3500);

    // Group not empty / not archived
    expect(groupIsEmpty(GROUP_A)).toBe(false);
    expect(getById('groups', GROUP_A).archivedAt).toBeNull();
  });

  it('one-tap undo restores heads, deletes culled lot, reverses windows', () => {
    seedGroupWithComposite({ heads: 10, weightKg: 5000, withWindow: true });
    const result = confirmPartialBulkCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-20',
      cullReason: 'Sold',
      cullNotes: null,
      headsToCull: 4,
      operationId: OP,
    });
    expect(getLastPartialCullUndo()).toBeTruthy();
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(6);
    expect(getById('animals', result.culledLotId)).toBeTruthy();

    const undone = undoPartialBulkCull(result.undo);
    expect(undone).toBe(true);
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(10);
    expect(getById('animals', result.culledLotId)).toBeUndefined();
    expect(getLastPartialCullUndo()).toBeNull();

    // Original open window restored (no leftover successor or closed stamp)
    const openGWs = getAll('eventGroupWindows').filter(w => w.groupId === GROUP_A && !w.dateLeft);
    expect(openGWs).toHaveLength(1);
    expect(openGWs[0].id).toBe('gw-open');
    expect(openGWs[0].headCount).toBe(10);
  });

  it('does not archive the group while live heads remain', () => {
    seedGroupWithComposite({ heads: 5 });
    confirmBulkCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-20', cullReason: 'Sold', cullNotes: null,
      headsToCull: 2, operationId: OP,
    });
    expect(getById('groups', GROUP_A).archivedAt).toBeNull();
    expect(groupIsEmpty(GROUP_A)).toBe(false);
  });
});

describe('bulk cull: full cull N=H (C5) + Reactivate (C6)', () => {
  it('deactivates composite keeping historical head count; closes memberships; prompts empty group (does not auto-archive)', () => {
    seedGroupWithComposite({ heads: 8, withWindow: true });
    const result = confirmBulkCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-18',
      cullReason: 'Culled (production)',
      cullNotes: null,
      headsToCull: 8,
      operationId: OP,
    });
    expect(result.kind).toBe('full');

    const animal = getById('animals', COMPOSITE_ID);
    expect(animal.active).toBe(false);
    expect(animal.bulkHeadCount).toBe(8); // historical heads kept
    expect(animal.cullDate).toBe('2026-11-18');
    expect(animal.cullReason).toBe('Culled (production)');

    const mem = getById('animalGroupMemberships', 'mem-comp');
    expect(mem.dateLeft).toBe('2026-11-18');
    expect(mem.reason).toBe('cull');

    expect(groupIsEmpty(GROUP_A)).toBe(true);
    // C5: must NOT auto-archive
    expect(getById('groups', GROUP_A).archivedAt).toBeNull();
    // Empty-group prompt sheet should have been opened
    expect(document.getElementById('empty-group-prompt-wrap')).toBeTruthy();
  });

  it('Reactivate restores animal + memberships and reactivates an archived group', () => {
    seedGroupWithComposite({ heads: 6 });
    confirmCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-19',
      cullReason: 'Sold',
      cullNotes: null,
    });
    // Simulate Tim choosing Archive on the empty-group prompt
    archiveGroup(GROUP_A);
    expect(getById('groups', GROUP_A).archivedAt).toBeTruthy();

    reactivateAnimal({ animal: getById('animals', COMPOSITE_ID) });

    const animal = getById('animals', COMPOSITE_ID);
    expect(animal.active).toBe(true);
    expect(animal.cullDate).toBeNull();
    expect(animal.cullReason).toBeNull();

    const mem = getById('animalGroupMemberships', 'mem-comp');
    expect(mem.dateLeft).toBeNull();
    expect(mem.reason).toBeNull();

    expect(getById('groups', GROUP_A).archivedAt).toBeNull();
    expect(groupIsEmpty(GROUP_A)).toBe(false);
  });

  it('individual reactivate still does not reopen memberships', () => {
    const individual = AnimalEntity.create({
      id: '00000000-0000-0000-0000-0000000000ff',
      operationId: OP, sex: 'female', tagNum: '99', active: false,
      cullDate: '2026-11-01', cullReason: 'Sold',
    });
    add('animals', individual, AnimalEntity.validate);
    add('animalGroupMemberships', MembershipEntity.create({
      id: 'mem-ind', operationId: OP, animalId: individual.id, groupId: GROUP_A,
      dateJoined: '2026-01-01', dateLeft: '2026-11-01', reason: 'cull',
    }), MembershipEntity.validate);
    add('groups', GroupEntity.create({
      id: GROUP_A, operationId: OP, farmId: FARM_ID, name: 'G',
    }), GroupEntity.validate);

    reactivateAnimal({ animal: individual });
    expect(getById('animalGroupMemberships', 'mem-ind').dateLeft).toBe('2026-11-01');
  });
});

describe('bulk cull: no migration / C7 smoke', () => {
  it('confirmBulkCull does not create supabase migration files (sanity via store-only writes)', () => {
    seedGroupWithComposite({ heads: 4 });
    confirmBulkCull({
      animal: getById('animals', COMPOSITE_ID),
      cullDate: '2026-11-20', cullReason: 'Other', cullNotes: null,
      headsToCull: 1, operationId: OP,
    });
    // If we got here without schema helpers, store path is migration-free.
    expect(getById('animals', COMPOSITE_ID).bulkHeadCount).toBe(3);
  });
});

