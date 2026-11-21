# Locations management summary view (OI-0246)

**Status:** **PROPOSED** (opened 2026-11-21 ~9:57 AM ET — Tim intake via Orchestrator, card **t777u**; awaiting Tim lock)  
**Owner:** GTHO Design → Orchestrator (Tim lock card) → GTHO Build (only after SPEC LOCKED + docs land)  
**Parent / base:** Forgejo `origin/main` tip `9402a0675e5924ca311974c31fc88084249c576b` (stamp `b2026-11-21.1415-9402a06`; `RELEASED_SCHEMA_VERSION` **47**). Queued after OI-0245 LOCKED tip `dc90185` (docs branch `docs/oi-0245-confirmed-bred-due-range`, land pending — do not block that land).  
**Also related:** Implied pasture / DMI-9 ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md)); OI-0241 / OI-0242 forage ([PREGRAZE_EDIT_SAVE_COPY_2026-11-20.md](PREGRAZE_EDIT_SAVE_COPY_2026-11-20.md), [MULTI_PADDOCK_DASHBOARD_FORAGE_2026-11-20.md](MULTI_PADDOCK_DASHBOARD_FORAGE_2026-11-20.md)); pasture surveys OI-0126/0131; NPK-1/3 + ANI-AU/AUD/ADA (CALC); budget period Oct 1–Sep 30 (`budget-period.js`).  
**Schema / migration:** Design lean **D0** — **compute-on-read from existing stores**; **no new tables / no migration** on the recommended path. Materialize only if Tim later asks (separate OI).

## 1. Problem

Tim (via Orchestrator, 2026-11-21 ~9:57 AM ET, **t777u**): he wants a **toggleable management view of locations** that summarizes, per location:

1. **Implied DMI from pasture**
2. **AUDs** (animal unit days)
3. **Amount of NPK deposited**
4. **Average pasture score** (numeric)

**Sorting by any of these values is important.**

**Origin:** Tim via Orchestrator, 2026-11-21 ~9:57 AM ET (t777u).  
**Base citations:** Forgejo `origin/main` `9402a06`. Docs-only this pass — options must cover aggregation to location when today’s grain is event/group.

## 2. Current state (citations — do not invent)

Read on tip `9402a0675e5924ca311974c31fc88084249c576b`.

| Piece | Where | What it does today |
|---|---|---|
| **Locations screen chrome** | `src/features/locations/index.js` **62–94**, **158–238** | Tabs **Locations \| Surveys**. Locations tab: Inputs & amendments strip; list with search; land-use pills (All / Pasture / Mixed-Use / Crop / Confinement / Storage); multi-farm pills; **sort header Name · Acres · Survey** only. **No management-view toggle**, no DMI/AUD/NPK aggregate columns. |
| **List sort** | same file **32–35**, **228–279** | `sortColumn` ∈ `name` \| `acres` \| `survey` (latest `forageQuality`). Client-side. |
| **Location card metrics** | same file **295–395**, esp. **367–384** | Latest survey rating badge; soil-test line; for pasture/mixed-use with height+forage type: **instantaneous** “Est. available: {lbs} DM · ~{auds} AUDs” via **FOR-1** then `dmAvail / 11` — **not** historical deposited AUDs / DMI / NPK over a window. |
| **Land types** | same file **251–254**, **301–304**, **452–455**; `src/calcs/location-type.js` | `type === 'land'` + `landUse` pasture \| mixed-use \| crop; separate `confinement` / `storage`. |
| **Implied pasture DMI (DMI-9)** | `src/calcs/feed-run-rate.js` **161–170**, **223–229**, **287–295**; brief `IMPLIED_PASTURE_DMI_2026-11-17.md` | **Farm / run-rate window lane**: implied pasture = predicted herd DMI − stored feed eaten over counted days. Exposed on Feed run-rate panel. **Not aggregated per location.** Uses paddock windows + locations only for confinement / no-hay day logic. |
| **DMI-8 pasture split (event day)** | `src/calcs/feed-forage.js` (~203–216, cascade / bars) | Per-event / day pasture vs stored DMI. Grain is **event/day**, not a Locations rollup. |
| **AU / AUD / ADA** | `src/calcs/core.js` **128–195** (`ANI-AU`, `ANI-AUD`, `ANI-ADA`) | Formulas exist. **Dashboard** event capacity uses AU→AUD→ADA (`src/features/dashboard/index.js` **1324–1327**). **Audit** resolvers: ANI-AUD = group-window; ANI-ADA = paddock-window (`src/features/dev-mode/audit-resolvers.js` **837–914**, registry **924–932**). **No Locations-screen historical AUD column.** |
| **Available AUDs (forage)** | `src/calcs/feed-forage.js` **319–337** (`FOR-2`); Locations card **378** | Capacity estimate from available DM — different question from Tim’s deposited / grazed AUDs. |
| **NPK excretion + paddock split** | `src/calcs/core.js` **5–62** (`NPK-1`, `NPK-3`); dashboard **837–862**, **991–996**; audit **444–605** | **NPK-1** = head × weight × days × excretion rates → `{nKg,pKg,kKg}`. **NPK-3** = split across paddock windows by time × effective area. UI today shows NPK on **event/dashboard** cards and Dev audit — **not** a Locations management rollup over a date range. |
| **NPK $ value** | `src/calcs/advanced.js` **5–81** (`NPK-2`, `CST-3`) | Dollar value from deposited kg × price history — optional later; Tim asked for **amount** deposited. |
| **Pasture score (numeric)** | `src/entities/paddock-observation.js` **13**, **39**, **47** (`forageQuality`); Locations **272–275**, **312–313**, **388–390**; `SUR-1` in `src/calcs/advanced.js` **116–137** | Scores **1–100** on `paddockObservations` (sources `event` \| `survey`). Locations shows **latest** score + sort by latest. **No average-over-window** column today. |
| **Presence grain for location** | `src/entities/event-paddock-window.js` (locationId, dateOpened/Closed, areaPct); group windows + memberships | Historical presence on a paddock is **event_paddock_windows** overlapping the window; animals via overlapping **event_group_windows**. Sufficient for compute-on-read if Build joins those stores. |
| **Budget / season default** | `src/calcs/budget-period.js` **7–43** | Default period **Oct 1 – Sep 30** containing today (`periodContaining`). Sensible default for a grazing/management season without new settings. |
| **Per-acre pattern** | `ANI-ADA` (`auds / areaAcres`); location area `areaHectares` (`locations/index.js` **57–60**) | Per-acre is already a first-class calc when acres known. |

