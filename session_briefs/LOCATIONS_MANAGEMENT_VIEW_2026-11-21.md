# Locations + rotation management surface (OI-0246)

**Status:** **SPEC LOCKED / READY FOR BUILD** — parent lock Tim, 2026-11-21 ~10:05 AM ET, via Orchestrator, card **t784s3247**: **AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1** (docs tip `ea481a2f2020a24d9fdd1cf34b494ebaa809852b`). **List-parity + season persist addendum LOCKED** 2026-11-22: Tim **t835s3460** (5:30 AM ET) **La+Ta+Cb+Rb**; Tim **t841s3483** (5:37 AM ET) **Pb**. **Season-metrics formula addendum LOCKED** 2026-11-22: Tim **t849s3511** (~5:45 AM ET) **S1+F1+L1+H0+C1+Z1**; Tim **t862s3559** / **t862u** (5:53 AM ET) NPK **Ns+R1+Kc**. Full formula: **S1+F1(DMI)+L1+H0+C1+Z1** with NPK = **Ns+R1+Kc** (see §11). **Db** is **OI-0247** (docs landed on main `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee`; SQL apply still separate) — **not** this tip. Residual-feed NPK uses existing `feed_types` / `batch_nutritional_profiles` `n_pct`/`p_pct`/`k_pct` — **no new column / no GATE**. Opened ~9:57 AM ET 2026-11-21 (**t777u**); revised **t782u** / **t781s3238**; first lock on tip `1d6465adff611230fa429209c860a96927d3973f`.  
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card — land only after Tim yes). First implementation is **live** on `origin/main` `52540a358f511bf46bceacbd7dcc7c94918acd04`; this tip is the follow-up Build brief (no SQL).  
**Parent / base:** Forgejo `origin/main` tip `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee` (OI-0247 docs landed). Live list/nav code remains `52540a358f511bf46bceacbd7dcc7c94918acd04`. Prior LOCKED docs tip `ea481a2f2020a24d9fdd1cf34b494ebaa809852b`. This tip revises **U0/List acceptance**, **W1 persistence (Pb)**, and the **M0 season-metrics formula** (§11). List/Calendar citations below also read on **`52540a3`**. Historical rotation-gap citations in §3 were taken on `dc90185`.  
**Also related:** Rotation calendar CP-54 / UX §19 (`src/features/events/rotation-calendar/*`); Locations UX §15.3 (`src/features/locations/index.js`); Implied pasture / DMI-9; OI-0241 / OI-0242 forage; pasture surveys OI-0126/0131; NPK-1/3 + ANI-AU/AUD/ADA; REC recovery (`src/calcs/advanced.js`); budget period Oct 1–Sep 30; feed localStorage pattern `gtho_v2_budget_viewed_period`.  
**Schema / migration:** **D0 HOLDS** — **compute-on-read**; **no new tables / no migration / no SQL**. Pb is device-local `localStorage` only. Residual-feed NPK (**R1**) uses existing `feed_types.n_pct`/`p_pct`/`k_pct` (migration 004) and `batch_nutritional_profiles.n_pct`/`p_pct`/`k_pct` (migration 010) — **no GATE / no new column**. **Db** is **OI-0247** (docs on main; SQL + backup + a separate Tim yes at apply) — not this land.  
**Supersedes tip:** first PROPOSED `ebb79d1e8be10757ad81998647318b22178b4cc1`; revised PROPOSED locked from `1d6465adff611230fa429209c860a96927d3973f`; parent LOCKED tip `ea481a2f2020a24d9fdd1cf34b494ebaa809852b` (this addendum revises U0/List + W1 persist + M0 formula, does not reopen other locked axes).

## 1. Problem

### 1a. Original ask (t777u — metrics)

Tim (via Orchestrator, 2026-11-21 ~9:57 AM ET, **t777u**): toggleable **management view of locations** summarizing, per location:

1. **Implied DMI from pasture**
2. **AUDs**
3. **Amount of NPK deposited**
4. **Average pasture score** (numeric)

**Sorting by any of these values is important.**

### 1b. Placement reopen (t782u — rotation + Locations)

Tim (via Orchestrator, 2026-11-21 ~10:02 AM ET, **t782u** answering **t781s3238**), exact sense:

- **Agrees** with Design’s metric recommendations (season window, DMI/AUDs/N-P-K/score, totals+per-acre, pastures+mixed-use, compute-on-read, sortable).
- But the **rotation schedule view already has a lot of what he wanted on Locations** and is a **total mess** — e.g. **scrolling on locations on the left is not in sync with the rest of the rows**.
- Asks for a **review of that screen** and maybe **integrate rotation calendar and locations into one better designed UI**.
- Intention of the rotation calendar: show **past activity in a location visually**, and **readiness for grazing in the future timeline** based on **pasture surveys if present**, else **relative days elapsed since last graze** (relative to other locations’ last-grazed dates).

