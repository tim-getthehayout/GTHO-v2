/** @file Entity tests: operation */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/operation.js';

describe('entity: operation', () => {
  it('exports FIELDS with all columns', () => {
    expect(Object.keys(FIELDS)).toEqual(['id', 'name', 'timezone', 'currency', 'archived', 'createdAt', 'updatedAt']);
  });

  it('every FIELDS entry has sbColumn', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns a valid record with defaults', () => {
      const record = create({ name: 'Test Farm' });
      expect(record.id).toBeDefined();
      expect(record.name).toBe('Test Farm');
      expect(record.currency).toBe('USD');
      expect(record.archived).toBe(false);
    });

    it('accepts overrides', () => {
      const record = create({ name: 'Op', currency: 'AUD', timezone: 'Australia/Sydney' });
      expect(record.currency).toBe('AUD');
      expect(record.timezone).toBe('Australia/Sydney');
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const record = create({ name: 'Test' });
      expect(validate(record)).toEqual({ valid: true, errors: [] });
    });

    it('fails when name is missing', () => {
      const record = create();
      const result = validate(record);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('name is required');
    });

    it('fails when name is whitespace-only', () => {
      const record = create({ name: '   ' });
      expect(validate(record).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('fromSupabaseShape(toSupabaseShape(record)) returns original', () => {
      const record = create({ name: 'Round Trip', timezone: 'US/Central', currency: 'CAD' });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
    });
  });

  describe('toSupabaseShape', () => {
    it('maps to snake_case', () => {
      const record = create({ name: 'Test' });
      const sb = toSupabaseShape(record);
      expect(sb.created_at).toBe(record.createdAt);
      expect(sb.updated_at).toBe(record.updatedAt);
      expect(sb.name).toBe('Test');
    });
  });
});
