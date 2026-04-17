# Session Brief: Locations Screen — V1 Parity Build

**Date:** 2026-04-17
**From:** Cowork (design session)
**To:** Claude Code (implementation)

---

## What to Build

Build the dedicated Locations screen (`/locations` route) with all connected dialogs to match v1's Fields screen. The full spec is in:

**`github/issues/locations-screen-ui-v1-parity.md`**

This is a large spec (9 parts, 22 acceptance criteria) covering:
1. Locations list screen with filter pills, sort, search, farm grouping
2. Location cards (land + confinement variants)
3. Add/Edit Location sheet
4. Survey sheet (bulk & single with draft support)
5. Harvest sheet (two-step: field picker → tile grid)
6. Feed Types sheet (CRUD with forage type auto-fill)
7. Apply Input/Amendment sheet (product/manure toggle, location multi-select)
8. Soil Test sheet

## Key Context

- **"Locations" replaces "Fields/Pastures"** — v2 moniker covers all location types including confinement
- **This is NOT the dashboard locations tab** — it's a separate `/locations` route in the nav. The dashboard has its own active-event cards (SP-3). This screen shows ALL locations regardless of event status.
- **Schema is already built** — no migrations needed. All entities (`locations`, `paddock_observations`, `soil_tests`, `feed_types`, etc.) exist.
- **CSS base classes exist** — the animals-screen-ui-v1-parity spec already landed shared CSS (tokens, `.btn`, `.badge`, `.card`, `.sheet-wrap`, etc.). Verify they're in `main.css`, don't duplicate.
- **HTML in spec = visual reference** — translate all HTML patterns into `el()` / `text()` / `clear()` DOM builder calls. No innerHTML.

## Suggested Build Order

Work screen-by-screen. Complete one before starting the next.

1. **Locations list screen** (Parts 1–2) — route, layout, cards, filter, sort
2. **Add/Edit Location sheet** (Part 3)
3. **Soil Test sheet** (Part 8) — simplest dialog, quick win
4. **Survey sheet** (Part 4) — most complex, has draft behavior
5. **Feed Types sheet** (Part 6)
6. **Harvest sheet** (Part 5)
7. **Apply Input/Amendment sheet** (Part 7) — depends on input products + manure batches existing

## OPEN_ITEMS Changes

None — no new open items from this session.

## Watch Out For

- **Confinement variant:** Location cards for confinement type should NOT show Survey or Soil buttons, and show capture % instead of forage info.
- **Unit conversions:** All stored values are metric. Display in user's unit via `src/utils/units.js`.
- **Calc dependencies:** Est. available DM uses FOR-1, recovery uses REC-1, rating color is a simple threshold function. If these calcs aren't wired yet, stub them with placeholder text.
- **Router registration:** `/locations` needs to be added as a top-level nav destination in `src/ui/router.js`.
