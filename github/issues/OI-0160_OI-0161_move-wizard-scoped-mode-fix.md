# Move wizard scoped-mode fixes (OI-0160 + OI-0161)

**Bundle:** Two related fixes to the move wizard's scoped-group path. Ship in a single commit batch (one commit per OI is fine; one bundled commit also fine — they're tightly coupled and the test suites overlap).

**Origin:** Tim's 2026-05-06 attempt to pull Mixed Calves out of G-5 (which has three groups grazing) into a confinement corral, while leaving Shenk Cows + Cow-Calf Herd in G-5. Surfaced two distinct problems on the same surface.

---

## OI-0160 — Per-group Move button in event detail sheet missing `scopedGroupWindowId`

### Summary

`src/features/events/detail.js:766` calls `openMoveWizard(event, ctx.operationId, ctx.farmId)` from each group row's Move button without the `{ scopedGroupWindowId: gw.id }` opt. The wizard runs in full-event mode and closes every group window + every paddock window + sets `events.date_out` on Save — even though the farmer tapped Move next to a single group expecting only that group to leave.

### Reference: working call sites

Both dashboard surfaces already pass the opt correctly:

- `src/features/dashboard/index.js:919` (open-event card group row): `openMoveWizard(activeEvent, operationId, farmId, { scopedGroupWindowId: activeGW?.id })`
- `src/features/dashboard/index.js:1375` (group strip): `openMoveWizard(event, operationId, farmId, { scopedGroupWindowId: gw.id })`

### Fix

`src/features/events/detail.js`, line 766. The `gw` local is in scope (loop variable from line 741: `for (const gw of gws)`).

**Before:**
```js
isActive ? el('button', {
  className: 'btn btn-teal btn-xs',
  onClick: () => openMoveWizard(event, ctx.operationId, ctx.farmId),
}, [t('dashboard.move')]) : null,
```

**After:**
```js
isActive ? el('button', {
  className: 'btn btn-teal btn-xs',
  'data-testid': `detail-group-move-${gw.id}`,
  onClick: () => openMoveWizard(event, ctx.operationId, ctx.farmId, { scopedGroupWindowId: gw.id }),
}, [t('dashboard.move')]) : null,
```

(`data-testid` added in the same edit to give the new test a stable selector — pattern matches `detail-group-${gw.id}` and `detail-remove-group-${gw.id}` already in the same file.)

### Test

New file `tests/unit/events/detail-group-move-button.test.js`:

- Render the event-detail sheet for an active event with ≥2 open group windows.
- `vi.spyOn` against the `openMoveWizard` import (or via dependency injection if the test harness uses module mocking).
- Click the Move button on the second group's row using the new `detail-group-move-${gw.id}` testid.
- Assert `openMoveWizard` was called with exactly four arguments: `(event, operationId, farmId, { scopedGroupWindowId: gw.id })`.
- Second case: assert that for an event with exactly one open group window, the per-row Move button still passes the scoped opt (the lastGroupLeaving logic in the wizard handles the "scoped becomes effectively full-event" case at line 716, but the button itself is always scoped).

### Acceptance

- [ ] Two-group event, scoped move via detail sheet → Save → only the tapped group has `event_group_windows.date_left` stamped; the other group's window stays open; `events.date_out` stays null; source paddock window's `date_closed` stays null.
- [ ] No regression on the dashboard-card per-group Move buttons.
- [ ] New unit test passes.
- [ ] No new lint warnings.

---

## OI-0161 — Move wizard Step 3 copy and observation cards don't reflect mode or location type

### Summary

The wizard's Step 3 always renders "Close Current Event" + post-graze observation card + pre-graze observation card, regardless of whether one group is leaving (paddock keeps grazing) or the entire event is closing, and regardless of whether the source/destination locations are pasture (`type: 'land'`) or confinement (`type: 'confinement'`).

This produces two harms:
1. **Farmer can't tell modes apart.** A scoped move and a full-event move look identical. Tim's 2026-05-06 reaction: "Is the form text misleading? Just removing that group? Or will it close the entire event?"
2. **Bogus observations.** A residual-height capture on a paddock that's still being grazed by other groups is meaningless. A residual-height capture on a corral / dry-lot is meaningless. Both currently render the input.

### Design — render rules

**State to compute at `renderStep3` entry:**

