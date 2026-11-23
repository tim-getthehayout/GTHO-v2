# OI-0281 — Expected stored-feed plan (season budget core): plan by month or date range, pasture counted as savings

**Date:** 2026-11-23 | **Owner:** GTHO Design | **Status:** **PROPOSED** — lock needed on **Pg / Pq / Sv / Sh** (Design rec **Pg2+Pq1+Sv1+Sh1**). Docs only; no code, no SQL, no data change in this tip. **Build needs a new migration** (plan storage): writing it needs this spec locked; applying it needs Tim's explicit yes at the time **plus a verified backup**.
**Requested:** Tim **t1384u** (2026-11-23 12:03 PM ET) and **t1385u** (12:04 PM ET), via Orchestrator.
**Base:** Forgejo `origin/main` `0264c26cb62e727e3dcb69a8cb982e4e921a12d7` (RELEASED schema **48**). Code read only. Prod not queried.
**Parent:** **OI-0221** (Stored forage budgeting, PROPOSED since 2026-11-16, A–L open). OI-0281 is the plan-and-savings core of OI-0221 slice 2, given its own number so it can lock and ship without re-opening all of A–M. OI-0221 keeps the on-hand forecast (D4), cost (D5), scorecard (D8/D9) and history report (slice 1), which build on this plan later.
**Related:** OI-0280 (event-card actual vs target; integrates after this), OI-0225 (DMI-9 implied pasture), OI-0224 (FED-6 run rate), OI-0247 (farm season-default dates), OI-0279 (per-class need), OI-0258 / OI-0260 (Al1 hay eaten per event-day), OI-0256 (`no_pasture`), OI-0209 (confinement), OI-0222 (045 history), OI-0257 (DM forecaster; Fx1 parked).

## Tim (verbatim)

> t1384u: “When on 100% stored feed the gap tells us that our DMI numbers are off, when on stored feed and pasture the difference gets allocated to pasture not a forecast gap. I just also realized there is a missing piece. We need to set a “budget” for stored feed based on the users seasonal expectations. If I expect and plan for full feed from October 1 through April 1 then the amount from pasture I obtain is an improvement over my stored feed budget. So this is actually linked to that bigger feature set”

> t1385u: “Expected stored feed by month/day in the missing piece we need to finish and then integrate with this”

## 1. What already exists (spec and code)

