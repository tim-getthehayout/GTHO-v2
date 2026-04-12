import { describe, it, expect } from 'vitest';
import {
  FIELDS,
  create,
  validate,
  toSupabaseShape,
  fromSupabaseShape,
} from '../../../src/entities/dose-unit.js';

const OP_ID     = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAT_ID    = '770e8400-e29b-41d4-a716-446655440000';

describe('dose-unit entity', () => {
  // --- FIELDS ---
  it('exports 5 fields', () => {
    expect(Object.keys(FIELDS)).toHaveLength(5);
  });

  it('FIELDS.name has sbColumn name', () => {
    expect(FIELDS.name.sbColumn).toBe('name');
  });

  it('FIELDS does not include operationId', () => {
    expect(FIELDS).not.toHaveProperty('operationId');
  });

  it('FIELDS.archived has sbColumn archived', () => {
    expect(FIELDS.archived.sbColumn).toBe('archived');
  });

  // --- validate ---
  it('validate passes with required fields', () => {
    const record = create({ name: 'mL' });
    const result = validate(record);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate fails when name is missing', () => {
    const record = create({ name: '' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  it('validate fails when name is whitespace only', () => {
    const record = create({ name: '   ' });
    const result = validate(record);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('name is required');
  });

  // --- shape round-trip ---
  it('round-trips through toSupabaseShape / fromSupabaseShape', () => {
    const original = create({
      name:      'cc',
      archived:  false,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    });
    const result = fromSupabaseShape(toSupabaseShape(original));
    expect(result).toEqual(original);
  });
});
