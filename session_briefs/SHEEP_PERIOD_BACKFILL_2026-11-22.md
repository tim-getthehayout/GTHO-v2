# Sheep period backfill for cattle-aligned DMI (OI-0251)

**Status:** **PROPOSED** (revised ~7:20 AM ET) — partial Tim picks recorded; **head still open**; **Aa archive-metrics pending Build confirm**. No Build write until full lock + SELECT dry-run + verified backup + **separate** Tim write yes. This tip is **docs only**. **No SQL / no prod write on this tip.**  
**Owner:** GTHO Design → GTHO Build (only after lock; data write is a gated follow-on, not “implement UI”).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 live; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 season formula **S1+F1+…**; OI-0249 partial unknown / PR #126; OI-0250 timeline period totals (**LOCKED** Sb+… — strip will show sheep DMI once data exists); OI-0222 / 17c sheep flock basis; OI-0091 live-window helpers; OI-0102 multi-paddock open.  
**Build feasibility:** SELECT-only read 2026-11-22 (GTHO Build scratch `sheep-t965u-feasibility/FEASIBILITY.md`) + sheep-groups recheck same morning. Incorporated below. **Archive-metrics feasibility still pending Build** (Design code-read catch noted).  
**Schema / migration on this tip:** **D0 — none** for the closed EGW + single-PW Ld backfill itself. **Aa may need a small code change** if Build confirms archived locs drop from X1 metrics (see §4 Archive). Code/schema also if Tim locks Ewe **3%** via EGW class or lands **045** `historical_animal_basis` (not applied; tables empty).

## 1. Problem

Tim ask **t965u** (2026-11-22 ~7:09 AM ET, via Orchestrator):

> “I would like to backfill one event for sheep that covers all paddocks, from the date we have first cattle data, to the date and time of the first event opened for each of the two bulk sheep groups. This way we are capturing the DMI etc for the same period as the cattle. Any issues with doing this this way?”

Cattle event windows start **2026-03-04**. Sheep group memberships and live EGWs start **2026-11-06**. As-built pasture DMI for 2025-10-01→2026-10-31 therefore shows **sheep 0**. Tim wants a synthetic sheep window so farm / period totals (including OI-0250) cover the same span as cattle.

**Follow-ups:** **t976s3898** (~7:17 AM ET) partial answers; **t982u** (~7:19 AM ET) chose **Ld** Sheep-history location + archive ask.

## 2. Current state (SELECT-only + Build feasibility — do not invent)

| Fact | Value |
|---|---|
| Earliest cattle GW/PW | **2026-03-04** |
| Active sheep group | **Sheep** `b0a62412-fc55-455d-9bc7-2a46de8f1398` — bulks **Ewes (52)** + **Breeding Rams (2)** = **54** open memberships from **2026-11-06** |
| Live Sheep EGW weight | After 11-06 cleanup: open EGW head **54**, avg **~57.12 kg (~126 lb)** on event `8ef44a4a…` from 2026-11-20 |
| “Two groups / ~70” | **Not two `groups` rows today.** One group Sheep holds Ewes+Rams. Inactive ungrouped **Ram Lambs (16)** → **70** if included (52+2+16). Archived **Ram Lambs- Sale** existed Nov 9–20 for sold lambs (stored head 0). |
| First Sheep EGWs | **2026-11-06** on event `eeb2febe…` (paddocks E-1…E-5) |
| Pasture land locations | **33** (X1 Pasture + Mixed-Use inventory) |
| Multi-location events | **First-class** (OI-0102). N `event_paddock_windows` per event. Multi-open day = **area-weighted share**. |
| Hard metric rule | ≥1 PW on **pasture / mixed-use** or Locations X1 metrics **ignore** the event. |
| Closed EGW without memberships | **Works** (OI-0091): if `date_left != null`, helpers return stored `head_count` / `avg_weight_kg`. Keep backfill **closed**. |
| DMI % caveat | EGW has **no `animal_class_id`**. Demand falls through to **dmiPct 2.5** unless code/schema / **045**. |
| Hay subtract | Only `event_feed_entries` on that event. **Hn** = linked gap (~4,400 lb DM sheep Feb in 17c). |
| Overlap | Exclusive end **2026-11-06**: synthetic **not** counted on 11-06; live Sheep windows are. |
| `locations.archived` | **Boolean only** (`archived true/false`). **No `archived_at` / dated archive column.** “Archive on the close date” cannot be a historical effective date in schema today — it means set `archived=true` in the **same write** as the synthetic location/event (location disappears from active lists immediately after write). |
| Archive vs metrics (Design code-read) | `isManagementLocation` in `location-metrics.js` returns **false** when `loc.archived` — so **as-built X1 / Locations season metrics skip archived locations**. Location lists also filter `!l.archived`. **Build must confirm** whether any farm-total / OI-0250 path still counts PWs on archived locs; if not, **Aa needs a small code change** (metrics include archived X1 locs that have windows in the W1 range; lists still hide archived) or fall back to **An**. |

