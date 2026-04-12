import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-breeding-record.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-breeding-record entity', () => {
  // --- FIELDS ---
  it('exports 14 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(14);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.animalId has sbColumn animal_id', () => {
    expect(FIELDS.animalId.sbColumn).toBe('animal_id');
  });

  it('FIELDS.bredAt has sbColumn bred_at', () => {
    expect(FIELDS.bredAt.sbColumn).toBe('bred_at');
  });

  it('FIELDS.method has sbColumn method', () => {
    expect(FIELDS.method.sbColumn).toBe('method');
  });

  it('FIELDS.sireAiBullId has sbColumn sire_ai_bull_id', () => {
    expect(FIELDS.sireAiBullId.sbColumn).toBe('sire_ai_bull_id');
  });

  it('FIELDS.expectedCalving has sbColumn expected_calving', () => {
    expect(FIELDS.expectedCalving.sbColumn).toBe('expected_calving');
  });

  // --- validate ---
  it('validate passes with method ai', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      bredAt:      '2025-06-15T00:00:00.000Z',
      method:      'ai',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate passes with method bull', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      bredAt:      '2025-06-15T00:00:00.000Z',
      method:      'bull',
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ animalId: ANIMAL_ID, bredAt: '2025-06-15T00:00:00.000Z', method: 'ai' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when animalId is missing', () => {
    const record = create({ operationId: OP_ID, bredAt: '2025-06-15T00:00:00.000Z', method: 'ai' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('animalId is required');
  });

  it('validate fails when bredAt is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, method: 'ai' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('bredAt is required');
  });

  it('validate fails when method is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, bredAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('method is required');
  });

  it('validate fails when method is an invalid value', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, bredAt: '2025-06-15T00:00:00.000Z', method: 'natural' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('method must be one of: ai, bull');
  });

  it('validate fails when all required fields are missing', () => {
    const record = create({});
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(4);
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      operationId:     OP_ID,
      animalId:        ANIMAL_ID,
      bredAt:          '2025-06-15T00:00:00.000Z',
      method:          'ai',
      sireAnimalId:    null,
      sireAiBullId:    CAT_ID,
      semenId:         'SEM-001',
      technician:      'John Doe',
      expectedCalving: '2026-03-15',
      confirmedDate:   '2025-07-20',
      notes:           'First AI attempt',
      createdAt:       '2025-01-01T00:00:00.000Z',
      updatedAt:       '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
