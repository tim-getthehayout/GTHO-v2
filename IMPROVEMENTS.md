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

### 5. Base docs carry the design; github/issues/ specs are handoff wrappers only
**Plugin:** project-infrastructure
**Skill:** doc-workflow, deploy-gate
**What:** When writing a spec file to `github/issues/`, it must NOT contain design decisions that aren't also captured in a base design doc (V2_DESIGN_SYSTEM, V2_UX_FLOWS, V2_CALCULATION_SPEC, V2_SCHEMA_DESIGN). The spec is a handoff wrapper: summary, references to the base doc sections that define the design, implementation acceptance criteria (file paths, build order, test plan), GH-4-style bundling notes. If a design detail appears only in the spec, stop and migrate it to the appropriate base doc before finalizing the spec.
**Why:** In the CP-54 rotation calendar session (2026-04-13), Tim caught that the first-draft spec had keyboard shortcuts, URL deep-link schema, state persistence policy, and accessibility requirements that weren't in any base doc. If the spec file had later been archived or deleted after implementation, those design decisions would have been lost. The principle: "if we deleted every `github/issues/` spec, the design should still be fully captured." Specs decay (they close when built); base docs are the living source of truth.
**How to apply:** Add a check to the Cowork Delivery Gate item 3 ("Spec files written"): before finalizing a spec, audit for design content that belongs in a base doc and migrate it. Consider a "Design source of truth" section at the top of every spec (as seen in `rotation-calendar-events-screen.md`) that indexes every base-doc section the spec depends on — this makes the audit self-enforcing because anything not referenceable by section number is a sign it hasn't been integrated.
**Where:** deploy-gate SKILL.md §Cowork Delivery Gate item 3, and the project-scaffold spec template (`github/issues/_TEMPLATE.md`) — add a required "Design source of truth" section referencing base docs.

### 6. Spec files use a "thin pointer" format — concrete template
**Plugin:** project-infrastructure
**Skill:** doc-workflow, project-scaffold (`github/issues/_TEMPLATE.md`)
**What:** Entry #5 establishes the principle ("base docs are source of truth; specs are handoff wrappers"). This entry adds the concrete format that makes the principle self-enforcing. Every spec file in `github/issues/` has four sections and no more:

1. **Summary** — one paragraph of scope, in prose. No acceptance criteria here.
2. **Single Source of Truth** — bulleted list of every base-doc section the spec depends on, formatted `**{Doc}.md §X.Y** — short description`. This section IS the design index — if a design decision isn't referenceable from this list by section number, it doesn't belong in the spec (migrate it to a base doc first).
3. **Implementation Checklist** — checkboxes that reference `§X.Y step N` of the base doc rather than restating the step. Example: `[ ] Pending-writes gate + offline gate per §5.7 step 2, matching CP-55's refusal toast wording.` This forces the implementer to read the base doc and keeps the spec immune to drift.
4. **Related / Notes** — cross-references to other CPs, OIs, related decisions. No design content.

**Why:** Entry #5 said "audit the spec for design content that belongs in a base doc." That's a manual check that's easy to skip. This template makes drift physically awkward — you can't write acceptance criteria without referencing the base doc section, and you can't list a "Single Source of Truth" entry that doesn't exist. The 2026-04-13 CP-56 session proved this out: a first-draft spec duplicated ~90 lines of acceptance criteria from V2_MIGRATION_PLAN.md §5.7, those duplicates drifted during the OI-0021/OI-0022 decisions, and the fix was to rewrite the spec in the thin-pointer format. When that pattern became memory/policy, future spec drafting started from the right place.

**How to apply:**
- `github/issues/_TEMPLATE.md` should ship with the four-section skeleton pre-populated. The "Single Source of Truth" section is required (even if it only has one line).
- `doc-workflow` SKILL.md should codify the rule: "a spec file is never written; it's assembled by pointing at existing base-doc sections. If you can't fill the Single Source of Truth list, the design isn't done yet — stop and write the base-doc sections first."
- The Cowork Delivery Gate check in entry #5 becomes mechanical: grep the spec file for any paragraph-length prose outside "Summary" and "Related / Notes" — if found, it's drift.

**Where:** project-scaffold SKILL.md (update spec template), doc-workflow SKILL.md (add "thin pointer format" section after the spec-ownership section), deploy-gate SKILL.md (Cowork Delivery Gate item 3 — make the check grep-able).

**Related memory:** `feedback_specs_in_base_docs.md` in user auto-memory captures this as a per-user rule; promoting it to the plugin makes it default for every Cowork project.

### 7. Store call param-count lint rule — catch silent sync failures
**Plugin:** project-infrastructure
**Skill:** deploy-gate
**What:** Add a pre-commit check that verifies every `add()` call has 5 params, every `update()` call has 6 params, and every `remove()` call has 3 params when calling through the store. Missing sync params (`toSupabaseFn`, `table`) cause records to save to localStorage but silently skip Supabase sync. A simple grep/regex check catches this at commit time.
**Why:** OI-0050 — 15 broken calls across onboarding and settings went undetected through all unit and e2e tests because the app reads from localStorage first. The sync gap was invisible to UI-level testing. A single-user tester would never notice; the bug only surfaces in multi-user scenarios or when localStorage is cleared.
**Where:** deploy-gate SKILL.md — add as a code quality check. CLAUDE.md template — include in the "Code Quality Checks" section for any project using a store + sync adapter pattern.

### 8. E2E tests must verify Supabase state, not just UI state
**Plugin:** project-infrastructure
**Skill:** deploy-gate, project-scaffold
**What:** E2E tests for any app with a sync layer must include Supabase (or backend) verification after every write operation. The test should query the database directly to confirm the record exists, not just check that the UI rendered correctly. The app's localStorage-first read pattern makes broken sync paths invisible to UI-only assertions.
**Why:** Same root cause as #7 (OI-0050). The smoke test (CP-23) ran through the full onboarding and event lifecycle, all assertions passed, but zero records existed in Supabase. The e2e test was testing "does the UI work with localStorage" rather than "does the full system work." This is a general principle for any offline-first app.
**How to apply:** After any e2e step that creates or updates a record, add a direct database query assertion:
```js
const { data } = await supabase.from('table').select('id').eq('id', expectedId);
expect(data).toHaveLength(1);
```
**Where:** project-scaffold SKILL.md — include in e2e test template. deploy-gate SKILL.md — add "e2e tests verify backend state" as a pre-deploy check for apps with sync layers.

## Applied

_(Entries move here after the plugin skill is updated)_
