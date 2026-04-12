/** @file Entity tests: group */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/group.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const FARM_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('entity: group', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(8);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ name: 'Herd A', operationId: OP_ID, farmId: FARM_ID });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Herd A', operationId: OP_ID, farmId: FARM_ID, color: '#FF5733' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
