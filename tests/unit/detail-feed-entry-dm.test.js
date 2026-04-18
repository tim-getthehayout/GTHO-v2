/**
 * @file Tests for the Event Detail §8 feed-entry DM display (OI-0108).
 *
 * The formula (quantity × weight-per-unit × DM%) produces dry matter DELIVERED,
 * not DMI (per-head-per-day intake). These tests cover:
 *   1. Label reads "DM" under imperial
 *   2. Label reads "DM" with kg under metric
 *   3. Em-dash guard when batch is missing weightPerUnitKg
 *   4. Em-dash guard when batch is missing dmPct
 *   5. Legitimate zero: quantity === 0 with valid batch params still shows "0 lbs DM"
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { computeFeedEntryDm } from '../../src/features/events/detail.js';
import { setLocale } from '../../src/i18n/i18n.js';
import enLocale from '../../src/i18n/locales/en.json';

beforeAll(() => {
  setLocale('en', enLocale);
});

function batch(overrides = {}) {
  return { weightPerUnitKg: 500, dmPct: 85, ...overrides };
}

describe('computeFeedEntryDm (OI-0108)', () => {
  it('renders "{N} lbs DM" under imperial for a populated batch', () => {
    // 2 bales × 500 kg × 85% DM = 850 kg DM = ~1874 lbs.
    const { text, missing } = computeFeedEntryDm(2, batch(), 'imperial');
    expect(missing).toBe(false);
    expect(text).toMatch(/DM$/);
    expect(text).toMatch(/lbs DM$/);
    expect(text).toMatch(/1874/);
  });

  it('renders "{N} kg DM" under metric for a populated batch', () => {
    const { text, missing } = computeFeedEntryDm(2, batch(), 'metric');
    expect(missing).toBe(false);
    expect(text).toMatch(/kg DM$/);
    // 2 × 500 × 0.85 = 850 kg
    expect(text).toMatch(/850/);
  });

  it('renders "— lbs DM" when batch is missing weightPerUnitKg', () => {
    const { text, missing } = computeFeedEntryDm(2, batch({ weightPerUnitKg: null }), 'imperial');
    expect(missing).toBe(true);
    expect(text).toBe('— lbs DM');
  });

  it('renders "— lbs DM" when batch is missing dmPct', () => {
    const { text, missing } = computeFeedEntryDm(2, batch({ dmPct: null }), 'imperial');
    expect(missing).toBe(true);
    expect(text).toBe('— lbs DM');
  });

  it('legitimate zero: quantity === 0 with valid batch params shows "0 lbs DM"', () => {
    const { text, missing } = computeFeedEntryDm(0, batch(), 'imperial');
    expect(missing).toBe(false);
    expect(text).toBe('0 lbs DM');
  });

  it('zero-weight batch (weightPerUnitKg === 0) is treated as missing (not silent-zero)', () => {
    const { text, missing } = computeFeedEntryDm(2, batch({ weightPerUnitKg: 0 }), 'imperial');
    expect(missing).toBe(true);
    expect(text).toBe('— lbs DM');
  });

  it('zero-dm batch (dmPct === 0) is treated as missing (not silent-zero)', () => {
    const { text, missing } = computeFeedEntryDm(2, batch({ dmPct: 0 }), 'imperial');
    expect(missing).toBe(true);
    expect(text).toBe('— lbs DM');
  });

  it('undefined batch (batch lookup miss) is treated as missing', () => {
    const { text, missing } = computeFeedEntryDm(2, undefined, 'imperial');
    expect(missing).toBe(true);
    expect(text).toBe('— lbs DM');
  });
});
