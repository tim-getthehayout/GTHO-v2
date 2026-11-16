# OI-0222 — One-time historical hay-feeding backfill (winter 2025-26 + dropped v1 feedings)

**Date:** 2026-11-16 | **Owner:** GTHO Design | **Status:** PROPOSED — awaiting Tim's answers. Docs only: no SQL file, no code, no production write. **Nothing writes to production without a fresh backup and Tim's explicit yes on the specific dry-run report.**
**Requested:** Tim, 2026-11-16 3:26 PM ET (relayed by Orchestrator); notes delivered 3:27 PM ET.
**Sequence:** OI-0220 (feed units) → **OI-0222 (this backfill)** → OI-0221 slice 1 (monthly history report), which then has Oct 2025 – Apr 2026 history.
**Schema:** production stamp 44, compiled ceiling 44 (044 applied and published 2026-11-11). The v1-window part needs no migration; the winter part's recommended storage needs one (question C).

## Sources

| Source | Where | What it covers |
|---|---|---|
| (a) v1 feedings the Apr 14 import dropped | v1 Supabase project (read-only), Tim's operation | 48 `event_feed_deliveries`, Mar 4 – Apr 13, 2026; 41 feed checks with 35 `type_checks_json` items |
| (b) Tim's hay notes | Orchestrator's box: `/workspace/gtho-backfill/tim-hay-inventory-notes-2025-26.md` (sha256 `b3f3b99e…`, verified; original zip beside it). **Not copied into the repo.** | Oct 1, 2025 – Mar 28, 2026: feedings, receipts, inventory counts |
| (c) What v2 already has | Production (read-only) | 19 events and 41 checks from the import (0 check items), Apr 9 onward feed entries, Nov 3 reconciles |

## Recommendation (first)

1. **Two lanes.** (i) **Mar 4 – Apr 13, 2026** (events exist in v2): insert real `event_feed_entries` and pool check items onto the already-imported v2 events. (ii) **Oct 1, 2025 – Mar 3, 2026** (no v2 events, no v2 batches): store as **historical feeding records** — date, quantity, unit, kg/unit, DM%, feed type, group/species, place, source key — used by reports and the OI-0221 monthly history, without inventing grazing events (question C).
2. **De-duplicate, never auto-pick.** v1 rows and note rows are matched on date (±1 day), place/event, feed type/batch and quantity; anything that doesn't match exactly is a conflict for Tim. For Mar 4 – Mar 20 the explicit match table is below.
3. **Keep today's inventory exactly as it is.** Backfilled feedings don't change `batches.remaining`. Each Nov 3 reconcile already absorbed the dropped feedings, so for every unit backfilled against a batch, append an **offset adjustment** (dated the reconcile's effective date, reason "backfill offset") so the reconcile + offset equals what the reconcile now does. Invariant: remaining per batch before = after (question D).
4. **Relabel the v1 starting stock** (Oak Field 45, Tarped 40, Peanut 17) as opening inventory dated Mar 15, 2026 (question E).
5. **Inventory counts in the notes become checkpoints**: the dry run shows, per interval, count at start + receipts − feedings vs the next count (question G).
6. **Stable source keys and deterministic ids** (UUIDv5 from the source key, as 044 did for standard units) make a re-run a no-op.
7. Dry run → Tim's yes on that exact report → fresh backup → all-or-nothing apply → verify → rollback path ready.

## 1. What the sources say (verified 2026-11-16, read-only; aggregates only)

**v1 (source a)** — confirms Orchestrator's 48 rows / 171.3 units:

| Batch (v1) | Rows | Units | Dates | v1 kg/unit (lb) · DM% · $/unit |
|---|---|---|---|---|
| Alfalfa Small Squares | 10 | 92.5 sq bale | Mar 19, 23, 24 | 50 lb · 85 · $5 |
| Oak Field Barn | 26 + 6 transfer rows (net 0) | 41.8 bale | Mar 19 – Apr 13 | 750 lb · 85 · $45 |
| Tarped | 5 | 36 bale | Mar 4, 6, 9 | 750 lb · 85 · $45 |
| Peanut Hay | 1 | 1 bale | Mar 18 | 750 lb · 85 · $45 |

- 41 of 48 rows have no unit (read through the batch); 43 have no stored DM or cost (computed through the batch). Units seen: `bale`, `sq bale`, null — no `bal`.
- 3 transfer pairs (6 rows, Apr 7–8) net to zero: event-to-event carries, not new feed.
- **Why the import dropped them:** `src/data/v1-migration.js` reads `ev.feedEntries`/`ev.feedResidualChecks` from the v1 export; the 48 deliveries weren't carried, and v1 check items are keyed by **feed type** (`feedTypeId`, `remaining`, `total`) while the importer looked for `batchId`, so all 35 were skipped. The import created 19 v2 events and 41 checks with 0 items; batches came in at full `remaining`.
- **v1 has two extra batches not in v2:** "Mar 31 · E-3 · Alfalfa" 100 and 50 sq bales, $0 (likely harvest/test records). Question I.
- **Event mapping:** the import gave v2 events random new ids and kept no v1 id. v1 has 19 events (Mar 4 – Apr 13); v2 has exactly 19 events with paddock windows opening before Apr 14 (created at import, Apr 14 10:07 PM ET). Map by natural key — v1 `date_in` + pasture name(s) ↔ v2 earliest paddock-window date + location name(s); the dry run lists every pair, and anything not one-to-one is a conflict.

**Tim's notes (source b)** — parsed to 87 feeding rows, 10 receipt rows, 4 inventory blocks (Orchestrator's reading verified, with the differences noted below):

