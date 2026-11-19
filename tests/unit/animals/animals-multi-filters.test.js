/**
 * @file Animals multi-select class + status filters.
 * Acceptance: Cows+Heifers+Confirmed bred; Open alone; lifecycle exclusivity;
 * search inside combined filter; Open/Confirmed bred mutual exclusion;
 * label "Confirmed bred"; every non-archived class pill.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _reset, add, setSyncAdapter,
} from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { renderAnimalsScreen } from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';

const OP = '00000000-0000-0000-0000-000000023501';
const FARM = '00000000-0000-0000-0000-000000023502';
const GA = '00000000-0000-0000-0000-0000000235a1';
const CLASS_COW = '00000000-0000-0000-0000-0000000235c1';
const CLASS_HEIFER = '00000000-0000-0000-0000-0000000235c2';
const CLASS_BULL = '00000000-0000-0000-0000-0000000235c3';
const CLASS_ARCHIVED = '00000000-0000-0000-0000-0000000235c4';
const A_COW_BRED = '00000000-0000-0000-0000-0000000235b1';
const A_COW_OPEN = '00000000-0000-0000-0000-0000000235b2';
const A_HEIFER_BRED = '00000000-0000-0000-0000-0000000235b3';
const A_BULL_OPEN = '00000000-0000-0000-0000-0000000235b4';
const A_CULLED_COW = '00000000-0000-0000-0000-0000000235b5';

function seedBase() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: GA, operationId: OP, farmId: FARM, name: 'Herd A' }),
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
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_ARCHIVED, operationId: OP, name: 'Old Steers', species: 'beef_cattle', role: 'steer', archived: true,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
}

function seedAnimal(id, overrides = {}) {
  add('animals', AnimalEntity.create({
    id, operationId: OP, sex: 'female', tagNum: id.slice(-4), ...overrides,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedMembership(animalId, groupId = GA) {
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId, groupId, dateJoined: '2026-04-01', reason: 'initial',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function seedHerd() {
  seedBase();
  seedAnimal(A_COW_BRED, { classId: CLASS_COW, confirmedBred: true, tagNum: 'C001' });
  seedAnimal(A_COW_OPEN, { classId: CLASS_COW, confirmedBred: false, tagNum: 'C002' });
  seedAnimal(A_HEIFER_BRED, { classId: CLASS_HEIFER, confirmedBred: true, tagNum: 'H001' });
  seedAnimal(A_BULL_OPEN, { classId: CLASS_BULL, confirmedBred: false, sex: 'male', tagNum: 'B001' });
  seedAnimal(A_CULLED_COW, { classId: CLASS_COW, confirmedBred: true, active: false, tagNum: 'X001' });
  for (const id of [A_COW_BRED, A_COW_OPEN, A_HEIFER_BRED, A_BULL_OPEN]) {
    seedMembership(id);
  }
}

function clearActive(selector, container) {
  // Re-query after each click — renderAll replaces the chip DOM.
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
  // Normalize lifecycle to All (module state can leak across tests).
  const allChip = Array.from(container.querySelectorAll('.agc-chip')).find(c => c.textContent.trim() === 'All');
  if (allChip && !allChip.classList.contains('active')) allChip.click();
  clearActive('[data-testid^="animals-chip-class-"]', container);
  clearActive('[data-testid="animals-chip-status-open"]', container);
  clearActive('[data-testid="animals-chip-status-confirmed-bred"]', container);
  // Clear search that may have leaked via module state.
  const input = container.querySelector('.agc-wrap input[type="search"]');
  if (input && input.value) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return container;
}

function row(container, id) {
  return container.querySelector(`[data-testid="animal-row-${id}"]`);
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
});

afterEach(() => vi.restoreAllMocks());

describe('Animals multi-select class + status filters', () => {
  it('1: Cows + Heifers + Confirmed bred shows only those classes with confirmedBred true (active)', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_HEIFER}"]`).click();
    container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();

    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_HEIFER_BRED)).toBeTruthy();
    expect(row(container, A_COW_OPEN)).toBeFalsy();
    expect(row(container, A_BULL_OPEN)).toBeFalsy();
    expect(row(container, A_CULLED_COW)).toBeFalsy();
  });

  it('2: Open alone shows confirmedBred not-true within current lifecycle', () => {
    seedHerd();
    const container = mount();
    container.querySelector('[data-testid="animals-chip-status-open"]').click();

    expect(row(container, A_COW_OPEN)).toBeTruthy();
    expect(row(container, A_BULL_OPEN)).toBeTruthy();
    expect(row(container, A_COW_BRED)).toBeFalsy();
    expect(row(container, A_HEIFER_BRED)).toBeFalsy();
    expect(row(container, A_CULLED_COW)).toBeFalsy();
  });

  it('3: All / group / Culls exclusivity still holds with new pills present', () => {
    seedHerd();
    const container = mount();
    const culls = container.querySelector('[data-testid="animals-chip-culls"]');
    expect(culls).toBeTruthy();
    culls.click();
    expect(row(container, A_CULLED_COW)).toBeTruthy();
    expect(row(container, A_COW_BRED)).toBeFalsy();

    const groupChip = Array.from(container.querySelectorAll('.agc-chip')).find(c => c.textContent.includes('Herd A'));
    groupChip.click();
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(false);
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_CULLED_COW)).toBeFalsy();
  });

  it('4: search still narrows within the combined filter', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();
    expect(row(container, A_COW_BRED)).toBeTruthy();

    const input = container.querySelector('.agc-wrap input[type="search"]');
    input.value = 'no-such-tag';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row(container, A_COW_BRED)).toBeFalsy();

    input.value = 'C001';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row(container, A_COW_BRED)).toBeTruthy();
  });

  it('5: Open and Confirmed bred are mutually exclusive; tap active clears', () => {
    seedHerd();
    const container = mount();
    const open = () => container.querySelector('[data-testid="animals-chip-status-open"]');
    const bred = () => container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]');

    open().click();
    expect(open().classList.contains('active')).toBe(true);
    expect(bred().classList.contains('active')).toBe(false);

    bred().click();
    expect(bred().classList.contains('active')).toBe(true);
    expect(open().classList.contains('active')).toBe(false);

    bred().click();
    expect(bred().classList.contains('active')).toBe(false);
    expect(open().classList.contains('active')).toBe(false);
  });

  it('6: status pill label is exactly Confirmed bred — never Confirmed pregnant', () => {
    seedHerd();
    const container = mount();
    const bred = container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]');
    expect(bred.textContent.trim()).toBe('Confirmed bred');
    expect(container.textContent).not.toMatch(/Confirmed pregnant/);
    expect(enLocale.animal.filterConfirmedBred).toBe('Confirmed bred');
  });

  it('7: class pills list every non-archived class (including non-breedable roles)', () => {
    seedHerd();
    const container = mount();
    const classRow = container.querySelector('[data-testid="animals-class-chips"]');
    expect(classRow).toBeTruthy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`)?.textContent.trim()).toBe('Cows');
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_HEIFER}"]`)?.textContent.trim()).toBe('Heifers');
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_BULL}"]`)?.textContent.trim()).toBe('Bulls');
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_ARCHIVED}"]`)).toBeFalsy();
    expect(classRow.textContent).not.toMatch(/Old Steers/);
  });

  it('class OR: Cows + Bulls without status shows both classes', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_BULL}"]`).click();
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_COW_OPEN)).toBeTruthy();
    expect(row(container, A_BULL_OPEN)).toBeTruthy();
    expect(row(container, A_HEIFER_BRED)).toBeFalsy();
  });

  it('no class selected leaves class filter inactive', () => {
    seedHerd();
    const container = mount();
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_HEIFER_BRED)).toBeTruthy();
    expect(row(container, A_BULL_OPEN)).toBeTruthy();
  });
});
