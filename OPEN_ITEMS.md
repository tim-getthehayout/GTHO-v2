# Open Items

## Open

---

### OI-0095 — Event Paddock Window Split on State Change (architectural fix — paddock analog of OI-0091)
**Added:** 2026-04-18 | **Area:** v2-build / events / paddocks / calcs / architecture | **Priority:** P0 (strip grazing silently loses per-strip effective-area history; every area-dependent calc on an open strip-grazed paddock is wrong after any `area_pct` edit)
**Checkpoint:** independent architectural pass; sequence after OI-0091 package + OI-0094 have landed so the group-side contract is stable reference material

**Status:** open — DESIGN COMPLETE, spec awaiting session brief. Blocked only on batching with the two remaining follow-ups from the group-side audit (OI for weight-side completeness; correction OI for the §7 Remove group mis-wiring in OI-0090 brief). Tim, 2026-04-18: *"lets walk through all event window related items and wrap it all in at the end."*

**What's wrong (reproduced in the code, not yet observed in field data):**

An `event_paddock_window` is the paddock-side analog of `event_group_window` — it represents a period during which a paddock's **placement state** (which paddock, what fraction of it via `area_pct`, whether it's a strip, which strip group it belongs to) is stable. The v2 codebase has the **row structure** for splits (multiple rows per `event_id + location_id` are already allowed, `is_strip_graze` / `strip_group_id` / `area_pct` columns exist per GH-4) but none of the **discipline of splitting** that OI-0091 put in place for group windows. Concretely:

1. **`edit-paddock-window.js` edits `area_pct` in place on an open window** (lines 60, 100, 108). A farmer who starts grazing a paddock at 100% and halfway through decides to strip-graze the back half at 25% can type `25` and hit Save. The single row mutates from `area_pct = 100` to `area_pct = 25`. The historical effective area (100% for the first N days) is gone. Every effective-area calc that looks back over this window — pasture cover forecast, DMI/acre, AU/acre, NPK/acre deposit density, grazing pressure — silently reads `area_pct = 25` for the entire duration and understates the area the animals were actually on.

2. **`submove.js` "Advance Strip" (lines 282–299) does split-on-state-change correctly today** — closes the current strip window with `dateClosed`/`timeClosed`, opens a new one with the same `stripGroupId` and `areaPct`. This is the correct pattern and the architectural exemplar. The gap is that this pattern is implemented ad hoc inside the advance-strip flow rather than as a reusable helper, so no other flow reuses it and the design doesn't compose.

3. **`move-wizard.js` close path (lines 495–503) closes paddock windows bare** — `update(...dateClosed, timeClosed)` on every open PW. No snapshot of "what was the effective area on this paddock at the moment of close." Today this is fine because `area_pct` doesn't mutate post-open in a well-behaved flow, but as soon as we fix `edit-paddock-window.js` (see #1 above) the snapshot rule will matter — the closed row must retain the `area_pct` that was actually in force on the day it closed, not whatever the farmer later types.

4. **`reopen-event.js` reopen path (line 100) clears `dateClosed`/`timeClosed`** with no consideration of whether the paddock's state has since changed. Group-side OI-0094 shipped a `classifyGwsForReopen` classifier that walks each closed GW and decides reopen-or-keep-closed based on whether the group has since moved. Paddock-side has no analog. A reopen blindly reopens whatever windows were closed on `date_out`, even if the farmer has since started a different event on the same paddock.

5. **`edit-paddock-window.js` reopen action (line 128) clears `dateClosed`/`timeClosed` with no same-paddock-overlap guard.** The edit dialog does guard *overlap with other windows* on save (lines 86–95), but the standalone reopen button on a closed window skips that check. If the farmer reopens an old closed window on a paddock that has since been re-opened in a new event, we end up with two overlapping open windows on the same paddock.