**Orchestrator read (t782u):** metric choices **AGREED**; placement reopen — rethink the surface. **Phone (iPhone Home Screen) + Mac Dock both matter.**  
**Locked (t784s3247):** Tim one-tap locked Design lean — see §6.

## 2. AGREED metrics (frozen for lock — do not re-ask)

Tim **t782u** agreed with Design’s metric lean. Treat as **already locked with Tim** for this OI:

| Axis | Code | Meaning |
|---|---|---|
| **W** | **W1** | Selectable date range; default current budget/grazing period **Oct 1 – Sep 30** (`periodContaining` / `DEFAULT_BUDGET_PERIOD`). **Pb (LOCKED t841s3483):** this browser remembers a chosen start/end in `localStorage` across Calendar\|List and leave/return to `#/events` (see §10). **Season default** still clears the override to the hard-coded Oct 1–Sep 30. Per-farm Settings default (**Db**) is **OI-0247** (docs on main; apply gated) — not this tip. |
| **M** | **M0** | All four: implied pasture DMI, AUDs, NPK deposited, avg pasture score. **Formula LOCKED** (§11): **S1+F1(DMI)+L1+H0+C1+Z1** + NPK **Ns+R1+Kc**. |
| **A** | **A1** | Totals **and** per-acre when acres known; else total + “no acres” badge |
| **N** | **N1** | Separate sortable **N / P / K** + optional combined |
| **S** | **S0** | Client-side sort on **any** management column; default Name ↑ |
| **D** | **D0** | Compute-on-read; **no migration** |
| **X** | **X1** | Pasture + mixed-use land only |

**Superseded:** **V0** (toggle only on Locations tab) — placement reopened under new **U / F / T / C / P** axes below.

**Implied DMI / AUDs / NPK formula (LOCKED — see §11):** **S1+F1(DMI)+L1+H0+C1+Z1** with NPK = **Ns+R1+Kc** (cards **t849s3511**, **t862s3559**). This supersedes the earlier M0 “presence-weighted share / escalate M0→M1” note. **D0** still holds (no SQL).

## 3. Current rotation UI (citations — `origin/main` `dc90185`)

### 3.1 Route / entry

| Piece | Where | What |
|---|---|---|
| **Nav label** | `src/ui/header.js` **59**, **698**, **753** | Sidebar / bottom-nav: **“Rotation Calendar”** → `#/events` (`nav-events` / area `rotation-calendar`). |
| **Screen** | `src/features/events/index.js` **64–101** | `renderEventsScreen`: desktop (≥900px) → `renderCalendarGrid`; **mobile (&lt;900px) → `renderMobileEventsScreen` — no calendar** (§19.7). |
| **Empty CTA** | `rotation-calendar/calendar-grid.js` **346–357** | “Add locations in Fields…” → `navigate('#/locations')`. |
| **Locations list** | `src/features/locations/index.js` | Separate `#/locations` screen (tabs Locations \| Surveys). **No shared row model** with the calendar. |

### 3.2 Layout

| Piece | Where | What |
|---|---|---|
| **Grid** | `calendar-grid.js` **1–5**, **326–330**; CSS `main.css` **2611–2617** | 3 columns: **paddock 180px + timeline flex + sidebar 260px**; `height: calc(100vh - 280px)`; `overflow: hidden` on grid. |
| **Left column** | `paddock-column.js` **39–71**; CSS **2620–2668** | Per-location name, area, status tag (Active / Never grazed / Linked…). Header sticky. |
| **Timeline** | `timeline.js` **123–164**; CSS **2671–2709** | Horizontally + vertically scrollable (`.timeline__scroll`); axes; Today line; absolute-positioned rows (`ROW_HEIGHT` 72). |
| **Right sidebar** | `sidebar.js` **23–86**; CSS **2946–3013** | Per-row Summary: AUDS / Pasture% / NPK / event count; sticky header + footer. |

### 3.3 Scroll wiring — Tim’s desync bug **CONFIRMED**

| Container | CSS | Vertical scroll? |
|---|---|---|
| `.paddock-col` | `main.css` **2620–2623** `overflow-y: auto` | **Own** vertical scroller |
| `.timeline__scroll` | `main.css` **2671–2674** `overflow-x: auto; overflow-y: auto` | **Own** vertical (and horizontal) scroller |
| `.sidebar` | `main.css` **2947–2951** `overflow-y: auto` | **Own** vertical scroller |

**No scroll-sync listeners** anywhere under `src/features/events/rotation-calendar/` (no `scroll` / `scrollTop` pairing). Keyboard arrows only adjust `timelineContainer.scrollLeft` (`calendar-grid.js` **309–313**).

