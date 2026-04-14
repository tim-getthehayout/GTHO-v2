# GTHO v2 — Infrastructure Specification

**Status:** APPROVED
**Source:** Prior ARCHITECTURE.md §9, §10, §12, §13, §16, §17, §22, §23
**Purpose:** Define the plumbing — units, i18n, logging, security, testing, CI, PWA. Claude Code follows these specs for all infrastructure work.

---

## 1. Unit System

### 1.1 Hard Rule: Metric Internal

All values stored in metric units. No exceptions. The display layer converts based on user preference.

| Measurement | Internal Unit | Display (Imperial) | Conversion Factor |
|-------------|--------------|-------------------|-------------------|
| Weight | kg | lbs | × 2.20462 |
| Area | hectares | acres | × 2.47105 |
| Length/Height | cm | inches | × 0.393701 |
| Temperature | °C | °F | (°C × 9/5) + 32 |
| Volume | liters | gallons | × 0.264172 |
| Yield rate | kg/ha | lbs/acre | × 0.892179 |

### 1.2 units.js Module

```js
// src/utils/units.js
export function convert(value, from, to) { ... }
export function display(value, measureType, decimals) { ... }
```

- `convert()` handles bidirectional conversion with named keys
- `display()` reads the operation's `unit_system` from the store and formats with the correct unit label
- All conversion logic in one file — feature code never does unit math

### 1.3 Unit System Storage (A44)

`operations.unit_system` (text, `'metric'` or `'imperial'`, default `'imperial'`) is the single source of truth for display units across the whole operation. Rationale: same as currency (A20) — a user doesn't think in acres at one farm and hectares at another. The toggle sets one value that applies to every farm in the operation.

- Set once during onboarding; editable from Settings
- Read via `store.getOperation().unitSystem`
- `units.display()` consults this value on every call — no caching outside the store
- Storage remains metric (§1.1) — this column only controls the display layer

---

## 2. Internationalization (i18n)

### 2.1 Module

```js
// src/i18n/i18n.js
export function loadLocale(code) { ... }     // Fetch and set active locale
export function t(key, replacements) { ... } // Translate with interpolation
```

- Nested key access: `t('event.status.active')` → "Active"
- Interpolation: `t('event.daysOn', { days: 14 })` → "14 days on pasture"
- Fallback: missing key returns the key itself (visible in UI, easy to spot)
- **No hardcoded English in feature code.** Everything uses `t()`.

### 2.2 Locale File Structure

```json
// src/i18n/locales/en.json
{
  "app": { "name": "Get The Hay Out", "version": "v2" },
  "nav": { "dashboard": "Dashboard", "events": "Events", ... },
  "event": { "status": { "active": "Active", "closed": "Closed" }, ... },
  "location": { "type": { "confinement": "Confinement", "land": "Land" }, ... },
  "action": { "save": "Save", "cancel": "Cancel", "delete": "Delete", ... },
  "unit": { "kg": "kg", "lbs": "lbs", "ha": "ha", "acres": "acres", ... }
}
```

---

## 3. Error Logging

### 3.1 Architecture Decision: Logger Owns Its Persistence

The logger (`src/utils/logger.js`) bypasses the Store (A9) and SyncAdapter (A10). This is an intentional exception to the single-data-access-point rule:

1. Sync errors can't report through the sync queue (circular dependency — if the queue is broken, you can't log that it's broken)
2. Logs must capture even when offline
3. The log flusher monitors sync independently

The logger maintains its own persistence path (direct Supabase write + localStorage fallback) precisely because it needs to work when the normal persistence path is failing. See §3.4 for the bootstrap problem this solves.

### 3.2 Logger Module

```js
// src/utils/logger.js
export const logger = {
  info(category, message, context) { ... },
  warn(category, message, context) { ... },
  error(category, message, context) { ... },
};
```

**Rule:** Feature code never uses `console.error`. Use `logger.error(category, message, context)`. `console.*` only in logger.js itself and test files.

### 3.3 app_logs Table

Aligned with schema D11.1. Direct-write to Supabase — bypasses sync queue (A24).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | Nullable. auth.users FK. Nullable because user might not be signed in when error occurs. |
| operation_id | uuid | Nullable. No FK constraint. Best-effort — populated when known, null during login/onboarding errors. |
| session_id | text | Nullable. Browser session identifier for grouping related log entries. |
| level | text | NOT NULL, DEFAULT 'error'. Values: 'error', 'warn', 'info'. |
| source | text | NOT NULL. What part of the app generated the log, e.g. 'supabase-load', 'sync-queue', 'render'. |
| message | text | NOT NULL. Human-readable description, truncated to reasonable length in app code. |
| stack | text | Nullable. Stack trace if available. |
| context | jsonb | Nullable. Structured metadata — shape varies by log type. Dead letters include: table, record_id, original_record, error, retry_count, first_attempt_at, last_attempt_at, dead_lettered_at (see §3.5 for full spec). Regular errors may include screen, function name, related record IDs, sync queue state. |
| app_version | text | Nullable. Build stamp at time of error. |
| created_at | timestamptz | NOT NULL, DEFAULT now() |

