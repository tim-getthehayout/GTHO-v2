/**
 * @file Integration test for Edit Animal dialog → saveAnimal → update() flow (OI-0099).
 *
 * Drives the actual openAnimalSheet UI and simulates a farmer toggling the four
 * silent-drop inputs (damId, sire picker, weaned + weanedDate, confirmedBred),
 * then asserts the store and Supabase-shape payload carry all four values.
 *
 * Per CLAUDE.md: UI-only assertions aren't enough — verify the write.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import { openAnimalSheet } from '../../src/features/animals/index.js';
import * as OperationEntity from '../../src/entities/operation.js';
import * as FarmEntity from '../../src/entities/farm.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as AiBullEntity from '../../src/entities/ai-bull.js';

const OP_ID = '00000000-0000-0000-0000-0000000000aa';
const FARM_ID = '00000000-0000-0000-0000-0000000000bb';
const HEIFER_ID = '00000000-0000-0000-0000-0000000000c1';
const DAM_ID = '00000000-0000-0000-0000-0000000000c2';
const SIRE_ID = '00000000-0000-0000-0000-0000000000c3';
const AI_BULL_ID = '00000000-0000-0000-0000-0000000000d1';

function seed() {
  add('operations', OperationEntity.create({ id: OP_ID, name: 'Test Op', unitSystem: 'metric' }),
    OperationEntity.validate, OperationEntity.toSupabaseShape, 'operations');
  add('farms', FarmEntity.create({ id: FARM_ID, operationId: OP_ID, name: 'Home Farm' }),
    FarmEntity.validate, FarmEntity.toSupabaseShape, 'farms');
  // The animal under edit
  add('animals', AnimalEntity.create({ id: HEIFER_ID, operationId: OP_ID, sex: 'female', tagNum: 'H-01', name: 'Daisy' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  // Candidate dam (female)
  add('animals', AnimalEntity.create({ id: DAM_ID, operationId: OP_ID, sex: 'female', tagNum: 'D-01', name: 'Bessie' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  // Candidate herd sire (male)
  add('animals', AnimalEntity.create({ id: SIRE_ID, operationId: OP_ID, sex: 'male', tagNum: 'B-01', name: 'Bully' }),
    AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
  // Candidate AI bull
  add('aiBulls', AiBullEntity.create({ id: AI_BULL_ID, operationId: OP_ID, name: 'Connealy Confidence', tag: 'CONF-01', breed: 'Angus' }),
    AiBullEntity.validate, AiBullEntity.toSupabaseShape, 'ai_bulls');
}

describe('Edit Animal dialog → saveAnimal round-trips the four inputs (OI-0099)', () => {
  let queuedWrites;

  beforeEach(() => {
    _reset();
    document.body.innerHTML = '';
    queuedWrites = [];
    setSyncAdapter({
      push: (table, row, op) => queuedWrites.push({ table, row, op }),
      pushBatch: () => {},
      pull: () => {},
      pullAll: () => {},
      delete: () => {},
      isOnline: () => true,
      getStatus: () => 'idle',
      onStatusChange: () => {},
    });
    seed();
  });

  it('saves damId, weaned + weanedDate, confirmedBred, and sireAnimalId through update()', () => {
    const heifer = getById('animals', HEIFER_ID);
    openAnimalSheet(heifer, OP_ID, FARM_ID);

    const panel = document.getElementById('ae-sheet-panel');
    expect(panel).toBeTruthy();

    // Dam — select Bessie.
    const damSelect = panel.querySelector('[data-testid="edit-animal-dam-select"]');
    damSelect.value = DAM_ID;

    // Sire — switch to "Animal in herd" mode and tap Bully.
    panel.querySelector('[data-testid="sire-mode-animal"]').click();
    panel.querySelector(`[data-testid="sire-animal-${SIRE_ID}"]`).click();

    // Weaning — toggle on; weanedDate should default to today.
    const weanedCheck = panel.querySelectorAll('input[type="checkbox"]')[0];
    weanedCheck.checked = true;
    weanedCheck.dispatchEvent(new Event('change', { bubbles: true }));
    const weanedDate = panel.querySelector('[data-testid="edit-animal-weaned-date"]');
    expect(weanedDate.value).toBeTruthy();
    // Back-date support.
    weanedDate.value = '2026-04-10';

    // Confirmed bred — toggle on (only visible for females).
    const bredCheck = panel.querySelectorAll('input[type="checkbox"]')[1];
    bredCheck.checked = true;

    // Click Save.
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    expect(saveBtn).toBeTruthy();
    saveBtn.click();

    // Verify in-store animal record.
    const saved = getById('animals', HEIFER_ID);
    expect(saved.damId).toBe(DAM_ID);
    expect(saved.sireAnimalId).toBe(SIRE_ID);
    expect(saved.sireAiBullId).toBeNull();
    expect(saved.weaned).toBe(true);
    expect(saved.weanedDate).toBe('2026-04-10');
    expect(saved.confirmedBred).toBe(true);

    // Verify sync push carried snake_case columns.
    const push = queuedWrites.find(w => w.table === 'animals' && w.op === 'update');
    expect(push).toBeTruthy();
    expect(push.row.dam_id).toBe(DAM_ID);
    expect(push.row.sire_animal_id).toBe(SIRE_ID);
    expect(push.row.sire_ai_bull_id).toBeNull();
    expect(push.row.weaned).toBe(true);
    expect(push.row.weaned_date).toBe('2026-04-10');
    expect(push.row.confirmed_bred).toBe(true);
  });

  it('sire picker mutual exclusivity: switching to AI bull clears sireAnimalId; switching back clears sireAiBullId', () => {
    const heifer = getById('animals', HEIFER_ID);
    openAnimalSheet(heifer, OP_ID, FARM_ID);

    const panel = document.getElementById('ae-sheet-panel');
    // Pick herd sire first.
    panel.querySelector('[data-testid="sire-mode-animal"]').click();
    panel.querySelector(`[data-testid="sire-animal-${SIRE_ID}"]`).click();
    // Switch to AI bull and select the seeded bull.
    panel.querySelector('[data-testid="sire-mode-aiBull"]').click();
    panel.querySelector(`[data-testid="sire-ai-bull-${AI_BULL_ID}"]`).click();

    // Save and verify sireAnimalId is cleared, sireAiBullId is set.
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    const saved = getById('animals', HEIFER_ID);
    expect(saved.sireAnimalId).toBeNull();
    expect(saved.sireAiBullId).toBe(AI_BULL_ID);
  });

  it('sire "None" mode clears both FKs', () => {
    // Pre-populate the animal with a sire so we can observe "None" clearing it.
    const heifer = getById('animals', HEIFER_ID);
    heifer.sireAnimalId = SIRE_ID;
    openAnimalSheet(heifer, OP_ID, FARM_ID);

    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="sire-mode-none"]').click();

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    const saved = getById('animals', HEIFER_ID);
    expect(saved.sireAnimalId).toBeNull();
    expect(saved.sireAiBullId).toBeNull();
  });

  it('unchecking weaned clears weanedDate', () => {
    // Seed heifer as already weaned.
    const heifer = getById('animals', HEIFER_ID);
    heifer.weaned = true;
    heifer.weanedDate = '2026-03-01';
    openAnimalSheet(heifer, OP_ID, FARM_ID);

    const panel = document.getElementById('ae-sheet-panel');
    const weanedCheck = panel.querySelectorAll('input[type="checkbox"]')[0];
    weanedCheck.checked = false;
    weanedCheck.dispatchEvent(new Event('change', { bubbles: true }));

    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    const saved = getById('animals', HEIFER_ID);
    expect(saved.weaned).toBe(false);
    expect(saved.weanedDate).toBeNull();
  });

  it('inline Add AI bull creates an ai_bulls row and selects it on the animal', () => {
    const heifer = getById('animals', HEIFER_ID);
    openAnimalSheet(heifer, OP_ID, FARM_ID);

    const panel = document.getElementById('ae-sheet-panel');
    panel.querySelector('[data-testid="sire-mode-aiBull"]').click();

    const beforeBulls = getAll('aiBulls').length;

    panel.querySelector('[data-testid="sire-add-ai-bull"]').click();

    // Sub-dialog should be in document.body overlay.
    const nameInput = document.querySelector('[data-testid="add-ai-bull-name"]');
    expect(nameInput).toBeTruthy();
    nameInput.value = 'Old Red';
    document.querySelector('[data-testid="add-ai-bull-tag"]').value = 'RED-01';
    document.querySelector('[data-testid="add-ai-bull-breed"]').value = 'Hereford';
    document.querySelector('[data-testid="add-ai-bull-save"]').click();

    const afterBulls = getAll('aiBulls');
    expect(afterBulls.length).toBe(beforeBulls + 1);
    const newBull = afterBulls.find(b => b.name === 'Old Red');
    expect(newBull).toBeTruthy();
    expect(newBull.tag).toBe('RED-01');
    expect(newBull.breed).toBe('Hereford');

    // New bull should immediately be the sire selection on the panel. Save to persist.
    const saveBtn = Array.from(panel.querySelectorAll('button')).find(b => b.textContent.trim() === 'Save');
    saveBtn.click();

    const saved = getById('animals', HEIFER_ID);
    expect(saved.sireAiBullId).toBe(newBull.id);
    expect(saved.sireAnimalId).toBeNull();
  });
});
