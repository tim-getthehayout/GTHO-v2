# Sheep period backfill for cattle-aligned DMI (OI-0251)

**Status:** **PROPOSED** (revised ~7:21 AM ET) — Tim picks recorded; **final lock card needed for Ac vs An**. No Build write until full lock + SELECT dry-run + verified backup + **separate** Tim write yes. This tip is **docs only**. **No SQL / no prod write on this tip.**  
**Owner:** GTHO Design → GTHO Build (only after lock; data write gated; **Ac** adds a small metrics code change before or with the write).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 live; compiled `RELEASED_SCHEMA_VERSION` **48**). Code tip lineage also checked at writer `a07f591` for archive/metrics.  
**Also related:** OI-0246 season formula; OI-0249 / PR #126; OI-0250 period totals (**LOCKED**); OI-0222 / 17c; OI-0091; OI-0102.  
**Build + Design feasibility:** SELECT-only flock facts + **archive-metrics CONFIRMED BLOCK for data-only Aa** — `isManagementLocation` skips `loc.archived`; lists also filter `!archived`. Tim’s “hide from lists but keep DMI” needs **Ac** (code) or **An** (leave active).  
**Schema on this tip:** **D0** for the data rows. **Ac** is a **small code change** (not a migration): metrics/period totals include archived X1 locs that have PWs overlapping the window; default lists/pickers stay `!archived`. No dated-archive column.

## 1. Problem

Tim ask **t965u** (2026-11-22 ~7:09 AM ET): backfill one sheep event from first cattle data to first sheep opens so DMI covers the same period as cattle.

Cattle windows start **2026-03-04**. Sheep live EGWs start **2026-11-06**. Follow-ups: **t976s3898**, **t982u** (Ld + archive ask), **t982s3917** (“70 at 100”).

## 2. Current state (do not invent)

| Fact | Value |
|---|---|
| Earliest cattle GW/PW | **2026-03-04** |
| Sheep group | **Sheep** `b0a62412…` — Ewes 52 + Breeding Rams 2 = **54** from **2026-11-06** (one group, not two) |
| Live EGW weight | **54 @ ~57.12 kg (~126 lb)** after cleanup |
| Tim ~70 | Inactive ungrouped **Ram Lambs 16** → 52+2+16=70 head count; Tim locked custom weight **100 lb**, not class-default ~162 lb |
| First Sheep EGWs | **2026-11-06** on `eeb2febe…` |
| Multi-loc events | First-class; area-share smear if N paddocks |
| Closed EGW | OI-0091 stored head/weight when `date_left` set |
| DMI % | EGW no class → **2.5%** default |
| Hay | Only `event_feed_entries`; **Hn** = linked gap |
| Overlap | Exclusive end **2026-11-06** |
| `locations.archived` | **Boolean only** — no `archived_at` |
| Archive vs metrics (**CONFIRMED**) | Lists: `!l.archived`. Metrics: `isManagementLocation` returns **false** if archived → **X1 DMI/NPK/AUDs/score and OI-0250 strip reusing that path skip archived locs**. Data-only archive **does not** keep DMI. |

## 3. Goals / non-goals

**Goals:** Sheep demand **2026-03-04 → 2026-11-06** exclusive; **Ld** Sheep-history pasture loc (no real-paddock smear); explicit **70 @ 100 lb**; **D2+Go**; **Hn**; **Gw** gates; prefer Tim’s hide-from-lists intent via **Ac**.

**Non-goals:** Membership backdate; open EGW; reopen OI-0246/0248/0249 formula locks; dated-archive schema; SQL on this tip; treat hay as silent 0.

## 4. Option axes

### Event / location / group / start / hay / DMI / gate

