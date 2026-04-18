# Empty Group Archive Flow

**Type:** Feature + schema migration
**Priority:** P1 (silent data integrity loss — manual group delete orphans historical events; farmer has no guided path to archive empty groups)
**Related OI:** OI-0090
**Predecessors:** OI-0086 (cull dialog — closed), **OI-0091 (event window split on state change — blocks this issue)**

## Full spec

The full spec lives in `UI_SPRINT_SPEC.md` § **SP-11: Empty Group Archive Flow**. Read that section end-to-end before implementing.

This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## 2026-04-17 revision — Part 1 subsumed by OI-0091

The original Part 1 ("Automatic event_group_window cleanup" via a centralized `store.onLastMembershipClosed(groupId, date)` cascade) has been **struck**. That behavior is now owned by OI-0091's window-split architecture, which closes/splits the window at the mutation site (cull, move, wean, split) with live values stamped at the change date.

**This issue now covers Parts 2–4 only:**

1. ~~Automatic event_group_window cleanup~~ — owned by OI-0091. Do not build a second cascade.
2. Archive as first-class group state — `archived` boolean → `archived_at` timestamptz (migration 024).
3. Empty-group prompt — Archive / Keep active / Delete, triggered by `maybeShowEmptyGroupPrompt(groupId)` called from each state-change flow after OI-0091's window commit.
4. Reactivation flow — "Show archived" toggle + Reactivate action in group management UI.

**Blocker:** Do not begin implementation until OI-0091 ships. The empty-group prompt depends on OI-0091's closing flow leaving `date_left` correctly stamped; without it the prompt will misfire.

## Quick summary (for issue tracker only)

When a state-change flow (cull / move / wean) closes the last open membership on a group:

1. OI-0091 closes the group's open `event_group_window` with live values stamped at the change date (toast fires from OI-0091).
2. The flow then calls `maybeShowEmptyGroupPrompt(groupId)`. If zero open memberships remain, the empty-group prompt opens: **Archive** / **Keep active** / **Delete**. Delete is disabled if the group has ever been on an event.
3. Archive uses a new `groups.archived_at TIMESTAMPTZ` column (migration 024 replaces the existing `archived boolean`).
4. Group management UI gets a "Show archived" toggle and a Reactivate action (for seasonal cohort reuse).

## Schema

See SP-11 § Schema. Migration `024_groups_archived_at.sql` — add `archived_at`, backfill from `archived`, drop `archived`. Schema version bump 23 → 24.

## CP-55 / CP-56 impact

See SP-11 § CP-55 / CP-56 Impact. `archived_at` serialized; backup-migrations chain entry v23 → v24 maps old boolean to timestamp.

## Acceptance criteria

See SP-11 § Acceptance Criteria (full list in that section). Note the first item: "OI-0091 shipped first" is a hard prerequisite.
