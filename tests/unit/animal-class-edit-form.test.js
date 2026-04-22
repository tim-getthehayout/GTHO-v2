/**
 * @file OI-0128 — Animal Class Edit form replaces `window.prompt` stub with
 * a full Add/Edit dual-purpose form covering all 11 editable fields.
 *
 * Clicking Edit on a class row repopulates the shared form at the bottom of
 * the manage sheet, locks species + role (create-only), and flips Save to
 * "Save changes". Imperial weight round-trips through `convert()`; species
 * select writes canonical values (`beef_cattle`, not "Beef cattle") so the
 * entity's `VALID_SPECIES` check passes.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { _reset, add, getAll, getById } from '../../src/data/store.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import { openClassesManager } from '../../src/features/animals/index.js';

const OP = '00000000-0000-0000-0000-0000000000aa';

beforeAll(() => setLocale('en', enLocale));

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'imperial' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
});

function panel() { return document.getElementById('manage-classes-panel'); }

function seedCow(extras = {}) {
  const record = AnimalClassEntity.create({
    operationId: OP,
    name: 'Cow',
    species: 'beef_cattle',
    role: 'cow',
    defaultWeightKg: 545,
    dmiPct: 2.5,
    dmiPctLactating: 3.0,
    excretionNRate: 0.145,
    excretionPRate: 0.041,
    excretionKRate: 0.136,
    weaningAgeDays: null,
    archived: false,
    ...extras,
  });
  add('animalClasses', record, AnimalClassEntity.validate, AnimalClassEntity.toSupabaseShape, 'animal_classes');
  return record;
}

describe('OI-0128 — Animal Class Edit form', () => {
  it('opens with the "Add class" form title and empty inputs by default', () => {
    openClassesManager(OP);
    const p = panel();
    const title = p.querySelector('[data-testid="class-form-name"]');
    expect(title).toBeTruthy();
    expect(title.value).toBe('');
    const species = p.querySelector('[data-testid="class-form-species"]');
    expect(species.value).toBe('beef_cattle');
    expect(species.disabled).toBe(false);
    const saveBtn = p.querySelector('[data-testid="class-form-save"]');
    expect(saveBtn.textContent).toBe('Add class');
    const cancelBtn = p.querySelector('[data-testid="class-form-cancel-edit"]');
    expect(cancelBtn.style.display).toBe('none');
  });

  it('species select uses canonical values (not the human-readable text)', () => {
    openClassesManager(OP);
    const species = panel().querySelector('[data-testid="class-form-species"]');
    const values = Array.from(species.options).map(o => o.value);
    expect(values).toEqual(['beef_cattle', 'dairy_cattle', 'sheep', 'goat', 'other']);
  });

  it('clicking Edit pre-fills every field and locks species + role', () => {
    const cow = seedCow();
    openClassesManager(OP);
    const p = panel();
    p.querySelector(`[data-testid="class-edit-${cow.id}"]`).click();

    expect(p.querySelector('[data-testid="class-form-name"]').value).toBe('Cow');
    expect(p.querySelector('[data-testid="class-form-species"]').value).toBe('beef_cattle');
    expect(p.querySelector('[data-testid="class-form-species"]').disabled).toBe(true);
    expect(p.querySelector('[data-testid="class-form-role"]').value).toBe('cow');
    expect(p.querySelector('[data-testid="class-form-role"]').disabled).toBe(true);
    // defaultWeightKg 545 kg → 1201.5 lb → rounded to 1202.
    expect(p.querySelector('[data-testid="class-form-weight"]').value).toBe('1202');
    expect(p.querySelector('[data-testid="class-form-dmi-pct"]').value).toBe('2.5');
    expect(p.querySelector('[data-testid="class-form-dmi-lactating"]').value).toBe('3');
    expect(p.querySelector('[data-testid="class-form-excretion-n"]').value).toBe('0.145');
    expect(p.querySelector('[data-testid="class-form-weaning"]').value).toBe('');

    const saveBtn = p.querySelector('[data-testid="class-form-save"]');
    expect(saveBtn.textContent).toBe('Save changes');
    const cancelBtn = p.querySelector('[data-testid="class-form-cancel-edit"]');
    expect(cancelBtn.style.display).not.toBe('none');
  });

  it('Edit → change weight + DMI lactating → Save writes metric weight + new DMI', () => {
    const cow = seedCow();
    openClassesManager(OP);
    const p = panel();
    p.querySelector(`[data-testid="class-edit-${cow.id}"]`).click();

    const weightInput = p.querySelector('[data-testid="class-form-weight"]');
    weightInput.value = '1300'; // 1300 lb → ~589.7 kg metric
    const dmiLactating = p.querySelector('[data-testid="class-form-dmi-lactating"]');
    dmiLactating.value = '3.2';

    p.querySelector('[data-testid="class-form-save"]').click();

    const updated = getById('animalClasses', cow.id);
    expect(updated.defaultWeightKg).toBeCloseTo(589.67, 1);
    expect(updated.dmiPctLactating).toBe(3.2);
    // Species and role are locked on edit — they must not change.
    expect(updated.species).toBe('beef_cattle');
    expect(updated.role).toBe('cow');
  });

  it('Cancel edit clears form, resets editingClassId, restores Save label', () => {
    const cow = seedCow();
    openClassesManager(OP);
    const p = panel();
    p.querySelector(`[data-testid="class-edit-${cow.id}"]`).click();

    // Now cancel.
    p.querySelector('[data-testid="class-form-cancel-edit"]').click();

    expect(p.querySelector('[data-testid="class-form-name"]').value).toBe('');
    expect(p.querySelector('[data-testid="class-form-species"]').disabled).toBe(false);
    expect(p.querySelector('[data-testid="class-form-role"]').disabled).toBe(false);
    expect(p.querySelector('[data-testid="class-form-save"]').textContent).toBe('Add class');
    expect(p.querySelector('[data-testid="class-form-cancel-edit"]').style.display).toBe('none');

    // Save after cancel should create a new class, not update cow.
    p.querySelector('[data-testid="class-form-name"]').value = 'NewClass';
    p.querySelector('[data-testid="class-form-species"]').value = 'sheep';
    p.querySelector('[data-testid="class-form-species"]').dispatchEvent(new Event('change'));
    // After species change the role options rebuild; pick the first.
    const roleSelect = p.querySelector('[data-testid="class-form-role"]');
    roleSelect.value = 'ewe';
    p.querySelector('[data-testid="class-form-save"]').click();

    const all = getAll('animalClasses');
    expect(all.length).toBe(2);
    const newOne = all.find(c => c.name === 'NewClass');
    expect(newOne.species).toBe('sheep');
    expect(newOne.role).toBe('ewe');
  });

  it('Add new class writes canonical species value (not human-readable text)', () => {
    openClassesManager(OP);
    const p = panel();
    p.querySelector('[data-testid="class-form-name"]').value = 'Heifer';
    p.querySelector('[data-testid="class-form-species"]').value = 'beef_cattle';
    p.querySelector('[data-testid="class-form-role"]').value = 'heifer';
    p.querySelector('[data-testid="class-form-weight"]').value = '800';
    p.querySelector('[data-testid="class-form-dmi-pct"]').value = '2.5';
    p.querySelector('[data-testid="class-form-save"]').click();

    const added = getAll('animalClasses')[0];
    expect(added.species).toBe('beef_cattle'); // NOT "Beef cattle"
    expect(added.role).toBe('heifer');
    expect(added.defaultWeightKg).toBeCloseTo(362.87, 1); // 800 lb → metric
  });

  it('species change rebuilds role options from ANIMAL_CLASSES_BY_SPECIES', () => {
    openClassesManager(OP);
    const p = panel();
    const species = p.querySelector('[data-testid="class-form-species"]');
    const roleSelect = p.querySelector('[data-testid="class-form-role"]');

    species.value = 'goat';
    species.dispatchEvent(new Event('change'));
    const goatRoles = Array.from(roleSelect.options).map(o => o.value);
    expect(goatRoles).toEqual(['doe', 'buck', 'wether', 'kid']);

    species.value = 'sheep';
    species.dispatchEvent(new Event('change'));
    const sheepRoles = Array.from(roleSelect.options).map(o => o.value);
    expect(sheepRoles).toEqual(['ewe', 'ram', 'wether', 'lamb']);
  });
});
