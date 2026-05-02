# OI-0148 — `commit-msg` git hook to enforce the orphan-flip rule (CLAUDE.md §"OPEN_ITEMS.md Closure Discipline" rule 2)

**Priority:** P2 (the orphan-flip rule has failed at code-ship time three times in two days — OI-0145, OI-0146, OI-0147, all recovered by Cowork session-resume sweeps. Documentation in CLAUDE.md is provably insufficient.)
**Origin:** Full design + acceptance criteria in `OPEN_ITEMS.md` → OI-0148. This file is a thin pointer per the "specs in base docs, not spec files" project rule.
**Labels:** `tooling`, `git`, `project-infrastructure`, `v2-build`
**Status:** **DESIGN LOCKED** — 2026-05-02 session, ready for Claude Code.

## Summary

Add a `commit-msg` git hook at `.githooks/commit-msg` that fails the commit when the message contains `OI-[0-9]+` but `git diff --cached --name-only` does NOT include `OPEN_ITEMS.md`. Activation is one-time per clone via `git config core.hooksPath .githooks`. Standard `git commit --no-verify` bypass is preserved for the rare case where an OI is mentioned in a message without being closed (historical context references, etc.).

The exact behaviour matrix, error-message text, edge-case handling, and full acceptance criteria live in `OPEN_ITEMS.md` → OI-0148.

## What ships

- `.githooks/commit-msg` — new executable shell script implementing the predicate.
- `.githooks/test/commit-msg.test.sh` — new test script covering the four behaviour-matrix cases plus `--no-verify` bypass.
- `CLAUDE.md` — "Git Workflow" section extended with a one-line setup step: *"After cloning, run `git config core.hooksPath .githooks` once to activate the orphan-flip enforcement hook."*
- `package.json` — new `test:hooks` script wired into `npm test` so CI catches hook regressions.

## Files (anticipated)

- `.githooks/commit-msg` — new shell script, executable
- `.githooks/test/commit-msg.test.sh` — new test script, executable
- `CLAUDE.md` — extend Git Workflow section
- `package.json` — add `test:hooks` script

No source-code files. No schema. No entity changes.

## Schema change

**NONE.**

## CP-55/CP-56 impact

**NONE.**

## Acceptance criteria

See `OPEN_ITEMS.md` → OI-0148 → "Acceptance criteria" — full list, do not duplicate here. Highlights:

- Hook fails on the right matrix cell (OI ref + no `OPEN_ITEMS.md` staged), passes on the other three.
- Error message names every OI reference it found, cites the CLAUDE.md rule, mentions `--no-verify`.
- Setup step added to CLAUDE.md.
- Test script wired into `npm test` so CI catches regressions.
- **Self-validation:** the commit that introduces the hook is its own first user — the message references OI-0148, so OPEN_ITEMS.md must be staged in the same commit (which it is, because the hook flips OI-0148 to closed). Circular but correct.
- OPEN_ITEMS.md OI-0148 flipped to closed in same commit (orphan-flip rule).
- PROJECT_CHANGELOG.md row added.
- GitHub issue closed with commit hash.

## Project rules to apply

- **CLAUDE.md §"Code Quality Checks"** — `npx vitest run` green before commit. (Hook tests are bash, not vitest, but should also pass.)
- **CLAUDE.md §"OPEN_ITEMS.md Closure Discipline"** rule 2 — this is the rule the hook enforces. The hook should match its predicate exactly.

## Not in scope

- Promoting other CLAUDE.md grep contracts (OI-0117 `events.date_in` reads, OI-0133 `groups.farm_id` reads, OI-0139 strict-`>` rule, OI-0140 `activePWs[0]` shortcut, OI-0145 raw unit literals, etc.) to hooks. Each is its own scope decision; if patterns of "documentation-only contract failed in practice" stack up further, a follow-on OI can bundle them. This OI is intentionally narrow — one hook, one predicate.
- Husky / npm-based hook installers. `core.hooksPath` is the simplest cross-platform path with zero npm dependency.
- `pre-commit` framework (the python tool). Same reason.

## Checklist for Claude Code

- [ ] Read `OPEN_ITEMS.md` → OI-0148 in full before starting (canonical design).
- [ ] Implement per design.
- [ ] Run the test script locally: it should pass the four matrix cases and the `--no-verify` bypass.
- [ ] Activate the hook in your local clone (`git config core.hooksPath .githooks`) and verify the first commit that closes OI-0148 actually triggers the hook (it should pass because OPEN_ITEMS.md is staged).
- [ ] Stage a deliberate test commit with an OI reference but no OPEN_ITEMS.md change, confirm it fails, then revert the test.
- [ ] Full vitest suite green (`npx vitest run`).
- [ ] `npm test` runs the hook tests in addition to vitest.
- [ ] OPEN_ITEMS.md OI-0148 flipped to closed in the same commit.
- [ ] PROJECT_CHANGELOG.md row added.
- [ ] GitHub issue closed.
