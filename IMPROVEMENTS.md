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

### 9. Migration SQL must be executed against the database, not just committed as a file
**Plugin:** project-infrastructure
**Skill:** deploy-gate, project-scaffold
**What:** Any project using Supabase (or any external database) must enforce that migration SQL files are executed against the live database in the same session they are created. Writing a `.sql` file to a `migrations/` directory is step 1 of 3 — the file must also be executed and the result verified by querying the schema. CLAUDE.md should include a "Migration Execution Rule" with three mandatory steps: Write → Execute → Verify.
**Why:** OI-0053 — five migrations (013–017) were committed as `.sql` files but never executed against Supabase. The app code referenced columns and RLS policies that didn't exist in the database. Every Supabase sync call failed silently — records saved to localStorage but never reached the server. The failure was invisible because the app reads from localStorage first. This went undetected until Tier 3 migration testing, when we inspected the dead letter queue and found every record had been rejected. The root cause: the process said "SQL migration in `supabase/migrations/`" but didn't say "execute it." Claude Code interpreted the instruction literally — it wrote the file and moved on.
**How to apply:**
1. CLAUDE.md template gains a "Migration Execution Rule" section after "Schema-First Development":
   - **Write** the `.sql` file
   - **Execute** via MCP (or provide SQL for manual execution if MCP unavailable)
   - **Verify** with a schema query: `SELECT column_name FROM information_schema.columns WHERE table_name = 'X' AND column_name = 'Y';`
   - **Report** verification in commit message: "Migration NNN applied and verified"
2. deploy-gate gains a pre-deploy check: "All migration files in `supabase/migrations/` have been executed against the database. Query `information_schema.columns` to confirm latest columns exist."
3. The project-scaffold template for CLAUDE.md includes this rule by default for any project with a `supabase/` directory.
**Where:** project-scaffold SKILL.md (CLAUDE.md template), deploy-gate SKILL.md (add migration verification check), doc-workflow SKILL.md (migration handoff protocol when Cowork specs a schema change).

### 10. Supabase RLS: never use FOR ALL policies with upsert-based sync adapters
**Plugin:** project-infrastructure
**Skill:** project-scaffold, deploy-gate
**What:** When scaffolding a Supabase-backed project, RLS policies must use granular per-command policies (INSERT, SELECT, UPDATE, DELETE) instead of `FOR ALL`. The INSERT policy should use `WITH CHECK (true)` for operation-scoped tables (FK constraints enforce valid `operation_id`), while SELECT/UPDATE/DELETE check membership. `FOR ALL` policies apply their `USING` clause as the `WITH CHECK` for both INSERT and UPDATE, which fails during bootstrap (first-user onboarding) when the membership row doesn't exist yet. This is especially critical when the sync adapter uses `.upsert()`, which Supabase evaluates as INSERT + UPDATE — requiring both policies to pass.
**Why:** OI-0054 — 24 records dead-lettered on every onboarding attempt. The `FOR ALL` + `.upsert()` combination meant that even tables with permissive INSERT intent (`WITH CHECK (true)` on the operations table itself) were rejected because the UPDATE path required a membership check that couldn't pass during bootstrap. The failure was silent (localStorage-first app showed success) and took multiple debugging sessions to diagnose because: (a) the error changed character as each layer was fixed (recursion → RLS violation → FK constraint), and (b) the dead letter queue error messages didn't indicate that upsert was the trigger.
**How to apply:**
1. CLAUDE.md template for Supabase projects gains a "RLS Policy Rules" section: "Never use `FOR ALL`. Always use granular INSERT/SELECT/UPDATE/DELETE. INSERT uses `WITH CHECK (true)` for operation-scoped tables."
2. deploy-gate gains a pre-commit check: "grep `FOR ALL` in migration SQL files — if found, flag as potential bootstrap failure."
3. project-scaffold generates the granular policy pattern in its migration templates.
**Where:** project-scaffold SKILL.md (migration template, CLAUDE.md template), deploy-gate SKILL.md (add `FOR ALL` grep check).

### 8. Sheet DOM: ensure-on-first-use pattern for cross-route callable sheets
**Plugin:** project-infrastructure
**Skill:** app-architecture
**What:** When a bottom sheet (or any always-in-DOM component) needs to be callable from multiple routes, its `open*` function should ensure its own wrapper exists in the DOM on first use, rather than relying on a specific route to have created the wrapper. The pattern: check `document.getElementById(wrapId)`, and if missing, create the wrapper and append to `document.body`. This makes the sheet self-contained and callable from any route. Route-level wrappers can coexist — the `getElementById` guard prevents duplicates.
**Why:** Dashboard action buttons called `openMoveWizard()`, `openCloseEventSheet()`, and `openCreateSurveySheet()`, but those functions expected wrapper elements that only existed when the events or surveys route was rendered. The sheets silently failed to open from the dashboard. This is a v1 anti-pattern (duplicate/missing DOM elements causing silent failures).
**How to apply:**
1. V2_APP_ARCHITECTURE.md §6.2 (Sheet lifecycle) should document the ensure-on-first-use pattern as the standard for any sheet exported for cross-route use.
2. The pattern: `function ensureSheetDOM() { if (document.getElementById('my-sheet-wrap')) return; document.body.appendChild(el('div', { className: 'sheet-wrap', id: 'my-sheet-wrap' }, [...])); }` — called at the top of the `open*` function.
3. Sheets that are only ever opened from their own route can keep the current route-level wrapper pattern.
**Where:** V2_APP_ARCHITECTURE.md §6.2, CLAUDE.md (optional — add to Implementation Rules if the pattern should be enforced).

