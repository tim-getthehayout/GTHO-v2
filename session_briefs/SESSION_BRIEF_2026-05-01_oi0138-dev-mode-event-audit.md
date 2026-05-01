# Session Brief — OI-0138 Dev Mode (3-tool MVP)

**Date:** 2026-05-01
**Owner:** Claude Code
**Spec:** `github/issues/OI-0138_dev-mode-event-audit.md` (canonical) + `OPEN_ITEMS.md` → OI-0138 (full design rationale)
**Companion:** OI-0142 (deferred per-calc `explain()` refactor — explicitly out of scope for this build)
**Scope size:** 7 implementation phases, ~5–8 commits, one schema migration, one new entity field, one new feature folder (`src/features/dev-mode/`).

## What's being built (one paragraph)

A gated in-app diagnostic shelf called Dev Mode, accessible only to operation members flagged with `is_dev = true`. The shelf hosts three tools: an Event Audit walk-through page (the headline value — collapses every silent-drift bug class from days-to-find to minutes), an Error log viewer over `app_logs`, and a Schema/migration readout that flags drift between the live schema_version, BACKUP_MIGRATIONS, and migration files on disk. Owners and admins manage Dev Mode access through the existing member-management UI (a toggle on each member row).

## Implementation order (phase-gated, sequential)

1. Migration + bootstrap (schema change applied + verified + Tim flagged)
2. Entity + store helper (`operation_members.is_dev`, `isCurrentUserDev()`)
3. Gate check + `/dev` route + shell (router entry, dev-mode-on guard, three-tool list)
4. Member-management UI toggle ("Dev Mode access" switch on each member row)
5. Event Audit page (full audit walk-through view)
6. Error log viewer
7. Schema/migration readout

Commit after each phase. Don't bundle. Each commit message references `OI-0138` and the phase number (e.g. `feat(dev-mode): OI-0138 phase 1 — is_dev migration applied and verified`).

## Critical guardrails (from CLAUDE.md + the spec)

