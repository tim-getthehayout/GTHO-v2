/** @file Composite weight is per head. The stored record is the lot total. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../../src/utils/preferences.js';
import { convert } from '../../../src/utils/units.js';
import { openAnimalSheet } from '../../../src/features/animals/index.js';
import { openWeightSheet } from '../../../src/features/health/weight.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EWE = '39452944-4727-4965-8d63-f103fc671e6b';

function kgForLb(lb) {
  return convert(lb, 'weight', 'toMetric');
}

function seed() {
  _reset();
  document.body.innerHTML = '';
  setLocale('en', en);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  setUnitSystem('imperial');
}

function clickSave(panel) {
  const btn = [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save');
  btn.click();
}

describe('composite per-head weight', () => {
  beforeEach(seed);

  it('create stores 70 head × 125 lb as the lot total and shows that total', async () => {
    openAnimalSheet(null, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="animal-kind-composite"]').click();
    panel.querySelector('[data-testid="animal-composite-name"]').value = 'Ewes';
    panel.querySelector('[data-testid="animal-composite-head-count"]').value = '70';
    const perHead = panel.querySelector('[data-testid="animal-composite-per-head-weight"]');
    perHead.value = '125';
    perHead.dispatchEvent(new Event('input'));

    const total = panel.querySelector('[data-testid="animal-composite-lot-total"]').textContent;
    expect(total).toBe('8750 lbs');
    expect(total).not.toContain('lbs lbs');

    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));

    const animal = getAll('animals').find(a => a.name === 'Ewes');
    expect(animal.bulkHeadCount).toBe(70);
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === animal.id);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBeCloseTo(kgForLb(8750), 4);
    expect(weights[0].weightKg).not.toBeCloseTo(kgForLb(125), 1);
  });

  it('edit prefills per head, and Save writes the new lot total before the sheet closes', async () => {
    add('animals', AnimalEntity.create({
      id: EWE, operationId: OP, name: 'Ewes', sex: 'female', isBulk: true, bulkHeadCount: 70,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalWeightRecords', WeightEntity.create({
      operationId: OP, animalId: EWE, recordedAt: '2026-11-06T12:24:04.302Z',
      weightKg: kgForLb(125), source: 'manual',
    }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');

    openAnimalSheet(getAll('animals').find(a => a.id === EWE), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const perHead = panel.querySelector('[data-testid="animal-composite-per-head-weight"]');
    expect(Number(perHead.value)).toBeCloseTo(125 / 70, 2);
    expect(panel.textContent).not.toContain('lbs lbs');

    perHead.value = '125';
    perHead.dispatchEvent(new Event('input'));
    expect(panel.querySelector('[data-testid="animal-composite-lot-total"]').textContent).toBe('8750 lbs');

    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));

    const weights = getAll('animalWeightRecords').filter(w => w.animalId === EWE);
    expect(weights).toHaveLength(2);
    const newest = weights.slice().sort((a, b) => (b.recordedAt || '').localeCompare(a.recordedAt || ''))[0];
    expect(newest.weightKg).toBeCloseTo(kgForLb(8750), 4);
    expect(newest.weightKg).not.toBeCloseTo(kgForLb(8750 * 70), 0);
  });

  it('does not multiply again when the stored lot total is already head × per head', async () => {
    add('animals', AnimalEntity.create({
      id: EWE, operationId: OP, name: 'Ewes', sex: 'female', isBulk: true, bulkHeadCount: 70,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalWeightRecords', WeightEntity.create({
      operationId: OP, animalId: EWE, recordedAt: '2026-11-06T13:00:00.000Z',
      weightKg: kgForLb(8750), source: 'manual',
    }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');

    openAnimalSheet(getAll('animals').find(a => a.id === EWE), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const perHead = panel.querySelector('[data-testid="animal-composite-per-head-weight"]');
    expect(Number(perHead.value)).toBeCloseTo(125, 2);
    expect(panel.querySelector('[data-testid="animal-composite-lot-total"]').textContent).toBe('8750 lbs');

    clickSave(panel);
    await new Promise(r => setTimeout(r, 0));
    expect(getAll('animalWeightRecords').filter(w => w.animalId === EWE)).toHaveLength(1);
  });

  it('the Weight button stores head × the per-head entry', () => {
    add('animals', AnimalEntity.create({
      id: EWE, operationId: OP, name: 'Ewes', sex: 'female', isBulk: true, bulkHeadCount: 70,
    }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    const animal = getAll('animals').find(a => a.id === EWE);
    openWeightSheet(animal, OP);
    const input = document.querySelector('[data-testid="weight-sheet-input"]');
    input.value = '125';
    input.dispatchEvent(new Event('input'));
    expect(document.querySelector('[data-testid="weight-sheet-lot-total"]').textContent).toBe('8750 lbs');
    expect(document.querySelector('#weight-sheet-panel').textContent).not.toContain('lbs lbs');
    [...document.querySelectorAll('#weight-sheet-panel button')].find(b => b.textContent.trim() === 'Save weight').click();
    const weights = getAll('animalWeightRecords').filter(w => w.animalId === EWE);
    expect(weights).toHaveLength(1);
    expect(weights[0].weightKg).toBeCloseTo(kgForLb(8750), 4);
  });
});
