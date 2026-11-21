/**
 * @file Animals filter cascade — groups (large cards) → species → class → status.
 * Covers multi OR, All/Culls exclusivity, R1–R5/R8, lower grid removed.
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
const GB = '00000000-0000-0000-0000-0000000235a2';
const CLASS_COW = '00000000-0000-0000-0000-0000000235c1';
const CLASS_HEIFER = '00000000-0000-0000-0000-0000000235c2';
const CLASS_BULL = '00000000-0000-0000-0000-0000000235c3';
const CLASS_ARCHIVED = '00000000-0000-0000-0000-0000000235c4';
const CLASS_EWE = '00000000-0000-0000-0000-0000000235c5';
const CLASS_EMPTY = '00000000-0000-0000-0000-0000000235c6';
const A_COW_BRED = '00000000-0000-0000-0000-0000000235b1';
const A_COW_OPEN = '00000000-0000-0000-0000-0000000235b2';
const A_HEIFER_BRED = '00000000-0000-0000-0000-0000000235b3';
const A_BULL_OPEN = '00000000-0000-0000-0000-0000000235b4';
const A_CULLED_COW = '00000000-0000-0000-0000-0000000235b5';
const A_EWE_OPEN = '00000000-0000-0000-0000-0000000235b6';

function seedBase() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('groups', GroupEntity.create({ id: GA, operationId: OP, farmId: FARM, name: 'Herd A' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('groups', GroupEntity.create({ id: GB, operationId: OP, farmId: FARM, name: 'Sheep Lot' }),
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
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_EWE, operationId: OP, name: 'Ewes', species: 'sheep', role: 'ewe',
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS_EMPTY, operationId: OP, name: 'Empty Rams', species: 'sheep', role: 'ram',
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
  seedAnimal(A_EWE_OPEN, { classId: CLASS_EWE, confirmedBred: false, tagNum: 'E001' });
  for (const id of [A_COW_BRED, A_COW_OPEN, A_HEIFER_BRED, A_BULL_OPEN]) {
    seedMembership(id, GA);
  }
  seedMembership(A_EWE_OPEN, GB);
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
  const input = container.querySelector('[data-testid="animals-search-input"]')
    || container.querySelector('.agc-wrap input[type="search"]');
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

describe('Animals filter cascade', () => {
  it('Groups row is large cards (All → groups → Culls); lower active grid gone', () => {
    seedHerd();
    const container = mount();
    const filterRow = container.querySelector('[data-testid="animals-groups-filter"]');
    expect(filterRow).toBeTruthy();
    expect(filterRow.classList.contains('animals-groups-filter-row')).toBe(true);
    expect(filterRow.querySelector('[data-testid="animals-filter-all"]')).toBeTruthy();
    expect(filterRow.querySelector(`[data-testid="group-tile-${GA}"]`)).toBeTruthy();
    expect(filterRow.querySelector(`[data-testid="group-tile-${GB}"]`)).toBeTruthy();
    expect(filterRow.querySelector('[data-testid="animals-chip-culls"]')).toBeTruthy();
    // Order: All, then live groups, then Culls
    const kids = Array.from(filterRow.children);
    expect(kids[0].getAttribute('data-testid')).toBe('animals-filter-all');
    expect(kids[kids.length - 1].getAttribute('data-testid')).toBe('animals-chip-culls');
    // Lower grid removed
    expect(container.querySelector('[data-testid="groups-grid"]')).toBeFalsy();
    // Edit / Split / Weights on live cards
    const tile = filterRow.querySelector(`[data-testid="group-tile-${GA}"]`);
    const btns = Array.from(tile.querySelectorAll('button')).map(b => b.textContent.trim());
    expect(btns).toContain('Edit');
    expect(btns).toContain('Weights');
  });

  it('Groups multi OR; All / Culls exclusivity', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="group-tile-${GA}"]`).click();
    expect(container.querySelector('[data-testid="animals-filter-all"]').classList.contains('active')).toBe(false);
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_EWE_OPEN)).toBeFalsy();

    container.querySelector(`[data-testid="group-tile-${GB}"]`).click();
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_EWE_OPEN)).toBeTruthy();

    container.querySelector('[data-testid="animals-chip-culls"]').click();
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(true);
    expect(container.querySelector(`[data-testid="group-tile-${GA}"]`).classList.contains('active')).toBe(false);
    expect(container.querySelector('[data-testid="animals-filter-all"]').classList.contains('active')).toBe(false);
    expect(row(container, A_CULLED_COW)).toBeTruthy();
    expect(row(container, A_COW_BRED)).toBeFalsy();

    container.querySelector('[data-testid="animals-filter-all"]').click();
    expect(container.querySelector('[data-testid="animals-filter-all"]').classList.contains('active')).toBe(true);
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(false);
    expect(row(container, A_CULLED_COW)).toBeFalsy();
    expect(row(container, A_COW_BRED)).toBeTruthy();
  });

  it('Species R4: only species in Groups-row pool; multi OR', () => {
    seedHerd();
    const container = mount();
    const speciesRow = container.querySelector('[data-testid="animals-species-chips"]');
    expect(speciesRow.querySelector('[data-testid="animals-chip-species-all"]')).toBeTruthy();
    expect(speciesRow.querySelector('[data-testid="animals-chip-species-beef_cattle"]')).toBeTruthy();
    expect(speciesRow.querySelector('[data-testid="animals-chip-species-sheep"]')).toBeTruthy();

    // Narrow groups to Herd A — sheep should drop from species chips
    container.querySelector(`[data-testid="group-tile-${GA}"]`).click();
    expect(container.querySelector('[data-testid="animals-chip-species-beef_cattle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="animals-chip-species-sheep"]')).toBeFalsy();

    container.querySelector('[data-testid="animals-filter-all"]').click();
    container.querySelector('[data-testid="animals-chip-species-sheep"]').click();
    expect(row(container, A_EWE_OPEN)).toBeTruthy();
    expect(row(container, A_COW_BRED)).toBeFalsy();
  });

  it('Class R5: only classes with animals in Groups+Species pool (not empty / archived)', () => {
    seedHerd();
    const container = mount();
    const classRow = container.querySelector('[data-testid="animals-class-chips"]');
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`)).toBeTruthy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_HEIFER}"]`)).toBeTruthy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_BULL}"]`)).toBeTruthy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_EWE}"]`)).toBeTruthy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_EMPTY}"]`)).toBeFalsy();
    expect(classRow.querySelector(`[data-testid="animals-chip-class-${CLASS_ARCHIVED}"]`)).toBeFalsy();

    container.querySelector('[data-testid="animals-chip-species-beef_cattle"]').click();
    expect(container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="animals-chip-class-${CLASS_EWE}"]`)).toBeFalsy();
  });

  it('Status multi OR; both = union; R1 hide+clear when no female in rows 1–3', () => {
    seedHerd();
    const container = mount();
    expect(container.querySelector('[data-testid="animals-status-chips"]')).toBeTruthy();

    container.querySelector('[data-testid="animals-chip-status-open"]').click();
    container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();
    // Both on → OR union of open (cow/heifer/ewe/doe) + confirmed bred
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_COW_OPEN)).toBeTruthy();
    expect(row(container, A_EWE_OPEN)).toBeTruthy();
    // Bulls are outside the open set (B0-extend)
    expect(row(container, A_BULL_OPEN)).toBeFalsy();

    // Narrow to Bulls only — no female → status row hidden and cleared
    clearActive('[data-testid^="animals-chip-class-"]', container);
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_BULL}"]`).click();
    expect(container.querySelector('[data-testid="animals-status-chips"]')).toBeFalsy();
    expect(row(container, A_BULL_OPEN)).toBeTruthy();
    expect(row(container, A_COW_BRED)).toBeFalsy();
  });

  it('Confirmed bred label unchanged; Cows+Heifers+Confirmed bred still works', () => {
    seedHerd();
    const container = mount();
    const bred = container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]');
    expect(bred.textContent.trim()).toBe('Confirmed bred');
    expect(container.textContent).not.toMatch(/Confirmed pregnant/);

    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_HEIFER}"]`).click();
    container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_HEIFER_BRED)).toBeTruthy();
    expect(row(container, A_COW_OPEN)).toBeFalsy();
    expect(row(container, A_BULL_OPEN)).toBeFalsy();
  });

  it('R2: parent change clears invalid children; search stays', () => {
    seedHerd();
    const container = mount();
    container.querySelector('[data-testid="animals-chip-species-sheep"]').click();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_EWE}"]`).click();
    const input = container.querySelector('[data-testid="animals-search-input"]');
    input.value = 'E001';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row(container, A_EWE_OPEN)).toBeTruthy();

    // Switch groups to Herd A only — sheep species/class become invalid and clear
    container.querySelector(`[data-testid="group-tile-${GA}"]`).click();
    expect(container.querySelector('[data-testid="animals-chip-species-sheep"]')).toBeFalsy();
    expect(container.querySelector(`[data-testid="animals-chip-class-${CLASS_EWE}"]`)).toBeFalsy();
    // Search preserved
    expect(container.querySelector('[data-testid="animals-search-input"]').value).toBe('E001');
  });

  it('R8: Reset restores rows to All without clearing search; Clear search clears box only', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="group-tile-${GA}"]`).click();
    container.querySelector('[data-testid="animals-chip-species-beef_cattle"]').click();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector('[data-testid="animals-chip-status-open"]').click();
    const input = container.querySelector('[data-testid="animals-search-input"]');
    input.value = 'C002';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    container.querySelector('[data-testid="animals-filter-reset"]').click();
    expect(container.querySelector('[data-testid="animals-filter-all"]').classList.contains('active')).toBe(true);
    expect(container.querySelector('[data-testid="animals-chip-species-all"]').classList.contains('active')).toBe(true);
    expect(container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`)?.classList.contains('active')).toBe(false);
    expect(container.querySelector('[data-testid="animals-chip-status-open"]')?.classList.contains('active')).toBe(false);
    expect(container.querySelector('[data-testid="animals-search-input"]').value).toBe('C002');

    container.querySelector('[data-testid="animals-filter-clear-search"]').click();
    expect(container.querySelector('[data-testid="animals-search-input"]').value).toBe('');
    expect(container.querySelector('[data-testid="animals-filter-all"]').classList.contains('active')).toBe(true);
  });

  it('search still narrows within the combined filter', () => {
    seedHerd();
    const container = mount();
    container.querySelector(`[data-testid="animals-chip-class-${CLASS_COW}"]`).click();
    container.querySelector('[data-testid="animals-chip-status-confirmed-bred"]').click();
    expect(row(container, A_COW_BRED)).toBeTruthy();

    const input = container.querySelector('[data-testid="animals-search-input"]');
    input.value = 'no-such-tag';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row(container, A_COW_BRED)).toBeFalsy();

    input.value = 'C001';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(row(container, A_COW_BRED)).toBeTruthy();
  });

  it('no class selected leaves class filter inactive', () => {
    seedHerd();
    const container = mount();
    expect(row(container, A_COW_BRED)).toBeTruthy();
    expect(row(container, A_HEIFER_BRED)).toBeTruthy();
    expect(row(container, A_BULL_OPEN)).toBeTruthy();
    expect(row(container, A_EWE_OPEN)).toBeTruthy();
  });
});
