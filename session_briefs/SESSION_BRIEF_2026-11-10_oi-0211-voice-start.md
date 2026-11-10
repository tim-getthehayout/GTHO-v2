# SESSION_BRIEF — OI-0211 iPhone voice start and truthful listening state

**Generated:** 2026-11-10
**Source:** GTHO Design; Tim's iPhone retest and Build's read-only diagnosis
**Status:** Scoped for GTHO Build diagnosis; not ready for final implementation until connect bound / root-cause repair gate is resolved

## What was decided

- OI-0211 requires a working voice turn after first-use iPhone microphone permission, not just a UI wording fix. Listening means the voice connection is live and buffered audio is flushing.
- Tim, relayed by Orchestrator 2026-11-10 11:46 AM ET: while listening, hide Type here and show Listening plus End; restore typing when the turn or voice ends. This is OI-0207's shared-sheet follow-up, not another entry lifecycle.
- OI-0210 has been reset to schema-driven entry across the whole app. Design is scoping it with Tim; not ready for Build. No OI-0210 implementation plan is handed off here.

## What to build / change

- Complete the read-only root-cause diagnosis: connection bounding, iOS AudioContext creation/resume, buffered audio flush and turn detection. Evidence and verified source references on `b6689b23` are in `OPEN_ITEMS.md` OI-0211.
- Return the numeric connect bound and root-cause repair scope to Design/Orchestrator before calling the implementation gate passed. Then implement that repair with truthful Connecting/Listening and terminal cleanup, including the hide-composer state.
- Add the content-free connection/turn milestones specified in OI-0211. Never log audio, transcript content or private record data in these operational logs.

## Acceptance criteria

- All OI-0211 acceptance criteria in `OPEN_ITEMS.md` apply; that entry is authoritative rather than a second divergent list here.
- First-use permission plus a spoken entry ending in over produces exactly one voice turn on Tim's iPhone Safari. Existing-permission retest also passes.
- Forced hung connect is Connecting, never Listening, then releases mic/recorder, discards the empty start once and offers Type instead?. Automated startup/terminal tests and focused root-cause regression coverage pass.
- Shared sheet hides Type here during actual listening and restores it when the turn/voice ends. Preserve shared close/cancel and review-before-save.

## Constraints and traps to avoid

- No production secrets, model switch, schema change or live data repair in this handoff. No `vendor/` edits. Escalate any needed shared-contract change to Chief of Staff.
- Keep mic-before-mint, PCM order/flush, early-end queuing, generation/abort protections and consent. Preserve populated conversation/review state and billing rows; empty-start cleanup must retain its existing guards.
- The 10-minute worst-case voice settlement is not measured audio and is not the connection-timeout bound. A minted token/local testing recording is not evidence of a realtime voice turn.

## Pinned contracts and library surfaces

- Existing `feedback-module` v0.1.3 and `conversation-runtime` v0.1.1 pins remain unchanged. This scoped diagnosis adds no imported contract, new binding or snapshot shape.
- Source surfaces walked at `b6689b23`: `client/session.js` startup/connect/flush state and `client/realtime.js` microphone/AudioContext path; strict trusted pending snapshot documented separately in `V2_SCHEMA_DESIGN.md`.
- A required module change is a returned design question, not permission to patch a vendored snapshot.

## In-scope decisions Build would otherwise invent

- Numeric bound for a connect that never reaches live: unresolved; return the proposed bound with diagnosis before final implementation readiness. Root cause remains under investigation and is not asserted from absent socket logs.

## Explicitly deferred

- OI-0210 whole-app schema-driven entry: being scoped with Tim, not ready; this voice repair is independently testable.
- OI-0212 security findings: tracking only; no fix authorized. OI-0213 feeding storage atomicity: scope later, not ready.
- OI-0208 running-chat UX and any shared-module contract change are separate Design work.

## References

- `PROJECT_STATUS.md` §§3–5.
- `OPEN_ITEMS.md` OI-0207 and OI-0211; OI-0210 reservation only.
- `V2_SCHEMA_DESIGN.md` assistant trusted-snapshot / server-authority sections.
- `session_briefs/SESSION_BRIEF_2026-11-08_oi-0195-voice-ai-foundation.md` for existing foundation locks.
