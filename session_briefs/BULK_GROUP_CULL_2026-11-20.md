# OI-0237 — Bulk/composite cull + split heads off a composite

**Date:** 2026-11-20 | **Owner:** GTHO Design | **For:** GTHO Build (after Tim locks remaining C*) | **Status:** **SPEC LOCKED** (Tim, 2026-11-20 ~4:59 / ~5:04 / ~5:08–5:11 AM ET, via Orchestrator). Part A C1–C8 and Part B S1–S8 locked. Ready for docs land → Build (one or two PRs). No migration.
**Base:** Forgejo `main` `2bc20fb` (OI-0236 on main). As-built: `cull-sheet.js` (individuals only — `openCullSheet` returns on `isBulk`), `composite.js` + `reduceCompositeTotals`, Split Group sheet in `animals/index.js` `openSplitGroupSheet` (moves **whole** animals, including an entire composite as all-or-nothing — no head-count split), `empty-group-prompt.js` + `archiveGroup`, migration `039_animals_bulk_composite.sql`.
**Related:** OI-0086, OI-0090, OI-0091, OI-0137, composite bulk brief `SESSION_BRIEF_2026-11-06_composite-bulk-animals.md`, OI-0210 (typed actions later). Kept as **one OI** (cull + split) because both are bulk-composite composition changes Tim asked for in the same breath; Build may still ship as two PRs if useful.

## 1. Why (Tim's ask)

**Part A — Cull** (Tim, 2026-11-20 ~4:58 AM ET, via Orchestrator): cull within bulk groups; prompt for number of animals; if all, zero the group and archive it.

**Part A locks** (Tim, 2026-11-20 ~4:59 AM ET, via Orchestrator): bulk cull **must require date and reason**, and must conform to standard single-animal cull data (`cull_date`, `cull_reason`, `cull_notes`, same reason list).

**Part A cull card** (Tim, 2026-11-20 ~5:11 AM ET, via Orchestrator): C1 both entry points; C3 Option B culled lot; C4 1…H inclusive (skipped → Design rec); C5 prompt before archive (empty-group prompt); C6 full Reactivate (+ group); partial one-tap undo on this device like split; C7 none; C8 UI first / assistant later.

**Part B — Split** (Tim, 2026-11-20 ~4:59 AM ET, via Orchestrator): *"we also need to be able to split a bulk group."*

