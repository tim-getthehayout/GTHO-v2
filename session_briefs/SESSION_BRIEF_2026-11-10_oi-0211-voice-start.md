# SESSION_BRIEF — OI-0211 iPhone voice start and truthful listening state

**Generated:** 2026-11-10
**Source:** GTHO Design; Tim's iPhone retest and Build's read-only diagnosis
**Status:** Design rulings locked; Build reports the root-cause repair and confirms it by iPhone retest. The 10-second overall startup bound is not an open gate.

## What was decided

- OI-0211 requires a working voice turn after first-use iPhone microphone permission, not just a UI wording fix. Listening means the voice connection is live and buffered audio is flushing.
- Tim, relayed by Orchestrator 2026-11-10 11:46 AM ET: while listening, hide Type here and show Listening plus End; restore typing when the turn or voice ends. This is OI-0207's shared-sheet follow-up, not another entry lifecycle.
- OI-0210 has been reset to schema-driven entry across the whole app. Design is scoping it with Tim; not ready for Build. No OI-0210 implementation plan is handed off here.

## Build's read-only diagnosis on b6689b23

- Listening is set before connect (`session.js:236–241`); mint/connect are unbounded. `turn_detection` is null with no VAD, so only over or a second tap ends the turn; typing does not end it.
- AudioContext is created after an await without resume(), **likely** suspended on iOS; there is no resampling, and the testing recorder is uncapped. The iOS cause remains likely until confirmed by iPhone retest.

## Design rulings (2026-11-10, on Build's read-only diagnosis)

- **Q1:** keep manual over / second-tap turn ending per Tim's 2026-11-08 lock; no server_vad.
- **Q2:** no typing during live voice; hide Type here. If a typed send happens while voice is live, end the voice turn first.
- **Q3:** read realtime transcription model from server config, not a realtime.js hardcode. Keep pinned-validated grok-transcribe; only Tim chooses a value change.
- **Q4:** 10 seconds overall from tap to both session.created and first audio chunk sent. Thread AbortSignal through token broker and API fetch. Past 10 seconds, release mic, stop recorder, discard the empty start and offer Type instead?. This covers mint and connect; the numeric bound is locked.
- **Q5:** testing recorder starts only after the connection is live, stops in every teardown and is capped at 10 minutes. A never-connected session keeps no audio.
- Create AudioContext synchronously within the user gesture and call resume(); resample captured audio to 24 kHz before sending.
- Log content-free milestones through src/utils/logger.js, flushed to app_logs, never audio/transcript/private record data.

## What to build / change

- Implement the Q1–Q5 and audio/logging rulings above, with truthful Connecting/Listening and terminal cleanup, including the hide-composer state. Evidence and authoritative requirements are in `OPEN_ITEMS.md` OI-0211.
- Report the root-cause repair to Design/Orchestrator and confirm on Tim's iPhone; keep AudioContext suspension labelled likely until that retest. No proposed numeric-bound gate remains.
- Preserve shared lifecycle, generation/abort, mic-first mint and ordered buffer/early-end guards; no vendor/ patch.

## Acceptance criteria

- All OI-0211 acceptance criteria in `OPEN_ITEMS.md` apply; that entry is authoritative rather than a second divergent list here.
- First-use permission plus a spoken entry ending in over produces exactly one voice turn on Tim's iPhone Safari. Existing-permission retest also passes.
- Forced hung mint/connect or a missing session.created/first-audio-send milestone reaches cleanup at 10 seconds overall from tap, never Listening; AbortSignal reaches token broker/API fetch. Release mic/recorder, discard the empty start once and offer Type instead?. Late callbacks cannot restart capture.
- Shared sheet hides Type here during actual listening and restores it when the turn/voice ends. A typed send while voice is live ends the voice turn first. Keep manual over / second tap; no server_vad. Preserve shared close/cancel and review-before-save.
- Recorder never starts before live, stops on every teardown and at 10 minutes, and retains no audio if connect never succeeds. Tests cover all three.
- Tests cover synchronous user-gesture AudioContext creation, resume(), non-24-kHz input resampled to 24 kHz, and pinned-validated transcription model from server config. Content-free app-logger milestones are flushed to app_logs.

## Constraints and traps to avoid

- No production secrets, model switch, schema change or live data repair in this handoff. No `vendor/` edits. Escalate any needed shared-contract change to Chief of Staff.
- Keep mic-before-mint, PCM order/flush, early-end queuing, generation/abort protections and consent. Preserve populated conversation/review state and billing rows; empty-start cleanup must retain its existing guards.
- The 10-minute worst-case voice settlement is not measured audio and is not the connection-timeout bound. A minted token/local testing recording is not evidence of a realtime voice turn.

## Pinned contracts and library surfaces

- Existing `feedback-module` v0.1.3 and `conversation-runtime` v0.1.1 pins remain unchanged. This scoped diagnosis adds no imported contract, new binding or snapshot shape.
- Source surfaces walked at `b6689b23`: `client/session.js` startup/connect/flush state and `client/realtime.js` microphone/AudioContext path; strict trusted pending snapshot documented separately in `V2_SCHEMA_DESIGN.md`.
- A required module change is a returned design question, not permission to patch a vendored snapshot.

## In-scope decisions Build would otherwise invent

- None for the numeric startup bound: Design locked 10 seconds overall. Build must report the root-cause repair and confirm it by iPhone retest; no vendor/ or shared-contract patch is authorized. Return any newly discovered product/contract decision rather than inventing it.

## Explicitly deferred

- OI-0210 whole-app schema-driven entry: being scoped with Tim, not ready; this voice repair is independently testable.
- OI-0212 security findings: tracking only; no fix authorized. OI-0213 feeding storage atomicity: scope later, not ready.
- OI-0208 running-chat UX and any shared-module contract change are separate Design work.

## References

- `PROJECT_STATUS.md` §§3–5.
- `OPEN_ITEMS.md` OI-0207 and OI-0211; OI-0210 reservation only.
- `V2_SCHEMA_DESIGN.md` assistant trusted-snapshot / server-authority sections.
- `session_briefs/SESSION_BRIEF_2026-11-08_oi-0195-voice-ai-foundation.md` for existing foundation locks.
