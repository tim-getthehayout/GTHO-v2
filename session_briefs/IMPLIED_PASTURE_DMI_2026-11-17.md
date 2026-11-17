# OI-0225 — Implied pasture DMI, and configurable budget period dates (OI-0221)

**Date:** 2026-11-17 | **Owner:** GTHO Design | **Status:** **PROPOSED — awaiting Tim's answers to Q1–Q6. Build starts nothing until Tim approves.** Docs only; no code, no SQL, no data change.
**Requested:** Tim, 2026-11-17 9:04 AM ET, via Orchestrator.
**Base:** Forgejo `main` `8903377f` (PR #67 merge `edca5ea` plus the 045 harness CI commit; read only). Code read: `src/calcs/feed-run-rate.js` (FED-6), `src/features/feed/run-rate-panel.js`, `src/calcs/window-helpers.js` (`groupWindowsDailyDmiKg`). Figures: the 17c dry-run report (`/workspace/gtho-backfill/dry-run-2026-11-17c/REPORT.md`, sha256 `db1717e2…01468191`), illustrative only. No production reads were needed.
**Related:** OI-0224 (run rate, FED-6, merged at `368b801b`), OI-0221 (stored forage budget, PROPOSED; D1, D4, D8, D9), OI-0222 (history tables in 045; PR #67 merged, 045 held, not applied). OI-0222 content is not changed here.

## Tim's request (verbatim, 2026-11-17 9:04 AM ET, via Orchestrator)

> "Just thought of something I missed on the run rate as well as forecast budget item. Implied DMI from pasture. This is the most important number. Also on the forecast module the start and end dates should be configurable. For this year I will probably use October 1st to September 30th as that is the data I have."

## Where this lives (OI placement)

- **New OI-0225 owns implied pasture DMI** (new calc **DMI-9**, its place in the shared run-rate panel and on the budget view). Why a new OI: OI-0224 is merged and only waits for publish, so reopening it would blur a shipped item; OI-0221 is still PROPOSED with A–L open and is a budget feature, while implied pasture also changes the shipped Feed-card panel. DMI-9 belongs in the DMI domain beside DMI-4 (event pasture vs stored split) and DMI-7 (grass DMI by paddock), which are the same mass balance at event/paddock level.
- **OI-0221 records the budget date change as D10** (its period is OI-0221's: D1 default, D4 forecast end, §6 budget header dates, §10 period picker). OI-0221 also gets implied pasture as its headline (§3 below), pointing at OI-0225.
- **OI-0224 is not edited** beyond a pointer: the panel headline is an OI-0225 change to the shared component.

---

## 1. Implied pasture DMI — definitions (DMI-9)

**In one line:** implied pasture intake = what the animals were predicted to eat − the stored feed they actually took, over the same days. It is a mass balance, so it is "implied", not measured.

### 1.1 Two lanes, one formula

| | **Window lane** (run-rate panel, pills 7/14/30/60) | **Period lane** (budget/scorecard view, months, season) |
|---|---|---|
| Stored feed | FED-6 **consumed** from feed checks (DM that disappeared between two checks of a pool) | **fed** = hay that left the stack (OI-0221 B): `event_feed_entries` deliveries less returns, carries ignored; plus `historical_feedings` for last winter (OI-0222) |
| Days counted | FED-6 farm-measured days (every active pool measured) **plus no-hay days** (no pool active on any open event, so stored = 0 is known) | every day of the range that has a demand source |
| Why | matches the panel's own consumed figure; same days as FED-6 `pctOfForecast` | like-for-like with budget and prior year (OI-0221 N): last winter has feedings only, no checks |

Both lanes use the same day convention as FED-6: a pool-day d is measured when the earlier check ≤ d < the later check; an event's days run dateIn ≤ d < dateOut (close day excluded, as group windows' `dateLeft`).

### 1.2 Demand (predicted herd DMI) on day d

- **Live groups:** the same group-window DMI as the panel's forecast and the card's "Daily need (DMI)": `groupWindowsDailyDmiKg(d)` (head × average weight × class DMI%, 2.5% default, **no lactation**, as FED-6 and DMI-8 today). One demand function, so implied pasture % + the panel's stored % = 100 on the same days.
- **History:** `historical_animal_basis` rows covering d (head × avg weight × `dmi_pct_snapshot`), once 045 is applied and the backfill written.
- **No double count:** for a group, open group windows on d win; a basis row counts on d only when its linked group (or, for a row with no group, its species) has no open window on d. (The Cow-Calf basis ends Mar 3 and its v2 windows start Mar 4; the other cattle rows end Mar 18 and their windows start Mar 19; so this only guards future overlaps.)
- Animals with no group window and no basis row are not in demand (as today's forecast).

### 1.3 Formula

For the counted days D of the window or range:

- `demandDm = Σ_d demand(d)`; `storedDm = Σ_d stored(d)` (lane 1.1)
- `signedPastureDm = demandDm − storedDm` (kept raw in the output)
- `pastureDmPerDay = max(0, signedPastureDm) ÷ |D|` — **lb DM per day, herd**
- `pasturePerHead = pastureDmPerDay ÷ (Σ_d head(d) ÷ |D|)` — **lb DM per head per day**, per species only (a 110 lb ewe and a 929 lb cow don't average into anything useful, so the all-species total shows no per-head figure)
- `pasturePct = max(0, signedPastureDm) ÷ demandDm × 100` — **% of demand** (pasture share)
- **Net over the window, then floor at 0.** Days are summed signed before the floor, so a set-out or a big check interval doesn't make some days read as huge pasture and others as zero.

### 1.4 Negatives (stored feed above demand)

- Show **Pasture 0 lb DM/day · 0%** and a separate line **"Stored feed over demand: X lb DM/day (Y% of demand)"**, where X = −signed ÷ |D| and Y = −signed ÷ demand × 100. Never a negative pasture number on screen (Q2).
- The calc output keeps `signedDmPerDay` and `signedPct` for reports and tests.
- Reasons it happens, shown once as a hint: feeding waste, cold-weather intake, lactation not applied, weights out of date. (17c: Dec–Feb; OI-0222 W.)

### 1.5 Residual and waste

- **Window lane: no further subtraction.** FED-6 consumed already excludes the hay left at a close reading (the close reading is the later check), so subtracting the close residual again would double-count it. Hay wasted between checks (trampled, spoiled) is inside consumed; there is no waste field, so implied pasture is a **floor** ("at least"). An event that closed without a reading leaves its last interval unmeasured, so those days are not counted; the panel's existing "M closes without a reading" note covers it, and implied pasture never treats Unknown residual as 0.
- **Period lane: fed includes waste and anything left at close.** Nothing is subtracted, for any year, so budget, prior year and actual stay like-for-like (N). The view says "from hay fed — includes waste".

### 1.6 Unknown, never 0

Show **Unknown** (with the reason) rather than 0 when:
- the window has no counted day (no two-check interval and no no-hay day) — "Needs two checks of the same feed, or a day with no hay out";
- a counted day has an open group window with head > 0 but no usable weight, or a basis row is missing for a period being shown — that day is dropped and "counted N of D days" says so; all days dropped → Unknown;
- stored feed is fed or consumed on a day with no demand source for the animals fed (e.g. sheep fed with no sheep basis) — that species is Unknown for the range, and the total says "excludes sheep";
- a no-hay day where any open event's paddock windows are all confinement — confinement has zero pasture (OI-0209), so no recorded feed there is a missing record, not grazing; the day is not counted.
- Zero demand on every counted day reads "No animals" (as DMI-8 `no_animals`), not Unknown.

### 1.7 Species split

- Demand by species: group window class (or member) species; basis rows carry species.
- Stored by species: `historical_feedings.species`; for checks, a pool's consumption on d is split across the event's species by their share of that event's demand on d (DMI-weighted). Single-species events (all today) get it all.
- Shown: total (headline), then **Cattle** and **Sheep** rows; a species with no demand all window is omitted. Goats are excluded from last winter (D6) and follow the same rules from now on.

### 1.8 Display

**Shared run-rate panel (`run-rate-panel.js`) — implied pasture is the headline.** First row of the panel, the largest figure in it, above the run-rate line, driven by the same pills (7/14/30/60, default 30, remembered on the device):

- **Pasture (implied): P lb DM/day · Q% of demand** (layout only)
- Under it: "Demand D · stored eaten S lb DM/day · counted N of W days"; the Cattle and Sheep rows (per-head lb DM/day per species) — tap to show on mobile.
- Negative: "Pasture (implied): 0 lb DM/day · 0%" plus "Stored feed over demand: …".
- The existing lines (run rate, consumed, residual, "DMI: actual vs forecast (P%)") stay below as the "where the stored feed went" detail. P% there and the pasture % add to 100 on the same days.
- Because the panel is shown once per screen (S), implied pasture is too: on the Feed Day Goal card now, inside the scorecard once it exists, and on the desktop Reports view.

**Budget/scorecard view (OI-0221) — implied pasture is the headline of the season view** (period lane, configured period):
- Season to date and this month: **Pasture (implied)** lb DM/day and % of demand, with budget and prior year beside it on the same basis. Budget implied pasture = demand × (1 − the month's stored-feed share %), so the budget and the pasture figure come from one curve.
- Monthly chart/table (desktop) gains an implied-pasture column (lb DM/day and %).
- The D4 season surplus/deficit forecast stays where OI-0221 puts it; implied pasture sits above it as the "how well am I grazing" number.

**Colour (Q3):** none — neutral text. A high pasture share is good, but colouring it implies a target, and R says no new goals now. Budget vs actual implied pasture is shown as plain text ("budget 55%"). O's pace badge is unchanged (it reads fed/day vs budget).

**No new streaks (R).** Implied pasture adds no streak, points or goal.

### 1.9 Worked examples (illustrative; 17c monthly figures, period lane, cattle)

17c cattle demand basis: 79 head, 1,533.8 lb DM/day (Oct 1 – Mar 18); fed is the 17c monthly cattle DM. From `REPORT.md` §(e):

| Month | Demand lb DM | Fed lb DM | Signed | Shown pasture | lb DM/day | lb/head/day | % of demand | Stored over demand |
|---|---|---|---|---|---|---|---|---|
| Oct 2025 | 47,548 | 31,897 | +15,651 | 15,651 | 504.9 | 6.39 (79 hd) | 32.9% | — |
| Nov 2025 | 46,014 | 43,996 | +2,018 | 2,018 | 67.3 | 0.85 (79 hd) | 4.4% | — |
| Dec 2025 | 47,548 | 67,094 | −19,546 | 0 | 0 | 0 | 0% | 630.5 lb/day (41.1%) |
| Jan 2026 | 47,548 | 56,095 | −8,547 | 0 | 0 | 0 | 0% | 275.7 lb/day (18.0%) |
| Feb 2026 | 42,947 | 46,196 | −3,249 | 0 | 0 | 0 | 0% | 116.0 lb/day (7.6%) |
| Mar 2026 | 51,376 | 35,688 | +15,688 | 15,688 | 506.1 | 6.43 (78.7 hd avg) | 30.5% | — |

- Dec, Jan, Feb match the 17c fed % (141%, 118%, 108%): pasture shows 0 and the over-demand line carries the rest.
- **Netting:** Oct–Feb together: demand 231,605, fed 245,278, signed −13,673 → pasture 0, stored over demand 90.5 lb/day (5.9%). Oct–Apr (17c season line): demand 329,571, fed 295,738 → +33,833 lb, 159.6 lb DM/day, 10.3% of demand.
- **Sheep, Feb 2026:** demand 7,392 (80 × 110 lb × 3% = 264 lb/day), fed 4,400 → 2,992 lb, 106.9 lb DM/day, 1.34 lb/head/day, 40.5%. Oct–Jan sheep had no hay in the notes, so 264 lb/day, 100%.
- Caveats: 17c demand has no lactation and calves at 500 lb (V); March mixes the notes basis and v2 windows; the window lane would use check-measured days and could differ.

---

## 2. Configurable budget period (OI-0221 D10)

### 2.1 What changes

OI-0221 D1 already lets any start/end be picked for the history report, but the forecast and budget are written around June 1 – May 31 (D4 "through May 31", K "carry-over past May 31", §10 "projected path to May 31"). D10 makes the **budget period's start and end configurable** and replaces every "May 31" with **"the period end"**.

### 2.2 Default (Q4)

- **This year:** current budget period **Oct 1, 2026 – Sep 30, 2027**; prior-year comparison **Oct 1, 2025 – Sep 30, 2026**. That prior year is the data Tim has: notes Oct–Mar (OI-0222 history lane), v1 Mar 4 – Apr 13 (event lane), v2 from Apr 9.
- **New farms:** default Oct 1 – Sep 30 (replacing D1's June 1 – May 31); Tim can change it.

### 2.3 Where it is stored (Q5)

- The budget's own start/end are already on the OI-0221 §6 budget header (per farm and period). Recommend also a **per-farm default start (month/day) in the database**, in the same later migration as the budget tables (046 or later; 045 is the history tables), so it syncs across Tim's devices and survives a reinstall. The operation has one farm today, so per farm = per operation.
- Until that migration is applied (slice 1, history report, no migration), the period picker defaults to the Oct 1 – Sep 30 period containing today and remembers the last choice on the device.
- Alternative: device only (no migration, but each device can disagree).

### 2.4 Validation

- End after start. Budget length 1–366 days (≤ 13 month rows); the history report keeps D1's any range.
- One farm's budgets don't overlap; a shorter, non-annual budget is allowed (e.g. a first budget from today to Sep 30) (Q5).
- Leap day: Feb 29 maps to Feb 28 when shifting by a year.

### 2.5 Interactions

- **Monthly history:** month rows are clipped to the period. A start or end mid-month gives a partial first/last row labelled with its dates (e.g. "Oct 15–31"); demand, fed and budget are by day, so partial rows are exact; the share % is applied to the partial row's demand (OI-0221 §5 pro-rating by days).
- **17c / OI-0222 history (Oct 2025 – Apr 2026):** sits entirely inside the default prior period. Before 045 is applied and the backfill written, prior-year months before Apr 9, 2026 show "No history yet", not 0.
- **Prior-year comparison (D8/D9 N):** "the same calendar dates last season" = the same dates one year earlier, so it moves with the configured dates. With an annual period this is exactly the previous period.
- **Pills (P):** still drive only the panel. `periodStart` (the FED-6 slice-2 hook) = the configured start: a pill reaching before it is clipped to season to date and the panel shows the clipped length (`windowDays`). Example: today Nov 17, 2026, start Oct 1, 2026: the 60-day pill shows 48 days.
- **D4 forecast:** remaining budgeted need runs from today to the configured end; budgeted on-hand opens at the configured start (G).
- **K:** carry-over reserve is past the configured end.
- **Implied pasture on the budget view** uses the configured period (season to date = start → today).
- **Changing dates mid-season:** everything shown is recomputed (calc and display only; no feeding, basis or inventory row changes). A **locked** budget (F) is a stored record: changing its dates is an unlock → edit → re-lock; months that remain keep their share %, new months are pre-filled from history.

---

## 3. Schema, CP-55/CP-56, phasing

- **DMI-9:** compute-on-read; no column, no migration. The panel headline ships with the OI-0224 shared panel as a follow-up PR once approved (no migration); its history lane reads 045 tables only after 045 is applied and the backfill is written, and shows "No history yet" before that.
- **Period:** slice 1 (history report): no migration; device-remembered picker. Slice 2: budget header dates (already planned) plus the per-farm default start (Q5), in the budget migration (046 or later), added to CP-55/CP-56 with a schema step. Writing it needs OI-0221's approval; applying it needs Tim's explicit yes at the time plus a backup.
- One calc, one component: DMI-9 is computed from the same day-by-day pool replay as FED-6 and registered as its own calc; Build chooses whether it is a field of the FED-6 result or a sibling function in the same module. No second consumption logic.

## Open questions for Tim (recommended default first)

1. **Q1 — Two bases.** Run-rate panel (pills) uses hay *eaten* from feed checks; the season/budget view uses hay *fed* (left the stack), so it compares like-for-like with budget and last winter. *Default: yes, both, each labelled.*
2. **Q2 — More hay than predicted intake.** Show pasture as 0 lb/day and 0%, with a separate "Stored feed over demand: X lb/day (Y%)" line; keep the raw negative in reports. *Default: yes.*
3. **Q3 — Colour.** No colour on implied pasture for now (neutral), with budget shown beside it as text; revisit after a season. *Default: neutral.*
4. **Q4 — Budget period this year.** Current period Oct 1, 2026 – Sep 30, 2027, compared with Oct 1, 2025 – Sep 30, 2026; Oct 1 – Sep 30 also becomes the default for new farms, replacing June 1 – May 31. *Default: yes.*
5. **Q5 — Where the dates live and the rules.** Per farm in the database (with the budget, synced across devices); budgets for one farm don't overlap; shorter non-annual budgets allowed up to 366 days; last-year comparison = same dates one year earlier. *Default: yes.*
6. **Q6 — Sheep summer 2026.** The sheep basis ends May 31, 2026 and sheep group records start Nov 2026, so if sheep were on the farm Jun–Oct 2026 they have no demand: show cattle for those months with "sheep basis missing", and add a sheep basis row when the in-app basis entry (OI-0222 follow-up) exists. *Default: yes; Tim to give head and weight if he wants it filled sooner.*

## Origin

Tim's request 2026-11-17 9:04 AM ET via Orchestrator.
