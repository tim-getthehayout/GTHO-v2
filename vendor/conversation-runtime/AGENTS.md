# AGENTS.md — Conversation runtime

This is the shared conversation runtime contract, not a product app and not part of feedback-module. The contract is [CONTRACT.md](CONTRACT.md). Shared process and roster live in `Homelab/project-framework` (`TEAM.md` and `AGENTS.md`); do not copy the framework here.

## Ownership and change control

- **Chief of Staff** owns this contract until it needs a dedicated Design bot. Shared contract changes belong here, not in an app repo.
- **Git Bridge** lands the approved docs through the shared process.
- **Build bot: Conversation Runtime Build** implements the shared runtime. It does not invent the contract or write app host adapters.
- **App Design/Build bots** own host integrations only. Treat runtime and feedback-module as third-party-style contracts. Do not grow the shared runtime inside GTHO or another app repo; elevate reusable changes to Chief of Staff.
- **GTHO Design** owns exact host schemas and historical-field mapping during adoption, within the locked artifact/store/migration boundary.
- **Intake** runs the pinned feedback interview; it does not invent or change this runtime contract or the feedback-module contract.

## Repository and release discipline

- Canonical repository: Forgejo `Homelab/conversation-runtime`; sibling to `Homelab/feedback-module`.
- Apps explicitly pin released git tags; updates do not auto-spread.
- Keep vendor wire details behind the runtime boundary. Supabase Edge Function is the first backend deployment; xAI is the current AI-provider choice, with vendor flexibility preserved.
- Preserve the distinction between confirmed behavior, recommended transport/UI detail and deliberately deferred audio/consent choices.
