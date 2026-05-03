/** @file Store — single data access point. See V2_APP_ARCHITECTURE.md §4. */

import { saveToStorage, loadFromStorage } from './local-storage.js';
import { getUser } from '../features/auth/session.js';
import { validate as validateOperation, toSupabaseShape as operationToSb } from '../entities/operation.js';
import { validate as validateUserPref, toSupabaseShape as userPrefToSb } from '../entities/user-preference.js';
import * as GroupWindowEntity from '../entities/event-group-window.js';
import * as GroupEntity from '../entities/group.js';
import * as PaddockWindowEntity from '../entities/event-paddock-window.js';
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
  // D6: Surveys + paddock observations (OI-0113 dropped event_observations)
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
 * OI-0138: returns true if the current authenticated user has `is_dev = true`
 * on their `operation_members` row for the given operation. Gates the entire
 * Dev Mode shelf in `src/ui/router.js`. Defensive: returns false when user is
 * unauthenticated, operationId is missing, or the member row isn't loaded yet.
 * @param {string} operationId
 * @returns {boolean}
 */
export function isCurrentUserDev(operationId) {
  const userId = getUser()?.id;
  if (!userId || !operationId) return false;
  const member = state.operationMembers.find(
    (m) => m.userId === userId && m.operationId === operationId,
  );
  return member?.isDev === true;
}

/**
 * OI-0138: returns true if the current authenticated user is owner or admin on
 * the given operation. Gates the Dev Mode access toggle in member-management
 * (only owners/admins can grant Dev Mode access to other members).
 * @param {string} operationId
 * @returns {boolean}
 */
