/**
 * @file Tier 1 numeric-coercion round-trip tests (OI-0106).
 *
 * PostgREST returns PostgreSQL `numeric`/`decimal` columns as JavaScript
 * strings. The d55ba9b hotfix coerced three surfaces (event-feed-entry,
 * event-feed-check-item, feed/check sum) after Tim hit the bug in the field.
 * This sweep extends the pattern to the Tier 1 entities that live on the
 * dashboard/feed/DMI hot paths — feed-check group totals, group-window live
 * recompute, animal weight rollups, farm-setting threshold badges, location
 * area divides, and animal-class DMI/NPK rates.
 *
 * Each test feeds a row with **string** values for every numeric/integer
 * column and asserts `typeof` on the resulting record's fields — proving the
 * entity coerces exactly as `event-observation.js` does.
 */
import { describe, it, expect } from 'vitest';
import * as BatchEntity from '../../src/entities/batch.js';
import * as GroupWindowEntity from '../../src/entities/event-group-window.js';
import * as WeightRecordEntity from '../../src/entities/animal-weight-record.js';
import * as FarmSettingEntity from '../../src/entities/farm-setting.js';
import * as LocationEntity from '../../src/entities/location.js';
import * as AnimalClassEntity from '../../src/entities/animal-class.js';

const UUID = '00000000-0000-0000-0000-0000000000aa';

