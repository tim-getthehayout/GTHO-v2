/** @file Seed data for onboarding — NRCS defaults, system categories, reference units */

/**
 * Animal class definitions by species.
 * Roles per species per A27. NRCS defaults per A39.
 * default_weight_kg values are standard industry averages.
 */
export const ANIMAL_CLASSES_BY_SPECIES = {
  // OI-0127: weaningAgeDays lives on the offspring role (calf/lamb/kid),
  // not the dam (cow/ewe/doe). ANI-3's `birth_date + weaning_age_days`
  // increments the calf's birth date, so the value must ride on the calf's
  // class. dmiPctLactating stays on the dam roles — lactation is a dam
  // property, weaning is an offspring property.
  beef_cattle: [
    { role: 'cow',    name: 'Cow',    defaultWeightKg: 545, dmiPct: 2.5, dmiPctLactating: 3.0, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'heifer', name: 'Heifer', defaultWeightKg: 363, dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'bull',   name: 'Bull',   defaultWeightKg: 727, dmiPct: 2.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'steer',  name: 'Steer',  defaultWeightKg: 454, dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'calf',   name: 'Calf',   defaultWeightKg: 113, dmiPct: 3.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: 205 },
  ],
  dairy_cattle: [
    { role: 'cow',    name: 'Cow',    defaultWeightKg: 680, dmiPct: 3.0, dmiPctLactating: 4.0, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'heifer', name: 'Heifer', defaultWeightKg: 454, dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'bull',   name: 'Bull',   defaultWeightKg: 907, dmiPct: 2.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'steer',  name: 'Steer',  defaultWeightKg: 545, dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'calf',   name: 'Calf',   defaultWeightKg: 91,  dmiPct: 3.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: 60 },
  ],
  sheep: [
    { role: 'ewe',    name: 'Ewe',    defaultWeightKg: 68,  dmiPct: 3.0, dmiPctLactating: 4.5, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'ram',    name: 'Ram',    defaultWeightKg: 90,  dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'wether', name: 'Wether', defaultWeightKg: 68,  dmiPct: 2.5, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'lamb',   name: 'Lamb',   defaultWeightKg: 27,  dmiPct: 4.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: 90 },
  ],
  goat: [
    { role: 'doe',    name: 'Doe',    defaultWeightKg: 59,  dmiPct: 3.5, dmiPctLactating: 5.0, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'buck',   name: 'Buck',   defaultWeightKg: 77,  dmiPct: 3.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'wether', name: 'Wether', defaultWeightKg: 59,  dmiPct: 3.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: null },
    { role: 'kid',    name: 'Kid',    defaultWeightKg: 18,  dmiPct: 4.0, dmiPctLactating: null, excretionNRate: 0.145, excretionPRate: 0.041, excretionKRate: 0.136, weaningAgeDays: 90 },
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
