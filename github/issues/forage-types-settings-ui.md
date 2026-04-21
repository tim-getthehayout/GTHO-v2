# OI-0125 — Settings > Forage Types access (v1 parity)

**Priority:** P1 (field-testing blocker: farmers can't edit forage library post-onboarding)
**Parent OI:** OI-0125 (`OPEN_ITEMS.md`)
**Linked sprint spec:** `UI_SPRINT_SPEC.md` §SP-13 — full spec lives there during the UI sprint
**Base-doc target at reconciliation:** V2_UX_FLOWS.md §18 Settings (new "Forage Types" subsection, between Farms and Field Mode). V2_INFRASTRUCTURE.md §1 (Units) gets the new `dmYieldDensity` family entry. V2_SCHEMA_DESIGN.md §2.2 already covers `forage_types` — no schema doc change.
**Labels:** feature, settings, v1-parity, P1

## Thin pointer

This is a **thin pointer** during the UI sprint per `CLAUDE.md` §"Active Sprint." The full spec — problem statement, v1 HTML, screen layout, field descriptors, `dmYieldDensity` unit-family definition, list-row design, Edit sheet layout, delete guard, acceptance criteria, and file list — lives in `UI_SPRINT_SPEC.md` §SP-13.

Read SP-13 **before** starting implementation. Do not re-spec from this file alone.

## Why this was flagged P1

Tim opened Settings on 2026-04-20 expecting to adjust forage values and found no UI at all. V2 shipped the `forage_types` table, the `forage-type.js` entity (14 fields — full v1 parity plus `utilizationPct` / `isSeeded` / `archived`), and the onboarding seed step, but never wired the Settings surface that v1 users relied on for post-onboarding edits.

Tim discovered this while investigating a separate symptom — pasture residual defaulting to "1.2" on every Move/sub-move pre-graze surface. Root-cause of **that** symptom is data corruption on `farm_settings.default_residual_height_cm = 3.048 cm` (exactly `1.2 × 2.54`), left over from the pre-OI-0111 Settings unit-conversion bug. That is **not** a code fix — Tim's own Settings → Farm → Residual Height = 4 in + AU Weight = 1000 lbs save will correct the rows. Only OI-0125 (this spec) produces code changes.

## Summary of scope (from SP-13)

- New Settings card between Farms and Field Mode: title, subtitle, `+ Add` button, flat list of forage rows (Name · DM% · seeded badge · Edit/delete controls).
- Edit Forage Type sheet with all 14 entity fields, using the OI-0111 `FARM_FIELD_DESCRIPTORS` unit-aware pattern.
- **New unit family `dmYieldDensity`** in `src/utils/units.js` for `lbs/in/ac ↔ kg/cm/ha` display conversion on `dm_kg_per_cm_per_ha`. This is the only new infrastructure in the spec.
- Delete guard: query `locations` for `forage_type_id = X` before allowing archive; if references exist, surface the count and block or offer re-link.
- Seeded badge on list rows; "Reset to default" affordance on seeded rows.
- Empty-state copy if the farm has zero forage types.
- Full i18n coverage (all labels, buttons, messages via `t()`).

## What **not** to invent

Everything in SP-13 is locked. If Claude Code hits an ambiguity:

1. **Stop.** Don't design around it.
2. Add an OPEN_ITEMS.md entry describing the gap and the question.
3. Ping Tim via session-brief comment or chat.
4. Continue with the unambiguous parts, leaving the ambiguous field unwired.

Most likely ambiguities (pre-empted in SP-13 but flagged here):

- **V1 Edit sheet HTML** — could not be extracted verbatim from the v1 repo within context limits. SP-13 describes the sheet structurally per Tim's screenshot. If the descriptor pattern applied cleanly produces a sheet that **looks different** from the screenshot, flag before shipping.
- **DM/in/ac precision** — SP-13 specifies the conversion factor; round-trip precision on the Edit sheet must match the OI-0111 pattern (no precision loss across save → reload).
- **Archive vs. hard delete** — SP-13 specifies archive (set `archived = true`) with a delete-guard check. Do not hard-delete even if all references are re-linked.

## Schema impact

**NONE.** All 14 columns already exist on `forage_types`. Entity (`src/entities/forage-type.js`) already maps them all. No migration file needed.

Double-check before starting: `grep -n "sbColumn" src/entities/forage-type.js` should show 14 matches. If any FIELDS entry is missing from the spec's field list, flag it.

## CP-55/CP-56 impact

**NONE.** `forage_types` is already in BACKUP_TABLES (`src/data/backup-export.js`) and FK_ORDER (`src/data/backup-import.js`). No column set change, no shape change, no schema_version bump. Backup/restore continues to round-trip as-is.

## Tests (summary — full list in SP-13)

- Entity round-trip test already exists; extend only if a new computed field is added (none planned).
- Unit tests on the new `dmYieldDensity` unit family — round-trip at realistic magnitudes.
- UI-level tests on the list → edit → save → list round trip, including the delete guard.
- One Playwright e2e per CLAUDE.md §E2E rule: create a new forage type via UI, query Supabase directly, assert the row landed.

## After implementation

1. Flip OI-0125's status line in `OPEN_ITEMS.md` to `closed — 2026-04-{day}, commit {hash}` per CLAUDE.md §"Orphan-flip belt-and-braces."
2. File this spec as a GitHub issue and rename to `GH-{N}_forage-types-settings-ui.md` per CLAUDE.md §"Spec File Handoff."
3. Close the issue once the Settings card is deployed and smoke-tested: `gh issue close {N} --comment "Forage Types Settings UI shipped in {hash}; all acceptance criteria met, {N} tests passing."`
4. At sprint reconciliation, convert SP-13 → V2_UX_FLOWS.md §18 "Forage Types" subsection and reduce this file to a pure pointer.

## Commit message template

```
feat(settings): add Forage Types access on Settings screen (OI-0125, SP-13)

V1 Forage Types were editable from Settings; v2 dropped the UI at rebuild
and only seeds nine defaults at onboarding. This adds the missing surface
via a new Settings card + Edit sheet using the OI-0111 unit-aware
descriptor pattern.

New unit family 'dmYieldDensity' added for lbs/in/ac ↔ kg/cm/ha display
conversion on dm_kg_per_cm_per_ha.

All 14 forage_types columns already exist — no schema change, no
CP-55/CP-56 impact.

Files: settings/forage-types.js (new), settings/index.js (wire card),
utils/units.js (+dmYieldDensity family), i18n/en.js (+labels), plus
tests.

+N unit test cases, +1 e2e with Supabase round-trip, suite NNNN → NNNN+N.

OI-0125, UI_SPRINT_SPEC.md §SP-13.
```
