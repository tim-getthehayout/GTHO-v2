# Settings → Forage Types Access (V1 Parity)

**Status:** Reconciled into base docs 2026-05-04 (Reconciliation Session C, UX-8 + INFRA-1).
**Type:** UI feature
**Priority:** P1 (field-testing blocker: farmers can't edit forage library post-onboarding)
**Related OI:** OI-0125

## Authoritative spec

The full design lives in **V2_UX_FLOWS.md §20.8 "Forage Types (Reference Library)"**. Read that section before implementing. It covers:

- Settings card placement (between Farm Settings and Field Mode, mirroring v1's order)
- Card anatomy (header + subtitle + `+ Add` button + row list with name + meta line + "seeded" badge + Edit pill + delete `×`)
- Add/Edit sheet fields (name required; DM%; N/P/K kg/t DM; **DM yield density** with imperial `lbs/in/ac` ↔ metric `kg/cm/ha`; Min residual height; Utilization %; Notes)
- Shared unit-aware descriptor pattern with Farm Settings (`src/features/settings/unit-descriptor.js` — single conversion path)
- Store-call signatures with full sync params (CLAUDE.md quality check #7)
- Delete hard-guard against in-use forage types (lists affected paddocks + "View locations" link)
- Empty-state with "seed defaults" link gated by confirm
- Out-of-scope items (archive UI, custom unit labels, forage quality grading)
- No schema / CP-55 / CP-56 impact

The new `dmYieldDensity` unit family (the conversion driving the DM yield input) is documented in **V2_INFRASTRUCTURE.md §1.4 "Unit Families"** — added in the same session. The forward factor `DM_LBS_IN_AC_TO_KG_CM_HA` lives in `src/data/v1-migration.js` (one canonical constant; reuse it in `src/utils/units.js`).

## Why this file exists

Thin pointer for GitHub issue tracking. The full spec is no longer duplicated here per the project's "Specs in base docs, not spec files" rule.
