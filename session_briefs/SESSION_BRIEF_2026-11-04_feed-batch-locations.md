# SESSION_BRIEF — Feed batch locations with multi-location balances and details dialog

**Generated:** 2026-11-04  
**Source:** Grok design session  
**Status:** Ready for implementation

## What was decided

Feed batches need storage locations. On first entry the user selects an existing location or creates a new one. Feed can be moved (whole or partial). Moves must be tracked for organic records.

Because partial moves are possible, a single batch can hold inventory in more than one location at the same time. Every feed-out must know which location it left from.

**Model chosen:** one batch identity, multi-location balances.

- New table `batch_location_balances` (batch_id, location_id, quantity).
- `batches.remaining` is the sum of its balances (computed on read or kept in sync).
- Moves table records transfers of quantity between locations (date is sufficient).
- Deliveries gain an optional source_location_id that is deducted from the chosen balance.
- Whole-batch move is simply “move all remaining from the only location.”

The paper trail that currently lives on each batch card on the feed screen moves into a details dialog/sheet that also shows all fields, current balances, and location history.

## What to build / change

### Schema (next migration, e.g. 037)

1. `batch_location_balances`
   - id uuid PK
   - operation_id uuid NOT NULL
   - batch_id uuid NOT NULL REFERENCES batches
   - location_id uuid NOT NULL REFERENCES locations
   - quantity numeric NOT NULL DEFAULT 0
   - created_at, updated_at
   - UNIQUE (batch_id, location_id)

2. `batch_moves`
   - id uuid PK
   - operation_id uuid NOT NULL
   - batch_id uuid NOT NULL REFERENCES batches
   - from_location_id uuid REFERENCES locations (nullable on first placement)
   - to_location_id uuid NOT NULL REFERENCES locations
   - quantity numeric NOT NULL
   - moved_at date NOT NULL DEFAULT CURRENT_DATE
   - notes text
   - created_at timestamptz

3. Add `source_location_id uuid REFERENCES locations` (nullable) to `event_feed_entries`.

No `location_id` column on `batches` itself. Remaining stays on the batch but is derived from / kept consistent with balances.

### Entities and store

- New entity files for balances and moves (create/validate/toSupabaseShape/fromSupabaseShape).
- Update `event-feed-entry` entity for `sourceLocationId`.
- Store + sync registry entries.
- Helper: remaining for a batch = sum of its balance quantities. Keep `batches.remaining` in sync on every balance change so existing day-goal and card math continues to work.

### UI — Batch create / edit

- Location required on create (dropdown of non-archived locations + “Add new location…”).
- “Add new location” reuses the existing shared location create flow / map picker.
- On save of a new batch: create the first balance row and the first move record (from null).

### UI — Move

- Move action (from details dialog or card) opens a small sheet:
  - From location (list of locations that currently hold quantity; auto-select if only one)
  - Quantity (max = balance at from-location)
  - To location (existing or new)
  - Date (default today)
  - Notes
- On save: decrease from-balance, increase (or create) to-balance, insert batch_moves row, update batch.remaining.

### UI — Batch cards (feed screen)

- Remove the inline activity list from cards.
- Show: name, feed type, remaining/quantity unit, location summary, progress bar, actions (Details, Edit, Adjust, Archive…).
- Location summary:
  - One location: location name
  - Multiple: “Hay Barn (42) · Field Pad (15)” or “2 locations”

### UI — Batch details dialog/sheet

Opened by Details button or card click. Contains:

- All batch fields (read-only presentation)
- Current balances with quantities
- Move button
- Location history (list of batch_moves, most recent first)
- Full paper trail / activity (existing in/out/adjustment rows, plus source location on outs)
- Actions: Edit, Adjust, Archive, Delete

### UI — Delivery (existing feed-out)

- When a batch is selected, show “From location” dropdown of its current positive balances.
- Hidden or auto-selected when only one balance.
- On save, set source_location_id and deduct from that balance.

### Other

- Archive/delete of a batch removes or soft-deletes its balances and moves with it (follow existing cascade / store patterns).
- Backfill: existing batches have no balances until the user opens and sets a location (or a one-time migration can leave them without). Do not invent locations.
- Reuse shared map-aware location picker wherever a location is chosen.

## Acceptance criteria

- New batch requires a location; creates balance + first move.
- User can move all or part of a batch to another (or new) location; balances and remaining update correctly; move is recorded with date.
- Batch card shows location summary and no longer embeds the activity list.
- Details dialog shows fields, current balances, move history, and full activity paper trail.
- Delivery deducts from the chosen source location; source_location_id is stored.
- Days-on-hand and other remaining-based math continue to work (batch.remaining stays accurate).
- `npx vitest run` green. No innerHTML. Store call shapes followed.
- Header stamp named after the Pages workflow succeeds.

## Constraints and traps to avoid

- Schema first. Migration must be applied and verified before relying on columns.
- Do not put a single location_id on batches.
- Do not invent design decisions beyond this brief.
- Keep whole-batch moves as the simple path of the same move action.
- Delivery location (paddock) remains the delivery site; source_location_id is the storage location the feed left from.
- Shared map UX for location choice.
- Organic trail must be append-only (moves are not edited or deleted by normal UI).

## References

- PROJECT_STATUS.md
- AGENTS.md
- src/features/feed/index.js (cards, activity, sheets)
- src/entities/batch.js
- src/entities/event-feed-entry.js
- src/entities/location.js
- src/features/locations/index.js
- session_briefs/SESSION_BRIEF_2026-11-03_feed-batch-adjust-date-and-archive.md
- Visual mockups from design session (cards compact; details dialog with balances, history, activity)

## Open questions for the implementer

- None. Date-only moves and multi-location balances are decided.
