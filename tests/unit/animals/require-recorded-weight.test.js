/** @file OI-0249 Ca+Ce+Cb+Cw — require a recorded weight on add and Edit Animal save. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, getAll } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../../src/utils/preferences.js';
import { openAnimalSheet } from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as AnimalClassEntity from '../../../src/entities/animal-class.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const CLASS = '00000000-0000-0000-0000-0000000000c1';
const ANIMAL = '00000000-0000-0000-0000-0000000000a1';

function seed({ withClassDefault = false } = {}) {
  _reset();
  document.body.innerHTML = '';
  setLocale('en', en);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  setUnitSystem('metric');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('animalClasses', AnimalClassEntity.create({
    id: CLASS, operationId: OP, name: 'Heifers', species: 'beef_cattle', role: 'heifer',
    defaultWeightKg: withClassDefault ? 400 : null,
  }), AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
}

function clickSave(panel) {
  const btn = [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save');
  btn.click();
}

function statusText(panel) {
  return panel.querySelector('.auth-error')?.textContent || '';
}

describe('OI-0249 require recorded weight (Ca+Ce+Cb+Cw)', () => {
  afterEach(() => vi.restoreAllMocks());

  beforeEach(() => {
    seed();
  });

  it('blocks Add animal when no weight is entered and no class default exists (Ca+Cb)', async () => {
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const tag = panel.querySelector('input[placeholder="T-001"]');
    tag.value = 'T-10';
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(statusText(panel)).toBe('A recorded weight is required.');
    expect(getAll('animals')).toHaveLength(0);
    expect(getAll('animalWeightRecords')).toHaveLength(0);
  });

  it('creates the animal and writes a weight record when Add includes a recorded weight (Ca+Cw)', async () => {
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('input[placeholder="T-001"]').value = 'T-11';
    const weight = panel.querySelector('[data-testid="animal-recorded-weight"]');
    expect(weight).toBeTruthy();
    weight.value = '425';
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));

    const animals = getAll('animals');
    expect(animals).toHaveLength(1);
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === animals[0].id);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBe(425);
    expect(weights[0].source).toBe('manual');
  });

  it('offers the class default on Add and writes a record only after confirm (Cb+Cw)', async () => {
    seed({ withClassDefault: true });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('input[placeholder="T-001"]').value = 'T-12';
    panel.querySelector('select').value = ''; // first select is sex; class is the second
    const classSelect = [...panel.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === CLASS),
    );
    classSelect.value = CLASS;
    classSelect.dispatchEvent(new Event('change', { bubbles: true }));
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toMatch(/class default/i);
    const animals = getAll('animals');
    expect(animals).toHaveLength(1);
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === animals[0].id);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBe(400);
  });

  it('does not write a class default when the confirm is cancelled', async () => {
    seed({ withClassDefault: true });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('input[placeholder="T-001"]').value = 'T-13';
    const classSelect = [...panel.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === CLASS),
    );
    classSelect.value = CLASS;
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(statusText(panel)).toBe('A recorded weight is required.');
    expect(getAll('animals')).toHaveLength(0);
    expect(getAll('animalWeightRecords')).toHaveLength(0);
  });

  it('blocks Edit Animal save when no recorded weight is on file (Ce+Cb)', async () => {
    add('animals', AnimalEntity.create({
      id: ANIMAL, operationId: OP, sex: 'female', tagNum: 'H-01', classId: CLASS,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    openAnimalSheet(getAll('animals')[0], OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    expect(panel.querySelector('[data-testid="animal-recorded-weight"]')).toBeTruthy();
    expect(panel.querySelector('[data-testid="edit-animal-missing-weight"]')).toBeTruthy();
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(statusText(panel)).toBe('A recorded weight is required.');
    expect(getAll('animalWeightRecords')).toHaveLength(0);
    expect(document.getElementById('ae-sheet-panel')).toBeTruthy();
  });

  it('allows Edit Animal save without a new entry when a record is already on file (Ce)', async () => {
    add('animals', AnimalEntity.create({
      id: ANIMAL, operationId: OP, sex: 'female', tagNum: 'H-01',
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalWeightRecords', WeightEntity.create({
      operationId: OP, animalId: ANIMAL, recordedAt: '2026-02-01T12:00:00.000Z',
      weightKg: 350, source: 'manual',
    }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');

    openAnimalSheet(getAll('animals')[0], OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    expect(panel.querySelector('[data-testid="animal-recorded-weight"]')).toBeNull();
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(statusText(panel)).toBe('');
    expect(getAll('animalWeightRecords')).toHaveLength(1);
  });

  it('blocks Add composite when per-head weight is missing (Ca+Cb)', async () => {
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="animal-kind-composite"]').click();
    panel.querySelector('[data-testid="animal-composite-name"]').value = 'Ewes';
    panel.querySelector('[data-testid="animal-composite-head-count"]').value = '10';
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(statusText(panel)).toBe('A recorded weight is required.');
    expect(getAll('animals')).toHaveLength(0);
  });

  it('writes class default × head count for a new composite after confirm (Cb+Cw)', async () => {
    seed({ withClassDefault: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="animal-kind-composite"]').click();
    panel.querySelector('[data-testid="animal-composite-name"]').value = 'Ewes';
    panel.querySelector('[data-testid="animal-composite-head-count"]').value = '10';
    const classSelect = [...panel.querySelectorAll('select')].find(s =>
      [...s.options].some(o => o.value === CLASS),
    );
    classSelect.value = CLASS;
    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    const animal = getAll('animals').find(a => a.name === 'Ewes');
    expect(animal).toBeTruthy();
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === animal.id);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBe(4000);
  });
});
