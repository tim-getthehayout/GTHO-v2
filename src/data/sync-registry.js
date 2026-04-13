/** @file Sync registry — maps entity types to Supabase table names + shape functions.
 *  Used by pull/merge to convert remote rows into local records.
 */

import { fromSupabaseShape as fromOperation } from '../entities/operation.js';
import { fromSupabaseShape as fromFarm } from '../entities/farm.js';
import { fromSupabaseShape as fromFarmSetting } from '../entities/farm-setting.js';
import { fromSupabaseShape as fromOperationMember } from '../entities/operation-member.js';
import { fromSupabaseShape as fromUserPreference } from '../entities/user-preference.js';
import { fromSupabaseShape as fromLocation } from '../entities/location.js';
import { fromSupabaseShape as fromForageType } from '../entities/forage-type.js';
import { fromSupabaseShape as fromAnimalClass } from '../entities/animal-class.js';
import { fromSupabaseShape as fromAnimal } from '../entities/animal.js';
import { fromSupabaseShape as fromGroup } from '../entities/group.js';
import { fromSupabaseShape as fromAnimalGroupMembership } from '../entities/animal-group-membership.js';
import { fromSupabaseShape as fromFeedType } from '../entities/feed-type.js';
import { fromSupabaseShape as fromBatch } from '../entities/batch.js';
import { fromSupabaseShape as fromBatchAdjustment } from '../entities/batch-adjustment.js';
import { fromSupabaseShape as fromEvent } from '../entities/event.js';
import { fromSupabaseShape as fromEventPaddockWindow } from '../entities/event-paddock-window.js';
import { fromSupabaseShape as fromEventGroupWindow } from '../entities/event-group-window.js';
import { fromSupabaseShape as fromEventFeedEntry } from '../entities/event-feed-entry.js';
import { fromSupabaseShape as fromEventFeedCheck } from '../entities/event-feed-check.js';
import { fromSupabaseShape as fromEventFeedCheckItem } from '../entities/event-feed-check-item.js';
import { fromSupabaseShape as fromSurvey } from '../entities/survey.js';
import { fromSupabaseShape as fromSurveyDraftEntry } from '../entities/survey-draft-entry.js';
import { fromSupabaseShape as fromPaddockObservation } from '../entities/paddock-observation.js';
import { fromSupabaseShape as fromHarvestEvent } from '../entities/harvest-event.js';
import { fromSupabaseShape as fromHarvestEventField } from '../entities/harvest-event-field.js';
import { fromSupabaseShape as fromInputProductCategory } from '../entities/input-product-category.js';
import { fromSupabaseShape as fromInputProductUnit } from '../entities/input-product-unit.js';
import { fromSupabaseShape as fromInputProduct } from '../entities/input-product.js';
import { fromSupabaseShape as fromSpreader } from '../entities/spreader.js';
import { fromSupabaseShape as fromSoilTest } from '../entities/soil-test.js';
import { fromSupabaseShape as fromAmendment } from '../entities/amendment.js';
import { fromSupabaseShape as fromAmendmentLocation } from '../entities/amendment-location.js';
import { fromSupabaseShape as fromManureBatch } from '../entities/manure-batch.js';
import { fromSupabaseShape as fromManureBatchTransaction } from '../entities/manure-batch-transaction.js';
import { fromSupabaseShape as fromNpkPriceHistory } from '../entities/npk-price-history.js';
import { fromSupabaseShape as fromAiBull } from '../entities/ai-bull.js';
import { fromSupabaseShape as fromTreatmentCategory } from '../entities/treatment-category.js';
import { fromSupabaseShape as fromTreatmentType } from '../entities/treatment-type.js';
import { fromSupabaseShape as fromDoseUnit } from '../entities/dose-unit.js';
import { fromSupabaseShape as fromAnimalBcsScore } from '../entities/animal-bcs-score.js';
import { fromSupabaseShape as fromAnimalTreatment } from '../entities/animal-treatment.js';
import { fromSupabaseShape as fromAnimalBreedingRecord } from '../entities/animal-breeding-record.js';
import { fromSupabaseShape as fromAnimalHeatRecord } from '../entities/animal-heat-record.js';
import { fromSupabaseShape as fromAnimalCalvingRecord } from '../entities/animal-calving-record.js';
import { fromSupabaseShape as fromAnimalWeightRecord } from '../entities/animal-weight-record.js';
import { fromSupabaseShape as fromBatchNutritionalProfile } from '../entities/batch-nutritional-profile.js';
import { fromSupabaseShape as fromSubmission } from '../entities/submission.js';
import { fromSupabaseShape as fromTodo } from '../entities/todo.js';
import { fromSupabaseShape as fromTodoAssignment } from '../entities/todo-assignment.js';
import { fromSupabaseShape as fromReleaseNote } from '../entities/release-note.js';