| Code | Meaning |
|---|---|
| **Es** | One synthetic **closed** event (recommended). |
| **Ld** | **Tim:** one new “Sheep history” farm-total **pasture** location + one closed PW (no smear). |
| **La** | All ~33 pasture PWs (smear) — alt if Tim drops Ld. |
| **Lb** / **Lc** | E-strip only / sequential. |
| **Go** | **Tim:** one closed EGW on **Sheep**. |
| **Ox** | Exclusive end **2026-11-06**. |
| **Sc** | **Tim:** start **2026-03-04**. |
| **D2** | **Tim:** dmiPct **2.5**. |
| **Hn** | **Tim:** hay out of this OI. |
| **Nm** | No membership backdate. |
| **Gw** | Dry-run → backup → separate write yes. |
| **D0** | This tip: no SQL. |

### Head / weight

| Code | Meaning |
|---|---|
| **Wt** | **Tim (t982s3917):** **70 head @ 100 lb** (≈ **45.36 kg**). Custom — not W7’s ~162 lb class default. |
| **Wc** | 54 @ ~126 lb (live flock only). |
| **W7** | 70 @ ~162 lb class-default weighted (rejected by Tim’s 100 lb). |
| **Wh** | 80 @ 110 lb (17c earlier candidate). |

### Archive / hide (Sheep-history loc)

| Code | Meaning |
|---|---|
| **Ac** | **Design lean:** set `archived=true` at write **and** ship a **small code change**: keep archived out of default location lists/pickers, but **include** archived X1 locations in historical metrics / OI-0250 period totals when they have paddock windows overlapping the metric window. Matches Tim’s hide+count intent. |
| **An** | Leave Sheep-history location **active** (visible in lists). Data-only; DMI counts; **no code**. |
| **Aa** | Archive boolean at write **without** metrics code — **does not meet** Tim’s DMI intent (CONFIRMED). Do not lock Aa alone. |
| **Ax** | Dated archive schema — out of scope. |

## 5. Design recommendation

**Tim picks so far (not full LOCKED until Ac/An):** **Es+Ld+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0** with **Wt = 70 @ 100 lb (~45.36 kg)**.

**Design lean (with archive-hide):** **Es+Ld+Ac+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0**

Plain language: one closed synthetic sheep event **Mar 4 → Nov 6 2026** (exclusive end) on a new **Sheep history** pasture location, **70 head at 100 lb**, **2.5%**, one **Sheep** group window, **no hay** in this OI, no membership backdate. To hide that location from lists **and** still count DMI/NPK, Build ships a small metrics change (**Ac**). If Tim rejects code, leave the location visible (**An**).

**Final lock needs:** Tim picks **Ac** vs **An** (and confirms the rest).

## 6. Write path (after lock)

1. If **Ac**: land metrics code (archived X1 with in-window PWs still in metric rows; lists stay filtered) — can ship before or with data write.  
2. SELECT dry-run CSVs + REPORT (location + archived flag + PW + EGW 70@45.36 kg).  
3. Tim review → verified backup → **separate** yes.  
4. Insert closed event + PW on Sheep-history pasture + closed Sheep EGW; set `archived=true` if **Ac** (or leave false if **An**).  
5. No wizard path; no memberships.

## 7. Interactions

- **OI-0250:** sheep DMI appears in period strip only if the Sheep-history loc is in the metric row set (**Ac** or **An**).  
- **OI-0249:** explicit head/weight → known slice.  
- **Hn:** pasture DMI overstated on hay days until a later OI.

## 8. Acceptance

- [ ] Tim locked **Ac** or **An** (+ confirmed Wt/Ld/Sc/Hn/D2+Go/Ox).  
- [ ] If **Ac**: metrics code live before expecting archived DMI.  
- [ ] Dry-run + backup + separate write yes.  
- [ ] Closed event + one PW + one EGW (70 @ 45.36 kg); exclusive handoff 2026-11-06; no memberships.  
- [ ] Farm sheep DMI in Locations / period totals Mar–Nov; real paddocks not smeared; lists hide loc if **Ac**.  
- [ ] **Hn** gap documented.

## 9. Origin

- **t965u**, **t976s3898**, **t982u**, **t982s3917** (“70 at 100”).  
- Build feasibility + groups recheck; Design/Build archive-metrics: **Aa data-only blocked**; lean **Ac**.
