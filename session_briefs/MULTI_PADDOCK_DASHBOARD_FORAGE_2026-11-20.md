# Multi-paddock dashboard forage aggregation (OI-0242)

**Status:** **PROPOSED** — awaiting Tim lock (A/B/C required; D optional)  
**Opened:** 2026-11-20 ~7:52 PM ET (Tim yes via Orchestrator, card t723s2984: "Yes, open a new OI for multi-paddock dashboard forage aggregation")  
**Owner:** GTHO Design (docs) → GTHO Build **only after Tim locks**  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Origin / trigger

Tim (iPhone PWA, ~7:51 PM ET Nov 20, via Orchestrator) on sheep event `8ef44a4a` card **after** the F open-obs height data fix (OI-0241 ops, card t715s2944):

> "The DMI numbers from pasture are[n't] right but the pasture values are correct in the card"

Card showed ~**12.09 ac**, Sheep 54 hd, Est. capacity **598 AUDs**, ~**45.04** days, **9.0 in**, ADA 0.6/ac. Pasture line and DMI chart looked odd to him; Design diagnosis split **expected** (OI-0238 prorate 170 vs 96; chart Thu 486 from prior event E via `sourceEventId`) from a **real bug**: height **9.0 in** is **F-1 alone**, not an area-weighted multi-paddock figure (~**7.58 in** for 9/6/6/8/8). Capacity AUDs / days inherit that overstated forage.

**Not OI-0241.** Edit Save / inline Pre-Graze / destination copy stay on OI-0241. This OI is dashboard `buildLocationCard` forage aggregation only.

## Diagnosis (Design read-only)

**Code:** `src/features/dashboard/index.js` — `buildLocationCard`:

- `primaryPw = openPws[0]` (~L1086).
- Height display and pre-graze observation lookup use **that one** paddock window’s location / obs (~L1189–1198).
- Available DM runs **FOR-1 once** with that primary height/cover, while acres / area% for multi-open already reflect the **summed** open set (`areaPctForCalc = 100` when `openPws.length > 1`, ~L1214–1219).
- Est. capacity (FOR-2 / AUDs) and days-remaining inherit that single FOR-1 result.

**Contrast (already correct):** DMI-8 in `src/calcs/feed-forage.js` uses `pickPreGraze(pw)` **per paddock window** and `for1ForWindow(pw)` then aggregates — multi-paddock demand/forage for the cascade is per-window. Dashboard capacity is the inconsistent surface.

**Example (event `8ef44a4a`, F-1…F-5 after height fix):** heights **9 / 6 / 6 / 8 / 8 in** → area-weighted ≈ **7.58 in**; card showed **9.0 in** (F-1 = `openPws[0]`); AUDs / days **overstated** vs summing FOR-1 per window.

## Scope

**In scope**

- Dashboard location card: standing forage **height** display, **available DM (FOR-1)**, **Est. capacity AUDs**, and **days-remaining** that inherit that DM.
- Aggregation must stay consistent with DMI-8 `pickPreGraze` / per-window FOR-1 inputs (same observation pick rules).
- Optional (same OI if Tim locks D1): DMI last-N-days chart label when a day came from `sourceEventId` cascade (prior event).

**Out of scope**

- OI-0241 Edit Save / inline Pre-Graze / destination copy.
- OI-0238 partial-day DMI (170 target vs 96 grazing today — **expected**).
- Inventing new forage formulas beyond aggregating existing FOR-1 / display height.
- Schema / migration / CP-55/56.
- Changing DMI-8 per-window math unless a real inconsistency with the locked aggregation is found (should already be correct).

## Tim lock options (PROPOSED)

Design recommendations marked. **Do not hand Build until Tim locks A, B, and C.**

### A — Aggregation method for available DM / AUDs / days (**REQUIRED** — pick one)

- **A1 (Design rec):** Sum FOR-1 **per open paddock window** (each PW uses its own pre-graze height/cover via the same `pickPreGraze` rules as DMI-8), then sum available DM across open PWs. Display height as **area-weighted** average inches (and optionally cover if shown).
- **A2:** Area-weighted single height (+ cover) then **one** FOR-1 over total acres (approx; can diverge from per-PW FOR-1 if cover differs by paddock).
- **A3:** Keep primary PW height for *display only*, but compute capacity from A1 sum (mixed — **Design discourages**: height and DM tell different stories).

### B — Which open PWs count (**REQUIRED**)

- **B1 (Design rec):** All **open** paddock windows on the active event(s) for that location card (same set already used for acre sum).
- **B2:** Only PWs with a pre-graze observation; missing obs → exclude from forage DM (acres handling needs a follow-up if Tim picks this). Prefer **B1** with missing-obs = **0** forage contribution for that PW while still showing acres.

### C — Missing / partial pre-graze (**REQUIRED**)

- **C1 (Design rec):** PW without usable pre-graze contributes **0** available DM; height display weighted only over PWs that have height; UI may show “partial” if any open PW is missing pre-graze.
- **C2:** Block / hide capacity numbers until **all** open PWs have pre-graze.
- **C3:** Fall back to `primaryPw` / `openPws[0]` behavior for missing only (**Design discourages**).

### D — Optional chart prior-event label (**OPTIONAL**, same OI)

- **D0 (Design rec if Tim silent):** Defer — not in this implement.
- **D1:** On DMI last-N-days chart, label days that came from `sourceEventId` cascade (e.g. “prior event” / “from previous event”) so Thu-on-new-event isn’t misread as this event’s stored feed (motivating case: Thu **486** was E’s Thursday on new event `8ef44a4a`).

**Design lock recommendation for Tim card:** **A1 + B1 + C1**; **D0** unless Tim wants the chart label now.

## Acceptance (once locked)

- [ ] Multi-paddock card height ≠ `openPws[0]` alone when open PW heights differ.
- [ ] Available DM / AUDs / days-remaining match the locked aggregation (A/B/C).
- [ ] Inputs use the same `pickPreGraze` rules as DMI-8 per window.
- [ ] Single-paddock cards unchanged numerically.
- [ ] Tests cover **2+** open PWs with different heights (and a missing-pre-graze case per locked C).
- [ ] Design PASS on PR.
- [ ] **No Build until Tim locks.** No migration.

## Files (Build — after lock; product behaviour, not invention)

| Area | Likely touch |
|---|---|
| Dashboard location card | `src/features/dashboard/index.js` — `buildLocationCard`: stop `primaryPw`-only height × total acres; aggregate per locked A/B/C |
| Calcs (reuse, don’t fork) | `src/calcs/feed-forage.js` — prefer shared `pickPreGraze` / per-window FOR-1 helpers already used by DMI-8 |
| UX copy (if D1) | `src/ui/dmi-chart.js` (+ i18n) — prior-event day label |
| Tests | Multi-open PWs different heights; single-PW regression; missing pre-graze per C |
| Docs on land | `V2_UX_FLOWS.md` §17.7 capacity line; CALC FOR-1 / CAP-1 notes if wording changes |

## Related

- OI-0241 — Edit Save / inline / destination copy (separate; F data fix already applied).
- OI-0238 — partial-day estimated demand (expected 170 vs 96).
- OI-0209 — confinement forage greyed.
- Diagnosis event `8ef44a4a` / F-1…F-5; prior event E `ff115ee9` for chart cascade.
- UX §17.7 location cards; CALC FOR-1, FOR-2/3, DMI-8.
