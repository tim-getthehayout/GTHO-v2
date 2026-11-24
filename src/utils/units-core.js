/**
 * @file Unit conversion + the OI-0278 display helper, store-free core.
 * Metric internal, display converted. See V2_INFRASTRUCTURE.md §1.
 * App code imports `./units.js` (same API, default unit system = the farm's
 * `operations.unit_system`). This core has no store import so server-side
 * code (assistant farm reads, OI-0278 S4) can format with an explicit
 * `unitSystem` without pulling the browser store into the edge bundle.
 */

/** Default unit system when a caller passes none; units.js wires the farm's. */
let resolveDefaultUnitSystem = () => 'imperial';

/** @internal units.js only: set the default unit-system resolver. */
export function setDefaultUnitSystemResolver(fn) {
  if (typeof fn === 'function') resolveDefaultUnitSystem = fn;
}

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
  // OI-0278: price per weight — stored $/kg, displayed $/lb on imperial ($/lb = $/kg ÷ 2.20462).
  pricePerWeight: { metric: '$/kg', imperial: '$/lb', factor: 1 / 2.20462 },
  // OI-0278 Fa: forage NPK removal — stored kg/t DM, displayed lb/ton DM on imperial
  // (kg/t × 2.0: 2.20462 lb/kg ÷ 1.10231 short ton/tonne).
  nutrientPerDm: { metric: 'kg/t', imperial: 'lb/ton', factor: 2.0 },
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

// ---------------------------------------------------------------------------
// OI-0278 shared display helper (Ua + Na). Every unit-bearing metric on a user
// screen formats through these. Values in are canonical metric; nothing here
// converts stored data.
// ---------------------------------------------------------------------------

/**
 * Display families. `conv` names the CONVERSIONS entry used for the math;
 * `short` is the Ua short label; `dp` is the default precision.
 * `npk` is a weight with NPK precision (1 dp). `count` has no unit of its own
 * (e.g. AUDs) and is only meaningful per area.
 */
const FAMILIES = {
  weight: { conv: 'weight', short: { metric: 'kg', imperial: 'lb' }, dp: 'weight' },
  npk: { conv: 'weight', short: { metric: 'kg', imperial: 'lb' }, dp: 1 },
  area: { conv: 'area', short: { metric: 'ha', imperial: 'ac' }, dp: 'area' },
  length: { conv: 'length', short: { metric: 'cm', imperial: 'in' }, dp: 1 },
  pricePerWeight: { conv: 'pricePerWeight', short: { metric: '$/kg', imperial: '$/lb' }, dp: 2 },
  nutrientPerDm: { conv: 'nutrientPerDm', short: { metric: 'kg/t', imperial: 'lb/ton' }, dp: 1 },
  count: { conv: null, short: { metric: '', imperial: '' }, dp: 1 },
};

/** Ua short per-area suffix. */
const AREA_SHORT = { metric: 'ha', imperial: 'ac' };

function familyOf(family) {
  const f = FAMILIES[family];
  if (!f) throw new Error(`Unknown display family: ${family}`);
  return f;
}

function systemOf(unitSystem) {
  const us = unitSystem ?? resolveDefaultUnitSystem();
  return us === 'metric' ? 'metric' : 'imperial';
}

/** Default decimals for a converted (display-unit) value. */
function defaultDecimals(fam, value) {
  const abs = Math.abs(value);
  if (fam.dp === 'weight') return abs > 0 && abs < 10 ? 1 : 0;
  if (fam.dp === 'area') return abs > 0 && abs < 1 ? 2 : 1;
  return fam.dp;
}

/**
 * Number text with thousands separators (Na), or compact "12.3k" when asked.
 * @param {number} n
 * @param {number} decimals
 * @param {boolean} compact
 */
function numberText(n, decimals, compact) {
  const abs = Math.abs(n);
  if (compact && abs >= 1000) {
    const [div, suffix] = abs >= 1e6 ? [1e6, 'M'] : [1e3, 'k'];
    const scaled = n / div;
    // 999.95k would print "1000.0k"; roll it to the next suffix.
    if (suffix === 'k' && Math.abs(Number(scaled.toFixed(1))) >= 1000) {
      return `${(n / 1e6).toFixed(1)}M`;
    }
    return `${scaled.toFixed(1)}${suffix}`;
  }
  const text = n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  // Avoid "-0" after rounding a tiny negative.
  return /^-0(\.0+)?$/.test(text) ? text.slice(1) : text;
}

