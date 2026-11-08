# AGENTS.md — Feedback module

This repository is the shared in-app feedback contract and reusable implementation. It is not a product app.

The interview contract is [`CONTRACT.md`](CONTRACT.md). Shared process lives in `Homelab/project-framework`. Do not copy the framework here.

**Team**
- Contract design: Chief of Staff (there is no dedicated Feedback Design bot)
- Build bot: Feedback Module Build (implements the module; does not invent the contract or write app host adapters)
- Interviewer: Intake (runs the pinned contract; does not invent or change it)
- Git Bridge: Homelab Git Bridge
- Orchestrator: Orchestrator
- First planned adopter: GTHO

**Git setup**
- Canonical remote: `https://git.sarnford.com/Homelab/feedback-module.git`
- Publish mirror: none
- Writer machine: OmarchyHomelab
- Clone path: `/home/tim/Work/feedback-module`

Elevate reusable process improvements to `Homelab/project-framework` by messaging Chief of Staff. Contract changes stay in this repository and are pinned by each app.
