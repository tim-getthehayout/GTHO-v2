/** @file Entity tests: batch-adjustment */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/batch-adjustment.js';

const BATCH_ID = '550e8400-e29b-41d4-a716-446655440000';
const OP_ID = '660e8400-e29b-41d4-a716-446655440000';

describe('entity: batch-adjustment', () => {
  it('exports FIELDS with sbColumn for every field (no updatedAt — write-once)', () => {
    expect(Object.keys(FIELDS)).toHaveLength(9);
    expect(FIELDS.updatedAt).toBeUndefined();
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ batchId: BATCH_ID, operationId: OP_ID, previousQty: 100, newQty: 95, delta: -5 });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ batchId: BATCH_ID, operationId: OP_ID, previousQty: 100, newQty: 95, delta: -5, reason: 'Spoilage' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
