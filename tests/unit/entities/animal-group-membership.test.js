/** @file Entity tests: animal-group-membership */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/animal-group-membership.js';

const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
const ANIMAL_ID = '660e8400-e29b-41d4-a716-446655440000';
const GROUP_ID = '770e8400-e29b-41d4-a716-446655440000';

describe('entity: animal-group-membership', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(9);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const r = create({ operationId: OP_ID, animalId: ANIMAL_ID, groupId: GROUP_ID, dateJoined: '2024-01-01' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });
    it('fails when required fields missing', () => {
      expect(validate(create()).valid).toBe(false);
      expect(validate(create()).errors).toHaveLength(4);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ operationId: OP_ID, animalId: ANIMAL_ID, groupId: GROUP_ID, dateJoined: '2024-01-01', dateLeft: '2024-06-01', reason: 'weaning' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
