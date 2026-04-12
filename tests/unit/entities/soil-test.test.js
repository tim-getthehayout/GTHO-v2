/** @file Entity tests: soil_tests */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/soil-test.js';

const OP_ID  = '550e8400-e29b-41d4-a716-446655440000';
const LOC_ID = '660e8400-e29b-41d4-a716-446655440001';

const validData = {
  operationId: OP_ID,
  locationId:  LOC_ID,
  testedAt:    '2026-03-15T00:00:00.000Z',
  unit:        'mg/kg',
};

const fullData = {
  id:               'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId:      OP_ID,
  locationId:       LOC_ID,
  testedAt:         '2026-03-15T00:00:00.000Z',
  extractionMethod: 'Mehlich-3',
  n:                12,
  p:                45,
  k:                180,
  s:                8,
  ca:               1500,
  mg:               200,
  cu:               2,
  fe:               50,
  mn:               30,
  mo:               0.1,
  zn:               3,
  b:                0.5,
  cl:               null,
  unit:             'mg/kg',
  ph:               6.5,
  bufferPh:         6.8,
  cec:              18,
  baseSaturation:   80,
  organicMatter:    4.2,
  lab:              'AgriLab NZ',
  notes:            'Spring test',
  createdAt:        '2026-01-01T00:00:00.000Z',
  updatedAt:        '2026-01-02T00:00:00.000Z',
};

describe('entity: soil_tests', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(28);
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
      const r = create({ locationId: LOC_ID, testedAt: '2026-03-15T00:00:00.000Z', unit: 'mg/kg' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when locationId is missing', () => {
      const r = create({ operationId: OP_ID, testedAt: '2026-03-15T00:00:00.000Z', unit: 'mg/kg' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('locationId is required');
    });

    it('fails when testedAt is missing', () => {
      const r = create({ operationId: OP_ID, locationId: LOC_ID, unit: 'mg/kg' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('testedAt is required');
    });

    it('fails when unit is missing', () => {
      const r = create({ operationId: OP_ID, locationId: LOC_ID, testedAt: '2026-03-15T00:00:00.000Z' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('unit is required');
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
