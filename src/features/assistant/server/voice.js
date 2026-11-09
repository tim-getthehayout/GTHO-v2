/* global AbortSignal */
/** Realtime voice authorization: server-side xAI client_secrets exchange and the
 * worst-case (10-minute session cap) settlement recorded at token issue. */
import { createVoiceBroker, RuntimeError } from '../shared.js';
import { BIND_SESSION_IN_CLIENT_SECRET, CLIENT_SECRET_TTL_SECONDS, MAX_CLIENT_SECRET_LIFETIME_MS, PROVIDER_TIMEOUT_MS, VOICE_REASONING, VOICE_SESSION_CAP_SECONDS, XAI_BASE_URL } from './config.js';

export const WORST_CASE_SETTLEMENT = 'session-cap-worst-case';
const requireData = ({ data, error }) => { if (error) throw new Error('assistant-persistence-failed'); return data; };

export function createVoiceAuthorization({ config, client, fetch = globalThis.fetch, meter = { providerInvoked: false }, now = () => Date.now(), randomUUID = () => crypto.randomUUID(), bindSession = BIND_SESSION_IN_CLIENT_SECRET }) {
  const broker = createVoiceBroker({
    async exchange() {
      const body = { expires_after: { seconds: CLIENT_SECRET_TTL_SECONDS } };
      // Unverified variant, default off: bind model/reasoning in the secret itself.
      if (bindSession) body.session = { model: config.voiceModel, reasoning: { effort: VOICE_REASONING } };
      // From dispatch on, a failure is unknown provider usage, never measured zero.
      meter.providerInvoked = true;
      const response = await fetch(`${XAI_BASE_URL}/realtime/client_secrets`, {
        method: 'POST', signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${config.xaiApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      // Never echo provider bodies; they may contain credentials.
      if (!response.ok) throw new RuntimeError('voice-token-exchange-failed');
      const minted = await response.json();
      if (typeof minted?.value !== 'string' || !Number.isFinite(minted?.expires_at)) throw new RuntimeError('invalid-voice-authorization');
      return { provider: 'xai', token: minted.value, expiresAt: minted.expires_at * 1000 };
    },
    validateLifetime: expiresAt => expiresAt - now() <= MAX_CLIENT_SECRET_LIFETIME_MS,
  });
  return async (scope, conversationRef, routing) => {
    if (routing !== 'shared') throw new RuntimeError('shared-routing-only');
    const auth = await broker({ scope, conversationRef, routing });
    // The server token record is the provider session ref; client totals are never accepted.
    const tokenRecord = randomUUID();
    const rows = requireData(await client.rpc('assistant_billing_reserve', { p_operation: scope.operationId, p_purpose: 'voice-session', p_request: `voice-session:${tokenRecord}`, p_kind: 'settlement' }));
    if (!rows?.[0]?.lease) throw new Error('invalid-billing-reservation');
    const settled = requireData(await client.rpc('assistant_billing_settle', {
      p_operation: scope.operationId, p_lease: rows[0].lease, p_provider: tokenRecord, p_settlement: WORST_CASE_SETTLEMENT,
      p_model: config.voiceModel, p_input: 0, p_output: 0, p_audio: VOICE_SESSION_CAP_SECONDS / 60, p_requests: 0,
    }));
    if (settled !== true) throw new Error('voice-settlement-not-recorded');
    return auth;
  };
}

/** Worst case is already settled at issue; xAI usage reconciliation is deferred.
 * The composition answers client voice-usage reports before this port with a
 * stable, idempotent refusal (VOICE_USAGE_REFUSAL), with no reservation and no
 * log; this port only guards any other path into the runtime handler. */
export const VOICE_USAGE_REFUSAL = Object.freeze({ voiceUsage: Object.freeze({ accepted: false, reason: 'settled-at-token-issue' }) });
export async function voiceUsageDeferred() { throw new RuntimeError('voice-usage-settled-at-token-issue'); }
