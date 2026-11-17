# OI-0222 — Build lock (migration 045 + backfill script)

**Date:** 2026-11-17 | **Owner:** GTHO Design | **For:** GTHO Build | **Plan:** [HAY_FEEDING_BACKFILL_PLAN_2026-11-16.md](HAY_FEEDING_BACKFILL_PLAN_2026-11-16.md)
**Status:** APPROVED (Tim, 2026-11-17 6:29 AM ET, via Orchestrator: "Ok all set to go on run rate and backfill. Backup the database before backfill database changes and backfill"). The approval holds only if the database is backed up first. W and X are defaults adopted (Orchestrator 6:20 AM; Tim has not objected). Shenk Cows confirmed (Tim, 6:40 AM ET, via Orchestrator), so the 79-head basis stands. Target numbers are the 17c report (`/workspace/gtho-backfill/dry-run-2026-11-17c/REPORT.md`, sha256 `db1717e29428325762546e76fbd24846a0fd5e9e9329ade4372fabcc01468191`). Orchestrator confirms each production step separately.

## 1. Tables (migration `045_historical_feed_basis.sql`)

Conventions follow 037/043/044. The file is wrapped in `BEGIN;`/`COMMIT;`. Every table gets `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`, `operation_id uuid NOT NULL REFERENCES operations(id)`, and `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`. Every FK column gets an index. Numeric CHECKs use the `< 'Infinity'::numeric` pattern. RLS is enabled with four policies per table, `TO authenticated`, using the 044 member predicate (`operation_id IN (SELECT operation_id FROM public.operation_members WHERE user_id = (SELECT auth.uid()) AND accepted_at IS NOT NULL)`). INSERT uses that same predicate, not the legacy `WITH CHECK (true)`. The last statement is `UPDATE public.operations SET schema_version = 45 WHERE schema_version < 45;`. The header reads "WRITTEN ONLY / NOT APPLIED", as 044's does. Rows are never deleted by the app.

**`historical_feedings`** stores one row per historical feeding: the Oct 1 – Mar 3 winter lane, 89 rows. It has no inventory effect.

