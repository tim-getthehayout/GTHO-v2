# OI-0236 — Animals filter cascade (groups → species → class → status)

**Date:** 2026-11-20 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC LOCKED** (Tim ~5:02 AM ET R1–R8; **R7 revised** Tim ~5:05 AM ET — large group cards as Groups filter row). Prior tip `1e8f177` **ON HOLD** (Tim did not approve). This tip supersedes it for land. No migration.
**Base:** Forgejo `main` `82e7080` (includes OI-0235 as-built). As-built filter UI: `src/features/animals/index.js` `renderFilterHeader` (OI-0164 + OI-0235).
**Related:** OI-0235 (class + Open / Confirmed bred — **F1 mutual exclusivity and F3 every-class listing are superseded for this cascade by R3 / R5**), OI-0164 (All / group / Culls — exclusivity superseded by R3 multi-select with the All/Culls rules below; **active groups 2-column grid relocated into the Groups filter row by R7**), OI-0099, OI-0232 / OI-0234.

## 1. Why (Tim's ask)

Tim, 2026-11-20 ~4:56 AM ET, via Orchestrator: organize Animals filter pills — groups at top with All; species (All + only species present); class filtered by species; Open/bred filtered by prior sex; search under pills within selection; Reset to all. Later: large group cards at the top as the Groups filter.

## 2. As-built before this OI (OI-0235 / OI-0164)

1. Lifecycle row: **All** | per-group chips | **Culls** — mutually exclusive.
2. Class row: every non-archived class, multi OR (F3).
3. Status: Open / Confirmed bred — mutually exclusive (F1); AND with class.
4. Search below chips.
5. Separate **2-column active groups grid** below filters (Edit / Split / Weights on each tile).

No species row. Animals have `sex`; classes have `species`.

## 3. Locked layout (R1–R8)

**Four stacked horizontal-scroll filter rows**, then search + **Reset** + **Clear search** (R8). Same on iPhone Home Screen and Mac Dock (R6): each row is **one horizontal-scroll strip** — **no wrap** into a multi-column grid inside the filter header (scroll sideways on both; Mac may show more tiles before scroll).

1. **Groups** — **large group cards** as the filter row (**R7** Tim ~5:05 AM ET: *"On the group card let's try the large ones at the top."*). Multi-select (R3); All/Culls rules §4.1 / §4.7. **Not** `.agc-chip` pills for this row.
2. **Species** — `.agc-chip` pills: All, then only species in the current Groups-row pool (R4)
3. **Class** — `.agc-chip` pills: only classes that currently have animals (R5); narrowed by species when species selected
4. **Open / Confirmed bred** — `.agc-chip` pills; shown only when rows 1–3 leave ≥1 female (`animals.sex === 'female'`); hide and clear when none (R1). Multi-select (R3; both = OR, §4.4)

## 4. R3 multi-select rules (Design resolution of Tim's "everything multi-select")

Tim, 2026-11-20 ~5:02 AM ET, via Orchestrator: Groups, Species, Class, and Status are **all multi-select**.

### 4.1 Groups row — All and Culls

- **Live group cards:** multi-select **OR** — an animal matches if it is an active member of **any** selected live group.
- **All:** "all active animals" (no group filter, not culls). **Selected exactly when no live group and Culls are selected** (default). Tap **All** → clear every live group + Culls. Tap any **group** or **Culls** → deselect All.
- **Culls:** culled-only (`active === false`). **Mutually exclusive with All and with every live group** — tap Culls → clear All + all groups; tap a group or All → clear Culls.

Replaces OI-0164 single-`selectedFilter` exclusivity among All / one group / Culls, except All and Culls remain exclusive lifecycle tiles.

### 4.2 Species row

- **All** = no species filter (on when no species chips are on). Tap All → clear species; tap a species → deselect All.
- Species chips: multi-select **OR** on `animal_classes.species`.
- Species listed = distinct species among animals in the **current Groups-row result** (R4).

### 4.3 Class row

- Multi-select **OR** on `class_id`.
- **Only classes that currently have ≥1 animal** in Groups + Species (R5). **Overrides OI-0235 F3** for this cascade.
- Empty class selection = no class filter (all visible classes pass).

### 4.4 Status row — Open and Confirmed bred

