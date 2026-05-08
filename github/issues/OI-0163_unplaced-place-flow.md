# OI-0163 — Place mode of the wizard family: separate `place-wizard.js` with shared `wizard-shared.js`, dashboard Place buttons wired to it

**Priority:** P1 (blocks Tim's current workflow — newly-split groups can't be placed without manually starting an event from the rotation calendar)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0163.
**Labels:** `bug`, `move-wizard`, `dashboard`, `v2-build`
**Status:** **DESIGN LOCKED** — ready to implement.

## Summary

Tim split animals into new groups on 2026-05-07. Those groups are now unplaced. Tapping Place on either dashboard surface (group card line 920, Unplaced groups section line 990) runs `() => navigate('#/events')` — dumping the user on the rotation calendar with no placement context. There is no call to `openMoveWizard` from either site, and the rotation calendar has no documented path to start a new event scoped to a specific group. V2_UX_FLOWS.md §17.7 already documents the intended behavior ("opens move wizard with the group pre-selected and no source event") — the code never matched.

Fix it by adding a Place wizard that shares Step 1, Step 2, and the destination-event-creation half of execute with the Move wizard via a new shared helper file, but lives in its own orchestrator file with no knowledge of "source events." Wire both dashboard Place buttons to it.

## Design rationale — why option 2 (separate wizard) over option 1 (one wizard with `sourceEvent === null` gating)

The existing move wizard already carries five orthogonal axes:

1. scoped vs full-event (OI-0066)
2. new dest vs join existing (Step 1 destType)
3. source `'land'` vs `'confinement'` (OI-0161 — gates post-graze card)
4. dest `'land'` vs `'confinement'` (OI-0161 — gates pre-graze card)
5. OI-0101 mirror touched vs not (one-way mirror dateOut→dateIn / timeOut→timeIn)

`renderStep3` reads source-side state in ~15 places: `sourcePW`, `sourceGW`, `sourceLoc`, `sourceLocationType`, `sourcePaddockName`, `sourceGroup`, the OI-0161 mode discriminator, the post-graze card render, the entire close-source section, the entire feed-transfer section, the OI-0101 mirror, the OI-0136 residual capture, the OI-0139 live-remaining math, and the OI-0162 pre-flight + idempotency guards. `executeMoveWizard`'s first half is all source-closure work (close paddock windows, close group windows, stamp `events.date_out`, write close-reading feed check) that simply doesn't exist for a placement.

Adding "source present vs absent" as a sixth axis on top of that creates two specific risks:

- **OI-0162 was just landed (or is landing) today.** It added `verifySourceStateBeforeMove` pre-flight + closed-source idempotency guards that assume `sourceEvent` exists and may already be closed. A source-null mode on the same wizard creates pressure to bypass those guards or make them ternary. The ink isn't dry.
- **The mode discriminator is already 3-valued** (`full-event` / `scoped-remaining` / `scoped-last`). Placement is a fourth axis that's orthogonal to the existing three (it isn't a sub-mode of any of them). Either the discriminator becomes a 2-tuple (`{ kind: 'move' | 'place', subMode: ... }`) or `place` collapses with one of the existing three by accident.

The natural seam is presence-of-source. Step 1 (destType), Step 2 (location/event picker + strip-graze + farm chip), and the destination-event-creation half of execute are shared. The "close source" half is only in move. Splitting at that seam keeps each path readable and avoids touching OI-0162's guards.

Option 2 doesn't mean code duplication — Step 1, Step 2, and the dest-creation helpers extract into `wizard-shared.js`. Net diff is similar to option 1, but the result reads cleaner.

## Sub-item A — Extract shared parts into `src/features/events/wizard-shared.js`

Pure refactor. No behavior change. Every existing move-wizard test must continue passing with at most import-path updates.

### What moves to `wizard-shared.js`

From `move-wizard.js`:

