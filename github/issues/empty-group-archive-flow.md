# Empty Group Archive Flow

**Type:** Feature + schema migration
**Priority:** P1 (silent data integrity loss — empty group windows accumulate; manual group delete orphans historical events)
**Related OI:** OI-0090
**Predecessors:** OI-0086 (cull dialog — closed)

## Full spec

The full spec lives in `UI_SPRINT_SPEC.md` § **SP-11: Empty Group Archive Flow**. Read that section end-to-end before implementing.

This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

## Quick summary (for issue tracker only)

When the last animal is culled or moved out of a group:

1. The group's open `event_group_window` is automatically closed on the change date (toast fires).
2. An empty-group prompt offers **Archive** / **Keep active** / **Delete**. Delete is disabled if the group has ever been on an event.
3. Archive uses a new `groups.archived_at TIMESTAMPTZ` column (migration 024 replaces the existing `archived boolean`).
4. Group management UI gets a "Show archived" toggle and a Reactivate action (for seasonal cohort reuse).

## Schema

See SP-11 § Schema. Migration `024_groups_archived_at.sql` — add `archived_at`, backfill from `archived`, drop `archived`. Schema version bump 23 → 24.

## CP-55 / CP-56 impact

See SP-11 § CP-55 / CP-56 Impact. `archived_at` serialized; backup-migrations chain entry v23 → v24 maps old boolean to timestamp.

## Acceptance criteria

See SP-11 § Acceptance Criteria (full list in that section).
