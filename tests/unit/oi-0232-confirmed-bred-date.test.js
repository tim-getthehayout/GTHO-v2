/**
 * @file OI-0232 (#387, Tim-locked Nov 18) — confirmed-bred date on Edit Animal.
 * Form-to-record on the real controls (openAnimalSheet → Save → store + push).
 * The date shows only while "Confirmed bred" is ticked; a fresh tick prefills
 * today; back-dating is allowed; no future date and none before birth; untick
 * clears to null; a legacy tick with no date shows empty and saves null
 * (DB check: confirmed_bred OR confirmed_bred_date IS NULL).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getById, setSyncAdapter } from '../../src/data/store.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openAnimalSheet } from '../../src/features/animals/index.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as WeightEntity from '../../src/entities/animal-weight-record.js';
import { getLocalTodayStr } from '../../src/utils/date-utils.js';

const OP_ID = '00000000-0000-0000-0000-0000000002aa';
const FARM_ID = '00000000-0000-0000-0000-0000000002bb';
const COW_ID = '00000000-0000-0000-0000-0000000002c1';

let writes;

function seed(animal = {}) {
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM_ID, operationId: OP_ID, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('animals', AnimalEntity.create({
    id: COW_ID, operationId: OP_ID, sex: 'female', tagNum: 'C-1', birthDate: '2024-03-10', ...animal,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animalWeightRecords', WeightEntity.create({
    operationId: OP_ID, animalId: COW_ID, recordedAt: '2026-03-01T12:00:00.000Z', weightKg: 500, source: 'manual',
  }), WeightEntity.validate, WeightEntity.toSupabaseShape, 'animal_weight_records');
}

function open() {
  openAnimalSheet(getById('animals', COW_ID), OP_ID, FARM_ID);
  const panel = document.getElementById('ae-sheet-panel');
  const date = panel.querySelector('[data-testid="edit-animal-confirmed-bred-date"]');
  const field = panel.querySelector('[data-testid="edit-animal-confirmed-bred-date-field"]');
  const error = panel.querySelector('[data-testid="edit-animal-confirmed-bred-date-error"]');
  const box = [...panel.querySelectorAll('input[type="checkbox"]')]
    .find(c => c.closest('label')?.textContent.includes('Confirmed bred'));
  const save = () => [...panel.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save').click();
  return { panel, date, field, error, box, save };
}

function tick(box, on) {
  box.checked = on;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

const animalWrites = () => writes.filter(w => w.table === 'animals' && w.op === 'update');

beforeEach(() => {
  _reset();
  document.body.innerHTML = '';
  setLocale('en', enLocale);
  writes = [];
  setSyncAdapter({
    push: (table, row, op) => writes.push({ table, row, op }),
    pushBatch: () => {}, pull: () => {}, pullAll: () => {}, delete: () => {},
    isOnline: () => true, getStatus: () => 'idle', onStatusChange: () => {},
  });
});

describe('OI-0232 confirmed-bred date on Edit Animal', () => {
  it('the date field shows only while Confirmed bred is ticked', () => {
    seed();
    const f = open();
    expect(f.box).toBeTruthy();
    expect(f.field.hidden).toBe(true);
    tick(f.box, true);
    expect(f.field.hidden).toBe(false);
    tick(f.box, false);
    expect(f.field.hidden).toBe(true);
  });

  it('tick, keep today, save → today is stored', () => {
    seed();
    const f = open();
    tick(f.box, true);
    expect(f.date.value).toBe(getLocalTodayStr());
    f.save();
    const a = getById('animals', COW_ID);
    expect(a.confirmedBred).toBe(true);
    expect(a.confirmedBredDate).toBe(getLocalTodayStr());
    expect(animalWrites().at(-1).row.confirmed_bred_date).toBe(getLocalTodayStr());
  });

  it('tick, back-date, save → the back-dated value is stored', () => {
    seed();
    const f = open();
    tick(f.box, true);
    f.date.value = '2026-06-15';
    f.save();
    expect(getById('animals', COW_ID).confirmedBredDate).toBe('2026-06-15');
    expect(animalWrites().at(-1).row.confirmed_bred_date).toBe('2026-06-15');
  });

  it('untick, save → confirmed_bred false and the date null', () => {
    seed({ confirmedBred: true, confirmedBredDate: '2026-06-15' });
    const f = open();
    expect(f.field.hidden).toBe(false);
    expect(f.date.value).toBe('2026-06-15');
    tick(f.box, false);
    f.save();
    const a = getById('animals', COW_ID);
    expect(a.confirmedBred).toBe(false);
    expect(a.confirmedBredDate).toBeNull();
    expect(animalWrites().at(-1).row.confirmed_bred_date).toBeNull();
  });

  it('a future date is rejected inline and nothing is written', () => {
    seed();
    const f = open();
    tick(f.box, true);
    const d = new Date(`${getLocalTodayStr()}T12:00:00`);
    d.setDate(d.getDate() + 1);
    const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    f.date.value = tomorrow;
    f.save();
    expect(f.error.textContent).toBe(enLocale.animal.confirmedBredDateFuture);
    expect(animalWrites()).toHaveLength(0);
    const a = getById('animals', COW_ID);
    expect(a.confirmedBred).toBe(false);
    expect(a.confirmedBredDate).toBeNull();
  });

  it('a date before the birth date is rejected inline and nothing is written', () => {
    seed();
    const f = open();
    tick(f.box, true);
    f.date.value = '2024-01-01'; // birth 2024-03-10
    f.save();
    expect(f.error.textContent).toBe(enLocale.animal.confirmedBredDateBeforeBirth);
    expect(animalWrites()).toHaveLength(0);
    expect(getById('animals', COW_ID).confirmedBredDate).toBeNull();
  });

  it('an existing tick with no date shows empty and saves null (keeps "Confirm date missing")', () => {
    seed({ confirmedBred: true, confirmedBredDate: null });
    const f = open();
    expect(f.box.checked).toBe(true);
    expect(f.field.hidden).toBe(false);
    expect(f.date.value).toBe('');
    f.save();
    const a = getById('animals', COW_ID);
    expect(a.confirmedBred).toBe(true);
    expect(a.confirmedBredDate).toBeNull();
    expect(animalWrites()).toHaveLength(1);
    expect(animalWrites()[0].row.confirmed_bred).toBe(true);
    expect(animalWrites()[0].row.confirmed_bred_date).toBeNull();
  });
});