**Honest finding:** Tim’s “left location column scroll not in sync with the rest of the rows” is a **real structural bug**, not user error. Three independent overflow-y parents + fixed 72px row height assumption with **no** `scroll` sync = rows drift as soon as any column scrolls vertically.

### 3.4 What it shows today (past / future / surveys)

| Intent Tim named | Code today | Honest gap |
|---|---|---|
| **Past activity visual** | Past green blocks from overlapping `eventPaddockWindows` left of Today (`calendar-grid.js` **132–215**, `past-block.js`) | Structure exists. Labels show group · AUDS · days · Pasture/Feed/DMI/hd — but **AUDS/pasture%/DMI are passed as 0** (`calendar-grid.js` **134–139**, **197–201** never accumulate). |
| **Future readiness from surveys** | `renderEstimatedFutureBlock` / forecast (`future-block.js`; wired `calendar-grid.js` **218–261**) | UI shells exist (recovery gradient, never-grazed → survey CTA, confinement inactive). **Recovery dates are stubs:** `minDate: ''`, `maxDate: ''`, `confidence: 'min'` hardcoded; `getCalcByName` imported in `calendar-grid.js` **11** but **unused** for REC / FOR recovery. `REC` calc exists in `src/calcs/advanced.js` **88–111**; FOR forecast confidence in `feed-forage.js` **541–575** — **not wired into the grid**. |
| **Else relative days since last graze vs peers** | — | **Not implemented.** Never-grazed flag = `locWindows.length === 0` only; no ranking / relative rest days among rested paddocks. |
| **Sidebar management metrics** | `paddockSummaries` → sidebar (`calendar-grid.js` **266–276**, `sidebar.js`) | Same zeros: `rowAuds` / NPK / pasturePct stay **0**. So the rotation sidebar **looks** like Tim’s management ask but **does not compute** the numbers. |

### 3.5 Relationship to Locations

- Locations = list/cards + Surveys tab + sort Name/Acres/Survey (`locations/index.js`).
- Rotation Calendar = separate `#/events` desktop grid; empty state points at Locations.
- **No shared component** for “one row per location” across both screens.
- Card-level “Est. available DM · ~AUDs” on Locations is **FOR-1 instantaneous capacity**, not historical deposited AUDs over a window (see prior brief §2).

### 3.6 Mobile vs desktop risks

| Risk | Citation |
|---|---|
| **No calendar on phone** | `events/index.js` **79–86**; `mobile-events-screen.js` header: viewport &lt;900px → list only (§19.7). Tim wants **iPhone + Mac** for this OI — current CP-54 calendar is **desktop-only**. |
| **Fixed 180+1fr+260 grid** | `main.css` **2611–2614** — no `@media` collapse for `.calendar-grid`; on narrower Mac widths the sidebar crowds the timeline. |
| **Triple vertical scroll** | Confirmed above — worse on trackpads / touch if any future mobile calendar reuses the same DOM. |
| **Stub metrics** | Zeroed AUD/NPK/DMI — a phone “management” view that reused sidebar numbers would still be wrong until compute-on-read lands. |

### 3.7 Gap list (honest)

1. **Scroll desync (confirmed):** three independent `overflow-y: auto` columns; no sync.
2. **Future readiness incomplete:** survey/REC/FOR not wired; empty min/max ticks.
3. **Relative rest ranking missing:** Tim’s “days since last graze vs other locations” not present.
4. **Sidebar / past-block metrics are placeholders (zeros).**
5. **Desktop-only calendar** — conflicts with Tim’s phone requirement for the integrated surface.
6. **Locations and Rotation are split products** with overlapping intent and no shared row model.
7. Prior OI-0246 V0 (Locations-only toggle) would **duplicate** intent already sketched (badly) on the rotation sidebar — Tim correctly pushed to integrate.

## 4. Goals / non-goals (revised)

**Goals**

- One coherent **management + rotation** experience: frozen location identity, **past grazing visual**, **future readiness** (survey/recovery when present; else relative days-since-last-graze), plus the **AGREED** sortable metric columns over the AGREED window.
- **Fix scroll sync** as a hard requirement (location column stays aligned with timeline/metrics rows).
- Work on **phone and Mac**.
- Prefer reuse of existing calcs; **D0** no migration.

**Non-goals (this OI)**

- New DB tables / nutrient ledger (unless Tim rejects D0 later).
- Replacing Map / Harvest / Surveys recording flows.
- Editing scores or applying amendments from the management surface.
- Rewriting move wizard / event create (calendar remains an overview; clicks can still deep-link to events/locations).
- Changing DMI-9 farm run-rate panel behavior.

## 5. Option axes — UI architecture (LOCKED — Tim t784s3247)

