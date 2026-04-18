# Session Brief: Event Window Split on State Change (2026-04-17)

**Context:** Tim hit two real-data bugs while entering farm notes. (1) After culling 4 of 10 Shenk Culls animals, the event detail and dashboard card still showed 10 head — only the Animals screen showed the correct 5. (2) After moving the remaining 5 from J2 to D, the group rendered on *both* locations, each showing 10 head. Investigation revealed a deeper architectural gap: `event_group_window.head_count` and `avg_weight_kg` are captured as snapshots at window creation and never updated when the group state changes mid-event. Every calc surface and render surface reads the stale snapshot. The Animals screen happens to work because it reads memberships directly. The fix is architectural — treat `event_group_window` as a **period of stable state**, and split the window on every state change (cull / move / wean / split).

This brief is the handoff for the coordinated OI-0091 + OI-0073 package.

**Authoritative spec:** `OPEN_ITEMS.md` § **OI-0091 — Event Window Split on State Change** (architectural spec with 13 acceptance criteria) and `OPEN_ITEMS.md` § **OI-0073 — Group Placement Detection Picks Wrong eventGroupWindow** (Parts A / B / C). Thin pointer: `github/issues/event-window-split-architecture.md`.

**Priority:** P0 — blocks field testing. Every calc (DMI / NPK / AU-days / animal-days / cost) is wrong today for any event where the group state changed mid-event. Tim's Shenk Culls case overstates DMI and NPK by ~50% because 10 head is used instead of the live 5–6.

---

## OPEN_ITEMS changes

Already applied by Cowork in this session. Verify before starting:

- **OI-0092** (stub, P2) — Residual feed NPK deposits (v1 parity gap). Separate track. OI-0091 must NOT modify the `remainingQuantity: 0` line in move-wizard.
- **OI-0091** (new, P0, DESIGN COMPLETE) — the architectural fix this brief covers.
- **OI-0090** — revised. Part 1 struck (subsumed by OI-0091). Parts 2–4 remain in scope but blocked by OI-0091.
- **OI-0073** — widened. Now ships as part of this package. Parts A / B / C all in scope.

Close on completion:
- **OI-0091** and **OI-0073** both close in the same commit when the package ships.

---

## The architecture in one diagram

Before (today):
```
event_group_windows row
  dateJoined = 2026-04-10      ← when the group joined the event
  dateLeft   = null            ← still on the event (open window)
  headCount  = 10              ← snapshot at join time
  avgWeightKg = 450            ← snapshot at join time
  [NEVER UPDATED even after cull/reweigh/wean/split]
```

After (OI-0091):
```
event_group_windows row 1 (CLOSED by cull on 2026-04-15)
  dateJoined = 2026-04-10
  dateLeft   = 2026-04-15      ← stamped at cull date
  headCount  = 10              ← stored snapshot AT dateLeft — historical
  avgWeightKg = 450            ← stored snapshot AT dateLeft — historical

event_group_windows row 2 (NEW OPEN window starting 2026-04-15)
  dateJoined = 2026-04-15
  dateLeft   = null
  headCount  = 6               ← live as of 2026-04-15
  avgWeightKg = 440            ← live as of 2026-04-15

For reads: calcs call getLiveWindowHeadCount(gw) / getLiveWindowAvgWeight(gw).
  - Open window → recomputes from memberships at read time.
  - Closed window → returns the stored snapshot.
```

The rule of thumb: **stored snapshot for closed windows, live recompute for open windows, split on every state change.**

---

## Order of implementation

### Phase 1: Store helpers (foundation)

1. **New store helper `splitGroupWindow(groupId, eventId, changeDate, changeTime, newState)` in `src/data/store.js`.**
   - Finds the group's current open window on the given event (`date_left IS NULL`).
   - Stamps `date_left = changeDate`, `time_left = changeTime`, plus **live-at-change-date** `head_count` and `avg_weight_kg` (call the new live helpers below against memberships as of `changeDate`).
   - Opens a new window with `date_joined = changeDate`, `time_joined = changeTime`, and the `newState` payload (`{ headCount, avgWeightKg }`).
   - Single atomic commit: both writes queue together, both persist, both sync.
   - If `newState` has `headCount < 1`, call `closeGroupWindow` instead (no new window — the group has effectively left the event).
2. **New store helper `closeGroupWindow(groupId, eventId, closeDate, closeTime)` in `src/data/store.js`.**
   - Same as the close half of `splitGroupWindow` but with no new window opened.
   - Stamps live `head_count` and `avg_weight_kg` on close.
   - Toast: *"[Group] ended on [Event] as of [date]"* — this is the toast that SP-11's old Part 1 would have fired.
3. **New pure calc helpers in `src/calcs/window-helpers.js` (new file):**
   - `getLiveWindowHeadCount(gw, { memberships, now })` — if `gw.dateLeft == null`, count memberships where `groupId == gw.groupId` and `date_joined <= now` and (`date_left == null` || `date_left > now`). Else return `gw.headCount`.
   - `getLiveWindowAvgWeight(gw, { memberships, animals, now })` — same gating; for open windows, average the weight of matching animals' current weight (or fall back to group default if animal weights absent). For closed, return `gw.avgWeightKg`.
   - Unit test coverage for: open window with live cull, open window before cull, closed window (returns stored), multi-group on one event, zero-memberships edge case.