| Month | Feeding rows | Bales fed | By type (grass / peanut / alfalfa sq / untyped) | To sheep |
|---|---|---|---|---|
| Oct 2025 | 14 | 58 | 0 / 0 / 0 / 58 | 0 |
| Nov 2025 | 11 | 80 | 0 / 0 / 0 / 80 | 0 |
| Dec 2025 | 8 | 138 | 12 / 0 / 0 / 126 | 0 |
| Jan 2026 | 17 | 86 | 42 / 24 / 0 / 20 | 0 |
| Feb 2026 | 20 | 92 | 48 / 16 / 0 / 28 | 8 |
| Mar 2026 (to 28th) | 17 | 85 | 57 / 3 / 11 / 14 | 16 |
| **Total** | **87** | **539** | | |

- Type split starts Jan 14 (peanut vs grass); Dec 9–11 "old tarp bales" counted as grass. Groups named: cows, sheep, corral group, Shenk group/cows, culls and calves. Places named: E4, J3, J2, Corral, Oak Field, barn.
- **Receipts:** ten 30-bale loads = 300 bales (10/17, 10/18, 10/24, 11/5 ×2, 11/7, 11/19 ×2, 11/21 ×2) — matches Orchestrator. No type, weight or price given.
- **Counts:** (1) undated, between 10/6 and 10/16: Barn 90, Straight 3 58, Tarp 30, Barnyard 19 = **197**; (2) "Trued up 11/4" — no figures; (3) 1/6: tarps 180, barn 57, peanut at Hines 60 = **297** ("98 days"); (4) 2/18: Red Barn 45 grass + 17 peanut, Tarp 1 60, Tarp 2 3, Outside 4 = **129** (112 grass, 17 peanut).
- "(N remaining)" = leftover at the feeding site (not fed amounts, not stack inventory); they could become pool check readings only where an event exists (not for winter).
- "Entered in GTHO below" sits at 3/18; "Not Entered" lists 3/25 Corral 6 alfalfa, 3/27 5 alfalfa to sheep, 3/28 10 to sheep + 1 to calves/Shenk culls.

**Ambiguous lines (flagged for Tim, not guessed):** the undated first count; "Trued up 11/4" without numbers; Dec 9–11 "old tarp bales" type; 12/12 "E4 18" and 12/16 "80 bales" (look like bale-grazing set-outs — feeding date vs eating period); 1/6 "60 peanut – Hines" (not in the October count and no receipt — bought or stored elsewhere?); whether 2/18 "Fed 28" is before or after the 2/18 count; 3/17 "2 bales" untyped; 3/19 "16 bales oak field ) Fed" truncated; 3/20 "from barn removed from oak field"; 3/28 "10 bales to sheep" — round or alfalfa squares; group unknown for most rows before Feb; receipts without type or price.

## 2. De-duplication

**Rule:** a v1 row and a note row are the same feeding if date within ±1 day, same place/event (or the note names none), same type (or the note is untyped), and quantity equal. Same date/place but different quantity = **conflict**. Everything is also compared with v2 feed entries already present (lane i). Nothing is auto-picked.

**Mar 4 – Mar 20 match table (bales):**

