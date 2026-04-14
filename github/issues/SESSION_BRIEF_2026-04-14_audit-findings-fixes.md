# SESSION BRIEF — Audit Findings Fixes

**Date:** 2026-04-14
**From:** Cowork
**To:** Claude Code
**Context:** Two audit sessions are complete (Tier 1: data integrity, Tier 2: full app). This session fixes the open items found during those audits. OI-0042 (group session mode for health recording) is **deferred to Phase 3.5** — do not build it. All other open findings should be resolved.

**Prerequisite:** Run after the full app audit session commits are pushed.

---

## OPEN_ITEMS changes

Apply before starting implementation:

- **OI-0042** — Update status to: `open — deferred to Phase 3.5 (Polish). Single-animal mode is functional; group iteration is a workflow convenience.`

---

## Fixes

### Fix 1 — OI-0040: Residual Height + Recovery Day Inputs (Move Wizard Close + Event Close)

**What's missing:** V2_UX_FLOWS.md §1 (move wizard Step 3 close-out panel) and §9 (event close) specify residual height, recovery min/max day inputs. These fields are not present in `src/features/events/move-wizard.js` or `src/features/events/close.js`. The close observation is created but without this data.

**Design decision (from Tim):** Whether observation fields are required or optional is controlled by a **farm-level setting** — `farm_settings.recovery_required` (already exists in the schema, migration 001). This matches v1 behavior where `S.settings.recoveryRequired` was a toggle in Settings. **This setting governs ALL pasture observation fields — both pre-graze (open) and post-graze (close) — not just the recovery/residual fields.**

**How v1 does it (reference):** See `index.html` line ~7176 `initRecoveryFields()`:
- Reads `S.settings.recoveryRequired` to determine if fields are required or optional
- Shows a "required" / "optional" badge next to the section header
- Shows/hides asterisks on min/max labels
- Pre-fills from: paddock-specific defaults (from last survey) → farm_settings defaults → hardcoded fallbacks (30/60)
- Validation: if `recoveryRequired` is true, both min and max must be filled. If false, they're accepted but not enforced.

**What to build:**

The `farm_settings.recovery_required` toggle controls validation for observation fields across all surfaces where observations are created. When true, the user must fill in the observation fields to proceed. When false, the fields are shown but optional.

**Pre-graze (open) observation fields** — shown on destination/open panels:
- Forage height (numeric, unit-aware — cm stored, inches displayed if imperial). Label: "Forage Height".
- Forage cover % (numeric, 0–100). Label: "Forage Cover %".

**Post-graze (close) observation fields** — shown on close-out panels:
- Residual height (numeric, unit-aware — cm stored, inches displayed if imperial). Pre-fill from `farmSettings.default_residual_height_cm`.
- Recovery min days (integer). Pre-fill from `farmSettings.default_recovery_min_days`.
- Recovery max days (integer). Pre-fill from `farmSettings.default_recovery_max_days`.

These fields apply to **every surface that creates a paddock observation:**

1. **Move wizard Step 3 — close-out panel** (`src/features/events/move-wizard.js`): Add post-graze fields (residual height, recovery min/max) to the source paddock close section. Show "Required" or "Optional" indicator based on `farmSettings.recovery_required`.

2. **Move wizard Step 3 — destination panel** (`src/features/events/move-wizard.js`): Add pre-graze fields (forage height, forage cover %) to the destination section.

3. **Event close** (`src/features/events/close.js`): Add post-graze fields to the close panel for each paddock window being closed.

4. **Sub-move open** (`src/features/events/submove.js`): If sub-move creates an open observation, add pre-graze fields.

5. **Sub-move close** (`src/features/events/submove.js`): If sub-move creates a close observation, add post-graze fields.

6. **Settings screen** (`src/features/settings/index.js`): Verify `recovery_required` toggle exists and is wired to `farm_settings`. If not present, add it alongside the existing farm settings fields. Also verify `default_recovery_min_days`, `default_recovery_max_days`, and `default_residual_height_cm` are editable in Settings.

**Validation rule:** When `farm_settings.recovery_required = true`, all observation fields on the relevant panel (pre-graze or post-graze) must have values. When `false`, fields are shown but the user can skip them.

**On save:** Pass field values to the observation record: `paddock_observations.forage_height_cm`, `.forage_cover_pct` (for open observations) and `paddock_observations.residual_height_cm`, `.recovery_min_days`, `.recovery_max_days` (for close observations).

**All strings through `t()`.** Add i18n keys for: "Forage Height", "Forage Cover %", "Residual Height", "Recovery Min Days", "Recovery Max Days", "Required", "Optional".

**Schema:** No migration needed — `paddock_observations` already has all five columns (`forage_height_cm`, `forage_cover_pct`, `residual_height_cm`, `recovery_min_days`, `recovery_max_days` — migration 006). `farm_settings` already has `recovery_required`, `default_recovery_min_days`, `default_recovery_max_days`, `default_residual_height_cm` (migration 001).

**Tests:** Add unit tests verifying: (a) open observation created with forage height/cover values, (b) close observation created with residual/recovery values, (c) validation enforced on both pre-graze and post-graze fields when `recovery_required=true`, (d) validation skipped when `recovery_required=false`.

---

*OI-0041 (pre-graze observation fields) is merged into Fix 1 above — same feature, same farm-level setting.*

---

### Fix 2 — OI-0043: Field Mode Tile Navigation Targets

**What's wrong:** V2_UX_FLOWS.md §16 says "Feed Animals" tile should open the Feed Delivery sheet and "Harvest" tile should open the Harvest Recording sheet. Currently they navigate to `#/events` and `#/feed` respectively — full screen views instead of direct-to-action sheets.

**What to build:**

1. In `src/features/field-mode/index.js`, update the tile tap handlers:
   - "Feed Animals" → open the feed delivery sheet directly (the sheet rendered by `src/features/feed/delivery.js`). If the sheet needs a context (e.g., an active event), show a picker first.
   - "Harvest" → open the harvest recording sheet directly (`src/features/harvest/index.js`). Same — if context is needed, show a picker.

2. If the sheets cannot be opened without their parent screen being rendered, the cleanest fix is: navigate to the parent screen AND immediately open the sheet. For example: `router.navigate('#/feed'); openDeliverySheet();`. This avoids building an event bus while still giving the user the direct-to-action experience.

**Tests:** Verify the correct sheet opens from each field mode tile.

---

### Fix 3 — OI-0045: Dead Export Removal

**What:** `src/utils/date-utils.js` exports `daysBetweenExact()` which is never imported anywhere.

**Fix:** Remove the function and its export. Verify no tests reference it. If tests exist for it, remove those too.

---

### Fix 4 — OI-0046: App Header Missing "Get The Hay Out" Name

**What:** The app header shows operation name + farm picker but no app name. v1 displays "Get The Hay Out" prominently.

**Fix:** In `src/ui/header.js`, add "Get The Hay Out" as a text element above the operation name. Style it visually secondary — smaller font size, lighter weight or muted color (use design tokens: `--text-secondary` or similar). It should not compete with the operation name or farm picker for visual hierarchy.

**i18n:** Add `t('app.name')` → "Get The Hay Out" to `en.json`.

---

## After all fixes

1. Run `npx vitest run` — all tests must pass.
2. Close OI-0040, OI-0041, OI-0043, OI-0045, OI-0046 in OPEN_ITEMS.md with resolution summaries.
3. Update OI-0042 status to deferred per the OPEN_ITEMS change above.
4. Commit all changes.
5. Summary line in final commit: `Audit findings fixes: OI-0040/41/43/45/46 closed, OI-0042 deferred`
