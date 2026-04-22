# Move-wizard transfer/residual quantity must use live-remaining, not original delivery total (OI-0135)

**Canonical spec:** `OPEN_ITEMS.md` → OI-0135.

**Priority:** P0 — live field data corruption. Every rotation move carrying stored feed is affected. DMI-8 cascade reads the wrong feed state downstream.

**One-line summary:** `src/features/events/move-wizard.js` builds `feedGroups[key].total` by summing `event_feed_entries.quantity` (original delivery), not the live-remaining after prior feed checks. Both the residual close-reading stamp (line 588) and the destination delivery row (line 744) inherit the wrong value.

**Fix shape:** add `getLiveRemainingForMove(eventId)` helper (resolves most-recent `event_feed_check_items.remaining_quantity` per batch × location, falling back to delivery-sum when no check exists). Wire into Step 3 render label + Step 1/Step 8 writes. See OI-0135 for the full helper implementation, acceptance criteria, edge cases, and live-data repair SQL.

**Pairs with:** OI-0136 (`move-wizard-residual-input.md`) — ship together or OI-0135 first.

**CP-55/CP-56 impact:** none. Schema change: none.

**Live data repair:** OI-0135 body contains the three-statement repair SQL for Tim's E-3 event (`fa16a58d`) and its inherited delivery row. Execute in the same commit as the code fix. Open question on F-1 manual delivery (`bd5204a0`) covered in the session brief.
