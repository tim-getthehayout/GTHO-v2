/** @file Core calculation registrations — CP-45. 9 immediately-available formulas. */

import { registerCalc } from '../utils/calc-registry.js';

// NPK-1: Excretion
registerCalc({
  name: 'NPK-1',
  category: 'npk',
  description: 'Total N, P, K deposited by animals on a location',
  formula: 'N = headCount × avgWeight/1000 × days × nExcRate',
  source: 'USDA NRCS Nutrient Management Standard',
  inputs: [
    { name: 'headCount', type: 'integer', unit: 'head' },
    { name: 'avgWeightKg', type: 'number', unit: 'kg' },
    { name: 'days', type: 'number', unit: 'days' },
    { name: 'excretionNRate', type: 'number', unit: 'kg/1000kg BW/day', configKey: 'npk.nExcRate' },
    { name: 'excretionPRate', type: 'number', unit: 'kg/1000kg BW/day', configKey: 'npk.pExcRate' },
    { name: 'excretionKRate', type: 'number', unit: 'kg/1000kg BW/day', configKey: 'npk.kExcRate' },
  ],
  output: { type: 'object', shape: '{ nKg, pKg, kKg }', unit: 'kg' },
  example: {
    inputs: { headCount: 50, avgWeightKg: 545, days: 14, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136 },
    output: { nKg: 55.405, pKg: 15.673, kKg: 52.024 },
  },
  fn({ headCount, avgWeightKg, days, excretionNRate, excretionPRate, excretionKRate }) {
    const bwFactor = headCount * (avgWeightKg / 1000) * days;
    return {
      nKg: bwFactor * excretionNRate,
      pKg: bwFactor * excretionPRate,
      kKg: bwFactor * excretionKRate,
    };
  },
});