/**
 * Registry mapping entity type keys to Supabase table names and shape converters.
 * Excludes appLogs (direct-write, no pull needed — A24).
 */
export const SYNC_REGISTRY = {
  operations:               { table: 'operations',                from: fromOperation },
  farms:                    { table: 'farms',                     from: fromFarm },
  farmSettings:             { table: 'farm_settings',             from: fromFarmSetting },
  operationMembers:         { table: 'operation_members',         from: fromOperationMember },
  userPreferences:          { table: 'user_preferences',          from: fromUserPreference },
  locations:                { table: 'locations',                 from: fromLocation },
  forageTypes:              { table: 'forage_types',              from: fromForageType },
  animalClasses:            { table: 'animal_classes',            from: fromAnimalClass },
  animals:                  { table: 'animals',                   from: fromAnimal },
  groups:                   { table: 'groups',                    from: fromGroup },
  animalGroupMemberships:   { table: 'animal_group_memberships',  from: fromAnimalGroupMembership },
  feedTypes:                { table: 'feed_types',                from: fromFeedType },
  batches:                  { table: 'batches',                   from: fromBatch },
  batchAdjustments:         { table: 'batch_adjustments',         from: fromBatchAdjustment },
  events:                   { table: 'events',                    from: fromEvent },
  eventPaddockWindows:      { table: 'event_paddock_windows',     from: fromEventPaddockWindow },
  eventGroupWindows:        { table: 'event_group_windows',       from: fromEventGroupWindow },
  eventFeedEntries:         { table: 'event_feed_entries',        from: fromEventFeedEntry },
  eventFeedChecks:          { table: 'event_feed_checks',         from: fromEventFeedCheck },
  eventFeedCheckItems:      { table: 'event_feed_check_items',    from: fromEventFeedCheckItem },
  surveys:                  { table: 'surveys',                   from: fromSurvey },
  surveyDraftEntries:       { table: 'survey_draft_entries',      from: fromSurveyDraftEntry },
  paddockObservations:      { table: 'paddock_observations',      from: fromPaddockObservation },
  harvestEvents:            { table: 'harvest_events',            from: fromHarvestEvent },
  harvestEventFields:       { table: 'harvest_event_fields',      from: fromHarvestEventField },
  inputProductCategories:   { table: 'input_product_categories',  from: fromInputProductCategory },
  inputProductUnits:        { table: 'input_product_units',       from: fromInputProductUnit },
  inputProducts:            { table: 'input_products',            from: fromInputProduct },
  spreaders:                { table: 'spreaders',                 from: fromSpreader },
  soilTests:                { table: 'soil_tests',                from: fromSoilTest },
  amendments:               { table: 'amendments',                from: fromAmendment },
  amendmentLocations:       { table: 'amendment_locations',       from: fromAmendmentLocation },
  manureBatches:            { table: 'manure_batches',            from: fromManureBatch },
  manureBatchTransactions:  { table: 'manure_batch_transactions', from: fromManureBatchTransaction },
  npkPriceHistory:          { table: 'npk_price_history',         from: fromNpkPriceHistory },
  aiBulls:                  { table: 'ai_bulls',                  from: fromAiBull },
  treatmentCategories:      { table: 'treatment_categories',      from: fromTreatmentCategory },
  treatmentTypes:           { table: 'treatment_types',           from: fromTreatmentType },
  doseUnits:                { table: 'dose_units',                from: fromDoseUnit },
  animalBcsScores:          { table: 'animal_bcs_scores',         from: fromAnimalBcsScore },
  animalTreatments:         { table: 'animal_treatments',         from: fromAnimalTreatment },
  animalBreedingRecords:    { table: 'animal_breeding_records',   from: fromAnimalBreedingRecord },
  animalHeatRecords:        { table: 'animal_heat_records',       from: fromAnimalHeatRecord },
  animalCalvingRecords:     { table: 'animal_calving_records',    from: fromAnimalCalvingRecord },
  animalWeightRecords:      { table: 'animal_weight_records',     from: fromAnimalWeightRecord },
  batchNutritionalProfiles: { table: 'batch_nutritional_profiles', from: fromBatchNutritionalProfile },
  submissions:              { table: 'submissions',               from: fromSubmission },
  todos:                    { table: 'todos',                     from: fromTodo },
  todoAssignments:          { table: 'todo_assignments',          from: fromTodoAssignment },
  releaseNotes:             { table: 'release_notes',             from: fromReleaseNote },
};
