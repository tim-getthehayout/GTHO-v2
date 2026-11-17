# OI-0222 — One-time historical hay-feeding backfill (winter 2025-26 + dropped v1 feedings)

**Date:** 2026-11-16 | **Owner:** GTHO Design | **Status:** APPROVED (Tim, 2026-11-17 6:29 AM ET, via Orchestrator; backup first). **Build lock:** [HAY_FEEDING_BACKFILL_BUILD_LOCK_2026-11-17.md](HAY_FEEDING_BACKFILL_BUILD_LOCK_2026-11-17.md). Winter bales with no written type = grass hay (Tim, 2026-11-17 7:19 AM ET, via Orchestrator: "Those bales would be grass hay"); the "untyped" columns in the dry-run tables below are grass for storage. History: Dry run 2026-11-16; Tim answered its questions (O, C1–C4, P, Q, two same-bale dedupes) 2026-11-17 5:00 AM ET via Orchestrator; rerun 2026-11-17 (559.3 units, ≈295,155 lb DM); R, S, T answered 2026-11-17 5:58 AM ET via Orchestrator; second rerun (558.3 units, ≈294,605 lb DM); V, U and landing answered 2026-11-17 6:12 AM ET via Orchestrator; third rerun (rows and true-ups unchanged; cattle basis 1,533.8 lb DM/day); W, X default adopted (Orchestrator 6:20 AM; Tim has not objected); Shenk Cows confirmed 6:40 AM ET via Orchestrator. Landing of this docs update approved by Tim (2026-11-17 6:12 AM ET, via Orchestrator; docs only, no GitHub publish). Docs only: no SQL file, no code, no production write. **Nothing writes to production without a fresh backup and Tim's explicit yes on the specific dry-run report.**
**Update (Tim, 2026-11-17 6:29 AM ET, via Orchestrator):** "Ok all set to go on run rate and backfill. Backup the database before backfill database changes and backfill". Migration 045 and the backfill write are approved on condition of a database backup first; handed to Build. Build writes the migration and a backfill script with dry-run mode (not applied); Design reviews the PR and checks the dry-run output against the 17c report (sha256 `db1717e29428325762546e76fbd24846a0fd5e9e9329ade4372fabcc01468191`); the apply happens only after a backup is taken and verified.
**Requested:** Tim, 2026-11-16 3:26 PM ET (relayed by Orchestrator); notes delivered 3:27 PM ET. **Answered:** Tim, 3:43, 3:51, 3:52 and 4:05–4:06 PM ET via Orchestrator (see Decisions); dry-run answers 2026-11-17 5:00 AM ET and R, S, T 5:58 AM ET via Orchestrator.
**Sequence:** OI-0220 (feed units) → **OI-0222 (this backfill)** → OI-0221 slice 1 (monthly history report), which then has Oct 2025 – Apr 2026 history.
**Schema:** production stamp 44, compiled ceiling 44 (044 applied and published 2026-11-11). The v1-window part needs no migration; the winter part's recommended storage needs one (question C).

## Decisions (Tim, 2026-11-16 3:43 PM ET, relayed by Orchestrator)

1. **Feedings are the basis.** Inventory was fudged to match fed numbers, not the other way round. Tim started summer 2026 with **0 bales on hand**: everything received in 2025 or early 2026 had been fed out. Fed records are truth; batch and opening inventory are trued up with adjustments so they end at 0 at the start of summer. Snapshots and batch over-runs are reconciled toward the fed numbers. Likely double-entered v1 rows (Mar 23–24 alfalfa) are still flagged in the dry run.
2. **3/28 "10 bales to sheep" = alfalfa** (small squares).
3. **"Old tarp bales" (Dec 9–11) = grass.**
4. **2/18 "Fed 28" before/after the count:** doesn't matter under feeds-as-basis — closed.
5. **12/16 "Fed 80 bales" is a pre-Christmas set-out:** pro-rate evenly from the set-out date to the day before the next recorded feeding (1/5). The notes say **12/16**; Tim first recalled Dec 18 and then confirmed 12/16 (3:51 PM ET, item 8). §3a has the numbers. 12/12 "E4 18" stays on its date.

## Follow-up decisions (Tim, 2026-11-16 3:51–3:52 PM ET, relayed by Orchestrator; recorded after `b55732df` landed)

