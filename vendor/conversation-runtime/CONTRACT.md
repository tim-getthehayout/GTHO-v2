# Shared conversation runtime contract

Tim confirmed the living Page as a whole and landing this contract on November 8, 2026, Eastern Time (EST).

- Contract owner: Chief of Staff, until a dedicated Design bot is needed.
- Intended canonical home: `Homelab/conversation-runtime`.
- Initial intended release: `v0.1.0`, docs only; no existing commit or tag is asserted by this staging copy.
- Source Page: https://cursor.com/canvas/store-05ad9d20-3dcc-471c-95b6-acbcf39cec96/f8c8d192-2053-4955-851b-3548fc08d61f

The Page's earlier review-draft authorization warning precedes Tim's confirmation. This document records that later confirmation; it authorizes no implementation, host migration, GTHO adoption code, deployment or real data action. Its session/review mechanics are accepted contract behavior, not unreviewed proposals. Recommendations and deliberate deferrals below retain their labels.

## Purpose and reusable boundary

One shared assistant conversation supports typed and spoken data entry, data questions, feedback interviews and how-to help. Shared voice/AI comes first; app-specific paths use it later. Feedback is an intent in the same assistant, not a voice-only system or a separate feedback-module button. Use one push-to-talk entry; hold-to-talk versus voice-activity detection is not specified here.

The runtime is a sibling shared module, not folded into feedback-module and not designed inside an adopter repo. Treat runtime and feedback-module as third-party-style contracts any app can adopt; each app is a host integration. Hosts explicitly pin released git tags. Updates never auto-spread.

## Session and intent contract

A session holds authorized operation scope, conversation reference, current intent, transcript, original capture context and any pending proposal/review revision. Text and voice feed the same conversation, not parallel histories.

| Intent | Behavior | Result |
| --- | --- | --- |
| Feedback | Run the pinned feedback-module interview from the first spoken or typed note, with live clarifying questions. | Reviewed, confirmed product item through the host adapter. |
| Data entry | Use host domain tools to form and refine a proposed change. | Host-validated write only after review and confirmation. |
| Data questions | Use authorized host read tools and existing domain calculations. | Read-only answer; never mutate while answering. |
| How-to help | Answer in the same assistant; offer a matching Get help doc link when one exists. | Answer only, not a filed product item. |

1. Lifecycle: start/resume → converse/clarify → propose when a write is needed → review/correct → explicitly confirm or cancel → host execution/result. Read-only questions and how-to answers skip the write path.
2. Support explicit intent correction within the conversation. Switching intent cannot commit a pending proposal or file an abandoned report. Ask whether to preserve or discard the prior draft, rather than treating the switch as consent.
3. Keep text fallback and manual correction. Voice interruption or reconnect cannot reset the interview into a duplicate item or authorize an action.
4. Expose host draft-save/resume hooks with original capture context. Draft, local save, sync queue and acknowledged delivery are distinct states; do not claim a later state before the host reports it.
5. Support offline audio-note recording using offline GTHO entry recording's capture-now, review-when-online logic. Typed first-note capture remains available. Recording is not filing or permission to execute a write. Do not promise offline transcription or offline AI.

## Review and tool boundary

The model proposes; runtime coordinates review; host validates, authorizes, executes and reports the result. A transcript, intent switch or model claim of confirmation is not permission to write.

- Host hooks supply authorized context/read tools, create and validate write proposals, render/update review cards, record explicit confirmation, execute the reviewed revision, and report persistence/delivery state.
- Show actual proposed fields and destination; allow voice/text correction and cancellation. A substantive revision returns to review. Confirmation refers to the revision the host will execute.
- Feedback review uses the pinned feedback-module item fields. Domain-write review uses host-defined entities, operation, dates, units and changes; runtime invents no farm rules.
- Feedback filing and domain writes are separate. Confirming one does not authorize the other. A how-to exchange becomes feedback only when an actual bug/request emerges and the user reviews and confirms that item.
- Use stable proposal/item references for retry and independent argument validation. Do not expose unrestricted database or SQL tools to the model. Cancellation, interruption and reconnect cannot bypass review.

