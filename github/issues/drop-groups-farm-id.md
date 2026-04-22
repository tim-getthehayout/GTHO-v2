# Drop `groups.farm_id` — derive group's current farm from latest open `event_group_window` (OI-0133)

**Added:** 2026-04-22
**Area:** v2-build / groups / schema / multi-farm / data-integrity
**Priority:** P1 (blocks every Add Group save today; silent dashboard drift on every cross-farm move)
**Decision:** Tim chose **Design Y — drop the column, derive on read** on 2026-04-22 after seeing the alternative (Design X — keep the column, sync it everywhere). Design X carries the same invariant trap that bit OI-0094; Design Y dissolves the failure mode entirely and matches the OI-0117 precedent for stored-vs-derivable drift.

**Thin-pointer note:** not a thin pointer — it's a schema drop, an entity change, a store rewrite, a backup-pipeline update, and a UI simplification. At sprint reconciliation, V2_SCHEMA_DESIGN.md §3.3 drops the `farm_id` column row + FK + the `farms.id` reference, and V2_MIGRATION_PLAN.md §5.3a updates the FK-dependency table. Until those land, this file is the source of truth.

---

## Why we're doing this

Tim hit "Validation failed for groups: farmId is required" trying to add a "Culls-Open" group. Surface root cause is narrow: `openGroupSheet` and `openSplitGroupSheet` in `src/features/animals/index.js` (lines 444 + 592) declare `_farmId` as an unused parameter (underscore-prefixed) and `GroupEntity.create({ operationId, name, color })` (lines 544 + 764) never passes a `farmId`. The entity validator requires it, so every save fails for every user, single-farm or multi.

The narrow fix (pass `farmId` into `create()` and add a multi-farm selector) papers over a structural problem behind it. **Animals are operation-scoped — they don't have `farmId` (they move freely between farms). Locations are farm-anchored — they don't move. Groups are stored as farm-anchored but they move with their animals.** Today's `move-wizard.js:682` cross-farm move creates a new event with the destination `farmId` and new group windows on it but **never updates the group record**. So a group named "Mixed-Calves" on Farm 1, moved to a Farm 2 paddock, still has `groups.farm_id = Farm 1`. `getVisibleGroups()` (`src/data/store.js:329`) reads `g.farmId` directly to filter the dashboard — Mixed-Calves keeps showing up on the source farm's dashboard after the move. Silent drift.

