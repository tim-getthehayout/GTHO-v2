# Sheep period backfill for cattle-aligned DMI (OI-0251)

**Status:** **PROPOSED** — awaiting Tim lock. No Build write until lock + SELECT dry-run + verified backup + **separate** Tim write yes. This tip is **docs only**. **No SQL / no prod write on this tip.**  
**Owner:** GTHO Design → GTHO Build (only after lock; data write is a gated follow-on, not “implement UI”).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 live; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 season formula **S1+F1+…**; OI-0249 partial unknown / PR #126; OI-0250 timeline period totals (t963u — strip will show sheep DMI once data exists); OI-0222 / 17c sheep flock basis (80 @ 110 lb, Ewe 3%); OI-0091 live-window helpers; OI-0102 multi-paddock open.  
**Build feasibility:** SELECT-only read 2026-11-22 (GTHO Build scratch `sheep-t965u-feasibility/FEASIBILITY.md`). Incorporated below.  
**Schema / migration on this tip:** **D0 — none.** Closed EGW + multi-PW backfill needs **no code change**. Code/schema only if Tim locks Ewe **3%** via EGW class or lands **045** `historical_animal_basis` (not applied; tables empty).

## 1. Problem

Tim ask **t965u** (2026-11-22 ~7:09 AM ET, via Orchestrator):

> “I would like to backfill one event for sheep that covers all paddocks, from the date we have first cattle data, to the date and time of the first event opened for each of the two bulk sheep groups. This way we are capturing the DMI etc for the same period as the cattle. Any issues with doing this this way?”

Cattle event windows start **2026-03-04**. Sheep group memberships and live EGWs start **2026-11-06**. As-built pasture DMI for 2025-10-01→2026-10-31 therefore shows **sheep 0**. Tim wants a synthetic sheep window so farm / period totals (including OI-0250 once locked) cover the same span as cattle.

## 2. Current state (SELECT-only + Build feasibility — do not invent)

