# Session Brief — SP-2 Event Detail View (2026-04-15)

## Context

Active UI sprint. SP-1 (dashboard action buttons) is done and deployed. SP-2 (Event Detail View) design is locked after one round of review on a rendered HTML mockup — now ready for Claude Code to implement. SP-3 (dashboard card enrichment) is being designed in parallel and will hand off after this one.

**Read first, in this order:**

1. `UI_SPRINT_SPEC.md` § SP-2 — decisions summary + Schema Impacts
2. `github/issues/event-detail-view.md` — full authoritative spec (rewritten today)
3. `App Migration Project/SP-2_event-detail_mockup.html` — v4 approved wireframe (open in browser to see the target layout/copy)
4. `OPEN_ITEMS.md` → OI-0063, OI-0064 (both apply to this work)
5. `CLAUDE.md` sections "Active Sprint: UI Improvements", "Migration Execution Rule — Write + Run + Verify", "Export/Import Spec Sync Rule"

## What to build

Route `#/events?detail={eventId}`. Events screen renders the detail view when this param is present, otherwise the calendar/list. Max-width 720px single column. 13 sections top-to-bottom — see spec file for section-by-section detail.

Key decisions to preserve (easy to miss if you skim):

- **Anchor-no-close rule.** When only one paddock window is open, its card has no Close button. Event ends via footer's `Close & move`. Only sub-paddocks get an inline Close button.
- **Post-graze row is one line.** `Avg height · Recovery window: Min N days · Max N days`. Min/Max are days, not heights.
- **Remove group opens a picker** (Unplace vs Move to existing event). It does not silently delete.
- **One component per overlay pattern.** Pre-graze modal, post-graze modal, confirm-delete dialog, etc. each have one responsive implementation. No parallel desktop/mobile builds.
- **Sub-move history:** Edit only. No inline Delete. No Manage button. Reopen folds into the Edit dialog when that dialog gets spec'd.
- **Calc-missing behavior:** omit entire rows/cards when the underlying calc isn't registered. Do not render `—` where an entire row can be hidden. Chart and NPK card hide when their calc dependencies are missing.

## OPEN_ITEMS changes

The following entries are already in `OPEN_ITEMS.md`. No action needed — listed here so you know what applies:

- **OI-0063** — `event_observations` schema alignment. Blocker for SP-2. New migration adds the columns listed in the spec file. Execute + verify per the standard Migration Execution Rule. CP-55/CP-56 spec updates required in the same commit.
- **OI-0064** — Manage button dropped from sub-move history. Captured here; the real follow-up is the Edit-dialog spec when that modal gets designed.

## Acceptance criteria

Use the checklist at the bottom of `github/issues/event-detail-view.md` (§ Acceptance Criteria). All items must pass before close.

Additional reminders tied to CLAUDE.md:

- `npx vitest run` clean
- No `innerHTML` with dynamic content
- Every new migration: (a) `UPDATE operations SET schema_version = N;` at the end, (b) `BACKUP_MIGRATIONS` entry in `src/data/backup-migrations.js`, (c) if the new FK changes restore ordering, update V2_MIGRATION_PLAN.md §5.3/§5.3a in the same commit
- E2E verifies Supabase state, not just UI (see CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI")

## GitHub issue

`github/issues/event-detail-view.md` does not yet have a `GH-` prefix. First action:

```
gh issue create --title "SP-2: Event Detail View" --body "$(cat github/issues/event-detail-view.md)" --label "spec,task,P1,v2-design"
```

Then rename the file to `GH-{number}_event-detail-view.md` per the handoff convention.

## Deploy

Single checkpoint of work. Commit + deploy when all acceptance criteria pass. This is a v2 repo feature — v2 deploys via `git push origin main` triggering the GitHub Actions workflow.

## Out of scope

- Dashboard card tap-to-open-detail wiring (waits until SP-3 ships)
- Per-group-scoped Move (currently event-scoped — SP-3 has it in deferred list)
- The Edit dialog's reopen-paddock flow (follow-up design, not part of SP-2)

## After this lands

Cowork will be designing SP-3 (dashboard card enrichment) in parallel. Once SP-2 is committed, Cowork may hand off SP-3 next.
