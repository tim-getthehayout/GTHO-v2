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
   One or two sentences: purpose, who it is for, current stage (idea / early / active / maintenance).

2. **What are the hard constraints or non-negotiables?**  
   Examples: data integrity, security, zero client software for family, budget, timeline, “must run on existing hardware”, etc.

3. **What already exists?**  
   Code, configs, hardware, accounts, prior decisions, existing docs or repos.

4. **What are the key decisions already made?**  
   Record them so they are not re-litigated later.

5. **What are the open questions or next steps?**  
   Explicit list. Number them.

6. **Any communication or working-style preferences beyond the framework defaults?**  
   Optional. Most projects can keep the defaults.

7. **Where will the Git remote live?**  
   Forgejo, GitHub, other. Needed for multi-machine / Grok Build handoff clarity.

## What to generate

After the interview (or from information already present in the conversation):

### 1. `PROJECT_STATUS.md`

Populate the standard sections:

- Project goals
- Current state
- Key decisions / decision log (with dates if known)
- Open questions / next steps
- Framework feedback (process discoveries to merge upstream)

Use the template in `PROJECT_STATUS.md.template` as the structural guide. Do not leave critical sections empty if the user has given the information.

### 2. Project-level `AGENTS.md`

Start from the framework `AGENTS.md` and add a clear **Project-specific** section at the top or bottom that contains only:

- Short project description
- Domain constraints / priorities
- Any overrides to communication style or process
- Pointers to the living status document and important domain docs

Do **not** duplicate the entire process framework inside the project file. Keep process rules in the shared framework; keep domain content in the project file.

### 3. Optional first session brief

Only if the user already has concrete implementation work ready. Otherwise skip.

## Confirmation step

Before declaring the project “on the framework”:

1. Show the generated `PROJECT_STATUS.md` (and `AGENTS.md` if created).
2. Ask the user to confirm or correct.
3. Once confirmed, treat `PROJECT_STATUS.md` as the living source of truth going forward.
4. Remind the user that significant future decisions should update that file.

## After scaffolding

- Suggest committing the new files to the project’s Git remote.
- Note that future sessions (Grok chat or Grok Build) should begin by reading `PROJECT_STATUS.md`.
- If process improvements are discovered later, they belong in the framework repo, not only in the project.
