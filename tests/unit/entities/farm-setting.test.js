/** @file Entity tests: farm-setting */
import { describe, it, expect } from 'vitest';
import { FIELDS, create, validate, toSupabaseShape, fromSupabaseShape } from '../../../src/entities/farm-setting.js';

describe('entity: farm-setting', () => {
  const FARM_ID = '550e8400-e29b-41d4-a716-446655440000';
  const OP_ID = '660e8400-e29b-41d4-a716-446655440000';

  it('exports FIELDS with all columns', () => {
    const keys = Object.keys(FIELDS);
    expect(keys).toContain('farmId');
    expect(keys).toContain('defaultAuWeightKg');
    expect(keys).toContain('feedDayGoal');
    expect(keys).toContain('forageQualityScaleMin');
    expect(keys).toContain('thresholdCostPerDayWarn');
    expect(keys).toContain('pregCheckMinDaysSinceExposureCattle');
    expect(keys).toContain('pregCheckMinDaysPostCalvingCattle');
    expect(keys).toContain('pregCheckMinDaysSinceExposureSheep');
    expect(keys).toContain('pregCheckMinDaysPostCalvingSheep');
    expect(keys).toContain('pregCheckMinDaysSinceExposureGoat');
    expect(keys).toContain('pregCheckMinDaysPostCalvingGoat');
    expect(keys).toContain('returnToCycleDaysCattle');
    expect(keys).toContain('returnToCycleDaysSheep');
    expect(keys).toContain('returnToCycleDaysGoat');
    // #402 schema 49 (released): farm season default month-days
    for (const k of ['seasonStartMonth', 'seasonStartDay', 'seasonEndMonth', 'seasonEndDay']) expect(keys).toContain(k);
    // OI-0251 schema 50 (held): include archived locations in metrics
    expect(keys).toContain('includeArchivedLocationsInMetrics');
    expect(keys).toHaveLength(40);
  });

  it('every FIELDS entry has sbColumn', () => {
    for (const [key, field] of Object.entries(FIELDS)) {
      expect(field.sbColumn, `${key} missing sbColumn`).toBeDefined();
    }
  });

  describe('create', () => {
    it('returns a record with correct defaults', () => {
      const record = create({ farmId: FARM_ID, operationId: OP_ID });
      expect(record.defaultAuWeightKg).toBe(454);
      expect(record.defaultUtilizationPct).toBe(65);
      expect(record.recoveryRequired).toBe(false);
      expect(record.feedDayGoal).toBe(90);
      expect(record.forageQualityScaleMin).toBe(1);
      expect(record.forageQualityScaleMax).toBe(100);
      expect(record.nPricePerKg).toBe(1.21);
      expect(record.thresholdNpkWarnPerHa).toBeNull();
    });
  });

  describe('validate', () => {
    it('passes for valid record', () => {
      const record = create({ farmId: FARM_ID, operationId: OP_ID });
      expect(validate(record)).toEqual({ valid: true, errors: [] });
    });

    it('fails when farmId is missing', () => {
      const record = create({ operationId: OP_ID });
      expect(validate(record).valid).toBe(false);
    });

    it('fails when operationId is missing', () => {
      const record = create({ farmId: FARM_ID });
      expect(validate(record).valid).toBe(false);
    });
  });

  describe('shape round-trip', () => {
    it('fromSupabaseShape(toSupabaseShape(record)) returns original', () => {
      const record = create({
        farmId: FARM_ID, operationId: OP_ID,
        nPricePerKg: 2.50, feedDayGoal: 120,
        thresholdNpkWarnPerHa: 50, thresholdCostPerDayTarget: 5.0,
      });
      const roundTripped = fromSupabaseShape(toSupabaseShape(record));
      expect(roundTripped).toEqual(record);
    });
  });

  describe('toSupabaseShape', () => {
    it('maps all camelCase to snake_case', () => {
      const record = create({ farmId: FARM_ID, operationId: OP_ID });
      const sb = toSupabaseShape(record);
      expect(sb.farm_id).toBe(FARM_ID);
      expect(sb.operation_id).toBe(OP_ID);
      expect(sb.default_au_weight_kg).toBe(454);
      expect(sb.forage_quality_scale_min).toBe(1);
      expect(sb.feed_day_goal).toBe(90);
    });
  });
});
