/** @file Entity tests: user-preference */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/user-preference.js';

describe('entity: user-preference', () => {
  const OP_ID = '550e8400-e29b-41d4-a716-446655440000';
  const USER_ID = '660e8400-e29b-41d4-a716-446655440000';

  it('exports FIELDS with all columns', () => {
    const keys = Object.keys(FIELDS);
    expect(keys).toContain('homeViewMode');
    expect(keys).toContain('fieldModeQuickActions');
    expect(keys).toContain('activeFarmId');
    expect(keys).toHaveLength(10);
  });

  it('every FIELDS entry has sbColumn', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns a record with defaults', () => {
      const record = create({ operationId: OP_ID, userId: USER_ID });
      expect(record.homeViewMode).toBe('groups');
      expect(record.defaultViewMode).toBe('detail');
      expect(record.statPeriodDays).toBe(14);
      expect(record.activeFarmId).toBeNull();
      expect(record.fieldModeQuickActions).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const record = create({ operationId: OP_ID, userId: USER_ID });
      expect(validate(record)).toEqual({ valid: true, errors: [] });
    });

    it('fails when operationId is missing', () => {
      const record = create({ userId: USER_ID });
      expect(validate(record).valid).toBe(false);
    });

    it('fails when userId is missing', () => {
      const record = create({ operationId: OP_ID });
      expect(validate(record).valid).toBe(false);
    });

    it('fails for invalid homeViewMode', () => {
      const record = create({ operationId: OP_ID, userId: USER_ID, homeViewMode: 'grid' });
      expect(validate(record).valid).toBe(false);
    });

    it('fails for invalid defaultViewMode', () => {
      const record = create({ operationId: OP_ID, userId: USER_ID, defaultViewMode: 'compact' });
      expect(validate(record).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('fromSupabaseShape(toSupabaseShape(record)) returns original', () => {
      const record = create({
        operationId: OP_ID, userId: USER_ID,
        homeViewMode: 'locations', defaultViewMode: 'field',
        statPeriodDays: 30,
        fieldModeQuickActions: ['move', 'feed', 'survey'],
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
    });
  });

  describe('shape round-trip with activeFarmId', () => {
    it('preserves activeFarmId through round-trip', () => {
      const farmId = '770e8400-e29b-41d4-a716-446655440000';
      const record = create({
        operationId: OP_ID, userId: USER_ID, activeFarmId: farmId,
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped.activeFarmId).toBe(farmId);
      expect(roundTripped).toEqual(record);
    });
  });

  describe('toSupabaseShape', () => {
    it('maps camelCase to snake_case', () => {
      const record = create({ operationId: OP_ID, userId: USER_ID });
      const sb = toSupabaseShape(record);
      expect(sb.operation_id).toBe(OP_ID);
      expect(sb.user_id).toBe(USER_ID);
      expect(sb.home_view_mode).toBe('groups');
      expect(sb.stat_period_days).toBe(14);
      expect(sb.field_mode_quick_actions).toBeNull();
    });
  });
});
