import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-heat-record.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-heat-record entity', () => {
  // --- FIELDS ---
  it('exports 7 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(7);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.animalId has sbColumn animal_id', () => {
    expect(FIELDS.animalId.sbColumn).toBe('animal_id');
  });

  it('FIELDS.observedAt has sbColumn observed_at', () => {
    expect(FIELDS.observedAt.sbColumn).toBe('observed_at');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      observedAt:  '2025-06-15T00:00:00.000Z',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ animalId: ANIMAL_ID, observedAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when animalId is missing', () => {
    const record = create({ operationId: OP_ID, observedAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('animalId is required');
  });

  it('validate fails when observedAt is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('observedAt is required');
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
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      observedAt:  '2025-06-15T00:00:00.000Z',
      notes:       'Standing heat observed',
      createdAt:   '2025-01-01T00:00:00.000Z',
      updatedAt:   '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
