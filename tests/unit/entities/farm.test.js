/** @file Entity tests: farm */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/farm.js';

describe('entity: farm', () => {
  const OP_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('exports FIELDS with all columns', () => {
    const keys = Object.keys(FIELDS);
    expect(keys).toContain('operationId');
    expect(keys).toContain('areaHectares');
    expect(keys).toHaveLength(11);
  });

  it('every FIELDS entry has sbColumn', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns a valid record with defaults', () => {
      const record = create({ name: 'North Farm', operationId: OP_ID });
      expect(record.id).toBeDefined();
      expect(record.name).toBe('North Farm');
      expect(record.operationId).toBe(OP_ID);
      expect(record.archived).toBe(false);
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const record = create({ name: 'North Farm', operationId: OP_ID });
      expect(validate(record)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const record = create({ name: 'Farm' });
      expect(validate(record).valid).toBe(false);
      expect(validate(record).errors).toContain('operationId is required');
    });

    it('fails when name is missing', () => {
      const record = create({ operationId: OP_ID });
      expect(validate(record).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('fromSupabaseShape(toSupabaseShape(record)) returns original', () => {
      const record = create({
        name: 'Round Trip', operationId: OP_ID,
        latitude: -33.8, longitude: 151.2, areaHectares: 120.5,
        address: '123 Farm Rd', notes: 'Good soil',
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
    });
  });

  describe('toSupabaseShape', () => {
    it('maps operationId to operation_id', () => {
      const record = create({ name: 'Test', operationId: OP_ID });
      const sb = toSupabaseShape(record);
      expect(sb.operation_id).toBe(OP_ID);
      expect(sb.area_hectares).toBe(record.areaHectares);
    });
  });
});
