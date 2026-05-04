# Dashboard Location Card — V1 Parity

**Status:** Reconciled into base docs 2026-05-03 (Reconciliation Session B, UX-1).
**Type:** UI feature (v1 parity rewrite)
**Priority:** P1
**Related OI:** OI-0065 (per-group reweigh moved to Animals area), OI-0066 (per-group Move on dashboard event-scoped)

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §17.7 "Locations View — Location Cards"**. Read that section before implementing. It covers:

- 15-element card anatomy from the left green accent bar through the DMI/NPK summary
- The two deliberate v1 deltas: small bottom Feed/Feed-check buttons removed; large green Feed button added under the large amber Feed check
- Action buttons (Edit opens §17.15 sheet; Move all opens move wizard)
- "What is NOT on this card" callouts for OI-0065 (per-group reweigh moved to Animals area) and OI-0066 (per-group Move on dashboard is event-scoped — destination is a different paddock on the same event)
- DMI chart status enumeration (5 states per V2_UX_FLOWS.md §17.15 DMI subsection)

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