| Item | Status | What it covers | Gap vs Tim's ask |
|---|---|---|---|
| **OI-0221** Stored forage budgeting ([proposal](STORED_FORAGE_BUDGET_PROPOSAL_2026-11-16.md)) | **PROPOSED** (2026-11-16); D1–D10 decided, A–L open | Budget per month = projected herd DM need × an editable **monthly “stored-feed share %”** (§5, question E), stored and locked (§6, F); savings to date; on-hand forecast (D4); cost (D5); gamified Feed card + Reports (§10, L); run-rate panel on the scorecard (D8/D9, N–S decided) | Same idea as Tim's plan. **Month-only** share (no day ranges such as “full feed Oct 1 – Apr 1”); “actual” is **hay fed** (left the stack, N), not hay eaten; never approved, never built |
| **D10** configurable budget dates (OI-0221 via OI-0225) | **APPROVED** 2026-11-17; built as calc + device memory | `src/calcs/budget-period.js` (`DEFAULT_BUDGET_PERIOD` Oct 1 – Sep 30, `periodContaining`, `validatePeriod`, overlap check), `src/features/feed/budget-period-store.js` (viewed period in `localStorage`); used by `run-rate-panel.js:14/33` and `rotation-calendar/location-metrics.js:41/90` | Period dates only; no plan, no stored-feed % |
| **OI-0247** Farm Settings season default | **SPEC LOCKED / READY FOR BUILD** 2026-11-22 (t841s3483 Db); migration not written/applied | Per-farm start/end month-day on `farm_settings`; budget period and Locations “Season default” share it | Dates only; hard-coded Oct 1 – Sep 30 until applied |
| **OI-0225** DMI-9 implied pasture | **APPROVED**; panel headline built (`feed-run-rate.js`, `run-rate-panel.js:155–163`) | Implied pasture = need − stored feed, farm-wide window lane; “headline of the budget view” | No plan to compare against |
| **OI-0224** FED-6 run rate | merged (PR #65) | Farm-wide consumed from checks, residual, DMI actual vs forecast; `byEvent`, `periodStart` hooks for slice 2 | No plan |
| **OI-0222** history backfill | 045 tables (`historical_feedings`, `historical_animal_basis`); released schema 48 | Last winter's feedings (fed basis, no checks) for pre-fill / prior year | Pre-fill source only |
| **Al1** (`al1EventDayAllocation`, `f1-close-allocation.js:400`) | live (OI-0258/0260) | Hay eaten per event-day from checks + implied pasture per day (Mt1/Mx1 aware) | The “actual” input this plan compares against |
| **CAP-1 / DM forecaster** (OI-0257) | Ag1+St1 locked; **Fx1 parked** | Stub coverage/shortfall in `calendar-grid.js` | Could later read the plan; out of scope |

**Schema today:** no plan / budget / season table. `farm_settings` has no season or stored-feed columns yet (OI-0247 adds dates). Migrations end at **048**.

## 2. Proposal

**What the user sets (one plan per farm per budget period):**
- The period = the farm's budget period (OI-0247 / D10 default Oct 1 – Sep 30).
- **Plan rows**: each row = a date range (or a month, per Pg) + **how much of the herd's need is planned from stored feed** (per Pq; default % of need). Days not covered by any row = **0% planned** (grazing season).
- Example (Tim): Oct 1 – Mar 31 at **100%** (“full feed”); optional shoulders, e.g. Apr 1 – Apr 30 at 50%, Sep 15 – Sep 30 at 25%.
- Per farm (Design default); per group/herd plans are a later option (see §5).

**How the budget is computed (compute-on-read from the saved plan):**
- `need(d)` = farm herd DM need on day d from the OI-0279 per-class group-day function (the same demand Al1, DMI-8 and Home use; OI-0238 partial days).
- **Planned stored DM(d)** = `need(d)` × `planned%(d)` (Pq1), or the fixed amount (Pq2).
- Past days use the **actual** herd need, so buying or selling animals moves the budget, not the savings. Future days use the current herd held flat (OI-0221 §4) until planned herd changes exist.

**Actual and savings:**
- **Actual stored feed (Sv1, rec)** = Σ Al1 `storedDmiKg` over all events on measured days (hay eaten from feed checks). Days not yet covered by a check are not counted; the budget is compared over the **same counted days**.
- **Savings vs plan** = planned stored DM − actual stored DM over the counted days. Positive = pasture beyond plan (green). Negative = over plan (amber, never red). On a day planned at 100%, every lb of implied pasture is savings; at 50%, savings = planned half − hay eaten.
- Shown with the waste figure beside it (OI-0224 residual at close) and, for inventory, hay **fed** (left the stack); fed stays the basis for prior-year comparison (OI-0221 N) because last winter has no checks.

**Where it shows (Sh1, rec):** Feed screen card at the top (OI-0221 L): season to date planned vs eaten, savings in lb DM (and bales of the main batch), this month, a plan editor behind Edit; desktop adds the month table (planned / eaten / savings by month). Home: OI-0280's event line gains the plan term after this ships (§4). Reports: month table. No Home tile in this OI.

**Interaction:**
- **OI-0221:** this is its slice-2 core. Question E (monthly share %) is answered by **Pg/Pq** here; F (stored plan) is assumed (a plan the user sets has to be saved). D4 on-hand forecast (“hay covers through”), D5 cost, D8/D9 scorecard and the history pre-fill stay in OI-0221 and read this plan.
- **OI-0225 / OI-0224:** same implied-pasture identity; the panel can add “vs plan” later without a second calc.
- **OI-0247:** plan period follows the farm budget period; no second farm default.
- **CAP-1 / Fx1:** a later forecaster can use planned% for future days; not here.

**Schema / CP-55/CP-56 (flag):** needs a **new migration** (next free number at write time, **049 or later**; OI-0247's own `farm_settings` migration is also still unwritten): a plan header per farm and period (start, end, status, notes) and plan rows (start date, end date, planned %, optional fixed DM/day). Operation-scoped, member RLS like other farm tables (OI-0233 pattern); added to CP-55 export / CP-56 restore with a schema step. **Writing the file needs this spec locked; applying it needs Tim's explicit yes plus a verified backup.** No SQL in this tip.

## 3. Decisions for Tim (plain language; Design rec first)

**Pg — How you enter the plan (by month or by day)**
- **Pg2 (rec): Date ranges.** Each line is “from – to, % from stored feed”, e.g. Oct 1 – Mar 31 at 100%, Apr 1 – Apr 30 at 50%. Day-precise, matches how you think about it (“full feed Oct 1 through Apr 1”). A month summary is shown underneath.
- Pg1: By month. Twelve months, one % each (Oct 100%, Nov 100% … Apr 50%, May 0%). Simplest screen, but a change on Apr 10 can't be entered.
- Pg3: Both: a month grid for quick entry, with day ranges for exceptions inside a month. Most flexible, most screen.

**Pq — What each line says**
- **Pq1 (rec): % of the herd's need** (100% = full feed). The plan follows the herd: if you add animals, the planned hay grows with them, so savings only reflect grazing.
- Pq2: A fixed amount per day (e.g. 1,400 lb DM/day or 2 bales/day). Easy to read, but herd changes show up as savings or overruns.
- Pq3: % of need by default, with an optional fixed amount on any line.

**Sv — What counts as hay actually used**
- **Sv1 (rec): Hay eaten, from your feed checks** (the same number OI-0280 shows on the event card). Savings = what you planned to feed minus what they ate, which is the pasture they got beyond your plan. Waste left at close is shown beside it.
- Sv2: Hay fed (what left the stack, including waste). Matches inventory and last winter's records, but counts waste as “used”.

**Sh — Where you see it first**
- **Sh1 (rec):** A card at the top of the Feed screen (planned vs eaten, savings, this month and season to date, Edit plan), month table on desktop; event cards pick up the plan in OI-0280 after.
- Sh2: Sh1 plus a Home tile for savings to date.
- Sh3: Home tile only.

**Design defaults (no lock needed):** one plan per farm per budget period (per-group plans later); days outside any line = 0% planned; overlapping lines not allowed; plan editable any time with a change note (OI-0221's lock/re-lock and the frozen-snapshot question stay with the scorecard slice); units through the OI-0278 helper.

## 4. Sequencing (Tim t1385u: finish the plan, then integrate 0280)

Default plan, per Tim: … → OI-0279 → OI-0277 + OI-0278-S2 → **OI-0281 (plan; migration apply = Tim yes + backup)** → **OI-0280 integrated** (event line with context gap wording and the plan term) → OI-0278-S3 → S4 → OI-0221 remaining slices (history pre-fill, on-hand forecast, cost, scorecard).

Can a small OI-0280 slice ship alongside without rework? **Yes, optionally.** OI-0280's math (hay eaten per day over the last check span from Al1, target on the same days, the stored-only vs grazing day rule) is exactly the per-event input OI-0281's actuals sum up, so nothing is thrown away; only the line's wording gains the plan term later. Design still defaults to Tim's order (plan first) and offers the early slice as an option (OI-0280 axis **Sq**).

## 5. Acceptance / tests (for Build after lock)

- Plan Oct 1 – Mar 31 at 100%, herd need 1,400 lb DM/day, hay eaten 1,000 → savings 400/day on counted days; Apr line at 50% → planned 700, eaten 800 → over plan 100 (amber).
- Herd change mid-period: planned follows actual need (Pq1); savings unchanged by the head-count change.
- Uncounted days (after the latest check) excluded on both sides.
- 100%-stored events (confinement / `no_pasture`) count in actual like any other; their gap is not pasture (see OI-0280 context rule).
- Days outside any line = 0% planned: any hay eaten there is “over plan”.
- Overlapping lines rejected; period must fit the farm budget period (`validatePeriod`).
- Per-class need (OI-0279); imperial and metric (OI-0278).

**Fix size:** M (migration + plan editor + card). **Migration needed** (Tim yes + backup to apply).
