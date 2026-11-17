# OI-0224 — Feed run rate from feed checks (Feed screen card)

**Date:** 2026-11-17 | **Owner:** GTHO Design | **Status:** PROPOSED — awaiting Tim's answers and approval. **Build starts nothing until Tim approves this spec; landing this doc needs Tim's yes.** Docs only; no code, no SQL, no data change.
**Requested:** Tim, 2026-11-17 6:02 AM ET (relayed by Orchestrator).
**Base:** Forgejo `main` `73442873` (PR #60 merge; read only). Live figures: read-only SELECTs on production, 2026-11-17 ~6:20 AM ET; aggregates only.
**Related:** OI-0221 (stored forage budget; DM basis, DMI-adjusted forecast, cost rule D5), OI-0220 (feed units, done), FA-26 (feed pools).

## Tim's request (verbatim, 2026-11-17 6:02 AM ET, via Orchestrator)

> "In the feed data card I think we should also include a run rate feature. Pills to select date range- 7 days, 14, 30, 60 and display the bales per day based on feed checks. Show, consumed as well as residual, and totals for each in bales, dollars, and DMI (actual vs forecast)"

## Recommendation (summary)

1. Add a **Run rate** section to the Feed screen's summary card (the Feed Day Goal card) with four pills: **7 · 14 · 30 · 60 days**, default **30**. The window is the trailing N days ending today.
2. **Consumed** comes from feed checks only: per feed pool, between consecutive checks, consumed = remaining at the earlier check + feed delivered in between − remaining at the later check, spread evenly over the days between them. This is the existing pool daily-actual model (FA-26 pools, DMI-5). Days not bracketed by two checks are **not measured** and are not filled in.
3. **Residual** = feed still on the ground at the latest check in each pool of an open event, as of the end of the window (question C).
4. Show, for the window: **bales per day** (consumed ÷ measured days), and **totals for consumed and residual in bales, dollars and lb DM**, plus **DMI actual vs forecast** (consumed stored DM per day vs the herd's predicted daily DMI; question E).
5. Farm-wide (all events) on the Feed screen. A per-event version can follow (question F).
6. No schema change, no migration, no CP-55/CP-56 impact: everything is computed on read from existing feed entries, checks, check items, batches, group windows and animals.

## 1. What exists today (read from code at `73442873`, read only)

- **The card.** The Feed screen (`src/features/feed/index.js`) opens with one summary card, the **Feed Day Goal banner** (CP-26; "Feed on hand" summary card in `V2_DESIGN_SYSTEM.md`): days on hand vs goal, three stat cells (**DM on Hand**, **Daily Run Rate**, **Days on Hand**) and a progress bar. It is the only feed data card on that screen; the batch list and feed types follow it.
- **"Daily Run Rate" today is a forecast, not consumption.** Since 2026-11-04 the cell shows the farm-wide predicted daily DMI of every active animal (DMI-2 per animal, latest weight or class default, lactation ignored), which is also the days-on-hand denominator. Before that it was a 30-day average of DM delivered. Nothing on the card measures what was actually eaten.
- **Feed checks record what is left, not what was eaten.** A check (`event_feed_checks`, with `is_close_reading` for close readings) has items (`event_feed_check_items`) with `remaining_quantity` per pool. "Residual" in the code and calc spec means this remaining amount (DMI-1 "adjusted for residual"). There is no waste field on checks; waste exists only as a batch adjustment reason in the barn.
- **Pools (FA-26).** Event feed is keyed by **event + location + feed type** (`poolKey`), not by batch. Deliveries add to a pool with their unit, weight and DM snapshots; a check replaces the pool's amount for the pools it reads. `poolDailyActual` already gives, for a date between two checks of a pool, consumed DM per day = (DM at earlier check + DM delivered between − DM at later check) ÷ days, floored at 0. DMI-8 uses it for the event DMI chart. Pools with mixed or unverified units are mass-based (kg), and a pool without a verified conversion reports "needs check".
- **Feed units.** `src/utils/feed-units.js` (PR #60): one closed list `bale` (shown as "Round bale"), `sq bale`, `ton`, `kg`, `lb`, `bag`; legacy spellings fold on read. Pool counting works in a pool's own unit when the feed type and snapshot units agree; otherwise it falls back to mass.
- **DMI calcs.** DMI-2 (group daily DMI = head × weight × DMI%), DMI-3 (event sum over active group windows), DMI-4 (pasture vs stored split), DMI-5 (stored consumption by date between checks), DMI-6 (actual vs expected for confinement), DMI-8 (per-day cascade with statuses actual / estimated / needs_check / no_animals / no_pasture_data).
- **Cost.** CST-1 = Σ qty × batch cost per unit for deliveries; CST-2 = batch unit cost. Check items carry no batch (`batchId` null), so a pool's consumption has no direct batch.
- **Production (read-only, aggregates, 2026-11-17):** feed checks since Aug 1: Aug 1, Oct 2, Nov 13 (3 events, 21 items; 3 close readings). Deliveries since Sep 15: 17, all Grass Hay or Peanut Hay batches at $56 recorded cost, latest Nov 13. So check coverage is thin today: most 7- and 14-day windows will be partly or wholly unmeasured.

## 2. Definitions (Design's proposal)

All amounts are per pool, then summed. DM is the common basis (OI-0221 D2).

- **Window:** the trailing N days ending today, inclusive (N = 7, 14, 30 or 60), local farm date (question B).
- **Measured day (per pool):** a day that lies between two checks of that pool (the earlier check's date exclusive, the later check's date inclusive, as `poolDailyActual` does). A pool counts only while it belongs to an event that overlaps the window.
- **Consumed (DM):** Σ over measured pool-days of the pool's daily consumed DM. **Consumed (units):** the same in the pool's own unit when the pool counts in units (round bale, sq bale, …); mass-based pools contribute DM only (question D).
- **Measured days (farm):** days in the window on which every active pool is measured. Shown as "measured N of 30 days" (question G).
- **Run rate:** consumed ÷ measured days, shown as **bales/day** per unit type and **lb DM/day**.
- **Residual:** for each pool of an open event, the latest check's remaining amount on or before the window's end, plus deliveries after that check (the pool's current amount by replay). Shown in units, lb DM and $ (question C). Closed events' left-behind feed is excluded by default.
- **Dollars:** a pool's DM is priced at the delivery-weighted $ per lb DM of the batches delivered into that pool (each batch's recorded cost per unit ÷ its DM per unit). A batch with no recorded cost uses the **$56/bale fallback** (OI-0221 D5). Pools fed only by entries with no batch show "no cost" rather than $0 (question H).
- **DMI forecast:** the herd's predicted daily DMI over the same measured days (DMI-2/DMI-3 from group windows on those days, lactation as DMI-2 does). **Actual vs forecast** = consumed stored DM/day ÷ predicted DMI/day, as a %, the stored-feed share of intake (question E). Once OI-0221's budget exists, the budgeted stored DM/day for those days can be added as a second comparison.

## 3. Card layout (design level)

Under the existing three stat cells of the Feed Day Goal card:

- Pills **7d · 14d · 30d · 60d** (30 selected by default; choice remembered on the device).
- Line 1: **Run rate: X round bales/day · Y sq bales/day · Z lb DM/day** (measured N of D days, through <last measured date>).
- Two compact columns, **Consumed** and **Residual**, each with **bales** (per unit type), **$**, **lb DM**.
- Line: **DMI: actual A lb DM/day vs forecast F lb DM/day (P%)**.
- Empty state: "No feed checks in the last N days. Run rate needs two checks of the same feed." No zeros are shown for unmeasured windows.
- The existing **Daily Run Rate** cell is renamed **Daily need (DMI)** so the card doesn't show two different "run rates" (question A). Its value and the days-on-hand math do not change.
- Units follow the user's unit system for mass (`display()`); bale counts are unitless counts with the standard unit label.

## 4. Relation to OI-0221 (stored forage budget)

- Same **DM basis** (D2) and **cost rule** (D5: recorded batch cost, $56/bale fallback).
- OI-0221's run-rate forecast variant (its question I, last 30 days) is based on **fed** (deliveries). This card's run rate is **consumed from checks**. Recommend OI-0221 keeps delivered-fed for the budget (it is complete even with few checks) and shows this check-based rate as the "measured" rate beside it, so the two don't diverge silently. When OI-0221's budget ships, the card adds "vs budget" (budgeted stored DM/day for the same days).
- Nothing here is stored; OI-0221 slice 2's migration is unaffected.

## 5. Schema, CP-55/CP-56, phasing

- **Schema:** none. **Migration:** none. **CP-55/CP-56:** no change. New i18n strings only.
- **Calc:** the window aggregation should be a registered calc beside DMI-5/DMI-8 per `V2_CALCULATION_SPEC.md` (Build names it), reusing the pool replay; no duplicate consumption logic.
- **Phasing:** independent of OI-0222 and OI-0221; can ship after Tim approves this spec. Per-event panel (question F) and "vs budget" (after OI-0221) are follow-ups.

## Lettered questions for Tim (recommended answer first)

- **A. Which card.** Recommend: the Feed screen's summary card (Feed Day Goal: DM on hand, run rate, days on hand), with the run-rate section added under its three numbers, and the current "Daily Run Rate" cell renamed "Daily need (DMI)" because it shows what the herd should eat, not what it ate. Alternative: a separate card under it.
- **B. Window.** Recommend: trailing N days ending today (7 / 14 / 30 / 60), default 30, matching OI-0221's run-rate window. Alternative: calendar periods.
- **C. "Residual".** Recommend: residual = hay still out at the latest check on open events (what's left to eat), in bales, $ and lb DM. Alternative: residual = hay left behind when an event closed and not moved out (wasted), which needs a close reading. Which did you mean?
- **D. Mixed units.** Recommend: bales per day by unit type (round bales and small squares shown separately), with lb DM as the combined total; mass-based pools add to lb DM only.
- **E. DMI actual vs forecast.** Recommend: actual = stored DM consumed per day from checks; forecast = the herd's predicted daily DMI (head × weight × DMI%) on the same days; shown as % of intake from stored feed. Add "vs budget" (OI-0221's budgeted stored DM/day) once the budget exists.
- **F. Scope.** Recommend: whole farm (all events) on the Feed screen now; a per-event version in event detail later.
- **G. Days with no checks.** Recommend: only days between two checks count; the card shows "measured N of 30 days, through <date>" and computes the rate over measured days; no estimates fill the gaps. Alternative: fill gaps with DMI-8's estimated days, marked as estimates.
- **H. Cost for pools.** Recommend: price a pool's DM at the delivery-weighted $ per lb DM of the batches fed into it (recorded cost; $56/bale fallback); show "no cost" when no batch is known. (Check items carry no batch, so per-batch pricing of consumption isn't possible.)

## Origin

Tim's request 2026-11-17 6:02 AM ET via Orchestrator. Spec by GTHO Design from a read-only reading of `73442873` and read-only production aggregates.
