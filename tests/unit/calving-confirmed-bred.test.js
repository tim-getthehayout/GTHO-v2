/** @file A newly recorded birth clears the dam's stored breeding confirmation. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { _reset, add, getAll, getById, setSyncAdapter } from '../../src/data/store.js';
import { loadFromStorage } from '../../src/data/local-storage.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as CalvingEntity from '../../src/entities/animal-calving-record.js';
import * as ClassEntity from '../../src/entities/animal-class.js';
import { openCalvingSheet } from '../../src/features/health/calving.js';
import { syncCalvingRecordForAnimal } from '../../src/features/animals/calving-sync.js';
import { backfillCalvingRecords } from '../../src/features/animals/backfill-calving-records.js';
import { setLocale } from '../../src/i18n/i18n.js';
import en from '../../src/i18n/locales/en.json';

const OP = '00000000-0000-0000-0000-000000000001';
const DAM = '00000000-0000-0000-0000-000000000002';
const OLD_DAM = '00000000-0000-0000-0000-000000000003';
const CALF = '00000000-0000-0000-0000-000000000004';
const HEIFER = '00000000-0000-0000-0000-000000000005';
const COW = '00000000-0000-0000-0000-000000000006';
let push;

function seedAnimal(id, changes = {}) {
  return add('animals', AnimalEntity.create({
    id, operationId: OP, sex: 'female', confirmedBred: true, ...changes,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedRecord() {
  add('animalCalvingRecords', CalvingEntity.create({
    operationId: OP, damId: DAM, calfId: CALF, calvedAt: '2026-01-01T12:00:00Z',
  }), CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
}

function expectCleared() {
  expect(getById('animals', DAM).confirmedBred).toBe(false);
  expect(loadFromStorage('animals').find(a => a.id === DAM).confirmedBred).toBe(false);
  // Manual compound Saves enqueue atomically; single-record helpers use the adapter.
  const writes = [...push.mock.calls, ...JSON.parse(localStorage.getItem('_sync_queue') || '[]').map(row => [row.table, row.record, row.operation])];
  expect(writes).toContainEqual(['animals', expect.objectContaining({
    id: DAM, confirmed_bred: false, operation_id: OP,
  }), 'update']);
}

beforeEach(() => {
  _reset();
  localStorage.clear();
  document.body.replaceChildren();
  setLocale('en', en);
  push = vi.fn();
  setSyncAdapter({ push });
});
afterEach(() => {
  setSyncAdapter(null);
  vi.restoreAllMocks();
});

describe('calving sheet birth side effect', () => {
  it.each([
    [false, '', true],
    [true, '', false],
    [true, 'Stillborn calf', true],
  ])('stillbirth=%s, tag=%s clears the dam and preserves the live calf-creation guard', (stillbirth, tag, createsCalf) => {
    const dam = seedAnimal(DAM);
    openCalvingSheet(dam, OP);
    document.querySelector('[data-testid="calving-sheet-stillbirth"]').checked = stillbirth;
    document.querySelector('[data-testid="calving-sheet-calf-tag"]').value = tag;
    document.querySelector('[data-testid="calving-sheet-save"]').click();
    expect(document.querySelector('[data-testid="calving-sheet-status"]').textContent).toBe('');
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expect(getAll('animals')).toHaveLength(createsCalf ? 2 : 1);
    expectCleared();
  });

  it('clears a heifer even when the optional class reassignment is declined', () => {
    for (const [id, role] of [[HEIFER, 'heifer'], [COW, 'cow']]) {
      add('animalClasses', ClassEntity.create({ id, operationId: OP, name: role, role, species: 'beef_cattle' }),
        ClassEntity.validate, ClassEntity.toSupabaseShape, 'animal_classes');
    }
    const dam = seedAnimal(DAM, { classId: HEIFER });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openCalvingSheet(dam, OP);
    document.querySelector('[data-testid="calving-sheet-save"]').click();
    expect(confirm).toHaveBeenCalled();
    expect(getById('animals', DAM).classId).toBe(HEIFER);
    expectCleared();
  });

  it('does not clear the dam on cancel or an invalid date', () => {
    const dam = seedAnimal(DAM);
    openCalvingSheet(dam, OP);
    document.querySelector('#calving-sheet-panel > .btn-row:last-child .btn-outline').click();
    expect(document.getElementById('calving-sheet-wrap').classList.contains('open')).toBe(false);
    expect(getById('animals', DAM).confirmedBred).toBe(true);
    openCalvingSheet(dam, OP);
    document.querySelector('[data-testid="calving-sheet-date"]').value = '';
    document.querySelector('[data-testid="calving-sheet-save"]').click();
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
    expect(getById('animals', DAM).confirmedBred).toBe(true);
  });
});

describe('calf-to-dam linking birth side effect', () => {
  it.each([
    [null, '2026-01-01', '2026-01-01'],
    [OLD_DAM, '2026-01-01', '2026-01-01'],
    [DAM, '2026-01-01', '2026-01-02'],
  ])('clears the dam when a missing calving row is created (before dam=%s)', async (beforeDam, beforeDate, afterDate) => {
    seedAnimal(DAM);
    seedAnimal(OLD_DAM);
    await syncCalvingRecordForAnimal({
      before: { damId: beforeDam, birthDate: beforeDate },
      after: { id: CALF, damId: DAM, birthDate: afterDate }, operationId: OP,
    });
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expectCleared();
    expect(getById('animals', OLD_DAM).confirmedBred).toBe(true);
  });

  it('does not clear a later breeding confirmation on an idempotent link or historical date edit', async () => {
    seedAnimal(DAM);
    seedRecord();
    for (const before of [null, { damId: DAM, birthDate: '2026-01-01' }]) {
      await syncCalvingRecordForAnimal({
        before, after: { id: CALF, damId: DAM, birthDate: '2026-01-02' }, operationId: OP,
      });
    }
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expect(getById('animals', DAM).confirmedBred).toBe(true);
    expect(push.mock.calls.filter(([table, , action]) => table === 'animals' && action === 'update')).toHaveLength(0);
  });

  it('clears the dam when backfill creates the missing birth row', async () => {
    seedAnimal(DAM);
    seedAnimal(CALF, { damId: DAM, birthDate: '2026-01-01', confirmedBred: false });
    await backfillCalvingRecords(OP);
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expectCleared();
  });

  it('does not create or clear records when the dam belongs to another operation', async () => {
    seedAnimal(DAM, { operationId: '00000000-0000-0000-0000-000000000099' });
    const result = await syncCalvingRecordForAnimal({
      before: null, after: { id: CALF, damId: DAM, birthDate: '2026-01-01' }, operationId: OP,
    });
    expect(result.reason).toBe('dam-not-found');
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
    expect(getById('animals', DAM).confirmedBred).toBe(true);
  });
});
