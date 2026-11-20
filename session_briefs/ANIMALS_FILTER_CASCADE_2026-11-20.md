# OI-0236 — Animals filter cascade (groups → species → class → status)

**Date:** 2026-11-20 | **Owner:** GTHO Design | **For:** GTHO Build (after Tim locks) | **Status:** **PROPOSED** — awaiting Tim answers R1–R8 via Orchestrator. No Build handoff until locked.
**Base:** Forgejo `main` `82e7080` (includes OI-0235 as-built `b3ea6ab` and held migration 046). As-built filter UI: `src/features/animals/index.js` `renderFilterHeader` (OI-0164 lifecycle row + OI-0235 class/status rows + search). Spec grounded in V2_UX_FLOWS §15.0 as built for OI-0235.
**Related:** OI-0235 (class + Open / Confirmed bred), OI-0164 (All / group / Culls), OI-0099 (`confirmed_bred`), OI-0232 / OI-0234 (why Open vs Confirmed bred matters).

## 1. Why (Tim's ask)

Tim, 2026-11-20 ~4:56 AM ET, via Orchestrator (close to verbatim): better organize the filter pills on the Animals form. Bring the **group** filters to the top with an **All** selection; then **species** (All, then only species present in the active animals database); then **class** pills filtered by the species selection; then **Open / bred** filtered by prior selections' sex (if no females, hide Open / pregnant pills). Search sits under all of them and searches within the pill selections. A **Reset** button reverts to all.

Orchestrator reading (accepted as the starting layout): four cascading rows top → bottom, then search + Reset.

## 2. As-built today (OI-0235 / OI-0164 — do not invent a second bar)

V2_UX_FLOWS §15.0 / `src/features/animals/index.js`:

1. **Lifecycle row** (`.agc-chips`): **All** | per-group chips | **Culls (N)** — mutually exclusive (`selectedFilter`).
2. **Class row** (`.agc-chips-secondary`): every non-archived class, multi-select **OR** (`selectedClassIds`).
3. **Status row** (`.agc-chips-secondary`): **Open** / **Confirmed bred** — mutually exclusive (F1); **AND** with class set.
4. **Search** below the chips; narrows by tag / EID / name / class within the combined filter.

There are **no sex pills** and **no species pills** today. Animals already store `sex` (`female` / `male`). Classes store `species` (`beef_cattle` | `dairy_cattle` | `sheep` | `goat` | `other`).

**This OI reorganizes and extends that same filter header.** Do not invent a second unrelated filter bar.

## 3. Proposed layout (pending R1–R8)

**Top → bottom:**

1. **Groups row** — All | group chips | Culls (OI-0164 exclusivity unless Tim changes it in R3).
2. **Species row** — All, then one pill per species **present** in the active pool (R4). Labels: Beef cattle / Dairy cattle / Sheep / Goat / Other (same wording as Add Class / onboarding).
3. **Class row** — class pills **narrowed by** the species selection (and F3 still applies inside that set unless Tim changes it). Combination among visible classes: **OR** (OI-0235).
4. **Status row** — Open / Confirmed bred (F1 + F2 labels unchanged), shown only when the prior selection implies females (R1).
5. **Search + Reset** — search filters within the combined pill result; Reset returns to the default "all" state (R8).

Visual: keep `.agc-chip` / `.agc-chip.active` pills (R7). Each row is its own horizontally scrollable `.agc-chips` strip so phone layout stays usable (R6).

## 4. Filter pipeline (working rule)

Apply in order; each step narrows the previous result:

1. Lifecycle (All = active only; one group = active members; Culls = `active = false`).
2. Species: if any species pills selected, keep animals whose class's `species` is in that set (**OR**). Species = All → no species filter.
3. Class: if any class pills selected, keep animals whose `class_id` is in that set (**OR**).
4. Status: if Open or Confirmed bred selected, AND with `confirmed_bred` (same semantics as OI-0235).
5. Search: tag / EID / name / class text within the result of 1–4.

## 5. Open decisions (R1–R8) — for Tim via Orchestrator

| Id | Question | Design recommendation |
|---|---|---|
| **R1** | Sex: OI-0235 has no sex pills. Tim said Open/bred should respect "prior selections sex." Use animal `sex`, class `role`, or a new sex pill row? | **No new sex row.** Show Open / Confirmed bred only when animals that pass rows 1–3 include ≥1 with `animals.sex === 'female'`. Hide the status row (and clear any status selection) when that set has no females. |
| **R2** | When a parent filter changes, clear child selections that became invalid? | **Yes.** Species change drops selected classes whose species is no longer allowed; if the status row would hide, clear Open/Confirmed. Search text stays until Reset. |
| **R3** | Single- vs multi-select per row? | **Groups:** keep exclusive All \| one group \| Culls (OI-0164). **Species:** All = clear; otherwise multi-select **OR**. **Class:** keep multi **OR** (OI-0235). **Status:** keep F1 exclusive. |
| **R4** | Which animals define "species present"? | Distinct `animal_classes.species` for animals that pass the **current lifecycle** filter (All → active; group → that group's active members; Culls → culls). Not the whole class library. |
| **R5** | Which classes appear after a species pick? | Non-archived classes whose `species` is in the selected species set (or all non-archived classes when Species = All). Empty classes still appear if they match the species (F3 inside the species set). |
| **R6** | Phone (iPhone Home Screen) vs Mac Dock layout? | Same structure both places: four stacked horizontal-scroll rows; search full-width under them; Reset as an outline/text control on the search row (trailing). No separate desktop chrome. |
| **R7** | Tim said "group cards" — chips or the groups grid tiles? | **Keep filter chips** (`.agc-chip`). The 2-column group **cards** stay in the Groups section below. This OI only reorders/cascades the filter header. |
| **R8** | What does Reset clear? | Lifecycle → All; clear species, class, and status selections; clear search. One control. |

## 6. Acceptance (draft — finalize after R1–R8)

1. Four filter rows appear in order: Groups → Species → Class → Status (Status may hide per R1).
2. Species pills list only species present in the lifecycle pool (R4); All clears the species filter.
3. Class pills narrow when a species is selected (R5); class combination stays OR.
4. Open / Confirmed bred keep F1/F2; visibility follows R1; still AND with prior rows.
5. Search sits under the rows and searches only within the combined pill result.
6. Reset returns to All / no species / no class / no status / empty search (R8).
7. Invalid child selections clear on parent change (R2).
8. Works on iPhone Home Screen PWA and Mac Dock with the same stacked rows (R6).
9. Docs: V2_UX_FLOWS §15.0 updated; OPEN_ITEMS / STATUS / CHANGELOG / DOCS_MAP brief link; no `src/` in the docs land.
10. No schema change. No new tables. No migration.

## 7. Docs plan (OI-0231)

- This brief; OPEN_ITEMS OI-0236; V2_UX_FLOWS §15.0 Proposed → As built after merge; PROJECT_STATUS / PROJECT_CHANGELOG; DOCS_MAP `animals/` brief link.
- Docs-only land after Tim locks R1–R8 (Orchestrator → Git Bridge; Tim land yes).
- Build handoff only after locks; Build PR cites this docs branch / landed SHA under the Docs map rule (or includes the doc delta).

## 8. Out of scope

- Edit Animal confirmed-bred date UI (OI-0232 follow-on).
- New sex field or sex pill row (unless Tim picks that in R1).
- Changing Open / Confirmed bred semantics or F2 label.
- Group grid tile redesign.

## 9. Origin

- Tim, 2026-11-20 ~4:56 AM ET, via Orchestrator (Animals filter organization follow-up to OI-0235).
