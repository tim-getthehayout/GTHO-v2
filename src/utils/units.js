/** @file Unit conversion — metric internal, display converted. See V2_INFRASTRUCTURE.md §1. */

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
