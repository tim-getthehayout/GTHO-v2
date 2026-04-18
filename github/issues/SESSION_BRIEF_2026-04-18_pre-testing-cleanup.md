# SESSION BRIEF — Pre-Testing Cleanup Bundle (2026-04-18)

**Goal:** clear the visible-bug backlog that's been polluting Tim's field-testing sessions so he can resume basic testing without tripping over known, already-spec'd UI issues.

**Four OIs in scope:**

| OI | Priority | Area | Spec file |
|---|---|---|---|
| OI-0072 | P1 | Feed Check + Deliver Feed dialogs — v1 parity rebuild | `github/issues/feed-check-ui-v1-parity.md` |
| OI-0074 | P2 | Event Detail action buttons — layout + missing CSS | `github/issues/BUG_event-detail-action-buttons.md` |
| OI-0075 | P2 | Dashboard Locations tab — 7 display bugs | `github/issues/BUG_locations-tab-display-fixes.md` |
| OI-0066 | P3 | Per-group Move on dashboard card — scope to group, not event | (inline spec in this brief — no separate file) |

---

## IMPORTANT: Verify Before Building

Tim's note: **some of these may already be partially or fully built from earlier sessions that didn't get closed out.** Before starting any implementation work, run a state audit:

For each OI, do this first:

1. **Read the spec file** (or the inline spec for OI-0066).
2. **Grep / read the referenced source files** and check which acceptance criteria are already met.
3. **Run `npx vitest run`** on the relevant test files (if they exist) to see current state.
4. **Categorize the OI as one of:**
   - **Already done** — every acceptance criterion met, tests exist and pass → just update OPEN_ITEMS.md status to closed with the current-session commit hash and close the GH issue if one exists.
   - **Partially done** — some criteria met, gaps remain → build only the gaps. Note what was already in place in the commit message.
   - **Untouched** — build from the spec file.

Record the audit result for each OI at the top of your commit message so Tim has visibility into what was newly built vs. already-in-place. Example: `"OI-0074: already shipped commit abc123 2026-04-17 — this commit only closes OI entry + GH issue"`.

**Why this matters:** CLAUDE.md §"Corrections to Already-Built Code" requires logging corrective work in OPEN_ITEMS.md before the fix. This audit is the pre-fix log. If you find unrelated drift (code that diverges from the current spec docs), flag it in OPEN_ITEMS.md rather than silently correcting it.

---

## OI-0072 — Feed Dialogs V1 Parity (P1)

**Spec:** `github/issues/feed-check-ui-v1-parity.md` — full v1 HTML, CSS, and interaction patterns extracted.

**Scope:** both `src/features/feed/check.js` (Feed Check dialog) and `src/features/feed/delivery.js` (Deliver Feed dialog). Plus a global `.sheet-panel` CSS fix in `src/styles/main.css` (Part 0 of the spec — applies to every sheet in the app, not just these two).

**Key acceptance checks to run against the current code:**

- Feed Check dialog: does it have the stepper + slider + percentage triple-sync control? Does it show the consumed-since-last-check banner?
- Deliver Feed dialog: tap-to-select batch cards? Inline quantity steppers on each selected batch? Multi-batch support? Feed-type grouping of unselected batches? Live DMI + cost summary?
- Global: does `.sheet-panel` match v1 sizing (`width: min(92vw, 680px)`, `padding: 16px 16px 24px`, vertically centered)?

**Testing priority:** this is the one Tim will hit most often during basic testing (feed flows are daily), so make sure the build is complete here even if the other three are partial.

**CP-55/CP-56 impact:** none.

---

## OI-0074 — Event Detail Action Buttons (P2)

**Spec:** `github/issues/BUG_event-detail-action-buttons.md` — v1 HTML extracted at index.html lines 22295–22309.

**Scope:** `src/features/events/detail.js` → `renderActions()`. Replace the flat flex row with the three-tier v1 layout:

1. Primary row: Save & recalculate (green, flex:2) + Cancel (outline, flex:1)
2. Warning: Close this event & move groups (amber, full-width, only for open events)
3. Destructive: Delete event (red, small, left-aligned)

Also: the spec flags undefined CSS classes (`btn-olive`, `btn-danger`, `btn-ghost`). Either wire them up in `src/styles/main.css` or replace them with existing defined classes. Pick whichever is more consistent with the rest of the codebase — grep for existing usages.

