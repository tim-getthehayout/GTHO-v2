/**
 * @file Animals Pregnancy Check filter — mutual exclusivity + Groups/Class AND + Ux1.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, setSyncAdapter } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { renderAnimalsScreen } from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';

const OP = '00000000-0000-0000-0000-000000024311';
const FARM = '00000000-0000-0000-0000-000000024312';
const GA = '00000000-0000-0000-0000-0000000243a1';
const GB = '00000000-0000-0000-0000-0000000243a2';
const CLASS_COW = '00000000-0000-0000-0000-0000000243c1';
const CLASS_HEIFER = '00000000-0000-0000-0000-0000000243c2';
const CLASS_BULL = '00000000-0000-0000-0000-0000000243c3';
const A_OPEN = '00000000-0000-0000-0000-0000000243b1';
const A_BRED = '00000000-0000-0000-0000-0000000243b2';
const A_HEIFER = '00000000-0000-0000-0000-0000000243b3';
const A_BULL = '00000000-0000-0000-0000-0000000243b4';
const A_OTHER_GROUP = '00000000-0000-0000-0000-0000000243b5';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
  add('groups', GroupEntity.create({ id: GA, operationId: OP, farmId: FARM, name: 'Herd A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GB, operationId: OP, farmId: FARM, name: 'Herd B' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_COW, operationId: OP, name: 'Cows', species: 'beef_cattle', role: 'cow',
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_HEIFER, operationId: OP, name: 'Heifers', species: 'beef_cattle', role: 'heifer',
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_BULL, operationId: OP, name: 'Bulls', species: 'beef_cattle', role: 'bull',
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');

  const mkAnimal = (id, overrides) => add('animals', AnimalEntity.create({
    id, operationId: OP, sex: 'female', tagNum: id.slice(-4), ...overrides,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');

  mkAnimal(A_OPEN, { classId: CLASS_COW, confirmedBred: false, tagNum: 'C100' });
  mkAnimal(A_BRED, { classId: CLASS_COW, confirmedBred: true, tagNum: 'C200' });
  mkAnimal(A_HEIFER, { classId: CLASS_HEIFER, confirmedBred: false, tagNum: 'H100' });
  mkAnimal(A_BULL, { classId: CLASS_BULL, confirmedBred: false, sex: 'male', tagNum: 'B100' });
  mkAnimal(A_OTHER_GROUP, { classId: CLASS_COW, confirmedBred: false, tagNum: 'C300' });

  const mkMem = (animalId, groupId, joined = '2026-01-01') => add(
    'animalGroupMemberships',
    MembershipEntity.create({ operationId: OP, animalId, groupId, dateJoined: joined }),
    MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships',
  );
  // Shared group exposure long enough for protocol (asOf = today in 2026-11)
  mkMem(A_OPEN, GA, '2026-01-01');
  mkMem(A_BRED, GA, '2026-01-01');
  mkMem(A_HEIFER, GA, '2026-01-01');
  mkMem(A_BULL, GA, '2026-01-01');
  mkMem(A_OTHER_GROUP, GB, '2026-01-01');
}

function clearActive(selector, container) {
  for (let i = 0; i < 20; i++) {
    const chip = container.querySelector(`${selector}.active`);
    if (!chip) return;
    chip.click();
  }
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderAnimalsScreen(container);
  const allTile = container.querySelector('[data-testid="animals-filter-all"]');
  if (allTile && !allTile.classList.contains('active')) allTile.click();
  clearActive('[data-testid^="animals-chip-species-"]:not([data-testid="animals-chip-species-all"])', container);
  clearActive('[data-testid^="animals-chip-class-"]', container);
  clearActive('[data-testid="animals-chip-status-open"]', container);
  clearActive('[data-testid="animals-chip-status-confirmed-bred"]', container);
  clearActive('[data-testid="animals-chip-status-pregnancy-check"]', container);
  return container;
}

function row(container, id) {
  return container.querySelector(`[data-testid="animal-row-${id}"]`);
}

beforeEach(() => {
  setLocale('en', enLocale);
  _reset();
  setSyncAdapter({
    push: () => {}, pushBatch: () => {}, pull: () => {}, pullAll: () => {},
    delete: () => {}, isOnline: () => true, getStatus: () => 'idle',
    onStatusChange: () => {},
  });
  seed();
});
afterEach(() => {
  document.body.innerHTML = '';
  setSyncAdapter(null);
  vi.restoreAllMocks();
});

describe('Animals Pregnancy Check filter', () => {
  it('shows Pregnancy Check chip and Ux1 protocol when active', () => {
    const c = mount();
    const chip = c.querySelector('[data-testid="animals-chip-status-pregnancy-check"]');
    expect(chip).toBeTruthy();
    expect(c.querySelector('[data-testid="animals-preg-check-protocol"]')).toBeNull();
    chip.click();
    const proto = c.querySelector('[data-testid="animals-preg-check-protocol"]');
    expect(proto?.textContent).toMatch(/≥35d since exposure/);
    expect(proto?.textContent).toMatch(/≥45d post-calving/);
  });

  it('is mutually exclusive with Confirmed bred', () => {
    const c = mount();
    c.querySelector('[data-testid="animals-chip-status-pregnancy-check"]').click();
    expect(c.querySelector('[data-testid="animals-chip-status-pregnancy-check"].active')).toBeTruthy();
    c.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();
    expect(c.querySelector('[data-testid="animals-chip-status-confirmed-bred"].active')).toBeTruthy();
    expect(c.querySelector('[data-testid="animals-chip-status-pregnancy-check"].active')).toBeNull();
  });

  it('lists D0 open exposed females; excludes confirmed bred; ANDs with Groups', () => {
    const c = mount();
    c.querySelector('[data-testid="animals-chip-status-pregnancy-check"]').click();
    expect(row(c, A_OPEN)).toBeTruthy();
    expect(row(c, A_HEIFER)).toBeTruthy();
    expect(row(c, A_BRED)).toBeNull();
    expect(row(c, A_BULL)).toBeNull();

    // Group B only — open cow in GB has no bull co-presence → not in D0
    c.querySelector(`[data-testid="group-tile-${GB}"]`).click();
    expect(row(c, A_OPEN)).toBeNull();
    expect(row(c, A_OTHER_GROUP)).toBeNull();
  });

  it('ANDs with Class filter', () => {
    const c = mount();
    c.querySelector('[data-testid="animals-chip-status-pregnancy-check"]').click();
    const heiferChip = c.querySelector(`[data-testid="animals-chip-class-${CLASS_HEIFER}"]`);
    heiferChip.click();
    expect(row(c, A_HEIFER)).toBeTruthy();
    expect(row(c, A_OPEN)).toBeNull();
  });
});
