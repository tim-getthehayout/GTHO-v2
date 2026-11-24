# Calendar header overlap (OI-0284) + hay-unknown partial rule (OI-0285) — 2026-11-24

Base: main `364e21d` (OI-0283 live, stamp `b2026-11-24.1039-364e21d`). Both D0: no SQL, no migration, no RLS.
Queue: **OI-0284 → OI-0285**, then the existing order (0281 → 0280 → 0278-S3 → S4 → rest of 0221 → OI-0233 → 0282 P1).
Separate PRs (0284 is CSS-only; 0285 is calc).

---

## OI-0284 — Rotation calendar sticky header covers a row's metric labels

**Source:** Tim t1439u (Nov 23): "the title bar in teh calendar is cutting off the metrics description". Screenshot
`/workspace/shared/gtho-calendar-header-t1439u.png` (box): calendar scrolled; the top visible row is the tail of the
paddock above D ("Estimated ready Nov 24" + a 0.0 metrics row) and its N/P/K/Score labels sit directly under the
Nov 7/14/21/28 date header.

**Decision status:** display-only, Design-owned (Orchestrator OK, no Tim decision).

**Layout facts (OI-0266):** single scroll owner `.loc-mgmt__body`; head `.loc-mgmt__head` sticky `top:0`, z-index 10;
row `.loc-mgmt__name-wrap` / `.loc-mgmt__metrics` sticky-left z-index 5; `.timeline-axis` 40px.

**Step 1 (required): confirm in devtools** which case it is, at desktop and phone widths:
- **Case S (scrolled, expected):** at `scrollTop = 0` every row's labels are fully visible; clipping only appears
  when a row stops part-way under the sticky head.
- **Case Z (bug at rest):** labels of the first row are covered even at `scrollTop = 0` (head overlays content
  instead of pushing it down).

**Fix:**
- **Case S:** make rows come to rest fully below the head. On `.loc-mgmt__body`: `scroll-padding-top` equal to the
  head's rendered height (use a CSS custom property set from the head, e.g. `--loc-mgmt-head-h`, not a magic number)
  and `scroll-snap-type: y proximity`; on each row wrapper `scroll-snap-align: start`. Proximity, not mandatory, so
  free scrolling and the OI-0266 single-owner behaviour are unchanged. Keyboard / programmatic `scrollIntoView` of a
  row must also land below the head.
- **Case Z:** the head must take space in flow (no absolute overlay); add top padding to the body or set the head's
  min-height so the first row starts below it.
- Either way: no z-index changes to row sticky-left cells; head stays above rows.

**Acceptance:**
1. At rest (`scrollTop 0`) no row label is covered, desktop and phone.
2. After a wheel/trackpad scroll settles, the top row's metric labels (DMI, DMI/ac, AUDS, N/P/K, Score) are fully
   visible below the date header (Case S).
3. Horizontal scroll, sticky-left name/metrics columns, and OI-0266 scroll ownership unchanged; no jitter.
4. Before/after screenshots (desktop + phone) in the PR.
5. CSS-only diff (`src/styles/main.css`, plus a one-line head-height var setter only if needed). No calc changes.

---

## OI-0285 — Hay unknowns use the OI-0249 partial rule (no more season-wide blank)

**Source:** Tim t1444u (Nov 24, 5:36 AM ET): "all teh J and k paddocks have no dmi or dmi per acre data showing in
teh calendar". Decision: Tim t1448u (5:40 AM ET, card for OI-0285 via Orchestrator): "we already wnet through this as
determined that in not a good rule? And i thjought we fixed that?" — read as **option A**: apply the OI-0249 partial
rule to hay unknowns. **This brings F1 (OI-0246 / OI-0258) in line with OI-0249.**

**Diagnosis (prod, SELECT-only):** J/K data is complete (acreage, forage type, windows, weights). Event `d4a043d8`
opened Nov 23 on J2, J3-1..5, K-1..5 with one bale delivered 15:46 and no feed check. F1 treats hay on an open event
(and any unmeasured hay span) as unknown, and `location-metrics.js` makes that unknown season-sticky
(`dmiHayUnknown` → `finalDmi = null`), so the whole season's DMI and DMI/ac show `—`.

**Why OI-0249 didn't already cover it:** OI-0249 (Zp+Gg) was scoped to missing animal weights. The F1 hay
season-sticky rule was a separate earlier lock (OI-0246 F1, kept by OI-0258 "open events with no close stay unknown")
and the OI-0249 build kept it as written. Hay was never re-asked.

**Rule (A, Zp applied to hay):**
- A day whose hay is unknown (`f1MeasuredHayOnEventDay` → `unknown`) at this location adds **nothing** to `dmiKg`,
  `storedFeedDmiKg`, or `dmiDays` for that location/day. It does not blank the season.
- If the location has at least one known DMI day (or known slice) in range: `dmiKg` = known sum, `dmiPartial = true`.
- `dmiKg = null` (`—`) only when nothing known remains in range (every DMI day for the location is hay-unknown or
  weight-unknown) — same as Zp.
- `dmiPerHa` follows `dmiKg` (known sum / ha, partial).
- Weight unknowns (OI-0249) and hay unknowns combine: partial if any unknown and any known.
- **Note text:** reuse the OI-0249 partial marker (`~` + existing partial hover/tooltip). Extend the hover/basis
  note with a hay reason when hay caused it, e.g. "Hay on an open or unchecked event isn't counted until a feed check
  or close reading." New i18n key; no new visual marker.
- Applies to: Rotation calendar rows + List parity (`computeLocationMetrics`), per-window
  `computePaddockWindowMetrics` (OI-0283 detail sheet shows its existing partial note), sort by DMI/DMI/ac
  (partial values sort as their known number). Past-block paint (OI-0253): an individual block whose hay is unknown
  still shows its own unknown state; only the season column stops being sticky.
- Out of scope: Sz strip (already uses stored 0 on unknown days), OI-0280 Home run rate, F1 allocation math itself
  (OI-0258 Al1/Mc1/Cv1 unchanged), AUDs, NPK, Score.
- Retire the comment "F1 hay unknown stays season-sticky (OI-0246 lock)" and replace with an OI-0285 reference.

**Tests (minimum):**
1. Season with known closed events + one open event with unchecked hay: season DMI = known sum, `dmiPartial` true,
   `dmiPerHa` non-null.
2. Location whose only DMI days are hay-unknown: `dmiKg` null (`—`).
3. Weight-unknown + hay-unknown mix with known days: partial known sum.
4. Closed event with an unmeasured hay span (not just open events): same partial behaviour.
5. Regression: fully known season unchanged numerically vs main.
6. Per-window metrics for the open window: unknown/partial per the rule; OI-0283 sheet shows partial note.

**Acceptance on prod data:** J2, J3-1..5, K-1..5 show a season DMI and DMI/ac with the partial marker while event
`d4a043d8` is open; J1-1/J1-2 show full values (if J1 is blank on main, Build reports why in the PR).
