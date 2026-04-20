# SESSION BRIEF — OI-0122: Same-farm rotation `source_event_id = NULL` (2026-04-20)

**Goal:** ship the 1-line code fix at `move-wizard.js:680` + migration 030 one-time backfill so existing rotations heal their DMI-8 charts immediately.

**Single OI in scope:**

| OI | Priority | Scope | Spec |
|---|---|---|---|
| OI-0122 | P1 | Same-farm rotation `source_event_id = NULL` + one-time backfill of existing events | This brief — no separate `github/issues/` file needed |

**Related (do not touch in this commit):**
- **OI-0121** — Dashboard card DMI-4 vs DMI-8 summary-line disagreement. Option A locked, four sub-questions still pending Tim's answers. No code this session.
- **OI-0123** — Sub-move close forced-feed-check card UX framing. DESIGN REQUIRED, do not build.

---

## Read this section first

Before starting implementation, confirm three facts Cowork verified via Supabase MCP against project `sxkmultsfsmfcijvsauf` on 2026-04-20 afternoon:

1. **The display-side banner at `src/features/events/index.js:344-355` is already safe.** Outer guard at line 344 is `if (evt.sourceEventId)` — wide open. But the inner guard at line 346 is `if (sourceEvt && sourceEvt.farmId !== evt.farmId)` — farm comparison. Same-farm `sourceEventId` values pass the outer guard but are correctly rejected by the inner. The "→ Moved to" outgoing case at line 358 also already compares farm IDs. **The code diff is literally one line** — at `move-wizard.js:680` only. Do not touch `events/index.js`.

2. **The backfill CTE was dry-run against live Supabase.** 22 events with `source_event_id = NULL` today. The CTE resolves 16 unambiguously, leaves 2 ambiguous (E-5 `b23f20c2` and J3/K `8f15a4ab`), ~4 legitimate first events, and **excludes a same-day Corral cycle pair** (`7e88a2d4` ↔ `8fca7c26` both opened 2026-03-19) via a strict-inequality cycle guard (`source_start < target_start`).

3. **Migration 030 is next in the sequence.** Migrations 028 and 029 already shipped in the prior sessions today (OI-0117 drop events.date_in/time_in, OI-0113 drop event_observations). BACKUP_MIGRATIONS currently ends at key `28`. Next key is `29`, bumping to version 30.

---

## Part 1 — The 1-line code fix

File: `src/features/events/move-wizard.js`

Current code (lines 672–681):
```js
// Step 6: Create new event
// Cross-farm move: use destination farm, link back via sourceEventId
const isCrossFarm = state.destFarmId && state.destFarmId !== farmId;
// OI-0117: date_in/time_in dropped — start is derived from the first
// child paddock window (created immediately below with dateOpened/timeOpened).
const newEvent = EventEntity.create({
  operationId,
  farmId: state.destFarmId || farmId,
  sourceEventId: isCrossFarm ? sourceEvent.id : null,
});
```

Change to:
```js
// Step 6: Create new event
// OI-0122: sourceEventId is always set on rotations (same-farm AND cross-farm)
// so the DMI-8 chart's date-routing bridge (dmi-chart-context.js:140-142)
// can reach back to the prior event for days that pre-date the new event's
// start. The display-side "← Moved from {farm}" banner at events/index.js:346
// already applies a farmId comparison, so same-farm rotations won't trigger
// the banner even though sourceEventId is now populated.
const isCrossFarm = state.destFarmId && state.destFarmId !== farmId;
// OI-0117: date_in/time_in dropped — start is derived from the first
// child paddock window (created immediately below with dateOpened/timeOpened).
const newEvent = EventEntity.create({
  operationId,
  farmId: state.destFarmId || farmId,
  sourceEventId: sourceEvent.id,
});
```

`isCrossFarm` is still used at line 674's usage site only; keep it in place. The only behavioral change is `sourceEventId: sourceEvent.id` instead of the conditional. Comment block above updated to reflect the new invariant so a future reader doesn't reintroduce the gate.

