/** @file Feed/forage calculation registrations — CP-46/CP-54. 21 formulas (DMI, FOR, CST, FED domains). */

import { registerCalc } from '../utils/calc-registry.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from './window-helpers.js';

// DMI-1: Consumed DM from Feed
registerCalc({
  name: 'DMI-1',
  category: 'dmi',
  description: 'Total DM consumed from stored feed, adjusted for residual',
  formula: 'consumed_dm = sum(qty × dm_pct/100) - remaining_dm',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  notes: 'v2 fix: residual applied by check date, not array index. event_feed_check_items are time-filtered.',
  inputs: [
    { name: 'entries', type: 'array', unit: '{ qtyKg, dmPct }' },
    { name: 'remainingDmKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: { entries: [{ qtyKg: 100, dmPct: 88 }, { qtyKg: 50, dmPct: 90 }], remainingDmKg: 10 },
    output: 117,
  },
  fn({ entries, remainingDmKg }) {
    const totalDelivered = entries.reduce((sum, e) => sum + e.qtyKg * (e.dmPct / 100), 0);
    return totalDelivered - remainingDmKg;
  },
});

// DMI-1a: startedUnits Display
registerCalc({
  name: 'DMI-1a',
  category: 'dmi',
  description: '"Started: X units" shown on feed check sheet — last check remaining + new entries since check',
  formula: 'started_units = last_check_remaining + new_entries_since_check',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  notes: 'v2 fix: was all-time cumulative. Display with .toFixed(1). Both main sheet AND move wizard must implement.',
  inputs: [
    { name: 'lastCheckRemaining', type: 'number', unit: 'units' },
    { name: 'newEntriesSinceCheck', type: 'number', unit: 'units' },
  ],
  output: { type: 'number', unit: 'units (display .toFixed(1))' },
  example: {
    inputs: { lastCheckRemaining: 3.5, newEntriesSinceCheck: 2 },
    output: 5.5,
  },
  fn({ lastCheckRemaining, newEntriesSinceCheck }) {
    return lastCheckRemaining + newEntriesSinceCheck;
  },
});

// DMI-2: Daily DMI Target
registerCalc({
  name: 'DMI-2',
  category: 'dmi',
  description: 'Total daily DM demand for a group, lactation-aware',
  formula: 'group_dmi_kg_per_day = headCount × avgWeightKg × (isLactating ? dmiPctLactating : dmiPct) / 100',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  notes: 'v2 fix: no lactation adjustment in v1. isLactating is computed on read from calving records.',
  inputs: [
    { name: 'headCount', type: 'integer', unit: 'head' },
    { name: 'avgWeightKg', type: 'number', unit: 'kg' },
    { name: 'dmiPct', type: 'number', unit: '%', configKey: 'animal_classes.dmi_pct' },
    { name: 'dmiPctLactating', type: 'number', unit: '%', configKey: 'animal_classes.dmi_pct_lactating' },
    { name: 'isLactating', type: 'boolean', unit: 'derived' },
  ],
  output: { type: 'number', unit: 'kg/day' },
  example: {
    inputs: { headCount: 20, avgWeightKg: 500, dmiPct: 2.5, dmiPctLactating: 3.0, isLactating: false },
    output: 250,
  },
  fn({ headCount, avgWeightKg, dmiPct, dmiPctLactating, isLactating }) {
    const pct = isLactating ? dmiPctLactating : dmiPct;
    return headCount * avgWeightKg * (pct / 100);
  },
});

// DMI-3: Event Daily DMI
registerCalc({
  name: 'DMI-3',
  category: 'dmi',
  description: 'Combined daily DMI for all active groups on an event',
  formula: 'total_event_dmi_kg_per_day = sum(groupDmiKgPerDay) for active event_group_windows',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  inputs: [
    { name: 'groupDmiTargets', type: 'array', unit: '{ groupDmiKgPerDay }' },
  ],
  output: { type: 'number', unit: 'kg/day' },
  example: {
    inputs: { groupDmiTargets: [{ groupDmiKgPerDay: 250 }, { groupDmiKgPerDay: 150 }] },
    output: 400,
  },
  fn({ groupDmiTargets }) {
    return groupDmiTargets.reduce((sum, g) => sum + g.groupDmiKgPerDay, 0);
  },
});

// DMI-4: Pasture vs Stored Feed Split
registerCalc({
  name: 'DMI-4',
  category: 'dmi',
  description: 'How much DMI came from pasture vs stored feed (mass balance)',
  formula: 'pasture_dmi_kg = total_dmi - stored_consumed; pasture_pct = pasture_dmi / total_dmi × 100',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  notes: 'Mass balance approach — assumes full daily intake met. Reasonable approximation.',
  inputs: [
    { name: 'totalDmiKg', type: 'number', unit: 'kg' },
    { name: 'storedConsumedKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'object', shape: '{ pastureDmiKg, storedDmiKg, pasturePct }', unit: 'kg / %' },
  example: {
    inputs: { totalDmiKg: 400, storedConsumedKg: 100 },
    output: { pastureDmiKg: 300, storedDmiKg: 100, pasturePct: 75 },
  },
  fn({ totalDmiKg, storedConsumedKg }) {
    const pastureDmiKg = totalDmiKg - storedConsumedKg;
    return {
      pastureDmiKg,
      storedDmiKg: storedConsumedKg,
      pasturePct: totalDmiKg > 0 ? (pastureDmiKg / totalDmiKg) * 100 : 0,
    };
  },
});

// DMI-5: Daily Stored DMI by Date
registerCalc({
  name: 'DMI-5',
  category: 'dmi',
  description: 'Stored feed consumption on a specific date via linear interpolation between feed checks',
  formula: 'daily_stored_kg = (prevRemaining - nextRemaining) / (nextCheckDate - prevCheckDate)',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  notes: 'Linear interpolation between checks. Acceptable for 1-3 day gaps.',
  inputs: [
    { name: 'prevCheckRemainingKg', type: 'number', unit: 'kg' },
    { name: 'nextCheckRemainingKg', type: 'number', unit: 'kg' },
    { name: 'daysBetweenChecks', type: 'number', unit: 'days' },
  ],
  output: { type: 'number', unit: 'kg/day' },
  example: {
    inputs: { prevCheckRemainingKg: 200, nextCheckRemainingKg: 150, daysBetweenChecks: 5 },
    output: 10,
  },
  fn({ prevCheckRemainingKg, nextCheckRemainingKg, daysBetweenChecks }) {
    if (daysBetweenChecks <= 0) return 0;
    return (prevCheckRemainingKg - nextCheckRemainingKg) / daysBetweenChecks;
  },
});

// DMI-6: DMI Variance (Confinement)
registerCalc({
  name: 'DMI-6',
  category: 'dmi',
  description: 'Actual vs expected DMI for confinement events',
  formula: 'variance_kg = actual - expected; variance_pct = variance_kg / expected × 100',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  inputs: [
    { name: 'actualConsumedKg', type: 'number', unit: 'kg' },
    { name: 'expectedDmiKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'object', shape: '{ varianceKg, variancePct }', unit: 'kg / %' },
  example: {
    inputs: { actualConsumedKg: 380, expectedDmiKg: 400 },
    output: { varianceKg: -20, variancePct: -5 },
  },
  fn({ actualConsumedKg, expectedDmiKg }) {
    const varianceKg = actualConsumedKg - expectedDmiKg;
    return {
      varianceKg,
      variancePct: expectedDmiKg > 0 ? (varianceKg / expectedDmiKg) * 100 : 0,
    };
  },
});

// DMI-7: Grass DMI by Paddock
registerCalc({
  name: 'DMI-7',
  category: 'dmi',
  description: 'Per-paddock grass consumption using mass balance per paddock window',
  formula: 'grass_dmi_kg = window_dmi_kg - stored_feed_in_window_kg',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  inputs: [
    { name: 'windowDmiKg', type: 'number', unit: 'kg' },
    { name: 'storedFeedInWindowKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: { windowDmiKg: 500, storedFeedInWindowKg: 80 },
    output: 420,
  },
  fn({ windowDmiKg, storedFeedInWindowKg }) {
    return windowDmiKg - storedFeedInWindowKg;
  },
});

// FOR-1: Standing Forage DM
registerCalc({
  name: 'FOR-1',
  category: 'forage',
  description: 'Harvestable dry matter available for grazing',
  formula: 'available_dm_kg = (forage_height_cm - residual_height_cm) × area_ha × cover_pct/100 × dm_kg_per_cm_per_ha',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  notes: 'v2 fix: per-forage-type utilization_pct (not global). Strip grazing: use area_ha × area_pct/100.',
  inputs: [
    { name: 'forageHeightCm', type: 'number', unit: 'cm' },
    { name: 'residualHeightCm', type: 'number', unit: 'cm' },
    { name: 'areaHectares', type: 'number', unit: 'ha' },
    { name: 'areaPct', type: 'number', unit: '%', notes: 'Strip grazing only; use 100 for whole paddock' },
    { name: 'coverPct', type: 'number', unit: '%' },
    { name: 'dmKgPerCmPerHa', type: 'number', unit: 'kg/cm/ha', configKey: 'forage_types.dm_kg_per_cm_per_ha' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: { forageHeightCm: 25, residualHeightCm: 5, areaHectares: 2, areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110 },
    output: 3520,
  },
  fn({ forageHeightCm, residualHeightCm, areaHectares, areaPct, coverPct, dmKgPerCmPerHa }) {
    const grazableHeight = forageHeightCm - residualHeightCm;
    const effectiveArea = areaHectares * ((areaPct ?? 100) / 100);
    return grazableHeight * effectiveArea * (coverPct / 100) * dmKgPerCmPerHa;
  },
});

// FOR-2: Available AUDs
registerCalc({
  name: 'FOR-2',
  category: 'forage',
  description: 'Animal unit days a location can support',
  formula: 'available_auds = available_dm_kg / dm_per_aud_kg',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  inputs: [
    { name: 'availableDmKg', type: 'number', unit: 'kg' },
    { name: 'dmPerAudKg', type: 'number', unit: 'kg/AUD' },
  ],
  output: { type: 'number', unit: 'AUDs' },
  example: {
    inputs: { availableDmKg: 3520, dmPerAudKg: 11 },
    output: 320,
  },
  fn({ availableDmKg, dmPerAudKg }) {
    if (dmPerAudKg <= 0) return 0;
    return availableDmKg / dmPerAudKg;
  },
});

// FOR-3: Estimated Graze Days
registerCalc({
  name: 'FOR-3',
  category: 'forage',
  description: 'How many days a group can graze a location',
  formula: 'days = floor(available_dm_kg / group_dmi_kg_per_day)',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  inputs: [
    { name: 'availableDmKg', type: 'number', unit: 'kg' },
    { name: 'groupDmiKgPerDay', type: 'number', unit: 'kg/day' },
  ],
  output: { type: 'integer', unit: 'days' },
  example: {
    inputs: { availableDmKg: 3520, groupDmiKgPerDay: 400 },
    output: 8.8,
  },
  fn({ availableDmKg, groupDmiKgPerDay }) {
    if (groupDmiKgPerDay <= 0) return 0;
    return Math.round((availableDmKg / groupDmiKgPerDay) * 100) / 100;
  },
});

// FOR-4: Days Remaining (Active Event)
registerCalc({
  name: 'FOR-4',
  category: 'forage',
  description: 'How many more days animals can stay on current location',
  formula: 'days_remaining = round2((remaining_stored_dm + forage_estimate_kg) / group_dmi_kg_per_day)',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  inputs: [
    { name: 'remainingStoredDmKg', type: 'number', unit: 'kg' },
    { name: 'forageEstimateKg', type: 'number', unit: 'kg' },
    { name: 'groupDmiKgPerDay', type: 'number', unit: 'kg/day' },
  ],
  output: { type: 'number', unit: 'days' },
  example: {
    inputs: { remainingStoredDmKg: 200, forageEstimateKg: 1800, groupDmiKgPerDay: 400 },
    output: 5,
  },
  fn({ remainingStoredDmKg, forageEstimateKg, groupDmiKgPerDay }) {
    if (groupDmiKgPerDay <= 0) return 0;
    return Math.round(((remainingStoredDmKg + forageEstimateKg) / groupDmiKgPerDay) * 100) / 100;
  },
});

// FOR-5: Stocking Efficiency
registerCalc({
  name: 'FOR-5',
  category: 'forage',
  description: 'Actual AUDs used vs estimated AUDs available',
  formula: 'efficiency_pct = actual_auds / estimated_auds × 100',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  inputs: [
    { name: 'actualAuds', type: 'number', unit: 'AUDs' },
    { name: 'estimatedAuds', type: 'number', unit: 'AUDs' },
  ],
  output: { type: 'number', unit: '%' },
  example: {
    inputs: { actualAuds: 288, estimatedAuds: 320 },
    output: 90,
  },
  fn({ actualAuds, estimatedAuds }) {
    if (estimatedAuds <= 0) return 0;
    return (actualAuds / estimatedAuds) * 100;
  },
});

// CST-1: Feed Entry Cost
registerCalc({
  name: 'CST-1',
  category: 'cost',
  description: 'Cost of feed deliveries for an event',
  formula: 'cost = sum(qty × cost_per_unit)',
  source: 'V2_CALCULATION_SPEC.md §4.5',
  inputs: [
    { name: 'entries', type: 'array', unit: '{ qtyUnits, costPerUnit }' },
  ],
  output: { type: 'number', unit: '$' },
  example: {
    inputs: { entries: [{ qtyUnits: 10, costPerUnit: 15 }, { qtyUnits: 5, costPerUnit: 20 }] },
    output: 250,
  },
  fn({ entries }) {
    return entries.reduce((sum, e) => sum + e.qtyUnits * e.costPerUnit, 0);
  },
});

// CST-2: Batch Unit Cost
registerCalc({
  name: 'CST-2',
  category: 'cost',
  description: 'Unit cost of a batch (bidirectional)',
  formula: 'cost_per_unit = cost_total / quantity_original',
  source: 'V2_CALCULATION_SPEC.md §4.5',
  inputs: [
    { name: 'costTotal', type: 'number', unit: '$' },
    { name: 'quantityOriginal', type: 'number', unit: 'units' },
  ],
  output: { type: 'number', unit: '$/unit' },
  example: {
    inputs: { costTotal: 750, quantityOriginal: 50 },
    output: 15,
  },
  fn({ costTotal, quantityOriginal }) {
    if (quantityOriginal <= 0) return 0;
    return costTotal / quantityOriginal;
  },
});

// FED-1: Effective Feed Residual
registerCalc({
  name: 'FED-1',
  category: 'feed',
  description: 'Current remaining feed percentage from latest check',
  formula: 'remaining_pct = remaining_quantity / total_delivered × 100',
  source: 'V2_CALCULATION_SPEC.md §4.6',
  inputs: [
    { name: 'remainingQuantity', type: 'number', unit: 'units' },
    { name: 'totalDelivered', type: 'number', unit: 'units' },
  ],
  output: { type: 'number', unit: '%' },
  example: {
    inputs: { remainingQuantity: 8, totalDelivered: 20 },
    output: 40,
  },
  fn({ remainingQuantity, totalDelivered }) {
    if (totalDelivered <= 0) return 0;
    return (remainingQuantity / totalDelivered) * 100;
  },
});

// FED-2: Feed DM Delivered to Date
registerCalc({
  name: 'FED-2',
  category: 'feed',
  description: 'Total DM delivered to a paddock by a cutoff date',
  formula: 'total_dm_kg = sum(qty × dm_pct/100) where entry_date ≤ cutoff_date',
  source: 'V2_CALCULATION_SPEC.md §4.6',
  notes: 'Time-filtering is critical — do not count future deliveries when computing past checks.',
  inputs: [
    { name: 'entries', type: 'array', unit: '{ qtyKg, dmPct, entryDate }' },
    { name: 'cutoffDate', type: 'date', unit: 'ISO date' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: {
      entries: [
        { qtyKg: 100, dmPct: 88, entryDate: '2024-06-01' },
        { qtyKg: 50, dmPct: 90, entryDate: '2024-06-05' },
        { qtyKg: 50, dmPct: 88, entryDate: '2024-06-10' },
      ],
      cutoffDate: '2024-06-06',
    },
    output: 133,
  },
  fn({ entries, cutoffDate }) {
    const cutoff = new Date(cutoffDate);
    return entries
      .filter(e => new Date(e.entryDate) <= cutoff)
      .reduce((sum, e) => sum + e.qtyKg * (e.dmPct / 100), 0);
  },
});

// FED-3: Organic Matter Residual
registerCalc({
  name: 'FED-3',
  category: 'feed',
  description: 'Organic matter remaining from feed (OM ≈ DM × 0.93)',
  formula: 'om_kg = remaining_dm_kg × 0.93',
  source: 'V2_CALCULATION_SPEC.md §4.6',
  inputs: [
    { name: 'remainingDmKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: { remainingDmKg: 100 },
    output: 93,
  },
  fn({ remainingDmKg }) {
    return remainingDmKg * 0.93;
  },
});

// FOR-6: Forecast Standing DM at Date
registerCalc({
  name: 'FOR-6',
  category: 'forage',
  description: 'Projected standing dry matter for a paddock at a future date, used by rotation calendar future forecast blocks',
  formula: 'forecast_dm_kg = (growth_cm_per_day × days_since_close × effective_area × cover_pct/100 × dm_kg_per_cm_per_ha) + residual_dm_kg',
  source: 'V2_CALCULATION_SPEC.md §4.3',
  notes: 'Forecast-only: target_date < observed_at is invalid. Strip grazing: each strip has its own close observation and forecast curve; whole-paddock forecast = sum of strip forecasts.',
  inputs: [
    { name: 'observedAt', type: 'date', unit: 'ISO date', notes: 'Close observation date' },
    { name: 'residualHeightCm', type: 'number', unit: 'cm' },
    { name: 'targetDate', type: 'date', unit: 'ISO date' },
    { name: 'areaHectares', type: 'number', unit: 'ha' },
    { name: 'areaPct', type: 'number', unit: '%', notes: 'Strip grazing only; use 100 for whole paddock' },
    { name: 'coverPct', type: 'number', unit: '%' },
    { name: 'dmKgPerCmPerHa', type: 'number', unit: 'kg/cm/ha', configKey: 'forage_types.dm_kg_per_cm_per_ha' },
    { name: 'growthCmPerDay', type: 'number', unit: 'cm/day', configKey: 'forage_types.growth_cm_per_day' },
    { name: 'recoveryMinDays', type: 'integer', unit: 'days' },
    { name: 'recoveryMaxDays', type: 'integer', unit: 'days' },
  ],
  output: { type: 'object', shape: '{ forecastDmKg, confidence }', unit: 'kg / enum' },
  example: {
    inputs: {
      observedAt: '2024-06-01', residualHeightCm: 5, targetDate: '2024-06-22',
      areaHectares: 2, areaPct: 100, coverPct: 80, dmKgPerCmPerHa: 110,
      growthCmPerDay: 0.5, recoveryMinDays: 21, recoveryMaxDays: 35,
    },
    output: { forecastDmKg: 1848, confidence: 'min' },
  },
  fn({ observedAt, residualHeightCm, targetDate, areaHectares, areaPct, coverPct, dmKgPerCmPerHa, growthCmPerDay, recoveryMinDays, recoveryMaxDays }) {
    const obsDate = new Date(observedAt);
    const tgtDate = new Date(targetDate);
    const daysSinceClose = Math.round((tgtDate - obsDate) / 86400000);
    if (daysSinceClose < 0) return { forecastDmKg: 0, confidence: 'min' };

    const effectiveArea = areaHectares * ((areaPct ?? 100) / 100);
    const grownHeight = growthCmPerDay * daysSinceClose;
    const totalHeight = residualHeightCm + grownHeight;
    const forecastDmKg = totalHeight * effectiveArea * (coverPct / 100) * dmKgPerCmPerHa;

    let confidence;
    if (daysSinceClose <= recoveryMinDays) {
      confidence = 'min';
    } else if (daysSinceClose < recoveryMaxDays) {
      confidence = 'mid';
    } else if (daysSinceClose === recoveryMaxDays) {
      confidence = 'max';
    } else {
      confidence = 'past_max';
    }

    return { forecastDmKg, confidence };
  },
});

// FED-4: Manure Batch Remaining
registerCalc({
  name: 'FED-4',
  category: 'feed',
  description: 'Volume of manure left to apply (min 0)',
  formula: 'remaining_kg = max(0, total_kg - sum(applied_kg))',
  source: 'V2_CALCULATION_SPEC.md §4.6',
  inputs: [
    { name: 'totalKg', type: 'number', unit: 'kg' },
    { name: 'transactions', type: 'array', unit: '{ appliedKg }' },
  ],
  output: { type: 'number', unit: 'kg' },
  example: {
    inputs: { totalKg: 5000, transactions: [{ appliedKg: 1500 }, { appliedKg: 2000 }] },
    output: 1500,
  },
  fn({ totalKg, transactions }) {
    const applied = transactions.reduce((sum, t) => sum + t.appliedKg, 0);
    return Math.max(0, totalKg - applied);
  },
});

// FED-5: Manure Batch Remaining NPK
registerCalc({
  name: 'FED-5',
  category: 'feed',
  description: 'NPK composition of remaining manure (proportional to volume remaining)',
  formula: 'remaining_npk = total_npk × (remaining_kg / total_kg)',
  source: 'V2_CALCULATION_SPEC.md §4.6',
  inputs: [
    { name: 'totalNKg', type: 'number', unit: 'kg' },
    { name: 'totalPKg', type: 'number', unit: 'kg' },
    { name: 'totalKKg', type: 'number', unit: 'kg' },
    { name: 'remainingKg', type: 'number', unit: 'kg' },
    { name: 'totalKg', type: 'number', unit: 'kg' },
  ],
  output: { type: 'object', shape: '{ nKg, pKg, kKg }', unit: 'kg' },
  example: {
    inputs: { totalNKg: 20, totalPKg: 8, totalKKg: 15, remainingKg: 2500, totalKg: 5000 },
    output: { nKg: 10, pKg: 4, kKg: 7.5 },
  },
  fn({ totalNKg, totalPKg, totalKKg, remainingKg, totalKg }) {
    if (totalKg <= 0) return { nKg: 0, pKg: 0, kKg: 0 };
    const ratio = remainingKg / totalKg;
    return {
      nKg: totalNKg * ratio,
      pKg: totalPKg * ratio,
      kKg: totalKKg * ratio,
    };
  },
});

// DMI-8: Daily DMI Breakdown (cascade bucket model — OI-0119)
// Canonical spec: V2_CALCULATION_SPEC.md §4.2 DMI-8.
//
// Five statuses: actual, estimated, needs_check, no_animals, no_pasture_data.
// Cascade allocation per day: pasture → stored → deficit.
// Source-event bridge is date-routed by the caller (not inside DMI-8).
registerCalc({
  name: 'DMI-8',
  category: 'dmi',
  description: 'Per-day DMI breakdown via cascade bucket walk (pasture → stored → deficit). Five statuses: actual | estimated | needs_check | no_animals | no_pasture_data.',
  formula: 'See V2_CALCULATION_SPEC.md §4.2 DMI-8 for the full cascade model.',
  source: 'V2_CALCULATION_SPEC.md §4.2',
  inputs: [
    { name: 'event', type: 'object', unit: '{ id, dateIn, dateOut, sourceEventId } — dateIn is the DERIVED event start (getEventStartDate); caller decorates since events.date_in was dropped in migration 028 (OI-0117)' },
    { name: 'date', type: 'string', unit: 'YYYY-MM-DD' },
    { name: 'groupWindows', type: 'array', unit: '{ headCount, avgWeightKg, animalClassId, dateJoined, dateLeft }' },
    { name: 'memberships', type: 'array', unit: '{ groupId, animalId, dateJoined, dateLeft }' },
    { name: 'animals', type: 'array', unit: '{ id, animalClassId }' },
    { name: 'animalWeightRecords', type: 'array', unit: '{ animalId, weightKg, date }' },
    { name: 'feedEntries', type: 'array', unit: '{ batchId, locationId, date, quantity }' },
    { name: 'feedChecks', type: 'array', unit: '{ id, date }' },
    { name: 'feedCheckItems', type: 'array', unit: '{ feedCheckId, batchId, locationId, remainingQuantity }' },
    { name: 'batches', type: 'object', unit: '{ [batchId]: { weightPerUnitKg, dmPct } } — for DM conversion of feed entries + check items' },
    { name: 'paddockWindows', type: 'array', unit: '{ id, eventId, locationId, dateOpened, dateClosed, areaPct }' },
    { name: 'observations', type: 'array', unit: 'paddock_observations[] (type=open, source=event). Calc picks per-window via locationId + sourceId fallback.' },
    { name: 'forageTypes', type: 'object', unit: '{ [locationId]: { dmKgPerCmPerHa, minResidualHeightCm, utilizationPct } }' },
    { name: 'locations', type: 'object', unit: '{ [locationId]: { areaHa, forageTypeId? } } — areaHa = areaHectares ?? areaHa (caller handles fallback)' },
    { name: 'animalClasses', type: 'object', unit: '{ [classId]: { dmiPct, dmiPctLactating } }' },
  ],
  output: { type: 'object', shape: '{ status, totalDmiKg?, storedDmiKg?, pastureDmiKg?, deficitKg?, reason?, hint? }', unit: 'kg' },
  fn({ event, date, groupWindows, memberships, animals, animalWeightRecords,
       feedEntries, feedChecks, feedCheckItems, batches,
       paddockWindows, observations, forageTypes, locations, animalClasses }) {

    // ---- Helpers -----------------------------------------------------------

    // Daily demand (OI-0091: live recompute for open windows).
    function dailyDemand(dt) {
      let total = 0;
      for (const gw of groupWindows) {
        if (gw.dateJoined > dt) continue;
        if (gw.dateLeft && gw.dateLeft <= dt) continue;
        const cls = gw.animalClassId && animalClasses ? animalClasses[gw.animalClassId] : null;
        const pct = cls?.dmiPct ?? 2.5;
        const head = memberships
          ? getLiveWindowHeadCount(gw, { memberships, now: dt })
          : (gw.headCount ?? 0);
        const avg = memberships
          ? getLiveWindowAvgWeight(gw, { memberships, animals, animalWeightRecords, now: dt })
          : (gw.avgWeightKg ?? 0);
        total += head * avg * (pct / 100);
      }
      return total;
    }

    // paddock_observations picker — verbatim match to the OI-0107 canonical
    // pattern used by detail.js §5 and the capacity line.
    function pickPreGraze(pw) {
      const candidates = (observations || [])
        .filter(o => o.locationId === pw.locationId && o.type === 'open' && o.source === 'event');
      return candidates.find(o => o.sourceId === pw.id)
        || candidates.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0]
        || null;
    }

    // FOR-1: initial standing DM for a window. Returns 0 if inputs missing.
    // Emits hint='assumed_full_cover' when cover is null but height is present.
    function for1ForWindow(pw) {
      const ft = forageTypes?.[pw.locationId];
      const loc = locations?.[pw.locationId];
      const obs = pickPreGraze(pw);
      if (!obs || !obs.forageHeightCm || !ft?.dmKgPerCmPerHa || !loc?.areaHa) {
        return { dm: 0, hint: null };
      }
      const residualCm = ft.minResidualHeightCm ?? 5;
      const grazable = obs.forageHeightCm - residualCm;
      if (grazable <= 0) return { dm: 0, hint: null };
      const coverNull = obs.forageCoverPct == null;
      const coverPct = coverNull ? 100 : obs.forageCoverPct;
      const utilization = ft.utilizationPct ?? 100;
      const effectiveArea = loc.areaHa * ((pw.areaPct ?? 100) / 100);
      const dm = grazable * effectiveArea * (coverPct / 100) * (utilization / 100) * ft.dmKgPerCmPerHa;
      return { dm, hint: coverNull ? 'assumed_full_cover' : null };
    }

    // Convert a feed-entry quantity (batch units) to kg DM.
    function entryDmKg(entry) {
      const b = batches?.[entry.batchId];
      if (!b || !b.weightPerUnitKg || !b.dmPct) return 0;
      return (entry.quantity ?? 0) * b.weightPerUnitKg * (b.dmPct / 100);
    }

    // Convert a check item's remaining quantity to kg DM.
    function itemDmKg(item) {
      const b = batches?.[item.batchId];
      if (!b || !b.weightPerUnitKg || !b.dmPct) return 0;
      return (item.remainingQuantity ?? 0) * b.weightPerUnitKg * (b.dmPct / 100);
    }

    function sumCheckKg(check) {
      const items = feedCheckItems.filter(i => i.feedCheckId === check.id);
      return items.reduce((s, i) => s + itemDmKg(i), 0);
    }

    function dateAddDays(ymd, n) {
      const d = new Date(ymd + 'T00:00:00');
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    }

    function daysBetween(aYmd, bYmd) {
      return Math.round((new Date(bYmd + 'T00:00:00') - new Date(aYmd + 'T00:00:00')) / 86400000);
    }

    // Allocate demand across pasture + stored buckets per spec's table.
    // Mutates the passed bucket refs' .value and returns the day's allocation.
    function allocateDay(demand, pastureRef, storedRef) {
      const p = pastureRef.value;
      const s = storedRef.value;
      let pasture = 0, stored = 0, deficit = 0;
      if (p >= demand) {
        pasture = demand;
      } else if (p > 0) {
        pasture = p;
        const shortfall = demand - pasture;
        if (s >= shortfall) stored = shortfall;
        else { stored = Math.max(0, s); deficit = shortfall - stored; }
      } else {
        if (s >= demand) stored = demand;
        else { stored = Math.max(0, s); deficit = demand - stored; }
      }
      pastureRef.value = Math.max(0, p - pasture);
      storedRef.value = Math.max(0, s - stored);
      return { pasture, stored, deficit };
    }

    // ---- Step 0 — demand ---------------------------------------------------

    const totalDmiKg = dailyDemand(date);
    if (totalDmiKg <= 0) return { status: 'no_animals' };

    // ---- Step 1 — gate: forage type + pre-graze per open window on target --

    const eventPws = (paddockWindows || []).filter(pw => pw.eventId === event.id);
    const openOnTarget = eventPws.filter(pw =>
      (pw.dateOpened || '9999-12-31') <= date &&
      (!pw.dateClosed || pw.dateClosed > date),
    );
    // No open windows on target date = no pasture to graze; treat as no_animals
    // rather than no_pasture_data (there's no window to CTA into).
    if (openOnTarget.length === 0) return { status: 'no_animals' };

    let aggregateHint = null;
    for (const pw of openOnTarget) {
      const loc = locations?.[pw.locationId];
      const ft = forageTypes?.[pw.locationId];
      if (!loc?.areaHa) {
        // Location row missing area — treat as missing forage type (user-fixable
        // in the Location edit sheet alongside forage type).
        return { status: 'no_pasture_data', reason: 'missing_forage_type', pwId: pw.id, locationId: pw.locationId };
      }
      if (!ft?.dmKgPerCmPerHa) {
        return { status: 'no_pasture_data', reason: 'missing_forage_type', pwId: pw.id, locationId: pw.locationId };
      }
      const obs = pickPreGraze(pw);
      if (!obs || !obs.forageHeightCm || obs.forageHeightCm <= 0) {
        return { status: 'no_pasture_data', reason: 'missing_observation', pwId: pw.id, locationId: pw.locationId };
      }
      if (obs.forageCoverPct == null) aggregateHint = 'assumed_full_cover';
    }

    // ---- Cascade walk setup ------------------------------------------------

    const startDate = event.dateIn;
    if (!startDate) return { status: 'needs_check' };

    // Sort checks (entity-native: `.date`, not `.checkDate`).
    const sortedChecks = [...(feedChecks || [])]
      .filter(c => c.date)
      .sort((a, b) => a.date.localeCompare(b.date));
    const prevCheck = sortedChecks.filter(c => c.date <= date).slice(-1)[0] || null;

    // Per-window pasture pools keyed by pwId — each pool tracks its own FOR-1
    // remainder so sub-move close can drop the closing window's share.
    const pools = new Map(); // pwId -> { initialDm, remainingDm, hint }
    function openWindowsByDate(dt) {
      return eventPws.filter(pw =>
        (pw.dateOpened || '9999-12-31') <= dt &&
        (!pw.dateClosed || pw.dateClosed > dt),
      );
    }
    function addWindowPool(pw) {
      if (pools.has(pw.id)) return;
      const { dm, hint } = for1ForWindow(pw);
      pools.set(pw.id, { initialDm: dm, remainingDm: dm, hint });
    }
    function dropWindowPool(pwId) {
      pools.delete(pwId);
    }
    function totalPasture() {
      let s = 0;
      for (const p of pools.values()) s += p.remainingDm;
      return s;
    }
    function decrementPoolsProportionally(amount) {
      const total = totalPasture();
      if (total <= 0 || amount <= 0) return;
      for (const p of pools.values()) {
        const share = p.remainingDm / total;
        p.remainingDm = Math.max(0, p.remainingDm - amount * share);
      }
    }

    // Seed pasture pools at walk start (event dateIn) with FOR-1 for every
    // window open on that date.
    for (const pw of openWindowsByDate(startDate)) addWindowPool(pw);

    // Seed stored bucket at walk start. If a check exists on or before
    // startDate, re-anchor to that check's kg. Otherwise start with deliveries
    // up to and including startDate.
    const preStartCheck = sortedChecks.filter(c => c.date <= startDate).slice(-1)[0] || null;
    let seedStoredKg = 0;
    let seedFromDate = startDate;
    if (preStartCheck) {
      seedStoredKg = sumCheckKg(preStartCheck);
      seedFromDate = preStartCheck.date;
      // Deliveries strictly after the check and up to startDate also count.
      for (const e of (feedEntries || [])) {
        if (e.date > preStartCheck.date && e.date <= startDate) seedStoredKg += entryDmKg(e);
      }
    } else {
      for (const e of (feedEntries || [])) {
        if (e.date <= startDate) seedStoredKg += entryDmKg(e);
      }
    }

    const pastureRef = { value: totalPasture() };
    const storedRef = { value: seedStoredKg };

    // ---- Actual path (bracketed) -------------------------------------------
    // When prev + next checks bracket the date, use DMI-5 linear distribution
    // across the interval for storedDmiKg. Pasture fills the rest.
    const nextCheck = sortedChecks.find(c => c.date > date) || null;
    if (prevCheck && nextCheck) {
      const prevKg = sumCheckKg(prevCheck);
      const nextKg = sumCheckKg(nextCheck);
      let deliveriesBetween = 0;
      for (const e of (feedEntries || [])) {
        if (e.date > prevCheck.date && e.date <= nextCheck.date) deliveriesBetween += entryDmKg(e);
      }
      const days = Math.max(1, daysBetween(prevCheck.date, nextCheck.date));
      const storedDmiKg = Math.max(0, (prevKg + deliveriesBetween - nextKg) / days);
      const pastureDmiKg = Math.max(0, totalDmiKg - storedDmiKg);
      const out = { status: 'actual', totalDmiKg, storedDmiKg, pastureDmiKg, deficitKg: 0 };
      if (aggregateHint) out.hint = aggregateHint;
      return out;
    }

    // ---- Walk forward ------------------------------------------------------
    // Iterate day-by-day from startDate through date. At each day:
    //   (1) Sub-move opens on that day → add FOR-1 for new windows.
    //   (2) Deliveries on that day → add DM to stored bucket.
    //   (3) If a check lands on this day → re-anchor stored bucket.
    //   (4) Allocate today's demand via cascade table.
    //   (5) Sub-move closes on that day → drop the closing pool.

    const outRef = { pasture: 0, stored: 0, deficit: 0 };
    let cursor = startDate;
    let guard = 0;
    while (guard++ < 400) {
      // (1) Sub-move opens whose dateOpened === cursor (after seed day).
      if (cursor !== startDate) {
        for (const pw of eventPws) {
          if (pw.dateOpened === cursor && !pools.has(pw.id)) addWindowPool(pw);
        }
        pastureRef.value = totalPasture();
      }

      // (2) Deliveries with date === cursor (skip the startDate seed already counted).
      if (cursor !== startDate && cursor !== seedFromDate) {
        for (const e of (feedEntries || [])) {
          if (e.date === cursor) storedRef.value += entryDmKg(e);
        }
      }

      // (3) Check on cursor date re-anchors stored bucket (prior walk may have
      // drifted; the check is ground truth). Ignore pre-start checks already
      // seeded.
      const cursorCheck = sortedChecks.find(c => c.date === cursor && (!preStartCheck || c.id !== preStartCheck.id));
      if (cursorCheck) {
        storedRef.value = sumCheckKg(cursorCheck);
      }

      // (4) Allocate.
      const demand = dailyDemand(cursor);
      const allocated = allocateDay(demand, pastureRef, storedRef);
      // Decrement per-window pools proportionally so sub-move close drops the
      // right remainder.
      decrementPoolsProportionally(allocated.pasture);

      if (cursor === date) {
        outRef.pasture = allocated.pasture;
        outRef.stored = allocated.stored;
        outRef.deficit = allocated.deficit;
        break;
      }

      // (5) Sub-move closes whose dateClosed === cursor: drop their pool
      // (remaining pasture in the closed window is not carried over).
      for (const pw of eventPws) {
        if (pw.dateClosed === cursor && pools.has(pw.id)) dropWindowPool(pw.id);
      }
      pastureRef.value = totalPasture();

      cursor = dateAddDays(cursor, 1);
      if (cursor > date) break; // safety
    }

    // ---- Emit --------------------------------------------------------------

    // status=actual when a prev check anchor exists for the walk (we're
    // projecting forward from ground truth); estimated otherwise.
    const status = prevCheck ? 'actual' : 'estimated';
    const out = {
      status,
      totalDmiKg,
      storedDmiKg: outRef.stored,
      pastureDmiKg: outRef.pasture,
      deficitKg: outRef.deficit,
    };
    if (aggregateHint) out.hint = aggregateHint;
    return out;
  },
});
