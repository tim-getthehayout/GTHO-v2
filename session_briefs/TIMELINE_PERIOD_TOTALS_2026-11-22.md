# Timeline period totals on Locations Calendar (OI-0250)

**Status:** **PROPOSED** — awaiting Tim lock on remaining picks (En+Sd, Nk, Pw+Af+Uf+Pp, Sq). Placement **Sb** picked by Tim **t968u** (typed). No Build until lock. This tip is docs only. **No SQL on this tip.**  
**Owner:** GTHO Design → GTHO Build (only after lock, and after Tim’s docs land yes — or from the locked tip ahead of land if Orchestrator coordinates).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 list-parity + metrics live; OI-0249 docs ancestor `200774f`; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 Locations management + season formula **S1+F1(DMI)+L1+H0+C1+Z1** / NPK **Ns+R1+Kc** + persist **Pb** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md)); OI-0247 season-default **Db**; OI-0249 partial unknown **Zp+Gg+…** (PR #126 A+C in flight — sequence **after** that lands).  
**Schema / migration:** **D0 — none.** Reuse existing Locations season helpers and (after #126) OI-0249 partial markers. No new column, no migration, no data write.

## 1. Problem

Tim ask **t963u** (2026-11-22 ~7:07 AM ET, via Orchestrator):

> “Just below the timeline lets add the total stats for the period in view. DMI from pasture+DMI from stored feed=Total DMI (all enumerated) & Total NPK”

Today the Locations **Calendar** shows **per-location** season metric columns (implied **pasture** DMI, AUDs, N, P, K, Score) for the metric window (**Pb** / Season default). There is **no** one-band total strip for the period in view that enumerates pasture DMI, stored-feed DMI, and Total DMI, plus Total N/P/K across the filtered locations on screen.

Stored feed already participates in the locked **F1** formula (measured hay eaten is subtracted from demand to get implied pasture DMI), but the UI does not surface stored-feed DMI as its own number. Orchestrator also noted ~50k lb Mar–May hay that failed to subtract when feed rows lack DM snapshots — so missing-DM feed must stay **unknown / partial**, never a silent 0.

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
- Honor OI-0249 partial / unknown rules (muted “ partial”; — when nothing known; never silent 0 for unknown).
- Stored-feed DMI only from measured eaten with known DM (**F1** / **Sd**).

**Non-goals**

- No SQL / no migration (**D0**).
- Do not reopen OI-0246 formula locks or OI-0249 weight locks.
- Do not invent DM from as-fed alone when DM is missing (**Sz** rejected).
- Do not fold into PR #126; sequence **after** #126 unless Tim insists on **Sx**.
- AUDs / Score in the strip are optional (**So**) — Design rec leaves them out of the first strip.

## 4. Option axes (codes in values)

### Placement / surface

| Code | Meaning |
|---|---|
| **Sb** | **Design + Tim pick (t968u):** one summary strip on Locations **Calendar** **under the season metrics selection bar** (`loc-mgmt__period` / “Season metrics:”) **and above the color key** (`legend` / calendar-legend). Order: season-metrics bar → **totals strip** → color key → timeline grid. Not under List. Not under bare `#/locations`. |
| **Sv** | One summary strip **under the Calendar timeline grid** only (original Design rec; Tim superseded with **Sb**). Keep as alternative if Tim reopens. |
| **Sa** | Also show the same strip on List view footer. |
| **Sr** | Per-location totals under each row’s timeline instead of / in addition to one view strip (**Sr** alone vs **Sb+Sr** / **Sv+Sr**). |

### Window / filters

| Code | Meaning |
|---|---|
| **Pw** | **Recommended:** totals follow the same metric window as the calendar (hash / localStorage / Season default **Pb**+**Db**); update on period / zoom / filter changes. |
| **Af** | **Recommended:** aggregate = sum across **visible filtered** inventory locations (Pasture + Mixed-Use under current pills/search), not hidden filtered-out rows. |

### DMI enumeration

| Code | Meaning |
|---|---|
| **En** | **Recommended:** three DMI numbers — Pasture DMI · Stored-feed DMI · Total DMI (= pasture + stored when both known). |
| **Sd** | **Recommended:** Stored-feed DMI = only measured eaten with known DM (**F1**). If feed rows lack DM → that day’s stored contribution is **unknown** (surface as — / partial); do **not** invent DM from as-fed; do **not** treat as 0. |
| **Sz** | Treat missing-DM feed as 0 stored (silent). **Do not recommend.** |

### NPK

| Code | Meaning |
|---|---|
| **Nk** | **Recommended:** Total N, P, K as separate figures (same units/source as metric columns: excretion **Kc** + residual **R1**). Not a single “NPK” blob. |
| **Sn** | Split NPK in the strip into pasture-excretion vs residual-feed columns. |

### Partial / unknown (OI-0249)

| Code | Meaning |
|---|---|
| **Pp** | **Recommended:** when any summed location/slice is OI-0249-partial for that metric, show the muted “ partial” marker on that total; if nothing known → — ; never silent 0 for unknown. |

### Units / extras / sequencing

| Code | Meaning |
|---|---|
| **Uf** | **Recommended:** farm display units (lb/kg) same as existing Locations metrics. |
| **Su** | Always lb (US), ignoring farm unit. |
| **So** | Also include AUDs / Score in the strip. |
| **Sq** | **Recommended:** sequence after OI-0249 / PR #126 lands (reuse partial helpers). |
| **Sx** | Ship before #126 (standalone) — only if Tim insists; Design prefers **Sq**. |
| **D0** | **Recommended:** no SQL / no migration. |

## 5. Design recommendation

**Sb+Pw+En+Nk+Pp+Uf+Sd+Af+Sq+D0**

- Put **one** totals band **under the season metrics selection bar and above the color key** (**Sb**, Tim **t968u** — replaces original **Sv**), scoped to the same metric window (**Pw**) and the **visible filtered** Pasture+Mixed-Use rows (**Af**). Wire order in `calendar-grid.js`: `periodBar` → totals strip → `legend` → grid.
- Enumerate **Pasture DMI · Stored-feed DMI · Total DMI** (**En**). Pasture DMI stays the locked implied-pasture figure (demand − measured hay, floor 0). Stored-feed DMI is the measured hay eaten with known DM only (**Sd** / **F1**); missing DM → unknown / partial, never silent 0 (**not Sz**). Total DMI = pasture + stored when both are known for the aggregated slices; otherwise — / partial per **Pp**.
- Show **Total N, Total P, Total K** separately (**Nk**), same **Kc+R1** source and farm units (**Uf**) as the column metrics.
- Carry OI-0249’s muted “ partial” onto any total that includes a partial slice (**Pp**).
- Build **after PR #126** so partial helpers already exist (**Sq**). No SQL (**D0**).

**SQL / gates (explicit):** this docs tip writes no SQL. Implementation is UI + calcs reuse only. No backup / data write. Do not land docs until Tim locks; no Build handoff until **LOCKED**.

## 6. Acceptance (after lock — not for this tip)

- [ ] On Locations **Calendar**, a summary strip sits **under the season metrics selection bar and above the color key** for the period in view (**Sb**).
- [ ] Strip shows Pasture DMI, Stored-feed DMI, and Total DMI as separate numbers (**En**); Total = pasture + stored when both known.
- [ ] Strip shows Total N, Total P, Total K separately (**Nk**), not one blob.
- [ ] Totals follow the calendar metric window and update when period / zoom / location filters change (**Pw**+**Af**).
- [ ] OI-0249 partial slices mark the matching total with muted “ partial”; nothing known → — ; never silent 0 for unknown (**Pp**).
- [ ] Stored-feed DMI ignores as-fed-only / missing-DM rows as known 0; those days are unknown / partial (**Sd**).
- [ ] Units match existing Locations metrics (**Uf**).
- [ ] No List strip unless Tim locked **Sa**; no under-timeline strip unless Tim locked **Sv**; no per-row strip unless Tim locked **Sr**.
- [ ] Ships after #126 unless Tim locked **Sx**. No SQL (**D0**).

## 7. Related

- OI-0246 — Locations Calendar + season metrics formula and **Pb** window (parent surface).
- OI-0247 — Farm Settings season-default dates (**Db**); shared Season default control.
- OI-0249 / PR #126 — partial unknown markers to reuse (**Sq**).
- F1 / measured hay — stored-feed DMI source; missing DM already `unknown` in `measuredHayOnEventDay`.
- Parent main: `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c`.

---

**Tip instruction:** **PROPOSED.** Placement **Sb** recorded from Tim **t968u**; still awaiting Tim lock on En+Sd / Nk / Pw+Af+Uf+Pp / Sq (and any Sa/Sr/Sv alternatives). Do **not** stamp LOCKED from placement alone. Do **not** land on main until Tim locks and yeses the docs land card. Do **not** hand to Build until **LOCKED**. Sequence after PR #126 (**Sq**) unless Tim picks **Sx**. No SQL on this tip.
