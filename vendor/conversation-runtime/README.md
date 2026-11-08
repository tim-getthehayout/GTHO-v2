# conversation-runtime

Shared text-and-voice conversation runtime for Tim Joseph's software projects.

Intended canonical home: Forgejo `Homelab/conversation-runtime`. This is a
sibling of `Homelab/feedback-module`, not folded into it and not an app. Treat
both modules as third-party-style contracts any app can adopt; each app supplies
a host integration rather than growing shared runtime behavior inside its own
repo.

## Status

The pinned `v0.1.0` contract is implemented on the shared-runtime feature branch
under Tim's approved implementation handoff. This increment is a private
JavaScript ESM library plus automated tests and a JavaScript Supabase Edge
Function composition entry. It is not a deployment, host adoption, new release
tag, or public npm publication. `CONTRACT.md` remains unchanged.

See [CONTRACT.md](CONTRACT.md) for the confirmed contract and
[AGENTS.md](AGENTS.md) for ownership and implementation handoff boundaries.

## Adoption

- Hosts explicitly pin a released runtime git tag and a compatible released
  feedback-module tag; nothing auto-spreads.
- Hosts own identity/scope, domain tools, validators, persistence/sync and
  adoption schemas.
- GTHO is the first adopter after contracts exist and a separately approved
  adoption handoff.
- First backend deployment: Supabase Edge Function. AI-provider architecture
  stays flexible; xAI is the current choice, not a permanent bind.
- Feedback interviewing and the normalized product-item contract remain in
  feedback-module.