6. **N = A — Alfalfa carried into summer.** The Alfalfa small squares (purchased Mar 24, 2026) are the named exception to 0-at-summer: true up to the fed number and keep today's 15 (the +49.5 path, §4).
7. **I — the two $0 v1 alfalfa batches were not real hay** (Mar 31, E-3, 100 + 50 sq). Ignored: they map to nothing, and the alfalfa over-run is absorbed by the true-up.
8. **K — set-out start is 12/16, confirmed** (Tim's thumbs-up): 4.00 bales/day, Dec 64 / Jan 16. The 12/18 figures stay in §3a as a note only.
9. **2/18 "Fed 28" stays on its date** (not pro-rated; default accepted).
10. **E — opening stock at $45/bale** (3:52 PM ET: last year's hay was $45 a bale). Relabel as `opening`, dated Mar 15, 2026.
11. **J — sheep were on the farm last winter (Oct 2025 – May 2026); the goats were not** (3:51 PM ET). Sheep feedings count as fed, and sheep join the historical DMI basis even though no sheep group existed then; goats are excluded. How to supply the sheep head count and weight is question J (§7) — answered below.

## Answers (Tim, 2026-11-16 4:05–4:06 PM ET, relayed by Orchestrator)

12. **J = A — Tim enters last winter's sheep basis himself.** The historical animal-basis record needs an entry point for it (§7). Recorded value: **sheep, Oct 2025 – May 2026, 80 head at an average of 110 lb.** The difference from today's flock is last year's offspring, not ewes. Goats excluded.
13. **M, A and B stay at their defaults, decided in the dry run:** M — zero date May 3, 2026; A — scope Oct 1, 2025 – Apr 13, 2026, both sources; B — Mar 4–20 conflicts default to v1.
14. **C and F remain at their defaults** unless Tim changes them.

**Nothing open for Tim before the dry run.** **Defaults (decided in the dry run):** A (scope), B (conflicts, default v1), M (zero date May 3). **Defaults, no change requested:** C (history table), F (bale weights). G, H, L closed; D, E, I, J, K, N decided.

## Dry run and Tim's answers (dry run 2026-11-16; Tim, 2026-11-17 5:00 and 5:58 AM ET, relayed by Orchestrator)

The Nov 16 dry run (read-only; kept on Orchestrator's box at `/workspace/gtho-backfill/dry-run-2026-11-16/`) found 12 v1 machine-copy rows and raised O, P and Q. Tim answered on 2026-11-17 at 5:00 AM ET, via Orchestrator:

15. **O — "Remove the 12 duplicate rows."** The 12 v1 rows whose id is another row's id with `000`/`001`/`002` (or `000000`) appended, with the same event, date and quantity and no unit, DM or cost (74.5 units: Tarped 12, Oak Field 7, Alfalfa 55.5), are not backfilled; each original is kept. Orchestrator confirmed the 12 independently by a v1 SELECT.
16. **C1–C4 — "Use my notes for Mar 4, 19 and 20."** Notes win: Mar 4 = 7 (6 grass to cows, Tarped; 1 peanut to sheep), not v1 10; Mar 19 = 18 round (16 Oak Field, 1 peanut to the corral group, 1 to the Shenk group), not v1 14 round + 18.5 alfalfa squares; Mar 20 = 4 (Oak Field), not v1 2. C2 (Mar 6) is moot: v1 2 = notes 2 once the copies are removed. The v1 Mar 19 alfalfa (6.5 + 12 sq) is not stored: it predates the Mar 24 purchase and repeats the Mar 23/24 quantities, so it reads as a mis-dated duplicate; the Alfalfa true-up absorbs it.
17. **P — "Leave the Mar 27–28 sheep alfalfa out."** The 15 squares (3/27 5, 3/28 10) are excluded entirely: not in the history lane and not in Alfalfa fed.
18. **Q — "Copy the Mar 4 cattle groups back to Oct 1."** Cattle basis for Oct 1, 2025 – Mar 3, 2026 = the Mar 4 roster: Cow-Calf Herd, 31 head at 421.39 kg (≈929 lb), class-mix DMI 2.574% (≈741 lb DM/day). This also closes the Mar 1–3 gap.
19. **Apr 9 J2 (v2) and Apr 10 J2 (v1) — "the same bale, keep one."** Keep the v2 Apr 9 entry: it is the live system's row, needs no write, and is already inside Oak Field's 11.06 existing v2 fed. The v1 Apr 10 J2 row is not backfilled.
20. **Mar 28 calves/Shenk culls (notes) and Mar 27 E-1 (v1) — "the same bale."** Keep the v1 Mar 27 E-1 row (batch Oak Field, on the E-1 event whose groups are Mixed Calves, Culls and Shenk Culls; v1 wins by B). The notes 3/28 1-bale row is skipped as a match.

**Dry-run rerun with these answers (read-only, 2026-11-17; report on Orchestrator's box at `/workspace/gtho-backfill/dry-run-2026-11-17/REPORT.md`, sha256 `b9dd01c7b80234ae5c486c42099cf1ec6cc98d8d365099f3dc28212d9bd38e9a`):** fresh v1 and v2 reads were identical to Nov 16. Stored rows: **559.3 units, ≈295,155 lb DM** — Oct 58 · Nov 80 · Dec 122 · Jan 102 · Feb 92 · Mar 88.5 · Apr 1–13 16.8 (units; Oct–Feb unchanged). Lanes: winter history 90 rows / 455 units (89 notes rows plus the Mar 4 sheep peanut, R); event lane 33 feeding rows / 104.3 units (23 v1, 10 notes) + 6 v1 transfer rows (net 0) + 35 check items. True-ups (reverse the Nov 3 reconcile, then true up to fed): **Oak Field +37 / +8.86, Tarped +40 / −5, Peanut +17 / −15, Alfalfa +78 / −39.5**; ends 0 / 0 / 0 on May 3, 2026 and Alfalfa 15; post-summer batches untouched. These replace the §4 default-basis figures (+12.86 / +11 / −16 / +49.5). **Correction:** §2's "Apr 1–13 Oak Field 15.8 net" should have read **17.8** (found in the Nov 16 dry run); with the J2 dedupe the stored Apr 1–13 figure is 16.8.

**Follow-up answers (Tim, 2026-11-17 5:58 AM ET, via Orchestrator):**

21. **R — "Leave the Mar 4 peanut to sheep out".** The notes' Mar 4 "1 peanut to sheep" row is excluded entirely. It was never charged to a batch, so the Peanut true-up is unchanged (−15).
22. **S — "Accept the alfalfa true-up, no extra feeding rows".** Alfalfa true-up −39.5, ending at 15. No rows added.
23. **T — "Yes, the Mar 19 groups were there all winter, include them from Oct 1".** Cattle basis for Oct 1, 2025 – Mar 3, 2026 = the Mar 4 Cow-Calf Herd (31 head, 421.39 kg, DMI 2.574%) **plus** each Mar 19 group at its first-seen window: Mixed Calves 28 head at 566.99 kg (1,250 lb), DMI 2.5%; Shenk Culls 10 at 342.46 kg (755 lb), 2.5%; Shenk Cows 4 at 430.91 kg (950 lb), 2.5%; Culls 3 at 430.91 kg (950 lb), 2.5% (no classed members, default); Bull Group 3 at 566.99 kg (1,250 lb), 2.333% (1 Bull 2.0 + 2 Steer 2.5). Where a group has two Mar 19 windows (Shenk Cows, Culls), the first listed is used. **Total 79 head, ≈1,035 lb average, DMI 2.518% → 2,058.8 lb DM/day** (was 741.3 with the Cow-Calf Herd alone).

**Second rerun (read-only, 2026-11-17 ~6:05 AM ET; `/workspace/gtho-backfill/dry-run-2026-11-17b/REPORT.md` on Orchestrator's box, sha256 `ffc68ba24e41b18673d098d690ab92700943cad39c772433648732c3475cb411`):** fresh reads identical. Stored rows: **558.3 units, ≈294,605 lb DM** — cattle 550.3 units / 290,205 lb DM, sheep 8 units / 4,400 lb DM. Monthly units: Oct 58 · Nov 80 · Dec 122 · Jan 102 · Feb 92 · Mar 87.5 · Apr 1–13 16.8. Lanes: winter history 89 rows / 454 units; event lane 33 feeding rows / 104.3 units + 6 transfer rows (net 0) + 35 check items; excluded 12 copy rows (O), 2 sheep alfalfa rows (P), 1 sheep peanut row (R). True-ups unchanged: Oak Field +37 / +8.86, Tarped +40 / −5, Peanut +17 / −15, Alfalfa +78 / −39.5. **Cattle fed vs predicted intake:** Oct 50% · Nov 71% · **Dec 105% · Jan 88% · Feb 80%** · Mar 87% · Apr 1–30 32% (illustrative; OI-0221 computes the real share).

**Answers (Tim, 2026-11-17 6:12 AM ET, via Orchestrator):**

24. **V — "500 lbs".** Mixed Calves (28 head) at **500 lb (226.80 kg)** in the winter basis, replacing the 1,250 lb Corral event average. DMI stays **2.5%** (the Mixed Calves class mix from memberships is all Heifer/Steer 2.5%; nothing in the data says otherwise).
25. **U — "Yes, extend the full herd through Mar 18".** The full 79-head basis (Cow-Calf Herd + the five Mar 19 groups) runs **Oct 1, 2025 – Mar 18, 2026**; v2 event group windows from Mar 19.
26. **Landing — "Yes, land both docs changes with these answers, no GitHub publish".** Covers this docs branch and `docs/feed-run-rate` (OI-0224) only; no migration, backup or write.

**Third rerun (read-only, 2026-11-17 ~6:13 AM ET; `/workspace/gtho-backfill/dry-run-2026-11-17c/REPORT.md`, sha256 `db1717e29428325762546e76fbd24846a0fd5e9e9329ade4372fabcc01468191`):** fresh reads identical; V and U change only the predicted-intake basis, so stored rows, lanes and true-ups are unchanged: **558.3 units, ≈294,605 lb DM** (cattle 550.3 units / 290,205 lb DM, sheep 8 units / 4,400 lb DM); true-ups Oak Field +37 / +8.86, Tarped +40 / −5, Peanut +17 / −15, Alfalfa +78 / −39.5. **Cattle basis Oct 1 – Mar 18:** Cow-Calf Herd 31 × 929 lb × 2.574% = 741.3; Mixed Calves 28 × 500 lb × 2.5% = 350.0; Shenk Culls 10 × 755 lb × 2.5% = 188.7; Shenk Cows 4 × 950 lb × 2.5% = 95.0; Culls 3 × 950 lb × 2.5% = 71.2; Bull Group 3 × 1,250 lb × 2.333% = 87.5 → **79 head, 769 lb avg, DMI 2.525%, 1,533.8 lb DM/day**. **Cattle predicted / fed:** Oct 47,548 / 67% · Nov 46,014 / 96% · **Dec 47,548 / 141% · Jan 47,548 / 118% · Feb 42,947 / 108%** · Mar 51,376 / 69% · Apr 46,590 / 32% (incl. the existing v2 April 10.06 bales); illustrative, OI-0221 computes the real share.

**Open for Tim (Design's recommended default first):**
- **W. Dec–Feb fed above predicted intake (141% / 118% / 108%).** With the calves at 500 lb, hay fed exceeds the herd's predicted maintenance intake (2.5% of body weight); likely round-bale feeding waste, cold-weather intake and lactation not applied. *Default: accept as recorded; no change to rows or basis; OI-0221 treats over-100% months as a full stored share plus waste when it builds the taper.*
- **X. Calf weight after Mar 19.** Tim's 500 lb applies to the winter basis (Oct 1 – Mar 18) only; from Mar 19 the v2 Corral windows still carry the 566.99 kg event average. *Default: leave the recorded v2 windows as they are (the backfill doesn't rewrite v2 data).*
- Flags: 3/25 Corral 6 alfalfa vs v1 3/24 (*default: keep the 3/25 row*); events chosen for the notes rows that now win (*default: accept the dry run's choices*).

**Approved 2026-11-17 6:29 AM ET (Tim, via Orchestrator), backup first** — build per the [Build lock](HAY_FEEDING_BACKFILL_BUILD_LOCK_2026-11-17.md); each production step confirmed with Orchestrator. *Superseded text:* OI-0222 stayed PROPOSED. Migration 045 (the two history tables, historical feedings and historical animal basis; stamp 44 → 45), the backup and any backfill write each still need Tim's separate yes, with a fresh backup before any production change. Tim approved landing this docs branch (`docs/oi-0222-answers`) on 2026-11-17 at 6:12 AM ET, via Orchestrator (docs only, no GitHub publish); that yes covers no migration, backup or write.

## Sources

| Source | Where | What it covers |
|---|---|---|
| (a) v1 feedings the Apr 14 import dropped | v1 Supabase project (read-only), Tim's operation | 48 `event_feed_deliveries`, Mar 4 – Apr 13, 2026; 41 feed checks with 35 `type_checks_json` items |
| (b) Tim's hay notes | Orchestrator's box: `/workspace/gtho-backfill/tim-hay-inventory-notes-2025-26.md` (sha256 `b3f3b99e…`, verified; original zip beside it). **Not copied into the repo.** | Oct 1, 2025 – Mar 28, 2026: feedings, receipts, inventory counts |
| (c) What v2 already has | Production (read-only) | 19 events and 41 checks from the import (0 check items), Apr 9 onward feed entries, Nov 3 reconciles |

## Recommendation (first)

1. **Two lanes.** (i) **Mar 4 – Apr 13, 2026** (events exist in v2): insert real `event_feed_entries` and pool check items onto the already-imported v2 events. (ii) **Oct 1, 2025 – Mar 3, 2026** (no v2 events, no v2 batches): store as **historical feeding records** — date, quantity, unit, kg/unit, DM%, feed type, group/species, place, source key — used by reports and the OI-0221 monthly history, without inventing grazing events (question C).
2. **De-duplicate, never auto-pick.** v1 rows and note rows are matched on date (±1 day), place/event, feed type/batch and quantity; anything that doesn't match exactly is a conflict for Tim. For Mar 4 – Mar 20 the explicit match table is below.
3. **True up pre-summer batches to the fed numbers (decided).** For the three opening batches (Oak Field, Tarped, Peanut): reverse each Nov 3 reconcile with an offset and add one "true-up to fed" adjustment so receipt − fed + adjustments = **0 at the zero date** (recommend May 3, 2026; question M). **Alfalfa is the named exception** (Tim, N = A): trued up to fed and ends at today's 15, not 0. Batches received after summer (Oct–Nov 2026) are **not touched**; their `remaining` is unchanged (§4).
4. **Relabel the v1 starting stock** (Oak Field 45, Tarped 40, Peanut 17) as opening inventory dated Mar 15, 2026 (question E).
5. **Inventory counts in the notes are informational only** (decided under feeds-as-basis): the dry run shows the interval arithmetic for context; no adjustment is derived from them.
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
- **v1 has two extra batches not in v2:** "Mar 31 · E-3 · Alfalfa" 100 and 50 sq bales, $0 — not real hay (Tim, question I decided); ignored.
- **Event mapping:** the import gave v2 events random new ids and kept no v1 id. v1 has 19 events (Mar 4 – Apr 13); v2 has exactly 19 events with paddock windows opening before Apr 14 (created at import, Apr 14 10:07 PM ET). Map by natural key — v1 `date_in` + pasture name(s) ↔ v2 earliest paddock-window date + location name(s); the dry run lists every pair, and anything not one-to-one is a conflict.

**Tim's notes (source b)** — parsed to 87 feeding rows, 10 receipt rows, 4 inventory blocks (Orchestrator's reading verified, with the differences noted below):

| Month | Feeding rows | Bales fed | By type (grass / peanut / alfalfa sq / untyped) | To sheep |
|---|---|---|---|---|
| Oct 2025 | 14 | 58 | 0 / 0 / 0 / 58 | 0 |
| Nov 2025 | 11 | 80 | 0 / 0 / 0 / 80 | 0 |
| Dec 2025 | 8 lines (12/16 spread to 16 daily rows) | **122** (was 138 before pro-rating) | 12 / 0 / 0 / 110 | 0 |
| Jan 2026 | 17 lines (+4 pro-rated days) | **102** (was 86) | 42 / 24 / 0 / 36 | 0 |
| Feb 2026 | 20 | 92 | 48 / 16 / 0 / 28 | 8 |
| Mar 2026 (to 28th) | 17 | 85 | 57 / 3 / **21** / **4** | 16 |
| **Total** | **87 lines** | **539** (unchanged by pro-rating) | | |

Dec/Jan above use the default 12/16 start; with a 12/18 start Dec = 120.2 and Jan = 103.8 (§3a). Mar types reflect 3/28 "10 to sheep" = alfalfa.

- Type split starts Jan 14 (peanut vs grass); Dec 9–11 "old tarp bales" = grass (Tim, decided). Groups named: cows, sheep, corral group, Shenk group/cows, culls and calves. Places named: E4, J3, J2, Corral, Oak Field, barn.
- **Receipts:** ten 30-bale loads = 300 bales (10/17, 10/18, 10/24, 11/5 ×2, 11/7, 11/19 ×2, 11/21 ×2) — matches Orchestrator. No type, weight or price given.
- **Counts:** (1) undated, between 10/6 and 10/16: Barn 90, Straight 3 58, Tarp 30, Barnyard 19 = **197**; (2) "Trued up 11/4" — no figures; (3) 1/6: tarps 180, barn 57, peanut at Hines 60 = **297** ("98 days"); (4) 2/18: Red Barn 45 grass + 17 peanut, Tarp 1 60, Tarp 2 3, Outside 4 = **129** (112 grass, 17 peanut).
- "(N remaining)" = leftover at the feeding site (not fed amounts, not stack inventory); they could become pool check readings only where an event exists (not for winter).
- "Entered in GTHO below" sits at 3/18; "Not Entered" lists 3/25 Corral 6 alfalfa, 3/27 5 alfalfa to sheep, 3/28 10 to sheep + 1 to calves/Shenk culls.

**Ambiguous lines:** resolved by Tim — Dec 9–11 old tarp = grass; 3/28 "10 to sheep" = alfalfa; 12/16 "80" = set-out, pro-rated; 2/18 "Fed 28" timing closed. Still open but harmless under feeds-as-basis (informational only): the undated first count, "Trued up 11/4" without numbers, 1/6 "60 peanut – Hines". Still shown in the dry run: 3/17 "2 bales" untyped; 3/19 "16 bales oak field ) Fed" truncated; 3/20 "from barn removed from oak field"; group unknown for most rows before Feb; receipts without type or price. **Similar set-out pattern found:** 2/18 "Fed 28" is followed by 9 days with only sheep feedings (2/19) until the next cow feeding on 2/27 — question K asks whether to pro-rate it too (default: keep on its date). 12/12 "E4 18" is followed by a normal 4-day gap (next feeding 12/16), like 12/3 "16" → 12/7 and 3/13 "15" → 3/17, so it stays on its date.

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

**Outside the window:** v1 only — 3/23 alfalfa 26 sq, 3/24 alfalfa 48 sq (both Corral), 3/27 Oak Field 2 (E-1), Apr 1–13 Oak Field 17.8 net (corrected from 15.8 by the Nov 16 dry run; 16.8 stored after the J2 dedupe, decision 19). Notes only — 3/25 Corral 6 alfalfa (possible overlap with v1 3/23–24 Corral alfalfa; Tim says "not entered"), 3/27 5 alfalfa to sheep, 3/28 10 + 1. v2 already holds an Apr 9 J2 Oak Field 1 bale entered Apr 17; v1 has Oak Field at J2 on Apr 10–11 → possible duplicate, flag.

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

### 3a. December set-out pro-rating (decided; 12/16 start confirmed, K)

Spread 80 bales evenly from the set-out date through **Jan 4** (the day before the next recorded feeding, "1/5 – 2 bales"). Stored as one history row per day with source key `notes:<hash>:<line>:<day>`.

| Start | Days | Bales/day | Dec bales | Jan bales | Dec month total | Jan month total |
|---|---|---|---|---|---|---|
| **12/16 (notes; default)** | 20 (Dec 16–31 = 16, Jan 1–4 = 4) | **4.00** | **64** | **16** | 122 | 102 |
| 12/18 (note only — Tim confirmed 12/16) | 18 (Dec 18–31 = 14, Jan 1–4 = 4) | 4.44 | 62.2 | 17.8 | 120.2 | 103.8 |

Tim confirmed 12/16 (3:51 PM ET); the 12/18 row is kept for the record only.

**Batches for winter:** none created. The 300 received bales and the counted stock are recorded only as informational snapshot data in the dry run, not as inventory (they were all used or rolled into the v1 opening stock).

## 4. True-up to the fed numbers (decided basis; replaces "offsets keep today's inventory")

Nov 3 reconciles (read-only): Oak Field 37 → 0 (−37, effective May 3); Tarped 40 → 0 (−40, May 3); Peanut 17 → 0 (−17, May 3); Alfalfa 93 → 15 (−78, effective Nov 3). Total −172 vs 171.3 v1 units dropped.

**Rule (Tim):** fed records are truth; pre-summer stock ends at **0 at the zero date**, except Alfalfa, which ends at today's 15 (N = A). Per pre-summer batch: (1) append an offset that reverses its Nov 3 reconcile (adjustments are write-once; originals are never edited); (2) append one "true-up to fed" adjustment = fed − received, so received − fed + adjustments = 0 at the zero date. Positive true-up = bales fed that were never recorded as received; negative = recorded bales that were never there (or fed unrecorded).

**Which batches the true-up touches (read-only check, 2026-11-16):**

| Batch | Received / date | Fed (default B = v1; notes-only rows assigned as below) | Reverse reconcile | True-up to fed | `remaining` after | Today's `remaining` |
|---|---|---|---|---|---|---|
| Oak Field | 45, opening (Mar 15) | 57.86 = v1 41.8 + v2 11.06 (Apr 9 – May 3) + notes-only 5 (3/17 2, 3/18 2 grass "from barn", 3/28 1 to calves/Shenk) | +37 | **+12.86** | 0 at May 3 | 0 (unchanged) |
| Tarped | 40, opening (Mar 15) | 51 = v1 36 + notes-only 3/13 15 grass (tarp sequence) | +40 | **+11** | 0 | 0 (unchanged) |
| Peanut | 17, opening (placeholder Dec 31 → Mar 15) | 1 = v1 3/18 (3/19 corral peanut is in a conflict date; default v1) | +17 | **−16** | 0 | 0 (unchanged) |
| Alfalfa Small Squares | 100, purchase **Mar 24, 2026** | 134.5 = v1 92.5 (Mar 19, 23, 24) + notes-only 21 (3/25 6, 3/27 5, 3/28 10) + v2 21 (May 13–14 7, **Jul 6 7, Jul 27 7**) | +78 | **+49.5** (N = A) | 15 | **15** (unchanged) |

- Combined opening round bales: 102 received vs 109.86 fed → net +7.86. The notes-only batch assignments above are defaults the dry run shows for Tim to change.
- **Superseded by the 2026-11-17 rerun with Tim's dry-run answers (decisions 15–20):** Oak Field +8.86, Tarped −5, Peanut −15, Alfalfa −39.5 (ends unchanged: 0 / 0 / 0, Alfalfa 15); opening round bales 102 received vs 90.86 fed → net −11.14. Unchanged by R, S, T (decisions 21–23).
- **Alfalfa — named exception (decided, N = A).** The only pre-summer batch with `remaining` > 0 and the only Alfalfa batch in v2 (purchased Mar 24, 2026). It carried into summer: 7 squares fed May 13–14 and 14 in July (Jul 6, Jul 27; entered Jul 19 and Aug 3). Arithmetic: 100 received − 134.5 fed + (−78 reconcile + 78 reversal) + 49.5 true-up = **15**, today's value. The reconcile's "before" (93) = 100 − 7 (May only): the July 14 were never deducted, which the true-up absorbs. Adjustments dated Nov 3, 2026 (the reconcile's own date), since this batch has no zero date.
- **Possible double entry:** v1 alfalfa 3/23 (26 sq) and 3/24 (48 sq), both Corral, plus notes 3/25 Corral 6 "not entered" — flagged in the dry run; removing a duplicate lowers the Alfalfa true-up by the same amount (ending stays 15).
- **v1's two extra alfalfa batches** (Mar 31, E-3, 100 + 50 sq, $0): **not real hay** (Tim, I) — ignored, map to nothing.
- **Not touched (post-summer, received Oct–Nov 2026):** Grass Hay 1009 (30, 0 left), Grass Hay 1010 (60, 0 left), Grass Hay 1012 (90, 64 left), Peanut Hay 1012 (30, 29 left), "Week of 11-12-26" (150, 150 left). Their `remaining`, located balances and adjustments stay exactly as they are; invariant = before/after identical. (**Known, out of scope for now** per Orchestrator: Grass Hay 1010 shows 62 fed vs 60 received; Grass Hay 1009/1010 and Peanut Hay 1012 have feedings dated before their purchase dates. Not fixed by this backfill.)
- **Invariants:** Oak Field, Tarped, Peanut: received − fed + Σ adjustments = 0 at the zero date, and no feeding from them after it. **Alfalfa (named exception): received − fed + Σ adjustments = 15 = today's `remaining`**, unchanged. Post-summer batches: identical before/after. Located balances unchanged for every batch.

## 5. Opening inventory

- No DB constraint on `batches.source` (app-managed text; only `purchase` is in use). `opening` needs **no migration**, but the batch sheet's source picker shows only purchase/harvest, so editing an opening batch could silently relabel it — a small app change rides with OI-0220 (question E).
- Recommend `source = 'opening'`, `purchase_date` = 2026-03-15 for all three (Peanut currently 2025-12-31 placeholder).
- **Informational only (feeds-as-basis; question H closed):** the opening quantity no longer drives anything because the true-up makes each batch end at 0. For context: 2/18 count 129 (112 grass, 17 peanut) minus Feb 19 – Mar 13 feedings 49 (46 grass, 3 peanut) = 80 expected at Mar 15 vs v1 opening 102 (+22). If the opening was meant as of ~Mar 4 (v1 events start Mar 4 and v1 deducts Mar 4–13 feedings from it): 129 − 13 (Feb 19–27) = 116 vs 102 (−14). Red Barn 45 grass / 17 peanut on 2/18 = Oak Field 45 / Peanut 17 exactly, so the barn figures look carried straight from 2/18; Tarped 40 vs 67 tarp/outside on 2/18.
- OI-0221: opening stock is **opening on-hand**, not a receipt in the 2025-26 period; its $45/bale stays as valuation for cost of feed fed.

## 6. Inventory snapshots (informational only — decided)

Under feeds-as-basis the counts don't create adjustments and don't gate the apply. They stay in the dry run as context, so Tim can see how far the counts drifted from the fed records (pro-rating doesn't change these intervals: all 80 set-out bales fall before the 1/6 count).

| Interval | Start count | + Receipts | − Fed (notes) | Expected | Next count | Variance |
|---|---|---|---|---|---|---|
| ~Oct 16 → Jan 6 | 197 | 300 | 267 | 230 | 297 | **+67** (+7 if the 60 Hines peanut was outside the Oct count) |
| Jan 6 → Feb 18 | 297 | 0 | 160 | 137 | 129 | **−8** (peanut 60 − 38 = 22 vs 17: −5) |
| Feb 18 → Mar 15 (v1 opening) | 129 | 0 | 49 | 80 | 102 | **+22** (see §5) |

Assumes counts are taken after that day's feeding.

## 7. Species, groups and the historical animal basis

**Decided (Tim, 3:51 PM ET):** sheep were on the farm Oct 2025 – May 2026; goats were not. Sheep feedings count as fed, and sheep join the historical DMI basis. Without sheep demand in the denominator, counting sheep hay as fed would inflate the historical stored-feed share % (the OI-0221 taper) and therefore next season's budget; including sheep DMI removes that bias.

**What v2 has today (read-only, 2026-11-16):**
- `species` exists only on `animal_classes` (app list: beef_cattle, dairy_cattle, sheep, goat, other). `groups` has no species; `animals` has `is_bulk` + `bulk_head_count`; `event_group_windows` carry `head_count` and `avg_weight_kg` per event.
- No group existed for sheep last winter. A history row could technically reference today's Sheep group, but that group was created Nov 5, 2026 and would misdate the flock — so historical rows **do not link a group**.
- **Current sheep (aggregates):** "Sheep" group (created Nov 5, 2026; first event window Nov 6): bulk Ewes 52 head, recorded total 6,500 lb (≈125 lb avg; class Ewe default 150 lb, DMI 3%), bulk Rams 2 head, 300 lb (≈150 lb; class Ram default 198 lb, DMI 2.5%). "Ram Lambs – Sale" group (since Nov 9, 2026): 16 ram lambs, 1,120 lb (≈70 lb) — almost certainly born in 2026, so not part of last winter's flock by default. Sheep group event windows peak at 82 head (≈126 lb avg) — differs from the 70 members; this only mattered for a pre-fill, which J = A replaces.
- **Goats:** one bulk Doe record, 59 head, "Goats" group created Nov 5, 2026 — excluded from last winter.
- **Last winter's sheep basis (Tim, J = A, 4:05–4:06 PM ET):** sheep, Oct 2025 – May 2026, **80 head at an average of 110 lb** (≈ 8,800 lb live weight). The difference from today's flock is last year's offspring, not ewes. Illustrative only, at the Ewe class 3% DMI: ≈ **264 lb DM/day** (≈ 0.48 round bale of 550 lb DM per day); the stored DMI% snapshot is set when the entry is made.
- Superseded pre-fill (current flock, not used): 52 ewes × 125 lb × 3% + 2 rams × 150 lb × 2.5% ≈ 203 lb DM/day.

**Exclusion rule (who counts in a historical period):** a species/group counts in a period only if it was on the farm then. Evidence, in order: (1) event group windows and membership dates inside the period; (2) Tim's per-period historical basis entries (below) for animals that had no records then. Anything with neither — e.g. goats, or any group whose first record is after the period — is excluded. Group start dates alone can't place the sheep (their records start Nov 2026), so for last winter Tim's entry (80 head ≈110 lb, Oct 2025 – May 2026) is the evidence.

**Design need (no SQL):** the history feeding table (question C) carries `species` (same value list as `animal_classes`), optional `class_id`, **nullable `group_id`**, and a free group label, so a sheep row is valid with no group. A sibling **historical animal-basis** table (or a row type in the same table): operation, period start/end, species, optional class, head count, average weight, DMI% snapshot, source (Tim entry / pre-fill), notes. **J = A: Tim enters it himself, so this record needs an entry point in the app** (where it lives is not yet specified). OI-0221 adds its demand to group-window demand for that period. Both go in CP-55/CP-56; same migration as C.

## 8. Bale weight and DM (question F)

| Feed | v2 batch values today | v1 values | Proposed for backfill |
|---|---|---|---|
| Round grass (Oak Field, Tarped, winter grass) | Oak Field 647 lb · 85%; Tarped null; 2026 grass 600 lb · 90% | 750 lb · 85% | **647 lb · 85%** (550 lb DM ≈ 249 kg DM/bale) — Tim's own corrected v2 figure for that stock |
| Peanut round | old Peanut null; Oct 2026 peanut 600 lb · 90% | 750 lb · 85% | 647 lb · 85% unless Tim knows better |
| Alfalfa small square | 50 lb · 85% | 50 lb · 85% | 50 lb · 85% (42.5 lb DM) |

Illustrative winter DM at 550 lb DM/bale (round) and 42.5 lb (alfalfa squares), before de-dup, 12/16 pro-rate: Oct ≈ 31,900 lb; Nov ≈ 44,000; Dec ≈ 67,100; Jan ≈ 56,100; Feb ≈ 50,600; Mar ≈ 36,100 (64 round + 21 sq). Final numbers come from the dry run.

## 9. Dry-run report (Tim reviews before any write)

1. Header: source file hash, v1/prod read time, rule set, OI-0220 unit folding applied.
2. Rows to insert, grouped by source and lane (entries, carries, check items, history records), with month totals in units, as-fed and DM.
3. Matched pairs (v1 ↔ notes ↔ v2), duplicates skipped, and **conflicts** with both sides shown and a blank decision column.
4. Event pairing table (v1 event ↔ v2 event).
5. Per pre-summer batch: reconcile reversal, true-up to fed, and the arithmetic in §4 (received − fed + adjustments = 0 at the zero date); likely double entries (Mar 23–24 alfalfa) highlighted.
6. Per post-summer batch: `remaining` and located balance before/after — must be identical.
7. Monthly DM fed before vs after (Oct 2025 – Nov 2026).
8. Inventory snapshot variances (§6, informational).
9. Opening-inventory relabel and date changes.
10. Ambiguous lines and how each was treated.

## 10. Backup, apply, verify, rollback

- **Who:** Orchestrator runs it with Build-written tooling (a one-time script outside the app, reviewed by Design); the plan is the checklist. No SQL file is added to the repo by Design.
- **Steps:** (1) OI-0220 shipped and the `Bale` batch fixed; (2) if question C = A, the history-table migration is applied first under its own approval + backup; (3) generate the dry run from fresh reads; (4) Tim's explicit yes on that exact report (by its hash); (5) fresh backup, Nov 11 style — SQL/JSON of every affected table (events, event_feed_entries, event_feed_checks, event_feed_check_items, batches, batch_adjustments, batch_location_balances, history table) to Orchestrator's box; (6) apply in one transaction, all-or-nothing, re-checking that the backed-up state is unchanged first; (7) verify invariants, row counts per source, monthly DM equal to the dry run, idempotent re-run = 0 inserts, and a CP-55 export that round-trips; (8) rollback = delete by the deterministic backfill ids + remove reversal and true-up adjustments + restore relabels in one transaction, or restore the affected tables from the backup.
- Stays within the schema-44 client; no client release unless question C = A (migration + compatible release) or the opening-source picker change ships.

## Lettered questions (recommended answer first)

Decided or closed by Tim (3:43–4:06 PM ET): D, E, G, H, I, J, K, L, N. At defaults, decided in the dry run (Tim, 4:05–4:06 PM ET): A, B, M. Defaults with no change requested: C, F. Dry-run questions O, P, Q and B per row answered 2026-11-17 5:00 AM ET, R, S, T 5:58 AM ET and V, U 6:12 AM ET (via Orchestrator); W, X default adopted (Orchestrator 6:20 AM; Tim has not objected). Letters stay stable.

- **A. Scope:** backfill Oct 1, 2025 – Apr 13, 2026 from both sources? Recommend: yes, both lanes. *Default — stays at the recommendation (Tim, 4:05–4:06 PM ET); confirmed in the dry run.*
- **B. Conflicts in Mar 4 – 20** (3/4, 3/6, 3/19, 3/20): which wins? Recommend: decide each in the dry run; default v1 (entered at the time, tied to events). *Default v1 (Tim, 4:05–4:06 PM ET); each decided in the dry run.* **Decided per row (Tim, 2026-11-17 5:00 AM ET, via Orchestrator): notes for Mar 4, 19 and 20; Mar 6 moot after O.**
- **C. Winter storage:** A historical feeding records table (recommended; carries species with a nullable group link, §7), B backfilled events, or C monthly summaries? *Default A — no change requested yet.*
- **D. Reconciles — DECIDED:** feeds are the basis; pre-summer batches are trued up to the fed numbers with reconcile reversals + true-up adjustments, ending at 0 at the zero date (§4). Over-runs (Oak Field, Alfalfa) resolve toward fed.
- **E. Opening stock — DECIDED:** relabel Oak Field, Tarped, Peanut as `opening`, dated Mar 15, 2026, valued at **$45/bale** (Tim, 3:52 PM ET).
- **F. Bale weights:** 647 lb · 85% for winter round (grass and peanut), 50 lb · 85% alfalfa squares (recommended). *Default — no change requested yet.*
- **G. Checkpoints — CLOSED:** snapshots are informational only. The Hines 60 peanut timing no longer matters (it only moved a snapshot variance; winter rows are history records with no inventory).
- **H. Opening date — CLOSED as a reconciliation question:** under feeds-as-basis the true-up makes each opening batch end at 0, so whether the stock was as of Mar 15 or Feb 18 no longer changes any number. E still sets the label date (Mar 15).
- **I. Extra v1 alfalfa batches — DECIDED:** not real hay; ignored (Tim, 3:51 PM ET).
- **J. Historical sheep basis — DECIDED (A, Tim, 4:05–4:06 PM ET):** Tim enters it himself; recorded value: sheep, Oct 2025 – May 2026, 80 head at an average of 110 lb (the difference from today's flock is last year's offspring, not ewes); goats excluded. Options as presented:
  - **A (recommended):** you enter an approximate head count and average weight (or class) for last winter — one value, or one per month if it changed — stored as a historical animal-basis entry (§7).
  - B: backdate the current flock (52 ewes ≈125 lb + 2 rams ≈150 lb, ram lambs excluded) to Oct 2025 – May 2026. Simple, but wrong if the flock size changed (lambing, sales).
  - C: B as a pre-filled default that you confirm or edit per month.
- **K. December set-out — DECIDED:** pro-rated from **12/16** (Tim confirmed), 4.00/day through Jan 4 → Dec 64 / Jan 16. 2/18 "Fed 28" stays on its date. 12/12 E4 18 stays on its date. (Note: a 12/18 start would have been 4.44/day, Dec 62.2 / Jan 17.8.)
- **L. Ambiguous lines — DECIDED/CLOSED:** 3/28 "10 to sheep" = alfalfa; old tarp bales = grass; 2/18 "Fed 28" timing doesn't matter.
- **M. Zero date for the three round-bale opening batches:** May 3, 2026 (recommended default — last recorded feeding from them and the date the Nov 3 reconciles use) or Jun 1, 2026? *Default May 3 (Tim, 4:05–4:06 PM ET), decided in the dry run; low-stakes:* N = A takes Alfalfa out of it, and for Oak Field, Tarped and Peanut no feeding falls May 4 – Jun 1, so the choice only sets the adjustments' date, not any number.
- **N. Alfalfa — DECIDED (A):** carried into summer; trued up to fed (+49.5) and keeps today's 15 (Tim, 3:51 PM ET). After the dry-run answers the true-up is −39.5 (decisions 15–17); the ending stays 15.
- **O. v1 copy rows — DECIDED:** remove the 12 (Tim, 2026-11-17 5:00 AM ET, via Orchestrator).
- **P. Sheep alfalfa Mar 27–28 — DECIDED:** left out entirely (Tim, 2026-11-17 5:00 AM ET).
- **Q. Winter cattle basis — DECIDED:** the Mar 4 cattle groups copied back to Oct 1 (Tim, 2026-11-17 5:00 AM ET).
- **R. Mar 4 sheep peanut — DECIDED:** left out entirely (Tim, 2026-11-17 5:58 AM ET, via Orchestrator).
- **S. Alfalfa −39.5 write-down — DECIDED:** accepted, no extra feeding rows (Tim, 2026-11-17 5:58 AM ET, via Orchestrator).
- **T. Winter cattle roster — DECIDED:** the Mar 19 groups were there all winter; included from Oct 1 at their first-seen windows (Tim, 2026-11-17 5:58 AM ET, via Orchestrator).
- **U. Mar 4–18 roster — DECIDED:** the full herd extends through Mar 18 (Tim, 2026-11-17 6:12 AM ET, via Orchestrator).
- **V. Calf weight — DECIDED:** Mixed Calves at 500 lb in the winter basis, DMI 2.5% (Tim, 2026-11-17 6:12 AM ET, via Orchestrator).
- **W. Dec–Feb fed above predicted intake (141% / 118% / 108%):** accept as recorded, no change (recommended default). *Default adopted (Orchestrator 6:20 AM; Tim has not objected); Tim did not object when told of the over-100% Dec–Feb.*
- **X. Calf weight after Mar 19:** leave the recorded v2 Corral windows (566.99 kg event average) as they are (recommended default). *Default adopted (Orchestrator 6:20 AM; Tim has not objected).*
