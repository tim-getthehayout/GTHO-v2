/**
 * @file OI-0164 — Animals area UI rework: 2-column groups grid + Group Edit
 *   footer Archive/gated-Delete + Culls filter pill.
 *
 * The three sub-items are tested in isolation, all driving the real
 * `renderAnimalsScreen` / `openGroupSheet` UI rather than internal helpers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  _reset, add, setSyncAdapter, getById, getAll,
} from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import {
  renderAnimalsScreen,
  openGroupSheet,
} from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';

const OP = '00000000-0000-0000-0000-000000016401';
const FARM = '00000000-0000-0000-0000-000000016402';
const GA = '00000000-0000-0000-0000-0000000016a1';
const GB = '00000000-0000-0000-0000-0000000016a2';
const GC = '00000000-0000-0000-0000-0000000016a3';
const ANIMAL_LIVE = '00000000-0000-0000-0000-0000000016b1';
const ANIMAL_LIVE_2 = '00000000-0000-0000-0000-0000000016b2';
const ANIMAL_CULLED = '00000000-0000-0000-0000-0000000016b3';
const EVT = '00000000-0000-0000-0000-0000000016c1';

function seedOpFarm() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
}

function seedGroup(id, name, overrides = {}) {
  add('groups', GroupEntity.create({ id, operationId: OP, farmId: FARM, name, ...overrides }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
}

function seedAnimal(id, overrides = {}) {
  add('animals', AnimalEntity.create({ id, operationId: OP, sex: 'female', tagNum: id.slice(-4), ...overrides }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedMembership(animalId, groupId) {
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId, groupId, dateJoined: '2026-04-01', reason: 'initial',
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
}

function seedEventGw(eventId, groupId) {
  add('events', EventEntity.create({ id: eventId, operationId: OP, farmId: FARM, dateIn: '2026-04-01' }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('eventGroupWindows', GroupWindowEntity.create({
    operationId: OP, eventId, groupId, dateJoined: '2026-04-01', headCount: 5, avgWeightKg: 500,
  }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
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

// ────────────────────────────────────────────────────────────────────────
// Sub-item A — 2-column groups tile grid
// ────────────────────────────────────────────────────────────────────────

describe('Sub-item A: 2-column groups tile grid', () => {
  it('renders one tile per active group inside a .groups-grid container', () => {
    seedOpFarm();
    seedGroup(GA, 'Group A');
    seedGroup(GB, 'Group B');
    seedGroup(GC, 'Group C', { archivedAt: '2026-04-15T10:00:00.000Z' }); // archived
    const container = document.createElement('div');
    document.body.appendChild(container);

    renderAnimalsScreen(container);

    const grid = container.querySelector('[data-testid="groups-grid"]');
    expect(grid).toBeTruthy();
    expect(grid.classList.contains('groups-grid')).toBe(true);

    // One tile per active (non-archived) group. The archived group must NOT
    // appear in the active grid.
    const tiles = grid.querySelectorAll('[data-testid^="group-tile-"]');
    expect(tiles.length).toBe(2);
    expect(container.querySelector(`[data-testid="group-tile-${GA}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="group-tile-${GB}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="group-tile-${GC}"]`)).toBeFalsy();
  });

  it('active-group tile carries no `×` delete affordance', () => {
    seedOpFarm();
    seedGroup(GA, 'Group A');
    const container = document.createElement('div');
    document.body.appendChild(container);

    renderAnimalsScreen(container);

    const tile = container.querySelector(`[data-testid="group-tile-${GA}"]`);
    expect(tile).toBeTruthy();
    // No descendant button text contains the U+00D7 multiplication sign.
    const buttonTexts = Array.from(tile.querySelectorAll('button')).map(b => b.textContent);
    expect(buttonTexts.every(text => !text.includes('×'))).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// Sub-item B — Group Edit footer Archive + gated Delete
// ────────────────────────────────────────────────────────────────────────

describe('Sub-item B: Group Edit footer Archive + gated Delete', () => {
  it('Archive button stamps archivedAt via archiveGroup, closes the sheet', () => {
    seedOpFarm();
    seedGroup(GA, 'Cow Herd');
    const before = getById('groups', GA);
    expect(before.archivedAt).toBeNull();

    openGroupSheet(before, OP);
    const archiveBtn = document.querySelector('[data-testid="group-sheet-archive"]');
    expect(archiveBtn).toBeTruthy();
    expect(archiveBtn.textContent).toMatch(/Archive/);

    archiveBtn.click();

    const after = getById('groups', GA);
    expect(after.archivedAt).not.toBeNull();
    expect(typeof after.archivedAt).toBe('string');
    expect(Number.isNaN(Date.parse(after.archivedAt))).toBe(false);
  });

  it('Delete button is disabled when group has ≥ 1 event_group_windows', () => {
    seedOpFarm();
    seedGroup(GA, 'Has History');
    seedEventGw(EVT, GA);

    openGroupSheet(getById('groups', GA), OP);
    const deleteBtn = document.querySelector('[data-testid="group-sheet-delete"]');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.hasAttribute('disabled')).toBe(true);
    expect(deleteBtn.title).toMatch(/Archive instead to preserve history/);

    // Clicking does not remove the group.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBtn.click();
    expect(getById('groups', GA)).toBeTruthy();
    confirmSpy.mockRestore();
  });

  it('Delete button is enabled and one-step destructive when group has 0 event_group_windows', () => {
    seedOpFarm();
    seedGroup(GA, 'Pristine');

    openGroupSheet(getById('groups', GA), OP);
    const deleteBtn = document.querySelector('[data-testid="group-sheet-delete"]');
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.hasAttribute('disabled')).toBe(false);

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    deleteBtn.click();
    expect(getById('groups', GA)).toBeUndefined();
    confirmSpy.mockRestore();
  });

  it('create mode renders only Cancel and Save (no Archive, no Delete)', () => {
    seedOpFarm();

    openGroupSheet(null, OP);
    expect(document.querySelector('[data-testid="group-sheet-cancel"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="group-sheet-save"]')).toBeTruthy();
    expect(document.querySelector('[data-testid="group-sheet-archive"]')).toBeFalsy();
    expect(document.querySelector('[data-testid="group-sheet-delete"]')).toBeFalsy();
  });
});

// ────────────────────────────────────────────────────────────────────────
// Sub-item C — Culls filter pill
// ────────────────────────────────────────────────────────────────────────

describe('Sub-item C: Culls filter pill', () => {
  function seedAnimalsScreen() {
    seedOpFarm();
    seedGroup(GA, 'Group A');
    seedAnimal(ANIMAL_LIVE);
    seedAnimal(ANIMAL_LIVE_2);
    seedAnimal(ANIMAL_CULLED, { active: false });
    seedMembership(ANIMAL_LIVE, GA);
    seedMembership(ANIMAL_LIVE_2, GA);
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderAnimalsScreen(container);
    // Reset module-level selectedFilter (leaks across tests). Click All if it
    // isn't already the active chip — that normalises the starting state.
    const allChip = Array.from(container.querySelectorAll('.agc-chip')).find(c => c.textContent.trim() === 'All');
    if (allChip && !allChip.classList.contains('active')) allChip.click();
    return container;
  }

  it('Show-culled checkbox no longer renders', () => {
    const container = seedAnimalsScreen();
    expect(container.textContent).not.toMatch(/Show culled/);
    // No checkbox at all in the filter wrap.
    const filterWrap = container.querySelector('.agc-wrap');
    expect(filterWrap.querySelector('input[type="checkbox"]')).toBeFalsy();
  });

  it('renders Culls (N) chip with the cull count when N > 0', () => {
    const container = seedAnimalsScreen();
    const cullsChip = container.querySelector('[data-testid="animals-chip-culls"]');
    expect(cullsChip).toBeTruthy();
    expect(cullsChip.textContent).toMatch(/Culls\s*\(1\)/);
    expect(cullsChip.classList.contains('agc-chip-culls')).toBe(true);
  });

  it('Culls chip is hidden when N === 0', () => {
    seedOpFarm();
    seedGroup(GA, 'Group A');
    seedAnimal(ANIMAL_LIVE);
    seedMembership(ANIMAL_LIVE, GA);
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderAnimalsScreen(container);

    expect(container.querySelector('[data-testid="animals-chip-culls"]')).toBeFalsy();
  });

  it('tapping Culls filters animal list to culled animals only', () => {
    const container = seedAnimalsScreen();
    // Default (All chip) — culled animal is NOT visible.
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_CULLED}"]`)).toBeFalsy();

    container.querySelector('[data-testid="animals-chip-culls"]').click();

    // After Culls chip — only culled animal is visible.
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE}"]`)).toBeFalsy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE_2}"]`)).toBeFalsy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_CULLED}"]`)).toBeTruthy();
    // Chip carries the active modifier.
    const cullsChip = container.querySelector('[data-testid="animals-chip-culls"]');
    expect(cullsChip.classList.contains('active')).toBe(true);
  });

  function findGroupChip(container, name) {
    return Array.from(container.querySelectorAll('.agc-chip')).find(c => c.textContent.includes(name));
  }
  function findAllChip(container) {
    return Array.from(container.querySelectorAll('.agc-chip')).find(c => c.textContent.trim() === 'All');
  }

  it('tapping a group chip while Culls is active deselects Culls and applies the group filter', () => {
    const container = seedAnimalsScreen();

    // Activate Culls.
    container.querySelector('[data-testid="animals-chip-culls"]').click();
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(true);

    // Tap the Group A chip — re-query after the prior render replaced the chips DOM.
    findGroupChip(container, 'Group A').click();

    // Group A active, Culls no longer active. Animal list shows live members of Group A.
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(false);
    expect(findGroupChip(container, 'Group A').classList.contains('active')).toBe(true);
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE_2}"]`)).toBeTruthy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_CULLED}"]`)).toBeFalsy();
  });

  it('tapping All while Culls is active deselects Culls and shows active animals only', () => {
    const container = seedAnimalsScreen();
    container.querySelector('[data-testid="animals-chip-culls"]').click();

    findAllChip(container).click();

    expect(findAllChip(container).classList.contains('active')).toBe(true);
    expect(container.querySelector('[data-testid="animals-chip-culls"]').classList.contains('active')).toBe(false);
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_CULLED}"]`)).toBeFalsy();
    expect(container.querySelector(`[data-testid="animal-row-${ANIMAL_LIVE}"]`)).toBeTruthy();
  });
});
