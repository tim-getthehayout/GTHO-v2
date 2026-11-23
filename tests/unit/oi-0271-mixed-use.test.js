/**
 * @file OI-0271: the canonical stored land-use value is 'mixed_use' (entity
 * VALID_LAND_USES + DB CHECK). Form, filters, X1 metrics, List pills and
 * Harvest used 'mixed-use', so a Mixed-use save failed validation, an existing
 * mixed_use location did not preselect, and mixed_use land was dropped from
 * Rotation / List metrics and Harvest. Display labels are unchanged.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';

vi.mock('../../src/features/auth/session.js', () => ({
  getUser: vi.fn(() => ({ id: '00000000-0000-0000-0000-00000000u271' })),
}));

import { openLocationSheet, renderLocationsScreen } from '../../src/features/locations/index.js';
import { openHarvestSheet } from '../../src/features/harvest/index.js';
import { isManagementLocation, filterManagementLocations } from '../../src/features/events/rotation-calendar/location-metrics.js';
import { matchesLegacyTypeFilter } from '../../src/features/events/rotation-calendar/calendar-grid.js';

const OP = '00000000-0000-0000-0000-00000000a271';
const FARM = '00000000-0000-0000-0000-00000000b271';
const LOC_PAST = '00000000-0000-0000-0000-00000000c271';
const LOC_MIX = '00000000-0000-0000-0000-00000000c272';
const LOC_CROP = '00000000-0000-0000-0000-00000000c273';

beforeAll(() => setLocale('en', enLocale));

function addLoc(id, name, landUse) {
  add('locations', LocationEntity.create({
    id, operationId: OP, farmId: FARM, name, type: 'land', landUse, areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  vi.stubGlobal('confirm', () => true);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  addLoc(LOC_PAST, 'North', 'pasture');
  addLoc(LOC_MIX, 'Creek', 'mixed_use');
  addLoc(LOC_CROP, 'Corn', 'crop');
});

const landUseSelect = () => [...document.querySelectorAll('#loc-edit-panel select')]
  .find(s => [...s.options].some(o => o.value === 'confinement'));
const button = (label) => [...document.querySelectorAll('#loc-edit-panel button')].find(b => b.textContent === label);

describe('OI-0271 canonical mixed_use', () => {
  it('the entity accepts mixed_use and rejects mixed-use (the canonical value)', () => {
    const base = { operationId: OP, farmId: FARM, name: 'X', type: 'land' };
    expect(LocationEntity.validate(LocationEntity.create({ ...base, landUse: 'mixed_use' })).valid).toBe(true);
    expect(LocationEntity.validate(LocationEntity.create({ ...base, landUse: 'mixed-use' })).valid).toBe(false);
  });

  it('X1: a mixed_use location is a Rotation / List management location', () => {
    expect(isManagementLocation(getById('locations', LOC_MIX))).toBe(true);
    expect(filterManagementLocations(getAll('locations')).map(l => l.id).sort()).toEqual([LOC_PAST, LOC_MIX].sort());
  });

  it('List type pill value mixed_use matches a mixed_use location', () => {
    expect(matchesLegacyTypeFilter(getById('locations', LOC_MIX), 'mixed_use')).toBe(true);
    expect(matchesLegacyTypeFilter(getById('locations', LOC_PAST), 'mixed_use')).toBe(false);
  });

  it('location form: Mixed-use option is mixed_use and preselects an existing mixed_use location', () => {
    openLocationSheet(getById('locations', LOC_MIX), OP, FARM);
    const sel = landUseSelect();
    const opt = [...sel.options].find(o => o.textContent === 'Mixed-use');
    expect(opt.value).toBe('mixed_use');
    expect(sel.value).toBe('mixed_use');
    expect([...sel.options].some(o => o.value === 'mixed-use')).toBe(false);
  });

  it('location form: saving Mixed-use on a new location stores mixed_use (passes validation)', () => {
    openLocationSheet(null, OP, FARM);
    document.querySelector('#loc-edit-panel input[placeholder="North paddock"]').value = 'River flat';
    landUseSelect().value = 'mixed_use';
    landUseSelect().dispatchEvent(new Event('change'));
    button('Add location').click();
    const created = getAll('locations').find(l => l.name === 'River flat');
    expect(created).toBeTruthy();
    expect(created.landUse).toBe('mixed_use');
    expect(LocationEntity.toSupabaseShape(created).land_use).toBe('mixed_use');
  });

  it('legacy Locations screen Mixed-Use pill shows the mixed_use location', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderLocationsScreen(container);
    const pill = [...container.querySelectorAll('button')].find(b => b.textContent === 'Mixed-Use');
    expect(pill).toBeTruthy();
    pill.click();
    expect(container.textContent).toContain('Creek');
    expect(container.textContent).not.toContain('North');
  });

  it('Harvest field picker lists mixed_use land with crop land', () => {
    openHarvestSheet(OP, { fieldMode: true });
    const panel = document.getElementById('harvest-sheet-panel');
    expect(panel.textContent).toContain('Creek');
    expect(panel.textContent).toContain('Corn');
    expect(panel.textContent).not.toContain('No crop or mixed-use fields');
    const pill = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Mixed-Use');
    pill.click();
    const panel2 = document.getElementById('harvest-sheet-panel');
    expect(panel2.textContent).toContain('Creek');
    expect(panel2.textContent).not.toContain('Corn');
  });

  it('no feature code compares or writes the non-canonical mixed-use value', () => {
    for (const f of [
      'src/features/locations/index.js',
      'src/features/harvest/index.js',
      'src/features/events/rotation-calendar/location-metrics.js',
      'src/features/events/rotation-calendar/calendar-grid.js',
    ]) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/['"]mixed-use['"]/);
    }
  });
});

describe('OI-0271 visible land-use label (never the raw stored value)', () => {
  it('maps stored values to the form option labels', async () => {
    const { LAND_USE_LABELS, landUseLabel } = await import('../../src/features/locations/land-use-label.js');
    expect(landUseLabel('mixed_use')).toBe('Mixed-use');
    expect(landUseLabel('pasture')).toBe('Pasture');
    expect(landUseLabel('crop')).toBe('Crop');
    expect(landUseLabel(null)).toBe('Pasture');
    expect(landUseLabel('something_else')).toBe('\u2014');
    expect(Object.keys(LAND_USE_LABELS)).toEqual(['pasture', 'mixed_use', 'crop']);
  });

  it('location form options use the same labels', () => {
    openLocationSheet(null, OP, FARM);
    const sel = landUseSelect();
    const byValue = Object.fromEntries([...sel.options].map(o => [o.value, o.textContent]));
    expect(byValue.pasture).toBe('Pasture');
    expect(byValue.mixed_use).toBe('Mixed-use');
    expect(byValue.crop).toBe('Crop');
  });

  it('Locations card badge shows Mixed-use / Pasture / Crop, not mixed_use', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderLocationsScreen(container);
    // The legacy screen keeps its filter in module state; reset to All.
    [...container.querySelectorAll('button')].find(b => b.textContent === 'All').click();
    const badges = [...container.querySelectorAll('.badge')].map(b => b.textContent);
    expect(badges).toContain('Mixed-use');
    expect(badges).toContain('Pasture');
    expect(badges).toContain('Crop');
    expect(container.textContent).not.toContain('mixed_use');
  });

  it('Harvest field picker subline shows Mixed-use, not mixed_use', () => {
    openHarvestSheet(OP, { fieldMode: true });
    const panel = document.getElementById('harvest-sheet-panel');
    expect(panel.textContent).toContain('Mixed-use');
    expect(panel.textContent).not.toContain('mixed_use');
    expect(panel.textContent).toMatch(/Crop · Farm/);
  });
});
