# Session Brief — 2026-04-12 (Session 8b)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing the architecture walkthrough of DRAFT docs. This session reviewed V2_UX_FLOWS.md — all 10 original flows audited against finalized v2 schema, v1 feature audit (GRZ-01–05, FED-01–10, PAS-03–04, NUT-03), and V2_APP_ARCHITECTURE.md. Also reconciled against the new V2_DESIGN_SYSTEM.md (§4 screen inventory).

---

## What Was Done This Session

1. **V2_UX_FLOWS.md — full review, 8 issues found and resolved:**

   **Confinement close handling (Issue 1):**
   - Added manure routing description to §1.4 (Move Wizard) and §9.1 (Event Close). When paddock windows point to confinement or partial-capture locations, captured NPK is routed to manure batch based on `location.capture_percent × excretion NPK × (window duration / event duration)`.
   - Dairy milking routine noted as post-launch enhancement — saved schedule templates that auto-generate paddock windows for twice-daily milking parlor visits.

   **Feed delivery flow expanded (Issue 2):**
   - §4 rewritten from 4 lines to full event-picker-first flow. Step 1: event picker with location, groups, day count. Step 2: batch picker grouped by type with stepper, live DM/cost preview. Field mode stay-open behavior documented.

   **Forage quality scale specified (Issue 3):**
   - §7.1 survey flow now specifies: forage_condition as 4-option picker (poor/fair/good/excellent), forage_quality as numeric input within farm-configurable range (A41).
   - Schema amended: `farm_settings` +`forage_quality_scale_min` (default 1), +`forage_quality_scale_max` (default 100).

   **Amendment save wording fixed (Issue 4):**
   - §8.1 corrected from "one amendment record per selected paddock" to "one amendment (parent) with one amendment_location child per selected paddock."

   **Harvest feed type filter added (Issue 5):**
   - §10.1 now specifies feed type picker filtered to `harvest_active = true`.

   **Event card flow added (Issue 6):**
   - New §11 (Event Card — Interaction Hub) describes the central daily interface: card display sections (header, paddocks, groups, feed summary, live metrics) and action button → flow mapping table.
   - "Sub-move" retained as user-facing term, bridged to `event_paddock_windows` backend (A42). Terminology note added at document top and in §2.

   **Batch adjustment flow added (Issue 7):**
   - New §12 covers edit batch, reconcile (physical count), and feed test recording paths.

   **Feed day goal added (Issue 8):**
   - New §13 documents the feed planning target setting. UI label: "Days of Stored Feed on Hand." Confirmed `feed_day_goal` already exists on `farm_settings` in schema.

   **Time fields added consistently:**
   - §1.4 (Move Wizard): +Time in on new event panel
   - §2.1/2.2 (Paddock Windows): +time_opened, +time_closed
   - §3.1/3.2 (Group Windows): +time_joined, +time_left
   - Time capture is critical for dairy sub-day NPK apportionment.

2. **Schema amendment — GTHO_V2_SCHEMA_DESIGN.md:**
   - D1 farm_settings: +forage_quality_scale_min (numeric, default 1), +forage_quality_scale_max (numeric, default 100). Added to table description, SQL, and design decisions (A41).
   - Appendix B and Change Log updated with Session 8 entry.

3. **V2_BUILD_INDEX.md updated:**
   - Current focus reflects UX flows APPROVED.
   - UX flows row updated: DRAFT → APPROVED, 13 flows listed.
   - Schema row updated with +forage_quality_scale_min/max.
   - Three new decisions added (A41–A43).
   - Change log entry for Session 8b.

---

## Decision Log

| # | Decision | Rationale |
|---|----------|-----------|
| A41 | Forage quality scale farm-configurable | forage_quality_scale_min/max on farm_settings (default 1–100). Operations using RFQ can set 0–200+. forage_condition (poor/fair/good/excellent) is a separate categorical assessment. |
| A42 | "Sub-move" retained as user-facing term | Backend is event_paddock_windows. Farmers know "sub-move" from v1. UX flows doc bridges both terms. |
| A43 | Feed day goal is farm-level | feed_day_goal on farm_settings (default 90, range 7–365). UI label: "Days of Stored Feed on Hand." Different farms may have different feed security targets. |

---

## What's Next

**V2_UX_FLOWS.md APPROVED.** 6 of 7 design docs now approved.

1. Review **V2_MIGRATION_PLAN.md** — ID remapping, transforms, validation, cutover
2. Review **V2_DESIGN_SYSTEM.md** — clean up stale v1 references (§4.8 "anchor/primary label" removed, sub-move terminology is correct as UI language per A42)
3. After both reviewed and approved, Phase 2 is complete

---

## Files Changed

| File | Action |
|------|--------|
| V2_UX_FLOWS.md | Status → APPROVED. §1.4 +confinement handling, +time in, +dairy milking note. §2 rewritten with terminology bridge (sub-move ↔ paddock window), +time fields. §3 +time fields. §4 expanded to full event-picker-first flow with field mode. §7.1 forage quality specified (condition + configurable scale). §8.1 save wording corrected. §9.1 +confinement handling. §10.1 +harvest_active filter. New §11 Event Card. New §12 Batch Adjustment. New §13 Feed Day Goal. |
| GTHO_V2_SCHEMA_DESIGN.md | D1 farm_settings: +forage_quality_scale_min, +forage_quality_scale_max. Design decision A41. Appendix B + Change Log updated. |
| V2_BUILD_INDEX.md | Current focus updated. UX flows DRAFT → APPROVED. Schema row +forage_quality_scale_min/max. A41–A43 added. Session 8b change log entry. |

---

## OPEN_ITEMS changes

None. No new open items from this session.

---

## Open Questions

- V2_DESIGN_SYSTEM.md §4.8 still references "anchor/primary label" (removed concept). Needs cleanup in design system review session.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status
2. Open `V2_MIGRATION_PLAN.md` — next doc for walkthrough
3. Same process: review against finalized schema, update stale references, flag decisions, approve
4. V2_DESIGN_SYSTEM.md can be reviewed in same session or separately — smaller scope (§4 terminology cleanup)
