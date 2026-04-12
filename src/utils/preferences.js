/** @file Client-side preferences stored in localStorage (not Supabase) */

const UNIT_SYSTEM_KEY = 'gtho_v2_unit_system';

/**
 * Get the user's unit system preference.
 * @returns {'metric'|'imperial'}
 */
export function getUnitSystem() {
  return localStorage.getItem(UNIT_SYSTEM_KEY) || 'imperial';
}

/**
 * Set the user's unit system preference.
 * @param {'metric'|'imperial'} system
 */
export function setUnitSystem(system) {
  localStorage.setItem(UNIT_SYSTEM_KEY, system);
}