### Honest gaps (options must cover)

| Metric Tim named | Exists today? | Grain today | Gap for Locations management view |
|---|---|---|---|
| Implied pasture DMI | **Yes (DMI-9)** | Farm / run-rate window | **No per-location rollup.** Need attribution rule: demand on days a location’s PW is open (share when multi-paddock) − stored attributed to that presence — or phased “AUD + NPK + score first; DMI later.” |
| AUDs (historical) | **Yes (ANI-AUD)** | Group-window; ADA at paddock-window in audit | Sum / attribute AUDs to each `locationId` over the date range via PW∩GW overlap. Locations card’s “~AUDs” is **available forage**, not this. |
| NPK deposited | **Yes (NPK-1 + NPK-3)** | Event / group-window → paddock-window in audit/dashboard | Same join: NPK-1 per GW × days in range, NPK-3 (or equivalent) onto locations; sum. |
| Avg pasture score | **Yes (`forageQuality`)** | Per observation; UI = latest | Mean of observations with non-null `forageQuality` in range (define event vs survey inclusion). |

**Compute-on-read feasibility:** **Yes** for AUD, NPK, and avg score from existing entities (locations, eventPaddockWindows, eventGroupWindows, memberships/animals/classes, paddockObservations, farm NPK rates). Implied pasture DMI per location is the **hardest** (DMI-9 is farm-lane); still doable without new tables if Build reuses demand + stored split helpers with a locked attribution rule — or Tim accepts phasing that metric.

## 3. Goals / non-goals

**Goals**

- Toggleable **management** presentation on Locations that shows Tim’s four metric families per location.
- **Sort by any** management column (client-side).
- Clear **time window** (default + ability to change).
- Prefer **reuse of existing calcs** (ANI-*, NPK-1/3, observation averages; DMI helpers where honest).
- **No migration** on Design lean.

**Non-goals (this OI)**

- New DB tables / materialized nutrient ledgers (unless Tim rejects D0).
- Replacing the current Locations cards / Surveys tab / Map / Harvest flows.
- Editing scores or applying amendments from the management view.
- Full stored-forage budget scorecard (OI-0221) — related but separate.
- Changing DMI-9 farm run-rate panel behavior.

## 4. Option axes (letter codes for Build; Tim card is plain language)

### V — View chrome

| Code | Choice |
|---|---|
| **V0** | **Toggle on the Locations tab** — “Management” vs current list/cards (same screen). **Design lean.** |
| V1 | Separate route / screen linked from Locations. |
| V2 | Third top tab beside Locations \| Surveys. |