| Fact | Value |
|---|---|
| Earliest cattle GW/PW | **2026-03-04** |
| Active sheep group | **Sheep** `b0a62412-fc55-455d-9bc7-2a46de8f1398` — bulks **Ewes (52)** + **Breeding Rams (2)**; memberships from **2026-11-06** |
| “Two bulk sheep groups” | **Not two groups today.** One group Sheep holds both bulks. Archived **Ram Lambs- Sale** existed Nov 9–20 for sold lambs. Tim must decide one-group vs invent structure. |
| First Sheep EGWs | **2026-11-06** on event `eeb2febe…` (paddocks E-1…E-5; that event’s PWs opened Nov 2 for other groups) |
| Pasture land locations | **33** (X1 Pasture + Mixed-Use inventory) |
| Multi-location events | **First-class** (OI-0102). `events` has no `location_id`; N `event_paddock_windows` per event. Multi-open day = **area-weighted share** — farm-total correct, **per-paddock smeared**. |
| Hard metric rule | ≥1 PW on **pasture / mixed-use** or Locations X1 metrics **ignore** the event. A confinement-only / untyped “farm-wide” row does **not** feed season DMI. |
| Closed EGW without memberships | **Works** (OI-0091): if `date_left != null`, helpers return stored `head_count` / `avg_weight_kg`. Keep backfill **closed**. Open windows would recompute from memberships. |
| DMI % caveat | EGW has **no `animal_class_id`**. Demand falls through to **dmiPct 2.5** unless code/schema adds class or **045** `historical_animal_basis` is applied. Tim’s 17c notes used **Ewe 3%**. |
| Hay subtract | Window-lane subtract is **only** `event_feed_entries` on that event. No feed rows ⇒ no subtract. Sheep Feb hay (~**4,400 lb DM** in 17c) is a **linked data gap** unless this OI adds feed rows or a later history/period-lane OI lands. `historical_feedings` / `historical_animal_basis` exist (045) but **0 rows** / not applied for intake. OI-0249 does not fix hay. |
| Overlap | Safe if exclusive end: `date_left` / `date_out` / PW `date_closed` = **2026-11-06**. Synthetic **not** counted on 11-06; live Sheep windows are. |
| OI-0249 | Explicit head + avg_weight_kg on the closed EGW avoids unknown-weight partials for this slice. |
| OI-0250 | Independent of this data write; once sheep windows exist, period totals strip can show sheep DMI (after its own lock / PR #126 sequence for partial markers). |

## 3. Goals / non-goals

**Goals**

- Capture sheep demand / implied pasture DMI for **2026-03-04 → 2026-11-06** (exclusive end) so farm totals align with cattle coverage.
- Prefer Build’s feasible shape: **one synthetic closed event**, multi-PW, one closed EGW on **Sheep**, explicit head/weight, **no membership backdate**.
- Keep writes gated: SELECT dry-run CSVs → Tim review → verified backup → **separate** Tim yes.
- Be honest about per-paddock smear vs farm-total correctness.

**Non-goals**

- No UI feature work on this OI (data backfill).
- No membership backdate.
- No open (live) EGW/PW that would recompute from empty historical memberships.
- Do not reopen OI-0249 / OI-0248 / OI-0246 formula locks.
- Do not treat missing hay as silent 0 pasture credit — either attach feed rows or leave hay as a named gap (**Hn**).
- This tip writes **no SQL**.

## 4. Option axes (codes in values)

### Event shape

| Code | Meaning |
|---|---|
| **Es** | **Recommended:** one **synthetic closed** event (notes: sheep backfill t965u). Writes via SQL/script of already-closed rows (bypass live wizard `assertLocationsFree`). |
| **En** | N separate events (e.g. per group or per paddock cluster) instead of one. |

### Location strategy (per-paddock smear vs farm total)

| Code | Meaning |
|---|---|
| **La** | **Recommended (mirrors Build):** N closed paddock windows on **all ~33** pasture/mixed-use locations, same open→close. Farm-total DMI correct; **per-paddock DMI/NPK and rotation colors are area-smeared** — Tim accepts smear. |
| **Lb** | Only the **E-strip** paddocks (E-1…E-5) — where Sheep first appear live. Less smear of the rest of the farm; understates “all paddocks.” |
| **Lc** | **Sequential** PWs following Tim’s rotation notes (if he has them) — least smear, most authoring. |
| **Ld** | One **new dedicated pasture** location (e.g. “Sheep history — farm total”) with a single PW — no smear of real paddocks; still X1-visible. Not Build’s default; offer if Tim rejects smear. |

### Group / ends

| Code | Meaning |
|---|---|
| **Go** | **Recommended:** one closed EGW on existing group **Sheep** only; exclusive end **2026-11-06**. Matches today’s structure (Ewes+Rams bulks in one group). |
| **Gt** | Two GWs / invent **Ewes** vs **Rams** groups to match Tim’s “two bulk sheep groups” wording — needs group structure Tim does **not** have today (**Build alt D**). |
| **Ox** | **Recommended:** exclusive end = first real Sheep open **2026-11-06** (`date_left` / `date_out` / `date_closed`). No double-count with live windows. |
| **Oo** | Overlapping end into live Sheep windows — **do not recommend** (double-count risk). |

### Start date

| Code | Meaning |
|---|---|
| **Sc** | **Recommended:** start **2026-03-04** (earliest cattle data — Tim’s “same period as the cattle”). |
| **So** | Start **2025-10-01** (17c / Nov 18 sheep estimate season window) — longer than cattle event data. |

### Head / weight (explicit — not membership-derived)

| Code | Meaning |
|---|---|
| **Wh** | **Recommended candidate:** **80 head @ 110 lb** (≈49.9 kg) from 17c / OI-0222 Tim sheep-flock entry — until Tim updates. |
| **Wc** | Current live mix (~**54** head: 52 ewes + 2 rams) with Nov recorded weights / class defaults. |
| **Wt** | Tim supplies other head + avg weight for the window. |

### DMI %

| Code | Meaning |
|---|---|
| **D2** | **Recommended for no-code path:** accept EGW fallthrough **dmiPct 2.5**. |
| **D3** | Prefer **Ewe 3%** (17c) — needs **code/schema** (EGW class) or applied **045** `historical_animal_basis`; not EGW alone. |

### Hay

| Code | Meaning |
|---|---|
| **Hn** | **Recommended:** hay subtract **out of scope** this OI (linked gap — ~4,400 lb DM sheep Feb in 17c). Pasture DMI will be **overstated** for hay days until a follow-on adds `event_feed_entries` or history/period-lane intake. |
| **Hy** | Include hay: attach `event_feed_entries` on the same synthetic event (dry-run must list them). |

### Memberships / write gate / schema

| Code | Meaning |
|---|---|
| **Nm** | **Recommended:** **no** membership backdate. |
| **Gw** | **Required (not optional):** SELECT dry-run (`windows_proposed`, `paddocks_proposed`, `monthly_dmi`, `overlap_check` + `REPORT.md`, mirror 17c) → Tim review → verified backup → **separate** Tim write yes. |
| **D0** | **Recommended:** this docs tip — **no SQL**, no migration, no prod write. |

## 5. Design recommendation

**Es+La+Go+Ox+Sc+Wh+D2+Hn+Nm+Gw+D0**

Plain language: one closed synthetic sheep event from **2026-03-04** through exclusive **2026-11-06**, paddock windows on **all pasture locations** (accept area-smear for farm totals), one closed group window on **Sheep** with explicit **80 @ 110 lb**, accept **2.5%** DMI for the no-code path, **leave winter hay as a linked gap**, no membership backdate, and **no write** until dry-run + backup + separate yes.

**Why not farm-wide/unassigned alone:** X1 season metrics ignore events with no pasture/mixed-use PW. Build’s all-pasture smear (**La**) is the no-code way to get farm-total sheep DMI into Locations. If Tim rejects smear, prefer **Ld** (one dedicated pasture history location) over confinement-only.

**Alternatives on the card:** **Lb** E-strip; **Lc** sequential; **Ld** dedicated farm-total pasture loc; **So** Oct 1 start; **Wc**/**Wt** other head/weight; **D3** 3% (code/045); **Hy** hay in this OI; **Gt** invent two groups.

## 6. Write path (after lock — not this tip)

1. SELECT-only dry-run CSVs + `REPORT.md` (Build Q5 columns).  
2. Tim reviews numbers (monthly DMI, overlap_check exclusive_ok).  
3. Verified backup.  
4. **Separate** Tim yes.  
5. Script/SQL inserts **already-closed** event + PWs + one EGW (and feed rows only if **Hy**).  
6. No live wizard path.

## 7. Interactions

- **OI-0249:** explicit stored head/weight on closed EGW → this slice is known (not unknown-weight partial). Does not replace gated **Ww** weight rewrite.  
- **OI-0250:** data-independent of PR #126 code; once rows exist, period totals can include sheep DMI.  
- **OI-0222 / 045:** history tables empty; not used by window-lane F1. Hay gap stays until **Hy** or a later history OI.

## 8. Acceptance (when locked + written)

- [ ] Lock codes recorded; Tim decided head/weight, start, locations, hay, DMI%, one-vs-two groups.  
- [ ] Dry-run CSVs + REPORT reviewed; overlap exclusive_ok for 2026-11-06.  
- [ ] Backup verified; separate write yes.  
- [ ] One closed synthetic event; closed PWs; one closed Sheep EGW; no membership inserts (unless Tim locked otherwise).  
- [ ] Farm-total sheep DMI appears in Locations season / period view for Mar–Nov 2026; live Sheep windows from 11-06 unchanged.  
- [ ] If **Hn**: hay gap documented; pasture DMI not silently “fixed.”  
- [ ] If **D2**: demand uses 2.5%; if **D3**: code/045 landed first.

## 9. Origin

- Tim **t965u** ~7:09 AM ET 2026-11-22 (via Orchestrator).  
- Orchestrator flags: paddock distortion; explicit head/weight; winter hay; prod write gates; start Sc vs So; multi-loc; OI-0249 / OI-0250.  
- GTHO Build feasibility (SELECT-only) same morning — recommended shape mirrored in Design rec **Es+La+Go+Ox+Sc+Wh+D2+Hn+Nm+Gw+D0**.
