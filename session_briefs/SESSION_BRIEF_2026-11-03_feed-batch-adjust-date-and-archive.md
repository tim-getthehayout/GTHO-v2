# SESSION_BRIEF — Feed batch adjustment date and archive

**Generated:** 2026-11-03  
**Source:** Grok design session  
**Status:** Ready for Grok Build

## What was decided

Manual quantity adjustments on a feed batch need a user-settable effective date (separate from the auto `created_at`). Empty batches need an archive action so they stay available for historical records and past feed entries but disappear from active selection lists. The feed batches list gets a show/hide archived pill.

On each batch card, show a small simple chronological list of activity for that batch: feed out (from event feed entries), feed in (from batch creation / purchase quantity if relevant), and any adjustments. Adjustments get an edit pill so the user can correct the date or other adjustment fields after the fact. Changes to amounts fed are not edited here — those stay on the grazing event card.

`batches.archived` already exists and is already filtered in the active list and in feed selection. This work adds the UI controls, the new date field, and the activity list with adjustment editing.

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
   - Reuse the same sheet (or a thin edit mode) when opening an existing adjustment from the history list so the user can correct the date, quantities, or reason. Save updates the existing record via the store.

3. **Batch card activity list** (`src/features/feed/index.js`)  
   - On each batch card, below the progress bar, a compact chronological list (most recent first or oldest first — pick one and stay consistent) of:  
     - Feed out: rows from `eventFeedEntries` for this `batchId` (date, quantity, optional event/location hint if cheap).  
     - Adjustments: rows from `batchAdjustments` for this `batchId` (date, delta or previous→new, reason).  
     - Optional feed-in line for the original batch quantity/purchase if it is useful and already available without extra joins.  
   - Only adjustment rows get an edit pill. Tapping it opens the adjustment sheet in edit mode.  
   - Feed-out rows are display-only. No edit of fed amounts here.  
   - Keep the list small and scannable (font size / spacing consistent with existing card detail text). Truncate or collapse if a batch has a very long history so the card does not become huge.

4. **Archive UI** (`src/features/feed/index.js`)  
   - Module-level `showArchived` flag.  
   - “Show archived / Hide archived” pill in the batches section header that toggles the list filter.  
   - Archive button on active batch cards (confirm dialog). Unarchive/Restore button when viewing archived.  
   - Empty state mentions hidden archived count when the pill is off.  
   - Delivery/check selection already filters `!archived && remaining > 0` — leave that alone.

5. **i18n** (`src/i18n/locales/en.json`)  
   - `feed.showArchived`, `feed.hideArchived`, `feed.adjustDate`, `feed.confirmArchiveBatch`, `feed.batchesEmptyWithArchived`.  
   - Keys for the activity list labels (e.g. feed out, adjustment, edit) as needed.  
   - Reuse existing `action.archive` / `action.restore` / `action.edit`.

## Acceptance criteria

- Adjustment sheet shows a date field defaulting to today; saved adjustment carries the chosen date.  
- Each batch card shows a small list of feed out and adjustments for that batch.  
- Adjustment rows have an edit pill; opening it lets the user correct the date (and other adjustment fields) and save.  
- Feed-out amounts cannot be edited from the batch card.  
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
- Do not allow editing of feed-out quantities from the batch card.  
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
- Branch `feature/batch-adjust-date-v2`

## Open questions for the implementer

- None. Date is a date (not timestamptz). Archive is a simple boolean toggle with confirmation. Pill is a session-scoped toggle on the feed screen. History list is display-only except for the adjustment edit pill.
