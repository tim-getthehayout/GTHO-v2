/** @file Client-side preferences stored in localStorage (not Supabase) */

const UNIT_SYSTEM_KEY = 'gtho_v2_unit_system';
const FIELD_MODE_KEY = 'gtho_v2_field_mode';

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

/**
 * Get field mode state.
 * @returns {boolean}
 */
export function getFieldMode() {
  return localStorage.getItem(FIELD_MODE_KEY) === 'true';
}

/**
 * Set field mode state.
 * @param {boolean} enabled
 */
export function setFieldMode(enabled) {
  localStorage.setItem(FIELD_MODE_KEY, enabled ? 'true' : 'false');
  if (enabled) {
    document.body.classList.add('field-mode');
  } else {
    document.body.classList.remove('field-mode');
  }
}
