# Open Items

## Open

---

### OI-0012 — Calc Test Coverage Gap
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47

All 35 formulas are registered correctly, but `tests/unit/calcs.test.js` contains only 13 test cases — thin coverage for a module the dashboard and reports now depend on. Critical gaps: DMI-1 contains a specific v1 bug fix (residual lookup by date, not array index — V2_CALCULATION_SPEC.md §4) with no regression test; DMI-2 lactation logic (A38, beef vs dairy branching) untested; FED family residual interpolation untested; CST-1/2/3 cost math untested.

**Fix:** Add ~10 targeted tests. Priority: DMI-1 residual-by-date regression, DMI-2 lactation branching (beef calf-in-class vs dairy dried_off_date), FED-1 residual interpolation, CST-1 feed cost per group, REC-1 recovery window with strip graze area_pct. Files: `tests/unit/calcs.test.js`.

---

### OI-0013 — Reference Console Description Spot-Check
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47

The admin reference console (reports screen) renders all 35 formulas grouped by domain. Nobody has verified the displayed descriptions match V2_CALCULATION_SPEC.md verbatim. Tim uses this console to audit what the app is doing — mismatched descriptions undermine trust.

**Fix:** Read each `registerCalc()` call in `src/calcs/core.js`, `feed-forage.js`, `advanced.js`. Compare the `description` and `formula` fields against V2_CALCULATION_SPEC.md §4. Correct any drift. No behavior change — metadata only.

---

---

### OI-0015 — Header Shows Farm Name, Needs Operation Name + Farm Picker
**Added:** 2026-04-13 | **Area:** v2-design | **Priority:** P2 | **Status:** open — DESIGN REQUIRED, do not build

The header currently shows the farm name as the primary identifier. It should show the **operation name** (the top-level identity). Users with multiple farms also have no way to switch which farm they're currently working in — all farm-scoped data (locations, groups, events) needs to be filtered by an active farm, but there's no UI for choosing.

**Impact:** Single-farm operations see a cosmetic wording issue (farm name and operation name are often the same). Multi-farm operations literally can't navigate between farms — a blocker for the core multi-farm use case.

