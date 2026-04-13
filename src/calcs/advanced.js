/** @file Advanced calculation registrations — CP-47. 6 formulas (NPK-2, NPK-4, CST-3, REC-1, SUR-1, UNT-2). */

import { registerCalc } from '../utils/calc-registry.js';

// NPK-2: Fertilizer Value
registerCalc({
  name: 'NPK-2',
  category: 'npk',
  description: 'Dollar value of deposited NPK, using date-stamped price history',
  formula: 'value = n_kg × n_price + p_kg × p_price + k_kg × k_price',
  source: 'V2_CALCULATION_SPEC.md §4.1',
  notes: 'v2 fix: uses latest npk_price_history.effective_date ≤ event_date for the farm. Falls back to earliest available row if no history before event date.',
  inputs: [
    { name: 'nKg', type: 'number', unit: 'kg' },
    { name: 'pKg', type: 'number', unit: 'kg' },
    { name: 'kKg', type: 'number', unit: 'kg' },
    { name: 'nPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.n_price_per_kg' },
    { name: 'pPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.p_price_per_kg' },
    { name: 'kPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.k_price_per_kg' },
  ],
  output: { type: 'number', unit: '$' },
  example: {
    inputs: { nKg: 55.4, pKg: 15.7, kKg: 52.0, nPricePerKg: 1.50, pPricePerKg: 2.20, kPricePerKg: 0.90 },
    output: 164.77,
  },
  fn({ nKg, pKg, kKg, nPricePerKg, pPricePerKg, kPricePerKg }) {
    return nKg * nPricePerKg + pKg * pPricePerKg + kKg * kPricePerKg;
  },
});

// NPK-4: Amendment NPK
registerCalc({
  name: 'NPK-4',
  category: 'npk',
  description: 'NPK contribution from fertilizer product or manure application',
  formula: 'n_kg = qty_kg × n_pct/100 (products) or volume_kg × n_composition_pct/100 (manure)',
  source: 'V2_CALCULATION_SPEC.md §4.1',
  notes: 'v2 fix: bag weight configurable per product (not hardcoded 50 lbs). Manure density configurable (default 8.7 lbs/gal for slurry).',
  inputs: [
    { name: 'qtyKg', type: 'number', unit: 'kg' },
    { name: 'nPct', type: 'number', unit: '%' },
    { name: 'pPct', type: 'number', unit: '%' },
    { name: 'kPct', type: 'number', unit: '%' },
  ],
  output: { type: 'object', shape: '{ nKg, pKg, kKg }', unit: 'kg' },
  example: {
    inputs: { qtyKg: 1000, nPct: 10, pPct: 4, kPct: 8 },
    output: { nKg: 100, pKg: 40, kKg: 80 },
  },
  fn({ qtyKg, nPct, pPct, kPct }) {
    return {
      nKg: qtyKg * (nPct / 100),
      pKg: qtyKg * (pPct / 100),
      kKg: qtyKg * (kPct / 100),
    };
  },
});

// CST-3: NPK Value per Event
registerCalc({
  name: 'CST-3',
  category: 'cost',
  description: 'Dollar value of NPK deposited during an event — same as NPK-2 formula with event-date price lookup',
  formula: 'value = n_kg × n_price + p_kg × p_price + k_kg × k_price',
  source: 'V2_CALCULATION_SPEC.md §4.5',
  notes: 'v2 fix: uses event-date price snapshot (same npk_price_history lookup as NPK-2). v1 used current prices for all historical events.',
  inputs: [
    { name: 'nKg', type: 'number', unit: 'kg' },
    { name: 'pKg', type: 'number', unit: 'kg' },
    { name: 'kKg', type: 'number', unit: 'kg' },
    { name: 'nPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.n_price_per_kg' },
    { name: 'pPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.p_price_per_kg' },
    { name: 'kPricePerKg', type: 'number', unit: '$/kg', configKey: 'npk_price_history.k_price_per_kg' },
  ],
  output: { type: 'number', unit: '$' },
  example: {
    inputs: { nKg: 55.4, pKg: 15.7, kKg: 52.0, nPricePerKg: 1.50, pPricePerKg: 2.20, kPricePerKg: 0.90 },
    output: 164.77,
  },
  fn({ nKg, pKg, kKg, nPricePerKg, pPricePerKg, kPricePerKg }) {
    return nKg * nPricePerKg + pKg * pPricePerKg + kKg * kPricePerKg;
  },
});

