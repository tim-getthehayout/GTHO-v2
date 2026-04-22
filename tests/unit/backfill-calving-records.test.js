/** @file OI-0132 Class B — backfillCalvingRecords batch routine.
 *
 * Covers the happy mixed-skip path, idempotency, all four skip reasons, the
 * empty-operation case, and the mid-run error handler that keeps the batch
 * going when one calf blows up.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _reset, add, getAll } from '../../src/data/store.js';
import * as AnimalEntity from '../../src/entities/animal.js';
import * as CalvingEntity from '../../src/entities/animal-calving-record.js';
import { backfillCalvingRecords } from '../../src/features/animals/backfill-calving-records.js';

const OP = '00000000-0000-0000-0000-000000030aa1';
const OTHER_OP = '00000000-0000-0000-0000-000000030aa2';
const DAM_A = '00000000-0000-0000-0000-00000003da01';
const DAM_B = '00000000-0000-0000-0000-00000003da02';
const MISSING_DAM = '00000000-0000-0000-0000-00000003dam0';

function seedDam(id, operationId = OP) {
  add('animals', AnimalEntity.create({
    id, operationId, tagNum: `D${id.slice(-2)}`, active: true, sex: 'F',
    dateBorn: '2020-01-01',
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedCalf({ id, damId = null, birthDate = null, operationId = OP } = {}) {
  add('animals', AnimalEntity.create({
    id, operationId, tagNum: id.slice(-4), active: true, sex: 'F',
    damId, birthDate,
  }), AnimalEntity.validate, AnimalEntity.toSupabaseShape, 'animals');
}

function seedRecord(damId, calfId) {
  add('animalCalvingRecords', CalvingEntity.create({
    operationId: OP, damId, calfId, calvedAt: '2025-03-15T12:00:00Z',
  }), CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
}

describe('backfillCalvingRecords (OI-0132 Class B)', () => {
  beforeEach(() => {
    _reset();
    localStorage.clear();
  });

  it('happy mixed path — creates records for qualifying calves, counts each skip reason', async () => {
    seedDam(DAM_A);
    seedDam(DAM_B);
    // qualifying: damId + birthDate, no existing record.
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca01', damId: DAM_A, birthDate: '2025-03-15' });
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca02', damId: DAM_B, birthDate: '2025-04-02' });
    // skippedNoBirthDate: damId set, birthDate null.
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca03', damId: DAM_A, birthDate: null });
    // skippedDamMissing: damId points at non-existent animal.
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca04', damId: MISSING_DAM, birthDate: '2025-03-15' });
    // skippedAlreadyExists: damId + birthDate with existing record.
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca05', damId: DAM_A, birthDate: '2025-03-15' });
    seedRecord(DAM_A, '00000000-0000-0000-0000-00000003ca05');
    // Not counted: no damId at all.
    seedCalf({ id: '00000000-0000-0000-0000-00000003ca06', damId: null, birthDate: '2025-05-01' });

    const result = await backfillCalvingRecords(OP);

    expect(result).toEqual({
      created: 2,
      skippedNoBirthDate: 1,
      skippedDamMissing: 1,
      skippedAlreadyExists: 1,
      skippedError: 0,
    });
    const records = getAll('animalCalvingRecords');
    expect(records).toHaveLength(3); // 1 pre-seeded + 2 created
  });

  it('idempotent — second run creates 0 new records; the newly-created ones land in skippedAlreadyExists', async () => {
    seedDam(DAM_A);
    seedCalf({ id: '00000000-0000-0000-0000-00000003cb01', damId: DAM_A, birthDate: '2025-03-15' });
    seedCalf({ id: '00000000-0000-0000-0000-00000003cb02', damId: DAM_A, birthDate: '2025-04-02' });

    const first = await backfillCalvingRecords(OP);
    expect(first.created).toBe(2);

    const second = await backfillCalvingRecords(OP);
    expect(second.created).toBe(0);
    expect(second.skippedAlreadyExists).toBe(2);
  });

  it('empty operation — returns all-zero summary', async () => {
    const result = await backfillCalvingRecords(OP);
    expect(result).toEqual({
      created: 0,
      skippedNoBirthDate: 0,
      skippedDamMissing: 0,
      skippedAlreadyExists: 0,
      skippedError: 0,
    });
  });

  it('operation scoping — ignores animals from other operations', async () => {
    seedDam(DAM_A, OP);
    seedDam(DAM_B, OTHER_OP);
    // Qualifying calf on our op.
    seedCalf({ id: '00000000-0000-0000-0000-00000003cc01', damId: DAM_A, birthDate: '2025-03-15' });
    // Qualifying calf on a different op — must not be touched.
    seedCalf({
      id: '00000000-0000-0000-0000-00000003cc02', damId: DAM_B, birthDate: '2025-03-15',
      operationId: OTHER_OP,
    });

    const result = await backfillCalvingRecords(OP);
    expect(result.created).toBe(1);
    expect(getAll('animalCalvingRecords')).toHaveLength(1);
    expect(getAll('animalCalvingRecords')[0].operationId).toBe(OP);
  });

  it('mid-run error — logs via logger.error, counts skippedError, continues the batch', async () => {
    seedDam(DAM_A);
    seedCalf({ id: '00000000-0000-0000-0000-00000003cd01', damId: DAM_A, birthDate: '2025-03-15' });
    seedCalf({ id: '00000000-0000-0000-0000-00000003cd02', damId: DAM_A, birthDate: '2025-04-02' });

    // Inject a failure on the second helper call.
    const calvingSync = await import('../../src/features/animals/calving-sync.js');
    const original = calvingSync.syncCalvingRecordForAnimal;
    const spy = vi.spyOn(calvingSync, 'syncCalvingRecordForAnimal').mockImplementation(async (args) => {
      if (args.after.id === '00000000-0000-0000-0000-00000003cd02') throw new Error('simulated');
      return original(args);
    });

    const result = await backfillCalvingRecords(OP);
    expect(result.created).toBe(1);
    expect(result.skippedError).toBe(1);
    spy.mockRestore();
  });
});
