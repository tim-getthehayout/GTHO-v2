# SESSION BRIEF — SP-9 Bulk Header Missing + Full Audit (2026-04-17)

**For:** Claude Code
**From:** Cowork
**Priority:** High — blocking v1 parity for surveys

---

## What's wrong

Tim opened the bulk survey sheet in v2 after your SP-9 implementation landed. The sheet opens, the paddock list renders correctly (collapsed cards with name + acres + Active badge + chevron), filter pills and search work, **but the entire top action row is missing.**

Six controls that should be visible above the "Survey date" row are all absent:

| Missing control | Position | v1 function it fires |
|---|---|---|
| **Cancel** (red text button, not an outline btn) | Row 1, far left | `_bulkSurveyCancel()` |
| **DRAFT** pill (amber) | Row 1, center-left | purely visual |
| **Expand all** / **Collapse all** | Row 1, center-right | `_toggleBulkSurveyExpandAll()` |
| **Save Draft** (outline sm button) | Row 1, right cluster | `_bulkSurveySaveDraft()` |
| **Finish & Save** (green sm button) | Row 1, right cluster | `_bulkSurveyFinishAndSave()` |
| **✕** (close, saves draft) | Row 1, far right | `closeSurveySheet()` |

Tim confirmed by screenshot against v1. See spec file §6.1 for the exact v1 HTML extraction the implementation should mirror.

---

## What the spec says

`github/issues/GH-{N}_survey-sheet-v1-parity.md` (SP-9) covers this explicitly:

- **§3.1** — Sheet container HTML — includes `#survey-bulk-header` div.
- **§3.2** — `_setSurveySheetMode(mode)` mode switcher — for `mode==='bulk'`: bulk header visible, classic header hidden, `_renderBulkSurveyHeader()` called.
- **§6.1** — Full `_renderBulkSurveyHeader()` v1 HTML extraction — the six missing buttons are all in Row 1 of this function.
- **§6 part 4** — "Bulk chrome" is Part 4 of the 8-part implementation plan in UI_SPRINT_SPEC.md's SP-9 table.
- **§12 acceptance criteria** — bullet 4: *"Bulk header matches v1 exactly: Cancel (red text) · DRAFT tag · Expand/Collapse all · Save Draft · Finish & Save · ✕ · date · farm pills (>1 farm) · type pills · search."*

**This acceptance criterion is not met.** The sheet currently only shows date + farm/type/search pills — the entire action row is missing.

---

## Likely root causes (in priority order)

1. **Mode switcher not firing correctly.** `openBulkSurveySheet()` may be opening the sheet without calling `_setSurveySheetMode('bulk')`, or the v2 equivalent of that function isn't toggling `#survey-bulk-header` visible. Check whether the bulk header div is in the DOM at all (hidden) vs. not rendered.
2. **Part 4 skipped entirely.** The v2 `bulk-header.js` file (per §11 Files to Create) may not have been implemented, even though the other parts landed.
3. **`_renderBulkSurveyHeader()` output missing Row 1.** If the function exists but only emits the date/farm/type/search rows, Row 1 (the button cluster) was skipped during implementation.

---

## Required fix

1. Confirm which root cause applies by inspecting `src/features/surveys/` — is `bulk-header.js` present? Does it render Row 1?
2. Implement (or complete) the bulk header per §6.1. Every button in the table above must be wired to the v2 equivalents of the v1 handlers. Matching behaviour:
   - **Cancel** — confirm "Discard changes from this session?" → restore snapshot → close. Draft row remains in DB.
   - **DRAFT pill** — visual only; amber background/border per the spec CSS.
   - **Expand all / Collapse all** — toggles `_bulkSurveyExpandAll`, re-renders paddock list, label toggles.
   - **Save Draft** — immediate store flush + Supabase sync + "Draft saved." toast.
   - **Finish & Save** — if any paddock unrated → inline confirm bar ("{N} of {M} paddocks have no data — finish anyway?" with "Finish Anyway" / "Go Back"). Otherwise commit.
   - **✕** — silently auto-save draft + close.
3. Verify mode switcher wires correctly: `openBulkSurveySheet()` → `_setSurveySheetMode('bulk')` → bulk header visible, classic header hidden.

---

## Broader audit — check every other part of SP-9

Tim asked for a full audit of the SP-9 implementation to catch anything else that was skipped. Go through the spec section by section and confirm each item:

### Audit checklist (tick each after verifying against the spec)

**Part 1 — Entry points (spec §2)**

