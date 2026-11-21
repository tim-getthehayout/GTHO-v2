# Multi-paddock dashboard forage aggregation (OI-0242)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-20 ~7:55 PM ET, via Orchestrator, card t724s2992) — opened ~7:52 PM ET (card t723s2984); **A1+B1+C1+D1 locked ~7:55 PM ET**  
**Owner:** GTHO Design → GTHO Build  
**Schema / migration:** none  
**CP-55 / CP-56:** none

## Origin / trigger

Tim (iPhone PWA, ~7:51 PM ET Nov 20, via Orchestrator) on sheep event `8ef44a4a` card **after** the F open-obs height data fix (OI-0241 ops, card t715s2944):

> "The DMI numbers from pasture are[n't] right but the pasture values are correct in the card"

Card showed ~**12.09 ac**, Sheep 54 hd, Est. capacity **598 AUDs**, ~**45.04** days, **9.0 in**, ADA 0.6/ac. Pasture line and DMI chart looked odd to him; Design diagnosis split **expected** (OI-0238 prorate 170 vs 96; chart Thu 486 from prior event E via `sourceEventId`) from a **real bug**: height **9.0 in** is **F-1 alone**, not an area-weighted multi-paddock figure (~**7.58 in** for 9/6/6/8/8). Capacity AUDs / days inherit that overstated forage.

**Not OI-0241.** Edit Save / inline Pre-Graze / destination copy stay on OI-0241. This OI is dashboard `buildLocationCard` forage aggregation + DMI chart prior-event labeling (D1).

**Opened:** Tim yes ~7:52 PM ET (card t723s2984): "Yes, open a new OI for multi-paddock dashboard forage aggregation"

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
- **D1 IN SCOPE:** DMI last-N-days chart label when a day came from `sourceEventId` cascade (prior event).

**Out of scope**

- OI-0241 Edit Save / inline Pre-Graze / destination copy.
- OI-0238 partial-day DMI (170 target vs 96 grazing today — **expected**).
- Inventing new forage formulas beyond aggregating existing FOR-1 / display height.
- Schema / migration / CP-55/56.
- Changing DMI-8 per-window math unless a real inconsistency with the locked aggregation is found (should already be correct).

## Locked (Tim, 2026-11-20 ~7:55 PM ET, card t724s2992)

**Tim lock (exact words):** "Lock OI-0242 A1+B1+C1, D1: same aggregation, plus label DMI chart days from previous event"

Note: Design’s PROPOSED recommendation was **A1+B1+C1** with **D0** (defer chart label). Tim chose **D1**, not D0 — D is **IN SCOPE**.

- **A1 LOCKED:** Sum FOR-1 **per open paddock window** (each PW uses its own pre-graze height/cover via the same `pickPreGraze` rules as DMI-8), then sum available DM across open PWs. Display height as **area-weighted** average inches (and optionally cover if shown). Stop using `primaryPw = openPws[0]` height × total acres for capacity. Fix AUDs / days-remaining that inherit that DM.
- **B1 LOCKED:** All **open** paddock windows on the active event(s) for that location card (same set already used for acre sum).
- **C1 LOCKED:** PW without usable pre-graze contributes **0** available DM; height display weighted only over PWs that have height; UI may show “partial” if any open PW is missing pre-graze.
- **D1 LOCKED (IN SCOPE):** On DMI last-N-days chart, **label** days that came from `sourceEventId` cascade (e.g. “from previous event” / “prior event”) so a day like Thu 486 on a new-event chart isn’t misread as this event’s stored feed (motivating case: Thu **486** was E’s Thursday on new event `8ef44a4a`).

**No migration.** No schema. No CP-55/56.

### Lock options retained for history (PROPOSED → chosen)

| Option | Choices | Locked |
|---|---|---|
| A — Aggregation | A1 sum per-PW FOR-1 + area-weighted height (rec); A2 weighted then one FOR-1; A3 mixed (discouraged) | **A1** |
| B — Which open PWs | B1 all open (rec); B2 only with pre-graze | **B1** |
| C — Missing pre-graze | C1 → 0 DM + partial UI (rec); C2 block until all; C3 primary fallback (discouraged) | **C1** |
| D — Chart prior-event label | D0 defer (Design rec); D1 label source-event days | **D1** (Tim overrode D0) |

## Acceptance

- [ ] Multi-paddock card height ≠ `openPws[0]` alone when open PW heights differ.
- [ ] Available DM / AUDs / days-remaining match **A1+B1+C1** (sum FOR-1 per open PW; 0 DM for missing pre-graze; height area-weighted over PWs with height).
- [ ] Inputs use the same `pickPreGraze` rules as DMI-8 per window.
- [ ] Single-paddock cards unchanged numerically.
- [ ] DMI last-N-days chart **labels** days from `sourceEventId` cascade (D1) so prior-event stored/grazing isn’t read as this event’s.
- [ ] Tests cover **2+** open PWs with different heights (and a missing-pre-graze case per C1); chart prior-event label coverage for D1.
- [ ] Design PASS on PR.
- [ ] No migration.

## Files (Build — product behaviour, not invention)

| Area | Likely touch |
|---|---|
| Dashboard location card | `src/features/dashboard/index.js` — `buildLocationCard`: stop `primaryPw`-only height × total acres; aggregate per A1+B1+C1 |
| Calcs (reuse, don’t fork) | `src/calcs/feed-forage.js` — prefer shared `pickPreGraze` / per-window FOR-1 helpers already used by DMI-8 |
| DMI chart labeling (D1) | Chart context / render that drives `computeDmi8Days` — e.g. `src/ui/dmi-chart.js`, `dmi-chart-context.js`, or dashboard chart render (+ i18n) — prior-event / `sourceEventId` day label |
| Tests | Multi-open PWs different heights; single-PW regression; missing pre-graze per C1; chart labels prior-event days (D1) |
| Docs on land | `V2_UX_FLOWS.md` §17.7 capacity line; CALC FOR-1 / CAP-1 notes if wording changes |

## Related

- OI-0241 — Edit Save / inline / destination copy (separate; F data fix already applied).
- OI-0238 — partial-day estimated demand (expected 170 vs 96).
- OI-0209 — confinement forage greyed.
- Diagnosis event `8ef44a4a` / F-1…F-5; prior event E `ff115ee9` for chart cascade.
- UX §17.7 location cards; CALC FOR-1, FOR-2/3, DMI-8.
