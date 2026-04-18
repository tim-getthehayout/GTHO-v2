# Paddock Window Split on State Change — Architectural Fix

**Type:** Architectural fix (paddock analog of OI-0091)
**Priority:** P0 (strip grazing silently loses per-strip effective-area history; every area-dependent calc on an open strip-grazed paddock is wrong after any `area_pct` edit)
**Related OI:** OI-0095
**Related spec:** `github/issues/GH-4_strip-grazing-paddock-windows.md` — OI-0095 is the plumbing behind GH-4's strip grazing feature; OI-0095 does not re-spec GH-4.
**Predecessors:** OI-0091 + OI-0073 package shipped (commit c9e69d1), OI-0094 package 2 shipped (commit 90c68cc). OI-0095 copies OI-0091's helper contract pattern and OI-0094's grep-contract + classifier pattern.

## Full spec

The full spec lives in `OPEN_ITEMS.md` § **OI-0095**. Read that entry end-to-end before implementing — especially the architectural-principle section, the 11-item scope list, and the explicit non-scope section.

This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## Quick summary (for issue tracker only)

An `event_paddock_window` is the paddock-side analog of `event_group_window` — a period of stable placement state (`locationId`, `areaPct`, `isStripGraze`, `stripGroupId`). OI-0091 put the window-split discipline in place for group windows; OI-0095 does the same for paddock windows. The row structure already exists (GH-4 added `is_strip_graze`/`strip_group_id`/`area_pct`) but no flow consistently splits on state change:

- `edit-paddock-window.js` mutates `areaPct` in place on open windows, losing historical effective area
- `submove.js` Advance Strip already splits correctly — that pattern becomes the exemplar, lifted into a reusable helper
- `move-wizard.js` close path closes paddock windows bare (no snapshot discipline)
- `reopen-event.js` has no classifier analog to OI-0094's `classifyGwsForReopen`
- `dashboard/index.js` and `locations/index.js` hard-code `areaPct: 100` literals instead of reading the open PW

OI-0095 adds `splitPaddockWindow` / `closePaddockWindow` store helpers and a `getOpenPwForLocation` calc helper, wires every entry point through them, builds the reopen classifier + summary dialog, and extends `V2_APP_ARCHITECTURE.md` §4.4 with a paddock-side subsection. No schema change. No CP-55/CP-56 impact.

## Batched follow-ups (sequence together per Tim, 2026-04-18)

Per Tim's direction *"lets walk through all event window related items and wrap it all in at the end"*, OI-0095 ships alongside two smaller follow-ups from the group-side audit:

1. **Weight-side completeness OI** — Quick Weight sheet (`src/features/health/weight.js`) never calls `splitGroupWindow`; Edit Animal `currentWeight` input is created but silently no-ops in `saveAnimal`.
2. **Correction OI for OI-0090 session brief** — §7 Remove group incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point (closes the PW but doesn't touch `animal_group_memberships`, so "empty" doesn't apply).

Session brief that bundles all three into a single Claude Code handoff is the next deliverable.

## Acceptance criteria

See OI-0095 body in `OPEN_ITEMS.md` (full 14-item list). Highlights:

- `splitPaddockWindow` and `closePaddockWindow` exist as store helpers, unit-tested pure
- `getOpenPwForLocation` exists as a calc helper
- Advance Strip refactored to use `splitPaddockWindow` (pure refactor; behavior identical)
- `edit-paddock-window.js` routes `areaPct` and `isStripGraze` edits through the helper on open windows; closed-window direct `update()` preserved as historical-correction escape hatch
- `reopen-event.js` shows a summary dialog with `classifyPwsForReopen`
- Grep audits pass (no direct `update()` mutating `areaPct`/`isStripGraze`/`stripGroupId` on open windows outside the helper; no `areaPct: 100` literals outside tests)
- `V2_APP_ARCHITECTURE.md` §4.4 extended with paddock-side subsection and grep-contract row
- E2E coverage for mid-event `areaPct` change + reopen summary dialog
- No schema change; no CP-55/CP-56 impact

## Session brief

Session brief deferred until weight-side OI and §7 Remove group correction OI are drafted. All three will ship as one Claude Code handoff brief.