## 3. Goals / non-goals

**Goals**

- Capture sheep demand / implied pasture DMI for **2026-03-04 → 2026-11-06** (exclusive end) so farm totals align with cattle coverage.
- Prefer **Ld**: one new **“Sheep history”** farm-total pasture location + one closed PW — **no smear of real paddocks**.
- Prefer **Aa** (if metrics still count after archive, or with the small code fix): hide that location from active lists after write while keeping DMI/NPK in season / period totals.
- One closed EGW on **Sheep**, explicit head/weight, **no membership backdate**.
- Keep writes gated: SELECT dry-run CSVs → Tim review → verified backup → **separate** Tim yes.

**Non-goals**

- No UI feature work beyond what **Aa** may require for metrics-vs-list (if Build confirms catch).
- No membership backdate.
- No open (live) EGW/PW that would recompute from empty historical memberships.
- Do not reopen OI-0249 / OI-0248 / OI-0246 formula locks.
- Do not treat missing hay as silent 0 pasture credit — leave hay as a named gap (**Hn**).
- This tip writes **no SQL**.
- Do **not** invent a dated-archive column on this tip.

## 4. Option axes (codes in values)

### Event shape

| Code | Meaning |
|---|---|
| **Es** | **Recommended:** one **synthetic closed** event (notes: sheep backfill t965u / OI-0251). Writes via SQL/script of already-closed rows (bypass live wizard `assertLocationsFree`). |
| **En** | N separate events (e.g. per group or per paddock cluster) instead of one. |

### Location strategy (per-paddock smear vs farm total)

| Code | Meaning |
|---|---|
| **La** | N closed paddock windows on **all ~33** pasture/mixed-use locations (area-smear). **Superseded as Design lean** after Tim **t982u** chose **Ld**. |
| **Lb** | Only the **E-strip** paddocks (E-1…E-5). |
| **Lc** | **Sequential** PWs following Tim’s rotation notes. |
| **Ld** | **Tim chose / Design lean:** one **new dedicated pasture** location (“Sheep history” / farm-total) with a **single** closed PW — **no smear of real paddocks**; still X1 pasture so metrics can see it while active. |

### Archive (Sheep-history location only; boolean `locations.archived`)

| Code | Meaning |
|---|---|
| **Aa** | **Design lean (pending Build metrics confirm):** in the **same gated write**, create the Sheep-history pasture location **and set `archived=true`**. Hides it from location lists immediately after write. **Not** a dated “archive as of 2026-11-06” — schema has **no** `archived_at`. Tim’s “on the close date” intent maps to this write-time boolean. **Blocked as-is for metrics** if Build confirms Design’s code-read (`isManagementLocation` skips archived); then either a small code change (metrics still sum PWs on archived X1 locs in-window; lists stay filtered) or fall back to **An**. |
| **An** | Leave the Sheep-history location **active** (visible in location lists). Metrics work with no code change. |
| **Ax** | Dated archive / `archived_at` effective on 2026-11-06 — **needs schema**; **out of scope** this tip (**D0**). |

### Group / ends

| Code | Meaning |
|---|---|
| **Go** | **Tim chose / Design lean:** one closed EGW on existing group **Sheep** only; exclusive end **2026-11-06**. |
| **Gt** | Two GWs / invent **Ewes** vs **Rams** groups — needs structure Tim does **not** have today. |
| **Ox** | **Recommended:** exclusive end = first real Sheep open **2026-11-06**. |
| **Oo** | Overlapping end into live Sheep windows — **do not recommend**. |

### Start date

| Code | Meaning |
|---|---|
| **Sc** | **Tim chose:** start **2026-03-04** (earliest cattle data). |
| **So** | Start **2025-10-01** (17c season window). |

### Head / weight (explicit — not membership-derived) — **STILL OPEN**

| Code | Meaning |
|---|---|
| **Wc** | **54 @ ~57.12 kg (~126 lb)** — Ewes 52 + Breeding Rams 2 (live Sheep EGW after cleanup). Design default candidate for “current flock only.” |
| **W7** | **70 @ ~73.7 kg (~162 lb)** class-default weighted — include inactive ungrouped **Ram Lambs 16** (52+2+16). Matches Tim’s “~70” guess; not two groups. |
| **Wh** | **80 @ 110 lb** from 17c / OI-0222 — earlier Design candidate; still available as **Wt**-style pick. |
| **Wt** | Tim supplies other head + avg weight. |

### DMI %

| Code | Meaning |
|---|---|
| **D2** | **Tim chose:** accept EGW fallthrough **dmiPct 2.5** (no code). |
| **D3** | Prefer **Ewe 3%** — needs code/schema or applied **045**. |

