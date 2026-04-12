# Session Brief — 2026-04-11

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

This is a ground-up rebuild of Get The Hay Out (GTHO), a ~14,500-line single-file pasture tracking PWA. Tim is the sole user and developer. The approach: exhaustive v1 audit → interactive schema design → complete spec library → Claude Code build.

Phase 1 (audit) is APPROVED. Phase 2 (design) is in progress. We've completed 12 event-system tables through interactive narrative design sessions where Tim and I walked through each table together, making design decisions in real time. Those decisions are captured in V2_BUILD_INDEX.md's Architecture Decisions Log (A1–A17).

We also created 7 design docs from concepts in the prior GTHO-v2/ARCHITECTURE.md and CALCULATION_REGISTRY.md. The concepts were organized into 6 groups for review — Groups 1 and 2 (Core Data Patterns + Calculation Engine) were walked through and approved. Groups 3–6 (UI & UX, AI & Voice, Infrastructure, Migration) are deferred until after schema completion.

---

## What Was Done This Session

1. **V1 Feature Audit** (GTHO_V1_FEATURE_AUDIT.md) — completed and APPROVED. 58 catalog entries across 8 domains, 40 rebuild capabilities, 12 anti-patterns identified.

2. **Schema Design** (GTHO_V2_SCHEMA_DESIGN.md) — 12 tables designed and APPROVED across 4 domains:
   - D2: Locations (1 table)
   - D5: Event System (6 tables — events, paddock windows, group windows, feed entries, feed checks, feed check items)
   - D6: Surveys (3 tables — surveys, draft entries, paddock observations)
   - D7: Harvest (2 tables — harvest events, harvest event fields)

3. **Design Doc Library** — 7 docs created (V2_BUILD_INDEX, V2_SCHEMA_DESIGN, V2_APP_ARCHITECTURE, V2_CALCULATION_SPEC, V2_UX_FLOWS, V2_INFRASTRUCTURE, V2_MIGRATION_PLAN)

4. **Architecture Decisions** — 17 decisions logged (A1–A17) covering window model, compute-on-read, locations, feed, transfers, store pattern, sync adapter, DOM builder, sheets, registerCalc, per-class rates, NPK stamping, 3-tier config

5. **Dashboard** — TASKS.md + dashboard.html created for visual project tracking

6. **Concept Review** — Groups 1–2 from prior ARCHITECTURE.md reviewed and integrated into design docs

---

## Decision Log (Key Decisions for New Session)

All 17 decisions are in V2_BUILD_INDEX.md § Architecture Decisions Log. The most important for schema work:

- **A1:** Window model, not anchor paddock — events don't have a pastureId
- **A2:** Compute on read — derived values never stored (exception: group window snapshots)
- **A3:** Locations replace pastures — type='confinement'|'land', land_use field for land types
- **A4:** Feed always to paddock — event_feed_entries.location_id NOT NULL
- **A5:** Transfers via source_event_id — positive-only quantities
- **A8:** Harvest creates batch — auto-links via batch_id
- **A14:** Per-class animal rates — dmi_pct, excretion on animal_classes, not global
- **A15:** Per-forage-type utilization — on forage_types, not global
- **A17:** 3-tier config fallback — field → type → global

---

## What's Next

**Continue schema design for remaining 8 domains.** Tim agreed to prioritize schema completion before returning to architecture walkthrough Groups 3–6.

### Recommended order (Tier 1 first — simpler reference tables):

1. **D1: Operations & Farm Setup** — operations, farms, operation_members. Root entity (operation_id FK everywhere). Start here.
2. **D2 remainder: Forage Types** — forage_types table. Carries per-type utilization (A15).
3. **D4: Feed Inventory** — feed_types, batches. Batch links to harvest (A8).
4. **D11: App Infrastructure** — app_logs, submissions, todos, release_notes.

### Then Tier 2 (more complex, more design decisions):

5. **D3: Animals & Groups** — animals, groups, animal_group_memberships, animal_classes. Per-class rates (A14).
6. **D8: Nutrients & Amendments** — amendments, amendment_locations, input_products, soil_tests, manure batches/transactions.
7. **D9: Livestock Health** — BCS scores, treatments, breeding, calving, treatment types, AI bulls.
8. **D10: Feed Quality** — batch_nutritional_profiles.

### Design approach (same as this session):
- **Interactive narrative** — walk through each table with Tim, discussing purpose, columns, relationships, and edge cases
- **One domain at a time** — don't jump between domains
- **Decisions logged** — each design choice gets an A# entry in V2_BUILD_INDEX.md
- **SQL included** — each table gets a CREATE TABLE statement in the schema doc

### After schema is complete:
- Return to architecture walkthrough Groups 3–6
- Review all 5 DRAFT docs with Tim
- Move everything to APPROVED status
- Phase 3 (build) can begin

---

## Files Changed

| File | Action |
|------|--------|
| GTHO_V1_FEATURE_AUDIT.md | Created, APPROVED |
| GTHO_V2_SCHEMA_DESIGN.md | Created, 12 tables APPROVED, 8 domains pending |
| V2_BUILD_INDEX.md | Created, updated with current focus |
| V2_APP_ARCHITECTURE.md | Created, DRAFT |
| V2_CALCULATION_SPEC.md | Created, DRAFT |
| V2_UX_FLOWS.md | Created, DRAFT |
| V2_INFRASTRUCTURE.md | Created, DRAFT |
| V2_MIGRATION_PLAN.md | Created, DRAFT |
| TASKS.md | Created for dashboard |
| dashboard.html | Created for ATC view |

---

## Open Questions

None blocking. All design decisions to date are documented and approved.

---

## Git Status

- **5 commits on main**, 1 unpushed (dashboard commit)
- Tim needs to push from terminal — sandbox doesn't have GitHub auth
- Command: `cd App-Migration-Project && git push`

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — it has the current focus and full status table
2. Read `GTHO_V2_SCHEMA_DESIGN.md` — for the approved tables and design principles (especially the 10 design principles at top)
3. Start D1 (Operations & Farm Setup) with Tim using the interactive narrative approach
4. After designing each domain: update the schema doc, log any decisions in V2_BUILD_INDEX.md, mark status in the progress table