| Symbol | Lines (current) | What it does |
|---|---|---|
| `renderStep1` | 104–134 | Destination type picker (New / Join) |
| `renderStep2` | ~140–320 | Farm chip + location picker (new) or existing-event picker (join) + strip-graze toggle + strip size/count inputs |
| `renderLocationPicker` import | (already imported from `./index.js`) | Stays as-is — leave the import in `wizard-shared.js` |
| `createDestinationEvent(state, operationId, farmId, sourceEventId)` | (extracted from `executeMoveWizard` lines ~700–800) | Inserts the new event row, the new paddock window, the new group window(s), the open paddock observation when destination is land, and the strip-graze setup when toggled. `sourceEventId` is nullable — when null, the new event's `source_event_id` is null. |
| `joinExistingEvent(state, groupIds, sourceEventId)` | (extracted from `executeMoveWizard` join branch) | Inserts only `event_group_window` rows on the existing destination event for each group being added. No new event, no new paddock window. `sourceEventId` is nullable. |

### What stays in `move-wizard.js`

- `openMoveWizard` (entry point — signature unchanged)
- `renderStep3` (close-source + open-dest + feed transfer combined panel)
- `executeMoveWizard` (now calls `createDestinationEvent` / `joinExistingEvent` from shared instead of inlining the dest writes)
- All pre-flight + idempotency guards from OI-0162 (`verifySourceStateBeforeMove`, closed-source second-pass refusal)
- All OI-0101 mirror logic (lives on Step 3, which is move-specific)
- All feed-transfer logic (move-specific)

### Refactor contracts

- [ ] `grep -n "function renderStep1\|function renderStep2" src/features/events/move-wizard.js` returns 0 matches. The functions live only in `wizard-shared.js` after extraction.
- [ ] `grep -n "createDestinationEvent\|joinExistingEvent" src/features/events/wizard-shared.js` returns ≥ 2 matches (function definitions).
- [ ] `tests/unit/events/move-wizard.test.js` passes without behavioral assertions changing — only import paths update.

## Sub-item B — Build `src/features/events/place-wizard.js`

New file. Thin orchestrator on top of `wizard-shared.js`.

### Entry point

```js
export function openPlaceWizard(groupId, operationId, farmId) { ... }
```

Note the signature: `groupId` is the first argument, not `sourceEvent`. The wizard does not accept a source event under any name — the seam is enforced at the file boundary, not by null checks.

### Pre-open guard

Before opening the sheet, count the group's active animal memberships:

```js
const memberships = getAll('animalGroupMemberships').filter(m => m.groupId === groupId && !m.dateLeft);
if (memberships.length === 0) {
  showToast(t('group.placeEmptyGroupWarning'));   // "This group has no animals — add animals before placing it"
  return;
}
```

This matches the OI-0086 empty-group-prompt pattern. Don't open an empty-group placement — there's nothing to place.

### State shape

```js
const state = {
  step: 1,
  groupId,                   // pre-bound; not user-editable
  destType: null,            // 'new' | 'join'
  locationId: null,
  existingEventId: null,
  destFarmId: farmId,        // Farm chip default; user can change in Step 2
  stripGraze: false,
  stripSizePct: 100,
  stripCount: 1,
  // Open destination
  dateIn: todayStr,
  timeIn: '',
  // No dateOut/timeOut — there is nothing to close.
  // No mirror touched flags — nothing to mirror from.
};
```

### Step 1 — destType picker

Reuse `renderStep1` from `wizard-shared.js`. Same New / Join cards as the move wizard.

