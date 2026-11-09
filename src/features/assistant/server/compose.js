/** Production composition of the GTHO assistant functions. Entry points only read
 * env and inject pinned drivers; everything here is testable without Deno. */
import { createBackendHandler } from '../shared.js';
import { createBackendPersistence, createBillingPorts } from '../backend-bindings.js';
import { createSessionDatabase } from '../session-database.js';
import { TECHNICAL_BUDGETS, publicVoiceConfig } from './config.js';
import { withCors, json } from './http.js';
import { createIdentity } from './identity.js';
import { createServerHost, CLIENT_APPLY_PENDING } from './host.js';
import { createServerFarmData } from './farm-data.js';
import { createProviderPort } from './provider.js';
import { createVoiceAuthorization, voiceUsageDeferred } from './voice.js';
import { createApplyHandler } from './apply.js';
import { createTestingAudioHandler } from './testing-audio.js';
import { createTranscribeHandler } from './transcribe.js';
import { RuntimeError } from '../shared.js';

const contentFreeLog = log => entry => { try { log?.(entry); } catch { /* logging never breaks a request */ } };

/** deps: {config, client (service role), fetch, openDatabase(): {connect, close}, log}. */
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
      if (error instanceof RuntimeError) return json({ error: error.code }, 400);
      contentFreeLog(deps.log)({ type: 'assistant-function-error' });
      return json({ error: 'backend-unavailable' }, 503);
    }
  });
}

export function createAssistantFunction(deps) {
  const fetcher = deps.fetch ?? globalThis.fetch;
  return guarded(deps, async (request, identity) => {
    // GET: non-secret realtime settings (model for ?model=, voice, caps). Also the
    // PWA's allowlist probe: 403 here hides the control.
    if (request.method === 'GET') return json({ config: publicVoiceConfig(deps.config) });
    const context = requestContext(deps, identity);
    const session = { ref: null, loaded: null, live: null };
    try {
      const getAll = createServerFarmData({ client: deps.client, operationId: context.scope.operationId });
      const host = createServerHost({ client: deps.client, scope: context.scope, config: deps.config, persistence: context.persistence, getAll, authorize: context.authorize, session, log: contentFreeLog(deps.log) });
      const ports = {
        authenticate: async () => identity.identity,
        withSession: (scope, ref, work) => context.persistence.withSession(scope, ref, existing => { session.ref = ref; session.loaded = existing; session.live = null; return work(existing); }),
        host,
        billing: context.billing,
        provider: createProviderPort({ config: deps.config, fetch: fetcher, signal: request.signal, meter: context.meter, session, timeoutMs: deps.providerTimeoutMs }),
        voiceAuthorization: createVoiceAuthorization({ config: deps.config, client: deps.client, fetch: fetcher }),
        voiceUsage: voiceUsageDeferred,
      };
      return await createBackendHandler(ports, TECHNICAL_BUDGETS)(request);
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
    const billing = createBillingPorts({ client: deps.client, authorize: incoming => identity.authorize(incoming) });
    return createTranscribeHandler({ config: deps.config, billing, fetch: deps.fetch ?? globalThis.fetch })(identity.identity.scope, request);
  });
}
