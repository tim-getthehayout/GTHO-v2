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
    createdAt: data.createdAt ?? new Date().toISOString(),
    updatedAt: data.updatedAt ?? new Date().toISOString(),
  };
}

export function validate(record) {
  const errors = [];
  if (!record.farmId) errors.push('farmId is required');
  if (!record.operationId) errors.push('operationId is required');
  return { valid: errors.length === 0, errors };
}

export function toSupabaseShape(record) {
  return {
    id: record.id,
    farm_id: record.farmId,
    operation_id: record.operationId,
    default_au_weight_kg: record.defaultAuWeightKg,
    default_residual_height_cm: record.defaultResidualHeightCm,
    default_utilization_pct: record.defaultUtilizationPct,
    recovery_required: record.recoveryRequired,
    default_recovery_min_days: record.defaultRecoveryMinDays,
    default_recovery_max_days: record.defaultRecoveryMaxDays,
    n_price_per_kg: record.nPricePerKg,
    p_price_per_kg: record.pPricePerKg,
    k_price_per_kg: record.kPricePerKg,
    default_manure_rate_kg_per_day: record.defaultManureRateKgPerDay,
    feed_day_goal: record.feedDayGoal,
    forage_quality_scale_min: record.forageQualityScaleMin,
    forage_quality_scale_max: record.forageQualityScaleMax,
    bale_ring_residue_diameter_cm: record.baleRingResidueDiameterCm,
    threshold_aud_target_pct: record.thresholdAudTargetPct,
    threshold_aud_warn_pct: record.thresholdAudWarnPct,
    threshold_rotation_target_pct: record.thresholdRotationTargetPct,
    threshold_rotation_warn_pct: record.thresholdRotationWarnPct,
    threshold_npk_warn_per_ha: record.thresholdNpkWarnPerHa,
    threshold_cost_per_day_target: record.thresholdCostPerDayTarget,
    threshold_cost_per_day_warn: record.thresholdCostPerDayWarn,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  };
}

export function fromSupabaseShape(row) {
  // OI-0106: threshold lex-comparison bug ("100" > "50" is false lex) is
  // particularly nasty here — farm-setting values feed every dashboard badge.
  // All 16 remaining numeric/integer cols coerced; pattern matches event-observation.js.
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
