# Timeline period totals on Locations Calendar (OI-0250)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-22 ~7:14 AM ET, via Orchestrator, card **t971s3875**; placement from typed **t968u**) — **Sb+Pw+En+Nk+Pp+Uf+Sz+Af+Sq+D0**. Docs tip ready for Tim’s land of **docs**. This tip is docs only. **No SQL on this tip.**  
**Owner:** GTHO Design → GTHO Build (after docs live on main; implement only after PR #126 lands — Design briefs Build then).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 list-parity + metrics live; OI-0249 docs ancestor `200774f`; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 Locations management + season formula **S1+F1(DMI)+L1+H0+C1+Z1** / NPK **Ns+R1+Kc** + persist **Pb** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md)); OI-0247 season-default **Db**; OI-0249 partial unknown **Zp+Gg+…** (PR #126 A+C in flight — sequence **after** that lands).  
**Schema / migration:** **D0 — none.** Reuse existing Locations season helpers and (after #126) OI-0249 partial markers. No new column, no migration, no data write.

## 1. Problem

Tim ask **t963u** (2026-11-22 ~7:07 AM ET, via Orchestrator):

> “Just below the timeline lets add the total stats for the period in view. DMI from pasture+DMI from stored feed=Total DMI (all enumerated) & Total NPK”

Today the Locations **Calendar** shows **per-location** season metric columns (implied **pasture** DMI, AUDs, N, P, K, Score) for the metric window (**Pb** / Season default). There is **no** one-band total strip for the period in view that enumerates pasture DMI, stored-feed DMI, and Total DMI, plus Total N/P/K across the filtered locations on screen.

Stored feed already participates in the locked **F1** formula (measured hay eaten is subtracted from demand to get implied pasture DMI), but the UI does not surface stored-feed DMI as its own number. Orchestrator also noted ~50k lb Mar–May hay that failed to subtract when feed rows lack DM snapshots. Design had recommended treating missing-DM as unknown/partial (**Sd**); Tim locked **Sz** — missing-DM feed counts as **0** stored and does **not** trigger partial. **Pp** still marks partial for unknown weights.

## 2. Current state (citations — do not invent)

Read on tip `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (main / PR #123 head).

| Piece | Where | What it does today |
|---|---|---|
| Season metric columns | `src/features/events/rotation-calendar/calendar-grid.js` `METRIC_COLS` | Per-location **DMI** (title: implied pasture DMI), **AUDs**, **N**, **P**, **K**, **Score**. Calendar and List both show these after list-parity. |
| Formula | `src/features/events/rotation-calendar/location-metrics.js` | Locked **S1+F1(DMI)+L1+H0+C1+Z1** + NPK **Ns+R1+Kc**. Demand − measured hay → pasture DMI (floor 0). Excretion **Kc** + residual-feed **R1**. |
| Measured hay (F1) | `measuredHayOnEventDay` in `location-metrics.js` | Returns `measured` (dmKg), `none`, or `unknown`. Unknown (missing close DM / holds without DM) already prevents trusting that day’s stored subtraction. |
| Metric window | OI-0246 **Pb** + OI-0247 **Db** | Hash / this-browser `localStorage` for the viewed window; Season default from Farm Settings (hard-coded Oct 1–Sep 30 until OI-0247 apply). |
| Partial unknown | OI-0249 lock; PR #126 tip `6f99c22` | Sum known slices; muted “ partial” on DMI/N/P/K when some slices unknown. **Not on main yet** — this OI should reuse those helpers after #126 lands (**Sq**). |
| View strip | Calendar grid (`calendar-grid.js`) | Order today: **season metrics bar** (`renderPeriodBar`) → **color key** (`renderLegend`) → timeline grid. **No** period-totals band yet. Tim **t968u**: insert totals **between** season metrics bar and color key (**Sb**). Sidebar “Total AUDS” is not Tim’s ask. |

## 3. Goals / non-goals

**Goals**

- One summary strip on the Locations Calendar for the **period in view**, **under the season metrics selection bar and above the color key** (**Sb**, Tim **t968u**).
- Enumerate **Pasture DMI · Stored-feed DMI · Total DMI** (Total = pasture + stored when both known).
- Show **Total N, P, K** separately (same source/units as the metric columns).
- Follow the same metric window / filters as the calendar; update when period, zoom, or location filters change.
- Honor OI-0249 partial / unknown rules for **unknown weights** (muted “ partial”; — when nothing known) (**Pp**).
- Stored-feed DMI from measured eaten with known DM; **missing-DM feed counts as 0** and does **not** trigger partial (**Sz**, Tim lock; replaces Design **Sd**).

**Non-goals**

- No SQL / no migration (**D0**).
- Do not reopen OI-0246 formula locks or OI-0249 weight locks.
- Do not invent DM from as-fed alone when DM is missing (still no invented DM; under **Sz** missing-DM is treated as 0 stored, not estimated).
- Do not fold into PR #126; sequence **after** #126 (**Sq** locked; **Sx** not chosen).
- AUDs / Score in the strip are optional (**So**) — Design rec leaves them out of the first strip.

## 4. Option axes (codes in values)

### Placement / surface

| Code | Meaning |
|---|---|
| **Sb** | **LOCKED (t968u / t971s3875):** one summary strip on Locations **Calendar** **under the season metrics selection bar** (`loc-mgmt__period` / “Season metrics:”) **and above the color key** (`legend` / calendar-legend). Order: season-metrics bar → **totals strip** → color key → timeline grid. Not under List. Not under bare `#/locations`. |
| **Sv** | One summary strip **under the Calendar timeline grid** only (original Design rec; Tim superseded with **Sb**). Keep as alternative if Tim reopens. |
| **Sa** | Also show the same strip on List view footer. |
| **Sr** | Per-location totals under each row’s timeline instead of / in addition to one view strip (**Sr** alone vs **Sb+Sr** / **Sv+Sr**). |

### Window / filters

| Code | Meaning |
|---|---|
| **Pw** | **LOCKED:** totals follow the same metric window as the calendar (hash / localStorage / Season default **Pb**+**Db**); update on period / zoom / filter changes. |
| **Af** | **LOCKED:** aggregate = sum across **visible filtered** inventory locations (Pasture + Mixed-Use under current pills/search), not hidden filtered-out rows. |

### DMI enumeration

| Code | Meaning |
|---|---|
| **En** | **LOCKED:** three DMI numbers — Pasture DMI · Stored-feed DMI · Total DMI (= pasture + stored). Keep pasture/stored/total breakdown. |
| **Sd** | Design had recommended: Stored-feed DMI = only measured eaten with known DM (**F1**). If feed rows lack DM → that day’s stored contribution is **unknown** (surface as — / partial); do **not** invent DM from as-fed; do **not** treat as 0. **Not locked — Tim chose Sz.** |
| **Sz** | **LOCKED (t971s3875, Tim: “Treat missing-DM feed as 0”):** missing-DM feed counts as **0** stored and does **not** trigger partial. Do not invent DM from as-fed. |

### NPK

| Code | Meaning |
|---|---|
| **Nk** | **LOCKED (t971s3875, Tim: “Total N, Total P, Total K separately”):** Total N, P, K as separate figures (same units/source as metric columns: excretion **Kc** + residual **R1**). Not a single “NPK” blob. |
| **Sn** | Split NPK in the strip into pasture-excretion vs residual-feed columns. |

### Partial / unknown (OI-0249)

| Code | Meaning |
|---|---|
| **Pp** | **LOCKED (with Sz interaction):** when any summed location/slice is OI-0249-partial for **unknown weights** (or other non-DM unknowns), show the muted “ partial” marker on that total; if nothing known → — . **Missing-DM feed under Sz counts as 0 and does not trigger partial.** |

### Units / extras / sequencing

| Code | Meaning |
|---|---|
| **Uf** | **LOCKED:** farm display units (lb/kg) same as existing Locations metrics. |
| **Su** | Always lb (US), ignoring farm unit. Not locked. |
| **So** | Also include AUDs / Score in the strip. Not locked. |
| **Sq** | **LOCKED (t971s3875, Tim: “After PR #126”):** sequence after OI-0249 / PR #126 lands (reuse partial helpers). |
| **Sx** | Ship before #126 (standalone) — not chosen. |
| **D0** | **LOCKED:** no SQL / no migration. |

## 5. Tim lock (t971s3875)

**Sb+Pw+En+Nk+Pp+Uf+Sz+Af+Sq+D0**

Card answers verbatim (2026-11-22 ~7:14 AM ET): dry matter “Treat missing-DM feed as 0 (**Sz**)”; NPK “Total N, Total P, Total K separately (**Nk**)”; when “After PR #126 (**Sq**)”. Placement **Sb** from typed **t968u**.

- Put **one** totals band **under the season metrics selection bar and above the color key** (**Sb**, Tim **t968u** — replaces original **Sv**), scoped to the same metric window (**Pw**) and the **visible filtered** Pasture+Mixed-Use rows (**Af**). Wire order in `calendar-grid.js`: `periodBar` → totals strip → `legend` → grid.
- Enumerate **Pasture DMI · Stored-feed DMI · Total DMI** (**En** — keep pasture/stored/total breakdown). Pasture DMI stays the locked implied-pasture figure (demand − measured hay, floor 0). Stored-feed DMI = measured hay eaten with known DM; **missing-DM feed counts as 0** and does **not** trigger partial (**Sz**, replaces Design **Sd**). Total DMI = pasture + stored (with Sz zeros included as 0).
- Show **Total N, Total P, Total K** separately (**Nk**), same **Kc+R1** source and farm units (**Uf**) as the column metrics.
- Carry OI-0249’s muted “ partial” onto totals that include **unknown-weight** (or other non-DM) partial slices (**Pp**). Missing-DM feed under **Sz** is known 0 — it does **not** mark the total partial.
- Build **after PR #126** so partial helpers already exist (**Sq**). No SQL (**D0**).

**SQL / gates (explicit):** this docs tip writes no SQL. Implementation is UI + calcs reuse only. No backup / data write. Land docs via Git Bridge after Tim’s land yes; Design briefs Build only after docs are on main and #126 has landed.

## 6. Acceptance (after lock — not for this tip)

- [ ] On Locations **Calendar**, a summary strip sits **under the season metrics selection bar and above the color key** for the period in view (**Sb**).
- [ ] Strip shows Pasture DMI, Stored-feed DMI, and Total DMI as separate numbers (**En**); Total = pasture + stored when both known.
- [ ] Strip shows Total N, Total P, Total K separately (**Nk**), not one blob.
- [ ] Totals follow the calendar metric window and update when period / zoom / location filters change (**Pw**+**Af**).
- [ ] OI-0249 unknown-weight (non-DM) partial slices mark the matching total with muted “ partial”; nothing known → — (**Pp**).
- [ ] Stored-feed DMI: measured known-DM hay counts; missing-DM / as-fed-only rows count as **0** and do **not** trigger partial (**Sz**).
- [ ] Units match existing Locations metrics (**Uf**).
- [ ] No List strip (**Sa** not locked); no under-timeline strip (**Sv** not locked); no per-row strip (**Sr** not locked).
- [ ] Ships after #126 (**Sq**). No SQL (**D0**).

## 7. Related

- OI-0246 — Locations Calendar + season metrics formula and **Pb** window (parent surface).
- OI-0247 — Farm Settings season-default dates (**Db**); shared Season default control.
- OI-0249 / PR #126 — partial unknown markers to reuse (**Sq**).
- F1 / measured hay — stored-feed DMI source; for this strip Tim locked **Sz** (missing DM → 0 stored, not unknown/partial). Column F1/unknown behavior elsewhere unchanged unless Build scopes it.
- Parent main: `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c`.

---

**Tip instruction:** **LOCKED** **Sb+Pw+En+Nk+Pp+Uf+Sz+Af+Sq+D0** (Tim card **t971s3875**; placement **Sb** from **t968u**). Do **not** land on main until Tim yeses the docs land card (Homelab Git Bridge). Do **not** hand Build implement work until docs are live on main **and** PR #126 has landed (**Sq**). No SQL on this tip.
