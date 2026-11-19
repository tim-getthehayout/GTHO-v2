# OI-0235 — Animals screen multi-select class and status filters

**Date:** 2026-11-19 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC LOCKED (F1–F3) — ready for Build handoff.** Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator, locked F1–F3 (including F2 pill label **"Confirmed bred"**, not "Confirmed pregnant"). Parent docs land `f0122cdb` approved same morning. No migration. No data change.
**Base:** Forgejo `main` `f0122cdb` (answers commit parents that tip). As-built filter UI read on `1e3acafa` from `src/features/animals/index.js` (OI-0164 chip bar) and V2_UX_FLOWS §15.0. "Open" meaning grounded in `src/features/assistant/farm-reads.js` (`confirmedBred === false`).
**Related:** OI-0234 (May 1 backfill — why Open vs Confirmed matters after the marks land), OI-0232 (confirmed-bred date), OI-0164 (Culls chip / lifecycle filter), OI-0099 (`confirmed_bred`).

## 1. Why (Tim's ask)

Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator: filters by class on the Animals screen; ability to use **multiple at the same time** (example: Cows + Heifers + confirmed bred); an **"Open" pill** that excludes confirmed bred (so cows that calved — mark cleared — show there). Pill label locked later the same morning as **"Confirmed bred"** (F2), matching the Edit Animal checkbox — not "Confirmed pregnant".

## 2. As-built today (do not replace)

V2_UX_FLOWS §15.0 / `src/features/animals/index.js`:

- One chip row (`.agc-chips` in `filterWrap`): **All** | **per-group chips** | **Culls (N)** (OI-0164).
- Those three families are **mutually exclusive** via a single `selectedFilter` (`null` / group id / `'__culls'`).
- Search bar filters by tag, EID, name, or class **within** the current lifecycle selection.
- No class pills and no Open / Confirmed bred pills today.

**This OI extends that same filter header.** Do not invent a second unrelated filter bar elsewhere on the screen.

## 3. New pills

### 3.1 Class pills (multi-select) — F3 locked

- One pill per **non-archived** `animal_classes` row for the operation (label = `animal_classes.name`; identity for filtering = `animals.class_id`). **F3 locked (Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator): show every non-archived class** (not only breedable roles).
- Multi-select: tapping a class pill toggles it. Several may be active together (e.g. Cows + Heifers).
- **Combination among classes: OR.** An animal matches if its `class_id` is in the selected class set.
- With **no** class pill selected: class filter is inactive (all classes pass), same as today aside from lifecycle + search + status.

### 3.2 Status pills — F2 locked

- **Confirmed bred** (pill label locked — **not** "Confirmed pregnant"; same wording as the Edit Animal checkbox "Confirmed bred"): `animals.confirmed_bred IS TRUE`. Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator (F2).
- **Open:** `animals.confirmed_bred IS NOT TRUE` (same sense as assistant farm-reads open set). After OI-0232 Q2 / calving-clears-tick ships, cows that calved show here because the mark is cleared.

### 3.3 How pills combine

**Classes OR together; status pills AND with the class set.**

Working rule for the list:

1. Start from the existing lifecycle selection (All = active only; a group = active members of that group; Culls = `active = false`). **Unchanged (OI-0164).**
2. If any class pills are selected: keep animals whose class is in that set (**OR**).
3. If a status pill is selected: keep animals that also match that status (**AND** with the result of 1–2).
4. Search still narrows within that result.

### 3.4 Open and Confirmed bred — F1 locked

**Mutually exclusive** status pair (Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator): tapping one selects it and clears the other; tapping the active one clears status filtering. Open and Confirmed bred partition the herd on `confirmed_bred`; both at once would be empty under an AND reading.

## 4. UI placement

- Add the new pills **in the existing Animals filter header** (`renderFilterHeader` / `.agc-chips` area), below or wrapping under the lifecycle chip row so phone layout stays usable.
- Visual: reuse `.agc-chip` / `.agc-chip.active` patterns; class pills and status pills should be visually grouped (e.g. a second chip row or a labelled wrap) so they are not confused with the exclusive All / group / Culls row.
- Counts on pills are optional; not required for v1 of this OI.
- No schema change. No new tables.

## 5. Acceptance

1. User can select Cows + Heifers + **Confirmed bred** and see only active (or current lifecycle) animals in those classes with `confirmed_bred = true`.
2. Open pill alone shows animals with `confirmed_bred` false within the current lifecycle selection (and class selection if any).
3. All / group / Culls exclusivity from OI-0164 still holds.
4. Search still works inside the combined filter.
5. Open and Confirmed bred are mutually exclusive (F1).
6. Status pill label is exactly **Confirmed bred** (F2) — never "Confirmed pregnant" in UI copy for this pill.
7. Class pills list every non-archived class (F3).
8. Docs: V2_UX_FLOWS §15.0 updated; no `src/` in the docs land.

## 6. Locked answers (F1–F3)

Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator:

| Id | Locked answer |
|---|---|
| **F1** | Open and Confirmed bred are **mutually exclusive**. |
| **F2** | Pill label is **"Confirmed bred"** — **not** "Confirmed pregnant". Filter still reads `confirmed_bred`. |
| **F3** | Show **every non-archived class** as a class pill. |

## 7. Origin

- Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator (multi-select class filters + Open pill).
- Tim, 2026-11-19 ~6:53 AM ET, via Orchestrator (F1 mutually exclusive; F2 label "Confirmed bred"; F3 every non-archived class; land yes for `f0122cdb`).
