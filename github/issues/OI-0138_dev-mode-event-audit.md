# OI-0138 — Dev Mode surface (3-tool MVP): Event Audit walk-through + Error log viewer + Schema/migration readout

**Priority:** P2 (high-leverage testing capability — collapses every silent-drift class from minutes-to-find instead of days; not blocking field testing but compounds across every future bug)
**Origin:** Full diagnosis + locked design in `OPEN_ITEMS.md` → OI-0138. **This file is a thin actionable pointer; the canonical spec is the OI body.**
**Companion OI:** OI-0142 (deferred per-calc `explain()` refactor — do NOT touch calc files in this build).
**Labels:** `feature`, `dev-tools`, `testing`, `schema`, `member-management`, `v2-build`
**Status:** DESIGN LOCKED 2026-05-01, ready to build.

## Summary

Build an in-app diagnostic shelf — "Dev Mode" — gated to operation members flagged with `is_dev = true`. The shelf hosts three read-only tools for the MVP:

1. **Event Audit walk-through** — per-event (or linked-pair) page showing event header + child-record tables + calc cards (with input-source trace + output) + DMI bars + store↔Supabase diff panel. Reuses live store + calc registry + DMI bar renderer; no duplicated logic.
2. **Error log viewer** — query `app_logs` with filters by severity, category, operation_id, date range; CSV export.
3. **Schema/migration readout** — three numbers side-by-side (`operations.schema_version` from store, max `BACKUP_MIGRATIONS` rule key, max migration file number on disk) with a red flag if they disagree.

Owners and admins of an operation manage Dev Mode access through the existing member-management UI (a "Dev Mode access" toggle on each member row). Bootstrap is a one-line SQL to flag Tim on his operation; after that, the in-app toggle takes over.

## Source of truth

All design rationale, alternatives considered, and the seven sub-question lock-ins are in `OPEN_ITEMS.md` → **OI-0138**. Read that body before starting; this file is intentionally compact.

## Locked decisions (one-line summary; full reasoning in OI-0138 body)

| # | Decision |
|---|---|
| Q1 | 3-tool MVP: Event Audit + Error log viewer + Schema/migration readout. Other 4 shelf tools deferred. |
| Q2 | `/dev` home route + contextual "Audit this event" button on event-detail and sub-move-detail when Dev Mode is on. |
| Q3 | `is_dev boolean` column on `operation_members` (NOT a standalone `dev_users` table). Member-mgmt UI toggle, owners/admins only. |
| Q4 | Desktop-first layout, mobile is fallback. |
| Q5 | Auto-detect linked pair via `source_event_id`; banner with click-to-expand. |
| Q5b | Audit page has its own header with prev/next chronological cycling + Pick-event picker + cycle-axis filter dropdown. |
| Q6 | Option 1 — sidecar audit-code resolvers in `src/features/dev-mode/audit-resolvers.js` (~7 for MVP). Zero touches on existing calc files. OI-0142 captures the eventual `explain()` refactor. |

## Build phases & order

Sequential. Don't jump ahead; each phase establishes infrastructure for the next.

1. **Migration + bootstrap** — schema change, SQL applied + verified, Tim flagged.
2. **Entity + store helper** — `operation_members` entity gains `is_dev`; `isCurrentUserDev(operationId)` helper added to store.
3. **Gate check + `/dev` route + shell** — router entry, dev-mode-on check, empty shelf page that lists the three tools.
4. **Member-management UI toggle** — "Dev Mode access" switch on each member row, owners/admins only.
5. **Event Audit page** — full audit walk-through view (the headline tool).
6. **Error log viewer** — `app_logs` filterable list + CSV export.
7. **Schema/migration readout** — three-number panel.

Commit after each phase. Don't bundle. Each commit must reference `OI-0138` and the phase number.

---

## Phase 1 — Migration + bootstrap

### SQL migration

