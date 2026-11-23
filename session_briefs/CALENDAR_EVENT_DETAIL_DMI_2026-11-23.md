# Session Brief — OI-0283: Calendar Event Detail Sheet — Current-Event & Post-Graze Fix + DMI & Grazing Stats

**Status:** SPEC LOCKED / READY FOR BUILD
**Date:** 2026-11-23
**Locked by:** Tim Joseph (card `t1434s5641`, 6:36 PM ET, via Orchestrator): **"OI-0283 Scope A: this paddock window only, bundled with the Current event and post-graze fix"**
**Origin:** `t1430u` (4:49 PM ET, F-1..F-5 active event showing "Past event" header and prior-event post-graze observations) + `t1431u` (4:50 PM ET, "The DMI stats should also be listed on events when you click on them in the calendar")
**Schema / DB impact:** **D0** — no SQL, no migration, no data repair. Production v2 DB (`paddock_observations`, `events`, `event_paddock_windows`) was verified clean on 2026-11-23 (event `8ef44a4a-b066-4393-b966-84d20f343592` on F-1..F-5 has `date_out = null`, all 5 windows `date_closed = null`, 0 `close` observations; 0 of 344 `source = 'event'` observations in prod have null `source_id`).
**Build queue position:** **Next, ahead of OI-0281** (fixes a live display bug). Queue: `0279 (live)` → `0278-S1 (live)` → `0277+0278-S2 (merged ff44813)` → **OI-0283** → `OI-0281` → `OI-0280` → `OI-0278-S3` → `S4` → rest of `OI-0221` → `OI-0233` → `OI-0282 P1`.

---

## 1. Problem & Root Causes

1. **Wrong header on active events:** `calendar-grid.js` opens `openPastEventDetailSheet` for every bar (active and closed), and `src/features/events/rotation-calendar/past-event-detail-sheet.js:181` hardcodes `t('event.pastEventDetail')` (`"Past event"`) even though `model.isOpen` (`!(pw.dateClosed || event.dateOut)`) is already computed at line 77 and rendered as `"Active"` at line 194.
2. **Cross-event Post-Graze observation bleed:** `findPwObservation` (`past-event-detail-sheet.js:29–35`) matches `o.sourceId === pwId` and falls back to the newest `close` observation on that paddock from **any prior event**, and line 63 calls it even when `model.isOpen` is true. Clicking an active window (e.g. F-1..F-5 Sheep/Goats) therefore shows the prior Cow-Calf Herd's closing residual and recovery days.
3. **Latent same fallback in Edit Paddock Window:** `src/features/events/edit-paddock-window.js:31–37` (`findEventObservation`) has the same cross-event fallback; removing it is safe (0 null `source_id` event observations in prod).
4. **Missing DMI stats on calendar click-through:** `past-event-detail-sheet.js` currently renders zero DMI stats for both active and past events, even though `calendar-grid.js:1347` already computes `computePaddockWindowMetrics(pw, loc, event, span, metricCtx)` for every bar and drops the result in `onClickBlock`.

---

## 2. Locked Requirements (Scope A + Bug Fixes)

### A. Current-Event Header & Post-Graze Fix
1. **Header:** When `model.isOpen` is true, render `"Current event"` (i18n key e.g. `event.currentEventDetail`); when closed, keep `"Past event"` (`event.pastEventDetail`).
2. **Hide Post-Graze when open:** When `model.isOpen` is true, do not resolve or render the Closing / Post-Graze Observations section (`model.closing = null`).
3. **Strict observation matching:** In both `src/features/events/rotation-calendar/past-event-detail-sheet.js` (`findPwObservation`) and `src/features/events/edit-paddock-window.js` (`findEventObservation`), match strictly on `o.sourceId === pwId` (and observation type). Remove the cross-event fallback to other observations on the same paddock.

### B. DMI & Grazing Stats Section (Scope A — This Paddock Window Only)
1. **Where & when:** Add a **DMI & Grazing** section inside the calendar event detail sheet (`past-event-detail-sheet.js`) for **both current and past events**.
   - For active events (`model.isOpen`), compute through today and show a subtle `"through today"` cue so it is clear the numbers are running-to-date.
2. **Scope A (locked):** Scoped strictly to **the clicked paddock window only** — matching the bar the user clicked and the rest of the sheet (Location, Opened/Closed, Observations).
   - When the parent event has more than one paddock window (`eventPaddockWindows.length > 1`), show a one-line scope note such as `"This paddock only (1 of N paddocks)"` (with the existing `"Open Event"` button taking the user to the full event).
3. **Single source of truth (no new formulas):** Reuse `computePaddockWindowMetrics(pw, loc, event, span, metricCtx)` (`src/features/events/rotation-calendar/past-window.js`) — either passed from `calendar-grid.js` or computed with the same context helper so the sheet always matches the calendar bar and List metrics.
   - Honors all locked rules automatically: OI-0253 (unknown → `—`), OI-0256 (`noPasture` / stored-feed-only → `0% Pasture / 100% Feed`, Pasture DMI `0`), OI-0258 Al1 (pasture vs stored feed split), OI-0278 S1 (farm units via `formatMeasure` / `formatPerArea` from `src/utils/units.js`), and OI-0279 (per-class DMI % + `dmiBasisNote`).
4. **Fields to display (all already returned by `wm` / `wm.raw`):**
   - **Total DMI:** `pasture + stored feed` in farm weight unit (`lb DM` / `kg DM`; `—` when unknown).
   - **Pasture DMI:** value in farm weight unit + `pasturePct%`; plus **Pasture DMI / area** (`lb/ac` or `kg/ha`) when the paddock has area.
   - **Stored Feed DMI:** value in farm weight unit + `feedPct%` (or `0` / `100%` on stored-feed-only windows).
   - **AUDS** (and **AUDS / area** when paddock has area) + **Days** (window duration `span.days`).
   - **Indicators:** partial-unknown cue (`~` / note) when `raw.dmiPartial` is true; OI-0279 fallback basis note when `raw.dmiBasisNote` is present.

---

## 3. Out of Scope
- Whole-event DMI rollup inside the calendar click-through modal (Tim locked Scope A; whole-event view stays on `#events/<eventId>` via `"Open Event"`).
- Any SQL, migration, RLS, or data changes (**D0**).

---

## 4. Acceptance Criteria & Tests
1. Clicking an active calendar bar (e.g. F-1..F-5) shows `"Current event"` header, `"Active"` status, Opening Observations only (Post-Graze section hidden), and **DMI & Grazing** stats labeled `"through today"`.
2. Clicking a past calendar bar shows `"Past event"` header, Opening + Closing Observations strictly matching `o.sourceId === pwId` (never bleeding observations from a different event), and **DMI & Grazing** stats for that paddock window.
3. Multi-paddock event shows the one-line `"This paddock only (1 of N paddocks)"` note; single-paddock event omits it.
4. Stored-feed-only (`noPasture`) window shows `0% Pasture / 100% Feed`; unknown DMI shows `—` (no fake `0`); partial-unknown shows partial cue; `dmiBasisNote` renders when present; all weights and per-area values respect farm units (`imperial` / `metric`) via `src/utils/units.js`.
5. `edit-paddock-window.js` `findEventObservation` strictly matches `o.sourceId === pwId` with no cross-event fallback.
6. Unit tests cover active vs past header, Post-Graze hidden when open, strict `sourceId` matching in both files (regression test with a prior event's closing obs on the same paddock), DMI stats rendering (active, past, multi-paddock note, stored-feed-only, unknown, imperial + metric units).
