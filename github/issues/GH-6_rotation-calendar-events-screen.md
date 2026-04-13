# Rotation calendar on the Events screen (CP-54)

## Summary

CP-54 builds the rotation calendar as the Events screen. Full design lives in the base docs — **this spec is a handoff wrapper**, not a duplicate of the design. Bundles GH-4 (strip grazing paddock windows) because the calendar is the first screen to render strip bands visually. Closes OI-0001.

## Design source of truth

Everything a builder needs to know about *what* to render is in the base docs:

- **V2_DESIGN_SYSTEM.md §4.3** — visual anatomy of the calendar: header strip, toolbar, legend, 3-column grid, paddock column, past/future blocks, active event ring, sidebar, list view, mobile fallback. Dimensions, colors, typography.
- **V2_UX_FLOWS.md §19** — user-facing behavior in 9 subsections:
  - §19.1 View Modes (Estimated Status vs DM Forecast)
  - §19.2 Past Event Blocks (multi-group rule, linked paddocks, strip bands, active NOW, sub-moves)
  - §19.3 Future Forecast Blocks (DM gradient, capacity split, surplus chip, never-grazed routing)
  - §19.4 Toolbar + Controls (lightboxes, confinement pill, first-load defaults)
  - §19.5 Sidebar (1:1 mirror of paddock column)
  - §19.6 Empty States
  - §19.7 Mobile Adaptation (no calendar below 900px — GRZ-11 banner + GRZ-10 list)
  - §19.8 List View (v1 GRZ-10 pattern)
  - §19.9 Interactions & Deep Linking (click targets, pan/zoom gestures, keyboard shortcuts, URL schema, first-load defaults, state persistence policy, paddock sort, accessibility)
- **V2_CALCULATION_SPEC.md** — formulas:
  - §4.3 Forage Domain → FOR-6 Forecast Standing DM at Date
  - §4.11 Capacity Forecast Domain → CAP-1 Period Capacity Coverage
- **GTHY_V1_FEATURE_AUDIT.md** — v1 patterns for the list view: GRZ-10 (events log), GRZ-11 (active rotation banner), GRZ-12 (v1 calendar — for context only; v2 is a ground-up rebuild).
- **Visual mockup:** `rotation-calendar-full-design-mockup.html` in the App Migration Project. Approved by Tim on 2026-04-13 after two rounds of revisions. Use as a visual sanity-check alongside §4.3. If the mockup and §4.3 disagree, §4.3 wins — flag the mismatch so the doc can be updated.

**Rule:** if a design question is not answered in the docs above, stop and flag it in OPEN_ITEMS.md. Do not invent.

## Acceptance Criteria (implementation, not design)

### Calc engine

- [ ] `src/features/forage/forecast-standing-dm.js` — implement FOR-6 per V2_CALCULATION_SPEC.md §4.3. Register via `registerCalc('FOR-6', ...)` with full metadata.
- [ ] `src/features/capacity/period-capacity-coverage.js` — implement CAP-1 per V2_CALCULATION_SPEC.md §4.11. Register via `registerCalc('CAP-1', ...)` with full metadata.
- [ ] Both formulas visible in the calc registry debug view (Settings → Calc registry) with the same metadata shape as existing formulas.

### State module

- [ ] `src/features/events/calendar-state.js` holds the calendar state slice: `zoom`, `jumpAnchor`, `forecasterGroups`, `forecasterPeriodDays`, `showConfinement`, `viewMode`. Shape and defaults match V2_UX_FLOWS.md §19.9.
- [ ] URL reader/writer serializes/deserializes state to the query string schema in §19.9. Uses `history.replaceState` so state changes don't pollute back/forward history.
- [ ] No writes to `user_preferences` for calendar state in this CP (deferred per §19.9).

### UI components

- [ ] `src/features/events/events-screen.js` is the top-level entry. At ≥900px mounts the calendar; below 900px mounts the list view directly (skipping the calendar toggle entirely).
- [ ] `src/features/events/rotation-calendar/` directory contains the calendar's components: `header-strip.js`, `toolbar.js`, `legend.js`, `calendar-grid.js`, `paddock-column.js`, `timeline.js`, `sidebar.js`, `past-block.js`, `future-block.js`, `today-line.js`. Each renders via the DOM builder (no innerHTML).
- [ ] `src/features/events/list-view/events-log.js` renders the GRZ-10 parent + sub-move pattern. Used both by desktop List toggle and mobile fallback.
- [ ] `src/features/events/mobile-events-screen.js` renders the GRZ-11 active-rotation banner on top + events-log below. Mounted at viewport <900px.

### Integration with GH-4 (strip grazing)

