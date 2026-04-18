# SESSION BRIEF — Field-Testing Roadblocks Bundle (OI-0100 / OI-0101 / OI-0103 / OI-0104 / OI-0105)

**Date:** 2026-04-18
**Repo:** GTHO-v2 (`main` branch)
**Origin:** Tim ran v2 against his own farm data and hit six roadblocks. OI-0102 (multi-paddock picker) is DESIGN REQUIRED and stays deferred. The other five are implementable and bundled here.

## OPEN_ITEMS changes

All five OIs already written to `OPEN_ITEMS.md` (OI-0100 through OI-0105 at the top of the Open section). Change Log row dated 2026-04-18 added. No further OPEN_ITEMS.md edits needed in this session other than:

- Mark OI-0100, OI-0101, OI-0103, OI-0104, OI-0105 as **closed** with the commit hashes at the end of this session.
- Move them from `## Open` to `## Closed`.
- Add a Change Log row capturing what shipped.

Do **not** touch OI-0102 — it stays open and DESIGN REQUIRED.

## Ship order

Work these in dependency order. Commit after each to keep the `main` branch recoverable if something fails field testing.

### 1. OI-0103 — Feed check Save button (P0 blocker, ship first)

One-character rename in `src/features/feed/check.js:262`:

```js
// change:
checkDate: dateInput.value, time: timeInput.value || null,
// to:
date: dateInput.value, time: timeInput.value || null,
```

Grep the file for any other `checkDate` occurrences — there should be none, but confirm. The entity (`src/entities/event-feed-check.js`) declares `date` as the field name; `move-wizard.js:466` and `close.js` both call with the correct key, so `check.js` is the outlier.

