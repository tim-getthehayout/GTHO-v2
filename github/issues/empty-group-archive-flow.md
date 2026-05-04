# Empty Group Archive Flow

**Status:** Reconciled into base docs 2026-05-04 (Reconciliation Session C, UX-5).
**Type:** Feature + schema migration
**Priority:** P1 (silent data integrity loss — manual group delete orphans historical events; farmer has no guided path to archive empty groups)
**Related OI:** OI-0090 · OI-0091 (predecessor — window-split architecture)

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §3.4 "Empty Group Handling (Archive Cascade)"**. Read that section end-to-end before implementing. It covers:

- The post-window-split trigger (`maybeShowEmptyGroupPrompt(groupId)` — no centralized cascade; each mutation flow owns its call)
- Three group states (`active` / `empty-but-active` / `archived`) on `groups.archived_at TIMESTAMPTZ`
- The empty-group prompt (Archive / Keep active / Delete with hard-disable when group has any historical event_group_window)
- Group Management UI ("Show archived" toggle + Reactivate + delete-history guard)
- Picker filter list (move wizard / event creation / Group CRUD / Field Mode pills / reports / dashboard)
- CP-55/CP-56 catch-up note (covered by OI-0156)

Schema work (migration 024 dropping `archived BOOLEAN` and replacing with `archived_at TIMESTAMPTZ`) is documented in V2_SCHEMA_DESIGN.md §3.3 "groups" — reconciled in Session A.

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
