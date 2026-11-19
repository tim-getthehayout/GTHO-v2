# OI-0234 — One-time confirmed-bred May 1 backfill (2026)

**Date:** 2026-11-19 | **Owner:** GTHO Design | **For:** GTHO Build | **Status:** **SPEC DRAFTED — pending Tim's land yes and answers to open questions.** Not handed to Build. Not a migration. A **prod data write**: needs **Tim's explicit yes plus a verified backup** (AGENTS.md), separate from the OI-0232 migration apply yes.
**Base:** Forgejo `main` `1e3acafa`. Field names below were read on that tree (`src/entities/animal.js`, `animal-calving-record.js`, `animal-group-membership.js`, `group.js`, `animal-class.js`; calving clear paths in `src/features/animals/calving-sync.js` and `src/features/health/calving.js`).
**Depends on:** OI-0232 migration applied first (`animals.confirmed_bred_date` column present). Order: OI-0232 apply (Tim's yes + backup) → this dry-run → this write (Tim's yes + a **fresh** verified backup) → then OI-0232 UI / calving-clears-date can ship around it; the backfill does not wait on the UI.
**Related:** OI-0232 (date column + Q1/Q2 locks), OI-0235 (Animals screen multi-select filters), OI-0099 (`confirmed_bred`), OI-0230 (the lost marks that started this).

## 1. Why (Tim's ask)

Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator (exact sense): pick a preg-check date of **May 1**, and have Build check confirmed-bred for every cow that has **not yet calved this year**. Cows that already calved would be unchecked automatically once OI-0232 Q2 (calving clears tick and date) is built.

**This supersedes OI-0232 Q3** (Tim, 2026-11-18 ~3:56 PM ET, via Orchestrator: wait for the date field, then hand re-enter marks). Recorded here and in the OI-0232 brief: Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator.

Exceptions Tim added the same morning (via Orchestrator):

| # | Exception | Source | Effect |
|---|---|---|---|
| 1 | Default qualifying animals | Tim ~6:27 AM ET | `confirmed_bred = true`, `confirmed_bred_date = 2026-05-01` |
| 2 | Tag `31` | Tim ~6:28 AM ET: "31 was confirmed on November 10th is the only exception" | `confirmed_bred = true`, `confirmed_bred_date = 2026-11-10` |
| 3 | Tag `65` | Tim ~6:28 AM ET: "65 was not confirmed bred at all." | **Exclude** — leave `confirmed_bred = false`, `confirmed_bred_date` NULL |
| 4 | Shenks | Tim ~6:29 AM ET: "And exclude Shenks from this pass" | **Exclude** every animal with a current open membership in a `groups` row whose `name` ILIKE `Shenk%` (see §4) |

Once OI-0232 Q2 is built, future calvings clear the mark. This backfill is the **one-time 2026 catch-up** only.

## 2. Qualifying set (default)

An animal qualifies for the default May 1 write when **all** of the following hold:

1. **Active:** `animals.active IS TRUE` (or `active IS DISTINCT FROM false`). Culled / sold / dead animals are the Culls set (`active = false`, with optional `cull_date` / `cull_reason` / `cull_notes` — OI-0164; `src/features/animals/index.js` Culls chip). They are **out**.
2. **Female:** `animals.sex = 'female'`.
3. **Not bulk:** `animals.is_bulk IS NOT TRUE` (individual animals only; bulk rows have no preg mark).
4. **Class role in scope:** join `animal_classes` on `animals.class_id = animal_classes.id`. **Proposed default for this pass:** `animal_classes.role = 'cow'` (V2_SCHEMA_DESIGN §3.1 beef/dairy roles: cow, heifer, bull, steer, calf). **Open question B1** — include `heifer` too?
5. **No calving in calendar year 2026:** no row in `animal_calving_records` with `dam_id = animals.id` and `calved_at::date` in `[2026-01-01, 2026-12-31]` (inclusive). Stillbirth rows count as calved (`stillbirth` may be true; the record still exists). Calving is recorded via `animal_calving_records` (`src/entities/animal-calving-record.js`: `dam_id`, `calved_at`); `calving-sync.js` keeps those records in lockstep with calf `dam_id` / `birth_date` and already clears `confirmedBred` on the dam today (`:72`, `:103`, `:162`).
6. **Not tag 65** (exclusion — §3).
7. **Not a current Shenk* group member** (exclusion — §4).
8. **Already-confirmed handling:** **Proposed default:** if `confirmed_bred = true` already, **leave the row alone** (do not overwrite an existing date, and do not force May 1). **Open question B2.**