**Audit hint:** there's already a `GH-17_event-detail-feed-entry-dm-label.md` that shipped today on a different part of the same sheet — check whether the action-button fix went in alongside it.

**CP-55/CP-56 impact:** none.

---

## OI-0075 — Locations Tab Display Bugs (P2)

**Spec:** `github/issues/BUG_locations-tab-display-fixes.md` — seven separate bugs enumerated with v1/v2 comparisons.

**Scope:** `src/features/dashboard/index.js` → `renderLocationCard()` (or equivalent build function for the card). Visual-only; no schema change.

**Seven bugs:**

1. `lbs lbs` double-suffix on weight lines
2. Missing acreage in card header (v1: `D  7.42 ac`)
3. Missing green capacity line (Est. capacity / days remaining / ADA)
4. Badge shows `stored feed` instead of `stored feed & grazing`
5. Stored feed DMI value mismatch with v1
6. No number formatting with commas
7. Empty top stat cards (Pasture %, NPK/Acre, NPK Value)

**Carve-outs explicitly allowed by the spec:** Bug 3 (capacity line) and Bug 5 (stored feed DMI) may depend on DMI-8 (OI-0069) landing first. If the calc isn't wired, show the static portion (forage height, ADA) and mark the dynamic portion as `—`. Flag the partial fix in the commit.

**Audit hint:** there's a prior `SESSION_BRIEF_2026-04-17_locations-screen-v1-parity.md` and a `locations-screen-ui-v1-parity.md` that targeted adjacent display work. Cross-check what landed before starting.

**CP-55/CP-56 impact:** none.

---

## OI-0066 — Per-Group Move Button Scope (P3)

**Status at session start:** open — no spec file exists yet. Inline spec follows.

**Scope:** `src/features/dashboard/index.js` → wherever `renderGroupCard()` / `renderLocationCard()` attaches the per-group Move button click handler. Also touches `src/features/events/move-wizard.js` → `openMoveWizard()` to accept a new scoping parameter.

### Problem

SP-3 added a per-group Move button on each group row inside the dashboard location card. That button currently calls `openMoveWizard(event, operationId)` — the same handler as the card-level "Move all" button. Result: clicking Move on one group row moves **all** groups on that event, not just that group.

V1 behavior (and the desired v2 behavior): the per-group Move scopes the wizard to that specific `event_group_window`, so other groups on the event stay in place.

### Fix

1. **Add a new param to `openMoveWizard`.** Currently: `openMoveWizard(event, operationId, farmId)`. Add: `openMoveWizard(event, operationId, farmId, { scopedGroupWindowId } = {})`. When `scopedGroupWindowId` is present, the wizard is group-scoped instead of event-scoped.

2. **Wire the per-group Move button** in the dashboard card to pass the group window's id:

```js
onClick: () => openMoveWizard(event, operationId, farmId, {
  scopedGroupWindowId: groupWindow.id
})
```

3. **Inside the move wizard**, when `scopedGroupWindowId` is set:
   - Step 1 (source): skip the group picker — that group is pre-selected and locked.
   - Step 4 (close-out): only close the scoped group window. Other open group windows on the source event stay open.
   - Destination event: if the source event has other open groups after this move, **do not close the source event**. The event is only closed when the last group leaves.

4. **"Move all" (card-level)** still calls `openMoveWizard(event, operationId, farmId)` with no scope — full event move, unchanged from today.

### Acceptance criteria

- [ ] Per-group Move button on a card with N groups opens the wizard pre-scoped to that group; other groups are not offered in Step 1.
- [ ] On save, only the scoped group's `event_group_window` gets `dateLeft` stamped; other open windows on the source event stay open with `dateLeft = null`.
- [ ] The source event stays open as long as at least one group window on it is open. It only closes when the last group leaves.
- [ ] Card-level "Move all" behavior is unchanged — tests for it still pass.
- [ ] New test: `tests/unit/features/events/move-wizard.test.js` — "per-group scoped move leaves other group windows open on source event".
- [ ] E2E test: fill two groups on one event → move one group → assert (a) source event still open in Supabase, (b) only one `event_group_window` has `dateLeft` set, (c) other group's window still has `dateLeft = null`.
- [ ] `npx vitest run` clean.

### CP-55/CP-56 impact

