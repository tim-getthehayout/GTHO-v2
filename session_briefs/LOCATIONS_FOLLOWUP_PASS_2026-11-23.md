# Locations follow-up pass (OI-0269 … OI-0276)

**Status (America/New_York, 2026-11-23):**

| OI | Item | Status |
|---|---|---|
| OI-0269 | Events subscription leak (hotfix) | **READY FOR BUILD** — bug fix, no lock needed |
| OI-0270 | Voice `OFFLINE_TEXT` copy | **READY FOR BUILD** — copy fix |
| OI-0271 | `mixed_use` vs `mixed-use` spelling | **READY FOR BUILD** — consistency fix |
| OI-0272 | Timeline horizontal slider | **DEFERRED — not built** (Tim, card **t1349s5273**, 7:25 AM ET: #158 “Much better!”; slider dropped for now) |
| OI-0273 | Conditional “Ready” / “Ready (est.)” tag by the pasture name | **SPEC LOCKED / READY FOR BUILD** — **Rg0+Ro0+Rp1**; **re-locked** Tim **t1375u** 10:34 AM ET (“Ready (est.)”; “Ready?” retired) |
| OI-0274 | DMI per acre as its own sortable metric | **SPEC LOCKED / READY FOR BUILD** — **Dl1+Do0+Ds1+Dp1+Dm1+Dc1** (card **t1348s5263**, 7:24 AM ET) |
| OI-0275 | List view metrics parity | **SPEC LOCKED / READY FOR BUILD** — **Lc0** (card **t1348s5263**, 7:24 AM ET) |
| OI-0276 | NPK must not blank when leftover hay has no NPK % | **SPEC LOCKED / READY FOR BUILD** — amends OI-0246 **R1** (Tim **t1347u**) |

**Sources (Tim, via Orchestrator, 2026-11-23):** t1328u (7:05 AM, slider), t1331u (Ready tag), t1332u (DMI per acre), t1333u (list complete, 7:09 AM), t1334u (7:10 AM, List parity), t1337s5223 (0273 lock), t1341u (“Ready?” for no-estimate), t1344u (7:16 AM, E3/F3 no NPK), t1347u (0276 lock), t1348s5263 (7:24 AM, 0274 + 0275 locks), t1349s5273 (7:25 AM, slider dropped), t1375u (10:34 AM, 0273 re-lock “Ready (est.)”). OI-0269 / 0270 / 0271 come from Design and Build review notes on PRs #158, #157 and #154.

**Branch tip:** `docs/oi-0269-0276-followups` on `origin/main` `dbce180483cea9c3484a8e3c0473c3c702b35a2d` (#158 / OI-0266 live; stamp `b2026-11-23.1219-dbce180`). Docs only — lands through Orchestrator + Homelab Git Bridge after Tim’s land yes.
**D0 for every item: no SQL / no migration / no RLS change / no data write.**

Line numbers are at `dbce180`. Code read only.

---

## Build order

1. **OI-0269** (hotfix)
2. **OI-0276**
3. **OI-0270**
4. **OI-0271**
5. **OI-0274** + **OI-0275** (one PR is fine), then **OI-0273**

OI-0272 is **DEFERRED** and is not in the build order.

Each item may ship as its own small PR; 0270 and 0271 may share one. Every PR runs the usual gates (`node scripts/run-vitest.mjs run`, `npx eslint src/`, baseline 0 errors / 54 warnings).

---

## OI-0269 — Events subscription leak (hotfix)

**Bug:** after visiting Events (Locations & Rotation), an events-store change made on another screen redraws the Events screen over that screen. Triggers: a Dashboard move or close, Field mode actions, or a sync pull that brings event changes.

**Cause (`src/features/events/index.js`):**
- `renderEventsScreen` releases the previous subscriptions only at its own next render (`unsubs.forEach(fn => fn())` at `:84`).
- `:178` `unsubs.push(subscribe('events', () => { renderEventsScreen(container); }))` has no `isConnected` guard. When the router has swapped in another screen, the callback still runs and repaints Events into the shared app container.
- `:186` the OI-0265 `rerenderList` subscriptions (`LIST_RERENDER_KEYS`) have the same shape (no guard; they render into a detached `calendarContainer`).
- `subscribe()` already returns an unsubscribe (`src/data/store.js:504–509`). Dashboard has the guard pattern (`src/features/dashboard/index.js:120` `if (!screenEl.isConnected) return;`).
- The OI-0266 `leaveListener` (`:174`, hashchange) already detects leaving the screen for the calendar observers.

**Fix intent:**
- The `events` callback and `rerenderList` no-op when the Events screen element is no longer connected, and release all of Events’ `unsubs` at that point.
- Optional, recommended: also release `unsubs` from the existing hashchange `leaveListener` when `!screenEl.isConnected`.
- No change to `store.js` notify semantics.

**Acceptance:** visit Events, go to Dashboard, move or close an event — Dashboard stays on screen (no Events repaint). Same from Field mode and after a sync pull. On Events itself, an events-store change still re-renders Events.

**Tests:** unit test for the guard: mount Events, detach / replace its screen element, fire an `events` notify → `renderEventsScreen` is not re-entered and the subscription is released; while connected, a notify still re-renders.

**Size:** XS.

---

## OI-0270 — Voice `OFFLINE_TEXT` copy

`src/features/assistant/client/panel.js:15` `OFFLINE_TEXT` = “You are offline. Tap the push-to-talk to record a voice note, or use the normal screens.” Used at `:155`, `:203`, `:229`, `:327`. Push-to-talk is hidden since OI-0268 (`wiring.js:47` `PUSH_TO_TALK_ENABLED = false`), so the copy points at a control that is not there.

**Fix:** offline copy that does not mention push-to-talk or voice notes. Wording is Build’s call — plain and short (for example, that the assistant needs a connection and the normal screens still work offline). Update any test that pins the old string.

**Size:** XS.

---

## OI-0271 — `mixed_use` vs `mixed-use` spelling

Raised by Build during the OI-0265 review.

**Canonical value: `mixed_use`** (verified from code and schema docs, not prod):
- `supabase/migrations/002_d2_locations.sql:54` `CHECK (land_use IN ('pasture', 'mixed_use', 'crop') OR land_use IS NULL)` — the only migration that defines `land_use`.
- `V2_SCHEMA_DESIGN.md` §2 locations (`:331`, `:354`).
- `src/entities/location.js:25` `VALID_LAND_USES = ['pasture', 'mixed_use', 'crop']`; `validate` (`:47`) rejects anything else.
- `src/features/events/index.js:906` badge map keys `mixed_use`.

**Sites using `mixed-use` as a value (to change to `mixed_use`):**
- `src/features/locations/index.js:451` the location form `<option value="mixed-use">` — saving “Mixed-use” fails the entity validator, and an existing `mixed_use` location does not preselect.
- `src/features/locations/index.js:195`, `:250` filter, `:304` badge class, `:883` filter pills.
- `src/features/events/rotation-calendar/location-metrics.js:80` X1 `isPastureOrMixed` — a stored `mixed_use` location is dropped from Rotation / List metrics today.
- `src/features/events/rotation-calendar/calendar-grid.js:256` List filter and `:738` `pill('Mixed-Use', 'mixed-use')`.
- `src/features/harvest/index.js:177`, `:193`, `:236`.

Display labels (“Mixed-Use”, “Mixed-use”, i18n `location.landUse.mixedUse`) are unchanged — only compared / written values move. The List filter value is in memory only (`calendar-grid.js:68`), so there is no persisted `mixed-use` state to migrate.

**No data rewrite.** The CHECK constraint means stored rows can only be `mixed_use`. If Build finds stored values that disagree anyway, stop and raise it as a separate gated item (backup + Tim’s yes).

**Tests:** a `mixed_use` location appears in Rotation / List metrics and Harvest; the location form saves and preselects Mixed-use; filters match it.

**Size:** S.

---

## OI-0272 — Timeline horizontal slider — **DEFERRED (not built)**

**Status:** **DEFERRED** 2026-11-23 7:25 AM ET (Tim, via Orchestrator, card **t1349s5273**). Tim tried #158 live: “Much better!” The OI-0266 single scroller (#158, `dbce180`) resolved the jumpiness he reported in t1328u (he was on `d07bb1f`, before #158). He dropped the slider for now. Build does nothing. Kept below for reference if he asks again.

**Proposal (for reference):** a thin slider strip at the top (under the sticky date row) and at the bottom of the timeline, both driving the one OI-0266 horizontal scroller.
- Two-way sync: dragging scrolls; swipe, trackpad or wheel moves the thumbs. `requestAnimationFrame`-throttled, with a feedback-loop guard.
- Thumb width = visible fraction. Tapping the track pages one viewport.
- Hidden when everything fits; re-measures via the existing calendar `ResizeObserver` (`calendar-grid.js` ~494–511).
- iPhone: visually thin, ≥44px touch target, pointer events, `touch-action` so it does not scroll the page; native swipe still works.
- Keyboard: accessible slider (`role="slider"`); arrow keys step.
- Scroll position not persisted.

**Options (not locked):** **Sp1** top+bottom (rec) / Sp2 bottom only / Sp3 top only. **St1** plain bar (rec) / St2 bar + date label while dragging. **Sx0** no extra buttons (rec) / Sx1 Today button / Sx2 Today + arrows. **Sd1** phone+Mac (rec) / Sd2 Mac and wide only. Design rec was **Sp1+St1+Sx0+Sd1**.

---

## OI-0273 — Conditional “Ready” / “Ready (est.)” tag by the pasture name

**Locked:** **Rg0+Ro0+Rp1** (card **t1337s5223**) + Design rule (t1341u; Orchestrator agreed). **Re-locked 2026-11-23 10:34 AM ET** by Tim **t1375u** (verbatim: “Let’s say ‘Ready (est.)’”): farm-default / no-estimate pastures read “Ready (est.)”; “Ready?” is retired into it (Design call; Tim may override).

**Where:** a small chip just right of the pasture name in the left name column (`calendar-grid.js` row `nameCell` ~1100). That cell is shared by Calendar and List (`isList` only changes the name button / badges), so the chip shows on **both**. The existing status line (`statusTag` ~1384) is unchanged.

**Why:** some ready pastures’ painted ready bar is outside the visible timeline window.

**Logic:** reuse `computeReadiness` (`src/features/events/rotation-calendar/readiness.js` ~238) and the Sv2 latest-wins anchor (`selectReadinessAnchor` ~180, `closeRecoveryAnchor` ~102). `computeReadiness` modes are `active` / `never` / `survey` / `relative`; mode `'survey'` covers **every** pasture with at least one closed paddock window, whether the anchor is a later survey (`dateSource 'survey'`) or the close itself (`dateSource 'close'`, min/max from the close obs recovery days **or** the farm defaults 21/35). Any later graze restarts the clock.
- **“Ready”**: the **winning anchor** is a survey, or a close observation that **supplied recovery days**, **and** today ≥ `earliestReturn` **and** not active or linked. Strip paddocks keep the existing rule (`readiness.js` ~288–296: whole paddock ready only when every strip is past its min).
- **Ro0**: past `windowCloses` (`past_max`) still shows plain “Ready”.
- **“Ready (est.)”**: any other grazed pasture, not active or linked, with `daysSinceLastGraze` ≥ the farm’s `defaultRecoveryMinDays` (21 today). This covers (1) a close anchor whose min/max fell back to the farm defaults and (2) `mode === 'relative'` (grazed, no closed paddock window).
- **“Ready?”**: retired, folded into “Ready (est.)”.
- **Survey on or before the close**: Sv2 applies, the close wins; the close’s own recovery days then decide “Ready” vs “Ready (est.)”.
- **Rg0**: never-grazed pastures get no chip and keep “Never grazed”.
- Active pastures (and linked / strip-active) get no chip.
- **Rp1**: shown on phone too.
- **Implementation:** `closeRecoveryAnchor` returns a read-only flag saying whether the close obs supplied the recovery days (vs farm defaults); the chip helper reads it. No DB change (**D0**).

**Why re-locked:** the first text keyed “Ready” off `mode === 'survey'` and “Ready?” off `mode === 'relative'`. Because mode `'survey'` includes farm-default close estimates (the common case on Tim’s farm), default-only pastures would read plain “Ready” and “Ready?” would almost never appear. Build caught this pre-PR at `5f20f1a` (`fix/oi-0273-ready-chip`).

**Tests:** later survey before / on / after `earliestReturn` → none / “Ready”; close obs **with** recovery days before / on / after `earliestReturn` → none / “Ready”; close with farm-default days at 20 / 21 / 22 days since graze → none / “Ready (est.)”; relative mode under / at / over 21d → none / “Ready (est.)”; survey on / before close day → close wins; past_max → “Ready”; strip paddock with one strip under min → no chip; never → no chip; active / linked → no chip; no “Ready?” text anywhere; List and Calendar both render it.

**Size:** S.

---

## OI-0274 — DMI per acre as its own sortable metric

**Locked:** **Dl1+Do0+Ds1+Dp1+Dm1+Dc1** (card **t1348s5263**, 7:24 AM ET). Design rec matched.

**Today:** `calendar-grid.js` `renderMetricCol` (~121–133) appends “ (x.x/ac)” to each metric’s total; `renderMetricsCell` (~160–161) hides per-acre on phone (`includePerAcre = !isPhone`). `sort-rows.js` `SORT_KEYS` (~7–20) already has `dmiPerAcre`, but no header button exposes it (`sortHeaderButton` ~998 is wired for `METRIC_COLS` ~71–78). `nextSortState` (~57–62) defaults non-name keys to `desc`. Sort state is `state.sortKey` / `state.sortDir` (`calendar-state.js` ~20–21, URL ~169–170 / ~210–230).

**Locked behavior:**
- **Dl1**: a separate metric labelled **“DMI/ac”**, on metrics line 1, just right of total DMI (DMI · DMI/ac · AUDs). No parentheses. Its own sort button (`sort-dmiPerAcre`).
- **Do0**: only DMI changes. AUDs, N, P, K keep their current “(x/ac)” suffix rules.
- **Ds1**: first tap on DMI/ac sorts **lowest first** (asc); second tap flips. Other keys keep their current first-tap direction.
- No acreage (or unknown DMI) shows “—” and **always sorts last** for DMI/ac, in both directions.
- **Dp1**: DMI/ac shows on phone too (the phone per-acre hide stays for the other metrics, per Do0).
- **Dm1**: remember the sort per device in `localStorage`, following OI-0246 **Pb** / OI-0267 **Pd1** (suggested key `gtho_v2_locations_sort`, `{ key, dir }`). An explicit URL `sortKey`/`sortDir` wins when present; otherwise restore the stored value; unset / invalid / throwing `localStorage` → `name` asc.
- **Dc1**: the sort applies while metrics are collapsed, and a small note by the collapsed tab shows it (e.g. “Sorted by DMI/ac, low first”). Default `name` sort shows no note.
- OI-0252 **Wu** uniform width measures the new metric.

**Why:** low DMI/ac pastures are winter bale-grazing targets.

**Tests:** DMI/ac renders without parentheses on desktop and phone; first tap asc; no-acre rows last both ways; sort persists across remount; URL override; collapsed note; other metrics unchanged.

**Size:** S–M.

---

## OI-0275 — List view metrics parity

**Locked:** **Lc0** (card **t1348s5263**, 7:24 AM ET).

**Finding:** List and Calendar already share `renderMetricsCell` (`calendar-grid.js` ~160) — same labels, values and stacking (OI-0252). The only gap is the collapse tab: `metricsCollapsed = !isList && …` (~405); OI-0267 Pd1 is Calendar-only.

**Rule:** every timeline metrics change, including OI-0274 (DMI/ac label, sort, Dm1 persistence), also applies to List. OI-0273’s chip also shows on List (shared name cell).
**Lc0:** List stays always expanded (no collapse tab). The OI-0274 Dc1 note is Calendar-only (List is never collapsed).

**Tests:** List renders DMI/ac and its sort button identically to Calendar; sort choice carries between Calendar and List.

**Size:** XS (rides on OI-0274).

---

## OI-0276 — NPK must not blank when leftover hay has no NPK %

**Locked** (Tim **t1344u** report; **t1347u** lock, verbatim): “that would be no NPK from hay, but if there were animals there that is the main source of NPK anyway and should always be counted.” Amends OI-0246 **R1**.

**Root cause** (SELECT-only prod checks, 2026-11-23): `src/features/events/rotation-calendar/location-metrics.js` `residualFeedNpkForLocation` (~311) returns `{ known: false }` (null N/P/K, ~373) when a positive close-reading residual is missing weight / DM (~351) or its feed type / batch has no N/P/K % (~363). The caller sets `npkResidualUnknown = true` (~719, season-sticky), and `npkKnown` (~754) then nulls the whole NPK (`nKg`/`pKg`/`kKg`, per-acre), including manure / excretion (**Kc**) NPK.
- Prod: all 3 feed types (Alfalfa, Round bale- Grass, Round Bale- Peanut) have null `n_pct`/`p_pct`/`k_pct`; no batch nutrition profiles.
- Pastures with positive close residuals: **E-3** (2026-04-21 0.5; 2026-11-16 2), **F-3** (2026-05-06 0.5), **G-2** (2026-11-02 1), **J1-1** (2026-10-21 0.3), **J1-2** (2026-10-21 0.3 and 0.08). Whether each blanks depends on the selected period.

**Locked behavior:**
- Manure / excretion NPK always counts and shows.
- Residual hay without N/P/K % contributes 0 and never blanks the pasture.
- Residual hay with known % still adds as today.
- Residual missing weight or DM: same — contributes 0, no blanking.
- `residualFeedNpkForLocation` no longer drives `npkKnown`; `npkResidualUnknown` stickiness is retired for NPK.
- **Marker:** a subtle hover / `title` note only, e.g. “Leftover hay not counted — feed type has no NPK %”. Do **not** use the “partial” word or marker (Tim frames hay NPK as minor). The existing missing-animal-weight partial logic (OI-0249) is unchanged.
- Period totals strip (OI-0250) follows the same rule.

**Data note:** Tim may enter N/P/K % on his feed types in the app himself; that is a normal user edit, not a Design or Build write.

**Tests:** residual with null % → manure NPK shown, hay adds 0, hover note present, no “partial”; residual with known % → adds as today; missing weight/DM residual → adds 0; missing animal weight still partial.

**Size:** S.

---

## OPEN_ITEMS changes

- Add rows + sections OI-0269 … OI-0276 (statuses above).
- OI-0246 **R1** amended by OI-0276 (residual unknown no longer blanks NPK).
- OI-0272 recorded **DEFERRED** (not built).
