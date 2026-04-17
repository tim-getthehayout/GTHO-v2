/** @file Entity tests: event-observation */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/event-observation.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const EVT_ID = '770e8400-e29b-41d4-a716-446655440000';
const PW_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('entity: event-observation', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(17);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid pre_graze record', () => {
      const r = create({
        operationId: OP_ID,
        eventId: EVT_ID,
        observationPhase: 'pre_graze',
        forageHeightCm: 25,
        forageCoverPct: 80,
        forageQuality: 75,
        forageCondition: 'good',
      });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('passes for valid post_graze record', () => {
      const r = create({
        operationId: OP_ID,
        eventId: EVT_ID,
        paddockWindowId: PW_ID,
        observationPhase: 'post_graze',
        postGrazeHeightCm: 5,
        recoveryMinDays: 21,
        recoveryMaxDays: 35,
      });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('passes with null observationPhase (backward compat)', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
    });

    it('fails for invalid observationPhase', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID, observationPhase: 'during' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('observationPhase');
    });

    it('fails for forageQuality outside 1-100', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID, forageQuality: 0 });
      expect(validate(r).valid).toBe(false);
      const r2 = create({ operationId: OP_ID, eventId: EVT_ID, forageQuality: 101 });
      expect(validate(r2).valid).toBe(false);
    });

    it('fails for invalid forageCondition', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID, forageCondition: 'excellent' });
      expect(validate(r).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips all fields correctly', () => {
      const r = create({
        operationId: OP_ID,
        eventId: EVT_ID,
        paddockWindowId: PW_ID,
        observationPhase: 'pre_graze',
        forageHeightCm: 25.5,
        forageCoverPct: 80.25,
        forageQuality: 75,
        forageCondition: 'good',
        storedFeedOnly: true,
        postGrazeHeightCm: 5.0,
        recoveryMinDays: 21,
        recoveryMaxDays: 35,
        notes: 'Test observation',
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips minimal record correctly', () => {
      const r = create({ operationId: OP_ID, eventId: EVT_ID });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
