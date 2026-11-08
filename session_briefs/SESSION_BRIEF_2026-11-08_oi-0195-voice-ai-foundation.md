# SESSION_BRIEF — OI-0195 voice/AI foundation

**Generated:** 2026-11-08  
**Source:** GTHO Design session  
**Status:** Design in progress (slice, shared-module, recoverable-exceptions, push-to-talk placement, voice-to-entry log, and offline audio notes locked 2026-11-08; original docs rewritten the same day). Follow-on locks landed as Forgejo PR #7, merge `e44d641`, after the rewrite at PR #6, merge `7d536cb`. Voice-to-entry log landed as Forgejo PR #8, merge `0b9f21e`. Foundation is not fully specified. Shared conversation contract is still unwritten (Chief of Staff). Not ready for GTHO Build.

## What was decided

Users should enter farm data by voice with an AI helper instead of typing into small phone fields, and they should also be able to ask questions about farm state. Examples Tim gave: "Is cow X open?", "How many open cows do I have?", "When was paddock X last grazed?"

On 2026-11-08 Tim locked this slice:

1. Voice/AI is a shared foundation piece first. Write-entry and ask-and-answer are paths that use that piece and follow after it.
2. Both paths are accessed from one push-to-talk interface, not separate screens or buttons for writing versus asking.
3. Write-entry still has an easy check: a review card the user can accept, or correct by voice. That is the meaning of "skip the UI" — voice-first entry plus a card, not no review at all.
4. Ask-and-answer is in scope for the product. It will be designed as a path that uses this foundation, not as a separate voice product.
5. A shared module makes sense: one conversation runtime used by GTHO, not folding the general assistant into `feedback-module`. Spoken feedback should go through that same assistant and the existing feedback interview contract, not a second inbox.
6. The original April 2026 voice/AI docs should be brought up to current AI practice and reviewed against best practices, not assumed correct. Named models such as Haiku should not remain the design.
7. Incomplete, invalid, interrupted, or abandoned voice or text proposals are kept as recoverable exceptions so the user can intercept and complete them later. Successful confirmed writes become ordinary farm records.
8. Those attempts live in a running voice-to-entry log that can be filtered easily to expose unfinished items. Finished items may remain in that log as history; this is not a silent training or audit capture of every conversation.
9. The push-to-talk control is prominent in field mode (mobile) and is also present on desktop as a floating, movable control.
10. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. Do not promise offline AI parsing or answers; existing manual entry remains available. No on-device model is committed for launch.

GTHO Build summarized an earlier thread and handed it here. Independently verified on Forgejo main at `0bcc3b7` (2026-11-08): there was no open item, no mention in `PROJECT_STATUS.md`, and no matching code in `src/`, `tests/`, or `supabase/`. The April design lived in `V2_INFRASTRUCTURE.md` §8, reviewed 2026-04-12 in `session_briefs/SESSION_BRIEF_2026-04-12_infrastructure-review.md` (Session 6). That April brief stays historical; do not rewrite it as if it were current.

## What the original-docs review changed (2026-11-08)

`V2_INFRASTRUCTURE.md` §8 was rewritten. It is no longer a three-phase Haiku / silent-training / on-device roadmap. Current intended architecture:

- One shared conversation runtime (sibling shared module; contract owned by Chief of Staff and still unwritten) plus app-owned GTHO farm tools.
- Realtime speech-to-speech online, not browser speech-to-text followed by a separate chat completion. Current documented xAI path: `wss://api.x.ai/v1/realtime` with custom function tools, authenticated in the browser by a short-lived ephemeral token from a GTHO backend. The long-lived provider key never ships in the PWA. An ephemeral token is not farm-data authorization.
- Pin a versioned model in production. Do not treat a floating alias or a named small model as architecture.
- The model proposes tools. GTHO executors validate arguments, enforce operation membership, and recheck write proposals against current data. Farm-write tools produce proposals, not unrestricted SQL. Read tools must not mutate. Missing records are not a definitive negative.
- Review card before a farm write or a feedback filing. Intent switches must not commit an abandoned proposal.
- Text fallback uses the same intent, review, and confirmation rules.
- Do not promise offline AI parsing or answers. Existing manual entry remains available. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. No on-device model is committed for launch.
- Silent training capture is not a launch phase. Any stored audio or transcript needs consent, retention, deletion, and access rules first.
- Model-reported confidence is not a safety gate.
- `source: 'voice' | 'manual'` is too coarse for mixed voice and text correction. Do not treat it as an existing column.
- A guided-script library is a later candidate, not a prerequisite.
- A replaceable provider boundary remains useful; the old `InferenceAdapter` stub (`parse` / `refine` / `getConfidence`) is too narrow and is retired.

`V2_SCHEMA_DESIGN.md` Domain 11 future-schema note no longer treats transcripts, training data, guided scripts, and confidence scores as the planned table set. Tables remain undesigned.

`V2_MIGRATION_PLAN.md` Phase 4 retires “Voice field mode (5 checkpoints)” (those checkpoints were never written). The gate is now: a confirmed voice or text write creates a valid event through the store and sync queue after a review card. Read-only questions and spoken feedback are in product scope but are not that gate by themselves.

Kept from April: review before commit; multi-turn correction of a proposal; writes through the store and sync queue; a replaceable provider boundary.

## Constraint to carry forward

`V2_CALCULATION_SPEC.md` says any future voice-input flow that talks about remaining feed must import `getLiveRemainingForMove` from `src/calcs/feed-state.js` rather than recompute it.

## What this item is not yet specifying

Do not invent:

- The shared conversation contract (Chief of Staff)
- Who maintains the sibling runtime (assign before build)
- How existing Get help / support submissions map to a shared bug-or-request interview
- Supported storage, consent, playback/delete, and retention for offline audio notes
- Where the voice-to-entry log lives in the app chrome, which columns and filters besides unfinished ship first, how long items persist, and the schema for the log
- Hold-to-talk versus server voice-activity detection after the button is pressed
- The exact default dock position or screen edge for the desktop floating control
- Which write types and which questions ship first
- Schema tables or columns for this capability

## What to build / change

Nothing in `src/`, `tests/`, or `supabase/` until this foundation is design-locked and handed to GTHO Build. This session’s change is documentation only: file OI-0195, rewrite `V2_INFRASTRUCTURE.md` §8 and the matching schema and migration notes, record recoverable exceptions, push-to-talk placement, the voice-to-entry log, and offline audio notes, and update this brief and `PROJECT_STATUS.md`. The first rewrite landed as Forgejo PR #6 (merge `7d536cbb152a732e012b0a301279eb37f8b32b90`). Recoverable exceptions and push-to-talk placement landed as Forgejo PR #7 (merge `e44d641b3b4e54c8d909005498767b124285a18c`). The voice-to-entry log landed as Forgejo PR #8 (merge `0b9f21e8de55280b63966f3aa6b3d0947fad4213`).

Follow-on farm-tool contracts (write-entry flows and ask-and-answer bindings, including remaining feed) remain GTHO Design work after the shared contract exists. Do not start implementation from this brief.

## Out of scope

- Implementing write-entry, ask-and-answer, or spoken feedback
- Inventing the shared conversation contract
- Recreating `CLAUDE.md` or a vendored `project-framework/` copy
- Retrying the blocked GitHub publish