- [ ] Locations screen `📋 Survey` button → `openBulkSurveySheet()`
- [ ] Locations → Surveys sub-tab → `+ New Survey` → `openBulkSurveySheet()`
- [ ] Locations → Surveys sub-tab → `Resume` banner button when draft exists
- [ ] Locations → Surveys sub-tab → `Edit` on committed survey row → `openBulkSurveyEdit(id)` (bulk-edit mode)
- [ ] Locations edit sheet → `+ Add reading` (in survey history) → `openSurveySheet(pastureId)` (single mode)
- [ ] Locations edit sheet → existing survey-history row Edit → `openSurveySheet(pastureId, surveyId)` (single mode, pre-populated)
- [ ] Field mode → `Multi-Pasture Survey` tile → `openBulkSurveySheet()`
- [ ] Field mode → `Pasture Survey` tile → `openPastureSurveyPickerSheet()`

**Part 2 — Sheet shell + mode switcher (spec §3)**

- [ ] Single sheet element hosts all three modes
- [ ] `_setSurveySheetMode('bulk')` — bulk header visible, classic hidden, bottom Save button hidden
- [ ] `_setSurveySheetMode('bulk-edit')` — bulk header hidden, classic visible ("Edit survey"), bottom Save visible
- [ ] `_setSurveySheetMode('single')` — bulk header hidden, classic visible ("Survey: {name}"), bottom Save visible

**Part 3 — Paddock card (spec §4)**

- [ ] Collapsed header: name · acres · Active badge · Complete badge (conditional) · rotating chevron
- [ ] Click header toggles expand
- [ ] Rating slider + number input + color bar, all three in sync via `setSurveyRating`
- [ ] Veg height + forage cover inputs (side-by-side)
- [ ] **Bale-ring residues input (NEW)** — see Part 5 below
- [ ] Forage condition — 4 buttons Poor/Fair/Good/Exc.
- [ ] Recovery window — MIN/MAX inputs, date preview under each input, status line below
- [ ] Single mode: context line ("Last grazed X · Yd ago" / "Active · Day N" / "No graze history")
- [ ] `_isBulkSurveyCardComplete(pid)` uses strict v1 rule (rating + vegHeight + forageCover + forageCondition + recoveryMin + recoveryMax). Bale-ring count NOT required.

**Part 4 — Bulk chrome (spec §6)** ⚠ KNOWN REGRESSION

- [ ] Row 1: Cancel · DRAFT · Expand/Collapse · Save Draft · Finish & Save · ✕ (MISSING — see above)
- [ ] Date row
- [ ] Farm pills (only if >1 farm, amber active)
- [ ] Type pills — Pasture / Mixed-Use / All (green active, crop excluded unless explicit)
- [ ] Search input (filters by name or fieldCode)
- [ ] Inline "Finish anyway?" confirm bar when unrated paddocks exist

**Part 5 — Bale-ring helper (spec §5)**

- [ ] Per-paddock number input rendered in expanded card
- [ ] Live caption: `{count} rings × {ringArea} sq ft = {totalArea} sq ft`
- [ ] Second caption: `↳ Sets forage cover to {pct}% (of {paddockArea} sq ft)` when acres > 0
- [ ] Typing a count auto-sets `forageCoverPct` via `survey.baleRingCover` calc (user can override after)
- [ ] Farm setting "Bale-ring residue diameter" present in Settings screen, defaults to 12 ft
- [ ] `registerCalc('survey.baleRingCover', ...)` exists and has unit test covering the math
- [ ] Stored on `paddock_observations.bale_ring_residue_count` on commit

**Part 6 — Draft lifecycle (spec §7)**

- [ ] Every field oninput/onchange triggers immediate localStorage persist + 1s-debounced Supabase sync
- [ ] `closeSurveySheet()` auto-saves draft before closing
- [ ] Resume flow on Surveys sub-tab: amber banner "📋 Survey in progress · {N} paddocks rated" with Resume + Discard
- [ ] Discard from sub-tab deletes survey row + related draft entries from Supabase
- [ ] Cancel in bulk header restores session snapshot (draft row preserved)

**Part 7 — Commit rules (spec §7.2)**

- [ ] `completeBulkSurvey()` / `commitSurvey()`: requires ≥1 rated paddock, alerts otherwise
- [ ] Writes `surveys.status = 'committed'`, clears draft entries
- [ ] One `paddock_observations` row per rated paddock with `source='survey'`, `sourceId=survey.id`
- [ ] Recovery-window inversion — stored event-date-relative (add `daysAlreadyRested` back)
- [ ] Bulk-edit (re-committing a committed survey) replaces prior observations for `(sourceId, pastureId)` — does not append

**Part 8 — Field-mode adaptations (spec §8)**

- [ ] Pasture survey picker sheet exists with farm pills, type pills, search, active-first sort
- [ ] Click row → close picker → `openSurveySheet(pastureId)` single mode
- [ ] Field-mode sheet behaviour: backdrop disabled, handle hidden, close btn = `⌂ Done`
- [ ] `closeSurveySheet()` in field mode calls `_fieldModeGoHome()` after closing

