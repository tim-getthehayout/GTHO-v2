/** @file Entity tests: batch-location-balance */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/batch-location-balance.js';

const OP = '550e8400-e29b-41d4-a716-446655440000';
const BATCH = '660e8400-e29b-41d4-a716-446655440000';
const LOC = '770e8400-e29b-41d4-a716-446655440000';

describe('entity: batch-location-balance', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS).length).toBeGreaterThan(0);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('round-trips and coerces numeric quantity', () => {
    const record = create({ operationId: OP, batchId: BATCH, locationId: LOC, quantity: 12.5 });
    expect(validate(record).valid).toBe(true);
    const row = toSupabaseShape(record);
    row.quantity = '12.5';
    expect(fromSupabaseShape(row)).toEqual(record);
  });

  it('rejects a negative quantity', () => {
    const record = create({ operationId: OP, batchId: BATCH, locationId: LOC, quantity: -1 });
    expect(validate(record).valid).toBe(false);
  });
});