- [ ] `event_paddock_windows` entity updates from GH-4 (is_strip_graze, strip_group_id, area_pct) are live and migrated.
- [ ] Past-block render uses `area_pct` to compute proportional strip band widths per V2_UX_FLOWS §19.2 and §4.3.
- [ ] FOR-6 sums DM across strips in a strip-grazed paddock per V2_CALCULATION_SPEC §4.3 FOR-6 strip rule.

### Reports screen cleanup

- [ ] Remove the Rotation Calendar tab from Reports (§4.6 now lists 6 tabs). Tab order: Feed & DMI Trends (default), NPK Fertility, Animal Performance, Season Summary, Pasture Surveys, Weaning.
- [ ] Confirm no dead links to `#/reports/rotation-calendar` remain anywhere in the codebase (grep + delete).

### PROJECT_CHANGELOG.md

- [ ] One row per commit that lands CP-54 scope. Cover: FOR-6/CAP-1 calc engine, calendar state module, UI scaffold, past/future block rendering, sidebar, list view, mobile fallback, Reports tab removal, GH-4 integration.

## Test Plan

### Unit (Vitest)

- [ ] FOR-6 — confidence bands (past_max, min, mid, max)
- [ ] FOR-6 — strip-grazing: multi-strip paddock returns summed DM
- [ ] CAP-1 — full coverage, partial coverage, never-grazed, multi-group, strip-graze
- [ ] Calendar state reducer — each action (setZoom, setJump, addForecasterGroup, setPeriod, toggleConfinement, setView) produces the expected state + URL
- [ ] Multi-group label rule — N=1 returns group name; N>1 returns `Multiple Groups (N)` + tooltip data + aria-label
- [ ] Linked-paddock block positioning — primary row full block, linked rows reduced block
- [ ] Strip-graze band computation — N strips with given area_pct sum to 100% band widths

### E2E (Playwright)

- [ ] Default first-load: Zoom=Week, Jump=Today, Calendar view, Estimated Status mode
- [ ] Change Zoom and Jump presets update timeline correctly
- [ ] Adding groups + period flips to DM Forecast mode with capacity-split future blocks
- [ ] Multi-group selection collapses labels to `Multiple Groups (2)` with hover tooltip
- [ ] Confinement toggle expands/collapses paddock list + sidebar
- [ ] Click past block → event edit sheet; click never-grazed future block → survey flow
- [ ] Calendar/List toggle swaps views without losing state
- [ ] Resize to 800px wide: calendar disappears, GRZ-11 banner + GRZ-10 list render
- [ ] Deep-link: `#/events?zoom=month&anchor=2026-01-01&groups=<id1>,<id2>&period=3` renders that exact state

### Manual

- [ ] Visual parity check against `rotation-calendar-full-design-mockup.html` at 1440×900, 1280×800, 1024×768
- [ ] Mobile fallback check at 375×812 and 414×896
- [ ] Strip bands render proportionally with uneven strip sizes (e.g., 5% / 25% / 70%)
- [ ] Sub-move arrow connects the correct two rows at the right date
- [ ] Linked-paddock dashed outline wraps member rows without leaking

## Related OIs

- **OI-0001** (Strip grazing) — closed by this CP (bundles GH-4)

## Notes

- **Design is already locked.** If a question comes up during build that isn't answered by the base docs, add an OPEN_ITEMS.md entry `DESIGN REQUIRED, do not build` and continue on other checkpoints. No invention.
- **GH-4 bundling rationale:** The calendar is the first screen to render strip bands visually, so the entity fields and the render path need to ship together. Don't split them across checkpoints.
- **Defaults may change after user feedback.** Zoom=Week/Jump=Today is a reasonable starting bet. Keep the default in one place (`calendar-state.js`) so it's a one-line change later. See V2_UX_FLOWS §19.9 for the rationale.
- **State persistence deferred intentionally.** Don't persist to `user_preferences` in this CP. If feedback demands sticky state, it's a small follow-up (one column + one getter/setter) per §19.9.
- **Mobile rotation calendar = explicit non-goal.** See §19.7 rationale. Do not build one as a stretch.
- **Reports tab removal is a real change**, not just a doc edit. Ensure any code path that links to the removed tab is cleaned up.

## Spec source updates (already applied by Cowork — 2026-04-13)

- V2_DESIGN_SYSTEM.md §4.3 — Events screen rewritten
- V2_DESIGN_SYSTEM.md §4.6 — Rotation Calendar tab removed; tab strip trimmed to 6
- V2_UX_FLOWS.md §19 — new Rotation Calendar flow (9 subsections, Events-only)
- V2_CALCULATION_SPEC.md §4.3 FOR-6 + §4.11 CAP-1 (count 35 → 37 across 11 domains)
- V2_BUILD_INDEX.md — CP-54 row rewritten with full acceptance criteria
- OPEN_ITEMS.md — OI-0001 remains closed; change log row added

## Suggested labels

`spec`, `v2-design`, `P1 — high`
