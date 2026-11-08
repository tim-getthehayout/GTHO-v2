# SESSION_BRIEF — OI-0195 voice/AI foundation

**Generated:** 2026-11-08  
**Source:** GTHO Design session  
**Status:** HOST-ADAPTER DESIGN SPECIFIED (product-shape locks from the 2026-11-08 step-through recorded below; original docs rewritten the same day). Follow-on locks landed as Forgejo PR #7, merge `e44d641`, after the rewrite at PR #6, merge `7d536cb`. Voice-to-entry log landed as Forgejo PR #8, merge `0b9f21e`. Offline audio notes landed as Forgejo PR #9, merge `3aada9c`. Tap-to-start listening landed as Forgejo PR #10, merge `16bdafd`. Shared contracts and implementations now exist (Chief of Staff owns the contracts); GTHO host adapter remains unimplemented. Physical host schema and populated-UI farm-tool method are specified. Adapter unimplemented, not handed to Build. Testing-end audio disposal and later-rollout consent are deferred/non-blocking.

## What was decided

Users should enter farm data by voice with an AI helper instead of typing into small phone fields, and they should also be able to ask questions about farm state. Questions are capabilities rather than an exhaustive list of scenarios.

On 2026-11-08 Tim locked this slice:

1. Voice/AI is a shared foundation piece first. Write-entry and ask-and-answer are paths that use that piece and follow after it.
2. Both paths are accessed from one push-to-talk interface, not separate screens or buttons for writing versus asking.
3. Write-entry still has an easy check: the normal entry UI populated for review, which the user can confirm or correct by voice. Voice-first entry does not skip review; stored review cards are evidence only.
4. Ask-and-answer is in scope for the product. It will be designed as a path that uses this foundation, not as a separate voice product.
5. A shared module makes sense: one conversation runtime used by GTHO, not folding the general assistant into `feedback-module`. Spoken feedback should go through that same assistant and the existing feedback interview contract, not a second inbox.
6. The original April 2026 voice/AI docs should be brought up to current AI practice and reviewed against best practices, not assumed correct. Named models such as Haiku should not remain the design.
7. Incomplete, invalid, interrupted, or abandoned voice or text proposals are kept as recoverable exceptions so the user can intercept and complete them later. Successful confirmed writes become ordinary farm records.
8. Those attempts live in a running voice-to-entry log that can be filtered easily to expose unfinished items. Finished items may remain in that log as history; this is not a silent training or audit capture of every conversation.
9. The push-to-talk control is prominent in field mode (mobile) and is also present on desktop as a floating, movable control that starts at the bottom center.
10. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. Do not promise offline AI parsing or answers; existing manual entry remains available. No on-device model is committed for launch. No extra permission prompt is shown for storing offline recordings on the user’s own device: record them as part of using voice while offline, with playback and delete still available before processing. An offline recording counts as processed, and can be deleted, only after the user confirms a write or filing from that note. If the attempt is discarded without filing, the recording stays unless the user deletes it. The one-time testing-audio consent popup is separate and remains.
11. Tap once to start listening. Voice-activity detection should tolerate brief pauses rather than cutting off at the first silence. The spoken stop phrase is “over.” Hold-to-talk is not the launch default and may be a later option.
12. The voice-to-entry log opens as a panel from the push-to-talk control. That control shows a count of unfinished items awaiting review.
13. Besides unfinished versus all, the log can be filtered by today and by write, question, feedback, or a separate how-to filter. Today uses capture time. Both the visible finished attempt history and the structured field-mapping/correction record stay 90 days from when the item is finished. Unfinished items stay until finished or discarded.
14. First-slice write wiring covers Move, Place, feeding, treatment and Calving sheet, not an exhaustive scenario list. The assistant asks follow-up questions and prompts for required information to complete the entry, then populates the matching normal UI for review. Questions are capabilities grounded in authorized current records, not a hardcoded list. First-slice read coverage is reproductive evidence, open-set assessment/counts and paddock grazing history.

