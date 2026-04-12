/** @file Calculation registry — metadata-driven formula registration. See V2_CALCULATION_SPEC.md §1. */

/** @type {Map<string, object>} */
const registry = new Map();

/**
 * Register a calculation with metadata.
 *
 * @param {object} calc
 * @param {string} calc.name - Unique identifier, e.g. 'npkExcretion'
 * @param {string} calc.category - Category key, e.g. 'npk', 'dmi', 'forage'
 * @param {string} calc.description - Plain-English summary
 * @param {string} calc.formula - Mathematical formula representation
 * @param {string} [calc.source] - Citation/standard reference
 * @param {string} [calc.notes] - Contextual notes
 * @param {Array<{name: string, type: string, unit: string, configKey?: string}>} calc.inputs
 * @param {{type: string, shape?: string, unit: string}} calc.output
 * @param {{inputs: object, output: *}} [calc.example] - Example becomes first unit test
 * @param {Function} calc.fn - The actual calculation function
 */
export function registerCalc(calc) {
  if (!calc.name) throw new Error('registerCalc: name is required');
  if (!calc.category) throw new Error('registerCalc: category is required');
  if (!calc.fn || typeof calc.fn !== 'function') throw new Error('registerCalc: fn must be a function');
  if (registry.has(calc.name)) throw new Error(`registerCalc: '${calc.name}' is already registered`);

  registry.set(calc.name, Object.freeze({ ...calc }));
}

/**
 * Get all registered calculations.
 * @returns {object[]}
 */
export function getAllCalcs() {
  return Array.from(registry.values());
}

/**
 * Get calculations filtered by category.
 * @param {string} category
 * @returns {object[]}
 */
export function getCalcsByCategory(category) {
  return Array.from(registry.values()).filter(c => c.category === category);
}

/**
 * Get a single calculation by name.
 * @param {string} name
 * @returns {object|undefined}
 */
export function getCalcByName(name) {
  return registry.get(name);
}

/**
 * Clear the registry. For testing only.
 */
export function _clearRegistry() {
  registry.clear();
}
