/** @file Entity tests: batch */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/batch.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const FT_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('entity: batch', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(17);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('defaults remaining to quantity', () => {
      const r = create({ name: 'Batch 1', operationId: OP_ID, feedTypeId: FT_ID, quantity: 100, unit: 'bale' });
      expect(r.remaining).toBe(100);
      expect(r.source).toBe('purchase');
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ name: 'Batch 1', operationId: OP_ID, feedTypeId: FT_ID, quantity: 100, remaining: 100, unit: 'bale' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Batch 1', operationId: OP_ID, feedTypeId: FT_ID, quantity: 100, remaining: 80, unit: 'bale', weightPerUnitKg: 500, costPerUnit: 45, purchaseDate: '2024-06-01' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
