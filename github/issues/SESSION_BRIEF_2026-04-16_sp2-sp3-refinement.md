# SESSION_BRIEF_2026-04-16 — SP-2 / SP-3 Refinement

## Context

SP-2 (event detail view) and SP-3 (dashboard location card) have been implemented but have bugs and one design change from Tim's review on 2026-04-16. This brief covers all fixes.

## Priority order

Fix in this order — each subsequent fix builds on the previous one.

1. i18n resolution bug (unblocks everything else)
2. Dashboard card button wiring (SP-3)
3. Event detail → sheet overlay conversion (SP-2 design change)
4. Pre-graze inline fields (SP-2 design change)
5. Post-graze empty-state improvement (SP-2 minor)

---

## Fix 1: i18n Key Resolution Bug

**Problem:** Button labels on the dashboard card render as raw key paths (`event.feedCheck`, `event.deliverFeed`) instead of resolved text ("Feed check", "Deliver feed"). The same issue affects the move wizard internal buttons. The keys exist in `src/i18n/locales/en.json` — the `t()` function is not resolving them.

**Diagnosis steps:**
1. Check `src/i18n/index.js` — does `t('event.feedCheck')` do a nested key lookup (split on `.` and walk the JSON tree) or a flat key lookup? The en.json file likely nests `event: { feedCheck: "Feed check" }` but `t()` might be looking for a flat key `"event.feedCheck"`.
2. If `t()` returns the key itself on miss (common pattern), that explains the raw text.
3. Grep for how `t()` is called in `src/features/dashboard/index.js` — confirm it uses dot notation.

**Fix:** Either fix `t()` to support nested key lookup (walk the object tree on `.` separator) or flatten the en.json keys. Nested lookup is the better fix — other parts of the codebase likely depend on the nested structure already.

**Acceptance criteria:**
- [ ] `t('event.feedCheck')` returns "Feed check"
- [ ] `t('event.deliverFeed')` returns "Deliver feed"
- [ ] All buttons on the dashboard card show resolved labels
- [ ] Move wizard internal buttons show resolved labels
- [ ] Run `npx vitest run` — no regressions in i18n tests

---

## Fix 2: Dashboard Card Button Wiring (SP-3)

**Problem:** Feed check and Feed buttons on the dashboard card don't respond to taps/clicks. Move wizard opens but internal buttons don't advance to the next step.

**Diagnosis steps:**
1. Check if `openFeedCheckSheet` and `openDeliverFeedSheet` are properly imported in `src/features/dashboard/index.js`. The functions are called in click handlers — verify the imports exist and the functions are exported from their source modules.
2. For the move wizard: check which functions render the step buttons inside the wizard, and whether those buttons have click handlers attached. The wizard opens (so `openMoveWizard` works), but internal navigation is broken.
3. Use the `ensureSheetDOM()` pattern check — per OI-0062, sheets called cross-route need the ensure-on-first-use guard. Feed check and feed delivery sheets may need this if they haven't been given it yet.

**Fix:** Wire the click handlers. If the sheet DOM wrappers don't exist when called from the dashboard, add `ensureSheetDOM()` guards following the pattern established for move-wizard, close-event, and create-survey (see OI-0062).

**Acceptance criteria:**
- [ ] Feed check button on dashboard card opens the feed check sheet
- [ ] Feed (deliver) button on dashboard card opens the feed delivery sheet
- [ ] Move wizard advances through all steps when buttons are tapped
- [ ] All three work on every active event card, not just the first

---

## Fix 3: Event Detail → Sheet Overlay (SP-2 Design Change)

**Problem:** The event detail view is currently a full-screen routed view (`#/events?detail={eventId}`). Tim wants it as a **sheet overlay** that opens on top of the dashboard, matching the pattern used by the move wizard.

**What to change:**
1. Convert `src/features/events/detail.js` from a routed full-screen view to a sheet.
2. Use the existing sheet pattern: `.sheet-wrap` div always in DOM (or `ensureSheetDOM()` if called cross-route), show/hide via `.open` class, backdrop click closes.
3. The sheet should be full-height (scrollable inside), max-width 720px, centered on desktop.
4. Open function: `openEventDetailSheet(event, operationId, farmId)` — called from the dashboard Edit button.
5. Close function: `closeEventDetailSheet()` — called from the back arrow and backdrop.
6. **Remove the route:** `#/events?detail={eventId}` is no longer needed. The events screen always renders calendar/list. The detail sheet opens on top of whatever screen the user is on.
7. **Update the dashboard Edit button:** Replace `navigate('#/events?detail=' + event.id)` with `openEventDetailSheet(event, operationId, farmId)`.

**Sheet scroll behavior:** The sheet body scrolls independently from the page behind it (standard sheet pattern — `overflow-y: auto` on the sheet body, `overflow: hidden` on `body` while open).

**All 13 sections stay the same.** This is a container change, not a content change. The sections render identically inside the sheet.

**Acceptance criteria:**
- [ ] Edit button on dashboard card opens event detail as a sheet overlay
- [ ] Sheet is scrollable, max-width 720px, centered on desktop, full-width on mobile
- [ ] Backdrop click or back arrow closes the sheet
- [ ] Sheet uses `ensureSheetDOM()` pattern since it's called from dashboard
- [ ] No `#/events?detail=` route remains
- [ ] All 13 sections render correctly inside the sheet

---

## Fix 4: Pre-graze Observations — Inline Fields (SP-2 Design Change)

