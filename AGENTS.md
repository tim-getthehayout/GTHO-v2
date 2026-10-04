# AGENTS.md — GTHO v2

This file adapts the shared Project Framework for Get The Hay Out v2. Shared process rules live in `project-framework/AGENTS.md`. Domain content lives here.

**Living status document:** `PROJECT_STATUS.md` (read this first at the start of every conversation or Grok Build session).

`CLAUDE.md` remains the implementation rulebook (schema-first, mutation pattern, tests, logging). It is not the session entry. The 2026-04-15 UI sprint section in `CLAUDE.md` is retired.

---

## Project-specific context

**What this project is**  
Get The Hay Out v2 is the pasture and grazing PWA. Vanilla JS, Vite, Supabase, GitHub Pages. Live app: `https://tim-getthehayout.github.io/GTHO-v2/`. v1 is a separate repo, `get-the-hay-out`.

**Hard constraints / priorities**  
- Schema first. A new field needs a numbered SQL migration, then the entity `FIELDS` and shape mappers, then feature code. Never add a UI field without a Supabase column.
- A migration file on disk is not applied. Run it against Supabase in the same session, or hand Tim the SQL if this session cannot reach the project. Verify the columns before calling the work done.
- Offline-first. Writes go through the store and sync queue. No direct Supabase writes from feature code.
- No `innerHTML`. Compute on read. Scoped changes only.
- `main` deploys on push. Do not force-push.

**Key working notes**  
- Domain specs stay where they are: `V2_SCHEMA_DESIGN.md`, `V2_UX_FLOWS.md`, `V2_APP_ARCHITECTURE.md`, `V2_CALCULATION_SPEC.md`, `V2_INFRASTRUCTURE.md`, `V2_DESIGN_SYSTEM.md`, `V2_MIGRATION_PLAN.md`, `V2_BUILD_INDEX.md`.
- Backlog stays in `OPEN_ITEMS.md`. Do not copy it into `PROJECT_STATUS.md`. Status points at the open items that matter this session.
- Session briefs live in `session_briefs/`. Use `project-framework/session-brief.template.md` for new briefs. Implementation specs live in `github/issues/` (the framework's `specs/` folder is not used).
- Current schema stamp is 34 (migration `034_location_geometry_todo_points.sql`, applied 2026-10-04).

---

## Framework process rules (do not remove)

Full rules: `project-framework/AGENTS.md`. These apply unless this file explicitly overrides them.

### Roles and ownership
- **Grok project chat** owns design, prioritization, living status, and session briefs/specs. This replaces the old Cowork role in `CLAUDE.md`.
- **Grok Build** owns concrete implementation and does not invent design decisions. This replaces the old Claude Code role.
- **Git** is the durable handoff medium between the two and between machines.

Doc map, carried forward:
- Grok project chat edits design docs (`V2_*.md`), `OPEN_ITEMS.md`, `github/issues/` specs, `V2_BUILD_INDEX.md`, and `PROJECT_STATUS.md`.
- Grok Build updates `PROJECT_CHANGELOG.md` (one row per change), code under `src/`, `tests/`, `supabase/`, and `CLAUDE.md` only when an implementation rule changes.
- Either may log in `IMPROVEMENTS.md`. `TASKS.md` is updated in the same session a tracked task completes.

### Session start
1. Read the latest `PROJECT_STATUS.md`.
2. Read this `AGENTS.md`.
3. Surface relevant open items from `OPEN_ITEMS.md` (do not read the whole file unless the session needs it).
4. Confirm the session goal before making changes.

### Handoff
Design decisions and requirements are written into `PROJECT_STATUS.md` and/or a session brief or spec, then committed. Grok Build is pointed at those docs with a focused prompt. After implementation, return to the Grok chat to review and update status.

### Delivery gate
Update living status and open items. Do not leave unspecified design questions silent. Prefer scoped changes.

A commit that cites `OI-NNNN` must also update `OPEN_ITEMS.md` in that commit. When a fix closes an item, grep for siblings on the same path or symbol and close those in the same commit. A schema bump or dropped column must close now-moot items that name the retired symbol.

### Continuous improvement
Reusable process improvements go back to the framework repository, then this `project-framework/` copy is refreshed. Project-specific lessons stay here.
