# OI-0221 — Stored forage budgeting and management

**Date:** 2026-11-16 | **Owner:** GTHO Design | **Status:** PROPOSED — awaiting Tim's approval. **Build starts nothing until Tim approves this spec.** Docs only; no code, no SQL, no data change.
**Depends on:** OI-0220 (feed unit cleanup) ships first. Voice / OI-0215 stays on hold and is not part of this.
**Base:** Forgejo `main` `ce1c987d` (read only; 044 applied and ceiling-44 client published 2026-11-11). Live figures: read-only SELECTs on production, 2026-11-16 ~3:08 PM ET; aggregates only.

## Tim's request (2026-11-16, 3:03–3:09 PM ET, relayed by Orchestrator)

1. Look at any period; default is one growing season and feeding cycle.
2. See how much hay was fed, and when, in a prior period (by month to start) and use it to budget the current period.
3. Adjust for the change in animals: historical pattern pro-rated to the current period and animals.
4. An easy mobile and desktop view that gamifies the current period — budget vs prior year vs actual run rate, with budgeted cost and actual cost/savings — as an incentive to graze better.
5. A smarter, date-based feed need for the season, replacing or supplementing the days-on-hand goal, tapering down in spring and back up in fall.
6. On the day the budget is opened, forecast a season surplus or deficit from live data.

## Decided by Tim (recorded, not open)

- **D1 — Default period is June 1 to May 31** (3:05 PM). Any other start/end can be picked.
- **D2 — The budget runs on dry matter (DM), not hay type** (3:05 PM). DM per bale is what matters. Peanut Hay stays filed under the grass feed type; no reclassification.
- **D3 — Fix the bale unit mix-up first**, as its own item (OI-0220), ahead of this build (3:05 PM).
- **D4 — Forecast formula** (3:09 PM, correcting 3:07): savings are already sitting in the barn, so they are never added to on-hand.
  - The budget implies a **budgeted on-hand level as of today**. Show **budgeted on-hand vs actual on-hand** today; the difference is the variance (e.g. budgeted 100, actual 120 thanks to better grazing → +20).
  - **Season forecast = actual on-hand DM − remaining budgeted DM need from today through May 31** (with the taper). Positive = surplus, negative = deficit.
  - **Savings to date is the explanation of the variance**, never an extra quantity.

## Recommendation (summary)

1. Build a **monthly stored-feed history** for any date range: DM fed, cost, and animal demand (DMI) per month, from existing feed entries, batches and group windows. No migration for this first slice.
2. Budget each month as **projected herd DM demand × a "stored-feed share" % for that month**. The share curve is the seasonal taper (low in summer, ~100% in deep winter). It is pre-filled from the prior period's actual share where records exist and is editable by Tim. Using DMI demand adjusts for herd size and weight automatically.
3. **Freeze the budget** at the start of the season (stored rows, one new migration numbered after the already-applied 044) so "beat the budget" stays honest when data changes.
4. Cost: actual = what the bales fed cost (existing CST-1 logic); budget cost = budget DM × the season's price per DM.
5. **Gamified card on the Feed screen** (mobile first; desktop adds the monthly chart): this-month and season-to-date vs budget vs last season, savings in $ and DM, today's on-hand variance, and the season surplus/deficit forecast (D4), plus a run-rate version.
6. **Supplement the days-on-hand goal** first with "Hay covers through <date>" against the budget curve; retire or repurpose the fixed-day goal later (question).
7. Phasing: OI-0220 → history report → budget + card + forecast → days-on-hand replacement.

## 1. What existing data supports monthly fed amounts

**Tables/columns (V2_SCHEMA_DESIGN.md §4, §5; migrations 037, 043):**
- `event_feed_entries`: `date`, `quantity` (in batch units), `batch_id`, `entry_type` (`delivery`/`removal`), `destination_type`, `source_event_id`, and from 043 `kind` (`inventory_feeding`, `pool_carry`, `pool_removal`), `feed_type_id`, `unit_snapshot`, `weight_per_unit_kg_snapshot`, `dm_pct_snapshot`, `return_batch_id`.
- `batches`: `unit`, `weight_per_unit_kg`, `dm_pct`, `cost_per_unit`, `purchase_date`, `quantity`, `remaining`, `archived`, `source`.
- `feed_types`: `unit`, `default_weight_kg`, `dm_pct`, `category`.
- `batch_adjustments`: `delta`, `reason`, `adjustment_date` (reconcile/waste/sold).
- `batch_location_balances`: per-location quantity (037).
- `event_feed_checks` / `event_feed_check_items`: remaining-on-paddock readings (consumption, not stack use).
- Animals over time: `event_group_windows` (`date_joined`, `date_left`, `head_count`, `avg_weight_kg` snapshots), `animals`, `animal_group_memberships`, `animal_weight_records`, `animal_classes.dmi_pct` / `dmi_pct_lactating`; calcs DMI-2 and ANI-AU (1 AU = 453.6 kg) in `src/calcs/`.

