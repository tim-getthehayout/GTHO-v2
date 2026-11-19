# OI-0232 — Confirmed-bred date on Edit Animal

**Date:** 2026-11-18 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC (Tim, 2026-11-18 1:35 PM ET, via Orchestrator: "Yes, add a confirmed date").** Not handed to Build for apply. The migration is **file only**; applying it to prod needs **Tim's explicit yes plus a verified backup** (AGENTS.md "Migration Execution Rule").
**Base:** Forgejo `main` `3714d96b`. File:line references below were read on `3714d96b`.
**Related:** OI-0230 (sync durability; the confirmed-bred report that started it), OI-0099 (Confirmed bred checkbox, migration 026), **OI-0234** (May 1 backfill; supersedes Q3), OI-0235 (Animals multi-select filters), OI-0226 PR C / OI-0230 slice E (stale-write guard, which also wants the next migration number), V2_SCHEMA_DESIGN §3.2, V2_UX_FLOWS §15.1, V2_MIGRATION_PLAN §5.

## 1. Why

Tim's v1 request asked for "a confirmed bred flag, with date of confirmation". v2 stores only the flag: `animals.confirmed_bred boolean NOT NULL DEFAULT false` (`supabase/migrations/026_add_confirmed_bred.sql:10`). **Q3 superseded (Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator):** earlier Q3 (wait for the date field, then hand re-enter marks; Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator) is replaced by the one-time May 1 backfill **OI-0234** ([brief](CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md)), with tag 31 / tag 65 / Shenks exceptions. Q1 and Q2 remain locked.

**Today (as built on `3714d96b`):**
- Entity: `confirmedBred` field `src/entities/animal.js:19`; `create()` default `false` `:49`; `toSupabaseShape` `:96`; `fromSupabaseShape` coerces missing to `false` `:127`.
- Edit Animal: checkbox built at `src/features/animals/index.js:1847-1858` (female edit panel, "Confirmed bred" / "Pregnancy check / palpation confirmed"); saved at `:2058` as `inputs.confirmedBred.checked`.
- Calving clears the flag: `src/features/health/calving.js:205`; `src/features/animals/calving-sync.js:72`, `:103`, `:162`.
- Assistant read: `src/features/assistant/farm-reads.js:22-25` (open set = `confirmedBred === false`).
- v1 import: `src/data/v1-migration.js:308-310` (flag only).
- Backup chain: `src/data/backup-migrations.js:69-73` (025 → 026 no-op); compiled ceiling `RELEASED_SCHEMA_VERSION = 45` (`src/data/schema-release.js:4`); column gate `releasedColumns` (`src/data/schema-columns.js`, used at `src/data/store.js:214`, `:256`).
- The weaned toggle already has the same "date appears with the tick" pattern: `src/features/animals/index.js:1786-1812` (on → date defaults to today and is editable; off → visible date input cleared and disabled; Save writes NULL).
- `animal_breeding_records.confirmed_date` exists (V2_SCHEMA_DESIGN §9.7) but drives nothing since OI-0099 reversed A29; prod has 0 breeding records.

## 2. Schema (proposed)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `animals.confirmed_bred_date` | `date` | NULL | Local calendar date the pregnancy was confirmed. NULL = no date known (including every row that is not confirmed bred). |

- Proposed check constraint: `confirmed_bred = true OR confirmed_bred_date IS NULL` (a date only on a confirmed animal). A confirmed animal **may** have a NULL date (marks entered before this column, or "date unknown").
- No backfill: existing rows get NULL. (Prod has 0 `confirmed_bred = true` rows today.)
- Migration: the next free number when Build writes it (OI-0226 PR C has said "046 if free"; whichever is written first takes 046). File only; not applied without Tim's explicit yes plus a verified backup. Schema stamp and compiled ceiling bump only with the apply (V2_MIGRATION_PLAN §5.11a).
- **Why a column on `animals`, not `animal_breeding_records.confirmed_date`:** the stored flag is on `animals` (OI-0099), the form edits `animals`, and Tim asked for a date on the same checkbox. Writing a breeding record per tick would bring back the A29 derivation OI-0099 removed. Design call; Tim can overrule.

## 3. UI requirements (Edit Animal, female edit panel)