Metric axes **W/M/A/N/S/D/X** = **AGREED (Tim t782u)** and carried into the lock. Placement / layout axes below are **LOCKED** to Design lean on tip `1d6465a`.

### U — Surface architecture

| Code | Choice |
|---|---|
| **U0 (LOCKED)** | **One integrated Locations + Rotation management surface** (single designed UI; absorbs/replaces the broken desktop calendar chrome for this job). **List-parity addendum (LOCKED t835s3460 La):** List keeps this surface and replicates current `#/locations` tools (search, X1 type filters, toolbar, Inputs & amendments, card details, Edit/Survey/Soil) **plus** the season metrics already on List. Explicit **Edit** button — **no name-cell click-to-edit in List**. **Cb:** Calendar name-click still opens `openLocationSheet` — Build must **not** change Calendar click. **Rb:** `#/locations` stays; nav de-dupe later (out of this implement). **Design lean — Tim locked;** List/click revised by t835s3460. |
| U1 | Fix rotation calendar **in place** (scroll sync + wire metrics/readiness) and keep a separate Locations management toggle. |
| U2 | Two tabs / routes that share one row model (Locations metrics tab + Rotation timeline tab). |

### F — Frozen / synced location column

| Code | Choice |
|---|---|
| **F0 (LOCKED — must-fix)** | **Required:** one vertical scroll owner (or hard-linked scroll sync); location **name column stays aligned** with timeline/metric rows while scrolling. **Design lean = required; not optional — Tim locked.** |
| F1 | Cosmetic sticky header only; accept independent column scroll (rejects Tim’s bug report — **do not recommend**). |

### T — Timeline content (past + future)

| Code | Choice |
|---|---|
| **T0 (LOCKED)** | Past grazing blocks (visual) **+** future readiness: **use pasture survey / recovery window when present**; **else** show **relative days since last graze** ranked vs other in-scope locations. **Design lean — Tim locked** (matches stated intention). |
| T1 | Past + survey/recovery only; empty/grey when no survey (no relative ranking). |
| T2 | Past only this OI; future readiness follow-on. |

### C — Metric columns vs timeline

| Code | Choice |
|---|---|
| **C1 (LOCKED)** | On Mac: **sortable metric columns between frozen name and timeline** (name \| metrics \| timeline). Sidebar “Summary” zeros retired / folded into these columns. **Design lean — Tim locked.** |
| C0 | Metrics as a **toggleable panel** (show/hide columns) beside or over the timeline. |
| C2 | Metrics **below** each name row (stacked), timeline full-width beside. |

### P — Phone vs Mac

| Code | Choice |
|---|---|
| **P1 (LOCKED)** | **Mac:** side-by-side (name \| metrics \| timeline). **Phone:** compact metric row / expand under the location name; **timeline scrolls horizontally**; **one vertical scroll** for the location list (F0). **Design lean — Tim locked.** |
| P0 | Phone: same three-column shrink (likely unusable). |
| P2 | Phone: metrics-only list first; open a location for its timeline strip. |

### Design recommendation (LOCKED)

**AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1**

Plain English: one combined Locations + rotation management screen; keep the location names locked in sync while you scroll; show past grazes and future readiness (surveys when you have them, otherwise how long since last graze vs other paddocks); put the agreed metric columns next to the names on Mac and under the names on phone; season window + compute-on-read as already agreed; no SQL.

## 6. Locked (Tim, card t784s3247, ~10:05 AM ET)

**AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1**

Tim locked Design’s one-tap recommendation on the revised lock card (exact words: *"Lock OI-0246: one combined Locations + rotation management screen; surveys when present else relative days since last graze; location names stay aligned while scrolling; phone metrics under the name; keep agreed metrics (season Oct 1–Sep 30 editable, DMI/AUDs/N-P-K separate/avg score, totals+per-acre, pastures+mixed-use, compute-on-read, sortable)"*). Interpretation (Orchestrator + Design): Design lean on tip `1d6465adff611230fa429209c860a96927d3973f`.

