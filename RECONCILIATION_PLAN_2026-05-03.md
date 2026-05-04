# Base Doc Reconciliation Plan — 2026-05-03

**Purpose:** Identify and reconcile all material design/build changes since 2026-04-13 that haven't been folded back into the base design docs.

**Status:** AUDIT COMPLETE — execution pending across 3–4 Cowork sessions.

**Owner:** Cowork (per `CLAUDE.md` Doc Ownership rules — base docs are Cowork's to edit).

**Retire when:** All items below flipped to ✅ and `UI_SPRINT_SPEC.md` deleted per its own retirement rule.

---

## Executive summary

Six of the seven approved base docs are out of sync with code that has shipped, schema that has migrated, or specs that have been finalized. The drift falls into three buckets:

1. **UI sprint specs (SP-3 → SP-14)** — accumulated in `UI_SPRINT_SPEC.md` since 2026-04-15. Implementation has shipped or is ready, but reconciliation into base docs is the explicit blocker (see SP-N Status table in that file). This is the largest bucket.
2. **Schema-drop drift** — migrations 028 (drop `events.date_in/time_in`), 029 (drop `event_observations`), 032 (drop `groups.farm_id`) all shipped, but the column listings in `V2_SCHEMA_DESIGN.md` narrative tables still show the dropped columns. CREATE TABLE blocks are correct; narrative tables contradict them.
3. **Patterns established post-design-phase** — the OI-0117/OI-0133 "derive on read, don't store" doctrine, OI-0139 `getLiveRemainingForMove` helper, OI-0141 honest sync indicator, OI-0050/OI-0115 sync invariants, and the SP-10 snapshot/rollback pattern are all enforced in `CLAUDE.md` grep contracts and lived experience, but never made it into the architecture / infrastructure base docs.

There is no missing-from-spec implementation work — code is ahead of docs, not the other way around. Every drift is a doc-side catch-up. Reconciliation is therefore safe to do without a code freeze.

**Recommended sequence:** three focused sessions of 60–90 min each, by base doc cluster (see "Session sequence" below). Schema doc first (lowest risk, highest precision), UX flows second (largest, most prose), architecture/infrastructure third (cross-cutting patterns).

---

## Reconciliation backlog by base doc

Format: ID | What needs updating | Source of truth | Priority | Est effort

### V2_UX_FLOWS.md — 8 items, ~4 hrs total

The biggest reconciliation surface. SP-3 through SP-11 all target this file.

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| UX-1 | §17.7 Dashboard location card | Replace stub card body with full v1-parity spec — Feed check % display, large green Feed button, removed small bottom buttons | UI_SPRINT_SPEC SP-3 | P1 | 30m |
| UX-2 | §16 Field Mode | Replace pre-sprint prose with v1-parity rewrite — expanded field-mode event card, exit-returns-to-previous, 2-step animal picker for record heat | UI_SPRINT_SPEC SP-8 | P1 | 30m |
| UX-3 | §17.15 DMI chart | Add the 5-state status model (`actual` / `estimated` / `needs_check` / `no_animals` / `no_pasture_data`) and "Feed check needed" hint render | UI_SPRINT_SPEC SP-12, OI-0119 | P1 | 20m |
| UX-4 | §17.15.1 Event Data Editing (NEW) | Create section — 7 edit-behavior subsections, gap/overlap resolver, retro-place flow, per-section edit validations | UI_SPRINT_SPEC SP-10 | P1 | 60m |
| UX-5 | §3.4 Empty group archive cascade (NEW) | Create section — archive prompt, management UI, soft-delete handling, `archived` boolean (note: `archived_at` was the SP-11 working name; final shipped column is `archived` boolean) | UI_SPRINT_SPEC SP-11, OI-0090 | P2 | 20m |
| UX-6 | §17.2 Header / nav | Add Feedback + Help button placement | UI_SPRINT_SPEC SP-6 | P2 | 10m |
| UX-7 | §21 Feedback Screen (NEW) | Create section — confirmation, stats, dev brief, filtered list, resolve/edit sheets | UI_SPRINT_SPEC SP-7 | P2 | 30m |
| UX-8 | §18 Forage Types Settings (NEW) | Create section per SP-13 (paired with V2_INFRASTRUCTURE.md `dmYieldDensity` unit family — see INFRA-1) | UI_SPRINT_SPEC SP-13, OI-0125 | P3 | 20m |

### V2_SCHEMA_DESIGN.md — 4 items, ~45 min total

Highest precision, lowest prose. Worth doing in one focused pass.

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| SCH-1 | §3.3 `groups` table narrative | Remove `farm_id` from column list. Add design note: "Dropped in migration 032 (OI-0133) — current farm derived from open `event_group_window → event.farm_id` via `getGroupCurrentFarm()`. See CLAUDE.md grep contract for invariant enforcement." | OI-0133 / migration 032 | P1 | 10m |
| SCH-2 | §5.1 `events` table narrative + CREATE TABLE | Remove `date_in` and `time_in` from column list AND the CREATE TABLE block. Add design note: "Dropped in migration 028 (OI-0117) — derived from earliest child window via `getEventStart()`. See CLAUDE.md grep contract." | OI-0117 / migration 028 | P1 | 10m |
| SCH-3 | §5.4 `event_feed_entries` table | Add `destination_event_id` (FK to events, nullable) and `entry_type` enum/check column per SP-10 "Move Feed Out" flow. Note in design rationale why feed transfers between open events need this | UI_SPRINT_SPEC SP-10 | P1 | 15m |
| SCH-4 | §12 `farm_settings` table | Add `bale_ring_residue_*` columns from migration 022 | Migration 022 / commit 7c0b791 | P2 | 10m |

**CP-55/CP-56 export-spec impact:** SCH-3 (new `event_feed_entries` columns) and SCH-4 (new `farm_settings` columns) are new persisted fields — must be added to CP-55 export and CP-56 import per the export/import sync rule. Flag both in the same edit pass.

### V2_CALCULATION_SPEC.md — 1 item, 20 min

Mostly current. One new pattern to document.

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| CALC-1 | §4.6 (or new §4.7) | Document `getLiveRemainingForMove(eventId)` as the canonical helper for "live remaining feed per (batchId, locationId)." Spell out the strict-`>` rule, the same-instant edge case, and the three current consumers. The grep contract in CLAUDE.md OI-0139 is the implementation invariant; the calc spec should be the design statement of why | OI-0139 | P2 | 20m |

### V2_INFRASTRUCTURE.md — 2 items, ~30 min

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| INFRA-1 | §2.3 Units | Add `dmYieldDensity` unit family (lb/ac, kg/ha) per SP-13 Forage Types | UI_SPRINT_SPEC SP-13 | P3 | 10m |
| INFRA-2 | §3 Sync (or new subsection) | Document the honest sync indicator: green = push queue empty AND last pull within 15 min; amber = otherwise. Tap = `pullAllRemote()`, not navigate to Settings. Note the OI-0141 origin and the visibility-change pull trigger | OI-0141 / migration to header sync dot | P2 | 20m |

### V2_APP_ARCHITECTURE.md — 2 items, ~45 min

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| ARCH-1 | New "Snapshot / Rollback" subsection | Document the SP-10 Phase 1 helper (snapshot state, rollback on cancel, gap/overlap resolver re-snaps timeline). This is now a project-wide pattern for any multi-step edit flow | UI_SPRINT_SPEC SP-10, OI-0081 | P1 | 30m |
| ARCH-2 | "Derive on read, don't store" doctrine (expand existing or new subsection) | Lift the OI-0117 / OI-0133 lesson out of CLAUDE.md grep contracts and into the architecture doc as the design-level statement: any value derivable from child rows must be derived at read time, not stored on the parent. Reference the four current applications (`getEventStart`, `getGroupCurrentFarm`, `getLiveRemainingForMove`, sync indicator state) | OI-0117 / OI-0133 / OI-0139 | P2 | 15m |

### V2_DESIGN_SYSTEM.md — 1 item to verify, ~15 min

| ID | Section | Update | Source | P | Effort |
|---|---|---|---|---|---|
| DS-1 | Components | Verify `paddock-card` (OI-0100) reusable component is documented with variants/states. Header bar updates (multi-farm context) appear to already be reconciled per the file's own change log entry on 2026-04-13. Spot-check during reconciliation; add if missing | OI-0100 | P3 | 15m |

### V2_MIGRATION_PLAN.md — no drift detected

§5.3a FK-dependency ordering is current through migration 032. No reconciliation needed unless a new migration lands during reconciliation.

### GTHO_V1_FEATURE_AUDIT.md — no drift expected

V1 doesn't change. This doc is read-only history.

---

## Items NOT in scope for this reconciliation

Surface for clarity — these are real open items but they're not doc-drift, they're spec-design or implementation work:

- **OI-0114** — BRC reactive auto-fill drift across 4 surfaces. Spec-design + impl, not doc reconciliation.
- **OI-0120** — Member edit (display_name/email/role) post-CP-66. Implementation gap, not doc drift.
- **OI-0123** — Sub-move feed-check labels by feed-delivery location. Refinement spec, not yet final.
- **OI-0132** — Dam + Birth date shared row (SP-14). Spec ready; implementation pending.
- **OI-0136** — Residual input correction in move-wizard. Implementation, not doc.
- **OI-0137** — Linked-pair audit (backdated cull banner on Event Detail). Spec-design.
- **OI-0138** — Dev Mode Event Audit view. DESIGN REQUIRED, large.
- **OI-0140** — Feed delivery picker (locked 2026-05-01, awaiting impl).
- **OI-0143, OI-0144, OI-0145, OI-0150** — newer items, not implementation-ready.

These belong in their own work cycles. Folding them in here would balloon scope.

---

## Session sequence (recommended)

Three Cowork sessions, by base doc cluster. Each ends with a commit + push + handoff to Claude Code for `PROJECT_CHANGELOG.md` row.

**Session A — Schema doc (1 hr)**
SCH-1 → SCH-2 → SCH-3 → SCH-4. All four edits in one pass. Lowest risk, highest precision. Ends with: schema doc clean, CP-55/CP-56 spec impact flagged for SCH-3 + SCH-4 in OPEN_ITEMS.md as a follow-up.

**Session B — UX flows P1 (90 min)**
UX-1 → UX-2 → UX-3 → UX-4. The four P1 UX items. Biggest prose lift. UX-4 (Event Data Editing §17.15.1) is the largest single piece. Ends with: §17 fully reconciled with all SP-3 / SP-8 / SP-10 / SP-12 work.

**Session C — UX flows P2/P3 + Architecture + Infrastructure + Calc + DS (90 min)**
UX-5 → UX-6 → UX-7 → UX-8 → ARCH-1 → ARCH-2 → INFRA-1 → INFRA-2 → CALC-1 → DS-1. The remaining items. Smaller individually; group by file edits. Ends with: full reconciliation, `UI_SPRINT_SPEC.md` retired (renamed `UI_SPRINT_SPEC_RETIRED_2026-05-XX.md` or deleted per Tim's preference), this plan retired.

**Optional Session D** — only if discoveries during A–C surface new drift. Reserve for cleanup.

---

## Handoff notes

**For Claude Code (after each session):**
- Add a row to `PROJECT_CHANGELOG.md`: `YYYY-MM-DD | Reconciliation Session [A/B/C] | <files updated> | RECONCILIATION_PLAN items <IDs>`
- Update CLAUDE.md grep contracts only if a base-doc edit changes an invariant Claude Code enforces (none expected in this reconciliation — all edits are documentation of existing invariants, not changes to them)
- Cowork cannot push directly — provide terminal commands at end of each session per project's delivery gate

**For OPEN_ITEMS.md:**
- Each session that closes a sprint spec line item should also flip the corresponding entry in `UI_SPRINT_SPEC.md`'s "Pending reconciliation checklist" to ✅ in the same commit (piggyback rule)
- After SCH-3 + SCH-4 land, add a single new OPEN_ITEMS entry: "CP-55/CP-56 spec catch-up for new persisted fields from reconciliation" — this is the export-sync follow-up

**For V2_BUILD_INDEX.md:**
- Update the "Active Sprint: UI Improvements" status line at the top of CLAUDE.md (and matching entry in V2_BUILD_INDEX.md if present) once Session C completes — flip to "RECONCILED 2026-05-XX" then remove on next session start

---

## Risk notes

- **No invention required.** Every backlog item has a source of truth (closed OI, shipped commit, or finalized sprint spec). If a backlog item turns out to need design decisions, it gets bumped out of scope and back onto OPEN_ITEMS as a design-required entry, per CLAUDE.md "Invention Required — Stop and Flag" rule.
- **One landmine to watch:** SP-11 column name. Spec discussion used `archived_at` (timestamp); shipped migration 024 used `archived` (boolean). The schema doc must reflect what shipped, not what was spec'd. Cross-check the migration file before writing UX-5 and any §3.3 schema notes.
- **Test risk: zero.** No code touched in reconciliation. 779 tests should remain at 779 passing throughout.

---

## Change Log

| Date | Session | Change |
|---|---|---|
| 2026-05-03 | Audit / planning | Initial plan written. Audit covered: OPEN_ITEMS through OI-0150, PROJECT_CHANGELOG since 2026-04-13, UI_SPRINT_SPEC reconciliation table, git log since 2026-04-13, spot-checks against all 7 base docs. 17 reconciliation items identified across 6 docs. |
