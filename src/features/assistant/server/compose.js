/** Production composition of the GTHO assistant functions. Entry points only read
 * env and inject pinned drivers; everything here is testable without Deno. */
import { createBackendHandler } from '../shared.js';
import { createBackendPersistence, createBillingPorts } from '../backend-bindings.js';
import { createSessionDatabase } from '../session-database.js';
import { TECHNICAL_BUDGETS, publicVoiceConfig } from './config.js';
import { withCors, json, readJson } from './http.js';
import { createIdentity } from './identity.js';
import { createServerHost, CLIENT_APPLY_PENDING } from './host.js';
import { createServerFarmData } from './farm-data.js';
import { openEntryFields } from '../farm-entry-contract.js';
import { createProviderPort } from './provider.js';
import { createVoiceAuthorization, voiceUsageDeferred, VOICE_USAGE_REFUSAL } from './voice.js';
import { createApplyHandler } from './apply.js';
import { createTestingAudioHandler } from './testing-audio.js';
import { createTranscribeHandler } from './transcribe.js';
import { RuntimeError } from '../shared.js';
import { discardEmptyStartRows } from './discard-empty-start.js';
import { persistTranscriptTurns, recordUnresolvedClarification } from './persist-transcript-turns.js';
import { acceptPendingClarification, restoreTrustedSnapshot } from '../../../entities/assistant-pending-clarification.js';

const contentFreeLog = log => entry => { try { log?.(entry); } catch { /* logging never breaks a request */ } };

/** deps: {config, client (service role), createUserClient(accessToken), fetch, openDatabase(): {connect, close}, log}. */
function requestContext(deps, identity, meter = { providerInvoked: false }) {
  const { client, config, openDatabase } = deps;
  const scope = identity.identity.scope;
  const authorize = incoming => identity.authorize(incoming);
  const database = openDatabase();
  const persistence = createBackendPersistence({
    client, authorize, sessionDatabase: createSessionDatabase({ connect: database.connect }),
    // The browser applies through its existing validate()+write path, then POSTs the receipt.
    applyConfirmedWrite: async () => { throw new RuntimeError(CLIENT_APPLY_PENDING); },
  });
  const billing = createBillingPorts({ client, authorize, authorizeControl: async incoming => config.billingControlUsers.includes(incoming.actorId), isUnmeasured: () => meter.providerInvoked });
  return { scope, authorize, database, persistence, billing, meter };
}

function guarded(deps, run) {
  const identityPort = createIdentity({ client: deps.client, config: deps.config });
  return withCors(deps.config.origins, async request => {
    try {
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method-not-allowed' }, 405);
      const identity = await identityPort.resolve(request);
      if (!identity.identity) return json({ error: identity.error }, identity.status);
      return await run(request, identity);
    } catch (error) {
      if (Number.isInteger(error?.status)) return json({ error: error.code ?? error.message }, error.status);
      if (error instanceof RuntimeError) return json({ error: error.code, ...(error.question ? { question: error.question } : {}) }, 400);
      contentFreeLog(deps.log)({ type: 'assistant-function-error' });
      return json({ error: 'backend-unavailable' }, 503);
    }
  });
}

/** Field names of the normal sheet open in the browser for this conversation
 * (dynamic fields included), sent as body.openSheet. Hints only: every name must
 * be declared by that sheet's definition or the whole value is ignored. */
export function parseOpenSheet(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const fields = openEntryFields(value.ui, value.fields);
  return fields ? { ui: value.ui, fields } : null;
}

/** P7: one decision per tester per operation. The latest stored decision for this
 * authenticated user in this operation; later conversations reuse it (no popup). */
async function storedTestingConsent({ client, config }, scope) {
  if (config.earlyTesting !== true) return null;
  const { data, error } = await client.from('assistant_testing_consents').select('decision, decided_at').eq('operation_id', scope.operationId).eq('actor_id', scope.actorId).order('decided_at', { ascending: false }).limit(1);
  if (error) throw new Error('assistant-persistence-failed');
  return data?.[0] ? { decision: data[0].decision, decidedAt: data[0].decided_at } : null;
}

/** Peeks a clone so the runtime handler still reads (and validates) the body. */
async function peekBody(request) {
  try { return await readJson(request.clone(), TECHNICAL_BUDGETS.maxBodyBytes); }
  catch { return null; }
}

