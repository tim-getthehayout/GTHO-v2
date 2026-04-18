# Session Brief — Empty Group Archive Flow (OI-0090 / SP-11 Parts 2–4)

**Date:** 2026-04-17
**Issue covered:** OI-0090
**Prerequisites (hard):**
1. OI-0091 + OI-0073 package shipped (commit c9e69d1 — verified)
2. OI-0094 package 2 shipped before this one starts, so every state-change flow already calls `splitGroupWindow` / `closeGroupWindow` and can be extended with a post-commit `maybeShowEmptyGroupPrompt(groupId)` call

## What this is

OI-0090 was originally three parts — an automatic window-close cascade (Part 1), an empty-group prompt (Part 2), an archive-as-first-class-state upgrade (Part 3), and a reactivation flow (Part 4). Part 1 was **subsumed by OI-0091** (window-split architecture now closes the window at the mutation site with live values). This session covers Parts 2–4 only.

Full spec lives in `UI_SPRINT_SPEC.md § SP-11`. Thin pointer is `github/issues/empty-group-archive-flow.md`. Read SP-11 end-to-end before starting — especially the 2026-04-17 revision banner and the stricken cascade section (do not reintroduce `onLastMembershipClosed`).

## OPEN_ITEMS changes

Apply when starting:

- **OI-0090** — mark status from `open — spec partially revised 2026-04-17 … blocked by OI-0091` to `in progress — Claude Code implementing (Parts 2–4, OI-0091 shipped)`.
- When done: close OI-0090, link commit hash, add a Change Log row.

## Schema version wrinkle — read first

Package 1's migration 025 (orphan cleanup) ran before migration 024 existed. The commit note states: *"Schema version 23 → 25; backup-migrations chain extended with 23→24 reserved + 24→25 no-op entries."* So:

- **Tim's live DB**: `operations.schema_version = 25` already. Migration 024's ALTER TABLE work still needs to run, but its final `UPDATE operations SET schema_version = 24` would be a downgrade and must be guarded.
- **Fresh DBs**: migrations run in file order (024 then 025), no conflict — migration 024's normal `schema_version = 24` statement runs fine, migration 025 then sets it to 25.
- **Backup-migrations.js**: the `23 → 24` chain entry is currently a reserved placeholder. Part of this session is filling that entry with real transform logic (boolean → timestamp). The existing `24 → 25` no-op stays no-op.

**Recommended migration 024 pattern:**

```sql
-- ALTER TABLE work (applies unconditionally — idempotent guards recommended)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
UPDATE groups SET archived_at = updated_at WHERE archived = true AND archived_at IS NULL;
ALTER TABLE groups DROP COLUMN IF EXISTS archived;
CREATE INDEX IF NOT EXISTS idx_groups_active ON groups(farm_id) WHERE archived_at IS NULL;

-- Schema version bump — guarded to avoid downgrade on DBs that are ahead
UPDATE operations SET schema_version = 24 WHERE schema_version < 24;
```