File: `supabase/migrations/NNN_dev_mode_is_dev_column.sql` (NNN = next free number; check disk + bump from there).

```sql
-- OI-0138: Dev Mode access flag per operation member.
ALTER TABLE operation_members
  ADD COLUMN is_dev boolean NOT NULL DEFAULT false;

-- Schema version stamp (per CLAUDE.md Code Quality Check #6).
UPDATE operations SET schema_version = N;  -- N = next bump
```

### Execute + verify (per CLAUDE.md Migration Execution Rule)

1. Write the migration file.
2. Execute against Supabase via MCP.
3. Verify:
   ```sql
   SELECT column_name, data_type, column_default
     FROM information_schema.columns
    WHERE table_name = 'operation_members' AND column_name = 'is_dev';
   -- expect: is_dev | boolean | false
   SELECT schema_version FROM operations LIMIT 1;
   -- expect: N
   ```
4. Bootstrap Tim:
   ```sql
   UPDATE operation_members
      SET is_dev = true
    WHERE user_id = '<tim-user-id>'
      AND operation_id = 'ef11ee62-b720-4f0c-848a-18e1dd93de30';
   ```
   *(Spec author resolves Tim's `user_id` from `auth.users` before running.)*
5. Commit message includes: "Migration NNN applied and verified; is_dev column live; Tim flagged on operation ef11ee62."

### `BACKUP_MIGRATIONS` rule

Add to `src/data/backup-migrations.js`:

```js
[N - 1]: (b) => { b.schema_version = N; return b; },  // OI-0138 — is_dev column add (no transform needed, default false applies on insert)
```

### Acceptance criteria — Phase 1

- [ ] Migration file written and applied to Supabase.
- [ ] Verification queries return expected results.
- [ ] Tim's row on operation `ef11ee62` has `is_dev = true`.
- [ ] `BACKUP_MIGRATIONS` rule added.
- [ ] Commit message follows the "applied and verified" pattern.

---

## Phase 2 — Entity + store helper

### `src/entities/operation-member.js`

Add `is_dev` to:

- `FIELDS` — type `boolean`, default `false`.
- `validate()` — accept boolean; reject non-boolean.
- `toSupabaseShape()` — map `isDev` → `is_dev`.
- `fromSupabaseShape()` — map `is_dev` → `isDev`. Coerce defensively (`row.is_dev === true` to be safe).

### `src/data/store.js`

Add helper:

```js
export function isCurrentUserDev(operationId) {
  const userId = getCurrentUserId();
  if (!userId || !operationId) return false;
  const member = getAll('operationMembers').find(
    m => m.userId === userId && m.operationId === operationId
  );
  return member?.isDev === true;
}
```

Export it from store. Cache the boolean per-render is fine; no need for memoization across renders.

### Acceptance criteria — Phase 2

- [ ] Entity round-trip test: `fromSupabaseShape(toSupabaseShape({ ..., isDev: true }))` returns object with `isDev: true`.
- [ ] Validate rejects `isDev: 'true'` (string), accepts `isDev: true`/`false`/`undefined` (defaults to false on create).
- [ ] `isCurrentUserDev(operationId)` returns `true` for Tim on ef11ee62 in dev/test fixture; returns `false` for other users.
- [ ] No existing entity round-trip tests break.

---

## Phase 3 — Gate check + `/dev` route + shell

### Router

`src/ui/router.js` — add `/dev` route. Guard:

```js
if (!isCurrentUserDev(getActiveOperationId())) {
  navigate('#/');  // silently redirect home if not a dev
  return;
}
renderDevHome();
```

### `/dev` home page

`src/features/dev-mode/index.js` (new file). Renders a simple list of the three tools with click handlers:

- "Event Audit" → navigates to `/dev/audit` (no event ID → empty state with picker)
- "Error log" → navigates to `/dev/logs`
- "Schema readout" → navigates to `/dev/schema`

Use the DOM builder (`el`, `text`, `clear`); no `innerHTML`. All strings via `t()`.

### Shell chrome

Each Dev Mode page gets a small "DEV MODE" badge in the page header so it's unambiguous which surface you're on. Use `--color-warning` or similar token from V2_DESIGN_SYSTEM.md.

### Acceptance criteria — Phase 3

- [ ] `/dev` route renders the three-tool list when `isCurrentUserDev` returns true.
- [ ] Non-dev users hitting `/dev` directly are redirected to `/`.
- [ ] Page chrome shows "DEV MODE" badge.
- [ ] All strings localized via `t()`.

---

## Phase 4 — Member-management UI toggle

### Where it lives

Find the existing member-management surface (likely `src/features/settings/operation-members/` or similar — confirm path before editing). Each member row gets one new control.

### Toggle UX

- **Control:** switch or checkbox labeled "Dev Mode access".
- **Visibility:** rendered only when `isCurrentUserOwnerOrAdmin(operationId)` returns true. (If that helper doesn't exist, add one alongside `isCurrentUserDev`.)
- **State:** reflects the member's current `isDev` value.
- **On toggle:** calls `store.update('operationMembers', memberId, { isDev: !current.isDev }, validate, toSupabase, 'operation_members')` — full 6-param call per CLAUDE.md Code Quality Check #7.
- **Self-toggle:** owner can grant/revoke their own. Admin can grant/revoke for non-owner members. Member view sees the chip if on, but no toggle.
- **Visual cue when on:** small "DEV" chip next to the role chip in the member-list row, regardless of viewer role.
- **RLS:** existing operation_members policies (granular per OI-0054) should already permit this UPDATE for owners/admins. Verify; do not add new policies.

### Acceptance criteria — Phase 4

- [ ] Toggle renders for owners and admins only.
- [ ] Flipping the toggle updates `operation_members.is_dev` in localStorage AND syncs to Supabase (verify via direct query, per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI").
- [ ] Non-admin viewers see the "DEV" chip but no toggle control.
- [ ] If RLS rejects an UPDATE, the UI shows a friendly error and the toggle reverts to its prior state.
- [ ] e2e: as Tim (owner), flip another member's `isDev`, verify the row's `is_dev` in Supabase is updated within sync latency.

---

## Phase 5 — Event Audit page

### Route

`/dev/audit` — empty state with event picker.
`/dev/audit/:eventId` — full audit page for that event.

### Layout (desktop-first)

Seven sections, top to bottom (full description in OI-0138 body):

1. **Audit header strip (sticky):** event ID + type + farm + operation + prev/next arrows + Pick-event picker + cycle-axis filter dropdown.
2. **Event header strip:** `source_event_id`, derived start/end, close date. Linked-pair banner with "Audit as pair" buttons. Stored↔derived drift chips.
3. **Timeline ribbon:** chronological dots for the lifecycle.
4. **Child record tables:** paddock_windows / group_windows / feed_entries / feed_checks / feed_check_items / observations. Expandable rows show raw JSON.
5. **Calc cards (hero):** one per surfaced calc. Inputs with source-record-and-field trace + gate status + output. 2-column grid on desktop.
6. **DMI bar chart:** dashboard renderer reused for the event's window.
7. **Store ↔ Supabase diff panel:** raw row pull from Supabase per entity, red-highlight any field where store and remote disagree.

### Linked-pair mode

Triggered by clicking "Audit as pair" in the linked banner. Renders two events side-by-side (true two-column on desktop) with a handoff panel between showing paddock-close vs. paddock-open and group-leave vs. group-join alignment. Mismatches red-chipped.

### Calc resolver — sidecar (Q6 = Option 1)

New file: `src/features/dev-mode/audit-resolvers.js`. One resolver per calc the audit surfaces. MVP set: **DMI-2, DMI-3, DMI-8, FOR-1, days-on-pasture, cost, NPK residual.**

Resolver signature:

```js
export function resolveDmi2Inputs(eventId, groupWindowId) {
  // Pull each input from the store/derived helpers.
  // Return { inputs: [{ name, value, source }], output: <computed> }
  // `source` is a string like "eventGroupWindows.<id>.head_count (live)"
  // or "animalClasses.<id>.dmi_pct".
  // Run the calc with the resolved inputs to produce output.
}
```

**Important:** resolvers MUST NOT duplicate calc formula logic. They resolve inputs, then call `getCalcByName('DMI-2').fn(inputs)` to produce the output. The audit must show what the calc actually returns, never a re-implementation.

A single `resolveCalcForCalcCard(calcName, context)` dispatcher in audit-resolvers.js maps calc name → resolver function. New calcs can be added later by extending the dispatch table.

### Acceptance criteria — Phase 5

- [ ] `/dev/audit/:eventId` renders all seven sections for any valid event ID.
- [ ] Stored↔derived drift chips show red on at least one synthetic test case (e.g., a fixture where stored `events.date_in` disagrees with `getEventStart` — though after OI-0117 this column is dropped, so the test fixture targets a different drift class).
- [ ] Calc cards display every input with source annotation and the output value matches what the dashboard / event detail shows for the same calc on the same event.
- [ ] DMI bar chart renders identical to the dashboard for the same event window (visual diff or pixel-snapshot test).
- [ ] Store↔Supabase diff panel correctly red-highlights fields when a synthetic mismatch is injected (e.g., test override of one field).
- [ ] Linked-pair mode renders side-by-side correctly for events with `source_event_id`. Handoff panel computed correctly.
- [ ] Prev/next cycling walks chronological order across the operation's events.
- [ ] Pick-event picker accepts event ID string or partial date and jumps.
- [ ] Cycle-axis filter (group / paddock / all) re-anchors prev/next.
- [ ] No `innerHTML` with dynamic content. All strings via `t()`. No `console.error` (use `logger.error`).

---

## Phase 6 — Error log viewer

### Route

`/dev/logs`.

### Layout

Filter row at top:
- Severity (error / warn / info / debug — multiselect)
- Category (multiselect from distinct values in `app_logs.category`)
- Operation ID (defaults to active operation)
- Date range (from / to)
- Search text (substring match on `message` + `context`)

Below: virtualized list of log rows. Each row shows: timestamp, severity badge, category, message preview. Click expands to show full `context` JSON.

CSV export button: downloads currently-filtered rows as `app_logs_<date>.csv`.

### Pagination / load

App likely doesn't have a server-side paged log query yet. For MVP, query the last 1000 rows by timestamp desc and filter client-side. Note as a follow-up if log volume grows beyond that.

### Acceptance criteria — Phase 6

- [ ] All filters work and combine correctly.
- [ ] Click-to-expand reveals full context object.
- [ ] CSV export contains the currently-filtered rows in correct order.
- [ ] Empty state when no rows match.
- [ ] No `console.error`.

---

## Phase 7 — Schema/migration readout

### Route

`/dev/schema`.

### Layout

Three panels side-by-side (stacked on phone):

1. **Live store schema_version** — read `operations.schemaVersion` for the active operation.
2. **Backup migrations max key** — `Math.max(...Object.keys(BACKUP_MIGRATIONS).map(Number))` from `src/data/backup-migrations.js`.
3. **Migration files max number** — fetched at build time via Vite import-meta-glob over `supabase/migrations/*.sql`, parsed for the leading number.

If all three agree: green "All in sync" banner with the version number.
If any disagree: red "Drift detected" banner with the three numbers and one of:
- "Schema version is N, but migration file NNN exists — was the migration run?"
- "Migration file NNN exists, but no `BACKUP_MIGRATIONS` rule for [N - 1] — Code Quality Check #6 violated."
- etc.

### Acceptance criteria — Phase 7

- [ ] Page reads all three numbers and shows them.
- [ ] All-in-sync state shows green.
- [ ] Synthetic drift in any of the three values produces the red banner with a useful diagnostic.

---

## Tests (cross-phase)

- **Unit:** entity round-trip for `operation-member.js` with `isDev` field; `isCurrentUserDev()` returns expected for fixtures.
- **Unit:** every audit resolver tested for: known fixture event with all inputs present (full output + sources), event with missing data (gate fired, source reads null with annotation).
- **Unit:** schema-readout drift detection cases (all three values match → green; one mismatch → red with right message).
- **e2e:** Tim (owner) flips Dev Mode access on another member; assert `is_dev = true` in Supabase.
- **e2e:** non-dev user navigating to `/dev` is redirected; dev user sees the shelf.
- **e2e:** open `/dev/audit/:eventId` for a real seeded event; assert calc card output matches dashboard calc output for the same event.

## Grep contracts (run before commit, all must pass)

```bash
# Audit resolvers must run actual calc, not re-implement formulas:
grep -rn "registerCalc\|fn:\s*function\|fn:\s*(" src/features/dev-mode/audit-resolvers.js
# expect: 0 matches (no calc registration or local formula definitions)

# Audit resolvers must call calc registry:
grep -n "getCalcByName\|registry" src/features/dev-mode/audit-resolvers.js
# expect: ≥1 match

# Dev Mode gate must be checked in router:
grep -n "isCurrentUserDev" src/ui/router.js
# expect: ≥1 match

# Member toggle uses 6-param update:
grep -n "store.update.\?'operationMembers'" src/features/settings/
# expect: every call site has 6 args (entityType, id, changes, validateFn, toSupabaseFn, table)

# No innerHTML in dev-mode features:
grep -rn "innerHTML\s*=" src/features/dev-mode/
# expect: 0 matches
```

## CP-55/CP-56 spec impact

Per CLAUDE.md Export/Import Spec Sync Rule:

| Change | CP-55 export | CP-56 import |
|---|---|---|
| `operation_members.is_dev` (new boolean column) | Serialize the field. | Map missing field → `false` for pre-bump backups (column default applies on read). Round-trip test required for the new field. |
| `schema_version` bump | `schema_version` stamp in backup JSON ticks to the new version. | Migration chain covers the new version (the no-op `BACKUP_MIGRATIONS[N - 1]` rule handles it). |
| No new tables | — | — |

CP-55 and CP-56 specs (when those exist) should be updated as part of this build to reflect the new field.

## What this build deliberately does NOT include

- The four deferred shelf tools (Sync queue inspector, Manual calc trigger, Store snapshot export, Force-resync). Open follow-on OIs only when a specific need arises.
- Per-calc `explain()` refactor (OI-0142 territory). Resolvers stay sidecar-only.
- Realtime log streaming (`app_logs` viewer is filter-and-load, not subscribe).
- Dev Mode access management via REST API or Supabase function. UI toggle only; bootstrap is direct SQL.

## Implementation notes

- **Spec file numbering:** when this issue is filed, rename to `GH-{N}_OI-0138_dev-mode-event-audit.md` per CLAUDE.md spec file handoff rule. `gh issue create --title "OI-0138 — Dev Mode (3-tool MVP)" --body "$(cat github/issues/OI-0138_dev-mode-event-audit.md)" --label "feature,dev-tools,v2-build"`.
- **Don't widen scope.** If during implementation you find a calc that should be surfaced but isn't in the MVP-7 list, note it in OPEN_ITEMS.md as a follow-on; don't add it to this build.
- **Don't touch calc files.** Resolvers are sidecar (Q6 lock). Touching calcs is OI-0142 territory.
- **Member-management UI:** if OI-0124 has shipped, splice into the existing edit affordance. If OI-0124 is still open, write the toggle as a self-contained row control that won't conflict when OI-0124 lands. Spec author greps OI-0124 status before deciding.
