/** @file Calc registry tests — register, retrieve, category filter */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerCalc, getAllCalcs, getCalcsByCategory, getCalcByName, _clearRegistry,
} from '../../src/utils/calc-registry.js';

const sampleCalc = () => ({
  name: 'testCalc',
  category: 'test',
  description: 'A test calculation',
  formula: 'a + b',
  inputs: [
    { name: 'a', type: 'number', unit: 'kg' },
    { name: 'b', type: 'number', unit: 'kg' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: { inputs: { a: 1, b: 2 }, output: 3 },
  fn: ({ a, b }) => a + b,
});

describe('calc-registry', () => {
  beforeEach(() => {
    _clearRegistry();
  });

  describe('registerCalc', () => {
    it('registers a calculation', () => {
      registerCalc(sampleCalc());
      expect(getAllCalcs()).toHaveLength(1);
    });

    it('throws if name is missing', () => {
      const calc = sampleCalc();
      delete calc.name;
      expect(() => registerCalc(calc)).toThrow('name is required');
    });

    it('throws if category is missing', () => {
      const calc = sampleCalc();
      delete calc.category;
      expect(() => registerCalc(calc)).toThrow('category is required');
    });

    it('throws if fn is missing', () => {
      const calc = sampleCalc();
      delete calc.fn;
      expect(() => registerCalc(calc)).toThrow('fn must be a function');
    });

    it('throws on duplicate name', () => {
      registerCalc(sampleCalc());
      expect(() => registerCalc(sampleCalc())).toThrow('already registered');
    });

    it('freezes registered calc', () => {
      registerCalc(sampleCalc());
      const calc = getCalcByName('testCalc');
      expect(() => { calc.name = 'changed'; }).toThrow();
    });
  });

  describe('getAllCalcs', () => {
    it('returns empty array when none registered', () => {
      expect(getAllCalcs()).toEqual([]);
    });

    it('returns all registered calcs', () => {
      registerCalc(sampleCalc());
      registerCalc({ ...sampleCalc(), name: 'testCalc2', fn: () => 0 });
      expect(getAllCalcs()).toHaveLength(2);
    });
  });

  describe('getCalcsByCategory', () => {
    it('filters by category', () => {
      registerCalc(sampleCalc());
      registerCalc({ ...sampleCalc(), name: 'otherCalc', category: 'other', fn: () => 0 });
      expect(getCalcsByCategory('test')).toHaveLength(1);
      expect(getCalcsByCategory('test')[0].name).toBe('testCalc');
    });

    it('returns empty for unknown category', () => {
      registerCalc(sampleCalc());
      expect(getCalcsByCategory('nonexistent')).toEqual([]);
    });
  });

  describe('getCalcByName', () => {
    it('retrieves by name', () => {
      registerCalc(sampleCalc());
      const calc = getCalcByName('testCalc');
      expect(calc.description).toBe('A test calculation');
    });

    it('returns undefined for unknown name', () => {
      expect(getCalcByName('nope')).toBeUndefined();
    });

    it('fn works correctly', () => {
      registerCalc(sampleCalc());
      const calc = getCalcByName('testCalc');
      expect(calc.fn({ a: 3, b: 4 })).toBe(7);
    });
  });
});
