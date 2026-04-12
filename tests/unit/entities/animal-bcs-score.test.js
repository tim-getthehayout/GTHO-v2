import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/animal-bcs-score.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('animal-bcs-score entity', () => {
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

  it('FIELDS.scoredAt has sbColumn scored_at', () => {
    expect(FIELDS.scoredAt.sbColumn).toBe('scored_at');
  });

  it('FIELDS.score has sbColumn score', () => {
    expect(FIELDS.score.sbColumn).toBe('score');
  });

  it('FIELDS.likelyCull has sbColumn likely_cull', () => {
    expect(FIELDS.likelyCull.sbColumn).toBe('likely_cull');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      scoredAt:    '2025-06-15T00:00:00.000Z',
      score:       3.5,
    });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ animalId: ANIMAL_ID, scoredAt: '2025-06-15T00:00:00.000Z', score: 3 });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when animalId is missing', () => {
    const record = create({ operationId: OP_ID, scoredAt: '2025-06-15T00:00:00.000Z', score: 3 });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('animalId is required');
  });

  it('validate fails when scoredAt is missing', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, score: 3 });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('scoredAt is required');
  });

  it('validate fails when score is null', () => {
    const record = create({ operationId: OP_ID, animalId: ANIMAL_ID, scoredAt: '2025-06-15T00:00:00.000Z' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('score is required');
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
      operationId: OP_ID,
      animalId:    ANIMAL_ID,
      scoredAt:    '2025-06-15T00:00:00.000Z',
      score:       3.5,
      likelyCull:  false,
      notes:       'Good body condition',
      createdAt:   '2025-01-01T00:00:00.000Z',
      updatedAt:   '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
