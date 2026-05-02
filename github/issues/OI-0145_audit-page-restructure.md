# OI-0145 — Audit page restructure: per-paddock-window blocks (data + scoped calcs) + event-level rollup section; DMI-8 daily breakdown lands inside it

**Priority:** P2 (audit page is the diagnosis surface for every calc; until each window's underlying data renders alongside its scoped calcs, the cards are unfalsifiable — DMI-2 shows `headCount=25` without the membership list that derived it, FOR-1 shows `forageHeightCm=8` without the observation row, DMI-8 has no card at all)
**Origin:** Full design + acceptance criteria in `OPEN_ITEMS.md` → OI-0145. This file is a thin pointer per the "specs in base docs, not spec files" project rule.
**Labels:** `feature`, `dev-tools`, `audit`, `calcs`, `v2-build`
**Status:** **DESIGN LOCKED** — 2026-05-02 session, ready for implementation.

## Summary

The OI-0138 Phase 5 audit page (sections 1–7, registry-driven calc cards) is mechanically complete but substantively incomplete. Section 4 dumps entity-typed JSON (every paddock window's row in one block, every group window's row in another, etc.) — there's no way to read "all the data relevant to paddock window G-1" without cross-referencing six dumps by id. Section 5 cards show scalar inputs with source labels but not the underlying collections those scalars derive from (animal memberships, animal weights, paddock observations, batches, feed mass-balance series). DMI-8 has no card at all (deferred at OI-0138 Phase 5 ship time).

This OI restructures the audit page so each paddock window's underlying data renders alongside its scoped calcs in a single block, and event-level rollup calcs (DMI-3, DMI-8, days-on-pasture, cost, NPK-residual) live in a separate Section 5. The full design — block contents, group-window overlap rule, DMI-8 card shape, resolver `scope` field, acceptance criteria — lives in `OPEN_ITEMS.md` → OI-0145.

## What ships

- `src/features/dev-mode/audit.js` — Section 1 header gains a 3-way unit toggle (`Metric` / `Standard` / `Hybrid`, default Metric, persisted to `localStorage['dev-audit-unit-mode']`). Section 4 rewritten as per-paddock-window blocks. Section 4b added for event-level feed records (parent checks index, batches table, orphan feed entries). Section 5 refactored to event-level rollup calc cards only. Sections 2, 3, 6, 7 unchanged.
- `src/features/dev-mode/audit-resolvers.js` — `scope` field added to every resolver entry (`'paddock-window'` for FOR-1, `'group-window'` for DMI-2, `'event'` for DMI-3 and the new DMI-8). `input(...)` helper extended with a `measureType` parameter so unit-bearing inputs route through the new helper at render time. New `resolveDmi8Inputs(ctx)` matching the chip + per-day shape spec'd in OI-0145. Line-16 deferral comment removed.
- `src/features/dev-mode/audit-units.js` — new helper module wrapping `src/utils/units.js`. Exports `getAuditUnitMode`, `setAuditUnitMode`, `formatAuditValue`. Hybrid mode returns `{ primary, secondary }` so renderer can apply muted-grey CSS to the imperial parenthetical.
- New unit tests covering per-window block rendering, DMI-8 resolver across all five statuses, group-window-to-paddock-window date-overlap boundary cases, orphan feed entry detection, all three unit modes round-tripping a known weight + unitless inputs unchanged across modes + toggle persistence.
- `src/i18n/locales/en.json` — new strings for the unit toggle labels, the "Display only — store stays metric" note, plus any block headers / column labels / chip text. All user-facing copy via `t()` per CLAUDE.md.

## Files (anticipated)

- `src/features/dev-mode/audit.js` — major rewrite (Section 1 unit toggle + Section 4 + 4b + 5)
- `src/features/dev-mode/audit-resolvers.js` — extend with `scope` field + `measureType` on `input(...)` + DMI-8 resolver
- `src/features/dev-mode/audit-units.js` — NEW helper module wrapping `src/utils/units.js`
- `src/features/dev-mode/__tests__/audit-resolvers.test.js` (or co-located) — new test cases
- `src/features/dev-mode/__tests__/audit.test.js` (or co-located) — Section 4 block rendering tests
- `src/features/dev-mode/__tests__/audit-units.test.js` (or co-located) — three-mode round-trip tests
- `src/i18n/locales/en.json` — new keys

No schema files. No entity files. No other feature code.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE** — pure audit-page enhancement, no schema or state-shape change, no export/import shape change.

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0145 → "Acceptance criteria" — full list, do not duplicate here. Highlights:

- Resolver `scope` field added; rendering branches by scope.
- 3-way unit toggle (`Metric` / `Standard` / `Hybrid`) in Section 1 header, default Metric, persisted via `localStorage['dev-audit-unit-mode']`.
- New `src/features/dev-mode/audit-units.js` helper exporting `getAuditUnitMode`, `setAuditUnitMode`, `formatAuditValue`. Resolver `input(...)` helper grows a `measureType` field so unit-bearing inputs route through the helper at render time.
- DMI-8 card shows chip row + sources roll-up + auto-expand-on-needs-check daily breakdown table with `pwId(s) open` column citing back to per-window blocks.
- All resolvers call `getCalcByName('<NAME>').fn(...)` — no formula re-implementation. Grep contract: `grep -nE "totalDmiKg.*=.*headCount.*avgWeight|standingDm.*=.*forageHeightCm.*-" src/features/dev-mode/` returns 0 matches.
- No raw `.toFixed(N) + ' kg|cm|ha|lb|in|ac|°[CF]|L|gal'` literals in `src/features/dev-mode/`. Every render of a unit-bearing field flows through `formatAuditValue`.
- Group-window-to-paddock-window date-overlap logic uses inclusive comparison.
- Orphan feed entries (eventId match but locationId doesn't match any paddock window) surface in Section 4b.
- Visual verification on Tim's G-event (`fb407a55-aa0e-4cbb-b906-af6964a0addc`).
- OPEN_ITEMS.md OI-0145 flipped to closed in same commit (orphan-flip rule).
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed with commit hash.

## Project rules to apply

- **CLAUDE.md §"Architecture Audit"** — applicable item 5 (calc registry: every formula via `registerCalc()`, no inline re-implementation in resolvers).
- **CLAUDE.md §"No innerHTML"** — all dynamic content via `el()` / `text()` / `clear()`.
- **CLAUDE.md §"No hardcoded English"** — all user-facing strings via `t()`.
- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **Project rule (saved 2026-05-02):** dev-mode surfaces (`#/dev/*`) are desktop-only — no phone-layout pass needed. Real tables instead of compressed monospace rows; wider blocks if useful.

## Not in scope

- Section 6 DMI bar chart improvements (separate follow-on; today's bar chart already visualizes DMI-8's output).
- Section 7 store↔Supabase live diff implementation (still scaffold only per OI-0138 Phase 5).
- Calc registry expansion for `days-on-pasture`, cost, NPK residual — that's OI-0144. Their resolvers will fill Section 5 slots without OI-0145 needing a re-edit (Section 5 iterates `getAllCalcs()` filtered by `scope === 'event'`).
- `explain()` per-calc refactor — that's OI-0142.

## Checklist for Claude Code

- [ ] Read OPEN_ITEMS.md → OI-0145 in full before starting (the canonical design lives there).
- [ ] Confirm `event_feed_entries.location_id` and `event_feed_check_items.location_id` are present (already verified in design; re-confirm via FIELDS in `src/entities/event-feed-entry.js` and `src/entities/event-feed-check-item.js`).
- [ ] Implement per design.
- [ ] Full test suite green (`npx vitest run`).
- [ ] Manual visual check on Tim's G-event.
- [ ] OPEN_ITEMS.md OI-0145 flipped to closed in the same commit.
- [ ] Piggyback grep for `audit|resolver|calc card` in OPEN_ITEMS.md — flip any siblings made moot.
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
