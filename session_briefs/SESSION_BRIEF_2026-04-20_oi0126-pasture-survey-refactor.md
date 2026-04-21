# SESSION BRIEF — OI-0126: Pasture Survey card → delegate to unified `renderSurveyCard` (2026-04-20)

**Goal:** close the OI-0112 unification gap on the Field Mode → Pasture Survey path. Replace the hand-rolled per-paddock form body inside `openSurveySheet` with a single `renderSurveyCard` call so Survey matches the pre-graze observation card everywhere else in the app, AND adds the missing Notes textarea, AND keeps Recovery min-max positioned just above Notes.

**Single OI in scope:**

| OI | Priority | Scope | Spec |
|---|---|---|---|
| OI-0126 | P2 | Full delegation refactor of `openSurveySheet`'s per-paddock body to `renderSurveyCard` | This brief — no separate `github/issues/` file needed |

**Related (do not touch in this commit):**
- **OI-0124 Phase 2 / Phase 3** — broader `loc.areaHa` drift sweep + legacy-fallback retirement. This brief preserves Phase 1 behavior on the Pasture Survey surface but does not extend to other callers.
- **OI-0121** — Dashboard DMI-4 vs DMI-8 disagreement. Still awaiting Tim's sub-question answers; no code.
- **OI-0123** — Sub-move close forced feed-check framing. DESIGN REQUIRED.

---

## Read this section first

Before starting, confirm three facts Cowork verified by direct file read on 2026-04-20:

1. **`renderSurveyCard` already does everything needed.** It composes `header → state (height+cover+rings) → quality → condition → recovery → notes` in exactly that order (`src/features/observations/survey-card.js:37`). Recovery is already above Notes. Notes is already present. The 3-up top row is built by `renderForageStateRow` in `_shared.js:167-183` using `.obs-top-row` / `.obs-field` / `.obs-field-rings` classes with 88/88/72px widths from `main.css:1213-1229`. No new component work is required.

2. **No scale mismatch.** `renderQualitySlider` is **1–100** (`_shared.js:211`: `min: '1', max: '100'`). The sheet's existing `readings[locId].rating` is 0–100 with `null` for unrated. Both persist to `paddock_observations.forage_quality`. The `rating` field is the *same thing* as `forageQuality` — just a legacy local name. No design decision, no new prop on `renderSurveyCard`, no `hideQualitySlider` flag.

3. **No schema change. No CP-55/CP-56 impact.** `survey_draft_entries` entity fields (`forageHeightCm`, `forageCoverPct`, `forageQuality`, `forageCondition`, `baleRingResidueCount`, `recoveryMinDays`, `recoveryMaxDays`, `notes`) already map 1:1 to `renderSurveyCard.initialValues` and `card.getValues()`. `paddock_observations` uses the same names. Export/import round-trips them today. Nothing in `supabase/migrations/` changes.

Single file touched in `src/`: **`src/features/locations/index.js`** (function `openSurveySheet`, lines ~624–1077). One new test file in `tests/unit/`.

---

## Part 1 — What to delete

Inside `renderPaddockList()` at line 864, the per-paddock body block runs from line **~899 (`if (isExpanded || isSingle)`)** to line **~1001 (`cardEl.appendChild(body)`)**. Everything between those bounds is going away **except the scrollBody plumbing and the `cardEl` / `body` container creation**.

Specifically, delete:

- **Lines 903–921 — outer rating slider + number input + rating bar.** The `ratingSlider`, `ratingInput`, `ratingBar`, `ratingColor`, `syncRating` local helpers, and both `body.appendChild(…)` calls. Redundant with `renderQualitySlider` inside the card.
- **Lines 923–938 — Height + Cover row.** Hand-rolled, wrong widths, wrong class names.
- **Lines 940–967 — Bale-Ring Residues block.** Hand-rolled, wrong position (separate row), duplicates `renderForageStateRow`'s ring handling.
- **Lines 969–984 — Condition chips.** Hand-rolled, duplicates `renderConditionChips` (`_shared.js:253`).
- **Lines 986–999 — Recovery min/max row.** Hand-rolled, duplicates `renderRecoveryWindow` (`_shared.js:307`).

Keep intact:

- **Line 900 — `const body = el('div', { style: { padding: '12px', background: 'var(--bg2)' } });`**
- **Line 1001 — `cardEl.appendChild(body);`**
- **Line 1002 — closing `}` of the `if (isExpanded || isSingle)` block.**
- Everything outside this range (card header, completeness badge, scrollBody, filter pills, survey-date input, Save Draft / Finish & Save / commit / close buttons).

