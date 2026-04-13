# Open Items

## Open

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Area:** v2-design | **Priority:** P2
**Spec:** `github/issues/strip-grazing-paddock-windows.md`

Allow a single paddock to be grazed in stages (strips) within one event. User selects "Strip graze" in the move wizard for the destination paddock. Three new columns on `event_paddock_windows`: `is_strip_graze` (boolean flag for UI), `strip_group_id` (UUID linking strips in a sequence), `area_pct` (percentage of paddock per strip). Reuses existing observation, feed, and group window models with no new tables. Calculation layer needs updates for effective area in stocking density, rotation calendar per-strip recovery, and NPK distribution.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P2

CP-13 spec says "unit system toggle (metric/imperial)" on Farm Settings. V2_SCHEMA_DESIGN.md has no `unit_system` column on `farm_settings` or `user_preferences`. **Workaround for now:** Store as a localStorage-only preference (`gtho_v2_unit_system`, default `'imperial'`). This works offline and doesn't require a schema change. When Tim decides the correct column/table, migrate from localStorage to Supabase.

---

### OI-0009 — Desktop Layout: Nav Sidebar Overlaps Main Content
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2

At desktop breakpoints (≥900px), the sidebar nav overlaps the main content area. **Root cause:** `src/styles/main.css` line ~202 — `.header-nav` uses `position: fixed` at the `min-width: 900px` media query, which removes it from document flow. The grid layout on `#app` reserves a 220px left column, but the fixed-positioned nav doesn't occupy it, so `.app-content` renders underneath the nav.

**Fix options (pick one):**
1. **Remove `position: fixed`** from `.header-nav` in the desktop media query and let the CSS Grid handle sidebar placement naturally. Cleanest approach.
2. **Add `margin-left: 220px`** to `.app-content` in the desktop media query to offset for the fixed nav.

**Spec:** `github/issues/fix-desktop-layout-overlap.md`
**Fix:** Add `grid-column: 2` to `.app-content` in the desktop media query. One-line CSS change.

---

### OI-0010 — Dashboard Home Screen Not Rendering Per v1 / Missing §17 Implementation
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P1

The dashboard home screen was built without an assembly spec — V2_UX_FLOWS.md had no dedicated section for the home screen. As a result, the dashboard is missing: farm overview stats row (5 metrics desktop / 3 mobile), group card body content (composition, location bar, DMI, NPK, actions), view toggle (groups/locations), mobile bottom nav, period selector pills, open tasks section, survey draft card, weaning nudge, and proper header (farm name instead of "GTHO v2").

**Resolution:** §17 added to V2_UX_FLOWS.md (14 subsections, §17.1–§17.14) covering complete home screen assembly. Claude Code should rebuild the dashboard feature from this spec.

**Dependencies:**
- OI-0009 must be fixed first (layout overlap blocks visual verification)
- Todos feature UI (`src/features/todos/`) needs to be created — entities exist (`todo.js`, `todo-assignment.js`), store/sync registered, but no screen/sheet/route. §17.9–§17.11 spec the UI.
- `#/todos` route needs to be added to router and nav (both mobile bottom nav and desktop sidebar), with badge showing open count.
- `user_preferences.home_view_mode` default should be `'locations'` for new users (schema currently defaults to `'groups'`).

---

### OI-0008 — CP-17: Location Picker Recovery Section Always Empty
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** CP-17

Acceptance criteria says "Location picker with Ready/**Recovering**/In Use/Confinement sections." The Recovering section is never shown because recovery status requires `paddock_observations` with recovery_min_days/recovery_max_days data, which doesn't exist yet. All non-in-use land locations appear as "Ready."

**Blocked by:** Paddock observations (OI-0007) and Phase 3.3 observation fields. Once observations are created with recovery data, this section can be populated. Code comment exists at `events/index.js` line 385.

---

## Closed

### OI-0003 — Animal Notes: No Schema Table
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-design
**Resolution:** Option A — add `animal_notes` table (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Tim confirmed animals need notes. Schema amendment needed in V2_SCHEMA_DESIGN.md D9. V2_UX_FLOWS.md §14.8 updated to remove pending-decision language.

---

### OI-0004 — CP-22: Pull/Merge from Supabase Not Implemented
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Built sync registry (`src/data/sync-registry.js`) mapping all 50 entity types to table names + `fromSupabaseShape`. Added `mergeRemote()` to store (remote wins when `updated_at` newer, 5 unit tests). Added `pullAllRemote()` orchestrator (`src/data/pull-remote.js`). Wired into boot (flush queue then pull) and reconnect (window 'online' → flush then pull).

---

### OI-0006 — CP-18: Advance Strip Button Not Rendered
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Advance Strip button now renders on event cards when any paddock window has `isStripGraze=true` and is open. Sheet has two phases: close current strip (date/time) + open next strip (date/time). "End strip early" closes without opening next. Strip progress label shows "Strip N of M — Location". Creates close + open observations. Forage fields deferred to Phase 3.3. Strip progress bar visualization (§3.15) deferred — label only for now.

---

### OI-0007 — CP-17/18/20: Paddock Observations Not Created
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Added `createObservation()` helper. Observations now created at all 5 locations: event creation (open), sub-move open (open), sub-move close (close), move wizard (close per source window + open for destination), event close (close per window). Forage height/cover/quality fields remain null until Phase 3.3 populates them.

---

### OI-0005 — CP-23: E2E Test Has Wrong Selectors and Was Never Run
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Fixed 3 onboarding selector mismatches (`onboarding-op-name` → `onboarding-operation-name`, `onboarding-next` → step-specific `onboarding-next-1/2/3`, `.onboarding` → `[data-testid="onboarding-wizard"]`). Changed auth flow from signup to login (Supabase rejects fake email domains). Added `beforeAll` guard requiring E2E_EMAIL/E2E_PASSWORD env vars. All 35 selectors verified against source. Playwright browsers confirmed installed. Test requires pre-created Supabase auth account to run.

