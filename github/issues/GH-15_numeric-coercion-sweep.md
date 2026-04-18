# Sweep: coerce PostgREST stringified numerics across every entity

## Summary

Full-codebase structural follow-up to the OI-0103 hotfix (`d55ba9b`). PostgREST returns PostgreSQL `numeric`/`decimal` columns as JavaScript **strings**, not numbers. Every `fromSupabaseShape(row)` in `src/entities/` that passes `row.some_numeric_column` through untouched writes a string into in-memory state, producing four distinct classes of silent harm downstream (math string-concatenation, `.toFixed()` crashes, strict `typeof` validator rejects, lex comparisons on thresholds).

`d55ba9b` fixed three surfaces scope-limited to the feed-check save path (`event-feed-entry.js`, `event-feed-check-item.js`, `feed/check.js` sum). This sweep applies the same `Number(...)` coercion pattern across the remaining 23 entities with numeric columns (94 fields total) plus defense-in-depth wraps at the handful of known aggregation hotspots, and adds round-trip tests that exercise the `mergeRemote` path (not just the `add()` path the current test suite covers).

Full spec — including the 3-tier priority table, the authoritative entity list, the critical-issue class breakdown, and the acceptance-criteria checklist — lives in `OPEN_ITEMS.md` **OI-0106**. This file is a thin pointer; please read OI-0106 as the source of truth before starting implementation.

## Acceptance Criteria

See **OI-0106** in `OPEN_ITEMS.md` for the full 8-item list. Top-line:

- [ ] Every entity with a numeric/integer field in `FIELDS` coerces via `Number(row.col)` in `fromSupabaseShape` (pattern: `someField: row.some_col != null ? Number(row.some_col) : null`)
- [ ] Round-trip unit test per entity in Tier 1 + Tier 2 proving stringified input → `typeof 'number'` output on every field
- [ ] Integration test for `mergeRemote` path on `batch.js` (the one Tim just got burned by)
- [ ] Defensive `Number(x) || 0` wraps at aggregation hotspots in `dashboard/index.js`, `reports/index.js`, `feed/index.js`, and `src/calcs/*.js`
- [ ] CP-56 file-upload backup-import path audited: confirm the re-pull coerces or add explicit coercion
- [ ] 961 → ≥970 tests pass (rough floor — expect ~1000 with new round-trip tests)
- [ ] Commit message names the class-of-bug "PostgREST-stringified-numeric" and references `d55ba9b` + OI-0103
- [ ] New entry added to CLAUDE.md "Known Traps" with the `event-observation.js` reference pattern

## Test Plan

- [ ] Per-entity round-trip unit tests — one `fromSupabaseShape.test.js` per entity in Tier 1 + Tier 2 feeding stringified rows through and asserting `typeof` on every numeric field
- [ ] `mergeRemote` integration test for `batch.js` — seed a stringified row via `mergeRemote('batches', [stringRow])`, open the feed-check sheet for an event using that batch, verify render doesn't throw and `totalDelivered` is a number
- [ ] Dashboard threshold lex-comparison regression test — seed `farm_settings` with stringified thresholds and `event_group_windows` with stringified `avgWeightKg`, render the dashboard, assert the badge colour matches the numeric comparison (not the lex one)
- [ ] CP-56 file-upload round-trip — import a backup JSON whose `batches[].quantity` is a string, assert post-import in-memory store has `typeof === 'number'`
- [ ] Full `npx vitest run` + full `npx playwright test` must pass

## Related OIs

- **OI-0103** — the feed-check save bug whose two-layer fix surfaced this class. Closed (see status lines for `38925be` + `d55ba9b`).
- **OI-0106** — this sweep (full spec).
- **OI-0050** — prior instance of the same silent-data-loss class (missing sync params). Same family — worth cross-linking in the CLAUDE.md Known Traps entry.

## Notes

**Critical issue classes the sweep must address (prioritised by class-of-harm, not tier):**

1. **`typeof === 'number'` validators (silent rejects):** `batch.js`, `batch-adjustment.js`, `event-group-window.js`, `event-feed-entry.js`, `event-feed-check-item.js`, `harvest-event-field.js`, `animal-bcs-score.js`. Validate returns `{ valid: false }` instead of throwing, so `add()`/`update()` silently throw downstream and click handlers exit without user-visible error.

