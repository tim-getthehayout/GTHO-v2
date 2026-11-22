# Rotation axis label + readiness anchor + Map escape (OI-0261 / OI-0262 / OI-0263)

**Status:** **PROPOSED** 2026-11-22 ~5:58 PM ET (America/New_York). Opened by GTHO Design from Tim feedback via Orchestrator: **t1265u** (5:52 PM ET), **t1266u** (5:53 PM ET), **t1267u** (5:54 PM ET, "Updated and it’s still the same issue"), **t1269u** (5:57 PM ET). Awaiting Tim lock cards. **No Build until locked.** No SQL / no migration / no data change for any of the three.
**Branch tip:** `docs/oi-axis-readiness` (parent `origin/main` `3dda55df2532e626f2521578705ba91fca5deade`, OI-0260 PR #145 live). Docs only — do not land until Tim land yes.
**Repro:** all three reproduce on live main `3dda55d`. No commit in `10dcc42..3dda55d` touched `src/features/events/rotation-calendar` or `src/styles` (Tim's report stamp `b2026-11-22.2137-10dcc42`).

Line numbers below are at `3dda55d`.

---

## OI-0261 — Rotation month tick label is ambiguous ("Dec 26" = December 2026)

### Tim (verbatim)
- **t1265u:** “December 26th label before December 5th?”
- **t1266u (tail):** “Here you can see December 26 before December 5th better”

### What happens
The header axis reads, left to right: **Nov 28 · Dec 26 (bold) · Dec 5 · …**. The bold tick is the **Dec 1 month-start tick**. Its label is month plus two-digit year, so on Dec 1 2026 it prints **“Dec 26”** (December ’26), which reads as “December 26th”. Saturday ticks print month + day (“Dec 5”). Later the real Saturday **Dec 26** also prints “Dec 26”, which makes it worse. Tick dates, tick x and block x are all correct; only the label text misleads.

### Root cause (file:line)
- `src/features/events/rotation-calendar/calendar-grid.js:772-801` `buildAxis` — `:787-789`: month ticks use `toLocaleDateString(undefined, { month: 'short', year: '2-digit' })`; Saturday ticks use `{ month: 'short', day: 'numeric' }`.
- `src/features/events/rotation-calendar/timeline.js:169-182` `enumerateTicks` (month = `getDate() === 1`, saturday = `getDay() === 6`) and `:158-161` `dateToPx` are correct. Ticks and blocks both use `parseTimelineDay` local midnight (`timeline.js:81-90`).

Scratch repro (TZ=America/New_York, week zoom, 40 px/day, canvas Nov 1 2026 → Jan 2 2027):

| Tick | Kind | Label | x px |
|---|---|---|---|
| 2026-11-28 | saturday | “Nov 28” | 1081.7 |
| 2026-12-01 | month | **“Dec 26”** | 1201.7 |
| 2026-12-05 | saturday | “Dec 5” | 1361.7 |
| 2026-12-26 | saturday | “Dec 26” | 2201.7 |
| 2027-01-01 | month | “Jan 27” | 2441.7 |

The J3-1 ready block (2026-12-03) lands at x 1281.7, between Dec 1 and Dec 5, which is correct. Ruled out: date/timezone mismatch between header and body, a tick-step bug, header-vs-body scroll desync (`bindHorizontalScrollSync`), and the block anchored to its end date.

**Introduced by:** OI-0254 **Tk1**, commit `da22c6d` (PR #135).

### Options (axis **Ml**)

| Code | Month-tick label | Note |
|---|---|---|
| **Ml1** (Design rec) | “Dec”; year only on January (“Jan 2027”) | Shortest; never looks like a day; year shows where it changes |
| **Ml2** | “Dec 1” | Same format as Saturday ticks; still a real date |
| **Ml3** | “Dec 2026” | Always unambiguous; widest label on phone |

### Acceptance
- A month label never looks like a day-of-month. A unit test pins the Dec 1 2026 month label (never “Dec 26”), and that a month label never ends in a 1–2 digit number unless that number is the tick’s own day (Ml2 only).
- Saturday labels unchanged. **No SQL.**
- **Out of scope:** after the Nov 1 DST change `dateToPx` (ms / 86 400 000) shifts everything by about 1/24 day (~1.7 px at week zoom). Ticks and blocks shift together, so this is cosmetic only.

**Fix size:** one line + one test (XS).

---

## OI-0262 — Readiness counted from close entry time, not the paddock close date

### Tim (verbatim)
- **t1266u:** “The rotation view is not using the recovery days properly for some reason. J2 as an example. 8/21 event closure, 30 to 60 day recovery window . So 10/21 should be where the readiness starts and it has it on December 3rd.”
- **t1267u:** “Updated and it’s still the same issue”

### What happens
J2’s last paddock window closed **2026-08-21**, with recovery 30–60 days. The Rotation calendar shows **Ready 2026-12-03 – 2027-01-02**. J3-1 (closed **2026-08-17**) shows the same Dec 3 – Jan 2. Both closes were entered on Nov 3, and readiness is counted from that **entry timestamp**.

### Root cause (file:line)
- `src/features/events/rotation-calendar/readiness.js:34-43` `pickRecoveryObservation` takes the location’s latest observation carrying recovery days, sorted by `observedAt`, with no link to the paddock window.
- `readiness.js:95-117`: survey mode feeds REC-1 `observedAt = String(obs.observedAt).slice(0, 10)` (`:101`), so the anchor is the observation timestamp, read as a UTC date.
- Close observations are stamped with the **save time**, not the close date: `close.js:316`, `move-wizard.js:934`, `submove.js:367/374`, `submove.js:519/555`, `edit-paddock-window.js:54` (`persistObservationCard`). All use `new Date().toISOString()`.
- `src/calcs/advanced.js:103-112` REC-1: `earliestReturn = observedAt + min`, `windowCloses = observedAt + max`.
- The band reaches the UI through `readiness.js:192-198` `readinessBandRange` → `calendar-grid.js:1056-1080` (band paint), `:354-357` (canvas right edge = last ready-by) and `:1132` (status label “Ready … – …”). The readiness call itself is at `calendar-grid.js:278-293`.
- **Contrast:** the dev audit REC-1 resolver already anchors correctly. `src/features/dev-mode/audit-resolvers.js:728-794` matches the close observation by `sourceId === pw.id`, falls back to farm defaults, and uses `observedAt = pw.dateClosed` (`:762`).
- **Secondary (same calc):** REC-1 `addDays` (`advanced.js:104-107`) mixes UTC parse (`new Date('YYYY-MM-DD')`), local `setDate` and `toISOString`. In America/New_York a window that crosses the spring DST change comes out one day early (2026-03-01 + 30 → `2026-03-30`, should be 03-31). Fall crossings are fine.

### Prod evidence (SELECT-only, project GTHO-v2, 2026-11-22 ~5:56 PM ET)

| Paddock | Last window `date_closed` | Close obs `observed_at` (UTC) | Recovery | Calendar shows |
|---|---|---|---|---|
| J2 | 2026-08-21 (pw `8fe66189…`) | 2026-11-03 18:48 | 30–60 | Ready 2026-12-03 – 2027-01-02 |
| J3-1 | 2026-08-17 (pw `5b55b2c8…`) | 2026-11-03 18:45 | 30–60 | Ready 2026-12-03 – 2027-01-02 |

Nov 3 + 30 = Dec 3 and Nov 3 + 60 = Jan 2, an exact match for both.

**Farm-wide** (event close observations joined to a closed window by `source_id`): **126** total; **88** have an observed date (ET) different from `date_closed`; **42** differ by more than 7 days; the largest gap is **85** days. **5** fall on a different calendar day in UTC than in ET (the `slice(0, 10)` risk).

### Expected vs actual (J2)
- **Spec (Bd1):** close + min → close + max = **2026-09-20 → 2026-10-20**.
- **Tim’s reading:** readiness *starts* 10/21, i.e. close + max (**Bd2**). 8/21 + 60 = 10/20.
- **Actual:** 2026-12-03 → 2027-01-02.

**Introduced by:** the `observedAt` anchor in `readiness.js` arrived with `9ce0e69` (“Combine locations and rotation management with synced scroll”, 2026-11-21). OI-0254 **Rd1** (`da22c6d`, PR #135) made it the visible per-paddock band and the canvas right edge.

### Options

**Ra — anchor**

| Code | Meaning |
|---|---|
| **Ra1** (Design rec) | Anchor on the **latest closed paddock window’s `date_closed`** for the location. Take min/max from the close observation whose `sourceId` is that window, else farm defaults (`default_recovery_min_days` / `_max_days`). Mirrors the REC-1 audit resolver. |
| **Ra0** (rejected) | Keep `observedAt`: wrong for every retroactive close (88/126). |

**Bd — band meaning**

| Code | Meaning |
|---|---|
| **Bd1** (Design rec) | Band runs **close + min → close + max**, per V2_DESIGN_SYSTEM §483 and REC-1 (V2_CALCULATION_SPEC §4.8). J2: **Sep 20 – Oct 20**. |
| **Bd2** | Readiness starts at **close + max** (Tim’s “10/21” reading). Needs a spec change to REC-1 / §483 and a stated band end. |

**Pb — bands already in the past**

| Code | Meaning |
|---|---|
| **Pb1** (Design rec) | Paint the band at its true past dates, and add a status label **“Ready since &lt;min date&gt;”**, switching to **“Past max recovery”** once today is past max (confidence `past_max`). |
| **Pb2** | Paint only, with no new label. |

**Always (not optional):**
- **Dz1:** a DST-safe local `addDays` in REC-1 (parse `T00:00:00` local, format with a local Y-M-D, no `toISOString`).
- When observation timestamps break ties, compare them by **local date**, not a UTC `slice(0, 10)`.
- Strip grazing: whole-paddock readiness still requires all strips past their min (REC-1 note).

### Tests
1. **Retroactive close:** observed 2026-11-03, window closed 2026-08-21, 30/60 → band **2026-09-20 – 2026-10-20** under Bd1.
2. **Spring DST:** closed 2026-03-01 + 30 → **2026-03-31**.
3. **UTC evening:** close observation at 2026-08-21T23:30-04:00 (UTC 08-22) does not move the anchor.
4. Window with no matching close observation → farm defaults.

### Scope
**No SQL, no migration, no data change.** Existing `observed_at` values stay as they are; the anchor moves to `date_closed`. The canvas right edge will pull in, because most bands end earlier.

**Fix size:** S. `computeReadiness` anchor + REC-1 `addDays` + the `Pb` label + about 4 tests.

---

## OI-0263 — Map: no way out on iPhone + move Map into a Locations tab

### Tim (verbatim)
- **t1269u** (5:57 PM ET, iPhone, live `3dda55d`): “Map needs to be a tab on the locations form. Right now it’s available from list and it launches in to a screen that there is no waynoutnof” [no way out of].

### What happens
The **Map** button on the Locations list does `navigate('#/map')` and opens the full farm-map route. On iPhone, and especially as a Home Screen PWA (standalone: no browser back button and no swipe-back), there is no visible way to leave.

### Root cause (code read; device confirmation still wanted)
1. **Launchers:** `src/features/events/rotation-calendar/calendar-grid.js:538-543` (Locations & Rotation **List** tools, `loc-mgmt-open-map`, added in `9e73e19`, OI-0246 list-parity **La+Ta**) and `src/features/locations/index.js:188` (Locations screen header, `locations-open-map`, added in `05ad2a9` “feat(map): open the farm map from locations and location pickers”, 2026-10-04). Both call `navigate('#/map')` (`src/ui/router.js:35-37`, `location.hash = …`).
2. **The map screen has no back or close:** `src/features/map/index.js:29-40` renders only an `h1` title, toolbar, hint and canvas. There is no Back or Close control. Map screen added in `a554f01` (2026-10-04); height fix `99e9d03`.
3. **No phone nav to or from it except the bottom nav:** `src/ui/header.js:73-83` `.header-nav` (which does include Map) is `display: none` below 900 px (`main.css:230-241`). The phone bottom nav (`header.js:530-560`) has no Map item, which is fine, but it is the **only** phone escape.
4. **Likely trap: Leaflet paints over the bottom nav.** The bottom nav is `position: fixed; z-index: 100` (`main.css:1937-1949`), and the app header is sticky at `z-index: 50` (`main.css:206-212`). `.farm-map-canvas` (`main.css:3895-3896`, `height: 70vh; min-height: 420px`) sets no `position`/`z-index`/`isolation`, so Leaflet’s panes (z 400) and controls (z 800–1000) join the **root** stacking context. Wherever the map overlaps the bottom nav, it paints on top. The map also swallows touch drags (pan) instead of scrolling the page. With header + title + toolbar + hint + a 70 vh canvas, the canvas reaches the bottom of an iPhone viewport, so the nav is covered or unreachable.
5. In standalone PWA mode there is no browser chrome to fall back on.

**Introduced by:** the map route `a554f01` / `05ad2a9` (2026-10-04, no back control, no stacking context); made more visible by OI-0246 `9e73e19` (2026-11-22), which added the Map launcher to the Locations & Rotation List.

### Where “the locations form” is: question for Tim (**Lf**)
The phrase is ambiguous in the code:
- **Lf-A** — **Locations screen** (`#/locations`, bottom-nav “Locations”). It already has a tab row, **Locations | Surveys** (`src/features/locations/index.js:75-81`). Map becomes a third tab.
- **Lf-B** — **Locations & Rotation** (`#/events`, bottom-nav “Locations & Rotation”). It has a **View: Calendar | List** toggle (`src/features/events/rotation-calendar/header-strip.js:27-48`). Map becomes a third view. Tim’s “available from list” matches the **List** view here (`calendar-grid.js:538-543`).
- **Lf-C** — the **single-location edit sheet** (`openLocationSheet`): a Map tab showing and drawing that one paddock’s perimeter.

Design does not guess; this goes on the lock card.

### Options

**Ex — escape (bug fix; ships regardless of placement)** — called “Mx” in the triage ask; named **Ex** here so it does not collide with OI-0256 **Mx1** / OI-0258 **Mx-a**.

| Code | Meaning |
|---|---|
| **Ex1** (Design rec) | Always-visible **Back/Close** in the map header that returns to where the user came from (stored origin hash; fall back to `#/locations` when history is empty, e.g. a cold PWA launch on `#/map`). History-safe routing: drawing/pin intents (`src/features/map/intent.js:14-24`) return to their origin. Give `.farm-map-canvas` its own stacking context (`position: relative; z-index: 0` or `isolation: isolate`) so Leaflet never paints over the bottom nav or header. Size the canvas to the viewport minus header and nav (`dvh` + safe-area). |

**Tb — placement**

| Code | Meaning |
|---|---|
| **Tb1** (Design rec) | Map becomes a **tab** next to the existing tabs on the screen Tim picks (Lf), and the list’s Map launchers are removed. |
| **Tb2** | Add the tab and keep the list launchers. |
| **Tb3** | Escape fix only (Ex1); no tab. |

**Design rec: Ex1 + Tb1, with Lf-A as Design’s lean.** Reasons: `#/locations` already has a real tab row (Locations | Surveys), so a Map tab is a small, consistent addition. A tab can never trap the user, because the tab row and the bottom nav stay on screen. Removing the two launchers avoids two doors into one place. The desktop sidebar Map item (`header.js:61`) and the picker / draw / pin intents stay. If Tim picks **Lf-B**, Tb1 is still the rec, as a third **View** next to Calendar | List.

### Acceptance
- On iPhone Safari **and** the Home Screen PWA, the map always shows a Back/Close control, and the bottom nav stays visible and tappable (not covered by Leaflet).
- Back returns to the screen that opened the map; on a cold launch it goes to `#/locations`.
- Under Tb1: Map shows as a tab on the chosen screen; the List launchers are gone; draw/pin flows still return to their caller.
- **No SQL.**

**Fix size:** Ex1 S (back control + stacking context + canvas sizing + a test). Tb1 adds S–M (tab wiring, map mount/unmount inside a tab, Leaflet `invalidateSize` on tab show).

---

## Lock card (proposed, for Orchestrator)
1. **OI-0261:** Ml1 / Ml2 / Ml3 (rec **Ml1**).
2. **OI-0262:** Ra1 (rec) · Bd1 / Bd2 (rec **Bd1**) · Pb1 / Pb2 (rec **Pb1**); Dz1 always.
3. **OI-0263:** Ex1 always (escape axis **Ex**) · Lf-A / Lf-B / Lf-C (Design lean **Lf-A**) · Tb1 / Tb2 / Tb3 (rec **Tb1**).
