/** @file OI-0145 — audit-units helper: 3-mode persistence + formatting.
 *
 * Acceptance criteria coverage:
 *   - all three modes round-trip a known weight (540 kg)
 *   - unitless inputs render unchanged across modes
 *   - mode persists across page navigation via localStorage
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAuditUnitMode,
  setAuditUnitMode,
  formatAuditValue,
  formatAuditDmPerDay,
  formatAuditDmTotal,
  VALID_MODES,
  DEFAULT_MODE,
} from '../../../src/features/dev-mode/audit-units.js';

beforeEach(() => {
  localStorage.clear();
});

describe('audit-units mode persistence (OI-0145)', () => {
  it('defaults to metric on first read', () => {
    expect(getAuditUnitMode()).toBe(DEFAULT_MODE);
    expect(getAuditUnitMode()).toBe('metric');
  });

  it('persists each valid mode to localStorage', () => {
    for (const mode of VALID_MODES) {
      setAuditUnitMode(mode);
      expect(localStorage.getItem('dev-audit-unit-mode')).toBe(mode);
      expect(getAuditUnitMode()).toBe(mode);
    }
  });

  it('rejects invalid modes', () => {
    expect(() => setAuditUnitMode('foo')).toThrow();
    expect(() => setAuditUnitMode('imperial')).toThrow();
  });

  it('falls back to metric when localStorage holds an unrecognized value', () => {
    localStorage.setItem('dev-audit-unit-mode', 'random-junk');
    expect(getAuditUnitMode()).toBe('metric');
  });

  it('mode survives a re-read (simulates navigation)', () => {
    setAuditUnitMode('hybrid');
    // Simulate "navigate away and back" — fresh getAuditUnitMode call.
    expect(getAuditUnitMode()).toBe('hybrid');
  });
});

describe('formatAuditValue — known weight 540 kg round-trips all 3 modes', () => {
  it('metric renders 540 kg', () => {
    setAuditUnitMode('metric');
    expect(formatAuditValue(540, 'weight')).toBe('540.00 kg');
  });

  it('standard converts 540 kg to lbs', () => {
    setAuditUnitMode('standard');
    // 540 × 2.20462 = 1190.4948
    expect(formatAuditValue(540, 'weight')).toBe('1190.49 lbs');
  });

  it('hybrid returns { primary, secondary } pair', () => {
    setAuditUnitMode('hybrid');
    expect(formatAuditValue(540, 'weight')).toEqual({
      primary: '540.00 kg',
      secondary: '1190.49 lbs',
    });
  });
});

describe('formatAuditValue — unitless values unchanged across modes', () => {
  for (const mode of VALID_MODES) {
    it(`mode=${mode} renders integers / strings / null unchanged`, () => {
      setAuditUnitMode(mode);
      expect(formatAuditValue(25)).toBe('25.00');
      expect(formatAuditValue('actual')).toBe('actual');
      expect(formatAuditValue(null)).toBe('—');
    });
  }
});

describe('formatAuditValue — null / NaN / missing measure-typed value', () => {
  it('returns em-dash for null with measureType', () => {
    setAuditUnitMode('metric');
    expect(formatAuditValue(null, 'weight')).toBe('—');
  });
  it('returns em-dash for NaN with measureType', () => {
    setAuditUnitMode('metric');
    expect(formatAuditValue(Number.NaN, 'weight')).toBe('—');
  });
});

describe('formatAuditDmPerDay / formatAuditDmTotal — DM suffixes', () => {
  it('appends DM/day suffix in metric mode', () => {
    setAuditUnitMode('metric');
    expect(formatAuditDmPerDay(337.5)).toBe('337.50 kg DM/day');
  });

  it('hybrid mode keeps DM/day on both halves', () => {
    setAuditUnitMode('hybrid');
    expect(formatAuditDmPerDay(337.5)).toEqual({
      primary: '337.50 kg DM/day',
      secondary: '744.06 lbs DM/day',
    });
  });

  it('standard converts and appends DM suffix on totals', () => {
    setAuditUnitMode('standard');
    expect(formatAuditDmTotal(1000)).toBe('2204.62 lbs DM');
  });
});
