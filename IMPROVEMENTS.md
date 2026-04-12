# Improvements

Discoveries from this project that should become standard practice in the project-infrastructure plugin. See the plugin's improvement log format for entry structure.

## Pending

### 1. Session briefs: dedicated directory + subject-summary naming
**Plugin:** project-infrastructure
**Skill:** doc-workflow
**What:** Add two conventions to the "Option 2: Session Brief" section: (a) session briefs live in a `session_briefs/` directory, not the project root, and (b) filenames follow `SESSION_BRIEF_YYYY-MM-DD_subject-summary.md` with a kebab-case subject slug after the date.
**Why:** Briefs accumulate over multi-session projects. Without a directory they clutter the root. Without a subject slug, date-only filenames are meaningless in a listing.
**Where:** SKILL.md line ~49, before "When the work is too nuanced..."

### 2. Add change log sections to design docs at creation time
**Plugin:** project-infrastructure
**Skill:** deploy-gate, doc-workflow
**What:** When a living design doc is created (not write-once docs like specs or briefs), include an empty `## Change Log` section at the bottom with the standard table header: `| Date | Session | Changes |`. This matches the deploy-gate requirement for document-level change logs on repeatedly-edited docs.
**Why:** Session 6 had to retroactively add change log sections to 3 design docs. If they'd been scaffolded with the section from the start, every session's edits would have been tracked from day one. The project-scaffold skill should include this in its doc templates.
**Where:** deploy-gate SKILL.md §Cowork Delivery Gate item 5 (already documented as a requirement — but the project-scaffold skill doesn't create docs with the section pre-populated). Also doc-workflow SKILL.md §Document-Level Change Logs.

### 3. Git push commands should handle stale locks and embedded repos
**Plugin:** project-infrastructure
**Skill:** deploy-gate, doc-workflow
**What:** The git push commands provided at session end should be more defensive. Two recurring problems: (a) Stale `.git/index.lock` and `.git/HEAD.lock` files left behind by crashed or interrupted git processes (often from Claude Code sessions). These block all git operations with a cryptic "Unable to create lock file" error. (b) `git add -A` can accidentally stage embedded git repos (like `.claude/worktrees/`) or other tool artifacts, causing warnings and failed commits.
**Why:** Session 6 hit both issues back-to-back. The user had to run manual cleanup commands before they could push. This is a common scenario when Claude Code and Cowork share a repo — Claude Code may leave lock files if a session is interrupted, and its worktree directories shouldn't be committed.
**How to apply:** The deploy-gate's git push commands should: (1) Check for and remove stale lock files before running git commands. (2) Use specific `git add <file1> <file2>` instead of `git add -A` to avoid staging tool artifacts. (3) Recommend adding `.claude/worktrees/` to `.gitignore` if it exists and isn't already ignored. The paste-ready commands could look like:
```
cd /path/to/repo
rm -f .git/index.lock .git/HEAD.lock
git add file1.md file2.md ...
git commit -m "docs: ..."
git push
```

### 4. Default "no worktree isolation" rule for single-branch and docs-only repos
**Plugin:** project-infrastructure
**Skill:** project-scaffold
**What:** The project scaffold should include a "Never use worktree isolation" rule in CLAUDE.md for any repo that uses a single-branch workflow (no PRs, no feature branches). Worktrees are only useful for repos with parallel branch workflows, and even then the cleanup risk is real — stale worktrees break git state across sessions.
**Why:** The App-Migration-Project repo hit this repeatedly. Every new session started with a broken git state because a prior Claude Code or Cowork agent session had created a worktree and didn't clean up on exit. The get-the-hay-out repo already had the rule; App-Migration-Project didn't until Session 10 added it manually. This should be standard.
**Where:** project-scaffold SKILL.md — when generating CLAUDE.md for a new project, include the no-worktree rule if the git workflow section specifies single-branch or docs-only.

## Applied

_(Entries move here after the plugin skill is updated)_
