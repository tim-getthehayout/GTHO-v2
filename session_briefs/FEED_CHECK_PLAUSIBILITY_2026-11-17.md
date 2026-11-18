# OI-0227 — Feed-check plausibility: intake warning, Notes below Remaining, elapsed-time spreading

**Date:** 2026-11-17 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **APPROVED (Tim, 2026-11-17 12:23 PM ET, via Orchestrator):** B (non-blocking implausible-intake warning; Design picks the threshold), C (Notes below Remaining), D (spread intake between checks by elapsed time, not calendar-day count). **A declined** (Remaining keeps its pre-fill). Docs only; no code, no SQL, no data change in this commit.
**Implemented (2026-11-18):** PR 1 (B + C) merged as [#77](https://git.sarnford.com/Homelab/GTHO-v2/pulls/77) at `321fab28`; PR 2 (D) merged as [#79](https://git.sarnford.com/Homelab/GTHO-v2/pulls/79) at `718ad0dc`, published `b2026-11-18.1224-718ad0d`. B is registered as **FED-7** and D is DMI-5 (V2_CALCULATION_SPEC §4.6 and §4.2). Acceptance 9 and the time-less DST exception were amended by Design on 2026-11-18 (§3.3, §4); no product decision changed.
**Base:** Forgejo `main` `9a5801d7` (PR #72 merge; OI-0226 docs `0a73e547` already on it). Every file:line below was read on `9a5801d7`. Diagnosis was SELECT-only on prod.
**Related:** OI-0224 (FED-6 run rate; reuses `poolDailyObservation`), OI-0225 (DMI-9), OI-0209 (pure-confinement deficit), OI-0119 (DMI-8 chart context), OI-0189 (local today).

## 1. Background

### 1.1 What Tim saw (12:08 PM ET, via Orchestrator)
> "The corral event is showing a feed deficit in the daily bars on 11/15 when I added more than enough hay on the 13th. Then enough stored forage yesterday (up from a Deficit) when I did not add any in between."

Small corral event `c53fc6a7` (pure confinement, Corral `26316d12`), 22 head in three groups, demand **145.5 lb DM/day** (66.0 kg; 2.5% BW, constant since Nov 9). One round bale of grass hay = 272.16 kg × 90% DM = **540.0 lb DM**.

### 1.2 Cause (full write-up: Design diagnosis CORRAL-BARS.md, 2026-11-17)
Feed check `15f81210` (Nov 16 09:12) saved **2.25 bales remaining**, which is exactly the form's pre-filled expected amount; ".75" went into Notes. That reads as zero hay eaten Nov 13 17:02 → Nov 16 09:12 (deficit 145.5 lb on Nov 13, 14, 15), and the next check (Nov 17 12:04, 0.66) put 1.59 bales (858.6 lb) on the single day Nov 16. The calc did what the data said. Three design gaps made one slip look like a hard flip:

1. **Pre-fill + no plausibility check.** `src/features/feed/pool-forms.js:24` pre-fills Remaining with `value: pool.q` (expected); saving it untouched records "nothing eaten". Nothing warns. `unchangedPoolCheck` / `commitPoolCheck` (`pool-ledger.js:65-71`) only skip unchanged *edits*; `poolReading` (`feed-pools.js:55`) correctly allows remaining == available.
2. **Notes sits above Remaining.** `pool-forms.js:19-20` creates and appends Notes before the pool cards (`:23-26`), so a number typed "into the box" can land in Notes.
3. **Calendar-day spreading.** `poolDailyObservation` (`src/calcs/feed-pools.js:113-124`) divides an interval's intake by the calendar-date difference (`:123`) and gives that flat rate to every date from the earlier check's date up to (not including) the later check's date. The older non-pool path does the same (`src/calcs/feed-forage.js:820`). Nov 13 17:02 → Nov 16 09:12 (2.67 elapsed days) is divided by 3; the 26.9 h to Nov 17 12:04 lands wholly on Nov 16.

Chart path (unchanged by this item): `src/features/events/detail.js:412-435` → `computeDmi8Days` → `dmi-chart-context.js:141-144` (today−2 .. today) → DMI-8 (`feed-forage.js:547`); pool mode at `:725`; bracketed pool bars `:835-844`, deficit at `:841` (pure confinement: `max(0, total − stored)`). Demand is `groupWindowsDailyDmiKg` (`window-helpers.js:271`) via `feed-forage.js:589-590`.

### 1.3 Data
Tim corrects the Nov 16 check himself in the app (0.75 bales left; Orchestrator suggested also clearing the ".75" note). **No prod write; nothing in this item touches data.** Until D ships, the corrected data will show a Nov 16 deficit under today's calendar-day split (see §5.2) — expected, not a new bug.

## 2. Decisions (Tim, 2026-11-17 12:23 PM ET, via Orchestrator)
| | Decision |
|---|---|
| A | **Declined.** Remaining keeps its pre-fill of the expected amount (`pool-forms.js:24` unchanged). B's floor is the guard for an untouched pre-fill. |
| B | **Approved.** Non-blocking implausible-intake warning; Design sets the threshold (§3.1). |
| C | **Approved.** Notes renders below Remaining (§3.2). |
| D | **Approved.** Spread intake between checks by elapsed time (§3.3). |

## 3. Spec

### 3.1 (B) Implausible-intake warning (non-blocking)

**Implied rate for an interval** between two consecutive readings of the same pool (prev → new):
`impliedDmPerDay = (prevRemainingDm + Σ stored DM fed into the pool in (prev, new] − newRemainingDm) / elapsedDays`
— the same interval and delivery window as `poolDailyObservation` (`feed-pools.js:120`, strict-after prev, inclusive at new), DM via the same snapshots. `elapsedDays` = elapsed hours between the two instants / 24 (instants as in §3.3, so DST is real time).

**Expected:** the event's own expected daily DMI from the same shared demand helper DMI-8 and the run rate use — `groupWindowsDailyDmiKg` on the event's group windows (2.5% BW per head, live windows; `feed-forage.js:589-590`) — averaged over the interval's local days weighted by the hours of each day inside the interval. If expected is 0 or unknown (no live windows, or `hasUnknownLiveWindowWeights`), skip the check.

**Thresholds (Design call):**
| Event during the interval | Warn when implied is… |
|---|---|
| **Pure confinement** (no open non-confinement paddock window, the DMI-8 test at `feed-forage.js:699-700`) **and** this is the event's only active stored-feed pool | **< 50%** or **> 400%** of expected |
| **Has pasture** (any non-confinement paddock window open in the interval — stored feed is a supplement), **or** the event has other active stored-feed pools in the interval (this pool is only part of the diet) | **> 400%** only |
| Any event | implied **< 0** — see below |

- **Negative intake is already blocked.** A reading above what was available at that instant throws "Pool quantity exceeds available feed." (`feed-pools.js:55`), and an edit that would leave a later reading above its stock is refused (`pool-ledger.js:52-58`). The helper still returns a `negative` warning defensively if it ever computes < 0, but no UI path should reach it; do not add a second block.
- **Skip** when there is no previous reading of that pool (first check), or the interval is **under 12 hours** (too noisy).
- **Edits and inserts:** when a check is edited, or a new check lands between two existing ones, evaluate **both** neighbouring intervals (prev → this, this → next) with the proposed values. A no-op edit (`unchangedPoolCheck` true) shows nothing.
- **Upper bound rationale — 400%, not 300%.** This corral's real intervals (Tim's corrected 0.75 on Nov 16) run 208–342% of 2.5% BW DMI (hay waste in a corral; ram lambs likely eat above 2.5%): Nov 12 15:00 → Nov 13 17:02 is **342%**, so a 300% ceiling would nag on a genuine interval. 400% still catches the gross errors (the as-saved Nov 16 → 17 interval is 527%).
- **Lower bound rationale — 50%.** Catches an untouched pre-fill (0%) and Orchestrator's flag (Nov 16 0.75 → Nov 17 0.66 = 30%) on confinement, where stored feed is the whole diet. Not applied with pasture, where low or zero supplement use is normal.

**Where it lives:** one pure helper in `src/calcs/` (no DOM), e.g. `feedCheckPlausibility({poolInput, proposedCheck, event, paddockWindows, locations, demand inputs})` → `[{ poolKey, interval:{from,to}, impliedDmKgPerDay, expectedDmKgPerDay, pct, kind:'low'|'high'|'negative' }]`, plus a ledger-side preview (pool-ledger) that builds the same proposed state `writePoolCheck` builds (`pool-ledger.js:48-53`) and calls it. Register it in the calc registry with a formula string. Every UI that saves a pool reading calls the preview before committing:
- the pool check form, new and edit (`pool-forms.js:31`, which calls `commitPoolCheck`);
- the feeding sheet's carryover reading (`src/features/feed/delivery.js` ~`:453-571`) — this is the path the assistant's filled feeding entries take (`src/features/assistant/entry-targets.js:186-198`), so the assistant review gets the same warning; if the assistant has its own confirm card for a feed reading, it renders the same warning list;
- close readings (`close.js:216`, `move-wizard.js:634`, `submove.js:323`): show the warning in their existing confirm step if they have one; if a flow has no confirm step, Build lists it in the PR and Design decides (do not add a new step in PR 1).

**UI:** on Save, if the preview returns warnings, show them inline above the buttons (not a browser `confirm`), one line per interval, in the user's unit system:
"From Nov 16 9:12 AM to Nov 17 12:04 PM this reading means about **43 lb DM/day** eaten, vs about **146 lb/day** expected (30%). Check Remaining, or save anyway."
Buttons: **Fix** (keeps the form open, focuses the first flagged Remaining) and **Save anyway** (commits exactly as typed). Changing any value clears the warning and re-evaluates on the next Save. New en.json keys; no other locale work.

### 3.2 (C) Notes below Remaining
In `renderPoolCheckForm` (`pool-forms.js:18-27`), append Notes **after** the pool cards (after Remaining and any quantity fields), immediately above the status line and buttons. Behaviour, test ids (`pool-notes`) and save payload are unchanged. The non-pool legacy forms (`feed/check.js`, the non-pool branch of `events/edit-feed-check.js`) are unreachable at schema ≥ 43 (`poolWritesEnabled`, `pool-ledger.js:14`); no change. Not in scope: a "Notes looks like a number" hint (not approved).

### 3.3 (D) Spread intake between checks by elapsed time

**Rule.** For a pool, take its readings in instant order (`rowInstant`, `date-utils.js:128-133`). Each consecutive pair i (prev → next) has intake_i = `max(0, prev + delivered(prev, next] − next)` in DM (and in count units when verified, same rules as `:125-138`), over H_i elapsed hours. For a local calendar day d:

`stored(d) = Σ_i intake_i × hours(d ∩ interval_i) / H_i`

- **Local days and hours.** Days are the operation's local calendar dates as stored (the app's device-local convention — `getLocalTodayStr`, `localFormTimestamp`; America/New_York for Tim). Instants are built in the local zone from `date` + `time`; hours are real elapsed hours, so a fall-back day has 25 h and a spring-forward day 23 h. An interval inside a DST day gets its true share; no per-day normalisation to 24 h.
- **Missing time (existing convention, kept).** A check or entry with no time is local midnight 00:00 (`rowInstant`: "a missing clock is midnight"). Consequence: two time-less checks give whole days, so all-time-less history produces exactly today's numbers, **except an interval that crosses a DST change**, which splits by real hours (see the DST note under acceptance 9; amended 2026-11-18).
- **Which days are "actual" (unchanged).** A pool is measured on d when its last reading dated ≤ d and a reading dated > d exist — today's predicate (`feed-pools.js:117`, `feed-forage.js:740`/`:808`, run rate `feed-run-rate.js:69-70`). So the set of actual days, the FED-6 measured-day count and DMI-8 statuses do not change; only the values do.
- **First reading's day.** Hours of that day before the pool's first reading lie in no interval; they take the first interval's hourly rate (equal to today's behaviour for that day: one flat rate).
- **Same-day intervals now count.** Two readings on one date (e.g. 08:00 and 17:00) form an interval whose intake is allocated to that date; today it is skipped because `next` must have a later date. An interval of zero elapsed time contributes nothing.
- **Nulls.** If any interval overlapping d has a null DM (missing conversion), stored(d) is null for that pool (as now → `needs_check`). Count units for d are null unless every overlapping interval is counted in the same unit.
- **Open stretch after the last reading — unchanged.** Days from the last reading's date onward are not measured; DMI-8 keeps the cascade estimate (`feed-forage.js:846` onward, status `estimated`), and the run rate does not count them. The part of the last closed interval that falls on the last reading's date is therefore not shown as actual (it shows when the next reading arrives).
- **Both paths agree.** Implement once (a shared helper in `feed-pools.js`), used by `poolDailyObservation` (so `poolDailyActual`, DMI-8 pool mode `:835-844` and FED-6 `feed-run-rate.js:105` all inherit it) and by the older non-pool bracketed path (`feed-forage.js:813-833`, replacing the `daysBetween` split at `:820`; that path brackets with check rows and `isAfterCheck`, `:634-636`).
- **Text to update in the same PR:** DMI-5 registry formula/notes (`feed-forage.js:131-153`), the FED-6 doc comment (`feed-run-rate.js:66-74`) and formula string (`:177`). Design updates V2_CALCULATION_SPEC §4.2 (DMI-5, DMI-8 step 2) when the PR lands.

