# Session Brief — OI-0131: Pasture Survey bulk-draft autosave (event delegation)

**Date:** 2026-04-21
**OI:** OI-0131
**Scope:** single-file wiring fix + one unit test
**Blast radius:** `src/features/locations/index.js` only; `renderSurveyCard` and every other observation-card consumer are untouched
**Estimated effort:** 15 minutes of code + 15 minutes of test + commit

---

## Background

OI-0126 (2026-04-20, commit 2d1bc70) delegated each paddock's Pasture Survey form to the unified `renderSurveyCard`. The refactor preserved `commitReadingsFromCards()` in every write path (`saveDraft`, `commitSurvey`, the Finish & Save handler, and `renderPaddockList`'s teardown) — so persisted writes do round-trip correctly.

What the refactor **did not** preserve is the 1-second debounced autosave. The hand-rolled inputs that OI-0126 deleted used to carry per-input `onChange` handlers that called `triggerDraftSave()`. After delegation, the function still exists at `src/features/locations/index.js:715–719` but has zero call-sites. `grep -n "triggerDraftSave" src/features/locations/index.js` returns one match — the definition.

Consequence: typed values only reach Supabase when the user hits "Save Draft" or closes the sheet. A browser crash, OS kill of the PWA, or the iOS Safari "Done" gesture that backgrounds the page mid-survey loses every reading since the last manual save.

---

## Why event delegation (not `onChange`)

Considered both paths; picked delegation. Rationale:

- `renderSurveyCard` is shared across five observation surfaces (move wizard open, event detail pre-graze, sub-move pre-graze, single-pasture survey, bulk survey). Adding `onChange` would thread a prop through six files (`survey-card.js` + five callers) and through every sub-renderer in `_shared.js` that can emit.
- This fix doesn't need parsed values from a callback — just a "something changed" signal. The DOM already provides that via `input` / `click` event bubbling.
- `triggerDraftSave` already has an internal 1-second debounce, so over-firing is free. Scheduling an extra no-op save on expand/collapse header clicks would be fine, but we'll guard anyway for hygiene.
- `saveDraft` already calls `commitReadingsFromCards()` before writing, so stale-read risk is zero.

If a future consumer needs parsed values on-change (live validation before save, dependent-field reactivity, etc.), revisit the `onChange` prop then. For today's fix, delegation is strictly smaller.

---

## What to change

### File: `src/features/locations/index.js`

**Location:** immediately after the initial `renderPaddockList()` call at line ~943 (before `const statusEl = ...`).

**Current code (line 943):**
```js
  renderPaddockList();

  const statusEl = el('div', { className: 'auth-error' });
```

**Change to:**
```js
  renderPaddockList();

  // OI-0131: drive autosave via event delegation on the stable paddockList
  // container. `input` covers every native field inside renderSurveyCard
  // (quality slider, height, cover, rings, min/max, notes). Condition chips
  // fire onClick but not `input`, so a guarded click listener picks those up.
  // triggerDraftSave's 1s debounce absorbs rapid keystrokes / slider drags.
  paddockList.addEventListener('input', triggerDraftSave);
  paddockList.addEventListener('click', (e) => {
    if (e.target.closest('.obs-condition-chip')) triggerDraftSave();
  });

  const statusEl = el('div', { className: 'auth-error' });
```

That's the entire code change. Three lines of real wiring + a comment block.

**Do not** attach the listeners inside `renderPaddockList`. That function is called repeatedly (on expand/collapse, filter change, expand-all toggle) and would stack duplicate listeners. `paddockList` the element is created once at line 873 and its contents are cleared/re-rendered — it is the stable anchor.

**Do not** change `renderSurveyCard`, `_shared.js`, or any of the other four observation-card call-sites.

---

## What not to change (explicit non-scope)

1. **Live-refreshing the completeness checkmark.** Each card header shows a green `✓` when four required fields are filled (line 895, 901). Currently the `✓` lags until expand/collapse. Fixing it would require a scoped header re-render per-card on input. Small visual polish, no data risk, out of scope for this fix.
2. **Single-mode and bulk-edit-mode autosave.** `triggerDraftSave` already short-circuits when `isSingle` or `isBulkEdit` is true (`src/features/locations/index.js:716`), matching the existing behaviour — only bulk-new-draft mode autosaves. Don't touch that guard.
3. **Adding `onChange` to `renderSurveyCard`.** Rejected per rationale above.
4. **Changing the 1-second debounce.** The existing `saveDraft()` write path is correct; don't tune the timer.

