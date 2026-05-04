# Feedback Screen — Desktop Only

**Status:** Reconciled into base docs 2026-05-04 (Reconciliation Session C, UX-7).
**Type:** UI feature
**Priority:** P2
**Related OI:** none — fully spec'd
**Depends on:** Feedback & Help sheets (V2_UX_FLOWS.md §17.2 sub-row) — reuses their submission writes

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §21 "Feedback Screen (Desktop-Only)"**. Read that section before implementing. It covers:

- Desktop-sidebar-only nav placement (between Settings and the sync strip; not in mobile bottom nav)
- Red unread badge for `open` + `resolved` items
- Four screen sections matching v1's order:
  1. Confirmation banner + cards for resolved items awaiting user confirm
  2. Stats strip with status/category badges that filter the list below
  3. Dev session brief card with Generate + Copy buttons over a regenerated monospace block
  4. All Submissions card with type / area / status filters + row-click submission detail sheet
- Resolve / edit lives only on the detail sheet (not inline in the list)
- Mobile fallback (centered "desktop-only" card with Back to dashboard)
- Out-of-scope items (threaded responses, email notifications, cross-team-member confirmation)
- No new entities, no schema, no CP-55/CP-56 impact

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
