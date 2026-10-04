# Project Framework — Full Description

This document expands on `AGENTS.md` in this directory. It is the reference for how the overall system is intended to work.

In GTHO-v2 this copy lives in `project-framework/`. The project-adapted instructions are the root `AGENTS.md`. The living status is the root `PROJECT_STATUS.md`.

---

## Design Goals of the Framework

- Work for **any** kind of project (applications, infrastructure, documentation, mixed).
- Support both conversational design (Grok project chat) and agentic implementation (Grok Build).
- Keep process rules separate from domain content.
- Make handoff reliable even though the two environments cannot talk directly.
- Support working from multiple machines (laptop + server) against the same Git remote.
- Encourage continuous improvement of the process itself.
- Provide a guided first-pass for new projects so the living status document starts useful rather than empty.

---

## Roles in Detail

### Grok Project Chat
Best for:
- Exploring requirements and trade-offs
- Architecture and prioritization decisions
- Maintaining the living status document
- Writing clear specs or session briefs
- Reviewing work after implementation
- Running the first-pass scaffold interview for new projects

### Grok Build
Best for:
- Making concrete changes to files and configuration
- Running commands and verifying results
- Implementing a well-specified task
- Working close to the target environment or on a development machine

### Git Repository
The durable shared memory and the only reliable bridge between the two roles and between machines.

---

## Recommended Project Layout (minimal)

```
project-root/
├── AGENTS.md                 # Project-adapted instructions
├── PROJECT_STATUS.md         # Living source of truth
├── session_briefs/           # Optional handoff documents
├── specs/                    # Optional detailed specs
└── … (code, config, domain docs)
```

GTHO keeps specs in `github/issues/` and session briefs in `session_briefs/`. The framework copy is `project-framework/`.

---

## First-Pass Scaffold

New projects (or projects newly adopting this framework) should go through the guided scaffold described in `SKILL.md` and referenced in `AGENTS.md` §0.

Outcome of a successful first pass:
- A populated `PROJECT_STATUS.md` the user has confirmed
- A project-adapted `AGENTS.md` that keeps shared process rules and adds only domain content
- Explicit open questions rather than invented decisions

---

## Handoff Patterns

### Lightweight
Update `PROJECT_STATUS.md` with the decision, then tell Grok Build to read it and implement.

### Structured
Write a short session brief or spec file, commit it, then point Grok Build at that file.

### Multi-step
Break work into small, reviewable increments. Update status after each increment.

---

## Delivery Gates (summary)

See `AGENTS.md` §4. The gates exist to prevent:
- Lost decisions
- Unspecified work being invented
- Status drifting from reality
- Incomplete handoffs

---

## Multi-Machine Usage

1. Canonical repo lives on the shared remote (GitHub for GTHO).
2. Clone on any machine that will run Grok Build or be used for design review.
3. Pull before starting significant work; push after finishing.
4. Avoid long-lived divergent local branches for framework-adopting projects.

---

## Relationship to Domain-Specific Rules

Application architecture rules, schema-first rules, and farm-domain priorities belong in the project `AGENTS.md` and `PROJECT_STATUS.md`.

This framework stays silent on those topics so it remains reusable across any kind of work.
