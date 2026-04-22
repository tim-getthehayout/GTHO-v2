/** @file OI-0132 Class A — syncCalvingRecordForAnimal transitions.
 *
 * Covers A1 create, A2 move (with record + legacy gap fall-through), A3 delete
 * (confirmed + cancelled), A4 birthdate change (with record + legacy gap),
 * idempotency, dam-doesn't-exist skip, and the `reason` discriminator on noop
 * returns that Class B relies on.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as CalvingEntity from '../../src/entities/animal-calving-record.js';
import { syncCalvingRecordForAnimal } from '../../src/features/animals/calving-sync.js';

const OP = '00000000-0000-0000-0000-000000010aa1';
const DAM_A = '00000000-0000-0000-0000-00000001da01';
const DAM_B = '00000000-0000-0000-0000-00000001da02';
const MISSING_DAM = '00000000-0000-0000-0000-00000001dam0';
const CALF = '00000000-0000-0000-0000-00000001ca01';

function seedDam(id) {
  add('animals', AnimalEntity.create({
    id, operationId: OP, tagNum: `D${id.slice(-2)}`, active: true, sex: 'F',
    dateBorn: '2020-01-01',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedCalf(overrides = {}) {
  add('animals', AnimalEntity.create({
    id: CALF, operationId: OP, tagNum: 'C01', active: true, sex: 'F',
    dateBorn: '2025-03-15',
    ...overrides,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedCalvingRecord({ damId, calfId, calvedAt = '2025-03-15T12:00:00Z', notes = null } = {}) {
  const record = CalvingEntity.create({
    operationId: OP, damId, calfId, calvedAt, notes,
  });
  add('animalCalvingRecords', record, CalvingEntity.validate,
    CalvingEntity.toSupabaseShape, 'animal_calving_records');
  return record;
}

describe('syncCalvingRecordForAnimal (OI-0132 Class A)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
  });

  it('A1 create — null → dam creates a matching record with calvedAt = birthDate + T12:00:00Z', async () => {
    seedDam(DAM_A);
    seedCalf();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('create');
    expect(result.aborted).toBe(false);
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].damId).toBe(DAM_A);
    expect(records[0].calfId).toBe(CALF);
    expect(records[0].calvedAt).toBe('2025-03-15T12:00:00Z');
    expect(records[0].stillbirth).toBe(false);
  });

  it('A1 idempotency — second call with the same before/after is a noop with reason=already-exists', async () => {
    seedDam(DAM_A);
    seedCalf();
    seedCalvingRecord({ damId: DAM_A, calfId: CALF });
    const result = await syncCalvingRecordForAnimal({
      before: { damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('already-exists');
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
  });

  it('A1 dam-not-found — skips with reason=dam-not-found, no record created', async () => {
    seedCalf();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: MISSING_DAM, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('dam-not-found');
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
  });

  it('A2 move — dam A → dam B updates the existing record\'s damId in place', async () => {
    seedDam(DAM_A);
    seedDam(DAM_B);
    seedCalf();
    const existing = seedCalvingRecord({ damId: DAM_A, calfId: CALF, notes: 'preserved' });
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_B, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('move');
    expect(result.calvingRecordId).toBe(existing.id);
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(existing.id);
    expect(records[0].damId).toBe(DAM_B);
    expect(records[0].notes).toBe('preserved');
  });

  it('A2 legacy gap — dam A → dam B with no existing record falls through to A1 create under dam B', async () => {
    seedDam(DAM_A);
    seedDam(DAM_B);
    seedCalf();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_B, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('create');
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].damId).toBe(DAM_B);
  });

  it('A3 delete confirmed — removes the record and returns aborted=false', async () => {
    seedDam(DAM_A);
    seedCalf();
    const existing = seedCalvingRecord({ damId: DAM_A, calfId: CALF });
    const confirm = vi.fn().mockResolvedValue(true);
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
      confirmDeleteHandler: confirm,
    });
    expect(result.action).toBe('delete');
    expect(result.aborted).toBe(false);
    expect(result.calvingRecordId).toBe(existing.id);
    expect(confirm).toHaveBeenCalledWith(expect.any(String));
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
  });

  it('A3 delete cancelled — returns aborted=true and leaves the record intact', async () => {
    seedDam(DAM_A);
    seedCalf();
    const existing = seedCalvingRecord({ damId: DAM_A, calfId: CALF });
    const confirm = vi.fn().mockResolvedValue(false);
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
      confirmDeleteHandler: confirm,
    });
    expect(result.action).toBe('delete');
    expect(result.aborted).toBe(true);
    expect(result.calvingRecordId).toBe(existing.id);
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
  });

  it('A3 noop — clearing damId when no record exists returns reason=no-change without calling the handler', async () => {
    seedDam(DAM_A);
    seedCalf();
    const confirm = vi.fn();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
      confirmDeleteHandler: confirm,
    });
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('no-change');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('A4 birthdate change — updates calvedAt silently, no dialog', async () => {
    seedDam(DAM_A);
    seedCalf();
    const existing = seedCalvingRecord({ damId: DAM_A, calfId: CALF, calvedAt: '2025-03-15T12:00:00Z' });
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_A, birthDate: '2025-04-02', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('update-date');
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].id).toBe(existing.id);
    expect(records[0].calvedAt).toBe('2025-04-02T12:00:00Z');
  });

  it('A4 legacy gap — birthdate change with no existing record falls through to A1 create', async () => {
    seedDam(DAM_A);
    seedCalf();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_A, birthDate: '2025-04-02', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('create');
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(1);
    expect(records[0].calvedAt).toBe('2025-04-02T12:00:00Z');
  });

  it('noop — calf has no damId on either side', async () => {
    seedCalf();
    const result = await syncCalvingRecordForAnimal({
      before: { damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: null, birthDate: '2025-03-15', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('noop');
    expect(result.reason).toBe('no-change');
    expect(getAll('animalCalvingRecords')).toHaveLength(0);
  });

  it('A2 + A4 combined — dam change AND birthdate change in the same save updates both fields on the existing record', async () => {
    seedDam(DAM_A);
    seedDam(DAM_B);
    seedCalf();
    const existing = seedCalvingRecord({ damId: DAM_A, calfId: CALF, calvedAt: '2025-03-15T12:00:00Z' });
    const result = await syncCalvingRecordForAnimal({
      before: { damId: DAM_A, birthDate: '2025-03-15', sireAnimalId: null },
      after: { id: CALF, damId: DAM_B, birthDate: '2025-04-02', sireAnimalId: null },
      operationId: OP,
    });
    expect(result.action).toBe('move');
    const records = getAll('animalCalvingRecords');
    expect(records[0].id).toBe(existing.id);
    expect(records[0].damId).toBe(DAM_B);
    expect(records[0].calvedAt).toBe('2025-04-02T12:00:00Z');
  });
});
