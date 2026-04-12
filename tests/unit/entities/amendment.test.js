/** @file Entity tests: amendments */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/amendment.js';

const OP_ID      = '550e8400-e29b-41d4-a716-446655440000';
const PRODUCT_ID = '660e8400-e29b-41d4-a716-446655440001';
const BATCH_ID   = '770e8400-e29b-41d4-a716-446655440002';
const SPREADER_ID= '880e8400-e29b-41d4-a716-446655440003';
const UNIT_ID    = '990e8400-e29b-41d4-a716-446655440004';

const validData = {
  operationId: OP_ID,
  appliedAt:   '2026-04-01T08:00:00.000Z',
  sourceType:  'fertiliser',
};

const fullData = {
  id:             'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId:    OP_ID,
  appliedAt:      '2026-04-01T08:00:00.000Z',
  sourceType:     'fertiliser',
  inputProductId: PRODUCT_ID,
  manureBatchId:  BATCH_ID,
  spreaderId:     SPREADER_ID,
  totalQty:       500,
  qtyUnitId:      UNIT_ID,
  costOverride:   1200,
  notes:          'Spring top-dress',
  createdAt:      '2026-01-01T00:00:00.000Z',
  updatedAt:      '2026-01-02T00:00:00.000Z',
};

describe('entity: amendments', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(13);
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
      const r = create({ appliedAt: '2026-04-01T08:00:00.000Z', sourceType: 'fertiliser' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when appliedAt is missing', () => {
      const r = create({ operationId: OP_ID, sourceType: 'fertiliser' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('appliedAt is required');
    });

    it('fails when sourceType is missing', () => {
      const r = create({ operationId: OP_ID, appliedAt: '2026-04-01T08:00:00.000Z' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('sourceType is required');
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
