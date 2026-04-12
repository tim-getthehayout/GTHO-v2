/** @file Entity tests: event-paddock-window */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/event-paddock-window.js';

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

describe('entity: event-paddock-window', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(14);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID, locationId: LOC_ID, dateOpened: '2024-06-01', areaPct: 50, isStripGraze: true });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID, locationId: LOC_ID, dateOpened: '2024-06-01', areaPct: 50, isStripGraze: true });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
