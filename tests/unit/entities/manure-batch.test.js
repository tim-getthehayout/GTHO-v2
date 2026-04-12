/** @file Entity tests: manure_batches */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/manure-batch.js';

const OP_ID  = '550e8400-e29b-41d4-a716-446655440000';
const LOC_ID = '660e8400-e29b-41d4-a716-446655440001';

const validData = {
  operationId: OP_ID,
  label:       'Spring Heap 2026',
};

const fullData = {
  id:                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId:       OP_ID,
  label:             'Spring Heap 2026',
  sourceLocationId:  LOC_ID,
  estimatedVolumeKg: 5000,
  nKg:               80,
  pKg:               40,
  kKg:               60,
  sKg:               10,
  caKg:              null,
  mgKg:              null,
  cuKg:              null,
  feKg:              null,
  mnKg:              null,
  moKg:              null,
  znKg:              null,
  bKg:               null,
  clKg:              null,
  captureDate:       '2026-03-01',
  notes:             'Composted cattle manure',
  createdAt:         '2026-01-01T00:00:00.000Z',
  updatedAt:         '2026-01-02T00:00:00.000Z',
};

describe('entity: manure_batches', () => {
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
      const r = create({ label: 'Spring Heap 2026' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when label is missing', () => {
      const r = create({ operationId: OP_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('label is required');
    });

    it('fails when label is whitespace only', () => {
      const r = create({ operationId: OP_ID, label: '   ' });
      expect(validate(r).valid).toBe(false);
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
