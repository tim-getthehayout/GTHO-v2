# CP-57 — v1 → v2 Migration Tool

## Summary

Implement the one-time v1 → v2 data migration tool. Reads a v1 JSON export (`S` object from `exportDataJSON()`), applies all 24 transform sections, synthesizes a v2 backup envelope, and feeds it into the CP-56 import pipeline for the actual write.

## Single Source of Truth

All CP-57 transform rules and architecture live in the base design docs. Do not duplicate them here.

- **V2_MIGRATION_PLAN.md §1.2** — transform step overview (ID remap, unit convert, schema map, table split, JSONB extract)
- **V2_MIGRATION_PLAN.md §1.3** — validation rules (FK resolution, required fields, type checks, orphan/duplicate detection)
- **V2_MIGRATION_PLAN.md §1.4** — audit report (record counts, NPK parity check, unparseable dose CSV)
- **V2_MIGRATION_PLAN.md §1.5** — v1 export shape (26 arrays, settings sub-fields — authoritative input)
- **V2_MIGRATION_PLAN.md §1.6** — CP-57 architecture (reuses CP-56 import pipeline, skips auto-backup when target empty)
- **V2_MIGRATION_PLAN.md §1.7** — tool UX (Settings → Import, alongside CP-56)
- **V2_MIGRATION_PLAN.md §2.1–§2.25** — all 25 transform sections (pastures→locations through npk_price_history)
- **V2_MIGRATION_PLAN.md §5.2** — v2 backup envelope shape (synthesized output target)
- **V2_MIGRATION_PLAN.md §5.3a** — FK-dependency ordering (used by CP-56 pipeline)

## Acceptance Criteria

1. **Read v1 JSON export** — file upload in Settings → Import, alongside CP-56's "Import backup" button. Detects v1 format (flat JSON with `pastures`, `events`, `herd`, `settings` keys — no `format` field).
2. **Apply all 25 transform sections** per §2.1–§2.25 — ID remapping (all IDs → `crypto.randomUUID()` with v1→v2 map for FK resolution), imperial→metric unit conversions, field name normalization, table splits (health events 5-way), JSONB extraction.
3. **Synthesize a v2 backup envelope** per §1.6 — same shape as CP-55 §5.2 — and feed into the CP-56 `importOperationBackup()` pipeline.
4. **Skip auto-backup step** when the target operation is empty (§1.6 — nothing to back up on first migration).
5. **`schema_version`** stamped to current build version (§2.8).
6. **Animal notes** routed to `animal_notes` table (§2.7 rewrite — type='note' health events → `animal_notes` rows).
7. **NPK parity check** — for events with v1 `npkLedger` data, compare v1 stored NPK vs v2 computed values, flag >1% deltas in audit report (§1.4, §2.23).
8. **Unparseable dose audit** — treatment dose parse failures → downloaded CSV with columns: animal tag, date, raw dose text, treatment type (§1.4, §2.7).
9. **Re-run allowed** — user can retry after failure. Since CP-56 does wholesale replace, re-running replaces whatever's there (§1.7).
10. **Preview screen before commit** — shows transform summary (record counts per table, any warnings) before proceeding to CP-56 pipeline.

## Implementation Checklist

- [ ] New module `src/data/v1-migration.js` — 25 transform functions, ID map, envelope synthesis.
- [ ] New module `src/features/settings/v1-import.js` — UI (file upload, preview, progress, audit results).
- [ ] Settings screen wired: "Import from v1" button in Sync & Data section per §1.7.
- [ ] Dose parser: regex extracts number → `dose_amount`, unit string → match to `dose_units` row. Unparseable → notes field + CSV audit.
- [ ] All migrated IDs use `crypto.randomUUID()` with v1→v2 ID map for FK resolution.
- [ ] Imperial → metric conversions: lbs→kg (×0.453592), acres→ha (×0.404686), inches→cm (×2.54), lbs/acre→kg/ha (×1.12085), $/lb→$/kg (÷0.453592).
- [ ] Unit tests for each transform function.
- [ ] No `console.*` — use `logger` from `src/utils/logger.js`.
- [ ] No `innerHTML` — DOM builder only.
- [ ] All user-facing strings through `t()`.
- [ ] PROJECT_CHANGELOG.md updated.

## Labels

`phase-3.4`, `feature`

## Related

- **CP-55** (Export) — envelope format target.
- **CP-56** (Import) — write pipeline reused by CP-57.
- **OI-0036** — post-cutover cleanup (remove "Import from v1" button).
- **V2_BUILD_INDEX.md** — CP-57 row in Phase 3.4 Advanced.
