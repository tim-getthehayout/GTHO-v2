---
name: project-scaffold
description: >
  Walk the user through the first pass of a new project. Use when the user says
  "start a new project", "scaffold this project", "set up project docs", "initialize
  the framework for this project", or when PROJECT_STATUS.md is missing/empty and
  the conversation is clearly beginning a new body of work.
---

# Project Scaffold

Guided first-pass setup for any project that adopts this framework.

In GTHO-v2 this skill lives in `project-framework/SKILL.md`. Do not run it again for routine work. GTHO already has a populated `PROJECT_STATUS.md`.

## When to run

- User explicitly asks to start or scaffold a project.
- A project directory exists but has no meaningful `PROJECT_STATUS.md` yet.
- User is migrating an existing effort onto this framework.

Do **not** run this for routine work on an already-populated living status document.

## Goals of the first pass

1. Capture enough context that future Grok conversations and Grok Build sessions can start productively.
2. Produce a usable `PROJECT_STATUS.md`.
3. Produce a project-adapted `AGENTS.md` that keeps the shared process rules and adds only the domain-specific content needed.
4. Leave open questions explicitly listed rather than inventing answers.

## Interview style

- Ask **one major question at a time**.
- Prefer plain language.
- Offer reasonable defaults when the user is unsure; never invent critical design decisions.
- After gathering answers, generate the files and show them for confirmation before treating them as authoritative.

## Recommended question sequence

Ask only what is needed. Skip questions the user has already answered in the conversation.

1. **What is this project?**
2. **What are the hard constraints or non-negotiables?**
3. **What already exists?**
4. **What are the key decisions already made?**
5. **What are the open questions or next steps?**
6. **Any communication or working-style preferences beyond the framework defaults?**
7. **Where will the Git remote live?**

## What to generate

### 1. `PROJECT_STATUS.md`

Populate the standard sections from `PROJECT_STATUS.md.template`:

- Project goals
- Constraints and priorities
- Current state
- Key decisions / decision log
- Open questions / next steps
- Framework feedback

### 2. Project-level `AGENTS.md`

Start from `AGENTS.md.template` and add only domain content. Do not paste the whole framework into the project file. Point at `project-framework/AGENTS.md` for process rules.

### 3. Optional first session brief

Only if the user already has concrete implementation work ready. Use `session-brief.template.md`.

## Confirmation step

Before declaring the project on the framework, show the generated files and ask the user to confirm or correct.
