/** @file Entity tests: feed-type */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/feed-type.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: feed-type', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(16);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ name: 'Round Bale Hay', operationId: OP_ID, category: 'hay', unit: 'bale' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Hay', operationId: OP_ID, category: 'hay', unit: 'bale', dmPct: 85, defaultWeightKg: 500, cuttingNumber: 2 });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
