# Field Mode — V1 Parity

**Status:** Reconciled into base docs 2026-05-03 (Reconciliation Session B, UX-2).
**Type:** UI feature (full v1 parity)
**Priority:** P1
**Related OI:** none — fully spec'd from v1 extraction

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §16 "Field Mode"**. Read that section before implementing. The 12 subsections cover:

- §16.1 Activation (header pill ⊞ Field / ← Detail / ⌂ Home, three-state context-aware behavior)
- §16.2 `body.field-mode` CSS gate (sidebar / bottom nav / SP-6 sub-row / build stamp hidden + desktop grid collapse)
- §16.3 Field Mode Home Screen layout
- §16.4 Tile Grid (8 modules driven by `FIELD_MODULES` constant, 4-module default)
- §16.5 Shared Event Picker Sheet (Move / Feed Check / Heat fallback)
- §16.6 Active Events Section (expandable cards reusing `buildLocationCard()`)
- §16.7 Tasks Section (interactive checkboxes + due-date color coding + + Add)
- §16.8 Record Heat 2-Step Animal Picker (event/group filter pills, search, multi-record)
- §16.9 Feed Check Loop (Feed Animals tile)
- §16.10 Field-Mode Sheet Behavior (no backdrop close, hidden handle, "⌂ Done", full-screen mobile, after-save → #/field)
- §16.11 Module Settings (cross-reference to §20 Settings)
- §16.12 Design Notes (exit-returns-to-previous via sessionStorage)

The dark-green field-mode header bar is explicitly deleted in v2 — navigation in/out uses the header pill.

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
