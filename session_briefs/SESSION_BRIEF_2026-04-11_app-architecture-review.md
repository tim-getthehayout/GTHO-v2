# Session Brief — 2026-04-11 (Session 5)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Phase 2 schema design is complete (all 11 domains, 50 tables, 36 architecture decisions). This session began the architecture walkthrough of DRAFT docs, starting with V2_APP_ARCHITECTURE.md — the code patterns doc that defines how Claude Code implements everything.

---

## What Was Done This Session

1. **Reviewed and applied SESSION_BRIEF_2026-04-11_d9-livestock-health:**
   - No OPEN_ITEMS changes needed
   - Fixed two stale items in V2_BUILD_INDEX.md: removed contradictory "Deferred" paragraph from Current Focus, updated V2_SCHEMA_DESIGN.md status from DRAFTING → APPROVED

2. **V2_APP_ARCHITECTURE.md — full review and update:**

   **§3 File Structure:**
   - Expanded entity list from 12 example files to complete 50-file list covering all 11 schema domains
   - Added header comment explaining what each entity file exports (FIELDS, create, validate, shape functions)
   - Noted `forage-type.js` as cross-cutting (referenced by both locations and batches)
   - Added two new feature directories: `health/` (treatments, breeding, calving, heats, BCS, weights) and `amendments/` (soil tests, amendments, manure batches, spreaders)
   - Added `auth/` (login, signup, session management) and `onboarding/` (setup wizard, species selection, reference table seeding) after Audit 2 revealed gaps

   **§6.3 Router:**
   - Added note clarifying health and amendments are sub-screens, not top-level routes
   - Health accessed from animal edit dialog / animal screen within `#/animals`
   - Amendments accessed from location detail within `#/locations`

   **§8 Naming Glossary:**
   - Added "treatment" as canonical name for livestock health interventions
   - Narrowed "amendment" NOT-list to soil context only (removed "treatment" from NOT column)

3. **Three-audit cross-reference check:**

   **Audit 1: Entity ↔ Schema tables — PASS.** All 50 tables have matching entity files. No orphans.

   **Audit 2: Feature coverage ↔ V1 capabilities — PASS after fixes.** All 43 domain capabilities and 9 cross-cutting capabilities mapped to feature directories. Two gaps found and fixed: `auth/` and `onboarding/`.

   **Audit 3: Architecture decisions ↔ doc — PASS.** All architecture-relevant A-decisions reflected in correct sections. Schema-level and UX-level decisions correctly deferred to other docs.

4. **V2_APP_ARCHITECTURE.md marked APPROVED.**

5. **V2_BUILD_INDEX.md updated:**
   - Schema design status: DRAFTING → APPROVED with correct table count (50)
   - App architecture status: DRAFT → APPROVED with audit note
   - Stale "Deferred" paragraph removed from Current Focus

---

## Decision Log

No new A-numbered decisions this session. Key design calls:

- **Health and amendments are sub-screens, not top-level routes.** Health accessed from `#/animals`, amendments from `#/locations`. Router stays at 7 top-level routes.
- **Dashboard widgets: ship the current 6, iterate from field testing.** No new widgets added for D8/D9 — real usage will reveal what's needed.
- **`forage-type.js` is cross-cutting** — referenced by both locations (what grows) and batches (what was harvested). Not owned by one domain.
- **"treatment" is now a canonical name** for livestock health (alongside "amendment" for soil). Glossary updated to prevent confusion.

---

## What's Next

**Continue architecture walkthrough.** 4 DRAFT docs remaining, in recommended order:

1. **V2_INFRASTRUCTURE.md** — Units, i18n, logging, feedback, RLS, testing, CI, PWA. Foundational plumbing.
2. **V2_CALCULATION_SPEC.md** — 42 formulas, registerCalc() pattern, 3-tier config. Depends on infrastructure (units).
3. **V2_UX_FLOWS.md** — Move wizard, feed check, survey, amendment, close sequence. Depends on architecture + infrastructure patterns.
4. **V2_MIGRATION_PLAN.md** — v1 → v2 data migration. Last because it needs to know the final shape of everything.

After all 4 are reviewed and approved, Phase 2 is complete and Phase 3 (Build) can begin.

---

## Files Changed

| File | Action |
|------|--------|
| V2_APP_ARCHITECTURE.md | §3 expanded (50 entities, 13 feature dirs), §6.3 router note added, §8 glossary updated. Status → APPROVED. |
| V2_BUILD_INDEX.md | Schema status → APPROVED (50 tables), App Architecture status → APPROVED, stale Deferred paragraph removed. |

---

## Open Questions

- None outstanding.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status
2. Open `V2_INFRASTRUCTURE.md` — next doc for walkthrough
3. Same process: review against finalized schema, update stale references, flag decisions, approve
4. Run cross-reference audit after each doc approval (entity/feature/decision consistency)