## 4. Acceptance criteria
1. **B, corral fixture (corrected 0.75):** saving the Nov 17 12:04 0.66 reading warns *low* (≈ 43 lb/day vs 145.5, 30%); re-saving Nov 16 09:12 = 0.75 as an edit warns on its *next* interval (30%) and not on its previous one (208%). Nov 12 15:00 → Nov 13 17:02 (342%) does **not** warn.
2. **B, as-saved fixture (2.25):** saving Nov 16 = 2.25 warns *low* (0%) on Nov 13 17:02 → Nov 16 09:12; with 2.25 in place, saving Nov 17 = 0.66 warns *high* (527%).
3. **B pasture:** the same readings on an event with an open non-confinement paddock window warn only on > 400%; a 0% interval is silent.
4. **B skips:** first reading of a pool; interval < 12 h; no-op edit; expected DMI 0/unknown. A second active stored-feed pool on a confinement event → upper bound only.
5. **B non-blocking:** Save anyway commits exactly the typed values; Fix keeps the form open with focus on the flagged Remaining; nothing is written before the user picks. Same warnings on the feeding-sheet carryover and the assistant-filled entry.
6. **B negative:** existing blocks unchanged (`feed-pools.js:55`, `pool-ledger.js:57`); helper unit test returns `negative` for a hand-built negative interval.
7. **C:** in the pool check form (new and edit) the Notes field comes after every pool card; DOM-order test.
8. **D, corral fixture (corrected 0.75; lb DM/day; demand 145.5):**