- **RLS by user_id** (not operation_id — logs are diagnostic data scoped to the user who generated them, not to a farm operation)
- Auto-delete logs > 90 days (Supabase cron or edge function)
- Logs are write-once — no updated_at column

### 3.4 Sync Error Bootstrap Problem

The SyncAdapter (A10) handles offline queuing and retry with exponential backoff. But sync errors themselves can't use the sync queue — that's the circular dependency from §3.1. Solution: direct-write fallback.

1. Try direct Supabase insert for the log
2. If offline: store in separate `_log_buffer` localStorage key
3. Log flusher checks `_log_buffer` independently of main sync queue

### 3.5 Dead Letter Logging

Part of the SyncAdapter's (A10) retry lifecycle. Failed writes after 5 retries become dead letters. Each dead letter is logged to app_logs with structured detail in the `context` jsonb field:

- `table`: which table the write targeted
- `record_id`: the specific record that failed
- `original_record`: full record payload (for manual recovery)
- `error`: the error message from the last attempt
- `retry_count`: how many attempts were made
- `first_attempt_at`, `last_attempt_at`, `dead_lettered_at`: timestamps for the full retry timeline

"Push All" button in Settings re-queues dead letters for retry. Dead letter behavior is covered by the SyncAdapter's 14-scenario test suite (A10).

### 3.6 Log Viewer

Admin screen in Settings:
- Filter by level, category, date range
- Sync errors highlighted
- Dead letter count with expandable details
- Export capability for debugging

---

## 4. In-App Feedback System

### 4.1 Submission Context Auto-Capture

Every submission auto-captures context via the `screen` and `version` columns plus recent logger output:
- `screen`: current hash route (auto-populated)
- `version`: app build stamp (auto-populated)
- `area`: app area/domain the submission relates to (user-selected or inferred)
- Recent errors from logger (last 5, included in the submission for developer review)
- Sync status (idle/syncing/error/offline) and queue length available in the log viewer (§3.6)

### 4.2 submissions Table

Aligned with schema D11.2. Thread field is JSONB — an intentional exception to normalization principle #6 for append-only conversation data (A25).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| operation_id | uuid | NOT NULL, FK → operations. RLS scoping. |
| submitter_id | uuid | Nullable. auth.users FK. Who submitted it. |
| app | text | NOT NULL, DEFAULT 'gthy'. Which app (future-proofs for multi-app). |
| type | text | NOT NULL. 'feedback' or 'support'. |
| category | text | Nullable. Values: roadblock, bug, ux, feature, calc, idea, question. |
| area | text | Nullable. App area/domain the submission relates to. |
| screen | text | Nullable. Which screen the user was on (auto-captured). |
| priority | text | NOT NULL, DEFAULT 'normal'. Values: normal, high, critical (support only). |
| status | text | NOT NULL, DEFAULT 'open'. Values: open, resolved, closed. |
| note | text | Nullable. User's initial description. |
| version | text | Nullable. App version at time of submission. |
| thread | jsonb | DEFAULT '[]'. Append-only conversation log: [{role, text, ts, author}]. JSONB exception (A25). |
| dev_response | text | Nullable. Developer's response text. |
| dev_response_ts | timestamptz | Nullable. When dev responded. |
| first_response_at | timestamptz | Nullable. SLA tracking — when first response was given. |
| resolved_in_version | text | Nullable. Which version resolved the issue. |
| resolution_note | text | Nullable. How it was resolved. |
| oi_number | text | Nullable. Links to OPEN_ITEMS tracking number. |
| linked_to | uuid | Nullable. FK to another submission (regression/duplicate linking). |
| created_at | timestamptz | NOT NULL, DEFAULT now() |
| updated_at | timestamptz | NOT NULL, DEFAULT now() |

Queued offline, synced on reconnect (unlike app_logs, submissions go through the normal SyncAdapter).

---

## 5. Security — Supabase RLS

### 5.1 Row-Level Security

Every user-data table has RLS enabled. Three patterns:

**Pattern A — operation-scoped tables (granular policies)**

Most tables: events, animals, locations, batches, farms, farm_settings, animal_classes, forage_types, treatment_categories, input_product_categories, etc. Access is based on membership, not ownership. This ensures non-owner team members (farm managers, vets, hired hands) can see and work with operation data.

