# Derive `event.dateIn` / `timeIn` from earliest child window; drop the `events` columns (OI-0117)

**Added:** 2026-04-18
**Area:** v2-build / events / data-integrity / schema
**Priority:** P1 (architectural hardening — OI-0115 closed the symptom; this closes the whole class of bug by removing the second source of truth for event start datetime)
**Thin pointer note:** not a thin pointer — this is a schema change plus a cross-cutting read/write refactor. At sprint reconciliation, V2_SCHEMA_DESIGN.md §5.1 and V2_APP_ARCHITECTURE.md get the authoritative write-ups; this file is the implementation handoff.

## Why we're doing this

OI-0115 (shipped 2026-04-18, GH-25) fixed a live corruption where a phantom `change` event on the Event Detail's `dateInInput` was silently overwriting `events.date_in` from a sub-move open flow's re-render cascade. That fix added three teardown guards to the change handler. It's the correct fix for the *symptom*.

The *class* of bug is still present: `events.date_in` and `events.time_in` are stored as independent columns, but they are definitionally equal to the earliest opening across the event's child windows (`event_paddock_windows.date_opened` / `event_group_windows.date_joined`). Two sources of truth for one fact means any future code path that updates one and not the other produces drift. OI-0115 was exactly that. The next one will be something else.

Worse: when drift occurred, the farmer couldn't even recover from the UI. The guard in `edit-paddock-window.js:89` uses `event.dateIn` as the floor (`newDateOpened < event.dateIn` → reject with "Paddock can't open before the event started"). Once `events.date_in` was corrupted forward to 2026-04-18 by the phantom write, Tim tried to move the B2 window back to 2026-04-15 to match the true event start (the B1 window's `date_opened`), and the guard blocked him — because it trusted the corrupted `events.date_in` over the clean child-window truth.

The structural fix: **remove the column, derive from children, make the UI edit a write-through to the source record.** The Event Detail header shows the derived value, accepts edits, and applies them to the earliest child window — no intermediary column to corrupt.

This also matches CLAUDE.md's **"Compute on Read"** rule: "Derived values (DMI, NPK, cost, status, days on pasture) are never stored. They are computed via registered calculations." Event start datetime is a derived value; it should not be stored.

## Reference repro — why this matters (from Tim's 2026-04-18 field test)

Concrete data from the uploaded backup (`gtho-v2-backup__…_schema-v27.json`), event `0afb6add-b5af-4742-8d52-52f1b0ace8e6`:

- `events` row: `date_in = 2026-04-18, time_in = 13:30` — OI-0115 corruption value
- Earliest child window (B-1): `date_opened = 2026-04-15, time_opened = 13:30` — true start
- Sub-move window (B2): `date_opened = 2026-04-18, time_opened = 13:30` — the sub-move whose Save triggered the phantom write

With `events.date_in` as authoritative:
- Dashboard card shows "Day 1 · In Apr 18" (wrong).
- Farmer tries to move B2 back to 2026-04-15 1:31 PM via Edit Paddock Window. The guard fires `2026-04-15 < 2026-04-18 → reject`. Farmer is stuck.
- Workaround: edit the event's own `date_in` first via the Event Detail header's existing date input, then retry the B2 edit. Works, but the farmer has to know that's the sequence.

With the derived model:
- Dashboard card reads `getEventStart(event.id) → { date: '2026-04-15', time: '13:30' }` from the earliest child window directly. Shows "Day 4 · In Apr 15" correctly, regardless of what any corrupted stored column might have said.
- No corrupted column to corrupt — phantom writes have no target.
- B2 edit guard recomputes the floor from remaining child windows (excluding B2 itself): `min(B-1.date_opened) = 2026-04-15`. The proposed 2026-04-15 1:31 PM passes. Save works.

## Design

### Read path — `getEventStart(eventId)`

New helper in `src/features/events/index.js` (or equivalent):

