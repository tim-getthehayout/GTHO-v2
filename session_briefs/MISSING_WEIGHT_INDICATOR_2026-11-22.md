# Missing-weight indicator + conditional filter (OI-0248)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-22 ~6:02 AM ET, via Orchestrator, card **t875s3595**, lock **Ib+Mw+Ac+Pl+Pf+Pa+Sp**). Opened ~5:59 AM ET from Tim’s ask **t866u** (~5:54 AM ET). This docs tip is ready for Tim’s land of **docs**. No SQL.  
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card for docs — land only after Tim yes).  
**Parent:** Forgejo `origin/main` `2e06d47db61f8983dd851c697cbf1b3baaef1774` (PR #120 merge; compiled `RELEASED_SCHEMA_VERSION` **48**). Restacked off `4b95c55` after main moved (OI-0246 list-parity/metrics `400ae0f` already on main).  
**Also related:** Animals filter cascade OI-0236 ([ANIMALS_FILTER_CASCADE_2026-11-20.md](ANIMALS_FILTER_CASCADE_2026-11-20.md)); current-weight UX OI-0096; DMI-9 unknown rule ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md) §1.6); Locations metrics unknown = “—” (`hasUnknownLiveWindowWeights`, Z1 / DMI-9).  
**Schema / migration:** **None.** Display + filter only on existing `animal_weight_records` and `animals.active`. No new column, no SQL, no backup gate.

## 1. Problem

Build found a Locations DMI “—” (dash) was caused by animals that have no usable live weight. Tim asked (t866u, 2026-11-22 ~5:54 AM ET): add a **missing-weight indicator on animals**, and a **conditional filter pill that only appears when there are active animals with missing weights**.

This is a data-quality / find-and-fix tool on the Animals screen. It does **not** change how DMI, AUDs, or N/P/K are calculated. Those surfaces already treat unknown weights as “—” (never a silent 0) once the Z1 / DMI-9 rule is in force. This OI helps Tim find the animals behind those dashes (and, under the locked **Mw** definition, animals that have never been weighed even when a class default still lets DMI compute).

**Origin:** t866u (~5:54 AM ET) via Orchestrator.  
**Lock:** Tim, card **t875s3595**, ~6:02 AM ET — **Ib+Mw+Ac+Pl+Pf+Pa+Sp**. Design had rec’d **Aa**; Tim chose **Ac** (also offer the pill on Culls for culled animals with no weight).  
**Split:** separate from OI-0246 list-parity and the season-metrics docs tip (`400ae0f`). Do **not** implement or document this on `docs/oi-0246-list-parity`.

## 2. Current state (citations — do not invent)

Read on tip `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee`.

| Piece | Where | What it does today |
|---|---|---|
| No `current_weight` column on `animals` | `src/entities/animal.js` | Weight is not a field on the animal. Source of truth is `animal_weight_records` (`weightKg`, `recordedAt`, sources `manual` / `group_update` / `calving` / `import`). |
| Latest recorded weight | `src/calcs/window-helpers.js` `latestWeightForAnimal` | Latest finite `weightKg` for that animal; optional `now` keeps only records on or before that calendar day. Non-finite / missing `weightKg` is skipped. |
| Animals list weight column | `src/features/animals/index.js` `renderAnimalList` | Shows the latest recorded weight, or **—** if there is none. **Class default is not shown** here. Sort treats a missing record as 0. Each row already has a ⚖ Weight button. |
| Edit Animal “Current weight” | same file, `openAnimalSheet` (OI-0096) | Read-only latest record, or **—** in muted text, plus a ⚖ Weight button that opens Quick Weight. The old editable `currentWeight` field was removed because it did not save. Composite lots use a lot-total / per-head path; no record still shows —. |
| Group-card avg / DMI target | `buildLiveGroupFilterCard` / group stats in `index.js` | Uses latest record, else `animal_classes.defaultWeightKg`, else 0. This is a **target** rollup, not the per-animal list column. |
| DMI / Locations unknown | `hasUnknownLiveWindowWeights`; `location-metrics.js`; DMI-9 §1.6 | A live group window is unknown when **any** live animal has **no recorded weight and no class default > 0**. Locations DMI for that day becomes unknown and the UI shows **—**, never a silent 0 (same idea as Z1: never-present = 0, missing = —). Class default **does** keep DMI computable. `getLiveWindowAvgWeight` drops animals with neither record nor default rather than averaging in a false 0. |
| “Active” animal | `animals.active` | Default Animals “All” tile is `active !== false` (“All active animals”). **Culls** is `active === false` (culled), mutually exclusive with All and live groups (OI-0236 §4.1). Archived **groups** (`groups.archivedAt`) are a separate toggle; they do not flip `animals.active`. |
| Existing “missing” line on a row | `hasConfirmedBredDateMissing`, due-band bits | Text under the name, e.g. “Confirm date missing”, “No exposure in view”, “No calving record”. There is **no** missing-weight badge or filter today — only the weight column’s —. |
| Filter pills | OI-0236 `renderFilterHeader` | Groups → Species → Class → Open / Confirmed bred / Pregnancy Check (row 4 is **female-gated**: shown only when the parent pool has ≥1 female). Pills are `.agc-chip`. Reset clears filter rows, not search. No conditional “missing …” pill exists yet. |

