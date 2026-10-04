# Project Framework (Constitution)

**Adopted copy inside GTHO-v2.** These files were uploaded to the repo root on 2026-10-04 and moved here so they do not sit on top of the app docs.

The project files stay at the repo root: `AGENTS.md`, `PROJECT_STATUS.md`, `session_briefs/`, `github/issues/`. This directory is the process reference. Process improvements still belong upstream in the framework repo; this is the copy GTHO reads.

**Purpose:** Reusable process and rules for any project worked with Grok + Grok Build.  
**Scope:** Process only. Project-specific content lives in the GTHO root files.

---

## What lives here vs in the project

| Location | Contents |
|----------|----------|
| **project-framework/** | Ownership rules, session protocols, handoff patterns, delivery gates, first-pass scaffold, templates |
| **GTHO repo root** | `AGENTS.md` (project-adapted), `PROJECT_STATUS.md`, domain docs, code, session briefs |

---

## Core files

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Shared process rules |
| `FRAMEWORK.md` | Fuller description of the model |
| `SKILL.md` | Guided interview + first-pass generation |
| `PROJECT_STATUS.md.template` | Starter living-status document |
| `AGENTS.md.template` | Starter project-level AGENTS.md |
| `session-brief.template.md` | Optional handoff document |
| `CHANGELOG.md` | Changes to the framework itself |

---

## Ongoing use

- **Design / decisions** → Grok project chat. Update `PROJECT_STATUS.md`.
- **Implementation** → Grok Build, pointed at the status doc and any session brief.
- **Handoff medium** → Git.
- **Process improvements** → framework repo, then refresh this copy.
- **Domain lessons** → stay in GTHO.