| date | today (calendar split) | after D | D deficit |
|---|---|---|---|
| Nov 11 | 405.0 | 398.6 | 0 |
| Nov 12 | 540.0 | 435.8 | 0 |
| Nov 13 | 270.0 | 441.3 | 0 |
| Nov 14 | 270.0 | 303.0 | 0 |
| Nov 15 | 270.0 | 303.0 | 0 |
| Nov 16 | 48.6 (deficit 96.9) | 142.9 | **2.6** |
| Nov 17 | estimated (cascade) | estimated (unchanged) | — |

   Intervals: Nov 11 14:37 → Nov 12 15:00 0.75 bale / 24.38 h; Nov 12 15:00 → Nov 13 17:02 1.00 / 26.03 h; Nov 13 17:02 → Nov 16 09:12 1.50 / 64.17 h; Nov 16 09:12 → Nov 17 12:04 0.09 / 26.87 h. Nov 16 = 9.2 h × 303.0/24 + 14.8 h × 43.4/24. Tolerance ±0.1 lb.
9. **D DST** (test pins `TZ=America/New_York` for that file and must actually run in CI, not skip). *Amended 2026-11-18 (Design): the original vector, Oct 31 12 / Nov 1 25 / Nov 2 12 kg, was the hour split of one interval and ignored the first-reading and last-reading rules in §3.3.* Two readings only, Oct 31 2026 12:00 → Nov 2 12:00 with 49 kg DM eaten → 49 h elapsed → Oct 31 **24** kg (12 h in the interval plus the 12 h before the first reading at the first interval's rate), Nov 1 **25** kg, Nov 2 **not measured** (the last reading's date). With zero-intake readings a day either side (Oct 30 and Nov 3 12:00) the per-interval split shows as Oct 31 **12** / Nov 1 **25** / Nov 2 **12** kg; spring forward, Mar 13 2027 12:00 → Mar 15 12:00 with 47 kg → 47 h → **12 / 23 / 12** kg the same way. Tests: `tests/unit/intake-day-split.test.js`.
   **DST note, time-less checks:** a check with no time sits at local midnight, so two time-less readings across fall-back (Oct 31 → Nov 2 2026) span 49 real hours and split **24/49** (Oct 31) and **25/49** (Nov 1) by real hours, not equal day shares. This is the one exception to acceptance 10's "all-time-less checks give exactly today's per-day values": a day's share moves by about 1/49 of the interval (about 2%), only for an interval that crosses a DST change.