---

## Tests

### New file: `tests/unit/pasture-survey-autosave.test.js`

Pattern to follow: `tests/unit/pasture-survey-refactor.test.js` (added in OI-0126) — jsdom mount of the sheet, dispatch DOM events, assert store state.

**Test cases:**

1. **`input` event schedules debounced save.**
   - Open the bulk survey sheet with 2 paddocks.
   - Expand the first paddock card.
   - Grab the quality slider via its `data-testid="obs-card-quality"` attribute (verify this is the right testid by reading `_shared.js`).
   - Set `slider.value = '65'` and dispatch `new Event('input', { bubbles: true })`.
   - Advance fake timers by 1500ms (or call `vi.runAllTimers()` if using Vitest fake timers).
   - Assert `getAll('surveyDraftEntries').filter(d => d.surveyId === surveyId)` has one row with `forageQuality === 65` for that location.

2. **Condition chip `click` schedules debounced save.**
   - Same setup as test 1.
   - Query a chip via `data-testid="obs-card-condition-good"`.
   - Dispatch `chip.click()` (or `new MouseEvent('click', { bubbles: true })`).
   - Advance timers 1500ms.
   - Assert the draft entry has `forageCondition === 'good'`.

3. **Header expand/collapse click does NOT schedule a save.**
   - Open sheet, do NOT expand any card.
   - Click the card header (which toggles `expandedCards`).
   - Advance timers 1500ms.
   - Assert `getAll('surveyDraftEntries')` is unchanged (no new rows for this survey).
   - This verifies the `.obs-condition-chip` guard is tight.

4. **Debounce collapses rapid inputs into one save.**
   - Open sheet, expand paddock 1.
   - Dispatch `input` events on the height field at 0ms, 200ms, 400ms, 600ms with values '10', '11', '12', '13'.
   - Advance timers to 1700ms (1s after the last input).
   - Assert exactly one `saveDraft` call landed (easiest to verify by counting entries in the store or spying on `add` / `update` calls to `survey_draft_entries`).
   - Assert the persisted `forageHeightCm` is the last value (`13`, coerced to cm if applicable).

Single-mode and bulk-edit-mode paths can rely on existing coverage — the early-return in `triggerDraftSave` isn't new behaviour.

---

## Verification checklist before commit

- [ ] `grep -n "triggerDraftSave" src/features/locations/index.js` returns **three** matches (1 definition + 2 listener attachments).
- [ ] `grep -n "paddockList.addEventListener" src/features/locations/index.js` returns exactly **two** matches, both outside `renderPaddockList`.
- [ ] `npx vitest run tests/unit/pasture-survey-autosave.test.js` — all 4 cases pass.
- [ ] `npx vitest run tests/unit/pasture-survey-refactor.test.js` — OI-0126's tests still pass (regression check).
- [ ] Manual smoke in dev: open bulk survey, type a height value, wait 1.5s, refresh the page — paddock list shows the value restored from draft.

---

## Commit + push

Commit message:
```
OI-0131: wire pasture survey autosave via event delegation

After OI-0126's renderSurveyCard delegation, triggerDraftSave had zero
call-sites. Typed values only persisted on manual Save Draft or sheet
close. Attach `input` + guarded `click` listeners to the paddockList
container — three lines of wiring, no changes to renderSurveyCard or
the four other observation-card consumers.

- Fix: paddockList.addEventListener('input' / 'click', triggerDraftSave)
- Guard click with .obs-condition-chip closest-match
- Tests: 4 new cases covering input, chip, header-no-fire, debounce

Closes OI-0131.
```

Push and verify:
```
git push origin main
git log origin/main -1
```
Confirm the SHA from `git log origin/main -1` matches the SHA of the commit just created locally. Report the verification in the commit's wake as "Push verified, origin/main at {SHA}."

---

## OPEN_ITEMS changes

Flip OI-0131 to closed in the same commit, noting the commit SHA. Per the orphan-flip rule, any commit citing `OI-NNNN` must touch OPEN_ITEMS.md.

```
### OI-0131 — ...
**Status:** closed — 2026-04-21, commit {SHA}
```

Add a Change Log row:
```
| 2026-04-21 | OI-0131 autosave wire-in | Closed. Event delegation on paddockList drives triggerDraftSave for input + condition-chip click. 4 unit tests added. |
```