## Transport, deployment and inherited backend baseline

First backend deployment is a **Supabase Edge Function**. The AI-provider architecture remains vendor-flexible; **xAI is the current choice**, not a permanent bind. Keep provider-specific wire details behind the runtime boundary.

Runtime brokers short-lived voice authorization through the backend and manages connection, streaming, interruption, cancellation, reconnect and text fallback. Short-lived transport credentials do not grant host-data permissions; hosts still enforce operation membership and tool authorization. Long-lived API keys stay off the device.

Incorporate the already landed backend/billing baseline by reference, without reopening it: `Homelab/feedback-module` **v0.1.2**, PR #3 at **f22b58af728594ee5c59edeb362b17467fe6e549**, `CONTRACT.md` backend/billing rules. Reference location: https://git.sarnford.com/Homelab/feedback-module

That baseline remains authoritative for universal hosted API first with later operation-owned subscriptions; authenticated operation identity; day-one server-side per-operation metering (model/voice session, input/output tokens, audio minutes, request count); rate limits or monthly caps; purpose tags; own-operation self-serve billing and central air-traffic-control visibility without cross-operation usage visibility; operation-isolated conversation content; separate billing logs with independent retention; and stopping shared-engine billing while preserving routing identity when an operation uses its own subscription. Client-supplied operation ID alone is not authorization. Conversation artifacts and adapters must not leak another operation's conversation.

Transport, short-lived authorization and runtime tool contracts belong here, not in the feedback item contract.

## Responsibility split

| Layer | Owns |
| --- | --- |
| Runtime | Shared text/voice sessions and transport; intent switching; draft/review hooks; short-lived authorization integration; operation-scoped transcripts and provenance events; capture/resume support. |
| feedback-module | Pinned live interview rules, normalized product-item contract, feedback-specific review and routing expectations; no generic assistant transport or farm semantics. |
| Host app/backend | Authenticated identity/scope, context, domain tools/validators, authorized executors, persistence/sync, review rendering/confirmation evidence, truthful save/delivery results, artifact retention, offline capture and testing consent popup. |
| GTHO Design / adopter | Existing Feedback-store adapter and migration; exact host schemas and historical-field mapping during adoption; artifact storage/resumption; app UX and domain definitions. |
| Chief of Staff | Maintain the reusable shared contract outside app repos until a dedicated Design bot is needed. |

Required artifact types are **normalized items, transcripts, review cards, voice-to-entry logs, testing audio, and offline notes**. These types are locked subject to purpose and testing-phase rules, not a requirement to attach every artifact to every conversation. Runtime supplies conversation, review-revision, field-mapping and correction events; hosts persist relevant artifacts. This contract does not prescribe a database layout or exact wire schema.

## Retention, provenance and consent

| Artifact | Early testing | After early testing |
| --- | --- | --- |
| Interview audio | Keep testing audio to debug issues. | Stop ongoing interview-audio retention; decide again at testing end what to do with already collected audio. No deletion rule now. |
| Offline audio note | Capture offline for review online, like offline GTHO entries. | Capture/review remains supported; this is not a new long-term interview-audio-retention rule. |
| Transcript | Retain the conversation transcript. | Retain. |
| Review card | Retain the user-reviewed structured result. | Retain. |
| Structured voice-to-entry log | Retain mappings to filed fields and review-card changes. | Retain without audio; not another copy of the transcript. |
| Consent popup | Integrate a one-time popup giving consent during testing. | Keep the current hook; defer later-rollout details until more users than early testing. |
| Billing logs | Separate from conversation artifacts. | Remain separate; different retention allowed under the referenced baseline. |

The transcript records what was said in order. The review card records the accepted structured item. The structured log records how spoken input mapped to filed fields and what the user changed on the review card. GTHO keeps that log after testing, without audio.