| Date | Tim's notes | v1 deliveries | Proposed status |
|---|---|---|---|
| 3/4 | 6 grass to cows + 1 peanut to sheep | Tarped 20 (G-3) | **Conflict** (7 vs 20) |
| 3/6 | 2 grass to cows | Tarped 4 (G-3) | **Conflict** (2 vs 4) |
| 3/9 | 12 grass | Tarped 12 (G-2) | Match |
| 3/13 | 15 grass | — | Notes only |
| 3/17 | 2 bales | — | Notes only |
| 3/18 | 1 peanut + 2 grass from barn | Peanut 1 (G-2) | Peanut match; 2 grass notes only |
| 3/19 | 16 Oak Field + 1 peanut (corral group) + 1 (Shenk group) | Oak Field 20 (Corral, K-5); Alfalfa 18.5 sq (Corral) | **Conflict** (18 vs 20 round; peanut not in v1; alfalfa not in notes) |
| 3/20 | 2 (culls + calves) + 2 (Shenk cows), from barn / Oak Field | Oak Field 2 (G-2) | **Conflict** (4 vs 2) |
| **Window total** | **63** | **77.5** (59 round + 18.5 sq) | |

**Outside the window:** v1 only — 3/23 alfalfa 26 sq, 3/24 alfalfa 48 sq (both Corral), 3/27 Oak Field 2 (E-1), Apr 1–13 Oak Field 15.8 net. Notes only — 3/25 Corral 6 alfalfa (possible overlap with v1 3/23–24 Corral alfalfa; Tim says "not entered"), 3/27 5 alfalfa to sheep, 3/28 10 + 1. v2 already holds an Apr 9 J2 Oak Field 1 bale entered Apr 17; v1 has Oak Field at J2 on Apr 10–11 → possible duplicate, flag.

**Source keys** (stored as deterministic ids, not as notes): `v1:delivery:<v1 row>`, `v1:check-item:<v1 check>:<n>`, `notes:b3f3b99e:<line>:<n>`. A re-run computes the same ids and skips existing rows.

## 3. Mapping to v2