**Important: Do not use `FOR ALL` policies.** The sync adapter uses Supabase `.upsert()`, which requires both INSERT and UPDATE policies to pass. A `FOR ALL` policy applies its `USING` clause as the `WITH CHECK` for INSERT, which fails during onboarding because the `operation_members` row doesn't exist yet (chicken-and-egg). Use granular per-command policies instead.

```sql
-- INSERT: any authenticated user can create records
-- (the operation_id FK ensures they can only insert into valid operations)
CREATE POLICY "[table]_insert" ON [table_name] FOR INSERT
  WITH CHECK (true);

-- SELECT: members see their operation's data
CREATE POLICY "[table]_select" ON [table_name] FOR SELECT
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- UPDATE: members can update their operation's data
CREATE POLICY "[table]_update" ON [table_name] FOR UPDATE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));

-- DELETE: members can delete their operation's data
CREATE POLICY "[table]_delete" ON [table_name] FOR DELETE
  USING (operation_id IN (
    SELECT operation_id FROM operation_members WHERE user_id = auth.uid()
  ));
```

**Pattern B — operation_members (bootstrap-safe)**

The `operation_members` table is the central authorization table that every other policy depends on. Its policies must avoid self-referential queries that cause infinite recursion, and its INSERT policy must allow the first member row to be created without an existing membership.

```sql
-- SELECT: users see only their own membership rows
-- IMPORTANT: Do NOT use a subquery back to operation_members here.
-- That causes infinite recursion when other tables' policies query this table.
CREATE POLICY "operation_members_select" ON operation_members FOR SELECT
  USING (user_id = auth.uid());

-- INSERT: users can insert their own row (onboarding bootstrap)
-- or owner/admin can invite others
CREATE POLICY "operation_members_insert" ON operation_members FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    OR operation_id IN (
      SELECT om.operation_id FROM operation_members om
      WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
      AND om.role IN ('owner', 'admin')
    )
  );

-- UPDATE/DELETE: owner/admin only (standard membership check)
```

**Pattern C — user-scoped tables** (app_logs, user_preferences)

These tables have no operation_id or use it only as optional context. Scoped directly to the authenticated user.

```sql
CREATE POLICY "Users see own records"
  ON [table_name]
  FOR ALL
  USING (user_id = auth.uid());
```

**Standalone lookup tables** (dose_units, input_product_units)

These tables have no `operation_id` column and no `user_id` column. RLS is disabled on these tables. They are populated during onboarding with seed data and scoped via FK relationships to operation-owned parent tables.

### 5.1a Onboarding Bootstrap Sequence

During onboarding, records are created in this order: operations → operation_members → farms → farm_settings → user_preferences → seed data (animal_classes, forage_types, treatment_categories, input_product_categories, dose_units, input_product_units). Each INSERT must succeed without requiring the user to already be a member. This is why Pattern A uses `WITH CHECK (true)` for INSERT and Pattern B allows `user_id = auth.uid()` self-insertion.

**Known trap — upsert vs insert:** The sync adapter currently uses `.upsert()` for all writes (see V2_APP_ARCHITECTURE.md §5.2). Supabase evaluates upsert as INSERT + UPDATE, requiring both policies to pass. During onboarding, UPDATE policies that check `operation_members` will fail because the membership row may not exist yet. The sync adapter must be updated to use `.insert()` for new records and `.update()` for existing records (see OI-0054).

### 5.2 Auth

- Supabase Auth with JWT tokens
- RLS uses `auth.uid()` to scope data
- Service role key (server-side only) for edge functions and migrations
- Anon key (client-side) for authenticated user requests

### 5.3 Schema-First Development

Every data change follows this order:
1. Write migration SQL
2. Update entity file (FIELDS, shape functions)
3. Write feature code

**Never add a column without a migration. Never write to a nonexistent column.**

---

## 6. Testing Strategy

### 6.1 Unit Tests (Vitest)

| What to test | Pattern |
|-------------|---------|
| Calculation functions | Test against registerCalc() example values first |
| Entity shape functions | Round-trip: `fromSupabaseShape(toSupabaseShape(record))` === original |
| Entity validation | Required fields, type constraints, edge cases |
| Store getters/actions | Mock storage, verify state changes + notifications |
| Date utilities | Edge cases (midnight crossing, DST, inclusive vs exact) |
| Unit conversions | Known conversion values, bidirectional accuracy |
| Input validators | Valid inputs pass, invalid inputs throw with clear messages |

### 6.2 E2E Tests (Playwright)

Critical user flows:
- Create event → add feed → feed check → close event
- Move wizard full flow (close + new)
- Survey workflow (bulk draft → commit)
- Feed transfer during move
- Offline create → reconnect → sync

Use `data-testid` attributes for selectors. Multi-browser (Chrome, Safari, Firefox).

### 6.3 CI Pipeline (GitHub Actions)

