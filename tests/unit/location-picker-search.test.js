/** @file Tests for the anchored search bar on renderLocationPicker (OI-0105). */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../src/data/store.js';
import { renderLocationPicker } from '../../src/features/events/index.js';
import * as LocationEntity from '../../src/entities/location.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';

function seedLoc(id, name, { type = 'land' } = {}) {
  add('locations', LocationEntity.create({ id, operationId: OP, farmId: FARM, name, type }),
    LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
  return { id, name, type, farmId: FARM, operationId: OP };
}

describe('renderLocationPicker search (OI-0105)', () => {
  let container;
  let locations;
  let selection;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    locations = [
      seedLoc('L1', 'North Pasture'),
      seedLoc('L2', 'South Pasture'),
      seedLoc('L3', 'East Paddock'),
      seedLoc('L4', 'Hay Barn', { type: 'confinement' }),
    ];
    selection = { locationId: null };
  });

  it('renders search input at the top', () => {
    renderLocationPicker(container, locations, selection);
    const search = container.querySelector('[data-testid="location-picker-search"]');
    expect(search).toBeTruthy();
    expect(search.placeholder.length).toBeGreaterThan(0);
  });

  it('typing filters locations across sections (case-insensitive substring)', () => {
    renderLocationPicker(container, locations, selection);
    const search = container.querySelector('[data-testid="location-picker-search"]');
    search.value = 'pasture';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector('[data-testid="location-picker-item-L1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="location-picker-item-L2"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="location-picker-item-L3"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="location-picker-item-L4"]')).toBeFalsy();
  });

  it('sections with zero matches after filter do not render their header', () => {
    renderLocationPicker(container, locations, selection);
    const search = container.querySelector('[data-testid="location-picker-search"]');
    search.value = 'barn'; // only matches the confinement row
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector('[data-testid="location-picker-section-confinement"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="location-picker-section-ready"]')).toBeFalsy();
  });

  it('clear button restores full list', () => {
    renderLocationPicker(container, locations, selection);
    let search = container.querySelector('[data-testid="location-picker-search"]');
    search.value = 'xyz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector('[data-testid="location-picker-empty"]')).toBeTruthy();
    const clearBtn = container.querySelector('[data-testid="location-picker-search-clear"]');
    clearBtn.click();
    // After clear, full list re-renders.
    expect(container.querySelector('[data-testid="location-picker-item-L1"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="location-picker-item-L4"]')).toBeTruthy();
    search = container.querySelector('[data-testid="location-picker-search"]');
    expect(search.value).toBe('');
  });

  it('empty-results message renders when no matches', () => {
    renderLocationPicker(container, locations, selection);
    const search = container.querySelector('[data-testid="location-picker-search"]');
    search.value = 'nope-no-match';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(container.querySelector('[data-testid="location-picker-empty"]')).toBeTruthy();
  });
});
