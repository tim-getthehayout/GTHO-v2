/** @file Entity tests: forage-type */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/forage-type.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: forage-type', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(15);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns record with defaults', () => {
      const r = create({ name: 'Fescue', operationId: OP_ID });
      expect(r.isSeeded).toBe(false);
      expect(r.dmPct).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      expect(validate(create({ name: 'Fescue', operationId: OP_ID }))).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Fescue', operationId: OP_ID, dmPct: 30, dmKgPerCmPerHa: 250, utilizationPct: 70 });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