- Multi-select (R3; **supersedes OI-0235 F1** here).
- Neither → no status filter. One → that filter. **Both → OR** (union; no further `confirmed_bred` narrowing).
- F2 label **"Confirmed bred"** unchanged. Row visibility gated by R1.

### 4.5 Clear-on-parent-change (R2)

Drop invalid child selections when a parent changes. **Search stays** until Clear search (Reset does **not** clear search — R8).

### 4.6 Search + Reset + Clear search (R8)

- **Search:** under the four rows; within the combined filter result.
- **Reset:** every filter row back to **All** (does **not** clear search).
- **Clear search:** search box only.
- Two separate controls.

### 4.7 Groups row = large cards (R7 — Tim ~5:05 AM ET)

Tim: *"On the group card let's try the large ones at the top."* The **large group cards** (OI-0164 tile chrome: colour stripe, name, status, sex breakdown, head / avg weight / DMI, Edit / Split / Weights) **are** the Groups filter row.

**Scroll / wrap (iPhone and Mac):** one **horizontal-scroll** row on both (R6). Cards do **not** wrap into a 2-column grid in the filter header.

**Order:** **All** (leftmost) → live group cards in current display order → **Culls** (rightmost, `Culls (N)`). All and Culls use the same large-tile footprint with distinct styling (e.g. outlined All; Culls with cull accent) so they are not mistaken for live groups.

**Selection look:** tap card **body** toggles filter selection. Selected = accent border + filled selected state (selected-chip language scaled to the card). Multi-select shows every selected live group that way. All / Culls follow §4.1 exclusivity.

**Actions:** Edit / Split / Weights stay as **explicit buttons** on each live group card so tap-to-filter does not collide. All and Culls have no those buttons.

**Lower Groups section:** the separate **2-column active groups grid below the filters goes away** (cards relocated, not duplicated). Animal list + config row stay below. **Archived groups** stay in the archived section below when shown — not in the filter row.

## 5. Filter pipeline

1. Groups row (§4.1 / §4.7) → lifecycle / group set  
2. Species OR (§4.2)  
3. Class OR (§4.3)  
4. Status (§4.4)  
5. Search within that set  

## 6. Locked answers (R1–R8)

Tim ~5:02 AM ET (card); **R7 revised** Tim ~5:05 AM ET. R3 All/Culls/status-both and §4.7 scroll / selection / lower-section = Design resolution of his locks:

| Id | Locked answer |
|---|---|
| **R1** | Show Open / Confirmed bred only when Groups+Species+Class includes ≥1 female; hide and clear when none. **No new sex row.** |
| **R2** | Clear invalid children when a parent changes; search stays until Clear search (Reset does not clear search). |
| **R3** | **Everything multi-select.** All/Culls and both-status rules in §4.1 and §4.4. |
| **R4** | Distinct species among animals in the current Groups-row filter — not the whole class library. |
| **R5** | **Only classes that currently have animals.** Overrides F3 for this cascade. |
| **R6** | Same four stacked horizontal-scroll rows + search/Reset/Clear search on iPhone and Mac. |
| **R7** | **Large group cards** are the top Groups filter row (selectable, multi-select). Species/Class/Status stay chips. Lower active groups grid **removed**. Details §4.7. |
| **R8** | **Separate Reset and Clear search.** Reset → rows to All. Clear search → search only. |

## 7. Acceptance

1. Groups = large cards row (All → groups → Culls); Species/Class/Status = chip rows; search + Reset + Clear search. Lower active groups grid gone; Edit/Split/Weights on live filter cards.
2. Groups multi OR; All / Culls per §4.1; Species R4; Class R5; Status §4.4 + R1.
3. Parent change clears invalid children (R2).
4. Reset vs Clear search per R8.
5. Horizontal-scroll (no wrap) on phone and Mac (R6 / §4.7).
6. Docs landed; no `src/` in docs land. No migration.

## 8. Docs plan / handoff

Docs-only land this brief + OPEN_ITEMS + V2_UX_FLOWS §15.0 + STATUS/CHANGELOG + DOCS_MAP. Then hand GTHO Build. Build PR cites docs land under OI-0231. Supersedes OI-0235 F1/F3 **for this cascade only**; F2 label / `confirmed_bred` semantics unchanged.

## 9. Origin

- Tim, 2026-11-20 ~4:56 AM ET (ask), ~5:02 AM ET (R1–R8 card), ~5:05 AM ET (R7 large cards at top), via Orchestrator.