None — no schema change, no new fields. Existing `event_group_windows` rows are already the unit of scoping.

### Schema change

None.

### Base doc impact

`V2_UX_FLOWS.md §13` (Move wizard) and `§17.7` (Dashboard card per-group row) need a line added during the next sprint reconciliation noting the scoped variant exists. Not a blocker for this ship — UI_SPRINT_SPEC.md **SP-12** captures this in the open reconciliation items.

---

## Order of Operations

1. **Audit all four.** Produce the state report described above.
2. **Ship OI-0072 first** (highest user-impact during daily testing).
3. **Then OI-0075**, because some of its bugs may surface when Tim tests feed flows.
4. **Then OI-0074**, to make Event Detail navigation clean.
5. **Then OI-0066**, last because it's the smallest-impact and the only one still needing a new spec file.

Individual commits per OI are fine; bundled commit is also fine if they land quickly. Commit messages should name the OI number so PROJECT_CHANGELOG.md lines up.

---

## OPEN_ITEMS changes

Apply these changes to `OPEN_ITEMS.md` **as each OI is completed**:

### If fully shipped in this session:

For each OI (0072, 0074, 0075, 0066), update the `Status:` line to:

```
**Status:** closed — 2026-04-18, commit `<HASH>` (<GH-NN if issued>). <one-line summary of what shipped>. <audit note: "Already-in-place work from commit X found during audit" if applicable>.
```

### If audit shows an OI is already done:

Update the `Status:` line to reflect the earlier commit:

```
**Status:** closed — <earlier date>, commit `<HASH>`. Audited 2026-04-18 — all acceptance criteria met; closed retroactively. <any notes on what differs from the spec, or "implementation matches spec exactly">.
```

### If OI-0075 ships partially (capacity line deferred to DMI-8):

Don't close — update to:

```
**Status:** partial — 2026-04-18, commit `<HASH>`. Bugs 1, 2, 4, 6, 7 shipped. Bugs 3 and 5 (capacity line + stored feed DMI) deferred until DMI-8 (OI-0069) ships.
```

### GH issues:

OI-0072, OI-0074, OI-0075 all have spec files but **no `GH-` prefix** — create GitHub issues for each per CLAUDE.md §"Spec File Handoff (from Cowork)":

```
gh issue create --title "..." --body "$(cat github/issues/FILENAME.md)" --label "..."
mv github/issues/FILENAME.md github/issues/GH-NN_FILENAME.md
```

For OI-0066, the spec is inline in this session brief — create a GitHub issue from the relevant section, or inline the spec into a new `github/issues/per-group-move-scoping.md` first, then file the issue.

---

## Delivery Gate

Before deploying (per CLAUDE.md §Deploy Gate and project-infrastructure:deploy-gate):

- [ ] Audit report for all four OIs written into the first commit message
- [ ] All acceptance criteria for shipped OIs verified (tests + manual where applicable)
- [ ] PROJECT_CHANGELOG.md has one row per OI that shipped in this session
- [ ] OPEN_ITEMS.md updated per the instructions above
- [ ] GH issues created + spec files renamed where needed
- [ ] `npx vitest run` — full suite green
- [ ] No `innerHTML` assignments with dynamic content
- [ ] All user-facing strings use `t()`
- [ ] Pre-commit param-count sanity (store `add`/`update`/`remove` call param counts per CLAUDE.md rule 7)

---

## Files affected (summary)

| OI | Files |
|---|---|
| 0072 | `src/features/feed/check.js`, `src/features/feed/delivery.js`, `src/styles/main.css`, tests |
| 0074 | `src/features/events/detail.js`, possibly `src/styles/main.css`, tests |
| 0075 | `src/features/dashboard/index.js`, tests |
| 0066 | `src/features/events/move-wizard.js`, `src/features/dashboard/index.js`, new unit test, new e2e test |

---

## Related OIs (context for the audit)

- **OI-0073** (closed 2026-04-18) — group placement detection; shipped with OI-0091. Means the dashboard group-card placement logic is already correct before OI-0066 builds on it.
- **OI-0091** (closed) — event window split on state change. Architectural foundation OI-0066 depends on.
- **OI-0069** (open, ready for CC) — DMI-8 daily breakdown calc. OI-0075 bug 3 depends on this.
- **GH-17** (closed today) — event detail feed-entry DM label. Adjacent work to OI-0074.
