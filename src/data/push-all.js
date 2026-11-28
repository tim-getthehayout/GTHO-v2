/**
 * @file "Resync to server": send only this device's unconfirmed work.
 *
 * The old full-store push (every local record re-sent with its own old
 * updated_at; the 23 Jun 2026 revert) is gone. Resync now plans from the
 * queue, the dead letters and the per-row unacked marks only, reads the
 * server copy of just those rows, and sends an item only when it is newer
 * than the server's (or is a create the server is missing). The UI shows the
 * counts first and the awaited result after (features/settings).
 */

import { UNIT_ENTITIES } from '../utils/unit-standards.js';
import { RELEASED_SCHEMA_VERSION, isTableReleased } from './schema-release.js';
import { ASSISTANT_ENTITIES } from '../features/assistant/entities.js';
import { getById, getSyncAdapter, getOperation } from './store.js';
import { SYNC_REGISTRY } from './sync-registry.js';

// toSupabaseShape imports for every entity type
import { toSupabaseShape as opToSb } from '../entities/operation.js';
import { toSupabaseShape as farmToSb } from '../entities/farm.js';
import { toSupabaseShape as fsToSb } from '../entities/farm-setting.js';
import { toSupabaseShape as memberToSb } from '../entities/operation-member.js';
import { toSupabaseShape as prefToSb } from '../entities/user-preference.js';
import { toSupabaseShape as locToSb } from '../entities/location.js';
import { toSupabaseShape as forageToSb } from '../entities/forage-type.js';
import { toSupabaseShape as classToSb } from '../entities/animal-class.js';
import { toSupabaseShape as animalToSb } from '../entities/animal.js';
import { toSupabaseShape as groupToSb } from '../entities/group.js';
import { toSupabaseShape as membershipToSb } from '../entities/animal-group-membership.js';
import { toSupabaseShape as feedTypeToSb } from '../entities/feed-type.js';
import { toSupabaseShape as batchToSb } from '../entities/batch.js';
import { toSupabaseShape as batchAdjToSb } from '../entities/batch-adjustment.js';
import { toSupabaseShape as batchBalanceToSb } from '../entities/batch-location-balance.js';
import { toSupabaseShape as batchMoveToSb } from '../entities/batch-move.js';
import { toSupabaseShape as eventToSb } from '../entities/event.js';
import { toSupabaseShape as pwToSb } from '../entities/event-paddock-window.js';
import { toSupabaseShape as gwToSb } from '../entities/event-group-window.js';
import { toSupabaseShape as feToSb } from '../entities/event-feed-entry.js';
import { toSupabaseShape as fcToSb } from '../entities/event-feed-check.js';
import { toSupabaseShape as fciToSb } from '../entities/event-feed-check-item.js';
import { toSupabaseShape as surveyToSb } from '../entities/survey.js';
import { toSupabaseShape as draftToSb } from '../entities/survey-draft-entry.js';
import { toSupabaseShape as obsToSb } from '../entities/paddock-observation.js';
import { toSupabaseShape as harvestToSb } from '../entities/harvest-event.js';
import { toSupabaseShape as harvestFieldToSb } from '../entities/harvest-event-field.js';
import { toSupabaseShape as prodCatToSb } from '../entities/input-product-category.js';
import { toSupabaseShape as prodUnitToSb } from '../entities/input-product-unit.js';
import { toSupabaseShape as prodToSb } from '../entities/input-product.js';
import { toSupabaseShape as spreaderToSb } from '../entities/spreader.js';
import { toSupabaseShape as soilToSb } from '../entities/soil-test.js';
import { toSupabaseShape as amendToSb } from '../entities/amendment.js';
import { toSupabaseShape as amendLocToSb } from '../entities/amendment-location.js';
import { toSupabaseShape as manureBToSb } from '../entities/manure-batch.js';
import { toSupabaseShape as manureTxToSb } from '../entities/manure-batch-transaction.js';
import { toSupabaseShape as npkPriceToSb } from '../entities/npk-price-history.js';
import { toSupabaseShape as milkPickupToSb } from '../entities/milk-pickup.js';
import { toSupabaseShape as calfMilkToSb } from '../entities/calf-milk-feeding.js';
import { toSupabaseShape as storedFeedPlanToSb } from '../entities/stored-feed-plan.js';
import { toSupabaseShape as storedFeedPlanRowToSb } from '../entities/stored-feed-plan-row.js';
import { toSupabaseShape as aiBullToSb } from '../entities/ai-bull.js';
import { toSupabaseShape as treatCatToSb } from '../entities/treatment-category.js';
import { toSupabaseShape as treatTypeToSb } from '../entities/treatment-type.js';
import { toSupabaseShape as doseUnitToSb } from '../entities/dose-unit.js';
import { toSupabaseShape as bcsToSb } from '../entities/animal-bcs-score.js';
import { toSupabaseShape as treatmentToSb } from '../entities/animal-treatment.js';
import { toSupabaseShape as breedingToSb } from '../entities/animal-breeding-record.js';
import { toSupabaseShape as heatToSb } from '../entities/animal-heat-record.js';
import { toSupabaseShape as calvingToSb } from '../entities/animal-calving-record.js';
import { toSupabaseShape as weightToSb } from '../entities/animal-weight-record.js';
import { toSupabaseShape as noteToSb } from '../entities/animal-note.js';
import { toSupabaseShape as batchProfileToSb } from '../entities/batch-nutritional-profile.js';
import { toSupabaseShape as subToSb } from '../entities/submission.js';
import { toSupabaseShape as todoToSb } from '../entities/todo.js';
import { toSupabaseShape as todoAssignToSb } from '../entities/todo-assignment.js';

