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

### 1.4 Unit Families

`convert()` and `unitLabel()` are organized by **unit family** — a named measurement type that bundles a stored metric unit, an imperial display unit, and the bidirectional conversion factor. Feature code passes `measureType` strings (e.g. `'length'`, `'weight'`, `'area'`) to the converter, never raw factors.

| Family | Stored unit (metric) | Imperial display | Conversion factor (metric → imperial) |
|---|---|---|---|
| `weight` | kg | lbs | × 2.20462 |
| `area` | hectares (ha) | acres | × 2.47105 |
| `length` | cm | inches (in) | × 0.393701 |
| `temperature` | °C | °F | `(°C × 9/5) + 32` |
| `volume` | liters | gallons | × 0.264172 |
| `yieldRate` | kg/ha | lbs/acre | × 0.892179 |
| `dmYieldDensity` | kg/cm/ha | lbs/in/ac | reuse `DM_LBS_IN_AC_TO_KG_CM_HA` (one constant; see below) |

**`dmYieldDensity` — added 2026-05-04 for SP-13 Forage Types (V2_UX_FLOWS.md §20.8).** Stored as `kg of dry matter per cm of pasture height per hectare`; displayed as `lbs of DM per inch per acre` for imperial users. The forward factor `DM_LBS_IN_AC_TO_KG_CM_HA` already lives in `src/data/v1-migration.js` because the v1 → v2 migration stores in metric. `src/utils/units.js` reuses that one constant rather than redefining it (or lift it into `units.js` and re-export to `v1-migration.js` — pick whichever placement avoids duplication; one canonical constant only). The reverse factor for display is `1 / DM_LBS_IN_AC_TO_KG_CM_HA`.

**Round-trip contract:** entering `300` (imperial) for a forage type's DM yield must store the exact numeric value the v1 migration would produce for `dmLbsPerInchPerAcre = 300`, and re-rendering the field must display `300` again at precision 0. The same round-trip holds for any new family — `convert(toStore(toDisplay(x)))` and `convert(toDisplay(toStore(x)))` must both return `x` to the field's display precision. This is a required test case in `tests/unit/units.test.js` for every family.

