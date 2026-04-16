/** @file Store — single data access point. See V2_APP_ARCHITECTURE.md §4. */

import { saveToStorage, loadFromStorage } from './local-storage.js';
import { validate as validateOperation, toSupabaseShape as operationToSb } from '../entities/operation.js';
import { validate as validateUserPref, toSupabaseShape as userPrefToSb } from '../entities/user-preference.js';

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
  // D5b: Event Observations
  'eventObservations',
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
  'animalNotes',
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

  // 4. Queue sync (insert for new records)
  if (syncAdapter && toSupabaseFn && table) {
    syncAdapter.push(table, toSupabaseFn(record), 'insert');
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

  // 4. Queue sync (update for existing records)
  if (syncAdapter && toSupabaseFn && table) {
    syncAdapter.push(table, toSupabaseFn(updated), 'update');
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

// --- Convenience Getters ---

/**
 * Get the current operation (first/only operation).
 * @returns {object|undefined}
 */
export function getOperation() {
  const op = state.operations[0];
  return op ? { ...op } : undefined;
}

// --- Dedicated Actions ---

/**
 * Set the unit system on the current operation.
 * validate → mutate → persist → queue sync → notify
 * @param {'metric'|'imperial'} value
 * @returns {object} The updated operation
 */
export function setUnitSystem(value) {
  const index = state.operations.findIndex(() => true);
  if (index === -1) {
    throw new Error('No operation exists to set unit system on');
  }

  const updated = { ...state.operations[index], unitSystem: value, updatedAt: new Date().toISOString() };

  const result = validateOperation(updated);
  if (!result.valid) {
    throw new Error(`Validation failed for operation: ${result.errors.join(', ')}`);
  }

  state.operations[index] = updated;
  saveToStorage('operations', state.operations);

  if (syncAdapter) {
    syncAdapter.push('operations', operationToSb(updated), 'update');
  }

  notify('operations');
  return updated;
}

/**
 * Get the active farm ID from user preferences.
 * Returns null for "All farms" mode.
 * @returns {string|null}
 */
export function getActiveFarmId() {
  const prefs = state.userPreferences[0];
  return prefs?.activeFarmId ?? null;
}

/**
 * Set the active farm for display filtering.
 * Pass null for "All farms" mode.
 * validate → mutate → persist → sync → notify
 * @param {string|null} farmId
 */
export function setActiveFarm(farmId) {
  const index = state.userPreferences.findIndex(() => true);
  if (index === -1) return;

  // If farmId is set but doesn't exist, fall back to first available farm
  if (farmId != null) {
    const farmExists = state.farms.some(f => f.id === farmId);
    if (!farmExists) {
      farmId = state.farms.length ? state.farms[0].id : null;
    }
  }

  const updated = { ...state.userPreferences[index], activeFarmId: farmId, updatedAt: new Date().toISOString() };

  const result = validateUserPref(updated);
  if (!result.valid) return;

  state.userPreferences[index] = updated;
  saveToStorage('userPreferences', state.userPreferences);

  if (syncAdapter) {
    syncAdapter.push('user_preferences', userPrefToSb(updated), 'update');
  }

  notify('userPreferences');
}

/**
 * Get locations filtered by active farm. Null = all locations.
 * @returns {Array}
 */
export function getVisibleLocations() {
  const farmId = getActiveFarmId();
  const all = (state.locations || []).map(r => ({ ...r }));
  if (!farmId) return all;
  return all.filter(l => l.farmId === farmId);
}

/**
 * Get groups filtered by active farm (via group.farmId).
 * @returns {Array}
 */
export function getVisibleGroups() {
  const farmId = getActiveFarmId();
  const all = (state.groups || []).map(r => ({ ...r }));
  if (!farmId) return all;
  return all.filter(g => g.farmId === farmId);
}

/**
 * Get events filtered by active farm.
 * @returns {Array}
 */
export function getVisibleEvents() {
  const farmId = getActiveFarmId();
  const all = (state.events || []).map(r => ({ ...r }));
  if (!farmId) return all;
  return all.filter(e => e.farmId === farmId);
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

// --- Merge (pull from remote) ---

/**
 * Merge remote records into the store for a given entity type.
 * Remote wins when updated_at is newer. New records are added.
 * @param {string} entityType
 * @param {Array<object>} remoteRecords - Already converted via fromSupabaseShape
 * @returns {{ added: number, updated: number }}
 */
export function mergeRemote(entityType, remoteRecords) {
  let added = 0;
  let updated = 0;

  for (const remote of remoteRecords) {
    const localIdx = state[entityType].findIndex(r => r.id === remote.id);
    if (localIdx === -1) {
      // New record from remote
      state[entityType].push(remote);
      added++;
    } else {
      // Existing — remote wins if newer
      const local = state[entityType][localIdx];
      const localTime = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
      const remoteTime = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
      if (remoteTime >= localTime) {
        state[entityType][localIdx] = remote;
        updated++;
      }
    }
  }

  if (added > 0 || updated > 0) {
    saveToStorage(entityType, state[entityType]);
    notify(entityType);
  }

  return { added, updated };
}

/**
 * Reset the store (for testing).
 */
export function _reset() {
  initState();
  syncAdapter = null;
}