| Axis | Locked | Meaning |
|---|---|---|
| W1 | ✓ AGREED + **Pb** | Season default Oct 1 – Sep 30; editable date range. **Pb:** this browser persists the chosen window in `localStorage` (see §10). **Season default** still null → hard-coded Oct 1–Sep 30. **Db** (farm Settings) is **OI-0247** (docs on main; apply gated). |
| M0 | ✓ AGREED + **formula §11** | Implied pasture DMI, AUDs, NPK, avg pasture score. Locked split/hay/NPK: **S1+F1(DMI)+L1+H0+C1+Z1** + **Ns+R1+Kc** (t849s3511 / t862s3559). Layout **C1** (Mac columns) is unchanged; metrics **C1** is the TIM-3 window clip. |
| A1 | ✓ AGREED | Totals **and** per-acre when acres known |
| N1 | ✓ AGREED | Separate sortable N / P / K (+ optional combined) |
| S0 | ✓ AGREED | Client-side sort on any management column |
| D0 | ✓ AGREED | Compute-on-read; **no migration / no SQL** |
| X1 | ✓ AGREED | Pasture + mixed-use land only |
| U0 | ✓ + **La/Cb/Rb** | One combined Locations + rotation management screen. **La:** List = Locations tools + season metrics; explicit Edit, no List name-click. **Cb:** Calendar name-click unchanged. **Rb:** keep `#/locations`. |
| F0 | ✓ must-fix | Location names stay aligned while scrolling |
| T0 | ✓ | Future readiness = surveys when present else relative days since last graze vs peers; past activity visual |
| C1 | ✓ | Mac: sortable metrics between frozen name and timeline |
| P1 | ✓ | Phone: metrics under the name; timeline scrolls sideways; one vertical scroll |

**READY FOR BUILD** after docs land on `main` (Orchestrator land card; Tim’s land yes) — Build **may** also start from this locked tip ahead of docs land (same coordination pattern as recent OIs). First implementation is live on `52540a3` (OI-0245 already shipped). This addendum builds from that tip. **No migration / no SQL.**

## 7. Acceptance criteria (LOCKED — Build after docs land / from locked tip)

- [x] Spec **LOCKED** (t784s3247): **AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1**.  
- [ ] Docs tip landed on main (separate Tim land yes) **or** Build starts from this locked tip per Orchestrator.  
- [ ] **U0 + La:** one combined Locations + rotation management surface. **List** keeps Calendar\|List and season DMI/AUDs/N/P/K/Score, and replicates current `#/locations` tools: search, type filters (within **X1/Ta**), toolbar (**+ Add**, **Map**, **Survey**, **Harvest**, **Feed types**), Inputs & amendments, card details (name, type badge, code, acres · soil · forage, soil-test status), and **Edit / Survey / Soil** buttons. Explicit **Edit** — **no name-cell click-to-edit and no name-click navigation in List**. `#/locations` remains reachable (**Rb**); event create/close still reachable from Calendar.  
- [ ] **F0 (must-fix):** scrolling never desyncs location names from timeline/metric rows (single vertical scroll owner or hard-linked sync); QA on Mac + phone.  
- [ ] **T0:** past grazing activity visual; future readiness = survey/recovery when present, else relative days since last graze ranked vs other in-scope paddocks.  
- [ ] **C1 / P1:** Mac name \| metrics \| timeline; phone metrics under name, horizontal timeline, one vertical list scroll.  
- [ ] **AGREED metrics** over **W1** window for **X1** locations: DMI / AUDs / N / P / K / avg score; **A1** totals+per-acre; **S0** every numeric column sortable.  
- [ ] **Season-metrics formula (§11, t849s3511 + t862s3559):** **S1/Ns** split DMI, AUDs, and NPK by day/hours × effective acres among paddocks open then (not an event-level equal share). **F1** applies to **DMI only**: subtract hay eaten when measured; no-hay day = 100% of need is pasture DMI; unmeasured hay day = “—” on DMI (do not invent eaten). **L1** floor implied pasture DMI at 0 per event-day after hay subtract (no negative pasture DMI). **H0** no hay-over-need column. **C1** (metrics clip, not layout C1) clip presence to the TIM-3 paddock/event window. **Z1** a location never present in the window shows 0; missing weights (or other missing inputs needed to compute) = “—”. **NPK:** **Ns** same split as DMI/AUDs; **Kc** excretion = head × weight × days × NRCS class rates (`excretion_n/p/k_rate`); **R1** ADD NPK from recorded residual/stored feed (NPK only; does not change F1 for DMI). Residual NPK content from existing `batch_nutritional_profiles` (latest `tested_at`) else `feed_types` `n_pct`/`p_pct`/`k_pct` — **no new column**.  
- [ ] **D0 HOLDS:** no new migration files; no schema_version bump; no SQL apply; compute-on-read. Pb is `localStorage` only.  
- [ ] **Ta / X1:** List inventory stays **Pasture + Mixed-Use only**. Do not add Crop / Confinement / Storage rows this implement (those types stay on `#/locations`). Type filters on List are All-within-X1 / Pasture / Mixed-Use.  
- [ ] **Cb:** Calendar click **unchanged** — name-click still calls `openLocationSheet`. Build must not change Calendar click behavior.  
- [ ] **Rb:** `#/locations` route remains (including the period-bar Locations · Surveys · Map link if still useful). Nav de-dupe (dropping the duplicate Locations entry once List covers it) is **out of this implement**.  
- [ ] **Pb:** Persist the chosen metric window (`metricStart` / `metricEnd`) in `localStorage` (design key: `gtho_v2_locations_metric_window`, same family as `gtho_v2_budget_viewed_period`). Restore on mount when the URL **lacks** those params. Do not wipe on Calendar\|List toggle, remount, or leave-and-return to `#/events`. Valid URL deep-link `metricStart`/`metricEnd` still take precedence on mount and may be written through to storage. **Season default** still sets the override to null (and clears the stored override) so the window falls back to hard-coded Oct 1–Sep 30 (`periodContaining` / `DEFAULT_BUDGET_PERIOD`). Do **not** invent a local “save default” UI. **Db** (per-farm Settings month/day) is **OI-0247** (docs on main; apply gated) — not this tip.  
- [ ] Unit tests: scroll-sync invariant (or single-scroller architecture), aggregation helpers, readiness fallback (survey vs relative days).  
- [ ] **Sequence:** implement from live `52540a358f511bf46bceacbd7dcc7c94918acd04` (OI-0245 already shipped). Docs-land only after Tim land yes.

