import { releasedColumns } from '../data/schema-columns.js';
import { RELEASED_SCHEMA_VERSION, ARCHIVED_METRICS_SCHEMA_VERSION, DAIRY_SCHEMA_VERSION } from '../data/schema-release.js';

/** #449 (051) defaults: the column defaults; reads below 51 resolve to these. */
export const DAIRY_DEFAULTS = Object.freeze({
  dairyMode: 'auto',
  milkKgPerL: 1.0305073,
  milkGrazingOffsetDays: 1,
  milkTotalsMode: 'per_pickup',
});
/**
 * #488: the DB DEFAULT of every NOT NULL farm_settings column the app pushes
 * (migrations 001/027/047–051; id/created_at/updated_at are set by create()).
 * Postgres applies DEFAULT only to an omitted key — an explicit null fails
 * NOT NULL (23502) and the whole onboarding farm_settings row is lost — so
 * toSupabaseShape pushes these instead of null (the 050/051 pattern). They equal
 * create()'s defaults and the compute-on-read fallbacks (resolvePregCheckProtocol,
 * resolveReturnToCycleDays, resolveFarmSeason, DAIRY_DEFAULTS), so a pushed
 * default reads back exactly as the unset local value resolved.
 */
export const FARM_SETTINGS_COLUMN_DEFAULTS = Object.freeze({
  defaultAuWeightKg: 454,
  defaultResidualHeightCm: 10,
  defaultUtilizationPct: 65,
  recoveryRequired: false,
  defaultRecoveryMinDays: 21,
  defaultRecoveryMaxDays: 60,
  nPricePerKg: 1.21,
  pPricePerKg: 1.43,
  kPricePerKg: 0.93,
  defaultManureRateKgPerDay: 27,
  feedDayGoal: 90,
  forageQualityScaleMin: 1,
  forageQualityScaleMax: 100,
  thresholdAudTargetPct: 80,
  thresholdAudWarnPct: 60,
  thresholdRotationTargetPct: 80,
  thresholdRotationWarnPct: 60,
  // 047 (Gd)
  pregCheckMinDaysSinceExposureCattle: 35,
  pregCheckMinDaysPostCalvingCattle: 45,
  pregCheckMinDaysSinceExposureSheep: 25,
  pregCheckMinDaysPostCalvingSheep: 30,
  pregCheckMinDaysSinceExposureGoat: 25,
  pregCheckMinDaysPostCalvingGoat: 30,
  // 048 (P-a)
  returnToCycleDaysCattle: 45,
  returnToCycleDaysSheep: 25,
  returnToCycleDaysGoat: 25,
  // 049 (#402): calendar year
  seasonStartMonth: 1,
  seasonStartDay: 1,
  seasonEndMonth: 12,
  seasonEndDay: 31,
  // 050 (OI-0251)
  includeArchivedLocationsInMetrics: true,
  // 051 (#449)
  dairyMode: DAIRY_DEFAULTS.dairyMode,
  milkKgPerL: DAIRY_DEFAULTS.milkKgPerL,
  milkGrazingOffsetDays: DAIRY_DEFAULTS.milkGrazingOffsetDays,
  milkTotalsMode: DAIRY_DEFAULTS.milkTotalsMode,
});
const D = FARM_SETTINGS_COLUMN_DEFAULTS;
/** Released → the record value or the column default (never null); held → value or null (omitted by releasedColumns). */
const sinceRelease = (version, value, fallback) => value ?? (RELEASED_SCHEMA_VERSION >= version ? fallback : null);

const DAIRY_MODES = ['auto', 'on', 'off'];
const MILK_TOTALS_MODES = ['per_pickup', 'spread_daily'];

/** @file Entity: farm_settings — V2_SCHEMA_DESIGN.md §1.3 */

