# SESSION BRIEF — 2026-04-18 — Paddock Window Split Architecture Bundle

**Bundle:** OI-0095 + OI-0096 + OI-0097
**Type:** Architectural completion package (paddock analog of OI-0091 + OI-0094)
**Priority:** P0 (OI-0095), P1 (OI-0096), P3 (OI-0097)
**Predecessors shipped:**
- OI-0091 + OI-0073 package (commit c9e69d1) — group-side window split architecture + orphan cleanup
- OI-0094 package 2 (commit 90c68cc) — group-side entry-point completeness + §7 view-only sub-decision + `classifyGwsForReopen`
- OI-0090 (closed 2026-04-18) — empty-group archive flow (prompt wired into state-change flows)

**Session brief owner:** Cowork (Tim)
**Implementation owner:** Claude Code

---

## Why this bundle

Three related items surfaced during Tim's systematic "walk every event-window trigger" audit after OI-0094 shipped. They batch into one Claude Code handoff per Tim's direction (2026-04-18): *"lets walk through all event window related items and wrap it all in at the end."*

| OI | Type | Why bundled |
|---|---|---|
| **OI-0095** | P0 architectural fix — paddock analog of OI-0091 | Biggest item. `event_paddock_window` has row structure for splits (GH-4 columns already exist) but no discipline of splitting on state change. Same root cause and fix pattern as OI-0091, applied to the paddock side. |
| **OI-0096** | P1 weight entry-point completeness | Two weight paths that bypass OI-0094's `maybeSplitForGroup` discipline. Small but touches the same architectural territory as OI-0095. |
| **OI-0097** | P3 code correction to shipped OI-0090 wiring | Remove one incorrect `maybeShowEmptyGroupPrompt` call added by OI-0090's session brief. Independent of OI-0095/0096 but groups cleanly with the bundle. |

All three share the "event window / split / membership" problem space. Bundling avoids three separate Claude Code sessions with overlapping file touches.

---

## Read before implementing

1. `OPEN_ITEMS.md` § **OI-0095**, **OI-0096**, **OI-0097** — full spec for each item, including scope lists, acceptance criteria, and explicit non-scope.
2. `OPEN_ITEMS.md` § **OI-0091** and **OI-0094** — the group-side predecessors. OI-0095 copies their structure directly; understanding the shipped group-side helpers is required before writing the paddock-side analogs.
3. `V2_APP_ARCHITECTURE.md §4.4` — "Window-Split on State Change." The canonical architectural doc. OI-0095 extends this with a paddock-side subsection.
4. `github/issues/paddock-window-split-architecture.md` — OI-0095 thin pointer (references the OPEN_ITEMS.md body).
5. `github/issues/GH-4_strip-grazing-paddock-windows.md` — strip grazing UX spec. OI-0095 is the plumbing beneath GH-4; does **not** re-spec GH-4.

---

## Implementation order — four phases

The phases are ordered by dependency. Phase 0 is a prerequisite extraction that unblocks OI-0096. Phases 1–3 are the three OIs. Phase 4 is cross-cutting tests, docs, and commit.

**Phase 0 — Prerequisite: promote `maybeSplitForGroup` to a shared helper**
**Phase 1 — OI-0095 paddock-window split architecture (largest)**
**Phase 2 — OI-0096 weight entry-point completeness (depends on Phase 0)**
**Phase 3 — OI-0097 §7 Remove group correction (independent, small)**
**Phase 4 — Architecture doc extension + cross-cutting tests + deploy gate**

---

## Phase 0 — Prerequisite: promote `maybeSplitForGroup` to shared helper

**Problem:** `maybeSplitForGroup(groupId, changeDate)` is defined locally **twice** today — in `src/features/health/calving.js:19` and `src/features/animals/index.js:31`. OI-0094 never promoted it to a shared module. OI-0096's Quick Weight fix needs to import it from a shared location, not re-define it a third time.

**Steps:**

