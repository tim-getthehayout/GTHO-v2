/** @file Entity tests: animal-class */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/animal-class.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: animal-class', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(15);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns record with defaults', () => {
      const r = create({ name: 'Cow', operationId: OP_ID, species: 'beef_cattle', role: 'cow' });
      expect(r.dmiPct).toBeNull();
      expect(r.dmiPctLactating).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ name: 'Cow', operationId: OP_ID, species: 'beef_cattle', role: 'cow' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
    it('fails for invalid species', () => {
      const r = create({ name: 'Cow', operationId: OP_ID, species: 'horse', role: 'cow' });
      expect(validate(r).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'Cow', operationId: OP_ID, species: 'dairy_cattle', role: 'cow', dmiPct: 2.5, dmiPctLactating: 3.2, excretionNRate: 0.45, weaningAgeDays: 210 });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
