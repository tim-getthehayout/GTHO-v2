/** @file Entity tests: spreaders */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/spreader.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

const validData = {
  operationId: OP_ID,
  name:        'Front Loader',
  capacityKg:  2000,
};

const fullData = {
  id:          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId: OP_ID,
  name:        'Front Loader',
  capacityKg:  2000,
  archived:    false,
  createdAt:   '2026-01-01T00:00:00.000Z',
  updatedAt:   '2026-01-02T00:00:00.000Z',
};

describe('entity: spreaders', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(7);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ ...validData });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const r = create({ name: 'Front Loader', capacityKg: 2000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when name is missing', () => {
      const r = create({ operationId: OP_ID, capacityKg: 2000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    it('fails when capacityKg is missing', () => {
      const r = create({ operationId: OP_ID, name: 'Front Loader' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('capacityKg is required');
    });

    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ ...fullData });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
