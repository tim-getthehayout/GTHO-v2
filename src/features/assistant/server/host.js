/** Server HostPorts for the pinned ConversationRuntime. One instance per request,
 * bound to the identity the wrapper already verified. Browser-only work (normal
 * UI review, the confirmed local write, mic/audio) is a client-apply handshake.
 */
import { RuntimeError, feedback } from '../shared.js';
import * as ProposalEntity from '../../../entities/assistant-proposals.js';
import * as RevisionEntity from '../../../entities/assistant-proposal-revisions.js';
import { createFarmReadPort, FARM_READ_TOOLS } from '../farm-reads.js';
import { FARM_ENTRY_UIS, FARM_ENTRY_INSTRUCTIONS, FARM_ENTRY_FIELD_HINTS } from '../farm-entry-contract.js';
import { resolveEntryTarget, ENTRY_TARGET_KEY, ENTRY_TARGET_NAMES, CHOOSE_ENTRY_QUESTION, RESOLVE_ENTRY_TARGET_TOOL } from '../entry-targets.js';

export const FEEDBACK_EDITABLE = Object.freeze(['title', 'type', 'expected', 'actual', 'reproSteps', 'severity', 'impact', 'needsDecision', 'unknowns']);
export const CLIENT_APPLY_PENDING = 'client-apply-pending';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = code => { throw new RuntimeError(code); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireData = ({ data, error }) => { if (error) throw new Error('assistant-persistence-failed'); return data; };

const INSTRUCTIONS = {
  feedback: 'Run the pinned feedback interview. Ask exactly the one nextQuestion given in data when present; never invent answers, host fields or consent. Propose only interview fields (title, type, expected, actual, reproSteps, severity, impact, needsDecision, unknowns) as facts {state, value?, source:"user"} from what the user said. The user reviews and confirms in the normal feedback sheet; you never file.',
  'data-questions': 'Answer farm questions only from the allowlisted read tools. Missing or unresolved evidence is unknown, never no. Do not propose writes.',
  'how-to': 'Answer how-to questions about using GTHO in plain words. Answer only; never propose, file or write.',
};

/** Feedback host context is trusted host capture, validated by the pinned library. */
export function feedbackHostContext(capture) {
  const host = capture?.context?.feedbackHost;
  try { feedback.createSession(host); } catch { fail('invalid-feedback-host-context'); }
  return globalThis.structuredClone(host);
}
export function firstUserNote(session) {
  const turn = session?.transcript?.find(entry => entry.role === 'user');
  return turn ? { state: 'known', value: turn.text, source: 'user' } : null;
}
export function feedbackItem(session, fields = {}) {
  const firstNote = firstUserNote(session);
  if (!firstNote) fail('feedback-first-note-required');
  return { ...feedbackHostContext(session.capture), firstNote, ...globalThis.structuredClone(fields) };
}
/** Pinned interview state for the provider context; computed from the live session. */
export function feedbackInterview(session) {
  if (!firstUserNote(session)) return { nextQuestion: null, destination: null };
  const item = feedbackItem(session, session.pending?.intent === 'feedback' ? session.pending.fields : {});
  return { nextQuestion: feedback.nextQuestion({ status: 'draft', captureSaved: true, item }), destination: feedback.routeDestination(item) };
}

/** session: {ref, loaded, live} filled by the composition (withSession + provider). */
export function createServerHost({ client, scope, config, persistence, getAll, authorize, session: holder, log = () => {}, openSheet = null }) {
  if (!client || !scope || !config || !persistence || !getAll || !authorize || !holder) throw new Error('server-host-bindings-required');
  const current = () => holder.live ?? holder.loaded ?? null;
  async function auth(incoming) {
    if (incoming?.operationId !== scope.operationId || incoming?.actorId !== scope.actorId || await authorize(incoming) !== true) throw new Error('unauthorized');
  }
  const readPort = createFarmReadPort({ authorize: async incoming => { await auth(incoming); return true; }, getAll });
  const operationRows = async table => (await getAll(table)).filter(row => row.operationId === scope.operationId);
  /** IDs come only from resolving the names the user said; never from the model. */
  async function resolveTarget(proposal) {
    const resolved = await resolveEntryTarget({ ui: proposal.destination, names: proposal.fields[ENTRY_TARGET_KEY], fields: proposal.fields, rows: operationRows });
    if (resolved.status !== 'resolved') fail('entry-target-unresolved');
    return resolved;
  }
  async function normalize(proposal) {
    const session = current();
    if (!session || proposal.intent !== session.intent) fail('session-required');
    if (proposal.intent === 'feedback') {
      if (Object.keys(proposal.fields).some(key => !FEEDBACK_EDITABLE.includes(key))) fail('feedback-field-not-editable');
      const item = feedbackItem(session, proposal.fields);
      if (!feedback.validateItem(item, { phase: 'draft' }).valid) fail('invalid-feedback-draft');
      // The library routes; a model's destination guess is never trusted.
      return { ...proposal, destination: feedback.routeDestination(item) };
    }
    if (proposal.intent === 'data-entry') {
      if (!FARM_ENTRY_UIS.includes(proposal.destination)) fail('entry-ui-not-allowed');
      const { fill } = await resolveTarget(proposal);
      return { ...proposal, fields: { ...proposal.fields, ...fill } };
    }
    return fail('read-only-intent');
  }
  /** The trusted checkpoint references the pending revision row, so the server
   * records proposal/revision identity before checkpointing. The browser pulls
   * these rows and renders against them; it never mints a competing revision. */
  async function ensureReviewRows(proposal) {
    const insert = async (table, record) => {
      const { error } = await client.from(table).insert(record);
      if (error && error.code !== '23505') throw new Error('assistant-persistence-failed');
    };
    const existing = requireData(await client.from('assistant_proposals').select('id, conversation_id').eq('operation_id', scope.operationId).eq('id', proposal.id).maybeSingle());
    if (existing && existing.conversation_id !== holder.ref) fail('conversation-mismatch');
    const feedbackProposal = proposal.intent === 'feedback';
    if (!existing) await insert('assistant_proposals', ProposalEntity.toSupabaseShape(ProposalEntity.create({ id: proposal.id, operationId: scope.operationId, conversationId: holder.ref, destinationEntity: feedbackProposal ? 'submissions' : proposal.destination, destinationUi: feedbackProposal ? 'feedback-sheet' : proposal.destination })));
    const revisions = requireData(await client.from('assistant_proposal_revisions').select('id, revision_number, superseded_by_id').eq('operation_id', scope.operationId).eq('proposal_id', proposal.id));
    let revision = revisions.find(row => row.revision_number === proposal.revision);
    if (!revision) {
      revision = { id: crypto.randomUUID() };
      await insert('assistant_proposal_revisions', RevisionEntity.toSupabaseShape(RevisionEntity.create({ id: revision.id, operationId: scope.operationId, proposalId: proposal.id, revisionNumber: proposal.revision, destinationFieldNames: Object.keys(proposal.fields) })));
      revision = requireData(await client.from('assistant_proposal_revisions').select('id').eq('operation_id', scope.operationId).eq('proposal_id', proposal.id).eq('revision_number', proposal.revision).single());
    }
    for (const prior of revisions.filter(row => row.revision_number < proposal.revision && !row.superseded_by_id)) {
      requireData(await client.from('assistant_proposal_revisions').update({ superseded_by_id: revision.id, updated_at: new Date().toISOString() }).eq('operation_id', scope.operationId).eq('id', prior.id));
    }
  }
  const host = {
    async authorize(incoming, ref) {
      await auth(incoming);
      if (ref !== undefined && (typeof ref !== 'string' || !UUID.test(ref))) fail('invalid-conversation-ref');
      return true;
    },
    async context(incoming, intent) {
      await auth(incoming);
      if (intent === 'feedback') return { instructions: INSTRUCTIONS.feedback, data: { contractVersion: feedback.CONTRACT_VERSION, editableFields: [...FEEDBACK_EDITABLE] }, readTools: [] };
      if (intent === 'data-entry') {
        const session = current();
        // Derived hints always; the exact open-sheet field set (dynamic fields
        // included) once the browser has that sheet open for the pending proposal.
        const open = openSheet && session?.pending?.destination === openSheet.ui ? globalThis.structuredClone(openSheet) : null;
        return { instructions: FARM_ENTRY_INSTRUCTIONS, data: { entryUis: [...FARM_ENTRY_UIS], chooseEntryQuestion: CHOOSE_ENTRY_QUESTION, targetNames: globalThis.structuredClone(ENTRY_TARGET_NAMES), fieldHints: globalThis.structuredClone(FARM_ENTRY_FIELD_HINTS), openSheet: open }, readTools: [{ ...RESOLVE_ENTRY_TARGET_TOOL }, ...FARM_READ_TOOLS.map(tool => ({ ...tool }))] };
      }
      if (intent === 'data-questions') return { instructions: INSTRUCTIONS['data-questions'], data: {}, readTools: FARM_READ_TOOLS.map(tool => ({ ...tool })) };
      if (intent === 'how-to') return { instructions: INSTRUCTIONS['how-to'], data: {}, readTools: [] };
      return fail('invalid-intent');
    },
    async read(incoming, name, args) {
      await auth(incoming);
      if (name !== RESOLVE_ENTRY_TARGET_TOOL.name) return readPort(incoming, name, args);
      if (current()?.intent !== 'data-entry' || !object(args) || Object.keys(args).some(key => !['ui', ENTRY_TARGET_KEY].includes(key))) fail('read-tool-denied');
      const resolved = await resolveEntryTarget({ ui: args.ui, names: args[ENTRY_TARGET_KEY], rows: operationRows });
      // The model sees the question or a plain summary; IDs stay host-side.
      return resolved.status === 'resolved' ? { status: 'resolved', ui: args.ui, summary: resolved.summary } : resolved;
    },
    async createProposal(incoming, candidate) { await auth(incoming); return normalize(candidate); },
    async validate(incoming, proposal) {
      await auth(incoming);
      const normalized = await normalize(proposal);
      if (normalized.destination !== proposal.destination) fail('proposal-destination-mismatch');
      // A pending entry's resolved IDs must still match the operation's rows.
      if (JSON.stringify(normalized.fields) !== JSON.stringify(proposal.fields)) fail('entry-target-changed');
    },
    // The browser renders session.pending through its existing UI; the server only re-verifies.
    async renderReview(incoming, proposal) { await host.validate(incoming, proposal); await ensureReviewRows(proposal); },
    async recordConfirmation(incoming, proposal, evidence) {
      await auth(incoming);
      if (!object(evidence) || Object.keys(evidence).length !== 1 || !UUID.test(evidence.confirmationId ?? '')) fail('explicit-confirmation-required');
      const proposalRow = requireData(await client.from('assistant_proposals').select('id, conversation_id').eq('operation_id', scope.operationId).eq('id', proposal.id).maybeSingle());
      if (!proposalRow || proposalRow.conversation_id !== holder.ref) fail('review-evidence-not-synced');
      const revision = requireData(await client.from('assistant_proposal_revisions').select('id, superseded_by_id').eq('operation_id', scope.operationId).eq('proposal_id', proposal.id).eq('revision_number', proposal.revision).maybeSingle());
      if (!revision || revision.superseded_by_id) fail('stale-review');
      const confirmation = requireData(await client.from('assistant_review_confirmations').select('id, card_id, revision_id, actor_id').eq('operation_id', scope.operationId).eq('id', evidence.confirmationId).maybeSingle());
      if (!confirmation) fail('review-evidence-not-synced');
      if (confirmation.revision_id !== revision.id || confirmation.actor_id !== scope.actorId) fail('stale-or-foreign-confirmation');
      const card = requireData(await client.from('assistant_review_cards').select('id, revision_id').eq('operation_id', scope.operationId).eq('id', confirmation.card_id).maybeSingle());
      if (!card || card.revision_id !== revision.id) fail('stale-or-foreign-confirmation');
      return confirmation.id;
    },
    async execute(incoming, proposal, receipt, key) {
      await auth(incoming);
      try { return await persistence.execute(incoming, proposal, receipt, key); }
      catch (error) {
        // A durable claim without the browser's local-save receipt is retry-only.
        if (error?.message === 'execution-outcome-unresolved-do-not-reapply') fail(CLIENT_APPLY_PENDING);
        throw error;
      }
    },
    async checkpoint(incoming, snapshot) { await auth(incoming); return persistence.checkpoint(incoming, snapshot); },
    // Transcript, review-card and voice-to-entry-log artifacts are durable in the
    // trusted checkpoint written at the end of every runtime action; typed
    // client-safe rows are written by the browser through validate/store/sync.
    async artifact(incoming, ref) { await auth(incoming); if (ref !== holder.ref) fail('conversation-mismatch'); },
    async event(incoming, event) {
      await auth(incoming);
      log({ type: event?.type, conversationRef: event?.conversationRef, proposalId: event?.proposalId, revision: event?.revision });
    },
    async saveDraft(incoming) { await auth(incoming); return 'draft'; },
    async earlyTesting(incoming) { await auth(incoming); return config.earlyTesting === true; },
    /** Only reads the stored decision; the browser asks and writes the row. */
    async ensureTestingConsent(incoming) {
      await auth(incoming);
      // The tester decides once per operation; every conversation still carries its
      // own row, written by the browser from the stored decision before start.
      const rows = requireData(await client.from('assistant_testing_consents').select('decision, decided_at').eq('operation_id', scope.operationId).eq('actor_id', scope.actorId).eq('conversation_id', holder.ref).order('decided_at', { ascending: false }).limit(1));
      if (!rows?.length) fail('testing-consent-decision-required');
      return rows[0].decision === 'accepted';
    },
    async storeTestingAudio() { fail('testing-audio-uses-signed-upload'); },
    async captureOffline() { fail('offline-notes-are-device-local'); },
    async matchingDoc() { return undefined; },
  };
  return host;
}
