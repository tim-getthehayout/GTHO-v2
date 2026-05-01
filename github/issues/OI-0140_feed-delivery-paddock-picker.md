# OI-0140 — Feed delivery: paddock picker for multi-open-window events + location chip on every feed-related row

**Priority:** P0 (live field-data corruption — reproduced on Tim's G-event 2026-05-01)
**Origin:** Full diagnosis + decisions in `OPEN_ITEMS.md` → OI-0140. Live-data heal executed via Supabase MCP this session.
**Labels:** `bug`, `data-integrity`, `feed`, `ui`, `v2-build`
**Status:** DESIGN LOCKED, ready for Claude Code. Tim answered Q1 + Q2 on 2026-05-01: **Q1 = single picker** for the whole sheet (per-line picker deferred); **Q2 = no further filter** beyond the existing `activePWs` (open paddock windows of the current event). Pre-positioning at paddocks with no active event is filed as **OI-0143** (separate capability — different data model).

## Summary

`src/features/feed/delivery.js:41-49` auto-assigns a single `location_id` to every feed line saved in the delivery sheet by reading `activePWs[0].locationId`, where `activePWs` is the unsorted result of `getAll('eventPaddockWindows').filter(w => w.eventId === evt.id && !w.dateClosed)`. There is no UI to pick the paddock and no header label showing which paddock was selected. On single-window events the assignment is correct; on multi-window events (strip grazing, where multiple sub-paddock windows are open simultaneously within one event) the assignment is effectively arbitrary because localStorage insertion order isn't deterministic.

Fix: add a paddock picker (only when `activePWs.length > 1`), default to the most-recently-opened window, and surface the picked location prominently. Then add a `→ {locationName}` chip to every feed-related row in event detail and feed-check sheets so retrospectively the user can see which paddock each delivery and check is tied to.

## Reproducer (live, 2026-05-01)

Event `fb407a55-aa0e-4cbb-b906-af6964a0addc`, three open paddock windows:
- G-1 (`710ddb23-…`) opened 2026-04-30
- G-2 (`e758b25a-…`) opened 2026-04-29 14:00
- G-3 (`102cf6cd-…`) opened 2026-04-29 14:00

Two feed deliveries, same batch (`bef27752-…` Oak Field Barn):
- Apr 29 14:00, qty=0.68 — physically placed at **G-1**, silently recorded at **G-3** (entry `b9f9add7-…`)
- Apr 30 14:30, qty=1.0 — physically placed at **G-2**, correctly recorded at **G-2** by chance (entry `f6916c6a-…`)

Both used the same code path. The difference was localStorage insertion order at the moment each delivery was saved.

## Live-data heal (already executed this session via Supabase MCP)

```sql
-- Re-route the misrouted delivery to the paddock it was physically placed at:
UPDATE event_feed_entries
SET location_id = '710ddb23-4056-4a23-896d-6da270d5862a'  -- G-1
WHERE id = 'b9f9add7-c98e-490c-b2ad-6219295d77f0';

-- The matching feed check was measuring the same bale, so it follows:
UPDATE event_feed_check_items
SET location_id = '710ddb23-4056-4a23-896d-6da270d5862a'  -- G-1
WHERE id = '10ab2005-9d5f-44d4-bee3-f8a5a02154e6';
```

Verified post-state. **No further data heal required from Claude Code.** Implementation just needs to prevent recurrence.

## Decisions (Tim, 2026-05-01)

**Q1 → single picker.** One `<select>` at the top of the delivery sheet labeled "Delivering to" (or similar). Every line saved in this sheet uses the same `location_id`. If a farmer drops bales at multiple paddocks in one trip, they save the sheet twice — one paddock's bales per save. Per-line picker deferred to a separate Phase 2 OI if field testing surfaces it as friction.

**Q2 → no further filter.** Picker shows every paddock window where `event_id === evt.id && date_closed IS NULL` — i.e., the existing `activePWs` collection. No additional filter for "is anyone currently grazing here." Sort: most-recently-opened first by `(date_opened, time_opened)` descending; null `time_opened` sorts as `00:00`. Default selection: top option.

Pre-positioning feed at paddocks with **no active event** is filed as **OI-0143** — a separate capability requiring a new entity and a hand-off rule. Out of scope for this OI.

## Acceptance criteria — Phase 1

### Picker behavior

- [ ] On single-open-window events (`activePWs.length === 1`), no picker is rendered. The auto-selected location is displayed as a header chip below "Add Feeding" so the user can see where the delivery is going. Behavior matches today's UX otherwise.
- [ ] On multi-open-window events (`activePWs.length > 1`), a `<select>` (or pill row — designer's call, single-select) is rendered with a "Delivering to" label. One option per open paddock window. Sorted **most-recently-opened first** by `(date_opened, time_opened)` descending; null `time_opened` sorts as `00:00`.
- [ ] Default selection: the top option (most-recently-opened window).
- [ ] Changing the picker updates the header chip immediately.
- [ ] Save loop (`src/features/feed/delivery.js:248`) writes every feed line with the picker's selected `location_id`, not `activePWs[0].locationId`.

### Location chip on display surfaces

- [ ] Every §8 Feed Entries row in `src/features/events/detail.js` renders a `→ {locationName}` chip after the existing `{date} · {qty} {unit} {batchName}` label. Mobile + desktop. Existing rows must back-fill correctly using the row's `location_id` join — no migration needed.
- [ ] Every line header in `src/features/feed/check.js` renders a `→ {locationName}` chip after the existing `{feedTypeName} ({unit})` label. Per consolidated `(batch, location)` group.
- [ ] Feed Checks list rows in event detail already use the `→` arrow format (per Tim's screenshot showing `Apr 30, 26 · Oak Field Barn → G - 3 · 0.55 bale`); audit + confirm no regression after this change.

### Tests

- [ ] `tests/unit/features/feed/delivery-picker.test.js` (new): single-window (no picker rendered, save uses single window's id); multi-window (picker rendered with N options sorted recent-first, default = top, save uses selected id); picker change updates header chip; save loop writes selected id to every feed entry.
- [ ] `tests/unit/features/feed/feed-entries-row-display.test.js` (new): row label includes `→ {locationName}` chip; chip resolves via `getById('locations', row.locationId)` with graceful fallback if location is missing.
- [ ] `tests/unit/features/feed/feed-check-line-display.test.js` (new or extend): line header includes `→ {locationName}` chip per consolidated group.
- [ ] `tests/e2e/feed-delivery-multi-paddock.spec.js` (new, follows CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI"): scaffold an event with 3 open paddock windows; open delivery sheet; assert picker is rendered with 3 options; pick the second option; save; query Supabase for the new `event_feed_entries` row and assert `location_id` matches the picked option, not `activePWs[0]`.
- [ ] Full test suite passes: `npx vitest run`.

### Manual verification (Tim's case)

- [ ] After deploy, Tim opens his G-event delivery sheet → sees three options (G-1, G-2, G-3 sorted by recency); the default-selected option is the most-recently-opened.
- [ ] §8 Feed Entries renders `Apr 29, 26 · 0.68 bale Oak Field Barn → G-1` and `Apr 30, 26 · 1 bale Oak Field Barn → G-2`.
- [ ] Feed-check sheet renders one G-1 line (started 0.68, last check 0.55, prefill 0.55) and one G-2 line (started 1.0, no prior check, prefill 1.0).

## Files to edit

- `src/features/feed/delivery.js` — picker state + render; remove `activePWs[0]` shortcut; pass selected `locationId` into every `FeedEntryEntity.create`
- `src/features/events/detail.js` — append location chip to every Feed Entries row's label
- `src/features/feed/check.js` — append location chip to each line's header
- `src/i18n/locales/en.json` — `feed.deliverTo` (picker label); arrow glyph `→` is hardcoded (no string)
- 3 new unit test files + 1 new e2e test file (paths above)

## Not in scope

- **Phase 2 — per-line picker** (deferred pending Q1 answer; if Q1 lands "single picker," per-line is a separate later OI if field testing surfaces the need)
- **Filter open-but-inactive paddocks** (Q2 — Cowork's lean is "no filtering, show all"; if Q2 lands the other way, scope expands to a `(paddockWindow ↔ groupWindow)` co-location join)
- **Move existing feed delivery flow into a dedicated full-screen route** — out of scope; sheet pattern stays
- **Schema change, migration, CP-55/CP-56 impact** — none

## Checklist for Claude Code

- [ ] All picker behavior implemented + tested per the locked decisions above (single picker, no further filter)
- [ ] Location chip rendered everywhere specified
- [ ] Full test suite passes
- [ ] CLAUDE.md §"Architecture Audit" §6 extended with a grep contract: `grep -n "activePWs\[0\]" src/features/feed/` should return 0 matches (the fix shouldn't leave the old shortcut anywhere)
- [ ] OPEN_ITEMS.md OI-0140 flipped to closed in the same commit (orphan-flip rule per CLAUDE.md §"OPEN_ITEMS.md Closure Discipline")
- [ ] Piggyback sweep: grep OPEN_ITEMS.md for sibling OIs referencing `feed/delivery.js`, `event_feed_entries.location_id`, or `activePWs` — flip any now-moot entries
- [ ] PROJECT_CHANGELOG.md row added
- [ ] TASKS.md updated if this OI was tracked there
- [ ] GitHub issue closed with `gh issue close {N} --comment "Completed in commit {hash}. All acceptance criteria met, {N} tests passing. Multi-paddock delivery picker verified on G-event."`
