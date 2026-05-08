# OI-0162 — Move wizard: three compounding bugs (0-remaining still prompts, partial-write on validate throw, no idempotency guard)

**Priority:** P1 (live data integrity bug — produced an orphan destination event in production on 2026-05-06)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0162.
**Labels:** `bug`, `move-wizard`, `data-integrity`, `v2-build`
**Status:** **DESIGN LOCKED** — ready to implement.

## Summary

Tim moved Shenk Culls + Bull Group from paddock D → B-3 on 2026-05-06. Live remaining feed on D was 0. Three bugs in the move wizard compounded to produce one orphan destination event with a paddock window but no group windows:

1. **Bug A** — Step 3 still prompted Move/Residual even though there was nothing to move or leave behind.
2. **Bug B** — Default Move radio + 0 remaining triggered a `quantity <= 0` validator throw mid-execute, which the wizard's catch handler silently absorbed AFTER source-side closes + destination event creation had already committed. Wizard stayed open showing the error message.
3. **Bug C** — Tim thought nothing had saved, switched the radio to Residual, clicked Save again. The second pass ran on a now-closed source, found no open group windows to move, and silently wrote a duplicate destination event with no group windows.

Supabase cleanup already applied this session (orphan event + duplicate close-reading deleted; source D close aligned to `2026-05-05 13:00`).

## Bug A — `getLiveRemainingForMove` returns 0, wizard still renders the radio

### Where

`src/features/events/move-wizard.js` lines 417-538 (Step 3 feed transfer render block).

### Current behavior

```js
const liveRemaining = getLiveRemainingForMove(sourceEvent.id);
const feedGroups = {};
for (const entry of feedEntries) {
  const key = `${entry.batchId}|${entry.locationId}`;
  if (!feedGroups[key]) {
    feedGroups[key] = {
      batchId: entry.batchId,
      locationId: entry.locationId,
      total: liveRemaining[key] ?? 0,   // <-- can be 0
    };
  }
}

for (const [key, group] of Object.entries(feedGroups)) {
  // ... unconditionally renders Move/Residual radio for every entry
}
```

No early-exit when `group.total <= 0`. The radio still gates Save:
- Default radio = Move (`moveRadio` `checked: 'true'`, `state.choice = 'move'`).
- Save → Step 8 attempts `FeedEntry` with `quantity: 0` → `event-feed-entry.js:46` throws.

### Required behavior

Skip the entire (batch, location) group when `group.total <= 0`. Don't render a radio, don't include in `transferToggles`. Step 1's close-reading write builds its own independent `feedGroups` Map (lines 632-644 in `executeMoveWizard`) so the source-side `remainingQuantity: 0` stamp continues to land for those pairs — preserving OI-0135 / OI-0139 invariants.

### Edge case — all groups have remaining = 0

When `feedEntries.length > 0` but every (batch, location) pair has `live = 0`, the feed-transfer section currently renders an empty block. Replace with an italic hint matching the existing `feedEntries.length === 0` branch on line 533-538:

```js
if (transferToggles.length === 0 && feedEntries.length > 0) {
  closeSection.appendChild(el('div', {
    className: 'form-hint',
    style: { fontStyle: 'italic', marginTop: 'var(--space-4)' },
  }, [t('event.feedTransferAllZero')]));
}
```

New i18n key: `event.feedTransferAllZero` = `"Source has no feed remaining — nothing to move or leave behind."`

### Files

- `src/features/events/move-wizard.js` (Step 3 render block, lines 417-538)
- `src/i18n/en.js` (new key `event.feedTransferAllZero`)
- `tests/unit/events/move-wizard.test.js` (find or create)

### Acceptance

- [ ] When `getLiveRemainingForMove` returns 0 for every (batch, location) pair: zero radios, "all-zero" hint shown.
- [ ] When some pairs are >0 and some are 0: only >0 pairs render radios.
- [ ] `transferToggles` excludes 0-remaining entries (assertable via DOM query).
- [ ] OI-0135 / OI-0139 invariants intact: source close-reading still stamps `remainingQuantity: 0` for dropped pairs.
- [ ] Grep contract: `grep -n "if (group.total <= 0) continue" src/features/events/move-wizard.js` returns ≥ 1 match.

---

## Bug B — `executeMoveWizard` is non-transactional and leaves the wizard open on throw

### Where

`src/features/events/move-wizard.js` `executeMoveWizard()`, lines 566-853.

### Current behavior

```js
function executeMoveWizard(state, inputs, sourceEvent, ...) {
  // ... pre-flight validation (postGraze, preGraze, dateOut, residual inputs) ...
  try {
    // Step 1: source close-reading
    // Step 3: close source group windows
    // Step 4: update source event date_out
    // Step 6: create new event
    // Step 6.5: create new paddock window
    // Step 6.7: create new group windows
    // Step 7: create destination open observation
    // Step 8: feed transfer entries  <-- throws here on quantity <= 0
    moveWizardSheet.close();          // <-- never reached
  } catch (err) {
    statusEl.appendChild(el('span', {}, [err.message]));
    // wizard stays open, partial commit invisible to user
  }
}
```

