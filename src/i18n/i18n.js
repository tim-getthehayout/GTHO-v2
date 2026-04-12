/** @file i18n — translation with interpolation. See V2_INFRASTRUCTURE.md §2. */

let currentLocale = {};
let currentCode = 'en';

/**
 * Load a locale by code. Fetches the JSON file and sets it as active.
 * @param {string} code - Locale code, e.g. 'en'
 * @returns {Promise<void>}
 */
export async function loadLocale(code) {
  const module = await import(`./locales/${code}.json`);
  currentLocale = module.default || module;
  currentCode = code;
}

/**
 * Set locale directly from an object (useful for testing).
 * @param {string} code
 * @param {object} localeData
 */
export function setLocale(code, localeData) {
  currentCode = code;
  currentLocale = localeData;
}

/**
 * Get the current locale code.
 * @returns {string}
 */
export function getLocale() {
  return currentCode;
}

/**
 * Translate a key with optional interpolation.
 * Supports nested keys: t('nav.dashboard') resolves locale.nav.dashboard
 * Interpolation: t('event.daysOn', { days: 14 }) replaces {days} with 14
 * Missing key: returns the key itself.
 *
 * @param {string} key - Dot-separated key path
 * @param {object} [replacements] - Key-value pairs for interpolation
 * @returns {string}
 */
export function t(key, replacements) {
  const parts = key.split('.');
  let value = currentLocale;

  for (const part of parts) {
    if (value === null || value === undefined || typeof value !== 'object') {
      return key;
    }
    value = value[part];
  }

  if (value === null || value === undefined) {
    return key;
  }

  let result = String(value);

  if (replacements) {
    for (const [k, v] of Object.entries(replacements)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }

  return result;
}
