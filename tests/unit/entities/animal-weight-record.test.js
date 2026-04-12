import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-weight-record.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-weight-record entity', () => {
  // --- FIELDS ---
  it('exports 9 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(9);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.animalId has sbColumn animal_id', () => {
    expect(FIELDS.animalId.sbColumn).toBe('animal_id');
  });

  it('FIELDS.recordedAt has sbColumn recorded_at', () => {
    expect(FIELDS.recordedAt.sbColumn).toBe('recorded_at');
  });

  it('FIELDS.weightKg has sbColumn weight_kg', () => {
    expect(FIELDS.weightKg.sbColumn).toBe('weight_kg');
  });

  it('FIELDS.source has sbColumn source', () => {
    expect(FIELDS.source.sbColumn).toBe('source');
  });

  // --- validate ---
  it('validate passes with required fields using source manual', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      recordedAt:  '2025-06-15T00:00:00.000Z',
      weightKg:    450,
      source:      'manual',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate passes with source group_update', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      recordedAt:  '2025-06-15T00:00:00.000Z',
      weightKg:    450,
      source:      'group_update',
    });
    expect(validate(record).valid).toBe(true);
  });

  it('validate passes with source calving', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      recordedAt:  '2025-06-15T00:00:00.000Z',
      weightKg:    450,
      source:      'calving',
    });
    expect(validate(record).valid).toBe(true);
  });

  it('validate passes with source import', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      recordedAt:  '2025-06-15T00:00:00.000Z',
      weightKg:    450,
      source:      'import',
    });
    expect(validate(record).valid).toBe(true);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ animalId: ANIMAL_ID, recordedAt: '2025-06-15T00:00:00.000Z', weightKg: 450, source: 'manual' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when animalId is missing', () => {
    const record = create({ operationId: OP_ID, recordedAt: '2025-06-15T00:00:00.000Z', weightKg: 450, source: 'manual' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('animalId is required');
  });

  it('validate fails when recordedAt is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, weightKg: 450, source: 'manual' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('recordedAt is required');
  });

  it('validate fails when weightKg is null', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, recordedAt: '2025-06-15T00:00:00.000Z', source: 'manual' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('weightKg is required');
  });

  it('validate fails when source is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, recordedAt: '2025-06-15T00:00:00.000Z', weightKg: 450 });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('source is required');
  });

  it('validate fails when source is an invalid value', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, recordedAt: '2025-06-15T00:00:00.000Z', weightKg: 450, source: 'scale' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('source must be one of: manual, group_update, calving, import');
  });

  it('validate fails when all required fields are missing', () => {
    const record = create({});
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(5);
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      recordedAt:  '2025-06-15T00:00:00.000Z',
      weightKg:    450.5,
      source:      'manual',
      notes:       'Weighed at squeeze chute',
      createdAt:   '2025-01-01T00:00:00.000Z',
      updatedAt:   '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
