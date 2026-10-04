/** @file OI-0102 — one Save opens N paddocks under one open_cohort_id. */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../../src/features/map/picker.js', () => ({
  openLocationMapPicker: vi.fn(),
  closeMapPicker: vi.fn(),
  mapPickButton: vi.fn(),
}));

import { _reset, add, getAll, getById } from '../../../src/data/store.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as FarmSettingEntity from '../../../src/entities/farm-setting.js';
import * as LocationEntity from '../../../src/entities/location.js';
import * as EventEntity from '../../../src/entities/event.js';
import * as PaddockWindowEntity from '../../../src/entities/event-paddock-window.js';
import * as GroupEntity from '../../../src/entities/group.js';
import * as GroupWindowEntity from '../../../src/entities/event-group-window.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as MembershipEntity from '../../../src/entities/animal-group-membership.js';
import * as AnimalWeightEntity from '../../../src/entities/animal-weight-record.js';
import * as FeedTypeEntity from '../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../src/entities/event-feed-entry.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import enLocale from '../../../src/i18n/locales/en.json';
import { display } from '../../../src/utils/units.js';
import { getUnitSystem } from '../../../src/utils/preferences.js';
import { openLocationMapPicker } from '../../../src/features/map/picker.js';
import { renderLocationPicker } from '../../../src/features/events/index.js';
import { openPaddockWindows } from '../../../src/features/events/open-cohort.js';
import { createDestinationEvent } from '../../../src/features/events/wizard-shared.js';
import { openPlaceWizard } from '../../../src/features/events/place-wizard.js';
import { openMoveWizard } from '../../../src/features/events/move-wizard.js';
import { openSubmoveOpenSheet } from '../../../src/features/events/submove.js';
import '../../../src/calcs/core.js';
import { openEventDetailSheet } from '../../../src/features/events/detail.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const NORTH = '00000000-0000-0000-0000-0000000000c1';
const SOUTH = '00000000-0000-0000-0000-0000000000c2';
const CREEK = '00000000-0000-0000-0000-0000000000c3';
const BARE = '00000000-0000-0000-0000-0000000000c4';
const BARN = '00000000-0000-0000-0000-0000000000c5';
const BUSY = '00000000-0000-0000-0000-0000000000c6';
const GROUP = '00000000-0000-0000-0000-0000000000f1';
const ANIMAL = '00000000-0000-0000-0000-0000000000a1';
const EVT = '00000000-0000-0000-0000-0000000000d1';
const BUSY_EVT = '00000000-0000-0000-0000-0000000000d2';
const COHORT = '00000000-0000-0000-0000-0000000000e9';
const FEED_TYPE = '00000000-0000-0000-0000-000000000071';
const BATCH = '00000000-0000-0000-0000-000000000072';

beforeAll(() => setLocale('en', enLocale));

function addLoc(id, name, extra = {}) {
  const loc = LocationEntity.create({
    id, operationId: OP, farmId: FARM, name, type: 'land', landUse: 'pasture',
    ...extra,
  });
  add('locations', loc, LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  return loc;
}

function seedFarm() {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  openLocationMapPicker.mockClear();
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Home' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('farmSettings', FarmSettingEntity.create({ farmId: FARM, operationId: OP }),
    FarmSettingEntity.validate, FarmSettingEntity.toSupabaseShape, 'farm_settings');
}

function seedHerd() {
  add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Cows' }),
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
  add('animals', AnimalEntity.create({
    id: ANIMAL, operationId: OP, tagNum: 'A1', active: true, dateBorn: '2024-01-01', sex: 'F',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalGroupMemberships', MembershipEntity.create({
    operationId: OP, animalId: ANIMAL, groupId: GROUP, dateJoined: '2026-01-01', dateLeft: null,
  }), MembershipEntity.validate, MembershipEntity.toSupabaseShape, 'animal_group_memberships');
  add('animalWeightRecords', AnimalWeightEntity.create({
    operationId: OP, animalId: ANIMAL, weightKg: 250, recordedAt: '2026-01-15T00:00:00Z', source: 'manual',
  }), AnimalWeightEntity.validate, AnimalWeightEntity.toSupabaseShape, 'animal_weight_records');
}

