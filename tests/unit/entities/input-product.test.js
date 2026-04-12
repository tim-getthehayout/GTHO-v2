/** @file Entity tests: input_products */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/input-product.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const CAT_ID  = '660e8400-e29b-41d4-a716-446655440001';
const UNIT_ID = '770e8400-e29b-41d4-a716-446655440002';

const validData = {
  operationId: OP_ID,
  name:        'Urea 46%',
  categoryId:  CAT_ID,
};

const fullData = {
  id:          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId: OP_ID,
  name:        'Urea 46%',
  categoryId:  CAT_ID,
  nPct:        46,
  pPct:        0,
  kPct:        0,
  sPct:        null,
  caPct:       null,
  mgPct:       null,
  cuPct:       null,
  fePct:       null,
  mnPct:       null,
  moPct:       null,
  znPct:       null,
  bPct:        null,
  clPct:       null,
  costPerUnit: 850,
  unitId:      UNIT_ID,
  archived:    false,
  createdAt:   '2026-01-01T00:00:00.000Z',
  updatedAt:   '2026-01-02T00:00:00.000Z',
};

describe('entity: input_products', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(22);
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
      const r = create({ name: 'Urea', categoryId: CAT_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when name is missing', () => {
      const r = create({ operationId: OP_ID, categoryId: CAT_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    it('fails when categoryId is missing', () => {
      const r = create({ operationId: OP_ID, name: 'Urea' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('categoryId is required');
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
