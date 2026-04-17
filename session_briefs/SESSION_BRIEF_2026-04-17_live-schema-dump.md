## Session Handoff — 2026-04-17 (Live Supabase Schema Dump)

**Context:** Tim is running a "local-only fields" audit in Cowork — looking for any data field that saves to localStorage but never syncs to Supabase. We've been burned by this class of bug multiple times (OI-0050, OI-0053, and the v1 open item OI-0181). The audit uses a six-column matrix (entity parity, shape round-trip, store param counts, sync-registry coverage, backup spec coverage, live schema verification) run against every entity in the repo.

The matrix only works if the **live Supabase schema is the ground truth**. Auditing the entity files against the migration files just tells us "the files agree with each other" — it doesn't catch ghost migrations (files committed but never executed against the database). OI-0053 was exactly this: migrations 013–017 were on disk, no entity complained, and yet the columns didn't exist in Supabase. Silent sync failures for every onboarding and migration test.

This brief unblocks the audit by asking Claude Code to dump the current live schema into a file in the repo. Cowork will ingest that dump in the next session and complete the matrix.

**What Cowork did this session:** Designed the audit methodology. Wrote this brief. No OPEN_ITEMS changes, no spec changes.

---

## OPEN_ITEMS changes

None. This is a data-gathering brief; findings get logged after the matrix is filled in.

---

## Work Items (ordered)

### 1. Run the live schema dump via Supabase MCP

Execute the following queries against the live Supabase database (the one the deployed app uses — `operations` table should have real rows). Capture the full result set of every query — not a summary.

```sql
-- Q1: All base tables in public schema
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Q2: All columns with types, nullability, defaults
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Q3: All foreign keys (for reconciling against §5.3a)
SELECT
  tc.table_name AS child_table,
  kcu.column_name AS child_column,
  ccu.table_name AS parent_table,
  ccu.column_name AS parent_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Q4: All RLS policies
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- Q5: operations.schema_version — tells us which migrations Supabase THINKS it has
SELECT id, schema_version FROM operations;

-- Q6: Row counts per table (helps triage which tables are active vs empty)
-- If MCP supports it, loop over Q1 results and count each.
-- Otherwise skip Q6 — Cowork can infer active tables from Q2.
```

### 2. Write the results to a new file in the repo

File path: `/Users/timjoseph/Github/GTHO-v2/SCHEMA_DUMP_2026-04-17.md`

Structure:

```markdown
# Live Supabase Schema Dump — 2026-04-17

Generated for the local-only fields audit (see session_briefs/SESSION_BRIEF_2026-04-17_live-schema-dump.md).

Source: Supabase production database, queried via MCP at {timestamp}.
Latest migration file on disk: {highest migration number in supabase/migrations/}.
`operations.schema_version` from Q5: {value}.

## Q1 — Tables
{full result as markdown table or fenced code block}

## Q2 — Columns
{full result — this will be long; use a code block}

## Q3 — Foreign Keys
{full result}

## Q4 — RLS Policies
{full result}

## Q5 — Schema Version
{full result}

## Q6 — Row Counts (optional)
{full result or note that Q6 was skipped}

## Ghost-migration pre-check

After running Q5, compare `operations.schema_version` to the highest-numbered migration file in `supabase/migrations/`.

- If they match: no obvious ghost migrations — Cowork audit continues normally.
- If `schema_version` < highest file: list the gap numerically (e.g. "DB at 17, files go to 21 — migrations 018, 019, 020, 021 may never have been executed"). Cowork will investigate each gap in the next session.

## Reconcile Q5 against BACKUP_MIGRATIONS

Open `src/data/backup-migrations.js`. Confirm the migration chain covers 1 → `schema_version` from Q5. If the `BACKUP_MIGRATIONS` table has entries for versions beyond `schema_version`, that's fine (they chain forward for future migrations). If it's MISSING entries below `schema_version`, that's a CP-56 hole and should be flagged.
```

No interpretation beyond the ghost-migration pre-check — just capture the data. Cowork does the diffing against the entity and design-doc sources.

### 3. Commit and push

```bash
cd /Users/timjoseph/Github/GTHO-v2
git add SCHEMA_DUMP_2026-04-17.md
git add PROJECT_CHANGELOG.md
git commit -m "docs: live Supabase schema dump for local-only fields audit

Captures full table/column/FK/RLS state of the production database
to serve as ground truth for the Cowork audit (see SESSION_BRIEF_2026-04-17).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
git push origin main
```

Add one PROJECT_CHANGELOG.md row:

> `2026-04-17 | docs | SCHEMA_DUMP_2026-04-17.md | Live Supabase schema captured for local-only fields audit. Ground-truth input for Cowork matrix.`

---

## Acceptance Criteria

- [ ] All 5 required queries (Q1–Q5) executed and results captured verbatim in the markdown file
- [ ] Q6 either captured or explicitly marked skipped
- [ ] Ghost-migration pre-check result written at the bottom of the file
- [ ] BACKUP_MIGRATIONS reconciliation note written
- [ ] File committed and pushed to main
- [ ] PROJECT_CHANGELOG.md updated

---

## What NOT to do

- **Do not edit the schema.** This is a read-only dump. No DDL, no RLS changes, no inserts.
- **Do not summarize or truncate query results.** The audit needs every row. If the output is large, use a code block — do not elide.
- **Do not start the audit itself.** Cowork owns the diffing work. Claude Code just provides the ground-truth input.
- **Do not open OPEN_ITEMS entries from the ghost-migration pre-check.** Flag the gap in the dump file only; Cowork decides how to log findings.

---

## Follow-up

Once the dump is pushed, Tim will return to Cowork to execute Step 1 of the audit (entity universe enumeration across 5 sources, with the live schema as primary). The full matrix and findings come out of that session as a separate brief.
