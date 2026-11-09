# SESSION_BRIEF — OI-0195 voice/AI foundation

**Generated:** 2026-11-08  
**Source:** GTHO Design session  
**Status:** IMPLEMENTED ON FORGEJO MAIN, NOT LIVE (2026-11-09). The ready-for-build gate passed after PR #12 (merge `33bebb9`); GTHO Build implemented the host adapter and it merged as Forgejo PR #38, merge `eb04c1973b4621d728f2a9ec760aa70b259f10f8`. Migration 040 is not applied, the assistant is not enabled, and the GitHub publish is held until 040 is live. Gate locks, go-live order and live unknowns are in “Ready-for-build gate locks after PR #12” below; they supersede older text in this brief. Earlier history: rewrite PR #6 (`7d536cb`), exceptions/PTT PR #7 (`e44d641`), voice-to-entry log PR #8 (`0b9f21e`), offline audio notes PR #9 (`3aada9c`), tap-to-start PR #10 (`16bdafd`), step-through PR #11 (`e4d5891`), host schema and farm-tool method PR #12 (`33bebb9`).

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
9. The push-to-talk control is prominent in field mode (mobile) and is also present on desktop as a floating, movable control that starts at the bottom center. It is one global control and the only voice entry for every intent (Design ruling, 2026-11-09).
10. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. Do not promise offline AI parsing or answers; existing manual entry remains available. No on-device model is committed for launch. No extra permission prompt is shown for storing offline recordings on the user’s own device: record them as part of using voice while offline, with playback and delete still available before processing. An offline recording counts as processed, and can be deleted, only after the user confirms a write or filing from that note. If the attempt is discarded without filing, the recording stays unless the user deletes it. The one-time testing-audio consent popup is separate and remains.
11. Tap once to start listening. The turn ends when the user says “over” or taps the control again; brief pauses never end it (bound 2026-11-09 as manual commit, T5, with a `server_vad` fallback behind config). Hold-to-talk is not the launch default and may be a later option.
12. The voice-to-entry log opens as a panel from the push-to-talk control. That control shows a count of unfinished items awaiting review.
13. Besides unfinished versus all, the log can be filtered by today and by write, question, feedback, or a separate how-to filter. Today uses capture time. Both the visible finished attempt history and the structured field-mapping/correction record stay 90 days from when the item is finished. Unfinished items stay until finished or discarded.
14. First-slice write wiring covers Move, Place, feeding, treatment and Calving sheet, not an exhaustive scenario list. The assistant asks follow-up questions and prompts for required information to complete the entry, then populates the matching normal UI for review. Questions are capabilities grounded in authorized current records, not a hardcoded list. First-slice read coverage is reproductive evidence, open-set assessment/counts and paddock grazing history.

GTHO Build summarized an earlier thread and handed it here. Independently verified on Forgejo main at `0bcc3b7` (2026-11-08): there was no open item, no mention in `PROJECT_STATUS.md`, and no matching code in `src/`, `tests/`, or `supabase/`. The April design lived in `V2_INFRASTRUCTURE.md` §8, reviewed 2026-04-12 in `session_briefs/SESSION_BRIEF_2026-04-12_infrastructure-review.md` (Session 6). That April brief stays historical; do not rewrite it as if it were current.

## What the original-docs review changed (2026-11-08)

`V2_INFRASTRUCTURE.md` §8 was rewritten. It is no longer a three-phase Haiku / silent-training / on-device roadmap. Current intended architecture:

- One shared conversation runtime (sibling shared module; locked contract owned by Chief of Staff) plus app-owned GTHO farm tools.
- Realtime voice online for listening and speaking only (P1, 2026-11-09): xAI `wss://api.x.ai/v1/realtime`, authenticated in the browser by a short-lived ephemeral token from a GTHO backend. The server-side conversation runtime decides; realtime function tools are not the brain. The long-lived provider key never ships in the PWA. An ephemeral token is not farm-data authorization.
- Pin a versioned model in production. Do not treat a floating alias or a named small model as architecture. Launch pins (2026-11-09): text `grok-4.20-0309-non-reasoning`, voice `grok-voice-3.0` (P5, P6); any model value containing `latest` is rejected.
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