### Hay

| Code | Meaning |
|---|---|
| **Hn** | **Tim chose:** hay subtract **out of scope** this OI (linked gap). |
| **Hy** | Include hay via `event_feed_entries` on the synthetic event. |

### Memberships / write gate / schema

| Code | Meaning |
|---|---|
| **Nm** | **Recommended:** **no** membership backdate. |
| **Gw** | **Required:** SELECT dry-run (`windows_proposed`, `paddocks_proposed`, `monthly_dmi`, `overlap_check` + `REPORT.md`) → Tim review → verified backup → **separate** Tim write yes. Dry-run must also list the new Sheep-history location + its `archived` flag. |
| **D0** | **Recommended:** this docs tip — **no SQL**, no migration, no prod write. (Exception note: **Aa** may require a **follow-on code** tip if metrics skip archived — still not SQL on *this* tip.) |

## 5. Design recommendation (revised lean)

**Partial Tim lock (not full LOCKED):** **Ld + Sc + Hn + D2 + Go** (+ **Es + Ox + Nm + Gw + D0** Design defaults).

**Design lean string (head open; Aa pending Build):**  
**Es+Ld+Aa+Go+Ox+Sc+W?+D2+Hn+Nm+Gw+D0**

Plain language: one closed synthetic sheep event from **2026-03-04** through exclusive **2026-11-06**, on a **new “Sheep history” pasture location** (no smear of real paddocks), one closed group window on **Sheep** at **2.5%**, **hay out**, no membership backdate, and in the same gated write **set that location `archived=true`** so it drops from active location lists. **Head/weight still open** (**Wc** 54@~126 vs **W7** 70@~162 vs **Wt**). **No write** until dry-run + backup + separate yes.

**Archive note for Tim’s card:** Schema only has boolean `archived` — there is no “archive as of Nov 6” date. **Aa** = archive in the write that creates the fake location/event. Design’s code-read says season metrics currently **skip** archived locations; **Build archive-metrics feasibility pending** — if blocked, either a small metrics code change or leave the location active (**An**).

**Why not La anymore:** Tim **t982u** prefers not to distort real paddocks for this one-off cleanup → **Ld**.

## 6. Write path (after lock — not this tip)

1. SELECT-only dry-run CSVs + `REPORT.md` (include new location row + archived flag + PW + EGW).  
2. Tim reviews numbers (monthly DMI, overlap_check exclusive_ok, head/weight).  
3. Verified backup.  
4. **Separate** Tim yes.  
5. Script/SQL inserts **already-closed** event + one PW on new Sheep-history pasture loc + one EGW; set location `archived=true` if **Aa**; (feed rows only if **Hy**).  
6. No live wizard path.  
7. If **Aa** needs metrics code: land that **before** or **with** expecting DMI/NPK to show — do not archive-blind if Build confirms drop.

## 7. Interactions

- **OI-0249:** explicit stored head/weight on closed EGW → this slice is known.  
- **OI-0250:** once rows exist, period totals can include sheep DMI — **only if** the Sheep-history location is still included in the metric row set (active **An**, or **Aa** + metrics code that keeps archived in-window locs).  
- **OI-0222 / 045:** history tables empty; hay gap stays under **Hn**.

## 8. Acceptance (when locked + written)

- [ ] Lock codes recorded; Tim decided **head/weight** (**Wc** / **W7** / **Wt**) and confirmed **Aa** vs **An** after Build metrics answer.  
- [ ] Dry-run CSVs + REPORT reviewed; overlap exclusive_ok for 2026-11-06.  
- [ ] Backup verified; separate write yes.  
- [ ] One closed synthetic event; one closed PW on Sheep-history pasture loc; one closed Sheep EGW; no membership inserts.  
- [ ] Farm-total sheep DMI appears in Locations season / OI-0250 period view for Mar–Nov 2026; live Sheep windows from 11-06 unchanged; **real paddocks not smeared**.  
- [ ] If **Aa**: location hidden from active lists; DMI/NPK still counted (code landed if required).  
- [ ] If **Hn**: hay gap documented.  
- [ ] If **D2**: demand uses 2.5%.

## 9. Origin

- Tim **t965u** ~7:09 AM ET 2026-11-22 (via Orchestrator).  
- Tim **t976s3898** ~7:17 AM ET: **Sc**, **Hn**, **D2+Go**; head “~70 / two groups” (prod = one Sheep group; 70 = include Ram Lambs).  
- Tim **t982u** ~7:19 AM ET: **Ld** + archive-on-close ask → Design **Aa** (boolean at write) pending Build.  
- GTHO Build feasibility + groups recheck (SELECT-only) same morning.  
- Design code-read: `locations.archived` boolean; `isManagementLocation` skips archived.
