# OI-0236 — Animals filter cascade (groups → species → class → status)

**Date:** 2026-11-20 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC LOCKED** (Tim, 2026-11-20 ~5:02 AM ET, via Orchestrator, card answers). Ready for docs land, then Build handoff. No migration.
**Base:** Forgejo `main` `82e7080` (includes OI-0235 as-built). As-built filter UI: `src/features/animals/index.js` `renderFilterHeader` (OI-0164 + OI-0235).
**Related:** OI-0235 (class + Open / Confirmed bred — **F1 mutual exclusivity and F3 every-class listing are superseded for this cascade by R3 / R5**), OI-0164 (All / group / Culls — exclusivity superseded by R3 multi-select with the All/Culls rules below), OI-0099, OI-0232 / OI-0234.

## 1. Why (Tim's ask)

Tim, 2026-11-20 ~4:56 AM ET, via Orchestrator: organize Animals filter pills — groups at top with All; species (All + only species present); class filtered by species; Open/bred filtered by prior sex; search under pills within selection; Reset to all.

## 2. As-built before this OI (OI-0235 / OI-0164)

1. Lifecycle row: **All** | per-group chips | **Culls** — mutually exclusive.
2. Class row: every non-archived class, multi OR (F3).
3. Status: Open / Confirmed bred — mutually exclusive (F1); AND with class.
4. Search below chips.

No species row. Animals have `sex`; classes have `species`.

## 3. Locked layout (R1–R8)

**Four stacked horizontal-scroll chip rows** (`.agc-chip` pills — R7), then search + **Reset** + **Clear search** (R8). Same on iPhone Home Screen and Mac Dock (R6).

1. **Groups** (multi-select — R3; All/Culls rules in §4)
2. **Species** — All, then only species present in the current lifecycle pool (R4)
3. **Class** — only classes that currently have animals (R5); narrowed by species when species selected
4. **Open / Confirmed bred** — shown only when rows 1–3 leave ≥1 female (`animals.sex === 'female'`); hide and clear when none (R1). Multi-select (R3; both = OR, §4)

Visual: keep filter **chips** in the header. The 2-column group **cards** stay in the Groups section below (R7 — Design recommendation; Tim's "group cards to the top" means the group **filter** row is first — when showing Tim an as-built screenshot, make that chip row vs cards distinction obvious).

## 4. R3 multi-select rules (Design resolution of Tim's "everything multi-select")

Tim, 2026-11-20 ~5:02 AM ET, via Orchestrator: Groups, Species, Class, and Status are **all multi-select** (overrides Design's exclusive Groups / F1 status recommendation).

### 4.1 Groups row — All and Culls

- **Group chips:** multi-select **OR** — an animal matches if it is an active member of **any** selected group.
- **All:** means "all active animals" (no group filter, not culls). **All is selected exactly when no group chip and Culls are selected** (default). Tapping **All** clears every group chip and Culls. Tapping any **group** or **Culls** deselects All.
- **Culls:** culled-only view (`active === false`). **Mutually exclusive with All and with every group chip** — tapping Culls clears All + all groups; tapping a group or All clears Culls. (Mixing culls with live groups would OR two lifecycles; not useful. Locked here as Design resolution of R3.)

This replaces OI-0164 single-`selectedFilter` exclusivity among All / one group / Culls, except All and Culls remain exclusive clear/lifecycle chips as above.

### 4.2 Species row

- **All** = no species filter (selected when no species chips are on). Tapping All clears species chips; tapping a species deselects All.
- Species chips: multi-select **OR** on `animal_classes.species` of the animal's class.
- Species listed = distinct species among animals in the **current Groups-row result** (R4): if All → active animals; if groups selected → active members of those groups; if Culls → culls.

### 4.3 Class row

- Multi-select **OR** on `class_id` (unchanged combination).
- **Show only classes that currently have ≥1 animal** in the result of Groups + Species (R5). **Overrides OI-0235 F3** (every non-archived class) for this cascade.
- When Species = All and Groups = All: classes that have ≥1 active animal.
- Empty selection of class chips = no class filter (all classes in the visible set pass).

### 4.4 Status row — Open and Confirmed bred

- Multi-select (R3; **supersedes OI-0235 F1** mutual exclusivity for this cascade).
- **Neither** selected → no status filter.
- **One** selected → that filter (`confirmed_bred` true / not true), same field semantics and F2 label **"Confirmed bred"**.
- **Both** selected → **OR** (Open OR Confirmed bred) → every animal in the prior rows (no further narrowing on `confirmed_bred`). Documented; not an error state.
- Row visibility still gated by R1 (females in rows 1–3).

### 4.5 Clear-on-parent-change (R2)

When a parent row changes, drop child selections that are no longer valid (species not in new pool; classes not in new visible set; if status row would hide, clear status). **Search text stays** until Clear search (Reset does **not** clear search — R8).

### 4.6 Search + Reset + Clear search (R8)

- **Search:** under the four rows; filters by tag / EID / name / class **within** the combined pill result.
- **Reset:** sets every filter row back to **All** (clears group/species/class/status selections; All chips on). Does **not** clear search.
- **Clear search:** clears only the search box.
- Two separate controls.

## 5. Filter pipeline

1. Groups row (§4.1) → lifecycle / group set  
2. Species OR (§4.2)  
3. Class OR (§4.3)  
4. Status OR / single / none (§4.4)  
5. Search within that set  

## 6. Locked answers (R1–R8)

Tim, 2026-11-20 ~5:02 AM ET, via Orchestrator (card), except R7 (Design recommendation Tim was told we'd use) and R3 All/Culls/status-both detail (Design resolution of his multi-select lock):

| Id | Locked answer |
|---|---|
| **R1** | Show Open / Confirmed bred only when Groups+Species+Class includes ≥1 female (`sex === 'female'`); hide and clear when none. **No new sex row.** |
| **R2** | Yes — clear invalid children when a parent changes; search stays until Clear search / user edit (Reset does not clear search — R8). |
| **R3** | **Everything multi-select** (Groups, Species, Class, Status). All/Culls and both-status rules in §4.1 and §4.4. |
| **R4** | Distinct species among animals in the current Groups-row (lifecycle) filter — not the whole class library. |
| **R5** | **Only classes that currently have animals** (in Groups+Species result). Overrides F3 for this cascade. |
| **R6** | Same four stacked horizontal-scroll rows + search/Reset/Clear search on iPhone and Mac. |
| **R7** | Filter **chips** in the header; group **cards** stay in the section below. (Screenshot for Tim should make chip row vs cards obvious — his ask said "group cards to the top.") |
| **R8** | **Separate Reset and Clear search.** Reset → every row back to All. Clear search → search only. |

## 7. Acceptance

1. Four chip rows in order; search + Reset + Clear search under them.
2. Groups multi OR; All / Culls per §4.1; Species per R4; Class only classes with animals (R5); Status per §4.4 + R1.
3. Parent change clears invalid children (R2).
4. Reset vs Clear search behave per R8.
5. Same layout phone and Mac (R6).
6. Docs landed; no `src/` in docs land. No migration.

## 8. Docs plan / handoff

Docs-only land this brief + OPEN_ITEMS + V2_UX_FLOWS §15.0 + STATUS/CHANGELOG + DOCS_MAP. Then hand GTHO Build. Build PR cites docs land under OI-0231 Docs map rule. Supersedes OI-0235 F1/F3 **for the Animals filter cascade only**; F2 label and `confirmed_bred` field semantics unchanged.

## 9. Origin

- Tim, 2026-11-20 ~4:56 AM ET (ask) and ~5:02 AM ET (R1–R8 card), via Orchestrator.