### 11. Session handoff notes — write state + next-step file at end of each long session
**Plugin:** project-infrastructure
**Skill:** doc-workflow, deploy-gate
**What:** Long multi-session design sprints (like the UI sprint in GTHO-v2) should end each session by writing a short `SESSION_HANDOFF.md` file (or overwriting a single rolling one) that captures: (a) where we are in the sprint, (b) what was just completed, (c) the exact next step for the next session, (d) any in-flight decisions that aren't yet documented elsewhere. The next session reads this file first and can pick up without reconstructing context from memory files + chat history.
**Why:** In the 2026-04-15 UI sprint, context compaction happened multiple times. Each new session had to reconstruct state by re-reading UI_SPRINT_SPEC.md, CLAUDE.md, memory files, and the last ~50 chat turns. This burned significant context on orientation before the first useful work happened. A dedicated handoff note is ~20 lines and captures the irreducible state (sprint phase, last completion, immediate next action) that memory files can't — memory files capture rules and facts; handoff notes capture "what were we just about to do." This is the same pattern as `SESSION_BRIEF_*.md` but directed at the NEXT Cowork session rather than Claude Code.
**How to apply:**
1. Add a "Session Handoff" step to the Cowork Delivery Gate checklist: "If this session is part of a multi-session sprint, write/update `SESSION_HANDOFF.md` at the repo root with: sprint name, current phase, last completed item, immediate next step, in-flight decisions."
2. The file is overwritten each session, not appended — it's always the current handoff, not a log.
3. Start-of-session protocol gains a step: "If `SESSION_HANDOFF.md` exists, read it first before OPEN_ITEMS.md."
4. The file can be deleted when the sprint ends (or archived to `session_briefs/`).

**Template:**
```markdown
# Session Handoff — {Sprint Name}

**Last session:** {date}
**Current phase:** {phase name / e.g., "SP-2 spec'd, SP-3 spec'd, neither implemented"}

## Just completed
- {bullet}
- {bullet}

## Next step (exact, actionable)
{one sentence — what to do first in the next session}

## In-flight decisions
- {decision not yet in base docs or OPEN_ITEMS.md}

## Don't re-decide
- {things already settled this sprint — pointer to where they're documented}
```

**Where:** deploy-gate SKILL.md (Cowork Delivery Gate — add handoff note step for multi-session work), doc-workflow SKILL.md (document the start-of-session read order with SESSION_HANDOFF.md first).

### 12. One component per user-facing pattern — responsive CSS, not parallel implementations
**Plugin:** project-infrastructure (or design plugin, if one exists)
**Skill:** design-system, design-handoff
**What:** Add a rule to the design-system skill: every user-facing pattern (modal, confirm dialog, edit sheet, form picker, etc.) is implemented as a **single component** that adapts to viewport via responsive CSS. Forbid parallel "desktop modal" + "mobile sheet" implementations of the same action. Same markup, same state, same event handlers — the container just shifts (centered card on desktop ≥600px, bottom sheet on mobile <600px).
**Why:** V1 of GTHY grew parallel modal/sheet components for the same actions. Over time they drifted — one got a new field, the other didn't; one got a bug fix, the other didn't. Every time a user-facing pattern needs to change, engineering has to remember to update N places. The v2 spec caught this during SP-2 mockup review (delete confirm, sub-move edit, feed entry edit). Enforcing one-component-per-pattern prevents the drift class of bug entirely.
**How to apply:** In the design-system skill: when documenting a component, require a "Responsive behavior" section that names the breakpoint switch and the single set of CSS selectors that drive it. In the design-handoff skill: when generating specs, include a line `Implementation: one component, responsive via @media (max-width: 600px) — not a separate sheet variant.` Design critiques should flag any spec that implies two implementations for one action.
**Where:** design-system SKILL.md (add "One Component Per Pattern" principle section), design-handoff SKILL.md (add responsive-implementation line to every component spec template).