Both shared module implementations have released adoption targets. GTHO is first host adopter, not owner; do not implement shared runtime/interview behavior here or change either shared CONTRACT. As of 2026-11-08 the GTHO adapter was not implemented; it has since merged as PR #38 (see Status). First backend deployment is a Supabase Edge Function importing the runtime library; xAI is the current provider choice, remaining interchangeable.

Existing `submissions` is the Feedback store for new and historical items, never a second inbox. Faithful SQL/JS mapping is in `V2_SCHEMA_DESIGN.md` §11.2a: keep IDs/history; purpose (feedback/support) is not bug/request classification; urgency is not severity; `version` supplies buildStamp, not contractVersion. Preserve original screen labels, note provenance and timestamps rather than reconstructing them. contractVersion identifies the pinned shared interview-contract release actually used to file/adapt, not the GTHO build.

**Historical-state policy (Tim, 2026-11-08).** Add the new fields now with explicit unknowns; ask for missing fields only if someone reopens the item. Old rows retain their IDs and history and are not newly confirmed filings. Historical columns do not supply `contractVersion`, title, shared bug/request type, expected, actual, `reproSteps`, severity, impact, or `reviewConfirmation`. Do not infer classification from purpose/category, invent filing consent, or leave old items permanently in a legacy-only shape. Dedicated nullable columns and explicit submission_field_states/submission_repro_steps specify the physical representation in §11.2a; design sketches only, no migration SQL is applied. `contractVersion` records the pinned shared interview-contract release actually used for filing or adaptation, not an app build or a claim that the original capture used the new contract. Unknown capture and filing times stay unknown.

Capture original input/context before AI; review card before any write or feedback filing. How-to-only Get help stays in this assistant with a matching doc link, no product filing. Add the separate how-to log filter. Today uses capture time; 90 days starts at finished time and applies to BOTH visible attempt history and the structured mapping/correction record. Unfinished items stay until finished or discarded. Discarding an attempt without filing does not authorize deletion of its offline audio; only confirmation followed by an actual durable local write/filing save makes it processed. Confirmation alone is insufficient. No extra device-local offline-recording permission prompt; playback/delete remain. Testing consent remains separate.

Required artifact concepts: normalized items, transcripts, review cards/confirmation evidence, voice-to-entry logs and structured mapping provenance, testing audio, offline notes, and recoverable session drafts/checkpoints as applicable. See the specified physical tables in Domain 11 §11.2a–b. Keep spoken interview audio during early testing with a one-time consent popup, then stop keeping new testing audio. Collected testing-audio disposal is decided at testing end. After testing retain transcript, review card and structured log without audio; finished log and mapping records still expire after 90 days. This host retention lock differs from shared permanent mapping language; no CONTRACT is changed or reconciliation claimed here.

