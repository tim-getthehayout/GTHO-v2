# Move-wizard "Leave as residual" must force a remaining-quantity input, parity with OI-0119 sub-move close (OI-0136)

**Canonical spec:** `OPEN_ITEMS.md` → OI-0136.

**Priority:** P1 — second half of OI-0104's deferred "inline number input per line" follow-up. Pairs with OI-0135.

**One-line summary:** `src/features/events/move-wizard.js` Step 3 Feed Transfer section has no amount input — Residual choice silently auto-stamps. Sub-move close (`src/features/events/submove.js:178-223`, OI-0119) forces a required remaining-qty input and blocks Save; the move-wizard Residual branch should mirror that behavior.

**Fix shape:** under each Residual-selected line, render a required remaining-qty input prefilled with OI-0135's live-remaining value. Validate on Save; block with clear error when any input is blank / non-numeric / negative. Move lines do not get an input (100% of remaining travels forward). See OI-0136 for the full input wiring, validation rules, i18n keys, and test-id conventions.

**Depends on:** OI-0135 (`move-wizard-live-remaining.md`) for the default input value.

**CP-55/CP-56 impact:** none. Schema change: none.