| Column | Type / rule |
|---|---|
| id, operation_id, created_at, updated_at | as above |
| farm_id | `uuid REFERENCES farms(id) ON DELETE SET NULL` (nullable; script sets the operation's farm) |
| date | `date NOT NULL` |
| quantity | `numeric NOT NULL CHECK (quantity > 0 AND quantity < 'Infinity'::numeric)` |
| unit_snapshot | `text NOT NULL CHECK (length(btrim(unit_snapshot)) > 0)` (canonical FEED_UNITS value: `bale` or `sq bale`) |
| weight_per_unit_kg_snapshot | `numeric NOT NULL CHECK (> 0 AND < 'Infinity')` |
| dm_pct_snapshot | `numeric NOT NULL CHECK (> 0 AND <= 100)` |
| feed_type_id | `uuid REFERENCES feed_types(id) ON DELETE SET NULL` (nullable for later manual rows; the backfill sets it on every row — the 54 notes rows with no written type get Round bale- Grass, decision 3) |
| feed_type_label | `text` (snapshot of the type name at write time, e.g. `Round bale- Grass`) |
| species | `text NOT NULL CHECK (species IN ('beef_cattle','dairy_cattle','sheep','goat','other'))` (the animal_classes list) |
| group_id | `uuid REFERENCES groups(id) ON DELETE SET NULL` (nullable) |
| group_label | `text` (snapshot) |
| place_text | `text` (the place as written: pasture, barn, "E4") |
| notes | `text` (the raw notes line, verbatim) |
| source | `text NOT NULL DEFAULT 'manual' CHECK (source IN ('notes','manual'))`; the backfill writes `notes` |
| source_key | `text NOT NULL`, `UNIQUE (operation_id, source_key)` |

**`historical_animal_basis`** stores one row per herd or flock basis period, which the intake forecast reads in place of event windows. Plan §7 says to keep this as its own table.

| Column | Type / rule |
|---|---|
| id, operation_id, created_at, updated_at | as above |
| farm_id | as above |
| period_start, period_end | `date NOT NULL`, inclusive, `CHECK (period_end >= period_start)` |
| species | same CHECK as above |
| group_id / group_label | as above |
| class_id | `uuid REFERENCES animal_classes(id) ON DELETE SET NULL` (nullable) |
| class_label | `text` (snapshot) |
| head_count | `integer NOT NULL CHECK (head_count > 0)` |
| avg_weight_kg | `numeric NOT NULL CHECK (> 0 AND < 'Infinity')` |
| dmi_pct_snapshot | `numeric NOT NULL CHECK (> 0 AND <= 100)` |
| dmi_source | `text NOT NULL CHECK (dmi_source IN ('class_default','class_mix','manual'))`: one class's default / head-weighted mix of member classes / typed |
| source | `text NOT NULL DEFAULT 'manual' CHECK (source IN ('tim_entry','tim_answer','manual'))`: Tim's own entry (J = A) / Tim's dry-run answers (Q, T, U, V) / later in-app entry |
| notes | `text` |
| source_key | `text NOT NULL`, `UNIQUE (operation_id, source_key)` |

**Deterministic ids.** The ids follow 044's fixed UUIDv5 URL-namespace pattern. The namespace is the RFC 4122 URL namespace `6ba7b811-9dad-11d1-80b4-00c04fd430c8`, a literal. The name string is `https://getthehayout.com/backfill/oi-0222/<table>/<source_key>`, where `<table>` is the target table name. This applies to every backfill-created row: both new tables, plus `event_feed_entries`, `event_feed_checks`, `event_feed_check_items` and `batch_adjustments`, whose tables have no source_key column. It replaces the dry run's illustrative two-level namespace, so ids differ from the 17c CSV. Ids are excluded from the match check (§3).

**Source keys** keep the dry run's shapes. `notes:b3f3b99e:<line>[:<day>]` uses the first 8 hex characters of the notes file's sha256; the December pro-rate rows add `:<day>`. The other shapes are `v1:delivery:<id>`, `v1:check-item:<id>:<n>`, `basis:<species>:<group or flock>:<period_start>` and `adjustment:<reverse|true-up>:<batch name>`.

**Basis rows (7).** All weights are stored in kg (lb × 0.45359237). DMI is stored to 4 decimal places.

| Row | Period | Head | Avg lb | DMI% | dmi_source | source |
|---|---|---|---|---|---|---|
| Cow-Calf Herd | 2025-10-01 – 2026-03-03 (v2 windows from Mar 4) | 31 | 929 | 2.5741 | class_mix | tim_answer |
| Mixed Calves | 2025-10-01 – 2026-03-18 | 28 | 500 | 2.5 | class_default | tim_answer |
| Shenk Culls | 2025-10-01 – 2026-03-18 | 10 | 755 | 2.5 | class_default | tim_answer |
| Shenk Cows | 2025-10-01 – 2026-03-18 | 4 | 950 | 2.5 | class_default | tim_answer |
| Culls | 2025-10-01 – 2026-03-18 | 3 | 950 | 2.5 | class_default | tim_answer |
| Bull Group | 2025-10-01 – 2026-03-18 | 3 | 1,250 | 2.3333 | class_mix | tim_answer |
| Sheep flock | 2025-10-01 – 2026-05-31 | 80 | 110 | 3.0 | class_default | tim_entry |

The cattle rows set `species = 'beef_cattle'` and link `group_id` to the live group. The cattle total is 1,533.8 lb DM/day. The sheep row has `group_id` null, `group_label 'Sheep flock'`, and comes to 264 lb DM/day.

**Feeding rows** map species `cattle?`/`cattle` to `beef_cattle` and `sheep` to `sheep`. The weight snapshot is 647 lb = 293.4743 kg for round bales and 50 lb = 22.6796 kg for squares; dm_pct_snapshot is 85. Feed type by the note's type: grass → `Round bale- Grass`, peanut → `Round Bale- Peanut`, and the **54 rows with no written type → `Round bale- Grass`** (decision 3, Tim, 2026-11-17 7:19 AM ET, via Orchestrator: "Those bales would be grass hay"). The script resolves the type id by name at run time and aborts unless exactly one non-archived feed type has that name; `feed_type_label` is that name; `notes` keeps the raw line, so the source wording (no type written) stays on the row. Snapshots stay 647 lb · 85% (plan F), not the grass type's or this fall's batch values.

**Entry point for the basis.** For now only the backfill script writes basis rows. In-app entry and editing are deferred to a follow-up OI (Tim question 1). Until then the table is read-only in the UI.

## 2. 045 release (044 pattern)

The 044 pattern ships two PRs.

**PR 1 (Build, now).** Contents:
- migration 045, written but not applied;
- `HELD_SCHEMA_VERSIONS = [45]`, with the ceiling staying 44;
- `STAGED_COLUMNS[45] = { historical_feedings: ['operation_id','source_key','species','unit_snapshot','weight_per_unit_kg_snapshot','dm_pct_snapshot'], historical_animal_basis: ['operation_id','source_key','species','head_count','avg_weight_kg','dmi_pct_snapshot'] }`;
- `BACKUP_MIGRATIONS[44]`, which sets `b.tables.historical_feedings ??= []` and `b.tables.historical_animal_basis ??= []`, then sets `b.schema_version = 45` and each `b.tables.operations[].schema_version = 45` (the new-table precedent at 20);
- CP-55: add both tables to `BACKUP_TABLES` (`{ paginate: false }`, filtered by operation_id, in the feed group);
- CP-56: add both to `FK_ORDER` after `farms`, `groups`, `animal_classes` and `feed_types` (place them after `batch_moves`);
- the `opening` option in the batch-sheet source picker (`src/features/feed/index.js`, beside purchase/harvest), so editing a relabeled batch keeps `opening`;
- the script (§3);
- tests: the backup migration 44→45, round-trip of both tables, refusal of 45 columns at ceiling 44, and script dry-run fixtures.

**PR 2 (after apply is verified).** Contents: `RELEASED_SCHEMA_VERSION = 45` and `HELD_SCHEMA_VERSIONS = []`. STAGED_COLUMNS stays in place as the proof manifest. This matches PR #56 and commit 934d937.

**Ordered steps.** Each production step needs Orchestrator's confirmation. Tim's 6:29 yes covers the sequence only with backup first.
1. Design reviews PR 1, then it merges.
2. Take a fresh backup in the Nov 11 style: SQL/JSON of every affected table to Orchestrator's box. Verify it by row counts and that it reads back.
3. Merge PR 2, apply 045, and verify: stamp 45, both tables and their columns, RLS policies, and the migration ledger.
4. Publish the 45 client and check its build stamp.
5. Backfill dry run from fresh read-only extracts.
6. Design checks the dry run against 17c (§3).
7. Take another fresh backup immediately before the write.
8. Backfill write: one transaction, with Tim's yes via Orchestrator.
9. Verify: the same match check against the live rows, and an idempotent re-run that inserts 0 rows.

**Rollback.** Delete rows by their deterministic ids, delete the 8 adjustments, and restore the three relabels, all in one transaction. Alternatively, restore from the step-7 backup.

## 3. Script

**Location and language.** `scripts/oi-0222-backfill.mjs`, Node ESM (the repo's `scripts/*.mjs` convention). It uses `node:crypto` (SHA-1) for UUIDv5 and adds no new dependency. It never connects to a database and holds no credentials.

**Inputs.**
- `--notes <path>`: Tim's notes file. The script refuses to run unless the sha256 prefix is `b3f3b99e`. The file stays on Orchestrator's box and is not committed.
- `--extracts <dir>`: JSON from read-only SELECTs run by Orchestrator, matching 17c's `queries.sql`. These cover v1 deliveries, checks and events, plus v2 events, windows, entries, checks, batches, batch_adjustments, groups and feed_types.
- `--decisions`: Tim's decisions encoded in the script as a reviewed constant table (17c `src/build.py` is the reference).

**Outputs.**
- `--dry-run` is the default. It writes a report, CSVs and the summary JSON of the match fields.
- `--emit-sql <file>` writes one `BEGIN…COMMIT` transaction. The transaction first aborts (`RAISE EXCEPTION`) unless the guarded state equals the extracts: the 4 reconciles, the batch quantities and remaining values, and no existing backfill ids. Orchestrator applies that SQL.

**Idempotency.** Every row id is UUIDv5 from its source key. Inserts use `ON CONFLICT (id) DO NOTHING`, and the two new tables are also covered by the unique source_key, so a re-run inserts 0 rows.

**Adjustments.** These go in `batch_adjustments`, which has no notes column. `adjusted_by` is null. Each row sets `previous_qty`, `new_qty` and `delta`, with `reason 'reconcile'`, `adjustment_date` and `created_at` set to now. The Nov 3 reconciles are left in place. Each batch gets two appended rows:

Each batch gets two rows. Their deltas match 17c. The offset reverses the Nov 3 reconcile; the true-up then sets the batch to its end state.

| Batch | Offset row (prev → new, delta) | True-up row (prev → new, delta) | adjustment_date | batches.remaining after |
|---|---|---|---|---|
| Oak Field Barn | 0 → 37, +37 | −8.86 → 0, +8.86 | 2026-05-03 | 0 |
| Tarped | 0 → 40, +40 | 5 → 0, −5 | 2026-05-03 | 0 |
| Peanut Hay | 0 → 17, +17 | 15 → 0, −15 | 2026-05-03 | 0 |
| Alfalfa Small Squares | 15 → 93, +78 | 54.5 → 15, −39.5 | 2026-11-03 | 15 |

The true-up `previous_qty` equals end minus delta, which is received minus fed: the ledger value with all fed rows counted. The two rows don't chain, because existing v2 rows didn't all decrement the batch. The script writes rows directly and does not decrement batches per entry. It sets `batches.remaining` to the end state in the same transaction. The guard aborts if the batch has `batch_location_balances` rows that would no longer sum to remaining.

**Opening relabel (E).** Oak Field Barn, Tarped and Peanut Hay become `source = 'opening'` and `purchase_date = 2026-03-15`; only Peanut Hay's date changes (from 2025-12-31). `cost_per_unit = 45` is guarded as already 45 and left unchanged. Quantity is unchanged. Alfalfa stays `purchase`, Mar 24.

**Event lane (Mar 4 – Apr 13).** These rows follow plan §3 and the 17c CSV's row statuses. That means 33 inserts with `kind 'inventory_feeding'` and the 043 snapshots: 23 from v1 and 10 from notes. The lane also gets 6 v1 transfers as the pool_carry/pool_removal pairs, with no inventory effect, and 35 check items (pool child, batch null) under their checks. Superseded, matched-skipped and excluded rows are not written.

**"Matches 17c" check.** The script prints these values; Design compares them to the 17c CSVs/REPORT. Tolerance is 0 units and 1 lb DM per figure. Ids are not compared.

| Measure | 17c target |
|---|---|
| Per month, units / lb DM | Oct 58 / 31,897 · Nov 80 / 43,996 · Dec 122 / 67,094 · Jan 102 / 56,095 · Feb 92 / 50,595 · Mar 87.5 / 35,688 · Apr 1–13 16.8 / 9,239. Total 558.3 / 294,605 (cattle 550.3 / 290,205, sheep 8 / 4,400) |
| History lane | 89 rows · 454 units · 249,677 lb DM. By feed type after decision 3: Round bale- Grass 414 (17 rows typed grass = 102, plus the 54 no-type rows = 312) · Round Bale- Peanut 40 · 0 untyped |
| Event lane | 33 inserts (23 v1 + 10 notes) · 104.3 units · 44,927 lb DM; 6 transfers; 35 check items |
| Not written | superseded 7 (45.5 units) · matched-skipped 4 (16) · excluded copies 12 (74.5) · sheep alfalfa 2 (15) · sheep peanut 1 (1) |
| True-up per batch | the table above: deltas, dates and end states exact |
| Basis rows | 7 rows as in §1. Cattle 1,533.8 lb DM/day (79 head, 769 lb avg, 2.525%); sheep 264 lb DM/day |

## 4. Tim questions (1–2 at defaults; 3 decided)

1. **Basis entry point.** Only the backfill writes last winter's basis now, and in-app entry/edit becomes a follow-up OI? *Default: yes.* (J = A said Tim enters it; he has given the values, so the script enters them.)
2. **Adjustment reason.** The offset and true-up rows use the existing `reconcile` reason; there is no new reason value. *Default: `reconcile`.*
3. **Winter bales with no written type — DECIDED: grass hay** (Tim, 2026-11-17 7:19 AM ET, via Orchestrator: "Those bales would be grass hay"). The 54 history rows carry the `Round bale- Grass` feed type (not "untyped round bale", not null). Units, lb DM, true-ups and the §3 match figures are unchanged: 17c already valued them at 647 lb · 85%, the same as the typed grass and peanut rows, and history rows carry no batch or cost. The two Mar 17/19 notes rows in the event lane already use the Oak Field Barn batch (grass type).