GTHO Build summarized an earlier thread and handed it here. Independently verified on Forgejo main at `0bcc3b7` (2026-11-08): there was no open item, no mention in `PROJECT_STATUS.md`, and no matching code in `src/`, `tests/`, or `supabase/`. The April design lived in `V2_INFRASTRUCTURE.md` §8, reviewed 2026-04-12 in `session_briefs/SESSION_BRIEF_2026-04-12_infrastructure-review.md` (Session 6). That April brief stays historical; do not rewrite it as if it were current.

## What the original-docs review changed (2026-11-08)

`V2_INFRASTRUCTURE.md` §8 was rewritten. It is no longer a three-phase Haiku / silent-training / on-device roadmap. Current intended architecture:

- One shared conversation runtime (sibling shared module; locked contract owned by Chief of Staff) plus app-owned GTHO farm tools.
- Realtime speech-to-speech online, not browser speech-to-text followed by a separate chat completion. Current documented xAI path: `wss://api.x.ai/v1/realtime` with custom function tools, authenticated in the browser by a short-lived ephemeral token from a GTHO backend. The long-lived provider key never ships in the PWA. An ephemeral token is not farm-data authorization.
- Pin a versioned model in production. Do not treat a floating alias or a named small model as architecture.
- The model proposes tools. GTHO executors validate arguments, enforce operation membership, and recheck write proposals against current data. Farm-write tools produce proposals, not unrestricted SQL. Read tools must not mutate. Missing records are not a definitive negative.
- Review card before a farm write or a feedback filing. Intent switches must not commit an abandoned proposal.
- Text fallback uses the same intent, review, and confirmation rules.
- Do not promise offline AI parsing or answers. Existing manual entry remains available. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. No on-device model is committed for launch.
- Silent training capture is not a launch phase. Any stored audio or transcript needs consent, retention, deletion, and access rules first.
- Model-reported confidence is not a safety gate.
- `source: 'voice' | 'manual'` is too coarse for mixed voice and text correction. Do not treat it as an existing column.
- A guided-script library is a later candidate, not a prerequisite. Do not hard-code a list of questions; the assistant interprets what was asked and requests clarification when needed.
- A replaceable provider boundary remains useful; the old `InferenceAdapter` stub (`parse` / `refine` / `getConfidence`) is too narrow and is retired.

`V2_SCHEMA_DESIGN.md` Domain 11 future-schema note no longer treats transcripts, training data, guided scripts, and confidence scores as the planned table set. The physical host design now lives in Domain 11 §11.2a–b (design DDL only).

`V2_MIGRATION_PLAN.md` Phase 4 retires “Voice field mode (5 checkpoints)” (those checkpoints were never written). The gate is now: a confirmed voice or text write creates a valid event through the store and sync queue after a review card. Read-only questions and spoken feedback are in product scope but are not that gate by themselves.

Kept from April: review before commit; multi-turn correction of a proposal; writes through the store and sync queue; a replaceable provider boundary.

## Constraint to carry forward

`V2_CALCULATION_SPEC.md` says any future voice-input flow that talks about remaining feed must import `getLiveRemainingForMove` from `src/calcs/feed-state.js` rather than recompute it.

## Host adoption update (2026-11-08)

| Shared module | GTHO release pin | Annotated tag peels to | Package version |
|---|---|---|---|
| `Homelab/feedback-module` | `v0.1.3` | `f70d0d7d83a0b56ffdcd2a28375b6f746863fecb` | `0.1.3` |
| `Homelab/conversation-runtime` | `v0.1.1` | `aea11f3cdb137a83f0aecaf38e2e60c9d1ba809a` | `0.1.1` |

These are the independently verified release targets for GTHO adoption; nothing auto-spreads. Older tags are unchanged and are **not** adoption pins: feedback-module `v0.1.2` → `f22b58af728594ee5c59edeb362b17467fe6e549`, `v0.1.1` → `eb7fc8010bf5173549db14382411c6386a7e09f2`, `v0.1.0` → `16a68aa94626eaa9f7f4b49754a6616cd0555af9`; conversation-runtime `v0.1.0` → `1a1d1e7b29680d724755f82384b475f1e4b6601f`.