10. **D compatibility:** all-time-less checks give exactly today's per-day values (existing fixtures unchanged; except across a DST change, see the DST note under 9); a same-day 08:00/17:00 pair's intake now appears on that date; the measured-day set and statuses are identical to today on every existing fixture; legacy non-pool path and pool path return the same per-day values for an equivalent fixture.
11. Run rate (FED-6) and DMI-8 chart pick up D with no change of their own beyond the text updates; full suite, lint, both builds, PGlite harnesses green.

## 5. Notes for Orchestrator / Tim
### 5.1 Threshold check against this event (Tim's corrected data)
| interval | intake | elapsed | lb DM/day | % of 145.5 | B |
|---|---|---|---|---|---|
| Nov 11 14:37 → Nov 12 15:00 | 0.75 bale, 405 lb | 24.4 h | 398.6 | 274% | — |
| Nov 12 15:00 → Nov 13 17:02 | 1.00 bale, 540 lb | 26.0 h | 497.8 | 342% | — |
| Nov 13 17:02 → Nov 16 09:12 | 1.50 bale, 810 lb | 64.2 h (2.67 d) | 303.0 | 208% | — |
| Nov 16 09:12 → Nov 17 12:04 | 0.09 bale, 48.6 lb | 26.9 h | 43.4 | 30% | **low** |