```js
/**
 * Derive the event's start datetime from its earliest child window.
 * @param {string} eventId
 * @returns {{ date: string, time: string | null, sourceWindowId: string, sourceWindowType: 'paddock' | 'group' } | null}
 *   - `date` / `time` are ISO date and HH:MM strings.
 *   - `sourceWindowId` is the record whose opening equals the minimum. If multiple are
 *     tied at the min, returns the first-inserted (stable order) paddock window, or the
 *     first-inserted group window if there are no paddock windows.
 *   - Returns null if the event has no child windows (invalid state — log warning).
 */
export function getEventStart(eventId) { ... }
```

Implementation: pull all paddock windows + group windows for the event, sort by `(dateOpened|dateJoined, timeOpened|timeJoined, createdAt)` ascending, return the first. Treat `null` time as earlier than any explicit time on the same date (so a window opened "sometime on 2026-04-15" sorts before one opened "2026-04-15 09:00").

### Write path — `setEventStart(eventId, newDate, newTime)`

New helper:

```js
/**
 * Apply a new start datetime to the event by updating the appropriate child window(s).
 * @param {string} eventId
 * @param {string} newDate - ISO date
 * @param {string | null} newTime - HH:MM or null
 * @throws if the new datetime would orphan a child window (i.e. some other child opens
 *   earlier than the proposed start, which is not allowed — the event's start is a
 *   minimum by definition).
 */
export function setEventStart(eventId, newDate, newTime) { ... }
```

Rules:

1. **Identify the "earliest set"** — all child windows whose `(dateOpened|dateJoined, timeOpened|timeJoined)` equals the current minimum.
2. **Reject-on-narrow** (same as the existing detail.js guard): if the new datetime is LATER than the current earliest and any child window *not* in the earliest set opens between the current earliest and the new datetime, reject with "Cannot move event start to {newDate}. {name} opened on {date}, which is before the new start date. Edit that record first." (Identical UX to the existing detail.js reject.)
3. **If no conflict:** update every window in the earliest set to `(newDate, newTime)`. All updates go through the normal `update(...)` path so subscribers fire, Supabase sync queues, observations stay consistent.
4. **Moving start EARLIER**: the current earliest windows move to the new earlier date. No other window is earlier, so the derived minimum naturally reflects the change. No other windows need touching.
5. **Open design question — tied earliest set behavior on LATER moves:** if three windows are tied at the current earliest and the user moves start later, this spec's recommendation is to move **all three** to the new datetime (matches the farmer's mental model: "move the start of the event"). Alternative: move only the first-inserted ("primary") window, leave the others, which breaks the farmer's mental model because the derived start will snap back to whichever tied window didn't move. **Recommend (a) with an on-save confirmation when more than one window will move** ("Moving event start will also update 2 other paddock windows opened at the same time. Continue?"). Tim to confirm before implementation.

### Guard recomputation — `edit-paddock-window.js` + `edit-group-window.js`

Current (`edit-paddock-window.js:89`):
```js
if (newDateOpened < event.dateIn) { ...reject... }
```

New:
```js
const floor = getEventStartFloorExcluding(event.id, pw.id, 'paddock');
// floor = earliest opening of any child window on this event, except the one being edited
if (!floor) {
  // This is the only window on the event — editing it sets the event's start; no lower floor
} else if (newDateOpened < floor.date || (newDateOpened === floor.date && (newTimeOpened || '') < (floor.time || ''))) {
  statusEl.appendChild(el('span', {}, ['Paddock can\'t open before the event started']));
  return;
}
```

Same treatment for `edit-group-window.js:113`. The floor is computed from siblings only — the window being edited is excluded, so editing the earliest window back in time is always legal (it just moves the floor with it). This is what the farmer needs to recover from OI-0115-class drift.

### Schema migration — `028_drop_event_datetime_columns.sql`