describe('Tier 1 entities — stringified-numeric → Number round-trip (OI-0106)', () => {
  it('batch.fromSupabaseShape coerces quantity, remaining, weightPerUnitKg, dmPct, costPerUnit', () => {
    const row = {
      id: UUID,
      operation_id: UUID,
      feed_type_id: UUID,
      name: 'Hay',
      batch_number: null,
      source: 'purchase',
      quantity: '42.5',
      remaining: '10',
      unit: 'bale',
      weight_per_unit_kg: '20.25',
      dm_pct: '85',
      cost_per_unit: '12.5',
      archived: false,
    };
    const r = BatchEntity.fromSupabaseShape(row);
    expect(typeof r.quantity).toBe('number');
    expect(r.quantity).toBe(42.5);
    expect(typeof r.remaining).toBe('number');
    expect(typeof r.weightPerUnitKg).toBe('number');
    expect(typeof r.dmPct).toBe('number');
    expect(typeof r.costPerUnit).toBe('number');
    // nullable — null in → null out, not NaN
    const r2 = BatchEntity.fromSupabaseShape({ ...row, weight_per_unit_kg: null, dm_pct: null, cost_per_unit: null });
    expect(r2.weightPerUnitKg).toBeNull();
    expect(r2.dmPct).toBeNull();
    expect(r2.costPerUnit).toBeNull();
  });

  it('batch.validate accepts the round-tripped record (strict typeof passes)', () => {
    // Pre-OI-0106, a stringified quantity silently rejected here — now it survives.
    const row = {
      id: UUID, operation_id: UUID, feed_type_id: UUID, name: 'Hay', source: 'purchase',
      quantity: '10', remaining: '8', unit: 'bale',
    };
    const r = BatchEntity.fromSupabaseShape(row);
    const v = BatchEntity.validate(r);
    expect(v.valid).toBe(true);
  });

  it('event-group-window.fromSupabaseShape coerces headCount + avgWeightKg', () => {
    const row = {
      id: UUID, operation_id: UUID, event_id: UUID, group_id: UUID,
      date_joined: '2026-04-01',
      head_count: '10',
      avg_weight_kg: '450.5',
    };
    const r = GroupWindowEntity.fromSupabaseShape(row);
    expect(typeof r.headCount).toBe('number');
    expect(r.headCount).toBe(10);
    expect(typeof r.avgWeightKg).toBe('number');
    expect(r.avgWeightKg).toBe(450.5);
    // validate uses strict typeof for both — must pass now.
    const v = GroupWindowEntity.validate(r);
    expect(v.valid).toBe(true);
  });

  it('animal-weight-record.fromSupabaseShape coerces weightKg', () => {
    const row = {
      id: UUID, operation_id: UUID, animal_id: UUID,
      recorded_at: '2026-04-01T00:00:00Z',
      weight_kg: '487.3',
      source: 'manual',
    };
    const r = WeightRecordEntity.fromSupabaseShape(row);
    expect(typeof r.weightKg).toBe('number');
    expect(r.weightKg).toBe(487.3);
  });

  it('farm-setting.fromSupabaseShape coerces all 16 numeric threshold + default cols', () => {
    const row = {
      id: UUID, farm_id: UUID, operation_id: UUID,
      default_au_weight_kg: '454',
      default_residual_height_cm: '10',
      default_utilization_pct: '65',
      recovery_required: false,
      default_recovery_min_days: '21',
      default_recovery_max_days: '60',
      n_price_per_kg: '1.21',
      p_price_per_kg: '1.43',
      k_price_per_kg: '0.93',
      default_manure_rate_kg_per_day: '27',
      feed_day_goal: '90',
      forage_quality_scale_min: '1',
      forage_quality_scale_max: '100',
      bale_ring_residue_diameter_cm: '121.92',
      threshold_aud_target_pct: '80',
      threshold_aud_warn_pct: '60',
      threshold_rotation_target_pct: '80',
      threshold_rotation_warn_pct: '60',
      threshold_npk_warn_per_ha: '50',
      threshold_cost_per_day_target: '3',
      threshold_cost_per_day_warn: '5',
    };
    const r = FarmSettingEntity.fromSupabaseShape(row);
    const numericKeys = [
      'defaultAuWeightKg', 'defaultResidualHeightCm', 'defaultUtilizationPct',
      'defaultRecoveryMinDays', 'defaultRecoveryMaxDays',
      'nPricePerKg', 'pPricePerKg', 'kPricePerKg',
      'defaultManureRateKgPerDay', 'feedDayGoal',
      'forageQualityScaleMin', 'forageQualityScaleMax',
      'baleRingResidueDiameterCm',
      'thresholdAudTargetPct', 'thresholdAudWarnPct',
      'thresholdRotationTargetPct', 'thresholdRotationWarnPct',
      'thresholdNpkWarnPerHa',
      'thresholdCostPerDayTarget', 'thresholdCostPerDayWarn',
    ];
    for (const k of numericKeys) {
      expect(typeof r[k], `${k} should be coerced to number`).toBe('number');
    }
  });

  it('farm-setting threshold comparison: numeric > not lex (regression guard)', () => {
    const row = {
      id: UUID, farm_id: UUID, operation_id: UUID,
      threshold_aud_warn_pct: '60',      // lex: "60" > "100" is TRUE (wrong!)
      threshold_aud_target_pct: '100',
    };
    const r = FarmSettingEntity.fromSupabaseShape(row);
    // With coercion, the numeric comparison is correct: 100 > 60.
    expect(r.thresholdAudTargetPct > r.thresholdAudWarnPct).toBe(true);
  });

  it('location.fromSupabaseShape coerces areaHectares + capturePercent', () => {
    const row = {
      id: UUID, operation_id: UUID, farm_id: UUID,
      name: 'North 40', type: 'land', land_use: 'pasture',
      area_hectares: '16.2',
      capture_percent: '75',
    };
    const r = LocationEntity.fromSupabaseShape(row);
    expect(typeof r.areaHectares).toBe('number');
    expect(r.areaHectares).toBe(16.2);
    expect(typeof r.capturePercent).toBe('number');
    // Division-by-string would NaN — exercise the real math path.
    const audPerHa = 10 / r.areaHectares;
    expect(Number.isFinite(audPerHa)).toBe(true);
  });

  it('animal-class.fromSupabaseShape coerces every DMI/NPK/weight/weaning col', () => {
    const row = {
      id: UUID, operation_id: UUID,
      name: 'Cow', species: 'beef_cattle', role: 'cow',
      default_weight_kg: '545',
      dmi_pct: '2.5',
      dmi_pct_lactating: '3.0',
      excretion_n_rate: '0.34',
      excretion_p_rate: '0.092',
      excretion_k_rate: '0.24',
      weaning_age_days: '210',
    };
    const r = AnimalClassEntity.fromSupabaseShape(row);
    for (const k of [
      'defaultWeightKg', 'dmiPct', 'dmiPctLactating',
      'excretionNRate', 'excretionPRate', 'excretionKRate',
      'weaningAgeDays',
    ]) {
      expect(typeof r[k], `${k} should be coerced`).toBe('number');
    }
  });
});