### 5.2 Until D ships
With Nov 16 corrected to 0.75, today's calendar split shows Nov 13–15 enough (270 lb/day) and **Nov 16 a 96.9 lb deficit**; after D, Nov 16 is 142.9 lb (2.6 lb short). If the true Nov 16 amount was higher than 0.75, the 30% interval is the sign; Tim decides.

## 6. Out of scope
- Any data edit (Tim edits check `15f81210` himself in the app).
- **A** (blank Remaining / no pre-fill) — declined 12:23 PM ET.
- A "Notes looks like a quantity" hint; class-specific DMI rates; changing which days count as measured; the open-stretch estimate.
- The latent east-of-UTC `toISOString()` date roll in `dmi-chart-context.js:142-144` and `feed-forage.js:651-655` (noted in the diagnosis; not this bug).

## 7. Suggested slicing (Design reviews each)
- **PR 1 = B + C** (helper + preview + form/feeding-sheet/assistant wiring + en.json + tests 1–7). No calc change to bars.
- **PR 2 = D** (shared elapsed-time allocator in `feed-pools.js`, both DMI paths, text updates, tests 8–11). Changes bar values and FED-6 values on existing data; Design checks the corral numbers on the PR.
- One PR is fine if Build finds D small. No migration, no schema or CP-55/CP-56 impact.

## OPEN_ITEMS changes
- New **OI-0227** (APPROVED, Tim 2026-11-17 12:23 PM ET, via Orchestrator), table row and entry; this brief is the spec.
