# CP-56 — Import — JSON restore

## Summary

Implement v2's operation-scoped JSON backup restore — the partner to CP-55. User selects a `.json` backup file; app validates the envelope, refuses if sync is pending, shows a preview with counts, requires a destructive two-step confirm, auto-downloads a pre-import backup of current state as the revert safety net, migrates the imported backup forward through the registered migration chain if needed, wholesale-replaces every included table for the current operation in FK-dependency order with halt-on-first-failure, re-hydrates the store from Supabase, and runs a parity check against the backup's `counts`.

## Single Source of Truth

All CP-56 acceptance criteria live in the base design docs. Do not duplicate them here.

- **V2_MIGRATION_PLAN.md §5.2** — envelope shape
- **V2_MIGRATION_PLAN.md §5.3** — tables included (domain-grouped for reading)
- **V2_MIGRATION_PLAN.md §5.3a** — **authoritative insert/delete order (FK-dependency)** and two-pass pattern for `animals` and `events`
- **V2_MIGRATION_PLAN.md §5.4** — tables excluded
- **V2_MIGRATION_PLAN.md §5.5** — column serialization rules
- **V2_MIGRATION_PLAN.md §5.7** — import procedure (10 steps, numbered)
- **V2_MIGRATION_PLAN.md §5.7a** — revert mechanism design decision (auto-downloaded pre-import backup)
- **V2_MIGRATION_PLAN.md §5.8** — missing-table / missing-column handling
- **V2_MIGRATION_PLAN.md §5.9** — migration chain registry
- **V2_UX_FLOWS.md §20.3** — Settings → Sync & Data UX entry point
- **CLAUDE.md "Known Traps"** — FK-ordering rule

## Implementation Checklist

Build against §5.7 steps 1–10 in order. Every step is an acceptance criterion. When in doubt about anything, the base doc is the spec — not this file.

- [ ] New module `src/data/backup-import.js` exports `importOperationBackup(file)`. Implements §5.7 steps 1–10.
- [ ] Reuses `src/data/backup-export.js` from CP-55 for the step 4 auto-backup (no duplicated export logic).
- [ ] `src/data/backup-migrations.js` (stubbed in CP-55) — no entries to add yet; verify module still exports `BACKUP_MIGRATIONS = {}`.
- [ ] Table ordering in the import code is read from a single ordered constant whose source comments directly reference §5.3a. If §5.3a is ever changed, this constant changes in the same commit.
- [ ] Two-pass pattern for `animals` and `events` per §5.3a: pass 1 inserts with self-FKs `NULL`; pass 2 `UPDATE`s to set them.
- [ ] Reference tables (§5.3 footnote) `UPSERT` by `id` instead of delete-then-insert.
- [ ] Pre-import auto-backup file named per §5.7 step 4 naming rule. Failure to produce the auto-backup halts the import (§5.7a failure mode).
- [ ] Pending-writes gate + offline gate per §5.7 step 2, matching CP-55's refusal toast wording.
- [ ] Preview sheet per §5.7 step 3 — includes target operation name, export date, exporter email, schema version, counts. Two-step destructive confirm.
- [ ] Progress UI phases match §5.7 step 10 exactly: `Validating` → `Saving current data (auto-backup)` → `Migrating (vN → vM)` → `Replacing data ({table})` → `Refreshing` → `Verifying`.
- [ ] Post-import parity check per §5.7 step 8. On fail, instruct user to import the auto-backup file by name.
- [ ] Logging per §5.7 step 9 (`logger.info` / `logger.error` with category `'backup'`). No `console.*`.
- [ ] Settings wiring per V2_UX_FLOWS.md §20.3 — "Import backup" button in Sync & Data section.
- [ ] Round-trip test in `tests/unit/backup-roundtrip.spec.js`: export seeded state, import the exported file onto a clean state, assert post-import state matches the seed.
- [ ] Validation tests: invalid `format`, newer `format_version`, newer `schema_version`, missing table, extra table, non-nullable missing column — each surfaces the right error and does not write to Supabase.
- [ ] FK-order test: seed a state with child rows before parent rows in the fixture's JSON ordering, export, re-import, confirm all rows land (proves the importer re-orders per §5.3a regardless of input JSON ordering).
- [ ] Auto-backup test: trigger an import, assert a download occurs before any Supabase writes.
- [ ] Playwright e2e in `tests/e2e/backup-import.spec.js`: open Settings → Import → select file → confirm twice → verify state matches post-import and parity check passes.
- [ ] Pre-commit verification per CLAUDE.md "Architecture Audit — Before Every Commit."
- [ ] PROJECT_CHANGELOG.md updated with one row.

## Verification Against §5.3a Before Commit

Before committing, Claude Code must cross-check §5.3a against every `FOREIGN KEY` / `REFERENCES` clause in `supabase/migrations/*.sql`. If any FK points from a table to one that appears later in §5.3a (an "upward" reference), §5.3a is wrong and must be corrected in this commit. Do not adjust the importer to paper over a §5.3a error — fix §5.3a.

## Related

- **CP-55** (Export — JSON backup) — CP-56 reuses the export path for the auto-backup.
- **CP-57** (v1 → v2 migration tool) — will reference §5.3a for its own write-ordering.
- **CP-58** (integration test — migration) — exercises CP-55 + CP-56 as part of the full migration e2e.
- **OI-0021** (closed 2026-04-13) — Transaction strategy decision that informs §5.7 step 6.
- **OI-0022** (closed 2026-04-13) — Revert safety net decision that informs §5.7 step 4 and §5.7a.

## Notes

**Do not invent schema changes.** CP-56 is a pure read-path + write-path implementation against the existing schema. Any schema change needed to support the import must stop and open an OPEN_ITEMS entry per CLAUDE.md "Invention Required — Stop and Flag."

**Base docs are the spec.** This file is a pointer. If there is any conflict between this file and the base docs, the base docs win. Prefer reading §5 end-to-end once before starting rather than relying on this summary.