On every push and PR:
1. `npm run lint` — ESLint
2. `npm run test:unit` — Vitest
3. `npm run test:e2e` — Playwright
4. `npm run build` — Vite production build

All four must pass.

---

## 7. Build Infrastructure

### 7.1 Separate Supabase Project

v2 gets its own Supabase project. Fresh schema, no legacy tables. v1 continues serving until cutover.

### 7.2 Environment Configuration & Build-Phase Access

Two access paths to Supabase during the build phase:

**Path 1: Supabase MCP Connector (build-time tooling)**

The Supabase MCP connector is connected to Cowork and available to Claude Code sessions. It provides authenticated access to the v2 Supabase project for:
- Applying migration SQL and managing schema changes
- Querying tables to verify data during development
- Managing database configuration, auth, and storage
- Inspecting RLS policies and project settings

This is the preferred path for all build-time database operations. No keys in files, no cleanup needed.

**Path 2: `.env.build` (app runtime client)**

The app's Supabase client (`@supabase/supabase-js`) needs URL and anon key at runtime. These come from a gitignored environment file:

`.env.build` (gitignored):
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Vite loads this file automatically. The app code references these via `import.meta.env.SUPABASE_URL`, etc.

**When each path is used:**

| Task | Path | Why |
|------|------|-----|
| Apply migration SQL | MCP | Direct project access, no key management |
| Verify table data during build | MCP | Query without writing client code |
| Inspect RLS policies | MCP | Project management tool |
| App runtime Supabase client init | `.env.build` | Vite injects at build time |
| E2E tests (Playwright) | `.env.build` | Tests run the real app, which needs the client |
| CI pipeline | GitHub Secrets | Production builds use injected env vars |

**Build-phase timeline:**

1. **Phase 3.1 (Scaffold):** No Supabase access needed. Store, entities, router, DOM builder, i18n, units, logger, and calc-registry are all built and tested locally against mocks and localStorage.
2. **Phase 3.2+ (Core Loop onward):** MCP connector handles schema operations. `.env.build` exists on the dev machine for running the app and E2E tests.
3. **Post-build cleanup:** `.env.build` is deleted. Production app uses GitHub Secrets for environment-injected keys. MCP connector remains available for ongoing database management.

**Rules:**
- `.env.build` is gitignored — Claude Code never commits it
- Claude Code never hardcodes keys in source files
- Prefer MCP over `.env.build` for any operation that doesn't require the running app
- If `.env.build` is missing when needed for app runtime, Claude Code stops and asks Tim to create it rather than inventing a workaround

### 7.3 PWA Setup

- Service worker for caching and offline support
- Web app manifest for installability
- Cache-first for app shell, network-first for API calls
- Update prompt when new version available

---

## 8. AI Integration Architecture

> **Scope note:** This section describes the planned AI/voice integration across three phases. It is a **design roadmap**, not a Phase 3 build target. No schema tables exist for voice transcripts, training data, or guided scripts — these will be designed as a schema update when Phase 1 implementation begins (after the core app is stable and deployed). Claude Code should not implement this section during the initial v2 build.

### 8.1 Three-Phase Strategy

**Phase 1 (Launch):** Web Speech API → transcript → Supabase Edge Function → Claude Haiku API → structured data → review card → user confirm → commit.

**Phase 2 (Silent Training Capture):** Every voice interaction logs: raw transcript, AI output, user corrections, final committed data. Builds training dataset.

**Phase 3 (On-Device):** Fine-tuned small model (Phi-3.5-mini or Gemma 3 1B) via WebLLM. Same InferenceAdapter interface — transparent swap. Fallback to Haiku if confidence < 0.7 and online.

### 8.2 InferenceAdapter Pattern

Same plug-swap pattern as SyncAdapter:
```js
export class InferenceAdapter {
  async parse(transcript, context) { throw new Error('Not implemented'); }
  async refine(partialResult, correction) { throw new Error('Not implemented'); }
  getConfidence() { throw new Error('Not implemented'); }
}
```

### 8.3 Conversational Parsing

Multi-turn, not one-shot. User speaks → AI parses and shows review card → user refines field-by-field ("Actually just heifers") → AI updates only that field.

### 8.4 Guided Script Library

Pre-built voice prompts for common tasks. Each script defines: prompt string, field name, type (location, group, number, text, etc.).

### 8.5 Source Audit

Every record tagged `source: 'voice'` or `'manual'`. Enables voice-accuracy filtering in reports.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-12 | Session 6 — Infrastructure review | §3.1: Added A9/A10 exception references. §3.3: Aligned app_logs to schema (+operation_id nullable, +context jsonb, RLS by user_id). §3.4–3.5: Added A10 refs, dead letter context structure. §4.1–4.2: Aligned submissions to schema, added A25 ref. §5.1: Fixed RLS to use operation_members, added user-scoped example. §8: Added roadmap scope note. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
