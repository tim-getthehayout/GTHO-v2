/**
 * @file The Locations screen reads and writes a location's area through the
 * entity field `areaHectares`. It used to read `loc.areaHa`, which Location
 * entities never have, and saved `areaHa`, which `LocationEntity.create` and
 * `toSupabaseShape` drop. So the card, the edit sheet and acres sorting showed
 * no area, and an area typed into the sheet was lost on save.
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as LocationEntity from '../../src/entities/location.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import '../../src/calcs/core.js';
import '../../src/calcs/feed-forage.js';
import { openLocationSheet, renderLocationsScreen } from '../../src/features/locations/index.js';

const OP = '00000000-0000-0000-0000-00000000a0a1';
const FARM = '00000000-0000-0000-0000-00000000b0b1';
const LOC = '00000000-0000-0000-0000-00000000c0c1';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  vi.stubGlobal('confirm', () => true);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('locations', LocationEntity.create({
    id: LOC, operationId: OP, farmId: FARM, name: 'North',
    type: 'land', landUse: 'pasture', areaHectares: 1.0,
  }), LocationEntity.validate, LocationEntity.toSupabaseShape, 'locations');
});

const areaInput = () => document.querySelector('#loc-edit-panel input[placeholder="20"]');
const nameInput = () => document.querySelector('#loc-edit-panel input[placeholder="North paddock"]');
const button = (label) => [...document.querySelectorAll('#loc-edit-panel button')].find(b => b.textContent === label);

describe('Locations screen area uses areaHectares', () => {
  it('shows the stored area in acres on the location card', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    renderLocationsScreen(container);
    expect(container.textContent).toContain('2.47 ac');
  });

  it('prefills the edit sheet and saves a changed area as areaHectares', () => {
    openLocationSheet(getById('locations', LOC), OP, FARM);
    expect(areaInput().value).toBe('2.47');
    areaInput().value = '10';
    button('Save changes').click();
    const saved = getById('locations', LOC);
    expect(saved.areaHectares).toBeCloseTo(4.0469, 3);
    expect(saved).not.toHaveProperty('areaHa');
    expect(LocationEntity.toSupabaseShape(saved).area_hectares).toBeCloseTo(4.0469, 3);
  });

  it('saves the area of a new location as areaHectares', () => {
    openLocationSheet(null, OP, FARM);
    nameInput().value = 'South';
    areaInput().value = '5';
    button('Add location').click();
    const created = getAll('locations').find(l => l.name === 'South');
    expect(created.areaHectares).toBeCloseTo(2.0234, 3);
    expect(LocationEntity.toSupabaseShape(created).area_hectares).toBeCloseTo(2.0234, 3);
  });
});

function featureFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? featureFiles(path) : (path.endsWith('.js') ? [path] : []);
  });
}

describe('feature code reads location area through areaHectares', () => {
  it('has no direct .areaHa read without the areaHectares fallback', () => {
    const offenders = [];
    for (const file of featureFiles('src/features')) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, '');
        const reads = code.match(/[\w$]+\??\.areaHa\b/g) || [];
        const guarded = code.match(/areaHectares \?\? [\w$]+\??\.areaHa\b/g) || [];
        if (reads.length > guarded.length) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