**Do not touch** `triggerDraftSave` (706–711), `commitSurvey` (1015–1046), or any of the button/auto-save logic below line 1002 — they already use canonical field names via `SurveyDraftEntryEntity.create(...)` and `PaddockObsEntity.create(...)` spread from `readings[locId]`. The only changes to those paths are the field-name rename in Part 3.

---

## Part 2 — What to build in place

Add the import at the top of `src/features/locations/index.js` near the other feature imports:

```js
import { renderSurveyCard } from '../observations/survey-card.js';
```

Inside the kept `body` block in `renderPaddockList()`, replace the deleted content with:

```js
if (isExpanded || isSingle) {
  const body = el('div', { style: { padding: '12px', background: 'var(--bg2)' } });

  // OI-0124 Phase 1 parity: read areaHectares with areaHa fallback. Do not
  // regress the BRC auto-fill that fa04656 restored on this surface.
  const areaHectaresVal = loc2.areaHectares ?? loc2.areaHa ?? null;
  const paddockAcres = areaHectaresVal
    ? convert(areaHectaresVal, 'area', 'toImperial')
    : null;

  // OI-0126: delegate the per-paddock observation fields to the unified card.
  const card = renderSurveyCard({
    farmSettings,
    paddockAcres,
    initialValues: readings[loc2.id],
  });
  body.appendChild(card.container);

  // Track the card so renderPaddockList() can pull values back into
  // `readings[locId]` before teardown (expand/collapse, filter change,
  // search change, Save Draft). renderSurveyCard holds its own internal
  // input state; without this write-back the values vanish on re-render.
  cards.set(loc2.id, card);

  cardEl.appendChild(body);
}
```

**One tiny piece of surrounding bookkeeping.** Declare `const cards = new Map();` at the top of `openSurveySheet` alongside the other closure state (e.g., right after `const expandedCards = new Set(...)` at line 736). It lives for the lifetime of the sheet and is rebuilt each `renderPaddockList()` call.

---

## Part 3 — Rename `readings` fields from legacy to canonical

The local `readings[locId]` object currently uses legacy names:

| Legacy name | Canonical name (entity) |
|---|---|
| `rating` | `forageQuality` |
| `heightCm` | `forageHeightCm` |
| `coverPct` | `forageCoverPct` |
| `condition` | `forageCondition` |
| `baleRingCount` | `baleRingResidueCount` |
| `recoveryMin` | `recoveryMinDays` |
| `recoveryMax` | `recoveryMaxDays` |
| `notes` | `notes` (unchanged) |

**Apply a find-and-replace pass** through `openSurveySheet` (lines 624–1077). Specifically:

- **Line 667 — `readings` init.** Replace with: `{ forageQuality: null, forageHeightCm: null, forageCoverPct: null, forageCondition: null, baleRingResidueCount: null, recoveryMinDays: null, recoveryMaxDays: null, notes: null }`
- **Lines 677–684 — bulk-edit hydration.** `r.forageQuality = o.forageQuality`, `r.forageHeightCm = o.forageHeightCm`, etc. Destructure if cleaner: `Object.assign(r, { forageQuality: o.forageQuality, forageHeightCm: o.forageHeightCm, ... })`.
- **Lines 693–700 — draft-entry hydration.** Same mapping pattern.
- **Line 720 — `saveDraft` skip predicate.** Update to: `if (r.forageQuality == null && r.forageHeightCm == null && r.forageCoverPct == null && !r.forageCondition) continue;`
- **Lines 721–725 — `SurveyDraftEntryEntity.create(...)` call.** Since the names now match, simplify to spread: `{ operationId, surveyId, locationId: locId, ...r }`.
- **Line 879 — completeness badge.** Update to: `const isComplete = r.forageQuality != null && r.forageHeightCm != null && r.forageCoverPct != null && r.forageCondition != null;`
- **Line 1019 — `commitSurvey` rated filter.** Update to: `readings.filter(([_k, r2]) => r2.forageQuality != null || r2.forageHeightCm != null || r2.forageCoverPct != null || r2.forageCondition != null)`.
- **Lines 1028–1035 — `PaddockObsEntity.create(...)` call.** Simplify to spread: `{ operationId, locationId: locId, observedAt: surveyDate + 'T12:00:00Z', type: 'open', source: 'survey', sourceId: surveyId || null, ...r2 }`.

The spread simplifications are a nice cleanup, not a requirement — if explicit mapping reads more clearly, keep it explicit. The important thing is that every `r.legacyName` site uses the canonical name post-refactor.

**Grep contract (run before committing):** inside `src/features/locations/index.js`, the following greps must return zero hits:

