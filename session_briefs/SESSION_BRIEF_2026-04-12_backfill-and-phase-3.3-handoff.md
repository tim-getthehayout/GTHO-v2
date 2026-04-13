## Session Handoff — 2026-04-12 (Session 11b)

**What was done:** Filled UX flow gaps — added §14 (7 reusable health recording components + group session mode + quick-action bar), §15 (4 entity CRUD forms), §16 (field mode complete UX) to V2_UX_FLOWS.md. Added §7 (6 component patterns) to V2_DESIGN_SYSTEM.md. Confirmed animal_notes table decision (OI-0003 closed). Updated V2_BUILD_INDEX.md health records note — UX flows now complete for CP-33–36.

**Docs updated:** V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md, V2_BUILD_INDEX.md, OPEN_ITEMS.md

---

## Work Items (ordered)

### 1. Backfill — Phase 3.2 Open Items (do first)

Complete in priority order. Each is a standalone commit.

| OI | Priority | Summary | What to do |
|----|----------|---------|------------|
| OI-0004 | P1 | Pull/merge from Supabase not implemented | Build `pullAndMerge()`: sync registry mapping entity → table + `fromSupabaseShape`, fetch remote, merge by ID (remote wins when `updated_at` newer). Wire into boot (after store init) and reconnect (after queue flush). |
| OI-0005 | P1 | E2E test has wrong selectors, never run | Fix all selectors in `tests/e2e/smoke.spec.js` to match actual DOM testids. `npx playwright install`. Run test against dev server. |
| OI-0007 | P2 | Paddock observations not created on window open/close/event close | Create `paddock_observation` records: type='open' on window open, type='close' on window close and event close. Entity exists. Fields like forage height are Phase 3.3 — create the record shell now (source, source_id, observed_at, type). |
| OI-0006 | P2 | Advance Strip button not rendered on event cards | Render "Advance Strip" button on event cards with any `is_strip_graze=true` open paddock window. Close-current + open-next sheet. Strip progress bar (§3.15). Date/time fields only for now — observation fields are Phase 3.3. |
| OI-0008 | P3 | Location picker recovery section always empty | Depends on OI-0007. Once observations have recovery_min/max_days, populate the Recovering section in location picker. Can defer to Phase 3.3 if recovery data doesn't exist yet. |

### 2. Schema Amendment — animal_notes

Before starting CP-32 (health reference tables):
- Add `animal_notes` table to D9: `id uuid PK, operation_id uuid FK NOT NULL, animal_id uuid FK NOT NULL, noted_at timestamptz NOT NULL, note text NOT NULL, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()`
- Create migration SQL in `supabase/migrations/`
- Create entity file `src/entities/animal-note.js` (FIELDS, create, validate, toSupabaseShape, fromSupabaseShape)
- Add to store, sync registry

### 3. Phase 3.3 — Assessment (CP-24 through CP-52)

Full spec is in V2_BUILD_INDEX.md. Key sequencing:

**Feed system (CP-24–30):** Feed types → batches → feed day goal → delivery → check → transfer → event close full version. Daily-use features, no complex dependencies.

**Surveys (CP-31):** Bulk and single-paddock. Draft auto-save. Commit writes to paddock_observations.

**Health records (CP-32–36):** Reference tables first, then weight/BCS, treatments, breeding/heat, calving. **NEW: V2_UX_FLOWS.md §14 now has full component-first specs for all health sheets.** Each form is a reusable component with entry points and context pre-fill mapped. Build each sheet once, invoke from multiple entry points. §14.9 = group session mode. §14.10 = per-animal quick-action bar.

**Amendments/manure/harvest (CP-37–43):** Reference tables → soil tests → amendments → manure → NPK prices → harvest → feed quality.

**Calc engine (CP-44–46):** Three tiers by data dependency. 9 core → 19 feed/forage → 7 remaining. Never register before data sources exist.

**Reports + dashboard (CP-47–51):** Four report tabs + dashboard real metrics. Consumes calc engine.

**Integration test (CP-52):** Full lifecycle e2e.

### 4. Field Mode Note

V2_UX_FLOWS.md §16 now fully specs field mode. Currently scheduled as CP-63 (Phase 3.5). Feed delivery (CP-27) has field mode behavior spec'd in §4.2 and §16.5 — implement the "return to event picker after save" loop behavior during CP-27, but don't build the full field mode home screen until CP-63.

## OPEN_ITEMS Changes

- **OI-0003:** CLOSED — animal_notes table confirmed (Option A)
- **No new items**
