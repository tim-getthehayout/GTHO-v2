/** @file Entity tests: batch-move */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/batch-move.js';

const OP = '550e8400-e29b-41d4-a716-446655440000';
const BATCH = '660e8400-e29b-41d4-a716-446655440000';
const LOC = '770e8400-e29b-41d4-a716-446655440000';

describe('entity: batch-move', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('round-trips a first placement with a null source', () => {
    const record = create({
      operationId: OP, batchId: BATCH, fromLocationId: null, toLocationId: LOC,
      quantity: 10, movedAt: '2026-11-04', notes: null,
    });
    expect(validate(record).valid).toBe(true);
    const row = toSupabaseShape(record);
    row.quantity = '10';
    expect(fromSupabaseShape(row)).toEqual(record);
  });

  it('requires a destination', () => {
    expect(validate(create({ operationId: OP, batchId: BATCH, quantity: 1, movedAt: '2026-11-04' })).valid).toBe(false);
  });
});
