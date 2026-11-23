# OI-0280 — Home event cards: DMI target vs actual (hay eaten from feed checks)

**Date:** 2026-11-23 | **Owner:** GTHO Design | **Status:** **PROPOSED** — lock needed on **Ac / Wn / Dp / Nc** (Design rec **Ac1+Wn1+Dp1+Nc1**). Docs only; no code, no SQL, no data change (**D0**).
**Requested:** Tim, **t1379u**, 2026-11-23 11:50 AM ET (via Orchestrator).
**Base:** Forgejo `origin/main` `3cc9a84db640f88918cf2e308752df062544cdbd`. Code read only; line numbers at `3cc9a84`. Prod not queried.
**Related:** OI-0224 (E actual vs forecast, F per-event later), OI-0225 (DMI-9 implied pasture), OI-0258 / OI-0260 (Al1 allocation), OI-0277 + OI-0278-S2 (Home), OI-0279 (per-class need).

## Tim’s request (verbatim)

> “Events on dashboard seem to have the DMI target (forecast) but not the actual run rate based on feed checks? The difference between forecasted and actual is very useful”

## 1. What the Home event card shows today

`buildLocationCard` (`src/features/dashboard/index.js:1084`), also used by Field mode (`field-mode/index.js:531`):

| Where | Text | Source |
|---|---|---|
| `:1495–1500` gray breakdown | `Pasture: X lbs DM · Stored feed: Y lbs DM · DMI target (forecast): Z lbs/day` | X/Y = DMI-4 split of event-to-date need (`:1247–1259`); Z = today’s need |
| `:1571–1594` chart | `DMI — LAST 3 DAYS`, days labelled “Actual” / “(est.) · Forecast” | DMI-8; on “Actual” days the bar total is still need, only the hay/pasture split is measured |
| `:1620–1626` summary | `DMI target (forecast) Z lbs/day · S% stored · P% est. pasture` | Z = Σ DMI-2 over open windows (`:1168–1177`, 2.5% until OI-0279); S/P = DMI-4 event-to-date with stored = deliveries − latest check residual (`eventStoredFeedDm`, `:279–333`) |

Label string: `en.json:5` `dmi.targetForecast` = “DMI target (forecast)”. No per-day hay-eaten rate, no actual-vs-target and no difference appear on the card. Event Detail (`events/detail.js:320, 950`) shows target only.

## 2. What exists that the card can reuse

- **`al1EventDayAllocation`** (`src/calcs/f1-close-allocation.js:400`): per event per day, kind `measured | unknown | none`, `storedDmiKg` (hay eaten that day) and `pastureDmiKg = max(0, need − hay)`. Spans run from the event-open anchor to the first check, then check to check; days after the latest check are unmeasured. Same source as DMI-8 “Actual” days (`calcs/feed-forage.js:869, 996–1014`), Locations F1 and calendar Period totals.
- **FED-6 / DMI-9** (`src/calcs/feed-run-rate.js:78`, panel `features/feed/run-rate-panel.js:155–163`): the Feed screen’s farm-wide “DMI: actual x vs forecast y (pct%)” and implied pasture. It counts check-to-check days only (no opening anchor), so per event it would disagree with the chart; not the per-event source.
- **DMI-6** (`feed-forage.js` ~`:248`): confinement actual − expected, %. Registered, no caller today.
- **Need:** OI-0279’s shared group-day function (per class).

## 3. Spec today

