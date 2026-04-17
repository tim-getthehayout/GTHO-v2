/** @file Tests for BRC-1 bale ring residue calc */
import { describe, it, expect, beforeAll } from 'vitest';
import { getCalcByName } from '../../src/utils/calc-registry.js';

import '../../src/calcs/survey-bale-ring.js';

describe('BRC-1: Bale Ring Residue Cover', () => {
  let brc1;
  beforeAll(() => { brc1 = getCalcByName('BRC-1'); });

  it('is registered', () => {
    expect(brc1).toBeDefined();
    expect(brc1.name).toBe('BRC-1');
  });

  it('computes correct cover for 14 rings on 0.25 acres at 12ft diameter', () => {
    const result = brc1.fn({ ringCount: 14, ringDiameterFt: 12, paddockAcres: 0.25 });
    expect(result.ringAreaSqFt).toBeCloseTo(113.1, 0);
    expect(result.totalAreaSqFt).toBeCloseTo(1583.4, 0);
    expect(result.computedForageCoverPct).toBeLessThanOrEqual(100);
    expect(result.computedForageCoverPct).toBeGreaterThanOrEqual(0);
  });

  it('returns null cover when no paddock area', () => {
    const result = brc1.fn({ ringCount: 5, ringDiameterFt: 12, paddockAcres: 0 });
    expect(result.coverReducedPct).toBeNull();
    expect(result.computedForageCoverPct).toBeNull();
    expect(result.ringAreaSqFt).toBeCloseTo(113.1, 0);
  });

  it('caps cover reduction at 100%', () => {
    const result = brc1.fn({ ringCount: 1000, ringDiameterFt: 12, paddockAcres: 0.01 });
    expect(result.coverReducedPct).toBe(100);
    expect(result.computedForageCoverPct).toBe(0);
  });

  it('handles zero ring count', () => {
    const result = brc1.fn({ ringCount: 0, ringDiameterFt: 12, paddockAcres: 10 });
    expect(result.totalAreaSqFt).toBe(0);
    expect(result.computedForageCoverPct).toBe(100);
  });

  it('uses default 12ft diameter when not provided', () => {
    const result = brc1.fn({ ringCount: 1, paddockAcres: 1 });
    expect(result.ringAreaSqFt).toBeCloseTo(113.1, 0);
  });
});
