/** @file Entity tests: npk_price_history */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/npk-price-history.js';

const FARM_ID = '550e8400-e29b-41d4-a716-446655440000';
const OP_ID   = '660e8400-e29b-41d4-a716-446655440001';

const validData = {
  farmId:        FARM_ID,
  operationId:   OP_ID,
  effectiveDate: '2026-01-01',
  nPricePerKg:   1.80,
  pPricePerKg:   2.50,
  kPricePerKg:   1.20,
};

const fullData = {
  id:            'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  farmId:        FARM_ID,
  operationId:   OP_ID,
  effectiveDate: '2026-01-01',
  nPricePerKg:   1.80,
  pPricePerKg:   2.50,
  kPricePerKg:   1.20,
  notes:         'Q1 2026 pricing',
  createdAt:     '2026-01-01T00:00:00.000Z',
  updatedAt:     '2026-01-02T00:00:00.000Z',
};

describe('entity: npk_price_history', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(10);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ ...validData });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when farmId is missing', () => {
      const r = create({ operationId: OP_ID, effectiveDate: '2026-01-01', nPricePerKg: 1.8, pPricePerKg: 2.5, kPricePerKg: 1.2 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('farmId is required');
    });

    it('fails when operationId is missing', () => {
      const r = create({ farmId: FARM_ID, effectiveDate: '2026-01-01', nPricePerKg: 1.8, pPricePerKg: 2.5, kPricePerKg: 1.2 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when effectiveDate is missing', () => {
      const r = create({ farmId: FARM_ID, operationId: OP_ID, nPricePerKg: 1.8, pPricePerKg: 2.5, kPricePerKg: 1.2 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('effectiveDate is required');
    });

    it('fails when nPricePerKg is missing', () => {
      const r = create({ farmId: FARM_ID, operationId: OP_ID, effectiveDate: '2026-01-01', pPricePerKg: 2.5, kPricePerKg: 1.2 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('nPricePerKg is required');
    });

    it('fails when pPricePerKg is missing', () => {
      const r = create({ farmId: FARM_ID, operationId: OP_ID, effectiveDate: '2026-01-01', nPricePerKg: 1.8, kPricePerKg: 1.2 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('pPricePerKg is required');
    });

    it('fails when kPricePerKg is missing', () => {
      const r = create({ farmId: FARM_ID, operationId: OP_ID, effectiveDate: '2026-01-01', nPricePerKg: 1.8, pPricePerKg: 2.5 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('kPricePerKg is required');
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