**"Fed" means feed that left the stack** (recommended; question B):
- Count: legacy rows (`kind` null) with `entry_type = 'delivery'` and no `source_event_id`, plus `kind = 'inventory_feeding'`.
- Subtract: removals returned to inventory (`destination_type = 'batch'`, incl. 043 `pool_removal` with a returned-feed batch).
- Ignore: event-to-event carries/transfers (`pool_carry`, legacy transfer pairs) — the same hay moving, not new hay.
- Paddock waste/residue counts as fed (it left the stack). Reconcile waste/spoilage in the barn (`batch_adjustments`) is shown separately as "shrink", not as feeding.

**Converting to DM:** quantity × kg per unit × DM% / 100, using the 043 snapshot when present, otherwise the batch's `weight_per_unit_kg` and `dm_pct`. Missing weight or DM% is "unknown", never 1 kg (today's banner falls back to 1 kg per unit; the budget must not).

**Month attribution:** by the feed entry's `date` (the farm's local date). A big set-out (e.g. bale grazing laid out for several weeks) lands entirely in the set-out month. Spreading it by feed checks (DMI-5) is possible later (question C).

**Cost:** `cost_per_unit` of the batch fed (CST-1 in `src/calcs/feed-forage.js`; reports already exclude pool carries/removals from cost).

## 2. What production holds today (aggregates)

One operation, one farm. Feed entries run **2026-04-09 to 2026-11-13 (34 rows)**; feed checks from 2026-03-09 (92); group windows from 2026-03-04 (267). No removals or carries recorded yet. Every feed entry has a usable weight, DM% and cost.

| Month | Feed entries | Units fed | DM fed | Cost | Head-days* | AU-days* |
|---|---|---|---|---|---|---|
| 2026-03 | 0 | — | — (not recorded) | — | 1,926 | 1,825 |
| 2026-04 | 11 | 10.06 bale | 2,510 kg (5,534 lb) | $452.70 | 2,825 | 2,456 |
| 2026-05 | 4 | 8 (bale + sq bale) | 384 kg (847 lb) | $80.00 | 2,619 | 2,274 |
| 2026-06 | 0 | — | 0 | $0 | 1,686 | 1,557 |
| 2026-07 | 2 | 14 sq bale | 270 kg (595 lb) | $70.00 | 2,744 | 2,449 |
| 2026-08 | 0 | — | 0 | $0 | 3,556 | 3,172 |
| 2026-09 | 0 | — | 0 | $0 | 3,622 | 3,188 |
| 2026-10 | 7 | 72 bale | 17,636 kg (38,880 lb) | $4,032.00 | 3,094 | 2,673 |
| 2026-11 (1–13) | 10 | 47 bale | 11,512 kg (25,380 lb) | $2,632.00 | 3,244 | 1,337 |

*Head-days and AU-days are summed from group-window snapshots and may double-count overlapping windows; November AU-days look low against head-days and one window opened in July is still open. These need checking before they drive a budget.

**Season to date (Jun 1 – Nov 13, 2026):** ~29,400 kg DM (~64,900 lb) fed, $6,734.
**On hand now:** 4 live batches, 258 units (15 sq bales + 243 round bales), ~59,800 kg DM (~131,900 lb). Last physical count (reconcile) 2026-11-03. Farm `feed_day_goal` = 150 days.

## 3. Data gaps and quality

- **No full prior season.** v2 records start March 2026. The default prior period (Jun 2025 – May 2026) has only April–May feeding; December–March feeding is missing (batches bought 2025-12-31 and 2026-03-15 — 102 bales — show winter hay that was never recorded as fed). So the first budget can't come purely from history (question A).
- **Units:** `Bale` vs `bale`, and `sq bale` not on the verified list — fixed by OI-0220 first. No `bal` remains.
- **Peanut Hay under grass type:** left as is (D2); DM per bale carries it.
- **Inventory drift (FA-01):** live batches' `remaining` totals 258 units but located balances total 179; two of four live batches have no located balance. Not repaired here; the budget's on-hand uses `remaining` and flags the mismatch (§7).
- **Feed types with no default weight** (both round-bale types): batches carry their own weights, but a new batch without a weight would be "unknown DM" — flag it.
- **Deliveries ≠ consumption:** a month's figure is hay put out, not hay eaten; leftover still on a paddock at month end belongs to the month it was put out.

## 4. Animal adjustment