### Phase 2: Reroute calc + render reads

4. **Feed/forage calcs** (`src/calcs/feed-forage.js`) — replace direct `gw.headCount` / `e.headCount` reads with `getLiveWindowHeadCount(gw, ctx)`. Affects DMI-1, DMI-3, NPK-1, animal-days, AU-days. For `e.headCount` (event-level total across all groups on the event), sum `getLiveWindowHeadCount` across active windows.
5. **Core calcs** (`src/calcs/core.js`) — same sweep.
6. **Dashboard card renders** (`src/features/dashboard/index.js`) — all `activeGW.headCount` reads route through `getLiveWindowHeadCount`. Line 149-150's membership-based total is already correct and can stay as-is (or be replaced with a sum of helpers for consistency — builder's choice).
7. **Event detail §7 "Groups on this event"** (`src/features/events/detail.js`) — use the helpers for per-row head count display. Stored snapshot stays visible for closed rows.

**Grep check at end of Phase 2:** no direct `gw.headCount` or `\.headCount\b` reads outside of the store/entity shape layer. The helpers are the only entry point for render/calc.

### Phase 3: Wire state-change flows to split/close

8. **Cull flow** (`src/features/animals/cull-sheet.js`) — after the existing `confirmCull` updates memberships, call `splitGroupWindow` for the group on its current open event (if any) with the new live state. If the cull takes the group to zero open memberships, `splitGroupWindow` internally routes to `closeGroupWindow`.
9. **Move wizard** (`src/features/events/move-wizard.js`):
   - The existing close loop (lines 500–507) currently stamps only `date_left`/`time_left`. Replace with `closeGroupWindow(groupId, sourceEventId, dateOut, timeOut)` so live values are stamped.
   - Destination GW creation (lines 554–566 and 596–607) currently copies `headCount: gw.headCount, avgWeightKg: gw.avgWeightKg` forward from the source snapshot. Replace with live values as of `dateIn` (or re-read live from memberships if none pass).
   - For the "existing event" destination path (line 596), guard against creating a second open window if the group already has one on the destination.
   - Observation timestamps currently use `new Date().toISOString()` (lines 496, 569-570) — leave out of scope for this OI; flag in a follow-up if Tim wants dateOut/dateIn used instead.
   - Do **not** change the `remainingQuantity: 0` line at 482 — that's OI-0092 territory.
10. **Event close flow** (`src/features/events/close.js`) — on close, iterate all open windows on the event and call `closeGroupWindow` with live values at the event's `date_out`. Event detail's "this event closed on date_out" read path should then work without modification.
11. **Wean / split flows** — if they exist in the current codebase, add to the sweep. If they don't yet exist, OI-0091's helpers are forward-compatible and ready for the feature to wire in when built.

### Phase 4: OI-0073 coordinated cleanup (ship in the same commit)

12. **Code fix (OI-0073 Part A)** — update `getGroupPlacement()` (currently in `src/features/dashboard/index.js` and/or store) to prefer event_group_windows on OPEN events first, tie-break by most-recent `dateJoined`. Removes the latent `.find()` ordering bug even if orphans remain.
13. **Data cleanup migration (OI-0073 Part B)** — `supabase/migrations/025_close_orphan_group_windows.sql`:
    ```sql
    -- For each group, keep only the most recent open window; close the rest.
    WITH ranked AS (
      SELECT id, group_id,
             ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY date_joined DESC) AS rn
      FROM event_group_windows
      WHERE date_left IS NULL
    )
    UPDATE event_group_windows egw
    SET date_left = COALESCE(egw.date_joined, (
                      SELECT date_out FROM events WHERE id = egw.event_id
                    ), CURRENT_DATE),
        time_left = NULL
    FROM ranked r
    WHERE egw.id = r.id AND r.rn > 1;

    UPDATE operations SET schema_version = 25;
    ```
    Execute per CLAUDE.md Migration Execution Rule. Verify: no group has > 1 open window after the migration. Report in the commit.
14. **NaN-in-NPK fix (OI-0073 Part C)** — NPK breakdown display renders `NaN` when `animalClassId` missing on a group. Fall back to `group.defaultClassId` or the operation's default class. One-line guard + `logger.warn` if fallback fires.
15. **Backup-migrations entry** — add a no-op for v24 → v25 (just bumps `schema_version`).

### Phase 5: Architectural doc + tests