```sql
-- OI-0117: events.date_in and events.time_in become derived from the earliest child window.
-- Pre-check: log any event whose stored date_in != MIN(child opening) so we have a record
-- of OI-0115 corruption victims.
WITH event_min AS (
  SELECT
    e.id AS event_id,
    e.date_in AS stored_date_in,
    e.time_in AS stored_time_in,
    LEAST(
      (SELECT MIN(date_opened) FROM event_paddock_windows WHERE event_id = e.id),
      (SELECT MIN(date_joined) FROM event_group_windows WHERE event_id = e.id)
    ) AS true_date_in
  FROM events e
)
INSERT INTO app_logs (level, category, message, context, operation_id)
SELECT
  'warn',
  'migration.028',
  'OI-0115 drift detected during column drop',
  jsonb_build_object(
    'event_id', event_id,
    'stored_date_in', stored_date_in,
    'true_date_in', true_date_in
  ),
  (SELECT operation_id FROM events WHERE id = event_id)
FROM event_min
WHERE stored_date_in IS DISTINCT FROM true_date_in;

ALTER TABLE events DROP COLUMN date_in;
ALTER TABLE events DROP COLUMN time_in;

UPDATE operations SET schema_version = 28;
```

**Fail-safe for events with no child windows:** if any event has zero paddock + zero group windows at migration time, that's an invalid state. Migration should RAISE NOTICE (don't block, but log loudly) — those are orphan events that predate the migration and need manual triage. In practice v2's event creation flow always creates a paddock window in the same transaction, so this should be empty for real data.

**`src/data/backup-migrations.js` entry:**

```js
27: (b) => {
  // OI-0117: drop events.date_in / events.time_in — derived from earliest child window.
  // If the pre-v28 backup's events[i].date_in disagrees with min(child opening), log
  // the drift for Tim's audit. Either way, discard the stored value — child windows
  // are the truth.
  const log = (msg, ctx) => console.warn('[backup-migration-27]', msg, ctx);
  for (const evt of (b.events || [])) {
    const childDates = [];
    for (const pw of (b.event_paddock_windows || [])) if (pw.event_id === evt.id) childDates.push(pw.date_opened);
    for (const gw of (b.event_group_windows || [])) if (gw.event_id === evt.id) childDates.push(gw.date_joined);
    const minChild = childDates.filter(Boolean).sort()[0];
    if (minChild && evt.date_in && minChild !== evt.date_in) {
      log('event.date_in drift', { event_id: evt.id, stored: evt.date_in, min_child: minChild });
    }
    delete evt.date_in;
    delete evt.time_in;
  }
  b.schema_version = 28;
  return b;
},
```

### CP-55 export impact

