/** @file Entity tests: amendment_locations */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/amendment-location.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const AMEND_ID= '660e8400-e29b-41d4-a716-446655440001';
const LOC_ID  = '770e8400-e29b-41d4-a716-446655440002';

const validData = {
  operationId: OP_ID,
  amendmentId: AMEND_ID,
  locationId:  LOC_ID,
};

const fullData = {
  id:          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId: OP_ID,
  amendmentId: AMEND_ID,
  locationId:  LOC_ID,
  qty:         250,
  nKg:         10,
  pKg:         5,
  kKg:         8,
  sKg:         2,
  caKg:        null,
  mgKg:        null,
  cuKg:        null,
  feKg:        null,
  mnKg:        null,
  moKg:        null,
  znKg:        null,
  bKg:         null,
  clKg:        null,
  areaHa:      12.5,
  createdAt:   '2026-01-01T00:00:00.000Z',
  updatedAt:   '2026-01-02T00:00:00.000Z',
};

describe('entity: amendment_locations', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(21);
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
      const r = create({ amendmentId: AMEND_ID, locationId: LOC_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when amendmentId is missing', () => {
      const r = create({ operationId: OP_ID, locationId: LOC_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('amendmentId is required');
    });

    it('fails when locationId is missing', () => {
      const r = create({ operationId: OP_ID, amendmentId: AMEND_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('locationId is required');
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