Nothing else in `move-wizard.js` needs to change. The `destType === 'existing'` branch at line 744+ does not create a new event — it joins an existing one — so `sourceEventId` never gets set there, which is correct (the joined event's own `sourceEventId` is whatever it already was when created).

---

## Part 2 — Migration 030 backfill

### Migration file

Create `supabase/migrations/030_backfill_source_event_id.sql` with this content:

```sql
-- Migration 030 — Backfill events.source_event_id for existing same-farm
-- rotations.
--
-- Origin: OI-0122. Before the code fix at move-wizard.js:680, same-farm
-- rotation moves set source_event_id = NULL. The DMI-8 chart's date-routing
-- bridge (dmi-chart-context.js:140-142) relies on source_event_id to route
-- chart days that pre-date the current event to the prior event's cascade.
-- Without it, pre-start days render as blank bars.
--
-- Backfill strategy: walk the event_group_windows graph. For each event with
-- source_event_id = NULL, find the set of prior group windows (same group_id)
-- whose date_left exactly equals this event's date_joined. If every group
-- that joined the new event came from exactly one same source event, we
-- have an unambiguous inference and we set source_event_id to that event.
-- Skip:
--   - Ambiguous cases (groups came from different source events, e.g. a
--     join of two prior events into one).
--   - Events with no matching prior windows (legitimate first events).
--   - Self-referential / cycle pairs: require source_start < target_start
--     (strict inequality) so a same-day cycle pair stays NULL.
--
-- Dry-run against live Supabase on 2026-04-20 produced 16 backfilled rows,
-- 2 ambiguous skipped, and excluded the Corral pair (7e88a2d4 ↔ 8fca7c26,
-- both opened 2026-03-19).

WITH candidates AS (
  SELECT
    gw_new.event_id AS target_id,
    (array_agg(DISTINCT gw_prev.event_id::text))[1]::uuid AS inferred_source_id
  FROM event_group_windows gw_new
  JOIN event_group_windows gw_prev
    ON gw_prev.group_id = gw_new.group_id
    AND gw_prev.event_id != gw_new.event_id
    AND gw_prev.date_left = gw_new.date_joined
  JOIN events e ON e.id = gw_new.event_id
  WHERE e.source_event_id IS NULL
  GROUP BY gw_new.event_id
  HAVING COUNT(DISTINCT gw_prev.event_id) = 1
),
ordered AS (
  SELECT
    c.target_id,
    c.inferred_source_id,
    (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = c.target_id) AS target_start,
    (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = c.inferred_source_id) AS source_start
  FROM candidates c
)
UPDATE events e
SET source_event_id = o.inferred_source_id,
    updated_at = now()
FROM ordered o
WHERE e.id = o.target_id
  AND e.source_event_id IS NULL
  AND o.source_start IS NOT NULL
  AND o.target_start IS NOT NULL
  AND o.source_start < o.target_start;

UPDATE operations SET schema_version = 30;
```

### BACKUP_MIGRATIONS entry

Edit `src/data/backup-migrations.js`. After the existing `28: (b) => { ... }` entry, add:

```js
  // 029 → 030: OI-0122 — backfill events.source_event_id for existing
  //            same-farm rotations. Backup shape unchanged — this is a
  //            data-only backfill on an already-specced column. Old backups
  //            that pre-date migration 030 retain whatever source_event_id
  //            their origin operation had at backup time; no transform
  //            needed on restore.
  29: (b) => { b.schema_version = 30; return b; },
```

---

## Execution sequence

Follow CLAUDE.md §"Migration Execution Rule — Write + Run + Verify":

1. **Write** `supabase/migrations/030_backfill_source_event_id.sql` (content above).
2. **Add** `BACKUP_MIGRATIONS[29]` entry in `src/data/backup-migrations.js`.
3. **Apply the code fix** at `src/features/events/move-wizard.js:680`.
4. **Run a pre-migration sanity check via Supabase MCP `execute_sql`:**
   ```sql
   SELECT COUNT(*) FROM events WHERE source_event_id IS NULL;
   ```
   Expect **22** (or close — some rotations may have been created between the Cowork audit and Claude Code running this). Record the number.
5. **Run the pre-migration dry-run via `execute_sql`** — the same CTE body without the UPDATE, producing a SELECT of `(target_id, inferred_source_id, target_start, source_start)` so you can eyeball the resolved pairs. Expect 16 rows to update, 2 ambiguous not in the SELECT, Corral pair not in the SELECT (because `source_start < target_start` is false for same-day pairs).
6. **Execute migration 030 via Supabase MCP `apply_migration`** (not `execute_sql` — `apply_migration` is correct for DDL+DML migrations).
7. **Verify the backfill landed** via `execute_sql`:
   ```sql
   SELECT COUNT(*) FROM events WHERE source_event_id IS NULL;
   ```
   Expect approximately `22 - 16 = 6` remaining NULL (2 ambiguous + ~4 legitimate first events + Corral pair if both were in the NULL-at-start count). Record the number and subtract from the pre-migration count. **Report: "Migration 030 applied and verified. N rows backfilled (expected 16)."**
8. **Verify schema_version bumped:**
   ```sql
   SELECT schema_version FROM operations LIMIT 1;
   ```
   Expect `30`.
9. **Spot-check the E-3 event specifically:**
   ```sql
   SELECT id, source_event_id FROM events WHERE id = 'fa16a58d'; -- use full UUID
   ```
   Should now resolve to the prior G-1/G-3 event (`da54838f-...`).
10. **Run unit tests:** `npx vitest run`.
11. **Commit** with message:
    ```
    OI-0122: backfill source_event_id + fix same-farm rotation gap

    move-wizard.js:680 was setting sourceEventId only on cross-farm
    rotations, leaving same-farm rotations with source_event_id = NULL.
    This defeated the DMI-8 chart date-routing bridge in
    dmi-chart-context.js:140-142, blanking pre-start chart days for
    every single-farm rotation. One-line code fix + migration 030
    one-time backfill of existing rotations via event_group_windows
    graph walk with same-day cycle guard.

    Migration 030 applied and verified. N rows backfilled.
    ```

---

## Tests required

### Unit test — move-wizard (new if no existing test file, else add cases)

File: `tests/unit/move-wizard.test.js` (create if missing)

Cases:
- `same-farm rotation sets sourceEventId on the new event` — create a source event on farm A, simulate a move to a new location on the same farm A, assert `newEvent.sourceEventId === sourceEvent.id`.
- `cross-farm rotation still sets sourceEventId on the new event` — source event on farm A, move to farm B, assert `newEvent.sourceEventId === sourceEvent.id` AND `newEvent.farmId === farmB.id`.
- `destType === 'existing' does NOT create a new event` — regression guard so the branch is only exercised by `destType === 'new'`.

### Unit test — DMI-8 chart date-routing

File: `tests/unit/dmi-chart-context.test.js` (add case if file exists, else create)

Case: `day-1 rotation event's chart shows source event's cascade output for pre-start days`. Seed two events; event B has `sourceEventId = event_A.id`. Request DMI-8 chart context for event B for a date range that spans event A's last 2 days + event B's day 1. Assert event A's `{pastureDmiKg, storedDmiKg, deficitKg}` values come through for the pre-start days, and event B's own cascade fires only for day 1.

### E2E test — full rotation

File: `tests/e2e/move-wizard.spec.js` (add case)

Case: `same-farm rotation populates source_event_id and renders pre-start chart bars`.
- Seed op + farm + initial event.
- Drive the move wizard UI to rotate to a new location on the same farm.
- Query Supabase: `SELECT source_event_id FROM events WHERE id = '<new_event_id>';` — assert not null, equals the prior event's id.
- Navigate to the dashboard card for the new event.
- Assert the 3-day chart has filled bars for the two pre-start days (no `.empty` class on the day elements).

---

## Expected results summary

| Metric | Before | After |
|---|---|---|
| `events WHERE source_event_id IS NULL` | 22 | ~6 (2 ambiguous + ~4 legitimate firsts + Corral cycle pair) |
| E-3 event (`fa16a58d`) `source_event_id` | NULL | `da54838f-...` (G-1/G-3 prior event) |
| E-3 dashboard card chart | 1/3 bars filled (Mon only) | 3/3 bars filled (Sat, Sun, Mon) |
| `operations.schema_version` | 29 | 30 |
| BACKUP_MIGRATIONS last key | 28 | 29 |
| `move-wizard.js:680` | `isCrossFarm ? sourceEvent.id : null` | `sourceEvent.id` |

---

## Close-out

After the commit lands, Cowork will flip OI-0122 in OPEN_ITEMS.md to `closed — 2026-04-20 (shipped in commit <hash>)` in the next session.

If the backfill count deviates significantly from 16 (more or fewer), **stop and report** — the event graph on Tim's operation may have shifted since the dry-run, and the ambiguous/cycle set may need re-examination before shipping.
