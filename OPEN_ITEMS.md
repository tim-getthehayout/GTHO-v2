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

---

---

### OI-0006 — CP-18: Advance Strip Button Not Rendered
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-18

Acceptance criteria says "Advance Strip button wired." The button is not rendered on event cards. The i18n key (`event.advanceStrip`) exists but no code references it in the event card render. No strip progress bar visualization (§3.15 of design system) is rendered either.

**What's needed:** On event cards with any `is_strip_graze=true` open paddock window: render "Advance Strip" button that opens a combined close-current-strip + open-next-strip sheet. Display strip progress bar showing completed/active/upcoming strips.

**Partially blocked by:** Observation fields (forage height in/out) are Phase 3.3, so the close/open forms would be date/time only for now. The button and basic mechanic can be wired.

---

### OI-0007 — CP-17/18/20: Paddock Observations Not Created
**Added:** 2026-04-12 | **Area:** v2-build | **Priority:** P2
**Checkpoints:** CP-17, CP-18, CP-20

Multiple acceptance criteria reference observation creation:
- CP-18: "Sub-move open/close **with observations**"
- CP-20: "**Observation created**" on event close

Currently no `paddock_observation` records are created anywhere — on window open, window close, or event close. TODOs exist in code (`events/index.js` lines 767, 1298, 1325, 1376, 1485) but no OPEN_ITEMS entry existed.

**What's needed:** Create `paddock_observation` records (type='open' on window open, type='close' on window close and event close). The observation entity (`src/entities/paddock-observation.js`) exists. Fields like forage height, cover, quality are Phase 3.3 — but the observation record itself (with source, source_id, observed_at, type) should be created now.

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

### OI-0005 — CP-23: E2E Test Has Wrong Selectors and Was Never Run
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Fixed 3 onboarding selector mismatches (`onboarding-op-name` → `onboarding-operation-name`, `onboarding-next` → step-specific `onboarding-next-1/2/3`, `.onboarding` → `[data-testid="onboarding-wizard"]`). Changed auth flow from signup to login (Supabase rejects fake email domains). Added `beforeAll` guard requiring E2E_EMAIL/E2E_PASSWORD env vars. All 35 selectors verified against source. Playwright browsers confirmed installed. Test requires pre-created Supabase auth account to run.

