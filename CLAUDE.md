# CLAUDE.md — App Migration Project Rules

## Project Overview

**App Migration** is a documentation and planning project for rebuilding Get The Hay Out (GTHO) from v1 to v2. It contains feature audits, migration specs, design decisions, and tracking docs. No application code lives here — code work happens in the `get-the-hay-out` and `GTHO-v2` repos.

## Git Workflow

- **`main`** — single branch, all work committed directly
- No feature branches needed — this is a docs-only project
- Commit and push after each substantive edit session
- **Never use worktree isolation** (`isolation: "worktree"`) — stale worktrees break git state across sessions and require manual cleanup. All work happens directly on `main`.

## Doc Ownership

**Cowork** owns (edits directly):
- **OPEN_ITEMS.md** — add/close/update entries
- **github/issues/** — spec files for Claude Code handoff
- All planning and design documents
- Feature audits, migration specs, decision logs

**Claude Code** owns (updates during implementation sessions):
- **PROJECT_CHANGELOG.md** — one row per change, every push
- **CLAUDE.md** — this file (only when rules need updating)

**Shared:**
- **IMPROVEMENTS.md** — anyone can log discoveries; Cowork reviews periodically

## Scoped Changes Only

Only modify the specific document(s) needed for the requested change. Do not reorganize, rename, or reformat surrounding files unless explicitly asked.

## Spec File Handoff (from Cowork to Claude Code)

Cowork writes spec files to `github/issues/`. Files without a `GH-` prefix are unfiled — Claude Code should:
1. Create a GitHub issue from the spec: `gh issue create --title "TITLE" --body "$(cat github/issues/FILENAME.md)" --label "LABELS"`
2. Rename the file with the issue number: `FILENAME.md` → `GH-{number}_FILENAME.md`

## Session Brief Handoff

When a SESSION_BRIEF is provided, look for the `## OPEN_ITEMS changes` section and apply all entries to `OPEN_ITEMS.md` before starting work.
