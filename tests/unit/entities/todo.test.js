/** @file Entity tests: todo */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/todo.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('entity: todo', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(12);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('validate', () => {
    it('passes for valid record with operationId and title', () => {
      const r = create({ operationId: OP_ID, title: 'Fix fence in paddock 3' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const r = create({ title: 'Fix fence' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('operationId is required');
    });

    it('fails when title is missing', () => {
      const r = create({ operationId: OP_ID });
      r.title = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title is required');
    });

    it('fails when title is whitespace only', () => {
      const r = create({ operationId: OP_ID, title: '   ' });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('title is required');
    });

    it('fails when both required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips a minimal valid record correctly', () => {
      const r = create({ operationId: OP_ID, title: 'Fix fence in paddock 3' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips a fully-populated record correctly', () => {
      const r = create({
        operationId: OP_ID,
        title:       'Move herd to north paddock',
        description: 'Rotate after 3 days rest period',
        status:      'open',
        note:        'Check water trough first',
        locationId:  '660e8400-e29b-41d4-a716-446655440000',
        animalId:    '770e8400-e29b-41d4-a716-446655440000',
        dueDate:     '2025-04-15',
        createdBy:   USER_ID,
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
