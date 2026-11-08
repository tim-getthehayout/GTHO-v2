# SESSION_BRIEF — OI-0195 voice/AI foundation

**Generated:** 2026-11-08  
**Source:** GTHO Design session  
**Status:** Design in progress (slice and shared-module choice locked 2026-11-08; original docs rewritten the same day). Foundation is not fully specified. Shared conversation contract is still unwritten (Chief of Staff). Not ready for GTHO Build.

## What was decided

Users should enter farm data by voice with an AI helper instead of typing into small phone fields, and they should also be able to ask questions about farm state. Examples Tim gave: "Is cow X open?", "How many open cows do I have?", "When was paddock X last grazed?"

On 2026-11-08 Tim locked this slice:

1. Voice/AI is a shared foundation piece first. Write-entry and ask-and-answer are paths that use that piece and follow after it.
2. Both paths are accessed from one push-to-talk interface, not separate screens or buttons for writing versus asking.
3. Write-entry still has an easy check: a review card the user can accept, or correct by voice. That is the meaning of "skip the UI" — voice-first entry plus a card, not no review at all.
4. Ask-and-answer is in scope for the product. It will be designed as a path that uses this foundation, not as a separate voice product.
5. A shared module makes sense: one conversation runtime used by GTHO, not folding the general assistant into `feedback-module`. Spoken feedback should go through that same assistant and the existing feedback interview contract, not a second inbox.
6. The original April 2026 voice/AI docs should be brought up to current AI practice and reviewed against best practices, not assumed correct. Named models such as Haiku should not remain the design.

GTHO Build summarized an earlier thread and handed it here. Independently verified on Forgejo main at `0bcc3b7` (2026-11-08): there was no open item, no mention in `PROJECT_STATUS.md`, and no matching code in `src/`, `tests/`, or `supabase/`. The April design lived in `V2_INFRASTRUCTURE.md` §8, reviewed 2026-04-12 in `session_briefs/SESSION_BRIEF_2026-04-12_infrastructure-review.md` (Session 6). That April brief stays historical; do not rewrite it as if it were current.

## What the original-docs review changed (2026-11-08)

`V2_INFRASTRUCTURE.md` §8 was rewritten. It is no longer a three-phase Haiku / silent-training / on-device roadmap. Current intended architecture:

- One shared conversation runtime (sibling shared module; contract owned by Chief of Staff and still unwritten) plus app-owned GTHO farm tools.
- Realtime speech-to-speech online, not browser speech-to-text followed by a separate chat completion. Current documented xAI path: `wss://api.x.ai/v1/realtime` with custom function tools, authenticated in the browser by a short-lived ephemeral token from a GTHO backend. The long-lived provider key never ships in the PWA. An ephemeral token is not farm-data authorization.
- Pin a versioned model in production. Do not treat a floating alias or a named small model as architecture.
- The model proposes tools. GTHO executors validate arguments, enforce operation membership, and recheck write proposals against current data. Farm-write tools produce proposals, not unrestricted SQL. Read tools must not mutate. Missing records are not a definitive negative.
- Review card before a farm write or a feedback filing. Intent switches must not commit an abandoned proposal.
- Text fallback uses the same intent, review, and confirmation rules.
- Do not promise offline AI parsing or answers. Existing manual entry remains available. Offline audio-note recording versus a typed first note is still open. No on-device model is committed.
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
- Whether the first release records an offline audio note
- Where the single push-to-talk control lives
- Hold-to-talk versus server voice-activity detection after the button is pressed
- Which write types and which questions ship first
- Schema tables or columns for this capability

## What to build / change

Nothing in `src/`, `tests/`, or `supabase/` until this foundation is design-locked and handed to GTHO Build. This session’s change is documentation only: file OI-0195, rewrite `V2_INFRASTRUCTURE.md` §8 and the matching schema and migration notes, and update this brief and `PROJECT_STATUS.md`.

Follow-on farm-tool contracts (write-entry flows and ask-and-answer bindings, including remaining feed) remain GTHO Design work after the shared contract exists. Do not start implementation from this brief.

## Out of scope

- Implementing write-entry, ask-and-answer, or spoken feedback
- Inventing the shared conversation contract
- Recreating `CLAUDE.md` or a vendored `project-framework/` copy
- Retrying the blocked GitHub publish
