/** @file Unit conversion tests — all 6 measurement types, bidirectional */
import { describe, it, expect } from 'vitest';
import { convert, display, unitLabel, MEASURE_TYPES } from '../../src/utils/units.js';

describe('units', () => {
  describe('MEASURE_TYPES', () => {
    it('has all 9 measurement types (OI-0278 adds pricePerWeight + nutrientPerDm)', () => {
      expect(MEASURE_TYPES).toEqual(['weight', 'area', 'length', 'temperature', 'volume', 'yieldRate', 'dmYieldDensity', 'pricePerWeight', 'nutrientPerDm']);
    });
  });

  describe('convert — weight', () => {
    it('kg to lbs', () => {
      expect(convert(100, 'weight', 'toImperial')).toBeCloseTo(220.462, 2);
    });
    it('lbs to kg', () => {
      expect(convert(220.462, 'weight', 'toMetric')).toBeCloseTo(100, 1);
    });
  });

  describe('convert — area', () => {
    it('ha to acres', () => {
      expect(convert(1, 'area', 'toImperial')).toBeCloseTo(2.47105, 4);
    });
    it('acres to ha', () => {
      expect(convert(2.47105, 'area', 'toMetric')).toBeCloseTo(1, 4);
    });
  });

  describe('convert — length', () => {
    it('cm to inches', () => {
      expect(convert(100, 'length', 'toImperial')).toBeCloseTo(39.3701, 3);
    });
    it('inches to cm', () => {
      expect(convert(39.3701, 'length', 'toMetric')).toBeCloseTo(100, 1);
    });
  });

  describe('convert — temperature', () => {
    it('0°C to 32°F', () => {
      expect(convert(0, 'temperature', 'toImperial')).toBe(32);
    });
    it('100°C to 212°F', () => {
      expect(convert(100, 'temperature', 'toImperial')).toBe(212);
    });
    it('32°F to 0°C', () => {
      expect(convert(32, 'temperature', 'toMetric')).toBeCloseTo(0, 5);
    });
    it('212°F to 100°C', () => {
      expect(convert(212, 'temperature', 'toMetric')).toBeCloseTo(100, 5);
    });
  });

  describe('convert — volume', () => {
    it('liters to gallons', () => {
      expect(convert(1, 'volume', 'toImperial')).toBeCloseTo(0.264172, 4);
    });
    it('gallons to liters', () => {
      expect(convert(0.264172, 'volume', 'toMetric')).toBeCloseTo(1, 3);
    });
  });

  describe('convert — yieldRate', () => {
    it('kg/ha to lbs/acre', () => {
      expect(convert(1000, 'yieldRate', 'toImperial')).toBeCloseTo(892.179, 1);
    });
    it('lbs/acre to kg/ha', () => {
      expect(convert(892.179, 'yieldRate', 'toMetric')).toBeCloseTo(1000, 0);
    });
  });

  describe('convert — dmYieldDensity (OI-0125 / SP-13)', () => {
    it('lbs/in/ac to kg/cm/ha (toMetric) — 300 lbs/in/ac → 132.36 kg/cm/ha', () => {
      // Reuses the v1-migration constant DM_LBS_IN_AC_TO_KG_CM_HA = 0.4412.
      expect(convert(300, 'dmYieldDensity', 'toMetric')).toBeCloseTo(300 * 0.4412, 4);
    });
    it('kg/cm/ha to lbs/in/ac (toImperial) — round-trip returns original', () => {
      const imperial = 300;
      const metric = convert(imperial, 'dmYieldDensity', 'toMetric');
      const back = convert(metric, 'dmYieldDensity', 'toImperial');
      expect(back).toBeCloseTo(imperial, 6);
    });
    it('unitLabel returns "lbs/in/ac" for imperial, "kg/cm/ha" for metric', () => {
      expect(unitLabel('dmYieldDensity', 'imperial')).toBe('lbs/in/ac');
      expect(unitLabel('dmYieldDensity', 'metric')).toBe('kg/cm/ha');
    });
  });

  describe('convert — pricePerWeight (OI-0278)', () => {
    it('$/kg to $/lb and round-trip returns original', () => {
      expect(convert(2.20462, 'pricePerWeight', 'toImperial')).toBeCloseTo(1, 9);
      for (const x of [0, 0.45, 1, 3.17]) {
        expect(convert(convert(x, 'pricePerWeight', 'toImperial'), 'pricePerWeight', 'toMetric')).toBeCloseTo(x, 9);
        expect(convert(convert(x, 'pricePerWeight', 'toMetric'), 'pricePerWeight', 'toImperial')).toBeCloseTo(x, 9);
      }
    });
  });

  describe('convert — nutrientPerDm (OI-0278 Fa)', () => {
    it('kg/t × 2.0 = lb/ton and round-trip returns original', () => {
      expect(convert(10, 'nutrientPerDm', 'toImperial')).toBe(20);
      expect(convert(20, 'nutrientPerDm', 'toMetric')).toBe(10);
      for (const x of [0, 4.5, 12.3, 30]) {
        expect(convert(convert(x, 'nutrientPerDm', 'toImperial'), 'nutrientPerDm', 'toMetric')).toBeCloseTo(x, 9);
        expect(convert(convert(x, 'nutrientPerDm', 'toMetric'), 'nutrientPerDm', 'toImperial')).toBeCloseTo(x, 9);
      }
    });
  });

  describe('convert — unknown type', () => {
    it('throws for unknown measurement type', () => {
      expect(() => convert(1, 'speed', 'toImperial')).toThrow('Unknown measurement type');
    });
  });

  describe('display', () => {
    it('formats metric weight', () => {
      expect(display(100, 'weight', 'metric', 1)).toBe('100.0 kg');
    });
    it('formats imperial weight', () => {
      expect(display(100, 'weight', 'imperial', 1)).toBe('220.5 lbs');
    });
    it('formats temperature imperial', () => {
      expect(display(0, 'temperature', 'imperial', 0)).toBe('32 °F');
    });
  });

  describe('unitLabel', () => {
    it('returns metric label', () => {
      expect(unitLabel('area', 'metric')).toBe('ha');
    });
    it('returns imperial label', () => {
      expect(unitLabel('area', 'imperial')).toBe('acres');
    });
  });
});
