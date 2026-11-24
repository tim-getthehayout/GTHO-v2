/** @file Seed data for onboarding — NRCS defaults, system categories, reference units */

import { DEFAULT_EXCRETION_RATES } from '../../calcs/excretion-defaults.js';

/**
 * Per seed species+role excretion rates, same units as DEFAULT_EXCRETION_RATES
 * (kg / 1000 kg BW / day, elemental P and K).
 * Citations: USDA NRCS AWMFH Part 651 ch. 4 (210-VI-AWMFH, March 2008),
 * except goats: ASAE D384.1 FEB03 Table 1 (Goat column).
 * Beef cow / bull use the shared unknown-class fallback (T4-8(b) beef cow).
 */
export const SEED_EXCRETION_RATES = {
  beef_cattle: {
    cow:    DEFAULT_EXCRETION_RATES,
    bull:   DEFAULT_EXCRETION_RATES,
    heifer: { n: 0.45, p: 0.08, k: 0.29 },
    steer:  { n: 0.45, p: 0.08, k: 0.29 },
    calf:   { n: 0.45, p: 0.08, k: 0.29 },
  },
  dairy_cattle: {
    cow:    { n: 0.71, p: 0.12, k: 0.33 },
    heifer: { n: 0.27, p: 0.05, k: 0.12 },
    bull:   { n: 0.30, p: 0.042, k: 0.10 },
    steer:  { n: 0.27, p: 0.05, k: 0.12 },
    calf:   { n: 0.42, p: 0.05, k: 0.11 },
  },
  sheep: {
    ewe:    { n: 0.45, p: 0.07, k: 0.30 },
    ram:    { n: 0.45, p: 0.07, k: 0.30 },
    wether: { n: 0.45, p: 0.07, k: 0.30 },
    lamb:   { n: 0.45, p: 0.07, k: 0.30 },
  },
  goat: {
    doe:    { n: 0.45, p: 0.11, k: 0.31 },
    buck:   { n: 0.45, p: 0.11, k: 0.31 },
    wether: { n: 0.45, p: 0.11, k: 0.31 },
    kid:    { n: 0.45, p: 0.11, k: 0.31 },
  },
};

function withExcretion(species, row) {
  const r = SEED_EXCRETION_RATES[species][row.role];
  return {
    ...row,
    excretionNRate: r.n,
    excretionPRate: r.p,
    excretionKRate: r.k,
  };
}

/**
 * Animal class definitions by species.
 * Roles per species per A27. NRCS defaults per A39; excretion rates per #459.
 * default_weight_kg values are standard industry averages.
 */
