/**
 * @file Shared unit-aware field descriptor helpers (OI-0111, extracted for OI-0125 / SP-13).
 *
 * The Settings farm section (`renderFarmSection`) pioneered this descriptor
 * pattern for round-trip-safe display/save of metric-stored values. OI-0125
 * reuses it on the new Forage Types sheet, so the helpers live here and are
 * re-imported by both sides. Do not duplicate this logic in a new file.
 *
 * Descriptor shape — keys every field may carry:
 *   - key         : entity key (e.g. 'defaultResidualHeightCm')
 *   - labelKey    : i18n key for the base label (e.g. 'settings.residualHeight')
 *   - labelKeyByUnit: { imperial, metric } — overrides labelKey when the base
 *                   label differs per unit system (OI-0125: DM yield density).
 *   - measureType : null for unitless, or one of the families in `units.js`
 *                   ('weight', 'length', 'dmYieldDensity', …)
 *   - unitLabelKey: i18n key for a static unit suffix (only when measureType
 *                   is null — e.g. '%', 'days', 'kg/t DM')
 *   - inverted    : true for price-per-weight ($/kg ↔ $/lb — divide on display,
 *                   multiply on save)
 *   - currency    : true to compose the label as "label ($/unit)"
 *   - perDay      : true to compose the label as "label (unit/AU/day)"
 *   - displayUnit : 'ft' forces length → ft (bale-ring diameter)
 *   - parenUnitType: override the parenthetical unit. 'weight' for dmYieldDensity
 *                   fields whose base label already embeds "per in per ac".
 *   - precision   : { metric: n, imperial: n } — decimals on display
 *
 * Round-trip rule: `display → save → reload → display` must return the
 * original input at the field's display precision. Stored metric is the full
 * JS float — never rounded or truncated on save.
 */

import { t } from '../../i18n/i18n.js';
import { convert, unitLabel } from '../../utils/units.js';

/** Resolve the base label (honouring `labelKeyByUnit` override). */
function resolveBaseLabel(f, unitSystem) {
  const key = f.labelKeyByUnit?.[unitSystem] ?? f.labelKey;
  return t(key);
}

/** Compose the display label for a field: `"Base (unit)"`. */
export function composeFieldLabel(f, unitSystem) {
  const base = resolveBaseLabel(f, unitSystem);
  if (f.measureType === null) {
    if (!f.unitLabelKey) return base;
    return `${base} (${t(f.unitLabelKey)})`;
  }
  if (f.currency) {
    // $/kg ↔ $/lb — use the weight unit label.
    const wu = unitLabel('weight', unitSystem);
    return `${base} ($/${wu})`;
  }
  if (f.perDay) {
    const wu = unitLabel('weight', unitSystem);
    return `${base} (${wu}/AU/day)`;
  }
  if (f.displayUnit === 'ft') {
    // Metric side still shows cm; imperial side shows ft.
    return unitSystem === 'imperial'
      ? `${base} (${t('unit.ft')})`
      : `${base} (${unitLabel(f.measureType, unitSystem)})`;
  }
  if (f.parenUnitType) {
    // OI-0125: base label already embeds "per in per ac" / "per cm per ha";
    // parenthetical shows just the weight portion ("lbs" / "kg").
    return `${base} (${unitLabel(f.parenUnitType, unitSystem)})`;
  }
  return `${base} (${unitLabel(f.measureType, unitSystem)})`;
}

/** Convert stored metric → user-facing display value. Returns Number or null. */
export function toDisplayValue(storedValue, f, unitSystem) {
  if (storedValue == null) return null;
  if (f.measureType === null) return storedValue;
  if (unitSystem === 'metric') return storedValue;
  // imperial
  if (f.inverted) {
    // $/kg → $/lb: divide stored by factor.
    const factorKgToLbs = convert(1, 'weight', 'toImperial'); // 2.20462
    return storedValue / factorKgToLbs;
  }
  if (f.displayUnit === 'ft') {
    // cm → in → ft.
    return convert(storedValue, f.measureType, 'toImperial') / 12;
  }
  return convert(storedValue, f.measureType, 'toImperial');
}

/** Convert user-facing entered value → stored metric. Returns full JS float. */
export function toStoredValue(inputNumber, f, unitSystem) {
  if (inputNumber == null || isNaN(inputNumber)) return null;
  if (f.measureType === null) return inputNumber;
  if (unitSystem === 'metric') return inputNumber;
  // imperial
  if (f.inverted) {
    // $/lb entered → $/kg stored: multiply by factor.
    const factorKgToLbs = convert(1, 'weight', 'toImperial');
    return inputNumber * factorKgToLbs;
  }
  if (f.displayUnit === 'ft') {
    // ft entered → in → cm.
    return convert(inputNumber * 12, f.measureType, 'toMetric');
  }
  return convert(inputNumber, f.measureType, 'toMetric');
}

/** Format a display value to the field's precision. null → ''. */
export function formatDisplayValue(displayValue, f, unitSystem) {
  if (displayValue == null) return '';
  const decimals = f.precision?.[unitSystem] ?? 1;
  return displayValue.toFixed(decimals);
}

/** Derive the `step` attribute for the input from precision. */
export function stepForField(f, unitSystem) {
  const decimals = f.precision?.[unitSystem] ?? 1;
  if (decimals <= 0) return '1';
  return (1 / Math.pow(10, decimals)).toString();
}
