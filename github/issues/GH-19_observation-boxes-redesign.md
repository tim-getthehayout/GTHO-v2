# Observation Boxes Redesign — Pre-Graze / Post-Graze / Survey (big-bang migration)

## Summary

Redesign the pre-graze observation card that ships today as `renderPaddockCard` (from OI-0100), add two new sibling cards (Post-Graze and Survey), and migrate all seven callers across the app to render the new unified boxes. This is the canonical visual treatment for pasture observations going forward — all five contexts (move wizard, sub-move, close event, event detail, survey) share the same look, the same contract, and the same write path.

The redesign is driven by Tim's field testing: the current `renderPaddockCard` UI is correct in content but poor in layout (tall single-column stacks, no grouping, native select for condition, two separate recovery fields, unlabeled quality slider). The new design uses a compact top row, chip-based condition picker, anchored quality slider, and inline bale-ring preview chip.

**Design reference:** `/sessions/happy-dreamy-keller/mnt/App Migration Project/pre-graze-box-mockup.html` — open it to see the three variants, interactive.

## Three Box Variants

### Variant A — Pre-Graze Observations

**Used by:** Move wizard destination (pre-graze), Sub-move Open sheet, Event detail pre-graze panel (editable, replaces today's read-only display)

**Fields, in order:**

| Row | Field | Input | Notes |
|---|---|---|---|
| 1 (top row, compact) | Forage Height | number + "in"/"cm" suffix | ~88px wide |
| 1 (top row, compact) | Forage Cover | number + "%" suffix | ~88px wide, auto-filled when BRC helper active |
| 1 (top row, compact) | Residual Bale Rings<br><small>(Forage Cover % Calculator)</small> | number | ~72px; inline `≈ XX% cover` preview chip beside input when BRC helper active |
| — helper text — | Bale-ring helper | inline text | "Ring diameter {d} ft · paddock {a} ac · auto-computes Forage Cover." when active; fallback copy when not |
| 2 | Relative Forage Quality | range slider 1–100 | anchor labels under track: Poor · Fair · Good · Excellent; color-graded track (red → green); numeric value beside label |
| 3 | Forage Condition | chip group (4 chips) | Poor / Fair / Good / Excellent; single-select; clicking selected chip deselects |
| 4 | Notes | textarea | optional, min-height ~56px |

### Variant B — Post-Graze Observations

**Used by:** Move wizard source (post-graze), Close Event sheet, Sub-move Close sheet, Event detail post-graze panel (editable, replaces today's read-only display)

**Fields, in order:**

| Row | Field | Input | Notes |
|---|---|---|---|
| 1 (top row, compact) | Residual Height | number + "in"/"cm" suffix | ~88px wide |
| 2 | Recovery Window | two numbers joined by "–" + "days" | `[Min] – [Max] days`; Min and Max ~88px each |
| 3 | Notes | textarea | optional, min-height ~56px; **new capability** — no post-graze surface collects notes today |

### Variant C — Survey Observations

**Used by:** Individual Survey sheet, Bulk Survey Entry (renders one per paddock)

**Fields, in order:** Variant A's fields (height, cover, bale-rings, quality, condition) **plus** the Recovery Window row from Variant B, followed by Notes.

**Why this shape:** a survey is a readiness assessment, not a grazing observation — it captures "what's growing here now AND when we expect to come back." Recovery days live in the same row as the pre-graze fields because both pieces of info are needed to make the readiness decision. There is no separate post-graze survey variant.

## Header / Badge Treatment (all three variants)

- Box title left-aligned ("Pre-Graze Observations", "Post-Graze Observations", "Survey Observations")
- `Optional` or `Required` pill right-aligned in the header
- Required pill renders when `farmSettings.recoveryRequired === true` (pre-graze variant only; post-graze and survey stay optional). Required pill styling: amber/warn background. Optional pill styling: green/success background.
- Validation behavior: if required and saving, return `{ valid: false, errors: [...] }` listing the missing primary fields (height + cover for pre-graze). Optional never blocks save.

## Component Contract

Three components, each with the same contract shape so callers don't need bespoke integration code:

```js
const card = renderPreGrazeCard({
  farmSettings,        // { recoveryRequired, baleRingResidueDiameterCm, ... } — required
  paddockAcres,        // number or null; enables BRC helper when non-null
  initialValues,       // { forageHeightCm, forageCoverPct, ..., notes } — optional pre-fill
});
// card.container       — HTMLElement to append into the sheet / panel
// card.getValues()     — returns { forageHeightCm, forageCoverPct, forageQuality, forageCondition, baleRingResidueCount, notes }
// card.validate()      — returns { valid: boolean, errors: string[] }
```

```js
const card = renderPostGrazeCard({
  farmSettings,
  initialValues,
});
// card.getValues()     — returns { postGrazeHeightCm, recoveryMinDays, recoveryMaxDays, notes }
// card.validate()      — always { valid: true, errors: [] } (post-graze never required)
```

```js
const card = renderSurveyCard({
  farmSettings,
  paddockAcres,
  initialValues,
});
// card.getValues()     — returns { forageHeightCm, forageCoverPct, forageQuality, forageCondition, baleRingResidueCount, recoveryMinDays, recoveryMaxDays, notes }
// card.validate()      — same as pre-graze (required iff farmSettings.recoveryRequired)
```

**Implementation note — internal DRY:** extract the shared building blocks (forage-state top row, quality slider, condition chips, recovery-window row, notes textarea, bale-ring helper) into internal sub-renderers. The three public `render*Card` functions are thin compositions. This prevents drift between variants as fields evolve.

**File organization:**

- `src/features/observations/pre-graze-card.js` — exports `renderPreGrazeCard`
- `src/features/observations/post-graze-card.js` — exports `renderPostGrazeCard`
- `src/features/observations/survey-card.js` — exports `renderSurveyCard`
- `src/features/observations/_shared.js` — internal sub-renderers (forage state row, slider, chips, recovery row, bale-ring helper)
- `src/features/observations/paddock-card.js` — **delete** after migration; its one caller (move wizard) is migrated to `renderPreGrazeCard`. Keep git history showing the rename.

## Write Path (authoritative)

**Every caller writes to `paddock_observations`.** The `event_observations` table (migration 021) has zero writers today; this redesign does not change that. Event-originated observations use `source: 'event'`; survey-originated use `source: 'survey'`. Pre-graze rows use `type: 'open'`; post-graze rows use `type: 'close'`.

Event_observations sunsetting is tracked separately as OI-0113 — not part of this spec, but callers here do **not** write to it.

The `paddock_observations.recovery_min_days` and `recovery_max_days` columns are phase-agnostic and already accept values on either `type: 'open'` or `type: 'close'` rows. Survey rows (pre-graze with recovery populated) work without any schema change.

## Caller Integration — 7 Surfaces

Ship all seven in a single commit (big-bang) so the visual rollout is consistent.

| # | Surface | File | Current | Replace with |
|---|---|---|---|---|
| 1 | Move wizard destination | `src/features/events/move-wizard.js` (lines ~387–399) | `renderPaddockCard` | `renderPreGrazeCard` |
| 2 | Move wizard source | `src/features/events/move-wizard.js` (lines ~350–353) | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 3 | Close Event sheet | `src/features/events/close.js` (lines ~117–120) | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 4 | Sub-move Open sheet | `src/features/events/submove.js` (lines ~64–67) | `renderPreGrazeFields` (minimal — **bug**: missing bale-ring, quality, condition, notes) | `renderPreGrazeCard` |
| 5 | Sub-move Close sheet | `src/features/events/submove.js` (lines ~150–182) | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 6 | Survey draft entry (individual + bulk) | `src/features/surveys/index.js` (lines ~297–372) | inline hand-rolled form | `renderSurveyCard` |
| 7 | Event detail pre/post panels | `src/features/events/detail.js` (around the pre-graze and post-graze display blocks) | read-only display (no collection today — Tim's original field-testing complaint) | editable `renderPreGrazeCard` + `renderPostGrazeCard`, one per open paddock window |

**For surface #7 (Event Detail editability) — new behavior:**

Today the event detail view shows observations as read-only tiles. After this ship, each open paddock window in the event gets an editable pre-graze card (reads from the existing paddock_observations row with `type: 'open'`, writes updates through the store). Same for post-graze: each closed paddock window gets an editable post-graze card.

The "one card per paddock window" pattern matches how OI-0107 framed the pre-graze panel. Post-graze follows the same pattern.

**For surface #6 (Survey) — bulk mode:**

Bulk survey renders one `renderSurveyCard` per paddock in the farm. Each card carries its own `paddockAcres` (from the location) so the BRC helper surfaces independently per paddock. Expand/collapse per paddock card is out of scope for this spec — keep the existing bulk-mode scroll list behavior, just swap the inline form for `renderSurveyCard`.

**For surfaces #4 and #5 (Sub-move):**

The sub-move Open sheet migration fixes a current bug — today it only collects height + cover (OI-0110). After this ship, sub-moves collect the full pre-graze set.

## Deprecations

After all seven callers are migrated, delete:

- `src/features/events/observation-fields.js` — `renderPreGrazeFields` and `renderPostGrazeFields` become dead code
- `src/features/observations/paddock-card.js` — `renderPaddockCard` becomes dead code

Verify no remaining imports before deleting. Grep for `renderPreGrazeFields`, `renderPostGrazeFields`, `renderPaddockCard` — should return zero results after the swap.

## Acceptance Criteria

**Visual / layout (all three variants):**

- [ ] Pre-Graze box renders the compact top row (Height · Cover · Residual Bale Rings) with inline `≈ XX% cover` preview chip beside the Rings input when BRC helper is active.
- [ ] Residual Bale Rings label reads "Residual Bale Rings" with "(Forage Cover % Calculator)" in smaller muted text on a second line.
- [ ] Relative Forage Quality slider has anchor labels (Poor / Fair / Good / Excellent) under the track and color-graded fill (red → green). Numeric value shows beside the label, updating live on drag.
- [ ] Forage Condition renders as 4 equal-width chips (Poor / Fair / Good / Excellent), single-select, clicking selected chip deselects.
- [ ] Post-Graze box renders Residual Height (compact top row), Recovery Window (`Min – Max days`), Notes.
- [ ] Survey box renders pre-graze fields + Recovery Window + Notes, in that order.
- [ ] All three variants have title + Optional/Required pill in the header; Required pill only appears on Pre-Graze and Survey when `farmSettings.recoveryRequired === true`.

**Behavior:**

- [ ] BRC-1 auto-fill: typing a ring count with `farmSettings.baleRingResidueDiameterCm` set and `paddockAcres` non-null computes cover via the BRC-1 calc (`src/calcs/survey-bale-ring.js`, imperial-native — the paddock-card converts cm → ft inline before invoking) and populates the Forage Cover field. Preview chip reads `≈ {pct}% cover`.
- [ ] If the BRC helper is unavailable (no diameter or no acres), the ring input still accepts a count but the preview chip greys out and the helper text reads "Set the bale-ring diameter in Settings to auto-compute cover."
- [ ] Required validation: when `farmSettings.recoveryRequired === true`, pre-graze and survey boxes block save if height or cover is empty; post-graze always saves.
- [ ] Live `getValues()` returns all fields for its variant (see Component Contract above). Unset numeric fields return `null`, not `0` or `NaN`.
- [ ] Numeric fields coerce properly: display in imperial or metric per `operations.unitSystem`; store metric (`forageHeightCm`, `postGrazeHeightCm`).

**Caller integration (all 7 surfaces):**

- [ ] Move wizard destination renders `renderPreGrazeCard` (no change in data written; visual only).
- [ ] Move wizard source renders `renderPostGrazeCard` (gains Notes).
- [ ] Close Event sheet renders `renderPostGrazeCard` (gains Notes).
- [ ] Sub-move Open renders `renderPreGrazeCard` (fixes missing fields — OI-0110).
- [ ] Sub-move Close renders `renderPostGrazeCard` (gains Notes).
- [ ] Survey draft entry (individual + bulk) renders `renderSurveyCard`; inline hand-rolled form removed.
- [ ] Event detail pre-graze panel and post-graze panel render editable cards, one per paddock window. Edits persist through the store to `paddock_observations`.

**Write path:**

- [ ] All writes go to `paddock_observations`. No writes to `event_observations` in this change.
- [ ] Survey rows: `type: 'open'`, `source: 'survey'`, with `recovery_min_days` / `recovery_max_days` populated from the survey card.
- [ ] Event rows (pre): `type: 'open'`, `source: 'event'`.
- [ ] Event rows (post): `type: 'close'`, `source: 'event'`.

**Deprecations:**

- [ ] `renderPreGrazeFields` / `renderPostGrazeFields` in `observation-fields.js` are deleted; no remaining imports.
- [ ] `renderPaddockCard` in `paddock-card.js` is deleted; no remaining imports.

**Hygiene:**

- [ ] `npx vitest run` — all unit tests pass.
- [ ] No `innerHTML` assignments with dynamic content.
- [ ] All user-facing strings use `t()` (new i18n keys for anchor labels, chip labels, preview chip, required pill, etc.).
- [ ] No new hardcoded English in the card files.

## Test Plan

**Unit tests (Vitest):**

- [ ] `tests/unit/features/observations/pre-graze-card.test.js` — renders all fields, BRC auto-fill works, required validation gates save, chip selection/deselection, slider updates readout, `getValues()` shape matches contract, metric/imperial conversion on save.
- [ ] `tests/unit/features/observations/post-graze-card.test.js` — renders residual + recovery + notes, `getValues()` shape, always-optional validation.
- [ ] `tests/unit/features/observations/survey-card.test.js` — renders pre-graze fields + recovery + notes, same BRC behavior as pre-graze card, `getValues()` includes recovery fields.
- [ ] `tests/unit/features/observations/_shared.test.js` — shared sub-renderers behave identically when used from any variant.

**Caller smoke tests:**

- [ ] `tests/unit/features/events/submove.test.js` — sub-move Open renders the full pre-graze card, save path writes every field to `paddock_observations`.
- [ ] `tests/unit/features/events/detail.test.js` — event detail renders editable pre/post cards per paddock window, edits persist.
- [ ] `tests/unit/features/surveys/survey-sheet.test.js` — individual + bulk modes render survey cards, save produces correct `paddock_observations` rows with `source: 'survey'`.

**E2E (Playwright) — per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI":**

- [ ] Open a move, fill the pre-graze card on the destination, save, verify the resulting `paddock_observations` row in Supabase has every field (not just the ones the old minimal form captured).
- [ ] Open a sub-move, fill the pre-graze card, save, verify Supabase row.
- [ ] Run a survey (individual mode) for one paddock, fill the card (including recovery days), save, verify Supabase row has `source: 'survey'`, `type: 'open'`, and recovery fields populated.

## Related OIs

- **OI-0107** — Event Detail pre-graze paddock card (superseded by this spec; surface #7)
- **OI-0110** — Sub-move Open paddock card (superseded by this spec; surface #4)
- **OI-0111** — Bale-ring residue diameter rename (ft → cm, metric-internal); see dependency note below
- **OI-0112** — Observation Boxes Redesign (this spec — umbrella)
- **OI-0113** — Sunset `event_observations` table (separate; this spec ensures no new writers)
- **OI-0100** — Embed Survey paddock card as pre-graze observation UI (original paddock card work; this spec supersedes the UI but keeps the contract lineage)

## CP-55/CP-56 Impact

**None.** Pure UI + caller migration. No new Supabase columns. No change to `paddock_observations` shape. Survey rows (pre-graze `type: 'open'` with recovery populated) were already valid against the existing schema — no backup/restore changes.

The `event_observations` table (migration 021) remains in the schema and in the CP-55 export / CP-56 import spec until OI-0112 ships. That's fine — it'll just be an empty table in every backup.

## Notes

**Why dedicated Survey variant (not a flag on Pre-Graze):**

The three variants could be implemented as one component with `{ variant: 'preGraze' | 'postGraze' | 'survey' }`. We're choosing three dedicated components instead because:

1. The public API surfaces the caller's intent clearly (the code says `renderSurveyCard`, not `renderObservationCard({ variant: 'survey' })`).
2. Internal DRY is preserved via the `_shared.js` sub-renderers — so we get one source of truth for field behavior without one-big-component growing `if variant` branches.
3. The `getValues()` return shape differs per variant (post-graze doesn't return `forageHeightCm`; survey adds `recoveryMinDays/Max`). Dedicated components mean TypeScript-style discriminated return shapes are obvious; a flag-based component would either union all fields or type-narrow by variant.

**Why big-bang (not phased rollout):**

Seven surfaces, same visual treatment, same contract. Phasing risks "why does this screen still look different" confusion. The internal contract is small enough that one-shot migration fits in one commit.

**Design decisions locked in:**

- Converge on `paddock_observations` for all writes (Q1 decision).
- Post-graze scope = residual + recovery + notes only (Q2 decision).
- Big-bang migration across all 7 surfaces (Q3 decision).
- Survey is a dedicated third variant, not a flag (Q3 addendum).

**Dependency on OI-0111 (bale-ring field rename):** OI-0111 shipped — `farmSettings.baleRingResidueDiameterFt` is now `baleRingResidueDiameterCm` (metric-internal, migration 027). This spec reads `baleRingResidueDiameterCm` and converts cm → ft inline before invoking BRC-1 (which stays imperial-native per `src/calcs/survey-bale-ring.js`).

**Origin:** Field testing on 2026-04-18. Tim flagged missing bale-ring in Event Detail and Sub-move Open, flagged the Feed entry DMI label bug (OI-0108), flagged the dashboard card button layout (OI-0109). During design, the move wizard pre-graze UI was judged "not good" and a ground-up redesign was scoped. Survey nuance surfaced during the final migration-order decision.