- `V2_UX_FLOWS.md` §11.1 (event cards): “DMI target vs actual” listed; §17.7 (Home location card #7, #14): target only.
- OI-0224 **E**: actual = stored DM eaten per day from checks; forecast = need on the same days; **F**: farm-wide now, per-event later.
- Implied-pasture rule (OI-0225 / OI-0258 / OI-0277): per day `max(0, need − hay eaten)`, hay over need separate, no-hay grazing = 100% pasture.
- No spec for a per-event actual on the Home card. OI-0280 fills that gap.

## 4. Definition (Design)

Per event, over the window’s counted days:
- **Hay eaten/day** = Σ Al1 `storedDmiKg` (measured days) ÷ measured days.
- **Target/day** = Σ need on the same days ÷ days (OI-0279 need; OI-0238 partial first/last day; same demand Al1 uses).
- **Difference** = target − hay eaten. Grazing: implied pasture `Σ max(0, need − hay)` per day; hay over need shown as “over target”. Pure confinement (OI-0209): under/over target (DMI-6); no pasture.
- `none` days (no stored feed on the event): hay 0 known, need = pasture. `unknown` days: not counted, named in the hint.
- Units via OI-0278 helper; canonical metric stored.

## 5. Decisions for Tim (plain language; Design rec first)

**Ac — What “actual” means**
- **Ac1 (rec):** Hay eaten per day from your feed checks, next to the target, and the gap explained: on grazing it is what pasture supplied; in a dry lot it is how far under or over target they ate.
- Ac2: Hay eaten next to the target, no explanation of the gap.
- (Not offered: “total eaten including pasture” — pasture eaten can’t be measured, so it would always equal the target.)

**Wn — Which days it averages**
- **Wn1 (rec):** The last 7 measured days, ending at the latest feed check. Recent, and still shows something when checks are a few days apart.
- Wn2: The whole event so far.
- Wn3: Only the time between the last two feed checks.

**Dp — How it shows**
- **Dp1 (rec):** One line replacing today’s summary DMI line, e.g. “Target 1,410 · hay eaten 1,020 lb DM/day (72%) · pasture ≈ 390” with “5 measured days through Sat”; pasture in green, no red.
- Dp2: Dp1 plus a small bar of target vs hay eaten.
- Dp3: Dp1 with the % coloured by a band (e.g. within ±10% green, outside amber).

**Nc — When there’s nothing to measure yet**
- **Nc1 (rec):** Say why: one check so far → “Hay eaten: after the next feed check”; grazing with no hay → “No stored feed · pasture covers the target”; a check missing a unit → “Hay eaten unknown: check needs a unit”.
- Nc2: Hide the line.

## 6. Design defaults (no lock needed)

- Scope: Home location cards (Field mode inherits). Event Detail is a follow-up.
- The gray breakdown line drops its duplicate “DMI target (forecast)” (`:1499`); today’s need lives in the Dp1 line as “Target”.
- 3-day chart unchanged.
- Groups view cards unchanged. Separate finding for later: `:808–832` shows predicted need as “consumed” against `group.dmiTarget`; `:979` draws a progress bar fixed at 0%.

## 7. Build order and placement

… → OI-0274 PR → OI-0273 PR → **OI-0279** → **OI-0277 + OI-0278-S2** → **OI-0280** → OI-0278-S3 → OI-0278-S4.

OI-0280 builds on the S2 branch: S2 rewrites the same card lines (`:1497–1499`, `:1623`) to the OI-0278 helper and OI-0277 reads the same need/Al1 math. Its own small PR keeps S2 reviewable. Folding it into S2 also works if Tim prefers one Home PR. No effect on the in-flight OI-0274 / OI-0273 PRs.

## 8. Acceptance / tests

- Opening delivery + two checks: hay eaten/day = Σ Al1 `storedDmiKg` ÷ measured days; pasture gap = Σ Al1 `pastureDmiKg` (same as the DMI-8 “Actual” bars; equals OI-0277 Pasture DMI for a one-group event on the same days).
- Per-day floor; hay over need reported as over target.
- Pure confinement: variance = DMI-6.
- No-hay grazing: 100% pasture text.
- One check only / unknown pool: Nc text; unknown days excluded and named.
- Window ends at the latest check (Wn).
- Per-class need (OI-0279); imperial and metric (OI-0278).

**Fix size:** S–M on top of S2. **D0.**
