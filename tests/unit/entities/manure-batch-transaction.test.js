/** @file Entity tests: manure_batch_transactions */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/manure-batch-transaction.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const BATCH_ID= '660e8400-e29b-41d4-a716-446655440001';
const EVENT_ID= '770e8400-e29b-41d4-a716-446655440002';
const AMEND_ID= '880e8400-e29b-41d4-a716-446655440003';

const validData = {
  operationId:     OP_ID,
  batchId:         BATCH_ID,
  type:            'addition',
  transactionDate: '2026-04-01',
  volumeKg:        1000,
};

const fullData = {
  id:              'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  operationId:     OP_ID,
  batchId:         BATCH_ID,
  type:            'addition',
  transactionDate: '2026-04-01',
  volumeKg:        1000,
  sourceEventId:   EVENT_ID,
  amendmentId:     AMEND_ID,
  notes:           'Cattle yard collection',
  createdAt:       '2026-01-01T00:00:00.000Z',
  updatedAt:       '2026-01-02T00:00:00.000Z',
};

describe('entity: manure_batch_transactions', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(11);
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
      const r = create({ batchId: BATCH_ID, type: 'addition', transactionDate: '2026-04-01', volumeKg: 1000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when batchId is missing', () => {
      const r = create({ operationId: OP_ID, type: 'addition', transactionDate: '2026-04-01', volumeKg: 1000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('batchId is required');
    });

    it('fails when type is missing', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, transactionDate: '2026-04-01', volumeKg: 1000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('type is required');
    });

    it('fails when transactionDate is missing', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, type: 'addition', volumeKg: 1000 });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('transactionDate is required');
    });

    it('fails when volumeKg is missing', () => {
      const r = create({ operationId: OP_ID, batchId: BATCH_ID, type: 'addition', transactionDate: '2026-04-01' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('volumeKg is required');
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
