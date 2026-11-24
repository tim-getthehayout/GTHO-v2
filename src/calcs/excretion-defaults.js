/** @file Unknown-class NPK excretion fallback — #459.
 *
 * NRCS AWMFH ch. 4 Table 4-8(b), beef cow in confinement.
 * Units are kg per 1000 kg body weight per day; P and K are elemental.
 * Numerically identical to lb / 1000 lb AU / day.
 * Every runtime fallback must import this constant rather than repeating the numbers.
 */
export const DEFAULT_EXCRETION_RATES = { n: 0.35, p: 0.08, k: 0.25 };