16. **Update `V2_APP_ARCHITECTURE.md`** — add a subsection under "Event domain" titled "Window-Split on State Change" that encapsulates the two-paragraph explanation from this brief and links to OI-0091 for history.
17. **Unit tests** — new `tests/unit/store-window-split.test.js`, `tests/unit/window-helpers.test.js`. Extend existing calc tests (`tests/unit/calcs-feed-forage.test.js`, `tests/unit/calcs-core.test.js`) with cull-mid-event fixtures.
18. **E2E test** — `tests/e2e/cull-dashboard-event-detail.spec.ts`: cull 4 of 10, assert dashboard card = 6, event detail §7 = 6, Supabase `event_group_windows` has exactly 2 rows for the group on this event (1 closed with 10, 1 open with 6). Pattern per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI."

---

## Files affected

**New:**
- `src/calcs/window-helpers.js`
- `supabase/migrations/025_close_orphan_group_windows.sql`
- `tests/unit/store-window-split.test.js`
- `tests/unit/window-helpers.test.js`
- `tests/e2e/cull-dashboard-event-detail.spec.ts`

**Modified:**
- `src/data/store.js` (add `splitGroupWindow`, `closeGroupWindow`)
- `src/calcs/feed-forage.js` (reroute reads)
- `src/calcs/core.js` (reroute reads)
- `src/features/dashboard/index.js` (reroute renders + Part A `getGroupPlacement` fix)
- `src/features/events/detail.js` (reroute §7 renders)
- `src/features/animals/cull-sheet.js` (call `splitGroupWindow` after `confirmCull`)
- `src/features/events/move-wizard.js` (replace close loop, replace destination GW creation, guard duplicate-open-on-existing-event)
- `src/features/events/close.js` (close all open windows with live values on event close)
- `src/data/backup-migrations.js` (v24 → v25 no-op entry)
- `V2_APP_ARCHITECTURE.md` (new "Window-Split on State Change" subsection)

**Not modified (explicit):**
- `src/entities/event-group-window.js` — schema unchanged, no field changes needed.
- Move wizard's `remainingQuantity: 0` line — OI-0092 scope, not here.

---

## CP-55 / CP-56 impact

**None.** No schema changes, no renamed columns, no JSONB shape changes. `event_group_windows` already supports multiple rows per (event × group). More rows — same serialization. Schema version bump 24 → 25 is for OI-0073 Part B's data cleanup migration only.

---

## Acceptance criteria (headline)

Full list in OI-0091 (13 items) and OI-0073 (Parts A / B / C). Must-pass for commit:

- [ ] Cull 4 of 10 Shenk Culls → dashboard card = 6, event detail §7 = 6, Animals screen = 6. All three agree.
- [ ] Move 5 from J2 to D → J2 closed window stamps `head_count = 5` on close; D opens with 5; no phantom rendering on J2.
- [ ] Event-level DMI and NPK use live head counts for open windows, stored snapshots for closed windows. Unit tests cover both cases.
- [ ] Migration 025 applied and verified — no group has > 1 open window after cleanup.
- [ ] Dashboard `getGroupPlacement()` returns the correct open-event window for every group in Tim's live data (verify with Cow-Calf Herd and Culls — previously 10 and 7 orphans respectively).
- [ ] NPK display does not render `NaN` for groups missing `animalClassId`.
- [ ] `grep -n '\.headCount\b' src/features src/calcs | grep -v 'toSupabase\|fromSupabase\|entity'` returns zero hits outside the helpers themselves.
- [ ] `V2_APP_ARCHITECTURE.md` has the new Window-Split subsection.
- [ ] PROJECT_CHANGELOG.md updated with one row per file group changed.
- [ ] Issues OI-0091 and OI-0073 closed in the same commit message.

---

## Known traps

- **Compute-on-read must be stable.** The live helpers take a `now` parameter (defaulting to `new Date().toISOString()` at read time). Tests must pin `now` explicitly — don't let test time drift cause false failures.
- **Member ship close date matters.** For `getLiveWindowHeadCount`, a membership counts if `date_joined <= now` AND (`date_left == null` OR `date_left > now`). Inclusive lower bound, exclusive upper bound — a cull on 2026-04-15 closes the old window at 2026-04-15 and opens a new one on 2026-04-15. The new window's live count excludes the animal that left that day. Verify with a test.
- **Multi-group events.** Event detail's "total head on event" aggregates across all open windows. Don't double-count by summing both the split's closed window and the new open window on the same date — `date_left > now` gating handles this, but test it.
- **Orphans from v1 migration.** Some groups have windows linked to events that no longer exist (FK cascade on v1 event delete). Migration 025's `SELECT date_out FROM events WHERE id = egw.event_id` returns NULL for those. The `COALESCE` falls through to `CURRENT_DATE`. Accept that for cleanup — those windows were already broken.
- **Self-referential events.** If Tim's data has move wizard chains (source_event_id → next event), OI-0091 doesn't break them, but verify the destination open window's live count works correctly when the source is closing on the same date the destination opens.

---

## Post-ship

After commit:
- Close OI-0091 and OI-0073 with the commit hash.
- Ping OI-0090 in OPEN_ITEMS.md: "OI-0091 shipped, OI-0090 unblocked — ready for empty-group-prompt build."
- Log the architectural pattern in IMPROVEMENTS.md as a candidate for the plugin's window-split best-practice entry.
