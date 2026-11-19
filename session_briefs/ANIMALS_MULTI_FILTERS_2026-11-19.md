# OI-0235 — Animals screen multi-select class and status filters

**Date:** 2026-11-19 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC DRAFTED — pending Tim's land yes and F1.** Not handed to Build. No migration. No data change.
**Base:** Forgejo `main` `1e3acafa`. As-built filter UI read from `src/features/animals/index.js` (OI-0164 chip bar) and V2_UX_FLOWS §15.0. "Open" meaning grounded in `src/features/assistant/farm-reads.js` (`confirmedBred === false`).
**Related:** OI-0234 (May 1 backfill — why Open vs Confirmed matters after the marks land), OI-0232 (confirmed-bred date), OI-0164 (Culls chip / lifecycle filter), OI-0099 (`confirmed_bred`).

## 1. Why (Tim's ask)

Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator: filters by class on the Animals screen; ability to use **multiple at the same time** (example: Cows + Heifers + Confirmed pregnant); an **"Open" pill** that excludes confirmed bred (so cows that calved — mark cleared — show there).

## 2. As-built today (do not replace)

V2_UX_FLOWS §15.0 / `src/features/animals/index.js`:

- One chip row (`.agc-chips` in `filterWrap`): **All** | **per-group chips** | **Culls (N)** (OI-0164).
- Those three families are **mutually exclusive** via a single `selectedFilter` (`null` / group id / `'__culls'`).
- Search bar filters by tag, EID, name, or class **within** the current lifecycle selection.
- No class pills and no Open / Confirmed pregnant pills today.

**This OI extends that same filter header.** Do not invent a second unrelated filter bar elsewhere on the screen.

## 3. New pills

### 3.1 Class pills (multi-select)

- One pill per **non-archived** `animal_classes` row for the operation (label = `animal_classes.name`; identity for filtering = `animals.class_id`).
- Multi-select: tapping a class pill toggles it. Several may be active together (e.g. Cows + Heifers).
- **Combination among classes: OR.** An animal matches if its `class_id` is in the selected class set.
- With **no** class pill selected: class filter is inactive (all classes pass), same as today aside from lifecycle + search + status.

### 3.2 Status pills

- **Confirmed pregnant** (or "Confirmed bred" — use the same wording as the Edit Animal checkbox "Confirmed bred"): `animals.confirmed_bred IS TRUE`.
- **Open:** `animals.confirmed_bred IS NOT TRUE` (same sense as assistant farm-reads open set). After OI-0232 Q2 / calving-clears-tick ships, cows that calved show here because the mark is cleared.

### 3.3 How pills combine (locked ask from Orchestrator; Tim's intent)

Orchestrator asked Design to lock: **classes OR together; status pills AND with the class set.**

Working rule for the list:

1. Start from the existing lifecycle selection (All = active only; a group = active members of that group; Culls = `active = false`). **Unchanged (OI-0164).**
2. If any class pills are selected: keep animals whose class is in that set (**OR**).
3. If a status pill is selected: keep animals that also match that status (**AND** with the result of 1–2).
4. Search still narrows within that result.

### 3.4 Selecting both Open and Confirmed pregnant — **open question F1**

**Proposed default:** the two status pills are **mutually exclusive** (tapping one selects it and clears the other; tapping the active one clears status filtering). Rationale: Open and Confirmed partition the herd on `confirmed_bred`; both at once would be empty under an AND reading, which is surprising.

**If Tim prefers both selectable:** under the AND reading the intersection is empty whenever status is stored as a boolean — show the empty state ("No animals match this filter") rather than silently ignoring one pill.

## 4. UI placement

- Add the new pills **in the existing Animals filter header** (`renderFilterHeader` / `.agc-chips` area), below or wrapping under the lifecycle chip row so phone layout stays usable.
- Visual: reuse `.agc-chip` / `.agc-chip.active` patterns; class pills and status pills should be visually grouped (e.g. a second chip row or a labelled wrap) so they are not confused with the exclusive All / group / Culls row.
- Counts on pills are optional; not required for v1 of this OI.
- No schema change. No new tables.

## 5. Acceptance

1. User can select Cows + Heifers + Confirmed pregnant and see only active (or current lifecycle) animals in those classes with `confirmed_bred = true`.
2. Open pill alone shows animals with `confirmed_bred` false within the current lifecycle selection (and class selection if any).
3. All / group / Culls exclusivity from OI-0164 still holds.
4. Search still works inside the combined filter.
5. F1 behaviour matches Tim's answer.
6. Docs: V2_UX_FLOWS §15.0 updated; no `src/` in the docs land.

## 6. Open questions for Tim

| Id | Question | Proposed default |
|---|---|---|
| **F1** | Open + Confirmed pregnant together: mutually exclusive status pair, or both selectable (empty intersection)? | **Mutually exclusive** |
| **F2** | Status pill label: "Confirmed pregnant" (Tim's words) or "Confirmed bred" (Edit Animal checkbox copy)? | **"Confirmed pregnant"** on the pill; filter still reads `confirmed_bred` |
| **F3** | Class pills: every non-archived class, or only roles that can be bred (cow / heifer / ewe / doe / female)? | **Every non-archived class** (simpler; unused pills just yield empty when combined with Confirmed) |

## 7. Origin

Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator.
