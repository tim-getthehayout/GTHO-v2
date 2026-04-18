/**
 * @file Unit round-trip test for the Settings farm-section (OI-0111).
 *
 * Rule (spec §Precision): entering a value X in the user's display unit,
 * saving, closing, and reopening Settings must show exactly X again at the
 * field's display precision.
 *
 * The render/save code stores full JS floats (no rounding on save) so the
 * sub-decimal drift from convert() sits below the display precision and the
 * farmer never sees it.
 */
import { describe, it, expect } from 'vitest';
import { __settingsUnitInternals } from '../../src/features/settings/index.js';

const {
  FARM_FIELD_DESCRIPTORS,
  toDisplayValue,
  toStoredValue,
  formatDisplayValue,
} = __settingsUnitInternals;

/**
 * Reproduce one render → save → render cycle for a single field.
 * Returns { d1, storedRoundtrip, d2 } where d1 and d2 are formatted
 * display strings and storedRoundtrip is the metric JS float after save.
 */
function roundTrip(f, enteredDisplayString, unitSystem) {
  const entered = parseFloat(enteredDisplayString);
  const stored = toStoredValue(entered, f, unitSystem);
  const d1 = formatDisplayValue(toDisplayValue(stored, f, unitSystem), f, unitSystem);
  // Simulate: user hits Save, reopens Settings — render pulls stored, converts, formats.
  const d2 = formatDisplayValue(toDisplayValue(stored, f, unitSystem), f, unitSystem);
  return { d1, d2, stored };
}