**Proposed approach (pending Tim's approval):**

1. **Header displays both:** Operation Name (primary, bold) and Farm Name (secondary, below). On mobile where space is tight, stack or truncate.
2. **Active farm concept:** Add `active_farm_id` to `user_preferences` (not `operations` — farm context is per-user, a phone user and a tablet user might be working different farms simultaneously). Default to the first farm if unset.
3. **Farm picker placement:**
   - Desktop: dropdown next to the farm name in the header, or in the sidebar under the logo strip
   - Mobile: tap the farm name to open a farm picker sheet
4. **App-wide filtering:** Every farm-scoped query (locations, groups, events) filters by `store.getActiveFarmId()`. Store exposes `setActiveFarm(farmId)` action. All relevant feature screens subscribe to active farm changes and re-render.
5. **Onboarding:** First farm is created during onboarding; becomes the default active farm for that user.
6. **Single-farm UX:** If operation has only one farm, picker is hidden (just displays operation + farm names). As soon as a second farm exists, picker appears.

**Design questions for Tim before build:**
- Is active farm per-user (my proposal) or per-device/session?
- Are there any features that should span all farms (e.g., operation-wide reports), and if so, do they need an "All farms" option in the picker?
- Should switching farms require confirmation if there's unsaved work (e.g., survey drafts)?

**Spec sources that need updates once approved:** V2_UX_FLOWS.md (new section for farm switching), V2_DESIGN_SYSTEM.md §3.6 (header/sidebar), V2_SCHEMA_DESIGN.md §1.5 (user_preferences +active_farm_id).

---

---

---

### OI-0019 — No Logout Affordance in Header (v1 Parity)
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-03 (header) / auth UX

In v1, tapping the user icon in the top-right of the header opened a menu that included Log Out. v2 has no logout affordance in the header — users must dig through Settings (or can't find it at all). This is a v1 parity regression.

**Fix:** Add a user/account icon to the top-right of the app header. Tap opens a small popover/menu with at minimum: user email/name (read-only), Log Out action. Confirm logout if there are unsynced writes. Once farm picker (OI-0015) lands, that popover can host both controls, or they can be separate icons — design decision to bundle with OI-0015 resolution.

**Depends on / coordinates with:** OI-0015 (farm picker — same header real estate, same "who am I working as" concern). Consider designing these together.

**Spec sources that need updates:** V2_DESIGN_SYSTEM.md §3.6 (header), V2_UX_FLOWS.md (auth/logout flow).

---

### OI-0008 — CP-17: Location Picker Recovery Section Always Empty
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** CP-17

Acceptance criteria says "Location picker with Ready/**Recovering**/In Use/Confinement sections." The Recovering section is never shown because recovery status requires `paddock_observations` with recovery_min_days/recovery_max_days data, which doesn't exist yet. All non-in-use land locations appear as "Ready."

**Blocked by:** Paddock observations (OI-0007) and Phase 3.3 observation fields. Once observations are created with recovery data, this section can be populated. Code comment exists at `events/index.js` line 385.

---

## Closed

### OI-0017 — Product Add Dialog Missing Unit Selection
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added unit selection (from `inputProductUnits`) to the input product create/edit sheet in `src/features/amendments/reference-tables.js`. Saves `unitId` on the product. Unit name shown in product list. Feed type sheet already had a unit selector (bale/ton/kg/lb). Treatment recording sheet already had dose unit selector. The gap was only on amendment input products.

---

### OI-0018 — Sync Status Not Shown in App Header
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added compact sync indicator to `src/ui/header.js` — dot-based (sync-ok/sync-pending/sync-err/sync-off classes from existing §3.14 design tokens). Reads from `getSyncAdapter().getStatus()`. Tap navigates to `#/settings`. CSS button in `.header-sync-btn`. No duplicate logic — reuses existing store sync state.

---

### OI-0016 — Dose Units: No Add/Edit UI
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added dose unit CRUD to `src/features/health/reference-tables.js` — add/edit sheet, archive action, list with testids. Follows existing category/type pattern. No schema change needed (table exists). Seed data preserved; users can now extend.

---

### OI-0014 — Event Close Manure Transaction volumeKg Placeholder
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Verified architecturally sound. `volumeKg=0` is a deliberate placeholder — the stored record links the event to the manure batch for tracing. Real volume requires NPK-1 calc inputs (excretion_rate × avg_weight × head_count × duration × capture_pct). Reports will compute at display time via NPK-1, not from the stored column. Code comment updated in `close.js` to document this decision. No functional change needed until Phase 3.4 amendments reports are built — re-verify when writing that display path.

---

### OI-0011 — Feed Screen Metrics Still Show Placeholders
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Wired DM on hand (sum batch.remaining × dm_pct for non-archived batches), daily run rate (average daily DM delivered over 30 days from event_feed_entries), and days on hand (DM on hand ÷ run rate) into feed day goal banner. Progress bar threshold coloring now works. Three stat cells added below the heading. Unit-aware via display().

---

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Design integrated into main docs. Schema (V2_SCHEMA_DESIGN.md §5.2 event_paddock_windows) has `is_strip_graze`, `strip_group_id`, `area_pct`. Calc spec (V2_CALCULATION_SPEC.md) NPK-3, FOR-1, REC-1 updated for effective strip area. UX flows (V2_UX_FLOWS.md) §1.4 (move wizard strip graze option), §2.4 (advance strip action), §11 (event card strip progress) all documented. Design system §3.15 covers strip grazing progress component. Decision logged as A45 in V2_BUILD_INDEX.md. Spec remains at `github/issues/strip-grazing-paddock-windows.md` for Claude Code when this work is picked up during the rotation calendar (CP-54) or a dedicated checkpoint.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Design decision made: unit system lives on `operations` (operation-wide, same rationale as currency). Schema amended — `operations.unit_system text NOT NULL DEFAULT 'imperial' CHECK IN ('metric','imperial')`. Decision logged as A44 in V2_BUILD_INDEX.md. V2_INFRASTRUCTURE.md §1.3 added. V2_MIGRATION_PLAN.md §2.8 updated. Implementation spec written: `github/issues/unit-system-operations-migration.md` — includes localStorage → operation migration path, full list of unit-sensitive settings that must re-render on toggle, and input field conversion behavior.

---

### OI-0009 — Desktop Layout: Nav Sidebar Overlaps Main Content
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added `grid-column: 2` to `.app-content` in the `@media (min-width: 900px)` block of `src/styles/main.css`. This places the main content in the `1fr` column (right side), while the fixed nav covers the 220px left column. GH issue #1.

---

### OI-0010 — Dashboard Home Screen Not Rendering Per v1 / Missing §17 Implementation
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Complete rebuild of dashboard per V2_UX_FLOWS.md §17. Header bar updated to show farm name. Farm overview stats row (5-metric desktop, 3-metric mobile with threshold colors). Period selector pills (24h/3d/7d/30d/All). View toggle (Groups/Locations, default locations for new users). Group cards with composition line, location status bar, DMI progress, NPK deposited, action buttons (Move/Place/Weights/Edit), and collapse/expand on mobile. Location cards with active events by location, group lists, feed status, strip graze info, and unplaced groups section. Open tasks section (4 compact todo cards + Add task + All tasks link). Survey draft card (conditional). Weaning nudge (conditional). Mobile bottom nav (7 items, fixed bottom). Todos feature UI created: `src/features/todos/` with todo list screen (`#/todos` route), 3-axis filter bar (status/user/location), todo create/edit sheet, todo card component (compact + full modes). Todos nav entry with red badge (open count) on both desktop sidebar and mobile bottom nav. GH issue #2.

---

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

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-13 | Strip grazing + unit system integration | OI-0001 closed — strip grazing design integrated into V2_SCHEMA_DESIGN.md, V2_CALCULATION_SPEC.md, V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md; A45 logged. OI-0002 closed — `operations.unit_system` column added to schema; A44 logged; V2_INFRASTRUCTURE.md §1.3 added; V2_MIGRATION_PLAN.md §2.8 updated; implementation spec written to `github/issues/unit-system-operations-migration.md` covering entity update, store action, settings re-render on toggle, onboarding selector, and localStorage → operation migration. |
| 2026-04-13 | Pre-CP-54 audit + nits | Added OI-0011 (feed metrics placeholders, P2), OI-0012 (calc test gap, P2), OI-0013 (calc reference descriptions spot-check, P2), OI-0014 (event close manure volumeKg placeholder, P3) from audit. Added Tim nits: OI-0015 (header: operation name + farm picker, P2, DESIGN REQUIRED), OI-0016 (dose units CRUD, P3), OI-0017 (product add dialog missing unit selection, P2), OI-0018 (sync status not in app header, P2), OI-0019 (no logout affordance in header — v1 parity regression, P2). |