Tag `31` is still in the write set when it otherwise qualifies, but with date `2026-11-10` instead of May 1 (§3).

## 3. Tag exceptions (uniqueness gate)

Tag field is **`animals.tag_num`** (entity `tagNum`; `src/entities/animal.js`). Not `ear_tag` / `visual_id` — those names do not exist on `animals`.

### 3.1 Tag 31 — confirm on 2026-11-10

- Match: `tag_num = '31'` (exact string as stored).
- Uniqueness gate (SELECT-only, before any write): count of **active** animals with that tag **within the operation**. Must be **exactly 1**. If 0 or >1, **stop and report** — do not guess which row.
- Effect: that one animal gets `confirmed_bred = true`, `confirmed_bred_date = 2026-11-10` (even if it would have been May 1).
- Dry-run shows tag 31 on its own line with the matched `tag_num`, class name/role, and whether it also sits in a Shenk* group (if it does, Shenks exclusion wins — see §4 precedence).

### 3.2 Tag 65 — exclude entirely

- Match: `tag_num = '65'`.
- Same uniqueness gate: exactly one active animal in the operation, or **stop and report**.
- Effect: **not written**. Stays `confirmed_bred = false`, `confirmed_bred_date` NULL.
- Dry-run shows tag 65 under "Excluded — tag 65".

### 3.3 Precedence

Apply exclusions first, then the tag-31 date override, then the May 1 default:

1. Inactive / male / bulk / out-of-class / calved-2026 → not in set.
2. Shenks current members → excluded (§4).
3. Tag 65 → excluded.
4. Remaining tag 31 → write with `2026-11-10`.
5. Everyone else still in the set → write with `2026-05-01`.
6. Already `confirmed_bred = true` (if B2 = leave-alone) → skip write.

## 4. Shenks exclusion (locked match)

**Tim, 2026-11-19 ~6:29 AM ET, via Orchestrator:** "And exclude Shenks from this pass."

**Match rule (locked; Design SELECT-only on prod `sxkmultsfsmfcijvsauf`, 2026-11-19):**

- Shenks = animals with a **current open** membership (`animal_group_memberships.date_left IS NULL`) in any `groups` row whose **`name` ILIKE `'Shenk%'`**.
- Matched field: **`groups.name`**.
- Do **not** also match `animals.name` / `notes` / `tag_num` for "Shenk" (prod animal-row hits were zero). If Tim later means something wider, that is a follow-up — for this pass the group match is unambiguous.

**Prod groups found (read-only, 2026-11-19):**

| Group name | Archived? | Current members (date_left IS NULL) |
|---|---|---|
| Shenk Cows | no | 4 (all active females, none `confirmed_bred`) |
| Shenk Yearling Heifers | no | 6 (all active females, none `confirmed_bred`) |
| Shenk Culls | yes (archived) | 0 current members |

**Total current Shenk animals to exclude: 10** (4 + 6). Docs use names and counts only (no full ids).

Dry-run section **"Excluded — Shenks"** lists those groups, the match rule, count per group, and the total. Shenk members are excluded **even if** they would otherwise qualify for May 1 (or be tag 31).

## 5. Dry-run (SELECT-only) — required before the write

Build (or Design) runs these against prod **read-only** and shows Tim the counts. No write in this step. Outline (bind the operation id in the session; never paste full UUIDs into chat/docs — 8-char prefixes OK in reports):