Recommend **DMI (dry-matter demand)** as the basis (question D):
- Head counts ignore size (a calf ≠ a cow); AU fixes size but not class intake differences. DMI uses each animal's weight and class DMI% (DMI-2), which the Feed screen already computes farm-wide today.
- Historical demand per month: from group windows (head × avg weight × class DMI% × days in the month). Current/planned demand: today's farm-wide active-animal DMI (as the days-on-hand banner does), held flat across the remaining months, with optional planned changes (sales, weaning, calves) entered later.
- Show AU and head beside it for readability; the math uses DMI.

## 5. Seasonal taper

Recommend **"stored-feed share" per month**, pre-filled from history, editable (question E):
- Share = stored DM fed ÷ herd DM demand for the month (e.g. July ~0%, October ~25%, January ~100%).
- **Monthly budget DM = projected demand for the month × share.** Spring taper = share falling March→May as grass comes on; fall ramp = share rising Sept→December.
- Pre-fill from the prior period where months are recorded; where missing (this year, Dec–Mar) use a simple default curve Tim edits. On desktop the curve is a 12-point editor; on mobile a month list with %.
- Pro-rating partial months by days.

## 6. Budget storage — migration needed

Recommend a **stored, frozen budget** (question F). Computing on the fly would make "beat the budget" move every time a weight or animal changes.
- Design level only, no SQL file: a budget header per farm and period (start/end dates, status draft/locked, price per DM basis, opening on-hand DM and its date, notes) and 12 monthly rows (month, demand DM, share %, budget DM, budget cost). Operation-owned, member RLS like other farm data; included in CP-55/CP-56 backup with a new schema step.
- It is a new numbered migration after 044 (044 is already applied; production stamp 44, compiled ceiling 44 since 2026-11-11), so it would take stamp/ceiling 45 or later. Writing the file needs Tim's approval of this spec; applying it needs Tim's explicit yes at the time plus a backup.
- Slice 1 (history report) needs **no** migration.

## 7. Forecast on the day the budget is opened (D4, decided)

Everything in DM; dollars beside it.

- **Actual on-hand DM (today)** = Σ live batches `remaining` × kg/unit × DM% (as the Feed screen does), but missing weight/DM = unknown, not 1 kg.
- **Budgeted on-hand DM (today)** = opening on-hand DM at season start + receipts to date − budgeted feeding to date (pro-rated through today).
  - **Opening on-hand** (question G): recommend reconstruct June 1 on-hand from today's `remaining` + DM fed since June 1 − DM received since June 1 + shrink since June 1, shown for Tim to confirm or override when he locks the budget. (This first season is reconstructed; later seasons use the locked figure.)
  - **Receipts** (question H): recommend actual receipts (new purchase/harvest batches by `purchase_date`) count on **both** sides as they arrive, so the variance shows only feeding performance (plus shrink). Alternative: a planned purchase schedule in the budget.
- **On-hand variance** = actual − budgeted. Explained as: savings to date (budgeted fed − actual fed) − shrink (barn waste/sold/count corrections). Savings explains the number; it is never added on top.
- **Season forecast (budget pace)** = actual on-hand − remaining budgeted need (today → May 31, current month pro-rated). Surplus if positive, deficit if negative. Shown as DM, bales of the current main batch, and $ at the season price.
- **Run-rate variant:** remaining need × (actual fed ÷ budgeted fed over the last 30 days, or season to date if shorter) — "at your recent pace". Shown as a second, smaller line; the budget-pace number is the headline (question I).
- **Purchases ordered but not received** are not tracked today; they are not in the forecast unless planned purchases are added (question H).

**Stale or missing on-hand** (question J):
- "Verified" date = latest reconcile (`batch_adjustments.adjustment_date`) across live batches, or a batch's purchase date if it arrived after the last count. Feeding entries keep `remaining` current between counts, so the count mostly catches shrink and missed entries.
- Fresh ≤ 30 days: normal. 31–60 days: show with an amber "last counted N days ago" tag. > 60 days, no count ever, any live batch with unknown weight/DM, or `remaining` vs located-balance mismatch: **degrade to the budget-only view** (budget vs actual fed, no on-hand variance, no surplus/deficit) with a "Count your hay" button that opens Reconcile.
- Today this farm would be **fresh** (counted Nov 3) but flagged for the located-balance mismatch.

## 8. Cost basis

- **Actual cost** = Σ quantity × batch `cost_per_unit` for hay that left the stack (CST-1). Carries and returns cost nothing; a returned-feed batch has no purchase price, so re-feeding it costs $0 (its cost was counted when first fed).
- **Budget price per DM** = weighted average $/kg DM of hay on hand at budget lock (cost_per_unit ÷ (kg/unit × DM%)), editable. Today's live batches run about $0.23 per kg DM for round bales and $0.26 for alfalfa squares (~$0.10–0.12 per lb DM).
- **Savings vs budget** = budget cost to date − actual cost to date. **Vs last season** = same-date cumulative actual for the prior period, scaled by DMI demand.
- Batches with no cost are flagged and excluded from $ (DM still counts).