## 8. Related

- First PROPOSED tip `ebb79d1` (Locations-only V0) — **superseded** on placement
- Revised PROPOSED tip locked from: `1d6465adff611230fa429209c860a96927d3973f`
- UX §19 Rotation Calendar; DS §4.3; `V2_UX_FLOWS.md` §19
- `IMPLIED_PASTURE_DMI_2026-11-17.md`; OI-0241 / OI-0242; OI-0126 / OI-0131
- CALC: NPK-1/3, ANI-AU/AUD/ADA, FOR-1/2, SUR-1, DMI-8/9, REC recovery
- UX §15.3 Locations; SCHEMA Domain 2 / 6
- OI-0245 (confirmed-bred due range) — already shipped; first OI-0246 implementation is live on `52540a3`

## 9. Origin

- Tim via Orchestrator **t777u** (~9:57 AM ET 2026-11-21): management metrics + sort.
- Tim via Orchestrator **t782u** answering **t781s3238** (~10:02 AM ET): agrees metrics; rotation screen is a mess (scroll desync); integrate rotation calendar + locations; past visual + future readiness (surveys else relative days since last graze).
- Tim via Orchestrator **t784s3247** (~10:05 AM ET): locked Design one-tap rec (exact words in §6).
- Tim via Orchestrator **t833u** (~5:25 AM ET 2026-11-22): list view should replicate current Locations screen functionality; go back to click **Edit** rather than click-to-edit.
- Tim via Orchestrator **t835s3460** (5:30 AM ET 2026-11-22): locked **La+Ta+Cb+Rb**.
- Tim via Orchestrator **t837u** (~5:31 AM ET 2026-11-22): navigating away from the calendar reverts the season window to the Oct 1–Sep 30 default; also wants a way to edit the season default dates that get loaded; user should not have to reselect the season just because they clicked List.
- Tim via Orchestrator **t841s3483** (5:37 AM ET 2026-11-22): locked **Pb** (this browser remembers the chosen start/end) and **Db** (per-farm Settings month/day) — **Db is OI-0247, not this tip**.
- Tim via Orchestrator **t843u** / **t846u** (~5:38–5:41 AM ET 2026-11-22): how is DMI from pasture calculated across multi-paddock windows (with or without stored feed), sub-moves, and event windows — same question for NPK and AUDs.
- Tim via Orchestrator **t849s3511** (~5:45 AM ET 2026-11-22): locked season-metrics split **S1+F1+L1+H0+C1+Z1**.
- Tim via Orchestrator **t856u** (~5:48 AM ET 2026-11-22): NPK is a constant based on animal species, prorated equally across acres in an event window, PLUS NPK from residual feed recorded — later reconciled.
- Tim via Orchestrator **t862u** / card **t862s3559** (5:53 AM ET 2026-11-22): locked NPK **Ns+R1+Kc** (same day×acres split as DMI/AUDs, not event-level equal share; add residual-feed NPK; keep NRCS class rates).

## 10. LOCKED list-parity + season persist (2026-11-22)

**Locked:** **La+Ta+Cb+Rb** (card **t835s3460**, 5:30 AM ET) + **Pb** (card **t841s3483**, 5:37 AM ET). Parent lock **AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1** still holds. This section revises **U0/List acceptance** and **W1 persistence**. **D0 holds** (no migration / no SQL). **F0** single vertical scroll still applies in both views.

Live parent: `52540a358f511bf46bceacbd7dcc7c94918acd04`. Prior docs tip: `ea481a2f2020a24d9fdd1cf34b494ebaa809852b`.

### La — List = Locations tools + season metrics

