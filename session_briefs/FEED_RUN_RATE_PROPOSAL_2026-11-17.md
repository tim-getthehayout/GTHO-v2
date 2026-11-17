# OI-0224 — Feed run rate from feed checks (Feed screen card)

**Date:** 2026-11-17 | **Owner:** GTHO Design | **Status:** **APPROVED by Tim (2026-11-17 6:12 AM ET, via Orchestrator) — ready for Build.** C answered; A, B, D–H accepted at Design's defaults; landing this doc approved (docs only, no GitHub publish). Docs only; no code, no SQL, no data change.
**Requested:** Tim, 2026-11-17 6:02 AM ET (relayed by Orchestrator).
**Base:** Forgejo `main` `73442873` (PR #60 merge; read only). Live figures: read-only SELECTs on production, 2026-11-17 ~6:20 AM ET; aggregates only.
**Decided:** see "Decided by Tim" below.
**Related:** OI-0221 (stored forage budget; DM basis, DMI-adjusted forecast, cost rule D5), OI-0220 (feed units, done), FA-26 (feed pools).
**On hold (Tim, 2026-11-17 6:27 AM ET, via Orchestrator: "Actually wait"):** the Build handoff is ON HOLD until further notice. The spec stays APPROVED; Build does not start.
**Also on the OI-0221 scorecard (Tim, 2026-11-17 6:28 AM ET, via Orchestrator):** see §6.

## Tim's request (verbatim, 2026-11-17 6:02 AM ET, via Orchestrator)

> "In the feed data card I think we should also include a run rate feature. Pills to select date range- 7 days, 14, 30, 60 and display the bales per day based on feed checks. Show, consumed as well as residual, and totals for each in bales, dollars, and DMI (actual vs forecast)"

## Decided by Tim (2026-11-17 6:12 AM ET, via Orchestrator)

- **C — "Residual means hay left or wasted when an event closes".** Residual is the hay left behind at an event's close (left in the field or wasted), not hay still out on an open event. Definition, data source and display below.
- **A, B, D, E, F, G, H — "Accept the other run-rate defaults".** Each is recorded at Design's recommended default (see the decided list at the end).
- **Landing — "Yes, land both docs changes with these answers, no GitHub publish".** Covers this spec and `docs/oi-0222-answers`; docs only.

## Recommendation (summary)

1. Add a **Run rate** section to the Feed screen's summary card (the Feed Day Goal card) with four pills: **7 · 14 · 30 · 60 days**, default **30**. The window is the trailing N days ending today.
2. **Consumed** comes from feed checks only: per feed pool, between consecutive checks, consumed = remaining at the earlier check + feed delivered in between − remaining at the later check, spread evenly over the days between them. This is the existing pool daily-actual model (FA-26 pools, DMI-5). Days not bracketed by two checks are **not measured** and are not filled in.
3. **Residual** = hay left or wasted when an event closes (Tim, C): for each event whose close date falls in the window, what its close reading says was left in each pool, less anything later moved out of that pool to another event or back to storage.
4. Show, for the window: **bales per day** (consumed ÷ measured days), and **totals for consumed and residual in bales, dollars and lb DM**, plus **DMI actual vs forecast** (consumed stored DM per day vs the herd's predicted daily DMI; E).
5. Farm-wide (all events) on the Feed screen. A per-event version can follow (F, decided).
6. No schema change, no migration, no CP-55/CP-56 impact: everything is computed on read from existing feed entries, checks, check items, batches, group windows and animals.

## 1. What exists today (read from code at `73442873`, read only)

- **The card.** The Feed screen (`src/features/feed/index.js`) opens with one summary card, the **Feed Day Goal banner** (CP-26; "Feed on hand" summary card in `V2_DESIGN_SYSTEM.md`): days on hand vs goal, three stat cells (**DM on Hand**, **Daily Run Rate**, **Days on Hand**) and a progress bar. It is the only feed data card on that screen; the batch list and feed types follow it.
- **"Daily Run Rate" today is a forecast, not consumption.** Since 2026-11-04 the cell shows the farm-wide predicted daily DMI of every active animal (DMI-2 per animal, latest weight or class default, lactation ignored), which is also the days-on-hand denominator. Before that it was a 30-day average of DM delivered. Nothing on the card measures what was actually eaten.
- **Feed checks record what is left, not what was eaten.** A check (`event_feed_checks`, with `is_close_reading` for close readings) has items (`event_feed_check_items`) with `remaining_quantity` per pool. "Residual" in the code and calc spec means this remaining amount (Tim's run-rate "residual", C, is narrower: what a close reading leaves behind) (DMI-1 "adjusted for residual"). There is no waste field on checks; waste exists only as a batch adjustment reason in the barn.
- **Pools (FA-26).** Event feed is keyed by **event + location + feed type** (`poolKey`), not by batch. Deliveries add to a pool with their unit, weight and DM snapshots; a check replaces the pool's amount for the pools it reads. `poolDailyActual` already gives, for a date between two checks of a pool, consumed DM per day = (DM at earlier check + DM delivered between − DM at later check) ÷ days, floored at 0. DMI-8 uses it for the event DMI chart. Pools with mixed or unverified units are mass-based (kg), and a pool without a verified conversion reports "needs check".
- **Feed units.** `src/utils/feed-units.js` (PR #60): one closed list `bale` (shown as "Round bale"), `sq bale`, `ton`, `kg`, `lb`, `bag`; legacy spellings fold on read. Pool counting works in a pool's own unit when the feed type and snapshot units agree; otherwise it falls back to mass.
- **DMI calcs.** DMI-2 (group daily DMI = head × weight × DMI%), DMI-3 (event sum over active group windows), DMI-4 (pasture vs stored split), DMI-5 (stored consumption by date between checks), DMI-6 (actual vs expected for confinement), DMI-8 (per-day cascade with statuses actual / estimated / needs_check / no_animals / no_pasture_data).
- **Cost.** CST-1 = Σ qty × batch cost per unit for deliveries; CST-2 = batch unit cost. Check items carry no batch (`batchId` null), so a pool's consumption has no direct batch.
- **Production (read-only, aggregates, 2026-11-17):** feed checks since Aug 1: Aug 1, Oct 2, Nov 13 (3 events, 21 items; 3 close readings). Deliveries since Sep 15: 17, all Grass Hay or Peanut Hay batches at $56 recorded cost, latest Nov 13. So check coverage is thin today: most 7- and 14-day windows will be partly or wholly unmeasured.

## 2. Definitions (Design's proposal)

All amounts are per pool, then summed. DM is the common basis (OI-0221 D2).

- **Window:** the trailing N days ending today, inclusive (N = 7, 14, 30 or 60), local farm date (B, decided).
- **Measured day (per pool):** a day that lies between two checks of that pool (the earlier check's date exclusive, the later check's date inclusive, as `poolDailyActual` does). A pool counts only while it belongs to an event that overlaps the window.
- **Consumed (DM):** Σ over measured pool-days of the pool's daily consumed DM. **Consumed (units):** the same in the pool's own unit when the pool counts in units (round bale, sq bale, …); mass-based pools contribute DM only (D, decided).
- **Measured days (farm):** days in the window on which every active pool is measured. Shown as "measured N of 30 days" (G, decided).
- **Run rate:** consumed ÷ measured days, shown as **bales/day** per unit type and **lb DM/day**.
- **Residual (Tim, C — hay left or wasted when an event closes):**
  - **Which events:** every event whose close date (`date_out`) falls in the window. Open events contribute no residual, however much hay is still out.
  - **Data source:** the event's close reading (`event_feed_checks` with `is_close_reading = true`) and its items' `remaining_quantity` per pool, then any later pool movements out of that pool (`event_feed_entries` with `kind = 'pool_removal'`, to another event or back to a batch). Residual per pool = the pool's amount after replaying all of the event's records (`replayFeedPools` with no cut-off): what the close reading left, minus anything moved out afterwards. Hay moved to another event is not residual; it is consumed or left at that event's own close.
  - **No close reading:** an event closed in the window without a close reading for a pool that held feed has an **unknown** residual for that pool (not 0); the card counts it ("1 close without a reading").
  - **Consistency with consumed:** consumed stops at the close reading (the close reading is the later anchor in the pool daily-actual math), so the left-behind hay is never counted as eaten and residual and consumed don't overlap.
  - Shown in units (per unit type), lb DM and $ (same pricing as consumed), with the number of closes it covers.
- **Dollars:** a pool's DM is priced at the delivery-weighted $ per lb DM of the batches delivered into that pool (each batch's recorded cost per unit ÷ its DM per unit). A batch with no recorded cost uses the **$56/bale fallback** (OI-0221 D5). Pools fed only by entries with no batch show "no cost" rather than $0 (H, decided).
- **DMI forecast:** the herd's predicted daily DMI over the same measured days (DMI-2/DMI-3 from group windows on those days, lactation as DMI-2 does). **Actual vs forecast** = consumed stored DM/day ÷ predicted DMI/day, as a %, the stored-feed share of intake (E, decided). Once OI-0221's budget exists, the budgeted stored DM/day for those days can be added as a second comparison.

## 3. Card layout (design level)

Under the existing three stat cells of the Feed Day Goal card:

- Pills **7d · 14d · 30d · 60d** (30 selected by default; choice remembered on the device).
- Line 1: **Run rate: X round bales/day · Y sq bales/day · Z lb DM/day** (measured N of D days, through <last measured date>).
- Two compact columns, **Consumed** and **Residual (left at close)**, each with **bales** (per unit type), **$**, **lb DM**; under Residual, "from N events closed" and any "M closes without a reading". If no event closed in the window, Residual reads "No events closed in the last N days".
- Line: **DMI: actual A lb DM/day vs forecast F lb DM/day (P%)**.
- Empty state: "No feed checks in the last N days. Run rate needs two checks of the same feed." No zeros are shown for unmeasured windows.
- The existing **Daily Run Rate** cell is renamed **Daily need (DMI)** so the card doesn't show two different "run rates" (A, decided). Its value and the days-on-hand math do not change.
- Units follow the user's unit system for mass (`display()`); bale counts are unitless counts with the standard unit label.

## 4. Relation to OI-0221 (stored forage budget)

- Same **DM basis** (D2) and **cost rule** (D5: recorded batch cost, $56/bale fallback).
- OI-0221's run-rate forecast variant (its question I, last 30 days) is based on **fed** (deliveries). This card's run rate is **consumed from checks**. Recommend OI-0221 keeps delivered-fed for the budget (it is complete even with few checks) and shows this check-based rate as the "measured" rate beside it, so the two don't diverge silently. When OI-0221's budget ships, the card adds "vs budget" (budgeted stored DM/day for the same days).
- **Scorecard (Tim, 2026-11-17 6:28 AM ET):** the same panel also appears on the OI-0221 budget scorecard (§6), which supersedes the "vs budget" add-on above: the comparison with budget and prior year lives there.
- Nothing here is stored; OI-0221 slice 2's migration is unaffected.

## 5. Schema, CP-55/CP-56, phasing

- **Schema:** none. **Migration:** none. **CP-55/CP-56:** no change. New i18n strings only.
- **Calc:** the window aggregation should be a registered calc beside DMI-5/DMI-8 per `V2_CALCULATION_SPEC.md` (Build names it), reusing the pool replay; no duplicate consumption logic.
- **Phasing:** independent of OI-0222 and OI-0221; approved by Tim 2026-11-17 6:12 AM ET (via Orchestrator); ready for Build. Per-event panel (F, decided) and "vs budget" (after OI-0221) are follow-ups. **Build handoff ON HOLD** (Tim, "Actually wait", 2026-11-17 6:27 AM ET, via Orchestrator) until further notice.

## 6. Also on the OI-0221 budget scorecard (Tim, 2026-11-17 6:28 AM ET, via Orchestrator)

> "I would also like run rate on the view that's part of the larger feature as it's an important part of the 'grazing gamification'"

- **Grazing-gamification element.** The run-rate panel is part of the OI-0221 budget scorecard ("Season hay budget" card on mobile, Feed-screen panel and Reports on desktop), shown alongside budget, prior year and actual.
- **One shared calculation and one shared component.** The registered window calc (§5) and the panel UI are built once and used by both the Feed card and the scorecard. No second implementation; the scorecard adds only its comparison row.
- **Same content:** pills 7/14/30/60 (default 30), consumed (measured days only), residual at close, bales, $ and lb DM, DMI actual vs forecast, exactly as §2–§3.
- **On the scorecard only:** a comparison row for the same window — budget, prior year and actual — and the gamification hooks (pace badge, waste %). Details and Tim's open questions N–S are in the [stored forage budget brief](STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md) (§10 and lettered questions).
- **Status:** this placement is part of OI-0221 (PROPOSED) and ships with its slice 2. OI-0224 on the Feed card stays APPROVED as a spec and needs no OI-0221 work; its Build handoff is on hold (6:27 AM ET).

## Lettered questions — all decided (Tim, 2026-11-17 6:12 AM ET, via Orchestrator)

C answered by Tim; A, B, D–H accepted at Design's recommended defaults ("Accept the other run-rate defaults"). Letters stay stable.

- **A. Which card — DECIDED (default accepted):** the Feed screen's summary card (Feed Day Goal: DM on hand, run rate, days on hand), with the run-rate section added under its three numbers, and the current "Daily Run Rate" cell renamed "Daily need (DMI)" because it shows what the herd should eat, not what it ate. Not chosen: a separate card under it.
- **B. Window — DECIDED (default accepted):** trailing N days ending today (7 / 14 / 30 / 60), default 30, matching OI-0221's run-rate window. Not chosen: calendar periods.
- **C. "Residual" — DECIDED (Tim):** "Residual means hay left or wasted when an event closes" — hay left at a close reading on events closed in the window, less anything moved out afterwards; in bales, $ and lb DM (§2).
- **D. Mixed units — DECIDED (default accepted):** bales per day by unit type (round bales and small squares shown separately), with lb DM as the combined total; mass-based pools add to lb DM only.
- **E. DMI actual vs forecast — DECIDED (default accepted):** actual = stored DM consumed per day from checks; forecast = the herd's predicted daily DMI (head × weight × DMI%) on the same days; shown as % of intake from stored feed. Add "vs budget" (OI-0221's budgeted stored DM/day) once the budget exists.
- **F. Scope — DECIDED (default accepted):** whole farm (all events) on the Feed screen now; a per-event version in event detail later.
- **G. Days with no checks — DECIDED (default accepted):** only days between two checks count; the card shows "measured N of 30 days, through <date>" and computes the rate over measured days; no estimates fill the gaps. Not chosen: fill gaps with DMI-8's estimated days, marked as estimates.
- **H. Cost for pools — DECIDED (default accepted):** price a pool's DM at the delivery-weighted $ per lb DM of the batches fed into it (recorded cost; $56/bale fallback); show "no cost" when no batch is known. (Check items carry no batch, so per-batch pricing of consumption isn't possible.)

## Origin

Tim's request 2026-11-17 6:02 AM ET via Orchestrator. Spec by GTHO Design from a read-only reading of `73442873` and read-only production aggregates.
