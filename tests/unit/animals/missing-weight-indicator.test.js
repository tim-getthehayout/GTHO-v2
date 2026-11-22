/**
 * @file Missing-weight indicator + conditional filter (Ib+Mw+Ac+Pl+Pf+Pa+Sp).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _reset, add, setSyncAdapter,
} from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { renderAnimalsScreen, openAnimalSheet } from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';
import { getLocalTodayStr } from '../../../src/utils/date-utils.js';

const OP = '00000000-0000-0000-0000-000000024801';
const FARM = '00000000-0000-0000-0000-000000024802';
const G1 = '00000000-0000-0000-0000-0000000248a1';
const CLASS_COW = '00000000-0000-0000-0000-0000000248c1';
const CLASS_EWE = '00000000-0000-0000-0000-0000000248c2';
const A_WEIGHED = '00000000-0000-0000-0000-0000000248b1';
const A_MISSING = '00000000-0000-0000-0000-0000000248b2';
const A_DEFAULT_ONLY = '00000000-0000-0000-0000-0000000248b3';
const A_CULLED_MISSING = '00000000-0000-0000-0000-0000000248b4';
const A_CULLED_WEIGHED = '00000000-0000-0000-0000-0000000248b5';
const A_EWE_MISSING = '00000000-0000-0000-0000-0000000248b6';
const A_FUTURE_ONLY = '00000000-0000-0000-0000-0000000248b7';

function seedBase() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: G1, operationId: OP, farmId: FARM, name: 'Herd' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_COW, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow',
    defaultWeightKg: 550,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_EWE, operationId: OP, name: 'Ewes', species: 'sheep', role: 'ewe',
    defaultWeightKg: 70,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
}

function seedAnimal(id, overrides = {}) {
  add('animals', AnimalEntity.create({
    id, operationId: OP, sex: 'female', tagNum: id.slice(-4), classId: CLASS_COW, ...overrides,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedMembership(animalId) {
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId, groupId: G1, dateJoined: '2026-04-01', reason: 'initial',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function seedWeight(animalId, weightKg, recordedAt) {
  add('animalWeightRecords', WeightEntity.create({
    operationId: OP, animalId, weightKg, recordedAt, source: 'manual',
  }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
}

function seedHerd() {
  seedBase();
  seedAnimal(A_WEIGHED, { tagNum: 'W001' });
  seedAnimal(A_MISSING, { tagNum: 'M001' });
  seedAnimal(A_DEFAULT_ONLY, { tagNum: 'D001' }); // class default only — still Mw
  seedAnimal(A_CULLED_MISSING, { tagNum: 'X001', active: false });
  seedAnimal(A_CULLED_WEIGHED, { tagNum: 'X002', active: false });
  seedAnimal(A_EWE_MISSING, { tagNum: 'E001', classId: CLASS_EWE });
  seedAnimal(A_FUTURE_ONLY, { tagNum: 'F001' });
  for (const id of [A_WEIGHED, A_MISSING, A_DEFAULT_ONLY, A_EWE_MISSING, A_FUTURE_ONLY]) {
    seedMembership(id);
  }
  const today = getLocalTodayStr();
  seedWeight(A_WEIGHED, 500, `${today}T12:00:00`);
  seedWeight(A_CULLED_WEIGHED, 480, `${today}T12:00:00`);
  // Future-only record must not clear Mw
  seedWeight(A_FUTURE_ONLY, 510, '2099-01-01T12:00:00');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderAnimalsScreen(container);
  const allTile = container.querySelector('[data-testid="animals-filter-all"]');
  if (allTile && !allTile.classList.contains('active')) allTile.click();
  const mw = container.querySelector('[data-testid="animals-chip-missing-weight"].active');
  if (mw) mw.click();
  const reset = container.querySelector('[data-testid="animals-filter-reset"]');
  if (reset) reset.click();
  return container;
}

describe('Missing-weight indicator + filter', () => {
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
    seedHerd();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('Ib: list shows amber badge when Mw; edit sheet too', () => {
    const c = mount();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_MISSING}"]`)).toBeTruthy();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_WEIGHED}"]`)).toBeNull();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_DEFAULT_ONLY}"]`)).toBeTruthy();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_FUTURE_ONLY}"]`)).toBeTruthy();

    openAnimalSheet(
      // existing animal from store
      { id: A_MISSING, operationId: OP, sex: 'female', tagNum: 'M001', classId: CLASS_COW, active: true },
      OP,
      FARM,
    );
    expect(document.querySelector('[data-testid="edit-animal-missing-weight"]')).toBeTruthy();
  });

  it('Mw: class default alone does not clear indicator; recorded weight does', () => {
    const c = mount();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_DEFAULT_ONLY}"]`)).toBeTruthy();
    expect(c.querySelector(`[data-testid="animal-missing-weight-${A_WEIGHED}"]`)).toBeNull();
  });

  it('Pf+Ac: pill on All when active missing; hidden when none; Culls uses culled pool', () => {
    const c = mount();
    const pill = c.querySelector('[data-testid="animals-chip-missing-weight"]');
    expect(pill).toBeTruthy();
    expect(pill.textContent).toContain('Missing weight');

    // Culls: pill still offered (culled missing exists)
    c.querySelector('[data-testid="animals-chip-culls"]').click();
    expect(c.querySelector('[data-testid="animals-chip-missing-weight"]')).toBeTruthy();

    // Weigh the only culled missing → pill hides on Culls
    seedWeight(A_CULLED_MISSING, 400, `${getLocalTodayStr()}T12:00:00`);
    c.querySelector('[data-testid="animals-filter-all"]').click();
    c.querySelector('[data-testid="animals-chip-culls"]').click();
    expect(c.querySelector('[data-testid="animals-chip-missing-weight"]')).toBeNull();
  });

  it('Pa: pill ANDs with list; Sp includes sheep; Reset clears', () => {
    const c = mount();
    c.querySelector('[data-testid="animals-chip-missing-weight"]').click();
    expect(c.querySelector(`[data-testid="animal-row-${A_MISSING}"]`)).toBeTruthy();
    expect(c.querySelector(`[data-testid="animal-row-${A_EWE_MISSING}"]`)).toBeTruthy();
    expect(c.querySelector(`[data-testid="animal-row-${A_WEIGHED}"]`)).toBeNull();
    expect(c.querySelector(`[data-testid="animal-row-${A_CULLED_MISSING}"]`)).toBeNull();

    c.querySelector('[data-testid="animals-filter-reset"]').click();
    expect(c.querySelector('[data-testid="animals-chip-missing-weight"].active')).toBeNull();
    expect(c.querySelector(`[data-testid="animal-row-${A_WEIGHED}"]`)).toBeTruthy();
  });

  it('Pf: pill hidden on All when every active animal has a weight', () => {
    // Give every active animal a weight
    for (const id of [A_MISSING, A_DEFAULT_ONLY, A_EWE_MISSING, A_FUTURE_ONLY]) {
      seedWeight(id, 450, `${getLocalTodayStr()}T12:00:00`);
    }
    const c = mount();
    expect(c.querySelector('[data-testid="animals-chip-missing-weight"]')).toBeNull();
    // Culled missing still → pill on Culls only
    c.querySelector('[data-testid="animals-chip-culls"]').click();
    expect(c.querySelector('[data-testid="animals-chip-missing-weight"]')).toBeTruthy();
  });
});