function seedFeed(eventId, locationId) {
  add('feedTypes', FeedTypeEntity.create({
    id: FEED_TYPE, operationId: OP, name: 'Hay', category: 'hay', unit: 'bale',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FEED_TYPE, name: 'May hay',
    quantity: 20, remaining: 20, unit: 'bale',
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId, batchId: BATCH, locationId, date: '2026-05-02', quantity: 10,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

describe('OI-0102 location picker multi', () => {
  let container;
  let locations;
  let selection;

  beforeEach(() => {
    seedFarm();
    locations = [
      addLoc(NORTH, 'North', { areaHectares: 4 }),
      addLoc(SOUTH, 'South', { areaHectares: 2 }),
      addLoc(CREEK, 'Creek', { areaHectares: 1 }),
      addLoc(BARE, 'Bare'),
      addLoc(BARN, 'Hay Barn', { type: 'confinement', landUse: null }),
      addLoc(BUSY, 'Busy', { areaHectares: 3 }),
    ];
    add('events', EventEntity.create({ id: BUSY_EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      operationId: OP, eventId: BUSY_EVT, locationId: BUSY, dateOpened: '2026-05-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('groups', GroupEntity.create({ id: GROUP, operationId: OP, name: 'Cows' }),
      GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups');
    add('eventGroupWindows', GroupWindowEntity.create({
      operationId: OP, eventId: BUSY_EVT, groupId: GROUP, dateJoined: '2026-05-01',
      headCount: 10, avgWeightKg: 400,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    container = document.createElement('div');
    document.body.appendChild(container);
    selection = { locationId: null, locationIds: [] };
    renderLocationPicker(container, locations, selection, { multi: true });
  });

  function click(id) {
    container.querySelector(`[data-testid="location-picker-item-${id}"]`).click();
  }

  it('toggles a paddock and keeps the mark after search re-renders', () => {
    click(NORTH);
    click(SOUTH);
    expect(selection.locationIds).toEqual([NORTH, SOUTH]);
    expect(container.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).classList.contains('selected')).toBe(true);

    const search = container.querySelector('[data-testid="location-picker-search"]');
    search.value = 'north';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    const north = container.querySelector(`[data-testid="location-picker-item-${NORTH}"]`);
    expect(north.classList.contains('selected')).toBe(true);
    expect(container.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`)).toBeNull();
    expect(selection.locationIds).toEqual([NORTH, SOUTH]);

    search.value = '';
    container.querySelector('[data-testid="location-picker-search"]').dispatchEvent(new Event('input', { bubbles: true }));
    click(NORTH);
    expect(selection.locationIds).toEqual([SOUTH]);
    expect(container.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).classList.contains('selected')).toBe(false);
  });

  it('shows a sticky count with summed acres and names a paddock that has no area', () => {
    click(NORTH);
    click(BARE);
    const count = container.querySelector('[data-testid="location-picker-count"]').textContent;
    const acres = display(4, 'area', getUnitSystem(), 1);
    expect(count).toContain('2 paddocks');
    expect(count).toContain(acres);
    expect(count).toContain('Bare has no area');
  });

  it('shows an in-use paddock and refuses the tap and the Save', () => {
    const row = container.querySelector(`[data-testid="location-picker-item-${BUSY}"]`);
    expect(row).toBeTruthy();
    expect(row.classList.contains('in-use')).toBe(true);
    expect(row.classList.contains('selected')).toBe(false);
    expect(row.textContent).toContain('Open on Cows');
    row.click();
    expect(selection.locationIds).toEqual([]);
    expect(() => openPaddockWindows({
      operationId: OP, eventId: EVT, locationIds: [BUSY], dateOpened: '2026-06-01',
    })).toThrow(/already has an open window/);
  });

  it('keeps confinement exclusive with land', () => {
    click(NORTH);
    click(SOUTH);
    click(BARN);
    expect(selection.locationIds).toEqual([BARN]);
    click(CREEK);
    expect(selection.locationIds).toEqual([CREEK]);
    expect(container.querySelector(`[data-testid="location-picker-item-${BARN}"]`).classList.contains('selected')).toBe(false);
  });

  it('opens the map in multi mode with land ids only and in-use ids blocked', () => {
    click(NORTH);
    click(SOUTH);
    container.querySelector('[data-testid="location-picker-map"]').click();
    const opts = openLocationMapPicker.mock.calls[0][0];
    expect(opts.mode).toBe('multi');
    expect(opts.selectedIds).toEqual([NORTH, SOUTH]);
    expect(opts.blockedIds).toContain(BUSY);
    expect(opts.blockedReasons[BUSY]).toContain('Open on Cows');

    click(BARN);
    container.querySelector('[data-testid="location-picker-map"]').click();
    expect(openLocationMapPicker.mock.calls.at(-1)[0].selectedIds).toEqual([]);
  });
});

describe('OI-0102 single-select callers', () => {
  beforeEach(() => {
    seedFarm();
  });

  it('replaces the one id and marks one row', () => {
    const locations = [addLoc(NORTH, 'North', { areaHectares: 1 }), addLoc(SOUTH, 'South', { areaHectares: 1 })];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const selection = { locationId: null };
    renderLocationPicker(container, locations, selection);
    container.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).click();
    container.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).click();
    expect(selection.locationId).toBe(SOUTH);
    expect(container.querySelectorAll('.loc-picker-item.selected')).toHaveLength(1);
    expect(container.querySelector('[data-testid="location-picker-count"]')).toBeNull();
    container.querySelector('[data-testid="location-picker-map"]').click();
    expect(openLocationMapPicker.mock.calls.at(-1)[0].mode).toBeUndefined();
  });

  it('harvest, amendments, and todos do not pass multi: true', () => {
    for (const file of [
      'src/features/harvest/index.js',
      'src/features/amendments/soil-tests.js',
      'src/features/amendments/entry.js',
      'src/features/todos/todo-sheet.js',
    ]) {
      expect(readFileSync(join(ROOT, file), 'utf8'), file).not.toContain('multi: true');
    }
  });
});

describe('OI-0102 writes', () => {
  beforeEach(() => {
    seedFarm();
    addLoc(NORTH, 'North', { areaHectares: 4 });
    addLoc(SOUTH, 'South', { areaHectares: 2 });
    addLoc(CREEK, 'Creek', { areaHectares: 1 });
    addLoc(BARN, 'Hay Barn', { type: 'confinement', landUse: null });
    seedHerd();
  });

  it('createDestinationEvent fans one Save into one event, two windows, one cohort, two observations', () => {
    const { newEvent, newPW, newPWs } = createDestinationEvent({
      state: {
        locationIds: [NORTH, SOUTH], locationId: NORTH, stripGraze: false, stripSizePct: 100,
        destFarmId: FARM, notes: null,
      },
      operationId: OP,
      farmId: FARM,
      dateIn: '2026-06-01',
      timeIn: null,
      groupSnapshots: [{ groupId: GROUP, headCount: 10, avgWeightKg: 400 }],
      preGrazeValues: { forageHeightCm: 12, forageCoverPct: 80 },
    });
    expect(getAll('events')).toHaveLength(1);
    expect(newPWs).toHaveLength(2);
    expect(newPW).toBe(newPWs[0]);
    expect(newPWs[0].eventId).toBe(newEvent.id);
    expect(newPWs[1].eventId).toBe(newEvent.id);
    expect(newPWs[0].openCohortId).toBeTruthy();
    expect(newPWs[1].openCohortId).toBe(newPWs[0].openCohortId);
    expect(newPWs.every((w) => w.areaPct === 100 && !w.isStripGraze)).toBe(true);
    const obs = getAll('paddockObservations');
    expect(obs).toHaveLength(2);
    expect(obs[0].forageHeightCm).toBe(12);
    expect(obs[1].forageHeightCm).toBe(12);
    expect(obs[0].forageCoverPct).toBe(obs[1].forageCoverPct);
    expect(obs[0].source).toBe('event');
    expect(new Set(obs.map((o) => o.sourceId)).size).toBe(2);
  });

  it('strip graze collapses two picks to the first, and a second tap turns strip off', () => {
    openPlaceWizard(GROUP, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).click();
    document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).click();
    const cb = document.querySelector('[data-testid="move-wizard-strip-graze"]');
    cb.checked = true;
    cb.dispatchEvent(new Event('change'));
    expect(document.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).classList.contains('selected')).toBe(true);
    expect(document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).classList.contains('selected')).toBe(false);
    expect(document.querySelector('[data-testid="move-wizard-strip-size"]')).toBeTruthy();

    document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).click();
    expect(document.querySelector('[data-testid="move-wizard-strip-graze"]').checked).toBe(false);
    expect(document.querySelector('[data-testid="move-wizard-strip-size"]')).toBeNull();
    expect(document.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).classList.contains('selected')).toBe(true);
    expect(document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).classList.contains('selected')).toBe(true);
  });

  it('sub-move open of two paddocks leaves the existing window alone', () => {
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const existing = PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: CREEK, dateOpened: '2026-05-01', areaPct: 100,
    });
    add('eventPaddockWindows', existing,
      PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    const before = getById('eventPaddockWindows', existing.id);

    openSubmoveOpenSheet({ id: EVT }, OP);
    document.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).click();
    document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).click();
    const height = document.querySelector('[data-testid="obs-card-forage-height"]');
    const cover = document.querySelector('[data-testid="obs-card-forage-cover"]');
    height.value = '8';
    cover.value = '70';
    document.querySelector('[data-testid="submove-open-save"]').click();
    expect(document.querySelector('[data-testid="submove-open-status"]').textContent).toBe('');

    expect(getById('eventPaddockWindows', existing.id)).toEqual(before);
    const added = getAll('eventPaddockWindows').filter((w) => w.id !== existing.id);
    expect(added).toHaveLength(2);
    expect(added[0].openCohortId).toBeTruthy();
    expect(added[1].openCohortId).toBe(added[0].openCohortId);
    expect(added.every((w) => w.eventId === EVT && !w.dateClosed)).toBe(true);
    const obs = getAll('paddockObservations');
    expect(obs).toHaveLength(2);
    expect(obs[0].forageHeightCm).toBe(obs[1].forageHeightCm);
    expect(obs[0].forageCoverPct).toBe(obs[1].forageCoverPct);
    expect(new Set(obs.map((o) => o.sourceId))).toEqual(new Set(added.map((w) => w.id)));
    expect(getAll('eventGroupWindows').some((w) => w.eventId === EVT)).toBe(false);
  });

  it('bulk close stamps the cohort only and writes one feed check', () => {
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    const north = PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: NORTH, dateOpened: '2026-05-01',
      areaPct: 100, openCohortId: COHORT,
    });
    const south = PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: SOUTH, dateOpened: '2026-05-01',
      timeOpened: '08:00', areaPct: 100, openCohortId: COHORT,
    });
    const creek = PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: CREEK, dateOpened: '2026-05-10', areaPct: 100,
    });
    for (const pw of [north, south, creek]) {
      add('eventPaddockWindows', pw,
        PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    }
    seedFeed(EVT, NORTH);

    openEventDetailSheet({ id: EVT }, OP, FARM);
    expect(document.body.textContent).toContain('Opened together · North, South');
    expect(document.querySelector(`[data-testid="detail-close-paddock-${creek.id}"]`)).toBeTruthy();
    document.querySelector(`[data-testid="detail-close-cohort-${COHORT}"]`).click();
    const closeDate = document.querySelector('[data-testid="submove-close-date"]').value;
    const residual = document.querySelector('#submove-close-sheet-panel [data-testid="obs-card-residual-height"]');
    residual.value = '3';
    document.querySelector('[data-testid="submove-close-save"]').click();
    expect(document.querySelector('[data-testid="submove-close-status"]')?.textContent || '').toBe('');

    expect(getById('eventPaddockWindows', north.id).dateClosed).toBe(closeDate);
    expect(getById('eventPaddockWindows', south.id).dateClosed).toBe(closeDate);
    const later = getById('eventPaddockWindows', creek.id);
    expect(later.dateClosed).toBeFalsy();
    expect(later.dateOpened).toBe('2026-05-10');
    const closes = getAll('paddockObservations').filter((o) => o.type === 'close');
    expect(closes).toHaveLength(2);
    expect(closes[0].residualHeightCm).toBe(closes[1].residualHeightCm);
    expect(closes[0].residualHeightCm).not.toBeNull();
    expect(getAll('eventFeedChecks')).toHaveLength(1);
    expect(getAll('eventFeedCheckItems')).toHaveLength(1);
  });

  it('move-wizard feed select defaults to the first paddock and Save writes that choice', () => {
    addLoc(BUSY, 'Source', { areaHectares: 3 });
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('eventPaddockWindows', PaddockWindowEntity.create({
      operationId: OP, eventId: EVT, locationId: BUSY, dateOpened: '2026-04-01', areaPct: 100,
    }), PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows');
    add('eventGroupWindows', GroupWindowEntity.create({
      operationId: OP, eventId: EVT, groupId: GROUP, dateJoined: '2026-04-01',
      headCount: 1, avgWeightKg: 250,
    }), GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
    seedFeed(EVT, BUSY);

    openMoveWizard({ id: EVT }, OP, FARM);
    document.querySelector('[data-testid="move-wizard-dest-new"]').click();
    document.querySelector('[data-testid="move-wizard-step-1-next"]').click();
    document.querySelector(`[data-testid="location-picker-item-${NORTH}"]`).click();
    document.querySelector(`[data-testid="location-picker-item-${SOUTH}"]`).click();
    document.querySelector('[data-testid="move-wizard-step-2-next"]').click();
    const sel = document.querySelector('[data-testid="move-wizard-feed-destination"]');
    expect(sel.value).toBe(NORTH);
    sel.value = SOUTH;
    sel.dispatchEvent(new Event('change'));
    document.querySelector('[data-testid="move-wizard-save"]').click();
    expect(document.querySelector('[data-testid="move-wizard-save-error-toast"]')).toBeNull();

    const moved = getAll('eventFeedEntries').filter((e) => e.eventId !== EVT);
    expect(moved).toHaveLength(1);
    expect(moved[0].locationId).toBe(SOUTH);
    const dest = getAll('events').find((e) => e.id !== EVT);
    const windows = getAll('eventPaddockWindows').filter((w) => w.eventId === dest.id);
    expect(windows).toHaveLength(2);
    expect(windows[0].openCohortId).toBe(windows[1].openCohortId);
  });
});