1. Read both existing definitions and confirm they are byte-identical. If they have drifted, reconcile before moving. (Expected: they are the same — same guard, same `splitGroupWindow` call, same parameters.)
2. Move the function to `src/data/store.js`, co-located with `splitGroupWindow` / `closeGroupWindow`. Rationale: all window-split plumbing lives in one module, consistent with OI-0091's helper placement.
3. Export it: `export function maybeSplitForGroup(groupId, changeDate) { ... }`.
4. In `src/features/health/calving.js`: remove the local `function maybeSplitForGroup(...)` definition. Add to the existing import from `../../data/store.js`: `import { ..., maybeSplitForGroup } from '../../data/store.js';`.
5. In `src/features/animals/index.js`: same pattern — remove local definition, add to the `../../data/store.js` import.
6. Run `npx vitest run` — all existing tests must pass with no changes. The function is semantically identical; this is a pure refactor.
7. **Grep check:** `grep -n "function maybeSplitForGroup" src/` should return zero results after Phase 0. `grep -rn "maybeSplitForGroup" src/features/` should show only imports and calls, no definitions.

**Acceptance for Phase 0:**
- [ ] `maybeSplitForGroup` exported from `src/data/store.js`
- [ ] Zero local definitions of `maybeSplitForGroup` in `src/features/**`
- [ ] Both prior callers (`calving.js`, `animals/index.js`) import from the shared location
- [ ] All existing tests pass unchanged

**Why this matters:** Without this step, OI-0096 either invents a third import path (which drifts) or Claude Code re-defines the function a third time. Promoting once, here, is the clean unblock.

---

## Phase 1 — OI-0095 paddock-window split architecture

This is the bulk of the session. Full spec in `OPEN_ITEMS.md § OI-0095`. Summary here.

### 1a. Store helpers (pure, unit-tested first)

Add to `src/data/store.js`:

**`splitPaddockWindow(locationId, eventId, changeDate, changeTime, newState)`**
- Paddock-side analog of `splitGroupWindow`.
- Find the open `event_paddock_window` for `(eventId, locationId)` (exactly one should exist; log a warn and no-op if none).
- Close it: set `dateClosed = changeDate`, `timeClosed = changeTime`.
- Create a new `event_paddock_window` row for the same `(eventId, locationId)` starting at `changeDate` / `changeTime`, with fields from `newState` overriding the old row's values. `newState` can include any of: `areaPct`, `isStripGraze`, `stripGroupId`, `noPasture`.
- Route both writes through the existing `update()` and `add()` store actions so sync queues normally.

**`closePaddockWindow(locationId, eventId, closeDate, closeTime)`**
- Paddock-side analog of `closeGroupWindow`.
- Find the open `event_paddock_window` for `(eventId, locationId)`; set `dateClosed` / `timeClosed`. No new row.
- Used by close-event and move-wizard close loops.

**Helper assertions (Part A orphan prevention):**
Inside both helpers, if the target row's `dateClosed` doesn't match expectation (e.g., `splitPaddockWindow` finds the window already closed), log via `logger.warn('store', 'splitPaddockWindow: expected open window, found closed', { locationId, eventId })` and refuse the write. Prevents misuse by future flows.

Unit tests: `tests/unit/store-paddock-window-split.test.js` (new). Cover the pure helper semantics — input rows → expected row mutations. Cover the assertion paths.

### 1b. Calc helper

Add to `src/calcs/window-helpers.js`:

**`getOpenPwForLocation(locationId, eventId)`**
- Returns the current open `event_paddock_window` row for `(eventId, locationId)`, or `null`.
- Paddock-side analog of the group-side open-window helper from OI-0091.

Unit tests: extend `tests/unit/calcs-window-helpers.test.js`.

### 1c. Wire the entry points

Each of the following sites currently mutates `event_paddock_window` state directly or inconsistently. Route them through the new helpers.

**`src/features/events/submove.js` — Advance Strip (lines 282–299 approx):**
Refactor to use `splitPaddockWindow(locationId, eventId, changeDate, changeTime, { areaPct, isStripGraze: true, stripGroupId })`. This is a **pure refactor** — the current code already splits correctly (it was the exemplar pattern). Behavior must be identical; e2e test passes unchanged.

