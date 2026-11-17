# OI-0220 — Feed unit cleanup and prevention (bale / Bale / bal)

**Date:** 2026-11-16 | **Owner:** GTHO Design | **Status:** DONE — Tim approved Design's plan as proposed (A–E), 2026-11-16 4:32 PM ET, relayed by Orchestrator. Implementation: GTHO Build [PR #60](https://git.sarnford.com/Homelab/GTHO-v2/pulls/60), branch `fix/feed-unit-cleanup`, **merged 2026-11-16 at `73442873`** (Forgejo and GitHub main) and **published as `b2026-11-16.2311-7344287`** (reported by Orchestrator; stamp read from the live site 2026-11-17). Docs only; no SQL, no data change.
**Sequenced:** ahead of OI-0221 (stored forage budget) build, because the budget's historical counts, pool counting and on-hand totals read these unit strings.
**Relates to:** OI-0219 (FA-29 batch unit picker) — folded in here as the prevention half; OI-0216 (044 dose/input-product unit tables, applied 2026-11-11); OI-0214 FA-26 pools.

## Tim's decision (2026-11-16, 3:05 PM ET, relayed by Orchestrator)

Fix the `bal` vs `bale` unit mix-up and make sure it can't happen again. Sequence it ahead of the budgeting build.

## Tim's approval (2026-11-16, 4:32 PM ET, relayed by Orchestrator)

At 4:31 PM ET Orchestrator presented Design's picks to Tim — A: retype the `Bale` batch; B: a closed unit list; C: round bale, square bale, ton, kg, lb, bag; D: read old spellings as the standard unit — and asked "Start Build on the unit fix with Design's plan?" At 4:32 PM ET Tim picked "Yes, start Build on the unit fix with Design's plan".

- This is a **blanket yes to the plan as proposed (A–E)**. Tim did not answer each pick separately.
- **E** (fold OI-0219, the FA-29 batch picker, into this item) was not named to him by letter, but it is part of the plan he accepted.
- **A becomes optional once PR #60 merges:** the `Bale` batch then folds to `bale` on read, so retyping it is no longer needed for pool counting.

## Implementation — [PR #60](https://git.sarnford.com/Homelab/GTHO-v2/pulls/60) (merged at `73442873`, published 2026-11-16)

GTHO Build, branch `fix/feed-unit-cleanup`. No SQL, no migration, no data write; existing rows are never rewritten. One shared list and picker for the batch sheet and both feed-type forms; all three saves refuse anything not on the list; save-time normalization and read-time folding as in B3–B4; the batch unit defaults to the feed type's unit. Merged at `73442873` and published (`b2026-11-16.2311-7344287`).