`FeedEntryEntity.validate` (`src/entities/event-feed-entry.js:46`) rejects `quantity <= 0`:

```js
if (typeof record.quantity !== 'number' || record.quantity <= 0)
  errors.push('quantity must be a positive number');
```

### Required behavior — two layers, both required

**Layer 1 — pre-flight extension.** Hoist `FeedEntryEntity.validate` to the top of `executeMoveWizard`, before Step 1 runs. Build the destination delivery records in memory first; if any fail validation, paint errors in `statusEl` and return early without writing anything.

```js
// After existing pre-flight (postGraze, preGraze, dateOut, residual amounts):
if (transferToggles && transferToggles.length) {
  const dateInPreview = inputs.dateIn?.value || dateOut;
  const timeInPreview = inputs.timeIn?.value || null;
  for (const toggle of transferToggles) {
    if (toggle.choice !== 'move') continue;
    const dryRun = FeedEntryEntity.create({
      operationId,
      eventId: '00000000-0000-0000-0000-000000000000', // placeholder, only validated for shape
      batchId: toggle.batchId,
      locationId: state.locationId || toggle.locationId,
      date: dateInPreview,
      time: timeInPreview,
      quantity: toggle.total,
      sourceEventId: sourceEvent.id,
    });
    const v = FeedEntryEntity.validate(dryRun);
    if (!v.valid) {
      statusEl.appendChild(el('span', {}, [v.errors.join(', ')]));
      return;
    }
  }
}
```

After Bug A ships, `toggle.total > 0` is guaranteed for every `move`-choice toggle, so this pre-flight passes by construction. The pre-flight stays anyway as a defense against future entity-validator additions.

**Layer 2 — finally-close + visible toast.** Wrap the existing try/catch in `try/catch/finally`:

```js
try {
  // ... existing Steps 1-8 ...
} catch (err) {
  logger.error('move-wizard', err.message, {
    sourceEventId: sourceEvent.id,
    operationId,
    farmId,
    destFarmId: state.destFarmId,
    locationId: state.locationId,
  });
  showToast(t('event.moveWizardSaveErrorToast'));
} finally {
  moveWizardSheet.close();
}
```

If `showToast` doesn't already live in a shared module, extract it from `src/features/animals/empty-group-prompt.js:37` into `src/ui/toast.js` and import from both places. Don't write a second copy.

New i18n keys:
- `event.moveWizardSaveErrorToast` = `"Move ran into an error mid-save — please review the source event and any duplicate destination event before retrying."`

### Why both layers