**Schema / migration**

- [ ] Migration 022 written to `supabase/migrations/022_bale_ring_residue_helper.sql`
- [ ] Migration 022 executed against Supabase and verified (column exists on farm_settings)
- [ ] `event_observations.bale_ring_residue_count` verified present (if was missing, 022 added it)
- [ ] `BACKUP_MIGRATIONS[21]` entry added with ring-diameter default of 12.0
- [ ] `operations.schema_version` bumped to 22

**CP-55 / CP-56 spec impact**

- [ ] CP-55 export includes `farm_settings.bale_ring_residue_diameter_ft`
- [ ] CP-56 import defaults missing column to 12.0 for pre-22 backups
- [ ] CP-55 / CP-56 spec file(s) updated per Export/Import Sync Rule

**Tests**

- [ ] Unit: `survey-bale-ring.test.js` — ring area math + cover bounds
- [ ] Unit: `farm-settings.test.js` — new column round-trip
- [ ] Unit: `survey-draft.test.js` — debounce + resume round-trip
- [ ] Unit: `survey-commit.test.js` — recovery inversion + replace-not-append
- [ ] E2E: `surveys-bulk-parity.spec.ts` — verifies Supabase rows, not just UI
- [ ] E2E: `surveys-single-parity.spec.ts`
- [ ] E2E: `surveys-field-mode.spec.ts`

**Docs**

- [ ] PROJECT_CHANGELOG.md row for each commit
- [ ] GitHub issue closed (or still open if audit reveals incomplete work)

---

## OPEN_ITEMS changes

Add this entry to `OPEN_ITEMS.md` **before** starting the fix, per CLAUDE.md "Corrections to Already-Built Code" rule:

```markdown
### OI-0080 — SP-9 Bulk Survey Header Missing + Implementation Audit

**Status:** open — CORRECTION IN PROGRESS
**Priority:** P1 — blocks v1 parity for surveys
**Owner:** Claude Code
**Opened:** 2026-04-17
**Spec:** github/issues/GH-{N}_survey-sheet-v1-parity.md §6.1 and §12

**What is wrong:** After SP-9 landed, the bulk survey sheet is missing its entire top action row. Six controls are absent: Cancel, DRAFT pill, Expand/Collapse all, Save Draft, Finish & Save, ✕ close. Only the date + filter rows render.

**Why it is wrong:** Violates SP-9 acceptance criterion: *"Bulk header matches v1 exactly: Cancel (red text) · DRAFT tag · Expand/Collapse all · Save Draft · Finish & Save · ✕ · date · farm pills (>1 farm) · type pills · search."* Users cannot finish/save or explicitly cancel a bulk survey — only the auto-save-on-close fallback works.

**Correct behavior:** Bulk header must render Row 1 (action buttons) per the `_renderBulkSurveyHeader()` extraction in spec §6.1. Mode switcher must make `#survey-bulk-header` visible when mode is 'bulk'.

**Files likely affected:**
- `src/features/surveys/bulk-header.js` (may not exist — confirm)
- `src/features/surveys/survey-sheet.js` (mode switcher)
- `src/features/surveys/index.js` (entry points)

**Scope expansion:** Tim also asked for a full audit of the SP-9 implementation — see SESSION_BRIEF_2026-04-17_sp9-bulk-header-audit.md for the 8-part checklist covering entry points, mode switcher, paddock card, bulk chrome, bale-ring helper, draft lifecycle, commit rules, field-mode adaptations, schema/migration, CP-55/CP-56, tests, and docs.

**Resolution criteria:**
1. All six missing buttons render and fire the correct handlers
2. Full audit checklist complete — every unchecked item becomes either a follow-up OI or a commit in the same fix session
3. E2E test covers the full bulk flow (open → fill → Finish & Save → Supabase row exists)
```

---

## Sequence for Claude Code

1. **Open OI-0080** in OPEN_ITEMS.md with the entry above.
2. **Audit** — go through the checklist. Report findings before fixing (list which items pass / fail).
3. **Fix the header** (Part 4) first — highest priority, blocks usability.
4. **Fix other audit failures** one by one, in the order above. Each gets its own commit. Don't batch.
5. **Each commit** updates PROJECT_CHANGELOG.md and references OI-0080.
6. **Close OI-0080** when the audit checklist is fully ticked.
7. **Close the SP-9 GitHub issue** if you had closed it prematurely — re-open if needed.

**Do not silently fix and commit.** Tim wants visibility into what was missing and what got corrected. The audit report should be written into the commits or a short reply comment on OI-0080 as you go.