export const FIELDS = {
  id:                          { type: 'uuid',        required: false, sbColumn: 'id' },
  farmId:                      { type: 'uuid',        required: true,  sbColumn: 'farm_id' },
  operationId:                 { type: 'uuid',        required: true,  sbColumn: 'operation_id' },
  defaultAuWeightKg:           { type: 'numeric',     required: false, sbColumn: 'default_au_weight_kg' },
  defaultResidualHeightCm:     { type: 'numeric',     required: false, sbColumn: 'default_residual_height_cm' },
  defaultUtilizationPct:       { type: 'numeric',     required: false, sbColumn: 'default_utilization_pct' },
  recoveryRequired:            { type: 'boolean',     required: false, sbColumn: 'recovery_required' },
  defaultRecoveryMinDays:      { type: 'integer',     required: false, sbColumn: 'default_recovery_min_days' },
  defaultRecoveryMaxDays:      { type: 'integer',     required: false, sbColumn: 'default_recovery_max_days' },
  nPricePerKg:                 { type: 'numeric',     required: false, sbColumn: 'n_price_per_kg' },
  pPricePerKg:                 { type: 'numeric',     required: false, sbColumn: 'p_price_per_kg' },
  kPricePerKg:                 { type: 'numeric',     required: false, sbColumn: 'k_price_per_kg' },
  defaultManureRateKgPerDay:   { type: 'numeric',     required: false, sbColumn: 'default_manure_rate_kg_per_day' },
  feedDayGoal:                 { type: 'integer',     required: false, sbColumn: 'feed_day_goal' },
  forageQualityScaleMin:       { type: 'numeric',     required: false, sbColumn: 'forage_quality_scale_min' },
  forageQualityScaleMax:       { type: 'numeric',     required: false, sbColumn: 'forage_quality_scale_max' },
  baleRingResidueDiameterCm:   { type: 'numeric',     required: false, sbColumn: 'bale_ring_residue_diameter_cm' },
  thresholdAudTargetPct:       { type: 'numeric',     required: false, sbColumn: 'threshold_aud_target_pct' },
  thresholdAudWarnPct:         { type: 'numeric',     required: false, sbColumn: 'threshold_aud_warn_pct' },
  thresholdRotationTargetPct:  { type: 'numeric',     required: false, sbColumn: 'threshold_rotation_target_pct' },
  thresholdRotationWarnPct:    { type: 'numeric',     required: false, sbColumn: 'threshold_rotation_warn_pct' },
  thresholdNpkWarnPerHa:       { type: 'numeric',     required: false, sbColumn: 'threshold_npk_warn_per_ha' },
  thresholdCostPerDayTarget:   { type: 'numeric',     required: false, sbColumn: 'threshold_cost_per_day_target' },
  thresholdCostPerDayWarn:     { type: 'numeric',     required: false, sbColumn: 'threshold_cost_per_day_warn' },
  pregCheckMinDaysSinceExposureCattle: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_since_exposure_cattle' },
  pregCheckMinDaysPostCalvingCattle: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_post_calving_cattle' },
  pregCheckMinDaysSinceExposureSheep: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_since_exposure_sheep' },
  pregCheckMinDaysPostCalvingSheep: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_post_calving_sheep' },
  pregCheckMinDaysSinceExposureGoat: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_since_exposure_goat' },
  pregCheckMinDaysPostCalvingGoat: { type: 'integer', required: false, sbColumn: 'preg_check_min_days_post_calving_goat' },
  returnToCycleDaysCattle: { type: 'integer', required: false, sbColumn: 'return_to_cycle_days_cattle' },
  returnToCycleDaysSheep: { type: 'integer', required: false, sbColumn: 'return_to_cycle_days_sheep' },
  returnToCycleDaysGoat: { type: 'integer', required: false, sbColumn: 'return_to_cycle_days_goat' },
  seasonStartMonth: { type: 'integer', required: false, sbColumn: 'season_start_month' },
  seasonStartDay: { type: 'integer', required: false, sbColumn: 'season_start_day' },
  seasonEndMonth: { type: 'integer', required: false, sbColumn: 'season_end_month' },
  seasonEndDay: { type: 'integer', required: false, sbColumn: 'season_end_day' },
  includeArchivedLocationsInMetrics: { type: 'boolean', required: false, sbColumn: 'include_archived_locations_in_metrics' },
  dairyMode: { type: 'text', required: false, sbColumn: 'dairy_mode' },
  milkKgPerL: { type: 'numeric', required: false, sbColumn: 'milk_kg_per_l' },
  milkGrazingOffsetDays: { type: 'integer', required: false, sbColumn: 'milk_grazing_offset_days' },
  milkTotalsMode: { type: 'text', required: false, sbColumn: 'milk_totals_mode' },
  createdAt:                   { type: 'timestamptz', required: false, sbColumn: 'created_at' },
  updatedAt:                   { type: 'timestamptz', required: false, sbColumn: 'updated_at' },
};