`src/features/export/cp-55-*` (the backup JSON writer) — the `events` serializer no longer emits `date_in` / `time_in` keys (the columns don't exist). Row shape shrinks by two fields. Downstream tools reading the backup (if any exist) should derive from the `event_paddock_windows` / `event_group_windows` arrays in the same file. Note in CP-55 spec's events section.

### CP-56 import impact

`src/features/import/cp-56-*` — reading a pre-v28 backup (schema_version ≤ 27):
1. The backup's `events[i]` will contain `date_in` and `time_in`.
2. Compute `trueDateIn = min(child windows openings on this event)`.
3. If `backup.events[i].date_in !== trueDateIn`, log a `backup_import.drift_detected` app_log row with both values so Tim can audit which events in this backup were OI-0115 victims.
4. Discard `backup.events[i].date_in` / `time_in` — they don't land anywhere because the columns don't exist.
5. Child windows import normally; `getEventStart()` will return the correct derived value on first read post-import.

Schema version bump in the backup-migrations chain: backup schema_version 27 → 28 with the rule above.

## Cross-cutting read-site sweep (before implementation)

Grep these patterns and convert every match to `getEventStart(eventId)`:

```
grep -rn "event\.dateIn" src/
grep -rn "event\.timeIn" src/
grep -rn "events\.date_in" src/
grep -rn "events\.time_in" src/
grep -rn "evt\.dateIn" src/
grep -rn "\.date_in" src/
```

Known consumer surfaces (non-exhaustive — confirm with grep before implementing):

- `src/features/dashboard/index.js` — location card hero line "In Apr 15" display.
- `src/features/events/detail.js` — hero line display + the date/time inputs themselves (write path).
- `src/features/events/edit-paddock-window.js:89` — floor guard.
- `src/features/events/edit-group-window.js:113` — floor guard.
- `src/features/events/move-wizard.js` — source event close-out semantics, date validation.
- `src/features/events/close.js` — can't close before you opened.
- `src/features/events/list-view/events-log.js` — row sort order, display.
- `src/features/events/rotation-calendar/calendar-grid.js` — x-axis origin.
- `src/calcs/` — anywhere `dayCount` / `daysOnPasture` / DMI-8 origin is computed.
- `src/features/export/cp-55-*` — exclude columns from payload.
- `src/features/import/cp-56-*` — migration rule.

## Files affected

- `supabase/migrations/028_drop_event_datetime_columns.sql` (new)
- `src/data/backup-migrations.js` (new entry for 27→28)
- `src/entities/event.js` — remove `dateIn` / `timeIn` from `FIELDS`, `validate`, `toSupabaseShape`, `fromSupabaseShape`
- `src/features/events/index.js` (or new `src/features/events/event-start.js`) — `getEventStart` + `setEventStart` + `getEventStartFloorExcluding` helpers
- `src/features/events/detail.js` — hero-line inputs switch from `update('events', ...)` to `setEventStart(...)`
- `src/features/events/edit-paddock-window.js` — guard uses `getEventStartFloorExcluding`
- `src/features/events/edit-group-window.js` — same
- Every site found by the grep sweep above
- `tests/unit/features/events/event-start.test.js` (new) — read + write + tied-earliest + reject-on-narrow cases
- Existing unit tests that seed `event.dateIn` — update seed to create a child window with the date instead
- `tests/e2e/` — add a "derived event start write-through" test that verifies the earliest child window's `date_opened` updates in Supabase after a hero-line edit
- `PROJECT_CHANGELOG.md` (Claude Code owns)
- `V2_SCHEMA_DESIGN.md` §5.1 — column removal + design-decision note (Cowork owns — can be a follow-up commit in the same session)
- `V2_APP_ARCHITECTURE.md` — new section on the derived-with-write-through pattern (Cowork owns)
- `V2_MIGRATION_PLAN.md` — note under §5.3a about the derivation invariant (Cowork owns)

## Open design question for Tim to confirm before implementation

**Tied-earliest behavior on moving event start LATER:** if multiple child windows share the current minimum opening datetime, and the user moves event start later, does `setEventStart` update (a) all tied windows, or (b) only the first-inserted "primary" window?

Spec recommends (a) with a confirmation dialog when more than one window will move:

> Moving event start to Apr 18 1:30 PM will also update 2 other paddock windows that opened at the same time (G1, G3). Continue?
> [Cancel]   [Continue]

Option (b) is simpler but produces surprising behavior: the user moves the date, the derived start snaps back to whichever tied window they didn't move. Tim to confirm (a) is correct before implementation.

## Acceptance criteria

1. **Schema migration 028 authored, executed against Supabase, and verified** per CLAUDE.md §"Migration Execution Rule — Write + Run + Verify". Verify column drops with `SELECT column_name FROM information_schema.columns WHERE table_name='events' AND column_name IN ('date_in','time_in');` — zero rows.
2. **`schema_version` ticks to 28** in the `operations` row after migration and in `BACKUP_MIGRATIONS`.
3. **`getEventStart(eventId)` + `setEventStart(eventId, date, time)` + `getEventStartFloorExcluding(eventId, excludeId, type)` helpers** shipped with unit tests covering: single-child event, tied-earliest (paddock+paddock, paddock+group), empty-children (warning logged, returns null), move-earlier success, move-later success with no conflict, move-later rejected with conflict.
4. **All read sites of `event.dateIn` / `event.timeIn` converted to `getEventStart`** — grep contract `grep -rn "\.dateIn" src/ --include='*.js'` returns zero matches (except inside the `getEventStart` helper itself and test fixtures).
5. **Hero-line inputs write through** — unit test: edit the hero date input → assert earliest child window's `date_opened` updates, `events` row is unchanged (and has no such column anyway). Edit hero time input → same for `time_opened`.
6. **Guards recomputed** — `edit-paddock-window.js` + `edit-group-window.js` guards use the sibling-floor helper. Unit test: editing the earliest window earlier is allowed (no floor below it except itself); editing the earliest later past a sibling is rejected.
7. **Tied-earliest write behavior matches Tim's confirmed design** (see open question above) — unit test covers whichever option Tim picks.
8. **CP-55 export omits the dropped columns** — unit test: serialize an event → no `date_in` / `time_in` keys.
9. **CP-56 import migrates pre-v28 backups** — unit test: feed a v27 backup with a drifted `event.date_in`, assert import logs the drift, discards the column, post-import `getEventStart` returns the child-window value.
10. **E2E test** — per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": user edits hero time input → query Supabase `event_paddock_windows` → assert earliest row's `time_opened` updated; query Supabase `events` → assert no `date_in` / `time_in` columns exist.
11. **Grep contracts added to CLAUDE.md Architecture Audit invariants:**
    - `grep -rn "\.dateIn\b" src/ --include='*.js' | grep -v event-start.js | grep -v \.test\.js` — zero matches
    - `grep -rn "events\.date_in" src/ --include='*.js' --include='*.sql' | grep -v "^supabase/migrations/0[01][0-9]_" | grep -v 028_drop` — zero matches
12. **OPEN_ITEMS.md OI-0117 entry updated with the landing commit hash** before close.

## Recovery instruction for existing corrupted data

Pre-migration, any event whose `events.date_in` disagrees with `min(child.date_opened)` is an OI-0115 victim. The migration logs these but doesn't block — the column drop takes effect regardless. Post-migration, the derived value is correct by construction because there's nothing else to read from.

For Tim's current live data: the B1/B2 repro event (0afb6add) will auto-correct the moment migration 028 lands. Dashboard "Day X" will jump back to the true count. No user action required.

## Schema change

YES — migration 028 drops `events.date_in` and `events.time_in`. Schema version bumps to 28. `BACKUP_MIGRATIONS` gets a 27→28 entry.

## CP-55 / CP-56 impact

YES (per Tim's standing rule, flagged at spec time):
- **CP-55:** new format omits `events.date_in` / `events.time_in`. Downstream consumers must derive from child window arrays.
- **CP-56:** new migration rule 27→28 reads-and-discards the columns from pre-v28 backups, with drift logging for OI-0115-era corruption audit.

## Related

- **OI-0115** (shipped, GH-25) — the symptom fix. Three teardown guards on `detail.js:dateInInput`. OI-0117 closes the same class of bug structurally.
- **OI-0116** (handoff-ready, not yet filed) — `time_in` editor on the hero line. Ships against `events.time_in` column; when OI-0117 lands, its write target moves to the earliest child window with no UI change. OI-0116 can ship first.
- **Known traps (CLAUDE.md):** "UI fields without Supabase columns = silent data loss." Inverse trap worth adding post-landing: *two stored columns for one derivable fact = silent drift whenever any code path updates one but not both*. Recommend a Known Traps entry and an Architecture Audit invariant in the same commit.

## Commit message skeleton

```
refactor(events): drop events.date_in/time_in, derive from earliest child window (OI-0117)

Removes the second source of truth for event start datetime. Closes
the OI-0115 class of bug — a phantom write can no longer corrupt a
column that doesn't exist.

Schema: migration 028 drops events.date_in and events.time_in after
logging any OI-0115-era drift to app_logs for audit. schema_version
ticks to 28.

Read sites: all event.dateIn / event.timeIn consumers switch to
getEventStart(eventId). Grep contract added to Architecture Audit.

Write sites: Event Detail hero-line date + time inputs now write
through to the earliest child window via setEventStart(). Reject-on-
narrow semantics preserved. Tied-earliest behavior: [option (a) or (b)
per Tim's decision] with confirmation dialog.

Guards: edit-paddock-window.js + edit-group-window.js use sibling-floor
recomputation instead of reading the dropped column. The guard that
blocked OI-0115 recovery no longer does.

CP-55: export payload omits the columns. CP-56: 27→28 migration rule
discards pre-v28 date_in/time_in with drift logging.

Migration 028 applied and verified (both columns absent from
information_schema.columns).

Closes OI-0117 and [GH issue number after filing].
```