**`src/features/events/edit-paddock-window.js` — saveChanges (lines 73–109):**
- On **open windows** (`!pw.dateClosed`): if `areaPct`, `isStripGraze`, or `stripGroupId` changes, route through `splitPaddockWindow`. The other fields (`dateOpened`, `timeOpened`) continue to use direct `update()` — they're metadata edits, not state changes.
- On **closed windows** (`pw.dateClosed`): direct `update()` stays — this is the historical-correction escape hatch, consistent with OI-0091's pattern for closed group windows.
- UI caption: when editing `areaPct` or `isStripGraze` on an open window, show a small note above the field: *"A new window opens from today forward with this value. The old window closes on today's date."* (Same pattern as OI-0091 used for open-group-window edits.)
- **Reopen action (line 128):** add a same-paddock overlap guard. Before clearing `dateClosed`/`timeClosed`, check whether another `event_paddock_window` on the same `locationId` (any event, not just this one) is currently open. If yes, block with error: *"Cannot reopen — this paddock has an open window on another event. Close that first."*

**`src/features/events/move-wizard.js` — close loop (lines 495–503):**
Replace the direct `update('eventPaddockWindows', ...)` calls in the close loop with `closePaddockWindow(pw.locationId, pw.eventId, closeDate, closeTime)`.

**`src/features/events/close.js` — close-event paddock window loop (line 209):**
Same change. Replace direct `update()` with `closePaddockWindow(...)`. This was missed in the initial OI-0095 scope and added during dependency review (see Change Log 2026-04-18).

**`src/features/events/index.js:832` — Quick Move new-window `add()`:**
**No change.** New-window opens (`add('eventPaddockWindows', ...)`) are intentionally excluded from the split helper. Only *mutations on existing open windows* go through `splitPaddockWindow`. The grep contract (below) excludes `add()` sites.

### 1d. Reopen classifier + summary dialog

**`src/features/events/reopen-event.js`:**

Build `classifyPwsForReopen(eventId)` — pure function, exported, unit-tested. Returns an object like:
```
{
  toReopen: [pw, pw, ...],      // PWs closed by event close; reopening event reopens these
  toKeepClosed: [pw, pw, ...],  // PWs closed by mid-event action (Advance Strip, edit-PW, etc.); stay closed
}
```

