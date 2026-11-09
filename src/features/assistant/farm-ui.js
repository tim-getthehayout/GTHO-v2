/** Five existing entry UIs, not a scenario/utterance catalog. No feedback import. */
import { getAll, getById } from '../../data/store.js';
import { openTreatmentSheet } from '../health/treatment.js';
import { openCalvingSheet } from '../health/calving.js';
import { openDeliverFeedSheet } from '../feed/delivery.js';
import { openMoveWizard } from '../events/move-wizard.js';
import { openPlaceWizard } from '../events/place-wizard.js';
import { createEntryReview } from './entry-review.js';
import { createFarmReadPort, FARM_READ_TOOLS } from './farm-reads.js';
export const FARM_ENTRY_UIS = Object.freeze(['treatment','calving','feeding','move','place']);

/** Target comes from authorized host resolution, never unvalidated model IDs. */
export function openFarmEntry(scope, target, review, fields) {
  const table = ['treatment','calving'].includes(target.ui) ? 'animals' : target.ui === 'place' ? 'groups' : 'events';
  const record = getById(table,target.id);
  if (!record || record.operationId !== scope.operationId) throw new Error('entry-target-outside-operation');
  const options = { review,initialFields: fields };
  if (target.ui === 'treatment') return openTreatmentSheet(record,scope.operationId,options);
  if (target.ui === 'calving') return openCalvingSheet(record,scope.operationId,options);
  if (target.ui === 'feeding') return openDeliverFeedSheet(record,scope.operationId,options);
  const farm = getById('farms',target.farmId);
  if (!farm || farm.operationId !== scope.operationId) throw new Error('entry-farm-outside-operation');
  if (target.ui === 'move') {
    if (target.scopedGroupWindowId && !getAll('eventGroupWindows').some(row => row.id === target.scopedGroupWindowId && row.operationId === scope.operationId && row.eventId === record.id && !row.dateLeft)) throw new Error('invalid-scoped-window');
    return openMoveWizard(record,scope.operationId,farm.id,{ ...options,scopedGroupWindowId: target.scopedGroupWindowId });
  }
  if (target.ui === 'place') return openPlaceWizard(record.id,scope.operationId,farm.id,options);
  throw new Error('entry-ui-not-allowed');
}
export function createFarmUiPorts({ scope,conversationRef,authorize,onConfirm,onCorrect,resolveTarget }) {
  const review = createEntryReview({ scope,conversationRef,authorize,onConfirm,onCorrect });
  const read = createFarmReadPort({ authorize,getAll });
  async function auth(incoming) { if (incoming.operationId !== scope.operationId || incoming.actorId !== scope.actorId || await authorize(incoming) !== true) throw new Error('unauthorized'); }
  return {
    async context(incoming) {
      await auth(incoming);
      return { instructions: 'Match intent to an existing entry UI. Use its required/optional fields as prompts. Present that normal UI populated; correction needs a new revision and confirmation. Missing evidence is not no.', data: { entryUis: FARM_ENTRY_UIS,fields: review.fields() },readTools: FARM_READ_TOOLS };
    },
    async read(incoming,...args) { await auth(incoming);return read(incoming,...args); },
    async renderReview(incoming,proposal) { await auth(incoming); const target = await resolveTarget(incoming,proposal); return review.render(proposal,(ui,fields) => openFarmEntry(scope,target,ui,fields)); },
    async recordConfirmation(incoming,proposal,evidence) { await auth(incoming); return review.recordConfirmation(proposal,evidence); },
    async execute(incoming,proposal,receipt,key) { await auth(incoming); const saved = await review.execute(proposal,receipt,key); return { state: saved.syncQueuedAt ? 'sync-queue' : 'local-save',result: { savedRecordId: saved.savedRecordId } }; },
    async applyConfirmedWrite(incoming,proposal,receipt,key) { await auth(incoming); return review.execute(proposal,receipt,key); },
  };
}
