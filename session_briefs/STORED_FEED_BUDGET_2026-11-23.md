# OI-0281 — Expected stored-feed plan (season budget core): plan by month or date range, pasture counted as savings

**Date:** 2026-11-23 | **Owner:** GTHO Design | **Status:** **SPEC LOCKED / READY FOR BUILD** 2026-11-23 12:13 PM ET (Tim, via Orchestrator, card **t1387s5445** — card **Pe1+Pm3+Pu1+Pw2** = doc **Pg2+Pq3+Sv1+Sh2**). Docs only; no code, no SQL, no data change in this tip. **Build needs a new migration** (plan storage; number TBD, 049 or later — OI-0247 may take 049): Build writes the file only after these docs land; applying it needs Tim's explicit yes at the time **plus a verified backup**.
**Requested:** Tim **t1384u** (2026-11-23 12:03 PM ET) and **t1385u** (12:04 PM ET), via Orchestrator.
**Base:** Forgejo `origin/main` `0264c26cb62e727e3dcb69a8cb982e4e921a12d7` (RELEASED schema **48**). Code read only. Prod not queried.
**Parent:** **OI-0221** (Stored forage budgeting, still **PROPOSED** since 2026-11-16, A–L open; status otherwise unchanged). OI-0281 is the plan-and-savings core of OI-0221 slice 2, given its own number so it can lock and ship without re-opening all of A–M. OI-0221 keeps the on-hand forecast (D4), cost (D5), scorecard (D8/D9) and history report (slice 1), which build on this plan later.
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
- **Planned stored DM(d)** depends on the line kind (**Pq3** / card Pm3). A **% line**: `need(d)` × `planned%(d)`. An **amount line**: the entered fixed amount for that day (lb DM/day in farm units via the OI-0278 helper; stored as canonical metric, kg DM/day). Exactly one of % or amount per line.
- On a % line, past days use the **actual** herd need, so buying or selling animals moves the budget, not the savings. Future days use the current herd held flat (OI-0221 §4) until planned herd changes exist. On an amount line the planned figure is the entered amount and does not follow herd changes.

**Actual and savings:**
- **Actual stored feed (Sv1 / card Pu1, locked)** = Σ Al1 `storedDmiKg` over all events on measured days (hay eaten from feed checks). Days not yet covered by a check are not counted; the budget is compared over the **same counted days**.
- **Savings vs plan** = planned stored DM − actual stored DM over the counted days. Positive = pasture beyond plan (green). Negative = over plan (amber, never red). On a day planned at 100%, every lb of implied pasture is savings; at 50%, savings = planned half − hay eaten.
- Shown with the waste figure beside it (OI-0224 residual at close) and, for inventory, hay **fed** (left the stack); fed stays the basis for prior-year comparison (OI-0221 N) because last winter has no checks.

**Where it shows (Sh2 / card Pw2, locked):** Feed screen card at the top (OI-0221 L): season to date planned vs eaten, savings in lb DM (and bales of the main batch), this month, a plan editor behind Edit; desktop adds the month table (planned / eaten / savings by month); **plus a Home tile** for savings to date. Home event cards also gain the plan term in OI-0280 after this ships (§4). Reports: month table.

**Interaction:**
- **OI-0221:** this is its slice-2 core. Question E (monthly share %) is answered by **Pg2+Pq3** here; F (stored plan) is assumed (a plan the user sets has to be saved). D4 on-hand forecast (“hay covers through”), D5 cost, D8/D9 scorecard and the history pre-fill stay in OI-0221 and read this plan.
- **OI-0225 / OI-0224:** same implied-pasture identity; the panel can add “vs plan” later without a second calc.
- **OI-0247:** plan period follows the farm budget period; no second farm default.
- **CAP-1 / Fx1:** a later forecaster can use planned% for future days; not here.

**Schema / CP-55/CP-56 (flag):** needs a **new migration** (next free number at write time, **049 or later**; OI-0247 may take 049 — its own `farm_settings` migration is also still unwritten): a plan header per farm and period (start, end, status, notes) and plan rows (start date, end date, planned % **or** fixed kg DM/day — exactly one). Operation-scoped, member RLS like other farm tables (OI-0233 pattern); added to CP-55 export / CP-56 restore with a schema step. **Build writes the migration file only after these docs land; applying it needs Tim's explicit yes plus a verified backup.** No SQL in this tip.

## 3. Locked decisions (card t1387s5445, 12:13 PM ET) — card labels ↔ doc labels

