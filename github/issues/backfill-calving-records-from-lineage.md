# Settings > Tools — Backfill Calving Records from Lineage

## Summary

A Settings > Tools button that walks every calf in the current operation, finds the ones that have `dam_id` set but no matching `animal_calving_records` row, and creates the missing records. Each synthesized record uses the calf's `birth_date` as `calved_at`.

Primary use case: cleaning up legacy v1-migrated data where calves carry direct parentage pointers (`animals.dam_id`) but the dam-side calving event was never captured as an event. Forward-looking use case: Excel import (future) that writes `dam_id` at the animal row without inline calving-record sync — the backfill heals the gap on next run.

Idempotent and safe to re-run. Produces a summary panel: N created, N skipped (dam missing), N skipped (no birthdate), N skipped (already exists).

**Origin:** OI-0132 (2026-04-22). Tim's open-cow pregnancy checks yesterday — the dams that are now open threw heifers last year that he's evaluating as replacements. Without a dam-with-calves report, those culling decisions can't consider dam fertility. Legacy migrated data leaves the dam's Calving history card empty even when the calf has the dam pointer set.

## Design Decisions (locked 2026-04-22)

- **Location:** Settings > Tools (not dev-only, not part of v1 migration tool). Farmer-facing utility.
- **Idempotent:** re-runnable without side effects. A second run creates nothing.
- **Skip rules** (exactly as Tim's caveat):
  - Dam doesn't exist in system (died/culled before app setup) → skip, count in summary.
  - Calf has no birthDate → skip, count in summary.
  - Calving record already exists for `(damId, calfId)` → skip, count in summary.
- **No `source` column** — backfilled records are indistinguishable from event-captured ones (per OI-0132 Option 1a).
- **No confirm dialog** — the operation only creates rows, never deletes or overwrites. Safe to run without a speed bump.

## Schema Impact

**NONE.** Uses existing columns.

## CP-55/CP-56 Spec Impact

**NONE.** No schema change. More rows may land in `animal_calving_records` but the table is already in BACKUP_TABLES and FK_ORDER.

## Architecture — Reuse the A1–A4 Helper

The backfill routine must reuse the `syncCalvingRecordForAnimal` helper from `src/features/animals/calving-sync.js` (shipped by the sibling spec `dam-calf-bidirectional-sync.md`). Do not reimplement the create logic.

Per-calf invocation:
```js
const result = syncCalvingRecordForAnimal({
  before: { damId: null, birthDate: calf.birthDate, sireAnimalId: calf.sireAnimalId },
  after:  calf,
  operationId,
  confirmDeleteHandler: null,  // A3 never fires in create-only mode
});
```

This routes every qualifying calf through the A1 (create) branch. The helper's built-in skip logic handles dam-doesn't-exist and already-exists; the batch routine only adds the no-birthDate skip count.

## UX Flow

### Entry Point

Settings screen → **Tools** section (new section if not already present, below existing Settings subsections but above the sign-out / account row).

```
┌─ Tools ────────────────────────────────┐
│                                         │
│  Backfill calving records from lineage  │
│  Creates calving records for calves     │
│  that have a dam set but no matching    │
│  record. Safe to re-run.                │
│                                         │
│  [ Run backfill ]                       │
│                                         │
└─────────────────────────────────────────┘
```

**Claude Code task on implementation:** check `src/features/settings/index.js` for an existing Tools section. If one exists, append this row. If not, add a new Tools section above the sign-out row.

### Run Behavior

1. User taps "Run backfill".
2. Button disabled, text swaps to "Running…" with a small spinner.
3. Routine iterates all animals in the operation. Per calf:
   - If `damId` is null → skip (not counted).
   - If `birthDate` is null → increment `skippedNoBirthDate` counter.
   - Else: call `syncCalvingRecordForAnimal` in A1 mode.
     - Result `{ action: 'create' }` → increment `created`.
     - Result `{ action: 'noop' }` with dam-missing log → increment `skippedDamMissing`.
     - Result `{ action: 'noop' }` with already-exists (idempotent) → increment `skippedAlreadyExists`.
4. Routine completes. Render inline summary panel below the button:

```
Created: 43 calving records
Skipped (no birth date): 5 calves
Skipped (dam not in system): 12 calves
Skipped (already linked): 127 calves

[ Close ]
```

5. Button re-enables with text "Run again" — users can run the tool multiple times without harm. (Second run should report Created: 0 unless new data arrived between runs.)

### Edge Cases

- **Mid-run error on one calf** — log the error via `logger.error('calving-backfill', ...)`, increment a `skippedError` counter, continue with the next calf. Don't abort the whole batch.
- **No eligible calves at all** (empty operation, or all calves already linked) — show summary with all counters at 0 and a neutral message: "No calves needed backfilling."
- **Very large operations** — not a concern for Tim today, but iteration is O(N) over animals; if N > 5,000, consider chunking with a progress indicator. Not required for v1.

## Files Affected

- **New:** `src/features/animals/backfill-calving-records.js` — the batch routine. Exports `async function backfillCalvingRecords(operationId): Promise<{ created, skippedNoBirthDate, skippedDamMissing, skippedAlreadyExists, skippedError }>`.
- `src/features/settings/index.js` — add Tools section (if missing) and the backfill row.
- `src/i18n/i18n.js` — new strings:
  - `tools.title` = "Tools"
  - `tools.backfillCalving.title` = "Backfill calving records from lineage"
  - `tools.backfillCalving.description` = "Creates calving records for calves that have a dam set but no matching record. Safe to re-run."
  - `tools.backfillCalving.run` = "Run backfill"
  - `tools.backfillCalving.running` = "Running…"
  - `tools.backfillCalving.runAgain` = "Run again"
  - `tools.backfillCalving.summary.created` = "Created: {N} calving records"
  - `tools.backfillCalving.summary.skippedNoBirthDate` = "Skipped (no birth date): {N} calves"
  - `tools.backfillCalving.summary.skippedDamMissing` = "Skipped (dam not in system): {N} calves"
  - `tools.backfillCalving.summary.skippedAlreadyExists` = "Skipped (already linked): {N} calves"
  - `tools.backfillCalving.summary.empty` = "No calves needed backfilling."
- **New:** `tests/unit/backfill-calving-records.test.js`.
- **New:** `tests/e2e/settings-backfill-calving.spec.js`.

## Dependencies

This spec depends on `syncCalvingRecordForAnimal` existing. Ship the sibling spec `dam-calf-bidirectional-sync.md` **first** (or bundled into the same session). The helper's A1 branch must also return a discriminator (via log message or explicit return field) that lets the batch routine distinguish "dam missing" from "already exists" — both are currently `{ action: 'noop' }`. Recommend adding a `reason` field to noop returns:

```js
// In syncCalvingRecordForAnimal, refine noop returns:
return { action: 'noop', reason: 'dam-not-found', calvingRecordId: null, aborted: false };
return { action: 'noop', reason: 'already-exists', calvingRecordId: existing.id, aborted: false };
return { action: 'noop', reason: 'no-change', calvingRecordId: null, aborted: false };
```

Then the batch routine switches on `reason` to increment the right counter. **Add this to the sibling spec's helper signature** before implementation begins.

## Acceptance Criteria

- [ ] Settings → Tools section renders the Backfill row with title, description, and Run button.
- [ ] Tapping Run disables the button and shows "Running…".
- [ ] Routine iterates all animals in the operation and routes each qualifying calf through `syncCalvingRecordForAnimal` in A1 mode.
- [ ] Calves with null `damId` are skipped without being counted.
- [ ] Calves with `damId` set and `birthDate` null are skipped and increment `skippedNoBirthDate`.
- [ ] Calves with `damId` pointing at a non-existent animal are skipped and increment `skippedDamMissing`.
- [ ] Calves with `damId` + `birthDate` and no existing calving record get a new record created (A1 path) and increment `created`.
- [ ] Calves with `damId` + `birthDate` AND an existing calving record are skipped and increment `skippedAlreadyExists`.
- [ ] Summary panel renders all counters with correct i18n strings.
- [ ] Second run (idempotency) produces `created = 0` with all previously-created records now in `skippedAlreadyExists`.
- [ ] Empty-operation case shows "No calves needed backfilling."
- [ ] Mid-run error on one calf logs via `logger.error` and continues the batch. `skippedError` counter increments but doesn't abort.
- [ ] Unit tests cover: happy path (mixed skip + create), idempotency (second run), all four skip reasons, empty operation, mid-run error.
- [ ] E2E (Supabase round-trip): seed an operation with a calf that has damId + birthDate but no calving record → navigate to Settings > Tools → tap Run backfill → verify new row exists in `animal_calving_records` via direct Supabase query.

## Related

- **Sibling spec:** `dam-calf-bidirectional-sync.md` — provides the `syncCalvingRecordForAnimal` helper.
- **OI-0132** — design source, all decisions locked.
- **Future Excel import spec** — will call the same helper at row-write time; the backfill tool becomes the safety net if the import skips inline sync.

## Implementation Order

Recommended: ship the sibling spec (dam-calf-bidirectional-sync.md) first, then this one. The sibling delivers the helper; this one delivers the batch caller + Settings UI. Alternatively bundle both into a single Claude Code session.