const TO_SB_MAP = {
  ...Object.fromEntries(Object.entries(ASSISTANT_ENTITIES).filter(([, binding]) => !binding.serverOnly).map(([key, binding]) => [key, binding.entity.toSupabaseShape])),
  operations: opToSb, farms: farmToSb, farmSettings: fsToSb,
  operationMembers: memberToSb, userPreferences: prefToSb,
  locations: locToSb, forageTypes: forageToSb, animalClasses: classToSb,
  animals: animalToSb, groups: groupToSb, animalGroupMemberships: membershipToSb,
  feedTypes: feedTypeToSb, batches: batchToSb, batchAdjustments: batchAdjToSb,
  batchLocationBalances: batchBalanceToSb, batchMoves: batchMoveToSb,
  events: eventToSb, eventPaddockWindows: pwToSb, eventGroupWindows: gwToSb,
  eventFeedEntries: feToSb, eventFeedChecks: fcToSb, eventFeedCheckItems: fciToSb,
  surveys: surveyToSb, surveyDraftEntries: draftToSb, paddockObservations: obsToSb,
  harvestEvents: harvestToSb, harvestEventFields: harvestFieldToSb,
  inputProductCategories: prodCatToSb, inputProductUnits: prodUnitToSb,
  inputProducts: prodToSb, spreaders: spreaderToSb, soilTests: soilToSb,
  amendments: amendToSb, amendmentLocations: amendLocToSb,
  manureBatches: manureBToSb, manureBatchTransactions: manureTxToSb,
  npkPriceHistory: npkPriceToSb, aiBulls: aiBullToSb,
  milkPickups: milkPickupToSb, calfMilkFeedings: calfMilkToSb,
  storedFeedPlans: storedFeedPlanToSb, storedFeedPlanRows: storedFeedPlanRowToSb,
  treatmentCategories: treatCatToSb, treatmentTypes: treatTypeToSb,
  doseUnits: doseUnitToSb, animalBcsScores: bcsToSb,
  animalTreatments: treatmentToSb, animalBreedingRecords: breedingToSb,
  animalHeatRecords: heatToSb, animalCalvingRecords: calvingToSb,
  animalWeightRecords: weightToSb, animalNotes: noteToSb,
  batchNutritionalProfiles: batchProfileToSb, submissions: subToSb,
  todos: todoToSb, todoAssignments: todoAssignToSb,
};

const TABLE_TO_ENTITY = Object.fromEntries(Object.entries(SYNC_REGISTRY).map(([entityType, config]) => [config.table, entityType]));

/**
 * The local row in Supabase shape, for a marked row with no queue entry or
 * dead letter. Null (so Resync reports "can't compare") when the row or its
 * serializer is missing, or it's a unit row the old push would not send.
 * @param {string} table
 * @param {string} id
 * @returns {object|null}
 */
export function localSupabaseRow(table, id) {
  const entityType = TABLE_TO_ENTITY[table];
  const toSb = entityType ? TO_SB_MAP[entityType] : null;
  if (!toSb) return null;
  // #449: a table staged above the ceiling is never sent.
  if (!isTableReleased(table, RELEASED_SCHEMA_VERSION)) return null;
  const record = getById(entityType, id);
  if (!record) return null;
  // Unit tables: only the selected operation's own custom rows, as before.
  if (Object.hasOwn(UNIT_ENTITIES, entityType)) {
    const operationId = getOperation()?.id;
    if (!operationId || record.operationId !== operationId || RELEASED_SCHEMA_VERSION < 44) return null;
  }
  return toSb(record);
}

/**
 * Hold the sync adapter's flush lock while `task` reads, confirms and sends,
 * so a normal flush can't send the same items unchecked in parallel.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T|{ ok: false, reason: 'unavailable' }>}
 */
export async function withResyncLock(task) {
  const adapter = getSyncAdapter();
  if (!adapter?.runExclusive) return { ok: false, reason: 'unavailable' };
  return adapter.runExclusive(task);
}

/**
 * Plan a Resync (nothing is sent). Call inside withResyncLock.
 * @returns {Promise<{ ok: true, items: Array, counts: { send: number, skip: number, gone: number, cantCompare: number } } | { ok: false, reason: string, table?: string }>}
 */
export async function planResync() {
  const adapter = getSyncAdapter();
  if (!adapter?.planResync) return { ok: false, reason: 'unavailable' };
  return adapter.planResync(localSupabaseRow);
}

/**
 * Send a confirmed plan and wait for every send to settle. Call inside
 * withResyncLock, after the user confirmed.
 * @returns {Promise<{ sent: number, skipped: number, failed: number, gone: number, cantCompare: number, waiting: number }>}
 */
export async function applyResync(plan) {
  return getSyncAdapter().applyResync(plan);
}

/** The "skipped by Resync" list as a JSON export string. */
export function resyncSkippedExport() {
  const adapter = getSyncAdapter();
  const items = adapter?.getResyncSkipped ? adapter.getResyncSkipped() : [];
  return JSON.stringify({ kind: 'gtho-resync-skipped', exported_at: new Date().toISOString(), items }, null, 2);
}
