/** @file Elemental N/P/K → fertilizer-oxide equivalents — #462.
 *
 * Deposited N, P and K are stored and shown ELEMENTAL (the NRCS excretion basis,
 * see excretion-defaults.js). Fertilizer bags list P₂O₅ and K₂O, so every
 * deposited N/P/K surface adds a hover line with the oxide equivalents.
 * Mass ratios: P₂O₅ / 2P = 141.94 / 61.95 ≈ 2.291; K₂O / 2K = 94.20 / 78.20 ≈ 1.205.
 * N has no conversion. Ratios are unit-free (same for kg and lb).
 * Every surface must import these constants rather than repeating the numbers.
 */
import { formatMeasure, formatPerArea } from '../utils/units.js';

/** Elemental P × 2.291 = P₂O₅. */
export const P_TO_P2O5 = 2.291;
/** Elemental K × 1.205 = K₂O. */
export const K_TO_K2O = 1.205;

/** Strip / roomy heading copy (#462). */
export const NPK_ELEMENTAL_HEADING = 'N · P · K (elemental)';
/** Suffix for inline labels ("NPK deposited (elemental)"). */
export const ELEMENTAL_SUFFIX = '(elemental)';

/**
 * Oxide equivalents of elemental P and K (same unit in and out).
 * @param {{ p?: number|null, k?: number|null }} elemental
 * @returns {{ p2o5: number|null, k2o: number|null }}
 */
export function fertilizerEquivalents({ p, k } = {}) {
  const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  const pn = num(p);
  const kn = num(k);
  return {
    p2o5: pn == null ? null : pn * P_TO_P2O5,
    k2o: kn == null ? null : kn * K_TO_K2O,
  };
}

/**
 * #462 combined inline-line hover (Dashboard, Reports row, Event detail):
 * `As fertilizer: {p} P₂O₅ · {k} K₂O`, with the same unit and
 * rounding as the cell (canonical-metric kg in, farm unit out via OI-0278).
 * Returns null when either value is unknown.
 * @param {number|null|undefined} pKg elemental P (kg, or kg/ha when `perArea`)
 * @param {number|null|undefined} kKg elemental K (kg, or kg/ha when `perArea`)
 * @param {{ unitSystem?: 'metric'|'imperial', compact?: boolean, decimals?: number, perArea?: boolean }} [opts]
 * @returns {string|null}
 */
export function fertilizerHover(pKg, kKg, { unitSystem, compact = false, decimals, perArea = false } = {}) {
  const { p2o5, k2o } = fertilizerEquivalents({ p: pKg, k: kKg });
  if (p2o5 == null || k2o == null) return null;
  const fmt = (v) => (perArea
    ? formatPerArea(v, 'npk', { unitSystem, compact, decimals })
    : formatMeasure(v, 'npk', { unitSystem, compact, decimals }));
  return `As fertilizer: ${fmt(p2o5)} P₂O₅ · ${fmt(k2o)} K₂O`;
}

/**
 * #462 (Design 1610) single-nutrient cell hover: a P cell reads
 * `As fertilizer: {p} P₂O₅`, a K cell `As fertilizer: {k} K₂O`, an N cell none.
 * Same unit and rounding as the cell (canonical-metric kg in, farm unit out).
 * @param {'n'|'p'|'k'} nutrient
 * @param {number|null|undefined} valueKg elemental value (kg, or kg/ha when `perArea`)
 * @param {{ unitSystem?: 'metric'|'imperial', compact?: boolean, decimals?: number, perArea?: boolean }} [opts]
 * @returns {string|null}
 */
export function fertilizerCellHover(nutrient, valueKg, { unitSystem, compact = false, decimals, perArea = false } = {}) {
  if (nutrient !== 'p' && nutrient !== 'k') return null;
  const eq = fertilizerEquivalents(nutrient === 'p' ? { p: valueKg } : { k: valueKg });
  const v = nutrient === 'p' ? eq.p2o5 : eq.k2o;
  if (v == null) return null;
  const text = perArea
    ? formatPerArea(v, 'npk', { unitSystem, compact, decimals })
    : formatMeasure(v, 'npk', { unitSystem, compact, decimals });
  return `As fertilizer: ${text} ${nutrient === 'p' ? 'P₂O₅' : 'K₂O'}`;
}

/**
 * Append the hover line to an existing title the same way the #459 pre-window
 * note does (`existing. note`).
 * @param {string|null|undefined} title
 * @param {string|null} hover
 * @returns {string}
 */
export function appendFertilizerHover(title, hover) {
  if (!hover) return title || '';
  return title ? `${title}. ${hover}` : hover;
}
