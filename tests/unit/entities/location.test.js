/** @file Entity tests: location */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/location.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const FARM_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('entity: location', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(14);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns record with defaults', () => {
      const r = create({ name: 'Paddock 1', operationId: OP_ID, farmId: FARM_ID, type: 'land' });
      expect(r.type).toBe('land');
      expect(r.archived).toBe(false);
      expect(r.landUse).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ name: 'P1', operationId: OP_ID, farmId: FARM_ID, type: 'land' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
    it('fails for invalid type', () => {
      const r = create({ name: 'P1', operationId: OP_ID, farmId: FARM_ID, type: 'barn' });
      expect(validate(r).valid).toBe(false);
    });
    it('fails for invalid landUse', () => {
      const r = create({ name: 'P1', operationId: OP_ID, farmId: FARM_ID, type: 'land', landUse: 'forest' });
      expect(validate(r).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ name: 'P1', operationId: OP_ID, farmId: FARM_ID, type: 'land', landUse: 'pasture', areaHectares: 10.5, capturePercent: 80 });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
