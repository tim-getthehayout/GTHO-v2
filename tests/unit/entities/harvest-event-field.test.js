/** @file Entity tests: harvest-event-field */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/harvest-event-field.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const FARM_ID = '660e8400-e29b-41d4-a716-446655440000';
const EVT_ID = '770e8400-e29b-41d4-a716-446655440000';
const LOC_ID = '880e8400-e29b-41d4-a716-446655440000';
const GRP_ID = '990e8400-e29b-41d4-a716-446655440000';
const BATCH_ID = 'aa0e8400-e29b-41d4-a716-446655440000';
const CHECK_ID = 'bb0e8400-e29b-41d4-a716-446655440000';
const SURV_ID = 'cc0e8400-e29b-41d4-a716-446655440000';
const HE_ID = 'dd0e8400-e29b-41d4-a716-446655440000';
const FT_ID = 'ee0e8400-e29b-41d4-a716-446655440000';

describe('entity: harvest-event-field', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(13);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, harvestEventId: HE_ID, locationId: LOC_ID, feedTypeId: FT_ID, quantity: 200, weightPerUnitKg: 500, cuttingNumber: 1 });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ operationId: OP_ID, harvestEventId: HE_ID, locationId: LOC_ID, feedTypeId: FT_ID, quantity: 200, weightPerUnitKg: 500, cuttingNumber: 1 });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