**Problem:** Pre-graze observations are currently rendered as read-only labels with an "Edit" button that opens a modal. The approved mockup (SP-2_event-detail_mockup.html, v4) shows the fields inline and editable directly in the sheet.

**What to change:**

Replace the current pre-graze card implementation with inline editable fields matching the mockup exactly:

**Row 1 (flex, wrap on narrow):**
- Avg. Forage Height: `<input type="number">` (narrow, ~52px), step 0.5, max 999, unit label `(in.)` or `(cm)` per unit system
- Forage Cover: `<input type="number">` (60px), 0–100, step 1, unit `(%)` + narrow slider (`<input type="range">`, ~140px) directly below the input

**Row 2 (flex, wrap on narrow):**
- Forage Quality: `<input type="number">` (60px), 1–100, step 1, unit `(1–100)`
- Condition: chip picker with 4 options — `Poor` / `Fair` / `Good` / `Excellent` (`.qual-chip` buttons, active state gets green background). Match the v4 mockup chip style.

**Behavior:**
- Fields are editable when event is active, read-only (disabled) when event is closed.
- Changes auto-save on blur (same pattern as Notes). Write to the event's pre-graze observation record via store. Show `Saved` flash for 2s.
- If no pre-graze observation exists yet, show the same fields but empty/placeholder. First blur on any field creates the observation record.
- The `100% stored feed` checkbox is per-paddock (shown on each paddock card per the mockup), NOT in the pre-graze card. Verify it's in the right place.
- **Remove** the "Add pre-graze observation" button and the `openPreGrazeModal` pattern entirely. No modal needed — fields are always visible.

**CSS:** Use the `.obs-line`, `.obs-field`, `.obs-field-row`, `.cover-slider`, `.qual-picker`, `.qual-chip` styles from the mockup HTML. They're production-ready.

**Acceptance criteria:**
- [ ] Pre-graze card shows inline editable fields (not a button or modal)
- [ ] Forage height is a numeric input with unit label
- [ ] Forage cover has both a numeric input and a slider that stay in sync
- [ ] Quality is a numeric input 1–100
- [ ] Condition is a chip picker (Poor/Fair/Good/Excellent)
- [ ] Changes auto-save on blur
- [ ] Fields are disabled when event is closed
- [ ] Empty state shows empty fields, not a button

---

## Fix 5: Post-graze Empty State

**Problem:** Post-graze observations only render when the event is closed or a sub-paddock is closed. For an active event with no closed sub-paddocks, the section is invisible — Tim expected to see it.

**What to change:**
- Always render the post-graze card, but with a clear empty state when no observations exist.
- Empty state message: "Captured when a paddock is closed. No post-graze observations yet."
- When the event is active with no closed sub-paddocks, show the card with that message (no add button — observations are created during the close flow).
- When observations exist, show them as currently implemented.

**Acceptance criteria:**
- [ ] Post-graze card always visible on the event detail sheet
- [ ] Empty state shows hint text explaining when observations are captured
- [ ] Populated state shows observation data as currently implemented

---

## Deferred (NOT in this session)

**DMI 3-day chart** — Both dashboard card and event detail defer this. DMI-1 doesn't produce a per-day breakdown with source split (pasture vs stored). The calc needs to be extended first. Tracked as a known gap — the placeholder comment in the code is correct. Do not attempt to implement the chart until the calc exists.

---

## OPEN_ITEMS changes

**Add OI-0067:**
```
### OI-0067 — SP-2 Event Detail: Convert from Full-Screen Route to Sheet Overlay
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** open — spec'd, handed off to Claude Code

**Problem:** SP-2 event detail was implemented as a full-screen routed view (`#/events?detail={eventId}`). Tim's review (2026-04-16) determined it should be a sheet overlay matching the move wizard pattern. The route-based approach forces a full page navigation away from the dashboard, losing context.

**Fix:** Convert `src/features/events/detail.js` from routed view to sheet. Remove the `#/events?detail=` route. Dashboard Edit button calls `openEventDetailSheet()` instead of `navigate()`. Sheet uses `ensureSheetDOM()` pattern. All 13 content sections unchanged.

**Doc impact:** GH-10 spec file updated. UI_SPRINT_SPEC.md § SP-2 updated.
```

**Add OI-0068:**
```
### OI-0068 — SP-2 Pre-graze Observations: Inline Fields, Not Modal
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** open — spec'd, handed off to Claude Code

**Problem:** Pre-graze observations were implemented as read-only labels with an "Edit" button that opens a modal. The approved mockup (v4) shows inline editable fields: height input, cover slider, quality input, condition chip picker. Tim confirmed inline is correct — fields should be embedded directly in the detail sheet, not behind a modal.

**Fix:** Replace the read-only + modal pattern with inline editable fields per the v4 mockup. Auto-save on blur. Remove `openPreGrazeModal`.

**Doc impact:** GH-10 spec file § Pre-graze Observations updated.
```

---

## Spec file changes

Update `github/issues/GH-10_event-detail-view.md`:
1. § "Navigation and Layout" — change "Route: `#/events?detail={eventId}`" to "Sheet overlay opened via `openEventDetailSheet()`. No route — the sheet opens on top of the current screen."
2. § "5. Pre-graze Observations" — replace "edit opens the pre-graze observation modal" with "fields are inline and editable directly in the sheet. Auto-save on blur."
3. § "6. Post-graze Observations" — add "Card always renders. Empty state: hint text explaining observations are captured during paddock close."
4. § "Router Integration" — remove the `detail=` query param parsing. Events screen always renders calendar/list.
