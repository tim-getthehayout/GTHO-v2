/** @file Batch location picker lists storage and pasture separately. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../../../src/data/store.js';
import { renderFeedScreen } from '../../../../src/features/feed/index.js';
import { renderLocationPicker } from '../../../../src/features/events/index.js';
import { setLocale } from '../../../../src/i18n/i18n.js';
import en from '../../../../src/i18n/locales/en.json';
import * as OperationEntity from '../../../../src/entities/operation.js';
import * as FarmEntity from '../../../../src/entities/farm.js';
import * as LocationEntity from '../../../../src/entities/location.js';
import * as FeedTypeEntity from '../../../../src/entities/feed-type.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const SILO = '00000000-0000-0000-0000-0000000000c1';
const OLD = '00000000-0000-0000-0000-0000000000c2';
const PASTURE = '00000000-0000-0000-0000-0000000000c3';
const MIXED = '00000000-0000-0000-0000-0000000000c4';
const PEN = '00000000-0000-0000-0000-0000000000c5';
const FT = '00000000-0000-0000-0000-0000000000f1';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('feedTypes', FeedTypeEntity.create({
    id: FT, operationId: OP, name: 'Hay', category: 'forage', unit: 'bale',
  }), FeedTypeEntity.validate, FeedTypeEntity.toSupabaseShape, 'feed_types');
  add('locations', LocationEntity.create({
    id: SILO, operationId: OP, farmId: FARM, name: 'Silo', type: 'storage',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: OLD, operationId: OP, farmId: FARM, name: 'Old shed', type: 'storage', archived: true,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: PASTURE, operationId: OP, farmId: FARM, name: 'North', type: 'land', landUse: 'pasture',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: MIXED, operationId: OP, farmId: FARM, name: 'Creek', type: 'land', landUse: 'mixed_use',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  add('locations', LocationEntity.create({
    id: PEN, operationId: OP, farmId: FARM, name: 'Pen', type: 'confinement',
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

function openBatchSheet() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  renderFeedScreen(container);
  document.querySelector('[data-testid="feed-add-batch-btn"]').click();
}

describe('feed batch storage picker', () => {
  beforeEach(() => {
    setLocale('en', en);
    _reset();
    document.body.replaceChildren();
    setSyncAdapter(null);
    seed();
  });

  it('opens on storage and does not mix pasture or confinement', () => {
    openBatchSheet();
    const storage = document.querySelector('[data-testid="batch-location-mode-storage"]');
    const pasture = document.querySelector('[data-testid="batch-location-mode-pasture"]');
    expect(storage.dataset.active).toBe('true');
    expect(pasture.dataset.active).toBe('false');
    expect(document.querySelector('[data-testid="batch-add-storage"]')).not.toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${SILO}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${OLD}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${PASTURE}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${MIXED}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${PEN}"]`)).toBeNull();

    pasture.click();
    expect(document.querySelector('[data-testid="batch-location-mode-pasture"]').dataset.active).toBe('true');
    expect(document.querySelector('[data-testid="batch-add-storage"]')).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${PASTURE}"]`)).not.toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${SILO}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${PEN}"]`)).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${MIXED}"]`)).toBeNull();
  });

  it('adds a storage location by name and selects it', () => {
    openBatchSheet();
    document.querySelector('[data-testid="batch-storage-name"]').value = 'Shop';
    document.querySelector('[data-testid="batch-storage-save"]').click();

    const created = getAll('locations').find(loc => loc.name === 'Shop');
    expect(created.type).toBe('storage');
    expect(created.farmId).toBe(FARM);
    expect(created.geojson).toBeNull();
    expect(created.landUse).toBeNull();
    const item = document.querySelector(`[data-testid="batch-location-item-${created.id}"]`);
    expect(item).not.toBeNull();
    expect(item.dataset.selected).toBe('true');
    expect(document.querySelector('[data-testid="batch-location-mode-pasture"]').dataset.active).toBe('false');

    document.querySelector('[data-testid="batch-location-mode-pasture"]').click();
    expect(document.querySelector('[data-testid="batch-add-storage"]')).toBeNull();
    expect(document.querySelector(`[data-testid="batch-location-item-${created.id}"]`)).toBeNull();
    expect(getById('locations', created.id).type).toBe('storage');
  });

  it('keeps storage locations out of the animal-move picker', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderLocationPicker(container, getAll('locations'), { locationId: null }, {});
    expect(container.querySelector(`[data-testid="location-picker-item-${SILO}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="location-picker-item-${PASTURE}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-testid="location-picker-item-${PEN}"]`)).not.toBeNull();
  });
});
