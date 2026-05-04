# Dam ↔ Calf Bidirectional Sync — Edit Animal write-through to `animal_calving_records`

**Status:** Shipped 2026-04-22 in commit `e9b40eb` (bundled with OI-0132 Class A + Class B). UX layout reconciled into V2_UX_FLOWS.md §15.1 (Session C, 2026-05-03). Data-logic spec reconciled into V2_APP_ARCHITECTURE.md §4 store doctrine + the helper file itself (Session D, 2026-05-04).
**Type:** Bug fix + architecture (shared helper)
**Priority:** P1 (open-cow culling decisions need dam-fertility data the asymmetry was breaking)
**Related OI:** OI-0132 (parent — closed)

## Authoritative spec (and live implementation)

The data-logic side now has two homes — the architecture doctrine and the helper module itself:

- **`src/features/animals/calving-sync.js`** — the shipped helper. Exports `syncCalvingRecordForAnimal({ before, after, operationId, confirmDeleteHandler })` which returns `{ action: 'create' | 'move' | 'delete' | 'update-date' | 'noop', calvingRecordId, aborted }`. The four transitions (A1 create, A2 move, A3 delete with confirm, A4 update-date), preconditions for each, and the legacy-fallback rule (a missing record falls through from A2/A4 to A1 to heal old data) are all implemented inline with comments. The helper is the source of truth — read the file, not a paraphrase, when planning any change.
- **`src/features/animals/index.js` `saveAnimal()`** — the caller. Carries the hard gate (saving with `damId` non-null and `birthDate` null is blocked with an inline validation error) and the atomicity sequence (compute transition first; on A3 show the confirm dialog before any write; on confirm-cancel skip the animal update entirely so the row + the calving record stay in lockstep without a true DB transaction).

The **UX layout** for the Dam + Birth-date shared row, the dynamic `optional` ↔ `required` label hint, and the inline error placement live in **V2_UX_FLOWS.md §15.1 "Animal Edit Sheet"** under the "Dam + Birth date — shared row layout (SP-14, OI-0132)" subsection. That section names this helper as the data-logic the layout supports.

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule. The data-logic detail (transition preconditions, atomicity sequence, confirm-cancel rollback) lives in the helper file's source code with comments — the right home for behavior tightly coupled to one module's implementation. The cross-cutting principle the helper embodies (mutations to one entity that mirror into a sibling entity must go through a shared helper, never inlined into individual save handlers) is captured in V2_APP_ARCHITECTURE.md §4 store-pattern doctrine.

**Schema impact:** none. **CP-55/CP-56 impact:** none — more rows may land in `animal_calving_records`, but the table is already in `BACKUP_TABLES` and `FK_ORDER`.

**Backfill spec for legacy data** lives separately in `github/issues/backfill-calving-records-from-lineage.md` (Class B of OI-0132). That backfill calls the same `syncCalvingRecordForAnimal` helper in A1 mode — one helper, two callers, zero duplication.
