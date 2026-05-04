# DMI-8 Cascade Rewrite (OI-0119)

**Status:** Shipped 2026-04-20 (commits ca332c0 spec → 65fc3b8 implementation; GH-29 closed). Reconciled into base docs 2026-05-03 (Reconciliation Session B, UX-3) + 2026-05-04 (Session C, CALC-1).
**Type:** Calc + UI rewrite
**Priority:** P1
**Related OI:** OI-0119 (combined fix; supersedes OI-0076 deferral and OI-0069 original spec)

## Authoritative specs

This work touches two base docs — read both before any related implementation:

- **V2_CALCULATION_SPEC.md §4.2 DMI-8** — the calc rewrite: cascade bucket model (pasture-first → stored-second → deficit-third), 5-state status enumeration, retroactive actual-conversion rule, source-event date-routing-only bridge, parallel sub-paddocks pooling, deficit render math.
- **V2_UX_FLOWS.md §17.15 "Event Detail View"** (DMI chart subsection) — the UI surface: 5-state chart status table, deficit segment, conditional legend, partial pre-graze "(Fix)" hint, sub-move-close forced feed-check rule. Also referenced from §17.7 Dashboard location card (chart element #11).

The new `getLiveRemainingForMove(eventId)` helper that came out of the same area is documented in V2_CALCULATION_SPEC.md §4.6 (added 2026-05-04 in Session C).

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
