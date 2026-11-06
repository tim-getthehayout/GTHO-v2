/** @file Animals list shows the latest recordedAt weight, not the first row. */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add } from '../../../src/data/store.js';
import { setLocale } from '../../../src/i18n/i18n.js';
import en from '../../../src/i18n/locales/en.json';
import { setUnitSystem } from '../../../src/utils/preferences.js';
import { convert } from '../../../src/utils/units.js';
import { renderAnimalsScreen } from '../../../src/features/animals/index.js';
import * as OperationEntity from '../../../src/entities/operation.js';
import * as FarmEntity from '../../../src/entities/farm.js';
import * as AnimalEntity from '../../../src/entities/animal.js';
import * as WeightEntity from '../../../src/entities/animal-weight-record.js';

const OP = '00000000-0000-0000-0000-0000000000aa';
const FARM = '00000000-0000-0000-0000-0000000000bb';
const EWE = '39452944-4727-4965-8d63-f103fc671e6b';

function kg(lb) {
  return convert(lb, 'weight', 'toMetric');
}

function seedShell() {
  _reset();
  document.body.innerHTML = '';
  setLocale('en', en);
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  setUnitSystem('imperial');
  add('animals', AnimalEntity.create({
    id: EWE, operationId: OP, name: 'Ewes', sex: 'female', isBulk: true, bulkHeadCount: 70,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function addWeight(lb, recordedAt) {
  add('animalWeightRecords', WeightEntity.create({
    operationId: OP, animalId: EWE, recordedAt, weightKg: kg(lb), source: 'manual',
  }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
}

function listText() {
  const root = document.createElement('div');
  document.body.appendChild(root);
  renderAnimalsScreen(root);
  return document.querySelector(`[data-testid="animal-row-${EWE}"]`).textContent;
}

describe('Animals list latest composite weight', () => {
  beforeEach(seedShell);

  it('shows the newer 8750 lb lot total, not the first 125 lb row, and prints lbs once', () => {
    addWeight(125, '2026-11-06T12:24:04.302Z');
    addWeight(8750, '2026-11-06T13:28:04.942Z');
    const text = listText();
    expect(text).toContain('8750 lbs');
    expect(text).not.toContain('125 lbs');
    expect(text).not.toContain('lbs lbs');
  });

  it('does not keep the first stored row when every date field is empty', () => {
    addWeight(8750, '2026-11-06T13:28:04.942Z');
    addWeight(125, '2026-11-06T12:24:04.302Z');
    const text = listText();
    expect(text).toContain('8750 lbs');
    expect(text).not.toContain('125 lbs');
  });
});