export function isCurrentUserOwnerOrAdmin(operationId) {
  const userId = getUser()?.id;
  if (!userId || !operationId) return false;
  const member = state.operationMembers.find(
    (m) => m.userId === userId && m.operationId === operationId,
  );
  return member?.role === 'owner' || member?.role === 'admin';
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
 * OI-0133: Derive a group's current farm from its most recent open
 * event_group_window → event.farmId. Returns null if the group has no
 * open window (newly created, fully archived, or between placements).
 *
 * "Most recent open" = window where dateLeft is null/undefined, sorted
 * by dateJoined DESC then timeJoined DESC; take first. Pure function
 * over store state — no I/O.
 *
 * @param {string} groupId
 * @returns {string|null} farmId of the owning event, or null
 */
export function getGroupCurrentFarm(groupId) {
  const openWindows = (state.eventGroupWindows || [])
    .filter(w => w.groupId === groupId && !w.dateLeft);
  if (!openWindows.length) return null;
  const latest = openWindows.sort((a, b) => {
    const dateCmp = (b.dateJoined || '').localeCompare(a.dateJoined || '');
    if (dateCmp !== 0) return dateCmp;
    return (b.timeJoined || '').localeCompare(a.timeJoined || '');
  })[0];
  const event = (state.events || []).find(e => e.id === latest.eventId);
  return event?.farmId ?? null;
}

/**
 * OI-0133: Filter groups by the active farm. The group's farm is derived
 * from its most recent open event_group_window via getGroupCurrentFarm.
 * Groups with no open window have no current farm; they appear in the
 * "All farms" view (activeFarmId === null) and are excluded from
 * per-farm views.
 * @returns {Array}
 */
export function getVisibleGroups() {
  const farmId = getActiveFarmId();
  const all = (state.groups || []).map(r => ({ ...r }));
  if (!farmId) return all;
  return all.filter(g => getGroupCurrentFarm(g.id) === farmId);
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

// OI-0151: notify batching + microtask coalescing.
// Two paths feed the same dirty set + drain logic:
//   1. Explicit batch — `_doPullAllRemote()`, future CP-56 import, future bulk
//      flows wrap their multi-mutation work in `beginBatch()` / `endBatch()`.
//      Each `notify()` adds to `dirtyEntities` but does not drain; the drain
//      runs once at the matching `endBatch()`.
//   2. Microtask coalescing outside batch — synchronous bursts (e.g. a single
//      user mutation that cascades into multiple `notify()` calls) collapse
//      into one drain at the next microtask. Without this, three back-to-back
//      `notify()`s on the same tick would each iterate subscribers eagerly.
// Both paths funnel through `drainNotifications()`, which dedupes callbacks
// by identity so a multi-subscription consumer (the dashboard subscribes the
// same `rerender` against six entity types) fires exactly once per drain.
let batchDepth = 0;
const dirtyEntities = new Set();
let drainQueued = false;

/**
 * Open a notification batch. Mutations inside the batch accumulate dirty
 * entity types; the drain runs once at the matching `endBatch()`.
 * Counter-based — nested batches do not drain on inner `endBatch()`.
 */
export function beginBatch() {
  batchDepth++;
}

/**
 * Close a notification batch. When the outermost batch closes, drains all
 * dirty entity types accumulated since the first `beginBatch()`.
 * Defensive: an unmatched `endBatch()` is a no-op (does not drain, does not
 * throw).
 */
export function endBatch() {
  if (batchDepth === 0) return;
  if (--batchDepth > 0) return;
  const dirty = [...dirtyEntities];
  dirtyEntities.clear();
  drainNotifications(dirty);
}

/**
 * Notify subscribers for an entity type. Inside a batch, only marks the
 * type dirty. Outside a batch, queues a single microtask drain that absorbs
 * any further synchronous-tick notifications.
 * @param {string} entityType
 */
function notify(entityType) {
  dirtyEntities.add(entityType);
  if (batchDepth > 0) return;
  if (drainQueued) return;
  drainQueued = true;
  queueMicrotask(() => {
    drainQueued = false;
    const dirty = [...dirtyEntities];
    dirtyEntities.clear();
    drainNotifications(dirty);
  });
}

/**
 * Fire callbacks for the given dirty entity types. A callback registered
 * against multiple dirty types fires exactly once per drain (dedup by
 * callback identity). Subscriber errors are caught + logged so a thrown
 * subscriber does not break sibling callbacks.
 * @param {string[]} dirtyTypes
 */
function drainNotifications(dirtyTypes) {
  const fired = new Set();
  for (const e of dirtyTypes) {
    const subs = subscribers[e];
    if (!subs) continue;
    // OI-0152: snapshot before iterating. JS Set iteration visits values
    // added during iteration; a recursive-resubscribe callback (e.g. a
    // subscriber that calls a parent render which unsubscribes itself and
    // registers a new sibling subscription) would otherwise loop forever
    // because every new entry added to `subs` mid-drain is picked up by
    // the same iterator. Subscribers added during the current drain are
    // captured by the next drain, not this one — that is the load-bearing
    // contract: "fire all subscribers as of drain start," nothing more.
    const snapshot = [...subs];
    for (const cb of snapshot) {
      if (fired.has(cb)) continue;
      fired.add(cb);
      try {
        cb(getAll(e));
      } catch (err) {
        logger.error('store', 'subscriber threw during drain', {
          entityType: e,
          error: err && err.message ? err.message : String(err),
        });
      }
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
    animalClasses: state.animalClasses,
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
  const eventLabel = event ? event.id.slice(0, 8) : 'event';
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
    animalClasses: state.animalClasses,
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

/**
 * OI-0094 helper: if the group is on an open event, split its open window so
 * calcs pick up the new live head/weight. No-op when the group isn't placed.
 *
 * Promoted to shared export 2026-04-18 per OI-0096 prereq — previously defined
 * locally in calving.js and animals/index.js.
 *
 * @param {string} groupId
 * @param {string} changeDate  ISO date (YYYY-MM-DD)
 */
export function maybeSplitForGroup(groupId, changeDate) {
  if (!groupId || !changeDate) return;
  const openGW = state.eventGroupWindows.find(w => w.groupId === groupId && !w.dateLeft);
  if (!openGW) return;
  const ctx = {
    memberships: state.animalGroupMemberships,
    animals: state.animals,
    animalClasses: state.animalClasses,
    animalWeightRecords: state.animalWeightRecords,
    now: changeDate,
  };
  const liveHead = getLiveWindowHeadCount({ ...openGW, dateLeft: null }, ctx);
  const liveAvg = getLiveWindowAvgWeight({ ...openGW, dateLeft: null }, ctx);
  splitGroupWindow(groupId, openGW.eventId, changeDate, null, {
    headCount: liveHead, avgWeightKg: liveAvg,
  });
}

// --- OI-0095: Event Paddock Window Split on State Change ---

function findOpenPaddockWindow(locationId, eventId) {
  return state.eventPaddockWindows.find(
    w => w.locationId === locationId && w.eventId === eventId && !w.dateClosed,
  );
}

/**
 * Close the current open event_paddock_window for (locationId, eventId) by
 * stamping dateClosed / timeClosed. No new window opens. Terminal close path
 * used by event-close and move-wizard close loops.
 *
 * @param {string} locationId
 * @param {string} eventId
 * @param {string} closeDate   ISO date (YYYY-MM-DD)
 * @param {string|null} closeTime  HH:mm:ss or null
 * @returns {{ closedId: string|null }}
 */
export function closePaddockWindow(locationId, eventId, closeDate, closeTime) {
  const openPW = findOpenPaddockWindow(locationId, eventId);
  if (!openPW) {
    logger.warn('store', 'closePaddockWindow: no open window found', { locationId, eventId });
    return { closedId: null };
  }
  update(
    'eventPaddockWindows', openPW.id,
    { dateClosed: closeDate, timeClosed: closeTime },
    PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
  );
  return { closedId: openPW.id };
}

/**
 * Split the current open event_paddock_window on a state change: close it at
 * changeDate with its existing areaPct / isStripGraze / stripGroupId snapshot
 * intact (historical truth), then open a new window carrying newState.
 *
 * Accepts any of { areaPct, isStripGraze, stripGroupId, noPasture } in newState;
 * fields not provided fall back to the closing row's values.
 *
 * @param {string} locationId
 * @param {string} eventId
 * @param {string} changeDate   ISO date
 * @param {string|null} changeTime  HH:mm:ss or null
 * @param {{ areaPct?: number, isStripGraze?: boolean, stripGroupId?: string|null, noPasture?: boolean }} newState
 * @returns {{ closedId: string|null, newId: string|null }}
 */
export function splitPaddockWindow(locationId, eventId, changeDate, changeTime, newState) {
  const openPW = findOpenPaddockWindow(locationId, eventId);
  if (!openPW) {
    logger.warn('store', 'splitPaddockWindow: no open window found', { locationId, eventId });
    return { closedId: null, newId: null };
  }

  // Close current window (snapshot preserved intact — dateClosed only).
  update(
    'eventPaddockWindows', openPW.id,
    { dateClosed: changeDate, timeClosed: changeTime },
    PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
  );

  // Open new window with newState overriding the closing row's state.
  const next = {
    areaPct: newState && newState.areaPct !== undefined ? newState.areaPct : openPW.areaPct,
    isStripGraze: newState && newState.isStripGraze !== undefined ? newState.isStripGraze : openPW.isStripGraze,
    stripGroupId: newState && newState.stripGroupId !== undefined ? newState.stripGroupId : openPW.stripGroupId,
    noPasture: newState && newState.noPasture !== undefined ? newState.noPasture : openPW.noPasture,
  };
  const newPW = PaddockWindowEntity.create({
    operationId: openPW.operationId,
    eventId,
    locationId,
    dateOpened: changeDate,
    timeOpened: changeTime,
    areaPct: next.areaPct,
    isStripGraze: next.isStripGraze,
    stripGroupId: next.stripGroupId,
    noPasture: next.noPasture,
  });
  add(
    'eventPaddockWindows', newPW,
    PaddockWindowEntity.validate, PaddockWindowEntity.toSupabaseShape, 'event_paddock_windows',
  );

  return { closedId: openPW.id, newId: newPW.id };
}

// --- OI-0090 / SP-11: Group archive / reactivate ---

/**
 * Archive a group — stamp `archivedAt` with the current ISO timestamp.
 * Group disappears from all `archivedAt IS NULL` pickers.
 *
 * @param {string} groupId
 * @returns {object|null} updated group record, or null if not found
 */
export function archiveGroup(groupId) {
  const existing = state.groups.find(g => g.id === groupId);
  if (!existing) {
    logger.warn('store', 'archiveGroup: group not found', { groupId });
    return null;
  }
  return update(
    'groups', groupId,
    { archivedAt: new Date().toISOString() },
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups'
  );
}

/**
 * Reactivate an archived group — clear `archivedAt`. Group returns to active
 * pickers; historical `event_group_windows` remain untouched.
 *
 * @param {string} groupId
 * @returns {object|null} updated group record, or null if not found
 */
export function reactivateGroup(groupId) {
  const existing = state.groups.find(g => g.id === groupId);
  if (!existing) {
    logger.warn('store', 'reactivateGroup: group not found', { groupId });
    return null;
  }
  return update(
    'groups', groupId,
    { archivedAt: null },
    GroupEntity.validate, GroupEntity.toSupabaseShape, 'groups'
  );
}
