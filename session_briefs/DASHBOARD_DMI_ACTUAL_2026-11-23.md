# OI-0280 — Home event cards: DMI target vs actual (hay eaten from feed checks)

**Date:** 2026-11-23 | **Owner:** GTHO Design | **Status:** **SPEC LOCKED / READY FOR BUILD** 2026-11-23 12:13 PM ET (Tim, via Orchestrator: card **t1382s5420** ~12:00 PM ET + card **t1387s5445** 12:13 PM ET; gap context **t1384u**; sequence **t1385u**). Docs only; no code, no SQL, no data change (**D0**). Builds after **OI-0281**. See §10 for the lock and card-label ↔ doc-label mapping.
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

## 5. Decisions as first offered (plain language; Design rec first) — later locks in §9–§10

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

## 7. Build order and placement (superseded by §9: OI-0281 first per Tim t1385u)

… → OI-0274 PR → OI-0273 PR → **OI-0279** → **OI-0277 + OI-0278-S2** → **OI-0280** → OI-0278-S3 → OI-0278-S4.

OI-0280 builds on the S2 branch: S2 rewrites the same card lines (`:1497–1499`, `:1623`) to the OI-0278 helper and OI-0277 reads the same need/Al1 math. Its own small PR keeps S2 reviewable. Folding it into S2 also works if Tim prefers one Home PR. No effect on the in-flight OI-0274 / OI-0273 PRs.

## 8. Acceptance / tests

- Opening delivery + two checks: hay eaten/day = Σ Al1 `storedDmiKg` ÷ measured days in the last-two-checks window; pasture gap = Σ Al1 `pastureDmiKg` on those days (same as the DMI-8 “Actual” bars; equals OI-0277 Pasture DMI for a one-group event on the same days).
- Per-day floor; hay over need reported as over target.
- Pure confinement (stored-only): variance = DMI-6; wording is “eating X under/over target”, never “pasture”.
- **One-check window (Ec1):** opening hay delivery (Al1 event-open anchor) → that check; the line shows (does not hide).
- **Two or more checks:** window is only the span between the last two checks (not the whole event, not 7 days).
- **Hide cases (remaining Nc0):** no feed check yet → line hidden, today's “DMI target (forecast)” line stays. Grazing with no stored feed (kind `none`) → same. A check missing its unit, leaving no measured days in the window → same. Unknown days among measured days are excluded, not counted.
- **Amber threshold (Dp3, stored-only events only):** `|hay eaten − target| / target > 10%` turns the line amber. Exactly 10% off is not amber (neutral). 10.1% (and greater) is amber, whether under or over. Grazing events, including mixed windows that have any grazing day, are never amber or red; pasture stays green.
- Mixed window: both phrases, each over its own days.
- After OI-0281 ships: grazing phrase adds “plan N% · saved ≈ X”.
- Per-class need (OI-0279); imperial and metric (OI-0278).

**Fix size:** S–M on top of S2. **D0.**

## 9. Partial lock and framing (t1382s5420 / t1384u / t1385u) — superseded in part by §10

**Locked (card t1382s5420, ~12:00 PM ET, via Orchestrator; card labels differ from §5 numbering):**
- **Ac1** — hay eaten per day from feed checks next to the target, gap labelled.
- **Window = only the time between the last two feed checks** (card “Wn2” = §5 **Wn3**), once there are ≥ 2 checks. The one-check case was still a Design reading here; confirmed as Ec1 in §10.
- **No data = hide the line** (card “Nc0” = §5 **Nc2**). When hidden, the card keeps today's “DMI target (forecast)” line so the target never disappears. §10 keeps this for no-check / no-hay-grazing / unit-less-check, and overrides it for the one-check case.
- **Display (Dp): was still open here**; locked Dp3 in §10.

**Tim's framing (t1384u, 12:03 PM ET, verbatim):** “When on 100% stored feed the gap tells us that our DMI numbers are off, when on stored feed and pasture the difference gets allocated to pasture not a forecast gap. …” and the stored-feed budget is “the missing piece” (t1385u, 12:04 PM ET: “Expected stored feed by month/day in the missing piece we need to finish and then integrate with this”). Budget = **OI-0281** ([brief](STORED_FEED_BUDGET_2026-11-23.md)).