export const ANIMAL_CLASSES_BY_SPECIES = {
  // OI-0127: weaningAgeDays lives on the offspring role (calf/lamb/kid),
  // not the dam (cow/ewe/doe). ANI-3's `birth_date + weaning_age_days`
  // increments the calf's birth date, so the value must ride on the calf's
  // class. dmiPctLactating stays on the dam roles — lactation is a dam
  // property, weaning is an offspring property.
  beef_cattle: [
    withExcretion('beef_cattle', { role: 'cow',    name: 'Cow',    defaultWeightKg: 545, dmiPct: 2.5, dmiPctLactating: 3.0, weaningAgeDays: null }),
    withExcretion('beef_cattle', { role: 'heifer', name: 'Heifer', defaultWeightKg: 363, dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('beef_cattle', { role: 'bull',   name: 'Bull',   defaultWeightKg: 727, dmiPct: 2.0, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('beef_cattle', { role: 'steer',  name: 'Steer',  defaultWeightKg: 454, dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('beef_cattle', { role: 'calf',   name: 'Calf',   defaultWeightKg: 113, dmiPct: 3.0, dmiPctLactating: null, weaningAgeDays: 205 }),
  ],
  dairy_cattle: [
    withExcretion('dairy_cattle', { role: 'cow',    name: 'Cow',    defaultWeightKg: 680, dmiPct: 3.0, dmiPctLactating: 4.0, weaningAgeDays: null }),
    withExcretion('dairy_cattle', { role: 'heifer', name: 'Heifer', defaultWeightKg: 454, dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('dairy_cattle', { role: 'bull',   name: 'Bull',   defaultWeightKg: 907, dmiPct: 2.0, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('dairy_cattle', { role: 'steer',  name: 'Steer',  defaultWeightKg: 545, dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('dairy_cattle', { role: 'calf',   name: 'Calf',   defaultWeightKg: 91,  dmiPct: 3.0, dmiPctLactating: null, weaningAgeDays: 60 }),
  ],
  sheep: [
    withExcretion('sheep', { role: 'ewe',    name: 'Ewe',    defaultWeightKg: 68,  dmiPct: 3.0, dmiPctLactating: 4.5, weaningAgeDays: null }),
    withExcretion('sheep', { role: 'ram',    name: 'Ram',    defaultWeightKg: 90,  dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('sheep', { role: 'wether', name: 'Wether', defaultWeightKg: 68,  dmiPct: 2.5, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('sheep', { role: 'lamb',   name: 'Lamb',   defaultWeightKg: 27,  dmiPct: 4.0, dmiPctLactating: null, weaningAgeDays: 90 }),
  ],
  goat: [
    withExcretion('goat', { role: 'doe',    name: 'Doe',    defaultWeightKg: 59,  dmiPct: 3.5, dmiPctLactating: 5.0, weaningAgeDays: null }),
    withExcretion('goat', { role: 'buck',   name: 'Buck',   defaultWeightKg: 77,  dmiPct: 3.0, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('goat', { role: 'wether', name: 'Wether', defaultWeightKg: 59,  dmiPct: 3.0, dmiPctLactating: null, weaningAgeDays: null }),
    withExcretion('goat', { role: 'kid',    name: 'Kid',    defaultWeightKg: 18,  dmiPct: 4.0, dmiPctLactating: null, weaningAgeDays: 90 }),
  ],
};

/** Default treatment categories (A31) — is_default: true */
export const DEFAULT_TREATMENT_CATEGORIES = [
  'Antibiotic',
  'Parasiticide',
  'Reproductive',
  'Other',
];

/** Default input product categories (A35) — is_default: true */
export const DEFAULT_INPUT_PRODUCT_CATEGORIES = [
  'Fertilizer',
  'Compost',
  'Lime',
  'Other',
];

/** Default dose units — shared reference, no operation_id */
export const DEFAULT_DOSE_UNITS = [
  'ml', 'cc', 'mg', 'tablet', 'capsule', 'pump',
];

/** Default input product units — shared reference, no operation_id */
export const DEFAULT_INPUT_PRODUCT_UNITS = [
  'ton', 'bag', 'lb', 'kg', 'gallon',
];

/**
 * Common forage types by species group.
 * Not spec'd in detail — these are reasonable defaults.
 */
export const DEFAULT_FORAGE_TYPES = [
  { name: 'Tall Fescue',        dmPct: 30, dmKgPerCmPerHa: 250, minResidualHeightCm: 8,  utilizationPct: 65 },
  { name: 'Bermudagrass',       dmPct: 28, dmKgPerCmPerHa: 300, minResidualHeightCm: 5,  utilizationPct: 70 },
  { name: 'Perennial Ryegrass', dmPct: 20, dmKgPerCmPerHa: 280, minResidualHeightCm: 5,  utilizationPct: 70 },
  { name: 'Orchardgrass',       dmPct: 25, dmKgPerCmPerHa: 220, minResidualHeightCm: 8,  utilizationPct: 65 },
  { name: 'White Clover',       dmPct: 18, dmKgPerCmPerHa: 200, minResidualHeightCm: 5,  utilizationPct: 75 },
  { name: 'Native Pasture',     dmPct: 35, dmKgPerCmPerHa: 180, minResidualHeightCm: 10, utilizationPct: 50 },
];