```js
const scopedMode = !!state.scopedGroupWindowId;
const allOpenGWs = getAll('eventGroupWindows').filter(w => w.eventId === sourceEvent.id && !w.dateLeft);
const remainingAfterMove = scopedMode
  ? allOpenGWs.filter(w => w.id !== state.scopedGroupWindowId).length
  : 0;
const mode = !scopedMode
  ? 'full-event'
  : (remainingAfterMove > 0 ? 'scoped-remaining' : 'scoped-last');

// Source paddock window for the scoped group (if scoped) or any open PW (if full-event)
const sourcePW = scopedMode
  ? getAll('eventPaddockWindows').find(w => w.eventId === sourceEvent.id && !w.dateClosed)
  : getAll('eventPaddockWindows').find(w => w.eventId === sourceEvent.id && !w.dateClosed);
// (Both paths use the first open PW. For scoped mode this is the paddock the
//  farmer is moving the group out of. Multi-paddock events on a single source
//  use the same logic — the wizard already operates at the event level for the
//  full-event close.)
const sourceLoc = sourcePW ? getById('locations', sourcePW.locationId) : null;
const sourceLocationType = sourceLoc?.type ?? 'land'; // defensive default

const sourceGW = scopedMode
  ? allOpenGWs.find(w => w.id === state.scopedGroupWindowId)
  : null;
const sourceGroup = sourceGW ? getById('groups', sourceGW.groupId) : null;
const sourceGroupName = sourceGroup?.name ?? 'group';
const sourcePaddockName = sourceLoc?.name ?? 'paddock';

// Destination
const destLoc = (state.destType === 'new' && state.locationId)
  ? getById('locations', state.locationId)
  : null;
const destLocationType = destLoc?.type ?? null;
```

**Close-section title (replace the current `t('event.closeSource')` literal):**

| mode | Title |
|---|---|
| `'scoped-remaining'` | `t('event.moveGroupOutOf', { group: sourceGroupName, paddock: sourcePaddockName })` → `"Move {group} out of {paddock}"` |
| `'scoped-last'` | `t('event.closePaddock', { paddock: sourcePaddockName })` → `"Close {paddock}"` |
| `'full-event'` | `t('event.closeSource')` → `"Close Current Event"` (preserved) |

**Post-graze card render (currently lines 363–367):**

| mode | sourceLocationType | Render? |
|---|---|---|
| `'scoped-remaining'` | any | No |
| `'scoped-last'` | `'land'` | Yes |
| `'scoped-last'` | `'confinement'` | No |
| `'full-event'` | `'land'` | Yes |
| `'full-event'` | `'confinement'` | No |

When not rendered: `postGraze = null`. The save-handler's `if (postGraze) { ... }` guards (lines 574–576) already handle this correctly — verify by walking the diff once.

**Pre-graze card render (currently lines 399–407, inside the `if (state.destType === 'new')` block):**

| destType | destLocationType | Render? |
|---|---|---|
| `'new'` | `'land'` | Yes |
| `'new'` | `'confinement'` | No |
| `'join'` | n/a | No (already true today — destination paddock has its own pre-graze obs from when it opened) |

When not rendered: `preGraze = null`. The save-handler's `if (preGraze) { ... }` guards (lines 578–581) already handle this correctly.

### i18n strings to add (`src/i18n/locales/en.json`)

Under the existing `"event"` block (find an alphabetically appropriate spot near `closeSource` at line 315):

```json
"moveGroupOutOf": "Move {group} out of {paddock}",
"closePaddock": "Close {paddock}",
```

Use the existing `t(key, params)` substitution pattern. Reference: `event.feedTransferResidualAmountLabel` at en.json:329 uses `{loc}` substitution — same shape.

### Test seams to add

In `src/features/events/move-wizard.js`, add `data-testid` attributes to the affected DOM nodes so the new tests can find them deterministically:

- The post-graze card container (the `postGraze.container` returned from `renderPostGrazeCard(...)`) → add `data-testid="move-wizard-post-graze-card"` either inside `renderPostGrazeCard` or by wrapping the returned container in a tagged div before `closeSection.appendChild(postGraze.container)`.
- The pre-graze card container → `data-testid="move-wizard-pre-graze-card"` (same pattern).
- The close-section title `<div class="close-open-section-title">` (line 327) → `data-testid="move-wizard-close-section-title"`.

### Test cases (add to `tests/unit/move-wizard.test.js`)