1. A date field directly under the "Confirmed bred" checkbox, labelled "Confirmed on", `data-testid="edit-animal-confirmed-bred-date"`, same layout and behaviour pattern as the weaned date (`index.js:1786-1812`).
2. **Ticking** Confirmed bred enables the date and fills it with **today** (local, `getLocalTodayStr()`, OI-0189) if empty. The user can change it (back-dating a preg check).
3. **Unticking** clears the date and disables it, so `confirmed_bred = false` always saves with `confirmed_bred_date = null`. **Locked Q1 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator).** Unticking clears the date, the same way Weaned works. Weaned as built on `d22e004` (`src/features/animals/index.js`, unchanged by PR #82): unticking empties the date input and disables it (`:1808-1811`); the field stays on screen, greyed; Save sends `weanedDate: null` whenever the box is unticked (`:2051-2053`); ticking again with an empty date fills local today (`:1804-1807`), so an untick then re-tick before Save does not bring back the old date. Confirmed bred copies all of that.
4. Opening an animal that is confirmed bred with no date shows the checkbox ticked and the date **empty** (not today): saving without touching it keeps NULL. Only a fresh tick fills today.
5. Validation (inline, blocks Save, same style as the dam/birth-date rule): the date can't be in the future (local today) and can't be before the animal's `birth_date` when one is set.
6. Calving (`calving.js:205`, `calving-sync.js:72`, `:103`, `:162`) clears **both** `confirmedBred` and `confirmedBredDate` in the same update. **Locked Q2 (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator).** The existing flag-clear paths are the places to extend; clearing the new date is not built yet. (V2_SCHEMA_DESIGN §3.2 "Birth clears stored checkbox".)
7. Display: where the animal's confirmed-bred state is shown read-only (if anywhere), show the date when present. No new list column or report in this item.
8. No change to the open-set definition (`farm-reads.js:22-25`): the date is informational.

## 4. Sync and shape mapping

- Entity `src/entities/animal.js`: `confirmedBredDate: { type: 'date', required: false, sbColumn: 'confirmed_bred_date' }`; `create()` default `null`; `toSupabaseShape` sends `confirmed_bred_date`; `fromSupabaseShape` maps `row.confirmed_bred_date ?? null`.
- **Release gate:** until the migration is applied and the ceiling raised, the client must not send `confirmed_bred_date` to a database that lacks it. Use the existing staged-column mechanism (`STAGED_COLUMNS` in `schema-release.js`, `releasedColumns` in `schema-columns.js`), same as 042–045. The UI field stays hidden while the column is unreleased.
- Updates are full-row today (OI-0230 F5), so the date travels with every animal save; with slice E's changed-fields-only updates it travels when it changes. No other sync change.
- Pull/merge: unchanged (`mergeRemote`). Older local rows without the key read as NULL.

## 5. CP-55 / CP-56 impact (AGENTS.md "Export/Import Spec Sync Rule")

**Impacts CP-55/CP-56 spec.**
- CP-55 export serializes `animals.confirmed_bred_date` (V2_MIGRATION_PLAN §5.3 animals row; §5.5 date serialization as `YYYY-MM-DD`).
- CP-56 import reads it. Backups older than the new schema version have no key: the column default (NULL) applies, so the chain step is a **no-op stamp bump** (`backup-migrations.js`, pattern of `:69-73`) that leaves `confirmed_bred_date` absent / NULL.
- A backup whose `confirmed_bred = false` carries a non-null date (hand-edited file) must not fail the restore on the check constraint: the import step sets the date to NULL when the flag is false.
- `schema_version` stamp ticks with the migration (§5.11, §5.11a).
- Round-trip test (§5.12): an animal with flag true + date, flag true + NULL date, and flag false exports and restores unchanged.

## 6. Other imports

- **v1 importer:** no change. Tim, 2026-11-18 1:15 PM ET (via Orchestrator): "leave v1 alone"; the v1 Supabase is not opened. `v1-migration.js:310` keeps mapping the flag only.
- **OI-0222 backfill scripts and the assistant:** no change. The assistant does not write this field.

## 7. Acceptance tests

1. Tick Confirmed bred on a cow: the date fills with local today; Save; the server row has `confirmed_bred = true` and today's date (verify on Supabase, AGENTS.md "E2E Testing").
2. Back-date to a spring date; Save; the server has that date.
3. Untick; Save: server has `false` and NULL (locked Q1).
4. A confirmed animal with a NULL date opens with an empty date; Save without changes keeps NULL.
5. A future date, or a date before the birth date, blocks Save with an inline message.
6. Record a calving for a confirmed dam: flag `false` and date NULL in the same write (normal Calving and calving-sync paths).
7. With the column unreleased (ceiling below the new version), the field is hidden and no request carries `confirmed_bred_date`.
8. CP-55 → CP-56 round trip (§5); an old backup without the key restores with NULL dates.
9. Migration on PGlite: column exists, nullable; the check constraint refuses `false` + a date; existing rows NULL.
10. Two devices (with OI-0230 PR 1 live): A ticks + dates a cow and syncs; B pulls and shows the same date.

## 8. Locked answers (Q1–Q2); Q3 superseded by OI-0234

**Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator** (answers given 3:56–3:57 PM ET):
1. **Q1:** unticking clears the date, just like Weaned (§3.3).
2. **Q2:** recording a calving clears both tick and date (§3.6).
3. **Q3 (superseded):** wait-then-hand-re-enter is replaced by **OI-0234** May 1 backfill (Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator). See [CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md](CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md).
4. **Sequencing (Q6):** OI-0233 permissions fix first, then OI-0226 PR C stale-save guard. This brief does not assign OI-0232 a slot between them or reserve a migration number. Each migration apply still needs Tim's explicit yes plus a verified backup; locking answers is not apply or docs-land approval.