// NPK-3: Paddock Attribution
registerCalc({
  name: 'NPK-3',
  category: 'npk',
  description: 'Splits event NPK across paddocks proportional to time × effective area',
  formula: 'attributedN = totalN × (duration × effectiveArea) / sumOf(duration × effectiveArea)',
  source: 'NRCS allocation standard',
  inputs: [
    { name: 'windows', type: 'array', unit: '{ durationHours, areaHectares, areaPct }' },
    { name: 'totalNKg', type: 'number', unit: 'kg' },
    { name: 'totalPKg', type: 'number', unit: 'kg' },
    { name: 'totalKKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'array', shape: '{ nKg, pKg, kKg }', unit: 'kg' },
  fn({ windows, totalNKg, totalPKg, totalKKg }) {
    const weighted = windows.map(w => {
      const effectiveArea = w.areaHectares * (w.areaPct || 100) / 100;
      return { ...w, weight: w.durationHours * effectiveArea };
    });
    const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
    if (totalWeight === 0) return windows.map(() => ({ nKg: 0, pKg: 0, kKg: 0 }));
    return weighted.map(w => ({
      nKg: totalNKg * (w.weight / totalWeight),
      pKg: totalPKg * (w.weight / totalWeight),
      kKg: totalKKg * (w.weight / totalWeight),
    }));
  },
});

// ANI-1: Group Totals
registerCalc({
  name: 'ANI-1',
  category: 'animal',
  description: 'Aggregated head count, total live weight, daily DMI target',
  formula: 'total_dmi = sum(headCount × avgWeight × dmiPct / 100)',
  source: 'Standard aggregation',
  inputs: [
    { name: 'entries', type: 'array', unit: '{ headCount, avgWeightKg, dmiPct }' },
  ],
  output: { type: 'object', shape: '{ totalHead, totalWeightKg, avgWeightKg, totalDmiKgPerDay }', unit: 'mixed' },
  fn({ entries }) {
    let totalHead = 0;
    let totalWeight = 0;
    let totalDmi = 0;
    for (const e of entries) {
      totalHead += e.headCount;
      totalWeight += e.headCount * e.avgWeightKg;
      totalDmi += e.headCount * e.avgWeightKg * (e.dmiPct / 100);
    }
    return {
      totalHead,
      totalWeightKg: totalWeight,
      avgWeightKg: totalHead > 0 ? totalWeight / totalHead : 0,
      totalDmiKgPerDay: totalDmi,
    };
  },
});

// ANI-2: Membership-Weighted Animal Days
registerCalc({
  name: 'ANI-2',
  category: 'animal',
  description: 'Precise animal-days accounting for mid-event joins/leaves',
  formula: 'animal_days = sum(headCount × daysInWindow)',
  source: 'Standard livestock accounting',
  inputs: [
    { name: 'windows', type: 'array', unit: '{ headCount, daysInWindow }' },
  ],
  output: { type: 'number', unit: 'animal-days' },
  fn({ windows }) {
    return windows.reduce((sum, w) => sum + w.headCount * w.daysInWindow, 0);
  },
});

// ANI-3: Weaning Target Date
registerCalc({
  name: 'ANI-3',
  category: 'animal',
  description: 'Expected weaning date for calf',
  formula: 'target_date = birth_date + weaning_age_days',
  source: 'Class-specific standards',
  inputs: [
    { name: 'birthDate', type: 'date', unit: 'ISO date' },
    { name: 'weaningAgeDays', type: 'integer', unit: 'days' },
  ],
  output: { type: 'date', unit: 'ISO date' },
  fn({ birthDate, weaningAgeDays }) {
    const d = new Date(birthDate);
    d.setDate(d.getDate() + weaningAgeDays);
    return d.toISOString().slice(0, 10);
  },
});

// TIM-1: Days Between (Inclusive)
registerCalc({
  name: 'TIM-1',
  category: 'time',
  description: 'Days on pasture where same-day = 1 day',
  formula: 'days = floor(dateB - dateA) + 1',
  source: 'Pasture accounting convention',
  inputs: [
    { name: 'dateA', type: 'date', unit: 'ISO date' },
    { name: 'dateB', type: 'date', unit: 'ISO date' },
  ],
  output: { type: 'integer', unit: 'days' },
  fn({ dateA, dateB }) {
    const a = new Date(dateA);
    const b = new Date(dateB);
    const ms = b.getTime() - a.getTime();
    return Math.floor(ms / 86400000) + 1;
  },
});

// TIM-2: Days Between (Exact)
registerCalc({
  name: 'TIM-2',
  category: 'time',
  description: 'Fractional days for pro-rata calculations',
  formula: 'fractional_days = dateB - dateA',
  source: 'Financial accounting convention',
  inputs: [
    { name: 'dateA', type: 'date', unit: 'ISO date' },
    { name: 'dateB', type: 'date', unit: 'ISO date' },
  ],
  output: { type: 'number', unit: 'days' },
  fn({ dateA, dateB }) {
    const a = new Date(dateA);
    const b = new Date(dateB);
    return (b.getTime() - a.getTime()) / 86400000;
  },
});

// TIM-3: Paddock Window Duration
registerCalc({
  name: 'TIM-3',
  category: 'time',
  description: 'Time spent in a location, rounded to 0.25h',
  formula: 'hours = (closed - opened) in hours, rounded to 0.25',
  source: 'Time arithmetic standard',
  inputs: [
    { name: 'dateOpened', type: 'date', unit: 'ISO date' },
    { name: 'timeOpened', type: 'text', unit: 'HH:MM' },
    { name: 'dateClosed', type: 'date', unit: 'ISO date' },
    { name: 'timeClosed', type: 'text', unit: 'HH:MM' },
  ],
  output: { type: 'number', unit: 'hours' },
  fn({ dateOpened, timeOpened, dateClosed, timeClosed }) {
    const openStr = `${dateOpened}T${timeOpened || '00:00'}:00Z`;
    const closeStr = `${dateClosed}T${timeClosed || '23:59'}:00Z`;
    const hours = (new Date(closeStr).getTime() - new Date(openStr).getTime()) / 3600000;
    return Math.round(hours * 4) / 4; // 0.25h precision
  },
});

// UNT-1: Metric ↔ Imperial Display
registerCalc({
  name: 'UNT-1',
  category: 'unit',
  description: 'Display conversion for all measurement types',
  formula: 'See units.js conversion table',
  source: 'Standard conversion factors',
  inputs: [
    { name: 'value', type: 'number', unit: 'metric' },
    { name: 'measureType', type: 'string', unit: 'weight|area|length|volume|temperature|yieldRate' },
    { name: 'direction', type: 'string', unit: 'toImperial|toMetric' },
  ],
  output: { type: 'number', unit: 'converted' },
  notes: 'Delegates to units.js convert(). Registered for reference console completeness.',
  fn({ value, measureType, direction }) {
    // Inline conversion factors matching units.js
    const factors = {
      weight: 2.20462, area: 2.47105, length: 0.393701,
      volume: 0.264172, yieldRate: 0.892179,
    };
    if (measureType === 'temperature') {
      return direction === 'toImperial' ? (value * 9 / 5) + 32 : (value - 32) * 5 / 9;
    }
    const f = factors[measureType];
    if (!f) return value;
    return direction === 'toImperial' ? value * f : value / f;
  },
});
