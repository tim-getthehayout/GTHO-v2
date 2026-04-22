# Session Brief — 2026-04-22 — OI-0132 Dam ↔ Calf Bidirectional Sync + Backfill Tool

## What to ship

Two specs, one helper, one UI tweak. Bundle into one session (they share the helper).

1. **`github/issues/dam-calf-bidirectional-sync.md`** — Class A
   - New helper `src/features/animals/calving-sync.js` with `syncCalvingRecordForAnimal({before, after, operationId, confirmDeleteHandler})`
   - Four transitions: A1 create / A2 move / A3 delete / A4 birthdate change
   - Hard gate in `saveAnimal`: block save when `damId` is set and `birthDate` is null
   - Confirm dialog on A3 only (dam cleared to unknown). A2 and A4 are silent.
   - Return shape: `{ action, calvingRecordId, aborted, reason }` — `reason` added so Class B can distinguish `dam-not-found` / `already-exists` / `no-change` noop cases.

2. **`github/issues/backfill-calving-records-from-lineage.md`** — Class B
   - New batch routine `src/features/animals/backfill-calving-records.js` — iterates all animals, routes qualifying calves through `syncCalvingRecordForAnimal` in A1 mode.
   - Settings > Tools section with Run button + summary panel.
   - Idempotent: second run reports 0 created.

3. **UI_SPRINT_SPEC.md § SP-14** — Edit Animal dialog layout
   - Dam and Birth date on the same row (Dam ~55–60%, Birth date ~35–40%).
   - Label hint on Birth date toggles "optional" (grey) ↔ "required" (red) based on Dam selection.

## Dependencies

Class B depends on Class A's helper. Ship Class A first (or in the same commit) so the helper exists. The Class B spec explicitly calls for a `reason` field on noop returns — make sure the helper implementation includes it.

## Design decisions — all locked

All four OI-0132 design questions are closed. Do not re-open:

1. No `source` column on `animal_calving_records` (Option 1a locked).
2. Hard gate on birthDate when damId is set (inline block, no soft-warn).
3. Backfill lives in Settings > Tools (not dev-only).
4. Confirm dialog on A3 only.

If you spot a design gap during implementation, add an OI entry per CLAUDE.md §"Invention Required — Stop and Flag" — do not invent.

## OPEN_ITEMS changes

**None required from you.** Cowork already opened OI-0132 with status `open — DESIGN LOCKED, ready for spec files`. When the implementation lands, flip it to `closed — {date}, commit {hash}` per the orphan-flip rule (CLAUDE.md §OPEN_ITEMS.md Closure Discipline). Also grep OPEN_ITEMS.md for any sibling OI referencing `damId`, `dam_id`, `animal_calving_records`, or `saveAnimal`; piggyback-close anything a shipping fix resolves.

## Architecture Audit checklist (per CLAUDE.md)

- [ ] Entity unchanged on both sides — `animal.js` and `animal-calving-record.js` should not be edited. If you need to change an entity, stop — that's a design gap.
- [ ] No migration needed. If you think you need one, stop — the spec says no schema change.
- [ ] Store param-count check — every `add`, `update`, `remove` call in the new helper + batch routine must have the required param count (5 / 6 / 3).
- [ ] Grep contract passes: `grep -rn "update('animals'" src/features/animals/index.js` — every site preceded by the hard-gate check or inside the bulk-weight flow.
- [ ] CP-55/CP-56 impact: NONE. No backup spec touches.

## Known Traps

- **Phantom change/blur events** (OI-0115) — not applicable here. Edit Animal is a modal dialog, not a subscription-rendered list. Normal change handlers are fine.
- **Numeric coercion** — `calved_at` is `timestamptz` → comes back as string, not affected by the numeric-coercion rule. Date handling uses the existing `T12:00:00Z` pattern from `calving.js:125`.
- **Atomicity on A3 cancel** — the spec requires the confirm dialog fire BEFORE the `update('animals', ...)` call lands, so cancel aborts the entire save (animal row not mutated either). Do not fire `update` first and then show the dialog.

## Testing

Per CLAUDE.md §E2E Testing rule: e2e tests must verify Supabase round-trip, not just UI state. Query `animal_calving_records` directly after each UI action. Spec files list specific test cases.

## Commit message template

```
feat(animals): dam ↔ calf bidirectional sync + backfill tool (OI-0132)

Class A — Edit Animal saveAnimal keeps animal_calving_records in sync on every
damId or birthDate transition. Four paths via new syncCalvingRecordForAnimal
helper: A1 create, A2 move (UPDATE preserves record history), A3 delete (with
confirm dialog), A4 calved_at update. Hard gate blocks save when damId set
without birthDate.

Class B — Settings > Tools > Backfill calving records from lineage. Idempotent
batch routine routes legacy calves (damId + birthDate but no matching record)
through the A1 path. Summary panel reports created / skipped counts.

UI — Dam and Birth date share a two-column row in Edit Animal. Birth-date label
toggles "optional" ↔ "required" based on Dam selection. (UI_SPRINT_SPEC.md §SP-14)

No schema change. No CP-55/CP-56 impact.

OI-0132
```

## Git push and next-steps

After committing:

```bash
cd /Users/timjoseph/Github/GTHO-v2
git push origin main
git log origin/main -1  # verify push landed — SHA should match HEAD
```

If tests fail or anything surprises you during implementation, add an OPEN_ITEMS.md entry before fixing (per CLAUDE.md §Corrections to Already-Built Code). Do not silently fix and commit.