**Adding a new family.** When a new measurement type lands in the schema:
1. Pick metric storage (per §1.1's hard rule).
2. Decide the imperial display unit and label (`unitLabel('familyName', 'imperial')`).
3. Add the family to `convert()` and `unitLabel()` in `src/utils/units.js` — one block per family, with a single conversion constant.
4. Add a row to the table above with stored unit, imperial display, and the constant.
5. Round-trip test in `tests/unit/units.test.js`.
6. Wire it into the unit-aware descriptor pattern (`src/features/settings/unit-descriptor.js`) so any input field using the descriptor automatically converts on render and on save without per-feature math.

The descriptor pattern (`{ measureType, unitLabelKey, … }`) is the canonical entry point for unit-aware form fields — Farm Settings, Forage Types, and any future settings card share it. Per V2_UX_FLOWS.md §20.8 (Forage Types), do not duplicate conversion logic in feature code; reuse the descriptor.

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

**Dead letters must not be silent (OI-0184).** A dead letter is a write that never reached Supabase — the most dangerous state in an offline-first app, because the local view still shows the change as saved. As built, `getDeadLetters()` / `retryDeadLetters()` exist in `src/data/custom-sync.js` but have **no consumers**: nothing surfaces the count and nothing retries automatically, so the only recovery is the manual "Push All" (`pushAllToSupabase`). Two contracts close the gap:

- **Auto-retry on reconnect.** On every successful `flush()` and on `online` / `visibilitychange→visible`, the dead-letter queue is drained back through the push path (bounded) before the adapter declares idle. A transient-failure record heals itself on the next good connection with no user action. "Push All" becomes the manual fallback, not the only recovery.
- **Surfaced, not green-masked.** The dead-letter count feeds the §9 sync indicator (`sync-failed`, red) and `getSyncHealth()` must never report green/idle while the dead-letter or pending queue is non-empty — a single later success cannot repaint green over a real backlog.

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
- `screen`: hash-to-screen mapped context (auto-populated), not a reconstructed raw route
- `version`: app build stamp (auto-populated)
- `area`: app area/domain the submission relates to (user-selected or inferred)
- Recent errors from logger (last 5, included in the submission for developer review)
- Sync status (idle/syncing/error/offline) and queue length available in the log viewer (§3.6)

### 4.2 submissions Table

**OI-0195 adoption (2026-11-08; implemented on Forgejo main as PR #38 on 2026-11-09, not live).** New shared-interview items go to this existing Feedback store (`submissions`), additively normalized as specified in `V2_SCHEMA_DESIGN.md` §11.2a. Capture the first note, build stamp and context before AI interpretation; require the normal Feedback/Get Help sheet populated for review and confirmation before filing (stored review card = evidence only). `version` remains the app build stamp, not `contractVersion`. Keep feedback/support purpose distinct from bug/request classification, and support urgency distinct from severity. Historical IDs/history remain; add missing fields with explicit unknowns now and ask only on reopening, without inventing classification or filing consent. How-to-only Get help stays in the same assistant with a matching doc link and no product filing. Feedback counts as handed off once the server has the `submissions` row (P10, 2026-11-09); filing destination comes from feedback-module `routeDestination`. The table below is the pre-adoption field inventory, not applied adoption DDL.

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
| Entity shape functions | Two tests per entity: (a) **local round-trip** — `fromSupabaseShape(toSupabaseShape(record))` === original, verifies key mapping; (b) **PostgREST pull** — feed a row whose `numeric`/`integer` columns are **strings** (simulating the live PostgREST response) through `fromSupabaseShape` and assert each result is `typeof === 'number'` (or `null`). The local round-trip alone does NOT catch stringified-numeric bugs because it routes through local objects that were never PostgREST-serialized. See V2_APP_ARCHITECTURE.md §3.1 for the coercion contract. Origin: OI-0106. |
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

## 8. Voice and AI Integration

> **Status (2026-11-09): HOST ADAPTER ON FORGEJO MAIN, NOT LIVE.** Merged as Forgejo PR #38, merge `eb04c197`. Migration 040 is not applied, the assistant is not enabled, and the GitHub publish is held until 040 is live. Shared contracts and released implementations exist. Physical host schema is in Domain 11; the populated-UI farm-tool method and first-slice write attachments are in §8.3a; the ready-for-build gate locks, go-live order and live unknowns are in §8.3b. Deferred items are listed in §8.4. Chief of Staff owns both shared contracts. GTHO is first host adopter, not module owner; reusable runtime/interview changes go back to Chief of Staff, not into GTHO-v2.

### 8.1 Product shape (locked 2026-11-08)

Tim locked these choices in the GTHO Design chat:

1. Voice/AI is a shared foundation piece first. Write-entry and ask-and-answer are later paths that use it.
2. Both paths are reached from one push-to-talk interface, not separate screens or buttons for writing versus asking.
3. A write still has an easy check: the normal entry UI populated for review, which the user can confirm or correct by voice (or text). Voice-first means less typing, not no review.
4. Ask-and-answer is in scope as capabilities grounded in authorized current data, not a hardcoded catalog of questions.
5. A shared module makes sense: one conversation runtime used by GTHO, not folding the general assistant into `feedback-module`. Spoken feedback should use that same assistant and the existing feedback interview contract, not a second inbox.
6. Incomplete, invalid, interrupted, or abandoned voice or text proposals are kept as recoverable exceptions so the user can intercept and complete them later. They live in a running voice-to-entry log that can be filtered easily to expose unfinished items. Finished items may remain in that log as history, but confirmed farm data still lives in the ordinary records. This log is not silent training or audit capture.
7. The push-to-talk control is prominent in field mode (mobile) and is also present on desktop. On desktop it is a floating, movable control that starts at the bottom center. It is one global control and the only voice entry: it routes writes, questions, feedback and how-to, and the Assistant sheet has no Talk button (Design ruling, 2026-11-09).
8. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. Do not promise offline AI parsing or answers; existing manual entry remains available. No on-device model is committed for launch. No extra permission prompt is shown for storing offline recordings on the user’s own device: record them as part of using voice while offline, with playback and delete still available before processing. An offline recording counts as processed, and can be deleted, only after the user confirms a write or filing from that note AND it has actually saved durably on the device. Confirmation alone is not enough. If the attempt is discarded without filing, the recording stays unless the user deletes it. The one-time testing-audio consent popup is separate and remains.
9. Tap once to start listening. The turn ends when the user says “over” or taps the control again (Design, Tim 👍 2026-11-09); brief pauses do not end it. This is bound as manual commit (`turn_detection` null, §8.3b T5), with a `server_vad` fallback behind config. Hold-to-talk is not the launch default and may be a later option.
10. The voice-to-entry log opens as a panel from the push-to-talk control. That control shows a count of unfinished items awaiting review.
11. Besides unfinished versus all, the log can be filtered by today and by write, question, feedback, or a separate how-to filter. Today uses capture time. Both the visible finished attempt history and the structured field-mapping/correction record stay 90 days from when the item is finished. Unfinished items stay until finished or discarded.
12. First-slice write surfaces are Move wizard, Place, feeding, treatment and Calving sheet; this is launch wiring, not an exhaustive scenario list. The assistant asks follow-up questions and prompts for required information to complete the entry, then populates the matching normal UI for review. Questions are capabilities grounded in authorized current records, not a hardcoded list. First-slice read coverage is reproductive evidence, open-set assessment/counts and paddock grazing history.

Chief of Staff owns the locked shared conversation-runtime and feedback-module interview contracts. GTHO Design owns farm questions, write flows, domain rules, GTHO schema, and the review of farm writes. Farm rules never move into the shared runtime.

### 8.2 Why the April 2026 sketch is superseded

The April text treated a one-shot cascade as architecture: browser Web Speech API → transcript → Supabase Edge Function → Claude Haiku → structured fields → confirm. It then planned silent training capture of every transcript, model output, and correction, and an on-device swap to a named small model (Phi-3.5-mini or Gemma 3 1B via WebLLM) behind a narrow `InferenceAdapter` (`parse` / `refine` / `getConfidence`), falling back to Haiku if confidence was below 0.7. Those choices are not current design:

- A farm assistant needs a live conversation that can write, ask, or take feedback — not only parse one utterance into a form.
- Vendor model names and on-device runtimes are not architecture. Do not lock Haiku, Phi, Gemma, WebLLM, or any other named model as the design. When a hosted provider is used in production, pin a **versioned** model so a floating alias cannot silently change behavior.
- A model-reported confidence score is not a safety gate. Validate tool arguments in app code, recheck a write proposal against current data, and require user confirmation.
- Silent training capture is not a launch phase. Storing transcripts or audio needs explicit consent, retention, deletion, and access rules first. Saving a draft for recovery is not permission to build a training set.
- `source: 'voice' | 'manual'` is too coarse once a user can speak and then correct by voice or text in one session. Do not treat that tag as an existing column.
- A guided-script library and an on-device model are later candidates, not prerequisites.
- The migration plan’s “Voice field mode (5 checkpoints)” never listed those checkpoints. Do not invent them.

Keep from April: the populated normal UI for review before a write commits; multi-turn correction of a proposal; a replaceable provider boundary so the app is not welded to one vendor API; all feature writes through the existing store and sync queue.

### 8.3 Current intended architecture

One shared conversation runtime (a sibling shared module with a locked contract) plus app-owned GTHO tools. The shared implementations are released separately from the GTHO host adapter (merged on Forgejo main as PR #38, 2026-11-09; not live).

| Shared module | GTHO release pin | Annotated tag peels to | Package version |
|---|---|---|---|
| `Homelab/feedback-module` | `v0.1.3` | `f70d0d7d83a0b56ffdcd2a28375b6f746863fecb` | `0.1.3` |
| `Homelab/conversation-runtime` | `v0.1.1` | `aea11f3cdb137a83f0aecaf38e2e60c9d1ba809a` | `0.1.1` |

These are the independently verified release targets for GTHO adoption; nothing auto-spreads. Older tags are unchanged and are **not** adoption pins: feedback-module `v0.1.2` → `f22b58af728594ee5c59edeb362b17467fe6e549`, `v0.1.1` → `eb7fc8010bf5173549db14382411c6386a7e09f2`, `v0.1.0` → `16a68aa94626eaa9f7f4b49754a6616cd0555af9`; conversation-runtime `v0.1.0` → `1a1d1e7b29680d724755f82384b475f1e4b6601f`.

The first backend deployment is a **Supabase Edge Function**. xAI is the current provider choice, behind an interchangeable provider boundary; a provider is not the architecture. The PWA imports the pinned feedback-module `src/index.js` exactly; its Node `createHash` (`sha256` / `update` / `digest('hex')`) is supplied only by host build configuration, a Vite alias of `node:crypto` to an `@noble/hashes` shim. Do not edit the vendor snapshot or reimplement `itemRevision`; if hashes cannot match, escalate to Chief of Staff for a separately pinned release. Both modules are held as in-repo vendor copies with per-file hashes in `vendor/pins.json`.

**Entry.** One push-to-talk control for write, ask, and spoken feedback. A text fallback must use the same intent, review, and confirmation rules — not a separate product. The control is prominent in field mode and is present on desktop as a floating, movable control that starts at the bottom center. It is the only voice entry; the Assistant sheet has no Talk button. Tap once to start listening. The turn ends when the user says “over” or taps the control again; brief pauses do not end it (manual commit, §8.3b T5). Hold-to-talk is not the launch default and may be a later option.

**Online voice (locked 2026-11-09).** Realtime voice only listens and speaks (P1). The server-side conversation runtime decides every turn through the Edge Function; realtime function tools are not the brain, and there is no shared-runtime change. xAI `wss://api.x.ai/v1/realtime` carries the audio. Browsers cannot attach an `Authorization` header to a WebSocket, so the client authenticates with a short-lived ephemeral token from the GTHO backend (`POST https://api.x.ai/v1/realtime/client_secrets`; binding in §8.3b T4). The long-lived provider key stays server-side and never ships in the PWA. An ephemeral token is not farm-data authorization: executors still check the signed-in user and operation membership. Models are pinned dated names, never aliases: text `grok-4.20-0309-non-reasoning` (P5) and voice `grok-voice-3.0` with voice Eve and reasoning `none` (P6). A model value containing `latest` is rejected.

**Tools and trust.** The model may propose function calls. GTHO executors validate arguments independently of the model, enforce operation membership, and recheck a write proposal against current data before commit. Farm-write tools produce proposals — not an unrestricted database or SQL interface. Read tools answer from authorized app data, not model memory, and must not mutate while answering. If a record is missing, say so; do not treat absence as a definitive negative. Do not hard-code a list of questions; the assistant interprets what was asked and requests clarification when needed. First-slice write attachments are specified in §8.3a. First-slice read capabilities cover reproductive evidence, open-set assessment/counts and paddock grazing history; these are not per-question scripts. Remaining-feed questions and any write path that mentions remaining feed must import `getLiveRemainingForMove` from `src/calcs/feed-state.js` rather than recompute it (`V2_CALCULATION_SPEC.md`). Treat transcripts, retrieved records, and model output as untrusted data.

**Capture and routing.** Capture the original input and first-capture context/build stamp before AI. Use the shared feedback interview for spoken feedback, filing to existing `submissions`, never a second inbox. How-to-only Get help remains in this assistant, with a matching documentation link and no product filing.

**Confirmation.** The assistant should ask follow-up questions and prompt for information required to complete an entry when something is missing or unclear. Show the matching normal entry UI populated before a farm write or feedback filing. The stored review card is revision-bound evidence only. Correction creates a new revision, invalidates prior confirmation for execution, and requires a new confirmation. The user can accept, correct by voice or text, or cancel. Switching intent must not commit an abandoned proposal or file feedback accidentally.

**Exceptions.** If a proposal is incomplete, fails validation, is interrupted, or the user walks away mid-review, keep it as a recoverable exception so they can pick it up and finish later. That is in addition to the in-the-moment review card. Discard remains available. These attempts live in a running voice-to-entry log that opens as a panel from the push-to-talk control. That control shows a count of unfinished items awaiting review. The log filters unfinished versus all, today by capture time, and write, question, feedback, or separate how-to. Both visible finished attempt history and structured field-mapping/correction records stay 90 days from finished time; unfinished items stay until finished or discarded. See Domain 11 §11.2a–b for the physical design. Discarded attempts remain until user deletion; the finished countdown never applies to them. Cleanup must not cascade into retained evidence, transcripts, testing audio, farm records or discarded offline audio.

**Offline.** The app is offline-first for farm data, but a hosted realtime voice session cannot transcribe or run while disconnected. Do not promise offline AI parsing or answers. Existing manual entry remains available. When voice is used while disconnected, the first release records an audio note rather than requiring a typed first note. That note is an unfinished item in the voice-to-entry log until it can be processed online. No extra permission prompt is shown for storing offline recordings on the user’s own device: record them as part of using voice while offline, with playback and delete still available before processing. An offline recording counts as processed, and can be deleted, only after the user confirms a write or filing from that note AND it has actually saved durably on the device. Confirmation alone is not enough. If the attempt is discarded without filing, the recording stays unless the user deletes it. The testing-audio consent popup is separate and remains. Discarding an unfinished log attempt does not itself process or delete its offline recording. Offline notes are stored in IndexedDB with a 3-minute cap per note, transcribed once online and reviewed before saving (P9, 2026-11-09). A note is deleted only after a confirmed write or filing saves locally. No on-device model is committed for launch. An on-device model remains a later candidate, not a prerequisite.

**Artifacts and testing.** Required concepts are normalized items, transcripts, review cards, voice-to-entry logs and structured mapping/correction provenance, testing audio, offline notes, and session drafts/checkpoints as applicable, not every artifact for every conversation. Keep spoken interview audio during early testing with a consent popup asked once per tester per operation (exact copy in §8.3b), then stop keeping new testing audio. Declining still allows voice, and no audio is kept for that tester (P7). Kept audio is the user’s mic only and goes to the private Supabase Storage bucket `assistant-testing-audio` via signed upload (P8). Decide disposal of collected testing audio at testing end. After testing keep transcript, review card and structured log without audio; finished log and field-mapping retention is still 90 days from finished time. Later-rollout consent waits until more users than Tim and a friend. The shared contract’s permanent mapping-record language is not reconciled by changing its CONTRACT here; Tim’s host retention lock is recorded explicitly.

**Schema.** Physical design is specified in `V2_SCHEMA_DESIGN.md` §11.2a–b: additive nullable submissions facts with child fact-state/repro-step tables and operation-scoped artifact tables. Implemented as migration `040_assistant_host_artifacts.sql` (on Forgejo main via PR #38, **not applied**; schema stamp stays 39 until Tim approves the apply). 040 also adds the server-authoritative session-lock and billing tables and the restore fence (`V2_SCHEMA_DESIGN.md` §11.2c). Audio storage is locked in §8.3b (P8, P9). The April transcript/training/script/confidence list is not the table design.

### 8.3a Host farm-tool method and launch wiring (locked 2026-11-08)

**Method, not scenario scripts.** Match intent to an existing entry UI; use that UI’s actual required and optional fields as prompts; ask for anything it still needs; show that same UI populated; then save only through the existing entity `validate()` and existing write path after confirmation. Do not create a parallel questionnaire, utterance catalog, per-question script or brittle how-to for each item. New write kinds later attach by this same method. First-slice wiring names the write surfaces available at launch, not every scenario a user can ask about.

**Review = the populated UI.** Feedback/Get Help uses its existing sheet; farm writes use their matching sheet/wizard. “Review card” means revision-bound stored evidence of what was shown and confirmed, not another voice-only form. Correction updates those same fields, creates a new proposal revision, invalidates prior confirmation for execution, and requires new confirmation. Cancellation or an intent switch cannot confirm an abandoned revision.

| First-slice write surface | Existing field-set and save contract |
|---|---|
| Move wizard | Full-event, scoped+remaining and scoped+last per `V2_UX_FLOWS.md` §1. Include existing feed-transfer and post-graze observation follow-ups whenever the wizard would show them. Zero-write conflict preflight per OI-0185/0186; recheck current windows before commit. Remaining-feed figures MUST use `getLiveRemainingForMove` from `src/calcs/feed-state.js`, never recompute them. |
| Place mode | Existing sibling UI when a group has no current placement, §1.8; same populated-UI confirmation and existing save path. |
| Feeding | Existing `event_feed_entries`: required operationId, eventId, batchId, locationId (receiving paddock), date and positive quantity. Time and other existing destination/source fields are optional. If multiple paddock windows are open, use the UI’s required receiving-paddock selection prompt. No invented batch/inventory writes. |
| Treatment | Existing `animal_treatments`: required operationId, animalId, treatedAt. Optional treatmentTypeId, product, doseAmount, doseUnitId, withdrawalDate, notes. Resolve the named animal and treatment without guessing medicine or dose. |
| Calving sheet | Existing §14.7 / live `src/features/health/calving.js`; entity-required operationId, damId, calvedAt. Sheet includes sex (defaults female), tag, class, group, birth weight, sire, stillbirth, dried-off date and notes. Dried-off stays optional despite older dairy-required schema prose. Live calf-creation guard is `!stillbirthCheck.checked || calfTagInput.value.trim()`; older stillbirth prose is not a new rule. Existing calf creation when applicable, optional weight with source='calving', group membership, calving record and optional A27 heifer→cow prompt remain. Every path creating a calving row must also explicitly clear the dam’s confirmedBred (implemented; see Domain definitions). |

**Dates.** A spoken date without a time uses the matching UI’s own date/time default. The current Calving sheet uses `new Date(dateInput.value + 'T12:00:00Z')`. Device-local calendar dates remain per OI-0189; do not invent a universal voice timestamp.

**Read capabilities, not a list of questions.** Interpret what was asked using authorized current app data and the real UI/entity contracts; clarify when unsure. First-slice reads cover named-animal reproductive evidence, the open-animal set/count, and paddock last-grazed evidence. These name capabilities, not example phrases or an exhaustive scenario list. Missing evidence is not a definitive negative; reading never mutates records.

**Domain definitions (Tim, 2026-11-08).** Open means an active (not culled) female in a cow or heifer class with `confirmed_bred === false`; do not count calves. Named-animal assessment and counts use the same definition; males, calves and inactive/culled animals are not open cows. The stored checkbox is NOT NULL DEFAULT false and written by Edit Animal (OI-0099), so unchecked alone was insufficient to define this set. No separate confirmed-open column. Recording a birth must automatically set the dam’s `confirmed_bred` / `confirmedBred` to false on every path creating an `animal_calving_records` row, including the normal sheet, voice using that save, and calf-to-dam linking. Done: the live Calving save and calving-sync clear it (`src/features/health/calving.js`, `src/features/animals/calving-sync.js`; verified in the PR #38 review).

**Familiarization and testing.** Runtime grounding is in live UI/entity contracts plus user corrections at populated-UI review. Early testing retains audio only with the locked testing-audio popup decision (once per tester per operation). This is not silent training capture and not a promise to fine-tune on farm conversations; no new ML training pipeline is specified.

### 8.3b Ready-for-build gate locks after PR #12 (2026-11-09)

Tim said “ok yes lets complete the rest of design” (via Orchestrator, 2026-11-09 4:41 AM ET). Design ran the ready-for-build gate (Homelab/project-framework `598b5c7b`, AGENTS.md:71-75), brought the product choices to Tim in Design chat, and locked or deferred every in-scope item below. The host adapter was then implemented by GTHO Build and merged on Forgejo as PR #38, merge `eb04c1973b4621d728f2a9ec760aa70b259f10f8` (tree equals reviewed head `72fd678`). Locks are Tim’s unless marked Design. These locks supersede any older text in this brief that conflicts with them.

#### Earlier post-PR-#12 locks

- **Install / createHash.** The PWA supplies a browser implementation of Node `createHash` (`sha256` / `update` / `digest('hex')`) through host build configuration only: a Vite alias of `node:crypto` to an `@noble/hashes` shim. The PWA then imports pinned feedback-module v0.1.3 `src/index.js` exactly. Do not edit the vendor snapshot or reimplement `itemRevision`. If hashes cannot match, escalate to Chief of Staff for a separately pinned release.
- **Pins.** feedback-module `v0.1.3` (`f70d0d7d`, item contract `0.1.2`) and conversation-runtime `v0.1.1` (`aea11f3c`), held as in-repo vendor copies with per-file hashes in `vendor/pins.json`.
- **Backup exception (testing scope).** Browser CP-55/CP-56 backup and restore exclude seven server-authoritative tables plus `assistant_restore_fences`. The seven are `assistant_session_checkpoints`, `assistant_execution_results`, `assistant_session_locks`, `assistant_billing_policies`, `assistant_billing_reservations`, `assistant_billing_usage` and `assistant_billing_settlements`. CP-55/CP-56 is therefore not complete assistant recovery. The backend-authorized backup/recovery path is deferred.
- **Restore fence.** A membership-checked SECURITY DEFINER probe and fence: prepare, finish and abort. It reveals only whether the operation has rows in those tables, and it holds a durable fence so new protected rows cannot appear during a restore. No GRANT loosening, no `service_role` in the PWA, no row contents, no expiry or takeover. A restore that would conflict with retained server authority is refused before anything destructive happens.
- **Billing.** No blanket billing-policy seed; the policy row is created on the first reserve. Caps are 30 requests per 10 minutes, 2000 requests per month and 600 audio minutes per month, stored as policy parameters (unchanged by P12).

#### Tim’s gate locks (2026-11-09)

- **P1.** Realtime voice only listens and speaks. The server-side conversation runtime decides. No shared-runtime change.
- **P2.** Testing runs on the live app (production project, real data), limited to our operations, with review before every save.
- **P3.** An operation allowlist Tim controls (secret `GTHO_ASSISTANT_OPERATIONS`). Operations not on it get 403 before any reserve, and the control stays hidden.
- **P4.** One voice session is capped at 10 minutes.
- **P5.** The text model is `grok-4.20-0309-non-reasoning`, kept as a setting/secret (`GTHO_XAI_TEXT_MODEL`). Switch to a dated reasoning model if data answers fall short. App code computes data answers; the model does not.
- **P6.** Voice is `grok-voice-3.0` with voice Eve, reasoning `none`.
- **P7.** Declining testing-audio consent still allows voice, and no audio is kept for that tester.
- **P8.** Kept testing audio goes to the private Supabase Storage bucket `assistant-testing-audio` via signed upload.
- **P9.** Offline voice notes ship now: stored in IndexedDB, 3-minute cap per note, transcribed once online and reviewed before saving. A note is deleted only after a confirmed write or filing saves locally.
- **P10.** Feedback counts as handed off once the server has the `submissions` row.
- **P11.** Tim personally approves applying migration 040 live, creates the xAI key, and flips the enable flag.
- **P12.** The central usage view is for Tim only (`GTHO_BILLING_CONTROL_USERS`). Caps unchanged.
- **Unknown usage after an xAI timeout or failure.** The assistant stays usable, because unknown usage does not block reserve. The request still counts once against request caps, nothing is recorded as zero, and the usage is listed as unreconciled for later server-side reconciliation. A failure before any provider fetch is a measured zero (Design).

#### Design-filled items (Tim 👍)

- Tapping the control again also ends a voice turn, the same as saying “over”.
- Consent popup copy, exact: “During early testing, GTHO can keep recordings of what you say to the assistant so we can improve it. Keep my recordings? You can still use voice if you say no.” Buttons: “Keep recordings” / “Don't keep”. It is asked once per tester per operation.

#### Design technical bindings

- **T1.** Client-apply handshake through the GTHO-owned `gtho-assistant-apply` endpoint: `execute` throws `client-apply-pending`; the browser applies through the existing save path and reports the local save; a re-confirm replays the stored outcome.
- **T2.** `maxReadRounds` 3, `maxBodyBytes` 65536.
- **T3.** 25 s provider timeout via `AbortSignal.any` combined with `request.signal`. It covers the whole request.
- **T4.** Voice token from xAI `client_secrets`: 60 s lifetime; `validateLifetime` rejects anything over 120 s; `expiresAt` is in ms; WebSocket subprotocol `xai-client-secret.<token>`; 3 connection attempts, 5 s apart; `?model=` fallback if `session` is not accepted.
- **T5.** `turn_detection` null with manual commit (tap or “over”). A `server_vad` fallback sits behind config.
- **T6.** Voice settles the worst case (the 10-minute cap) at token issue, and later client usage reports are refused.
- **T7.** JWT auth via `auth.getUser`. The operation is the user’s only membership, or the `X-GTHO-Operation` header checked against membership. Never the request body.
- **T8.** CORS: OPTIONS returns 204, with origins from `GTHO_ASSISTANT_ORIGINS`. The unconfigured 503 and OPTIONS responses also carry CORS.
- **T9.** One pinned Postgres driver on `SUPABASE_DB_URL`.
- **T10.** `getAll` runs server-side for backend reads and validation; the browser re-validates at apply.
- **T11.** Per-intent context. `routeDestination` decides feedback filing, and `matchingDoc` returns `undefined`.
- **T12.** `earlyTesting` comes from a secret, and the client writes the consent row.
- **T13.** Eight secrets: `XAI_API_KEY`, `GTHO_XAI_TEXT_MODEL`, `GTHO_XAI_VOICE_MODEL`, `GTHO_ASSISTANT_ENABLED`, `GTHO_ASSISTANT_OPERATIONS`, `GTHO_ASSISTANT_EARLY_TESTING`, `GTHO_ASSISTANT_ORIGINS` and `GTHO_BILLING_CONTROL_USERS`. Every function serves 503 unless all are present and `ENABLED=true`; a model value containing `latest` is rejected. The PWA flag is `VITE_GTHO_ASSISTANT=1`, and a flag-off build ships no assistant feature or feedback-module code. The Supabase CLI is pinned.

#### Design rulings

- **Push-to-talk.** One global push-to-talk routes writes, questions, feedback and how-to. It is the only voice entry; the Assistant sheet has no Talk button.
- **Matching** is exact after deterministic normalization, including spoken numbers to digits. No fuzzy matching.
- **Moves** follow the existing UI launch semantics.
- **Fallback question** is a host event, kept out of the model transcript and stored device-local. No 040 amendment.
- **Field hints** are derived from the sheet field definitions.
- **`voice_entry_attempts` lifecycle.** A row is created when an utterance starts an entry; `captured_at` is the capture or recording time. A reroute updates `purpose` on the same row, and the reroute replay is marked with a host event. The row becomes finished (with `finished_at`) when a write or feedback item saves locally, or when a question or how-to is answered; the 90-day expiry runs from `finished_at`. A user discard sets discarded, with no expiry. Log filters: Today (operation timezone), Write, Question, Feedback, How-to, Unfinished, All, plus the unfinished badge.
- **Retry chains, ruling (a).** The badge and the Unfinished filter count only the newest non-discarded attempt in a retry chain. Finishing a retry finishes its unfinished predecessors with the same `finished_at`. Discarding the retry makes its predecessor count again.
- **Ruling (b).** The replay turn being duplicated in the vendor runtime transcript is a reusable gap, raised with Chief of Staff. No library change.
- **Ruling (c).** The device-local preview fallback is accepted.
- **Calving** save clears Confirmed bred on the dam. Done: implemented in the live Calving save and calving-sync (`src/features/health/calving.js`, `src/features/animals/calving-sync.js`), verified in the PR #38 review.

#### Deferred (the slice ships without these)

- The scheduled 90-day cleanup runner (the callable cleanup RPC ships; lock a cadence before the first expiry).
- Billing UI (own-usage and central views); the backend commands ship.
- Operation-owned billing; shared routing ships.
- Get-help doc links; how-to answers ship with no link and no filing.
- xAI usage reconciliation; the worst-case voice settlement and the unreconciled list ship.
- Bot pickup of filed feedback; filing to `submissions` ships.
- Testing-audio disposal at testing end.
- Later-rollout consent.
- The backend-authorized backup/recovery path for the excluded server tables.

#### Open live unknowns (verify at smoke time)

- Whether `client_secrets` accepts `session` (T4 falls back to `?model=`).
- Whether input transcription streams with `turn_detection` null (T5).
- The realtime transcription model name `grok-transcribe` (`src/features/assistant/client/realtime.js:60`).
- Reusing the token across connection retries (T4).
- The operation timezone is set; otherwise reserve fails with `billing-calendar-timezone-required` (migration 040 :902).
- The Supabase plan wall clock (150 s Free vs 400 s Paid).
- The pooler behind `SUPABASE_DB_URL` (T9).
- Supabase CLI bundling of `../../../vendor` imports.

#### Go-live order and approvals

1. Tim approves applying migration 040 to the live project (schema 39 → 40). GTHO Build applies and verifies it.
2. Secrets. Tim creates `XAI_API_KEY`; the other seven are set with `GTHO_ASSISTANT_ENABLED` not yet `true`.
3. GTHO Build deploys the functions with the pinned Supabase CLI.
4. Smoke tests, including the open live unknowns above.
5. Tim flips `GTHO_ASSISTANT_ENABLED=true`.
6. The PWA lands (flag-on build). The GitHub publish needs Tim’s separate approval. Publishing `main` to GitHub before 040 is live would break backup and restore.

State at this docs pass: PR #38 is merged on Forgejo `main`. Orchestrator reports Tim set `XAI_API_KEY` (reported, not verified by Design). The other seven secrets are not set. Migration 040 is not applied. The GitHub publish is held until 040 is live.

#### Accepted nits (non-blocking follow-ups)

- A turn with several provider calls counts as more than one request against the monthly cap.
- `acknowledged_handoff` is determined only at apply time; a `submissions` row that reaches the server later does not upgrade the outcome.
- After a successful provider call, a later failure lists the turn in the unreconciled view (noise in that view).

### 8.4 Still open (deferred, non-blocking)

The testing slice ships without these; each is listed with what still ships in §8.3b “Deferred”:

- Scheduled 90-day cleanup runner.
- Billing UI.
- Operation-owned billing.
- Get-help doc links.
- xAI usage reconciliation.
- Bot pickup of filed feedback.
- Disposal of already-collected testing audio at testing end.
- Later-rollout consent, to be decided when there are more users than Tim and a friend.
- Backend-authorized backup/recovery path for the excluded server-authoritative tables.

Spec: `session_briefs/SESSION_BRIEF_2026-11-08_oi-0195-voice-ai-foundation.md`.

---

## 9. Sync Indicator (Honest Push + Pull State)

The sync dot in the header (V2_DESIGN_SYSTEM.md §3.14) and the desktop sidebar's sync strip (V2_UX_FLOWS.md §17.2) report **both push-queue and pull-recency state**. A single "is the queue empty?" boolean is dishonest — it can read green while the local app is showing data that's hours stale because no remote pull ran.

**Two-axis state model:**

- **Push queue.** Read from `getSyncAdapter().getStatus().pendingCount`. Empty = nothing waiting to upload. Non-empty = at least one record queued (failed write, offline interval, or in-flight retry).
- **Last-pull timestamp.** Read from `getLastPulledAt()` in `src/data/pull-remote.js`. The timestamp is set after every successful `pullAllRemote()` cycle and persisted to localStorage so it survives reload. `null` means no pull has ever completed in this device session.

**Indicator state derivation:**

| Indicator | Push queue | Last pull | Meaning |
|---|---|---|---|
| `sync-ok` (green) | Empty | Within 15 min (the stale threshold) | Local state matches remote both ways |
| `sync-stale` (amber) | Empty | Older than 15 min, or `null` | Nothing pending to upload, but local view may be stale |
| `sync-pending` (amber) | Non-empty | Any | Push queue has work; not yet known if local view is fresh |
| `sync-off` (`--text3`) | — | — | Offline (`navigator.onLine === false`) |
| `sync-failed` (red) | — | — | Dead-letter queue non-empty (OI-0184) — N writes never reached the server. Shows the count; tap runs `retryDeadLetters()` + `flush()`. Takes precedence over green/amber. |
| `sync-err` (red) | — | — | Sync adapter reported an unrecoverable error |

**Failed-write axis (OI-0184).** Green requires push queue empty AND dead-letter queue empty AND pull fresh. The indicator reads dead-letter count via `getDeadLetters().length` (or `getSyncHealth()`); a non-empty dead-letter queue forces `sync-failed` regardless of the push/pull axes, so a silently-dropped correction can never hide behind a green dot. See §3.5.

The 15-minute stale threshold is a balance between honesty and noise — short enough to surface a forgotten cold-boot (the user's been on the app for an hour without ever pulling), long enough to avoid amber flicker during normal background pulls. Tunable; lives as a constant in `src/data/pull-remote.js`.

**Tap behavior — `pullAllRemote()`, not navigate-to-Settings.** Tapping the sync dot or the desktop sidebar's sync strip triggers an explicit `pullAllRemote()` call. The previous behavior was `navigate('#/settings')` which sent the user to a screen with no sync controls and effectively asked them to give up on what they'd come for. The honest action when a user taps the sync indicator is *"pull now"* — they're telling the app they don't trust the freshness state. The dot transitions to a brief in-flight animation, the pull runs, and the dot resolves to its post-pull state.

**Visibility-change pull trigger.** On `document.visibilitychange` to `visible` (the user backgrounded the app and came back), the app fires `pullAllRemote()` automatically without waiting for the user to tap. This catches the common case where a tab sat in the background while real-world updates landed elsewhere — by the time the user looks, freshness has already been re-established. The visibility-change handler also re-renders the sync indicator so its post-pull state is correct on the very first paint after the tab regains focus.

**Why this matters.** A single-axis indicator silently lies. The user sees green and assumes "I'm up to date" when in fact the device hasn't pulled in 6 hours and other team members have logged events the user can't see. The two-axis indicator forces the lie to surface: amber says *"queue's empty but I haven't checked the server lately — tap me to refresh."* That's honest and one tap from resolution.

**Origin:** OI-0141 (filed and shipped 2026-05-01). The grep contracts for the dot/strip onClick (`grep "navigate('#/settings')" src/ui/header.js` must return zero) live in CLAUDE.md "Architecture Audit." This subsection is the design statement of why those contracts exist; `getLastPulledAt()` is the canonical reader for pull-recency state and any new sync-indicator surface must consume it rather than only checking the queue.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-11-09 | OI-0195 — ready-for-build gate locks | Host adapter merged on Forgejo as PR #38 (`eb04c197`); not live. New §8.3b records the post-PR-#12 locks: createHash via Vite alias, pins, backup exception and restore fence, billing caps, Tim’s P1–P12, unknown-usage handling, consent copy, T1–T13, Design rulings (single global push-to-talk, exact matching, attempt lifecycle, retry chains), deferred list, live unknowns and go-live order. §8.1/§8.3 updated to match: turn ends on “over” or a second tap (manual commit, not pause-tolerant VAD); realtime is voice I/O only; dated text/voice model pins; testing audio in a private bucket; offline notes in IndexedDB; calving dam clear implemented. |
| 2026-11-08 | OI-0195 — final host locks | Physical host schema, populated-UI review and field-set method specified; first-slice attachments are launch wiring, not question scripts. Open set excludes calves; birth clears dam confirmed_bred. Runtime familiarization is not fine-tuning. Unimplemented/not handed to Build; testing-end audio disposal and later-rollout consent deferred/non-blocking. |
| 2026-11-08 | OI-0195 — host adoption | Recorded released pins, existing-store additive mapping, capture-before-AI/review-before-filing, locked how-to routing, Edge Function first backend and replaceable provider. Updated offline consent/deletion and log filters/timing/90-day mapping retention; testing rules and remaining physical/tool design gaps. Not ready for Build; no implementation. |
| 2026-11-08 | OI-0195 — step-through locks | Spoken stop phrase is “over.” Desktop floating control starts at bottom center. Voice-to-entry log opens as a panel from push-to-talk, which shows a count of unfinished items. Extra filters: today, and write vs question vs feedback. Finished items stay 90 days. First-slice writes: events including moves, feeding, and animal records, with follow-up prompts for required fields. Questions are capabilities, not a hardcoded list; first slice includes open-cow and last-grazed questions. Offline recordings: ask once before storing; playback and delete before processing; delete the recording after it is processed. |
| 2026-11-08 | OI-0195 — tap-to-start listening | Tap once to start listening. Voice-activity detection should tolerate brief pauses rather than cutting off at the first silence. A designated spoken stop phrase also ends the turn; the exact phrase is not locked. Hold-to-talk is not the launch default and may be a later option. |
| 2026-11-08 | OI-0195 — offline audio notes | When voice is used while disconnected, record an audio note and process it when back online. The note is an unfinished voice-to-entry log item until then. No offline AI parsing or answers. No on-device model for launch. Storage, consent, playback/delete, and retention remain open. |
| 2026-11-08 | OI-0195 — voice-to-entry log | The exception inbox is a running voice-to-entry log that can be filtered easily to expose unfinished items. Finished items may remain as history; confirmed farm data still lives in ordinary records. Chrome placement, extra filters, columns, retention, and schema remain open. |
| 2026-11-08 | OI-0195 — exceptions and PTT placement | Locked recoverable exceptions (incomplete, invalid, interrupted, or abandoned proposals stay available to finish later). Locked push-to-talk as prominent in field mode and as a floating, movable control on desktop. Inbox location, retention, schema, and exact desktop dock position remain open. |
| 2026-11-08 | OI-0195 — voice/AI review | Rewrote §8. Retired the April three-phase Haiku / silent-training / on-device roadmap. Current design: shared conversation runtime plus GTHO farm tools; one push-to-talk; review card; realtime speech-to-speech with ephemeral tokens as current practice; no offline AI promise; confidence is not a safety gate. Not a build target. |
| 2026-04-12 | Session 6 — Infrastructure review | §3.1: Added A9/A10 exception references. §3.3: Aligned app_logs to schema (+operation_id nullable, +context jsonb, RLS by user_id). §3.4–3.5: Added A10 refs, dead letter context structure. §4.1–4.2: Aligned submissions to schema, added A25 ref. §5.1: Fixed RLS to use operation_members, added user-scoped example. §8: Added roadmap scope note. |
| 2026-04-18 | OI-0106 base-doc reconciliation | §6.1: Expanded entity shape-function test pattern from a single local round-trip to two tests: (a) local round-trip for key mapping, (b) PostgREST pull simulation with stringified numerics asserting `typeof === 'number'`. The local round-trip alone does not catch the PostgREST-string class of bugs that drove the OI-0106 sweep. Cross-references V2_APP_ARCHITECTURE.md §3.1. |
| 2026-05-04 | Reconciliation Session C — infra catch-up (RECONCILIATION_PLAN_2026-05-03 INFRA-1, INFRA-2) | Two infrastructure catch-ups. **NEW §1.4 Unit Families (INFRA-1):** documents the named-family pattern that `convert()` and `unitLabel()` already use, with the seven current families in a table including the new **`dmYieldDensity`** family added 2026-05-04 for SP-13 Forage Types (V2_UX_FLOWS.md §20.8) — stored `kg/cm/ha`, displayed `lbs/in/ac`, conversion via the existing `DM_LBS_IN_AC_TO_KG_CM_HA` constant in `src/data/v1-migration.js` (one canonical constant; do not duplicate). Round-trip contract documented (entering `300` imperial must store the v1-migration equivalent and re-render `300`). Six-step "adding a new family" checklist captures the descriptor-pattern wiring so a new measurement type can't ship with feature-code unit math. Cross-reference to `src/features/settings/unit-descriptor.js` as the canonical entry point for unit-aware form fields. **NEW §9 Sync Indicator (INFRA-2):** lifts the OI-0141 "honest sync indicator" pattern from CLAUDE.md grep contracts into the infrastructure doc as the design-level statement. Two-axis state (push queue + last-pull timestamp), 5-state indicator table (`sync-ok` / `sync-stale` / `sync-pending` / `sync-off` / `sync-err`) with the 15-min stale threshold; tap = `pullAllRemote()`, NOT `navigate('#/settings')`; visibility-change auto-pull on `document.visibilitychange → visible` so freshness is re-established before the user even taps; the architectural reason the previous single-axis indicator silently lied. Cross-references the `getLastPulledAt()` canonical reader and the V2_APP_ARCHITECTURE.md §4.6 Derive-on-Read doctrine. No code changes — documentation catch-up only. Owner: Cowork. |

---

*End of document. For data schemas see V2_SCHEMA_DESIGN.md. For code patterns see V2_APP_ARCHITECTURE.md. For formulas see V2_CALCULATION_SPEC.md. For UX flows see V2_UX_FLOWS.md.*