**Tests:**
- Unit: mock `add()`, assert `FeedCheckEntity.create` is called with a `date` key populated from `dateInput.value`.
- E2E: open feed check sheet → enter a value → save → assert row exists in Supabase `event_feed_checks` (per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI").

Commit message should call out the v1-trap class: *UI captured data, silent drop on entity validate, invisible to user.*

### 2. OI-0101 — Move wizard dateIn/timeIn one-way mirror

In `src/features/events/move-wizard.js` state at wizard open, add:

```js
state.dateInTouched = false;
state.timeInTouched = false;
```

When rendering Step 3 (line ~302), after creating `inputs.dateOut` and `inputs.timeOut`, attach input listeners that mirror into `inputs.dateIn` / `inputs.timeIn` — but only if the corresponding `*Touched` flag is false:

```js
inputs.dateOut.addEventListener('input', () => {
  if (!state.dateInTouched && inputs.dateIn) {
    inputs.dateIn.value = inputs.dateOut.value;
    state.dateIn = inputs.dateOut.value;
  }
});
// same pattern for timeOut → timeIn
```

On `inputs.dateIn` / `inputs.timeIn`, attach `input` listeners that flip the flag on first keystroke:

```js
inputs.dateIn.addEventListener('input', () => { state.dateInTouched = true; });
```

**Rule:** mirror is one-way (close → open only). Editing open values never rewrites close values. After the user types once in `dateIn`, further changes to `dateOut` no longer affect `dateIn`.

**Tests:** unit coverage for the three cases (mirror works, mirror stops after manual edit, opposite direction never propagates).

### 3. OI-0105 — Anchored search bar on location picker

In `src/features/events/index.js:641` `renderLocationPicker`, add a search input at the top of the container:

- `position: sticky; top: 0; background: white; z-index: 1; padding: var(--space-2); border-bottom: 1px solid var(--border);`
- `placeholder = t('event.locationPicker.search')` ("Search paddocks").
- Input event re-renders the sections filtered by `loc.name.toLowerCase().includes(query.toLowerCase())`.
- Sections with zero matches after filter do not render their header.
- Small `×` clear button restores the full list.
- Initial focus lands in the search input so the farmer can type immediately on picker open.

Add the i18n key `event.locationPicker.search: "Search paddocks"` to `src/i18n/locales/en.json`.

**Tests:** unit — type into search filters list, empty sections collapse, clear restores, applies to both move wizard Step 2 and new-event dialog.

### 4. OI-0100 — Embed Survey paddock card as pre-graze observation UI

**First, check GH-12 status.** Grep for `features/surveys` or a paddock-card file in that area.

- **If GH-12 is shipped and the paddock card is already a standalone module:** extract (if needed) to `src/features/observations/paddock-card.js` and import from both surfaces. Pass `saveTo: 'event_observations'` when called from the move wizard; pass `saveTo: 'paddock_observations'` when called from the survey sheet.
- **If GH-12 is not shipped:** build the shared card now at `src/features/observations/paddock-card.js` per UI_SPRINT_SPEC.md's Survey paddock card spec (rating slider, veg height, cover% slider with bale-ring helper, forage condition enum, recovery window). GH-12 will adopt the shared component when it lands. Call out the sequencing decision in the commit message so the GH-12 reviewer doesn't duplicate.

**Integration in `src/features/events/move-wizard.js`:** lines 354–356 currently do `renderPreGrazeFields(farmSettings)`. Swap for `renderPaddockCard({ saveTo: 'event_observations', farmSettings, initialValues: {} })`. The returned `getValues()` feeds into the existing `createObservation` call at line 587; the card returns the same shape (`forageHeightCm`, `forageCoverPct`, plus the new fields `rating`, `forageCondition`, `baleRingResidueCount`, etc.) and `event_observations` already has columns for every one of them (migration 022; see OI-0089 for the doc catch-up that captured this).

**Do not touch** `renderPostGrazeFields` or the survey's `paddock_observations` writes. This OI is pre-graze on event surfaces only.

**Tests:** component tests for the shared card (slider ranges, bale-ring helper auto-fill); move-wizard integration test confirms values flow through to `event_observations`.

### 5. OI-0104 — Move wizard feed transfer: 2-way radio + relocation + residual path

**Coordinates with OI-0092.** Check OI-0092 status before implementing. If OI-0092 has shipped its schema (either `event_feed_residual_deposits` table or `event_feed_entries.residual_qty` column), the "Leave as residual" arm writes to the real fertility-ledger path. If OI-0092 is still a stub, this OI's residual arm writes to a placeholder and a follow-up PR flips it to the real path. Flag the decision in the commit message.

**UI changes in `src/features/events/move-wizard.js` Step 3:**

Reorder so the structure is:

```
Close [Source Paddock Name]
  - Date out / Time out
  - Post-graze observation card (existing)
  - FEED TRANSFER (new placement — moved up from below)

Open [Destination Paddock Name]   (only for destType === 'new')
  - Date in / Time in (OI-0101 prefill)
  - Pre-graze observation card (OI-0100 shared card)
```

Replace the per-line checkbox (lines 384–398) with a per-line 2-way radio:

```
Batch #7 Hay → North Pasture — remaining: 30 lbs
  ( ) Move to new paddock   [default]
  ( ) Leave as residual     [records to fertility ledger]
```

i18n keys to add:
- `event.feedTransfer.move: "Move to new paddock"`
- `event.feedTransfer.residual: "Leave as residual"`
- `event.feedTransfer.residualCaption: "Records to fertility ledger"`

**`executeMoveWizard` write logic** — branch per line choice. See OI-0104 body in OPEN_ITEMS.md for the full per-choice behavior table (close-reading `remainingQuantity`, destination delivery row, residual deposit). Key points:

- "Move" = current behavior. Close-reading `remainingQuantity = 0` for that line. One destination `event_feed_entries` row with `source_event_id`.
- "Residual" = stamp real remaining amount on close-reading check (not 0). Write residual-deposit row per OI-0092. No destination delivery row.
- Mixed choices per line (some move, some residual) must work — iterate `transferToggles` and branch per line.

Replace OI-0091's placeholder comment at `move-wizard.js:480–481` (the "OI-0092 residual feed NPK deposit is a v1-parity gap tracked separately" note) with the real residual-write call, and remove the "placeholder" language.

**Tests:**
- Unit: default is move; selecting residual writes the residual path with real remaining; mixed move+residual handled correctly per line.
- E2E: close Shenk with 30 lbs hay, leave as residual, assert row lands in the residual-deposit table (or placeholder column if OI-0092 not yet landed).

## OI-0102 — explicitly NOT in this brief

Multi-paddock selection in the pasture picker is DESIGN REQUIRED and deferred. Do not build. Leave OI-0102 open for a future design session with Tim. Six design questions are enumerated in the OI body — those need answers before any code lands.

## Post-ship checklist

- [ ] `PROJECT_CHANGELOG.md` — one row per commit (5 commits ≈ 5 rows, or one combined row if shipped in a single commit)
- [ ] Close OI-0100, OI-0101, OI-0103, OI-0104, OI-0105 in OPEN_ITEMS.md (move to Closed, add commit hash)
- [ ] Change Log row in OPEN_ITEMS.md summarizing what shipped
- [ ] All unit tests pass (`npx vitest run`)
- [ ] Store call param-count check: every `add()` = 5 params, every `update()` = 6 params, every `remove()` = 3 params
- [ ] Migration execution rule: OI-0104's residual path, if it includes a new column or table, follows Write + Run + Verify per CLAUDE.md
- [ ] CP-55/CP-56 spec: OI-0104 triggers the CP-55/CP-56 impact flag via OI-0092 — confirm the sync is done in the same commit
- [ ] Commit and push to `main`

## Related OPEN_ITEMS

- **OI-0092** — residual feed NPK deposits. OI-0104 is the UI + wiring for OI-0092's capture step.
- **GH-12** — Survey sheet v1 parity. OI-0100 depends on GH-12's paddock card component.
- **OI-0063** — closed; schema alignment between `event_observations` and `paddock_observations`. Made OI-0100's reuse architecturally possible.
- **OI-0091** — closed; window-split architecture. OI-0104 is the first touch of the `remainingQuantity: 0` line since OI-0091 shipped.