Verify as normal per CLAUDE.md Write + Run + Verify:

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'groups' AND column_name IN ('archived', 'archived_at');
-- Expect: one row — archived_at, timestamp with time zone
```

If Claude Code reads backup-migrations.js and finds a cleaner reservation pattern already in place, use that instead. This is the fallback recipe.

## Implementation order

Five phases. Phase 5 closes the OI.

### Phase 1 — Migration 024 + schema verify

1. Write `supabase/migrations/024_groups_archived_at.sql` per the pattern above.
2. Execute against Supabase via MCP.
3. Run the verification SQL. Expect exactly one row.
4. Commit message line: *"Migration 024 applied and verified"*.

### Phase 2 — Entity + store + backup chain

1. `src/entities/group.js`:
   - Replace `archived: { type: 'boolean' }` with `archivedAt: { type: 'timestamptz', required: false, sbColumn: 'archived_at' }`.
   - `create()` defaults `archivedAt: null`.
   - `toSupabaseShape()` / `fromSupabaseShape()` map `archivedAt ↔ archived_at` (ISO string or null).
   - `validate()` allows null or valid ISO timestamp.
   - Round-trip unit test: `fromSupabaseShape(toSupabaseShape(g))` preserves `archivedAt`.

2. `src/data/store.js` — add two actions:
   - `archiveGroup(groupId)` — set `archivedAt = now()`, run through the standard `update()` flow (6 params per CLAUDE.md Rule 7: `entityType, id, changes, validateFn, toSupabaseFn, table`).
   - `reactivateGroup(groupId)` — set `archivedAt = null`, same update flow.
   - **Do NOT add `onLastMembershipClosed`.** OI-0091 owns that path.

3. `src/data/backup-migrations.js` — fill in the `23 → 24` chain entry:

   ```js
   23: (b) => {
     (b.groups || []).forEach(g => {
       if (g.archived === true) {
         g.archivedAt = g.updatedAt || b.exported_at || new Date().toISOString();
       } else {
         g.archivedAt = null;
       }
       delete g.archived;
     });
     b.schema_version = 24;
     return b;
   },
   ```

   Unit test: `{archived: true}` → `{archivedAt: [timestamp]}` (archived key removed); `{archived: false}` → `{archivedAt: null}`; empty or missing `groups` array runs cleanly.

4. Grep check: `grep -rn "\.archived\b" src/ tests/` — every call site either becomes a read of `archivedAt` or a call to `archiveGroup`/`reactivateGroup`. No code should read `group.archived` after this phase.

### Phase 3 — Empty-group prompt component + flow wiring

1. Build the prompt sheet. Title: *"[Group name] is empty"*. Body + three buttons per SP-11. Location: `src/features/groups/empty-group-prompt.js` (or similar — match the existing feature file layout).
   - **Archive** (primary green) → `store.archiveGroup(groupId)` → toast *"[Group name] archived"* → refresh visible group pickers.
   - **Keep active** (secondary) → no-op, close sheet.
   - **Delete** (danger) — disabled when the group has any `event_group_window` history. Tooltip when disabled: *"This group is on N event(s). Archive instead to preserve history."* When enabled, confirm dialog → `store.removeGroup(id)` (3 params per Rule 7).
   - Dismiss (tap outside / X) → treat as Keep active.

2. `maybeShowEmptyGroupPrompt(groupId)` helper in the same file:
   - Check: does this group have zero open `animal_group_memberships`? If not, return — no prompt.
   - If yes, open the prompt.

3. Wire the helper into every state-change flow that OI-0094 just touched. Call **after** the existing `splitGroupWindow` / `closeGroupWindow` commit:
   - `src/features/animals/cull-sheet.js` — after cull commits.
   - `src/features/events/move-wizard.js` — after move commits (only if source group is now empty).
   - `src/features/health/calving.js` — not applicable (calving adds memberships, can't leave a group empty). Skip.
   - `src/features/animals/index.js` — Edit Group sheet, Split Group sheet, Edit Animal group dropdown change. All three may leave the source group empty.
   - `src/features/events/group-windows.js` — §7 Remove group may leave the group empty if the group had no other open events. Call the helper.
   - If OI-0093 removed the Animals bulk Move bar, skip that call site.

4. Unit tests for `maybeShowEmptyGroupPrompt` — prompt opens when zero open memberships, no-op otherwise.

### Phase 4 — Management UI (Show archived toggle + Reactivate)

1. Extend the existing Group CRUD list (`src/features/groups/` — whichever file owns §15.2 today) with:
   - **Show archived** toggle at the top of the group list.
   - Active groups render as today (filter `archivedAt === null`).
   - When toggle is on, a second section renders below: *"Archived groups"* with `archivedAt !== null` rows. Each row shows name, color dot, archive date, last head count (if available from last closed event window), **Reactivate** button, **Delete** button (same gating as the prompt).

2. Reactivate action → `store.reactivateGroup(id)` → toast *"[Group name] reactivated"* → group reappears in active pickers.

3. Filter-update audit — every group picker must filter `archivedAt === null`:
   - Move wizard group picker
   - Event creation group picker
   - Field mode group pills
   - Dashboard groups view
   - Reports that default to "active groups only"
   - Edit Animal group dropdown (the one OI-0093 is rewriting to the v2 picker pattern — pick up the filter there)

   Grep check: `grep -rn "state.groups\b\|store.groups\b" src/features/` — every read that feeds a picker must wrap in `.filter(g => g.archivedAt === null)` unless it's the management list.

### Phase 5 — E2E test + docs + close

1. E2E `tests/e2e/empty-group-archive.spec.js`:
   - Cull the last animal in a group → empty-group prompt appears (post-OI-0091 toast first).
   - Query Supabase: `event_group_windows.date_left` set to cull date (OI-0091 behavior, verify still works).
   - Tap Archive → Query Supabase: `groups.archived_at` non-null. Group disappears from move wizard picker.
   - Navigate to group management, toggle Show archived → archived group appears. Tap Reactivate.
   - Query Supabase: `groups.archived_at IS NULL`. Group reappears in move wizard picker.
   - Verify writes hit Supabase, not just localStorage, per CLAUDE.md's e2e sync rule.

2. PROJECT_CHANGELOG.md — one row covering migration 024, entity update, empty-group prompt, management UI, tests.

3. Close OI-0090 in OPEN_ITEMS.md. Add a Change Log row.

4. Commit message: `feat(groups): empty group archive flow — migration 024 archived_at + empty-group prompt + management UI (OI-0090, SP-11 Parts 2–4)`.

## Known traps

- **Do NOT reintroduce `onLastMembershipClosed`.** OI-0091 owns window closure at the mutation site. The empty-group prompt triggers from `maybeShowEmptyGroupPrompt` *after* the window commits, not from a cascade.
- **Migration 024 schema_version conflict**: `UPDATE operations SET schema_version = 24 WHERE schema_version < 24` — the guard is non-optional on Tim's DB since 025 already ran.
- **Delete gating** — use `event_group_windows.group_id` count, not `animal_group_memberships` count. A group with closed historical memberships but no events would be deletable; a group with any event history must not be.
- **Picker filters** — silent bug class. Missing `archivedAt === null` filter means archived groups reappear in Move wizard or Edit Animal. Grep check is the belt-and-suspenders.
- **Group rename while archived** — allowed (per SP-11 Open Questions). Reactivation flow should preserve any rename the farmer did in the archived state.
- **CP-55 / CP-56 verification** — after migration, export a backup, edit the JSON to force `schema_version: 23` + restore `archived: true` on a group, reimport. The 23→24 chain entry should map it correctly. If you don't want to run a full import, at least unit-test the chain entry in isolation.

## Reconciliation (end of sprint, not this session)

SP-11 reconciliation row already exists in `UI_SPRINT_SPEC.md` § Reconciliation Checklist. When this OI closes, note in the Change Log that reconciliation still needs to merge SP-11 into V2_UX_FLOWS.md §3.4 + §15.2 and V2_SCHEMA_DESIGN.md §3.3. That merge happens at sprint end, not now.

## Git workflow reminder

Per CLAUDE.md: work on `main`, commit in logical chunks (at least one commit per phase, or a single bundled commit if the work is tight). Each commit → PROJECT_CHANGELOG.md row. Push triggers the GitHub Actions deploy.
