# SP-3: Dashboard Location Card — V1 Parity

**Labels:** spec, task, P1 — high, v2-design
**Sprint:** UI Improvements (2026-04-15)
**Source:** `UI_SPRINT_SPEC.md` § SP-3
**Mockup:** `App Migration Project/SP-3_location-card_mockup.html` (v3, approved 2026-04-15)
**Base doc impact:** V2_UX_FLOWS.md §17.7 (will be replaced during end-of-sprint reconciliation — do not edit during implementation)

## Read First

1. `UI_SPRINT_SPEC.md` § SP-3 — canonical sprint entry
2. `CLAUDE.md` → "Active Sprint: UI Improvements" — sprint workflow rules
3. `App Migration Project/SP-3_location-card_mockup.html` — approved visual reference (two cards: single paddock + sub-move)
4. **V1 live site** (`getthehayout.com`) — authoritative visual reference for every element not explicitly changed by this spec. When in doubt, match v1.

## Goal

Rebuild the v2 dashboard location card to match the v1 card **exactly**, with only the two deliberate changes listed below. V1 users (every user during migration) must not experience the v2 dashboard as a regression.

## The two changes from v1

1. **Remove** the two small "Feed check" and "Feed" buttons that sit at the very bottom of the v1 card (below the NPK line).
2. **Add** a second large "Feed" button (green, full-width, matching the Feed-check button's size and style) directly below the existing large amber "Feed check" button.

That is the entire delta. Every other element below must render exactly as v1 does.

## File

`src/features/dashboard/index.js` — `renderLocationsView()` function. The card loop around lines 793–871 is the build site; helpers to add new sections go alongside existing ones.

## Card anatomy (v1 parity — from top to bottom)

### 1. Left accent bar

Thin vertical green bar (`var(--green)`) running the height of the card, left-inset from the border. Matches v1.

### 2. Header row

- Leaf icon (green, ~22px) — `var(--green)`
- Location name — 18px, 700 weight
- Acreage — 14px, 400 weight, `var(--text2)`, formatted via `src/utils/units.js` based on operation's `unit_system`
  - Format: `{value} ac` (imperial) or `{value} ha` (metric), 2 decimals
- For sub-move events, the name renders the comma-joined list of paddocks (e.g., `"B - 3, B - 1"`) and the acreage is the summed acreage. Matches v1's behavior.

### 3. Top-right action buttons (floating, absolute-positioned)

- **Edit** button — navigates to the SP-2 event detail view: `navigate('#/events?detail=' + event.id)`. This replaces the SP-1 interim behavior that opened the close-event sheet. By the time SP-3 ships, SP-2 has shipped, so there is no interim — Edit goes straight to the detail view.
- **Move all** button — teal solid, opens the move-wizard for the whole event

These float top-right, overlapping the stats area vertically. Matches v1.

**Implementation note:** Remove the `openCloseEventSheet` import + call from the Edit button handler in `renderLocationsView()` that SP-1 added. Replace with the navigate call. The close-event sheet is still reachable from inside the detail view via the Close & move footer action (per SP-2), so no functionality is lost.

### 4. Event type badge

Inline badge rendered on the summary line, left of the day/date text.

- `grazing` · `stored feed` · `stored feed & grazing` · any other v1 event types
- Style: green-xl background (`#F4F8EC`), green-d text (`#3B6D11`), 13px, 4px radius, 4px padding

### 5. Summary line

`{Badge} Day {N} · In {dateIn} · ${cost}`

- Day count: `daysBetweenInclusive(event.dateIn, todayStr)`
- Date in: formatted `"Mar 24, 26"` (short month + day + 2-digit year)
- Cost: total from eventFeedEntries (CST-1)

### 6. Weight line

`Weight: {totalWeight} {unit} · {AU} AU`

- Total weight = sum of `(gw.headCount × gw.avgWeightKg)` across active group windows, converted to display units
- AU = total weight in lbs ÷ 1000

### 7. Capacity line (green text)

`Est. capacity: {N} AUDs · ~{M} days remaining {(incl. stored feed)} · {H}" · ADA est: {X}/ac`

- Green color (`var(--green-d)`), 500 weight
- `(incl. stored feed)` parenthetical appears only when stored feed is present in the event
- Forage height `{H}"` displayed in display units (inches imperial, cm metric)
- Uses capacity calc (CAP-*) and ADA calc from `V2_CALCULATION_SPEC.md`

### 8. Breakdown line (gray)

`Pasture: {X} lbs DM · Stored feed: {Y} lbs DM · DMI demand: {Z} lbs/day`

- 12px, `var(--text3)`
- `Stored feed: ...` segment only appears when stored feed present (matches v1 — see mockup card 2 which has no stored feed)

### 9. + Add sub-move link

- Teal text, underlined on hover
- Opens sub-move sheet for this event
- Appears **above** the sub-paddocks section for single-paddock events; appears **inside** the sub-paddocks section for events that already have sub-moves (matches v1 — see mockup card 2)

### 10. Sub-paddocks section (conditional — only when sub-moves exist)

Section header: `SUB-PADDOCKS` (`.sec` style)

One row per sub-paddock:
- Status dot (green if active, gray if closed)
- Paddock name (bold)
- ` · {acreage} ac · since {dateIn}`
- Status label: `active` (green, 500) or `closed` (gray)
- **Close** button (right-aligned) — only shown for active sub-paddocks. Opens close-event flow for that sub-move.

Followed by `+ Add sub-move` teal link.

### 11. Groups section

Section header: `GROUPS` (`.sec` style)

One row per active group window:
- Status dot (colored per group if group color exists; else default green)
- Group name (bold, 14px)
- Sub-line: `{headCount} head · avg {avgWeight} {unit}` (12px, `var(--text2)`)
- Right side: **Move** button only (teal, `btn-xs`). Per-group reweigh is intentionally not on this card — see "Out of scope" below.

Followed by `+ Add group` teal link.

### 12. DMI — Last 3 Days chart

Section header: `DMI — LAST 3 DAYS`

Bar chart with 3 columns (Mon/Tue/Wed or rolling 3-day window):
- Today's bar: solid green (`#A5C56B`)
- Future-day bars: striped/hatched in a lighter green to indicate estimate
- Day labels: `Mon ✓` for today (checkmark), `Tue (est.)` and `Wed (est.)` for future days
- Value label above each bar
- Stored-feed segment: amber-colored segment at the base of any bar that has stored feed (v1 behavior)

Right column:
- Today's DMI number (26px, 700) + `lbs DMI today`
- Legend below: `■ grazing` (green) · `■ stored` (amber)

### 13. Large Feed check button (existing, unchanged)

- Full-width, amber-xl background (`#FDF6EA`), amber border, amber-d text
- 12px padding, 14px, 600 weight
- 8px border radius
- Opens Feed Check sheet for this event

### 14. Large Feed button — **NEW**

- Full-width, green background (`var(--green)`), green border, white text
- 12px padding, 14px, 600 weight
- 8px border radius
- 8px top margin (sits directly below Feed check button)
- Opens Feed sheet for this event (the same sheet as the small "Feed" button used to open in v1)

### 15. DMI/NPK summary

- `DMI {N} lbs/day · {X}% stored · {Y}% est. pasture` — "DMI {N}" is bold
- `NPK: N{a} / P{b} / K{c} lbs · ${value} value` — purple/blue color, `$value` bold
- Top border divider above this summary

### 16. Bottom small buttons — **REMOVED**

The two small "Feed check" and "Feed" buttons that sat below the NPK line in v1 are removed. The card ends at the NPK line.

## Calc references

All calcs referenced here are expected to exist per `V2_CALCULATION_SPEC.md`. If any referenced calc is not yet registered when this card is implemented, flag it in OPEN_ITEMS.md rather than silently showing empty values — the card must match v1 fidelity.

Calcs used: CST-1 (cost), DMI-1 (daily demand + pasture/stored split), NPK-* (N/P/K and dollar value), capacity + AUD + days-remaining calcs, ADA calc.

## Schema impact

None. This spec is visual/rendering only — no new columns, no schema changes.

**CP-55/CP-56 impact:** None (no state-shape change).

## Tests

Update `tests/unit/features/dashboard.test.js`:

- [ ] Header renders leaf icon + name + acreage + Edit + Move-all buttons
- [ ] Edit button navigates to `#/events?detail={eventId}` (SP-2 detail view), not the close-event sheet
- [ ] Event type badge renders with correct text and style
- [ ] Summary line renders Day/In-date/cost in the correct format
- [ ] Weight and capacity lines render with correct units and values
- [ ] Breakdown line omits `Stored feed` segment when not present
- [ ] `+ Add sub-move` link appears in the right position for single-paddock vs. multi-paddock events
- [ ] Sub-paddocks section renders one row per sub-move, with Close button on active rows only
- [ ] Groups section renders one row per active group window with Move button (no reweigh icon)
- [ ] DMI chart renders 3 columns with today solid, future striped, and correct labels
- [ ] Stored feed segment appears in DMI bars when stored feed is present
- [ ] Large Feed check button renders with amber style
- [ ] Large Feed button renders with green style directly below Feed check
- [ ] Bottom small Feed check / Feed buttons are NOT rendered
- [ ] DMI/NPK summary line renders with correct formatting
- [ ] Existing `dashboard-loc-card-{event.id}` testid still present

## Acceptance Criteria

- [ ] Card visually matches v1 card exactly, with the two deliberate deltas applied
- [ ] No per-group reweigh icon anywhere on the card
- [ ] Large green Feed button sits directly below the large amber Feed check button
- [ ] Two small bottom buttons are gone
- [ ] Edit button (top-right of home page location card) opens the SP-2 event detail view for that event
- [ ] Sub-move pattern works (SUB-PADDOCKS section appears with Close buttons on active sub-paddocks)
- [ ] Card renders correctly on mobile (single column) and desktop (2-column grid)
- [ ] `npx vitest run` clean
- [ ] No `innerHTML` assignments with dynamic content (per CLAUDE.md rule)

## Out of Scope (explicitly deferred)

- **Per-group reweigh icon/button.** Reweigh moves to the Animals area of the app. Not on the dashboard card. Tracked in OPEN_ITEMS as a follow-up (see OPEN_ITEMS changes below).
- **Tap-card-to-open-detail.** Wait until SP-2 detail view is built, then wire up in a follow-up.
- **Per-group Move targeting individual group.** Card-level and per-group Move both open the event-scoped move wizard for now; per-group-scoped move is a separate follow-up.

## Linked OPEN_ITEMS

Both added 2026-04-15 during SP-3 scope correction:

- **OI-0065** — Per-group reweigh moves from dashboard card to Animals area (P3, DESIGN REQUIRED, not blocking)
- **OI-0066** — Per-group Move on dashboard card is event-scoped, not group-scoped (P3, follow-up)

## Reconciliation Note

This spec will replace the current `V2_UX_FLOWS.md §17.7` card body paragraph during the end-of-sprint reconciliation session. Do not edit `V2_UX_FLOWS.md` during implementation.