This is the **OI-0117 class of bug** in a different costume: a stored copy of a fact (`groups.farmId`) that is derivable at read time from child rows (the group's currently-open `event_group_window → event.farmId`). Two stored columns for one derivable fact = silent drift.

**Design X — keep the column, sync it everywhere** would require updating `move-wizard.js` to write through to `groups.farmId` on cross-farm placement, plus a CLAUDE.md invariant ("any flow that places a group on a paddock on a different farm must update group.farmId"), plus a grep contract per OI-0094's pattern. That ships fast but loads the trap: every future placement flow must remember the rule.

**Design Y — drop the column, derive on read** removes the failure mode entirely. Newly-created group has no farm; gets one when first placed via a move. The Add Group bug Tim hit dissolves — there is no `farmId` field on the entity, no validator to fail, no single-vs-multi-farm UI fork to design. Cross-farm move "just works" because the dashboard filter reads through the open window to the event's farm. Matches the OI-0117 precedent.

Tim chose Design Y. This file specs it.

---

## Pre-spec audit findings (2026-04-22)

Complete grep across `src/`, `tests/`, docs, and Supabase. Every reference to `groups.farm_id` (SQL) or `g.farmId` / `group.farmId` (JS) is enumerated below.

### Live code references (must change)

| File | Line(s) | What it is | What to do |
|---|---|---|---|
| `src/entities/group.js` | 6 (FIELDS), 20 (create), 32 (validate), 48 (toSupabaseShape), 61 (fromSupabaseShape) | `farmId` field declarations across the entity contract | **Remove from all five exports** |
| `src/data/store.js` | 326 (doc comment), 329-333 (`getVisibleGroups()` body) | Filters groups by `g.farmId === activeFarmId` | **Rewrite to filter via `getGroupCurrentFarm(g.id)` (new helper, see below). Update doc comment.** |
| `src/data/store.js` | (new) | Helper `getGroupCurrentFarm(groupId)` — returns the `farmId` of the event tied to the group's most recent open `event_group_window`, or `null` if no open window exists | **Add. Co-located with `getVisibleGroups()` for cohesion. Pure function over store state — no I/O.** |
| `src/features/animals/index.js` | 154 (`openGroupSheet(null, operationId, farmId)` callsite for + Add group button), 215 (`openGroupSheet(g, operationId, farmId)` callsite for Edit), 216 (`openSplitGroupSheet(g, operationId, farmId)` callsite for Split) | Three call sites pass `farmId` as a third arg | **Drop the third arg from all three call sites** |
| `src/features/animals/index.js` | 444 (`function openGroupSheet(existingGroup, operationId, _farmId)`), 592 (`function openSplitGroupSheet(group, operationId, _farmId)`) | Two function signatures with the unused `_farmId` parameter | **Remove the third parameter entirely from both signatures** |
| `src/features/animals/index.js` | 544 (`GroupEntity.create({ operationId, name, color: selectedColor })` inside `openGroupSheet` Save handler), 764 (`GroupEntity.create({ operationId, name, color: newGroupColor })` inside `openSplitGroupSheet` Save handler) | Group create calls — already correctly omit `farmId` after the entity change | **No change to the call shape; the failing validator is what's being removed. Verify both still compile.** |

### Migration + backup pipeline (must change)

| File | What to do |
|---|---|
| `supabase/migrations/032_drop_groups_farm_id.sql` | **Create.** SQL: `ALTER TABLE groups DROP COLUMN farm_id;` followed by `UPDATE operations SET schema_version = 32;`. Apply + verify per CLAUDE.md "Migration Execution Rule" — confirm column gone via `SELECT column_name FROM information_schema.columns WHERE table_name = 'groups' AND column_name = 'farm_id';` (must return zero rows). |
| `src/data/backup-import.js` | Bump `CURRENT_SCHEMA_VERSION` from 31 to **32**. (Previous bumps: OI-0099 → 26, OI-0111 → 27, OI-0117 → 28, OI-0113 → 29, OI-0122 → 30, animal-classes-fix-package → 31. Verify the current value before bumping; this spec assumes 31 is the current ceiling — adjust if a newer migration has landed.) |
| `src/data/backup-migrations.js` | **Add new entry** at the end of the BACKUP_MIGRATIONS chain: `31: (b) => { for (const g of (b.tables?.groups || [])) delete g.farm_id; b.schema_version = 32; return b; }` — strips the column from imports of older backups. Keyed by source schema_version (31), bumps to 32. |
| `src/data/backup-export.js` | No change. CP-55 uses `select('*')` on the live table; once the column is dropped, exports automatically omit it. |

### Test references (must change)

| File | What to do |
|---|---|
| `tests/unit/entities/group.test.js` | **Update.** Remove `farmId` from create/validate/round-trip cases. Add an explicit assertion: `expect(GroupEntity.FIELDS.farmId).toBeUndefined()` to lock the removal. |
| `tests/unit/store/get-visible-groups.test.js` | **Create new file.** Four cases: (1) group with open window on active farm → included; (2) group with open window on a different farm → excluded; (3) group with no open window in "All farms" view (`activeFarmId === null`) → included; (4) group with no open window in per-farm view → excluded. Use store fixtures, no I/O. |
| `tests/unit/data/backup-migrations.test.js` (or wherever the chain is asserted) | **Update.** Extend the chain-length assertion. Add a fixture that includes `tables.groups: [{ id: 'g1', farm_id: 'f1', name: 'X', operation_id: 'op1', color: '#000' }]` at `schema_version = 31` and assert that after the v31→v32 step, the row has no `farm_id` key. |
| `tests/e2e/add-group.spec.js` (if exists; otherwise `tests/e2e/animals.spec.js`) | **Add new e2e case.** Open Animals tab → click "+ Add group" → enter name "Test Group" → pick a color → tap Save group. Assert (a) sheet closes, (b) the group renders in the list, (c) per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": query `supabase.from('groups').select('id, name, operation_id').eq('id', expectedId)` and assert exactly one row, with no `farm_id` key in the response. |
| `tests/e2e/cross-farm-move.spec.js` (if exists; otherwise add a case to the move-wizard e2e) | **Add new e2e case.** Multi-farm operation. Group on Farm 1. Run move wizard → pick a paddock on Farm 2 → save. Switch active farm to Farm 1 → assert group does NOT render on Farm 1's dashboard. Switch to Farm 2 → assert group DOES render on Farm 2's dashboard. (This is the cross-farm-drift bug we're fixing.) |

### Cowork-owned doc updates (NOT in this commit; flagged for follow-up)

| Doc | Section | What to update |
|---|---|---|
| `V2_SCHEMA_DESIGN.md` | §3.3 `groups` | Drop the `farm_id uuid NOT NULL REFERENCES farms(id) ON DELETE CASCADE` row from the column table; drop it from the `CREATE TABLE` block; drop the FK from the `Foreign Keys` line. Add a design-decision note under the table definition: *"`groups.farm_id` was dropped in migration 032 (OI-0133). The group's current farm is derived at read time from `event_group_window → event.farm_id` for the group's most recent open window. Groups with no open window have no current farm — they appear only in the 'All farms' dashboard view until first placed."* Add a Change Log row. |
| `V2_MIGRATION_PLAN.md` | §5.3a | Remove the `groups → farms` FK from the FK-dependency table (groups still depends on `operations`). Add a Change Log row. |

These are noted in the OI body and flagged here so Cowork can land them in a follow-up commit after Claude Code ships the migration. Per CLAUDE.md "Schema-First Development," the doc updates are out of scope for the implementation commit.

---

## Implementation order

Strict order — earlier steps are referenced by later ones, and the migration must apply cleanly before code that depends on the dropped column lands.

1. **Write + apply + verify migration 032.**
   - Create `supabase/migrations/032_drop_groups_farm_id.sql`:
     ```sql
     -- OI-0133: groups.farm_id dropped. Group's current farm is derived at
     -- read time from the latest open event_group_window → event.farm_id.
     ALTER TABLE groups DROP COLUMN farm_id;

     UPDATE operations SET schema_version = 32;
     ```
   - Apply via Supabase MCP (`apply_migration`).
   - Verify: `SELECT column_name FROM information_schema.columns WHERE table_name = 'groups' AND column_name = 'farm_id';` — must return 0 rows.
   - Verify schema_version: `SELECT schema_version FROM operations LIMIT 1;` — must be 32 (or the freshest version after this migration's bump; if a newer migration has already landed, **stop and reconcile** — do not proceed).
   - Report verification result in the commit message.

2. **Update entity `src/entities/group.js`.**
   - Remove `farmId` from `FIELDS` object.
   - Remove `farmId: data.farmId ?? null` from `create()`.
   - Remove `if (!record.farmId) errors.push('farmId is required');` from `validate()`.
   - Remove `farm_id: record.farmId` from `toSupabaseShape()`.
   - Remove `farmId: row.farm_id ?? null` from `fromSupabaseShape()`.
   - Round-trip property still holds: `fromSupabaseShape(toSupabaseShape(record))` returns the original (now without farmId).

3. **Add helper `getGroupCurrentFarm(groupId)` and rewrite `getVisibleGroups()` in `src/data/store.js`.**
   - Helper:
     ```js
     /**
      * OI-0133: Derive a group's current farm from its most recent open
      * event_group_window → event.farm_id. Returns null if the group has
      * no open window (newly created, archived, or between placements).
      *
      * "Most recent open" = window where date_left is null/undefined,
      * sorted by date_joined DESC + time_joined DESC, take first.
      */
     export function getGroupCurrentFarm(groupId) {
       const openWindows = (state.eventGroupWindows || [])
         .filter(w => w.groupId === groupId && !w.dateLeft);
       if (!openWindows.length) return null;
       const latest = openWindows.sort((a, b) => {
         const dateCmp = (b.dateJoined || '').localeCompare(a.dateJoined || '');
         if (dateCmp !== 0) return dateCmp;
         return (b.timeJoined || '').localeCompare(a.timeJoined || '');
       })[0];
       const event = (state.events || []).find(e => e.id === latest.eventId);
       return event?.farmId ?? null;
     }
     ```
   - `getVisibleGroups()` rewrite:
     ```js
     /**
      * OI-0133: Filter groups by the active farm. The group's farm is derived
      * from its most recent open event_group_window — see getGroupCurrentFarm.
      * Groups with no open window have no current farm; they appear in the
      * "All farms" view (activeFarmId === null) and are excluded from
      * per-farm views.
      */
     export function getVisibleGroups() {
       const farmId = getActiveFarmId();
       const all = (state.groups || []).map(r => ({ ...r }));
       if (!farmId) return all;
       return all.filter(g => getGroupCurrentFarm(g.id) === farmId);
     }
     ```
   - Export the new helper alongside `getVisibleGroups`.

4. **Add `BACKUP_MIGRATIONS[31]` and bump `CURRENT_SCHEMA_VERSION` in `src/data/backup-import.js` + `src/data/backup-migrations.js`.**
   - In `backup-migrations.js`, append:
     ```js
     // OI-0133: groups.farm_id dropped in migration 032. Strip the column
     // from imports of older backups so v31-and-earlier exports still
     // import cleanly under the v32 schema.
     31: (b) => {
       for (const g of (b.tables?.groups || [])) delete g.farm_id;
       b.schema_version = 32;
       return b;
     },
     ```
   - In `backup-import.js`, bump `CURRENT_SCHEMA_VERSION` to match the new ceiling (32 if 31 was the prior ceiling — verify before bumping).

5. **Simplify `openGroupSheet` and `openSplitGroupSheet` in `src/features/animals/index.js`.**
   - Drop the third parameter from both function signatures (`_farmId` → gone).
   - Drop the third arg from all three call sites (lines 154, 215, 216).
   - Verify the `GroupEntity.create({ operationId, name, color })` calls at lines 544 + 764 still compile and now succeed under the new entity.
   - **No new UI required.** No farm selector. No single-vs-multi-farm fork. The Add Group sheet renders Name + Color + Animals picker only — exactly what the screenshot Tim shared shows, minus the validation error.

6. **Update tests.**
   - `tests/unit/entities/group.test.js` — remove farmId from cases; add `expect(GroupEntity.FIELDS.farmId).toBeUndefined()` lock.
   - `tests/unit/store/get-visible-groups.test.js` — new file, four cases per the table above.
   - Backup-migrations test — extend chain length assertion + add the v31→v32 strip case.
   - E2E: add the Add Group happy path with Supabase round-trip assertion + the cross-farm-move-removes-from-source-dashboard case.

7. **Grep contract (run before commit; both must return 0 hits).**
   - `grep -rn "groups\.farm_id" src/` — must return 0 (no SQL or fromSupabaseShape references to the dropped column in live code).
   - `grep -rn "g\.farmId\|group\.farmId\b" src/` — must return 0 (no JS reads of the removed entity field). Allowed exceptions only inside the `BACKUP_MIGRATIONS[31]` body itself (which deletes the key) — verify the grep matches that line and nothing else.
   - **If grep returns matches outside the BACKUP_MIGRATIONS rule**, stop — there's a reader you missed. Resolve it before committing.

8. **Run the test suite + commit.**
   - `npx vitest run` — all tests pass.
   - Commit message: `OI-0133: drop groups.farm_id, derive current farm from open window`. Body lists migration 032 applied + verified, BACKUP_MIGRATIONS[31] added, test counts (before → after), grep contract pass.
   - Per CLAUDE.md "OPEN_ITEMS.md Closure Discipline" rule 2: this commit must include a staged edit to `OPEN_ITEMS.md` flipping OI-0133 status to closed (with a verification note citing migration 032 + test pass + grep pass).
   - Per CLAUDE.md "OPEN_ITEMS.md Closure Discipline" rule 3 (downstream-moot sweep): grep `OPEN_ITEMS.md` for `farmId.*group\|group.*farmId` — flip any now-moot OI mentions in the same commit. (Sweep should be empty or near-empty since this is a new design path.)

---

## Acceptance criteria

- [ ] Migration 032 file exists at `supabase/migrations/032_drop_groups_farm_id.sql` with the DROP COLUMN + UPDATE schema_version statements.
- [ ] Migration 032 applied to Supabase; `SELECT column_name FROM information_schema.columns WHERE table_name = 'groups' AND column_name = 'farm_id';` returns 0 rows. Verification noted in the commit message.
- [ ] `src/entities/group.js` has zero references to `farmId` / `farm_id`. All five required exports (`FIELDS`, `create`, `validate`, `toSupabaseShape`, `fromSupabaseShape`) updated. Round-trip test passes.
- [ ] `src/data/store.js` exports `getGroupCurrentFarm(groupId)` per the spec; `getVisibleGroups()` rewritten to filter via the helper; doc comments updated.
- [ ] `BACKUP_MIGRATIONS[31]` strip rule lands; `CURRENT_SCHEMA_VERSION` bumped to match the new schema ceiling.
- [ ] `src/features/animals/index.js`: `openGroupSheet` + `openSplitGroupSheet` signatures lose the third parameter; all three call sites updated. No farmId-related UI added.
- [ ] Grep contract passes (`groups\.farm_id` and `g\.farmId\|group\.farmId\b` both return 0 hits in `src/`, exception allowed only inside the BACKUP_MIGRATIONS rule body).
- [ ] Add Group sheet: open from Animals tab → enter name + color → Save → sheet closes, group renders in the list, no validation error. Supabase row exists, `select('*')` response has no `farm_id` key.
- [ ] Cross-farm move e2e: group placed via move wizard on a destination paddock on a different farm appears on the destination farm's dashboard immediately and disappears from the source farm's dashboard (verifies the drift fix).
- [ ] CP-56 import test: a backup with `schema_version = 31` containing groups with `farm_id` set imports cleanly under the new schema; the `farm_id` key is stripped from each group row before insert.
- [ ] All tests pass (`npx vitest run`); test count delta noted in commit message.
- [ ] `OPEN_ITEMS.md` OI-0133 status flipped to `closed — 2026-04-22 (or commit date)` in the same commit, citing migration 030 + verification + test pass.

---

## Files affected

**New:**
- `supabase/migrations/032_drop_groups_farm_id.sql`
- `tests/unit/store/get-visible-groups.test.js`

**Modified:**
- `src/entities/group.js`
- `src/data/store.js` (helper added + `getVisibleGroups` rewrite)
- `src/data/backup-migrations.js` (+1 entry)
- `src/data/backup-import.js` (CURRENT_SCHEMA_VERSION bump)
- `src/features/animals/index.js` (signatures + call sites)
- `tests/unit/entities/group.test.js`
- `tests/unit/data/backup-migrations.test.js` (or whichever file holds the chain assertion — verify name)
- `tests/e2e/animals.spec.js` (or new `add-group.spec.js`)
- `tests/e2e/cross-farm-move.spec.js` (or extend the move-wizard e2e)
- `OPEN_ITEMS.md` (OI-0133 close-out)

**Cowork follow-up (separate commit, not in this scope):**
- `V2_SCHEMA_DESIGN.md` §3.3
- `V2_MIGRATION_PLAN.md` §5.3a

---

## CP-55 / CP-56 spec impact

Per CLAUDE.md "Export/Import Spec Sync Rule" — explicit impact statement:

- **CP-55 export:** the `groups` table dump no longer carries `farm_id` (column dropped from the live table; `select('*')` automatically omits it).
- **CP-56 import:** old backups (schema_version ≤ 31) carry `farm_id` on group rows. The new `BACKUP_MIGRATIONS[31]` rule strips the key during the migration chain. Backups round-trip cleanly across the version boundary.
- **Schema version bump:** 31 → 32 (verify the prior ceiling before bumping).

---

## Why no UI work for multi-farm

The original triage path considered adding a farm-selector dropdown to the Add Group sheet for multi-farm operations (with auto-default on single-farm). Design Y removes the need entirely — there is no farmId on the entity, so there is nothing to select, default, or display. Group's farm is whatever paddock it lands on via a move. New groups have no farm yet; they appear in the "All farms" dashboard view until first placed. This is the correct behavior on both single-farm and multi-farm operations.

If a future design wants to surface "where does this group currently live?" for multi-farm users, that's a one-line read of `getGroupCurrentFarm(group.id)` rendered as a chip in the group list — separate spec, not blocked by this one.

---

## Related OIs

- **OI-0117** — same class of bug (stored copy of derivable fact); precedent for the drop-and-derive pattern. Migration 028 dropped `events.date_in` / `events.time_in` for the same reason. This OI extends the same discipline to `groups.farm_id`.
- **OI-0094** — the "every state change must do X" invariant pattern that Design X would have inherited. Avoiding this trap was the determining factor for choosing Design Y.
- **OI-0113** — most recent schema-drop migration (029, dropped `event_observations`); precedent for the migration + BACKUP_MIGRATIONS + grep-contract format used here.
- Move-wizard cross-farm flow at `src/features/events/move-wizard.js:682` — already handles the event side correctly. This OI completes the picture by removing the redundant store on the group side.