Classification rules (paddock analog of OI-0094's `classifyGwsForReopen`):
- PW is eligible for reopen if its `dateClosed === event.dateOut` AND no other PW on the same `locationId` was opened after this one closed within the same event.
- Otherwise, keep closed.

Summary dialog (shown before user confirms reopen):
- *"Reopen this event? N paddock windows will be reopened. M will stay closed."*
- If N > 0: list the paddocks being reopened.
- If M > 0: list the paddocks staying closed with a brief reason (*"was already closed by Advance Strip"* / *"another window reused this paddock later in the event"*).
- Confirm / Cancel.

Unit tests: extend `tests/unit/reopen-event.test.js` with at least four cases:
1. All PWs closed on `event.dateOut` → all reopen.
2. One PW closed mid-event by Advance Strip → keep closed.
3. Paddock reused later in event → earlier PW keep closed, later PW reopen.
4. Empty PW set → empty result, no error.

### 1e. Replace `areaPct: 100` literal reads

Two render sites hard-code `areaPct: 100` instead of reading the open PW:

**`src/features/dashboard/index.js`:**
Find the `areaPct: 100` literal (search the file). Replace with `getOpenPwForLocation(locationId, eventId)?.areaPct ?? 100`.

**`src/features/locations/index.js`:**
Same replacement.

**Grep contract:** `grep -rn "areaPct: 100" src/features/` after the change should return zero matches (test files excluded).

### 1f. Audit additional calc + render sites

These sites already iterate strip windows correctly and are expected to need **no changes**, but audit:
- `src/features/events/rotation-calendar/calendar-grid.js:171`
- `src/features/events/rotation-calendar/past-block.js`
- `src/calcs/feed-forage.js` — verify any open-window reads use `getOpenPwForLocation` and not stale patterns

If any of these do need fixes, add them to the PR and note in commit message. If not, add a passing assertion test that confirms the pattern is correct post-refactor.

### 1g. Part B — orphan cleanup (app-side one-time script)

**This is locked as app-side, not a SQL migration** (decided 2026-04-18 with Tim). Rationale: no schema change, no `schema_version` bump needed, no CP-55/CP-56 impact.

Create `src/data/one-time-fixes.js` (new file) or extend an existing one-time-cleanup module if present:

```js
export async function closePaddockWindowOrphans() {
  if (getUserPref('paddock_orphan_cleanup_done')) return;

  const events = getAll('events');
  const closedEventIds = new Set(events.filter(e => e.dateOut).map(e => e.id));
  const orphans = getAll('eventPaddockWindows').filter(pw =>
    pw.dateClosed === null && closedEventIds.has(pw.eventId)
  );

  for (const pw of orphans) {
    const event = events.find(e => e.id === pw.eventId);
    closePaddockWindow(pw.locationId, pw.eventId, event.dateOut, event.timeOut);
    logger.info('orphan-cleanup', 'closed dangling paddock window', {
      pwId: pw.id, eventId: pw.eventId, locationId: pw.locationId,
      closedTo: event.dateOut,
    });
  }

  setUserPref('paddock_orphan_cleanup_done', true);
  logger.info('orphan-cleanup', `paddock orphan cleanup complete — ${orphans.length} rows touched`);
}
```

Wire the call into `src/main.js` (or the app entry module) **after store init, before first render**. Runs exactly once per device — guarded by the `user_preferences` flag.

Unit tests: `tests/unit/orphan-cleanup.test.js` (new).
- Closes dangling PWs with correct `dateClosed` values.
- Sets the flag.
- Second run is a no-op (flag guard works).
- Does not touch PWs where `dateClosed` is already set.
- Does not touch PWs whose parent event is still open.

### 1h. V2_APP_ARCHITECTURE.md §4.4 extension

Extend §4.4 "Window-Split on State Change" with a paddock-side subsection (§4.4b or similar). Content parallels the group-side subsection:

- **Principle statement** — paddock-side version of "stored snapshot for closed windows, live recompute for open windows, split on every state change."
- **Helper contract** — `splitPaddockWindow`, `closePaddockWindow`, `getOpenPwForLocation` signatures and invariants.
- **Entry-point table** — lists every file that mutates paddock window state and which helper it uses:

| Flow | File | Helper |
|------|------|--------|
| Advance Strip | `src/features/events/submove.js` | `splitPaddockWindow` |
| Edit paddock window (open, `areaPct` / `isStripGraze`) | `src/features/events/edit-paddock-window.js` | `splitPaddockWindow` |
| Edit paddock window (closed, historical correction) | `src/features/events/edit-paddock-window.js` | direct `update()` (escape hatch) |
| Move wizard close loop | `src/features/events/move-wizard.js` | `closePaddockWindow` |
| Close event close-all loop | `src/features/events/close.js` | `closePaddockWindow` |
| Quick Move / new event (window open) | `src/features/events/index.js:832` | direct `add()` (new window, not a mutation) |

- **Grep contract** — add a row to the grep-contract exception list covering the paddock side.
- **Render/calc rule** — open PW reads go through `getOpenPwForLocation`; no `areaPct: 100` literals in feature code.

---

## Phase 2 — OI-0096 weight entry-point completeness

Full spec in `OPEN_ITEMS.md § OI-0096`. Summary here.

**Depends on Phase 0** — `maybeSplitForGroup` must already be shared-exported from `src/data/store.js`.

### 2a. Quick Weight sheet wiring

**`src/features/health/weight.js` line 64:**

After the `add('animalWeightRecords', record, ...)` call, add:

```js
// OI-0096: split the group window if the animal is a member of a group on an open event
const memberships = getAll('animalGroupMemberships').filter(m =>
  m.animalId === animalId && m.dateLeft === null
);
for (const m of memberships) {
  maybeSplitForGroup(m.groupId, dateInput.value);
}
```

`maybeSplitForGroup` is a no-op if the group is not on an open event, so the guard is inside the helper. The loop handles the edge case where an animal is in multiple active groups (rare but possible).

Import `maybeSplitForGroup` from `../../data/store.js` (placed there in Phase 0).

### 2b. Edit Animal dialog redesign

**`src/features/animals/index.js` Edit Animal dialog (around line 1217):**

**Delete** the editable current-weight input:
```js
// REMOVE these lines
const currentWeightDisplay = el('input', { type: 'number', step: '0.1', value: latestW?.weightKg ?? '' });
inputs.currentWeight = currentWeightDisplay;
// ... and the wrapping field div
```

**Remove** `inputs.currentWeight` from the `inputs` object entirely. This is important: it prevents any future code from accidentally reading an input that no longer exists, and makes the silent-save regression permanently impossible.

**Add** a read-only current-weight row + ⚖ Weight button:

```js
// OI-0096: read-only current weight display with ⚖ Weight button to log a new record
const latestW = getLatestWeightForAnimal(animal.id); // existing helper
const weightDisplay = el('div', { className: 'field' }, [
  el('label', {}, ['Current weight']),
  el('div', { style: { display: 'flex', alignItems: 'center', gap: '12px' } }, [
    el('div', { style: { fontSize: '16px', fontWeight: '500' } }, [
      latestW ? `${formatWeight(latestW.weightKg)}` : '—',
    ]),
    el('button', {
      className: 'btn btn-outline btn-sm',
      onClick: () => {
        closeEditAnimalSheet();          // close this dialog first to avoid stacked sheets
        openQuickWeightSheet(animal.id); // existing entry point used by the row's ⚖ button
      },
    }, ['⚖ Weight']),
  ]),
]);
```

Adjust selector/function names to match actual code — this is pattern-level guidance, not a literal diff.

**Keep** the existing "Weight history" section (lines 1313–1328). Read-only list stays as-is. No edit/delete controls yet (see OI-0098).

### 2c. Unit tests

`tests/unit/weight-sheet.test.js` (new or extend):
- Saving a weight for an animal in a group on an open event triggers `maybeSplitForGroup` with the sheet's date.
- Saving for an animal with no active group memberships: no split call.
- Saving for an animal whose group is not on an open event: `maybeSplitForGroup` is called but no-ops (confirmed via observing `splitGroupWindow` *not* being called downstream).

`tests/unit/animals.test.js` (Edit Animal dialog):
- Assert no editable `currentWeight` input element exists.
- Assert the read-only current-weight display renders the latest stored value.
- Assert the read-only display renders `—` when no weight record exists.
- Assert the ⚖ Weight button is present and its click handler closes Edit Animal and opens Quick Weight for this animal.

### 2d. Grep audit

Every `add('animalWeightRecords', ...)` site in `src/features/**` must be followed (in the same function body) by a `maybeSplitForGroup` call — **or** be inside a flow that splits via another path. Current sites:

| Site | Split path |
|---|---|
| `src/features/health/weight.js:64` | Direct `maybeSplitForGroup` call after `add()` (new in Phase 2a) |
| `src/features/animals/index.js:1112` (Group Weights bulk sheet) | Existing `maybeSplitForGroup` call at line 1116 — correct, no change |
| `src/features/health/calving.js:170` (calf birth weight) | Implicit via membership add — the calf enters the group via `animal_group_memberships`, which triggers its own split. Document this exception in a code comment above the site. |

---

## Phase 3 — OI-0097 §7 Remove group correction

Full spec in `OPEN_ITEMS.md § OI-0097`. Small fix, independent of Phases 0–2.

**`src/features/events/group-windows.js` §7 Remove group handler (around line 228):**

1. **Remove** the `maybeShowEmptyGroupPrompt(groupWindow.groupId)` call. The `closeGroupWindow(groupId, eventId, closeDate, closeTime)` call stays — that's OI-0094's correct entry point.

2. **Add** a one-line comment above the remaining `closeGroupWindow` call:
```js
// §7 Remove group closes the group's event_group_window only — it does not touch
// animal_group_memberships, so "empty" is checked by membership-mutation flows only
// (cull, move, split, Edit Group, Edit Animal group change), not here.
```

3. **Check `tests/`** for any unit test that positively asserts `maybeShowEmptyGroupPrompt` is called after §7 Remove. If found, remove the assertion or flip it to `expect(maybeShowEmptyGroupPrompt).not.toHaveBeenCalled()`. Grep pattern: `grep -rn "maybeShowEmptyGroupPrompt" tests/` and inspect any §7 Remove coverage.

4. **Commit message must reference OI-0090's session brief** as the origin of the incorrect wiring. Example: *"fix(§7-remove-group): remove incorrect maybeShowEmptyGroupPrompt call per OI-0097. Original wiring from OI-0090 session brief crossed a scope boundary — §7 Remove closes the PW but doesn't touch memberships, so emptiness check doesn't apply."*

5. **OI-0090 session brief on main** (`github/issues/SESSION_BRIEF_2026-04-17_empty-group-archive.md`): add a correction banner at the top of the file:
```markdown
> **CORRECTION (2026-04-18):** §7 Remove group was incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point in Phase 3. OI-0097 removed that call. See `OPEN_ITEMS.md § OI-0097` for detail. This brief is retained as historical; do not follow the §7 Remove guidance below.
```
This preserves the historical record while preventing future re-reads from following the broken guidance.

---

## Phase 4 — Cross-cutting tests, doc extension, deploy gate

### 4a. E2E tests

**`tests/e2e/paddock-window-split.spec.js` (new):**
- Edit an open paddock window's `areaPct` from 100 to 50 → two rows exist, old one closed on today with `areaPct = 100`, new one open with `areaPct = 50`. Pasture cover calc for today reads `areaPct = 50`; historical range calc reads both segments.
- Reopen a closed event → summary dialog renders with expected reopen / keep-closed counts.
- Advance Strip on a strip-grazed event → behavior identical to pre-refactor (regression guard).

**Extend `tests/e2e/group-state-change-completeness.spec.js` (existing, from OI-0094):**
- Open Quick Weight for an animal in a group on an open event → save a new weight → dashboard card + event detail §7 `avgWeightKg` immediately reflects the live value (OI-0091 live-read) → close the event → closed `event_group_window` rows split on the reweigh date with correct stamped values.
- Open Edit Animal → tap ⚖ Weight → Edit Animal closes, Quick Weight opens pre-targeted at this animal.

**Supabase sync verification** (per CLAUDE.md E2E rule):
After any write in the e2e tests (paddock split, group split on weight), query Supabase directly to confirm the new rows exist. Don't rely on localStorage/UI state alone.

### 4b. Grep contracts

Before commit, run these greps and confirm expected results:

| Grep | Expected |
|------|----------|
| `grep -n "function maybeSplitForGroup" src/` | Zero matches (moved to export in Phase 0) |
| `grep -rn "update('eventPaddockWindows'" src/features/` excluding `edit-paddock-window.js` closed-window path | Zero matches mutating `areaPct` / `isStripGraze` / `stripGroupId` |
| `grep -rn "areaPct: 100" src/features/` | Zero matches (test files excluded) |
| `grep -rn "inputs.currentWeight" src/features/animals/` | Zero matches (removed in Phase 2b) |
| `grep -n "maybeShowEmptyGroupPrompt" src/features/events/group-windows.js` | Zero matches (removed in Phase 3) |

### 4c. V2_APP_ARCHITECTURE.md

Phase 1h work — extend §4.4 with the paddock-side subsection and updated grep-contract row. Commit as part of the same PR/push so the doc and code land together.

### 4d. Pre-commit checklist (CLAUDE.md rules)

- [ ] `npx vitest run` — all unit tests pass
- [ ] No `innerHTML` assignments with dynamic content
- [ ] Every new store helper has `FIELDS` / `create()` / `validate()` / `toSupabaseShape()` / `fromSupabaseShape()` alignment where applicable (N/A here — helpers are functions, not entities)
- [ ] Every store action call has the right param count (add=5, update=6, remove=3)
- [ ] No hardcoded English — all new user-facing strings use `t()`
- [ ] No schema change = no migration file needed (confirmed per OI-0095/0096/0097 specs)
- [ ] No `schema_version` bump
- [ ] No CP-55/CP-56 spec impact
- [ ] PROJECT_CHANGELOG.md updated with one row per OI
- [ ] V2_APP_ARCHITECTURE.md §4.4 extended

### 4e. Close the GitHub issues

After commit, close the associated issues:
```
gh issue close <OI-0095-issue-number> --comment "Completed in commit <hash>. All acceptance criteria met."
gh issue close <OI-0096-issue-number> --comment "..."
gh issue close <OI-0097-issue-number> --comment "..."
```

---

## OPEN_ITEMS changes (for Claude Code to apply if not already present)

The following OPEN_ITEMS.md state is expected when this brief begins. If any is missing, flag before starting work.

- OI-0095 present, status `open`
- OI-0096 present, status `open`
- OI-0097 present, status `open`
- OI-0098 present, status `open — DESIGN REQUIRED, do not build`
- OI-0090 present, status `closed 2026-04-18`
- OI-0091, OI-0094 closed in prior work

When this bundle ships, update OPEN_ITEMS.md:
- OI-0095 → closed with commit hash and date
- OI-0096 → closed with commit hash and date
- OI-0097 → closed with commit hash and date
- OI-0098 → remains `open — DESIGN REQUIRED, do not build` (no change)

---

## Commit message template

Three commits, one per OI, in the order Phase 0 → 1 → 2 → 3 → 4:

```
refactor(store): promote maybeSplitForGroup to shared export (prereq for OI-0096)

Removes two duplicate local definitions (calving.js, animals/index.js).
Prereq work for OI-0096 — required so Quick Weight sheet can import the shared helper.
```

```
feat(event-paddock-window): add split-on-state-change architecture (OI-0095)

Paddock-side analog of OI-0091 group-window split. Adds splitPaddockWindow and
closePaddockWindow store helpers, getOpenPwForLocation calc helper, reopen
classifier + summary dialog. Wires every entry point through the helpers.
One-time app-side orphan cleanup. Extends V2_APP_ARCHITECTURE.md §4.4 with
paddock-side subsection.

No schema change. No CP-55/CP-56 impact.
Closes OI-0095.
```

```
fix(weight): close group-window split gaps on Quick Weight + Edit Animal (OI-0096)

Quick Weight sheet now calls maybeSplitForGroup after weight save.
Edit Animal dialog replaces editable currentWeight input with read-only
display + ⚖ Weight button that opens Quick Weight. No more silent-save path.

No schema change. No CP-55/CP-56 impact.
Closes OI-0096.
```

```
fix(§7-remove-group): remove incorrect maybeShowEmptyGroupPrompt call (OI-0097)

Correction to OI-0090 session brief Phase 3 — §7 Remove group closes the
event_group_window without touching animal_group_memberships, so the empty-group
check does not apply at this entry point. closeGroupWindow call stays.

Added scope-boundary comment. OI-0090 session brief annotated with correction banner.

Closes OI-0097.
```

---

## Summary of what lands

**New files:**
- `src/data/one-time-fixes.js` (or extension) — orphan cleanup
- `tests/unit/store-paddock-window-split.test.js`
- `tests/unit/orphan-cleanup.test.js`
- `tests/e2e/paddock-window-split.spec.js`

**Modified files (roughly):**
- `src/data/store.js` — new `splitPaddockWindow`, `closePaddockWindow`; exported `maybeSplitForGroup`
- `src/calcs/window-helpers.js` — new `getOpenPwForLocation`
- `src/features/events/submove.js` — Advance Strip refactor
- `src/features/events/edit-paddock-window.js` — route through helper, reopen guard
- `src/features/events/move-wizard.js` — close loop
- `src/features/events/close.js` — close-event loop
- `src/features/events/reopen-event.js` — classifier + dialog
- `src/features/events/group-windows.js` — remove §7 `maybeShowEmptyGroupPrompt` call
- `src/features/dashboard/index.js`, `src/features/locations/index.js` — replace `areaPct: 100` literals
- `src/features/health/weight.js` — Quick Weight split wiring
- `src/features/health/calving.js` — import shared `maybeSplitForGroup` instead of local
- `src/features/animals/index.js` — import shared `maybeSplitForGroup`; Edit Animal dialog redesign
- `src/main.js` (or app entry) — wire orphan cleanup call
- `V2_APP_ARCHITECTURE.md` — §4.4 paddock-side subsection
- `github/issues/SESSION_BRIEF_2026-04-17_empty-group-archive.md` — correction banner
- `PROJECT_CHANGELOG.md` — three rows (one per OI)
- Various `tests/unit/*.test.js` — extend for new helper calls

**No schema changes. No migrations. No CP-55/CP-56 spec impact.**

---

## Field-testing after ship

Tim will field-test on the Shenk Culls dataset (already used to validate OI-0091) plus any active strip-grazed event on Tim's farm. Key things to verify:

- Edit an open paddock's `areaPct` → dashboard + event detail show the new value immediately; historical reports show the pre-change value for the pre-change period.
- Close + reopen an event with mixed-state PWs (some closed at event close, some closed mid-event by Advance Strip) → summary dialog classifies correctly; only the event-close PWs reopen.
- Edit Animal on a weighed animal → current weight shows read-only; ⚖ Weight button opens Quick Weight targeted at that animal.
- §7 Remove a group that has zero open memberships → no empty-group prompt fires (previously did, in a misleading context).

---

*This brief bundles OI-0095 + OI-0096 + OI-0097 per Tim's direction on 2026-04-18. Drafted after dependency-review session locked the remaining design decisions. Ready for Claude Code handoff.*
