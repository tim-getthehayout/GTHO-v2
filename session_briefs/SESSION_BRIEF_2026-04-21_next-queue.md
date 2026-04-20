# SESSION BRIEF — Next Queue (2026-04-21)

**Goal:** pick up GTHO-v2 after the 2026-04-20 reconciliation + rule-integration day. Items below are grouped by readiness so you (or Claude Code) can pull the next batch without re-auditing.

---

## Read this section first

Before starting any work, confirm the repo state from yesterday is clean:

1. `git log origin/main -5 --oneline` should include:
   - The IMPROVEMENT #16 + CLAUDE.md "OPEN_ITEMS.md Closure Discipline" commit (Cowork, 2026-04-20)
   - The IMPROVEMENT #15 + PROJECT_CHANGELOG batch (Claude Code, 2026-04-20)
   - `65fc3b8` OI-0119 DMI-8 cascade rewrite (2026-04-20)
   - The OI-0113 drop-event_observations commit (2026-04-20)
2. `schema_version` in Supabase should be **29** (last bump was migration 029 dropping `event_observations`).
3. No uncommitted files in the repo. `git status` clean.

If any of the above is off, stop and triage before picking up new work.

---

## Ready to implement — specs written, handed off

### OI-0118 — Edit Paddock Window dialog: pre/post-graze observation cards (P1)

**Spec:** `github/issues/edit-paddock-window-observation-cards.md`

**Why it's P1:** Event Detail §5 filters to `!pw.dateClosed` (`detail.js:624-625`), so once a paddock window is closed, its pre-graze card disappears from §5 forever. No other surface lets a farmer correct a historical pre-graze on a closed sub-move. This dialog becomes the single place to edit historical pre-graze.

**Design decision (Tim, 2026-04-20):** Option 1 — pre-graze always renders (open + closed); post-graze renders only on closed. Full lifecycle coverage.

**Small-surface work:**
- Add imports for `renderPreGrazeCard`, `renderPostGrazeCard`, `PaddockObsEntity`, `add`, `convert`
- Two new panel sections (pre-graze always; post-graze in `if (isClosed)`)
- Each card gets its own inline Save button matching `detail.js` §5/§6's transient "Saved" indicator pattern
- Saves to `paddock_observations` with `source: 'event'`, `sourceId: pw.id`, `type: 'open'` / `'close'`
- Lookup pattern mirrors detail.js `(sourceId === pw.id || most-recent fallback)`
- BRC late-bind not required — `pw.locationId` is known at dialog open time

**Tests:** 6 unit cases + 1 Supabase-round-trip e2e per CLAUDE.md §E2E.

**Impact:** no schema change; no CP-55/CP-56 impact.

### OI-0120 — Edit member info (display name, email, role) (P1)

**Spec:** `github/issues/edit-member-info.md`

**Why it's P1:** CP-66 shipped invite + claim + role-change + remove, but never included an edit path for captured `display_name` / `email` after row creation. Typo in an invite's email is unfixable without Cancel → start over (which invalidates any link already copied to a draft message). Once a member accepts, no UI exists to fix display_name or email — the email-based fallback claim silently breaks on primary-email drift.

**Scope (Tim, 2026-04-20):**
- **Pending invite** in-place edit of display_name + email + role
- **Accepted member** edit of display_name + email (role edit stays on existing `renderRoleSelect` — single-tap inline remains)
- **Owner + admin** permission gate matching existing CP-66 pattern
- **Owner row + self row** excluded (matches existing role-change guardrails)

**Verification step required during implementation:** confirm whether `(operation_id, email)` UNIQUE constraint exists on `operation_members`. If yes, surface constraint error. If no, client-side collision check.

**Files:**
- `src/features/settings/member-management.js` — single `showEditForm` function handles both pending + accepted via `opts.isPending` branch
- `src/i18n/i18n.js` — six new strings
- New unit test `tests/unit/member-management-edit.test.js` — 6 cases (pending happy path, accepted happy path, empty-name validation, bad-email validation, owner/self no-edit-button, email collision)
- New e2e `tests/e2e/member-edit.spec.js` per CLAUDE.md §E2E — admin edits pending invite email, query Supabase to verify new value

