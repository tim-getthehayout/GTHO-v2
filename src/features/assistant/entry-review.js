/** Normal entry UI bridge. This module never imports the feedback interview. */
import { getAll, runDurableWrite } from '../../data/store.js';
import { createArtifactStore } from './artifact-store.js';
import { ENTRY_TARGET_KEY } from './entry-fields.js';

/** The resolved-names key travels with the proposal, not into the sheet. */
const sheetFields = fields => Object.fromEntries(Object.entries(fields).filter(([key]) => key !== ENTRY_TARGET_KEY));

export const reviewSave = (review, save) => review ? () => review.requestConfirmation(save) : save;
const normalized = value => Array.isArray(value) ? value.map(normalized) : value !== null && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key,normalized(value[key])])) : value;
const comparable = value => JSON.stringify(normalized(value));
export function createEntryReview({ scope, conversationRef, authorize, onConfirm, onCorrect, persist = createArtifactStore({ authorize }) }) {
  let current, binding, revision, card, save, evidence;
  async function auth() { if (await authorize(scope) !== true) throw new Error('unauthorized'); }
  const review = {
    bind(value) { binding = value; },
    async render(proposal, open) {
      await auth();
      current = globalThis.structuredClone(proposal); binding = null; evidence = null;
      let stored = getAll('assistantProposals').find(row => row.id === proposal.id && row.operationId === scope.operationId);
      if (!stored) await persist(scope,'assistantProposals',{ id: proposal.id, operationId: scope.operationId, conversationId: conversationRef, destinationEntity: proposal.destination, destinationUi: proposal.destination });
      const old = getAll('assistantProposalRevisions').filter(row => row.proposalId === proposal.id && row.operationId === scope.operationId);
      revision = old.find(row => row.revisionNumber === proposal.revision);
      if (!revision) {
        revision = await persist(scope,'assistantProposalRevisions',{ operationId: scope.operationId, proposalId: proposal.id, revisionNumber: proposal.revision, destinationFieldNames: Object.keys(proposal.fields) });
        for (const prior of old.filter(row => !row.supersededById)) await persist(scope,'assistantProposalRevisions',{ ...prior,supersededById: revision.id });
      }
      open(review,sheetFields(proposal.fields));
      if (!binding) throw new Error('normal-entry-ui-binding-required');
      const extra = Object.keys(sheetFields(proposal.fields)).filter(key => !binding.fields[key]);
      if (extra.length) throw new Error('unknown-entry-field');
      for (const [key,value] of Object.entries(sheetFields(proposal.fields))) binding.fields[key].set(value);
      // Normal UI remains the review; this card is retained evidence only.
      card = await persist(scope,'assistantReviewCards',{ operationId: scope.operationId, revisionId: revision.id, presentedAt: new Date().toISOString(), populatedUi: binding.ui, presentedEvidence: Object.entries(read()).map(([key,value]) => `${key}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '')}`).join('\n') });
    },
    async requestConfirmation(write) {
      try {
        await auth();
        save = write;
        const fields = read();
        if (comparable(fields) !== comparable(current.fields)) {
          evidence = null;
          await onCorrect({ revision: current.revision, fields });
          return; // A correction must be reviewed/confirmed as a NEW revision.
        }
        evidence = { reviewCardId: card.id, clickId: crypto.randomUUID() };
        await onConfirm({ proposalId: current.id, revision: current.revision, evidence });
      } catch (error) { if (binding.status) { binding.status.textContent = error.message; binding.onError?.(); } else throw error; }
    },
    async recordConfirmation(proposal, supplied) {
      await auth();
      if (!evidence || comparable(supplied) !== comparable(evidence) || proposal.id !== current.id || proposal.revision !== current.revision || comparable(proposal.fields) !== comparable(read())) throw new Error('explicit-normal-ui-confirmation-required');
      const confirmation = await persist(scope,'assistantReviewConfirmations',{ operationId: scope.operationId, cardId: card.id, revisionId: revision.id, actorId: scope.actorId, confirmedAt: new Date().toISOString(), channel: 'text' });
      evidence = null;
      return confirmation.id;
    },
    async execute(proposal, receipt, key) {
      await auth();
      const tuple = JSON.parse(key);
      if (comparable(tuple) !== comparable([scope.operationId,conversationRef,proposal.id,proposal.revision])) throw new Error('execution-key-mismatch');
      const result = runDurableWrite(key, () => {
      const confirmation = getAll('assistantReviewConfirmations').find(row => row.id === receipt && row.operationId === scope.operationId && row.actorId === scope.actorId && row.revisionId === revision?.id);
      if (!confirmation || !save || comparable(proposal.fields) !== comparable(read())) throw new Error('stale-normal-ui-confirmation');
        const before = new Set(getAll(binding.entityType).map(row => row.id));
        save();
        if (binding.status?.textContent.trim()) throw new Error(binding.status.textContent);
        const created = getAll(binding.entityType).filter(row => row.operationId === scope.operationId && !before.has(row.id));
        return binding.savedRecordId?.() || created.at(-1)?.id;
      });
      binding?.close?.();
      return result;
    },
    fields() { return binding ? Object.entries(binding.fields).map(([name,field]) => ({ name, required: field.required, label: field.label || name })) : []; },
  };
  function read() {
    const values = Object.fromEntries(Object.entries(binding.fields).map(([key,field]) => [key,field.get()]));
    return current && Object.hasOwn(current.fields,ENTRY_TARGET_KEY) ? { ...values,[ENTRY_TARGET_KEY]: globalThis.structuredClone(current.fields[ENTRY_TARGET_KEY]) } : values;
  }
  return review;
}
export function inputField(input, required = false, label) {
  return { required,label,get: () => input.type === 'checkbox' ? input.checked : input.value || null,
    set: value => { if (input.type === 'checkbox') input.checked = !!value; else input.value = value ?? ''; input.dispatchEvent(new Event('input',{ bubbles: true }));input.dispatchEvent(new Event('change',{ bubbles: true })); } };
}

export function stateField(state,key,required = false) {
  return { required,get: () => state[key] ?? null,set: value => { state[key] = globalThis.structuredClone(value); } };
}
export function observationField(card) {
  return { required: false,get: () => card.getValues(),set: value => {
    // The normal card was populated through initialValues; its conversions and
    // farm defaults are reviewed as a new revision, never silently bypassed.
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !Object.hasOwn(card.getValues(),key))) throw new Error('unsupported-observation-field');
  } };
}
