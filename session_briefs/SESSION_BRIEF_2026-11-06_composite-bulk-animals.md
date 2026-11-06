# SESSION_BRIEF — Composite/bulk animals for DMI tracking

**Generated:** 2026-11-06  
**Source:** Grok design session (requested path artifacts/SESSION_BRIEF_2026-11-06_composite-bulk-animals.md; that file was not present in the repository, so this file records the agreed design as supplied for implementation)  
**Status:** Ready for implementation

## What was decided

Implement the composite/bulk animals feature for DMI tracking per the agreed design.

- Add Animal dialog: Individual | Group composite choice.
- Composite: name, class, sex (required), bulk_head_count, total weight.
- Schema: is_bulk boolean, bulk_head_count integer on animals. New migration.
- When adding same-species individuals to a group with a composite: prompt to reduce the composite (yes/no). Yes subtracts head count and weight (floor 0).
- Head-count math (event windows, snapshots, stocking, NPK, displays) must include bulk_head_count.
- Gate composites out of individual-only flows.
- Works for all species.

## Constraints

- Follow AGENTS.md. Do not invent design decisions.
- Commit using the repo's documented Git workflow (protected main / Mode B if still in effect).
- Update PROJECT_CHANGELOG.md.
- After merge to main, report SHA and header stamp after Pages succeeds.