**Design's rulings on Build's implementation questions (2026-11-16, consistent with C):**
- **`bag` counts as a pool unit** like the others: a pool counts in its unit when the feed type's unit and the feeding's snapshot unit agree (after folding); otherwise it falls back to mass (kg), as for `bale`, `sq bale`, `ton`, `kg` and `lb`.
- **Legacy `round-bale` maps to `bale`.** Hyphens fold to spaces before the alias lookup (so `round-bale` → `round bale` → `bale`). Production holds none today.
- **A stored unit not on the list** opens on "Choose a unit" and must be picked before the sheet can save. Production holds none today.
- **The batch mismatch confirmation** fires when the unit picker changes away from the feed type's unit, not at save.
- **Changing an existing batch's feed type** leaves its unit unchanged.
- **Display text** (cards, details, reports) is unchanged in this PR: they still show the stored text. Showing the standard label is follow-up OI-0223 (low priority, not started, needs Tim's say-so).

## Recommendation (first)

1. **No migration and no SQL data repair.** Fix the one live bad row by hand in the app (Tim retypes `Bale` → `bale` on the batch created today) before any feeding is recorded from it, so no feeding snapshot copies the bad spelling.
2. **Replace the batch sheet's free-text unit box with a picker** (FA-29) that defaults to the feed type's unit, and use **one shared feed-unit list** for both the feed-type sheet and the batch sheet.
3. **Normalize at save** (trim, lower-case, collapse spaces, known aliases like `bal`/`bales`/`Bale` → `bale`) so nothing outside the list is ever written.
4. **Fold on read** for history: when the app compares units (pool counting, reports, budget), it compares the normalized form, so any old spelling already in snapshots is treated the same as the standard without rewriting history.
5. **No custom feed units for now** (closed list), so the near-duplicate guard is simply "only list values can be saved". If Tim later wants custom feed units, copy the 044 pattern (standard + operation custom, folded scoped-unique name) as a separate migration.

## What prod shows today (read-only SELECT, 2026-11-16 ~3:08 PM ET; aggregates only)

| Where the unit lives | Values (rows) |
|---|---|
| `feed_types.unit` (3 types) | `bale` (2), `sq bale` (1) |
| `batches.unit` (9 batches) | `bale` (7), `Bale` (1), `sq bale` (1) |
| `event_feed_entries.unit_snapshot` (34 rows) | `bale` (4), null (30 — legacy rows read the unit through their batch) |
| `event_feed_check_items.unit_snapshot` (71 rows) | `bale` (10), null (61 — legacy rows read through their batch) |

- **No `bal` string remains** in any of these columns. The batch created on 2026-11-03 (where `bal` was typed, per OI-0219) now reads `bale`; its last edit was 2026-11-04. Design cannot see who changed it or how — it looks like a hand correction in the app.
- **A new variant appeared today:** the batch created 2026-11-16 (150 round bales, $56.66/bale) is saved as `Bale` (capital B). It has no feedings and no checks yet, and one located balance. This is the same free-text problem recurring.
- **Feed units do not live in the 044 tables.** `dose_units` (treatments) and `input_product_units` (amendments/products) are separate catalogs. Feed units are plain text on `feed_types.unit` and `batches.unit`, plus the 043 snapshot columns on feed entries and check items. So 044 covers none of the feed-unit problem directly; its design (NULL-operation read-only standards + operation customs, `lower(btrim(name))` scoped uniqueness, archived names stay reserved) is the model to copy if custom feed units are ever wanted.
- **044 is applied and live:** Tim approved at 9:52 AM ET on 2026-11-11; a pre-044 backup was taken at 9:53:09 AM; 044 was applied at 9:54:01 AM ET (ledger 20261111145401) and the ceiling-44 client (PR #56, `ce1c987d`) published as `b2026-11-11.1457-ce1c987` (reported by Orchestrator). The same read-only check confirms production stamp **44**, both unit tables with `operation_id`, RLS on, and `*_standard_name` / `*_custom_name` indexes. The 044 tables still do not hold feed units, so nothing in this proposal depends on 044.

## Why it matters (code read on main `ce1c987d`, not edited)

- `src/calcs/feed-pools.js:5` treats only exact `bale`, `kg`, `lb`, `ton` as verified count units, and requires the feeding's unit to equal the feed type's unit. `Bale` and `sq bale` are therefore "unverified": any event pool fed from them falls back to mass (kg) mode until empty (FA-26 rule). Feeding the new 150-bale batch as-is would push grass pools into kg mode.
- `sq bale` is the Alfalfa feed type's unit, but the feed-type sheet's picker (`src/features/feed/index.js:542–550`) offers only bale/ton/kg/lb. Opening and saving that feed type may blank or change its unit — **Build to verify**, not assumed.
- The batch sheet unit is a free-text box (`index.js:1303`) and save only trims it (`index.js:1411`) — no case folding, no list.

## Scope (design level)

**A. Cleanup of existing records**
- One live row: the `Bale` batch. Recommended fix: Tim edits it to `bale` in the batch sheet now (before feeding from it). No SQL, no backup needed for an ordinary in-app edit.
- If it gets fed before that edit, its feedings snapshot `Bale`. Snapshots are history and are not rewritten; read-time folding (B3) makes them count as `bale`.
- Any SQL data fix (only if Tim prefers it to the in-app edit) is a production change: Tim's explicit yes at the time plus a backup, run in a separate session.

**B. Prevention**
1. One shared feed-unit list for feed types and batches. Proposed standards: `bale` (round), `sq bale`, `ton`, `kg`, `lb`, `bag` (question C).
2. Batch sheet: picker, defaulting to the feed type's unit; changing it away from the type's unit asks for confirmation (FA-29).
3. Normalize at save and fold on read: trim, lower-case, collapse internal spaces, singular form, and a small alias map (`bal`, `bales`, `rb`, `round bale` → `bale`; `sq bales`, `square bale`, `small square` → `sq bale`). Validation rejects anything not on the list.
4. Pool counting (`feed-pools.js`) compares the folded unit and accepts `sq bale` as a verified count unit, so Alfalfa small-square pools can count by bale.
5. Feed-type picker includes every list value (fixes the `sq bale` mismatch).
6. Near-duplicate guard: with a closed list there are no user-created names to collide. If customs are later allowed, block a new name whose folded form or singular/plural matches an existing standard or custom (044 pattern).

**C. Migration?** Not for the recommended path (app-only list + normalization + fold-on-read). Optional later hardening — a DB CHECK on allowed feed units or a table-backed `feed_units` catalog — would be a new numbered migration after the already-applied 044 and needs Tim's yes plus a backup to apply. CP-55/CP-56: no shape change on the recommended path; restore of an old backup with `bal`/`Bale` still reads correctly because of fold-on-read.

**D. Acceptance (for Build once approved)**
- Batch and feed-type sheets cannot save a unit outside the list; `Bale`, ` bale `, `bales`, `bal` all save as `bale`.
- Existing Alfalfa (`sq bale`) type opens and saves without changing its unit.
- Pools fed from `Bale` history count as `bale`; `sq bale` pools count by bale.
- No rewrite of existing rows; no SQL.

## Lettered questions (recommended answer first) — APPROVED as proposed (Tim's blanket yes, 4:32 PM ET)

- **A. How to fix the `Bale` batch?** Recommend: you retype it as `bale` in the batch sheet now, before feeding from it. (Alternative: a one-off SQL fix — needs your yes + backup.) **Approved; optional once PR #60 merges (`Bale` folds to `bale` on read).**
- **B. Closed list or allow custom feed units?** Recommend: closed list now; custom units later only if you hit a real need. **Approved.**
- **C. Which standards?** Recommend: `bale` (round), `sq bale`, `ton`, `kg`, `lb`, `bag`. Should `bale` be renamed `round bale` on screen? Recommend: keep the stored value `bale`, show it as "Round bale" in the picker. **Approved.**
- **D. Fold old spellings on read instead of rewriting history?** Recommend: yes. **Approved.**
- **E. OI-0219 (FA-29 picker) folds into this item?** Recommend: yes — OI-0219 stays as history, delivered by OI-0220. **Approved** (part of the accepted plan; not named to Tim by letter).
