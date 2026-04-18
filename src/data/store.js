/** @file Store — single data access point. See V2_APP_ARCHITECTURE.md §4. */

import { saveToStorage, loadFromStorage } from './local-storage.js';
import { validate as validateOperation, toSupabaseShape as operationToSb } from '../entities/operation.js';
import { validate as validateUserPref, toSupabaseShape as userPrefToSb } from '../entities/user-preference.js';
import * as GroupWindowEntity from '../entities/event-group-window.js';
import { getLiveWindowHeadCount, getLiveWindowAvgWeight } from '../calcs/window-helpers.js';
import { logger } from '../utils/logger.js';

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

// ---------------------------------------------------------------------------
// Snapshot / Rollback (SP-10)
// ---------------------------------------------------------------------------

const ROLLBACK_FLAG = 'gtho_rollback_in_progress';

/**
 * Capture a snapshot of an event and all its child records.
 * Used for retro-place rollback and any future cancel-with-rollback flows.
 * @param {string} eventId
 * @returns {object} snapshot — pass to restoreSnapshot to undo
 */
export function captureEventSnapshot(eventId) {
  const event = getById('events', eventId);
  if (!event) return null;
  return {
    eventId,
    event: { ...event },
    paddockWindows: getAll('eventPaddockWindows').filter(pw => pw.eventId === eventId).map(r => ({ ...r })),
    groupWindows: getAll('eventGroupWindows').filter(gw => gw.eventId === eventId).map(r => ({ ...r })),
    feedEntries: getAll('eventFeedEntries').filter(fe => fe.eventId === eventId).map(r => ({ ...r })),
    feedChecks: getAll('eventFeedChecks').filter(fc => fc.eventId === eventId).map(r => ({ ...r })),
    observations: getAll('eventObservations').filter(o => o.eventId === eventId).map(r => ({ ...r })),
  };
}

/**
 * Restore a snapshot — replaces the event and its child records atomically.
 * @param {object} snapshot — from captureEventSnapshot
 */
export function restoreEventSnapshot(snapshot) {
  if (!snapshot) return;
  try {
    localStorage.setItem(ROLLBACK_FLAG, 'true');

    // Restore event row
    const current = getById('events', snapshot.eventId);
    if (current) {
      const changes = {};
      for (const [k, v] of Object.entries(snapshot.event)) {
        if (k !== 'id' && k !== 'createdAt') changes[k] = v;
      }
      // Direct state mutation for rollback (skip validation — restoring known-good state)
      const idx = state.events.findIndex(e => e.id === snapshot.eventId);
      if (idx >= 0) state.events[idx] = { ...snapshot.event };
      saveToStorage('events', state.events);
    }

    // Restore child collections — replace all records matching eventId
    const childTypes = [
      { key: 'eventPaddockWindows', data: snapshot.paddockWindows },
      { key: 'eventGroupWindows', data: snapshot.groupWindows },
      { key: 'eventFeedEntries', data: snapshot.feedEntries },
      { key: 'eventFeedChecks', data: snapshot.feedChecks },
      { key: 'eventObservations', data: snapshot.observations },
    ];

    for (const { key, data } of childTypes) {
      // Remove current records for this event
      state[key] = state[key].filter(r => r.eventId !== snapshot.eventId);
      // Add snapshot records back
      state[key].push(...data);
      saveToStorage(key, state[key]);
      notify(key);
    }

    notify('events');
  } finally {
    localStorage.removeItem(ROLLBACK_FLAG);
  }
}

/**
 * Check if a rollback was interrupted (app closed mid-rollback).
 * Call on app boot to complete the rollback.
 * @returns {boolean}
 */
export function isRollbackInProgress() {
  return localStorage.getItem(ROLLBACK_FLAG) === 'true';
}

/**
 * Clear the rollback flag (called after completing interrupted rollback).
 */
export function clearRollbackFlag() {
  localStorage.removeItem(ROLLBACK_FLAG);
}

// --- OI-0091: Event Window Split on State Change ---

function findOpenGroupWindow(groupId, eventId) {
  return state.eventGroupWindows.find(w => w.groupId === groupId && w.eventId === eventId && !w.dateLeft);
}

