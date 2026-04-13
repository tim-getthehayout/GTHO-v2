## Session Handoff — 2026-04-13 (Session 13)

**What was done:** OI-0001 (strip grazing) and OI-0002 (unit system) were resolved as design decisions and integrated into the main specs. Two decisions logged: A44 (unit system on operations, same rationale as currency) and A45 (strip grazing via sequential paddock windows on same location). One schema amendment: `operations.unit_system text NOT NULL DEFAULT 'imperial'` with CHECK constraint. Two ready-to-build spec files were placed in `github/issues/`.

**Docs updated:** V2_SCHEMA_DESIGN.md, V2_INFRASTRUCTURE.md, V2_MIGRATION_PLAN.md, V2_BUILD_INDEX.md, OPEN_ITEMS.md, `github/issues/unit-system-operations-migration.md` (new)

---

## OPEN_ITEMS changes

OI-0001 — CLOSED (2026-04-13). Strip grazing design integrated across schema, calc spec, UX flows, and design system. Spec remains at `github/issues/strip-grazing-paddock-windows.md` for Claude Code to implement.

OI-0002 — CLOSED (2026-04-13). Unit system column added to `operations` table per A44. Implementation spec written: `github/issues/unit-system-operations-migration.md`.

(Both changes have already been written into OPEN_ITEMS.md. Just confirm the file matches before committing.)

---

## Work Items (ordered)

### 0. MANDATORY FIRST — Commit and push the design doc changes

Cowork cannot push directly. Before any implementation work, commit the doc changes made in this session:

```bash
cd /Users/timjoseph/Github/GTHO-v2
git status                    # verify the expected files changed
git add GTHO_V2_SCHEMA_DESIGN.md V2_INFRASTRUCTURE.md V2_MIGRATION_PLAN.md V2_BUILD_INDEX.md OPEN_ITEMS.md github/issues/unit-system-operations-migration.md session_briefs/SESSION_BRIEF_2026-04-13_unit-system-strip-grazing-handoff.md
git commit -m "docs: integrate A44 unit system + A45 strip grazing across specs; close OI-0001, OI-0002

- V2_SCHEMA_DESIGN.md: operations.unit_system column (A44)
- V2_INFRASTRUCTURE.md §1.3: unit system storage (A44)
- V2_MIGRATION_PLAN.md §2.8: default 'imperial' for migrated ops
- V2_BUILD_INDEX.md: A44, A45, change log, Current Focus
- OPEN_ITEMS.md: OI-0001 and OI-0002 closed with resolution paths
- github/issues/unit-system-operations-migration.md: new implementation spec

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
git push origin main
```

Also update PROJECT_CHANGELOG.md with one row summarizing this doc-only commit (Cowork doesn't touch the changelog per project rules).

---

### 1. Stale TASKS.md cleanup

Before any new feature work, fix TASKS.md — it still shows CP-11 through CP-23 as unchecked even though they're complete per PROJECT_CHANGELOG.md. Mark all of Phase 3.2 (CP-11 through CP-23) and Phase 3.3 (CP-24 through CP-53) as `[x]`. Also add entries for the new work below so progress is trackable.

---

### 2. Implement unit-system-operations-migration

**Spec:** `github/issues/unit-system-operations-migration.md`

**Why do this first:** It's the smaller of the two and unblocks the settings re-render behavior that affects every unit-sensitive field in the app. It also retires the OI-0002 localStorage workaround cleanly.

Key steps summarized (full detail in the spec):
- SQL migration in `supabase/migrations/` adding `unit_system` column to `operations`
- `src/entities/operation.js` — add `unitSystem` to FIELDS, validate, toSupabaseShape, fromSupabaseShape
- `store.setUnitSystem(value)` action (validate → mutate → persist → queue sync → notify)
- `src/utils/units.js` — `display()` reads from `store.getOperation().unitSystem`; remove localStorage reference
- `src/features/settings/index.js` — rewire the toggle to the store; **ensure the entire settings screen re-renders on toggle** so every unit-sensitive field updates in place (full field list in spec Step 5)
- Onboarding wizard writes `unit_system` when creating the operation
- One-time boot migration: read `localStorage.gtho_v2_unit_system`, write to operation, delete the key
- Round-trip test for the new field

Follow standard CLAUDE.md workflow: SQL migration → entity → store → feature code → test. Update PROJECT_CHANGELOG.md with one row. No deploy gate (this is GTHO-v2, not GTHY v1) but do run `npx vitest run` before committing.

---

### 3. Implement strip-grazing-paddock-windows

**Spec:** `github/issues/strip-grazing-paddock-windows.md`

**Sequencing note:** The schema columns (`is_strip_graze`, `strip_group_id`, `area_pct`) already exist in V2_SCHEMA_DESIGN.md. CP-19 (move wizard) already writes these flags. What remains is the full user workflow: the "Strip graze" toggle in the move wizard, the acre/percentage dual input with auto-derivation, per-strip recovery handling, and the strip progress bar visualization (§3.15) that was deferred.

Consider whether to implement this as a standalone checkpoint before CP-54 (rotation calendar), or bundle it with CP-54 — the rotation calendar needs to show per-strip recovery states anyway, so bundling may be more efficient. Use your judgment based on size and risk.

Full detail in the spec. Note specifically:
- **Units:** Strip size input respects the operation's `unit_system` (A44) — acres in imperial, hectares in metric. Both inputs (area and percentage) are always visible, edit one → auto-derive the other.
- **Calculations:** Stocking density, NPK, and recovery all use effective strip area (`paddock_area × area_pct / 100`). Core formulas NPK-3, FOR-1, REC-1 were already amended for this (V2_CALCULATION_SPEC.md) — verify the code matches.
- **No new tables.** Three columns on `event_paddock_windows` + UI/calc work only.

---

## Context

- Phase 3.3 Assessment is COMPLETE (CP-24 through CP-53). 563 tests passing.
- Phase 3.4 is next. CP-54 is rotation calendar. These two work items can slot in before or around CP-54 depending on how you bundle them.
- The only remaining open item after this session is OI-0008 (location picker recovering section empty — P3, will resolve naturally as survey data populates).
- Continue following CLAUDE.md rules: scoped changes only, root cause fixes, one checkpoint at a time, commit after each.

---

## What's next after this session

After items 0–3 are committed and pushed:

1. **CP-54: Rotation calendar** — Phase 3.4 kickoff. Desktop-only per v1 pattern. Must show per-strip recovery states when strip graze windows exist (ties in with item 3).
2. **CP-55–57:** Export/import, v1 migration tool.
3. **OI-0008:** Location picker recovering section — easy win once survey data flows through.
