import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/ai-bull.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('ai-bull entity', () => {
  // --- FIELDS ---
  it('exports 9 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(9);
  });

  it('FIELDS.operationId has sbColumn operation_id', () => {
    expect(FIELDS.operationId.sbColumn).toBe('operation_id');
  });

  it('FIELDS.name has sbColumn name', () => {
    expect(FIELDS.name.sbColumn).toBe('name');
  });

  it('FIELDS.regNum has sbColumn reg_num', () => {
    expect(FIELDS.regNum.sbColumn).toBe('reg_num');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({ operationId: OP_ID, name: 'Angus Bull' });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when operationId is missing', () => {
    const record = create({ name: 'Angus Bull' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('operationId is required');
  });

  it('validate fails when name is missing', () => {
    const record = create({ operationId: OP_ID, name: '' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('validate fails when both required fields are missing', () => {
    const record = create({});
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(2);
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      operationId: OP_ID,
      name:        'Hereford Bull',
      breed:       'Hereford',
      tag:         'T-12',
      regNum:      'REG-001',
      archived:    false,
      createdAt:   '2025-01-01T00:00:00.000Z',
      updatedAt:   '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