**Important split:** the Animals list/sheet already treat “no recorded weight” as —. DMI treats a weight as unknown only when there is **also** no class default. An animal that has never been weighed but has a class default still shows — on Animals, and can still produce a numeric DMI. The lock for “what counts as missing” is **Mw** (see §4): a class default is not a live weight.

## 3. Product (locked)

- On the Animals screen, make it obvious which animals have no recorded weight (a badge / short label, not only the easy-to-miss — in the weight column). The indicator shows on the **Animals list and Edit Animal** (**Ib**).
- Add a **Missing weight** filter pill (**Pl**) that appears **only** when at least one animal in the **current view’s pool** meets the missing rule (**Pf**, refined by **Ac**): on All / live groups, **active** animals (`animals.active !== false`); on Culls, **culled** animals (`active === false`). Visibility is farm-wide within that pool, not limited to the current group/species/class slice. When the pill is on, the list shows those animals, ANDed with group / species / class / search and the other Animals filters (**Pa**). When no animal in that view’s pool is missing a weight, the pill is hidden and, if it was on, it is cleared.
- Tapping ⚖ Weight (or Quick Weight from Edit Animal) is how the user records a weight; this OI does not add a new weight-entry path.
- No change to DMI, AUDs, or N/P/K formulas. No migration. All species (**Sp**).

## 4. Locked axes (t875s3595)

Tim locked **Ib + Mw + Ac + Pl+Pf+Pa + Sp**. Design had recommended **Ib + Mw + Aa + Pf + Pa + Pl + Sp**; Tim chose **Ac** instead of **Aa**.

### 4.1 Where the indicator shows — **Ib** locked

| Code | Option |
|---|---|
| **Iw** | Animals list row / card only (badge + the existing —). |
| **Id** | Edit Animal “Current weight” only (label beside the existing —; keep ⚖ Weight). |
| **Ib** | **Both** list and Edit Animal. **LOCKED.** |
| **Ix** | Also a hint on Locations / DMI when a metric is “—” because of unknown weights (e.g. “N animals missing weight”). **Not locked — out of this OI.** |

**Locked: Ib.** The list is where you scan; the sheet is where you fix it with the existing Weight button. **Ix is out of this OI** unless Tim asks later — Locations already shows — when DMI is unknown, and a count/hint can be a later follow-up so this stays Animals-only.

### 4.2 What counts as missing — **Mw** locked

| Code | Option |
|---|---|
| **Mw** | No recorded weight on or before today (`latestWeightForAnimal(..., today)` is null). A class default does **not** count as having a weight. **LOCKED.** |
| **Md** | Only the DMI-unknown case: no recorded weight **and** no class `defaultWeightKg > 0`. These are the animals that blank a Locations DMI cell. |
| **Ms** | No recorded weight in the last **N** days (stale). Needs Tim to pick N if chosen. |

**Locked: Mw.** “Live weight” in the app is the latest `animal_weight_records` row, not the class default. The list already shows — for Mw. Md would hide animals that have never been weighed whenever a class default exists, which is the more common gap and is confusing next to the list’s —. Ms (stale) is useful later but Tim asked for *missing*, not *out of date*; do not invent an N in this OI. Future-dated records should not count; use on-or-before today, the same day rule DMI already uses. Composite (bulk) lots: missing when the lot has no finite lot-total record.

### 4.3 Active only vs culled — **Ac** locked (not Aa)

