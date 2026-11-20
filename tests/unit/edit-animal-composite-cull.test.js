/** @file Edit Animal Cull is visible for composites and opens the heads sheet. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _reset, add, getById, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openAnimalSheet, renderAnimalsScreen } from '../../src/features/animals/index.js';
import { resetSheetScrollLock } from '../../src/ui/sheet.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as GroupEntity from '../../src/entities/group.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as MembershipEntity from '../../src/entities/animal-group-membership.js';

const OP = '00000000-0000-0000-0000-0000000239aa';
const FARM = '00000000-0000-0000-0000-0000000239bb';
const GROUP = '00000000-0000-0000-0000-0000000239c1';
const CLASS_ID = '00000000-0000-0000-0000-0000000239d1';
const COMPOSITE = '00000000-0000-0000-0000-0000000239e1';
const INDIVIDUAL = '00000000-0000-0000-0000-0000000239e2';
const CULLED_LOT = '00000000-0000-0000-0000-0000000239e3';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, farmId: FARM, name: 'Ram Lambs-Sale' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_ID, operationId: OP, name: 'Ram Lambs', species: 'sheep', role: 'ram',
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('animals', AnimalEntity.create({
    id: COMPOSITE, operationId: OP, classId: CLASS_ID, sex: 'male',
    name: 'Ram Lambs 16-head', isBulk: true, bulkHeadCount: 16, active: true,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animals', AnimalEntity.create({
    id: INDIVIDUAL, operationId: OP, classId: CLASS_ID, sex: 'male',
    tagNum: 'RL-01', name: 'Tagged ram', isBulk: false, active: true,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animals', AnimalEntity.create({
    id: CULLED_LOT, operationId: OP, classId: CLASS_ID, sex: 'male',
    name: 'Culled lot', isBulk: true, bulkHeadCount: 3, active: false,
    cullDate: '2026-11-01', cullReason: 'Sold',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    id: 'mem-composite', operationId: OP, animalId: COMPOSITE, groupId: GROUP,
    dateJoined: '2026-04-01',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  add('animalGroupMemberships', MembershipEntity.create({
    id: 'mem-individual', operationId: OP, animalId: INDIVIDUAL, groupId: GROUP,
    dateJoined: '2026-04-01',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  setLocale('en', enLocale);
  setSyncAdapter({
    push: () => {}, pushBatch: () => {}, pull: () => {}, pullAll: () => {},
    delete: () => {}, isOnline: () => true, getStatus: () => 'idle',
    onStatusChange: () => {},
  });
  seed();
});

afterEach(() => {
  resetSheetScrollLock();
  document.body.innerHTML = '';
});

describe('Edit Animal Cull for composites', () => {
  it('shows Cull on a living composite and opens the heads sheet', () => {
    openAnimalSheet(getById('animals', COMPOSITE), OP, FARM);

    const panel = document.getElementById('ae-sheet-panel');
    const cullBtn = panel.querySelector('[data-testid="open-cull-sheet"]');
    expect(cullBtn).toBeTruthy();
    expect(panel.querySelector('[data-testid="edit-animal-weaned-date"]')).toBeNull();

    cullBtn.click();
    expect(document.querySelector('[data-testid="cull-heads-input"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cull-confirm"]')).toBeTruthy();
    const heads = document.querySelector('[data-testid="cull-heads-input"]');
    expect(heads.max).toBe('16');
  });

  it('still shows Cull on an individual Edit Animal', () => {
    openAnimalSheet(getById('animals', INDIVIDUAL), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    expect(panel.querySelector('[data-testid="open-cull-sheet"]')).toBeTruthy();
  });

  it('does not show Cull on Add Animal', () => {
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    expect(panel.querySelector('[data-testid="open-cull-sheet"]')).toBeNull();
    expect(panel.querySelector('[data-testid="culled-banner"]')).toBeNull();
  });

  it('shows the culled banner (not Cull) for an inactive composite', () => {
    openAnimalSheet(getById('animals', CULLED_LOT), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    expect(panel.querySelector('[data-testid="open-cull-sheet"]')).toBeNull();
    expect(panel.querySelector('[data-testid="culled-banner"]')).toBeTruthy();
  });
});

describe('Group-card Cull for a living composite', () => {
  it('renders Cull on the group filter card and opens the heads sheet', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderAnimalsScreen(container);

    const cullBtn = container.querySelector(`[data-testid="group-cull-${GROUP}"]`);
    expect(cullBtn).toBeTruthy();
    cullBtn.click();
    expect(document.querySelector('[data-testid="cull-heads-input"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="cull-heads-input"]').max).toBe('16');
  });
});