**Part B locks** (Tim, 2026-11-20 ~5:04 / ~5:08–5:10 AM ET, via Orchestrator): **S1–S8 all locked** (S3/S7/S8 confirmed on card in Tim's words; S1/S2/S4/S5/S6 earlier).

Today Edit Animal shows Cull for composites but the sheet no-ops. Split Group can move a whole composite to another group, but **cannot** peel N heads off a composite into a second lot.

---

# Part A — Cull heads from a composite

## A2. As-built (cull)

- Individual cull: date + reason (9 `CULL_REASONS`) + notes → `active=false` + cull fields; close memberships (`reason='cull'`); window split with **today** as changeDate (OI-0137); empty-group prompt.
- Composite reduce (not cull): subtract heads/weight when identified animals join a group.

## A3. Locked cull behavior

**Entry (C1):** **Both** composite **Edit Animal** Cull and **group-card Cull** (lift `isBulk` gate). Tim overrides Design's Edit-Animal-first recommendation.

**Sheet:** **date (required)**, **reason (required, same 9 reasons)**, **notes (optional)** — **C2**. Plus required **Heads to cull** integer **1…H inclusive** (**C4**).

**Partial (N < H) — C3 Option B:** spawn a new `is_bulk` animal with head=N, `active=false`, cull fields (`cull_date` / `cull_reason` / `cull_notes`), same class/sex; **not** in a group. Living composite keeps H−N + proportional weight. OI-0137 window split. Do not archive the group while live heads remain. **One-tap undo on this device** (C6), same reverse-write pattern as split (S6/S7) — no migration.

**Full (N = H):** deactivate the composite with cull fields (keep historical head count on the row); close memberships; window split. **Never** leave an **active** composite at 0 head. When the group has no live heads left: **prompt before archiving** via today's **empty-group prompt** (**C5** — Tim overrides auto-`archiveGroup`). **Reactivate** restores the animal and **reactivates the group** if it was archived (C6).

## A4. Cull decisions — LOCKED

| Id | Question | Lock |
|---|---|---|
| **C1** | Entry points | **LOCKED** (Tim ~5:11 AM ET): **"Both Edit Animal and group-card Cull."** Both ship. |
| **C2** | Date, reason, notes | **LOCKED** (Tim ~4:59 AM ET): date + reason required; `cull_date` / `cull_reason` / `cull_notes`; same `CULL_REASONS`; notes optional. |
| **C3** | Partial cull history | **LOCKED** (Tim ~5:11 AM ET): **Option B** — spawn a culled bulk lot with the culled count and cull fields; living group keeps the rest. **No migration.** |
| **C4** | Validation | **LOCKED** (Tim skipped → Design recommendation): integer **1…current head inclusive**. |
| **C5** | Empty group after full cull | **LOCKED** (Tim ~5:11 AM ET): **"Prompt me before archiving the empty group"** — today's empty-group prompt (overrides auto-archive). |
| **C6** | Undo / correction | **LOCKED** (Tim ~5:11 AM ET): Full cull → **Reactivate** and **reactivates the group**. Partial → **one-tap undo on this device, like split** (no migration). |
| **C7** | Migration? | **LOCKED** (implied by C3-B): **None.** |
| **C8** | Typed action layer? | **LOCKED** (Tim ~5:11 AM ET): **"UI first; add as an assistant action later."** |

---

# Part B — Split heads off a composite (bulk split)

## B2. As-built (split)

`openSplitGroupSheet` already supports **New group** (name, color, same-location vs unplaced) or **Existing group**, split **date** (and optional time), picking **whole animals** by tap. Composites appear as one row (`Name (N head)`); selecting them moves the **entire** composite. Window split + empty-group prompt afterward. This OI extends that world with a **head-count** split of one composite.

## B3. Locked split behavior

**Entry:** Extend Split Group when a composite is in the group — selecting a composite offers **heads to split** (1…H inclusive); and/or a **Split heads** control on the composite's Edit Animal. Prefer extending Split Group so destination UX stays one place (S1).

**When 1 ≤ N < H (true head-count split):**
1. Create a **new living composite** with head=N (same class/sex; proportional lot weight via `reduceCompositeTotals` math).
2. Join destination (new or existing) with membership `reason='split'`.
3. Source composite becomes H−N (proportional weight write if needed); both remain `active=true` (S5).
4. **Event windows (OI-0137):** split closes/opens `event_group_windows` on the split date (changeDate; membership dates may use the user split date). Pre-split DMI/NPK stay with the source group's earlier window segments; post-split each side tracks its own heads. Nothing is copied backward onto a new dest group, and nothing is double-counted across the split boundary. Same rule for N < H and N = H.

**When N = H (S2 allows; Design resolution of S2 vs S5):** do **not** create a second composite and do **not** leave an active 0-head source. Treat as a **whole-composite move** of the **existing** composite animal to the destination (same path as today's whole-animal Split for a composite). Source membership closes; empty source group gets empty-group prompt / `archiveGroup` the same way C5 / today's Split empties a group. S5's "both stay active" applies only when N < H.

## B4. Split decisions (S1–S8) — LOCKED

| Id | Question | Lock |
|---|---|---|
| **S1** | Destination | **LOCKED** (Tim ~5:04 AM ET): **Both** new and existing, same as Split Group. New requires **name** (suggest `{source} split`) and **color**. Placement: **same-location or unplaced**. |
| **S2** | Count validation | **LOCKED** (Tim ~5:04 AM ET): **Allow splitting all heads** (integer **1…H inclusive**). Overrides prior 1…H−1 recommendation. See §B3 for N=H → whole-composite move. |
| **S3** | Inheritance + event windows | **LOCKED** (Tim ~5:08–5:10 AM ET via Orchestrator — Design recommendation stands; he asked about event history, accepted OI-0137 answer): same class and sex; proportional weight; membership `reason='split'`. **Do not copy** individual health/breeding rows onto the new composite. **Do not copy** past `event_group_windows` onto a new destination group. Event history is **not lost**: per OI-0137 the split **closes/opens windows on the split date** so DMI, NPK excretion, etc. follow head counts on each side **going forward**; history **before** the split stays on the **source** group's windows. No double-count across the boundary. Same for **N < H** and **N = H** (whole move — same window path as today's Split). Do not also `confirmCompositeReductions` against another composite when creating a brand-new split-off lot. |
| **S4** | Date / reason / notes | **LOCKED** (Tim ~5:04 AM ET): **Date required** (default today). **No cull reason.** Optional notes only. |
| **S5** | Head counts both sides | **LOCKED** (Tim ~5:04 AM ET): when N < H, source keeps H−N + weight, new composite gets N + weight, both stay active. When N = H, see §B3 (whole move; no 0-head active composite). |
| **S6** | Undo | **LOCKED** (Tim ~5:04 AM ET): **One-tap undo** (overrides prior "no one-tap" recommendation). See §B5 — reverse-write undo, **no migration**. |
| **S7** | Migration? | **LOCKED** (Tim ~5:08–5:10 AM ET, own words): **"Undo on the device that did the split; no migration."** No schema/ledger migration. Reuses animals + memberships + groups + weights. Aligns with S6 reverse-write undo on the splitting device. |
| **S8** | Typed action layer? | **LOCKED** (Tim ~5:08–5:10 AM ET, own words): **"UI first; add as an assistant action later."** Don't block on OI-0210. |

## B5. Design resolutions (S2↔S5 and S6↔S7) — no Tim question unless he overrides

### (a) S2 allow N=H vs S5 "both stay active"

**Resolution:** N=H is a **whole-composite move** of the existing composite animal (no new row; never an active 0-head composite). Empty source group → empty-group prompt / archive like today's Split and like proposed C5. N < H is the two-active-composites path in S5.

### (b) S6 one-tap undo vs S7 no migration

**Resolution:** One-tap undo = **reverse the last split's client writes** (restore source heads/weight and memberships; delete or never-keep the new composite when N < H; reverse the whole-move memberships when N = H; reverse window splits using the same helpers). Offer Undo on a post-confirm toast / button **on the device that did the split** (S7). **No undo ledger table, no migration.** Durable cross-device undo history would need a ledger (= migration) — out of scope unless Tim asks later.

### (c) S3 event history — Tim's question (2026-11-20 ~5:08 AM ET)

Tim: event history exists regardless of a split; windows open/close when things change so DMI and NPK track properly.

**Confirmed:** Yes. Split does **not** erase event history. It uses the same OI-0137 window split as today's Split Group / composition changes: close the open window segment at the split date and open the next segment with the new head counts. Pre-split segments stay on the source group. A **new** destination group simply has no *prior* windows (it starts from the split forward) — that is not "history lost," it is "history correctly stayed with the source." Existing destination groups keep their own prior windows and get a composition change at the split date. Holds for **N < H** and **N = H**.

---

## 5. Acceptance

**Cull:** (1) Entry from Edit Animal and group-card (C1). (2) Date+reason required (C2); heads 1…H (C4). (3) Partial → culled lot Option B (C3); one-tap device undo (C6). (4) Full → deactivate + empty-group prompt before archive (C5); Reactivate restores animal + group (C6). (5) No migration (C7). (6) UI first (C8).

**Split:** (1) Destinations per S1. (2) N in 1…H; N < H new composite + reduce source; N = H whole-move. (3) Date required; no cull reason; optional notes (S4). (4) S3 OI-0137 windows. (5) One-tap reverse-write undo on splitting device (S6/S7). (6) UI first (S8).

**Docs:** living docs updated; no `src/` in docs land.

## 6. Docs plan (OI-0231)

This brief; OPEN_ITEMS; V2_UX_FLOWS §15.1; STATUS/CHANGELOG; DOCS_MAP. **Land now** (Tim lock complete); then Build handoff (one or two PRs).

## 7. Out of scope

- Changing individual cull or whole-animal Split Group behavior except adding head-count on composites.
- Backfill of past informal reductions.
- Blocking on OI-0210 / voice.
- Durable cross-device undo ledger (would be a new OI + migration).
- OI-0236 filter cascade (separate).

## 8. Origin

- Tim, 2026-11-20 ~4:58–4:59 AM ET, via Orchestrator (cull; date/reason lock; split bulk group).
- Tim, 2026-11-20 ~5:04 AM ET, via Orchestrator (S1, S2, S4, S5, S6 locked).
- Design resolution 2026-11-20 ~5:05 AM ET: N=H whole-move; S6 reverse-write undo without migration.
- Tim, 2026-11-20 ~5:08 AM ET, via Orchestrator (S3 event-window / DMI–NPK clarification).
- Tim, 2026-11-20 ~5:08–5:10 AM ET, via Orchestrator (S3 stands; S7 device undo + no migration; S8 UI first / assistant later — Part B complete).
- Tim, 2026-11-20 ~5:11 AM ET, via Orchestrator (cull card C1, C3–C6, C8; C4 skipped → Design; C7 none via C3-B — OI fully locked).