2. **`.toFixed()` call sites (hard crashes):** 21 feature files call `.toFixed()`. After the entity fix these are safe; targeted render tests for the highest-traffic surfaces (`dashboard`, `feed/check`, `event detail`) guard against regression.

3. **Threshold lex comparisons (quiet wrongness):** `farm-setting.js` thresholds flow into `dashboard/index.js` badge logic. `"100" > "50"` is `false` lexicographically. Dashboard badges may render wrong colour silently.

4. **Divide-by-string → NaN (silent zeroes/blanks):** `areaHectares` in `location.js`, `quantity`/`weightPerUnitKg` in `batch.js`. Division cascades NaN through every downstream calc.

5. **Chart axis / aggregation anomalies:** `dmi-chart.js`, `reports/index.js`, `rotation-calendar/sidebar.js`. `d3.extent(records, r => r.quantity)` over string quantities picks lex extremes.

6. **Calc-registry inputs:** every `registerCalc()` formula reads entity-shaped records. After the entity fix they're safe; confirm by grep that no calc uses `parseFloat`/`parseInt` today (which would mask the issue and defeat the coercion).

**Fix pattern (match `event-observation.js` as the reference):**

```js
// In fromSupabaseShape(row):
someField: row.some_column != null ? Number(row.some_column) : null,
```

Null-safe. Default to `null` (not `0`) when the column is null so `validate()` still catches "required" failures correctly. Keep `create()` defaults unchanged — coercion happens only on the inbound-pull path.

**Tier summary (full table in OI-0106):**

- **Tier 1 (P0):** `batch.js`, `event-group-window.js`, `animal-weight-record.js`, `farm-setting.js` (16 remaining cols), `location.js`, `animal-class.js` — dashboard, feed, DMI paths. Highest blast radius.
- **Tier 2 (P1):** 9 entities covering strip-graze, surveys, forage/feed types, nutritional profiles, harvest, BCS, batch adjustments.
- **Tier 3 (P2):** 10 entities covering soil tests, manure, input products, amendments, NPK prices, spreaders, treatments, farm geo.

**Scope-limiting note from Claude Code's hotfix writeup:** "Worth flagging as a separate OI for a sweep across all numeric entity reads — grep for numeric sbColumn types in entities without `Number(...)` wrappers. I'll leave the sweep out of this hotfix unless you want it now." That sweep is this issue.

**CP-55/CP-56 impact:** none on the backup-JSON wire format; post-import in-memory state is what changes (it gets *better*, not worse).

- **CP-55 (export)** reads raw PostgREST rows directly (`backup-export.js:188` writes `supabase.from(table).select('*')` output straight into `tables[tableName]`). PostgREST returns `numeric` columns as strings, so **every backup JSON — old and new — contains stringified numerics**. OI-0106 is a pull-side coercion fix; CP-55 output is byte-identical before and after the sweep for the same Supabase data.
- **CP-56 (import)** inserts JSON rows into Supabase (PostgreSQL silently accepts strings for `numeric` columns) and then re-pulls via `pullAllRemote()` (`backup-import.js:402`), which routes through `fromSupabaseShape`. *Before OI-0106*: post-import in-memory state has stringified numerics — same trap as a normal pull. *After OI-0106*: post-import in-memory state is guaranteed numeric.
- **`BACKUP_MIGRATIONS` chain** is all structural (add table / column / enum rewrite); no arithmetic on numeric fields → unaffected.
- **`tests/unit/backup-roundtrip.test.js`** — already modified on the working tree for OI-0099 Class B4. After OI-0106 lands, some fields flip from string → number on the post-import side. Re-verify the assertion shape (prefer positive `typeof === 'number'` checks) and add a fixture case with stringified numerics in the backup JSON to prove the round-trip normalises to numbers in memory.

**Spec-sync rule:** wire format + schema_version + column list all unchanged → no CP-55/CP-56 spec update needed by the letter of the CLAUDE.md rule. Flagged here anyway so a future dev sees the reasoning.

**Schema change:** none.