Layer 1 catches the known class (today's `quantity <= 0` plus any future entity-validator additions). Layer 2 is the safety net for unknown throws — wizard never strands a half-committed move with no user signal.

### Files

- `src/features/events/move-wizard.js` (executeMoveWizard, lines 566-853)
- `src/ui/toast.js` (new file if not already shared — extract from `empty-group-prompt.js`)
- `src/features/animals/empty-group-prompt.js` (update to import from `src/ui/toast.js`)
- `src/i18n/en.js` (new keys)
- `tests/unit/events/move-wizard.test.js`

### Acceptance

- [ ] Pre-flight rejects any Move-choice toggle whose `FeedEntryEntity.validate` returns invalid — error in `statusEl`, no source-side writes.
- [ ] Any throw inside `executeMoveWizard`'s try block: wizard closes, toast appears, `logger.error('move-wizard', ...)` called with source event ID in context.
- [ ] Unit test simulating a `FeedEntryEntity.validate` throw mid-Step-8: source GWs NOT closed, source event date_out NOT updated, dest event NOT created, wizard closed, toast appeared.
- [ ] Existing happy-path tests still pass.
- [ ] Grep contract: `grep -nE "moveWizardSheet\.close\(\)" src/features/events/move-wizard.js` returns ≥ 2 matches (try-end OR finally + sheet-init close handlers).
- [ ] Grep contract: `grep -n "} finally {" src/features/events/move-wizard.js` returns ≥ 1 match in `executeMoveWizard`.

---

## Bug C — No idempotency guard: wizard runs unchanged on a closed source

### Where

`src/features/events/move-wizard.js` `executeMoveWizard()` start (insert before Step 1).

### Current behavior

When `allOpenSourceGWs` is empty (because the source event was already closed by an earlier successful run), the wizard still:
- Writes another close-reading feed check on the source.
- Updates the source event's `date_out` / `time_out` (overwriting prior values).
- Creates a whole new destination event with paddock window + open observation.
- Zero group windows on the destination (because `sourceGroupState` is empty).

This is exactly the orphan `01b1617f` event Tim cleaned up.

### Required behavior

Two refuse-to-act checks at the top of `executeMoveWizard`, after pre-flight:

```js
const isScoped = !!state.scopedGroupWindowId;
const allOpenSourceGWs = getAll('eventGroupWindows')
  .filter(w => w.eventId === sourceEvent.id && !w.dateLeft);
const sourceGWs = isScoped
  ? allOpenSourceGWs.filter(w => w.id === state.scopedGroupWindowId)
  : allOpenSourceGWs;

// Refuse-to-act guard 1: full-event move on already-closed source
if (!isScoped && sourceEvent.dateOut) {
  statusEl.appendChild(el('span', {}, [t('event.moveWizardSourceClosed')]));
  return;
}

// Refuse-to-act guard 2: nothing to move (covers both scoped + full)
if (sourceGWs.length === 0) {
  statusEl.appendChild(el('span', {}, [t('event.moveWizardNothingToMove')]));
  return;
}
```

(Note: `allOpenSourceGWs` and `sourceGWs` are currently computed at line 687-690 of executeMoveWizard. Hoist them to the top so the guards can read them, then delete the duplicate computation later in the function.)

New i18n keys:
- `event.moveWizardSourceClosed` = `"This event was already closed. The move may have already happened — close this dialog and check the destination paddock."`
- `event.moveWizardNothingToMove` = `"There are no open groups on this event to move. Refresh the dashboard to see the current state."`

### Why this layer is independent of Bug B

Bug B's pre-flight + finally-close prevents partial commits on throw. But a user who sees the empty-group prompt for a culled group, dismisses it, and re-clicks Move on the same source event from a stale dashboard view will still arrive at the wizard with a closed source. Bug C's guard refuses that path before any writes happen.

### Files

- `src/features/events/move-wizard.js` (top of executeMoveWizard, lines 566-600)
- `src/i18n/en.js` (two new keys)
- `tests/unit/events/move-wizard.test.js`

### Acceptance

- [ ] Full-event move on a source event with `dateOut` set: wizard refuses, surfaces "already closed" error, no destination writes.
- [ ] Scoped move whose `scopedGroupWindowId` no longer matches an open group window: wizard refuses, surfaces "nothing to move" error.
- [ ] Full-event move on a source event with zero open group windows: wizard refuses, same error.
- [ ] Happy path (open source, open scoped GW or full event with ≥ 1 open GW) proceeds normally.
- [ ] Regression test: re-running the wizard on the same closed source produces no second destination event in the store.

---

## Full-OI Acceptance

- [ ] All three sub-items shipped with their individual acceptance criteria met.
- [ ] **Live-repro regression test** simulating the 2026-05-06 D → B-3 sequence:
  - Seed: source event with one open group window, one feed delivery, and one feed-check item with `remainingQuantity: 0` for the same (batch, location).
  - Open wizard → Step 3.
  - Assert: zero Move/Residual radios rendered (Bug A).
  - Click Save with default state.
  - Assert: source closed cleanly, dest event created with the group window, wizard closed cleanly, no error toast (Bug B's pre-flight passed by construction).
  - Re-open the wizard on the now-closed source.
  - Assert: refuse-to-act error rendered (Bug C), no second destination event written.

## CP-55 / CP-56 Impact

NONE. No schema change, no new persisted field, no migration.

## Schema Change

NONE.

## Implementation Order

A → B → C. Bug A drops the trigger; Bug B is the safety net that protects every future change too; Bug C is the second-line defense once both are in place. All three should ship as a single bundle if possible — they share the same file and the same regression test.

## Related OIs

- OI-0135 (closed) — introduced `getLiveRemainingForMove`. Bug A extends the live-remaining doctrine: when the helper returns 0, don't render the choice.
- OI-0136 (closed) — "Leave as residual" forces a remaining-quantity input. Mooted for 0-remaining groups by Bug A (group no longer renders).
- OI-0139 (closed) — feed-check prefill ignores deliveries timestamped after most-recent check; same helper. No interaction.
- OI-0140 (closed) — multi-window paddock disambiguation. No interaction.
- OI-0050 (closed) — onboarding writer-side sync gap. Bug B extends the same "writer can fail silently" doctrine into the move wizard's transactional path.
- OI-0090 / SP-11 (empty-group prompt) — the empty-group prompt for "Culls" stacking on top of the wizard is what made Tim think the first attempt errored. Not changed by this OI but flagged: after Bug B's finally-close, the prompt always appears on a closed wizard, which stays correct.
- OI-0117 / OI-0133 (closed) — same family of "two paths can disagree → consolidate to one truth." Bug C's idempotency check is the same direction.

## Files (Combined)

- `src/features/events/move-wizard.js` — primary surface, all three bugs.
- `src/ui/toast.js` — new shared module (Bug B).
- `src/features/animals/empty-group-prompt.js` — update import to use shared toast (Bug B).
- `src/i18n/en.js` — 4-5 new keys.
- `tests/unit/events/move-wizard.test.js` — full coverage of all three bugs + the live-repro regression.
- `src/entities/event-feed-entry.js` — read-only; the `quantity <= 0` validator is the smoking gun for Bug B but stays as-is (it's the correct invariant — the wizard is what needed to respect it).
