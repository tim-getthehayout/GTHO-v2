/**
 * These are backend/host PORTS, not concrete adapters or host wire/database schemas.
 * All arguments are snapshots; return JSON-compatible values except raw capture bytes.
 * Throw to deny or fail. Never trust model/client scope, SQL, confirmation or usage.
 *
 * HostPorts:
 * authorize(scope, conversationRef, action) -> void: verify membership on EVERY action.
 * context(scope, intent) -> { instructions, data, readTools:[{name,description}] }:
 *   supply pinned feedback-module v0.1.2 interview/fields for feedback; host domain rules otherwise.
 * read(scope, toolName, args) -> JSON: allowlisted, independently validated read tools only.
 * createProposal(scope, proposal) -> proposal: host-normalized actual fields/destination;
 *   preserve runtime id/itemRef/revision/intent. Runtime never copies farm/feedback schemas.
 * validate(scope, proposal) -> void: independent argument and authorization validation.
 * renderReview(scope, proposal) -> void: display actual fields AND destination/revision.
 * recordConfirmation(scope, proposal, evidence) -> nonempty receipt string:
 *   validate explicit human evidence from trusted UI/voice review, bound to exact revision/intent.
 * execute(scope, proposal, receipt, idempotencyKey) -> { state, result }:
 *   independently authorize/validate; persist idempotency across retries/process failures.
 *   Receipt for feedback NEVER authorizes a domain write (or vice versa).
 * checkpoint(scope, session) -> void: durable checkpoint; especially before execute.
 * artifact(scope, conversationRef, artifact) -> void: operation-isolated, idempotent persistence.
 * event(scope, event) -> void: operation-isolated provenance; no transport tokens.
 * saveDraft(scope, session) -> state: original capture context included; report truthfully.
 * earlyTesting(scope) -> boolean: current host policy, not a cached session preference.
 * ensureTestingConsent(scope) -> boolean: atomically check stored one-time consent;
 *   render popup if needed and persist decision. Called before testing-audio capture.
 * storeTestingAudio(scope, conversationRef, bytes) -> audioRef: debugging only, not training.
 * captureOffline(scope, capture, {text}|{audio:Uint8Array}) -> noteRef:
 *   host-local capture, no AI/transcription/filing promise; review when back online.
 * matchingDoc(scope, question) -> {title,url}|undefined: authorized matching Get help link.
 *
 * Save states: draft | local-save | sync-queue | acknowledged-delivery. No inferred progress.
 * Required artifact variants: transcript, review-card, normalized-item, voice-to-entry-log,
 * testing-audio, offline-note. Each includes only purpose-relevant data.
 * Voice logs contain mappings/corrections/revisions/result references, NOT transcript/audio copies.
 * Testing end changes future captures only; NO deletion rule for previously collected audio.
 *
 * BillingPorts (separate retention/store from conversation artifacts):
 * reserve(scope, purpose, requestRef, {kind:'request'|'settlement'}) -> {lease,routing:'shared'|'operation-owned'}:
 *   atomically enforce server rate limits/monthly caps BEFORE provider/voice work.
 *   Settlement of ALREADY-consumed verified voice usage must remain available at a cap;
 *   it grants no provider access. Deduplicate settlement deltas by server/provider session refs.
 * finish(scope, lease, usage, billShared, failed) -> void:
 *   usage={model,voiceSession?,inputTokens,outputTokens,audioMinutes,requestCount}.
 *   billShared=false for operation-owned subscription; preserve routing identity.
 * own(scope) -> JSON: ONLY this authenticated operation's usage.
 * control(scope) -> JSON: central air-traffic-control visibility after backend authorization.
 *   Neither API may return conversation artifacts; no cross-operation self-service visibility.
 *
 * BackendPorts:
 * authenticate(Request) -> {scope:{operationId,actorId},canControlBilling:boolean}:
 *   verify signed identity/membership/session; never use client operation ID as authorization.
 * host: HostPorts, billing: BillingPorts.
 * provider(scope,routing) -> Provider: choose by authenticated routing, NOT client key/model.
 * withSession(scope,ref,async existing => result): exclusive durable operation+conversation lock,
 *   including start. Load trusted snapshots only; persist checkpoints even on errors.
 * voiceAuthorization(scope,ref,routing) -> {provider,token,expiresAt (epoch milliseconds)}:
 *   exchange on backend, enforce short lifetime; no long-lived keys/device host permissions.
 * voiceUsage(scope,ref,requestRef) -> Usage:
 *   independently verified, idempotent DELTA provider/transport counters tied to the authenticated
 *   operation/session and original reservation, never client-submitted billable totals.
 *   Reconcile failed/unknown provider usage server-side; do not infer zero usage from failure.
 *
 * Provider:
 * name: string; respond({session,context,reads}, AbortSignal?) -> {reply,usage}.
 * Reply: {type:'answer',text} | {type:'proposal',destination,fields,mappings} |
 *        {type:'read',tool,args}. No execute/confirm/intent-switch model capabilities.
 * Broker voice transport/credential wire details stay behind the provider/driver boundary.
 */
export const backendBaseline = Object.freeze({
  repository: "Homelab/feedback-module",
  tag: "v0.1.2",
  commit: "f22b58af728594ee5c59edeb362b17467fe6e549",
});