List mode on the combined `#/events` surface already has Calendar|List and the season DMI / AUDs / N / P / K / Score columns. Tim (t833u, screenshot of current `#/locations`): List needs the functionality on the current Locations screen, basically replicate that; go back to an explicit **Edit** button instead of click-to-edit.

**Add to List (from current `src/features/locations/index.js` Locations tab):**

- Search box (name / field code).
- Type filters — **within Ta/X1 only** (All-within-X1 / Pasture / Mixed-Use). Do not expand this view to Crop / Confinement / Storage.
- Toolbar: **+ Add**, **Map**, **Survey**, **Harvest**, **Feed types** (same actions as Locations).
- **Inputs & amendments** (including Apply input), as on Locations.
- Card details: name, type badge, code, acres · soil · forage, soil-test status — alongside the season metrics already shown.
- Row actions: **Edit / Survey / Soil** buttons (same as Locations cards).

**Click rule (revises the earlier U0 / name-cell decision):** List uses the explicit **Edit** button to open `openLocationSheet`. **No name-cell click-to-edit and no name-click navigation in List** (name is not a button / not a link in List).

### Ta — Pasture + Mixed-Use only (X1 holds)

Do not change the in-scope land types. List inventory stays **Pasture + Mixed-Use**. Crop / Confinement / Storage remain on `#/locations` and are out of this implement.

### Cb — Leave Calendar alone

Calendar name-click stays as it is on `52540a3`: the name cell calls `openLocationSheet` (`renderManagementRow` in `calendar-grid.js`). **Build must not change Calendar click behavior.** Documented here so List’s new Edit-button rule is not copied onto Calendar.

### Rb — Keep `#/locations`

The `#/locations` route stays. Dropping the duplicate nav entry (once List covers Locations tools) is a later cleanup — **out of this implement**.

### Pb — This browser remembers the chosen season window (no SQL)

**Bug on live `52540a3`:** `calendar-state.js` is session memory + URL only. `readStateFromUrl()` resets to defaults (including `metricStart`/`metricEnd` = null → hard-coded Oct 1–Sep 30) when the hash has no query, so Calendar|List toggle is fine only while the hash still carries params, but leaving `#/events` and returning (or a remount without params) wipes the chosen window. Tim: the user should not have to reselect the season just because they clicked List or navigated away.

**LOCKED behavior:**

- Persist the chosen `metricStart` / `metricEnd` in **this browser** via `localStorage` (device-local; not `user_preferences`; no SQL).
- Design key: `gtho_v2_locations_metric_window` (same family as the feed pattern `gtho_v2_budget_viewed_period`). Suggested value: JSON `{ "start": "YYYY-MM-DD", "end": "YYYY-MM-DD" }`. Invalid / missing storage is ignored.
- **Restore on mount** when the URL lacks valid `metricStart`/`metricEnd` params.
- Do **not** wipe the stored or in-memory window on Calendar|List toggle, remount, or leave-and-return to `#/events`.
- URL deep-link params, when present and valid, **still take precedence** on mount and may be written through to `localStorage` (hash sync via existing `syncUrl` may continue).
- **Season default** still clears the override (`setMetricWindow(null, null)`) **and** clears the stored override, so the window falls back to the hard-coded Oct 1–Sep 30 (`periodContaining` / `DEFAULT_BUDGET_PERIOD`). Do **not** invent a local “save default” UI in this tip.

### Db — OI-0247 (not this tip)

A way to edit the farm’s default season start/end (month/day in Settings; matches Tim’s Nov 17 decision) is **OI-0247** (`session_briefs/FARM_SETTINGS_SEASON_DEFAULT_2026-11-22.md`). Docs landed on main `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee`. SQL + backup + a separate Tim yes at apply — **not this land.** Until Db is applied, “Season default” remains the hard-coded Oct 1–Sep 30.


## 11. LOCKED season-metrics formula (2026-11-22)

**Locked:** **S1+F1+L1+H0+C1+Z1** (card **t849s3511**, ~5:45 AM ET) + NPK **Ns+R1+Kc** (card **t862s3559** / **t862u**, 5:53 AM ET). Parent **M0/A1/N1/D0** still hold — this section locks *how* those numbers are computed for the W1 window, not which columns appear. List-parity **La+Ta+Cb+Rb+Pb** (t835s3460 / t841s3483) is unchanged. **D0 holds** (no migration / no SQL).

Live as-built on `52540a3` may still use an event-level share and/or delivery-based hay; Build must align to this formula (day×area vs event-level share; DMI eaten vs deliveries; never-present 0; missing = —).

**Codes (formula axes — do not confuse with placement codes):**

