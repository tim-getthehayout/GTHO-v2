/** @file Entity tests: animal */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/animal.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

describe('entity: animal', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(20);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns record with defaults', () => {
      const r = create({ operationId: OP_ID, sex: 'female' });
      expect(r.active).toBe(true);
      expect(r.weaned).toBeNull();
      expect(r.damId).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, sex: 'male' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when operationId is missing', () => {
      expect(validate(create({ sex: 'female' })).valid).toBe(false);
    });
    it('fails when sex is missing', () => {
      expect(validate(create({ operationId: OP_ID, sex: '' })).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({
        operationId: OP_ID, sex: 'female', tagNum: '42', eid: 'EID001',
        name: 'Daisy', birthDate: '2022-03-15', weaned: true, weanedDate: '2022-10-01',
        cullDate: null, cullReason: null, cullNotes: null,
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
