/**
 * @file Push all local state to Supabase — recovery path for OI-0049.
 * Re-queues every record from localStorage through the sync adapter.
 * Used when records exist locally but were never synced (pre-fix onboarding).
 */

import { getAll, getSyncAdapter } from './store.js';
import { SYNC_REGISTRY } from './sync-registry.js';
import { logger } from '../utils/logger.js';

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
import { toSupabaseShape as eventToSb } from '../entities/event.js';
import { toSupabaseShape as pwToSb } from '../entities/event-paddock-window.js';
import { toSupabaseShape as gwToSb } from '../entities/event-group-window.js';
import { toSupabaseShape as feToSb } from '../entities/event-feed-entry.js';
import { toSupabaseShape as fcToSb } from '../entities/event-feed-check.js';
import { toSupabaseShape as fciToSb } from '../entities/event-feed-check-item.js';
import { toSupabaseShape as eventObsToSb } from '../entities/event-observation.js';
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
  operations: opToSb, farms: farmToSb, farmSettings: fsToSb,
  operationMembers: memberToSb, userPreferences: prefToSb,
  locations: locToSb, forageTypes: forageToSb, animalClasses: classToSb,
  animals: animalToSb, groups: groupToSb, animalGroupMemberships: membershipToSb,
  feedTypes: feedTypeToSb, batches: batchToSb, batchAdjustments: batchAdjToSb,
  events: eventToSb, eventPaddockWindows: pwToSb, eventGroupWindows: gwToSb,
  eventFeedEntries: feToSb, eventFeedChecks: fcToSb, eventFeedCheckItems: fciToSb,
  eventObservations: eventObsToSb,
  surveys: surveyToSb, surveyDraftEntries: draftToSb, paddockObservations: obsToSb,
  harvestEvents: harvestToSb, harvestEventFields: harvestFieldToSb,
  inputProductCategories: prodCatToSb, inputProductUnits: prodUnitToSb,
  inputProducts: prodToSb, spreaders: spreaderToSb, soilTests: soilToSb,
  amendments: amendToSb, amendmentLocations: amendLocToSb,
  manureBatches: manureBToSb, manureBatchTransactions: manureTxToSb,
  npkPriceHistory: npkPriceToSb, aiBulls: aiBullToSb,
  treatmentCategories: treatCatToSb, treatmentTypes: treatTypeToSb,
  doseUnits: doseUnitToSb, animalBcsScores: bcsToSb,
  animalTreatments: treatmentToSb, animalBreedingRecords: breedingToSb,
  animalHeatRecords: heatToSb, animalCalvingRecords: calvingToSb,
  animalWeightRecords: weightToSb, animalNotes: noteToSb,
  batchNutritionalProfiles: batchProfileToSb, submissions: subToSb,
  todos: todoToSb, todoAssignments: todoAssignToSb,
};

/**
 * Push all records from localStorage to Supabase via the sync adapter.
 * Recovery mechanism for users who onboarded before the sync fix (OI-0049).
 * @returns {Promise<{ queued: number }>}
 */
export async function pushAllToSupabase() {
  const adapter = getSyncAdapter();
  if (!adapter) return { queued: 0 };

  let queued = 0;

  for (const [entityType, config] of Object.entries(SYNC_REGISTRY)) {
    const table = config.table;
    const toSb = TO_SB_MAP[entityType];
    if (!toSb) continue;

    const records = getAll(entityType);
    for (const record of records) {
      try {
        adapter.push(table, toSb(record));
        queued++;
      } catch (err) {
        logger.warn('resync', `Failed to queue ${entityType}`, { error: err.message });
      }
    }
  }

  // Flush the queue
  await adapter.flush();

  logger.info('resync', 'pushAllToSupabase complete', { queued });
  return { queued };
}