Both shared module implementations have released adoption targets. GTHO is first host adopter, not owner; do not implement shared runtime/interview behavior here or change either shared CONTRACT. The GTHO adapter is not implemented and this brief is not a Build handoff. First backend deployment is a Supabase Edge Function importing the runtime library; xAI is the current provider choice, remaining interchangeable.

Existing `submissions` is the Feedback store for new and historical items, never a second inbox. Faithful SQL/JS mapping is in `V2_SCHEMA_DESIGN.md` §11.2a: keep IDs/history; purpose (feedback/support) is not bug/request classification; urgency is not severity; `version` supplies buildStamp, not contractVersion. Preserve original screen labels, note provenance and timestamps rather than reconstructing them. contractVersion identifies the pinned shared interview-contract release actually used to file/adapt, not the GTHO build.

**Historical-state policy (Tim, 2026-11-08).** Add the new fields now with explicit unknowns; ask for missing fields only if someone reopens the item. Old rows retain their IDs and history and are not newly confirmed filings. Historical columns do not supply `contractVersion`, title, shared bug/request type, expected, actual, `reproSteps`, severity, impact, or `reviewConfirmation`. Do not infer classification from purpose/category, invent filing consent, or leave old items permanently in a legacy-only shape. Dedicated nullable columns and explicit submission_field_states/submission_repro_steps specify the physical representation in §11.2a; design sketches only, no migration SQL is applied. `contractVersion` records the pinned shared interview-contract release actually used for filing or adaptation, not an app build or a claim that the original capture used the new contract. Unknown capture and filing times stay unknown.

Capture original input/context before AI; review card before any write or feedback filing. How-to-only Get help stays in this assistant with a matching doc link, no product filing. Add the separate how-to log filter. Today uses capture time; 90 days starts at finished time and applies to BOTH visible attempt history and the structured mapping/correction record. Unfinished items stay until finished or discarded. Discarding an attempt without filing does not authorize deletion of its offline audio; only confirmation followed by an actual durable local write/filing save makes it processed. Confirmation alone is insufficient. No extra device-local offline-recording permission prompt; playback/delete remain. Testing consent remains separate.

Required artifact concepts: normalized items, transcripts, review cards/confirmation evidence, voice-to-entry logs and structured mapping provenance, testing audio, offline notes, and recoverable session drafts/checkpoints as applicable. See the specified physical tables in Domain 11 §11.2a–b. Keep spoken interview audio during early testing with a one-time consent popup, then stop keeping new testing audio. Collected testing-audio disposal is decided at testing end. After testing retain transcript, review card and structured log without audio; finished log and mapping records still expire after 90 days. This host retention lock differs from shared permanent mapping language; no CONTRACT is changed or reconciliation claimed here.

**Final host locks (2026-11-08).** Host-adapter design is specified, not implemented and not handed to Build. Physical table/column designs are in `V2_SCHEMA_DESIGN.md` §11.2a–b; farm-tool method and launch wiring are in `V2_INFRASTRUCTURE.md` §8.3a. Match intent to an existing UI, use its required/optional fields as prompts, clarify missing/uncertain data, populate that UI, and save only through existing entity `validate()` and write paths after confirmation. Corrections update the same fields, create an immutable revision, invalidate prior confirmation and require a new one. Review-card records are evidence, not a separate voice-only form.

The first-slice write attachments are Move (full-event/scoped+remaining/scoped+last, including its feed/post-graze prompts, zero-write conflict preflight and current-window recheck), Place for no-current-placement groups, feeding, treatment and Calving. Remaining-feed figures use `getLiveRemainingForMove`. Required/optional fields, live stillbirth behavior and date-only UI defaults follow the linked field-set table; no invented inventory writes or medicine/dose. New write kinds attach by the same method. Questions remain capabilities, not an utterance catalog, per-question script or exhaustive scenario list: interpret against authorized current data and real UI/entity contracts, clarify when unsure, and do not turn missing evidence into a definitive negative. First reads cover reproductive evidence, the open set/count and paddock last-grazed evidence.

