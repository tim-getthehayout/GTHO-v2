# Feedback & Help Buttons in Header (SP-6)

**Labels:** `ui`, `feature`, `header`
**Sprint:** UI Improvements (2026-04-17)
**Full spec:** `UI_SPRINT_SPEC.md` → SP-6

## Summary

Add a compact sub-row below the existing header row with two right-aligned buttons: "Feedback" and "Get Help". Each opens its own pre-configured sheet (no type toggle like v1). Replaces the v1 floating action button.

## What to Build

1. **Header sub-row** — 28px height, right-aligned, two `btn btn-outline btn-xs` buttons with emoji prefixes. Hidden in Field Mode.
2. **Feedback sheet** — `type='feedback'` pre-set. Fields: context tag (auto), category pills (all 7), area dropdown (v2 screen names), note textarea. No priority field.
3. **Get Help sheet** — `type='support'` pre-set. Fields: context tag (auto), category pills (**4 only: Roadblock, Bug, Calculation, Question** — drop UX friction, Missing feature, Idea), area dropdown, priority dropdown (always visible), note textarea.
4. Both sheets write to the `submissions` entity/table with the correct `type` value.

## Key References

- **SP-6 full spec** (layout, button specs, responsive behavior, v1 HTML reference, CSS): `UI_SPRINT_SPEC.md`
- **V2_UX_FLOWS.md §17.2** — header bar spec (updated with sub-row reference)
- **V2_SCHEMA_DESIGN.md §11.2** — `submissions` table (no changes needed)
- **v1 dialog HTML** extracted in SP-6 — use as parity reference, build with `el()` DOM builder

## Acceptance Criteria

See SP-6 in `UI_SPRINT_SPEC.md` for the full checklist (12 items).

## Schema Impact

None. Uses existing `submissions` table.

## CP-55/CP-56 Impact

None.