function showWindowClosedToast(message) {
  if (typeof document === 'undefined') return;
  const existing = document.querySelector('[data-testid="window-closed-toast"]');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.setAttribute('data-testid', 'window-closed-toast');
  toast.textContent = message;
  toast.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--text);color:var(--bg);padding:10px 14px;border-radius:8px;font-size:13px;z-index:400;max-width:90%;';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

/**
 * Close the current open event_group_window for (groupId, eventId) by
 * stamping live head_count + avg_weight_kg at closeDate and setting
 * dateLeft/timeLeft. No new window opens. Use on terminal state changes
 * (event close, last-membership-gone).
 *
 * @param {string} groupId
 * @param {string} eventId
 * @param {string} closeDate  ISO date (YYYY-MM-DD)
 * @param {string|null} closeTime  HH:mm:ss or null
 * @returns {{ closedId: string|null }}
 */
export function closeGroupWindow(groupId, eventId, closeDate, closeTime) {
  const openGW = findOpenGroupWindow(groupId, eventId);
  if (!openGW) {
    logger.warn('store', 'closeGroupWindow: no open window found', { groupId, eventId });
    return { closedId: null };
  }

  const ctx = {
    memberships: state.animalGroupMemberships,
    animals: state.animals,
    animalWeightRecords: state.animalWeightRecords,
    now: closeDate,
  };
  const liveHead = getLiveWindowHeadCount({ ...openGW, dateLeft: null }, ctx);
  const liveAvg = getLiveWindowAvgWeight({ ...openGW, dateLeft: null }, ctx);

  update(
    'eventGroupWindows', openGW.id,
    {
      dateLeft: closeDate,
      timeLeft: closeTime,
      headCount: Math.max(0, liveHead),
      avgWeightKg: liveAvg > 0 ? liveAvg : openGW.avgWeightKg,
    },
    GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
  );

  const group = state.groups.find(g => g.id === groupId);
  const event = state.events.find(e => e.id === eventId);
  const groupName = group?.name || 'Group';
  const eventLabel = event ? (event.dateIn || event.id.slice(0, 8)) : 'event';
  showWindowClosedToast(`${groupName} ended on ${eventLabel} as of ${closeDate}`);

  return { closedId: openGW.id };
}

/**
 * Split the current open event_group_window on a state change: close it with
 * live values stamped at changeDate, then open a new window carrying newState.
 * If newState.headCount < 1, delegates to closeGroupWindow (no new window).
 *
 * @param {string} groupId
 * @param {string} eventId
 * @param {string} changeDate  ISO date
 * @param {string|null} changeTime  HH:mm:ss or null
 * @param {{ headCount: number, avgWeightKg: number }} newState
 * @returns {{ closedId: string|null, newId: string|null }}
 */
export function splitGroupWindow(groupId, eventId, changeDate, changeTime, newState) {
  if (!newState || newState.headCount < 1) {
    const { closedId } = closeGroupWindow(groupId, eventId, changeDate, changeTime);
    return { closedId, newId: null };
  }

  const openGW = findOpenGroupWindow(groupId, eventId);
  if (!openGW) {
    logger.warn('store', 'splitGroupWindow: no open window found', { groupId, eventId });
    return { closedId: null, newId: null };
  }

  const ctx = {
    memberships: state.animalGroupMemberships,
    animals: state.animals,
    animalWeightRecords: state.animalWeightRecords,
    now: changeDate,
  };
  const liveHeadAtClose = getLiveWindowHeadCount({ ...openGW, dateLeft: null }, ctx);
  const liveAvgAtClose = getLiveWindowAvgWeight({ ...openGW, dateLeft: null }, ctx);

  update(
    'eventGroupWindows', openGW.id,
    {
      dateLeft: changeDate,
      timeLeft: changeTime,
      headCount: Math.max(0, liveHeadAtClose),
      avgWeightKg: liveAvgAtClose > 0 ? liveAvgAtClose : openGW.avgWeightKg,
    },
    GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
  );

  const newGW = GroupWindowEntity.create({
    operationId: openGW.operationId,
    eventId,
    groupId,
    dateJoined: changeDate,
    timeJoined: changeTime,
    headCount: newState.headCount,
    avgWeightKg: newState.avgWeightKg,
  });
  add(
    'eventGroupWindows', newGW,
    GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows'
  );

  return { closedId: openGW.id, newId: newGW.id };
}
