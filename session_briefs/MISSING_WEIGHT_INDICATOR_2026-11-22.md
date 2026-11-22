# Missing-weight indicator + conditional filter (OI-0248)

**Status:** **PROPOSED** (opened 2026-11-22 ~5:59 AM ET from Tim’s ask **t866u**, ~5:54 AM ET, via Orchestrator). Docs tip only — not locked, not ready for Build until Tim locks the axes below.  
**Owner:** GTHO Design → Orchestrator (lock card) → GTHO Build after lock + docs land.  
**Parent:** Forgejo `origin/main` `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee` (compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** Animals filter cascade OI-0236 ([ANIMALS_FILTER_CASCADE_2026-11-20.md](ANIMALS_FILTER_CASCADE_2026-11-20.md)); current-weight UX OI-0096; DMI-9 unknown rule ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md) §1.6); Locations metrics unknown = “—” (`hasUnknownLiveWindowWeights`, Z1 / DMI-9).  
**Schema / migration:** **None.** Display + filter only on existing `animal_weight_records` and `animals.active`. No new column, no SQL, no backup gate.

## 1. Problem

Build found a Locations DMI “—” (dash) was caused by animals that have no usable live weight. Tim asked (t866u, 2026-11-22 ~5:54 AM ET): add a **missing-weight indicator on animals**, and a **conditional filter pill that only appears when there are active animals with missing weights**.

This is a data-quality / find-and-fix tool on the Animals screen. It does **not** change how DMI, AUDs, or N/P/K are calculated. Those surfaces already treat unknown weights as “—” (never a silent 0) once the Z1 / DMI-9 rule is in force. This OI helps Tim find the animals behind those dashes (and, under Design’s recommended definition, animals that have never been weighed even when a class default still lets DMI compute).

**Split:** separate from OI-0246 list-parity and the season-metrics docs tip. Do **not** implement or document this on `docs/oi-0246-list-parity`.

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

**Important split:** the Animals list/sheet already treat “no recorded weight” as —. DMI treats a weight as unknown only when there is **also** no class default. An animal that has never been weighed but has a class default still shows — on Animals, and can still produce a numeric DMI. The lock for “what counts as missing” must pick one of these (see §4).

## 3. Product (proposed)

- On the Animals screen, make it obvious which animals have no recorded weight (a badge / short label, not only the easy-to-miss — in the weight column).
- Add a **Missing weight** filter pill that appears **only** when at least one **active** animal currently meets that missing rule. When the pill is on, the list shows those animals (AND with the other Animals filters). When every active animal has a recorded weight, the pill is hidden and, if it was on, it is cleared.
- Tapping ⚖ Weight (or Quick Weight from Edit Animal) is how the user records a weight; this OI does not add a new weight-entry path.
- No change to DMI, AUDs, or N/P/K formulas. No migration.

## 4. Open axes (for a Tim lock card)

Design’s recommended bundle: **Ib + Mw + Aa + Pf + Pa + Pl + Sp**.

### 4.1 Where the indicator shows

| Code | Option |
|---|---|
| **Iw** | Animals list row / card only (badge + the existing —). |
| **Id** | Edit Animal “Current weight” only (label beside the existing —; keep ⚖ Weight). |
| **Ib** | **Both** list and Edit Animal (Design rec). |
| **Ix** | Also a hint on Locations / DMI when a metric is “—” because of unknown weights (e.g. “N animals missing weight”). |

**Rec: Ib.** Tim asked for the indicator “on animals.” The list is where you scan; the sheet is where you fix it with the existing Weight button. **Ix is out of this OI** unless Tim asks for it — Locations already shows — when DMI is unknown, and a count/hint can be a later follow-up so this stays Animals-only and ships without waiting on the Locations metrics tip.

### 4.2 What counts as missing

| Code | Option |
|---|---|
| **Mw** | No recorded weight on or before today (`latestWeightForAnimal(..., today)` is null). A class default does **not** count as having a weight. (Design rec) |
| **Md** | Only the DMI-unknown case: no recorded weight **and** no class `defaultWeightKg > 0`. These are the animals that blank a Locations DMI cell. |
| **Ms** | No recorded weight in the last **N** days (stale). Needs Tim to pick N if chosen. |

