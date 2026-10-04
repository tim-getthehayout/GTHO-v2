# AGENTS.md — GTHO v2

This file adapts the shared Project Framework for this specific project.  
Shared process rules (roles, ownership, handoff, delivery gates, session protocol) come from `project-framework/AGENTS.md`. Domain content lives here.

**Living status document:** `PROJECT_STATUS.md` (read this first at the start of every conversation or Grok Build session).

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
- Session briefs live in `session_briefs/`. New briefs use `project-framework/session-brief.template.md`. Implementation specs live in `github/issues/` (this project does not use a `specs/` folder).
- `CLAUDE.md` is the implementation rulebook only. It is not the session entry. The 2026-04-15 UI sprint section in `CLAUDE.md` is retired.
- Current schema stamp is 34 (migration `034_location_geometry_todo_points.sql`, applied 2026-10-04).

---

## Framework process rules (do not remove)

The following process rules apply unless this project explicitly overrides them. Fuller detail is in `project-framework/AGENTS.md`.

### Roles and ownership
- **Grok project chat** owns design, prioritization, living status, and session briefs/specs.
- **Grok Build** owns concrete implementation (files, commands, configs) and does not invent design decisions.
- **Git** is the durable handoff medium between the two and between machines.

Grok Build does not edit design docs, `OPEN_ITEMS.md`, or `PROJECT_STATUS.md` unless the handoff says to. Grok project chat does not treat an unimplemented idea as shipped.

### Session start
1. Read the latest `PROJECT_STATUS.md`.
2. Read this `AGENTS.md`.
3. Surface relevant open items.
4. Confirm the session goal before making changes.

If `PROJECT_STATUS.md` is missing or empty, stop and run the scaffold in `project-framework/SKILL.md`. Do not invent the status.

### Handoff
Design decisions and requirements are written into `PROJECT_STATUS.md` and/or a session brief or spec, then committed. Grok Build is pointed at those docs with a focused prompt. After implementation, return to the Grok chat to review and update status.

Build prompt shape:

> Read PROJECT_STATUS.md and the latest session brief. Implement the changes described. Follow AGENTS.md. Do not invent design decisions.

### Delivery gate
Update living status and open items. Do not leave unspecified design questions silent. Prefer scoped changes.

Design side, before the session is done:
- Living status updated with decisions made this session.
- Open items added, closed, or updated.
- A session brief or spec committed if implementation work was defined.
- Process improvements noted for the framework, not buried only in domain docs.

Implementation side, before the task is done:
- Only the requested changes were made.
- Status or related docs updated if the task required it.
- Clear commit message.
- Unspecified design questions flagged, not silently decided.

### Continuous improvement
Reusable process improvements go back to the framework repository. Project-specific lessons stay here. Refresh `project-framework/` when the upstream framework changes.

---

## GTHO overrides

These extend the rules above. They do not replace them.

- Grok project chat replaces the old Cowork role. Grok Build replaces the old Claude Code role.
- Grok project chat edits `V2_*.md`, `OPEN_ITEMS.md`, `github/issues/` specs, `V2_BUILD_INDEX.md`, and `PROJECT_STATUS.md`.
- Grok Build updates `PROJECT_CHANGELOG.md` (one row per change) and code under `src/`, `tests/`, and `supabase/`. It edits `CLAUDE.md` only when an implementation rule changes.
- Either role may log in `IMPROVEMENTS.md`. A completed `TASKS.md` item is checked in the same session.
- A commit that cites `OI-NNNN` must also update `OPEN_ITEMS.md` in that commit. Close sibling items on the same path or symbol in that commit. A schema bump or dropped column closes now-moot items that name the retired symbol.
