/** @file OI-0132 + SP-14 — Edit Animal dialog hard gate + dynamic birth-date hint.
 *
 *  - SP-14 UI: Dam + Birth date share a row; hint reads "optional" (grey) when
 *    Dam = unknown, flips to "required" (red) when any dam is selected.
 *  - OI-0132 hard gate: saving with damId set and birthDate blank shows an
 *    inline error and aborts the save.
 *  - OI-0132 A3 flow: clearing a previously-set damId triggers window.confirm
 *    before the animal update lands; cancel aborts everything.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { _reset, add, update, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import { openAnimalSheet } from '../../src/features/animals/index.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as CalvingEntity from '../../src/entities/animal-calving-record.js';

const OP = '00000000-0000-0000-0000-000000020aa1';
const FARM = '00000000-0000-0000-0000-000000020bb1';
const CALF = '00000000-0000-0000-0000-00000002ca01';
const DAM_A = '00000000-0000-0000-0000-00000002da01';
const DAM_B = '00000000-0000-0000-0000-00000002da02';

function seed() {
  add('operations', OperationEntity.create({ id: OP, name: 'Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM, operationId: OP, name: 'Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  add('animals', AnimalEntity.create({ id: CALF, operationId: OP, sex: 'female', tagNum: 'C-01' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animals', AnimalEntity.create({ id: DAM_A, operationId: OP, sex: 'female', tagNum: 'D-A' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  add('animals', AnimalEntity.create({ id: DAM_B, operationId: OP, sex: 'female', tagNum: 'D-B' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.innerHTML = '';
  setLocale('en', enLocale);
  setSyncAdapter({
    push: () => {}, pushBatch: () => {}, pull: () => {}, pullAll: () => {},
    delete: () => {}, isOnline: () => true, getStatus: () => 'idle',
    onStatusChange: () => {},
  });
  seed();
});

afterEach(() => vi.restoreAllMocks());

describe('SP-14 — Dam + Birth date shared row + dynamic hint', () => {
  it('renders Dam and Birth date inside one flex row', () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const damSelect = panel.querySelector('[data-testid="edit-animal-dam-select"]');
    const birthDate = panel.querySelector('[data-testid="edit-animal-birth-date"]');
    expect(damSelect).toBeTruthy();
    expect(birthDate).toBeTruthy();
    // Walk up from the dam select until we find a flex container.
    let flexParent = damSelect.parentElement;
    while (flexParent && flexParent.style.display !== 'flex') flexParent = flexParent.parentElement;
    expect(flexParent).toBeTruthy();
    expect(flexParent.contains(birthDate)).toBe(true);
  });

  it('hint reads "optional" (grey) when Dam = unknown', () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const hint = panel.querySelector('[data-testid="edit-animal-birth-date-hint"]');
    expect(hint.textContent).toBe('optional');
  });

  it('hint flips to "required" (red) when a dam is selected', () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    const damSelect = panel.querySelector('[data-testid="edit-animal-dam-select"]');
    const hint = panel.querySelector('[data-testid="edit-animal-birth-date-hint"]');

    damSelect.value = DAM_A;
    damSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(hint.textContent).toBe('required');
    expect(hint.style.color).toMatch(/red|#d33/i);

    damSelect.value = '';
    damSelect.dispatchEvent(new Event('change', { bubbles: true }));
    expect(hint.textContent).toBe('optional');
  });

  it('calf with pre-existing dam renders "required" on initial open', () => {
    const calf = getById('animals', CALF);
    calf.damId = DAM_A;
    calf.birthDate = '2025-03-15';
    openAnimalSheet(calf, OP, FARM);
    const hint = document.querySelector('[data-testid="edit-animal-birth-date-hint"]');
    expect(hint.textContent).toBe('required');
  });
});

describe('OI-0132 hard gate — birthDate required when damId is set', () => {
  it('blocks Save when damId is set and birthDate is blank', () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="edit-animal-dam-select"]').value = DAM_A;
    const birthDate = panel.querySelector('[data-testid="edit-animal-birth-date"]');
    birthDate.value = '';

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    // Animal row should NOT have damId set.
    const saved = getById('animals', CALF);
    expect(saved.damId).toBeNull();
    // Status box carries the i18n error.
    expect(panel.textContent).toMatch(/Birth date is required/i);
  });

  it('allows Save when Dam is unknown and birthDate is blank', async () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    // Defaults: Dam = unknown, birthDate = empty.
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();
    // Wait a microtask so async saveAnimal's post-update path completes.
    await Promise.resolve();
    const saved = getById('animals', CALF);
    expect(saved.damId).toBeNull();
    expect(saved.birthDate).toBeNull();
  });
});

describe('OI-0132 A3 confirm flow — clearing damId', () => {
  function seedCalfWithDam() {
    update('animals', CALF, { damId: DAM_A, birthDate: '2025-03-15' },
      AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
    add('animalCalvingRecords', CalvingEntity.create({
      operationId: OP, damId: DAM_A, calfId: CALF, calvedAt: '2025-03-15T12:00:00Z',
    }), CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
    return getById('animals', CALF);
  }

  it('cancelling the confirm leaves the animal row untouched', () => {
    const calf = seedCalfWithDam();
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    openAnimalSheet(calf, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="edit-animal-dam-select"]').value = '';

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    const saved = getById('animals', CALF);
    expect(saved.damId).toBe(DAM_A);
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
  });

  it('confirming the prompt clears damId on the animal and deletes the calving record', async () => {
    const calf = seedCalfWithDam();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    openAnimalSheet(calf, OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="edit-animal-dam-select"]').value = '';

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    const saved = getById('animals', CALF);
    expect(saved.damId).toBeNull();
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
  });
});

describe('OI-0132 saveAnimal → sync wiring — A1 create on save', () => {
  it('setting damId + birthDate on a calf creates a matching calving record', async () => {
    openAnimalSheet(getById('animals', CALF), OP, FARM);
    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="edit-animal-dam-select"]').value = DAM_A;
    panel.querySelector('[data-testid="edit-animal-birth-date"]').value = '2025-03-15';

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].damId).toBe(DAM_A);
    expect(records[0].calfId).toBe(CALF);
    expect(records[0].calvedAt).toBe('2025-03-15T12:00:00Z');
  });
});