```
grep -n "r\.rating\|r\.heightCm\|r\.coverPct\|r\.baleRingCount\|r\.recoveryMin\|r\.recoveryMax" src/features/locations/index.js
grep -n "readings\[.*\]\.\(rating\|heightCm\|coverPct\|baleRingCount\|recoveryMin\|recoveryMax\)" src/features/locations/index.js
```

`r.condition` is ambiguous (might hit other `.condition` uses), so just eyeball the `openSurveySheet` body for any stray `r.condition` / `readings[x].condition` references.

---

## Part 4 — State preservation across `renderPaddockList()` re-renders

Expand/collapse, filter toggle, and search typing all cause `renderPaddockList()` to tear down and rebuild. With the refactor, input state lives inside each `renderSurveyCard` instance's internal inputs — not in direct `change`-handler writes into `readings`. So every re-render MUST pull values back into `readings` FIRST.

Add a write-back helper inside `openSurveySheet` alongside `triggerDraftSave`:

```js
function commitReadingsFromCards() {
  for (const [locId, card] of cards) {
    const v = card.getValues();
    if (readings[locId]) Object.assign(readings[locId], v);
  }
}
```

Call it at the **top** of `renderPaddockList()`:

```js
function renderPaddockList() {
  commitReadingsFromCards();  // NEW: preserve in-progress input state
  cards.clear();              // NEW: old cards are about to be torn down
  clear(paddockList);
  let filtered = [...locs];
  ...
}
```

Also call it from:

- **`saveDraft()`** — at the very top, before removing old draft entries. Without this, Save Draft writes stale readings if the user typed a value and immediately tapped Save Draft before the `change` event fired.
- **`commitSurvey()`** — same pattern, at the very top, for the same reason on Finish & Save.
- **The `surveySheet.close()` auto-save wrapper at line 1073** — currently calls `saveDraft()`; since `saveDraft` now commits readings first, no extra call needed.

That's the whole state-preservation model. No debouncing change-handlers per field, no `onChange` callback on `renderSurveyCard`. Just "pull from cards before any read path that needs canonical state."

**Why not add `onChange` to `renderSurveyCard`?** It would be cleaner in the long run but is out of scope for this OI. Tim's acceptance criteria only require state to survive the explicit re-render / save points. Keep `_shared.js` and `survey-card.js` untouched so the other four callers that use them can't be destabilized.

---

## Part 5 — Tests

Add `tests/unit/pasture-survey-refactor.test.js` with at least these cases. The existing test suite should grow by 4–6 cases and remain at 100% pass.

**Test 1 — Layout structure (Single mode).**
```
- Open openSurveySheet with one location, stub farmSettings, give the loc areaHectares
- Assert: panel.querySelector('.obs-top-row') is not null
- Assert: panel.querySelectorAll('.obs-top-row .obs-field').length === 3 (height, cover, rings)
- Assert: panel.querySelector('[data-testid="obs-card-notes"]') is not null
- Assert: recovery inputs render before the notes textarea (getBoundingClientRect().top comparison,
  OR DOM order: recovery.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING === truthy)
```

**Test 2 — Layout structure (Bulk mode, expanded card).**
```
- Open openSurveySheet with multiple locations (no locationId), one paddock expanded
- Same assertions as Test 1 for the expanded card
```

**Test 3 — BRC auto-fill parity (OI-0124 Phase 1 preservation).**
```
- Open sheet with areaHectares set, ringDiameterCm set in farmSettings
- Type "3" into the bale-ring input
- Assert: cover input value is now > 0 (auto-fill fired)
- Assert: the helper caption text includes "Sets forage cover to"
```

**Test 4 — Round-trip draft save.**
```
- Open sheet in bulk mode (no locationId, no editSurveyId)
- Populate all 8 fields on one paddock (forageHeightCm, forageCoverPct, forageQuality,
  forageCondition, baleRingResidueCount, recoveryMinDays, recoveryMaxDays, notes)
- Call saveDraft() (or dispatch the Save Draft button click)
- Assert: getAll('surveyDraftEntries') contains a row for that paddock with all 8 fields set
- Close and reopen the sheet (new openSurveySheet call for the same operation)
- Assert: the paddock's card, once expanded, shows the 8 values populated in its inputs
```

**Test 5 — Expand/collapse preserves in-progress state.**
```
- Open sheet in bulk mode, expand paddock A, type a height value into the card
- Collapse paddock A (click card header)
- Re-expand paddock A
- Assert: the height input value is still the typed value (state survived commitReadingsFromCards → re-render → re-hydrate)
```

**Test 6 — Legacy field names are gone.**
```
- Static check (no runtime): import the module source string, grep for the legacy patterns above,
  assert all return zero matches. This catches future regressions where a merge reintroduces the
  old names.
```