**Context rule (Design, from Tim's framing; uses existing flags only, D0):** classify each counted event-day:
- **Stored-only day** — no open paddock window on the event that day can be grazed: every open window is a **confinement location** (`location.type === 'confinement'`, OI-0209, `calcs/location-type.js`) **or** flagged **100% Stored Feed** (`event_paddock_windows.no_pasture`, OI-0256 Lv1; `isGrazingPaddockWindow` false). Land use (`pasture` / `mixed_use` / `crop`, OI-0271) does **not** decide: an unflagged mixed-use or crop window is grazing.
- **Grazing day** — at least one open window on a non-confinement location without `no_pasture` (Mx1: a flagged window beside grazing windows still makes the day grazing; pasture comes from the other windows).
- **Wording:**
  - All counted days stored-only → the gap is a **DMI estimate miss**: hay eaten below target → “eating X under target (DMI estimate may be high)”; above → “eating X over target (DMI estimate may be low)”. Neutral colour; never “pasture”.
  - All grazing → the gap is **pasture ≈ X** (Σ per day `max(0, need − hay)`, Al1 `pastureDmiKg`), green. Days where hay ≥ need give pasture 0 for that day and the excess shows separately as “hay over need +Y” (never netted against pasture).
  - Mixed span (both kinds in the window, e.g. a move onto a `no_pasture` paddock) → both phrases, each over its own days: “pasture ≈ X · eating Y under target on stored-only days”.
  - Grazing with no stored feed on the event (kind `none`): nothing measured from checks → hidden per Nc (target line stays).
- After **OI-0281** ships, the grazing phrase gains the plan term: “plan 100% · saved ≈ X” (savings = planned stored − hay eaten on the same days).

**Dp — How it shows (re-asked; context wording is fixed by the rule above, so this is only layout):**
- **Dp1 (rec): One line in place of today's DMI line, wording by context.** Grazing: “Target 1,410 · hay eaten 1,020 lb DM/day (72%) · pasture ≈ 390” (pasture green). 100% stored: “Target 1,410 · hay eaten 1,300 lb DM/day (92%) · eating 110 under target”. With the plan later: “· plan 100% · saved ≈ 390”.
- Dp2: Dp1 plus a small bar of target vs hay eaten.
- Dp3: Dp1, and on 100%-stored events the line turns amber when eating is more than 10% off target (a nudge to check weights / DMI %). No red.

**Sq — When the event line ships (Tim t1385u sets the default):**
- **Sq1 (rec, Tim's direction):** finish the stored-feed plan (OI-0281) first, then build OI-0280 once, with the context wording and the plan term together.
- Sq2: ship OI-0280 now (after OI-0277 + 0278-S2) with the context wording, and add the plan term when OI-0281 lands. No rework of the math: OI-0280's per-event hay eaten / target / day-kind numbers are exactly the inputs OI-0281 sums; only the line's text changes later.

**Order (Sq1; corrected 2:32 PM ET for S1):** … → OI-0279 (live `e8bc570`) → **OI-0278-S1** → OI-0277 + OI-0278-S2 → **OI-0281** (migration apply = Tim yes + backup) → **OI-0280** → OI-0278-S3 → S4 → OI-0221 remaining slices.

## 10. Full lock (card t1387s5445, 12:13 PM ET, via Orchestrator) — card labels ↔ doc labels

Earlier 0280 picks still stand: **Ac1**, and the last-two-checks window (card “Wn2” = §5 **Wn3**) once there are ≥ 2 checks (t1382s5420). Context wording stays the §9 rule. Sequence stays **Sq1** (t1385u; S1 inserted per Design ruling 2026-11-23 2:32 PM ET): OI-0279 (live `e8bc570`) → **OI-0278-S1** → OI-0277 + OI-0278-S2 → **OI-0281** → **OI-0280** → OI-0278-S3 → S4 → rest of OI-0221.

**Locked on t1387s5445:**
- **Display — card “Dp3” = §9 Dp3:** one line replacing today's DMI line (same layout as Dp1: “Target 1,410 · hay eaten … · …” with wording by context). On **full-feed (stored-only) events** the line turns **amber when `|hay eaten − target| / target > 10%`**. Exactly 10% off is not amber. Grazing events never turn amber or red; pasture is green. Mixed windows (any grazing day in the span) follow the grazing colour rule: no amber/red on the line.
- **One check so far — card “Ec1”:** measure from the event's opening hay delivery (Al1 event-open anchor) to that check. This **overrides** the earlier hide rule (card “Nc0” = §5 **Nc2**) for that case, so the line shows after the first check.
- **Hide (remaining Nc0 / §5 Nc2 cases):** the line stays hidden only when there is no feed check yet, the event is grazing with no stored feed, or a check is missing its unit (no measured days in the window). In those cases today's “DMI target (forecast)” line stays.
- **After OI-0281 ships:** the grazing phrase adds “plan N% · saved ≈ X” (savings = planned stored − hay eaten on the same days).
