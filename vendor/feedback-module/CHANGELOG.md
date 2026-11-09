# Changelog

| Date | Change | Notes |
| --- | --- | --- |
| 2026-11-08 | Shared interview contract written in `CONTRACT.md`. | Confirmed by Tim and landed as written from the Shared feedback model Page. First contract release tag: `v0.1.0`. No implementation in this release. |
| 2026-11-08 | Backend API and usage attribution locked. | Universal hosted backend to start, architected so an operation can later use its own subscription. Per-operation compute metering for billing (model or voice session, tokens, audio minutes, request count), recorded server-side even before invoicing. Docs-only follow-on; no implementation. |
| 2026-11-08 | Additional backend billing and isolation rules locked. | Server-authenticated operation identity; rate limits or monthly caps from the start; purpose-tagged usage; operation self-serve billing plus a central air-traffic-control view; conversation content isolated by operation; billing logs separate from transcripts or audio; stop shared-engine billing when an operation uses its own subscription, keeping the same routing identity. Docs-only follow-on; no implementation. |
| 2026-11-08 | Implemented the shared interview library against contract `v0.1.2`. | JavaScript ESM entry, explicit-state validation, first-note persistence hooks, interview/review state, stable-ID handoff and host-reported delivery helpers; Node built-in regression tests. No host adapter, runtime transport, deployment or release tag. |
| 2026-11-08 | Named Feedback Module Build in this repository's `AGENTS.md`. | Factual pointer to match `TEAM.md` after the bot was created and marked Active. No contract change. |
| 2026-11-08 | Bumped package version to 0.1.3 to match forthcoming tag `v0.1.3`. | Package version only. No contract change. |
