# DM Forecaster — active groups + CAP-1 stub fix (OI-0257)

**Status:** **PROPOSED** 2026-11-22 ~10:10 AM ET (Tim feedback batch item 5, **t1073u** + CAP-1 stub triage; batch ended **t1096u**). Awaiting Tim lock. No SQL / no migration expected.  
**Owner:** GTHO Design → GTHO Build (after Tim locks + docs live on main; Build discovery first if forecast path is unclear).  
**Parent:** Forgejo `origin/main` `2fe1e8897dc4e2dcab413b157292d619ecee0c7d` (OI-0252 PR #131 live; RELEASED **48**). OI-0253 LOCKED tip `129b2dd` may land separately.  
**Also related:** CAP-1 forecast stub in `calendar-grid.js` (`coverageFraction: 0` / `shortfallLbsHay: 0`) when a forecaster period + groups are selected; Tim saw future readiness blocks paint tan **“Hay / stored feed, 0 lbs hay”** instead of green — **not** a #129/#131 paint regression; green returns when leaving forecast-stub mode. OI-0254 readiness bands are separate (close-event estimated range).  
**Schema / migration:** **D0 — none** expected (UI filter + stub paint + forecast path fix).

## 1. Problem

Tim (**t1073u**): DM forecaster should show **only active groups**; also check whether the forecaster actually works.

Build triage (same morning): with a forecaster period + groups selected (Tim had **3-day**), CAP-1 stub forces future blocks to tan “0 lbs hay” instead of readiness. Folded into this feedback item — **no hotfix**.

| Sub-problem | Detail |
|---|---|
| Group list | Forecaster UI should list **active** groups only (**Ag1**). |
| Stub paint | Forecast-stub mode must **not** fake tan “Hay / stored feed, 0 lbs hay” on future blocks (**St1**). |
| Computation | Verify/fix the real forecast path (**Fx1**); Build discovery first if needed. |

### Out of this OI

- OI-0254 readiness band geometry (close-event range) — complementary; stub must not override readiness with fake 0 lbs.
- OI-0253 B1 unknown paint.
- OI-0256 `no_pasture` restore.

## 2. Lock axes

### **Ag** — Group list

| Token | Meaning |
|---|---|
| **Ag1** [rec] | Forecaster UI shows **active groups only**. |
| **Ag0** | Keep listing inactive / all groups (does not match Tim). |

### **St** — Stub / unavailable forecast paint

| Token | Meaning |
|---|---|
| **St1** [rec] | While forecast is loading or unavailable, **keep readiness paint** (or clear loading/unavailable) — **never** fake tan “0 lbs hay”. |
| **St2** | Hide future blocks until a real forecast exists. |
| **St3** | Explicit “Forecast unavailable” chip on future blocks (no fake 0 lbs). |

### **Fx** — Forecast computation

| Token | Meaning |
|---|---|
| **Fx1** [rec] | Fix/verify the forecast computation path so selecting period + groups produces a real forecast (or a truthful unavailable state under **St***). Build discovery first if the break is unclear. |
| **Fx0** | Stub-only UX change; leave computation broken — does **not** match “check if it works.” |

### **D** — Schema

| Token | Meaning |
|---|---|
| **D0** [rec] | No SQL / no migration. |

## 3. Design recommendation

**Ag1+St1+Fx1+D0**

- Active-only matches Tim.
- **St1** preserves readiness while forecast is missing (least surprising vs hiding blocks or adding a chip); **St3** is a fine alt if Tim wants an explicit chip.
- **Fx1** required so the feature actually works.

## 4. Acceptance (when locked + built)

1. Forecaster group picker lists active groups only (**Ag1**).
2. Selecting a forecast period + groups does **not** paint future blocks as tan “Hay / stored feed, 0 lbs hay” from the CAP-1 stub (**St1** or **St3**).
3. When a real forecast exists, future blocks show forecast data; when not, behavior matches **St***.
4. Build confirms the computation path works or documents the break and fixes under **Fx1**.
5. No SQL (**D0**).

## 5. Tip instruction

**PROPOSED** — Design lean **Ag1+St1+Fx1+D0**. Docs only. Awaiting Tim lock. Suggested Build order: after **OI-0254** (shares calendar-grid); Build may do discovery before code.
