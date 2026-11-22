# Sheep period backfill for cattle-aligned DMI (OI-0251)

**Status:** **PROPOSED** (revised ~7:24 AM ET for **t987s3936**) — Tim picks recorded; **final lock card needed for Ap (Design lean) vs Ac / An**, plus confirm-rest **Ok**. No Build write until full lock + SELECT dry-run + verified backup + **separate** Tim write yes. This tip is **docs only**. **No SQL / no prod write on this tip.**  
**Owner:** GTHO Design → GTHO Build (only after lock; data write gated; **Ap** adds a **farm_settings** migration + metrics preference code before or with the write).  
**Parent:** Forgejo `origin/main` `10c0c433e36d453acbe1f5ba5b72bd70a7d8c71c` (PR #123 live; compiled `RELEASED_SCHEMA_VERSION` **48**). Code tip lineage also checked at writer `a07f591` for archive/metrics + farm_settings patterns (047/048).  
**Also related:** OI-0246 season formula; OI-0249 / PR #126; OI-0250 period totals (**LOCKED** `d6a18e8`, Sb+…+Sq+D0); OI-0222 / 17c; OI-0091; OI-0102; OI-0247 farm_settings column pattern.  
**Build + Design feasibility:** SELECT-only flock facts + **archive-metrics CONFIRMED** — `isManagementLocation` skips `loc.archived`; lists filter `!archived`. Tim’s “hide from lists but keep DMI, with a reporting preference” → **Ap**. Data-only **Aa** blocked.  
**Schema on this tip:** **D0** = docs tip does not apply SQL. **Ap** requires a **new `farm_settings` boolean** (intent name: `include_archived_locations_in_metrics`) — **migration required** in Build’s implement PR (file-only until Tim’s separate yes + verified backup). Not localStorage / not `preferences.js` field-mode. Do not reopen 047/048.

## 1. Problem

Tim ask **t965u** (2026-11-22 ~7:09 AM ET): backfill one sheep event from first cattle data to first sheep opens so DMI covers the same period as cattle.

Cattle windows start **2026-03-04**. Sheep live EGWs start **2026-11-06**. Follow-ups: **t976s3898**, **t982u** (Ld + archive ask), **t982s3917** (“70 at 100”), **t987s3936** (reporting preference to include/exclude archived locations).

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
| Farm prefs today | Typed columns on **`farm_settings`** (e.g. 047/048 preg-check / return-to-cycle). Client `preferences.js` is mostly localStorage field-mode + unit system on `operations` — **not** the right home for a farm-wide metrics include/exclude. |

## 3. Goals / non-goals

**Goals:** Sheep demand **2026-03-04 → 2026-11-06** exclusive; **Ld** Sheep-history pasture loc (no real-paddock smear); explicit **70 @ 100 lb**; **D2+Go**; **Hn**; **Gw** gates; Tim’s hide-from-lists + controllable metrics via **Ap**.

**Non-goals:** Membership backdate; open EGW; reopen OI-0246/0248/0249/0250 formula locks; dated-archive schema; SQL apply on this tip; localStorage-only preference; treat hay as silent 0.

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
| **D0** | This tip: no SQL apply. (Ap’s migration lands in Build’s implement PR, file-only until gated apply.) |

### Head / weight

| Code | Meaning |
|---|---|
| **Wt** | **Tim (t982s3917):** **70 head @ 100 lb** (≈ **45.36 kg**). Custom — not W7’s ~162 lb class default. |
| **Wc** | 54 @ ~126 lb (live flock only). |
| **W7** | 70 @ ~162 lb class-default weighted (rejected by Tim’s 100 lb). |
| **Wh** | 80 @ 110 lb (17c earlier candidate). |

### Archive / metrics preference (Sheep-history loc + farm-wide)

| Code | Meaning |
|---|---|
| **Ap** | **Design lean (t987s3936):** (1) set Sheep-history `locations.archived=true` at write so default lists/pickers stay `!archived`; (2) add a **farm-persisted** reporting preference on **`farm_settings`** (intent column name: `include_archived_locations_in_metrics`, boolean, **default true**) so Locations Calendar DMI/NPK, the **OI-0250** period totals strip, and reports can **include or exclude archived locations** farm-wide. Settings farm section is the durable editor; optional Calendar metrics control writes the **same** farm setting (no second toggle / no session-only). **Migration required** (next numbered after then-current ceiling; file-only until Tim yes + backup). Not localStorage. |
| **Ac** | Archive hide + hard-coded metrics include for archived X1 with in-window PWs (**no** user preference). Small code change, **no** new farm_settings column. Alt if Tim rejects a preference. |
| **An** | Leave Sheep-history location **active** (visible in lists). Data-only; DMI counts; **no code / no migration**. |
| **Aa** | Archive boolean at write **without** metrics code or preference — **does not meet** Tim’s DMI intent (CONFIRMED). Do not lock Aa alone. |
| **Ax** | Dated archive schema — out of scope. |

## 5. Design recommendation

**Tim picks so far (not full LOCKED until Ap/Ac/An + Ok):** **Es+Ld+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0** with **Wt = 70 @ 100 lb (~45.36 kg)**.

**Design lean (with archive + reporting preference):** **Es+Ld+Ap+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0**

Plain language: one closed synthetic sheep event **Mar 4 → Nov 6 2026** (exclusive end) on a new **Sheep history** pasture location, **70 head at 100 lb**, **2.5%**, one **Sheep** group window, **no hay** in this OI, no membership backdate. Archive that location so it drops from location lists, and add a **farm setting** (default **on**) to include archived locations in season DMI/NPK, the period totals strip, and reports — Tim can turn it off. Survives devices (not a one-browser toggle).

**Ap setting details (Design stamps):**
1. **Where:** `farm_settings` typed boolean — same pattern as 047/048 / OI-0247. **Migration required.** Not `preferences.js` localStorage.
2. **Default:** **true (include)** archived locations that have paddock/group history overlapping the metric window — Sheep-history backfill shows in season totals without a hunt; toggle off to match today’s exclude-archived behavior.
3. **Persist:** farm-level (yes).
4. **UI:** Farm Settings section + optional control on Calendar/metrics that writes the **same** column.
5. **OI-0250:** totals strip **reads the same preference** (no second toggle). OI-0250 remains **D0 / no-DB** (`d6a18e8`). If OI-0250 ships first (after #126 / Sq) before Ap’s migration+code, the strip inherits today’s exclude-archived until Ap lands; once Ap lands, both Calendar metrics and the strip honor the setting. Ap’s migration is **OI-0251 scope**.
6. **Existing archived paddocks:** preference is **farm-wide** (all archived locations), not Sheep-history only.
7. **Lists/pickers:** always stay filtered `!archived` regardless of the metrics preference.

**Final lock needs:** Tim picks **Ap** (Design) vs **Ac** / **An**, and confirms the rest (**Ok**).

## 6. Write path (after lock)

1. If **Ap**: Build ships migration (file-only) + farm Settings / metrics consumers + `isManagementLocation` (or equivalent) honoring the farm setting for archived X1 — can ship before or with data write; apply gated separately.  
2. If **Ac**: metrics code only (hard include), no farm_settings column.  
3. SELECT dry-run CSVs + REPORT (location + archived flag + PW + EGW 70@45.36 kg).  
4. Tim review → verified backup → **separate** yes.  
5. Insert closed event + PW on Sheep-history pasture + closed Sheep EGW; set `archived=true` if **Ap** or **Ac** (or leave false if **An**).  
6. No wizard path; no memberships.

## 7. Interactions

- **OI-0250:** sheep DMI appears in period strip when Sheep-history is in the metric row set — under **Ap**, when the farm preference is include (default); under **Ac**, always for archived-with-windows; under **An**, because the loc stays active. Strip shares Ap’s setting — no second toggle.  
- **OI-0249:** explicit head/weight → known slice.  
- **Hn:** pasture DMI overstated on hay days until a later OI.

## 8. Acceptance

- [ ] Tim locked **Ap** or **Ac** / **An** (+ confirmed Ok on Wt/Ld/Sc/Hn/D2+Go/Ox).  
- [ ] If **Ap**: migration file + Settings/metrics code live (apply gated); lists stay `!archived`; preference default include.  
- [ ] If **Ac**: metrics code live before expecting archived DMI.  
- [ ] Dry-run + backup + separate write yes.  
- [ ] Closed event + one PW + one EGW (70 @ 45.36 kg); exclusive handoff 2026-11-06; no memberships.  
- [ ] Farm sheep DMI in Locations / period totals Mar–Nov when preference includes archived; real paddocks not smeared; lists hide loc if **Ap**/**Ac**.  
- [ ] **Hn** gap documented.

## 9. Origin

- **t965u**, **t976s3898**, **t982u**, **t982s3917** (“70 at 100”), **t987s3936** (reporting preference include/exclude archived).  
- Build feasibility + groups recheck; Design/Build archive-metrics: **Aa data-only blocked**; lean **Ap** (replaces Ac as Design pick; Ac/An remain alternatives).