| Code | Option |
|---|---|
| **Aa** | Active animals only (`animals.active !== false`). The pill is hidden on the Culls tile. Design rec; **not locked.** |
| **Ac** | Same as Aa for visibility on All / groups, but when Culls is selected the pill can appear for culled animals that have no weight. **LOCKED.** |

**Locked: Ac.** Tim chose this instead of Design’s rec **Aa**. On All / live groups the pill is offered for **active** animals missing a weight. On the Culls tile the pill is also offered for **culled** animals with no weight. Membership in an archived group does not by itself exclude an animal: if the animal is still `active`, it counts in the All / groups pool.

### 4.4 Pill behavior and label — **Pl+Pf+Pa** locked

| Code | Option |
|---|---|
| **Pf** | Pill is **visible** only when ≥1 matching animal in the **current view’s pool** meets the missing rule: Active / All / live groups → active animals; Culls → culled animals. Farm-wide within that pool (not only in the current group/species/class slice), so the problem is discoverable even if the current group is complete. **LOCKED.** |
| **Pa** | When the pill is **on**, it **ANDs** with Groups / Species / Class / status / search (same composition as other filters). It narrows the current list. Empty result → existing “No animals match this filter.” **LOCKED.** |
| **Pl** | Label: **Missing weight**. **LOCKED.** |

**Locked: Pf + Pa + Pl** as a bundle, with **Pf** visibility scoped by **Ac** (active pool vs culled pool).

**Placement (Design lean, not a separate lock unless Tim objects):** a `.agc-chip` that is **not** on the female-gated Open / Confirmed bred / Pregnancy Check row (males and bulk lots can be missing a weight too). Put it in a small chip row after Class (and after Status when Status is visible). Visibility is independent of the female gate. Reset clears this pill with the other filter rows. It is **not** mutually exclusive with Open / Confirmed bred / Pregnancy Check.

### 4.5 Species scope — **Sp** locked

| Code | Option |
|---|---|
| **Sp** | All species (cattle, sheep, goats, and any other classed stock). **LOCKED.** |
| **Sc** | Cattle only. |

**Locked: Sp.** Weights feed DMI for every species the farm runs. The pill already hides itself when nobody in the current view’s pool is missing a weight.

## 5. Non-goals

- Do not change DMI / AUDs / N/P/K formulas, class-default fallback, or Z1 / DMI-9 “—” vs 0 rules.
- Do not add a `current_weight` column or any migration / SQL.
- Do not fold this into the OI-0246 list-parity or metrics-split docs or code branches.
- Do not replace Quick Weight or the list ⚖ Weight button with a new entry flow.
- Do not invent a stale-N-days rule (**Ms** was not locked).
- Do not show the pill on All / live groups when zero **active** animals meet the missing rule; do not show it on Culls when zero **culled** animals meet the rule.

## 6. Acceptance (after docs land — not for this tip)

- [ ] Animals list rows that meet **Mw** show a clear missing-weight indicator (not only —), and Edit Animal does too (**Ib**).
- [ ] Animals with a recorded weight on or before today do not show the indicator. A class default alone does not clear the indicator.
- [ ] The **Missing weight** pill appears only when ≥1 animal in the current view’s pool meets **Mw** (All / live groups: active; Culls: culled); it is hidden (and cleared if it was on) when none do (**Pf** + **Ac**).
- [ ] Turning the pill on lists those animals, ANDed with the other Animals filters (**Pa**).
- [ ] The pill is not female-gated; Culls follows **Ac**.
- [ ] Reset clears the pill. No schema change. Existing Weight / Quick Weight paths still record weights.
- [ ] DMI math is unchanged. All species (**Sp**).

## 7. Related

- OI-0096: Current weight is read-only + ⚖ Weight; — when no record.
- OI-0236: Animals filter cascade (placement and AND rules must respect R1–R8; this pill is an addition, not a reopen).
- DMI-9 §1.6 / `hasUnknownLiveWindowWeights` / Locations `location-metrics.js`: unknown weights already display as — (Z1). This OI does not reopen that.
- Parent main (restack): `2e06d47db61f8983dd851c697cbf1b3baaef1774`. Citations in §2 were read on `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee`.

---

**Tip instruction:** **LOCKED (Ib+Mw+Ac+Pl+Pf+Pa+Sp)**. Ready for Tim’s land of **docs**. Do **not** land on main until Tim yeses the docs land card. Do **not** fold this into the OI-0246 list-parity tip (`400ae0f`). No SQL.
