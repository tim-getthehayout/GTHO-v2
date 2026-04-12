/** @file Entity tests: batch-nutritional-profile */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/batch-nutritional-profile.js';

const OP_ID    = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('entity: batch-nutritional-profile', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(21);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, testedAt: '2025-03-01', source: 'lab report' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const r = create({ batchId: BATCH_ID, testedAt: '2025-03-01', source: 'lab report' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when batchId is missing', () => {
      const r = create({ operationId: OP_ID, testedAt: '2025-03-01', source: 'lab report' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('batchId is required');
    });

    it('fails when testedAt is missing', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, source: 'lab report' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('testedAt is required');
    });

    it('fails when source is missing', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, testedAt: '2025-03-01' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('source is required');
    });

    it('fails when all required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips a minimal valid record correctly', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, testedAt: '2025-03-01', source: 'lab report' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips a fully-populated record correctly', () => {
      const r = create({
        operationId: OP_ID,
        batchId:     BATCH_ID,
        testedAt:    '2025-03-01',
        source:      'certified lab',
        dmPct:       88.5,
        proteinPct:  12.3,
        adfPct:      34.1,
        ndfPct:      55.0,
        tdnPct:      60.2,
        rfv:         102,
        nPct:        1.97,
        pPct:        0.21,
        kPct:        1.8,
        caPct:       0.45,
        mgPct:       0.18,
        sPct:        0.22,
        lab:         'Forage Analytics Inc',
        notes:       'First cut spring sample',
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
