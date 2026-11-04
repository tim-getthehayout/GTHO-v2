/** @file Feed day goal banner uses farm-wide active animal DMI. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, update, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as EventEntity from '../../../../src/entities/event.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';
import * as BatchEntity from '../../../../src/entities/batch.js';
import * as FeedEntryEntity from '../../../../src/entities/event-feed-entry.js';
import * as AnimalClassEntity from '../../../../src/entities/animal-class.js';
import * as AnimalEntity from '../../../../src/entities/animal.js';
import * as WeightEntity from '../../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EVT = '00000000-0000-0000-0000-0000000000e1';
const LOC = '00000000-0000-0000-0000-0000000001a1';
const FT = '00000000-0000-0000-0000-0000000000f1';
const BATCH = '00000000-0000-0000-0000-0000000000b1';
const BATCH_TYPE_DM = '00000000-0000-0000-0000-0000000000b2';
const ARCHIVED = '00000000-0000-0000-0000-0000000000b3';
const CLS_COW = '00000000-0000-0000-0000-0000000000c1';
const CLS_HEIFER = '00000000-0000-0000-0000-0000000000c2';
const COW = '00000000-0000-0000-0000-0000000000a1';
const HEIFER = '00000000-0000-0000-0000-0000000000a2';
const CULLED = '00000000-0000-0000-0000-0000000000a3';
const UNCLASSED = '00000000-0000-0000-0000-0000000000a4';

function utcDay(offset) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + offset);
  return base.toISOString().slice(0, 10);
}

function addOp() {
  add('operations', OperationEntity.create({ id: OP, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Test Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
}

function addInventory() {
  add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
    EventEntity.validate, EventEntity.toSupabaseShape, 'events');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'North', type: 'land',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('feedTypes', FeedTypeEntity.create({
    id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'kg', dmPct: 80,
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('batches', BatchEntity.create({
    id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay Batch',
    unit: 'kg', quantity: 200, remaining: 200, dmPct: 50,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('batches', BatchEntity.create({
    id: BATCH_TYPE_DM, operationId: OP, feedTypeId: FT, name: 'Type DM',
    unit: 'kg', quantity: 50, remaining: 50,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('batches', BatchEntity.create({
    id: ARCHIVED, operationId: OP, feedTypeId: FT, name: 'Old',
    unit: 'kg', quantity: 500, remaining: 500, dmPct: 100, archived: true,
  }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
  add('eventFeedEntries', FeedEntryEntity.create({
    operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
    date: utcDay(0), quantity: 10000,
  }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
}

function addClass(id, overrides) {
  add('animalClasses', AnimalClassEntity.create({
    id, operationId: OP, name: id, species: 'beef_cattle', role: 'cow', ...overrides,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
}

function addAnimal(id, overrides) {
  add('animals', AnimalEntity.create({
    id, operationId: OP, sex: 'female', active: true, ...overrides,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function addWeight(animalId, weightKg, dayOffset) {
  add('animalWeightRecords', WeightEntity.create({
    operationId: OP,
    animalId,
    weightKg,
    recordedAt: `${utcDay(dayOffset)}T12:00:00.000Z`,
    source: 'manual',
  }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
}

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  return container;
}

function cell(id) {
  return document.querySelector(`[data-testid="${id}"]`).textContent;
}

async function flush() {
  await Promise.resolve();
}

describe('feed day goal DMI denominator', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
  });

  it('divides DM on hand by DMI of every active animal, including those not on an event', () => {
    addOp();
    addInventory();
    addClass(CLS_COW, { dmiPct: 2.5, dmiPctLactating: 4, defaultWeightKg: 300 });
    addClass(CLS_HEIFER, { defaultWeightKg: 200 });
    addAnimal(COW, { classId: CLS_COW });
    addAnimal(HEIFER, { classId: CLS_HEIFER });
    addAnimal(CULLED, { classId: CLS_COW, active: false });
    addAnimal(UNCLASSED, { classId: null });
    addWeight(COW, 100, -30);
    addWeight(COW, 400, -1);
    addWeight(COW, 800, 1);
    addWeight(CULLED, 1000, -1);

    mount();

    // 200 kg × 50% + 50 kg × 80% (type fallback) = 140 kg. Archived 500 excluded.
    // Cow 400 kg × 2.5% = 10 (future 800 and older 100 ignored; lactating 4% ignored).
    // Heifer class default 200 kg × 2.5% = 5. Culled excluded. Unclassed weight 0.
    // 140 / 15 = 9.333 → 9. No group window, so the cow is not on an open event.
    expect(cell('feed-dm-on-hand')).toContain('140 kg');
    expect(cell('feed-run-rate')).toContain('15 kg/day');
    expect(cell('feed-run-rate')).toContain('Daily Run Rate');
    expect(cell('feed-days-on-hand')).toContain('9');
    expect(document.querySelector('[data-testid="feed-day-goal-banner"]').textContent)
      .toContain('9 / 90 days');
    const fill = document.querySelector('[data-testid="feed-day-goal-banner"] .progress-fill');
    expect(fill.className).toContain('progress-red');
    expect(fill.style.width).toBe('10%');
  });

  it('shows an em dash when no active animal has a DMI', () => {
    addOp();
    addInventory();
    addClass(CLS_COW, { dmiPct: 2.5, defaultWeightKg: 500 });
    addAnimal(CULLED, { classId: CLS_COW, active: false });
    addWeight(CULLED, 1000, -1);

    mount();

    expect(cell('feed-run-rate')).toContain('—');
    expect(cell('feed-days-on-hand')).toContain('—');
    expect(document.querySelector('[data-testid="feed-day-goal-banner"]').textContent)
      .toContain('— / 90 days');
  });

  it('refreshes when weight, class DMI, or active status changes', async () => {
    addOp();
    add('feedTypes', FeedTypeEntity.create({
      id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'kg', dmPct: 100,
    }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    add('batches', BatchEntity.create({
      id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay',
      unit: 'kg', quantity: 100, remaining: 100, dmPct: 100,
    }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    addClass(CLS_COW, { dmiPct: 2.5, defaultWeightKg: 100 });
    addAnimal(COW, { classId: CLS_COW });
    addWeight(COW, 400, -2);
    mount();

    expect(cell('feed-days-on-hand')).toContain('10');
    expect(cell('feed-run-rate')).toContain('10 kg/day');

    addWeight(COW, 800, 0);
    await flush();
    expect(cell('feed-days-on-hand')).toContain('5');
    expect(cell('feed-run-rate')).toContain('20 kg/day');

    update('animalClasses', CLS_COW, { dmiPct: 5 },
      AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
    await flush();
    expect(cell('feed-days-on-hand')).toContain('3');
    expect(cell('feed-run-rate')).toContain('40 kg/day');

    update('animals', COW, { active: false },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    await flush();
    expect(cell('feed-days-on-hand')).toContain('—');
    expect(cell('feed-run-rate')).toContain('—');
  });

  it('refreshes on inventory changes and ignores deliveries in the denominator', async () => {
    addOp();
    add('events', EventEntity.create({ id: EVT, operationId: OP, farmId: FARM }),
      EventEntity.validate, EventEntity.toSupabaseShape, 'events');
    add('locations', LocationEntity.create({
      id: LOC, operationId: OP, farmId: FARM, name: 'North', type: 'land',
    }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
    add('feedTypes', FeedTypeEntity.create({
      id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'kg',
    }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
    add('batches', BatchEntity.create({
      id: BATCH, operationId: OP, feedTypeId: FT, name: 'Hay',
      unit: 'kg', quantity: 100, remaining: 100, dmPct: 100,
    }), BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    addClass(CLS_COW, { dmiPct: 2.5 });
    addAnimal(COW, { classId: CLS_COW });
    addWeight(COW, 400, -1);
    mount();

    expect(cell('feed-days-on-hand')).toContain('10');

    update('batches', BATCH, { remaining: 50 },
      BatchEntity.validate, BatchEntity.toSupabaseShape, 'batches');
    await flush();
    expect(cell('feed-dm-on-hand')).toContain('50 kg');
    expect(cell('feed-days-on-hand')).toContain('5');

    add('eventFeedEntries', FeedEntryEntity.create({
      operationId: OP, eventId: EVT, batchId: BATCH, locationId: LOC,
      date: utcDay(0), quantity: 10000,
    }), FeedEntryEntity.validate, FeedEntryEntity.toSupabaseShape, 'event_feed_entries');
    await flush();
    expect(cell('feed-days-on-hand')).toContain('5');
    expect(cell('feed-run-rate')).toContain('10 kg/day');
  });
});