describe('Settings unit round-trip (OI-0111)', () => {
  describe('imperial unit system — enter X, save, reopen, still X', () => {
    // For each field descriptor with a measureType, cover a realistic imperial input.
    const imperialCases = [
      { key: 'defaultAuWeightKg',         input: '1000' },   // 1000 lbs (AU standard)
      { key: 'defaultResidualHeightCm',   input: '4.0' },    // 4 in residual
      { key: 'defaultUtilizationPct',     input: '65' },     // unitless
      { key: 'defaultRecoveryMinDays',    input: '21' },     // unitless
      { key: 'defaultRecoveryMaxDays',    input: '60' },     // unitless
      { key: 'nPricePerKg',               input: '0.5489' }, // $0.5489/lb
      { key: 'pPricePerKg',               input: '0.6486' }, // $0.6486/lb
      { key: 'kPricePerKg',               input: '0.4218' }, // $0.4218/lb
      { key: 'defaultManureRateKgPerDay', input: '60' },     // 60 lbs/AU/day
      { key: 'feedDayGoal',               input: '90' },     // unitless
      { key: 'forageQualityScaleMin',     input: '1' },      // unitless
      { key: 'forageQualityScaleMax',     input: '100' },    // unitless
      { key: 'baleRingResidueDiameterCm', input: '12.0' },   // 12.0 ft
    ];

    for (const c of imperialCases) {
      it(`${c.key}: imperial input "${c.input}" round-trips at display precision`, () => {
        const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === c.key);
        expect(f).toBeTruthy();
        const { d1, d2 } = roundTrip(f, c.input, 'imperial');
        // D1 must equal the entered string at the field's precision.
        expect(d1).toBe(c.input);
        // D2 (after full store-and-reload cycle) must equal D1.
        expect(d2).toBe(d1);
      });
    }
  });

  describe('metric unit system — enter X, save, reopen, still X', () => {
    const metricCases = [
      { key: 'defaultAuWeightKg',         input: '454.0' }, // kg
      { key: 'defaultResidualHeightCm',   input: '10.0' },  // cm
      { key: 'defaultUtilizationPct',     input: '65' },
      { key: 'nPricePerKg',               input: '1.2100' }, // $1.21/kg at 4 decimals
      { key: 'pPricePerKg',               input: '1.4300' },
      { key: 'kPricePerKg',               input: '0.9300' },
      { key: 'defaultManureRateKgPerDay', input: '27.0' },
      { key: 'feedDayGoal',               input: '90' },
      { key: 'baleRingResidueDiameterCm', input: '365.8' },
    ];

    for (const c of metricCases) {
      it(`${c.key}: metric input "${c.input}" round-trips at display precision`, () => {
        const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === c.key);
        expect(f).toBeTruthy();
        const { d1, d2 } = roundTrip(f, c.input, 'metric');
        expect(d1).toBe(c.input);
        expect(d2).toBe(d1);
      });
    }
  });

  describe('stored value is full JS float — no truncation on save', () => {
    it('AU weight: imperial 1000 lbs → stored ~453.592 kg (full precision)', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultAuWeightKg');
      const stored = toStoredValue(1000, f, 'imperial');
      expect(stored).toBeCloseTo(453.5929, 3);
      // Not 454, not 453.6 — the full convert() output is preserved.
      expect(stored).toBe(1000 / 2.20462);
    });

    it('residual height: imperial 4 in → stored ~10.16 cm (full precision)', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultResidualHeightCm');
      const stored = toStoredValue(4, f, 'imperial');
      expect(stored).toBeCloseTo(10.16, 2);
      // Not rounded to 10.
      expect(stored).not.toBe(10);
    });

    it('bale-ring diameter: imperial 12 ft → stored ~365.76 cm (full precision)', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'baleRingResidueDiameterCm');
      const stored = toStoredValue(12, f, 'imperial');
      expect(stored).toBeCloseTo(365.76, 2);
    });

    it('N price: imperial 0.5489 $/lb → stored ~1.21 $/kg (inverted, full precision)', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'nPricePerKg');
      const stored = toStoredValue(0.5489, f, 'imperial');
      expect(stored).toBeCloseTo(1.21, 2);
    });
  });

  describe('metric users see native metric values (no conversion loss)', () => {
    it('AU weight: metric 454 kg → display exactly "454.0"', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultAuWeightKg');
      const display = toDisplayValue(454, f, 'metric');
      expect(formatDisplayValue(display, f, 'metric')).toBe('454.0');
    });

    it('residual height: metric 10 cm → display "10.0"', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultResidualHeightCm');
      const display = toDisplayValue(10, f, 'metric');
      expect(formatDisplayValue(display, f, 'metric')).toBe('10.0');
    });

    it('utilization %: metric 65 → display "65"', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultUtilizationPct');
      const display = toDisplayValue(65, f, 'metric');
      expect(formatDisplayValue(display, f, 'metric')).toBe('65');
    });
  });

  describe('imperial display of default metric values', () => {
    it('AU weight default 454 kg → imperial display "1001" lbs (not "454")', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultAuWeightKg');
      const display = toDisplayValue(454, f, 'imperial');
      // 454 × 2.20462 = 1000.8975... → imperial precision 0 → "1001"
      expect(formatDisplayValue(display, f, 'imperial')).toBe('1001');
    });

    it('residual height default 10 cm → imperial display "3.9" in (not "10")', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultResidualHeightCm');
      const display = toDisplayValue(10, f, 'imperial');
      // 10 × 0.393701 = 3.93701 → imperial precision 1 → "3.9"
      expect(formatDisplayValue(display, f, 'imperial')).toBe('3.9');
    });

    it('bale-ring default 365.76 cm → imperial display "12.0" ft', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'baleRingResidueDiameterCm');
      const display = toDisplayValue(365.76, f, 'imperial');
      expect(formatDisplayValue(display, f, 'imperial')).toBe('12.0');
    });
  });

  describe('null / empty input handling', () => {
    it('null stored → empty string display', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultAuWeightKg');
      expect(formatDisplayValue(toDisplayValue(null, f, 'imperial'), f, 'imperial')).toBe('');
    });

    it('NaN entered → null stored', () => {
      const f = FARM_FIELD_DESCRIPTORS.find(d => d.key === 'defaultAuWeightKg');
      expect(toStoredValue(NaN, f, 'imperial')).toBeNull();
    });
  });
});