6. **No orphan prevention or cleanup analog of OI-0073.** OI-0073 walked v1-migration and fresh-v2 data for orphan `event_group_windows` (no matching open event, `dateLeft IS NULL`) and closed them. `event_paddock_windows` has the same failure mode: a whole-group move closes the source event but if the close path ever leaves a PW open (no such bug currently grep'd, but the invariant is undefended), the orphan is invisible until a pasture-cover forecast includes a paddock that isn't actually being grazed.

**Architectural principle (new — extends `V2_APP_ARCHITECTURE.md` §4.4):**

An `event_paddock_window` is a **period of stable placement state** on an event. During that period, `locationId`, `areaPct`, `isStripGraze`, and `stripGroupId` are constant by definition. When any of those change — strip advance, strip-size re-plan mid-event, paddock swap within event, retroactive area correction — the current open window **closes on the change date with its state stamped in**, and a new window **opens the same date with the new state**. Closed windows are historical truth (their `areaPct` snapshot is authoritative forever). The open window is still a stored row (unlike group windows, there's no cheaper live-recompute source — `areaPct` is not derivable from anywhere else), but any mutation of that row's placement-state columns must go through the split helpers, not a direct `update()`.

**Rule of thumb (paddock-side):** *every change to `areaPct`, `isStripGraze`, `stripGroupId`, or `locationId` on an open window splits the window. Direct `update()` on those columns on an open window is a bug.* Date/time bounds remain directly editable — they are the window's own identity, not state that splits it.

**Why this is a second architectural pass (not a rider on OI-0091):**

- **Different state model.** Group windows have a live-recompute fallback (live memberships are the source of truth; the stored snapshot is only meaningful on close). Paddock windows have no live-recompute source — `areaPct` is a farmer's plan, not a derivation. The split must therefore **snapshot on the closing row** and **write the new plan on the opening row**. Render/calc paths read the stored `areaPct` in both cases. This is a meaningfully different helper contract than `splitGroupWindow`.
- **Strip grazing is a shipped, spec'd surface.** `github/issues/GH-4_strip-grazing-paddock-windows.md` is the canonical strip-grazing spec. OI-0095 must not re-spec strip grazing — it must make the code behind strip grazing consistent with the split discipline. The Advance Strip flow already *does* split correctly and becomes the exemplar; the fix is lifting that inline pattern into a helper and wiring every other entry point to use it.
- **Area-dependent calcs cut across more calls.** DMI/acre, AU/acre, NPK/acre, pasture cover, grazing pressure, rotation-calendar recovery clocks, `calcs/feed-forage.js` all read `areaPct`. Every one of these must be audited for "does this read hit only closed windows, or open ones too?" — parallel to the grep-contract OI-0091 enforced for `gw.headCount` / `gw.avgWeightKg`.

**Scope (the package):**

1. **Two new store helpers** (`src/data/store.js`):
   - `splitPaddockWindow(paddockWindowId, changeDate, changeTime, newState)` — closes the current open window by stamping `dateClosed`/`timeClosed` on the existing row (keeping its `areaPct`/`isStripGraze`/`stripGroupId` intact as historical truth); opens a new window dated `changeDate`/`changeTime` on the same `eventId + locationId` with `newState.areaPct`, `newState.isStripGraze`, `newState.stripGroupId` applied. Returns `{ closedId, newId }`. Note: keyed on the PW id, not `(groupId, eventId)` like `splitGroupWindow`, because a single event can have multiple open PWs on different locations simultaneously (unlike groups, which are exactly one open GW per `(groupId, eventId)` pair).
   - `closePaddockWindow(paddockWindowId, closeDate, closeTime)` — close-only variant for terminal state changes (event close, strip graze ended early, paddock removed from event). No new window opens.
   - Both helpers assert the target row has `dateClosed IS NULL`. Passing a closed PW is a programming error; log + return `null`.

2. **Advance Strip refactor (`src/features/events/submove.js` lines 282–299)** — lift the existing inline close+open pair into a `splitPaddockWindow` call. Pure refactor: identical behavior, pattern now reusable. Establish the exemplar.

3. **`edit-paddock-window.js` `areaPct` edit (line 100)** — on an **open** PW, route `areaPct` changes through `splitPaddockWindow`. On a **closed** PW, keep the direct `update()` (closed-window historical correction is the explicit escape hatch, parallel to OI-0094's §7 locked decision for GW `headCount` on closed windows). UI treatment: when `dateClosed === null`, the `areaPct` input stays editable (farmer has a legitimate re-plan need), but Save calls the helper — not a bare `update()`. Add a caption below the field on open windows: *"Saving creates a new window from today forward. The prior area is preserved in the grazing history."*

4. **`edit-paddock-window.js` `isStripGraze` toggle (line 101)** — same treatment. Toggling strip-graze on/off on an open window is a state change → `splitPaddockWindow`. The new window gets the toggled `isStripGraze`; if turning strip graze on, generate a fresh `stripGroupId` the same way `move-wizard.js` does. If turning strip graze off, new window's `stripGroupId = null`, `areaPct = 100`.

5. **`edit-paddock-window.js` reopen action (line 128)** — before clearing `dateClosed`/`timeClosed`, run the same-paddock-overlap guard used on Save (lines 86–95) but against currently-open siblings. If any other PW on the same `(eventId, locationId)` is currently open, block with a clear error: *"This paddock already has an open window on this event. Close or delete the other window before reopening this one."*

6. **`move-wizard.js` close path (lines 495–503)** — replace the direct `update()` loop with `closePaddockWindow` per PW. Today this is a pure refactor (no stored snapshot changes), but it locks in the helper contract — future changes that add a stored snapshot (e.g., a `closing_area_pct` column) only need to update the helper.

7. **`reopen-event.js` paddock reopen (line 100)** — mirror OI-0094's group-side work. Build a `classifyPwsForReopen` pure classifier: for each PW closed on `date_out`, decide `reopen` (no later event on same paddock, no state change) or `keep_closed` (paddock has since been used on another event, or an edit-paddock-window reopen already reopened a sibling). Surface a summary dialog before commit: *"N paddock windows will be reopened. M stay closed because the paddock has since been reused."* Require explicit confirm. Unit test the classifier as a pure function.

8. **Live-recompute helpers — scoped question, not a blanket ask.** Unlike GWs, PWs have no "live recompute" source for `areaPct` — it's not derivable. But one calc path *does* want live-ish values: pasture cover forecasts on open paddocks use `areaPct` to compute effective area today. The helper contract here is simpler: `getOpenPwForLocation(locationId, eventId)` returns the single currently-open PW for a (location, event) pair. Used by calcs that need "what area_pct is in force right now" without scanning all windows. Placed in `src/calcs/window-helpers.js` next to the group-side helpers. No live-recompute analog of `getLiveWindowHeadCount` is needed for paddocks.

9. **Calc audit — parallel to OI-0091's grep-contract** (see `V2_APP_ARCHITECTURE.md` §4.4 grep-contract exception list, which will gain a paddock-side row):
   - `src/calcs/feed-forage.js` lines 215–217, 456–462, 620 — currently iterate paddock windows. Audit: do these read `areaPct` on open windows? If so, they're reading the stored value (fine) but must route through `getOpenPwForLocation` when the calc is parameterized by "now" rather than "over a range of closed windows."
   - `src/calcs/core.js` line 51 — `effectiveArea = areaHectares * (areaPct / 100)` on each window. Fine as long as callers pass one row at a time.
   - `src/features/dashboard/index.js` line 1018 — passes `areaPct: 100` as a hard-coded literal. That's a bug predating OI-0095 (doesn't support strip grazing on the dashboard); either fix in scope or log as a follow-up OI. **Probably in scope**: dashboard is already audited for live-read rules as of OI-0094; completing the paddock-side live-read story is cheaper here than tracking a separate OI.
   - `src/features/locations/index.js` line 357 — same `areaPct: 100` literal. Same decision as dashboard.
   - `src/features/events/rotation-calendar/calendar-grid.js` line 171 and `past-block.js` — already iterate strip windows with their `areaPct`. Should work after the helper migration; add a passing test.

10. **Orphan prevention + cleanup (analog of OI-0073):**
    - **Part A (code fix)** — no grep'd orphan source today, but once the helpers exist, add a commit-time assertion (in `splitPaddockWindow` / `closePaddockWindow`): if `dateClosed IS NULL` on the target row doesn't match expectation, log a warn and refuse. Prevents misuse by future flows.
    - **Part B (data cleanup)** — one-time migration (script, not SQL — runs in app) that walks `event_paddock_windows` where `dateClosed IS NULL` and the parent event has `date_out IS NOT NULL`. Close each orphan with `dateClosed = event.dateOut`. Log every row touched.
    - **Part C** — note in the OI: after OI-0095 lands, new orphans are architecturally prevented.

11. **Architectural doc update (`V2_APP_ARCHITECTURE.md`)** — extend §4.4 "Window-Split on State Change" with a parallel paddock-side subsection: the principle, the helper contract (`splitPaddockWindow` / `closePaddockWindow` / `getOpenPwForLocation`), the render/calc rule, and the authoritative entry-point table. Adds a paddock-side row to the grep-contract exception list.

**Explicit non-scope:**

- **Strip grazing UX and new surface area** → owned by `github/issues/GH-4_strip-grazing-paddock-windows.md`. OI-0095 touches only the persistence/split plumbing behind that feature, not the Move Wizard strip-setup step, the Advance Strip button on the event card, or the strip-timeline UI. If GH-4 is partly built, OI-0095 lifts what's there onto the helper; if GH-4 is unbuilt, OI-0095 still ships and GH-4 consumes the helper when it builds.
- **`areaPct` math beyond effective-area** (e.g., per-strip cost allocation, per-strip utilization reporting) → follow-up OIs once the split discipline is in place.
- **Paddock swap within event** (move event without creating a new event record) → no current flow in v2; if it exists in v1 and needs porting, it's a separate OI. OI-0095 makes the helper available; swap is trivially a `closePaddockWindow(oldPw) + add PaddockWindowEntity.create(new)` pair once the helpers exist.
- **Retroactive cleanup of stored `areaPct` values on historical closed windows.** Not worth a migration; edit-paddock-window on closed PWs is the escape hatch.

**Files likely affected:**
- `src/data/store.js` — new `splitPaddockWindow` and `closePaddockWindow` helpers
- `src/calcs/window-helpers.js` — new `getOpenPwForLocation` helper
- `src/features/events/submove.js` — Advance Strip refactor to use helper (pure refactor)
- `src/features/events/edit-paddock-window.js` — `areaPct` and `isStripGraze` edits go through helper on open windows; reopen guard added
- `src/features/events/move-wizard.js` — close loop converted to `closePaddockWindow`
- `src/features/events/reopen-event.js` — introduce `classifyPwsForReopen` + summary dialog
- `src/features/dashboard/index.js` and `src/features/locations/index.js` — replace hard-coded `areaPct: 100` with `getOpenPwForLocation(...)?.areaPct ?? 100`
- `src/features/events/rotation-calendar/calendar-grid.js`, `past-block.js` — audit; expected to need no changes
- `src/calcs/feed-forage.js` — audit call sites for open-window reads
- `V2_APP_ARCHITECTURE.md` §4.4 — extend with paddock-side subsection and updated grep-contract exception list
- `tests/unit/store-paddock-window-split.test.js` (new) — pure helper tests
- `tests/unit/calcs-window-helpers.test.js` — extend for `getOpenPwForLocation`
- `tests/unit/edit-paddock-window.test.js` — extend for helper call on open-window edits, reopen overlap guard, closed-window direct-update escape hatch
- `tests/unit/reopen-event.test.js` — extend with paddock classifier cases
- `tests/unit/move-wizard.test.js` — extend for close-path helper call
- `tests/e2e/paddock-window-split.spec.js` (new) — mid-event `areaPct` change on an open PW creates a new window; reopen summary dialog renders; advance-strip unchanged behavior

**Acceptance criteria:**
- [ ] `splitPaddockWindow` and `closePaddockWindow` exist and are unit-tested pure (input row → expected row mutations)
- [ ] `getOpenPwForLocation` exists and is unit-tested
- [ ] Advance Strip refactored to use `splitPaddockWindow`; e2e behavior identical; test passes unchanged
- [ ] `edit-paddock-window.js` `areaPct` and `isStripGraze` edits on open windows route through `splitPaddockWindow`; closed-window edits keep direct `update()` (historical correction escape hatch); UI shows the "new window from today forward" caption on open windows
- [ ] `edit-paddock-window.js` reopen action blocks if another PW on the same `(eventId, locationId)` is currently open
- [ ] `move-wizard.js` close loop converted to `closePaddockWindow`
- [ ] `reopen-event.js` shows a summary dialog ("N paddock windows will be reopened. M stay closed..."); `classifyPwsForReopen` is a pure exported function with unit tests for at least four cases (reopen, keep-closed-after-reuse, keep-closed-after-swap, empty set)
- [ ] `dashboard/index.js` and `locations/index.js` read `areaPct` from the open PW instead of literal `100`
- [ ] Grep audit passes: no direct `update('eventPaddockWindows', ...)` in `src/features/**` mutating `areaPct`, `isStripGraze`, or `stripGroupId` on open windows except inside the helper
- [ ] Grep audit passes: no `areaPct: 100` literal reads in `src/features/**` except tests
- [ ] Orphan cleanup script run once (CP-55 export-then-inspect to confirm); Part A helper assertions in place
- [ ] `V2_APP_ARCHITECTURE.md` §4.4 extended with paddock-side subsection, helper signatures, and grep-contract row
- [ ] E2E test: edit an open paddock window's `areaPct` from 100 to 50 → two rows exist, old one closed on today with `areaPct = 100`, new one open with `areaPct = 50`; pasture cover calc for today reads `areaPct = 50`; historical range calc reads both segments
- [ ] 910+ tests pass; no regressions

**CP-55/CP-56 impact:** **none direct.** Pattern creates more `event_paddock_window` rows over time; existing export/import already handles the table. No new columns, no renames, no removals, no backup-migration chain entry. If the one-time orphan cleanup writes `dateClosed` values on pre-existing rows, those are regular updates that flow through the normal sync path.

**Schema change:** **none.** Existing columns (`is_strip_graze`, `strip_group_id`, `area_pct` per GH-4) already support the pattern. Multiple rows per `(event_id, location_id)` are already allowed.

**Related:**
- **OI-0091** — direct architectural parallel on the group side. OI-0095 copies its structure, helper contract pattern, and grep-contract discipline.
- **OI-0094** — reuses the pattern of (a) lift pattern into helper, (b) wire every entry point, (c) update §4.4 table. `classifyGwsForReopen` in OI-0094 is the direct pattern for `classifyPwsForReopen` here.
- **OI-0073** — Parts A/B orphan cleanup pattern is copied for the paddock side.
- **GH-4** (`github/issues/GH-4_strip-grazing-paddock-windows.md`) — owner of the strip grazing feature spec. OI-0095 is the plumbing that makes that feature behave correctly across all entry points. OI-0095 does not re-spec GH-4.
- **Batched follow-ups to sequence with this OI** (per Tim, 2026-04-18):
  - Weight-side completeness OI — Quick Weight sheet (`src/features/health/weight.js`) never calls `splitGroupWindow`; Edit Animal `currentWeight` input is created but silently no-ops (read gap in `saveAnimal`). Scope ~1 day.
  - Correction OI for OI-0090 session brief — §7 Remove group incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point (closes the PW but doesn't touch `animal_group_memberships`, so "empty" doesn't apply). Apply correction + commit note; scope < 1 hour.

---

### OI-0094 — Group state-change entry point completeness (package 2 after OI-0091)
**Added:** 2026-04-17 | **Area:** v2-build / groups / events / architecture | **Priority:** P0 (silent calc wrongness persists on 11 entry points even after OI-0091 ships)
**Checkpoint:** runs AFTER OI-0091 + OI-0073 package lands

**Status:** closed — 2026-04-18. All ten in-scope entry points (entry #11 Animals bulk Move removed by OI-0093) now route state changes through OI-0091's helpers. `src/features/animals/index.js` Edit Group, Edit Animal, Group Weights, Split Group all call `splitGroupWindow` via the shared `maybeSplitForGroup` helper. `src/features/health/calving.js` splits the dam's group window on new calf membership. `src/features/events/group-windows.js` §7 Add opens with system-generated live values (view-only); §7 Remove calls `closeGroupWindow`. `src/features/events/edit-group-window.js` renders `headCount` / `avgWeightKg` view-only on open windows (with "System generated from live memberships" caption — v1 parity, locked sub-decision 2026-04-17); closed windows keep editable inputs as historical-correction escape hatch; Delete button now shows the spec'd confirm. `src/features/events/reopen-event.js` replaced the conflict dialog with a summary dialog: "N group windows will be reopened. M stay closed because the group has since left." `classifyGwsForReopen` is exported + unit-tested (4 cases). V2_APP_ARCHITECTURE.md §4.4 expanded with the authoritative 13-entry-point table and updated grep-contract exception list. 894 tests pass.

**Why a second package:** OI-0091's original scope covered three flows — cull, whole-group move, and event close. A follow-up audit of the codebase found eleven more places where a group's state (head count, avg weight, or membership composition) can change mid-event without calling the window-split helpers. Every one of those paths generates the same class of stale-snapshot bug OI-0091 fixes for the three covered flows. This OI covers the remaining eleven so the architectural rule ("split on every state change") is complete.

**The eleven entry points (grep-confirmed in current code):**

| # | Flow | File + line | What mutates |
|---|------|-------------|--------------|
| 1 | Edit Group sheet — add/remove animals via checkboxes | `src/features/animals/index.js:512-521` | memberships added + old memberships on other groups closed |
| 2 | Split Group sheet — Split button on group tile | `src/features/animals/index.js:723-726` | source memberships closed, new memberships created on target group |
| 3 | Edit Animal → group dropdown change | `src/features/animals/index.js:1280-1300` | old membership closed, new one opened |
| 4 | Group Weights sheet (bulk weight update on group tile) | `src/features/animals/index.js:976+` | per-animal `weight_kg` updates → group's live avg weight shifts |
| 5 | Calving flow (new calf → group membership) | `src/features/health/calving.js:161-162` | new membership created for calf; head count +1 |
| 6 | §7 "Add group" button (Edit Event dialog) | `src/features/events/group-windows.js:118` | opens a new `event_group_window` mid-event |
| 7 | §7 "Remove group" button (Edit Event dialog) | `src/features/events/group-windows.js:202` | closes an open `event_group_window` |
| 8 | §7 per-row Edit dialog — `headCount` / `avgWeightKg` fields | `src/features/events/edit-group-window.js:65, 67, 108` | on OPEN windows: render as view-only (live values, v1 parity — see locked sub-decision below); on CLOSED windows: remain editable (historical correction) |
| 9 | §7 per-row Edit dialog — Delete window | `src/features/events/edit-group-window.js:128` | hard-deletes a window; no cascade |
| 10 | Event reopen (clears `date_out`) | `src/features/events/reopen-event.js` | may need to reopen previously-closed windows |
| 11 | Animals bulk Move action (green action bar → Move to group) | `src/features/animals/index.js:1351-1356` | closes old membership, opens new — though this entry point may be removed by OI-0093 |

**Sub-decision — LOCKED 2026-04-17 — §7 per-row `headCount` / `avgWeightKg` on open windows (entry #8):**

On an **open** window, OI-0091 makes the stored `head_count` irrelevant — render and calc paths read live from memberships. A farmer's manual edit in §7 would therefore be silently overridden (type 6, save, card still shows 10 because live memberships say 10).

**Decision: render `headCount` and `avgWeightKg` as view-only on open windows. v1 treated these as system-generated and the v2 architecture makes them derived for open windows.** Tim, 2026-04-17: *"Ok those two fields should be view only. That's how they were in v1 as well. System generated."*

Implementation:

- When `dateLeft === null` (open window), render `headCount` and `avgWeightKg` as read-only labels showing the **live** values (from `getLiveWindowHeadCount(gw)` / `getLiveWindowAvgWeight(gw)`), styled as disabled/grey, with a small caption: *"System generated from live memberships. Use Cull, Move, or Reweigh to change."*
- When `dateLeft !== null` (closed window), the two fields remain editable — a closed window's snapshot is historical truth, and manual correction is the right escape hatch for mistakes (e.g., cull was logged with the wrong count).
- Date/time joined and date/time left fields remain editable in both states.

**Why:** Matches v1's "system generated" model (so farmers aren't relearning behavior) and enforces the OI-0091 architectural rule at the UI layer (open = live, closed = snapshot).

**Scope (the package):**

For every entry point above, the pattern is the same:

1. Replace the direct membership/window mutation with the appropriate call to OI-0091's helpers:
   - **Membership change that affects head count or avg weight on an open event** → call `splitGroupWindow(groupId, eventId, changeDate, changeTime, { headCount: liveCount, avgWeightKg: liveAvgWeight })` immediately after the membership mutation.
   - **Terminal state change (last animal gone, or explicit remove from event)** → call `closeGroupWindow(groupId, eventId, closeDate, closeTime)`.
   - **"Add group to event" (entry #6)** → treat as opening a new window with live values; no split needed (no prior open window for this group on this event).
   - **"Remove group from event" (entry #7)** → call `closeGroupWindow` directly instead of bare `update()`.
   - **§7 per-row Edit `headCount`/`avgWeightKg` (entry #8)** → open windows render view-only from `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` with a "System generated from live memberships" caption; closed windows keep current editable behavior. See locked sub-decision above.
   - **Delete window (entry #9)** → no change to logic, but add a confirmation that this hard-deletes historical data and should only be used to clean up mistakes.
   - **Event reopen (entry #10)** → for each window that was closed by the event-close flow on `date_out`, check: if the group's next event uses the same location, reopen the window (clear `dateLeft`/`timeLeft`); if the group has since moved or been culled, keep closed. Farmer should see a summary dialog: *"N group windows will be reopened. M stay closed because the group has since left."*

2. Each entry point gets a unit test verifying the helper is called with the right arguments after the mutation. The e2e test suite gains one additional flow per pair of entry points (e.g., one for Animals-screen flows, one for §7 flows, one for calving).

3. No new store helpers beyond OI-0091's. No new calc helpers. No schema change. No CP-55/CP-56 impact.

**Files likely affected:**

- `src/features/animals/index.js` — entry points 1, 2, 3, 4, 11 (five call sites, all need to call `splitGroupWindow` after the membership mutation)
- `src/features/health/calving.js` — entry point 5
- `src/features/events/group-windows.js` — entry points 6, 7
- `src/features/events/edit-group-window.js` — entry points 8 (sub-decision resolution), 9
- `src/features/events/reopen-event.js` — entry point 10 (with new summary dialog)
- `tests/unit/animals.test.js`, `tests/unit/calving.test.js`, `tests/unit/edit-group-window.test.js`, `tests/unit/group-windows.test.js`, `tests/unit/reopen-event.test.js` — unit tests per entry point
- `tests/e2e/group-state-change-completeness.spec.js` (new) — representative end-to-end flows

**Why not fold into OI-0091 now:** Claude Code is already executing OI-0091. Widening its scope mid-flight adds churn and risks either a rushed incomplete first pass or a delayed ship of the core architectural fix. Running as package 2 lets package 1 land clean, Tim verify the Shenk Culls fix in field data, and package 2 complete the architectural coverage without scope creep.

**Acceptance criteria:**
- [x] Sub-decision on §7 per-row `headCount` / `avgWeightKg` (entry #8) locked 2026-04-17: view-only on open windows, editable on closed windows (v1 parity — system generated).
- [ ] All eleven entry points call `splitGroupWindow` / `closeGroupWindow` (or have an explicit documented reason not to).
- [ ] §7 per-row Edit dialog renders `headCount` and `avgWeightKg` as disabled view-only when `dateLeft === null`, reading from `getLiveWindowHeadCount` / `getLiveWindowAvgWeight`. Caption reads *"System generated from live memberships. Use Cull, Move, or Reweigh to change."*
- [ ] §7 per-row Edit dialog keeps `headCount` / `avgWeightKg` editable when `dateLeft !== null` (closed window = historical correction permitted).
- [ ] Unit tests cover each entry point. Edit-group-window test covers both open (view-only) and closed (editable) paths.
- [ ] E2E test: add an animal to a group via Edit Group sheet (entry #1) → event detail §7 head count increases by 1, dashboard card matches; add a calf via calving (entry #5) → same check; §7 Remove group (entry #7) → window closes with live values; event reopen (entry #10) → summary dialog renders with expected counts.
- [ ] No direct `event_group_windows` mutations remain in the eleven files above except via the two helpers (grep check per entry point).
- [ ] OI-0091's `V2_APP_ARCHITECTURE.md` section gets a table of all entry points that must use the helpers (living reference for future flow authors).
- [ ] PROJECT_CHANGELOG.md updated.

**CP-55/CP-56 impact:** none. More rows over time; schema unchanged.

**Related:** OI-0091 (hard dependency — this is its completion package), OI-0073 (shares the "orphan prevention" theme), OI-0093 (if entry #11 Animals bulk Move is removed by OI-0093, update this scope to reflect that).

---

### OI-0093 — Animals screen: remove bulk action bar + conform group dropdown in Edit Animal
**Added:** 2026-04-17 | **Area:** v2-build / animals / UI | **Priority:** P1 (redundant UI + styling inconsistency)

**Status:** closed — 2026-04-18. Green bulk action bar + `#animals-action-bar` DOM + `renderActionBar()` + `selectedAnimals` Set + per-row checkbox column all removed from `src/features/animals/index.js`. `openAnimalMoveSheet` deleted (only caller was the action bar; grep confirmed). Edit Animal → Group field rewritten from raw `<select>` to v2 `loc-picker` tap-to-select rows (matches Move wizard + group-add patterns). OI-0094 entry #11 done-by-default — flow removed entirely.

**What's wrong:**

1. **Green bulk action bar on Animals screen** — when any animal is tapped via its row checkbox, a full-width green bar slides in at the top of the Animals screen showing `"N selected · Move to group · New group · Cancel"`. Confirmed in Tim's screenshot (2026-04-17). The bar is redundant: every action it exposes is already available per-animal via the row's Edit button (→ opens Edit Animal dialog with group dropdown) or per-group via the group tile's Edit / Split / Weights / × actions. The bulk action bar adds a second, parallel interaction pattern without adding capability.
2. **Group dropdown in Edit Animal dialog uses raw `<select>` styling** — does not match the rest of the app's picker/dropdown conventions (see v2 design system tokens used elsewhere — e.g., batch picker in Deliver Feed, group picker in Move wizard). Creates visual inconsistency and looks unfinished.

**Fix:**

1. **Remove the bulk action bar entirely.** Delete the `#animals-action-bar` DOM element, `renderActionBar()` function, and the `selectedAnimals` Set + click-handler that maintains it (`src/features/animals/index.js` lines 29, 59, 65, 215–227, 310–335, 378, 1323, 1358). Remove the checkbox column from each row. The row's existing Edit button becomes the primary per-animal action.
2. **Remove `openAnimalMoveSheet`** if it is only called from the action bar. If it is called elsewhere (e.g., from another entry point), leave the function and rewire its callers. Grep before removing.
3. **Rewrite the group dropdown in Edit Animal dialog** (`src/features/animals/index.js:1104`) to use the standard v2 picker pattern — tap-to-open sheet with selectable rows, consistent with the rest of the app. Verify against the pattern used in the Move wizard group picker or Deliver Feed batch picker (whichever is closer to the pattern documented in V2_DESIGN_SYSTEM.md).

**Interaction with OI-0094:** Entry point #11 (Animals bulk Move action) goes away entirely with OI-0093. Update OI-0094's entry point table to remove #11 once OI-0093 ships.

**Files affected:**
- `src/features/animals/index.js` — remove action bar, remove checkbox column, rewrite group dropdown to picker pattern
- (If `openAnimalMoveSheet` is orphaned) delete the function + its sheet DOM
- `tests/unit/animals.test.js` — remove tests for the deleted bulk flow; add tests for the new group picker
- `PROJECT_CHANGELOG.md`

**Acceptance criteria:**
- [ ] No green bulk action bar appears on the Animals screen under any condition.
- [ ] Per-row checkbox is removed. Each animal row has an Edit button as its primary action.
- [ ] Edit Animal → Group field uses the standard v2 picker pattern (consistent with Move wizard or Deliver Feed pickers).
- [ ] Group change in Edit Animal correctly closes old membership and opens a new one (existing behavior, verify still works after UI change).
- [ ] OI-0094's entry point #11 marked done-by-default (flow removed).
- [ ] Unit tests pass; visual check against design system.

**CP-55/CP-56 impact:** none. UI change only.

**Related:** OI-0094 (removes one of its eleven entry points), SP-10 (design-system-conformant picker pattern).

---

### OI-0092 — Residual feed NPK deposits (v1 parity gap)
**Added:** 2026-04-17 | **Area:** v2-build / calcs / feed / fertility | **Priority:** P2 (feature gap — grazing math ignores residual feed as nutrient input to pasture)
**Checkpoint:** post-OI-0091 track — full spec session required before build

**Status:** open — stub only. Flagged during OI-0091 design when Tim asked whether unconsumed/un-transferred feed ends up on the fertility ledger.

**What's wrong:** v1 had a `feed_residual` NPK source alongside `livestock_excretion`. When feed was left on pasture at event close (not consumed, not transferred), v1's `calcResidualOM()` computed the residual organic matter and its N/P/K contribution was deposited to the paddock fertility ledger. v2 dropped this entirely:
- v2 has no residual-feed concept in calcs (V2_CALCULATION_SPEC.md's "residual" refs are all pasture-grass-height, not feed).
- v2's NPK-1 covers only livestock excretion.
- Move wizard close (`src/features/events/move-wizard.js` line 482) hardcodes `remainingQuantity: 0` on close-reading, treating all unconsumed feed as vanished. No NPK deposit fires.
- Net: any event with leftover feed understates NPK deposited on the pasture. Farmer's fertility ledger is incomplete.

**Source references:**
- v1: `GTHO_V1_FEATURE_AUDIT.md` line 479 (`calcResidualOM` formula), line 932 (`feed_residual` NPK source), line 1218 (v1 had `event_feed_residual_checks` table).

**What's needed (short form — full spec required):**
1. **Capture residual at close.** Replace hardcoded zero with a farmer prompt at event close and move close: "Was any feed left on pasture?" Capture remaining qty per batch × location.
2. **Schema addition.** Either `event_feed_entries.residual_qty` (per-entry) or a new `event_feed_residual_deposits` table (per close-event aggregate) — decide during spec. Probably the latter for clean parity with `npk_deposits` shape.
3. **New calc (NPK-R or equivalent).** `n_kg = residual_qty × weight_per_unit_kg × (dm_pct / 100) × batch.n_per_tonne_dm / 1000`. Same for P and K. Port or revise v1's `residualPct` multiplier.
4. **NPK ledger integration.** Deposit rows with source `feed_residual` alongside existing `livestock_excretion` rows. Dashboard + reports pick them up without further wiring (same ledger surface).
5. **UI.** Residual capture step in close flows (event close + move close). Post-close edit path via SP-10 for corrections.
6. **v1 migration transform.** Port `event_feed_residual_checks` rows to the new v2 shape.
7. **CP-55/CP-56 impact.** New column or table → export/import spec update, schema_version bump, backup-migrations chain entry.

**Dependencies:** architecturally independent of OI-0091, but sequencing matters. OI-0091's close flows are the natural insertion point for the residual-capture step. Build OI-0091 first; OI-0092's UI plugs into the existing close path.

**Explicit non-scope of OI-0091:** OI-0091 must **not** modify the `remainingQuantity: 0` behavior. That line stays as-is until OI-0092 lands. OI-0091's spec includes a placeholder comment pointing to OI-0092 so Claude Code doesn't "helpfully" change it.

**Schema change:** yes, shape TBD.

**CP-55/CP-56 impact:** yes — detailed in full spec when written.

**Related:** OI-0091 (close flow integration point), v1 FEED-09 (`calcConsumedDMI` + `calcResidualOM`), v1 NUT-02 (NPK deposits ledger `feed_residual` source).

---

### OI-0091 — Event Window Split on State Change (architectural fix)
**Added:** 2026-04-17 | **Area:** v2-build / events / calcs / architecture | **Priority:** P0 (every calc on every open event is wrong after any cull, reweigh, or move; actively corrupting today's field data)
**Checkpoint:** blocks further field testing — ship with OI-0073 as coordinated package

**Status:** closed — 2026-04-18. Shipped as coordinated package with OI-0073. New store helpers `splitGroupWindow` / `closeGroupWindow` at the mutation site; live-read helpers `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` in `src/calcs/window-helpers.js`; calc + render reroutes across dashboard, event detail, reports, rotation-calendar, retro-place, FOR-5; flow wiring in cull-sheet, move-wizard (close + destination w/ duplicate-open guard), event-close; new V2_APP_ARCHITECTURE.md §4.4 "Window-Split on State Change"; 15 new unit tests + e2e sync verification. `remainingQuantity:0` in move-wizard unchanged per OI-0092 non-scope. 890 tests pass. **OI-0090 unblocked** — empty-group archive flow can now build on the new trigger points.

**What's wrong (reproduced today):** Tim culled 4 head from Shenk Culls (10 → 6, then later → 5). Animals screen correctly shows 5 (it reads live `animal_group_memberships`). Every other surface — dashboard location card, event detail sheet §7, rotation calendar, reports — shows 10, because they read `event_group_windows.headCount`, which is a snapshot stamped at group-join time and never updated. Every DMI / NPK / AU / animal-days / days-remaining / stored-feed-demand / cost-per-day number on that event is ~50% overstated.

Independent but compounding: move wizard close loop (lines 502–507) sets only `dateLeft`/`timeLeft`, never stamps live values. And move wizard destination creation (lines 562–563, 603–604) copies the stale source snapshot forward (`headCount: gw.headCount, avgWeightKg: gw.avgWeightKg`), so a brand-new destination window inherits the lie on day one.

**Architectural principle (new — belongs in `V2_APP_ARCHITECTURE.md`):**

An `event_group_window` is a **period of stable group state** on an event. During that period, the group's `headCount`, `avgWeightKg`, and composition are constant by definition. When any of those change — cull, reweigh, wean, split, move, composition change — the current open window **closes on the change date with its final live values stamped in**, and a new window **opens the same date with the new state**. Closed windows are historical truth (their snapshot is authoritative forever). The open window is synthetic — its stored `headCount` / `avgWeightKg` are irrelevant on open rows; render and calc paths always recompute from live memberships for windows where `dateLeft IS NULL`.

**Rule of thumb:** *stored snapshot for closed windows, live recompute for open windows, split on every state change.*

**Scope (the package):**

1. **Two new store helpers** (`src/data/store.js`):
   - `splitGroupWindow(groupId, eventId, changeDate, changeTime, newState)` — closes the current open window for (group, event) by stamping **current live** `headCount` and `avgWeightKg` into the row and setting `dateLeft`/`timeLeft`; opens a new window dated `changeDate`/`changeTime` with `newState.headCount` and `newState.avgWeightKg` recomputed from live memberships.
   - `closeGroupWindow(groupId, eventId, closeDate, closeTime)` — same close step as `splitGroupWindow` but no new window opens. Used on terminal state changes (event close, last-membership-gone).

2. **Cull flow (`src/features/animals/cull-sheet.js`)** — after the existing `animal_group_memberships` close from OI-0086, call `splitGroupWindow`. If remaining head count is 0, call `closeGroupWindow` instead. **This subsumes OI-0090 Part 1 cascade.** OI-0090's dedicated `onLastMembershipClosed` helper is no longer needed — the last-membership case falls out naturally from `closeGroupWindow` when the live count is 0.

3. **Move wizard close path** (`src/features/events/move-wizard.js` lines 500–507) — replace the `update(…dateLeft, timeLeft)` loop with `closeGroupWindow` per group. Live values get stamped on close.

4. **Move wizard destination creation** (lines 554–566 and 596–607) — replace `headCount: gw.headCount, avgWeightKg: gw.avgWeightKg` with recomputed values from live `animal_group_memberships`. This is the "open" step of a split — write live, not copy source.

5. **Move wizard "existing event" duplicate-open guard** (lines 596–607) — before creating a new GW on a destination event of type `existing`, check if the group already has an open window on that event. If yes, log warning and skip. Prevents the class of orphan OI-0073 is also cleaning up.

6. **Event close flow (`src/features/events/close.js`)** — convert close loop to `closeGroupWindow` pattern so event close also stamps live values. (Sanity-check only if flow already does this; the grep suggests it doesn't.)

7. **Live-recompute helpers for render/calc** (`src/calcs/window-helpers.js` — new file):
   - `getLiveWindowHeadCount(gw)` — if `gw.dateLeft === null`, returns live count from memberships; else returns stored `gw.headCount`.
   - `getLiveWindowAvgWeight(gw)` — same pattern using live animal weights.
   - All render paths (`features/dashboard/index.js`, `features/events/detail.js`, `features/events/rotation-calendar/*`, `features/reports/*`) and calc input assembly route through these helpers. **No direct `gw.headCount` / `gw.avgWeightKg` reads** in render/calc paths after this change (grep-enforceable).

8. **Architectural doc update** — new section in `V2_APP_ARCHITECTURE.md` titled "Event Window Split on State Change" documenting the principle, the helpers, and the render/calc rule. Becomes the canonical reference for future flow authors (reweigh OI-0065, wean, split, composition change, per-group move OI-0066).

**Ships together — OI-0073 in same package:**

OI-0073's root cause attribution ("orphaned from v1 migration") was too narrow. Fresh v2 data is generating orphans too, because pre-OI-0091 flows don't honor the split pattern. Confirmed today on Tim's Shenk Culls move. OI-0073 scope widens:
- **Part A (code fix)** — keep as spec'd: prefer GWs linked to open events.
- **Part B (data cleanup)** — keep as spec'd: set `dateLeft` on orphan GWs. Must cover both v1-migration origin and fresh-v2 flow-bug origin.
- **Part C (new)** — note in OI-0073: after OI-0091 lands, orphan creation is architecturally prevented going forward. No new orphans from well-behaved flows.

OI-0073's spec file and OI body updated in the same commit as OI-0091.

**Explicit non-scope:**

- **Residual feed NPK / fertility ledger** → OI-0092 (separate track). Claude Code **must not** change the `remainingQuantity: 0` behavior in `move-wizard.js` line 482 during this work. Add a placeholder code comment pointing at OI-0092 so it's clear why it stays.
- **Per-group move variant** → OI-0066 (follow-up). Once `splitGroupWindow` exists, a per-group move becomes trivial; not in this scope.
- **Reweigh flow** → OI-0065 (DESIGN REQUIRED on UX; uses these helpers once spec'd).
- **Retroactive cleanup of already-stale stored snapshots on historical closed windows** — not worth a one-time migration. SP-10 §7 edit-group-window dialog gives manual correction path.

**Files likely affected:**
- `src/data/store.js` — new `splitGroupWindow()` and `closeGroupWindow()` helpers
- `src/calcs/window-helpers.js` — new file with `getLiveWindowHeadCount` / `getLiveWindowAvgWeight`
- `src/features/animals/cull-sheet.js` — call helper after membership close
- `src/features/events/move-wizard.js` — replace close loop (lines 500–507), destination create (554–566, 596–607), add duplicate-open guard
- `src/features/events/close.js` — convert to helper
- `src/features/dashboard/index.js` — route all `gw.headCount` / `gw.avgWeightKg` reads through helpers
- `src/features/events/detail.js` — same
- `src/features/events/rotation-calendar/calendar-grid.js`, `past-block.js` — same
- `src/features/reports/*` — audit for direct reads, convert
- `V2_APP_ARCHITECTURE.md` — new section "Event Window Split on State Change"
- `tests/unit/store-window-split.test.js` (new) — pure helper tests
- `tests/unit/calcs-window-helpers.test.js` (new) — live-recompute helper tests
- `tests/unit/cull-sheet.test.js` — extend for window-split call
- `tests/unit/move-wizard.test.js` — extend for live-stamp-on-close, live-read-on-destination, duplicate-open guard
- `tests/e2e/cull-updates-dashboard.spec.js` (new) — cull → dashboard card + event detail + DMI reflect new count immediately

**Acceptance criteria:**
- [ ] `splitGroupWindow` and `closeGroupWindow` exist, unit-tested pure (given memberships + change → expected row mutations)
- [ ] Cull flow calls one of the two helpers; tests cover partial cull (opens new window) and full cull (closes only, no new open)
- [ ] Move wizard close stamps live `headCount` + `avgWeightKg` into closing rows (not just `dateLeft`/`timeLeft`)
- [ ] Move wizard destination rows pull live values from memberships; test: stale source snapshot + live cull after snapshot → destination row uses live count
- [ ] Move wizard rejects duplicate open window on "existing event" destination (unit test)
- [ ] Event close converted to `closeGroupWindow`; same stamping guarantee
- [ ] Grep audit passes: no direct `gw.headCount` / `gw.avgWeightKg` reads in `src/features/**` or `src/calcs/**` outside the window-helpers module itself
- [ ] All calcs receive recomputed values for open windows; unit test covers "live recompute drops DMI" for a post-cull scenario
- [ ] `V2_APP_ARCHITECTURE.md` has the new "Event Window Split on State Change" section
- [ ] OI-0073 Part A (code fix) and Part B (data cleanup) both ship in the same commit/session
- [ ] `remainingQuantity: 0` line in `move-wizard.js` is **unchanged**; placeholder comment added pointing to OI-0092
- [ ] E2E test: cull an animal → dashboard card and event detail both reflect new count without reload; DMI chart drops accordingly
- [ ] All prior tests pass; no regressions

**CP-55/CP-56 impact:** **none direct.** Pattern creates more `event_group_window` rows over time; existing export/import already handles the table with pagination. No new columns, no renames, no removals, no backup-migration chain entry.

**Schema change:** **none.** Existing columns support the pattern (multiple rows per event+group already allowed).

**Related:**
- **OI-0090 / SP-11** — Part 1 (cascade helper) SUBSUMED by OI-0091. SP-11 now covers only Parts 2–4 (empty-group prompt, `archived_at` migration, reactivation). OI-0090 blocked on OI-0091.
- **OI-0073** — ships in the same package; root-cause attribution widened.
- **OI-0086** (closed) — cull flow gains an additional call to `splitGroupWindow` on top of the existing membership close.
- **OI-0092** (residual feed NPK) — explicit non-scope; separate track.
- **OI-0065** (reweigh — DESIGN REQUIRED) — uses these helpers once spec'd.
- **OI-0066** (per-group move) — uses these helpers once built.
- **v1 analog lesson** (CLAUDE.md Known Traps): "UI fields without Supabase columns = silent data loss." v2 analog: "snapshot-first calcs without live recompute = silent calc-wrongness after state change."

---

### OI-0090 — Empty group archive flow (prompt + archive as first-class state)
**Added:** 2026-04-17 | **Area:** v2-build / groups / events | **Priority:** P1 (silent data integrity — empty groups need a guided archive path; manual delete orphans historical events with "?")

**Status:** closed — 2026-04-18 (Parts 2–4; Part 1 was subsumed by OI-0091). Migration 024 `archived_at TIMESTAMPTZ` applied + verified (guarded `UPDATE operations SET schema_version = 24 WHERE schema_version < 24` so Tim's DB at 25 doesn't downgrade); fresh DBs get the normal sequential bump. `src/entities/group.js` `archived boolean` → `archivedAt timestamptz` with round-trip tests. New `store.archiveGroup(id)` / `reactivateGroup(id)` actions (6-param update per Rule 7). Backup-migrations `23 → 24` chain entry now maps `archived:true` → `archived_at: updated_at || exported_at || now()`, `archived:false` → `null`, strips old `archived` key. New `src/features/animals/empty-group-prompt.js` — `maybeShowEmptyGroupPrompt(groupId)` triggers the sheet when the group has zero open memberships and isn't already archived; prompt exposes Archive (primary) / Keep active / Delete (danger, disabled when group has `event_group_window` history with tooltip "This group is on N event(s). Archive instead to preserve history."). Wired into cull-sheet, Edit Group checkboxes, Split Group, Edit Animal group change, move-wizard (guarded to only fire if live headCount < 1 after close), §7 Remove group. Management UI gets Show archived toggle + archived-section rows with Reactivate + Delete (same gating). Picker filter sweep: `!g.archivedAt` replaces `!g.archived` in animals/index.js group pickers, move-wizard (via animals/index.js), event-creation, calving, dashboard, group-windows Add. v1-migration updated to emit `archived_at` on seed. 910 tests pass (16 new across group-archive + empty-group-prompt). Follow-up: SP-11 reconciliation (merge into V2_UX_FLOWS.md §3.4 + §15.2, V2_SCHEMA_DESIGN.md §3.3) remains at sprint end.

**What's wrong (reproduced today):** Tim culled the last animal out of the Culls group. OI-0086's cull flow correctly closed the animal's `animal_group_memberships` row. But no cascade fired to the group level:
- The group's open `event_group_window` stayed open (`date_left IS NULL`) — a "ghost" group with zero head count still attached to an event. *(This symptom is now owned by OI-0091: the cull flow must split/close the window with live values at the cull date.)*
- Tim then deleted the empty group from the management UI. The historical event now renders "?" where the group name used to be — hard-deleted group leaves orphan FK references from `event_group_windows.group_id`. *(This symptom remains in scope here — needs the archive-as-state path + delete-gating.)*

Three separate bugs interacting: (1) ~~no last-membership cascade~~ **→ moved to OI-0091**, (2) no empty-group guidance (prompt), (3) group delete allowed even when referenced by events.

**Fix (scoped to Parts 2–4 after OI-0091 subsumption):**

1. ~~**Automatic cascade**~~ — **STRUCK. Owned by OI-0091 as part of the window-split architecture.** The cull/move/wean flows each call `splitGroupWindow` / `closeGroupWindow` at the mutation site with live values, stamped at the change date. The centralized "on last membership closed" helper is no longer needed — the flows that *cause* last membership to close are the same flows that must already close the window per OI-0091. (Kept here for traceability; do not build a second cascade path.)
2. **Empty-group prompt** — after a group's last membership closes AND OI-0091's window-split fires, offer Archive / Keep active / Delete. Delete is **disabled** when the group has any event history (tooltip: *"This group is on N event(s). Archive instead to preserve history."*). The trigger point is now "group has zero open memberships and the closing flow has just committed" — each flow (cull-sheet, move-wizard, wean-wizard) calls `maybeShowEmptyGroupPrompt(groupId)` after its window-split commit.
3. **Archive as first-class state** — migration 024 replaces `groups.archived boolean` with `groups.archived_at TIMESTAMPTZ` for audit. NULL = active, timestamp = archived on that date. Backfill existing `archived = true` rows.
4. **Reactivation** — group management UI gets "Show archived" toggle + Reactivate action. Clears `archived_at`, group reappears in active pickers. Seasonal cohort reuse (Weaners 2025 → Weaners 2026 on the same group record) preserves continuous history.

**Why archive as timestamp (not keep the boolean):** Tim chose Option 2 — richer audit trail (sort by archive date, show "archived last summer" context for reactivation), aligns with the upcoming schema audit session's goal of cleaning up sparse columns. Migration is small and boolean is already in live schema.

**Schema change:** Migration 024 — add `archived_at timestamptz`, backfill (`UPDATE groups SET archived_at = updated_at WHERE archived = true`), drop `archived boolean`, `CREATE INDEX idx_groups_active ON groups(farm_id) WHERE archived_at IS NULL`, bump schema_version to 24. Must follow CLAUDE.md "Write + Run + Verify" rule.

**CP-55 / CP-56 impact:** `archived_at` serialized in export. Backup-migrations.js needs v23 → v24 chain entry mapping old `archived: true` → `archivedAt = g.updatedAt || b.exported_at || now()`, `archived: false` → `archivedAt = null`, then `delete g.archived`. Schema version bump 23 → 24.

**Files likely affected (after OI-0091 scope removal):**
- `supabase/migrations/024_groups_archived_at.sql` (new)
- `src/entities/group.js` (replace `archived` → `archivedAt`, update FIELDS, create, toSupabaseShape, fromSupabaseShape, validate)
- `src/data/store.js` (add `archiveGroup()`, `reactivateGroup()` — ~~`onLastMembershipClosed()`~~ no longer needed, OI-0091 owns window closure at the mutation site)
- `src/data/backup-migrations.js` (v23 → v24 chain entry)
- `src/features/animals/cull-sheet.js` (after OI-0091's window-split commit, call `maybeShowEmptyGroupPrompt(groupId)`)
- `src/features/events/move-wizard.js` (after OI-0091's window-split commit, call `maybeShowEmptyGroupPrompt(groupId)` — only if source group is now empty)
- `src/features/groups/` (empty-group prompt sheet, management UI — Show archived toggle, Reactivate button, Delete gating)
- All group pickers (move wizard, event creation, field mode, CRUD list) — filter by `archivedAt IS NULL`
- `tests/unit/group.test.js`, `tests/unit/backup-migrations.test.js`
- `tests/e2e/` — full cull-to-archive-to-reactivate round-trip with Supabase verification

**Related:** OI-0091 (**blocks this OI**; owns the automatic window-closure that was Part 1 of this flow), OI-0086 (cull flow, closed — this builds on its membership close), OI-0073 (group placement detection — ships in the OI-0091 package; both deal with event_group_window hygiene), §3.3 Composition Change (weaning flow — OI-0091's split pattern already covers weaning state change).

---

### OI-0089 — V2_SCHEMA_DESIGN.md missing `animal_notes` and `event_observations` sections
**Added:** 2026-04-17 | **Area:** v2-docs | **Priority:** P3 (doc drift only, no runtime effect)
**Checkpoint:** Local-only fields audit follow-up
**Status:** closed — 2026-04-17. Added §5.8 `event_observations` (Domain 5, after §5.7 paddock_observations) and §9.11 `animal_notes` (Domain 9, after §9.10 animal_weight_records — Domain 9 matches migration 012's "Domain 9 amendment" header; earlier "suggest §3.5" placement was overridden once the migration intent was checked). Both sections built from the live `SCHEMA_DUMP_2026-04-17.md` columns rather than the on-disk migrations alone, so migration 022's `bale_ring_residue_count` addition to `event_observations` is captured. Style matches existing neighbors (column table + design decisions + CREATE TABLE). Change Log row added to V2_SCHEMA_DESIGN.md. No schema change.

**What was wrong:** Two tables existed in live Supabase, in entity/store/migration/backup code, and in `V2_MIGRATION_PLAN.md §5.3a` — but were not documented in the canonical design doc:
- `animal_notes` — added in migration 012 (`012_d9_animal_notes.sql`)
- `event_observations` — added in migration 021 (`021_create_event_observations.sql`) + `bale_ring_residue_count` from migration 022

**Impact:** Pure doc drift. Any contributor treating `V2_SCHEMA_DESIGN.md` as canonical would not know these tables exist.

**Related:** FIND-01 in `AUDIT_LOCAL_ONLY_FIELDS.md`.

---

### OI-0088 — `CURRENT_SCHEMA_VERSION = 20` in backup-import.js is stale (live is 23)
**Added:** 2026-04-17 | **Area:** v2-build / backup-restore | **Priority:** P0 (current-version backups not round-trippable)
**Checkpoint:** Local-only fields audit follow-up

**What's wrong:**
```
backup-import.js: CURRENT_SCHEMA_VERSION = 20
live Supabase:   operations.schema_version = 23
```

A backup exported today from the live app carries `schema_version: 23`. When re-imported into the current build:
- If the importer rejects future backups (`backup.schema_version > CURRENT_SCHEMA_VERSION`) → import fails entirely.
- If the importer caps migration at `CURRENT_SCHEMA_VERSION` → the migration chain stops at 20 and columns added in migrations 021–023 (`event_observations` table, `survey_bale_ring_columns`, `feed_removal_columns`) are not migrated. Any backup originating from those columns is silently mis-migrated.

Either way, **current-version backups are not round-trippable through the current app.** Exact severity depends on importer branch logic — P0 if reject-on-future, P1 if silent mis-migration.

Note: the `BACKUP_MIGRATIONS` chain itself is fine — entries cover 14 → … → 22 → 23. Only the `CURRENT_SCHEMA_VERSION` constant is stale.

**Root cause:** Migrations 021, 022, 023 landed without bumping `CURRENT_SCHEMA_VERSION`. Same root cause as OI-0087 (Export/Import Spec Sync Rule not followed).

**Fix (Claude Code, session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md`):**
1. `src/data/backup-import.js`: `const CURRENT_SCHEMA_VERSION = 23;`
2. Verify `BACKUP_MIGRATIONS` entries 20, 21, 22 each advance `schema_version` by 1 correctly (chain was already confirmed during the audit).
3. Add a unit test: `expect(CURRENT_SCHEMA_VERSION).toBe(max(migration file numbers))`. Mechanical check catches the next one.

**Related:** FIND-03 in `AUDIT_LOCAL_ONLY_FIELDS.md`. Same deploy as OI-0087.

---

### OI-0087 — `event_observations` missing from backup pipeline (BACKUP_TABLES + FK_ORDER)
**Added:** 2026-04-17 | **Area:** v2-build / backup-restore | **Priority:** P1 (silent data loss on every backup round-trip)
**Checkpoint:** Local-only fields audit follow-up

**What's wrong:**

| File | Status |
|---|---|
| `src/data/backup-export.js` `BACKUP_TABLES` | ❌ Missing (49 entries, should be 50) |
| `src/data/backup-import.js` `FK_ORDER` | ❌ Missing (49 entries, should be 50 at position 32) |

Migration 021 created the `event_observations` table. The entity file, store, sync-registry, live Supabase, and §5.3a FK list all know about it. But the backup export/import does not.

**Impact:** Farmers creating event observations (a SP-2-era feature) have data written to Supabase correctly, but:
- Exporting a backup silently drops every observation.
- Restoring a backup from today, if observations were captured in its source Supabase, silently drops them — `BACKUP_TABLES` never fetched them in the first place.

Every event observation ever created is at risk of loss the moment a farmer restores a backup to reset state or migrate between environments.

**Root cause:** Migration 021 landed without updating the backup spec in lockstep — exactly the class of bug the CLAUDE.md "Export/Import Spec Sync Rule" was written to prevent. Rule wasn't followed.

**Fix (Claude Code, session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md`):**
1. Add `event_observations: { paginate: true },` to `BACKUP_TABLES` in `src/data/backup-export.js` (position per §5.3a — after `event_paddock_windows`, before `event_group_windows`).
2. Add `'event_observations',` to `FK_ORDER` in `src/data/backup-import.js` at position 32 (between `event_paddock_windows` and `event_group_windows`).
3. Add a unit test: `expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length)`. Mechanical check catches the next one.

**CP-55/CP-56 impact:** yes — fixing this IS the CP-55/CP-56 spec-sync correction. No further spec work needed beyond the three file edits above; §5.3a is already correct.

**Related:** FIND-02 in `AUDIT_LOCAL_ONLY_FIELDS.md`. Same deploy as OI-0088.

---

### OI-0086 — Cull Sheet: replace broken stub with v1-parity dialog (date + reason + notes to Supabase)
**Added:** 2026-04-17 | **Area:** v2-build / animals | **Priority:** P1 (silent data loss on every cull today)
**Checkpoint:** Animals screen v1 parity follow-up
**Status:** closed — 2026-04-17. Filed as GH-13. New `src/features/animals/cull-sheet.js` with `openCullSheet`, `buildCulledBanner`, and pure helpers (`confirmCull`, `reactivateAnimal`, `buildAnimalLabel`, `CULL_REASONS`). Cull sheet captures date/reason/notes and persists `active=false` + 3 cull fields to Supabase; closes all open `animal_group_memberships` with `reason='cull'` on the cull date. Red banner replaces the placeholder; Reactivate clears all four fields. Fixed 3 stale `a.culled` references (filter, isCulled badge, group picker) to use `a.active === false`. All 6-param store calls verified per CLAUDE.md Rule 7. 12 unit tests + skeletal e2e sync-verification spec. 872 tests.

**What's wrong:** The v2 animal edit dialog uses `window.prompt()` for culls (`src/features/animals/index.js` lines 1241–1261), captures only a reason string, and sends `{ culled: true, cullReason: reason }`. The animal entity has no `culled` field — the correct field is `active` (boolean). So:
- `culled: true` never reaches Supabase via `toSupabaseShape()` — it's dropped silently.
- The reactivate button reads `existingAnimal.culled`, always undefined → UI can never show the culled state.
- No cull date is ever captured.
- No cull notes are ever captured.
- Culled animals stay visible in lists because `active` never flips.

Violates the "no local-only fields" rule and the v1-parity rule.

**What's already correct (no changes needed):**
- Schema: `animals.cull_date`, `cull_reason`, `cull_notes`, `active` all exist.
- Migration 003_d3 has all four columns.
- `src/entities/animal.js` has `cullDate`, `cullReason`, `cullNotes`, `active` with `sbColumn` mappings and full round-trip in `toSupabaseShape` / `fromSupabaseShape`.

**Fix (UI-only):** Spec in `github/issues/cull-sheet-v1-parity.md`. Build a proper Cull Sheet (date, reason dropdown with 9 v1 options, notes) opened from the "Cull animal…" button. On confirm: update the animal with all four fields, close any open `animal_group_memberships` rows on the cull date, toast, close both sheets. Replace the placeholder banner with the v1 red banner showing reason + date + notes + Reactivate. Remove the broken `window.prompt` stub entirely.

**CP-55/CP-56 impact:** none — columns already in spec.

**Related:** animals-screen-ui-v1-parity.md (which stubbed the Cull section as a single button placeholder), OI-0050 (sync param-count trap to guard against), v1 lesson "UI fields without Supabase columns = silent data loss."

---

### OI-0085 — §8 Feed Entries: display bugs + v1-parity inline add/edit
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P0 (blocks field testing)
**Checkpoint:** SP-10 follow-up
**Status:** closed — 2026-04-17. Two field-name typos fixed in `renderFeedEntries` (`batch?.name`, `fe.date`). §8 rebuilt to v1 inline pattern: `+ Add feed` header button, v1-style rows (date/desc left, DMI/cost + Edit/× right), inline form mount with module-level state, multi-batch add, batch-locked edit, 5 SP-10 §8 validation guards, inventory delta on edit, inventory restore on delete. `Deliver feed` big footer button removed. New `src/features/events/feed-entry-inline-form.js` with pure helpers + 19 unit tests. 860 tests green. `delivery.js` (standalone Deliver Feed sheet) untouched per OI-0072 scope.

**What's wrong (three things):**

1. **Feed name displays as `?`** in the §8 Feed Entries row. `renderFeedEntries` in `src/features/events/detail.js` (line 887) reads `batch?.feedName`, but the batch entity's field is `batch.name`.
2. **Delivery date is blank** in the §8 row (the empty gap in `? · 1 · · $45.00`). `renderFeedEntries` reads `fe.deliveryDate` (line 894), but the entity field is `fe.date`.
3. **Per-row Edit (pencil) button doesn't edit.** It calls `openDeliverFeedSheet` — the Add flow — so clicking it opens an empty new-delivery sheet. No edit UI exists.

**What Claude Code builds — v1 parity, inline pattern (not a sheet):**

The v1 pattern lives inside the event edit dialog. The §8 section has a "+ Add feed" button in the header; clicking it expands an inline form below the list. The per-row Edit button reuses the same form, pre-populated. This matches what farmers already expect from v1 and keeps the Edit Event dialog self-contained (no separate sheet to manage).

1. **Fix display bugs** (2 one-liners in `renderFeedEntries`).

2. **Rebuild §8 Feed Entries to v1 inline pattern** — see brief for extracted v1 HTML/CSS/JS.
   - Section header: `Feed entries` label on the left, `+ Add feed` button on the right (v1 `btn btn-green btn-xs`).
   - List of existing rows: date · description · DMI lbs · $cost · Edit · Delete.
   - Inline form container (initially hidden, `display: none`). Shows when `+ Add feed` or any row's Edit is tapped. Contains: Date input → batch selector (tap-to-toggle cards with checkmark + remaining) → per-selected-batch qty stepper (−/+ in 0.5 increments) → `Add to event` / `Cancel` buttons.
   - **Edit mode:** pre-populate date + selected batch + qty. Batch is locked in edit mode (can't deselect or add another — changing the batch means delete + re-add).
   - **Multi-batch add:** supported — farmer can select multiple batches, set qty for each, save once → creates N `event_feed_entries` rows sharing the date.

3. **Validation guards** per SP-10 § §8 (already ratified):
   - `entry.date < event.date_in` → reject.
   - `entry.date > event.date_out` on closed events → reject.
   - `entry.date` in the future → reject.
   - `quantity ≤ 0` → reject with copy: *"Quantity must be greater than zero. To remove feed from this event, use the Move feed out action."*
   - On edit: if quantity raise exceeds available inventory (`batch.remaining + old_qty`) → reject.

4. **Save behavior:**
   - **Add:** for each selected batch with qty > 0, create an `event_feed_entries` row, decrement `batches.remaining` by qty.
   - **Edit:** update the single row's date + qty. Adjust `batches.remaining` by the delta (`old_qty − new_qty`). Cascade DMI/NPK/cost through compute-on-read.

5. **Move feed out** button stays in the card footer (unchanged from SP-10 §8a).

6. **`Deliver feed` big button in §8 footer is removed** — its job is now done by the inline `+ Add feed` in the section header.

**No schema impact.** All fields already exist.

**Acceptance criteria:**
- [ ] §8 rows display batch name (not `?`) and delivery date (not blank).
- [ ] `+ Add feed` button opens the inline form below the list (not a sheet).
- [ ] Multi-batch add works: select two batches, set qty for each, save → two `event_feed_entries` rows with matching date.
- [ ] Per-row Edit button opens the inline form pre-populated; batch is locked, qty/date editable.
- [ ] Save (Edit mode) adjusts `batches.remaining` by the delta in the correct direction.
- [ ] All 5 validation guards reject with correct inline copy.
- [ ] DMI / NPK / cost update automatically after edit (compute-on-read).
- [ ] Delete still works unchanged.
- [ ] Visual layout matches v1 (use extracted HTML/CSS in the brief as the reference).
- [ ] Unit tests: display rendering with real batch, validation guards, quantity delta on `batches.remaining`, multi-batch add, edit pre-population.
- [ ] PROJECT_CHANGELOG.md updated.

**Spec reference:** `UI_SPRINT_SPEC.md` § SP-10 § §8 Feed Entries (ratified 2026-04-17) — rules.
**Brief reference:** `github/issues/SESSION_BRIEF_2026-04-17_oi0085-feed-entries-v1-parity.md` — extracted v1 HTML/CSS/JS.

**Files:**
- Modified: `src/features/events/detail.js` (2 bug fixes + rebuild `renderFeedEntries` to v1 inline pattern + inline add/edit logic)
- May be new: `src/features/events/feed-entry-inline-form.js` (extractable helper if detail.js gets crowded)
- Modified: `src/features/events/index.js` (remove Deliver feed sheet imports if no longer used in §8 context — check delivery.js is still called from dashboard-level CTAs before removing)
- New: `tests/unit/feed-entry-inline-form.test.js`

**Related:** OI-0072 (Feed Dialogs V1 Parity Rebuild) stays open and still covers the *standalone* Deliver feed sheet (used from dashboard CTAs). This OI doesn't touch that sheet — only the inline §8 pattern.

**Why P0:** display bugs make §8 unreadable; missing edit flow means farmers can't correct a mistyped quantity — field testing stalls the first time someone miscounts.

---

### OI-0083 — SP-10: Retro-place flow
**Added:** 2026-04-17 | **Area:** v2-build / events / groups | **Priority:** P1
**Checkpoint:** SP-10 Phase 3 — completes SP-10 build
**Status:** closed — 2026-04-17. `src/features/events/retro-place.js` built with sheet picker (full containment), optional paddock sub-picker, conflict-check abort, confirm dialog, atomic two-write commit (pre-validate + sequential update/add + manual revert on add failure). 14 unit tests pass. Reachable via direct invocation/tests until gap detection is wired in `edit-group-window.js` (separate follow-up).

**What:** Gap Option 3 of the gap/overlap resolver — retroactively place a group on another (closed) event that was open during the gap period. The spec has been simplified to an atomic two-write transaction — no reopen/re-close ceremony, no snapshot rollback infrastructure needed for this flow.

**Design decisions locked 2026-04-17 (with Tim):**

1. **Destination event picker:** sheet picker with event cards (full-screen sheet, one card per candidate event with dates, location(s), current groups, head count). **Not** a dropdown — retro-place is a consequential decision that warrants rich preview.
2. **Picker filter — full containment only.** Destination event must have `event.date_in ≤ gap_start` AND `event.date_out ≥ gap_end`. Partial-overlap events are excluded. Rationale: keeps the flow simple for a rare action; farmers facing a partial-fit scenario can cancel and handle the gap in pieces. Revisit if field testing shows farmers need partial fills.
3. **Flow simplification — atomic two-write, no reopen ceremony.** Once full-containment is the filter, the new group window's date range is fully derived (`date_joined = gap_start`, `date_left = gap_end`), leaving nothing for the user to decide beyond picking the destination. The prior spec's reopen-close-rollback ceremony was cost without benefit. Simpler flow: (a) snapshot, (b) user picks destination from sheet, (c) conflict check, (d) confirm dialog, (e) on Confirm — commit source edit + insert new historical group window atomically; on Cancel — nothing written.
4. **Conflict check:** if the group being placed already has an `event_group_window` on the destination whose range overlaps `[gap_start, gap_end]`, block with an error (not a three-option resolver). The premise of retro-place is that the group was unplaced during the gap; a pre-existing overlap violates that outright.
5. **No "undo" toast.** Retro-place is intentional and visible — the destination event's §7 group list now shows the new window. To reverse, the farmer opens the destination event's Edit dialog and deletes the window via the existing Delete-window action.

**What Claude Code builds:**
- `src/features/events/retro-place.js` — the sheet picker + confirm dialog + two-write transaction.
- Conflict-check helper (can live inline).
- Wire into the gap resolver at `resolve-window-change.js` as the handler for Option 3.

**Spec:** `UI_SPRINT_SPEC.md` § SP-10 "Retro-Place Flow" (fully rewritten 2026-04-17).

---

---

### OI-0084 — SP-10: §9 Feed check edit + re-snap invariant dialog
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P1
**Checkpoint:** SP-10 Phase 6 — completes SP-10 build
**Status:** closed — 2026-04-17. `src/features/events/edit-feed-check.js` built. Per-item edit dialog with range guards + invariant check covering Cases A/B/C/D. Re-snap dialog atomically deletes impossible later check items + saves edit, then a non-modal toast offers a "Feed check" shortcut to re-measure. `renderFeedChecks` in `detail.js` now renders one row per (check × item) feed line and wires the per-row Edit button to the new dialog. 20 unit tests pass.

**Clarification (2026-04-17):** The full design for this item already lives in `UI_SPRINT_SPEC.md` § SP-10 §9 (ratified 2026-04-17). What Claude Code flagged as "design-required" was really a scope surprise: the feed check edit UI doesn't exist in the current code (checks are add-only in `src/features/events/check.js`), so this item covers building the edit dialog from scratch rather than extending an existing one. That's a scope note, not a design gap. No new design decisions needed from Tim.

**What Claude Code builds:**

1. **Feed check edit dialog** (`src/features/events/edit-feed-check.js` — new file). Opens from the per-row inline Edit button in the §9 card (the button already exists per the OI-0071 fix; it currently has no target). Fields: `date`, `time` (optional), `remaining_amount`, optional `notes`. Batch and location read-only. Auto-save on commit (button), not on blur — this is a single submit because the invariant check needs all fields together.

2. **Range guards** (reject-on-save, inline error) per SP-10 §9:
   - `check.date` < `event.date_in` → reject.
   - `check.date` > `event.date_out` on closed events → reject.
   - `check.date` in the future → reject.
   - `remaining_amount` < 0 → reject.

3. **Invariant check on save** per SP-10 §9: run `consumed(Ti → Ti+1) ≥ 0` across all adjacent intervals on the feed line (same batch × location on the same event). Four cases:
   - **Case A — benign:** save silently, compute-on-read cascades.
   - **Case B — later-interval break:** surface **Re-snap dialog** listing the impossible later check(s). Options: `[Cancel edit]` or `[Delete later checks and save]`. After save, non-modal toast: *"Enter a new feed check to re-snap the line →"* with shortcut button.
   - **Case C — earlier-interval break:** surface conflict with `[Cancel edit]` only. No auto-delete of earlier checks.
   - **Case D — back-fill past-dated check:** same invariant check against both neighbors, resolves via B or C.

4. **Re-snap dialog** (`src/features/events/feed-check-resnap-dialog.js` or inline inside `edit-feed-check.js` — builder's choice). Simple modal with the warning copy + two buttons. Atomic on Confirm: delete impossible later check(s) + save the edit in a single transaction.

5. **Delete feed check** (existing) — keep as-is. No invariant check needed; deleting only widens an interval.

**Files:**
- New: `src/features/events/edit-feed-check.js`, optional `feed-check-resnap-dialog.js`.
- Modified: `src/features/events/event-detail.js` (wire per-row Edit button from §9 to the new dialog), `src/data/store.js` (transaction helper if not already generic enough for the re-snap atomic delete+save).

**No schema impact.** All fields already exist on `event_feed_checks`.

**Unit tests:** cover the four cases (A/B/C/D) with example check sequences and verify the dialog behavior + atomic delete+save transaction.

---

---

### OI-0082 — SP-10 §8a: Move Feed Out (new capability)
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P1
**Checkpoint:** SP-10 §8a
**Status:** closed — 2026-04-17. Migration 023 applied. 4-step sheet built. Entity updated. Wired to detail sheet.

**What this adds:** On any active event, a `Move feed out` action lets a farmer pull delivered feed back out — either to batch inventory or to another open event. Entry points: §8 Feed Entries card footer button and a per-row inline `Move out` action on each delivery row in the §8 list. Four-step sheet: current feed state → forced feed check (strikes the line) → amount + destination picker → confirm.

**Why it matters:** Field farmers do pull feed back out of pastures (bad weather, over-estimated, needed elsewhere). v1 had no way to record this; any attempt was a delete (losing history) or a negative-amount kludge. v2 needs explicit semantics so DMI / NPK / cost stay accurate.

**Schema impact (three new columns on `event_feed_entries`):**
- `entry_type` text enum (`delivery`, `removal`), default `'delivery'`
- `destination_type` text enum (`batch`, `event`) nullable
- `destination_event_id` uuid FK → events(id) ON DELETE SET NULL, nullable

Check constraints: `entry_type = 'removal'` → `destination_type IS NOT NULL`; `destination_type = 'event'` → `destination_event_id IS NOT NULL`; `destination_type = 'batch'` → `destination_event_id IS NULL`.

**CP-55/CP-56 impact:** CP-55 serializes all three. CP-56 defaults old backups to `delivery / NULL / NULL`. Migration bumps `schema_version`, adds `BACKUP_MIGRATIONS` no-op entry.

**Calc impact (compute-on-read, one-line change per calc):** DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day — sum deliveries minus removals. Default-safe because legacy rows are all `entry_type = 'delivery'`.

**Spec:** UI_SPRINT_SPEC.md SP-10 §8a (full spec including flow, writes, invariants, edge cases, same-day ordering policy).

**Files likely affected:** `supabase/migrations/NNN_feed_removal_columns.sql`, `src/entities/event-feed-entry.js`, `src/features/events/move-feed-out.js` (new), `src/features/events/event-detail.js` (§8 card footer + per-row action), `src/data/store.js`, calc registry entries, `src/data/backup-export.js`, `src/data/backup-import.js`, `src/data/backup-migrations.js`.

---

### OI-0081 — SP-10: Event Data Edit Consistency Suite
**Added:** 2026-04-17 | **Area:** v2-build / events / edit dialogs | **Priority:** P0 (blocks field testing)
**Checkpoint:** SP-10
**Status:** closed — 2026-04-17. All 7 phases implemented: snapshot/rollback, gap/overlap resolver, move feed out, group window edit, paddock window edit + OI-0064 reopen, event reopen, observations auto-save.

**What this is:** A suite of edit-behavior specs for every data field inside the Edit Event dialog (§3, §6, §7, §8, §9, §12, event-level dates). Establishes the "structural state requires explicit reconciliation; derived values cascade on read" rule, then applies it section by section.

**Why it matters:** Field testing is blocked until editing is predictable. Without this, users will create silent inconsistencies (overlapping group windows, feed entries dated before their event, invalid feed checks) that accumulate over time.

**Sections ratified (all in UI_SPRINT_SPEC.md SP-10):**
- §7 Groups — group window edit dialog; shared gap/overlap resolution routine with retro-place flow (reopen + close + snapshot rollback on cancel)
- §12 Sub-moves — paddock window edit; no gap detection (gaps are legal); entry from both §4 and §12
- Event-level dates — `date_in` direct edit with reject-on-narrow / confirm-on-widen; `date_out` via new Event Reopen action; three-option group-conflict resolver
- §8 Feed Entries — validation guards; new per-row `Move out` action
- §9 Feed Checks — invariant check on save (`consumed ≥ 0`); Re-snap dialog for impossible later checks
- §3 Pre-graze + §6 Post-graze Observations — inline auto-save on blur; silent cascade

**Separately:** §8a Move Feed Out is tracked in OI-0082 (has schema impact).

**Spec:** UI_SPRINT_SPEC.md SP-10 (full walkthrough, all seven sections ratified 2026-04-17).

**Core principle (promote to V2_APP_ARCHITECTURE.md at reconciliation):** derived values compute on read and auto-cascade; structural state (date-bounded records) requires explicit reconciliation via dialogs; edits never silently rewrite cross-record state.

**Files likely affected:** `src/features/events/event-detail.js` and all its sub-cards, `src/features/events/edit-group-window.js` (new), `src/features/events/edit-paddock-window.js` (new), `src/features/events/reopen-event.js` (new), `src/features/events/retro-place.js` (new — reopen + close flow with snapshot rollback), `src/data/store.js` (snapshot/rollback helpers), calc registry unchanged (compute-on-read already handles cascade).

**Dependencies:** §8a (OI-0082) adds schema columns; the rest is app-layer behavior only.

---

### OI-0080 — SP-9 Bulk Survey Header Missing + Implementation Audit
**Added:** 2026-04-17 | **Area:** v2-build / surveys | **Priority:** P1
**Checkpoint:** SP-9 correction
**Status:** closed — 2026-04-17

**Resolution:** Bulk header Row 1 added (Cancel, DRAFT, Expand/Collapse, Save Draft, Finish & Save, ✕). Surveys sub-tab implemented (draft resume banner, committed list with Edit). Bulk-edit now replaces prior observations instead of appending.

**What is wrong:** After SP-9 landed, the bulk survey sheet is missing its entire top action row. Six controls are absent: Cancel, DRAFT pill, Expand/Collapse all, Save Draft, Finish & Save, ✕ close. Only the date + filter rows render.

**Why it is wrong:** Violates SP-9 acceptance criterion: "Bulk header matches v1 exactly: Cancel (red text) · DRAFT tag · Expand/Collapse all · Save Draft · Finish & Save · ✕ · date · farm pills (>1 farm) · type pills · search." Users cannot finish/save or explicitly cancel a bulk survey — only the auto-save-on-close fallback works.

**Correct behavior:** Bulk header must render Row 1 (action buttons) per the `_renderBulkSurveyHeader()` extraction in spec §6.1. Mode switcher must make bulk header visible when mode is 'bulk'.

**Files affected:** `src/features/locations/index.js` (openSurveySheet)

**Scope expansion:** Full audit of SP-9 implementation — see SESSION_BRIEF_2026-04-17_sp9-bulk-header-audit.md for the 8-part checklist.

---

### OI-0079 — Field Mode: Single Pasture Survey Picker Sheet
**Added:** 2026-04-17 | **Area:** v2-build / field-mode | **Priority:** P3
**Status:** open — interim fallback in place (navigates to #/locations)

**Problem:** V1 has a dedicated pasture survey picker sheet for field mode single survey — user selects a location, then the survey form opens for that location. V2 field mode survey-single tile currently navigates to the locations screen as an interim.

**Fix:** Build `openPastureSurveyPickerSheet()` with farm/type filter pills and location cards, similar to the harvest field picker. On selection, open `openSurveySheet(locationId, operationId)`.

---

### OI-0078 — Field Mode: Heat Picker Sheet
**Added:** 2026-04-17 | **Area:** v2-build / field-mode | **Priority:** P3
**Status:** closed — 2026-04-17. 2-step heat picker built: animal selection with event/group filter pills + search, then recording form. Stays open for multi-record. Toast on save.

---

### OI-0077 — i18n Pass: Hardcoded English Strings Across UI Sprint Screens
**Added:** 2026-04-17 | **Area:** v2-build / i18n | **Priority:** P3
**Checkpoint:** post-UI-sprint
**Status:** open — deferred, batch fix

**Problem:** All UI sprint screens (animals, feed check, feed deliver, dashboard cards, sidebar/header, locations + all 7 connected dialogs) use hardcoded English strings for labels, placeholders, buttons, and messages instead of routing through `t()` from `src/i18n/`. The app is English-only today so this has zero user impact, but it means the i18n infrastructure isn't wired for these screens.

**Scope:** Mechanical fix — no logic or layout changes. For each screen: (1) identify every hardcoded user-facing string, (2) add a key to the locale file, (3) wrap with `t()`. Estimate ~200–300 strings across all sprint screens.

**Fix:** Single dedicated session after the UI sprint is complete. Do all screens in one pass to avoid per-screen overhead.

**No schema impact. No CP-55/CP-56 impact.**

---

### OI-0076 — DMI Chart Empty Bars — Deferred Until Fresh V2 Test Data
**Added:** 2026-04-17 | **Area:** v2-build / UI | **Priority:** P3
**Checkpoint:** post-UI-sprint
**Status:** open — deferred, needs fresh data

**Problem:** The 3-day DMI chart on location cards shows empty bars with "—" values. Likely caused by v1 migrated data not having the per-day breakdown that DMI-8 needs. Cannot verify or fix without fresh v2 test data generated through normal app usage.

**Fix:** Revisit after Tim has generated some new events and feed data in v2. May also depend on DMI-8 landing (OI-0069).

**No schema impact.**

---

### OI-0075 — Dashboard Locations Tab: 7 Display Bugs
**Added:** 2026-04-17 | **Area:** v2-build / UI sprint | **Priority:** P2
**Checkpoint:** UI sprint
**Status:** open — spec written, ready for Claude Code

**Problem:** Seven display issues on the Locations tab compared to v1: (1) "lbs lbs" double unit suffix on weight lines, (2) missing acreage next to location name, (3) missing green capacity line (Est. capacity / days remaining / ADA), (4) badge shows "stored feed" instead of "stored feed & grazing", (5) stored feed DMI value mismatch with v1, (6) missing number formatting with commas, (7) empty top stat cards (Pasture %, NPK/Acre, NPK Value). DMI chart bars deferred to OI-0076.

**Fix:** Spec file `github/issues/BUG_locations-tab-display-fixes.md`.

**No schema impact.** Visual/display only. No CP-55/CP-56 impact.

---

### OI-0074 — Event Detail Action Buttons: Wrong Layout and Missing CSS
**Added:** 2026-04-17 | **Area:** v2-build / UI sprint | **Priority:** P2
**Checkpoint:** UI sprint
**Status:** open — spec written, ready for Claude Code

**Problem:** Event detail sheet bottom buttons render as a flat flex row (Move All / Close and Move / Delete / Cancel) instead of v1's hierarchical layout (primary row, warning action, destructive action). Uses undefined CSS classes (`btn-olive`, `btn-danger`, `btn-ghost`) so buttons have no visible background color.

**Fix:** Spec file `github/issues/BUG_event-detail-action-buttons.md`. Restructure to: Save/Move All (green, flex:2) + Cancel (outline, flex:1) row, then Close & Move (amber, full-width), then Delete (red, small).

**No schema impact.** Visual only. No CP-55/CP-56 impact.

---

### OI-0073 — Group Placement Detection Picks Wrong eventGroupWindow
**Added:** 2026-04-17 | **Area:** v2-build / dashboard | **Priority:** P1 (blocks further field testing — dashboard placement is wrong for most groups today)
**Checkpoint:** UI sprint
**Status:** closed — 2026-04-18. Shipped with OI-0091. Part A — `renderGroupCard` at `src/features/dashboard/index.js:580` now prefers open-event windows with most-recent `dateJoined` tie-break. Part B — `supabase/migrations/025_close_orphan_group_windows.sql` applied and verified via MCP (0 groups with >1 open window post-apply; `schema_version` bumped 23→25; backup-migrations chain extended 23→24 reserved + 24→25 no-op). Part C — NPK NaN fix at root cause: NPK-1 returns `{nKg, pKg, kKg}` but dashboard read `result.n/.p/.k`; rewrote to defensive `result.nKg ?? result.n ?? 0` pattern at four sites. Post-OI-0091, new orphans are architecturally prevented going forward.

**Problem:** Dashboard Groups view shows most groups as "Not placed" despite having active events. Multiple `event_group_windows` rows per group have `date_left = null` (open), and `.find()` returns the first match in array order — which for most groups points to a stale window rather than the current open one. Bull Group works only by accident (its first match happens to be current).

**Root cause (widened 2026-04-17):** Orphaned open windows come from **two sources**:
- **(A) v1 migration** — v1 close/move flows didn't retroactively stamp `date_left` on migrated records; the v1 → v2 migration preserved those gaps.
- **(B) Fresh v2 flow bugs** — the cull flow (pre-OI-0086) and some pre-OI-0091 move-wizard paths left windows open instead of closing them. OI-0091 fixes the *new* sources; OI-0073 cleans up the *existing* orphans (both v1-migrated and v2-generated) so detection works today. Without OI-0073, OI-0091's split-on-state-change cannot be meaningfully field-tested — the dashboard still shows the wrong placement because the pre-existing orphans dominate the `.find()` result.

**Evidence:** Cow-Calf Herd has 10 open GWs (1 current, 9 orphans). Culls has 7 (1 current, 6 orphans). All groups follow the same pattern. Tim's Culls group appearing on both J2 and D (reported today) is a live instance of this bug — the move wizard correctly created a new open window on D, but existing orphans on J2 (and possibly others) are what render in both places.

**Fix — ships with OI-0091 package:** Three parts:
- **(A) Code fix** — `getGroupPlacement()` prefers GWs linked to open events; tie-break by most-recent `dateJoined`. Removes the silent `.find()` latent bug even if some orphans linger.
- **(B) Data cleanup migration** — one-shot SQL that closes orphaned open windows: for each group, keep the single most-recent open window and stamp `date_left = COALESCE(dateJoined, event.date_out)` on the rest. Run once as migration 025 (after OI-0091's logic ships so no new orphans are created post-cleanup). Reversible-by-restore via CP-56.
- **(C) NaN-in-NPK display fix** — secondary bug noticed in the same debug pass: NPK breakdown shows `NaN` when `animalClassId` is missing on a group. Fill with a best-effort default from `group.defaultClassId` or fallback class; log a warning. Keep the fix in this OI rather than spinning a new OI — it's a one-liner surfaced by the same investigation.

**Why ship with OI-0091:** Without OI-0091, fixing the orphans today doesn't stick — the cull/move/wean flows keep generating new ones. Without OI-0073, OI-0091's fix is invisible — the dashboard still reads stale orphans. Shipping them together gives Tim a single package to verify end-to-end.

**No schema impact for Parts A + C.** Part B is a one-shot data cleanup migration (no column change, just UPDATE statements). Minor CP-55/CP-56 impact for Part B: bump `schema_version` if run via migration chain; no export shape change. If run as pure SQL outside the migration chain, flag the drift in OPEN_ITEMS for a follow-up `schema_version` bump.

---

### OI-0072 — Feed Dialogs (Check + Deliver): V1 Parity UI Rebuild
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** UI sprint
**Status:** open — spec written, ready for Claude Code

**Problem:** Both feed dialogs (feed check and deliver feed) are bare-bones v2 implementations that don't match v1's UI patterns. Feed check is missing the stepper/slider/percentage triple-sync control and consumed-since-last-check banner. Deliver feed is missing the tap-to-select batch cards with inline quantity steppers, multi-batch support, feed-type grouping, and live DMI/cost summary.

**Fix:** Spec file `github/issues/feed-check-ui-v1-parity.md` covers both dialogs with full v1 layout descriptions, interaction patterns, and CSS classes. Includes extracted v1 HTML templates for Claude Code reference.

**No schema impact.** Visual/interaction only. No CP-55/CP-56 impact.

---

### OI-0071 — Event Detail Sheet: 7 UI Fixes (Post-Implementation Review)
**Added:** 2026-04-16 | **Area:** v2-build / UI | **Priority:** P1
**Checkpoint:** UI sprint (SP-2)
**Status:** closed — 2026-04-16

**Problem:** Tim reviewed the implemented SP-2 event detail sheet and found 7 issues: (1) edit event dialog missing save/cancel buttons, (2) pre-graze and post-graze fields not editable, (3) feed checks/entries/sub-moves missing inline edit buttons, (4) DMI/NPK breakdown card positioned too low — should be right under DMI chart, (5) deliver feed dialog missing required date/time, (6) deliver feed quantity stepper should use whole steps not 0.5, (7) move wizard buttons don't navigate.

**Fix:** Session brief `SESSION_BRIEF_2026-04-16_event-detail-ui-fixes.md` with all 7 fixes detailed. Fix 4 also requires updating the reader order in GH-10 spec.

**Resolution:** All 7 fixes implemented by Claude Code (2026-04-16).

---

### OI-0070 — EST-1: Estimated vs Actual Pasture Accuracy Comparison
**Added:** 2026-04-16 | **Area:** v2-design / calcs | **Priority:** P2
**Checkpoint:** post-UI-sprint
**Status:** open — spec'd, build later

**Problem:** No way to compare pre-graze estimates (how long the pasture should last) with actual outcomes (how long it did last). This feedback loop is essential for tuning forage type parameters over time.

**Fix:** New calc EST-1 (Event Pasture Accuracy) in the new Accuracy domain. Orchestrates existing calcs: FOR-1 (×2 for pre/post observations), FOR-3 (estimated days), DMI-1 (stored feed), DMI-3 (demand). Two surfaces: (1) summary card on the event detail sheet after event close, headline = "Estimated N days → Actual M days"; (2) accuracy trend report across all closed events. Includes a two-method sanity check (forage measurement vs mass balance). No schema impact.

**Spec:** V2_CALCULATION_SPEC.md §4.12 (added 2026-04-16). Session brief TBD when build is scheduled.

**Not blocking UI sprint.** Build after DMI-8 ships.

---

### OI-0069 — DMI-8: Daily DMI Breakdown Calc + 3-Day Chart
**Added:** 2026-04-16 | **Area:** v2-build / calcs | **Priority:** P1
**Checkpoint:** UI sprint (SP-2 + SP-3 chart)
**Status:** open — spec'd, ready for Claude Code

**Problem:** The 3-day DMI chart on both the dashboard card (SP-3) and event detail sheet (SP-2) is a deferred placeholder. Existing DMI calcs (DMI-1 through DMI-7) produce single aggregate values, not per-day breakdowns with a pasture vs stored feed split. The chart needs per-day data.

**Fix:** New calc DMI-8 (Daily DMI Breakdown by Date). Three-state output: `actual` (feed check exists — use DMI-5 interpolation), `estimated` (no check — forecast from declining pasture mass balance using FOR-1 initial DM), `needs_check` (no basis for estimate — grey bar). Source event bridge for continuity across moves. Forage type required with inline prompt fallback.

**Spec:** V2_CALCULATION_SPEC.md § DMI-8 (added 2026-04-16). Session brief: `SESSION_BRIEF_2026-04-16_dmi-8-daily-breakdown.md`.

**No schema impact.** Compute-on-read only. No CP-55/CP-56 impact.

---

### OI-0068 — SP-2 Pre-graze Observations: Inline Fields, Not Modal
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** closed — 2026-04-16

**Problem:** Pre-graze observations were implemented as read-only labels with an "Edit" button that opens a modal (`openPreGrazeModal`). The approved mockup (v4) shows inline editable fields: forage height input, forage cover input + slider, quality input, condition chip picker. Tim confirmed (2026-04-16) that inline is correct — fields should be embedded directly in the detail sheet, not behind a modal.

**Fix:** Replace the read-only + modal pattern with inline editable fields per the v4 mockup. Auto-save on blur (same pattern as Notes). Remove `openPreGrazeModal`. CSS from the mockup (`.obs-line`, `.obs-field`, `.cover-slider`, `.qual-picker`, `.qual-chip`) is production-ready.

**Doc impact:** GH-10 spec file § Pre-graze Observations updated 2026-04-16. UI_SPRINT_SPEC.md change log updated.

---

### OI-0067 — SP-2 Event Detail: Convert from Full-Screen Route to Sheet Overlay
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** closed — 2026-04-16

**Problem:** SP-2 event detail was implemented as a full-screen routed view (`#/events?detail={eventId}`). Tim's review (2026-04-16) determined it should be a sheet overlay matching the move wizard pattern. The route-based approach forces a full page navigation away from the dashboard, losing context.

**Fix:** Convert `src/features/events/detail.js` from routed view to sheet. Remove the `#/events?detail=` route. Dashboard Edit button calls `openEventDetailSheet(event, operationId, farmId)` instead of `navigate()`. Sheet uses `ensureSheetDOM()` pattern. All 13 content sections stay the same — container change only.

**Doc impact:** GH-10 spec file updated 2026-04-16 (Navigation, Router Integration, Header sections). UI_SPRINT_SPEC.md § SP-2 updated.

---

### OI-0066 — Per-Group Move on Dashboard Card is Event-Scoped, Not Group-Scoped
**Added:** 2026-04-15 | **Area:** v2-design / UI sprint | **Priority:** P3
**Checkpoint:** Follow-up after SP-3
**Status:** open — follow-up

**Problem:** SP-3 dashboard card has a per-group Move button on each group row, but that button opens the event-scoped move wizard (same target as the card-level Move all). V1 and the eventual desired behavior is for the per-group Move to scope the wizard to that specific group window, so other groups on the event stay put.

**Fix:** Spec a scoped `openMoveWizard` variant that targets a single group window. Wire per-group Move rows to use it. Update SP-3 card accordingly.

**Why:** Keeps SP-3 implementation tight. Per-group-scoped move is additive and independent of the visual card rebuild.

**Doc impact:** `V2_UX_FLOWS.md` §13 (move wizard) and §17.7 (dashboard card) when the scoped variant is added.

---

### OI-0065 — Per-Group Reweigh Moves from Dashboard Card to Animals Area
**Added:** 2026-04-15 | **Area:** v2-design | **Priority:** P3
**Checkpoint:** Follow-up after SP-3
**Status:** open — DESIGN REQUIRED, do not build

**Problem:** V1 shows a per-group reweigh/scale icon next to the Move button on each group row of the dashboard location card. SP-3 removes this icon from the dashboard card and reserves reweigh for the Animals area of the app. The Animals-area entry point for reweigh is not yet spec'd.

**Fix (design required):** Spec the reweigh entry point in the Animals area. Questions to answer:
- Which Animals screen hosts the reweigh action (list, detail, group view)?
- What is the context — single animal, group, all animals on an event?
- How does it integrate with existing weight history (`animal_weights` or equivalent)?
- Does it live on the card-style list row, in the animal detail sheet, or both?

**Why:** Reweigh is an animals-domain action, not a pasture-event action. Keeping it on the dashboard card conflates the two domains and clutters the card. Moving it to Animals aligns with v2's separation of concerns.

**Doc impact:** `V2_UX_FLOWS.md` new section for reweigh flow; `V2_DESIGN_SYSTEM.md` if new patterns emerge.

**Not blocking SP-3** — SP-3 ships without per-group reweigh on the card. Reweigh design can happen in parallel.

---

### OI-0064 — Sub-move History: Manage Button Dropped; Reopen Folded Into Edit Dialog
**Added:** 2026-04-15 | **Area:** v2-design / UI sprint | **Priority:** P3
**Checkpoint:** SP-2 implementation
**Status:** closed — 2026-04-17. Paddock window edit dialog (edit-paddock-window.js) includes Reopen action for closed windows. Folded into SP-10 Phase 4.

**Problem:** The original §17.15 draft and mockup v1 showed a `Manage` button on each sub-move history row. During design review round 1 we dropped it — per-row affordances are now Edit only, and the reopen flow folds inside the Edit dialog (no inline Delete either). Logged so the decision is visible when the Edit dialog itself gets designed.

**Fix:** Captured in `github/issues/event-detail-view.md` (SP-2, § Sub-move History) and in `UI_SPRINT_SPEC.md` § SP-2. Edit dialog spec for reopen is a follow-up when that sheet is built (not part of SP-2).

**Why:** Every row action adds visual noise. `Manage` was redundant with Edit. The reopen case is rare enough to live one level deeper inside Edit.

---

### OI-0063 — event_observations Schema Alignment with paddock_observations
**Added:** 2026-04-15 | **Area:** v2-build / schema | **Priority:** P1
**Checkpoint:** SP-2 implementation (blocker)
**Status:** closed — 2026-04-15

**Resolution:** Migration 021 created `event_observations` table with all specified columns. Entity file `src/entities/event-observation.js` created with FIELDS, validate(), toSupabaseShape(), fromSupabaseShape(). Registered in store, sync-registry, push-all. BACKUP_MIGRATIONS entry added (20→21). V2_MIGRATION_PLAN.md §5.3a updated with `event_observations` at position 32 (after `event_paddock_windows`).

**Problem:** `event_observations` currently stores a subset of what `paddock_observations` stores. Pre-graze observations during an event should capture the same pasture-assessment data a standalone survey would (forage height, cover %, quality 1–100, condition enum), plus post-graze-only fields (residual height, recovery window min/max days). Without alignment, pre-graze observations can't overwrite/supersede the prior survey record for a paddock the way they should.

**Fix:** New migration adds to `event_observations`:
- `forage_quality` (integer 1–100)
- `forage_condition` (text enum: dry/fair/good/lush)
- `forage_cover_pct` (numeric — verify absence)
- `forage_height_cm` (numeric — verify absence)
- `stored_feed_only` (boolean default false)
- `post_graze_height_cm` (numeric nullable)
- `recovery_min_days` (integer nullable)
- `recovery_max_days` (integer nullable)
- `observation_phase` (text enum: `pre_graze` / `post_graze`)
- `paddock_window_id` (uuid FK → `event_paddock_windows(id)`)

Pre-graze read: `observation_phase = 'pre_graze' OR observation_phase IS NULL` (backward compat for old rows).

**CP-55/CP-56 impact:** Export must serialize all new columns; import must default nulls/false for old backups. Bump `schema_version` and add `BACKUP_MIGRATIONS` entry. If `paddock_window_id` FK changes restore ordering, update V2_MIGRATION_PLAN.md §5.3/§5.3a in the same commit.

**Why:** Event and paddock observations are the same pasture measurement taken from two directions — they must share the same field set or the pre-graze → post-graze → recovery lifecycle can't be represented.

**Doc impact:** V2_SCHEMA_DESIGN.md `event_observations` definition, V2_MIGRATION_PLAN.md §5.3/§5.3a (if FK order changes), CP-55/CP-56 spec entries.

---

### OI-0062 — Sheet DOM Pattern: Ensure-on-First-Use for Cross-Route Sheets
**Added:** 2026-04-15 | **Area:** v2-build / architecture | **Priority:** P3
**Checkpoint:** post-3.2
**Status:** open — DESIGN REQUIRED, do not build

**Problem:** Sheet wrappers are created as part of each route's DOM tree (~30 sheets across the codebase). This works when a sheet is opened from its own route, but breaks when a sheet needs to open from a different route (e.g., dashboard calling move-wizard). The wrapper element doesn't exist in the DOM, so the sheet silently fails to open.

**Partial fix applied (2026-04-15):** Three sheets that the dashboard calls (`move-wizard`, `close-event`, `create-survey`) now use the `ensureSheetDOM()` / ensure-on-first-use pattern — matching what `todo-sheet.js` already does. Each `open*` function checks for its wrapper by ID and creates + appends it to `document.body` if missing. The `getElementById` guard prevents duplicates when the route-level wrappers also exist.

**Remaining work (needs Cowork decision):** The other ~27 sheets still use the route-only pattern. This is fine as long as they're only ever opened from their own route. If future features need to call any of them cross-route, they'll need the same `ensureSheetDOM()` treatment. Options:
1. **Reactive** — apply the pattern only when a sheet needs cross-route access (current approach)
2. **Proactive** — migrate all ~30 sheets to ensure-on-first-use and remove the route-level wrappers (cleaner but higher touch count)
3. **App-shell** — create all sheet wrappers once in `main.js` (cleanest, but couples the shell to all features)

**Doc impact:** If Cowork chooses option 2 or 3, update V2_APP_ARCHITECTURE.md §6.2 (Sheet lifecycle) to document the pattern.

---

### OI-0061 — Onboarding Race: Duplicate Operation Created When localStorage Cleared
**Added:** 2026-04-15 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** 3.2
**Status:** closed — 2026-04-15

**Problem:** `showApp()` in `main.js` fired `syncAdapter.flush().then(() => pullAllRemote())` as a fire-and-forget promise, then synchronously checked `needsOnboarding()` (which reads `getAll('operations')` from localStorage). When localStorage was empty — after a clear, new device, or incognito — the pull hadn't finished yet, so the store had zero operations and onboarding ran, creating a duplicate operation in Supabase. This caused the same duplication loop cleaned up in OI-0060.

**Root cause:** The initial Supabase pull was not awaited before the onboarding gate check. The spec (V2_APP_ARCHITECTURE.md) expects the store to be hydrated from remote before any flow decisions.

**Fix:** Made `showApp()` async. Changed the initial sync from fire-and-forget to `await syncAdapter.flush(); await pullAllRemote();` so the store is hydrated from Supabase before `needsOnboarding()` runs. The `online` event listener remains unchanged (still awaits internally). All callers are compatible — none depend on the return value of `showApp()`.

---

### OI-0060 — Stale Test Operations in Supabase from Failed Import Attempts
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-Tier-3
**Status:** closed — 2026-04-15

**Problem:** Tier 3 import testing created multiple operation records from failed attempts that were never cleaned up. Known stale operation IDs: `0ee3e183` (schema_version 14), possibly `0a9fa989` and `7e28804d`. These orphaned operations and their child rows consume space and could confuse any future multi-operation queries.

**Fix:** Delete the stale operations and all child rows. Use the FK-dependency delete order from V2_MIGRATION_PLAN.md §5.3a (children → parents). Verify by querying `SELECT id, schema_version FROM operations` — only the current active operation should remain.

**Resolution:** Cleaned up 2026-04-15. Found 6 operations total (3× "Down East Beef and Lamb", 3× "Test") with 17 farms, 948 animals, 228 events across them. Deleted 5 stale operations and all child rows across all 44 tables with operation_id, keeping only `ef11ee62` (most recent successful migration). Verified: 1 operation, 1 farm, 79 animals, 19 events, 6 groups remain.

---

### OI-0059 — Migration 020 Needed: Capture operation_members RLS Simplification
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** pre-next-deploy
**Status:** open

**Problem:** OI-0058's fix (simplifying all 4 operation_members RLS policies to `user_id = auth.uid()`) was applied directly to Supabase via SQL during Tier 3 testing. No migration file exists in `supabase/migrations/`. The migration chain is out of sync with what's actually in the database — if anyone stands up a fresh Supabase instance from the migration files, they'll get the broken self-referential policies from migration 017.

**Fix:** Claude Code writes `supabase/migrations/020_simplify_operation_members_rls.sql` that:
1. Drops all 4 policies from migration 017 (SELECT, INSERT, UPDATE, DELETE)
2. Creates simplified replacements using only `user_id = auth.uid()`
3. Bumps `schema_version = 20`
4. Adds `BACKUP_MIGRATIONS` entry in `backup-migrations.js`

The SQL is already applied to Supabase — the migration file just captures it for the chain. Execute + verify per the standard migration rule.

---

### OI-0058 — operation_members RLS Policies Self-Referential — Infinite Recursion on All Reads
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — fixed 2026-04-14 (SQL applied directly in Supabase)

**Problem:** Migration 017 replaced the `operation_members` `FOR ALL` policy with 4 granular policies, but the SELECT, INSERT, UPDATE, and DELETE policies all contain self-referential subqueries like:
```sql
USING (user_id = auth.uid() OR operation_id IN (
  SELECT om.operation_id FROM operation_members om
  WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
));
```
When any other table's RLS policy runs `SELECT operation_id FROM operation_members WHERE user_id = auth.uid()`, Postgres applies operation_members' own SELECT policy, which queries operation_members again → infinite recursion. This was a latent bug since migration 017+018 that surfaced during Tier 3 import testing when pullAll hammered all tables simultaneously and the query planner evaluated both OR branches.

**Impact:** Every `pullAll` query fails with `"infinite recursion detected in policy for relation 'operation_members'"`. The import parity check reads 0 rows for every table → import always reports FAILED regardless of whether inserts succeeded. All background sync reads also fail.

**Fix:** Simplified all 4 operation_members policies to non-recursive versions using only `user_id = auth.uid()`:
- SELECT: `USING (user_id = auth.uid())`
- INSERT: `WITH CHECK (user_id = auth.uid())`
- UPDATE: `USING (user_id = auth.uid())`
- DELETE: `USING (user_id = auth.uid())`

This is correct for v2's single-user scope. When multi-user operations are added, a `SECURITY DEFINER` function will be needed to break the recursion chain (standard Postgres pattern).

**Migration needed:** Claude Code must write migration 020 capturing this policy change so the migration chain stays in sync with what's in Supabase.

---

### OI-0057 — v1 Migration Transform Leaves animal_classes Excretion Rates Null
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-57
**Status:** open

**Problem:** `v1-migration.js` §2.14 maps v1 animal classes to v2 format but leaves `excretion_n_rate`, `excretion_p_rate`, `excretion_k_rate` as `null` and `dmi_pct_lactating` as `null` (lines 273-274, comment: "seed with NRCS defaults post-migration"). When the import replaces the v2 onboarding defaults (which have full NRCS values from `seed-data.js`) with the v1-migrated classes, all NPK calculations break — they depend on non-null excretion rates.

**Fix:** In the v1 transform, populate NRCS defaults from `seed-data.js` `ANIMAL_CLASSES_BY_SPECIES.beef_cattle` based on the `role` value returned by `inferRole()`. The role-to-defaults lookup:

| role | excretion_n | excretion_p | excretion_k | dmi_pct_lactating |
|------|------------|------------|------------|-------------------|
| cow | 0.145 | 0.041 | 0.136 | 3.0 |
| heifer | 0.145 | 0.041 | 0.136 | null |
| bull | 0.145 | 0.041 | 0.136 | null |
| steer | 0.145 | 0.041 | 0.136 | null |
| calf | 0.145 | 0.041 | 0.136 | null |

If `inferRole()` returns an unrecognized role, use the cow defaults as fallback (most conservative for NPK).

**Note:** The excretion rates happen to be the same across all beef cattle roles (0.145/0.041/0.136 per NRCS standard). The key difference is `dmi_pct_lactating` — only cows get 3.0, all others null.

---

### OI-0056 — REFERENCE_TABLES Blocks Import Delete Phase — FK Constraint on operations
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-56 / CP-57
**Status:** closed — fixed 2026-04-14

**Problem:** `backup-import.js` `REFERENCE_TABLES` set includes 5 per-operation tables (`forage_types`, `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`). The `deleteTableRows()` function skips reference tables (they upsert instead of delete-then-insert). But these tables all have `operation_id` FK → `operations`. When the delete loop reaches `operations`, these undeletion rows block the delete with FK constraint violation: `forage_types_operation_id_fkey`.

**Root cause:** These 5 tables were misclassified as global reference data. They are per-operation seed data — each operation has its own forage types, animal classes, etc. Only `dose_units` and `input_product_units` are truly global (no `operation_id`, RLS disabled, per V2_SCHEMA_DESIGN.md DP#8 exemption).

**Fix:** Remove the 5 per-operation tables from `REFERENCE_TABLES`. Keep only `dose_units` and `input_product_units`. The backup is authoritative for all operation-scoped data — these tables should be deleted and re-inserted from the backup during import, like every other operation-scoped table.

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_reference-tables-import-fix.md`

---

### OI-0055 — Four Tables Missing operation_id Column — Breaks Import, RLS, and Scoped Queries
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-56 / CP-57
**Status:** closed — fixed 2026-04-14

**Problem:** Four child/junction tables were designed without a direct `operation_id` column, relying on transitive scoping through a parent FK:

| Table | Parent FK | Parent table |
|---|---|---|
| `todo_assignments` | `todo_id` | `todos` |
| `event_feed_check_items` | `feed_check_id` | `event_feed_checks` |
| `harvest_event_fields` | `harvest_event_id` | `harvest_events` |
| `survey_draft_entries` | `survey_id` | `surveys` |

This violates Design Principle #8 ("every user-data table has `operation_id`") and causes failures anywhere code assumes a direct `operation_id` column: backup import delete (`deleteTableRows()`), parity check (`parityCheck()`), RLS policies (which had to use join-based USING clauses), and any future operation-scoped query. The v1 import crashed on `todo_assignments` with `column operation_id does not exist` — zero data was imported.

**Root cause fix (not workaround):** Add `operation_id uuid NOT NULL` with FK to `operations` on all four tables. Migration 019 adds the column, backfills from parent, adds NOT NULL constraint, and creates standard granular RLS policies matching Pattern A from V2_INFRASTRUCTURE.md §5.1. Entity files, shape functions, and store calls updated to include `operation_id`. This eliminates the exception class entirely — no `INDIRECT_OPERATION_TABLES` map needed.

**CP-55/CP-56 impact:** Export must include the new column. Import delete and parity check work with the standard `operation_id` pattern (no special cases). BACKUP_MIGRATIONS entry 18 adds `operation_id` to these four tables in older backups by looking up the parent FK.

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_import-join-table-delete-fix.md`

---

### OI-0054 — Sync Adapter Uses Upsert Which Requires UPDATE Policy to Pass on INSERT
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — fixed 2026-04-14

**Problem:** `custom-sync.js` line 205 uses `.upsert(record, { onConflict: 'id' })` for every write. Supabase treats upsert as INSERT + UPDATE, requiring both policies to pass. During onboarding, the `operation_members` row doesn't exist yet, so any UPDATE policy that checks membership fails. This cascades to every table: operations (rejected despite `WITH CHECK (true)` on INSERT, because upsert also evaluates UPDATE policy) → operation_members (FK violation because operations row didn't land) → all other tables (RLS violation because no member row exists).

24 records dead-lettered on every onboarding attempt. Tier 3 migration testing is blocked.

**Root cause:** The sync adapter doesn't distinguish between new records (from store `add()`) and existing records (from store `update()`). It uses upsert for both, which is semantically incorrect and triggers the wrong RLS evaluation path.

**Two-part fix required:**

1. **Sync adapter (custom-sync.js):** `push()` must accept an `operation` hint ('insert' or 'update'). Store's `add()` passes 'insert' → sync uses `.insert()`. Store's `update()` passes 'update' → sync uses `.update().eq('id', id)`. Recovery/resync path keeps `.upsert()` (by the time recovery runs, the member row exists).

2. **RLS migration (018):** Split every `FOR ALL` policy into granular INSERT/SELECT/UPDATE/DELETE. INSERT uses `WITH CHECK (true)` (FK constraints enforce valid operation_id). SELECT/UPDATE/DELETE check membership. This is defense-in-depth: even if the sync adapter uses upsert, INSERT won't be blocked by the UPDATE check. See V2_INFRASTRUCTURE.md §5.1 for the updated patterns.

**Affects:** All tables with `FOR ALL` policies (~40 tables). All onboarding seed data. All Tier 3+ migration testing.

**Base docs updated:** V2_INFRASTRUCTURE.md §5.1 (RLS patterns), V2_APP_ARCHITECTURE.md §5.2 (sync write methods).

---

### OI-0053 — operation_members RLS Policy Infinite Recursion Blocks All Sync
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — partially fixed 2026-04-14, remaining work tracked in OI-0054

Dropped `operation_members_all` (FOR ALL, self-referential → infinite recursion). Replaced with 4 granular policies: SELECT (own row + operation members), INSERT (self-bootstrap via `user_id = auth.uid()` + admin/owner invite), UPDATE (admin/owner), DELETE (owner only). Applied missing migrations 014–016 to Supabase. Disabled RLS on `dose_units` and `input_product_units` (no `operation_id` column). Migration 017 written. Migration 001 updated for fresh DB setups. Schema version bumped to 17.

**Post-fix discovery:** The recursion fix alone was insufficient. The `operation_members` SELECT policy was further simplified to `USING (user_id = auth.uid())` to eliminate all self-referential subqueries. Even with that fix, sync still failed because the sync adapter uses `.upsert()` which requires UPDATE policies to pass during INSERT (see OI-0054).

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`

---

### OI-0052 — Onboarding Wizard Renders 3× on First Load
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** open — code fix required

`boot()` in `main.js` calls `showApp(app)` on initial load (line 70), which renders the onboarding wizard. Then Supabase's `onAuthStateChange` fires `INITIAL_SESSION` and `TOKEN_REFRESHED` events, each triggering the `onAuthChange` callback (line 81) which calls `clear(app)` + `showApp(app)` again. Each `showApp` call creates a new onboarding container and appends it. Result: 3 copies of step 1 visible.

Affects authenticated app shell too (duplicate headers/routes), but less visible because the content looks the same.

**Root cause:** `onAuthStateChange` fires for all events including `INITIAL_SESSION`, which duplicates the work `boot()` already did.

**Fix options:**
1. Guard `showApp` with a flag so it only executes once (reset on explicit logout)
2. Filter `onAuthStateChange` events — skip `INITIAL_SESSION` since `boot()` handles it; only react to `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` (and for token refresh, don't re-render)

---

### OI-0051 — Migration Summary Screen: Add "Copy Error Log" Button
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Tier-3-testing
**Status:** open — code addition required

The migration summary screen (`src/features/settings/v1-import.js`) shows success/failure/parity results and auto-downloads unparseable dose CSV, but provides no way to capture the error log for troubleshooting. During Tier 3 testing (real v1 data on the deployed site), Tim needs an easy way to share errors without opening DevTools.

**What to add:** A "Copy error log" button on all three migration result screens (success, parity failure, error). On tap, collects the last 50 `app_logs` entries (from in-memory logger buffer or Supabase query), any migration-specific warnings from the `audit` object, and the `result` object summary. Formats as text, copies to clipboard. Toast: "Error log copied."

**Where:** `showV1SuccessReport()`, `showV1ParityReport()`, and the error card in `handleV1Import()` — add button to each.

---

### OI-0050 — Onboarding & Settings Records Never Sync to Supabase
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** pre-CP-66
**Status:** closed — fixed 2026-04-14

All 10 `add()` calls in onboarding and all 5 `update()` calls in settings now include `toSupabaseFn` and `table` params. Full codebase audit confirmed no other `add()`/`update()` calls missing sync params. "Resync to server" button added to Settings → Sync & Data as recovery path for existing users (`pushAllToSupabase()` re-queues all localStorage data).

**Spec file:** `github/issues/BUG_onboarding-settings-sync-gap.md`

---

### OI-0048 — Migration: Observation Type Inference Defaults All to 'open'
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Type now inferred from raw v1 source string: `rawSource.includes('close') ? 'close' : 'open'`. Covers `event_close` and `sub_move_close`. 4 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0049 — Migration: Feed Transfer Source Linking Dropped
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Transfer pair index built before event loop, `source_event_id` resolved via `transferPairId` for both sides. Orphaned pairs logged to audit warnings. Stats tracked: `transferPairsFound`, `transferPairsLinked`, `transferPairsOrphaned`. 3 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0047 — Member Management & Invite Flow Missing from V2 UX Specs
**Added:** 2026-04-14 | **Area:** v2-design | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** open — spec written, pending approval

V2_UX_FLOWS.md §20.1 references "operation members list (admin only; link to member management)" but no §20.3 flow was ever designed. V1 had a working invite system (`sbInviteMember` + OTP email + `claim_pending_invite` RPC). V2's `operation_members` schema (§1.4) supports pending invites but there's no UI flow, no invite mechanism, and no build checkpoint.

**Spec file:** `github/issues/CP-66_member-management-invite.md`
**Schema impact:** Adds `invite_token uuid` column to `operation_members`. Impacts CP-55/CP-56.
**Decisions made:** Shareable link approach (admin copies URL, sends via text/email/etc.). No Supabase email service required. Email-based fallback claim preserved from v1 for belt-and-suspenders.

---

### OI-0046 — App Header Missing "Get The Hay Out" App Name
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-GH-5
**Status:** closed — fixed 2026-04-14

Added `t('app.name')` as `.header-app-name` element above the operation name in `src/ui/header.js`. Styled as 11px uppercase muted text (`--text2`). Does not compete with operation name or farm picker.

---

### OI-0040 — Move Wizard / Event Close Missing Residual Height + Recovery Day Inputs
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Added post-graze observation fields (residual height, recovery min/max days) to event close, move wizard close-out panel, and sub-move close. Added pre-graze observation fields (forage height, forage cover %) to move wizard destination panel and sub-move open. Validation controlled by `farm_settings.recovery_required`. Fields pre-fill from farm_settings defaults. New `observation-fields.js` helper module reused across all 3 surfaces. `createObservation()` extended with optional `fields` parameter. Recovery required toggle added to Settings.

---

### OI-0041 — Move Wizard Missing Pre-Graze Observation Fields
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — merged into OI-0040 fix (2026-04-14)

Pre-graze fields (forage height, forage cover %) added to move wizard destination panel and sub-move open sheet.

---

### OI-0042 — Health Recording: Group Session Mode Not Implemented
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-CP-57
**Status:** open — deferred to Phase 3.5 (Polish). Single-animal mode is functional; group iteration is a workflow convenience.

V2_UX_FLOWS.md §14 specifies group session mode for Weight, BCS, and Treatment recording (iterate through animals in a group). This is not implemented — health recording is single-animal only. No advance-to-next or group iteration pattern in weight.js, bcs.js, or treatment.js.

---

### OI-0043 — Field Mode Tile Navigation Targets Incorrect
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

"Harvest" tile now navigates to `#/harvest` (the harvest recording screen) instead of `#/feed` (feed inventory). "Feed Animals" stays at `#/events` which is the correct parent screen for feed delivery actions. Direct-to-sheet opening deferred — the parent screen navigation gives the user the right context.

---

### OI-0044 — Remaining i18n Hardcoded Strings (6 low-priority)
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

All 28 i18n violations fixed. Final 6: mobile-events-screen.js detail summary, reports/reference-console.js title, rotation-calendar/toolbar.js add button, settings parity reports, amendments/entry.js currency display.

---

### OI-0045 — Dead Export: daysBetweenExact() in date-utils.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Removed `daysBetweenExact()` from `src/utils/date-utils.js` and its 3 tests from `tests/unit/date-utils.test.js`.

---

### OI-0039 — §2.25 Spec Text Describes Per-Element Rows but Schema Uses Single Row
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design | **Priority:** P3
**Checkpoint:** CP-57
**Status:** closed — spec updated 2026-04-14

**Resolution:** V2_MIGRATION_PLAN.md §2.25 rewritten to match the implemented schema: one row per effective date with three price columns (`n_price_per_kg`, `p_price_per_kg`, `k_price_per_kg`), not three rows with an `element` discriminator. Code was already correct. Spec-only fix.

---

### OI-0037 — CP-57 Drift: schema_version hardcoded instead of imported from backup-import.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/data/v1-migration.js` defines its own `CURRENT_SCHEMA_VERSION = 14` constant. §2.8 says "Read dynamically — same constant or derivation that CP-55 export uses per §5.11." If a new migration lands, v1-migration.js would retain stale value.

**Spec violated:** V2_MIGRATION_PLAN.md §2.8 (`schema_version` row) and §1.6 (`schema_version: current build's schema version (read dynamically per §5.11)`).

**Correct behavior:** Import `CURRENT_SCHEMA_VERSION` from `backup-import.js` (the single source of truth) instead of declaring a duplicate constant.

**Files affected:** `src/data/v1-migration.js`

---

### OI-0038 — CP-57 Drift: auto-backup not skipped for empty operations per §1.6
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/features/settings/v1-import.js` calls `importOperationBackup()` unconditionally. §1.6 says "CP-57 skips the auto-backup step when the target operation has no existing data." On first migration an empty operation produces a useless auto-backup download.

**Spec violated:** V2_MIGRATION_PLAN.md §1.6 (CP-57 Architecture — CP-56 steps that CP-57 skips).

**Correct behavior:** Add a `skipAutoBackup` option to `importOperationBackup()`. CP-57 passes `skipAutoBackup: true` when the target operation is empty (no events, animals, or locations). CP-56's own import path never sets it.

**Files affected:** `src/data/backup-import.js`, `src/features/settings/v1-import.js`, `src/data/v1-migration.js`

---

### OI-0036 — Remove v1 Import Option from Settings After Cutover
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-cutover
**Status:** open — deferred until v2 is live and v1 migration is complete

The "Import from v1" option in Settings → Import (CP-57) is a one-time migration tool. After Tim has migrated, verified data, and gone live in v2, the v1 import entry point should be removed from the UI. Not urgent — it does no harm sitting there — but it's cleanup that keeps Settings tidy.

**Fix:** Remove the "Import from v1" button/section from the Settings → Import screen. Delete or gate the migration transform code behind a feature flag or remove entirely. One PR after cutover is confirmed.

---

### OI-0020 — Calc Reference Console Destination (Reports → Settings)
**Added:** 2026-04-13 | **Area:** v2-design → v2-build | **Priority:** P3
**Checkpoint:** post-CP-54 (future)

The Calc Reference console (renders all registered formulas grouped by domain) currently lives in Reports and is reached as a tab alongside the six report tabs listed in §4.6. It is a developer/audit surface, not a user-facing report. The right long-term home is **Settings → Developer** (or equivalent), which keeps Reports focused on user-facing analytics.

**Why defer:** moving it now expands CP-54 scope. Reports already renders it; no user-visible regression by leaving it there one CP longer. The Settings surface for this doesn't yet have a design.

**Fix path:**
1. Design a Settings → Developer (or Settings → Advanced) section that houses the calc reference (and any other admin/diagnostic surfaces).
2. Move the console render from Reports to the new Settings section.
3. Remove the tab from Reports; update §4.6 to list exactly the 6 tabs with no "plus Calc Reference" aside.
4. Grep and delete any `#/reports/reference` routes.

**Out of scope for CP-54.** Claude Code should leave the reference console in Reports for this checkpoint.

---

### OI-0012 — Calc Test Coverage Gap
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Added 29 targeted tests to `tests/unit/calcs.test.js` (13 → 42 total): DMI-1 residual-by-date regression (3 tests), DMI-2 lactation branching beef vs dairy (3 tests), DMI-5 interpolation (2 tests), FED-1 residual percentage (3 tests), CST-1 feed cost (2 tests), CST-2 batch unit cost (2 tests), CST-3 NPK value (2 tests), REC-1 strip graze independent recovery (1 test). All requested coverage gaps addressed.

---

### OI-0013 — Reference Console Description Spot-Check
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Audited all 37 `registerCalc()` calls across 4 files (core.js, feed-forage.js, advanced.js, capacity.js) against V2_CALCULATION_SPEC.md §4. Found 1 mismatch: CST-2 description said "cost_total / quantity_original" but spec says "bidirectional" — corrected. All other 36 descriptions match (some code descriptions add clarifying detail beyond the spec, which is acceptable).

---

### OI-0008 — CP-17: Location Picker Recovery Section Always Empty
**Added:** 2026-04-12 | **Updated:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** CP-17
**Status:** open — unblocked, ready to build

**No longer blocked.** OI-0040 fix landed — close observations now capture `recovery_min_days` and `recovery_max_days`. REC-1 calc is implemented in `src/calcs/advanced.js`. All the data and calc pieces exist.

**What remains:** Wire REC-1 into the location picker in `src/features/events/index.js` (line ~644 `renderLocationPicker()`). Currently a comment at line ~664 says "without paddock_observations we can't determine recovery status" and puts all non-in-use land locations into "Ready."

**Fix:**
1. For each non-in-use land location, query its most recent close observation (`type='close'`)
2. If that observation has `recoveryMinDays`, run REC-1 to get `earliestReturn`
3. If today < `earliestReturn` → classify as "Recovering" instead of "Ready"
4. Add a "Recovering" section to the sections array (between Ready and In Use)
5. ~15–20 lines of code. No schema change, no new calc.

---

## Closed

### OI-0035 — Schema Version Bump Convention Not Spec'd
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design / v2-build
**Resolution:** Convention defined and codified in two places: (1) **V2_MIGRATION_PLAN.md §5.11a** — new subsection "Schema Version Bump Convention" specifying that every new migration SQL ends with `UPDATE operations SET schema_version = N;` and adds a `BACKUP_MIGRATIONS` entry (no-op is fine: `N-1: (b) => { b.schema_version = N; return b; }`), plus update §5.3/§5.3a if the migration adds a table or FK. (2) **CLAUDE.md Code Quality Check #6** — enforced at commit time, same three requirements. Principle: "always do it, no judgment calls" — removes the need for case-by-case assessment of whether a migration changes backup shape.

---

### OI-0034 — CP-57 §2.7 Unparseable-Dose Audit Report Surface
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Downloaded CSV file. Format: one row per unparseable dose (animal tag, date, raw dose text, treatment_type, notes). Downloaded automatically at end of migration alongside the summary screen. V2_MIGRATION_PLAN.md §1.4 (Audit Report) and §2.7 updated to specify CSV download surface.

---

### OI-0033 — CP-57 §2.23 Calculation Parity Check — Promote to Formal AC
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Promoted to formal CP-57 acceptance criterion. NPK parity check: v1 stored NPK per event vs v2 on-read NPK calc, flag deltas >1% in the audit report. V2_MIGRATION_PLAN.md §1.4 updated with parity check bullet. Reference in §2.23 retained.

---

### OI-0032 — CP-57 Architecture: Reuse of CP-56 Import Pipeline
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Confirmed: CP-57 reads v1 JSON → applies 24 transforms → produces a v2-shaped backup envelope (same format as CP-55) → feeds into CP-56 import pipeline. Gets FK-ordering (§5.3a), parity check, and migration chain for free. Auto-backup step skipped when target operation is empty (one-off migration, nothing to back up). `schema_version` in synthesized envelope set to current. Documented in new **V2_MIGRATION_PLAN.md §1.6** (CP-57 Architecture).

---

### OI-0031 — CP-57 Tool UX: Where Does the Migration Tool Live?
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Settings → Import, alongside CP-56's "Import backup." Labeled "Import from v1." File upload (v1 JSON export). Re-run allowed (user can retry after failed attempt). Documented in new **V2_MIGRATION_PLAN.md §1.7** (CP-57 Tool UX). Post-cutover cleanup: OI-0036 added to remove the v1 import option after migration is complete.

---

### OI-0030 — CP-57 §1 Missing: v1 Export JSON Shape
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Option (a) — snapshot v1 export shape into v2 docs. New **V2_MIGRATION_PLAN.md §1.5** documents the complete v1 `S` object: 26 arrays (events, paddocks, animals, groups, etc.), objects/scalars (users, operationSettings, settings sub-fields), each with §2 transform cross-reference. Pulled from v1's `ensureDataArrays()` in index.html and ARCHITECTURE.md data model section.

---

### OI-0029 — CP-57 §2.14 animal_classes — Verify Rename/Splits Alignment
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Verified against `supabase/migrations/003_d3_animals_groups.sql`. §2.14 field list matches current schema. Added `archived = false` row to §2.14 for all migrated classes (column exists in schema, not previously in the transform spec). No rename/split drift found — the "rename/splits" noted in CLAUDE.md referred to earlier design iteration, not a code-level divergence.

---

### OI-0028 — CP-57 §2 Missing Transform: npk_price_history
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 tracks only current NPK prices (not history) in `operation_settings` JSONB (`nPrice`/`pPrice`/`kPrice`). Migration creates one `npk_price_history` row per element (N, P, K) with `effective_date = migration date` and current prices converted from $/lb to $/kg. New **V2_MIGRATION_PLAN.md §2.25** (npk_price_history) documents the transform. Tim confirmed current values with migration date as first record is the right approach.

---

### OI-0027 — CP-57 §2.24 user_preferences.active_farm_id Default for Migrated Prefs
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added `active_farm_id = NULL` to V2_MIGRATION_PLAN.md §2.24 user_preferences transform. Puts migrated user in "All farms" mode; they can pick an active farm after migration. v1 has no multi-farm concept. One-line spec update.

---

### OI-0026 — CP-57 §2.8 operations.schema_version Stamp During Migration
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added row to V2_MIGRATION_PLAN.md §2.8 operations transform table: `schema_version | Set to current schema version at time of migration. Read dynamically per §5.11.` Ensures migrated operations get the correct stamp for subsequent backups/imports.

---

### OI-0025 — CP-57 §2.7 Animal Notes Routing: animal_notes Table vs animals.notes Field
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 type='note' health events → `animal_notes` table rows (one per note, `noted_at` from health event date). v1 `animals.notes` (free text field) stays as-is in `animals.notes` — not moved to `animal_notes`. V2_MIGRATION_PLAN.md §2.7 rewritten with updated notes routing. Tim confirmed: not many notes, so the clean one-per-row approach works.

---

### OI-0024 — CP-57 §2.3 event_paddock_windows Strip Graze Defaults
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added paragraph to V2_MIGRATION_PLAN.md §2.3 specifying full-paddock defaults for all migrated paddock windows: `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100`. Verified against migration 005 (`is_strip_graze DEFAULT false`, `area_pct DEFAULT 100 CHECK > 0 AND <= 100`) and V2_SCHEMA_DESIGN.md §5.2 — DB defaults match the migration values, but the spec sets them explicitly for clarity. v1 has no strip graze concept; users wanting strip graze on previously-migrated events would close and re-create. Note: `area_pct = 100` confirmed as the "full paddock" value (not NULL).

---

### OI-0023 — CP-57 §2.2 events.source_event_id Default for Migrated Events
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added line to V2_MIGRATION_PLAN.md §2.2 events transform table: `source_event_id | NULL for all migrated events. New in v2 (GH-5, migration 014) — links cross-farm moves. v1 has no equivalent; all migrated events are origin events.` No design discussion needed — v1 has no cross-farm move concept.

---

### OI-0021 — CP-56 Transaction Strategy (Atomic Restore)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Option B — per-table client-side replace in FK-dependency order, with halt-on-first-failure.** No Postgres stored procedure. Rationale: the payload-size ceiling on Supabase `rpc` (~50 MB even with bumped limits) would force chunking for real operations, and chunked RPC is not atomic across chunks either — so Option A gives atomicity in dev and a fake promise in production. Option B keeps the implementation surface smaller (no SQL function to maintain in lockstep with schema changes), fails loudly at the specific table/row that violated, and is safe because the auto-backup file from OI-0022 is the rollback mechanism. Decision locked in V2_MIGRATION_PLAN.md §5.7.6 (wholesale replace, halt, reference §5.3a for order). FK-ordering authoritative list added as new §5.3a with two-pass pattern for `animals` and `events` self-references. CLAUDE.md "Known Traps" updated with FK-ordering rule pointing at §5.3a.

### OI-0022 — CP-56 Revert Safety Net (24h Stash Mechanism)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Auto-downloaded pre-import backup file.** Before the destructive replace runs, CP-56 calls the CP-55 export path to produce a fresh backup of the current operation state and triggers a browser download named `gtho-v2-auto-backup-before-restore__{slug}__{timestamp}__schema-v{N}.json`. Revert = re-import that file via the normal import flow. No in-app stash, no localStorage quota problem, no IndexedDB surface, no Supabase side table. If the auto-backup fails to produce (sync pending, offline, download blocked, disk full), CP-56 halts before the destructive replace — the import does not proceed without a safety net. Decision locked in V2_MIGRATION_PLAN.md §5.7.4 (step 4 of import procedure) and new §5.7a (Revert Mechanism — Design Decision) covering rationale, tradeoffs, and failure modes.

### OI-0019 — No Logout Affordance in Header (v1 Parity)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Designed alongside OI-0015 since they share the same header real estate. User menu button (circle with initials) added to right cluster; tap opens popover with user email and Log Out. Logout triggers confirm dialog only when unsynced writes exist in the queue. Field Mode exits first before logout. Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0015 — Header Shows Farm Name, Needs Operation Name + Farm Picker
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Full design locked. Key decisions: (1) `user_preferences.active_farm_id uuid NULL` — per-user, syncs across devices, null = "All farms" mode; (2) "All farms" mode supported — farm-scoped screens aggregate with per-record farm chips; (3) switch-with-unsaved-work shows a confirm dialog (Switch anyway / Cancel), drafts stay tied to their source farm; (4) active farm scopes display, not permissions — wizards include a **farm chip** at the top of destination pickers so cross-farm moves work without context switching; (5) **no event straddles farms** — whole-group cross-farm moves close the source event and open a new event linked by `events.source_event_id`; (6) individual animal cross-farm moves are membership edits only, no new event; (7) **build stamp restored** to header right cluster for testing diagnostics; (8) event cards render directional markers ("← from {farm}" / "→ to {farm}") when `source_event_id` links to an event on a different farm. Doc updates applied to V2_SCHEMA_DESIGN.md (§1.5, §5.1), V2_UX_FLOWS.md (§1, §17.2, new §18), V2_DESIGN_SYSTEM.md (§3.6). Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0017 — Product Add Dialog Missing Unit Selection
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added unit selection (from `inputProductUnits`) to the input product create/edit sheet in `src/features/amendments/reference-tables.js`. Saves `unitId` on the product. Unit name shown in product list. Feed type sheet already had a unit selector (bale/ton/kg/lb). Treatment recording sheet already had dose unit selector. The gap was only on amendment input products.

---

### OI-0018 — Sync Status Not Shown in App Header
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added compact sync indicator to `src/ui/header.js` — dot-based (sync-ok/sync-pending/sync-err/sync-off classes from existing §3.14 design tokens). Reads from `getSyncAdapter().getStatus()`. Tap navigates to `#/settings`. CSS button in `.header-sync-btn`. No duplicate logic — reuses existing store sync state.

---

### OI-0016 — Dose Units: No Add/Edit UI
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added dose unit CRUD to `src/features/health/reference-tables.js` — add/edit sheet, archive action, list with testids. Follows existing category/type pattern. No schema change needed (table exists). Seed data preserved; users can now extend.

---

### OI-0014 — Event Close Manure Transaction volumeKg Placeholder
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Verified architecturally sound. `volumeKg=0` is a deliberate placeholder — the stored record links the event to the manure batch for tracing. Real volume requires NPK-1 calc inputs (excretion_rate × avg_weight × head_count × duration × capture_pct). Reports will compute at display time via NPK-1, not from the stored column. Code comment updated in `close.js` to document this decision. No functional change needed until Phase 3.4 amendments reports are built — re-verify when writing that display path.

---

### OI-0011 — Feed Screen Metrics Still Show Placeholders
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Wired DM on hand (sum batch.remaining × dm_pct for non-archived batches), daily run rate (average daily DM delivered over 30 days from event_feed_entries), and days on hand (DM on hand ÷ run rate) into feed day goal banner. Progress bar threshold coloring now works. Three stat cells added below the heading. Unit-aware via display().

---

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Design integrated into main docs. Schema (V2_SCHEMA_DESIGN.md §5.2 event_paddock_windows) has `is_strip_graze`, `strip_group_id`, `area_pct`. Calc spec (V2_CALCULATION_SPEC.md) NPK-3, FOR-1, REC-1 updated for effective strip area. UX flows (V2_UX_FLOWS.md) §1.4 (move wizard strip graze option), §2.4 (advance strip action), §11 (event card strip progress) all documented. Design system §3.15 covers strip grazing progress component. Decision logged as A45 in V2_BUILD_INDEX.md. Spec remains at `github/issues/strip-grazing-paddock-windows.md` for Claude Code when this work is picked up during the rotation calendar (CP-54) or a dedicated checkpoint.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Design decision made: unit system lives on `operations` (operation-wide, same rationale as currency). Schema amended — `operations.unit_system text NOT NULL DEFAULT 'imperial' CHECK IN ('metric','imperial')`. Decision logged as A44 in V2_BUILD_INDEX.md. V2_INFRASTRUCTURE.md §1.3 added. V2_MIGRATION_PLAN.md §2.8 updated. Implementation spec written: `github/issues/unit-system-operations-migration.md` — includes localStorage → operation migration path, full list of unit-sensitive settings that must re-render on toggle, and input field conversion behavior.

---

### OI-0009 — Desktop Layout: Nav Sidebar Overlaps Main Content
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added `grid-column: 2` to `.app-content` in the `@media (min-width: 900px)` block of `src/styles/main.css`. This places the main content in the `1fr` column (right side), while the fixed nav covers the 220px left column. GH issue #1.

---

### OI-0010 — Dashboard Home Screen Not Rendering Per v1 / Missing §17 Implementation
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Complete rebuild of dashboard per V2_UX_FLOWS.md §17. Header bar updated to show farm name. Farm overview stats row (5-metric desktop, 3-metric mobile with threshold colors). Period selector pills (24h/3d/7d/30d/All). View toggle (Groups/Locations, default locations for new users). Group cards with composition line, location status bar, DMI progress, NPK deposited, action buttons (Move/Place/Weights/Edit), and collapse/expand on mobile. Location cards with active events by location, group lists, feed status, strip graze info, and unplaced groups section. Open tasks section (4 compact todo cards + Add task + All tasks link). Survey draft card (conditional). Weaning nudge (conditional). Mobile bottom nav (7 items, fixed bottom). Todos feature UI created: `src/features/todos/` with todo list screen (`#/todos` route), 3-axis filter bar (status/user/location), todo create/edit sheet, todo card component (compact + full modes). Todos nav entry with red badge (open count) on both desktop sidebar and mobile bottom nav. GH issue #2.

---

### OI-0003 — Animal Notes: No Schema Table
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-design
**Resolution:** Option A — add `animal_notes` table (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Tim confirmed animals need notes. Schema amendment needed in V2_SCHEMA_DESIGN.md D9. V2_UX_FLOWS.md §14.8 updated to remove pending-decision language.

---

### OI-0004 — CP-22: Pull/Merge from Supabase Not Implemented
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Built sync registry (`src/data/sync-registry.js`) mapping all 50 entity types to table names + `fromSupabaseShape`. Added `mergeRemote()` to store (remote wins when `updated_at` newer, 5 unit tests). Added `pullAllRemote()` orchestrator (`src/data/pull-remote.js`). Wired into boot (flush queue then pull) and reconnect (window 'online' → flush then pull).

---

### OI-0006 — CP-18: Advance Strip Button Not Rendered
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Advance Strip button now renders on event cards when any paddock window has `isStripGraze=true` and is open. Sheet has two phases: close current strip (date/time) + open next strip (date/time). "End strip early" closes without opening next. Strip progress label shows "Strip N of M — Location". Creates close + open observations. Forage fields deferred to Phase 3.3. Strip progress bar visualization (§3.15) deferred — label only for now.

---

### OI-0007 — CP-17/18/20: Paddock Observations Not Created
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Added `createObservation()` helper. Observations now created at all 5 locations: event creation (open), sub-move open (open), sub-move close (close), move wizard (close per source window + open for destination), event close (close per window). Forage height/cover/quality fields remain null until Phase 3.3 populates them.

---

### OI-0005 — CP-23: E2E Test Has Wrong Selectors and Was Never Run
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Fixed 3 onboarding selector mismatches (`onboarding-op-name` → `onboarding-operation-name`, `onboarding-next` → step-specific `onboarding-next-1/2/3`, `.onboarding` → `[data-testid="onboarding-wizard"]`). Changed auth flow from signup to login (Supabase rejects fake email domains). Added `beforeAll` guard requiring E2E_EMAIL/E2E_PASSWORD env vars. All 35 selectors verified against source. Playwright browsers confirmed installed. Test requires pre-created Supabase auth account to run.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-18 | Paddock-side window-split architecture (OI-0095 + follow-up batching) | After OI-0094 shipped, Tim asked to walk every event-window trigger systematically (group change, acreage change, weight change, feed) to catch anything the group-side pass missed. Walk surfaced: (1) feed is not a window trigger (time-stamped ledger, correct as-is); (2) weight has two real gaps on the group side — per-animal Quick Weight sheet (`src/features/health/weight.js`) never calls `splitGroupWindow`; Edit Animal `currentWeight` input is created but silently no-ops in `saveAnimal`; (3) §7 Remove group in OI-0090 session brief was incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point (closes the PW but doesn't touch `animal_group_memberships`); (4) **acreage/area is the biggest architectural miss** — `event_paddock_window` has the row structure for splits (GH-4 added `is_strip_graze`/`strip_group_id`/`area_pct` columns) but no discipline of splitting. `edit-paddock-window.js` mutates `area_pct` in place on open windows, destroying historical effective-area; `submove.js` Advance Strip splits correctly but the pattern is inline, not a reusable helper; `reopen-event.js` blindly reopens closed PWs without a classifier analog to OI-0094's `classifyGwsForReopen`. **OI-0095 added** (P0, architectural fix — paddock analog of OI-0091). Scope: new `splitPaddockWindow` + `closePaddockWindow` store helpers; new `getOpenPwForLocation` calc helper; lift Advance Strip onto the helper; route `edit-paddock-window.js` `areaPct`/`isStripGraze` edits through the helper on open windows; route `move-wizard.js` close loop through `closePaddockWindow`; build `classifyPwsForReopen` + summary dialog on reopen; fix hard-coded `areaPct: 100` reads in `dashboard/index.js` + `locations/index.js`; audit `calcs/feed-forage.js` + rotation-calendar reads; orphan prevention (helper assertions) + one-time cleanup; extend `V2_APP_ARCHITECTURE.md` §4.4 with paddock-side subsection and grep-contract row. No schema change (GH-4 columns already exist). No CP-55/CP-56 impact (more rows over time; existing export/import handles the table). Thin pointer `github/issues/paddock-window-split-architecture.md` written; session brief deferred until the two smaller follow-ups (weight-side OI + §7 Remove group correction) are drafted so they batch into a single Claude Code handoff per Tim's direction: *"lets walk through all event window related items and wrap it all in at the end."* |
| 2026-04-17 | Group state-change entry-point audit (OI-0094 + OI-0093 — package 2 after OI-0091) | After OI-0091 went to Claude Code, Tim asked for an audit of every place in the app where an animal group can be altered, to catch any entry points OI-0091 missed. Greps across `src/features/animals/index.js`, `src/features/health/calving.js`, `src/features/events/group-windows.js`, `src/features/events/edit-group-window.js`, `src/features/events/reopen-event.js`, and `src/features/field-mode/index.js` turned up eleven entry points that mutate group state but do not call OI-0091's `splitGroupWindow` / `closeGroupWindow` helpers — every one a latent stale-snapshot bug once OI-0091 lands. Also audited feed flows: architecture there is different (no window split needed); all feed paths converge on `feed/delivery.js`. **OI-0094 added** (P0, package 2) — one-pass completeness fix across all eleven entry points. Tim's direction: ship as a separate package rather than widening OI-0091 mid-flight (Claude Code already executing package 1). **§7 per-row Edit sub-decision locked** — Tim, *"those two fields should be view only. That's how they were in v1 as well. System generated."* — `headCount` + `avgWeightKg` fields in `edit-group-window.js` render view-only on open windows (showing live values with "System generated from live memberships" caption), editable on closed windows (historical correction escape hatch). v1 parity + aligns UI with the OI-0091 rule (open = live, closed = snapshot). **OI-0093 added** (P1) — separate UI cleanup: remove green bulk action bar from Animals screen (redundant with per-row Edit + per-group tile actions; confirmed in Tim's screenshot), remove checkbox column, rewrite Edit Animal group dropdown to use v2 design-system picker pattern instead of raw `<select>`. OI-0093 removes entry point #11 from OI-0094's scope entirely. CP-55/CP-56 impact: none (no schema change, reuses OI-0091 helpers). Full spec in OI-0094 body with 11-row entry-point table + locked sub-decision + 7 acceptance criteria; thin pointers `github/issues/group-state-change-entry-point-completeness.md` and `github/issues/animals-bulk-action-bar-removal.md`; session brief `github/issues/SESSION_BRIEF_2026-04-17_group-state-change-completeness.md` with 5-phase implementation order gated on OI-0091 helpers being present. |
| 2026-04-17 | Event window split architecture (OI-0091 + OI-0073 package + OI-0092 stub + OI-0090 revision) | **OI-0091 added** (P0, architectural fix — silent calc correctness across DMI/NPK/AU-days/animal-days/cost). Tim hit two real-data bugs from his farm notes: (1) dashboard card + event detail §7 both showed 10 head for Shenk Culls after culling 4, while the Animals screen correctly showed 5; (2) after moving the remaining 5 from J2 to D, the group rendered on both locations with 10 head each. Investigation traced root cause to `event_group_window.head_count` + `avg_weight_kg` being captured as snapshots at window creation and never updated on mid-event state changes (cull / move / wean / split). Every calc surface and render surface reads the stale snapshot; the Animals screen only works because it reads memberships directly. Widened scope after Tim's follow-up ("Are calcs using real time or cumulation of stored?") — not just a display bug; DMI / NPK / AU-days / animal-days / cost are all ~50% overstated for his case. Architectural fix: treat `event_group_window` as a period of stable state, split the window on every state change with live values stamped at change date. New store helpers `splitGroupWindow` + `closeGroupWindow`. New calc helpers `getLiveWindowHeadCount` + `getLiveWindowAvgWeight` — open windows recompute live, closed windows read stored snapshot. All calc + render paths rerouted through helpers (grep check). **OI-0073 widened and packaged with OI-0091** — orphaned open windows come from two sources (v1 migration AND fresh v2 flow bugs pre-OI-0091); shipping together so the dashboard can be field-tested. Added Part C (NaN-in-NPK display one-liner). Part B adds migration 025 to close existing orphans. **OI-0090 revised** — Part 1 (automatic event_group_window cleanup via `onLastMembershipClosed` cascade) struck; subsumed by OI-0091's at-the-mutation-site split. SP-11 acceptance criteria updated to reflect new trigger (`maybeShowEmptyGroupPrompt` after OI-0091's window commit). OI-0090 now blocked by OI-0091. **OI-0092 added** (P2 stub, separate track) — v1 parity gap: `calcResidualOM()` + `feed_residual` NPK source exist in v1 but were dropped in v2; flagged explicitly so OI-0091 does NOT touch the `remainingQuantity: 0` line in move-wizard. CP-55/CP-56 impact: none for OI-0091 (no schema change, just more rows); migration 025 bumps schema_version 24 → 25 for OI-0073 cleanup only. Full spec in OI-0091 body with 13 acceptance criteria; thin pointer `github/issues/event-window-split-architecture.md`; session brief `github/issues/SESSION_BRIEF_2026-04-17_event-window-split.md` with 5-phase implementation order (helpers → reroute reads → wire flows → OI-0073 cleanup → doc + tests). UI_SPRINT_SPEC.md § SP-11 Part 1 + Cascade Logic sections struck with crosslinks. |
| 2026-04-17 | Empty group archive flow design (SP-11) | **OI-0090 added** (P1, silent data integrity). Tim hit a real bug: culled the last animal out of the Culls group (OI-0086 closed the membership correctly), then manually deleted the empty group, leaving the historical event showing "?" where the group name should render. Design session covered three interlocking issues: (1) no cascade from last-membership-closed to event_group_window, (2) no empty-group guidance for the farmer, (3) group delete allowed even when referenced by events. Resolved with integrated SP-11 spec: automatic cascade closes the event window on the change date with a toast, empty-group prompt offers Archive / Keep active / Delete (Delete disabled when group has event history), archive upgraded to first-class state via migration 024 replacing `groups.archived boolean` with `groups.archived_at TIMESTAMPTZ` (chosen for richer audit + upcoming schema audit session), reactivation path through group management UI for seasonal cohort reuse. CP-55/CP-56 impact captured: serialize `archived_at`, v23 → v24 backup-migrations chain maps old boolean to timestamp. Full spec in UI_SPRINT_SPEC.md § SP-11; thin pointer in `github/issues/empty-group-archive-flow.md`. Reconciliation checklist updated — SP-11 will merge into V2_UX_FLOWS §3.4 + §15.2 and V2_SCHEMA_DESIGN §3.3 at sprint end. |
| 2026-04-17 | OI-0089 closed — V2_SCHEMA_DESIGN.md catch-up | **OI-0089 closed** — added §5.8 `event_observations` (Domain 5, after §5.7 paddock_observations) and §9.11 `animal_notes` (Domain 9, after §9.10 animal_weight_records; Domain 9 per migration 012's "Domain 9 amendment" header, overriding the earlier "suggest §3.5" placement). Built from `SCHEMA_DUMP_2026-04-17.md` live columns so migration 022's `bale_ring_residue_count` on `event_observations` is captured. Change Log row added to V2_SCHEMA_DESIGN.md. No schema change; pure doc catch-up. Only remaining item from the local-only fields audit is now closed. |
| 2026-04-17 | Local-only fields audit (v2) | Full matrix audit written to `AUDIT_LOCAL_ONLY_FIELDS.md`: 6 checks × 53 tables using live Supabase (`SCHEMA_DUMP_2026-04-17.md`) as ground truth. Entity ↔ live column parity, shape round-trip, store param counts, sync-registry coverage, migration execution all clean (0 findings). Three findings, all on the backup/restore path: **OI-0087 added** (P1, silent data loss) — `event_observations` missing from `BACKUP_TABLES` (backup-export.js) and `FK_ORDER` (backup-import.js position 32); **OI-0088 added** (P0, round-trip breakage) — `CURRENT_SCHEMA_VERSION = 20` in backup-import.js is stale vs live `schema_version = 23`; **OI-0089 added** (P3, doc drift) — V2_SCHEMA_DESIGN.md missing `animal_notes` (migration 012) and `event_observations` (migration 021) sections. Both P0/P1 findings share one root cause: migrations 021/022/023 landed without the CLAUDE.md Export/Import Spec Sync Rule being followed. Session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md` written for Claude Code to fix OI-0087 + OI-0088 in one commit, including two recommended preventative unit tests (`BACKUP_TABLES.length === FK_ORDER.length` and `CURRENT_SCHEMA_VERSION === max(migration file numbers)`) that would catch this class of drift at commit time. |
| 2026-04-17 | Cull dialog design — animal edit stub fix | **OI-0086 added** (P1, silent data loss) — current v2 animal edit uses `window.prompt()` for cull reason only, sends `{ culled: true, cullReason }` where entity has no `culled` field (real field is `active`). Update call drops silently in `toSupabaseShape()`; no date, no notes, culled state never flips in UI. Schema/migration/entity already correct (`active`, `cullDate`, `cullReason`, `cullNotes` all present with full round-trip) — fix is UI-only. Spec written to `github/issues/cull-sheet-v1-parity.md` with v1 HTML verbatim (9 reason options, date picker, notes field, amber info banner, confirm/cancel buttons). Covers sheet, culled-state red banner with reason + date + notes + Reactivate, group membership close on cull date, e2e Supabase verification per CLAUDE.md pattern. No CP-55/CP-56 impact — columns already in spec. |
| 2026-04-17 | Post-SP-10 field-test block — §8 Feed Entries | **OI-0085 added** (P0, blocks field testing) — three bugs in §8 Feed Entries found during post-SP-10 testing: (1) feed name shows `?` because `renderFeedEntries` reads `batch?.feedName` instead of `batch?.name`; (2) delivery date is blank because it reads `fe.deliveryDate` instead of `fe.date`; (3) per-row Edit pencil opens the Add flow with no pre-fill — no real edit UI exists. Scope expanded to full v1 parity per Tim's direction: rebuild §8 to v1's **inline** pattern (Add/Edit form embedded in Edit Event dialog, not a separate sheet). V1 HTML/CSS/JS extracted into session brief `github/issues/SESSION_BRIEF_2026-04-17_oi0085-feed-entries-v1-parity.md`. Spec already ratified in UI_SPRINT_SPEC.md § SP-10 §8 — this is implementation catch-up, not new design. |
| 2026-04-17 | UI sprint — SP-10 OI-0083 + OI-0084 resolved | **OI-0083 unblocked** — retro-place design questions resolved with Tim: (1) destination picker = sheet picker with event cards; (2) filter = full containment only; (3) flow simplified to atomic two-write transaction (no reopen/re-close ceremony — the reopen was unnecessary once full containment was locked); (4) conflict check blocks with error (not three-option resolver); (5) no undo toast — user deletes via dest's §7 if reversing. UI_SPRINT_SPEC.md § SP-10 "Retro-Place Flow" rewritten. Status → DESIGN COMPLETE, ready for Claude Code. **OI-0084 reclassified** — not actually design-required. SP-10 §9 already has the full spec; Claude Code's "design-required" flag was really a scope surprise (feed check edit UI doesn't exist in current code, needs to be built from scratch). Clarification added; status → DESIGN COMPLETE, ready for Claude Code. Both items rolled into a second handoff brief. |
| 2026-04-17 | UI sprint — SP-10 walkthrough + §8a Move Feed Out design | **OI-0081 added** (SP-10 umbrella, P0 blocks field testing) — all seven event-data edit sections ratified in UI_SPRINT_SPEC.md: §7 Groups, §12 Sub-moves, event-level dates (+ Event Reopen), §8 Feed Entries, §9 Feed Checks, §3/§6 Observations. Core principle: derived values cascade on read; structural state requires explicit reconciliation. **OI-0082 added** (§8a Move Feed Out, P1) — new farmer capability to pull feed back out of an active event (to batch inventory or another open event). Four-step sheet, forced feed-check Step 2 staged-until-Confirm, schema adds 3 columns (`entry_type`, `destination_type`, `destination_event_id`) + check constraints, CP-55/CP-56 impact noted. Calcs update: sum deliveries minus removals (one-line per calc). Session brief + Claude Code handoff prompt authored in `github/issues/SESSION_BRIEF_2026-04-17_sp10-event-edit-consistency.md`. |
| 2026-04-16 | UI sprint — event detail post-implementation review | **OI-0071 added** — 7 UI fixes from Tim's review of implemented SP-2: (1) edit event dialog missing save/cancel buttons, (2) pre/post-graze fields not editable, (3) feed checks/entries/sub-moves missing inline edit buttons, (4) DMI/NPK card moves up to below DMI chart, (5) deliver feed dialog date/time required, (6) quantity stepper whole steps not 0.5, (7) move wizard buttons don't navigate. GH-10 reader order updated (DMI/NPK → position 4). Session brief: `SESSION_BRIEF_2026-04-16_event-detail-ui-fixes.md`. |
| 2026-04-16 | UI sprint — DMI-8 daily breakdown calc | **OI-0069 added** — DMI-8 (Daily DMI Breakdown by Date) spec'd in V2_CALCULATION_SPEC.md. Three-state output (actual/estimated/needs_check) for the 3-day chart. Composes DMI-2/DMI-3/DMI-5/FOR-1. Declining pasture mass balance for estimates. Source event bridge via source_event_id. Forage type missing guard with inline prompt. Session brief written. No schema impact. |
| 2026-04-16 | UI sprint — EST-1 accuracy comparison | **OI-0070 added** — EST-1 (Event Pasture Accuracy) spec'd in V2_CALCULATION_SPEC.md §4.12. New Accuracy domain (domain 12). Compares pre-graze estimates vs actual outcomes for closed events. Two surfaces: event close summary card + accuracy trend report. Two-method sanity check (forage measurement vs mass balance). No schema impact. P2, build after DMI-8. |
| 2026-04-16 | UI sprint — SP-2/SP-3 refinement | Tim reviewed implemented SP-2 and SP-3. Found 7 issues. **OI-0067 added** — event detail view converts from full-screen route to sheet overlay (P1). **OI-0068 added** — pre-graze observations convert from modal to inline editable fields per v4 mockup (P1). Also found: i18n key resolution bug (buttons show raw keys), Feed check/Feed/Move buttons not firing click handlers, post-graze card invisible on active events (visibility condition too restrictive). Session brief written: `SESSION_BRIEF_2026-04-16_sp2-sp3-refinement.md`. GH-10 spec file updated. UI_SPRINT_SPEC.md updated. |
| 2026-04-15 | UI sprint — SP-3 scope correction + handoff | Corrected SP-3 scope: card targets v1 parity (not a slimmer summary). Only two deltas from v1: drop the two small bottom Feed check / Feed buttons; add a large green Feed button under the existing large amber Feed check. Per-group reweigh removed from card, deferred to Animals area. Mockup v3 approved. **OI-0065 added** — per-group reweigh moves from dashboard card to Animals area (P3, DESIGN REQUIRED, not blocking). **OI-0066 added** — per-group Move on card is event-scoped, follow-up to add group-scoped variant (P3). `github/issues/dashboard-card-enrichment.md` rewritten end-to-end for v1 parity. UI_SPRINT_SPEC.md § SP-3 rewritten; status flipped to Ready for Claude Code. |
| 2026-04-15 | UI sprint — SP-2 design review round 1 | **OI-0063 added** — `event_observations` schema alignment with `paddock_observations` (P1, blocker for SP-2). Adds forage_quality, forage_condition, forage_cover_pct, forage_height_cm, stored_feed_only, post_graze_height_cm, recovery_min_days, recovery_max_days, observation_phase enum, paddock_window_id FK. CP-55/CP-56 impact captured in the OI body. **OI-0064 added** — Manage button dropped from sub-move history; reopen folds into Edit dialog (P3, spec'd). SP-2 handoff complete: `github/issues/event-detail-view.md` rewritten with finalized v4-mockup decisions (page order, anchor-no-close rule, per-paddock DM stats, Remove-group picker, post-graze recovery days on one row, one-component-per-pattern rule). UI_SPRINT_SPEC.md § SP-2 expanded with decisions + Schema Impacts subsection. |
| 2026-04-13 | Strip grazing + unit system integration | OI-0001 closed — strip grazing design integrated into V2_SCHEMA_DESIGN.md, V2_CALCULATION_SPEC.md, V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md; A45 logged. OI-0002 closed — `operations.unit_system` column added to schema; A44 logged; V2_INFRASTRUCTURE.md §1.3 added; V2_MIGRATION_PLAN.md §2.8 updated; implementation spec written to `github/issues/unit-system-operations-migration.md` covering entity update, store action, settings re-render on toggle, onboarding selector, and localStorage → operation migration. |
| 2026-04-13 | Pre-CP-54 audit + nits | Added OI-0011 (feed metrics placeholders, P2), OI-0012 (calc test gap, P2), OI-0013 (calc reference descriptions spot-check, P2), OI-0014 (event close manure volumeKg placeholder, P3) from audit. Added Tim nits: OI-0015 (header: operation name + farm picker, P2, DESIGN REQUIRED), OI-0016 (dose units CRUD, P3), OI-0017 (product add dialog missing unit selection, P2), OI-0018 (sync status not in app header, P2), OI-0019 (no logout affordance in header — v1 parity regression, P2). |
| 2026-04-13 | Header + multi-farm context design | OI-0015 closed — full design locked for header redesign (operation name + farm picker + user menu + build stamp) and multi-farm context (active_farm_id, "All farms" mode, cross-farm move pattern, no-straddling-events rule, source_event_id linkage). OI-0019 closed — bundled into same design (user menu popover with Log Out). Spec written to `github/issues/header-redesign-and-multi-farm-context.md`. Doc updates applied to V2_SCHEMA_DESIGN.md §1.5 and §5.1 (two new columns), V2_UX_FLOWS.md §17.2 (rewritten), §1 (farm chip on pickers), new §18 (farm switching), V2_DESIGN_SYSTEM.md §3.6 (extended with farm picker + user menu patterns). |
| 2026-04-13 | Rotation calendar design (CP-54) | Full design locked for CP-54. Major scope expansion from the original CP-54 row (month-columns × AUDS-colored-cells) to a continuous zoomable timeline with two view modes (Estimated Status + DM Forecast), linked-paddock rendering, proportional strip-graze bands, sub-move connectors, never-grazed tan capacity blocks with survey CTA, right-hand sidebar aligned 1:1 with the paddock column, two toolbar lightboxes (Timeline Selection + Dry Matter Forecaster), Show Confinement Locations on/off pill, and a mode indicator pill in the header. Calendar lives only on the Events screen — Reports → Rotation Calendar tab removed (Reports tab strip trimmed to 6: Feed & DMI Trends first). Mobile fallback: no calendar below 900px, mobile Events uses the v1 GRZ-11 banner + GRZ-10 events log pattern. List view on Events reuses v1 GRZ-10 event log. Doc updates: V2_DESIGN_SYSTEM.md §4.3 (Events rewritten), §4.6 (Rotation Calendar tab removed). V2_BUILD_INDEX.md CP-54 row rewritten with full acceptance criteria. V2_UX_FLOWS.md new §19 Rotation Calendar (8 subsections, Events-only). V2_CALCULATION_SPEC.md gained FOR-6 (Forecast Standing DM at Date) in the Forage domain and new §4.11 Capacity Forecast domain with CAP-1 (Period Capacity Coverage); formula count 35 → 37. OI-0001 (strip grazing) now explicitly bundled into CP-54 per the closure note. CP-54 implementation spec pending (next step this session). |
| 2026-04-13 | CP-54 pre-build reconciliation (Claude Code audit) | Added OI-0020 (Calc Reference console destination — Reports vs Settings, P3). GH-6 spec updated: calc file paths corrected to `src/calcs/feed-forage.js` (FOR-6) and new `src/calcs/capacity.js` (CAP-1) — not feature dirs, matching the existing 35-formula pattern; Reports cleanup reworded from "remove Rotation Calendar tab" (never built in code) to "confirm §4.6 alignment by adding Pasture Surveys + Weaning placeholder tabs"; Reference console left in Reports for this CP per OI-0020. V2_DESIGN_SYSTEM.md §4.6 updated to reflect reality: Calc Reference renders alongside the 6 report tabs in v2.0, planned destination Settings → Developer (OI-0020). No CP-54 build impact. |
| 2026-04-13 | CP-56 spec draft (while CP-55 in flight) | Drafted `github/issues/cp-56-import-json-restore.md` extracting acceptance criteria from V2_MIGRATION_PLAN.md §5.7–§5.9 and V2_UX_FLOWS.md §20.3. Surfaced two blocking design gaps as open items: **OI-0021** (transaction strategy — Postgres `rpc` stored procedure vs client-side per-table replace, P1, DESIGN REQUIRED) and **OI-0022** (revert safety net — 24h stash mechanism is referenced in §5.7.6 but undesigned; localStorage ~5MB budget likely insufficient for real operation backups, P1, DESIGN REQUIRED). Both OIs block CP-56 implementation; spec file references them explicitly in the "Blocked by open design questions" section. |
| 2026-04-13 | CP-56 design decisions locked + FK-ordering added | **OI-0021 closed** — picked per-table client-side replace with halt-on-first-failure (Option B); skipped Postgres `rpc` because payload size ceiling forces chunking which breaks atomicity in production anyway. **OI-0022 closed** — picked auto-downloaded pre-import backup file as the revert mechanism; skipped localStorage/IndexedDB/Supabase-side-table options because size-safe, durable, and reuses CP-55 code. Third issue Tim flagged: parent/child FK ordering was missing from the spec (same class of bug that burned v1). Added **new V2_MIGRATION_PLAN.md §5.3a** — authoritative FK-dependency insert/delete order for all 49 included tables, with two-pass pattern for self-referential tables (`animals`, `events`). V2_MIGRATION_PLAN.md §5.7 rewritten with 10 numbered steps; new §5.7a documents the revert mechanism rationale. CLAUDE.md "Known Traps" gained an FK-ordering entry pointing at §5.3a. CP-56 spec file slimmed to a thin pointer to the base docs — one source of truth per Tim's direction. |
| 2026-04-13 | CP-57 reconciliation — OI-0023 closed | **OI-0023 closed** — V2_MIGRATION_PLAN.md §2.2 events transform table gained `source_event_id = NULL` line. v1 has no cross-farm move concept; all migrated events are origin events. One-line spec update, no design discussion needed. |
| 2026-04-14 | CP-57 reconciliation — OI-0035 added | **OI-0035 added** — schema_version bump convention not spec'd. Surfaced during OI-0026 walkthrough: no doc enforces that each new migration SQL bumps `operations.schema_version` or adds a `BACKUP_MIGRATIONS` entry. P1 because it affects all future schema changes, not just CP-57. Separate from the CP-57 reconciliation set. |
| 2026-04-13 | CP-57 reconciliation — OI-0024 closed | **OI-0024 closed** — V2_MIGRATION_PLAN.md §2.3 gained a "Strip grazing columns (A45 — new in v2)" paragraph specifying `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100` for all migrated windows. Verified DB defaults in migration 005 and V2_SCHEMA_DESIGN.md §5.2 match the migration values; spec sets them explicitly anyway. Confirmed `area_pct = 100` represents full paddock. |
| 2026-04-14 | CP-57 reconciliation — batch closure (OI-0025 through OI-0035) | Closed 11 OIs in batch: **OI-0025** (animal notes → `animal_notes` rows), **OI-0026** (schema_version stamp in §2.8), **OI-0027** (active_farm_id = NULL in §2.24), **OI-0028** (npk_price_history transform — new §2.25), **OI-0029** (animal_classes verified, added `archived = false` to §2.14), **OI-0030** (v1 export shape — new §1.5), **OI-0031** (migration tool UX — new §1.7), **OI-0032** (CP-56 pipeline reuse — new §1.6), **OI-0033** (NPK parity check promoted to AC in §1.4), **OI-0034** (unparseable dose audit → CSV download in §1.4 + §2.7), **OI-0035** (schema version bump convention — new §5.11a + CLAUDE.md check #6). Added **OI-0036** (remove v1 import after cutover, P4, deferred). V2_MIGRATION_PLAN.md gained 6 edits (§1.4, §1.5, §1.6, §1.7, §2.7, §2.8, §2.14, §2.24, §2.25, §5.11a). CLAUDE.md gained Code Quality Check #6. |
| 2026-04-14 | Tier 3 testing blocked — Supabase sync failures | **OI-0052 added** — onboarding wizard renders 3× due to `onAuthStateChange` firing `INITIAL_SESSION` + `TOKEN_REFRESHED` after `boot()` already called `showApp()`. P2, cosmetic but also causes triple `pullAllRemote()`. **OI-0053 added** — P0 blocker: `operation_members` RLS `FOR ALL` policy has infinite recursion (queries itself). Prevents inserting first member row, which cascades to block all other tables. Also discovered migrations 014–016 never applied to Supabase (missing columns: `active_farm_id`, `schema_version`, `invite_token`). `dose_units` and `input_product_units` have RLS enabled outside of migrations. Session brief written: `SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`. Build index updated: audit status corrected to complete, test count 747 → 779. |
| 2026-04-14 | RLS recursion fix + upsert bootstrap discovery | **OI-0053 closed** (partially) — infinite recursion fixed by splitting `FOR ALL` into granular policies on `operation_members`, then further simplifying SELECT to `user_id = auth.uid()` (no self-referential subquery). However, sync still fails because sync adapter uses `.upsert()` which Supabase evaluates as INSERT+UPDATE, requiring UPDATE policies to pass. UPDATE policies check `operation_members` which doesn't exist during onboarding bootstrap → all 24 onboarding records dead-letter. **OI-0054 added** — P0: two-part fix: (1) sync adapter must use `.insert()` for new records and `.update()` for existing, not `.upsert()` for all; (2) split all ~40 `FOR ALL` RLS policies into granular per-command policies with `WITH CHECK (true)` on INSERT. Base docs updated: V2_INFRASTRUCTURE.md §5.1 rewritten with 3 RLS patterns (operation-scoped granular, operation_members bootstrap-safe, user-scoped) + new §5.1a (onboarding bootstrap sequence). V2_APP_ARCHITECTURE.md §5.2 updated with write-method-by-operation-type table. |
| 2026-04-14 | OI-0054 closed — sync + RLS fix verified | Claude Code implemented both parts: sync adapter now uses `.insert()` for `add()` and `.update()` for `update()` (`.upsert()` only for recovery); migration 018 split all ~40 `FOR ALL` policies into granular INSERT/SELECT/UPDATE/DELETE. Verified: fresh onboard → dead letter queue empty → `operations`, `operation_members`, `animal_classes` (5 rows) all confirmed in Supabase. Supabase sync fully working. Tier 3 migration testing unblocked. |
| 2026-04-14 | OI-0057 added — v1 animal_classes missing NRCS defaults | v1 transform (`v1-migration.js` §2.14) leaves `excretion_n_rate`, `excretion_p_rate`, `excretion_k_rate`, and `dmi_pct_lactating` as null. When import replaces v2 onboarding defaults (which have full NRCS values) with migrated v1 classes, NPK calcs break. Fix: populate from `seed-data.js` based on `inferRole()` in the transform itself. |
| 2026-04-14 | OI-0058 added + closed — operation_members RLS infinite recursion | Migration 017 introduced self-referential subqueries in all 4 operation_members policies. Any table's RLS checking `SELECT FROM operation_members` triggered operation_members' own SELECT policy, which queried itself → infinite recursion on all reads. Latent since 017+018, surfaced during Tier 3 import pullAll. Fixed by simplifying all policies to `user_id = auth.uid()` (sufficient for single-user scope). SQL applied directly in Supabase; Claude Code needs migration 020 to capture it. |
| 2026-04-14 | OI-0059 + OI-0060 added — migration 020 tracking + stale test data | **OI-0059 added** — P1: migration 020 needed to capture the operation_members RLS simplification (OI-0058 fix) in the migration chain. SQL already applied to Supabase; file needed so fresh instances get correct policies. **OI-0060 added** — P4: stale test operations from failed Tier 3 import attempts (0ee3e183, possibly 0a9fa989, 7e28804d) need cleanup. No functional impact, housekeeping only. |
| 2026-04-14 | OI-0056 added — REFERENCE_TABLES blocking import delete | After OI-0055 fix landed, import hit new crash: `forage_types_operation_id_fkey` FK violation when deleting `operations`. Root cause: `REFERENCE_TABLES` set included 5 per-operation tables (`forage_types`, `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`) — `deleteTableRows()` skips them, so their rows block the `operations` delete. Fix: remove these 5 from REFERENCE_TABLES (they're per-operation seed data with `operation_id` FK), keep only `dose_units` and `input_product_units` (truly global, no `operation_id`, per DP#8 exemption). Session brief written for Claude Code. |
| 2026-04-14 | OI-0055 added — import delete crash on join tables | v1 import (CP-57) crashed on `todo_assignments` delete: `column operation_id does not exist`. Root cause: four child/junction tables (`todo_assignments`, `event_feed_check_items`, `harvest_event_fields`, `survey_draft_entries`) were designed without direct `operation_id`, violating Design Principle #8. Fix: migration 019 adds `operation_id uuid NOT NULL FK → operations` to all four tables, enforcing uniform `WHERE operation_id = $1` with no exceptions. Design docs updated: V2_SCHEMA_DESIGN.md (DP#8 + all 4 table specs), V2_APP_ARCHITECTURE.md (§5.5 backup architecture), V2_MIGRATION_PLAN.md (§5.7 steps 6 & 8). Session brief written for Claude Code. |
| 2026-04-13 | CP-57 pre-work — per-gap reconciliation OIs logged | Added **OI-0023** through **OI-0034** (12 items) covering every §1–§2 gap between V2_MIGRATION_PLAN.md and current schema/design. Split by concern: OI-0023 (events.source_event_id default), OI-0024 (strip graze defaults on paddock windows), OI-0025 (animal_notes routing — design required), OI-0026 (operations.schema_version stamp), OI-0027 (user_preferences.active_farm_id default), OI-0028 (npk_price_history transform — design required), OI-0029 (animal_classes rename/splits verification), OI-0030 (v1 export JSON shape — spec update), OI-0031 (CP-57 tool UX — design required), OI-0032 (reuse of CP-56 import pipeline — design required), OI-0033 (§2.23 parity check as formal AC), OI-0034 (§2.7 unparseable-dose audit surface — design required). Status tags distinguish SPEC UPDATE REQUIRED (obvious one-liners) from DESIGN REQUIRED (needs Tim's decision). To be walked through one at a time; each closure updates V2_MIGRATION_PLAN.md inline. CP-57 spec file in `github/issues/` written after all 12 close. |

