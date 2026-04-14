# CP-55 — Export — JSON backup

## Summary

Implement v2's operation-scoped JSON backup export. Downloads a single `.json` file containing every table needed to reconstitute an operation (51 tables minus `operation_members`, `app_logs`, `release_notes`). File is stamped with `schema_version` and `format_version` so CP-56 can validate and migrate on import.

Authoritative format definition: **V2_MIGRATION_PLAN.md §5** (read this first — it is the spec). UX entry point: V2_UX_FLOWS.md §20.3. Per-schema-change sync rule: `CLAUDE.md` → "Export/Import Spec Sync Rule."

## Acceptance Criteria

- [ ] Migration `supabase/migrations/015_schema_version_stamp.sql` adds `operations.schema_version INTEGER NOT NULL DEFAULT 14` and backfills existing rows to `14`.
- [ ] Entity update: `src/entities/operation.js` `FIELDS` includes `schemaVersion` with `sbColumn: 'schema_version'`. `toSupabaseShape` / `fromSupabaseShape` round-trip updated. Unit test for round-trip added to `tests/unit/entities/operation.spec.js`.
- [ ] New module `src/data/backup-export.js` exports `exportOperationBackup(operationId)` → returns the envelope described in V2_MIGRATION_PLAN.md §5.2.
- [ ] New module `src/data/backup-migrations.js` exports `BACKUP_MIGRATIONS` — initially an empty object. Module-level comment references V2_MIGRATION_PLAN.md §5.9 migration chain contract.
- [ ] Export reads from Supabase (not local store) per §5.6.3. Pagination at 1000 rows per table for the large tables (`events`, `event_paddock_windows`, `event_group_windows`, `event_feed_entries`, `event_feed_checks`, `event_feed_check_items`, `paddock_observations`, `animal_weight_records`, `animal_treatments`, `animal_bcs_scores`, `animal_heat_records`).
- [ ] Envelope built per §5.2: `format`, `format_version` = 1, `schema_version`, `exported_at` (ISO UTC), `exported_by` { user_id, email }, `operation_id`, `build_stamp` (from `<meta name="app-version">`), `counts` { farms, events, animals, batches, todos }, `tables` { ... }.
- [ ] Tables included: exactly the list in V2_MIGRATION_PLAN.md §5.3. Tables excluded: `operation_members`, `app_logs`, `release_notes`.
- [ ] Column serialization follows §5.5 rules (lowercase UUIDs, ISO 8601 Z timestamps, `YYYY-MM-DD` dates, JSON-native numbers / booleans, nested JSONB, `null` for null columns).
- [ ] All values remain metric (V2_INFRASTRUCTURE.md §1.1). No unit conversion on export.
- [ ] Export refuses when the sync queue has pending writes or the app is offline. User-facing toast: "Sync pending — retry when sync completes." Covered by the §5.6.1 online check.
- [ ] Download trigger via hidden `<a download>` with the §5.2 file name. File downloads as `application/json`, UTF-8, 2-space pretty-printed, `\n` line endings.
- [ ] Progress sheet ("Exporting… NN%") mounts during export. Yields between tables via `setTimeout` so the main thread stays responsive on operations with >10k total rows.
- [ ] Export records an info-level log via `logger.info('backup', 'export complete', { operation_id, row_count, file_bytes })`. No `console.*`.
- [ ] Settings screen wiring per V2_UX_FLOWS.md §20.3: "Export backup" button in the Sync & Data section. Tap opens the confirm sheet, confirm triggers export, progress sheet replaces confirm. Offline shows the gated toast instead.
- [ ] Round-trip test in `tests/unit/backup-roundtrip.spec.js`: build seeded state at `schema_version = 14`, call `exportOperationBackup`, assert every included table, every column, every row present and byte-equal to the expected envelope (fixture at `tests/fixtures/backup-v14.json`).
- [ ] Playwright e2e in `tests/e2e/backup-export.spec.js`: open settings → Export backup → confirm → verify a file downloads with the §5.2 naming convention and parses as valid JSON with `format === "gtho-v2-backup"`.
- [ ] PROJECT_CHANGELOG.md updated with one row for this CP.

## Test Plan

- [ ] Run `npx vitest run` — all unit tests pass, including new entity round-trip and new backup round-trip spec.
- [ ] Run `npx playwright test tests/e2e/backup-export.spec.js` — export flow end-to-end passes.
- [ ] Manual: export a seeded dev operation, open the JSON in an editor, confirm envelope shape matches §5.2 and includes every table from §5.3.
- [ ] Manual: disable sync (devtools offline), try to export — confirms refusal toast shows and no download occurs.
- [ ] Manual: queue a mutation (create an event, don't let it sync yet), try to export — confirms refusal toast shows.
- [ ] Manual: confirm file name matches `gtho-v2-backup__{slug}__{date}__schema-v14.json` for a seeded operation.

## Related OIs

- None directly. Blocks CP-56 (import) and CP-57 (v1→v2 migration tool).

## Notes

**Do not invent schema changes.** If any acceptance criterion appears to require a schema change not listed in V2_SCHEMA_DESIGN.md (other than migration 015 for `schema_version`), stop and open an OPEN_ITEMS entry per CLAUDE.md "Invention Required — Stop and Flag."

**Export/Import Spec Sync Rule.** This CP establishes the initial backup format at `schema_version = 14`. From this point forward, any schema or state-shape change must update V2_MIGRATION_PLAN.md §5 (tables list, serialization rules, migration chain) in the same commit as the schema change. The round-trip test at `tests/unit/backup-roundtrip.spec.js` is the canary — a schema change that skips §5 will fail the test.

**CP-56 not in scope here.** CP-56 is specified in V2_MIGRATION_PLAN.md §5.7–§5.9 for single-source reference, but will be picked up as its own checkpoint with its own spec file. Do not implement import during CP-55.

**Architecture audit before commit.** Per CLAUDE.md "Architecture Audit — Before Every Commit," verify: operation entity round-trips `schemaVersion`; migration SQL column type matches `FIELDS` type; export envelope's `schema_version` reads from `operations.schema_version`, not a hardcoded constant; no innerHTML in progress sheet; all user-facing strings go through `t()`.
