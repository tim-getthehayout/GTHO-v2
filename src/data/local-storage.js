/** @file localStorage wrapper for entity persistence */

const PREFIX = 'gtho_v2_';

/**
 * Save entity data to localStorage.
 * @param {string} entityType - Entity type key, e.g. 'events'
 * @param {Array} data - Array of records
 */
export function saveToStorage(entityType, data) {
  try {
    localStorage.setItem(PREFIX + entityType, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — silent fail, sync will recover
  }
}

/**
 * Load entity data from localStorage.
 * @param {string} entityType - Entity type key
 * @returns {Array}
 */
export function loadFromStorage(entityType) {
  try {
    const raw = localStorage.getItem(PREFIX + entityType);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clear all GTHO v2 data from localStorage.
 */
export function clearStorage() {
  const keysToRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}
