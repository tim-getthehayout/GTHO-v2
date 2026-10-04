# Project Framework (Constitution)

**Purpose:** Reusable process and rules for any project worked with Grok + Grok Build.  
**Scope:** Process only. Project-specific content (domain rules, priorities, tech choices) lives in each project’s own files.

This repository is the single source of truth for *how* we work. Individual projects adopt the latest version of these rules and keep their own living status and domain knowledge separate.

---

## What lives here vs in a project

| Location | Contents |
|----------|----------|
| **This repo (framework)** | Ownership rules, session protocols, handoff patterns, delivery gates, first-pass scaffold, templates, continuous-improvement loop |
| **Each project repo** | `AGENTS.md` (project-adapted), living status (`PROJECT_STATUS.md`), domain docs, code/config, session briefs |

---

## Core files

| Path | Purpose |
|------|---------|
| `AGENTS.md` | Primary instruction file for Grok Build and Grok project chats |
| `FRAMEWORK.md` | Fuller description of the model |
| `SKILL.md` | Guided interview + first-pass generation for new projects |
| `PROJECT_STATUS.md.template` | Starter living-status document |
| `AGENTS.md.template` | Starter project-level AGENTS.md |
| `session-brief.template.md` | Optional handoff document |
| `CHANGELOG.md` | Changes to the framework itself |

---

## How to adopt in a new project

1. Ensure this framework repo is available (clone or reference the latest version).
2. In a Grok project chat, ask to scaffold / start the project (or begin work on an empty status doc).
3. Grok runs the first-pass interview and generates `PROJECT_STATUS.md` + project `AGENTS.md`.
4. Confirm the generated files.
5. Commit them to the project’s own Git remote.
6. From that point, every new conversation and every Grok Build session starts by reading `PROJECT_STATUS.md`.

---

## Ongoing use

- **Design / decisions** → Grok project chat. Update living status.
- **Implementation** → Grok Build, pointed at the status doc and any session brief/spec.
- **Handoff medium** → Git.
- **Process improvements** → come back to this framework repo.
- **Domain lessons** → stay in the project.

---

## Continuous improvement

When a real project reveals a better process pattern, improve *this* repo so the next project starts stronger.