If Test 6 is awkward to express in Vitest, skip it — the grep contract in Part 3 is the equivalent and must be run as a pre-commit check regardless.

---

## Part 6 — Commit + push

Commit message:

```
OI-0126: delegate Pasture Survey card body to renderSurveyCard

Close the OI-0112 unification gap on the Field Mode → Pasture Survey path.
Replaces ~100 lines of hand-rolled form rendering inside openSurveySheet
with a single renderSurveyCard call so Survey matches the pre-graze card
layout everywhere else in the app: 3-up Height/Cover/Rings top row at
88/88/72px, 1–100 quality slider with gradient track and Poor/Fair/Good/
Excellent anchors, condition chips, recovery min–max, and Notes textarea.

Changes:
- src/features/locations/index.js: import renderSurveyCard; delete
  lines ~903–1001 (outer rating slider/bar, hand-rolled Height/Cover row,
  hand-rolled BRC block, hand-rolled condition chips, hand-rolled
  recovery row); replace with one renderSurveyCard call bound to
  readings[loc2.id]; rename legacy `readings` field names (rating →
  forageQuality, heightCm → forageHeightCm, coverPct → forageCoverPct,
  condition → forageCondition, baleRingCount → baleRingResidueCount,
  recoveryMin/Max → recoveryMinDays/MaxDays; notes unchanged) throughout
  openSurveySheet, saveDraft, commitSurvey, and the completeness badge;
  add commitReadingsFromCards() + cards Map write-back at the top of
  renderPaddockList, saveDraft, commitSurvey so values survive re-render.
- tests/unit/pasture-survey-refactor.test.js (new): 5 cases covering
  layout structure (single + bulk), BRC auto-fill parity, round-trip
  draft save, and expand/collapse state preservation.

Adds the Notes textarea that was missing from the Field Mode Pasture
Survey path (present as a readings field + commitSurvey write but with
no UI — a dead write). Preserves OI-0124 Phase 1 BRC behavior via the
`areaHectares ?? areaHa` fallback. No schema change, no migration, no
CP-55/CP-56 impact (all 8 fields already in survey_draft_entries and
paddock_observations; round-trip unchanged).

Closes OI-0126.
```

Push command (run in the repo):

```
cd ~/Github/GTHO-v2 && git add -A && git commit -m "..." && git push origin main
```

---

## What not to touch

- **`src/features/observations/survey-card.js`** — already correct.
- **`src/features/observations/_shared.js`** — already correct.
- **`src/entities/survey-draft-entry.js`** — field names already canonical.
- **`src/entities/paddock-observation.js`** — field names already canonical.
- **`src/features/surveys/index.js`** — the `/surveys` screen's Create sheet already delegates correctly.
- **`supabase/migrations/`** — no new migration, no schema change.
- **`src/data/backup-migrations.js`** — no schema_version bump, no BACKUP_MIGRATIONS entry.
- **`src/styles/main.css`** — `.obs-top-row` / `.obs-field*` already cover the shared layout.
- **Any other `loc.areaHa` site outside `openSurveySheet`** — those live under OI-0124 Phase 2, not this OI.

---

## Verification checklist (before push)

- [ ] `npx vitest run` — all unit tests pass (suite grew by ≥4 cases).
- [ ] `grep -n "r\.rating\|r\.heightCm\|r\.coverPct\|r\.baleRingCount\|r\.recoveryMin\|r\.recoveryMax" src/features/locations/index.js` returns zero hits.
- [ ] `grep -n "readings\[.*\]\.\(rating\|heightCm\|coverPct\|baleRingCount\|recoveryMin\|recoveryMax\)" src/features/locations/index.js` returns zero hits.
- [ ] `grep -n "import { renderSurveyCard }" src/features/locations/index.js` returns exactly 1 hit.
- [ ] Eyeball `openSurveySheet` for any stray `r.condition` / `readings[x].condition` references that should be `r.forageCondition`.
- [ ] OPEN_ITEMS.md OI-0126 status flipped to closed with commit SHA; Change Log row appended.
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] `git log origin/main -1` shows the pushed commit SHA matches local HEAD (verify-push rule).

---

## Post-ship note for Cowork

After commit + push lands, Cowork will:

1. Verify `git log origin/main -1` matches.
2. Prompt Tim to device-smoke the layout on getthehayout.github.io/GTHO-v2/ (Field Mode → Pasture Survey, both Single and Bulk, confirm Notes appears, Recovery is above Notes, Height/Cover/Rings on one row).
3. Flip OI-0124 Phase 1 device-smoke checkbox for the Pasture Survey surface (the last of the four).
4. Consider whether OI-0124 Phase 2 is up next or whether Tim wants a different priority.