export function create(data = {}) {
  return {
    id: data.id ?? crypto.randomUUID(),
    farmId: data.farmId ?? null,
    operationId: data.operationId ?? null,
    defaultAuWeightKg: data.defaultAuWeightKg ?? 454,
    defaultResidualHeightCm: data.defaultResidualHeightCm ?? 10,
    defaultUtilizationPct: data.defaultUtilizationPct ?? 65,
    recoveryRequired: data.recoveryRequired ?? false,
    defaultRecoveryMinDays: data.defaultRecoveryMinDays ?? 21,
    defaultRecoveryMaxDays: data.defaultRecoveryMaxDays ?? 60,
    nPricePerKg: data.nPricePerKg ?? 1.21,
    pPricePerKg: data.pPricePerKg ?? 1.43,
    kPricePerKg: data.kPricePerKg ?? 0.93,
    defaultManureRateKgPerDay: data.defaultManureRateKgPerDay ?? 27,
    feedDayGoal: data.feedDayGoal ?? 90,
    forageQualityScaleMin: data.forageQualityScaleMin ?? 1,
    forageQualityScaleMax: data.forageQualityScaleMax ?? 100,
    baleRingResidueDiameterCm: data.baleRingResidueDiameterCm ?? 365.76,
    thresholdAudTargetPct: data.thresholdAudTargetPct ?? 80,
    thresholdAudWarnPct: data.thresholdAudWarnPct ?? 60,
    thresholdRotationTargetPct: data.thresholdRotationTargetPct ?? 80,
    thresholdRotationWarnPct: data.thresholdRotationWarnPct ?? 60,
    thresholdNpkWarnPerHa: data.thresholdNpkWarnPerHa ?? null,
    thresholdCostPerDayTarget: data.thresholdCostPerDayTarget ?? null,
    thresholdCostPerDayWarn: data.thresholdCostPerDayWarn ?? null,
    // Schema 47: null if unset; calc/UI use Gd defaults via resolvePregCheckProtocol.
    pregCheckMinDaysSinceExposureCattle: data.pregCheckMinDaysSinceExposureCattle ?? null,
    pregCheckMinDaysPostCalvingCattle: data.pregCheckMinDaysPostCalvingCattle ?? null,
    pregCheckMinDaysSinceExposureSheep: data.pregCheckMinDaysSinceExposureSheep ?? null,
    pregCheckMinDaysPostCalvingSheep: data.pregCheckMinDaysPostCalvingSheep ?? null,
    pregCheckMinDaysSinceExposureGoat: data.pregCheckMinDaysSinceExposureGoat ?? null,
    pregCheckMinDaysPostCalvingGoat: data.pregCheckMinDaysPostCalvingGoat ?? null,
    // Schema 48: null if unset; calcs use P-a defaults via resolveReturnToCycleDays.
    returnToCycleDaysCattle: data.returnToCycleDaysCattle ?? null,
    returnToCycleDaysSheep: data.returnToCycleDaysSheep ?? null,
    returnToCycleDaysGoat: data.returnToCycleDaysGoat ?? null,
    // Schema 49 (#402): null if unset; the season resolves to Jan 1 – Dec 31 via resolveFarmSeason.
    seasonStartMonth: data.seasonStartMonth ?? null,
    seasonStartDay: data.seasonStartDay ?? null,
    seasonEndMonth: data.seasonEndMonth ?? null,
    seasonEndDay: data.seasonEndDay ?? null,
    // Schema 50 (OI-0251 Ap): null if unset → include archived (default true).
    includeArchivedLocationsInMetrics: data.includeArchivedLocationsInMetrics ?? null,
    // Schema 51 (#449): null if unset → DAIRY_DEFAULTS (auto / 8.6 lb/gal / 1 / per_pickup).
    dairyMode: data.dairyMode ?? null,
    milkKgPerL: data.milkKgPerL ?? null,
    milkGrazingOffsetDays: data.milkGrazingOffsetDays ?? null,
    milkTotalsMode: data.milkTotalsMode ?? null,
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.farmId) errors.push('farmId is required');
  if (!record.operationId) errors.push('operationId is required');
  if (record.dairyMode != null && !DAIRY_MODES.includes(record.dairyMode)) errors.push('dairyMode must be auto, on or off');
  if (record.milkKgPerL != null && !(Number.isFinite(Number(record.milkKgPerL)) && Number(record.milkKgPerL) > 0)) errors.push('milkKgPerL must be greater than 0');
  if (record.milkGrazingOffsetDays != null) {
    const d = Number(record.milkGrazingOffsetDays);
    if (!Number.isInteger(d) || d < 0 || d > 14) errors.push('milkGrazingOffsetDays must be a whole number from 0 to 14');
  }
  if (record.milkTotalsMode != null && !MILK_TOTALS_MODES.includes(record.milkTotalsMode)) errors.push('milkTotalsMode must be per_pickup or spread_daily');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    farm_id: record.farmId,
    operation_id: record.operationId,
    default_au_weight_kg: record.defaultAuWeightKg ?? D.defaultAuWeightKg,
    default_residual_height_cm: record.defaultResidualHeightCm ?? D.defaultResidualHeightCm,
    default_utilization_pct: record.defaultUtilizationPct ?? D.defaultUtilizationPct,
    recovery_required: record.recoveryRequired ?? D.recoveryRequired,
    default_recovery_min_days: record.defaultRecoveryMinDays ?? D.defaultRecoveryMinDays,
    default_recovery_max_days: record.defaultRecoveryMaxDays ?? D.defaultRecoveryMaxDays,
    n_price_per_kg: record.nPricePerKg ?? D.nPricePerKg,
    p_price_per_kg: record.pPricePerKg ?? D.pPricePerKg,
    k_price_per_kg: record.kPricePerKg ?? D.kPricePerKg,
    default_manure_rate_kg_per_day: record.defaultManureRateKgPerDay ?? D.defaultManureRateKgPerDay,
    feed_day_goal: record.feedDayGoal ?? D.feedDayGoal,
    forage_quality_scale_min: record.forageQualityScaleMin ?? D.forageQualityScaleMin,
    forage_quality_scale_max: record.forageQualityScaleMax ?? D.forageQualityScaleMax,
    bale_ring_residue_diameter_cm: record.baleRingResidueDiameterCm,
    threshold_aud_target_pct: record.thresholdAudTargetPct ?? D.thresholdAudTargetPct,
    threshold_aud_warn_pct: record.thresholdAudWarnPct ?? D.thresholdAudWarnPct,
    threshold_rotation_target_pct: record.thresholdRotationTargetPct ?? D.thresholdRotationTargetPct,
    threshold_rotation_warn_pct: record.thresholdRotationWarnPct ?? D.thresholdRotationWarnPct,
    // Nullable columns: null is a valid "unset".
    threshold_npk_warn_per_ha: record.thresholdNpkWarnPerHa,
    threshold_cost_per_day_target: record.thresholdCostPerDayTarget,
    threshold_cost_per_day_warn: record.thresholdCostPerDayWarn,
    // #488: 047–049 are NOT NULL DEFAULT — once released, unset pushes the column
    // default, never null (a null here failed every onboarding farm_settings insert).
    // Below each version the values stay null → omitted.
    ...releasedColumns(47, {
      preg_check_min_days_since_exposure_cattle: sinceRelease(47, record.pregCheckMinDaysSinceExposureCattle, D.pregCheckMinDaysSinceExposureCattle),
      preg_check_min_days_post_calving_cattle: sinceRelease(47, record.pregCheckMinDaysPostCalvingCattle, D.pregCheckMinDaysPostCalvingCattle),
      preg_check_min_days_since_exposure_sheep: sinceRelease(47, record.pregCheckMinDaysSinceExposureSheep, D.pregCheckMinDaysSinceExposureSheep),
      preg_check_min_days_post_calving_sheep: sinceRelease(47, record.pregCheckMinDaysPostCalvingSheep, D.pregCheckMinDaysPostCalvingSheep),
      preg_check_min_days_since_exposure_goat: sinceRelease(47, record.pregCheckMinDaysSinceExposureGoat, D.pregCheckMinDaysSinceExposureGoat),
      preg_check_min_days_post_calving_goat: sinceRelease(47, record.pregCheckMinDaysPostCalvingGoat, D.pregCheckMinDaysPostCalvingGoat),
    }),
    ...releasedColumns(48, {
      return_to_cycle_days_cattle: sinceRelease(48, record.returnToCycleDaysCattle, D.returnToCycleDaysCattle),
      return_to_cycle_days_sheep: sinceRelease(48, record.returnToCycleDaysSheep, D.returnToCycleDaysSheep),
      return_to_cycle_days_goat: sinceRelease(48, record.returnToCycleDaysGoat, D.returnToCycleDaysGoat),
    }),
    ...releasedColumns(49, {
      season_start_month: sinceRelease(49, record.seasonStartMonth, D.seasonStartMonth),
      season_start_day: sinceRelease(49, record.seasonStartDay, D.seasonStartDay),
      season_end_month: sinceRelease(49, record.seasonEndMonth, D.seasonEndMonth),
      season_end_day: sinceRelease(49, record.seasonEndDay, D.seasonEndDay),
    }),
    ...releasedColumns(ARCHIVED_METRICS_SCHEMA_VERSION, {
      // NOT NULL DEFAULT true: once released, unset pushes the locked default
      // (include), never null (Design null-push ruling). Below 50 it stays null → omitted.
      include_archived_locations_in_metrics: sinceRelease(ARCHIVED_METRICS_SCHEMA_VERSION,
        record.includeArchivedLocationsInMetrics, D.includeArchivedLocationsInMetrics),
    }),
    // #449 (051): NOT NULL with defaults — once released, unset pushes the column
    // default, never null. Below 51 the values stay null → omitted.
    ...releasedColumns(DAIRY_SCHEMA_VERSION, {
      dairy_mode: sinceRelease(DAIRY_SCHEMA_VERSION, record.dairyMode, D.dairyMode),
      milk_kg_per_l: sinceRelease(DAIRY_SCHEMA_VERSION, record.milkKgPerL, D.milkKgPerL),
      milk_grazing_offset_days: sinceRelease(DAIRY_SCHEMA_VERSION, record.milkGrazingOffsetDays, D.milkGrazingOffsetDays),
      milk_totals_mode: sinceRelease(DAIRY_SCHEMA_VERSION, record.milkTotalsMode, D.milkTotalsMode),
    }),
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: threshold lex-comparison bug ("100" > "50" is false lex) is
  // particularly nasty here — farm-setting values feed every dashboard badge.
  // All 16 remaining numeric/integer cols coerced; pattern matches paddock-observation.js.
  const n = (v) => v != null ? Number(v) : null;
  return {
    id: row.id,
    farmId: row.farm_id,
    operationId: row.operation_id,
    defaultAuWeightKg: n(row.default_au_weight_kg),
    defaultResidualHeightCm: n(row.default_residual_height_cm),
    defaultUtilizationPct: n(row.default_utilization_pct),
    recoveryRequired: row.recovery_required,
    defaultRecoveryMinDays: n(row.default_recovery_min_days),
    defaultRecoveryMaxDays: n(row.default_recovery_max_days),
    nPricePerKg: n(row.n_price_per_kg),
    pPricePerKg: n(row.p_price_per_kg),
    kPricePerKg: n(row.k_price_per_kg),
    defaultManureRateKgPerDay: n(row.default_manure_rate_kg_per_day),
    feedDayGoal: n(row.feed_day_goal),
    forageQualityScaleMin: n(row.forage_quality_scale_min),
    forageQualityScaleMax: n(row.forage_quality_scale_max),
    baleRingResidueDiameterCm: n(row.bale_ring_residue_diameter_cm),
    thresholdAudTargetPct: n(row.threshold_aud_target_pct),
    thresholdAudWarnPct: n(row.threshold_aud_warn_pct),
    thresholdRotationTargetPct: n(row.threshold_rotation_target_pct),
    thresholdRotationWarnPct: n(row.threshold_rotation_warn_pct),
    thresholdNpkWarnPerHa: n(row.threshold_npk_warn_per_ha),
    thresholdCostPerDayTarget: n(row.threshold_cost_per_day_target),
    thresholdCostPerDayWarn: n(row.threshold_cost_per_day_warn),
    pregCheckMinDaysSinceExposureCattle: n(row.preg_check_min_days_since_exposure_cattle),
    pregCheckMinDaysPostCalvingCattle: n(row.preg_check_min_days_post_calving_cattle),
    pregCheckMinDaysSinceExposureSheep: n(row.preg_check_min_days_since_exposure_sheep),
    pregCheckMinDaysPostCalvingSheep: n(row.preg_check_min_days_post_calving_sheep),
    pregCheckMinDaysSinceExposureGoat: n(row.preg_check_min_days_since_exposure_goat),
    pregCheckMinDaysPostCalvingGoat: n(row.preg_check_min_days_post_calving_goat),
    returnToCycleDaysCattle: n(row.return_to_cycle_days_cattle),
    returnToCycleDaysSheep: n(row.return_to_cycle_days_sheep),
    returnToCycleDaysGoat: n(row.return_to_cycle_days_goat),
    // Absent before 049 is applied → null → Jan 1 – Dec 31 fallback.
    seasonStartMonth: n(row.season_start_month),
    seasonStartDay: n(row.season_start_day),
    seasonEndMonth: n(row.season_end_month),
    seasonEndDay: n(row.season_end_day),
    // Schema 50: read only once released, so a pre-release pull (column applied,
    // ceiling still below 50) never feeds an unreleased write. Absent → null → true.
    includeArchivedLocationsInMetrics: RELEASED_SCHEMA_VERSION >= ARCHIVED_METRICS_SCHEMA_VERSION
      && row.include_archived_locations_in_metrics != null
      ? row.include_archived_locations_in_metrics === true || row.include_archived_locations_in_metrics === 'true'
      : null,
    // Schema 51 (#449): read only once released; absent/below 51 → null → DAIRY_DEFAULTS.
    ...(RELEASED_SCHEMA_VERSION >= DAIRY_SCHEMA_VERSION
      ? {
        dairyMode: row.dairy_mode ?? null,
        milkKgPerL: n(row.milk_kg_per_l),
        milkGrazingOffsetDays: n(row.milk_grazing_offset_days),
        milkTotalsMode: row.milk_totals_mode ?? null,
      }
      : { dairyMode: null, milkKgPerL: null, milkGrazingOffsetDays: null, milkTotalsMode: null }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** #449: resolved dairy settings for a farm_settings record (null-safe defaults). */
export function resolveDairySettings(fs) {
  const kg = Number(fs?.milkKgPerL);
  const off = Number(fs?.milkGrazingOffsetDays);
  return {
    dairyMode: DAIRY_MODES.includes(fs?.dairyMode) ? fs.dairyMode : DAIRY_DEFAULTS.dairyMode,
    milkKgPerL: Number.isFinite(kg) && kg > 0 ? kg : DAIRY_DEFAULTS.milkKgPerL,
    milkGrazingOffsetDays: fs?.milkGrazingOffsetDays != null && Number.isInteger(off) && off >= 0 && off <= 14 ? off : DAIRY_DEFAULTS.milkGrazingOffsetDays,
    milkTotalsMode: MILK_TOTALS_MODES.includes(fs?.milkTotalsMode) ? fs.milkTotalsMode : DAIRY_DEFAULTS.milkTotalsMode,
  };
}