**Impact:** no schema change (both columns exist on `operation_members`); no CP-55/CP-56 impact.

### Suggested batch order

OI-0118 and OI-0120 are independent (different features, different files), both fully spec'd, both no-schema-change, both single-session size. Ship them in order — 0118 first because it lands in the observation stack that was just unified (best to keep all the OI-0112 → OI-0117 → OI-0119 → OI-0118 work in sequence while the patterns are fresh).

---

## Verify in browser, then close

### GH-24 — OI-0114 observation-boxes polish

Shipped in commits `095d76e` (NC-1, sub-move Open BRC auto-fill) and `a9ffbd4` (NC-2 through NC-7, top-row baseline + label typography + amber Required pill + input-suffix wrapper + dead-classname cleanup).

**What to verify on device:**
1. Sub-move Open → pick a location → ring-count input in the pre-graze card now auto-computes Cover %
2. Top row (Forage Height / Cover / Residual) aligns on a shared baseline across all observation surfaces
3. Labels are 13px/500 muted with 10px/400 auxiliary sub-labels, not default `<div>` typography
4. No native number spinners visible on Cover / any numeric field
5. "Required" pill is amber, not red
6. No dead `.paddock-card` className on pre-graze containers

After browser sign-off: `gh issue close 24 --comment "Verified in browser 2026-04-21. All NC-1 through NC-7 pass."`

---

## Genuinely open — not yet spec'd

| OI | Priority | What's needed | File pointer |
|---|---|---|---|
| OI-0057 | P2 | `animal_classes` NRCS defaults still null at `v1-migration.js:273-275`. Needs a seed-data decision (which classes, which NRCS values, Metric/Imperial). | `src/data/v1-migration.js:273-275` |
| OI-0070 | P2 | EST-1 accuracy report. Unblocked by OI-0119 DMI-8 rewrite. Now produces correct actual + estimated splits; ready for field-test design. | spec'd but not implemented |
| OI-0079 | P2 | Pasture survey picker. Has picker sheet but no farm/type filter pills. Spec session needed. | `src/features/field-mode/index.js:170-195` |
| OI-0092 | P2 | Residual feed NPK stub. Needs a spec session to decide the calc shape. | stub only |
| OI-0008 | P3 | Location picker "Recovering" section. Paddock observations are live (OI-0112); wire the read for recovery-status determination. | `src/features/events/index.js:719-721` |
| OI-0020 | P3 | Calc reference console move. Intentionally deferred — pull when ready. | deferred |

---

## Design-required (blocked on Tim)

- **OI-0062**, **OI-0065**, **OI-0098**, **OI-0102** — each tagged `DESIGN REQUIRED, do not build` with specific questions in OPEN_ITEMS.md. A 15-minute triage pass would unblock several and move them into the "Ready to implement" column.

## Deferred on purpose

OI-0036, OI-0042, OI-0077 — no action unless something changes upstream.

---

## Sprint-level housekeeping

**UI sprint still active** — `UI_SPRINT_SPEC.md` tracks SP-1 through SP-12. Per CLAUDE.md §"Active Sprint," spec files in `github/issues/` are still full specs during the sprint; reconciliation session will fold sprint decisions into `V2_UX_FLOWS.md` / `V2_DESIGN_SYSTEM.md` and convert full specs into thin pointers.

Not blocking any build work — but worth a 30-minute pass once OI-0118 + OI-0120 ship to catch any drift between sprint decisions and base docs.

---

## OPEN_ITEMS changes

None from this brief. This is a pickup document, not a new work order. The next session's Cowork pass will add OI-specific change-log rows as each item progresses.

---

## Suggested first action next session

Open OI-0118's spec (`github/issues/edit-paddock-window-observation-cards.md`), confirm it's still current (no drift since 2026-04-20), then implement. Batch with OI-0120 if time permits.
