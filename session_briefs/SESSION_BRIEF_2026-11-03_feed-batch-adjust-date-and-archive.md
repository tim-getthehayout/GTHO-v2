# SESSION_BRIEF — Feed batch adjustment date and archive

**Generated:** 2026-11-03  
**Source:** Grok design session  
**Status:** Ready for Grok Build

## What was decided

Manual quantity adjustments on a feed batch need a user-settable effective date (separate from the auto `created_at`). Empty batches need an archive action so they stay available for historical records and past feed entries but disappear from active selection lists. The feed batches list gets a show/hide archived pill.

`batches.archived` already exists and is already filtered in the active list and in feed selection. This work adds the UI controls and the new date field.

## What to build / change

1. **Schema (migration 036)**  
   - Column `batch_adjustments.adjustment_date date` (nullable).  
   - Backfill from `created_at`.  
   - Stamp `operations.schema_version = 36`.  
   - No-op `BACKUP_MIGRATIONS` entry `35: (b) => { b.schema_version = 36; return b; }`.  
   - Entity `src/entities/batch-adjustment.js`: add `adjustmentDate` to `FIELDS`, `create`, `toSupabaseShape`, `fromSupabaseShape`.  
   - Unit test updated for field count and round-trip.

2. **Adjustment sheet** (`src/features/feed/index.js`)  
   - Date input (defaults to today) above the reason dropdown.  
   - Pass the value into `BatchAdjustmentEntity.create`.

3. **Archive UI** (`src/features/feed/index.js`)  
   - Module-level `showArchived` flag.  
   - “Show archived / Hide archived” pill in the batches section header that toggles the list filter.  
   - Archive button on active batch cards (confirm dialog). Unarchive/Restore button when viewing archived.  
   - Empty state mentions hidden archived count when the pill is off.  
   - Delivery/check selection already filters `!archived && remaining > 0` — leave that alone.

4. **i18n** (`src/i18n/locales/en.json`)  
   - `feed.showArchived`, `feed.hideArchived`, `feed.adjustDate`, `feed.confirmArchiveBatch`, `feed.batchesEmptyWithArchived`.  
   - Reuse existing `action.archive` / `action.restore`.

## Acceptance criteria

- Adjustment sheet shows a date field defaulting to today; saved adjustment carries the chosen date.  
- Batches with remaining = 0 can be archived; they disappear from the active list and from feed selection.  
- Pill toggles visibility of archived batches; archived cards show Restore.  
- Past feed entries that reference an archived batch still resolve the batch name.  
- Migration 036 applied and verified in Supabase (`adjustment_date` column exists, `schema_version = 36`).  
- `npx vitest run` green. No `innerHTML`. All store calls have the correct param count.  
- Header build stamp named after the Pages workflow succeeds.

## Constraints and traps to avoid

- Schema first. Do not ship UI that writes `adjustmentDate` until the column exists.  
- Writes only through the store.  
- Do not invent extra fields or flows.  
- Do not change the existing `!archived && remaining > 0` filter in delivery/check.  
- Migration file is not applied until it is run and verified against Supabase.  
- Every new migration ends with the schema_version stamp and a `BACKUP_MIGRATIONS` entry.

## References

- `PROJECT_STATUS.md` (current stamp 35)  
- `AGENTS.md` (schema-first, migration execution, store pattern)  
- `src/entities/batch.js` (existing `archived`)  
- `src/entities/batch-adjustment.js`  
- `src/features/feed/index.js` (batches list + adjust sheet)  
- `src/features/feed/delivery.js` (selection filter)  
- `src/data/backup-migrations.js`  
- Existing branch `feature/batch-adjust-date-and-archive` (partial: entity + migration started)

## Open questions for the implementer

- None. Date is a date (not timestamptz). Archive is a simple boolean toggle with confirmation. Pill is a session-scoped toggle on the feed screen.
