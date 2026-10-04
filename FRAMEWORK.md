# Project Framework — Full Description

This document expands on `AGENTS.md`. It is the reference for how the overall system is intended to work.

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
- Working close to the target environment (e.g. inside a lab network) or on a development machine

### Git Repository
The durable shared memory and the only reliable bridge between the two roles and between machines.

---

## Recommended Project Layout (minimal)

```
project-root/
├── AGENTS.md                 # Project-adapted instructions (starts from framework)
├── PROJECT_STATUS.md         # Living source of truth
├── session_briefs/           # Optional handoff documents
├── specs/                    # Optional detailed specs
└── … (code, config, domain docs)
```

Projects are free to add more structure. The framework only requires a clear living status document and an `AGENTS.md`.

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

1. Canonical repo lives on the shared remote (e.g. Forgejo).
2. Clone on any machine that will run Grok Build or be used for design review.
3. Pull before starting significant work; push after finishing.
4. Avoid long-lived divergent local branches for framework-adopting projects.

The same pattern works whether Grok Build is running on a MacBook or inside a server CT.

---

## Relationship to Domain-Specific Rules

Home-lab constraints, application architecture rules, security priorities, family-access requirements, etc. belong in the **project’s** `AGENTS.md` and living status document.

This framework stays silent on those topics so it remains reusable across any kind of work.