Source:
[Sibling conversation runtime](https://cursor.com/canvas/store-05ad9d20-3dcc-471c-95b6-acbcf39cec96/f8c8d192-2053-4955-851b-3548fc08d61f).

Shared roster/change control lives in `Homelab/project-framework` (`TEAM.md` and
`AGENTS.md`), not in a copied framework here.

## Library and tests

Requires Node.js 22+ for development; the dependency-free ESM library also
imports in Deno. No TypeScript, transpiler, npm dependencies, registry
publishing, or provider credentials are required for the offline tests.

```sh
npm test
npm run check
```

The package is named `conversation-runtime`, has `"type": "module"`, and
exports:

| Import                               | Surface                                                                                                               |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `conversation-runtime`               | `ConversationRuntime`, `VoiceTransport`, `XaiProvider`, `createVoiceBroker`, `createBackendHandler`, constants/errors |
| `conversation-runtime/backend`       | authenticated Web Request backend handler                                                                             |
| `conversation-runtime/voice`         | provider-neutral voice lifecycle coordinator                                                                          |
| `conversation-runtime/providers/xai` | current xAI Responses adapter and configurable voice broker                                                           |

For a git-pinned/local module, import `src/index.js` directly. No installation
or publication to a public registry is implied. Runtime metadata uses version
0.1.0; adoption still requires an explicitly released tag, not this unlanded
feature branch.

### Session and review surface

`ConversationRuntime.start({scope, conversationRef, intent, capture}, host)` and
`ConversationRuntime.resume(authenticatedScope, trustedSnapshot, host)` return
an authoritative session. The host supplies all ports documented in
[`src/ports.js`](src/ports.js). Capture includes `capturedAt`, `source`, and
host-defined JSON `context`; the runtime preserves it without defining an
adopter schema. A snapshot is a **trusted-backend persistence envelope**, not
client authorization. The HTTP handler never accepts client snapshots or client
operation identity.

- `append` / `appendVoiceTurn`: stable turn IDs and one ordered transcript;
  conflicting ID reuse fails.
- `converse(turn, provider, {onUsage, maxReadRounds, signal})`: host
  interview/context, authorized read tools, answer or proposal. No model
  execute/confirm/intent-switch capabilities. Host supplies the pinned
  feedback-module interview/fields; this runtime does not duplicate them.
- `propose`, `review`, `correct`, `confirm`, `cancel`: actual normalized
  fields/destination, stable proposal/item references, revision-bound review,
  explicit host-verified human evidence. Every correction returns to review;
  failed rendering/persistence blocks confirmation until rerendered.
- `requestIntent`, `resolveIntent('preserve'|'discard')`, `restoreDraft`:
  switching cannot file an abandoned draft. Preserved drafts require a new
  review revision on restoration. Separate feedback and domain proposals require
  separate confirmations.
- `saveDraft`: host-reported `draft`, `local-save`, `sync-queue`, or
  `acknowledged-delivery`. Editing a saved draft returns to draft; no inferred
  sync/delivery progress.
- `recordInterviewAudio`: host policy and one-time testing-consent hook; retain
  debugging audio only during early testing. After testing it does not call
  audio storage. Existing collected audio is untouched: no expiry or deletion
  rule is set.
- `captureOffline`: local host capture of audio or typed first notes, with
  original capture context. It is neither transcription nor AI nor product
  filing. The host supplies local storage/recording, then loads captured notes
  for online conversation/review. No offline AI/transcription is promised.

The host persists normalized feedback items, transcripts, review cards,
voice-to-entry logs, testing audio references and offline-note references when
applicable. Domain results are not mislabeled as feedback items. Structured logs
retain field/span mappings, revision corrections and accepted item references,
not another transcript or audio copy. Conversation/review/mapping/correction
events are operation scoped. No storage layout is prescribed.

### Execution safety requirements

The model proposes; the host independently validates, authorizes and executes.
`recordConfirmation` must validate human evidence bound to the displayed
proposal, revision and intent. A transcript, model statement, transport
interruption, intent change, or token is never permission to write.

Each runtime serializes its own operations. Backend `withSession` must also
provide an exclusive, durable operation/conversation lock across
requests/processes and load only trusted snapshots. `checkpoint` must durably
store the exact executing revision and confirmation receipt **before** calling
`execute`. Executors must honor the stable idempotency key across
network/process failures. An ambiguous execution stays locked to that revision
until its idempotent retry resolves; it cannot be revised/cancelled into a
second item. This is not a claim that a generic library can guarantee
exactly-once external writes without host support. Artifact persistence must be
idempotent by its conversation/proposal/revision/turn references. Hosts must
recheck authorization at execution.

### Voice transport and current provider

`VoiceTransport({broker, driver, getSession, onTurn, onAudio, onState})`
coordinates connect, streaming, interruption, cancellation, reconnect and text
fallback. It owns no second history. Provider drivers supply stable final-turn
IDs across reconnects; duplicates and stale connection callbacks cannot create
items. Route `onTurn` to `append` for text and `appendVoiceTurn` for spoken
turns (or the authenticated backend equivalent). Connected typed turns are also
sent to the provider through `driver.sendText` with their stable IDs. Without
transport, the host uses the same runtime `converse` / backend `turn` path to
answer a persisted fallback turn; replaying its ID does not duplicate the
transcript. Voice cancellation closes transport; use runtime `cancel` to cancel
the reviewed draft. Neither interruption nor reconnect confirms anything.

`XaiProvider` uses the Responses API with a server-configured model and key,
`store:false`, and only this session's transcript/context. Endpoint is
configurable; no model alias is locked. Invalid provider output cannot become an
action; measured usage is still surfaced for settlement. The provider can be
replaced by any implementation of the `respond` port.

`createVoiceBroker({exchange, validateLifetime})` wraps the backend-only
short-lived authorization exchange. The deployment supplies the current provider
wire binding and explicit lifetime policy; this increment deliberately does not
guess an xAI realtime endpoint, alias or lifetime. No long-lived key is returned
to a device. Tokens remain transport-only, are never checkpointed/artifacted,
and do not authorize host reads/writes. A provider-specific WebSocket/audio
driver is supplied behind the transport boundary, not implemented as an app
adapter here.

### Backend / Supabase composition

[`supabase/functions/conversation-runtime/index.js`](supabase/functions/conversation-runtime/index.js)
imports `createBackendHandler` from **the same** `src/index.js` library.
`createEdgeFunction(ports,
budgets)` returns its Web Request handler;
`serveConversationRuntime(ports, budgets)` registers it with `Deno.serve`.
`supabase/config.toml` selects the `.js` entrypoint and keeps gateway JWT
checking on. Application authentication and operation membership are still
mandatory inside the handler.

The deployer must supply authenticated host/billing/persistence/provider
bindings and explicit `maxReadRounds` / `maxBodyBytes` technical budgets. Direct
execution without those bindings returns 503, deliberately fail-closed. There is
no in-memory production store, hardcoded membership, actual host adapter,
credential, remote project configuration or deployment in this repo. A later
deployment composition calls `serveConversationRuntime` with approved bindings
instead of the unconfigured fallback. Host storage and UI work remain separate
adoption work.

The backend's internal JSON command envelope uses `command`, `conversationRef`,
`requestRef` plus command arguments. Supported commands: `start`, `resume`,
`turn`, `voice-turn`, `propose`, `correct`, `review`, `confirm`, `cancel`,
`intent`, `resolve-intent`, `restore-draft`, `save-draft`,
`voice-authorization`, `voice-usage`, `billing-own`, `billing-control`. This is
runtime transport, not an adopter's domain wire/database schema. Binary
recording/offline storage use host-local ports. Responses are non-cacheable and
omit confirmation receipts. Errors do not echo provider/host bodies.

Server billing hooks inherit feedback-module **v0.1.2**, commit
`f22b58af728594ee5c59edeb362b17467fe6e549`, by reference. `reserve` enforces
rate/cap policy before provider/voice access. Purpose is the session intent,
never a client-supplied billing operation. `finish` gets model/voice session,
input/output tokens, audio minutes, request count and failure status separately
from conversation artifacts. Request count includes accepted backend requests
and provider calls. Already-consumed voice usage settlement remains available at
a cap; hosts verify and deduplicate provider-derived deltas and reconcile
unknown/failed usage server-side. No client-submitted audio/token total is
trusted. Operation-owned routing stops shared-engine billing while retaining
routing identity. `billing-own` is scope-bound; `billing-control` requires an
explicit backend-authenticated central role. Billing retention remains
independent from conversation retention.

## Acceptance coverage

| Contract expectation             | Automated coverage                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Text/voice continuity            | Ordered mixed-modality session, original capture and trusted resume; same provider context                                                    |
| Intent correction without writes | Preserve/discard decision, pending confirmation blocked, restored draft re-review, separate feedback/domain evidence                          |
| Review/correct/cancel            | Actual fields/destination, normalized corrections, stale revision/invalid evidence denied, failed render blocked, cancellation                |
| Duplicate-free reconnect         | Stable replay IDs, stale callback suppression, pending proposal unchanged, explicit execution once; ambiguous failure/resume retry            |
| Operation isolation              | Scope mismatch, revoked access, identical refs in different operations, forged client identity/snapshots, billing visibility                  |
| Both audio modes                 | Keep early-testing audio; stop future retention after transition and when starting post-testing; transcript/card/log remain; no deletion rule |

Additional tests cover offline capture without AI/filing, truthful draft/sync
states, one-time testing popup, provider interchangeability/error redaction,
short-lived token policy and metering/caps/owned subscriptions. All
provider/auth/persistence fixtures are test doubles, not deployed adapters.