export function createAssistantFunction(deps) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  return guarded(deps, async (request, identity) => {
    // GET: non-secret realtime settings (model for ?model=, voice, caps). Also the
    // PWA's allowlist probe: 403 here hides the control.
    if (request.method === 'GET') return json({ config: publicVoiceConfig(deps.config), testingConsent: await storedTestingConsent(deps, identity.identity.scope) });
    const peeked = await peekBody(request);
    // Client voice-usage reports are refused before any reservation: the worst
    // case was settled once at token issue.
    if (peeked?.command === 'voice-usage') return json(VOICE_USAGE_REFUSAL);
    // Empty mic-failure start: delete checkpoint/lock/attempt (not billing). GTHO-side.
    // Call the RPC on a user-scoped client (caller's JWT) so auth.uid() is set;
    // never use the service-role client for this EXECUTE-authenticated RPC.
    if (peeked?.command === 'discard-empty') {
      const context = requestContext(deps, identity);
      try {
        const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
        if (!token) return json({ error: 'unauthenticated' }, 401);
        if (typeof deps.createUserClient !== 'function') {
          contentFreeLog(deps.log)({ type: 'assistant-function-error', reason: 'user-client-required' });
          return json({ error: 'backend-unavailable' }, 503);
        }
        const userClient = deps.createUserClient(token);
        const result = await discardEmptyStartRows(userClient, {
          operationId: context.scope.operationId,
          conversationRef: peeked.conversationRef,
        });
        return json({ value: result });
      } finally {
        await context.database.close?.();
      }
    }
    const context = requestContext(deps, identity);
    // Host event: a reroute replay of an earlier user turn (ids only, no content).
    if (peeked?.command === 'turn' && typeof peeked.replayOf === 'string' && typeof peeked.turn?.id === 'string') {
      contentFreeLog(deps.log)({ type: 'reroute-replay', conversationRef: peeked.conversationRef, turnId: peeked.turn.id, replayOf: peeked.replayOf });
    }
    const session = { ref: null, loaded: null, live: null, route: null };
    try {
      const getAll = createServerFarmData({ client: deps.client, operationId: context.scope.operationId });
      const host = createServerHost({ client: deps.client, scope: context.scope, config: deps.config, persistence: context.persistence, getAll, authorize: context.authorize, session, log: contentFreeLog(deps.log), openSheet: parseOpenSheet(peeked?.openSheet) });
      const ports = {
        authenticate: async () => identity.identity,
        withSession: (scope, ref, work) => context.persistence.withSession(scope, ref, existing => { const restored = restoreTrustedSnapshot(existing); session.ref = ref; session.loaded = restored; session.live = null; session.pendingClarification = acceptPendingClarification(restored?.pendingClarification) ?? null; return work(restored); }),
        host,
        billing: context.billing,
        provider: createProviderPort({ config: deps.config, fetch: fetcher, signal: request.signal, meter: context.meter, session, timeoutMs: deps.providerTimeoutMs }),
        voiceAuthorization: createVoiceAuthorization({ config: deps.config, client: deps.client, fetch: fetcher, meter: context.meter }),
        voiceUsage: voiceUsageDeferred,
      };
      const response = await createBackendHandler(ports, TECHNICAL_BUDGETS)(request);
      // Vendor backend returns only {error: code}. Reattach the host's plain-words
      // question so the client can speak it instead of UNRESOLVED_TARGET_QUESTION.
      if (!response.ok) {
        if (session.unresolvedQuestion && response.status === 400) {
          const body = await response.json();
          if (body.error === 'entry-target-unresolved') {
            // Existing checkpoint/transcript shape only: persist the user turn
            // (already in the snapshot via vendor finally) and the host question
            // so a failed typed request remains attributable and cannot be
            // discarded as an empty start. Never log private text.
            try {
              const snap = await recordUnresolvedClarification({
                persistence: context.persistence,
                scope: context.scope,
                conversationRef: session.ref,
                question: session.unresolvedQuestion,
                pendingClarification: session.pendingClarification ?? null,
              });
              if (snap?.transcript) {
                await persistTranscriptTurns({ client: deps.client, scope: context.scope, conversationRef: session.ref, turns: snap.transcript });
              }
            } catch { /* response still carries the question; persistence failure is retried on the next turn */ }
            return json({ ...body, question: session.unresolvedQuestion }, 400);
          }
          return json(body, response.status);
        }
        return response;
      }
      // A route-intent suggestion travels back as body.route; the browser then
      // switches through the runtime intent / resolve-intent commands.
      if (!session.route) return response;
      return json({ ...(await response.json()), route: session.route }, response.status);
    } finally { await context.database.close(); }
  });
}

export function createApplyFunction(deps) {
  return guarded(deps, async (request, identity) => {
    if (request.method !== 'POST') return json({ error: 'post-required' }, 405);
    const context = requestContext(deps, identity);
    try { return await createApplyHandler({ client: deps.client, persistence: context.persistence })(context.scope, request); }
    finally { await context.database.close(); }
  });
}

export function createTestingAudioFunction(deps) {
  return guarded(deps, async (request, identity) => {
    if (request.method !== 'POST') return json({ error: 'post-required' }, 405);
    return createTestingAudioHandler({ client: deps.client, config: deps.config })(identity.identity.scope, request);
  });
}

export function createTranscribeFunction(deps) {
  return guarded(deps, async (request, identity) => {
    if (request.method !== 'POST') return json({ error: 'post-required' }, 405);
    const meter = { providerInvoked: false };
    const billing = createBillingPorts({ client: deps.client, authorize: incoming => identity.authorize(incoming), isUnmeasured: () => meter.providerInvoked });
    return createTranscribeHandler({ config: deps.config, billing, meter, fetch: deps.fetch ?? globalThis.fetch, timeoutMs: deps.providerTimeoutMs })(identity.identity.scope, request);
  });
}
