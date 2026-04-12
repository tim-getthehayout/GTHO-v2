/** @file Store — single data access point. See V2_APP_ARCHITECTURE.md §4. */

import { saveToStorage, loadFromStorage } from './local-storage.js';

/**
 * All entity type keys used in the store.
 * Matches the 51 tables across D1–D11.
 */
export const ENTITY_TYPES = [
  // D1: Operation & Farm Setup
  'operations', 'farms', 'farmSettings', 'operationMembers', 'userPreferences',
  // D2: Locations
  'locations', 'forageTypes',
  // D3: Animals & Groups
  'animalClasses', 'animals', 'groups', 'animalGroupMemberships',
  // D4: Feed Inventory
  'feedTypes', 'batches', 'batchAdjustments',
  // D5: Events
  'events', 'eventPaddockWindows', 'eventGroupWindows', 'eventFeedEntries',
  'eventFeedChecks', 'eventFeedCheckItems',
  // D6: Surveys
  'surveys', 'surveyDraftEntries', 'paddockObservations',
  // D7: Harvest
  'harvestEvents', 'harvestEventFields',
  // D8: Nutrients & Amendments
  'inputProductCategories', 'inputProductUnits', 'inputProducts', 'spreaders',
  'soilTests', 'amendments', 'amendmentLocations', 'manureBatches',
  'manureBatchTransactions', 'npkPriceHistory',
  // D9: Livestock Health
  'aiBulls', 'treatmentCategories', 'treatmentTypes', 'doseUnits',
  'animalBcsScores', 'animalTreatments', 'animalBreedingRecords',
  'animalHeatRecords', 'animalCalvingRecords', 'animalWeightRecords',
  // D10: Feed Quality
  'batchNutritionalProfiles',
  // D11: App Infrastructure
  'appLogs', 'submissions', 'todos', 'todoAssignments', 'releaseNotes',
];

/** In-memory state */
const state = {};

/** Subscriber registry: { entityType: Set<callback> } */
const subscribers = {};

/** Current sync adapter instance */
let syncAdapter = null;

/**
 * Initialize store state arrays for all entity types.
 */
function initState() {
  for (const type of ENTITY_TYPES) {
    state[type] = [];
    subscribers[type] = new Set();
  }
}

// Initialize on module load
initState();

/**
 * Load all entity types from localStorage into state.
 */
export function init() {
  for (const type of ENTITY_TYPES) {
    state[type] = loadFromStorage(type);
  }
}

/**
 * Set the sync adapter.
 * @param {import('./sync-adapter.js').SyncAdapter} adapter
 */
export function setSyncAdapter(adapter) {
  syncAdapter = adapter;
}

/**
 * Get the sync adapter.
 * @returns {import('./sync-adapter.js').SyncAdapter|null}
 */
export function getSyncAdapter() {
  return syncAdapter;
}

// --- Getters (return shallow copies) ---

/**
 * Get all records of an entity type.
 * @param {string} entityType
 * @returns {Array}
 */
export function getAll(entityType) {
  return (state[entityType] || []).map(r => ({ ...r }));
}

/**
 * Get a single record by id.
 * @param {string} entityType
 * @param {string} id
 * @returns {object|undefined}
 */
export function getById(entityType, id) {
  const record = (state[entityType] || []).find(r => r.id === id);
  return record ? { ...record } : undefined;
}

/**
 * Get records filtered by a field value.
 * @param {string} entityType
 * @param {string} field
 * @param {*} value
 * @returns {Array}
 */
export function getByField(entityType, field, value) {
  return (state[entityType] || []).filter(r => r[field] === value).map(r => ({ ...r }));
}

// --- Actions (validate → mutate → persist → queue sync → notify) ---

/**
 * Add a record to the store.
 * @param {string} entityType
 * @param {object} record - Already created via entity's create()
 * @param {Function} validateFn - Entity's validate() function
 * @param {Function} [toSupabaseFn] - Entity's toSupabaseShape() for sync
 * @param {string} [table] - Supabase table name for sync
 * @returns {object} The added record
 */
export function add(entityType, record, validateFn, toSupabaseFn, table) {
  // 1. Validate
  const result = validateFn(record);
  if (!result.valid) {
    throw new Error(`Validation failed for ${entityType}: ${result.errors.join(', ')}`);
  }

  // 2. Mutate state
  state[entityType].push(record);

  // 3. Persist to localStorage
  saveToStorage(entityType, state[entityType]);

  // 4. Queue sync
  if (syncAdapter && toSupabaseFn && table) {
    syncAdapter.push(table, toSupabaseFn(record));
  }

  // 5. Notify subscribers
  notify(entityType);

  return record;
}

/**
 * Update a record in the store.
 * @param {string} entityType
 * @param {string} id
 * @param {object} changes - Partial record with fields to update
 * @param {Function} validateFn
 * @param {Function} [toSupabaseFn]
 * @param {string} [table]
 * @returns {object} The updated record
 */
export function update(entityType, id, changes, validateFn, toSupabaseFn, table) {
  const index = state[entityType].findIndex(r => r.id === id);
  if (index === -1) {
    throw new Error(`${entityType} record not found: ${id}`);
  }

  const updated = { ...state[entityType][index], ...changes, updatedAt: new Date().toISOString() };

  // 1. Validate
  const result = validateFn(updated);
  if (!result.valid) {
    throw new Error(`Validation failed for ${entityType}: ${result.errors.join(', ')}`);
  }

  // 2. Mutate state
  state[entityType][index] = updated;

  // 3. Persist
  saveToStorage(entityType, state[entityType]);

  // 4. Queue sync
  if (syncAdapter && toSupabaseFn && table) {
    syncAdapter.push(table, toSupabaseFn(updated));
  }

  // 5. Notify
  notify(entityType);

  return updated;
}

/**
 * Remove a record from the store.
 * @param {string} entityType
 * @param {string} id
 * @param {string} [table] - Supabase table name for sync
 */
export function remove(entityType, id, table) {
  const index = state[entityType].findIndex(r => r.id === id);
  if (index === -1) return;

  // Mutate
  state[entityType].splice(index, 1);

  // Persist
  saveToStorage(entityType, state[entityType]);

  // Queue sync
  if (syncAdapter && table) {
    syncAdapter.delete(table, id);
  }

  // Notify
  notify(entityType);
}

// --- Subscribers ---

/**
 * Subscribe to changes for an entity type.
 * @param {string} entityType
 * @param {Function} callback
 * @returns {Function} unsubscribe
 */
export function subscribe(entityType, callback) {
  if (!subscribers[entityType]) {
    subscribers[entityType] = new Set();
  }
  subscribers[entityType].add(callback);
  return () => subscribers[entityType].delete(callback);
}

/**
 * Notify all subscribers for an entity type.
 * @param {string} entityType
 */
function notify(entityType) {
  const subs = subscribers[entityType];
  if (subs) {
    for (const cb of subs) {
      cb(getAll(entityType));
    }
  }
}

/**
 * Reset the store (for testing).
 */
export function _reset() {
  initState();
  syncAdapter = null;
}
