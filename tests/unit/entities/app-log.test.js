/** @file Entity tests: app-log */
// Write-once: no updatedAt. userId and operationId are nullable.
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/app-log.js';

const OP_ID   = '550e8400-e29b-41d4-a716-446655440000';
const USER_ID = '880e8400-e29b-41d4-a716-446655440000';

describe('entity: app-log', () => {
  it('exports FIELDS with sbColumn for every field', () => {
    expect(Object.keys(FIELDS)).toHaveLength(11);
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  it('does not include updatedAt (write-once)', () => {
    expect(FIELDS).not.toHaveProperty('updatedAt');
  });

  it('userId and operationId are not required (nullable)', () => {
    expect(FIELDS.userId.required).toBe(false);
    expect(FIELDS.operationId.required).toBe(false);
  });

  describe('validate', () => {
    it('passes for valid record with only source and message', () => {
      const r = create({ source: 'auth', message: 'Login failed' });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('passes when userId and operationId are null', () => {
      const r = create({ source: 'sync', message: 'Queue flush error', userId: null, operationId: null });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('passes with all optional fields populated', () => {
      const r = create({
        source:      'store',
        message:     'Action failed',
        userId:      USER_ID,
        operationId: OP_ID,
        sessionId:   'sess-abc-123',
        level:       'warn',
        stack:       'Error: ...\n  at store.js:42',
        context:     { action: 'addEvent' },
        appVersion:  '2.0.1',
      });
      expect(validate(r)).toEqual({ valid: true, errors: [] });
    });

    it('fails when source is missing', () => {
      const r = create({ message: 'Something failed' });
      r.source = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('source is required');
    });

    it('fails when message is missing', () => {
      const r = create({ source: 'auth' });
      r.message = '';
      const result = validate(r);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('message is required');
    });

    it('fails when both required fields are missing', () => {
      expect(validate(create()).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('round-trips a minimal record correctly', () => {
      const r = create({ source: 'auth', message: 'Login failed' });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });

    it('round-trips a fully-populated record correctly', () => {
      const r = create({
        source:      'store',
        message:     'Action failed',
        userId:      USER_ID,
        operationId: OP_ID,
        sessionId:   'sess-abc-123',
        level:       'error',
        stack:       'Error: ...\n  at store.js:42',
        context:     { action: 'addEvent' },
        appVersion:  '2.0.1',
      });
      expect(fromSupabaseShape(toSupabaseShape(r))).toEqual(r);
    });
  });
});