Open is a data definition: active (not culled) female, cow or heifer class, `confirmed_bred === false`; calves are excluded. The same set defines counts and named-animal assessment; males and inactive animals are not open cows. Defining the set was necessary because `confirmed_bred` is NOT NULL DEFAULT false and the default unchecked box alone would include calves. Edit Animal writes it (OI-0099); every path creating a dam’s `animal_calving_records` row must now clear it, including normal Calving, voice through the existing save and calf-to-dam linking. Live Calving and calving-sync do not yet do this. No separate confirmed-open column.

Submissions keep IDs/history, purpose `type`, build `version` and support `priority`; dedicated nullable shared-fact columns, `submission_field_states` and ordered `submission_repro_steps` supply the additive physical extension. New-filing completeness is adapter contract validation; historical new facts remain NULL/unknown and are asked only on reopening. Operation-scoped conversation/turn/proposal/revision/mapping/review/confirmation/checkpoint/attempt/execution/consent/audio/offline-note tables are specified in Domain 11; typed mappings are drafts, not shadow farm tables or a JSONB bag. Execution tracks local save, queued sync, server acknowledgement and feedback handoff separately. CP-55/CP-56 serialization includes the new tables/additive columns like existing submissions, without implying audio-byte backup.

Finished attempts and their mappings/corrections expire 90 days from finished_at; today uses captured_at. Unfinished attempts stay until finished/discarded; discarded attempts stay until user deletion. Cleanup does not cascade into ordinary farm records, retained review evidence/transcripts, testing audio or discarded offline recordings. Offline audio becomes processed/deletable only after confirmation AND a successful durable local write/filing save; confirmation or discard alone does not delete it. Playback/user deletion before processing remain, with no extra device-storage prompt. Testing consent is separate. The host 90-day mapping lock differs from the shared conversation-runtime CONTRACT’s permanent mapping-record language; neither shared CONTRACT changes and reconciliation is not claimed.

Familiarization is runtime grounding in live UI/entity contracts and user corrections during populated-UI review. Early testing audio uses the locked one-time consent popup; no silent training capture, fine-tuning promise or new ML pipeline. How-to-only Get help stays in the same assistant with a matching doc link and no product filing. Audio storage mechanism remains unspecified. Deferred and non-blocking: already-collected testing-audio disposal at testing end, and later-rollout consent.

## Still deferred (non-blocking)

- Disposal of already-collected testing audio at testing end.
- Later-rollout consent, to be decided when there are more users than Tim and a friend.

Physical table topology and SQL types are now specified, not implementation. Audio storage engine/backend/bucket/codec and silence thresholds remain unspecified; no catch-all JSONB or ML training pipeline. Runtime ownership and how-to routing remain locked.

## What to build / change

Nothing in `src/`, `tests/`, or `supabase/` until this foundation is design-locked and handed to GTHO Build. This session’s change is documentation only. The first rewrite landed as Forgejo PR #6 (merge `7d536cbb152a732e012b0a301279eb37f8b32b90`). Recoverable exceptions and push-to-talk placement landed as Forgejo PR #7 (merge `e44d641b3b4e54c8d909005498767b124285a18c`). The voice-to-entry log landed as Forgejo PR #8 (merge `0b9f21e8de55280b63966f3aa6b3d0947fad4213`). Offline audio notes landed as Forgejo PR #9 (merge `3aada9cc77ce5ab94c0202dcd1fc17ea462efac4`). Tap-to-start listening landed as Forgejo PR #10 (merge `16bdafd0c980433c265caaa3c08b06e0cb865365`).

The host physical schema and farm-tool method are specified, schema-first; the first-slice write attachments are launch wiring rather than a catalog of scenarios. New write kinds attach by that same method. This is a docs-only design lock, not a Build handoff; do not start implementation from this brief.

## Out of scope

- Implementing write-entry, ask-and-answer, or spoken feedback
- Inventing the shared conversation contract
- Recreating `CLAUDE.md` or a vendored `project-framework/` copy
- Retrying the blocked GitHub publish