i18n: `event.placeStep1Title` — `"Place {groupName}"` (move wizard's title is `event.step1Title` — `"Choose destination"`; placement deserves group-aware framing because the user came from a per-group action).

### Step 2 — location/event picker

Reuse `renderStep2` from `wizard-shared.js`. Identical behavior to the move wizard — farm chip, location-type sections, strip-graze toggle. The only difference is that Step 2's "Next" advances to a different Step 3.

### Step 3 — Open destination only

Single section. No close-source side. No feed transfer.

```
Open destination
  Date in    [date input — default today]
  Time in    [time input — optional]
  [pre-graze card — gated on dest.type === 'land' AND destType === 'new']
```

i18n: `event.placeStep3Title` — `"Open at {locationName}"` for new-location placement, `"Add {groupName} to {existingEventLocationName}"` for join.

Pre-graze card visibility matches the move wizard's destination side (lines ~473–481):

| destType + destination location type | Pre-graze card |
|---|---|
| `new` + `land` | Shown |
| `new` + `confinement` | Hidden |
| `join` (existing event) | Hidden — destination paddock already has a pre-graze obs from when its event opened |

### Save sequence

```js
async function executePlaceWizard() {
  try {
    statusEl.textContent = '';
    saveBtn.disabled = true;

    if (state.destType === 'new') {
      const newEventId = await createDestinationEvent(state, operationId, farmId, null);
      // createDestinationEvent already writes:
      //   - event row (source_event_id: null)
      //   - paddock window (open)
      //   - group window for state.groupId (date_joined: state.dateIn, time_joined: state.timeIn)
      //   - paddock observation (type='open') when dest.type === 'land' and pre-graze card was rendered
      //   - strip-graze setup when state.stripGraze
    } else {
      // 'join' branch
      await joinExistingEvent(state, [state.groupId], null);
      // joinExistingEvent writes:
      //   - event_group_window for state.groupId on state.existingEventId
      // No new event, no new paddock window, no observation.
    }

    placeWizardSheet.close();
  } catch (err) {
    logger.error('place-wizard', 'Save failed', { error: err.message, groupId, destType: state.destType });
    statusEl.textContent = t('event.placeWizardSaveError', { error: err.message });
    saveBtn.disabled = false;
  }
}
```

The save sequence is steps 6, 7, 9 of V2_UX_FLOWS.md §1.6 only:
- Skip 1 — no close-reading feed check (no source).
- Skip 2 — no source paddock windows to close.
- Skip 3 — no source group windows to close.
- Skip 4 — no source event to stamp `date_out` on.
- Step 6 — create destination event (or add group window to existing).
- Step 7 — create open paddock observation when destination is land.
- Skip 8 — no feed transfer entries (no source).
- Step 9 — strip-graze setup when toggled.

### Place-wizard contracts

- [ ] `grep -n "sourceEvent\|sourceEventId\|source_event_id" src/features/events/place-wizard.js` returns 0 matches. The place wizard never references a source event by any name. (The single legitimate reference would be in a comment explaining the seam — keep comments out of this grep target by writing them as `// no source` style, not `// no sourceEvent` style.)
- [ ] `grep -n "closeGroupWindow\|closePaddockWindow" src/features/events/place-wizard.js` returns 0 matches. The place wizard never closes anything.
- [ ] `grep -n "feedEntries\|getLiveRemainingForMove\|FeedEntryEntity" src/features/events/place-wizard.js` returns 0 matches. No feed transfer in placement.

## Sub-item C — Wire dashboard Place buttons

Two sites in `src/features/dashboard/index.js`:

### Line 920 — group card Place button

Before:
```js
: el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-place-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); navigate('#/events'); } }, ['Place']),
```

After:
```js
: el('button', { className: 'btn btn-teal', 'data-testid': `dashboard-place-btn-${group.id}`, onClick: (e) => { e.stopPropagation(); openPlaceWizard(group.id, operationId, farmId); } }, ['Place']),
```

### Line 990 — Unplaced groups section Place button

Before:
```js
el('button', { className: 'btn btn-teal btn-sm', onClick: () => navigate('#/events') }, [t('dashboard.place')]),
```

After:
```js
el('button', { className: 'btn btn-teal btn-sm', onClick: () => openPlaceWizard(group.id, operationId, farmId) }, [t('dashboard.place')]),
```

### Import

Add to top of `src/features/dashboard/index.js`:

```js
import { openPlaceWizard } from '../events/place-wizard.js';
```

### Field-mode check

`src/features/field-mode/index.js` exposes a Move action via `openMoveWizard`. Confirm there is no Place action exposed in field mode today (search for "place" in `src/features/field-mode/`); if there isn't, no field-mode change is needed and the field-mode picker stays move-only. If there is one, surface it in this PR for review — don't silently leave it broken.

### Dashboard contracts

- [ ] `grep -n "navigate('#/events')" src/features/dashboard/index.js` returns 0 matches.
- [ ] `grep -n "openPlaceWizard" src/features/dashboard/index.js` returns ≥ 2 matches (the two button onClick handlers).

## Tests

### `tests/unit/events/place-wizard.test.js` (new)

- [ ] Open with empty group (0 active memberships) → toast shown, sheet does not open.
- [ ] Open with non-empty group → sheet opens at Step 1.
- [ ] Step 1 → Next without selecting destType → Next is disabled.
- [ ] Step 2 (new + land destination) → Step 3 shows date in + time in + pre-graze card.
- [ ] Step 2 (new + confinement destination) → Step 3 shows date in + time in only, no pre-graze card.
- [ ] Step 2 (join) → Step 3 shows date in + time in only, no pre-graze card.
- [ ] Save (new + land + valid pre-graze readings) → asserts via store: 1 new event row with `source_event_id: null`, 1 new paddock window, 1 new group window for `groupId`, 1 paddock observation (type='open') with the pre-graze readings, 0 feed entries, 0 close-related writes.
- [ ] Save (new + confinement) → asserts: 1 event, 1 paddock window, 1 group window, **0** paddock observations.
- [ ] Save (join) → asserts: 0 new events, 0 new paddock windows, 1 new group window on the existing event, 0 paddock observations.
- [ ] Strip-graze toggled on Step 2 + Save → asserts new paddock window has `is_strip_graze=true`, `strip_group_id` set, `area_pct` reflects strip count.
- [ ] Cross-farm placement (Farm chip on Step 2 differs from operation's `active_farm_id`) → new event's `farm_id` matches the chip selection.
- [ ] Save throws (e.g., simulate `add('events', ...)` rejection) → wizard catches, surfaces error in `statusEl`, `saveBtn` re-enables, sheet stays open. Logger called with `category: 'place-wizard'` and `groupId` in context.
- [ ] Sync verification (per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI"): after Save, query Supabase directly to confirm the event + paddock window + group window rows exist with the expected `source_event_id: null`. The pattern from CLAUDE.md applies — local-only assertions are not sufficient.

### `tests/unit/events/move-wizard.test.js` (existing — import path updates only)

- [ ] All existing tests pass.
- [ ] Imports of `renderStep1` / `renderStep2` / `createDestinationEvent` / `joinExistingEvent` updated from `'./move-wizard.js'` to `'./wizard-shared.js'` if any test imported them directly. (Most tests import only `openMoveWizard`, so this should be a no-op for the majority.)

## V2_UX_FLOWS.md updates (this PR)

- [ ] Add §1.8 "Place Mode" — short subsection describing entry points (dashboard Place buttons), reused steps (1, 2 from §1), Step 3 differences (no close source, no feed transfer, just Open destination), and save sequence (steps 6, 7, 9 of §1.6 only). Cross-references §17.7's two Place button definitions.
- [ ] §17.7 line 1259: "Opens move wizard (§1)" → "Opens place wizard (§1.8)".
- [ ] §17.7 line 1331: "opens move wizard with the group pre-selected and no source event" → "opens place wizard (§1.8) with the group pre-selected".

These three edits are made by Cowork in the same session as this OI is written — Claude Code does not need to update V2_UX_FLOWS.md.

## Out of scope

- Place from Animals screen (no entry point today; would require a Place button on the group row in §15).
- Place from Field Mode (move-only today; if a Place action is added later, it can route through the same `openPlaceWizard` entry point).
- Retro-place / gap-fill (placing a group into a closed event for a backdated gap window) — that's OI-0114's scope, separate flow.
- Empty-group fix-up — if Place opens the empty-group toast, the user must add animals via the Animals screen and try again. No inline "add animals" shortcut in this OI.

## CP-55/CP-56 spec impact

None. This OI is a pure UI/wizard refactor. Data shapes (events, paddock windows, group windows, observations, feed entries) are unchanged. No new columns, no new tables, no JSONB shape changes. Backup round-trip is unaffected.
