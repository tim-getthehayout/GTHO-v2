/** Real browser bindings for the assistant control. Loaded only when the build
 * flag VITE_GTHO_ASSISTANT=1 is set. */
import { supabase } from '../../../data/supabase-client.js';
import { getAll, getById, add, runDurableWrite, getSyncAdapter } from '../../../data/store.js';
import { pullEntitiesStrict } from '../../../data/pull-remote.js';
import { createArtifactStore } from '../artifact-store.js';
import { createFarmUiPorts } from '../farm-ui.js';
import { CONTRACT_VERSION } from '../feedback-facts.js';
import { createAssistantApi } from './api.js';
import { createServerRowWaiter } from './conversation.js';
import { mountAssistantControl } from './panel.js';

export function createAssistantDeps({ operationId, getUser, openFeedbackSheet, screen, buildStamp, online = () => globalThis.navigator?.onLine !== false, launchTarget = null }) {
  if (!supabase) return null;
  // Local guard only; every backend call re-verifies JWT, membership and allowlist.
  const authorize = async scope => {
    const userId = getUser()?.id;
    if (!userId || scope?.operationId !== operationId || scope?.actorId !== userId) return false;
    return getAll('operationMembers').some(member => member.userId === userId && member.operationId === operationId && member.acceptedAt);
  };
  const flush = async () => { await getSyncAdapter()?.flush?.(); };
  const pullReviewRows = async () => {
    const pulled = await pullEntitiesStrict(['assistantProposals', 'assistantProposalRevisions']);
    if (!pulled.ok) throw new Error('review-rows-unavailable');
  };
  return {
    api: createAssistantApi({ supabaseUrl: import.meta.env.VITE_SUPABASE_URL, anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY, operationId, getAccessToken: async () => (await supabase.auth.getSession()).data.session?.access_token }),
    scope: () => ({ operationId, actorId: getUser()?.id }),
    persist: createArtifactStore({ authorize }),
    awaitServerRows: createServerRowWaiter({ flush, exists: async (table, id) => { const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle(); return !error && !!data; } }),
    flush, getAll, getById, add, runDurableWrite, pullReviewRows, authorize, createFarmUiPorts, openFeedbackSheet, online, launchTarget, buildStamp,
    storage: supabase.storage,
    async revisionIdFor(pending) {
      await pullReviewRows();
      const row = getAll('assistantProposalRevisions').find(revision => revision.operationId === operationId && revision.proposalId === pending.id && revision.revisionNumber === pending.revision);
      if (!row) throw new Error('review-rows-unavailable');
      return row.id;
    },
    feedbackHost: () => ({ itemId: crypto.randomUUID(), contractVersion: CONTRACT_VERSION, appId: 'gtho', screen: { state: 'known', value: screen(), source: 'host' }, buildStamp: buildStamp ? { state: 'known', value: buildStamp, source: 'host' } : { state: 'unavailable', reason: 'no build stamp in this build', source: 'host' }, capturedAt: new Date().toISOString() }),
  };
}

export function mountHeaderAssistant(button, options) {
  const deps = createAssistantDeps(options);
  if (!deps) { button.hidden = true; return Promise.resolve(null); }
  return mountAssistantControl(button, deps);
}
