# Session Brief — 2026-04-12 (Session 6)

**Project:** GTHO v2 Rebuild (App-Migration-Project repo)
**Phase:** 2 — Design
**Repo:** App-Migration-Project (docs-only project, `main` branch)

---

## Context

Continuing the architecture walkthrough of DRAFT docs. This session reviewed V2_INFRASTRUCTURE.md — the plumbing spec (units, i18n, logging, feedback, security, testing, CI, PWA, AI roadmap).

---

## What Was Done This Session

1. **V2_INFRASTRUCTURE.md — full review and update:**

   **§3 Error Logging (Issues 1, 2, 5, 6, 9):**
   - §3.1: Added explicit A9 (Store pattern) and A10 (SyncAdapter) references. Logger bypass is now documented as an intentional exception to A9, not an unexplained deviation.
   - §3.3: Replaced stale app_logs column list with schema-aligned version. Added `operation_id` (nullable, no FK, best-effort) and `context` (jsonb, structured metadata for dead letters and error context). Changed RLS note from "by operation_id" to "by user_id."
   - §3.4: Added A10 reference — sync error bootstrap is part of the SyncAdapter's lifecycle.
   - §3.5: Added A10 reference and documented `context` jsonb field structure for dead letters (table, record_id, original_record, error, retry_count, timestamps). Noted dead letter behavior is covered by A10's 14-scenario test suite.

   **§4 Feedback System (Issues 3, 7):**
   - §4.1: Updated auto-capture description to align with schema columns (`screen`, `version`, `area`).
   - §4.2: Replaced entire submissions table definition with approved schema version. Updated type values ('feedback'/'support' not 'bug'/'feature'), status values ('open'/'resolved'/'closed' not 'acknowledged'/'fixed'/'wont_fix'), and added all missing columns (category, area, priority, dev_response fields, SLA tracking, OI linking). Added A25 reference for JSONB thread exception.

   **§5 Security — RLS (Issue 4):**
   - §5.1: Replaced incorrect `owner_id = auth.uid()` policy with `operation_members` membership check. Added second RLS example for user-scoped tables (app_logs, user_preferences) using `user_id = auth.uid()`.

   **§8 AI Integration (Issue 8):**
   - Added scope note preamble: §8 is a design roadmap, not a Phase 3 build target. No schema tables exist for voice/AI — they will be designed when Phase 1 implementation begins.

2. **Schema amendment — GTHO_V2_SCHEMA_DESIGN.md:**
   - D11.1 app_logs: Added `operation_id uuid NULL` (no FK constraint, best-effort population) and `context jsonb NULL` (structured metadata for dead letters and error context). Updated design decisions and SQL.
   - D11 section header: Added future schema note for AI/voice tables.
   - Appendix B: Added 2026-04-12 entry to design session log.

3. **V2_BUILD_INDEX.md updated:**
   - Current focus updated to reflect infrastructure review in progress
   - Schema design row amended with 2026-04-12 app_logs changes
   - Infrastructure row updated with review progress note

---

## Decision Log

No new A-numbered decisions. Key design calls made during review:

- **operation_id on app_logs is best-effort nullable, not absent.** Original schema removed it entirely (valid reason: logging must work pre-login). Tim's review added it back as nullable with no FK — provides useful filtering 95% of the time, doesn't block logging the other 5%.
- **context jsonb added alongside stack text.** Dead letter logging needs structured data (table, record_id, retry_count, timestamps) that doesn't fit in a plain text stack trace field. Context field varies by log type — standard pattern for production logging systems.
- **RLS uses operation_members, not operations.owner_id.** Multi-user operations require membership-based access checks, not ownership checks.
- **Two RLS patterns documented.** Operation-scoped tables use operation_members check. User-scoped tables (app_logs, user_preferences) use direct user_id check.
- **AI §8 is roadmap only.** Not a Phase 3 build target. Schema tables for voice/AI features will be designed in a future update.

---

## What's Next

**V2_INFRASTRUCTURE.md marked APPROVED.** All 9 identified issues resolved, three-audit verification passed.

1. Continue walkthrough with **V2_CALCULATION_SPEC.md** — 42 formulas, registerCalc() pattern, 3-tier config
2. Then **V2_UX_FLOWS.md**, then **V2_MIGRATION_PLAN.md**
3. After all 3 remaining docs reviewed and approved, Phase 2 is complete

---

## Files Changed

| File | Action |
|------|--------|
| V2_INFRASTRUCTURE.md | §3.1 A9/A10 refs added, §3.3 app_logs aligned to schema (+operation_id, +context, RLS by user_id), §3.4–3.5 A10 refs + dead letter context structure, §4.1–4.2 submissions aligned to schema + A25 ref, §5.1 RLS policy corrected (operation_members + user-scoped example), §8 roadmap scope note added. |
| GTHO_V2_SCHEMA_DESIGN.md | D11.1 app_logs amended: +operation_id (nullable, no FK), +context (jsonb). D11 header: AI/voice future note. Appendix B: 2026-04-12 session log entry. |
| V2_BUILD_INDEX.md | Current focus updated, schema row amended, infrastructure row updated with review progress. |

---

## Open Questions

- None outstanding. All 9 issues identified during review have been resolved.

---

## How to Start the Next Session

1. Read `V2_BUILD_INDEX.md` — current focus and full status
2. If V2_INFRASTRUCTURE.md not yet approved, review the changes and approve
3. Open `V2_CALCULATION_SPEC.md` — next doc for walkthrough
4. Same process: review against finalized schema, update stale references, flag decisions, approve