**Pg — How you enter the plan (by month or by day)** — **locked Pg2 (card “Pe1”)**.
- **Pg2 (locked): Date ranges.** Each line is “from – to”, e.g. Oct 1 – Mar 31 at 100%, Apr 1 – Apr 30 at 50%. Day-precise, matches how you think about it (“full feed Oct 1 through Apr 1”). A **month summary is shown underneath**. Days not covered by any line = **0% planned**.
- Pg1 (not chosen): By month. Twelve months, one % each (Oct 100%, Nov 100% … Apr 50%, May 0%).
- Pg3 (not chosen): Both: a month grid for quick entry, with day ranges for exceptions inside a month.

**Pq — What each line says** — **locked Pq3 (card “Pm3”)**.
- Pq1 (not chosen): % of the herd's need only.
- Pq2 (not chosen): A fixed amount per day only.
- **Pq3 (locked): % of the herd's daily need from stored feed by default, with an optional fixed amount per day on any line instead of %.** The amount is lb DM/day in farm units (OI-0278 helper) and is stored as canonical metric (kg DM/day). Exactly one of % or amount per line. Planned stored DM(d): a % line is `planned%(d) × need(d)` (OI-0279 per-class group-day need; actual herd for past days, current herd held flat for future); an amount line is the entered amount and does not follow herd changes. Validation: overlapping ranges blocked; % in 0–100 inclusive; amount ≥ 0; start ≤ end; lines fit the farm budget period (`validatePeriod`).

**Sv — What counts as hay actually used** — **locked Sv1 (card “Pu1”)**.
- **Sv1 (locked): Hay eaten, from your feed checks** (Al1; the same number OI-0280 shows on the event card). Savings = planned stored − hay eaten, which is the pasture they got beyond your plan (or an overrun if they ate more than planned). Waste left at close is shown beside it.
- Sv2 (not chosen): Hay fed (what left the stack, including waste).

**Sh — Where you see it first** — **locked Sh2 (card “Pw2”)**.
- Sh1 (not chosen): Feed screen card only.
- **Sh2 (locked): Feed screen card plus a Home tile** for savings to date. The Feed card: planned vs eaten, savings, this month and season to date, Edit plan; month table on desktop. Event cards pick up the plan term in OI-0280 after this ships.
- Sh3 (not chosen): Home tile only.

**Design defaults (unchanged):** one plan per farm per budget period (per-group plans later); days outside any line = 0% planned; overlapping lines not allowed; plan editable any time with a change note (OI-0221's lock/re-lock and the frozen-snapshot question stay with the scorecard slice); units through the OI-0278 helper.

## 4. Sequencing (Tim t1385u, locked: finish the plan, then integrate 0280)

… → OI-0279 → OI-0277 + OI-0278-S2 → **OI-0281 (plan; migration write after these docs land; apply = Tim yes + backup)** → **OI-0280 integrated** (event line with context gap wording and the plan term) → OI-0278-S3 → S4 → rest of OI-0221 (history pre-fill, on-hand forecast, cost, scorecard).

## 5. Acceptance / tests (for Build after lock)

- Plan Oct 1 – Mar 31 at 100%, herd need 1,400 lb DM/day, hay eaten 1,000 → savings 400/day on counted days; Apr line at 50% → planned 700, eaten 800 → over plan 100 (amber). Month summary lists those months underneath the date-range editor.
- **%-vs-amount lines:** a % line planned = need × % (OI-0279). An amount line planned = the entered lb DM/day (canonical kg DM/day stored; farm units via OI-0278). A line with both % and amount, or neither, is rejected.
- **Herd change mid-period:** a % line follows actual need on past days, so savings are unchanged by the head-count change. An amount line stays at the entered amount, so a herd change can show as savings or an overrun.
- Uncounted days (after the latest check) excluded on both sides.
- 100%-stored events (confinement / `no_pasture`) count in actual like any other; their event-card gap is not pasture (see OI-0280 context rule).
- **Uncovered days = 0% planned:** any hay eaten on a day with no plan line is “over plan”.
- **Overlap / bounds validation:** overlapping ranges rejected; % outside 0–100 rejected; amount < 0 rejected; start after end rejected; period must fit the farm budget period (`validatePeriod`).
- Waste (residual at close) is shown beside hay eaten. Used figure is Al1 hay eaten, same as OI-0280.
- Per-class need (OI-0279); imperial and metric (OI-0278).

**Fix size:** M (migration + plan editor + Feed card + Home tile). **Migration needed** (write after docs land; Tim yes + backup to apply).
