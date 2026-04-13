# Claude Code Handoff Prompt

Paste this into Claude Code to start the session.

---

Read `session_briefs/SESSION_BRIEF_2026-04-12_backfill-and-phase-3.3-handoff.md` for full context. Then read V2_BUILD_INDEX.md "Current Focus" section.

This session has 4 work items in strict order:

**Item 0 — Split events/index.js (MANDATORY FIRST).** The file is ~2000 lines with 8 sheet handlers in one file. This is the exact monolith pattern v2 was built to avoid. V2_APP_ARCHITECTURE.md §3 has been updated with the target file structure and three new rules: one sheet per file, shared sheets live in their domain not their caller, and ~500 line guideline. Split events/index.js into 5 files (index, move-wizard, submove, group-windows, close). Move feed delivery and feed check sheets out of events into feed/delivery.js and feed/check.js — they're shared components used by events, field mode, and feed screen. Event cards import and call them. All existing tests must pass. No behavior changes — pure structural refactor. Commit when done.

**Item 1 — Backfill Phase 3.2 open items.** See OPEN_ITEMS.md for OI-0004 through OI-0008. Do them in priority order (P1 first). Each is a standalone commit.

**Item 2 — Schema amendment: animal_notes.** Add `animal_notes` table (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Migration SQL + entity file + store + sync registry. Do this before CP-32.

**Item 3 — Phase 3.3 (CP-24 through CP-52).** Full spec is in V2_BUILD_INDEX.md. Key thing that changed since last session: V2_UX_FLOWS.md now has §14 (reusable health recording components), §15 (entity CRUD forms), and §16 (field mode). Health sheets (CP-32–36) should build from §14 — each sheet is one file in `health/`, documented once with all entry points and context pre-fill behavior mapped. Follow the file structure in V2_APP_ARCHITECTURE.md §3 for all new feature files.