1. **Scoped + remaining + land source** → expect `move-wizard-post-graze-card` not in DOM; expect `move-wizard-close-section-title` text equals `"Move Mixed Calves out of G - 5"` (or whichever fixture names you set).
2. **Scoped + last + land source** → expect post-graze card present; title equals `"Close G - 5"`.
3. **Scoped + last + confinement source** → expect post-graze card NOT in DOM; title equals `"Close Corral A"`.
4. **Full-event + land source (regression)** → expect post-graze card present; title equals `"Close Current Event"`.
5. **Full-event + confinement source** → expect post-graze card NOT in DOM.
6. **Land destination (regression)** → expect `move-wizard-pre-graze-card` present in DOM after Step 2 selects a land location and advances to Step 3.
7. **Confinement destination** → same setup with a confinement location → expect pre-graze card NOT in DOM.
8. **Join existing event (regression)** → destType `'join'`, any existing-event selection → expect pre-graze card NOT in DOM.

Each fixture seeds: an operation, a farm, a source event with N open group windows on a known land or confinement paddock, the optionally-set destination paddock, and runs the wizard via `openMoveWizard(...)` then advances the wizard state to Step 3. Existing wizard tests in the same file should give you the harness pattern.

### Acceptance

- [ ] Eight new test cases pass.
- [ ] Tim's 2026-05-06 scenario: scoped move of Mixed Calves out of G-5 → corral. Title reads `"Move Mixed Calves out of G - 5"`. No post-graze card. No pre-graze card. Save closes only Mixed Calves' window; G-5 event stays open with Shenk Cows + Cow-Calf Herd still on it.
- [ ] No regression in full-event mode on a land paddock.
- [ ] `getById('locations', X)` returning null does not crash the wizard — title falls back to `"Move group"` / `"Close paddock"` / `"Close Current Event"`.
- [ ] `event_group_windows.head_count` and `avg_weight_kg` still stamped on the closed scoped group window (the silent snapshot path at lines 698–700 must not regress).
- [ ] `npx vitest run` green; `npm run build` green; `npm run lint` 0 errors (or pre-existing baseline if any).

### CP-55/CP-56 impact

None for either OI. No schema changes, no new persisted fields, no JSONB shape changes. Render-side gating only.

### Files touched (combined)

- `src/features/events/move-wizard.js` (Step 3 render + closeSection title + observation card gating + test-id attributes)
- `src/features/events/detail.js` (one-line scoped-flag fix on line 766 + new testid)
- `src/i18n/locales/en.json` (two new keys: `event.moveGroupOutOf`, `event.closePaddock`)
- `tests/unit/move-wizard.test.js` (eight new cases)
- `tests/unit/events/detail-group-move-button.test.js` (new file, two cases)

### Commit guidance

Two commits suggested:

1. **OI-0160:** `fix(events): pass scopedGroupWindowId from detail-sheet per-group Move button (OI-0160)` — touches `detail.js` + new test file. Small, low-risk.
2. **OI-0161:** `fix(move-wizard): Step 3 copy + observation cards reflect mode and location type (OI-0161)` — touches `move-wizard.js` + `en.json` + new test cases.

Each commit's message must include the OI ID per the orphan-flip rule (`commit-msg` hook will reject commits that mention `OI-NNNN` without staging `OPEN_ITEMS.md`).

After both commits, flip both OIs Open → Closed in `OPEN_ITEMS.md` in a third commit (or fold into the second commit) with a brief change-log row per Cowork delivery-gate convention.

### Canonical doc reference

The design lives in `V2_UX_FLOWS.md` §1 (Move Wizard) — **already updated in the same Cowork session that drafted this spec**. Specifically:

- **§1 intro** describes the three modes (full-event / scoped-remaining / scoped-last) and the trigger surfaces for each.
- **§1.5** has the full mode-and-location-type gating tables for the close-section title, the post-graze observation card, and the pre-graze observation card.
- **§1.6** marks each save step that is skipped in `scoped-remaining` mode.
- **§17.7** dashboard card spec — stale OI-0066 reference removed.

Read those sections of V2_UX_FLOWS.md alongside this spec — V2_UX_FLOWS.md is canonical for design intent; this spec is canonical for the Claude Code implementation hand-off (file paths, line numbers, test cases, commit guidance). The two should not conflict; if they do, update both in the same commit and flag the drift.