### W — Time window

| Code | Choice |
|---|---|
| **W1** | **Selectable date range**; default = **current budget/grazing period** containing today (**Oct 1 – Sep 30** via `periodContaining` / `DEFAULT_BUDGET_PERIOD`). User can change start/end. **Design lean.** |
| W2 | Default = last 365 days; still selectable. |
| W3 | Default = calendar year (Jan 1 – today or Dec 31); still selectable. |
| W4 | All-time only (no picker) — weak for Tim’s “summarizes” ask. |

### M — Metrics included

| Code | Choice |
|---|---|
| **M0** | **All four families** Tim named: implied pasture DMI, AUDs, NPK deposited, avg pasture score. **Design lean** (with honest DMI attribution note in acceptance). |
| M1 | Phase 1: AUDs + NPK + avg score; implied DMI in a follow-on OI. |
| M2 | AUDs + avg score only (minimal). |

### A — Aggregation (totals vs per-acre)

| Code | Choice |
|---|---|
| **A1** | **Both** total and per-acre columns when `areaHectares` known; if area missing → **total only + “no acres” badge**. **Design lean.** |
| A0 | Totals only. |
| A2 | Per-acre only (hide rows without acres). |

### N — NPK columns

| Code | Choice |
|---|---|
| **N1** | **Separate sortable N, P, K columns** + optional combined (N+P+K) column. **Design lean.** |
| N0 | Combined single “NPK” column only. |
| N2 | N / P / K only (no combined). |

### S — Sort

| Code | Choice |
|---|---|
| **S0** | Client-side sort on **any** management column; default **Name ↑** (same as today’s list). **Design lean.** |
| S1 | Default **AUDs ↓** when entering management view. |
| S2 | Persist last sort in preferences. |

### D — Derive / storage

| Code | Choice |
|---|---|
| **D0** | **Compute-on-read** from existing events / memberships / observations / calcs. **No migration.** **Design lean.** |
| D1 | Materialize summary rows (new table or farm_settings blob) — needs migration + apply gate; reject unless Tim insists. |

### X — Location scope

| Code | Choice |
|---|---|
| **X1** | **Pasture + mixed-use** land locations only (`type === 'land'` && landUse in {pasture, mixed-use}). **Design lean.** |
| X0 | All location types (crop / confinement / storage show empty or N/A). |
| X2 | Pasture only (exclude mixed-use). |

### Design recommendation (internal)

**V0+W1+M0+A1+N1+S0+D0+X1**

- Management toggle on Locations; season default Oct 1–Sep 30 with editable range; all four metrics; both total and per-acre; N/P/K separate (+ optional combined); client sort any column defaulting to name; compute-on-read; pasture + mixed-use only; **no SQL**.

**Implied DMI attribution (for Build after lock, M0):** prefer presence-weighted share of daily group demand on days the location’s paddock window is open, minus stored feed attributed to that event/day presence (reuse DMI-8 / DMI-9 helpers). Document unknowns as “—” / unknown, never silent 0 (DMI-9 house rule). If attribution proves too ambiguous in implementation spike, escalate M0→M1 without reopening other axes.

## 5. Acceptance sketch (after Tim lock)

1. Locations screen exposes a clear control to enter/exit **management view** (V*).
2. Management rows show the locked metric set (M*) for locations in scope (X*) over the locked window (W*).
3. User can change the date range when W1/W2/W3.
4. Every numeric management column is **sortable**; default matches S*.
5. NPK presentation matches N*; acre presentation matches A*.
6. D0: no new migration files; no schema_version bump; no SQL apply.
7. Existing Locations / Surveys / Map / card edit flows still work when management toggle is off.
8. Unit tests cover aggregation helpers (AUD sum, NPK-1→location, mean forageQuality, and DMI attribution if M0) with multi-paddock and missing-acres cases.

## 6. Related

- `IMPLIED_PASTURE_DMI_2026-11-17.md` (DMI-9 farm lane)
- OI-0241 / OI-0242 forage / multi-paddock dashboard
- OI-0126 / OI-0131 pasture survey
- CALC: NPK-1/3, ANI-AU/AUD/ADA, FOR-1/2, SUR-1, DMI-8/9
- UX §15.3 Locations; SCHEMA Domain 2 / 6

## 7. Origin

Tim via Orchestrator, 2026-11-21 ~9:57 AM ET (**t777u**). Exact sense: toggle a management view of locations summarizing implied DMI from pasture, AUDs, NPK deposited, average pasture score (numeric); sorting by any of these is important.
