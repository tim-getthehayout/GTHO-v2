## Session Handoff — 2026-04-13 (Session 13, follow-up)

**Context:** Session 13 already shipped OI-0001 (strip grazing), OI-0002 (unit system), TASKS.md cleanup, and docs for audit items OI-0011–OI-0016 (see commits 6fa2ddc, 688bb68, bda357a, 96045c5, d5b1c96). This follow-up brief covers the remaining cleanup items plus three new UX nits Tim raised after those commits landed.

**What Cowork did in this follow-up:** Added three new open items to OPEN_ITEMS.md (OI-0017, OI-0018, OI-0019). No spec/schema changes.

---

## OPEN_ITEMS changes

Three new items already written into OPEN_ITEMS.md. Verify the file on disk matches before committing.

- **OI-0017 (P2, CP-25/26)** — Product add dialog missing unit-of-measure selection (feed items and health products). UI wiring only; fields exist in entity specs (F6 feed_items.default_unit, H3 health_products.default_dose_unit_id).
- **OI-0018 (P2, CP-13/03)** — Sync status only at bottom of Settings; needs compact indicator in app header. Reuse existing store sync state; tap opens Settings sync panel.
- **OI-0019 (P2, CP-03, DESIGN COORDINATION)** — No logout affordance in header; v1 parity regression. Shares header real estate with OI-0015 (farm picker). Design together.

Change Log row for 2026-04-13 (second) added covering these three additions.

---

## Work Items (ordered)

### 0. MANDATORY FIRST — Commit and push the OPEN_ITEMS + brief changes

```bash
cd /Users/timjoseph/Github/GTHO-v2
git status                    # should show OPEN_ITEMS.md and this brief modified, plus new brief
git add OPEN_ITEMS.md session_briefs/SESSION_BRIEF_2026-04-13_cleanup-items-followup.md
git commit -m "docs: add OI-0017 (product unit selection), OI-0018 (header sync status), OI-0019 (header logout)

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
git push origin main
```

Update PROJECT_CHANGELOG.md with one row for the doc commit.

---

### 1. Resolve OI-0011 — feed screen metrics

Three metrics on the feed screen still show placeholders: daily run rate, DM on hand, days on hand. Registered calcs exist (FED-1 and friends) — they just aren't wired into the render. Scope is feed screen only; no schema change.

Commit: `feat: wire feed screen metrics to calcs (closes OI-0011)`.

---

### 2. Resolve OI-0014 — manure volumeKg placeholder

Event close currently writes a placeholder for `manure_transaction.volumeKg`. Verify the Phase 3.4 reports consumer will read through the registered calc (not the stored column):
- If reports use the calc: leave placeholder, add a code comment pointing to the calc, close OI-0014 with that note.
- If reports read the column directly: compute and write the real value at event close.

Verify-then-fix. If the fix is non-trivial, append findings to OI-0014 and defer to a checkpoint.

---

### 3. Resolve OI-0016 — dose units CRUD

Add dose unit add/edit/archive UI in `src/features/health/reference-tables.js`, following the existing pattern for categories and types. Fields per V2_SCHEMA_DESIGN.md D9 dose_units. No schema change — table exists. Seed data stays; users can now extend.

**Sequence before Work Item 5** so product dialogs have the CRUD escape hatch.

Commit: `feat: dose units CRUD (closes OI-0016)`.

---

### 4. Resolve OI-0018 — sync status in app header

Add compact sync indicator to the header (top bar). States: idle/synced, syncing (spinner), offline (cloud-off icon), error (red dot). Tap opens the Settings sync panel. Reuse existing store sync state — no duplicate logic. Update V2_DESIGN_SYSTEM.md §3.6 header component notes if not already covered.

Commit: `feat: sync status indicator in app header (closes OI-0018)`.

---

### 5. Resolve OI-0017 — product add dialog unit selection

Add unit-of-measure field to both product create sheets:
- Feed items — pull from feed unit list (kg/lb/bag/ton).
- Health products — pull from dose_units (ml/cc/mg/g/tab/...).

UI wiring only. Validate on save; display uses the selected unit everywhere quantity is shown.

**Depends on Work Item 3** (dose units CRUD).

Commit: `feat: product add dialogs expose unit selection (closes OI-0017)`.

---

## Deferred — DESIGN REQUIRED, do not build this session

- **OI-0015** — Header: operation name + farm picker. Needs Tim's sign-off on approach (per-user active farm vs per-device, "All farms" option, switch-confirmation).
- **OI-0019** — Logout affordance in header (v1 parity). Design together with OI-0015 — same header real estate, same "who am I working as" concern.

---

## Also deferred — pick up later

- **OI-0012** — Calc test coverage (~10 new tests). Skip unless time remains.
- **OI-0013** — Calc reference description spot-check against V2_CALCULATION_SPEC.md. Skip unless time remains.
- **OI-0008** — Location picker recovering section. Blocked by survey data flow; will resolve naturally.

---

## Context

- Phase 3.3 complete. 563 tests passing.
- Phase 3.4 kickoff (CP-54 rotation calendar) is next after this cleanup batch.
- CLAUDE.md rules still apply: scoped changes only, root cause fixes, one work item per commit, `npx vitest run` before committing.

---

## What's next after this session

1. Cowork design session for OI-0015 + OI-0019 (header IA).
2. **CP-54: Rotation calendar** — Phase 3.4.
3. **CP-55–57:** Export/import, v1 migration tool.
4. Pick up OI-0012, OI-0013 when convenient.