### 13. UI sprint specs must capture schema/infra impacts alongside UI decisions
**Plugin:** project-infrastructure
**Skill:** doc-workflow, deploy-gate
**What:** When a UI sprint doc (e.g., `UI_SPRINT_SPEC.md`) accumulates design decisions across multiple sessions, every sprint item must have a "Schema Impacts" subsection next to the "Decisions" subsection — even if the answer is "none." The sprint doc is the single place where UI + data model changes for a given chunk of work are reviewed together before handoff, and the end-of-sprint reconciliation pass uses both subsections to fold changes into the correct base docs (UI decisions → V2_UX_FLOWS.md / V2_DESIGN_SYSTEM.md; schema changes → V2_SCHEMA_DESIGN.md + CP-55/CP-56 spec).
**Why:** In the 2026-04-15 SP-2 design review, the schema gap (`event_observations` vs `paddock_observations` alignment) almost got missed because the sprint doc framing treated "UI decisions" and "schema changes" as separate workstreams. Tim caught it and flagged it as "a big miss." Folding schema into the same sprint entry means every spec handoff to Claude Code carries the full picture — no chasing a second doc to find the FK the view depends on. It also keeps the CP-55/CP-56 sync rule (Export/Import Spec Sync Rule in CLAUDE.md) front of mind: every schema change flagged in a sprint spec naturally prompts the CP-55/CP-56 impact callout.
**How to apply:**
1. `doc-workflow` SKILL.md — when documenting the UI sprint workflow (spec accumulation → reconciliation), require two subsections per sprint item: "Decisions" (UI) and "Schema Impacts" (data). If schema impacts = none, write "None" explicitly so future-you knows it was considered, not forgotten.
2. `deploy-gate` SKILL.md — Cowork Delivery Gate adds a check: "For each sprint item handed off to Claude Code, verify both Decisions and Schema Impacts subsections are present in the sprint doc. Schema changes must also be reflected in OPEN_ITEMS.md and (if applicable) call out CP-55/CP-56 impact."
3. Sprint spec template (add to project-scaffold if a template exists): each `## SP-N` section includes required subsections `### Decisions`, `### Schema Impacts`, `### Linked OPEN_ITEMS`.
**Where:** doc-workflow SKILL.md (UI sprint section), deploy-gate SKILL.md (Cowork Delivery Gate item for sprint handoffs), project-scaffold SKILL.md (sprint-spec template).

**Related memory:** `project_ui_sprint_workflow.md` in user auto-memory mentions the reconciliation pattern; this entry adds the schema-alongside-UI requirement.

### 14. Post-push verification in deploy-gate — "I pushed" must mean "I verified it landed on origin"
**Plugin:** project-infrastructure
**Skill:** deploy-gate
**What:** When any agent (Claude Code, Dispatch, etc.) runs `git push origin <branch>` as part of a handoff, the next step must be a verification read: `git fetch origin <branch>` followed by `git log origin/<branch> -1 --oneline`, and the returned SHA must equal the SHA that was just committed (`git rev-parse HEAD`). If the SHAs don't match, the push silently failed and the agent must surface the failure loudly — not report "done." The deploy-gate checklist already includes a "docs pushed" item; this adds the mandatory read-back that closes the silent-failure class of bug.
**Why:** Hit at least twice on GTHO-v2. Most recently OI-0118 (2026-04-20): Claude Code committed the edit-paddock-window observation-cards implementation (`eef637e`) and reported "done and pushed," but the push never reached `origin/main`. The deployed GitHub Pages bundle stayed at the pre-implementation build; Tim opened the site, saw no pre-graze card, and we burned a round-trip diagnosing what looked like a rendering bug but turned out to be a missing deploy. The signature is `git status` saying `Your branch is ahead of 'origin/main' by 1 commit`. Push command exit codes aren't a reliable signal — a push can succeed at the local-git level and still not reach GitHub if there's an auth hiccup, a network drop mid-push, or (in Claude Code's case) the push step gets cut off a chained shell command and the agent never sees the error. The only way to catch the failure class is to read back from `origin/<branch>` after fetching. The project memory note `feedback_push_and_prompt.md` ("always provide push + CC prompt") was the interim workaround; this IMPROVEMENT promotes the verification half into the skill as a hard step.
**How to apply:**
1. `deploy-gate` SKILL.md — add a new checklist step immediately after any `git push` invocation: "**Verify push landed:** run `git fetch origin <branch> && git log origin/<branch> -1 --oneline` and confirm the returned SHA matches `git rev-parse HEAD` from before the push. If they differ, the push failed silently — retry or surface the error. Do not report the handoff complete until SHAs match."
2. `deploy-gate` SKILL.md — in the Cowork Delivery Gate section, reframe the existing "docs pushed" checkbox as "docs pushed AND verified on origin" with the same fetch+log-origin read.
3. When an agent runs deploy-gate at the end of a session and discovers a push didn't land, treat that as a P0-blocker notification to the user — not a quiet retry — because the user is likely about to test on the deployed site and will otherwise waste a round-trip.
**Where:** deploy-gate SKILL.md (new verification step after every `git push`; update Cowork Delivery Gate wording). Optional follow-on: a `pre-push` git hook that prints the verification command as a reminder — project-specific, not required for the skill rule.

**Related memory:** user auto-memory `feedback_push_and_prompt.md` — captures the "always provide push + CC prompt" expectation. This IMPROVEMENT adds the verification-after-push half of the pattern.

## Applied

_(Entries move here after the plugin skill is updated)_