**Lane i — Mar 4 – Apr 13 (v1 rows + matched/accepted note rows):**
- `event_feed_entries`: `event_id` = paired v2 event; `location_id` = v2 location matching the v1 sub-move/paddock (else the event's first paddock window, as §2.5 of the migration plan); `batch_id` = v2 batch of the same name (the four v1 batches exist in v2); `date` = v1 date; `quantity` = absolute units; `entry_type` delivery; `kind` = `inventory_feeding` with `feed_type_id` and 043 snapshots (`unit_snapshot` folded per OI-0220; `weight_per_unit_kg_snapshot`, `dm_pct_snapshot` per question F). Transfers: linked `pool_carry`/`pool_removal` pairs with a shared `transfer_id`, no inventory or cost effect. No `source_location_id` (storage location then unknown).
- Check items: one new-style pool child per v1 item (`batch_id` null, `feed_type_id` from the v1 feed-type id → v2 type by name, `remaining_quantity` = v1 `remaining`, unit/weight/DM snapshot) attached to the matching existing v2 check (same paired event + date; 41 ↔ 41). v1 `total` is not stored (v2 derives it).
- Inventory side: **inserts do not touch `batches.remaining` or located balances** (see §4).

**Lane ii — Oct 1, 2025 – Mar 3, 2026 (notes only):** no v2 events, groups-in-events or batches. Options (question C):
- **A. Historical feeding records** (recommended): a small history table, one row per note line — date, quantity, unit, kg/unit and DM% snapshot, feed type, group label + species, place text, source key, notes. Reports and OI-0221 read it alongside feed entries. No effect on grazing, DMI, NPK or inventory. Needs one migration (after 044; can share the OI-0221 budget migration); CP-55/CP-56 include it.
- B. Backfilled events: fake winter events with paddock and group windows. Distorts grazing history, NPK, rest periods and animal records; group windows need head counts we don't have. Not recommended.
- C. One period summary per month (no daily rows): simplest, but loses dates, groups and the audit trail.

**Batches for winter:** none created. The 300 received bales and the counted stock are recorded only as checkpoint data in the dry run, not as inventory (they were all used or rolled into the v1 opening stock).

## 4. Nov 3 reconciles — no double count

Reconciles (all entered 2026-11-03; read-only): Oak Field 37 → 0 (−37, effective May 3); Tarped 40 → 0 (−40, May 3); Peanut 17 → 0 (−17, May 3); Alfalfa 93 → 15 (−78, Nov 3). Total −172 vs 171.3 v1 units dropped — matches Orchestrator.

Per batch, backfill vs reconcile (before de-dup):

| Batch | v1 units to backfill | Reconcile | Reconcile + offset | Reading |
|---|---|---|---|---|
| Oak Field | 41.8 | −37 | **+4.8** | backfill exceeds what the reconcile removed |
| Tarped | 36 | −40 | −4 | 4 bales unexplained (waste/unrecorded) |
| Peanut | 1 | −17 | −16 | 16 bales unrecorded (notes show 2 more after Mar 15) |
| Alfalfa | 92.5 | −78 | **+14.5** | backfill exceeds what the reconcile removed |

- Oak Field and Alfalfa don't add up: Oak Field 45 received vs 41.8 (v1) + 11.06 (v2 Apr–May) = 52.9 fed; Alfalfa 100 vs 92.5 (v1) + 21 (v2 May on) + 15 left = 128.5. Possible causes: Oak/Tarped bales mixed between batches (combined round bales 85 vs 88.9 fed), the extra v1 alfalfa batches (150 sq), or double-entered v1 rows (Mar 23–24). Also the Oak Field reconcile's "before" (37) ≠ 45 − 11.06. **The dry run must explain each batch; Tim decides (question D).**
- Mechanism (recommended): append offset adjustments; never edit the original reconcile rows (adjustments are write-once by design). Invariant checks: `batches.remaining` and located balances identical before/after for every batch; Σ deltas + quantity − fed = remaining.

## 5. Opening inventory

- No DB constraint on `batches.source` (app-managed text; only `purchase` is in use). `opening` needs **no migration**, but the batch sheet's source picker shows only purchase/harvest, so editing an opening batch could silently relabel it — a small app change rides with OI-0220 (question E).
- Recommend `source = 'opening'`, `purchase_date` = 2026-03-15 for all three (Peanut currently 2025-12-31 placeholder).
- **Check against the notes:** 2/18 count 129 (112 grass, 17 peanut) minus Feb 19 – Mar 13 feedings 49 (46 grass, 3 peanut) = 80 expected at Mar 15 vs v1 opening 102 (+22). If the opening was meant as of ~Mar 4 (v1 events start Mar 4 and v1 deducts Mar 4–13 feedings from it): 129 − 13 (Feb 19–27) = 116 vs 102 (−14). Red Barn 45 grass / 17 peanut on 2/18 = Oak Field 45 / Peanut 17 exactly, so the barn figures look carried straight from 2/18; Tarped 40 vs 67 tarp/outside on 2/18. Question H.
- OI-0221: opening stock is **opening on-hand**, not a receipt in the 2025-26 period; its $45/bale stays as valuation for cost of feed fed.

## 6. Inventory checkpoints (dry-run section)

| Interval | Start count | + Receipts | − Fed (notes) | Expected | Next count | Variance |
|---|---|---|---|---|---|---|
| ~Oct 16 → Jan 6 | 197 | 300 | 267 | 230 | 297 | **+67** (+7 if the 60 Hines peanut was outside the Oct count) |
| Jan 6 → Feb 18 | 297 | 0 | 160 | 137 | 129 | **−8** (peanut 60 − 38 = 22 vs 17: −5) |
| Feb 18 → Mar 15 (v1 opening) | 129 | 0 | 49 | 80 | 102 | **+22** (see §5) |

Assumes counts are taken after that day's feeding. The dry run shows these by type where the notes allow, plus the "Trued up 11/4" gap.

## 7. Species and groups

- Each row keeps its group label and a species (cattle/sheep; default cattle where the note names no group). Sheep rows (Feb 8, Mar 16 bales) stay in the herd DM total; the OI-0221 DMI demand already includes sheep classes, so the stored-feed share stays farm-wide. A per-species view is a later filter (question J).

## 8. Bale weight and DM (question F)

| Feed | v2 batch values today | v1 values | Proposed for backfill |
|---|---|---|---|
| Round grass (Oak Field, Tarped, winter grass) | Oak Field 647 lb · 85%; Tarped null; 2026 grass 600 lb · 90% | 750 lb · 85% | **647 lb · 85%** (550 lb DM ≈ 249 kg DM/bale) — Tim's own corrected v2 figure for that stock |
| Peanut round | old Peanut null; Oct 2026 peanut 600 lb · 90% | 750 lb · 85% | 647 lb · 85% unless Tim knows better |
| Alfalfa small square | 50 lb · 85% | 50 lb · 85% | 50 lb · 85% (42.5 lb DM) |

Illustrative winter DM at 550 lb DM/bale before de-dup: Oct ≈ 31,900 lb; Nov ≈ 44,000; Dec ≈ 75,900; Jan ≈ 47,300; Feb ≈ 50,600; Mar ≈ 41,200 (incl. 11 sq bales). Final numbers come from the dry run.

## 9. Dry-run report (Tim reviews before any write)

1. Header: source file hash, v1/prod read time, rule set, OI-0220 unit folding applied.
2. Rows to insert, grouped by source and lane (entries, carries, check items, history records), with month totals in units, as-fed and DM.
3. Matched pairs (v1 ↔ notes ↔ v2), duplicates skipped, and **conflicts** with both sides shown and a blank decision column.
4. Event pairing table (v1 event ↔ v2 event).
5. Reconcile offsets per batch with the arithmetic in §4.
6. Per-batch `remaining` and located balance before/after — must be identical.
7. Monthly DM fed before vs after (Oct 2025 – Nov 2026).
8. Inventory checkpoint variances (§6).
9. Opening-inventory relabel and date changes.
10. Ambiguous lines and how each was treated.

## 10. Backup, apply, verify, rollback

- **Who:** Orchestrator runs it with Build-written tooling (a one-time script outside the app, reviewed by Design); the plan is the checklist. No SQL file is added to the repo by Design.
- **Steps:** (1) OI-0220 shipped and the `Bale` batch fixed; (2) if question C = A, the history-table migration is applied first under its own approval + backup; (3) generate the dry run from fresh reads; (4) Tim's explicit yes on that exact report (by its hash); (5) fresh backup, Nov 11 style — SQL/JSON of every affected table (events, event_feed_entries, event_feed_checks, event_feed_check_items, batches, batch_adjustments, batch_location_balances, history table) to Orchestrator's box; (6) apply in one transaction, all-or-nothing, re-checking that the backed-up state is unchanged first; (7) verify invariants, row counts per source, monthly DM equal to the dry run, idempotent re-run = 0 inserts, and a CP-55 export that round-trips; (8) rollback = delete by the deterministic backfill ids + remove offset adjustments + restore relabels in one transaction, or restore the affected tables from the backup.
- Stays within the schema-44 client; no client release unless question C = A (migration + compatible release) or the opening-source picker change ships.

## Lettered questions (recommended answer first)

- **A. Scope:** backfill Oct 1, 2025 – Apr 13, 2026 from both sources? Recommend: yes, both lanes.
- **B. Conflicts in Mar 4 – 20** (3/4, 3/6, 3/19, 3/20): which wins? Recommend: you decide each in the dry run; default proposal is v1 (entered at the time, tied to events) unless you say your notes are the truer count.
- **C. Winter storage:** A historical feeding records table (recommended), B backfilled events, or C monthly summaries?
- **D. Reconciles:** append offsets so today's inventory is unchanged (recommended), after you resolve the Oak Field (+4.8) and Alfalfa (+14.5) over-runs — which bales were really fed from which batch?
- **E. Opening stock:** relabel Oak Field, Tarped, Peanut as `opening`, dated Mar 15, 2026, keep $45/bale as value (recommended)?
- **F. Bale weights:** 647 lb · 85% for winter round (grass and peanut), 50 lb · 85% alfalfa squares (recommended)?
- **G. Checkpoints:** treat the four counts as checks only (report variances, no adjustments) (recommended)? And was the 60 peanut at Hines outside the October count?
- **H. Opening as of when?** Was the v1 starting stock counted Mar 15 or effectively the Feb 18 / early-March stock? Recommend: tell us; default is Mar 15 with the +22 shown as unexplained.
- **I. Extra v1 alfalfa batches** (Mar 31, E-3, 100 and 50 sq, $0): ignore (recommended) or bring over?
- **J. Sheep:** keep sheep rows in the farm-wide DM history with a species tag (recommended)?
- **K. Big set-outs** (12/12 E4 18, 12/16 80): count on the set-out date (recommended, consistent with OI-0221) or spread over days?
- **L. Ambiguous lines:** confirm 3/28 "10 to sheep" type, "old tarp bales" = grass, and 2/18 "Fed 28" before the count.
