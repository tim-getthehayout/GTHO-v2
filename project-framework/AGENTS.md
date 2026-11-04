# AGENTS.md — Project Framework Instructions

This file is the shared process instruction set for both Grok project conversations and Grok Build sessions.

**Rule priority:** The project `AGENTS.md` at the GTHO repo root overrides this file for domain content. Shared process rules here still apply unless that file explicitly overrides them.

---

## 0. New Project / First-Pass Scaffold

When a project is new, has an empty or missing living status document, or the user asks to "scaffold", "start a new project", or "set up the framework for this project":

1. Follow the **project-scaffold** skill (`SKILL.md` in this directory).
2. Interview the user (one major question at a time) to gather goals, constraints, current state, key decisions, and open questions.
3. Generate a first `PROJECT_STATUS.md` and a project-adapted `AGENTS.md`.
4. Show the generated files and obtain confirmation before treating them as authoritative.
5. After confirmation, treat `PROJECT_STATUS.md` as the living source of truth.

Do not invent design decisions. Record open questions explicitly.

---

## 1. Roles and Ownership

| Role | Primary responsibility | Owns |
|------|------------------------|------|
| **Grok project chat** | Design, architecture, prioritization, status, decision logging | Living status document, high-level decisions, open questions, session briefs / specs |
| **Grok Build** | Implementation (editing files, running commands, applying configs) | Code, configuration, infrastructure files, lower-level docs it is asked to change |
| **Git bridge** (optional) | A bridge bot on the writer machine. Lands doc-only changes it is handed, checks that pushed branches are intact when asked, and verifies with `git ls-remote`. In Mode A it pushes doc commits from the writer. In Mode B its doc-only changes also go through a pull request; it never pushes to `main` | No design. It does not invent design, never force-pushes, and does not push while Grok Build is editing the same repo |
| **Git repository** | Durability and handoff medium | Everything that must survive across sessions and machines |

### Ownership rules

- The living status document is the single source of truth for current project state. Update it after every significant decision or change.
- Grok Build does not invent design decisions. If something is not specified in the status doc, a brief, or a spec, it stops and flags the question.
- Specs and session briefs are written by the design side (Grok chat) and consumed by the implementation side (Grok Build).
- Do not edit files owned by the other role without explicit handoff.

---

## 2. Session Start Protocol (both sides)

1. Identify and read the **latest** living status document for the project.
2. Read the project `AGENTS.md`, then this file if process detail is needed.
3. Surface relevant open items or decisions that affect the current task.
4. Confirm the goal of the session before making changes.

If the living status document is missing or clearly empty, switch to the New Project / First-Pass Scaffold protocol above.

---

## 3. Handoff Protocol (Grok chat ↔ Grok Build)

Because the two environments cannot talk to each other directly, **Git + living docs** are the interface.

### Design → Implementation

1. Capture decisions and requirements in the living status document and/or a short session brief or spec file.
2. Commit and push those docs from the one writer machine, the always-on computer that can reach the private forge. Browser project chat cannot reach a LAN forge. When that chat must land a commit, the local Git bridge on the writer machine applies only those doc changes and pushes. The forge credential stays on the writer. It is not copied onto a cloud bot computer. This step describes Mode A; in Mode B, see Git modes below.
3. Start Grok Build in the project directory on the writer machine with a focused prompt that points at the relevant docs, for example:

   > Read PROJECT_STATUS.md and the latest session brief. Implement the changes described. Follow AGENTS.md. Do not invent design decisions.

### Implementation → Design

1. Grok Build commits its work with a clear message.
2. Optionally leaves a short note of what changed.
3. Return to the Grok project chat to review, close items, and update the living status.

### Git modes

Each project `AGENTS.md` picks one mode and names its writer machine and clone path.

**Mode A: writer machine, private forge.** The forge stays LAN-only. The Git bridge on the writer pushes doc commits. Grok Build on the writer pushes its own commits. No pull requests are required.

**Mode B: feature branch and pull request (GitHub).**
1. Grok project chat never pushes. It writes the brief; Grok Build or the Git bridge commits it.
2. Grok Build commits on a feature branch made from `main` and pushes that branch. Feature branches do not deploy.
3. Each feature gets a pull request into `main`. The owner reviews the diff and merges it.
4. The Git bridge lands doc-only changes, checks that pushed branches are intact when asked, and verifies `main` after a merge with `git ls-remote`. Its doc-only changes also go through a pull request; it has no bypass and never pushes to `main`.
5. `main` is meant to be protected by branch protection: no direct pushes, no force-pushes.

### Multi-machine use

One machine is the writer. It is the always-on computer that can reach the private forge. Grok Build there pulls before work and pushes the commit (Mode A) or its feature branch (Mode B). In Mode A, a laptop opens a session on that machine. It does not keep a second clone as another pusher. The project `AGENTS.md` names the writer and the clone path. The repository remains the single source of truth.

---

## 4. Delivery / End-of-Session Gate

Before considering a design session or an implementation task complete:

**Design side (Grok chat)**
- [ ] Living status document updated with decisions made this session
- [ ] Open items added, closed, or updated as needed
- [ ] Spec or session brief written if implementation work was defined
- [ ] Any process improvements noted for the framework repo

**Implementation side (Grok Build)**
- [ ] Only the requested changes were made (scoped changes)
- [ ] Living status or related docs updated if the task required it
- [ ] Clear commit message
- [ ] No unresolved design questions left silent — flag them instead

---

## 5. Living Status Document

Every non-trivial project maintains a living status document (recommended name: `PROJECT_STATUS.md`).

It should contain at minimum:
- Project goals and constraints
- Current state (what exists, what is decided)
- Decision log / changelog
- Open questions / next steps

Update it after every significant decision. New conversations and new Grok Build sessions treat it as the source of truth.

---

## 6. Open Items & Decision Discipline

- Record open questions and unresolved decisions explicitly.
- Do not silently invent solutions for unspecified design choices.
- When closing an item, note why and (if useful) the date or commit.

---

## 7. Continuous Improvement

When work on a project reveals a reusable process improvement, capture it and feed it back into the framework repository so future projects benefit.

Project-specific lessons stay in the project. Process lessons come here.

---

## 8. Communication Preferences (default)

- Prefer plain language.
- One major question at a time when decisions are needed.
- Explain the "why" behind recommendations.
- Keep outputs scannable.

Projects may override or extend these preferences in their own `AGENTS.md`.
