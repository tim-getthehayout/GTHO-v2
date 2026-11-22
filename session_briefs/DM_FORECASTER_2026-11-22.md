# DM Forecaster — active groups + CAP-1 stub fix (OI-0257)

**Status:** **LOCKED / READY FOR BUILD (narrow)** 2026-11-22 ~10:49 AM ET (Tim, via Orchestrator, card **t1121s4395** answered **t1127u**) — **Ag1+St1**; **Fx1 PARKED**. Opened ~10:10 AM ET from Tim feedback batch item 5 (**t1073u** + CAP-1 stub triage; batch ended **t1096u**). Docs tip ready for Tim land (batch 0254–0257 complete). No SQL / no migration.  
**Owner:** GTHO Design → GTHO Build (**LOCKED / READY FOR BUILD** for **Ag1+St1** only; Build may start Ag1+St1 ahead of docs land, after OI-0254). Do **not** implement **Fx1** or a presentation redesign until Tim unparks.  
**Parent:** Forgejo `origin/main` `da22c6d5978fa9864142d5bb99b7e5f3f817ae5a` (OI-0254 code LIVE via PR #135; OI-0253 docs live; OI-0252 PR #131 live; RELEASED **48**).  
**Also related:** CAP-1 forecast stub in `calendar-grid.js` (`coverageFraction: 0` / `shortfallLbsHay: 0`) when a forecaster period + groups are selected; Tim saw future readiness blocks paint tan **“Hay / stored feed, 0 lbs hay”** instead of green — **not** a #129/#131 paint regression; green returns when leaving forecast-stub mode. OI-0254 readiness bands are separate (close-event estimated range).  
**Schema / migration:** **D0 — none** expected (UI filter + stub paint; forecast path parked).

## 1. Problem

Tim (**t1073u**): DM forecaster should show **only active groups**; also check whether the forecaster actually works.

Build triage (same morning): with a forecaster period + groups selected (Tim had **3-day**), CAP-1 stub forces future blocks to tan “0 lbs hay” instead of readiness. Folded into this feedback item — **no hotfix**.

Tim lock (**t1127u**, answering **t1121s4395**, ~10:49 AM ET), verbatim: “green if there is pasture. A survey would show actual amount of estimated pasture which would allow an estimate of hay per day that would need to be fed for the group or groups to make up the difference. Let's park forecaster (other than the group issue) and I will think on how to present.”

| Sub-problem | Detail |
|---|---|
| Group list | Forecaster UI should list **active** groups only (**Ag1** — locked). |
| Stub paint | Future blocks keep **green readiness where there is pasture**; must **not** fake tan “Hay / stored feed, 0 lbs hay” on future blocks (**St1** narrowed — locked). |
| Computation / presentation | Verify/fix the real forecast path and how to present it — **Fx1 PARKED** (not this build). |

### Out of this OI

- OI-0254 readiness band geometry (close-event range) — complementary; stub must not override readiness with fake 0 lbs.
- OI-0253 B1 unknown paint.
- OI-0256 `no_pasture` restore.
- **Fx1** and forecaster presentation until Tim unparks.

## 2. Lock axes

### **Ag** — Group list

| Token | Meaning |
|---|---|
| **Ag1** [LOCKED] | Forecaster UI shows **active groups only**. |
| **Ag0** | Keep listing inactive / all groups — **not chosen**. |

### **St** — Stub / unavailable forecast paint

| Token | Meaning |
|---|---|
| **St1** [LOCKED, narrowed] | Future blocks keep **green readiness where there is pasture**; **never** fake tan “Hay / stored feed, 0 lbs hay” from the CAP-1 stub. (Original rec also allowed a clear loading/unavailable state; Tim narrowed to green-if-pasture.) |
| **St2** | Hide future blocks until a real forecast exists — **not chosen**. |
| **St3** | Explicit “Forecast unavailable” chip on future blocks (no fake 0 lbs) — **not chosen**. |

### **Fx** — Forecast computation

| Token | Meaning |
|---|---|
| **Fx1** [PARKED] | Fix/verify the forecast computation path so selecting period + groups produces a real forecast (or a truthful unavailable state under **St***). **Not in this build.** Tim parked “forecaster (other than the group issue)” and will think on how to present. |
| **Fx0** | Stub-only UX change; leave computation broken — **not chosen** as a lock (Fx1 is parked, not rejected). |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** [LOCKED / standing] | No SQL / no migration. |

## 3. Design lock

**LOCKED (narrow): Ag1+St1** — Tim, ~10:49 AM ET, card **t1121s4395** answered **t1127u**. **Fx1 PARKED**. **D0** standing.

- **Ag1** matches “other than the group issue” — active groups only ships now.
- **St1** narrowed by “green if there is pasture”: keep green readiness where there is pasture; never fake tan “0 lbs hay” from the CAP-1 stub. **St2** / **St3** not chosen.
- **Fx1** and presentation are parked, not required for this build.

## 4. Parked / Future (not a lock, not acceptance)

Tim (**t1127u**): “A survey would show actual amount of estimated pasture which would allow an estimate of hay per day that would need to be fed for the group or groups to make up the difference. Let's park forecaster (other than the group issue) and I will think on how to present.”

Record only: a later survey-based estimated pasture could support an estimate of hay per day needed for the group(s) to make up the difference. Do **not** invent a forecaster UX or treat this as locked scope until Tim unparks.

## 5. Acceptance (this lock — Ag1+St1 only)

1. Forecaster group picker lists active groups only (**Ag1**).
2. Future blocks keep green readiness where there is pasture; selecting a forecast period + groups does **not** paint future blocks as tan “Hay / stored feed, 0 lbs hay” from the CAP-1 stub (**St1**).
3. **Fx1** and presentation redesign are out of scope until Tim unparks.
4. No SQL (**D0**).

## 6. Tip instruction

**LOCKED / READY FOR BUILD (narrow)** — **Ag1+St1** only (**Fx1 PARKED**; **D0** standing). Docs tip ready for Tim land (batch **OI-0254..0257** complete; parent main `da22c6d`). **Do not land on main** until Tim yeses the land card. Build may start **Ag1+St1** ahead of docs land; **OI-0254** code already LIVE on main (shares calendar-grid). Do **not** implement **Fx1** or a presentation redesign until Tim unparks. Never edit `src/`, `tests/`, or `supabase/` on this docs tip.
