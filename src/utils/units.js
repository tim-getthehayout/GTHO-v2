/** @file Unit conversion — metric internal, display converted. See V2_INFRASTRUCTURE.md §1. */

/**
 * dm_lbs_per_inch_per_acre → dm_kg_per_cm_per_ha
 * Factor: (lbs→kg) / (inch→cm) / (acre→ha) = 0.453592 / 2.54 / 0.404686 ≈ 0.4412.
 * Same constant as `v1-migration.js` — do not drift; OI-0125 reuses it.
 */
export const DM_LBS_IN_AC_TO_KG_CM_HA = 0.4412;

/**
 * Conversion factors: metric → imperial.
 * All values stored metric. Multiply by factor to get imperial.
 */
const CONVERSIONS = {
  weight: { metric: 'kg', imperial: 'lbs', factor: 2.20462 },
  area: { metric: 'ha', imperial: 'acres', factor: 2.47105 },
  length: { metric: 'cm', imperial: 'in', factor: 0.393701 },
  temperature: { metric: '°C', imperial: '°F', toImperial: (c) => (c * 9 / 5) + 32, toMetric: (f) => (f - 32) * 5 / 9 },
  volume: { metric: 'L', imperial: 'gal', factor: 0.264172 },
  yieldRate: { metric: 'kg/ha', imperial: 'lbs/acre', factor: 0.892179 },
  // OI-0125 / SP-13: DM yield density — stored kg/cm/ha, displayed lbs/in/ac.
  // `factor` is metric→imperial, so it's the inverse of DM_LBS_IN_AC_TO_KG_CM_HA.
  dmYieldDensity: { metric: 'kg/cm/ha', imperial: 'lbs/in/ac', factor: 1 / DM_LBS_IN_AC_TO_KG_CM_HA },
};

/**
 * Convert a value between metric and imperial.
 * @param {number} value
 * @param {string} measureType - One of: weight, area, length, temperature, volume, yieldRate
 * @param {'toImperial'|'toMetric'} direction
 * @returns {number}
 */
export function convert(value, measureType, direction) {
  const conv = CONVERSIONS[measureType];
  if (!conv) {
    throw new Error(`Unknown measurement type: ${measureType}`);
  }

  if (measureType === 'temperature') {
    return direction === 'toImperial' ? conv.toImperial(value) : conv.toMetric(value);
  }

  if (direction === 'toImperial') {
    return value * conv.factor;
  }
  return value / conv.factor;
}

/**
 * Format a value for display in the user's preferred unit system.
 * @param {number} value - Value in metric (internal)
 * @param {string} measureType - One of: weight, area, length, temperature, volume, yieldRate
 * @param {'metric'|'imperial'} unitSystem
 * @param {number} [decimals=2]
 * @returns {string} Formatted string with unit label
 */
export function display(value, measureType, unitSystem, decimals = 2) {
  const conv = CONVERSIONS[measureType];
  if (!conv) {
    throw new Error(`Unknown measurement type: ${measureType}`);
  }

  if (unitSystem === 'imperial') {
    const converted = convert(value, measureType, 'toImperial');
    return `${converted.toFixed(decimals)} ${conv.imperial}`;
  }

  return `${value.toFixed(decimals)} ${conv.metric}`;
}

/**
 * Get the unit label for a measurement type and unit system.
 * @param {string} measureType
 * @param {'metric'|'imperial'} unitSystem
 * @returns {string}
 */
export function unitLabel(measureType, unitSystem) {
  const conv = CONVERSIONS[measureType];
  if (!conv) {
    throw new Error(`Unknown measurement type: ${measureType}`);
  }
  return unitSystem === 'imperial' ? conv.imperial : conv.metric;
}

/** All supported measurement types */
export const MEASURE_TYPES = Object.keys(CONVERSIONS);
