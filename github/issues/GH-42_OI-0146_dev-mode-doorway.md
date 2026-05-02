# OI-0146 — Dev Mode shelf doorway: Settings → "Dev tools" link + small `[DEV]` chip in main header (both gated by `is_dev`); navigates to `#/dev`

**Priority:** P3 (Dev Mode shelf at `#/dev` already exists per OI-0138 with three working tools, but no UI doorway leads there — users must type the hash manually. Affects discoverability for every dev user toggled on via `is_dev`; Tim is the sole dev user today, so not field-blocking.)
**Origin:** Full design + acceptance criteria in `OPEN_ITEMS.md` → OI-0146. This file is a thin pointer per the "specs in base docs, not spec files" project rule.
**Labels:** `feature`, `dev-tools`, `settings`, `header`, `nav`, `v2-build`
**Status:** **DESIGN LOCKED** — both doorway designs approved by Tim 2026-05-02.

## Summary

Two doorways into the Dev Mode shelf at `#/dev`, both gated by `isCurrentUserDev(operationId)` (already exported from `src/data/store.js:290`):

- **Doorway A** — "Dev tools" link in Settings → Tools section. Conventional, discoverable, hunting-for-tools mental model.
- **Doorway B** — Small `[DEV]` chip in the main app header, immediately left of the sync indicator. Always-visible-while-debugging mental model.

Both navigate to `#/dev`. Reuse `renderDevModeBadge()` from `src/features/dev-mode/index.js:19` for the header chip styling so there's no drift.

Full design — exact placement, copy, testids, accessibility requirements, unit-test coverage, and acceptance criteria — lives in `OPEN_ITEMS.md` → OI-0146.

## What ships

- `src/features/settings/tools-section.js` — gated "Dev tools" button rendered for dev members only.
- `src/ui/header.js` — gated `[DEV]` chip rendered for dev members only, immediately left of the sync indicator. Reuses `renderDevModeBadge()`.
- New i18n keys: `settings.devToolsButtonLabel`, `settings.devToolsHelperText`.
- New unit tests: gating works in both directions, both navigate to `#/dev`, header re-renders when `is_dev` flips via member-management.

## Files (anticipated)

- `src/features/settings/tools-section.js` — extend with the gated link
- `src/ui/header.js` — extend with the gated chip
- `src/features/settings/__tests__/tools-section.test.js` (or co-located)
- `src/ui/__tests__/header.test.js` (or co-located)
- `src/i18n/locales/en.json` — new keys

No schema files. No entity files. No other feature code.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE.**

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0146 → "Acceptance criteria" — full list, do not duplicate here. Highlights:

- Both doorways render only when `isCurrentUserDev(operationId)` is true.
- Both navigate to `#/dev` on click.
- Header chip reuses `renderDevModeBadge()` (no duplicated styling).
- Header re-renders when `is_dev` flips via member-management (test seam).
- Tap target on the header chip is minimum 32×32 px.
- OPEN_ITEMS.md OI-0146 flipped to closed in same commit (orphan-flip rule).
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed with commit hash.

## Project rules to apply

- **CLAUDE.md §"No innerHTML"** — all dynamic content via `el()` / `text()` / `clear()`.
- **CLAUDE.md §"No hardcoded English"** — all user-facing strings via `t()`.
- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit.
- **Project rule:** dev-mode surfaces are desktop-only — but `[DEV]` chip in the main header should still tap correctly on mobile (it's the doorway, not the destination).

## Not in scope

- Audit empty-state picker fix + event-detail Audit button — that's OI-0147, sibling OI; can ship in the same Claude Code session or independently.
- New dev-mode tools beyond the existing Event Audit / Logs / Schema set.
- `is_dev` flag toggling UI changes (already shipped under OI-0138 in member-management).

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0146 in full before starting (canonical design).
- [ ] Implement per design. Reuse `renderDevModeBadge()` rather than re-styling.
- [ ] Full test suite green (`npx vitest run`).
- [ ] Manual visual verification with `is_dev = true` and `is_dev = false`.
- [ ] OPEN_ITEMS.md OI-0146 flipped to closed in the same commit.
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