1. **Migration Execution Rule.** Migration MUST be applied + verified in the same session. Phase 1 commit message must end with: "Migration NNN applied and verified; is_dev column live; Tim flagged on operation ef11ee62."
2. **Code Quality Check #6.** Migration adds `BACKUP_MIGRATIONS[N - 1]` no-op rule. If the migration adds a table or FK, V2_MIGRATION_PLAN.md §5.3 / §5.3a get updated (this one's a column add — neither needed, but verify).
3. **Code Quality Check #7.** Member toggle calls `store.update('operationMembers', memberId, { isDev: !current.isDev }, validate, toSupabase, 'operation_members')` — full 6 params. Do NOT shortcut.
4. **No calc-file touches.** OI-0142 explicitly captures the future per-calc `explain()` refactor. This build's calc-card resolvers are sidecar-only in `src/features/dev-mode/audit-resolvers.js`. Resolvers MUST call `getCalcByName(name).fn(...)` for the output, not re-implement formulas.
5. **No `innerHTML` with dynamic content.** DOM builder only.
6. **No `console.error`.** Use `logger.error(category, message, context)`.
7. **All user-facing strings via `t()`.** No hardcoded English.
8. **e2e verifies Supabase, not just UI** (per CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI"). After any toggle write, query Supabase to confirm `is_dev` value.
9. **CP-55/CP-56 spec impact.** `is_dev` is on a backed-up table (`operation_members`); CP-55 export adds the field, CP-56 import maps missing → false. Update the CP-55/CP-56 specs in this build.

## OPEN_ITEMS changes

None pending — OI-0138's status was already flipped to "DESIGN LOCKED 2026-05-01, ready for Claude Code spec write-up" in commit `1e86b46`. After the spec issue is filed and the file renamed to `GH-{N}_OI-0138_...`, update OI-0138's body to reference the GH number. After Phase 7 ships, flip OI-0138 status to closed with the commit hash, and per CLAUDE.md OPEN_ITEMS Closure Discipline:

- **Piggyback rule:** grep OPEN_ITEMS.md for sibling OIs that this build resolves. Likely candidates: any OI that mentions "diagnostics," "audit view," "dev tools," or "schema readout." Flip their status if applicable.
- **Orphan-flip:** the closing commit MUST touch OPEN_ITEMS.md (status line edit). The post-commit grep contract:
  ```
  git log -1 --format=%B | grep -E 'OI-0138' && \
  git diff-tree --no-commit-id --name-only -r HEAD | grep OPEN_ITEMS.md
  ```
  must succeed.

## Spec-file handoff steps (Phase 0, before Phase 1)

The spec file currently lives at `github/issues/OI-0138_dev-mode-event-audit.md` (no `GH-` prefix → unfiled). Per CLAUDE.md "Spec File Handoff (from Cowork)":

```bash
gh issue create \
  --title "OI-0138 — Dev Mode (3-tool MVP)" \
  --body "$(cat github/issues/OI-0138_dev-mode-event-audit.md)" \
  --label "feature,dev-tools,testing,schema,member-management,v2-build"
# Note the issue number returned, then:
git mv github/issues/OI-0138_dev-mode-event-audit.md github/issues/GH-{N}_OI-0138_dev-mode-event-audit.md
git commit -m "spec(OI-0138): file as GH-{N} for Dev Mode 3-tool MVP"
```

## Tim's environment / known facts

- **Tim's operation_id:** `ef11ee62-b720-4f0c-848a-18e1dd93de30` (canonical reference seen in OI-0134, OI-0137, OI-0138).
- **Tim's user_id:** resolve from `auth.users` where the row is owner of operation `ef11ee62`. Take that uuid for the bootstrap SQL.
- **`auth.users` schema:** Supabase auth-managed; you can read it via the Supabase MCP `execute_sql`.
- **OI-0124 status:** unknown to this brief. Spec author greps OPEN_ITEMS.md → OI-0124 before writing the member-row toggle to coordinate with any in-flight member-management UI changes.

## Tests (cross-phase summary)

- Unit: entity round-trip, `isCurrentUserDev()` fixture, every audit resolver, schema-readout drift detection.
- e2e: owner flips dev access on another member → assert Supabase `is_dev = true`. Non-dev redirected from `/dev`. Audit page renders; calc card output matches dashboard.

## Grep contracts (run before each commit)

```bash
# Audit resolvers don't re-implement formulas:
grep -rn "registerCalc\|fn:\s*function\|fn:\s*(" src/features/dev-mode/audit-resolvers.js   # 0 matches
grep -n "getCalcByName" src/features/dev-mode/audit-resolvers.js                             # ≥1 match

# Dev gate:
grep -n "isCurrentUserDev" src/ui/router.js                                                  # ≥1 match

# 6-param store.update for the toggle:
grep -n "store.update.\?'operationMembers'" src/features/settings/                           # every call has 6 args

# No innerHTML in dev-mode features:
grep -rn "innerHTML\s*=" src/features/dev-mode/                                              # 0 matches
```

## Out of scope for this build

- Sync queue inspector, Manual calc trigger, Store snapshot export, Force-resync (deferred shelf tools — open follow-on OIs only when needed).
- Per-calc `explain()` refactor — that's OI-0142's territory.
- Realtime `app_logs` streaming.
- Dev Mode access via API / Supabase function — UI toggle only.

## Definition of done

- Tim can: open the app on his phone or desktop, navigate to `/dev`, see the three-tool list, click into Event Audit, pick or land on an event, see all seven sections render correctly, click "Audit as pair" on a chained event and see the handoff panel, switch tools to Error log viewer and CSV-export filtered logs, switch to Schema readout and see the green "All in sync" banner.
- A non-dev user navigating to `/dev` is silently redirected.
- Owner can flip another member's `is_dev` from member-management UI; Supabase reflects the change within sync latency.
- All grep contracts pass. All unit + e2e tests pass. PROJECT_CHANGELOG.md has rows for each phase commit. OI-0138 status flipped to closed with all 7 phase commit hashes referenced.