## 9. Days-on-hand setting today and how this relates

- Today: `farm_settings.feed_day_goal` (default 90; this farm 150, range 7–365), set in Settings and on the Feed screen. Feed screen banner (`src/features/feed/index.js` ~340–425; V2_UX_FLOWS §13): DM on hand ÷ today's farm-wide DMI = days on hand; green ≥ goal, amber 33–99%, red < 33%.
- Its weakness: it assumes every day needs 100% stored feed and ignores the season.
- Proposal: **supplement first** — add "Hay covers through <date>" by walking on-hand DM forward through the budget's monthly need (with taper), and "Season need remaining" vs on hand. Later either retire the fixed goal or turn it into a reserve: "days of carry-over past May 31" (question K).

## 10. Views (design level)

**Mobile — Feed screen, top card "Season hay budget"** (above or replacing the days-on-hand banner). Figures below are illustrative only:
- Big headline: **Season forecast: +18,000 lb DM surplus** (green) / deficit (red), with "≈ N bales".
- Row: **On hand today vs budget**: 131,900 vs 120,000 lb DM → **+11,900 ahead**; tap for "why": saved 13,000 by grazing, −1,100 shrink.
- This month and season to date: actual vs budget vs last season (three slim bars), $ saved.
- Small "At your recent pace: …" line. Staleness tag or "Count your hay" when degraded.
- Gamification: a "pace" badge (ahead/on/behind), months-under-budget streak, and the $ saved this season. Tone: plain and encouraging, no points.

**Desktop — Feed screen panel + Reports page:**
- Monthly bar chart across the period (budget bar, actual bar, last-season line) and a cumulative line with today's marker and the projected path to May 31.
- Table by month: demand DM, share %, budget DM, actual DM, last season, $ budget, $ actual, $ saved.
- Period picker (default Jun 1 – May 31, any range); budget editor (share curve, price, opening on-hand) behind an Edit button; lock/unlock.

**Reports (any period, slice 1):** "Stored feed by month" — DM fed, as-fed, units by feed type, $ cost, demand, stored share, head/AU-days.

## 11. Phasing — Build starts nothing until Tim approves

0. **OI-0220** unit cleanup and prevention (no migration).
1. **History report** for any period (no migration): monthly DM fed, cost, demand, share; data-quality flags.
2. **Budget + gamified card + forecast** (new stored-budget migration after the applied 044; Tim's yes + backup to apply).
3. **Days-on-hand supplement/replacement** and planned herd changes.

CP-55/CP-56: slices 0–1 none; slice 2 adds the budget tables to export/restore with a schema step.

## Lettered questions (recommended answer first)

- **A. First budget with thin history (no Dec–Mar records).** Recommend: start from DMI demand × a default share curve you edit, using the months we do have (Apr–May, Oct–Nov) to set those points; optionally you enter last winter's bale counts by month (from purchases/memory) as a one-time "prior season" estimate. Alternative: wait a full season.
- **B. What counts as "fed"?** Recommend: hay that left the stack (deliveries, minus returns to inventory; carries ignored; paddock waste counts as fed; barn shrink shown separately).
- **C. Month attribution.** Recommend: the feeding date for now; spreading big set-outs across later checks is a later refinement.
- **D. Animal adjustment basis.** Recommend: DMI (weight × class DMI%), with head and AU shown for reference.
- **E. Seasonal taper.** Recommend: monthly stored-feed share %, pre-filled from history where it exists, default curve elsewhere, editable by you.
- **F. Stored, locked budget (migration) vs computed on the fly.** Recommend: stored and locked at season start, editable with a re-lock, so the "beat the budget" target doesn't drift.
- **G. Opening on-hand for budgeted on-hand.** Recommend: app reconstructs June 1 on-hand from records; you confirm or override when locking. Later seasons carry the locked figure.
- **H. How receipts during the season enter budgeted on-hand.** Recommend: actual receipts count on both sides as they arrive (variance = feeding performance + shrink). Alternatives: a planned purchase schedule entered with the budget, or (later) ordered-not-received purchases.
- **I. Run-rate window.** Recommend: last 30 days (or season to date if shorter), shown second to the budget-pace forecast.
- **J. Staleness thresholds.** Recommend: fresh ≤ 30 days since last count, amber 31–60, budget-only view with "Count your hay" beyond 60 days or when weight/DM is unknown or inventory locations disagree.
- **K. Days-on-hand goal.** Recommend: keep it for now and add "Hay covers through <date>"; later replace it with a carry-over reserve past May 31.
- **L. Where it lives.** Recommend: card at the top of the Feed screen (mobile and desktop), full view in Reports; not on the Home dashboard at first.
- **M. Budget price.** Recommend: weighted $/DM of hay on hand at lock, editable.