// REC-1: Recovery Window
registerCalc({
  name: 'REC-1',
  category: 'recovery',
  description: 'When a location is safe to re-graze based on close observation and recovery estimates',
  formula: 'earliest_return = observed_at + recovery_min_days; window_closes = observed_at + recovery_max_days',
  source: 'V2_CALCULATION_SPEC.md §4.8',
  notes: 'Strip grazing: each strip has its own close observation. Whole-paddock readiness = all strips past their minimum recovery window.',
  inputs: [
    { name: 'observedAt', type: 'date', unit: 'ISO date' },
    { name: 'recoveryMinDays', type: 'integer', unit: 'days' },
    { name: 'recoveryMaxDays', type: 'integer', unit: 'days' },
  ],
  output: { type: 'object', shape: '{ earliestReturn, windowCloses }', unit: 'ISO date' },
  example: {
    inputs: { observedAt: '2024-06-01', recoveryMinDays: 21, recoveryMaxDays: 35 },
    output: { earliestReturn: '2024-06-22', windowCloses: '2024-07-06' },
  },
  fn({ observedAt, recoveryMinDays, recoveryMaxDays }) {
    const addDays = (iso, days) => {
      const d = new Date(iso);
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };
    return {
      earliestReturn: addDays(observedAt, recoveryMinDays),
      windowCloses: addDays(observedAt, recoveryMaxDays),
    };
  },
});

// SUR-1: Forage Quality Rating
registerCalc({
  name: 'SUR-1',
  category: 'survey',
  description: 'Color/label classification for a forage quality score (1–100)',
  formula: 'rating = poor (≤30), fair (31-50), good (51-70), excellent (>70)',
  source: 'V2_CALCULATION_SPEC.md §4.9',
  notes: 'Thresholds hardcoded for initial release — standard pasture assessment breakpoints. Post-launch: configurable per farm on farm_settings.',
  inputs: [
    { name: 'forageQuality', type: 'number', unit: '1-100 score' },
  ],
  output: { type: 'object', shape: '{ label, color }', unit: 'classification' },
  example: {
    inputs: { forageQuality: 65 },
    output: { label: 'good', color: 'green' },
  },
  fn({ forageQuality }) {
    if (forageQuality <= 30) return { label: 'poor', color: 'red' };
    if (forageQuality <= 50) return { label: 'fair', color: 'amber' };
    if (forageQuality <= 70) return { label: 'good', color: 'green' };
    return { label: 'excellent', color: 'teal' };
  },
});

// UNT-2: Manure Volume Display
registerCalc({
  name: 'UNT-2',
  category: 'unit',
  description: 'Manure weight to display units using configurable density',
  formula: 'converted = weight_kg / density_kg_per_unit',
  source: 'V2_CALCULATION_SPEC.md §4.10',
  notes: 'v2 fix: water density (1 kg/L) replaced with configurable slurry density (default 8.7 lbs/gal ≈ 1.042 kg/L). Supported units: tonnes, gallons, cubicYards, loads.',
  inputs: [
    { name: 'weightKg', type: 'number', unit: 'kg' },
    { name: 'displayUnit', type: 'string', unit: 'tonnes|gallons|cubicYards|loads' },
    { name: 'densityKgPerL', type: 'number', unit: 'kg/L', notes: 'default 1.042 for slurry (8.7 lbs/gal)' },
    { name: 'loadSizeKg', type: 'number', unit: 'kg', notes: 'required for displayUnit=loads' },
  ],
  output: { type: 'number', unit: 'display unit' },
  example: {
    inputs: { weightKg: 5000, displayUnit: 'tonnes', densityKgPerL: 1.042, loadSizeKg: 0 },
    output: 5,
  },
  fn({ weightKg, displayUnit, densityKgPerL = 1.042, loadSizeKg = 0 }) {
    switch (displayUnit) {
      case 'tonnes':
        return weightKg / 1000;
      case 'gallons': {
        const litres = weightKg / densityKgPerL;
        return litres * 0.264172;
      }
      case 'cubicYards': {
        const litres = weightKg / densityKgPerL;
        return litres * 0.00130795;
      }
      case 'loads':
        return loadSizeKg > 0 ? weightKg / loadSizeKg : 0;
      default:
        return weightKg;
    }
  },
});
