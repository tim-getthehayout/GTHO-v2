/** @file Validator tests — valid inputs pass, invalid inputs return errors */
import { describe, it, expect } from 'vitest';
import {
  required, isUuid, isIn, isPositiveNumber, isNonNegativeNumber,
  isDate, maxLength, isInRange, combine,
} from '../../src/utils/validators.js';

describe('validators', () => {
  describe('required', () => {
    it('passes for non-empty string', () => {
      expect(required('hello', 'name')).toEqual({ valid: true, errors: [] });
    });
    it('passes for number 0', () => {
      expect(required(0, 'count')).toEqual({ valid: true, errors: [] });
    });
    it('fails for null', () => {
      expect(required(null, 'name').valid).toBe(false);
    });
    it('fails for undefined', () => {
      expect(required(undefined, 'name').valid).toBe(false);
    });
    it('fails for empty string', () => {
      expect(required('', 'name').valid).toBe(false);
    });
  });

  describe('isUuid', () => {
    it('passes for valid UUID', () => {
      expect(isUuid('550e8400-e29b-41d4-a716-446655440000', 'id').valid).toBe(true);
    });
    it('fails for non-UUID string', () => {
      expect(isUuid('not-a-uuid', 'id').valid).toBe(false);
    });
    it('fails for number', () => {
      expect(isUuid(123, 'id').valid).toBe(false);
    });
  });

  describe('isIn', () => {
    it('passes for value in list', () => {
      expect(isIn('active', ['active', 'closed'], 'status').valid).toBe(true);
    });
    it('fails for value not in list', () => {
      const result = isIn('pending', ['active', 'closed'], 'status');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be one of');
    });
  });

  describe('isPositiveNumber', () => {
    it('passes for positive number', () => {
      expect(isPositiveNumber(5, 'weight').valid).toBe(true);
    });
    it('fails for zero', () => {
      expect(isPositiveNumber(0, 'weight').valid).toBe(false);
    });
    it('fails for negative', () => {
      expect(isPositiveNumber(-1, 'weight').valid).toBe(false);
    });
    it('fails for NaN', () => {
      expect(isPositiveNumber(NaN, 'weight').valid).toBe(false);
    });
    it('fails for string', () => {
      expect(isPositiveNumber('5', 'weight').valid).toBe(false);
    });
  });

  describe('isNonNegativeNumber', () => {
    it('passes for zero', () => {
      expect(isNonNegativeNumber(0, 'count').valid).toBe(true);
    });
    it('passes for positive', () => {
      expect(isNonNegativeNumber(10, 'count').valid).toBe(true);
    });
    it('fails for negative', () => {
      expect(isNonNegativeNumber(-1, 'count').valid).toBe(false);
    });
  });

  describe('isDate', () => {
    it('passes for ISO date string', () => {
      expect(isDate('2024-01-15', 'startDate').valid).toBe(true);
    });
    it('passes for ISO datetime string', () => {
      expect(isDate('2024-01-15T10:30:00Z', 'startDate').valid).toBe(true);
    });
    it('fails for invalid date string', () => {
      expect(isDate('not-a-date', 'startDate').valid).toBe(false);
    });
    it('fails for number', () => {
      expect(isDate(12345, 'startDate').valid).toBe(false);
    });
  });

  describe('maxLength', () => {
    it('passes for string within limit', () => {
      expect(maxLength('hello', 10, 'name').valid).toBe(true);
    });
    it('fails for string over limit', () => {
      expect(maxLength('hello world', 5, 'name').valid).toBe(false);
    });
    it('passes for non-string (no-op)', () => {
      expect(maxLength(123, 5, 'count').valid).toBe(true);
    });
  });

  describe('isInRange', () => {
    it('passes for value in range', () => {
      expect(isInRange(5, 1, 10, 'score').valid).toBe(true);
    });
    it('passes for min boundary', () => {
      expect(isInRange(1, 1, 10, 'score').valid).toBe(true);
    });
    it('passes for max boundary', () => {
      expect(isInRange(10, 1, 10, 'score').valid).toBe(true);
    });
    it('fails below min', () => {
      expect(isInRange(0, 1, 10, 'score').valid).toBe(false);
    });
    it('fails above max', () => {
      expect(isInRange(11, 1, 10, 'score').valid).toBe(false);
    });
  });

  describe('combine', () => {
    it('returns valid when all pass', () => {
      const result = combine(
        required('hello', 'name'),
        isPositiveNumber(5, 'weight'),
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
    it('collects all errors', () => {
      const result = combine(
        required(null, 'name'),
        isPositiveNumber(-1, 'weight'),
      );
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });
});
