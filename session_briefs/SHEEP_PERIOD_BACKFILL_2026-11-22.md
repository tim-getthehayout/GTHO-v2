# Sheep period backfill for cattle-aligned DMI (OI-0251)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-22 ~7:27–7:28 AM ET, via Orchestrator; card **t990s3945** Ok; typed **t991u** Ap + Rotation/List prefs; typed **t993u** Ud small dialog) — **Es+Ld+Ap+Ud+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0**. Docs tip ready for Tim’s land of **docs**. This tip is **docs only**. **No SQL / no prod write on this tip.** Migration apply and backfill write each still need dry-run/backup + Tim’s **separate** yes (**Gw**).  
**Owner:** GTHO Design → GTHO Build (after docs live on main; implement Ap migration+code + Ud dialog; data write only after **Gw** gates).  
**Parent:** Forgejo `origin/main` `d6a18e8e76d69fbb717dc4ff599b00e8c4316a83` (OI-0250 docs live via PR #127; prior PR #123 list-parity; compiled `RELEASED_SCHEMA_VERSION` **48**). Code tip lineage also checked at writer `a07f591` for archive/metrics + farm_settings patterns (047/048).  
**Also related:** OI-0246 season formula; OI-0249 / PR #126; OI-0250 period totals (**LOCKED** docs live on main `d6a18e8`, Sb+…+Sq+D0 — strip **reads the same Ap preference**, no second toggle); OI-0222 / 17c; OI-0091; OI-0102; OI-0247 farm_settings / season-default **Db** pattern.  
**Build + Design feasibility:** SELECT-only flock facts + **archive-metrics CONFIRMED** — `isManagementLocation` skips `loc.archived`; lists filter `!archived`. Tim’s “hide from lists but keep DMI, with a reporting preference” → **Ap**. Data-only **Aa** blocked. Calendar **row** for archived Sheep-history may stay hidden (Build confirmed) while metrics include when setting true.  
**Schema on this tip:** **D0** = docs tip does not apply SQL. **Ap** requires a **new `farm_settings` boolean** (intent name: `include_archived_locations_in_metrics`) — **migration required** in Build’s implement PR (file-only until Tim’s separate yes + verified backup). Not localStorage / not `preferences.js` field-mode. Do not reopen 047/048. Next mig number after then-current ceiling (047/048 pattern → next would be **049** when that is the ceiling).

## 1. Problem

Tim ask **t965u** (2026-11-22 ~7:09 AM ET): backfill one sheep event from first cattle data to first sheep opens so DMI covers the same period as cattle.

Cattle windows start **2026-03-04**. Sheep live EGWs start **2026-11-06**. Follow-ups: **t976s3898**, **t982u** (Ld + archive ask), **t982s3917** (“70 at 100”), **t987s3936** (reporting preference to include/exclude archived locations), lock **t990s3945** / **t991u** / **t993u**.

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

**Goals:** Sheep demand **2026-03-04 → 2026-11-06** exclusive; **Ld** Sheep-history pasture loc (no real-paddock smear); explicit **70 @ 100 lb**; **D2+Go**; **Hn**; **Gw** gates; Tim’s hide-from-lists + controllable metrics via **Ap**; **Ud** small Report preferences dialog from Rotation + List writing the same `farm_settings`.

**Non-goals:** Membership backdate; open EGW; reopen OI-0246/0248/0249/0250 formula locks; dated-archive schema; SQL apply on this tip; localStorage-only preference; treat hay as silent 0; invent a second season-default store; replace the OI-0250 strip with the Ud dialog.

## 4. Option axes

### Event / location / group / start / hay / DMI / gate

| Code | Meaning |
|---|---|
| **Es** | **LOCKED:** One synthetic **closed** event. |
| **Ld** | **LOCKED (Tim):** one new “Sheep history” farm-total **pasture** location + one closed PW (no smear). |
| **La** | All ~33 pasture PWs (smear) — alt if Tim drops Ld. Not locked. |
| **Lb** / **Lc** | E-strip only / sequential. Not locked. |
| **Go** | **LOCKED (Tim):** one closed EGW on **Sheep**. |
| **Ox** | **LOCKED:** Exclusive end **2026-11-06**. |
| **Sc** | **LOCKED (Tim):** start **2026-03-04**. |
| **D2** | **LOCKED (Tim):** dmiPct **2.5**. |
| **Hn** | **LOCKED (Tim):** hay out of this OI. |
| **Nm** | **LOCKED:** No membership backdate. |
| **Gw** | **LOCKED:** Dry-run → backup → separate write yes (migration apply and backfill write each need their own). |
| **D0** | **LOCKED:** This tip: no SQL apply. (Ap’s migration lands in Build’s implement PR, file-only until gated apply.) |

### Head / weight

| Code | Meaning |
|---|---|
| **Wt** | **LOCKED (t982s3917):** **70 head @ 100 lb** (≈ **45.36 kg**). Custom — not W7’s ~162 lb class default. |
| **Wc** | 54 @ ~126 lb (live flock only). Not locked. |
| **W7** | 70 @ ~162 lb class-default weighted (rejected by Tim’s 100 lb). |
| **Wh** | 80 @ 110 lb (17c earlier candidate). Not locked. |

### Archive / metrics preference (Sheep-history loc + farm-wide)

| Code | Meaning |
|---|---|
| **Ap** | **LOCKED (t991u / t987s3936):** (1) set Sheep-history `locations.archived=true` at write so default lists/pickers stay `!archived`; (2) add a **farm-persisted** reporting preference on **`farm_settings`** (intent column name: `include_archived_locations_in_metrics`, boolean, **default true**) so Locations Calendar DMI/NPK, the **OI-0250** period totals strip, and reports can **include or exclude archived locations** farm-wide. Wire into `isManagementLocation` / `filterManagementLocations` (include archived when setting true; still require land+pasture/mixed-use). Settings farm section remains a durable editor; **Ud** dialog also writes the **same** farm setting (no second toggle / no session-only). **Migration required** (next numbered after then-current ceiling; file-only until Tim yes + backup). Not localStorage. Calendar **row** for archived Sheep-history may stay hidden while metrics include when setting true. |
| **Ac** | Archive hide + hard-coded metrics include for archived X1 with in-window PWs (**no** user preference). Not locked (Tim chose **Ap**). |
| **An** | Leave Sheep-history location **active** (visible in lists). Not locked. |
| **Aa** | Archive boolean at write **without** metrics code or preference — **does not meet** Tim’s DMI intent (CONFIRMED). Do not lock Aa alone. |
| **Ax** | Dated archive schema — out of scope. |

### Report preferences access (new)

| Code | Meaning |
|---|---|
| **Ud** | **LOCKED (t991u + t993u):** small **Report preferences** dialog reachable from **both** Locations **Rotation (Calendar)** and Locations **List**, containing: (1) **period defaults** (season/window defaults — same `farm_settings` as OI-0247 **Db** when that lands; do **not** invent new season columns here); (2) **`include_archived_locations_in_metrics`** (**Ap**). One dialog, one `farm_settings` write path. Settings farm section remains durable editor too. **Ud is not the OI-0250 strip** — strip placement stays under season metrics bar / above color key (**Sb**); Ud is prefs UI only. |

## 5. Tim lock (t990s3945 / t991u / t993u)

**Es+Ld+Ap+Ud+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0**

Card / typed answers (2026-11-22 ~7:27–7:28 AM ET, via Orchestrator):
- **t990s3945** (~7:27 AM ET): “Confirm the rest still OK? Yes, rest still OK (**Ok**)”.
- **t991u** (~7:28 AM ET), verbatim: “A on teh first one, but also have the report preferences available from teh rotaion and list screen” → **Ap** PLUS report preferences on Rotation and List.
- **t993u** (~7:28 AM ET), verbatim: “small dialog with the period defaults and the archive preference” → that access is a **small dialog** (**Ud**) holding period defaults + archive preference.

Plain language: one closed synthetic sheep event **Mar 4 → Nov 6 2026** (exclusive end) on a new **Sheep history** pasture location, **70 head at 100 lb**, **2.5%**, one **Sheep** group window, **no hay** in this OI, no membership backdate. Archive that location so it drops from location lists, and add a **farm setting** (default **on**) to include archived locations in season DMI/NPK, the period totals strip, and reports — Tim can turn it off. A **small Report preferences dialog** on both Rotation and List edits period defaults and that archive preference (same `farm_settings` as Settings). Survives devices (not a one-browser toggle).

**Ap setting details (LOCKED):**
1. **Where:** `farm_settings` typed boolean — same pattern as 047/048 / OI-0247. **Migration required.** Not `preferences.js` localStorage.
2. **Default:** **true (include)** archived locations that have paddock/group history overlapping the metric window — Sheep-history backfill shows in season totals without a hunt; toggle off to match today’s exclude-archived behavior.
3. **Persist:** farm-level (yes).
4. **UI:** Farm Settings section + **Ud** dialog from Rotation and List; all write the **same** column.
5. **OI-0250 interaction:** totals strip (**Sb**, docs live on main `d6a18e8`) **reads the same Ap preference** (no second toggle). Ud dialog is **not** the strip. Strip placement stays under season metrics bar / above color key. If OI-0250 code ships before Ap migration+code, strip inherits today’s exclude-archived until Ap lands; then both Calendar metrics and strip honor the setting. Ap migration stays **OI-0251 scope**.
6. **Period defaults in Ud:** align with OI-0247 season-default editors (**Db**) when that OI’s migration is applied; until then, dialog shows what’s available / links Settings — do **not** invent a second season-default store.
7. **Existing archived paddocks:** preference is **farm-wide** (all archived locations), not Sheep-history only.
8. **Lists/pickers:** always stay filtered `!archived` regardless of the metrics preference.
9. **Calendar row:** archived Sheep-history may stay hidden from the calendar row set while still included in metrics when Ap setting is true (Build-confirmed).

**SQL / gates (explicit):** this docs tip writes no SQL (**D0**). Ap migration file + Ud UI + metrics wiring ship in Build’s implement PR (file-only until Tim yes). Migration apply and backfill data write each need SELECT dry-run / verified backup + **separate** Tim yes (**Gw**). Land docs via Git Bridge after Tim’s land yes; Design briefs Build after docs are on main.

## 6. Write path (after lock / after docs land)

1. Build ships **Ap** migration (file-only) + farm Settings / **Ud** dialog / metrics consumers + `isManagementLocation` (or equivalent) honoring the farm setting for archived X1 — can ship before or with data write; apply gated separately.  
2. SELECT dry-run CSVs + REPORT (location + archived flag + PW + EGW 70@45.36 kg).  
3. Tim review → verified backup → **separate** yes for migration apply.  
4. Tim review → verified backup → **separate** yes for data write.  
5. Insert closed event + PW on Sheep-history pasture + closed Sheep EGW; set `archived=true`.  
6. No wizard path; no memberships.

## 7. Interactions

- **OI-0250:** sheep DMI appears in period strip when Sheep-history is in the metric row set **and** the farm preference is include (default). Strip shares Ap’s setting — no second toggle. Ud is prefs UI, not the strip.  
- **OI-0247:** Ud period-defaults controls write the same season-default `farm_settings` as **Db** when applied; until then, show available / link Settings.  
- **OI-0249:** explicit head/weight → known slice.  
- **Hn:** pasture DMI overstated on hay days until a later OI.

## 8. Acceptance

- [x] Tim locked **Ap** + confirmed Ok (**t990s3945** / **t991u**); **Ud** from **t991u** + **t993u**. Lock **Es+Ld+Ap+Ud+Go+Ox+Sc+Wt+D2+Hn+Nm+Gw+D0**.  
- [ ] **Ap** migration file + Settings/metrics code live (apply gated); lists stay `!archived`; preference default include; Calendar row for archived may stay hidden.  
- [ ] **Ud** small dialog on Rotation and List with period defaults + archive preference; same `farm_settings` write path as Settings.  
- [ ] Dry-run + backup + separate write yes (migration apply and backfill each).  
- [ ] Closed event + one PW + one EGW (70 @ 45.36 kg); exclusive handoff 2026-11-06; no memberships.  
- [ ] Farm sheep DMI in Locations / period totals Mar–Nov when preference includes archived; real paddocks not smeared; lists hide loc.  
- [ ] OI-0250 strip honors the same Ap preference (no second toggle).  
- [ ] **Hn** gap documented.

## 9. Origin

- **t965u**, **t976s3898**, **t982u**, **t982s3917** (“70 at 100”), **t987s3936** (reporting preference include/exclude archived).  
- **t990s3945** (~7:27 AM ET): Ok confirm-rest.  
- **t991u** (~7:28 AM ET): “A on teh first one, but also have the report preferences available from teh rotaion and list screen” → **Ap** + Rotation/List prefs.  
- **t993u** (~7:28 AM ET): “small dialog with the period defaults and the archive preference” → **Ud**.  
- Build feasibility + groups recheck; Design/Build archive-metrics: **Aa data-only blocked**; Tim locked **Ap** (+ **Ud**).
