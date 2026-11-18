# DOCS_MAP — code area → base-doc sections

**Owner:** GTHO Design (OI-0231). **Built from:** the `src/`, `supabase/`, `scripts/` and `.github/` tree on Forgejo `main` `b4cb9335`, 2026-11-18.
**Use:** a PR that changes a file under a mapped area either updates the listed doc section(s) or says in its description `Docs unaffected because …` (the rule is in `AGENTS.md` → "Docs map rule"). The most specific row wins; a file in several rows owes all of them. A new top-level area or feature folder needs a row here in the same PR.
**Upkeep:** GTHO Design re-checks this map in the monthly docs drift check (OI-0231) and adds rows when the tree changes. Briefs listed are the current specs that extend a base section until their content is folded in.

Abbreviations: **ARCH** = `V2_APP_ARCHITECTURE.md`, **INFRA** = `V2_INFRASTRUCTURE.md`, **UX** = `V2_UX_FLOWS.md`, **DS** = `V2_DESIGN_SYSTEM.md`, **CALC** = `V2_CALCULATION_SPEC.md`, **SCHEMA** = `V2_SCHEMA_DESIGN.md`, **MIG** = `V2_MIGRATION_PLAN.md`.

## Data and sync layer

| Code area | Docs | Briefs |
|---|---|---|
| `src/data/store.js` (actions, `persistMutation`, durable writes, `mergeRemote`, window splits, snapshot) | ARCH §4.1–§4.6; ARCH §5.2 (conflicts, pull merge) | `SYNC_DURABILITY_2026-11-18.md` (OI-0230), `WINDOW_INTEGRITY_2026-11-17.md` (OI-0226) |
| `src/data/custom-sync.js`, `sync-adapter.js`, `write-order.js` | ARCH §5.1, §5.2, §5.4; INFRA §3.5, §9 | `SYNC_DURABILITY_2026-11-18.md`, `WINDOW_INTEGRITY_2026-11-17.md` §3 (b), §7 |
| `src/data/local-storage.js` (entity cache, write journal, receipts) | ARCH §4.2 (durable writes), §5.2 | `SYNC_DURABILITY_2026-11-18.md` §4 A |
| `src/data/push-all.js` ("Resync to server") | ARCH §5.2 "Resync to server"; UX §20.3, §20.5; DS §4.7 | `SYNC_DURABILITY_2026-11-18.md` §4 D |
| `src/data/pull-remote.js`, `sync-registry.js` | ARCH §4.6, §5.2 (pull errors); INFRA §9 | `SYNC_DURABILITY_2026-11-18.md` §4 (slice C) |
| `src/data/log-flush.js`, `src/utils/logger.js` | INFRA §3.1–§3.5 | — |
| `src/data/supabase-client.js`, `src/features/auth/` | INFRA §5.1a, §5.2, §7.2 | `SESSION_BRIEF_2026-11-07_custom-domain-login-diagnosis.md` |
| `src/data/backup-export.js`, `backup-import.js`, `backup-migrations.js`, `unit-backup.js`, `unit-restore-payload.js` | ARCH §5.5; MIG §5 (§5.2–§5.14); AGENTS.md "Export/Import Spec Sync Rule" | — |
| `src/data/v1-migration.js` | MIG §1, §2; UX §20.3 (Migrate from v1) | — |
| `src/data/schema-columns.js`, `schema-release.js` | MIG §5.11, §5.11a; SCHEMA (released ceiling notes) | `HAY_FEEDING_BACKFILL_BUILD_LOCK_2026-11-17.md` |
| `src/data/unit-references.js`, `src/utils/unit-standards.js`, `src/utils/units.js`, `src/utils/feed-units.js` | INFRA §1; CALC §4.10 (UNT-1, UNT-2); MIG §5.7b | `FEED_UNIT_CLEANUP_PROPOSAL_2026-11-16.md` |
| `src/data/current-placement.js` | ARCH §4.6 | — |
| `src/data/one-time-fixes.js` | the OI named in each fix | — |
| `src/entities/*.js` | ARCH §3.1 (entity contract); SCHEMA (the entity's domain); MIG §5.3 (backup tables) | — |

## Calculations

| Code area | Docs |
|---|---|
| `src/utils/calc-registry.js` | CALC §1, §2, §3 |
| `src/calcs/core.js` | CALC ANI-1–ANI-3, NPK-1, NPK-3, TIM-1–TIM-3, UNT-1 |
| `src/calcs/advanced.js` | CALC CST-3, NPK-2, NPK-4, REC-1, SUR-1, UNT-2 |
| `src/calcs/feed-forage.js` | CALC DMI-1–DMI-8, FED-1–FED-5, FOR-1–FOR-6, CST-1, CST-2 |
| `src/calcs/feed-run-rate.js` | CALC FED-6, DMI-9; brief `FEED_RUN_RATE_PROPOSAL_2026-11-17.md`, `IMPLIED_PASTURE_DMI_2026-11-17.md` |
| `src/calcs/feed-check-plausibility.js` | CALC FED-7; brief `FEED_CHECK_PLAUSIBILITY_2026-11-17.md` |
| `src/calcs/feed-pools.js`, `feed-state.js`, `event-feed-days.js` | CALC §4.2 (DMI-5 elapsed-hours split, DMI-8), §4.6; ARCH §4.6 (`getLiveRemainingForMove`) |
| `src/calcs/capacity.js` | CALC CAP-1 |
| `src/calcs/budget-period.js`, `src/features/feed/budget-period-store.js` | brief `STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md` (OI-0221) |
| `src/calcs/window-helpers.js` | ARCH §4.4, §4.4b |
| `src/calcs/location-type.js`, `survey-bale-ring.js` | CALC §4.9 (SUR-2); UX §7.4 |

## Features (`src/features/`)

| Code area | Docs | Briefs |
|---|---|---|
| `animals/` (incl. Edit Animal, group weights, `calving-sync.js`) | UX §3.3, §14, §15.0–§15.2; DS §4.2; SCHEMA Domain 3, 9 | `FORM_ENTRY_AUDIT_2026-11-10.md`, `SESSION_BRIEF_2026-11-06_composite-bulk-animals.md` |
| `health/` | UX §14.1–§14.10; DS §7.4–§7.6; SCHEMA Domain 9 | `FORM_ENTRY_AUDIT_2026-11-10.md` |
| `events/` (move wizard, close, sub-move, retro-place, edits, rotation calendar, list view) | UX §1, §2, §3, §6, §9, §11, §17.15, §17.15.1, §19; ARCH §4.4, §4.4b, §4.5; DS §4.3 | `WINDOW_INTEGRITY_2026-11-17.md` |
| `feed/` (delivery, feed check, pools, batches, transfers) | UX §4, §5, §6, §12, §13; DS §4.5; CALC §4.6 | `FEED_CHECK_PLAUSIBILITY_2026-11-17.md`, feed-batch and feed-day-goal briefs (2026-11-03/04) |
| `locations/` | UX §15.3; DS §4.4; SCHEMA Domain 2 | `SESSION_BRIEF_2026-10-04_OI-0102-multi-paddock-open.md` |
| `map/` | UX §17.7; SCHEMA Domain 2 (geometry) | `SESSION_BRIEF_2026-10-04_farm-map-geometry.md`, `SESSION_BRIEF_2026-11-04_feed-batch-pasture-map.md` |
| `observations/`, `surveys/` | UX §7; DS §3.16; SCHEMA Domain 6 | — |
| `amendments/` | UX §8; SCHEMA Domain 8 | — |
| `harvest/` | UX §10; SCHEMA Domain 7 | — |
| `dashboard/` | UX §17.1–§17.8, §17.12, §17.13; DS §4.1, §3.13; ARCH §7.2 | — |
| `todos/` | UX §17.8–§17.11 | — |
| `reports/` | ARCH §7.1; DS §4.6; CALC §2 (reference console) | — |
| `field-mode/` | UX §16; DS §7.2, §7.3 | — |
| `settings/` | UX §20; DS §4.7; ARCH §5.5 | `SYNC_DURABILITY_2026-11-18.md` §4 D (Resync) |
| `onboarding/` | INFRA §5.1a; ARCH §5.2 (insert vs upsert, OI-0054) | — |
| `auth/` | INFRA §5.2 | `SESSION_BRIEF_2026-11-07_custom-domain-login-diagnosis.md` |
| `feedback/` | INFRA §4; UX §21 | — |
| `assistant/` (client, server, entities, entry review) | INFRA §8; ARCH §4.2 (durable writes) | `SESSION_BRIEF_2026-11-08_oi-0195-voice-ai-foundation.md`, `SESSION_BRIEF_2026-11-10_oi-0211-voice-start.md` |
| `dev-mode/` | INFRA §3.6 (dev log viewer) | `SESSION_BRIEF_2026-05-01_oi0138-dev-mode-event-audit.md` |

## App shell, UI and platform

| Code area | Docs |
|---|---|
| `src/main.js` (boot, routes, sync triggers) | ARCH §6.3, §5.2 (flush triggers) |
| `src/ui/header.js` (sync indicator, user menu, build stamp) | UX §17.2; DS §3.14; INFRA §9 |
| `src/ui/dom.js`, `sheet.js`, `router.js`, `toast.js` | ARCH §6.1–§6.4; DS §3 |
| `src/ui/dmi-chart.js`, `explicit-observation-time.js`, `build-stamp.js` | CALC §4.2 (charts); AGENTS.md "Delivery gate" (build stamp) |
| `src/styles/main.css` | DS §1, §2, §3, §5.4 |
| `src/i18n/` | INFRA §2; DS §5.3 |
| `src/pwa/` | INFRA §7.3; brief `SESSION_BRIEF_2026-10-04_pwa-update-prompt.md` |
| `src/utils/date-*.js`, `preferences.js`, `validators.js`, `form-values.js`, `geo*.js` | ARCH §1.4, §3; brief `SESSION_BRIEF_2026-11-08_oi-0189-local-today.md` (dates) |
| `src/platform/` | INFRA §7.2 |

## Database, scripts and CI

| Code area | Docs |
|---|---|
| `supabase/migrations/` | SCHEMA (the table's domain); MIG §5.3, §5.8, §5.9, §5.11a; INFRA §5.1 (RLS); AGENTS.md "Migration Execution Rule" |
| `supabase/functions/` | INFRA §8 |
| `scripts/` | the OI or brief that owns the script (e.g. `oi-0222-backfill.mjs` → `HAY_FEEDING_BACKFILL_BUILD_LOCK_2026-11-17.md`) |
| `.github/workflows/`, `.githooks/` | INFRA §6.3; AGENTS.md "Git Workflow" |
| `tests/` only (no `src/` change) | Docs unaffected unless the PR changes what a doc says is tested (ARCH §5.4) |
