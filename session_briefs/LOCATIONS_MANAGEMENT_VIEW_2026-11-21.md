# Locations + rotation management surface (OI-0246)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-21 ~10:05 AM ET, via Orchestrator, card **t784s3247** answering revised lock card) — opened ~9:57 AM ET (**t777u**); revised ~10:03 AM ET (**t782u** answering **t781s3238**); **locked Design lean** on tip `1d6465adff611230fa429209c860a96927d3973f`  
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card — land only after Tim yes). **Sequence Build after OI-0245 code** unless Design/Orchestrator says otherwise (docs-land may still proceed independently).  
**Parent / base:** Forgejo `origin/main` tip `dc9018534e237291daf3bac0daf8835ef42afb7b` (OI-0245 LOCKED docs; prior code tip `9402a0675e5924ca311974c31fc88084249c576b`; stamp `b2026-11-21.1415-9402a06`; `RELEASED_SCHEMA_VERSION` **47**). Rotation UI citations below read on **`dc90185` / current `origin/main`**.  
**Also related:** Rotation calendar CP-54 / UX §19 (`src/features/events/rotation-calendar/*`); Locations UX §15.3; Implied pasture / DMI-9; OI-0241 / OI-0242 forage; pasture surveys OI-0126/0131; NPK-1/3 + ANI-AU/AUD/ADA; REC recovery (`src/calcs/advanced.js`); budget period Oct 1–Sep 30.  
**Schema / migration:** **D0 LOCKED** — **compute-on-read**; **no new tables / no migration / no SQL**.  
**Supersedes tip:** `ebb79d1e8be10757ad81998647318b22178b4cc1` (first PROPOSED; placement V0 only — reopened). Revised PROPOSED tip locked from: `1d6465adff611230fa429209c860a96927d3973f`.

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
| **W** | **W1** | Selectable date range; default current budget/grazing period **Oct 1 – Sep 30** (`periodContaining` / `DEFAULT_BUDGET_PERIOD`) |
| **M** | **M0** | All four: implied pasture DMI, AUDs, NPK deposited, avg pasture score |
| **A** | **A1** | Totals **and** per-acre when acres known; else total + “no acres” badge |
| **N** | **N1** | Separate sortable **N / P / K** + optional combined |
| **S** | **S0** | Client-side sort on **any** management column; default Name ↑ |
| **D** | **D0** | Compute-on-read; **no migration** |
| **X** | **X1** | Pasture + mixed-use land only |

**Superseded:** **V0** (toggle only on Locations tab) — placement reopened under new **U / F / T / C / P** axes below.

**Implied DMI attribution note (unchanged for Build after lock, M0):** prefer presence-weighted share of daily group demand on days the location’s paddock window is open, minus stored feed attributed to that event/day presence (reuse DMI-8 / DMI-9 helpers). Unknowns as “—” / unknown, never silent 0. Escalate M0→M1 only if spike fails — without reopening other AGREED axes.

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
| **U0 (LOCKED)** | **One integrated Locations + Rotation management surface** (single designed UI; absorbs/replaces the broken desktop calendar chrome for this job; Locations list/Surveys stay reachable for edit/survey entry). **Design lean — Tim locked.** |
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
| W1 | ✓ AGREED | Season default Oct 1 – Sep 30; editable date range |
| M0 | ✓ AGREED | Implied pasture DMI, AUDs, NPK, avg pasture score |
| A1 | ✓ AGREED | Totals **and** per-acre when acres known |
| N1 | ✓ AGREED | Separate sortable N / P / K (+ optional combined) |
| S0 | ✓ AGREED | Client-side sort on any management column |
| D0 | ✓ AGREED | Compute-on-read; **no migration / no SQL** |
| X1 | ✓ AGREED | Pasture + mixed-use land only |
| U0 | ✓ | One combined Locations + rotation management screen |
| F0 | ✓ must-fix | Location names stay aligned while scrolling |
| T0 | ✓ | Future readiness = surveys when present else relative days since last graze vs peers; past activity visual |
| C1 | ✓ | Mac: sortable metrics between frozen name and timeline |
| P1 | ✓ | Phone: metrics under the name; timeline scrolls sideways; one vertical scroll |

**READY FOR BUILD** after docs land on `main` (Orchestrator land card; Tim’s land yes) — Build **may** also start from this locked tip ahead of docs land (same coordination pattern as recent OIs). **Sequence Build after OI-0245 code** (confirmed-bred due range) unless Design/Orchestrator says otherwise; docs-land may still proceed independently. **No migration / no SQL.**

## 7. Acceptance criteria (LOCKED — Build after docs land / from locked tip)

- [x] Spec **LOCKED** (t784s3247): **AGREED(W1+M0+A1+N1+S0+D0+X1)+U0+F0+T0+C1+P1**.  
- [ ] Docs tip landed on main (separate Tim land yes) **or** Build starts from this locked tip per Orchestrator.  
- [ ] **U0:** one combined Locations + rotation management surface; Locations Surveys / Map / card edit and event create/close still reachable.  
- [ ] **F0 (must-fix):** scrolling never desyncs location names from timeline/metric rows (single vertical scroll owner or hard-linked sync); QA on Mac + phone.  
- [ ] **T0:** past grazing activity visual; future readiness = survey/recovery when present, else relative days since last graze ranked vs other in-scope paddocks.  
- [ ] **C1 / P1:** Mac name \| metrics \| timeline; phone metrics under name, horizontal timeline, one vertical list scroll.  
- [ ] **AGREED metrics** over **W1** window for **X1** locations: DMI / AUDs / N / P / K / avg score; **A1** totals+per-acre; **S0** every numeric column sortable.  
- [ ] **D0:** no new migration files; no schema_version bump; no SQL apply; compute-on-read (wire real calcs — retire sidebar/past-block zeros).  
- [ ] Unit tests: scroll-sync invariant (or single-scroller architecture), aggregation helpers, readiness fallback (survey vs relative days).  
- [ ] **Sequence:** implement after OI-0245 code unless Design/Orchestrator says otherwise.

## 8. Related

- First PROPOSED tip `ebb79d1` (Locations-only V0) — **superseded** on placement
- Revised PROPOSED tip locked from: `1d6465adff611230fa429209c860a96927d3973f`
- UX §19 Rotation Calendar; DS §4.3; `V2_UX_FLOWS.md` §19
- `IMPLIED_PASTURE_DMI_2026-11-17.md`; OI-0241 / OI-0242; OI-0126 / OI-0131
- CALC: NPK-1/3, ANI-AU/AUD/ADA, FOR-1/2, SUR-1, DMI-8/9, REC recovery
- UX §15.3 Locations; SCHEMA Domain 2 / 6
- OI-0245 (confirmed-bred due range) — **sequence Build after that code**

## 9. Origin

- Tim via Orchestrator **t777u** (~9:57 AM ET 2026-11-21): management metrics + sort.
- Tim via Orchestrator **t782u** answering **t781s3238** (~10:02 AM ET): agrees metrics; rotation screen is a mess (scroll desync); integrate rotation calendar + locations; past visual + future readiness (surveys else relative days since last graze).
- Tim via Orchestrator **t784s3247** (~10:05 AM ET): locked Design one-tap rec (exact words in §6).

---

**Tip instruction:** **SPEC LOCKED / READY FOR BUILD**. Do **not** land on main until Tim yeses the land card. **No migration / no SQL.** Sequence Build after OI-0245 code unless Design/Orchestrator says otherwise.
