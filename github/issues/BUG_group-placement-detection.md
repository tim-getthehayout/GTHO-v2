# BUG: Dashboard Group Placement Detection Picks Wrong eventGroupWindow

**Priority:** P1 — all groups except Bull Group display "Not placed" despite having active events
**Area:** v2-build / dashboard
**Labels:** bug, dashboard, data-integrity

---

## Problem

The dashboard Groups view shows most groups as "Not placed" even though they have active (open) events. Only Bull Group displays correctly. The root cause is two-layered:

### Layer 1: Orphaned eventGroupWindows (data)

Multiple `eventGroupWindows` records per group have `dateLeft = null` even though their linked event is closed (`dateOut` set). This happens because v1 migration created GW records for every historical event without setting `dateLeft` on windows for closed events. The close and move flows in v2 code correctly set `dateLeft` — the orphans are all from migrated data.

**Evidence (from localStorage inspection 2026-04-17):**

| Group | Active GWs (dateLeft=null) | Point to open event | Point to closed events |
|-------|---------------------------|---------------------|----------------------|
| Cow-Calf Herd | 10 | 1 | 9 |
| Culls | 7 | 1 | 6 |
| Shenk Cows | 6 | 1 | 5 |
| Bull Group | 2 | 1 | 1 |
| Mixed Calves | 6 | 1 | 5 |
| Shenk Culls | 8 | 2 | 6 |

### Layer 2: `.find()` returns first match, not best match (code)

`src/features/dashboard/index.js` line 564:
```js
const activeGW = groupWindows.find(gw => gw.groupId === group.id && !gw.dateLeft);
```

`.find()` returns the first array element that matches. For every group except Bull Group, the first match is an old GW pointing to a closed event — so `isOnPasture` evaluates to `false`.

Bull Group works by accident: its first `dateLeft = null` GW happens to link to an open event.

---

## Fix

### Fix A: Dashboard query (code) — REQUIRED

**File:** `src/features/dashboard/index.js`, `renderGroupCard()` function (line ~563)

Replace:
```js
const groupWindows = getAll('eventGroupWindows');
const activeGW = groupWindows.find(gw => gw.groupId === group.id && !gw.dateLeft);
const activeEvent = activeGW ? getById('events', activeGW.eventId) : null;
const isOnPasture = !!(activeEvent && !activeEvent.dateOut);
```

With:
```js
const groupWindows = getAll('eventGroupWindows');
const events = getAll('events');
const eventMap = new Map(events.map(e => [e.id, e]));

// Prefer GW linked to an open event; fall back to any GW with dateLeft=null
const candidateGWs = groupWindows.filter(gw => gw.groupId === group.id && !gw.dateLeft);
const activeGW = candidateGWs.find(gw => {
  const evt = eventMap.get(gw.eventId);
  return evt && !evt.dateOut;
}) || candidateGWs[0] || null;
const activeEvent = activeGW ? eventMap.get(activeGW.eventId) : null;
const isOnPasture = !!(activeEvent && !activeEvent.dateOut);
```

**Why this approach:** The GW linked to an open event is the correct "current" placement. The fallback to `candidateGWs[0]` handles the case where a group truly has no open event (it would show "Not placed" as intended). Building a `Map` once avoids repeated `getById` calls in the loop.

### Fix B: Data cleanup (one-time) — RECOMMENDED

Set `dateLeft` on all orphaned GWs where the linked event is closed. This is not strictly required (Fix A handles it), but prevents the orphaned records from causing confusion in other code paths (e.g., reports, exports).

```js
// Run once in console or as a migration
const gws = getAll('eventGroupWindows');
const events = getAll('events');
const eventMap = new Map(events.map(e => [e.id, e]));

for (const gw of gws) {
  if (gw.dateLeft) continue; // already closed
  const evt = eventMap.get(gw.eventId);
  if (evt && evt.dateOut) {
    // This GW's event is closed but GW was never marked as left
    update('eventGroupWindows', gw.id, {
      dateLeft: evt.dateOut,
      timeLeft: evt.timeOut || null,
    }, GroupWindowEntity.validate, GroupWindowEntity.toSupabaseShape, 'event_group_windows');
  }
}
```

### Fix C: NPK NaN on Bull Group card (secondary)

The Bull Group card displays `NPK deposited: NNaN PNaN KNaN lbs`. Root cause: `activeGW.animalClassId` is undefined, so the excretion rate lookup fails. The v2 NPK calc (NPK-1) uses `cls?.excretionN ?? 0.34` as fallback — but the issue is that `avgWeightKg` or `headCount` may be feeding NaN into the multiplication chain somewhere.

**To investigate:** Check whether `excretionN/P/K` on the default fallback class is actually a number or undefined. The v1 code uses `S.settings.nExc` (operation-level setting), not per-class rates. The v2 code uses per-class rates with a hardcoded fallback — verify the fallback chain produces valid numbers.

---

## Acceptance Criteria

- [ ] All 6 groups display their correct current location on the Groups tab (matching v1)
- [ ] Groups with no active event correctly show "Not placed"
- [ ] NPK line on Bull Group card shows valid numbers (no NaN)
- [ ] No regression on Locations view group display
- [ ] Orphaned GW records cleaned up (dateLeft set for closed events)

---

## No Schema Impact

Code + data fix only. No CP-55/CP-56 impact.
