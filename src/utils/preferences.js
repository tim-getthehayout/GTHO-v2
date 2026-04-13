/** @file Client-side preferences — field mode in localStorage, unit system on operations (A44) */

import { getOperation, setUnitSystem as storeSetUnitSystem } from '../data/store.js';

const FIELD_MODE_KEY = 'gtho_v2_field_mode';
const LEGACY_UNIT_KEY = 'gtho_v2_unit_system';

/**
 * Get the user's unit system preference from the operation.
 * Falls back to 'imperial' if no operation exists yet (pre-onboarding).
 * @returns {'metric'|'imperial'}
 */
export function getUnitSystem() {
  const op = getOperation();
  return op?.unitSystem ?? 'imperial';
}

/**
 * Set the unit system on the current operation via the store.
 * @param {'metric'|'imperial'} system
 */
export function setUnitSystem(system) {
  storeSetUnitSystem(system);
}

/**
 * One-time migration: if the legacy localStorage key exists,
 * write it to the operation and delete the key.
 * Call once during boot after store is initialized.
 */
export function migrateUnitSystemFromLocalStorage() {
  const legacy = localStorage.getItem(LEGACY_UNIT_KEY);
  if (!legacy) return;

  const op = getOperation();
  if (op && op.unitSystem === 'imperial' && (legacy === 'metric' || legacy === 'imperial')) {
    storeSetUnitSystem(legacy);
  }
  localStorage.removeItem(LEGACY_UNIT_KEY);
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