```sql
-- A. Tag uniqueness gates (must each return n = 1)
SELECT tag_num, COUNT(*) AS n
FROM animals
WHERE active IS TRUE AND tag_num IN ('31', '65')
GROUP BY tag_num;

-- B. Shenks current members (Excluded — Shenks)
SELECT g.name AS group_name,
       COUNT(*) AS current_members
FROM groups g
JOIN animal_group_memberships m ON m.group_id = g.id AND m.date_left IS NULL
JOIN animals a ON a.id = m.animal_id
WHERE g.name ILIKE 'Shenk%'
GROUP BY g.name
ORDER BY g.name;
-- Expect: Shenk Cows = 4, Shenk Yearling Heifers = 6, Shenk Culls = 0; total 10.

-- C. Qualifying May 1 set (after exclusions), count + sample
-- Pseudocode join shape (exact SQL in the Build script):
--   animals a
--   JOIN animal_classes c ON c.id = a.class_id
--   WHERE a.active IS TRUE
--     AND a.sex = 'female'
--     AND a.is_bulk IS NOT TRUE
--     AND c.role = 'cow'          -- pending B1
--     AND NOT EXISTS (
--           SELECT 1 FROM animal_calving_records r
--           WHERE r.dam_id = a.id
--             AND r.calved_at::date >= DATE '2026-01-01'
--             AND r.calved_at::date <  DATE '2027-01-01')
--     AND a.id NOT IN (Shenks current member ids from B)
--     AND a.tag_num IS DISTINCT FROM '65'
--     AND (B2 leave-alone: a.confirmed_bred IS NOT TRUE)
--   Then split: tag_num = '31' → Nov 10 line; else → May 1 line.
```

Dry-run report sections (required):

1. **Uniqueness** — tag 31 and tag 65 each `n = 1` (or STOP).
2. **Excluded — Shenks** — groups, rule, per-group counts, total 10.
3. **Excluded — tag 65** — one row.
4. **Write — tag 31** — one row, date 2026-11-10.
5. **Write — May 1** — count + tag list (or count + first/last sample if long).
6. **Skipped — already confirmed** (if B2 = leave-alone) — count.
7. **Skipped — calved in 2026** — count (sanity).

## 6. Write (after Tim's yes + verified backup)

- **Backup:** verified CP-56 (or equivalent current backup path) **immediately before** the write. Same bar as OI-0222. Migration OI-0232's earlier backup does **not** cover this write.
- **Stamp:** set `updated_at` to the server/write time per normal animal updates (Build's usual `update` path). Do not invent a special clock.
- **Columns written:** `confirmed_bred`, `confirmed_bred_date` only (plus `updated_at`).
- **No client Resync required** beyond normal pull; devices pick up on next sync.
- **Stop conditions:** uniqueness gate fail; dry-run count disagrees with Tim's expectation; backup not verified.

## 7. Rollback

1. **Preferred:** restore the verified pre-write backup (CP-56 / restore path Tim already uses). Restore keeps the backup's original timestamps (OI-0226 Q4 lock).
2. **Surgical (only if Tim wants it and the dry-run id list is retained):** `UPDATE animals SET confirmed_bred = false, confirmed_bred_date = NULL, updated_at = <now> WHERE id IN (<dry-run write ids>)`. Still needs Tim's yes + a backup before that UPDATE. Do not ship surgical rollback SQL into prod without that yes.

## 8. Open questions for Tim

| Id | Question | Proposed default |
|---|---|---|
| **B1** | Which classes count? Cows only (`animal_classes.role = 'cow'`), or also heifers (`role = 'heifer'`)? (Shenk Yearling Heifers are already out via §4 regardless.) | **Cows only** for this pass |
| **B2** | Animals that already have `confirmed_bred = true`: leave alone, or overwrite the date to May 1 / Nov 10? | **Leave alone** |
| **B3** | Does a 2026 stillbirth calving record count as "calved this year" (exclude from the write)? | **Yes — any `animal_calving_records` row in 2026 counts** |

## 9. Acceptance (docs / dry-run)

1. OI-0232 column exists on prod before the write.
2. Dry-run uniqueness for tags 31 and 65 is exactly one active each.
3. Dry-run Shenks total is 10 with the locked group match.
4. Tag 65 and all Shenks members are absent from the write list.
5. Tag 31 is on the write list with date 2026-11-10 only.
6. Tim's explicit yes + verified backup recorded before the write.
7. No `src/`, `tests/`, or `supabase/` change in the docs land for this OI.

## 10. Origin

- Tim, 2026-11-19 ~6:27 AM ET, via Orchestrator (May 1 backfill ask; supersedes OI-0232 Q3).
- Tim, 2026-11-19 ~6:28 AM ET, via Orchestrator (tag 31 Nov 10; tag 65 exclude).
- Tim, 2026-11-19 ~6:29 AM ET, via Orchestrator (exclude Shenks).
- Shenks match locked by Design SELECT-only prod lookup, 2026-11-19.