**Final host locks (2026-11-08).** Host-adapter design was specified on 2026-11-08 (implemented later as PR #38; see Status). Physical table/column designs are in `V2_SCHEMA_DESIGN.md` §11.2a–b; farm-tool method and launch wiring are in `V2_INFRASTRUCTURE.md` §8.3a. Match intent to an existing UI, use its required/optional fields as prompts, clarify missing/uncertain data, populate that UI, and save only through existing entity `validate()` and write paths after confirmation. Corrections update the same fields, create an immutable revision, invalidate prior confirmation and require a new one. Review-card records are evidence, not a separate voice-only form.

The first-slice write attachments are Move (full-event/scoped+remaining/scoped+last, including its feed/post-graze prompts, zero-write conflict preflight and current-window recheck), Place for no-current-placement groups, feeding, treatment and Calving. Remaining-feed figures use `getLiveRemainingForMove`. Required/optional fields, live stillbirth behavior and date-only UI defaults follow the linked field-set table; no invented inventory writes or medicine/dose. New write kinds attach by the same method. Questions remain capabilities, not an utterance catalog, per-question script or exhaustive scenario list: interpret against authorized current data and real UI/entity contracts, clarify when unsure, and do not turn missing evidence into a definitive negative. First reads cover reproductive evidence, the open set/count and paddock last-grazed evidence.

Open is a data definition: active (not culled) female, cow or heifer class, `confirmed_bred === false`; calves are excluded. The same set defines counts and named-animal assessment; males and inactive animals are not open cows. Defining the set was necessary because `confirmed_bred` is NOT NULL DEFAULT false and the default unchecked box alone would include calves. Edit Animal writes it (OI-0099); every path creating a dam’s `animal_calving_records` row must now clear it, including normal Calving, voice through the existing save and calf-to-dam linking. Done: the live Calving save and calving-sync clear it (verified in the PR #38 review). No separate confirmed-open column.

Submissions keep IDs/history, purpose `type`, build `version` and support `priority`; dedicated nullable shared-fact columns, `submission_field_states` and ordered `submission_repro_steps` supply the additive physical extension. New-filing completeness is adapter contract validation; historical new facts remain NULL/unknown and are asked only on reopening. Operation-scoped conversation/turn/proposal/revision/mapping/review/confirmation/checkpoint/attempt/execution/consent/audio/offline-note tables are specified in Domain 11; typed mappings are drafts, not shadow farm tables or a JSONB bag. Execution tracks local save, queued sync, server acknowledgement and feedback handoff separately. CP-55/CP-56 serialization includes the new tables/additive columns like existing submissions, without implying audio-byte backup, except the seven server-authoritative tables and `assistant_restore_fences` (testing-scope backup exception, 2026-11-09).

Finished attempts and their mappings/corrections expire 90 days from finished_at; today uses captured_at. Unfinished attempts stay until finished/discarded; discarded attempts stay until user deletion. Cleanup does not cascade into ordinary farm records, retained review evidence/transcripts, testing audio or discarded offline recordings. Offline audio becomes processed/deletable only after confirmation AND a successful durable local write/filing save; confirmation or discard alone does not delete it. Playback/user deletion before processing remain, with no extra device-storage prompt. Testing consent is separate. The host 90-day mapping lock differs from the shared conversation-runtime CONTRACT’s permanent mapping-record language; neither shared CONTRACT changes and reconciliation is not claimed.

Familiarization is runtime grounding in live UI/entity contracts and user corrections during populated-UI review. Early testing audio uses the locked consent popup, asked once per tester per operation; no silent training capture, fine-tuning promise or new ML pipeline. How-to-only Get help stays in the same assistant with a matching doc link and no product filing; doc links are deferred, so `matchingDoc` returns `undefined` for now. Audio storage: testing audio in the private bucket `assistant-testing-audio` via signed upload (P8); offline notes in IndexedDB (P9). Deferred and non-blocking: already-collected testing-audio disposal at testing end, and later-rollout consent.

## Still deferred (non-blocking)

See the full deferred list under “Ready-for-build gate locks after PR #12” below. It includes disposal of already-collected testing audio at testing end and later-rollout consent (to be decided when there are more users than Tim and a friend).

Physical table topology and SQL types are implemented in migration 040 (on Forgejo main, not applied). Audio storage is locked (P8, P9) and turn ending is manual commit (T5); no catch-all JSONB or ML training pipeline. Runtime ownership and how-to routing remain locked.

## Ready-for-build gate locks after PR #12 (2026-11-09)

Tim said “ok yes lets complete the rest of design” (via Orchestrator, 2026-11-09 4:41 AM ET). Design ran the ready-for-build gate (Homelab/project-framework `598b5c7b`, AGENTS.md:71-75), brought the product choices to Tim in Design chat, and locked or deferred every in-scope item below. The host adapter was then implemented by GTHO Build and merged on Forgejo as PR #38, merge `eb04c1973b4621d728f2a9ec760aa70b259f10f8` (tree equals reviewed head `72fd678`). Locks are Tim’s unless marked Design. These locks supersede any older text in this brief that conflicts with them.

### Earlier post-PR-#12 locks

- **Install / createHash.** The PWA supplies a browser implementation of Node `createHash` (`sha256` / `update` / `digest('hex')`) through host build configuration only: a Vite alias of `node:crypto` to an `@noble/hashes` shim. The PWA then imports pinned feedback-module v0.1.3 `src/index.js` exactly. Do not edit the vendor snapshot or reimplement `itemRevision`. If hashes cannot match, escalate to Chief of Staff for a separately pinned release.
- **Pins.** feedback-module `v0.1.3` (`f70d0d7d`, item contract `0.1.2`) and conversation-runtime `v0.1.1` (`aea11f3c`), held as in-repo vendor copies with per-file hashes in `vendor/pins.json`.
- **Backup exception (testing scope).** Browser CP-55/CP-56 backup and restore exclude seven server-authoritative tables plus `assistant_restore_fences`. The seven are `assistant_session_checkpoints`, `assistant_execution_results`, `assistant_session_locks`, `assistant_billing_policies`, `assistant_billing_reservations`, `assistant_billing_usage` and `assistant_billing_settlements`. CP-55/CP-56 is therefore not complete assistant recovery. The backend-authorized backup/recovery path is deferred.
- **Restore fence.** A membership-checked SECURITY DEFINER probe and fence: prepare, finish and abort. It reveals only whether the operation has rows in those tables, and it holds a durable fence so new protected rows cannot appear during a restore. No GRANT loosening, no `service_role` in the PWA, no row contents, no expiry or takeover. A restore that would conflict with retained server authority is refused before anything destructive happens.
- **Billing.** No blanket billing-policy seed; the policy row is created on the first reserve. Caps are 30 requests per 10 minutes, 2000 requests per month and 600 audio minutes per month, stored as policy parameters (unchanged by P12).

### Tim’s gate locks (2026-11-09)

- **P1.** Realtime voice only listens and speaks. The server-side conversation runtime decides. No shared-runtime change.
- **P2.** Testing runs on the live app (production project, real data), limited to our operations, with review before every save.
- **P3.** An operation allowlist Tim controls (secret `GTHO_ASSISTANT_OPERATIONS`). Operations not on it get 403 before any reserve, and the control stays hidden.
- **P4.** One voice session is capped at 10 minutes.
- **P5.** The text model is `grok-4.20-0309-non-reasoning`, kept as a setting/secret (`GTHO_XAI_TEXT_MODEL`). Switch to a dated reasoning model if data answers fall short. App code computes data answers; the model does not.
- **P6.** Voice is `grok-voice-3.0` with voice Eve, reasoning `none`.
- **P7.** Declining testing-audio consent still allows voice, and no audio is kept for that tester.
- **P8.** Kept testing audio goes to the private Supabase Storage bucket `assistant-testing-audio` via signed upload.
- **P9.** Offline voice notes ship now: stored in IndexedDB, 3-minute cap per note, transcribed once online and reviewed before saving. A note is deleted only after a confirmed write or filing saves locally.
- **P10.** Feedback counts as handed off once the server has the `submissions` row.
- **P11.** Tim personally approves applying migration 040 live, creates the xAI key, and flips the enable flag.
- **P12.** The central usage view is for Tim only (`GTHO_BILLING_CONTROL_USERS`). Caps unchanged.
- **Unknown usage after an xAI timeout or failure.** The assistant stays usable, because unknown usage does not block reserve. The request still counts once against request caps, nothing is recorded as zero, and the usage is listed as unreconciled for later server-side reconciliation. A failure before any provider fetch is a measured zero (Design).

### Design-filled items (Tim 👍)

- Tapping the control again also ends a voice turn, the same as saying “over”.
- Consent popup copy, exact: “During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.” Buttons: “Keep recordings” / “Don't keep”. It is asked once per tester per operation.

### Design technical bindings

- **T1.** Client-apply handshake through the GTHO-owned `gtho-assistant-apply` endpoint: `execute` throws `client-apply-pending`; the browser applies through the existing save path and reports the local save; a re-confirm replays the stored outcome.
- **T2.** `maxReadRounds` 3, `maxBodyBytes` 65536.
- **T3.** 25 s provider timeout via `AbortSignal.any` combined with `request.signal`. It covers the whole request.
- **T4.** Voice token from xAI `client_secrets`: 60 s lifetime; `validateLifetime` rejects anything over 120 s; `expiresAt` is in ms; WebSocket subprotocol `xai-client-secret.<token>`; 3 connection attempts, 5 s apart; `?model=` fallback if `session` is not accepted.
- **T5.** `turn_detection` null with manual commit (tap or “over”). A `server_vad` fallback sits behind config.
- **T6.** Voice settles the worst case (the 10-minute cap) at token issue, and later client usage reports are refused.
- **T7.** JWT auth via `auth.getUser`. The operation is the user’s only membership, or the `X-GTHO-Operation` header checked against membership. Never the request body.
- **T8.** CORS: OPTIONS returns 204, with origins from `GTHO_ASSISTANT_ORIGINS`. The unconfigured 503 and OPTIONS responses also carry CORS.
- **T9.** One pinned Postgres driver on `SUPABASE_DB_URL`.
- **T10.** `getAll` runs server-side for backend reads and validation; the browser re-validates at apply.
- **T11.** Per-intent context. `routeDestination` decides feedback filing, and `matchingDoc` returns `undefined`.
- **T12.** `earlyTesting` comes from a secret, and the client writes the consent row.
- **T13.** Eight secrets: `XAI_API_KEY`, `GTHO_XAI_TEXT_MODEL`, `GTHO_XAI_VOICE_MODEL`, `GTHO_ASSISTANT_ENABLED`, `GTHO_ASSISTANT_OPERATIONS`, `GTHO_ASSISTANT_EARLY_TESTING`, `GTHO_ASSISTANT_ORIGINS` and `GTHO_BILLING_CONTROL_USERS`. Every function serves 503 unless all are present and `ENABLED=true`; a model value containing `latest` is rejected. The PWA flag is `VITE_GTHO_ASSISTANT=1`, and a flag-off build ships no assistant feature or feedback-module code. The Supabase CLI is pinned.

### Design rulings

- **Push-to-talk.** One global push-to-talk routes writes, questions, feedback and how-to. It is the only voice entry; the Assistant sheet has no Talk button.
- **Matching** is exact after deterministic normalization, including spoken numbers to digits. No fuzzy matching.
- **Moves** follow the existing UI launch semantics.
- **Fallback question** is a host event, kept out of the model transcript and stored device-local. No 040 amendment.
- **Field hints** are derived from the sheet field definitions.
- **`voice_entry_attempts` lifecycle.** A row is created when an utterance starts an entry; `captured_at` is the capture or recording time. A reroute updates `purpose` on the same row, and the reroute replay is marked with a host event. The row becomes finished (with `finished_at`) when a write or feedback item saves locally, or when a question or how-to is answered; the 90-day expiry runs from `finished_at`. A user discard sets discarded, with no expiry. Log filters: Today (operation timezone), Write, Question, Feedback, How-to, Unfinished, All, plus the unfinished badge.
- **Retry chains, ruling (a).** The badge and the Unfinished filter count only the newest non-discarded attempt in a retry chain. Finishing a retry finishes its unfinished predecessors with the same `finished_at`. Discarding the retry makes its predecessor count again.
- **Ruling (b).** The replay turn being duplicated in the vendor runtime transcript is a reusable gap, raised with Chief of Staff. No library change.
- **Ruling (c).** The device-local preview fallback is accepted.
- **Calving** save clears Confirmed bred on the dam. Done: implemented in the live Calving save and calving-sync (`src/features/health/calving.js`, `src/features/animals/calving-sync.js`), verified in the PR #38 review.

### Deferred (the slice ships without these)

- The scheduled 90-day cleanup runner (the callable cleanup RPC ships; lock a cadence before the first expiry).
- Billing UI (own-usage and central views); the backend commands ship.
- Operation-owned billing; shared routing ships.
- Get-help doc links; how-to answers ship with no link and no filing.
- xAI usage reconciliation; the worst-case voice settlement and the unreconciled list ship.
- Bot pickup of filed feedback; filing to `submissions` ships.
- Testing-audio disposal at testing end.
- Later-rollout consent.
- The backend-authorized backup/recovery path for the excluded server tables.

### Open live unknowns (verify at smoke time)

- Whether `client_secrets` accepts `session` (T4 falls back to `?model=`).
- Whether input transcription streams with `turn_detection` null (T5).
- The realtime transcription model name `grok-transcribe` (`src/features/assistant/client/realtime.js:60`).
- Reusing the token across connection retries (T4).
- The operation timezone is set; otherwise reserve fails with `billing-calendar-timezone-required` (migration 040 :902).
- The Supabase plan wall clock (150 s Free vs 400 s Paid).
- The pooler behind `SUPABASE_DB_URL` (T9).
- Supabase CLI bundling of `../../../vendor` imports.

### Go-live order and approvals

1. Tim approves applying migration 040 to the live project (schema 39 → 40). GTHO Build applies and verifies it.
2. Secrets. Tim creates `XAI_API_KEY`; the other seven are set with `GTHO_ASSISTANT_ENABLED` not yet `true`.
3. GTHO Build deploys the functions with the pinned Supabase CLI.
4. Smoke tests, including the open live unknowns above.
5. Tim flips `GTHO_ASSISTANT_ENABLED=true`.
6. The PWA lands (flag-on build). The GitHub publish needs Tim’s separate approval. Publishing `main` to GitHub before 040 is live would break backup and restore.

State at this docs pass: PR #38 is merged on Forgejo `main`. Orchestrator reports Tim set `XAI_API_KEY` (reported, not verified by Design). The other seven secrets are not set. Migration 040 is not applied. The GitHub publish is held until 040 is live.

### Accepted nits (non-blocking follow-ups)

- A turn with several provider calls counts as more than one request against the monthly cap.
- `acknowledged_handoff` is determined only at apply time; a `submissions` row that reaches the server later does not upgrade the outcome.
- After a successful provider call, a later failure lists the turn in the unreconciled view (noise in that view).

## What to build / change

Implemented by GTHO Build after the gate and merged as Forgejo PR #38 (merge `eb04c1973b4621d728f2a9ec760aa70b259f10f8`). Design reviewed the branch against these locks and passed it after two fixes: the flag-off build no longer ships assistant or feedback-module code, and the Assistant sheet’s Talk button was removed. What remains is the go-live order above, which needs Tim’s approvals; it is not further design. Earlier docs history: rewrite PR #6 (merge `7d536cbb152a732e012b0a301279eb37f8b32b90`), exceptions/PTT PR #7 (merge `e44d641b3b4e54c8d909005498767b124285a18c`), voice-to-entry log PR #8 (merge `0b9f21e8de55280b63966f3aa6b3d0947fad4213`), offline audio notes PR #9 (merge `3aada9cc77ce5ab94c0202dcd1fc17ea462efac4`), tap-to-start PR #10 (merge `16bdafd0c980433c265caaa3c08b06e0cb865365`).

## Out of scope

- Implementing write-entry, ask-and-answer, or spoken feedback
- Inventing the shared conversation contract
- Recreating `CLAUDE.md` or a vendored `project-framework/` copy
- Retrying the blocked GitHub publish, or publishing to GitHub before migration 040 is live