Host duty: implement both interview-audio modes, offline recording for online review, one-time testing popup, and transcript/card/log persistence. Runtime duty: supply these artifacts and mapping/correction hooks without requiring retained interview audio after testing. Testing audio is for debugging, not approval for training capture or continuous listening.

Current testing is just Tim and a friend; Tim sees no immediate consent issue. The testing popup is a forward-looking rollout hook, not an immediate legal blocker asserted by this contract. Do not invent a testing-audio duration or deletion rule. Exact GTHO storage schemas remain adoption design work.

## GTHO host integration

- New normalized product items go in the **existing Feedback store**. Migrate old submissions to the released shared feedback-module contract shape: no second store or permanently unmigrated legacy shape.
- Preserve original IDs, source purpose, notes, threads, status, resolution history and links. Do not fabricate unknown historical values to satisfy normalization.
- Exact GTHO host schemas and historical-field mapping are assigned to **GTHO Design during adoption**, not shared-module product choices awaiting another walkthrough. Keep the module reusable.
- How-to-only exchanges stay in the shared assistant and are not filed. This does not authorize deleting historical support records or coercing them into bug/request values.
- Cover all six required artifact types; coordinate adapters, validation, serializers, sync and backup/restore before implementing the host integration.
- Host enforces retention and popup policy; runtime supplies capture/resume and provenance hooks. Keep the structured log after testing without retained interview audio.
- GTHO is first adopter after contracts exist and a separate approved adoption handoff. Pin released runtime and feedback-module tags; nothing auto-spreads.

## Decision register

### Locked / confirmed contract

- Chief of Staff ownership until a dedicated Design bot is needed; sibling runtime separate from feedback-module and apps.
- Third-party-style contracts any app can adopt; explicit released-tag host adoption.
- Shared text/voice session, four intents, one push-to-talk entry, offline capture for online review, session/review/tool mechanics above.
- Same-assistant how-to answers with matching Get help links and no product filing.
- Review/correction/confirmation before writes; separate feedback/domain consent; stable retries and host authorization/validation.
- Supabase Edge Function first backend deployment; AI-provider flexibility; xAI current choice; inherited v0.1.2 backend/billing baseline by reference.
- Required artifact types: normalized items, transcripts, review cards, voice-to-entry logs, testing audio, offline notes.
- Testing audio for debugging, then stop ongoing audio retention while retaining transcript/card/log; permanent structured voice-to-entry log without audio.
- Offline audio-note recording, no promise of offline transcription/AI; one-time testing consent popup.
- Existing GTHO Feedback store and historical migration; GTHO Design owns exact schemas/mapping during adoption.

### Recommended

- Waveform control for the shared assistant; microphone icon reserved for field dictation.
- xAI realtime voice with backend-issued ephemeral client tokens as the online transport implementation; provider-specific wire details remain replaceable. Endpoints, model aliases and token lifetimes are not specified or revalidated here.
- Detailed provenance event representation: transcript-span references, affected field, proposed value/change, review revision and accepted result. Exact host schema is not fixed by this recommendation.

### Deferred / deliberately timed

- When early testing ends, decide again what to do with collected testing audio. Set no deletion rule now.
- Later-rollout consent details wait until there are more users than early testing; keep the one-time testing popup as the current hook.

### Assigned / separate

- Exact GTHO host schemas and historical-field mapping: GTHO Design during adoption.
- Staging versus live-data preview: separately undecided and outside this contract.

## Acceptance and scope boundary

Acceptance should demonstrate text/voice continuity; intent correction without accidental writes; review/correct/cancel before execution; duplicate-free reconnect; operation isolation; and both interview-audio modes. These are contract acceptance expectations, not permission to start a build.

No implementation, host adoption code, repo creation, git operation, deployment, autonomous write, training capture or real feedback filing is authorized by preparing these documents. Dedicated implementation ownership and TEAM.md change control are described in [AGENTS.md](AGENTS.md). This land does not change feedback-module or reopen its released contract.