| Axis | Locked | Meaning |
|---|---|---|
| **S1** / **Ns** | ✓ t849s3511 / t862s3559 | **DMI, AUDs, and NPK** (excretion) split by **day/hours × effective acres** among the paddocks that are **open in that slice**. A paddock closed for part of an event does not keep sharing after it closes; a later-opened paddock only shares while it is open. Not an event-level equal acre share, and not “prorate the whole event equally across every paddock that was ever on the event.” |
| **F1** | ✓ t849s3511; **DMI only** | Subtract **hay eaten** when it is measured (feed checks / remaining vs delivered — reuse DMI-8 / DMI-9 eaten, not raw deliveries). A day with **no hay** on the event = **100%** of need is implied pasture DMI. A day with hay present but **eaten unmeasured** = “—” on **DMI** (do not invent eaten; do not silent-0). F1 does **not** subtract hay from AUDs or from excretion NPK. |
| **R1** | ✓ t862s3559; **NPK only** | **ADD** NPK from **recorded residual / stored feed** that stays on the paddock (close / leave-as-residual / `event_feed_check_items.remaining_quantity` attributed to that location — not feed transferred off). This revises the earlier “F1 applies to everything” idea **for NPK only**. DMI stays F1. |
| **Kc** | ✓ t862s3559 | Animal excretion NPK = **head × weight × days (TIM-3 hours) × NRCS class rates** (`animal_classes.excretion_n_rate` / `excretion_p_rate` / `excretion_k_rate`, kg / 1000 kg BW / day). Not a single farm-wide flat rate. |
| **L1** | ✓ t849s3511 | **Floor** implied pasture DMI at **0 per event-day** after hay subtract. Do not show negative pasture DMI when hay eaten exceeds need. |
| **H0** | ✓ t849s3511 | **No** hay-over-need column. (Leftover hay after need is floored by L1; it is not a displayed metric.) |
| **C1** | ✓ t849s3511; **metrics clip** | Clip presence to the **TIM-3** paddock/event window (hours actually open that day), not a calendar-day all-or-nothing and not past the W1 season window. **Distinct from layout C1** (Mac: sortable metrics between frozen name and timeline), which is unchanged. |
| **Z1** | ✓ t849s3511 | A location **never present** in the W1 window shows **0** (not “—”). **Missing** weights (or other missing inputs required to compute a value, including unmeasured hay on a DMI day under F1, or missing NPK % on a residual addend that should contribute) show **“—”**, never a silent 0. |

### Residual-feed NPK content — no schema GATE

Read-only inspect of Domain 4 / 10 (migration `004_d4_feed_inventory.sql`, `010_d10_feed_quality.sql`; `V2_SCHEMA_DESIGN.md` §4.1 / §10.1): **`feed_types` already has `n_pct` / `p_pct` / `k_pct`**, and **`batch_nutritional_profiles` already has `n_pct` / `p_pct` / `k_pct`**. `event_feed_entries` and `event_feed_check_items` record quantity / remaining only (no NPK columns of their own). **R1 does not need a new NPK-content column. No migration. No GATE.**

**Resolve content (compute-on-read):** for the residual quantity on a batch at a location, use the latest `batch_nutritional_profiles` row for that `batch_id` (greatest `tested_at`) when that profile has the needed `n_pct`/`p_pct`/`k_pct`; otherwise fall back to the parent `feed_types` percents. Convert remaining (or residual) quantity to DM mass with batch (else type) `dm_pct` and `weight_per_unit_kg` as already used in feed calcs, then `mass_dm × pct`. Attribute the addend to the paddock where the residual was recorded. No residual recorded, or remaining that was transferred off, adds **0** (not “—”). If a residual quantity exists but **both** the profile and the feed type lack the needed percent, that residual addend is **“—”** (Z1 missing), not a silent 0; excretion NPK (**Kc**) can still display when its own inputs are present.

### Build alignment notes

- Split every day (or hour) the window is open; then sum into the W1 total / per-acre (**A1**) columns. Sub-moves and mid-event paddock opens/closes are handled by S1’s “open then” slice — do not allocate a closed paddock’s later days.
- AUDs use the same S1 presence × acres split and C1 TIM-3 clip (no F1 hay subtract; no R1).
- Do not use delivered quantity as eaten for F1 DMI.
- Do not reopen layout C1 / P1, List click rules, or Db.

---

**Tip instruction:** **SPEC LOCKED / READY FOR BUILD** for **La+Ta+Cb+Rb+Pb** + season-metrics **S1+F1(DMI)+L1+H0+C1+Z1** with NPK **Ns+R1+Kc** on parent **AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1**. Do **not** land on main until Tim yeses the land card. **No migration / no SQL.** Residual-feed NPK uses existing `feed_types` / `batch_nutritional_profiles` percents — **no GATE**. **Db** is **OI-0247** (docs on main; apply gated). Build from live code `52540a358f511bf46bceacbd7dcc7c94918acd04` on parent main `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee` (or this locked tip ahead of docs land per Orchestrator).
