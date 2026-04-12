/** @file Entity tests: todo-assignment */
// Minimal write-once join table: id, todoId, userId, assignedAt only.
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/todo-assignment.js';

const TODO_ID = '770e8400-e29b-41d4-a716-446655440000';
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('entity: todo-assignment', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(4);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('only contains the 4 minimal fields: id, todoId, userId, assignedAt', () => {
    const keys = Object.keys(FIELDS);
    expect(keys).toContain('id');
    expect(keys).toContain('todoId');
    expect(keys).toContain('userId');
    expect(keys).toContain('assignedAt');
  });

  it('does not include createdAt or updatedAt', () => {
    expect(FIELDS).not.toHaveProperty('createdAt');
    expect(FIELDS).not.toHaveProperty('updatedAt');
  });

  describe('validate', () => {
    it('passes for valid record with todoId and userId', () => {
      const r = create({ todoId: TODO_ID, userId: USER_ID });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when todoId is missing', () => {
      const r = create({ userId: USER_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('todoId is required');
    });

    it('fails when userId is missing', () => {
      const r = create({ todoId: TODO_ID });
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('userId is required');
    });

    it('fails when both required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips correctly', () => {
      const r = create({ todoId: TODO_ID, userId: USER_ID });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips with explicit assignedAt correctly', () => {
      const r = create({ todoId: TODO_ID, userId: USER_ID, assignedAt: '2025-04-01T08:00:00Z' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