**Rec: Mw.** “Live weight” in the app is the latest `animal_weight_records` row, not the class default. The list already shows — for Mw. Md would hide animals that have never been weighed whenever a class default exists, which is the more common gap and is confusing next to the list’s —. Ms (stale) is useful later but Tim asked for *missing*, not *out of date*; do not invent an N in this OI. Future-dated records should not count; use on-or-before today, the same day rule DMI already uses. Composite (bulk) lots: missing when the lot has no finite lot-total record.

### 4.3 Active only vs culled

| Code | Option |
|---|---|
| **Aa** | Active animals only (`animals.active !== false`). The pill is hidden on the Culls tile. (Design rec) |
| **Ac** | Same as Aa for visibility on All / groups, but when Culls is selected the pill can appear for culled animals that have no weight. |

**Rec: Aa.** Matches Tim’s words (“active animals with missing weights”). Culled animals are a separate lifecycle tile. Membership in an archived group does not by itself exclude an animal: if the animal is still `active`, it counts.

### 4.4 Pill behavior and label

| Code | Option |
|---|---|
| **Pf** | Pill is **visible** when ≥1 active animal on the farm (not only in the current group/species/class slice) meets the missing rule. Farm-wide, so the problem is discoverable even if the current group is complete. |
| **Pa** | When the pill is **on**, it **ANDs** with Groups / Species / Class / status / search (same composition as other filters). Empty result → existing “No animals match this filter.” |
| **Pl** | Label: **Missing weight**. |

**Rec: Pf + Pa + Pl** as a bundle.

**Placement (Design lean, not a separate lock unless Tim objects):** a `.agc-chip` that is **not** on the female-gated Open / Confirmed bred / Pregnancy Check row (males and bulk lots can be missing a weight too). Put it in a small chip row after Class (and after Status when Status is visible). Visibility is independent of the female gate. Reset clears this pill with the other filter rows. It is **not** mutually exclusive with Open / Confirmed bred / Pregnancy Check.

### 4.5 Species scope

| Code | Option |
|---|---|
| **Sp** | All species (cattle, sheep, goats, and any other classed stock). (Design rec) |
| **Sc** | Cattle only. |

**Rec: Sp.** Weights feed DMI for every species the farm runs. The pill already hides itself when nobody is missing a weight.

## 5. Non-goals

- Do not change DMI / AUDs / N/P/K formulas, class-default fallback, or Z1 / DMI-9 “—” vs 0 rules.
- Do not add a `current_weight` column or any migration / SQL.
- Do not fold this into the OI-0246 list-parity or metrics-split docs or code branches.
- Do not replace Quick Weight or the list ⚖ Weight button with a new entry flow.
- Do not invent a stale-N-days rule unless Tim locks **Ms**.
- Do not show the pill when zero active animals meet the missing rule.

## 6. Acceptance (after Tim lock + docs land — not for this tip)

- [ ] Animals list rows that meet the locked missing rule show a clear missing-weight indicator (not only —), and Edit Animal does too if **Ib** (or **Id**) is locked.
- [ ] Animals with a recorded weight on or before today do not show the indicator.
- [ ] The **Missing weight** pill appears only when ≥1 active animal meets the rule; it is hidden (and cleared if it was on) when none do.
- [ ] Turning the pill on lists those animals, ANDed with the other Animals filters (**Pa**).
- [ ] The pill is not female-gated; Culls follows the locked **Aa** / **Ac** rule.
- [ ] Reset clears the pill. No schema change. Existing Weight / Quick Weight paths still record weights.
- [ ] DMI math is unchanged.

## 7. Related

- OI-0096: Current weight is read-only + ⚖ Weight; — when no record.
- OI-0236: Animals filter cascade (placement and AND rules must respect R1–R8; this pill is an addition, not a reopen).
- DMI-9 §1.6 / `hasUnknownLiveWindowWeights` / Locations `location-metrics.js`: unknown weights already display as — (Z1). This OI does not reopen that.
- Parent main: `4b95c55fc9efa99a7cf75d8e63d9cb82ddd863ee`

---

**Tip instruction:** **PROPOSED**. Do **not** land on main until Tim locks the axes and yeses a docs land card. Do **not** brief Build to implement until locked. Do **not** fold this into the OI-0246 list-parity tip. No SQL.

