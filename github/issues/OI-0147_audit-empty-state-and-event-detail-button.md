# OI-0147 — Audit empty-state picker fix + Audit button on event-detail header

**Priority:** P3 (audit page is reachable via direct hash entry once empty-state copy is honest; today's empty-state UX is broken but workable for a sole dev user. Affects discoverability for any future dev user toggled on via `is_dev`.)
**Origin:** Full design + acceptance criteria in `OPEN_ITEMS.md` → OI-0147. This file is a thin pointer per the "specs in base docs, not spec files" project rule.
**Labels:** `bug`, `dev-tools`, `audit`, `event-detail`, `v2-build`
**Status:** **DESIGN LOCKED** — 2026-05-02 session, ready for Claude Code.

## Summary

Two related bugs surfaced when Tim landed on `#/dev/audit` without an event id:

1. **Empty-state picker missing.** `src/features/dev-mode/audit.js:82` wraps the prev/next buttons + event picker in `if (event) { ... }`. With no event selected, the dropdown the empty-state copy refers to literally doesn't render. Fix: move the picker construction outside the `if (event)` block, guard `evt.id === event?.id` with optional chaining, add a placeholder first option, and render a "no events for this operation yet" note when `events.length === 0`.

2. **No Audit button on event detail.** Empty-state copy promises "open via the Audit button on an event detail page" but grep of `src/features/events` returns 0 matches for `audit|Audit|#/dev/audit`. Fix: add a small `btn btn-outline btn-xs` Audit button to the event-detail sheet header (`renderHeader` at `src/features/events/detail.js:196`), gated by `isCurrentUserDev(operationId)`, navigating to `#/dev/audit?id=<event.id>`.

Full design — exact behaviour, copy, testids, unit-test coverage, and acceptance criteria — lives in `OPEN_ITEMS.md` → OI-0147.

## What ships

- `src/features/dev-mode/audit.js` — `renderAuditHeader` reorganized so the picker renders in both states; placeholder first option added; "no events" note when none exist.
- `src/features/events/detail.js` — `renderHeader` extended with a gated Audit button leftmost in the right-side action cluster.
- New unit tests covering: empty-state picker render, "no events" note, gated Audit button visibility, navigation URL.

## Files (anticipated)

- `src/features/dev-mode/audit.js` — picker fix
- `src/features/events/detail.js` — Audit button add
- `src/features/dev-mode/__tests__/audit.test.js` (or co-located) — empty-state picker tests
- `src/features/events/__tests__/detail.test.js` (or co-located) — Audit button gating tests
- `src/i18n/locales/en.json` — new key `event.detailAuditButton`. Existing `dev.auditPickEvent` copy can stay if both fixes land.

No schema files. No entity files. No other feature code.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE.**

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0147 → "Acceptance criteria" — full list, do not duplicate here. Highlights:

- Picker renders in audit empty state when `events.length > 0`; "no events" note renders when 0.
- Selecting an event from the empty-state picker navigates to `#/dev/audit?id=<uuid>` and renders the full audit page.
- Audit button on event-detail sheet renders only when `isCurrentUserDev(operationId)` is true.
- Audit button navigates to `#/dev/audit?id=<event.id>` on click.
- OPEN_ITEMS.md OI-0147 flipped to closed in same commit (orphan-flip rule).
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed with commit hash.

## Project rules to apply

- **CLAUDE.md §"No innerHTML"** — all dynamic content via `el()` / `text()` / `clear()`.
- **CLAUDE.md §"No hardcoded English"** — all user-facing strings via `t()`.
- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.

## Not in scope

- Dev Mode shelf doorway from Settings or main header — that's OI-0146, sibling OI; can ship in the same Claude Code session or independently.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0147 in full before starting (canonical design).
- [ ] Implement per design.
- [ ] Full test suite green (`npx vitest run`).
- [ ] Manual visual verification: open `#/dev/audit` (no id) → see picker → select event → audit renders. Open event detail sheet with `is_dev = true` → see Audit button → tap → audit opens.
- [ ] OPEN_ITEMS.md OI-0147 flipped to closed in the same commit.
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
