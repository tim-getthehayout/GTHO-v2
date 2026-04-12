import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-treatment.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-treatment entity', () => {
  // --- FIELDS ---
  it('exports 12 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(12);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.animalId has sbColumn animal_id', () => {
    expect(FIELDS.animalId.sbColumn).toBe('animal_id');
  });

  it('FIELDS.treatedAt has sbColumn treated_at', () => {
    expect(FIELDS.treatedAt.sbColumn).toBe('treated_at');
  });

  it('FIELDS.treatmentTypeId has sbColumn treatment_type_id', () => {
    expect(FIELDS.treatmentTypeId.sbColumn).toBe('treatment_type_id');
  });

  it('FIELDS.doseUnitId has sbColumn dose_unit_id', () => {
    expect(FIELDS.doseUnitId.sbColumn).toBe('dose_unit_id');
  });

  it('FIELDS.withdrawalDate has sbColumn withdrawal_date', () => {
    expect(FIELDS.withdrawalDate.sbColumn).toBe('withdrawal_date');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      treatedAt:   '2025-06-15T00:00:00.000Z',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ animalId: ANIMAL_ID, treatedAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when animalId is missing', () => {
    const record = create({ operationId: OP_ID, treatedAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('animalId is required');
  });

  it('validate fails when treatedAt is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('treatedAt is required');
  });

  it('validate fails when all required fields are missing', () => {
    const record = create({});
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(3);
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      operationId:     OP_ID,
      animalId:        ANIMAL_ID,
      treatmentTypeId: CAT_ID,
      treatedAt:       '2025-06-15T00:00:00.000Z',
      product:         'Penicillin G',
      doseAmount:      10,
      doseUnitId:      CAT_ID,
      withdrawalDate:  '2025-06-30',
      notes:           'Treated for pinkeye',
      createdAt:       '2025-01-01T00:00:00.000Z',
      updatedAt:       '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
