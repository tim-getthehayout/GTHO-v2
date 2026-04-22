/** @file Entity tests: group */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/group.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: group', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    // OI-0133: farmId dropped — 8 fields → 7.
    expect(Object.keys(FIELDS)).toHaveLength(7);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('OI-0133 lock — farmId is not a field on the group entity', () => {
    expect(FIELDS.farmId).toBeUndefined();
  });

  describe('validate', () => {
    it('passes for valid record with just operationId + name', () => {
      const r = create({ name: 'Herd A', operationId: OP_ID });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
    it('OI-0133 — farmId is not required anymore; groups with no open window have no current farm', () => {
      const r = create({ name: 'Culls-Open', operationId: OP_ID });
      const { valid, errors } = validate(r);
      expect(valid).toBe(true);
      expect(errors).not.toContain('farmId is required');
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Herd A', operationId: OP_ID, color: '#FF5733' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
    it('toSupabaseShape omits farm_id key entirely', () => {
      const r = create({ name: 'Herd A', operationId: OP_ID });
      const sb = toSupabaseShape(r);
      expect(Object.keys(sb)).not.toContain('farm_id');
    });
  });
});
