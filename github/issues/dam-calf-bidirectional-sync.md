# Dam ↔ Calf Bidirectional Sync — Edit Animal write-through to `animal_calving_records`

## Summary

Any path that writes, changes, or clears `animals.dam_id` or `animals.birth_date` on a calf must keep the matching `animal_calving_records` row in lockstep. Today the Calving sheet (`src/features/health/calving.js`) correctly creates both sides at once, but the **Edit Animal dialog** (`src/features/animals/index.js` `saveAnimal`) writes `damId` to the calf without ever touching `animal_calving_records`. Result: farmers who correct parentage after the fact — or set it for the first time on a legacy calf — end up with one-sided data that cannot power the dam-fertility reports culling decisions rely on.

Four transitions to handle in the save handler, detected by diffing the pre-save `existingAnimal` against the post-save `data` object:

- **A1** — `damId` null → non-null: **create** a matching calving record.
- **A2** — `damId` non-null → non-null: **move** the matching calving record to the new dam via UPDATE (preserves the record's own history).
- **A3** — `damId` non-null → null: **delete** the matching calving record (after a confirm dialog).
- **A4** — `birthDate` changed on a calf with non-null `damId`: **update** the matching calving record's `calved_at`.

Plus a hard gate: saving with `damId` non-null and `birthDate` null is blocked with an inline error.

**Origin:** OI-0132 (2026-04-22). Tim noticed calf 2601 shows dam 70 on its detail card but dam 70's Calving history card is empty. Investigation confirmed the legacy data story is expected, but the forward flow (Edit Animal setting damId) bakes in the same asymmetry every time it's used. Tim's open-cow culling decisions need dam-fertility data that can only be built from `animal_calving_records`.

## Design Decisions (locked 2026-04-22)

All four OI-0132 design questions are closed — no open calls.

1. **Source column on calving records?** NO (Option 1a). Backfilled and event-captured records are indistinguishable. No schema change, no CP-55/CP-56 impact.
2. **Hard gate on birthDate when damId is set?** YES. Inline error blocks the save: "Birth date is required when a dam is set."
3. **Backfill location?** Settings > Tools (separate spec — see `backfill-calving-records-from-lineage.md`).
4. **Confirm dialog on destructive transitions?** YES on A3 only. A2 (move) and A4 (birthdate change) are silent.

## Schema Impact

**NONE.** All fields already exist: `animals.dam_id`, `animals.birth_date`, `animal_calving_records.dam_id`, `animal_calving_records.calf_id`, `animal_calving_records.calved_at`, `animal_calving_records.sire_animal_id`, `animal_calving_records.stillbirth`.

## CP-55/CP-56 Spec Impact

**NONE.** No schema change → no export/import shape change. More rows may land in `animal_calving_records`, but the table is already in BACKUP_TABLES and FK_ORDER.

## Architecture — Extract to Shared Helper

**Do not inline A1–A4 into `saveAnimal`.** Extract into a standalone helper:

```
src/features/animals/calving-sync.js

export function syncCalvingRecordForAnimal({
  before,         // { damId, birthDate, sireAnimalId } — pre-save state (null for creates)
  after,          // { id, damId, birthDate, sireAnimalId } — post-save animal record
  operationId,
  confirmDeleteHandler,  // async (damName) => boolean — called on A3; returns true to proceed
})
```

Reasons:
1. The Settings > Tools backfill (Class B, separate spec) calls this helper in A1 mode to heal legacy data without duplicating logic.
2. Future Excel import will call the same helper inline at write time.
3. Keeps `saveAnimal` readable — it becomes `await syncCalvingRecordForAnimal({ before, after, operationId, confirmDeleteHandler })` after the animal update lands.

The helper returns `{ action: 'create' | 'move' | 'delete' | 'update-date' | 'noop', calvingRecordId, aborted }`. Callers can use `action` for test assertions and `aborted` (true if confirm dialog returned false) to know whether to roll back the parent animal update.

**Confirm dialog behavior:** The helper accepts a `confirmDeleteHandler` callback so the UI can provide the actual dialog implementation. In `saveAnimal`, pass a function that shows the dam-named prompt. In the backfill routine, pass `null` (A3 never fires in create-only mode). Unit tests can pass a stub returning true/false to exercise both branches.

## Transition Logic

Pre-save state = `existingAnimal` (nullable for creates). Post-save target = `data` object that will go into `update('animals', id, data, ...)`. Compute the transition from those two objects.

### A1 — damId null → non-null (create)

**Trigger:** `!before.damId && after.damId`

**Preconditions:**
- `after.damId` resolves to a live `animals` row in the same operation. If not, skip with a log entry — dam doesn't exist in system.
- `after.birthDate` is non-null. Enforced by the hard gate before the helper is called.
- No existing `animal_calving_records` row for `(damId=after.damId, calfId=after.id)`. If one exists, skip (idempotent).

**Action:**
```js
add('animalCalvingRecords', CalvingEntity.create({
  operationId,
  damId: after.damId,
  calfId: after.id,
  calvedAt: `${after.birthDate}T12:00:00Z`,
  sireAnimalId: after.sireAnimalId || null,
  sireAiBullId: null,
  stillbirth: false,
  driedOffDate: null,
  notes: null,
}), CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
```

Returns `{ action: 'create', calvingRecordId: newId, aborted: false }`.

### A2 — damId non-null → non-null (move)

**Trigger:** `before.damId && after.damId && before.damId !== after.damId`

**Preconditions:**
- `after.damId` resolves to a live `animals` row in the same operation. If not, skip.
- `after.birthDate` is non-null. Enforced by the hard gate.
- Look up the matching record: `getAll('animalCalvingRecords').find(r => r.damId === before.damId && r.calfId === after.id)`. If missing, fall through to A1 (create) — legacy data where the record was never created gets healed here.

**Action:**
```js
update('animalCalvingRecords', existingRecord.id, {
  damId: after.damId,
  // calvedAt is also updated if birthDate changed in the same save — see A4
  calvedAt: after.birthDate !== before.birthDate
    ? `${after.birthDate}T12:00:00Z`
    : existingRecord.calvedAt,
}, CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
```

Preserves the record's `created_at`, `notes`, `sire_animal_id`, `sire_ai_bull_id`, `stillbirth`, `dried_off_date`. Only `dam_id` (and `calved_at` if birthDate also changed) mutates.

Returns `{ action: 'move', calvingRecordId: existingRecord.id, aborted: false }`.

### A3 — damId non-null → null (delete)

**Trigger:** `before.damId && !after.damId`

**Preconditions:**
- Look up the matching record: `getAll('animalCalvingRecords').find(r => r.damId === before.damId && r.calfId === after.id)`. If missing, noop.

**Confirm dialog** (via `confirmDeleteHandler`):
- Look up the dam's display name: `const dam = getAll('animals').find(a => a.id === before.damId); const damName = dam?.tagNum || dam?.name || \`A-\${before.damId.slice(0,5)}\``.
- Prompt text: `"This will remove the calving record from ${damName}. Continue?"` with Cancel and Continue buttons.
- If handler returns false: return `{ action: 'delete', calvingRecordId: existingRecord.id, aborted: true }` and DO NOT delete. The caller (`saveAnimal`) is responsible for rolling back the animal update — see "Atomicity" below.
- If handler returns true: proceed.

**Action:**
```js
remove('animalCalvingRecords', existingRecord.id, 'animal_calving_records');
```

Returns `{ action: 'delete', calvingRecordId: existingRecord.id, aborted: false }`.

### A4 — birthDate changed, damId non-null and unchanged

**Trigger:** `before.damId === after.damId && before.damId && before.birthDate !== after.birthDate`

**Preconditions:**
- `after.birthDate` is non-null. Enforced by the hard gate.
- Look up the matching record. If missing, fall through to A1 (create).

**Action:**
```js
update('animalCalvingRecords', existingRecord.id, {
  calvedAt: `${after.birthDate}T12:00:00Z`,
}, CalvingEntity.validate, CalvingEntity.toSupabaseShape, 'animal_calving_records');
```

Silent — no dialog.

Returns `{ action: 'update-date', calvingRecordId: existingRecord.id, aborted: false }`.

### Noop

**Trigger:** none of the above — either the calf has no damId before or after, or nothing changed.

Returns `{ action: 'noop', calvingRecordId: null, aborted: false }`.

## Hard Gate

**Location:** `saveAnimal`, before the `update('animals', ...)` call.

**Rule:** If `data.damId` is non-null AND `data.birthDate` is null → show inline validation error "Birth date is required when a dam is set" and abort the save. Do not call `update`, do not call the sync helper.

Two cases this catches:
1. User sets damId on a calf that never had a birthDate → blocked.
2. User clears birthDate on a calf that has a damId → blocked.

**Error surface:** Re-use the existing validation error pattern in `saveAnimal`. Scroll the Edit Animal panel to the Dam/Birth-date row so the farmer sees both fields.

## Atomicity

A3's confirm-cancel path opens a question: if the user cancels the dialog, should we roll back the `update('animals', id, { damId: null, ... })` that already landed?

**Answer — yes, restore state before showing the dialog.**

The cleanest sequence in `saveAnimal`:

1. Compute `existingAnimal` snapshot.
2. Hard-gate check on `damId` + `birthDate`.
3. Compute `transition` = what A1/A2/A3/A4/noop will happen.
4. If `transition === 'A3'`: show confirm dialog FIRST. If cancelled, abort the whole save — never call `update` on the animal at all.
5. If confirmed (or any non-A3 transition): call `update('animals', id, data, ...)` first, then call the sync helper to perform A1/A2/A3/A4 on the calving record.

This keeps the cross-entity write ordering tight: the animal row and the calving record row either both change or neither does. (Not a true DB transaction — v2 doesn't have that — but close enough for the farmer UX.)

## UI Layout (see UI_SPRINT_SPEC.md SP-14)

Dam select and Birth date move to a shared two-column row. Birth date label toggles "optional" ↔ "required" based on Dam selection. Full spec in UI_SPRINT_SPEC.md § SP-14 — this spec file covers only the data-logic side.

## Files Affected

- `src/features/animals/index.js` — `saveAnimal` calls the new helper; hard-gate validation added.
- **New:** `src/features/animals/calving-sync.js` — the A1–A4 helper.
- **New:** `tests/unit/calving-sync.test.js` — covers each transition, the hard gate, the confirm-cancel path, the idempotency no-op, and the legacy-record-missing-falls-through-to-A1 case.
- **New:** `tests/e2e/dam-calf-bidirectional-sync.spec.js` — Supabase round-trip per CLAUDE.md §E2E. Creates a calf, edits damId via Edit Animal, queries `animal_calving_records` directly.

No changes to:
- `src/entities/animal-calving-record.js` — entity unchanged.
- `src/entities/animal.js` — entity unchanged.
- `supabase/migrations/` — no migration.
- `src/data/backup-export.js` / `backup-import.js` — no payload change.

## Acceptance Criteria

- [ ] **A1 create** — Edit Animal save: setting a valid `damId` on a calf with `birthDate` creates a matching `animal_calving_records` row with `calved_at = birthDate + T12:00:00Z`, `stillbirth = false`, `sire_animal_id` from the calf if set.
- [ ] **A2 move (with existing record)** — Edit Animal save: changing `damId` from dam A to dam B updates the existing calving record's `dam_id` from A to B via UPDATE (record id unchanged). Dam A's Calving history loses the row; Dam B's gains it. Record's `created_at`, `notes`, `sire_animal_id` preserved.
- [ ] **A2 move (legacy gap)** — Edit Animal save: changing `damId` from dam A to dam B on a calf where no calving record exists for (A, calf) creates a new record for (B, calf). Fall-through to A1.
- [ ] **A3 delete — confirmed** — Edit Animal save: clearing `damId` (non-null → null) shows the confirm dialog with the dam's tag/name; on Continue, the calving record is deleted and the animal update lands.
- [ ] **A3 delete — cancelled** — Edit Animal save: clearing `damId` and cancelling the dialog aborts the entire save — neither the animal's `dam_id` nor the calving record is touched. Edit Animal dialog stays open with the cleared selection visible so the user can recover or re-confirm.
- [ ] **A4 birthdate change** — Edit Animal save: changing `birthDate` on a calf with non-null `damId` updates the matching calving record's `calved_at` silently, no dialog.
- [ ] **Hard gate — setting damId without birthDate** — blocks the save with inline error "Birth date is required when a dam is set." Animal update does not land.
- [ ] **Hard gate — clearing birthDate with damId set** — same inline error; blocks save.
- [ ] **Idempotency** — calling `syncCalvingRecordForAnimal` twice with identical before/after is a noop on the second call. Second call never creates a duplicate record.
- [ ] **Dam-doesn't-exist skip** — if `after.damId` is a UUID that doesn't match any animal in the current operation, the A1/A2 paths skip silently with a `logger.warn('calving-sync', 'dam not found', { damId })` entry and return `{ action: 'noop' }`. The animal's `dam_id` field still saves (to match Tim's caveat — dam died/culled before the system was set up).
- [ ] **Unit test coverage** — one test per transition (A1, A2 with record, A2 legacy gap, A3 confirmed, A3 cancelled, A4), plus hard gate, plus idempotency, plus dam-doesn't-exist.
- [ ] **E2E** (Supabase round-trip): create calf with damId + birthDate via Edit Animal → reload → open dam's detail sheet → Calving history card shows the calf → query `animal_calving_records` table directly and assert row exists with correct shape.
- [ ] **Grep contract** — `grep -rn "update('animals'" src/features/animals/index.js` — every site must be preceded by hard-gate check OR be inside the bulk-weight flow (which already has its own guardrails per OI-0096).

## Known Traps (from CLAUDE.md §Known Traps)

- **Numeric coercion:** `animal_calving_records.calved_at` is `timestamptz`, returned as a string — not affected by the numeric-coercion rule. Dates: use the existing `T12:00:00Z` pattern from `src/features/health/calving.js:125`.
- **Pure-insert invariant (OI-0115):** the calving record operations here are A1 (insert), A2 (update), A3 (delete), A4 (update) — all standard store operations. No subscription-cascade phantom-write class applies because the Edit Animal dialog is not a re-rendered list. Normal change handlers.
- **Store call param-count:** each `add`, `update`, `remove` call must pass all required params (validate fn, toSupabase fn, table name). Verified in each transition's code block above.

## Related OIs

- **OI-0099** (shipped) — wired `saveAnimal` to read `inputs.damId` at all. This spec builds on OI-0099's fix.
- **OI-0132** (this spec) — design source.
- **Class B / Settings > Tools backfill** — separate spec `backfill-calving-records-from-lineage.md`, reuses `syncCalvingRecordForAnimal` helper in A1-only mode.
- **Future:** Excel import spec will call the same helper at row write time.

## Implementation Order

1. Write the `src/features/animals/calving-sync.js` helper + unit tests.
2. Wire `saveAnimal` to call it after the animal update; add the hard-gate pre-check.
3. Implement the confirm-dialog UI using the existing pattern (check how `window.confirm` is used elsewhere in the codebase — e.g., `src/features/health/calving.js:188` uses `window.confirm(t('health.calvingReassignPrompt'))` — same pattern here with an interpolated dam name).
4. UI layout changes per UI_SPRINT_SPEC.md § SP-14 (Dam + Birth date shared row).
5. E2E test last — once all the above is passing locally.
