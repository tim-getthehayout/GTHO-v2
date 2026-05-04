# Feedback & Help Header Buttons

**Status:** Reconciled into base docs 2026-05-04 (Reconciliation Session C, UX-6).
**Type:** UI feature
**Priority:** P2
**Related OI:** none — fully spec'd

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §17.2 "Header Bar"** under the "Feedback & Help sub-row" subsection. Read that section before implementing. It covers:

- Sub-row layout (28px height, right-aligned, 1px `--border` bottom divider, `--bg` background)
- Button styling (`btn btn-outline btn-xs`, 11px/500, 💬 / 🆘 emoji prefix)
- Responsive behavior (≥900px desktop / <900px mobile, hidden in Field Mode, fits down to 280px)
- Feedback sheet (`type='feedback'`, all 7 category pills) vs Get Help sheet (`type='support'`, 4 categories only, always-visible Priority dropdown)
- Shared structure (auto-filled context tag, auto-filled-but-editable Area dropdown using v2 screen names — `home`→`dashboard`, `events`→`rotation-calendar`, `pastures`→`locations`, `todos` removed for v2 launch)
- No FAB in v2 — this sub-row replaces it
- No schema change — both sheets write to the existing `submissions` entity (V2_INFRASTRUCTURE.md §4.2)

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