function toDisplayValue(valueMetric, fam, us) {
  if (!fam.conv || us === 'metric') return valueMetric;
  return convert(valueMetric, fam.conv, 'toImperial');
}

function joinUnit(num, unit, family) {
  if (!unit) return num;
  if (family === 'pricePerWeight') {
    // "$0.45/lb" — the currency sign leads the number.
    const neg = num.startsWith('-');
    const per = unit.slice(1); // "/lb"
    return `${neg ? '-' : ''}$${neg ? num.slice(1) : num}${per}`;
  }
  return `${num} ${unit}`;
}

/**
 * OI-0278: format a canonical-metric value in the farm's unit system.
 * @param {number|null|undefined} valueMetric
 * @param {'weight'|'npk'|'area'|'length'|'pricePerWeight'|'nutrientPerDm'|'count'} family
 * @param {{ unitSystem?: 'metric'|'imperial', decimals?: number, compact?: boolean, unitInHeader?: boolean }} [opts]
 *   `unitInHeader`: the column/strip header carries the unit, so return the number only.
 * @returns {string} e.g. "1,234 lb", "12.3k lb" (compact), "1,234" (unitInHeader); null / non-finite → "—"
 */
export function formatMeasure(valueMetric, family, { unitSystem, decimals, compact = false, unitInHeader = false } = {}) {
  const fam = familyOf(family);
  if (valueMetric == null || valueMetric === '' || !Number.isFinite(Number(valueMetric))) return '—';
  const us = systemOf(unitSystem);
  const v = toDisplayValue(Number(valueMetric), fam, us);
  const dp = decimals ?? defaultDecimals(fam, v);
  const num = numberText(v, dp, compact);
  return unitInHeader ? num : joinUnit(num, fam.short[us], family);
}

/**
 * OI-0278: format a per-area value. Input is canonical metric **per hectare**
 * (never per acre). Output "x lb/ac" (imperial) or "x kg/ha" (metric); a
 * `count` family (no unit, e.g. AUDs) gives "x/ac" / "x/ha".
 * `unitInHeader`: the header names the whole unit (e.g. "DMI/ac (lb)"), so
 * return the number only.
 * @param {number|null|undefined} valueMetricPerHa
 * @param {string} family
 * @param {{ unitSystem?: 'metric'|'imperial', decimals?: number, compact?: boolean, unitInHeader?: boolean }} [opts]
 * @returns {string}
 */
export function formatPerArea(valueMetricPerHa, family, { unitSystem, decimals, compact = false, unitInHeader = false } = {}) {
  const fam = familyOf(family);
  if (valueMetricPerHa == null || valueMetricPerHa === '' || !Number.isFinite(Number(valueMetricPerHa))) return '—';
  const us = systemOf(unitSystem);
  let v = toDisplayValue(Number(valueMetricPerHa), fam, us);
  // per ha → per ac: divide by acres per hectare.
  if (us === 'imperial') v /= CONVERSIONS.area.factor;
  const dp = decimals ?? 1;
  const num = numberText(v, dp, compact);
  if (unitInHeader) return num;
  const numer = fam.short[us];
  return numer ? `${num} ${numer}/${AREA_SHORT[us]}` : `${num}/${AREA_SHORT[us]}`;
}

/**
 * OI-0278: header text for a column / strip whose values use `unitInHeader`.
 * @param {string} family
 * @param {'metric'|'imperial'} [unitSystem]
 * @returns {string} e.g. "(lb)", "(kg)", "($/lb)"; "" for a unitless family
 */
export function unitSuffix(family, unitSystem) {
  const fam = familyOf(family);
  const unit = fam.short[systemOf(unitSystem)];
  return unit ? `(${unit})` : '';
}

/**
 * OI-0278 Ua: short unit label for a family ("lb", "ac", "kg/ha" via perArea).
 * @param {string} family
 * @param {'metric'|'imperial'} [unitSystem]
 * @param {{ perArea?: boolean }} [opts]
 * @returns {string}
 */
export function shortUnit(family, unitSystem, { perArea = false } = {}) {
  const fam = familyOf(family);
  const us = systemOf(unitSystem);
  if (!perArea) return fam.short[us];
  return fam.short[us] ? `${fam.short[us]}/${AREA_SHORT[us]}` : `/${AREA_SHORT[us]}`;
}

/** Display families known to the OI-0278 helper. */
export const DISPLAY_FAMILIES = Object.keys(FAMILIES);
