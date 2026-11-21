# Confirmed-bred due-date range (postpartum earliest + exposure-capped latest) (OI-0245)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-21 ~9:55 AM ET, via Orchestrator, card **t776u** answering lock card **t775s3213**) — opened ~9:50 AM ET (t773u); **locked Design rec with S0→S1** on tip `52026be6e603020e3cff3fd30b5e846080a0508b`
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card — land only after Tim yes)  
**Parent:** OI-0243 / OI-0244 exposure → Pregnancy Check + due bands **live** on Forgejo `origin/main` tip `9402a0675e5924ca311974c31fc88084249c576b` (stamp `b2026-11-21.1415-9402a06`; `RELEASED_SCHEMA_VERSION` **47**). OI-0244 tip `eba22487a6893587a1cec45bfb5f6473732a0cef` then ceiling bump. Briefs: [BULL_EXPOSURE_PREG_DUE_2026-11-21.md](BULL_EXPOSURE_PREG_DUE_2026-11-21.md), [MULTISPECIES_EXPOSURE_PREG_2026-11-21.md](MULTISPECIES_EXPOSURE_PREG_2026-11-21.md).  
**Also related:** OI-0232 `confirmed_bred_date` ([CONFIRMED_BRED_DATE_2026-11-18.md](CONFIRMED_BRED_DATE_2026-11-18.md)); SCHEMA §9.7 gestation, §9.9 calving records.  
**Schema / migration:** **S1 LOCKED** — new migration **048** after applied **047** (do **not** reopen/widen 047). Three `farm_settings` ints: return-to-cycle days per species (cattle / sheep / goat) with **P-a defaults 45 / 25 / 25**. Migration **file-only** until Tim’s **separate** yes + verified backup; `RELEASED_SCHEMA_VERSION` stays **47** until apply + separate RELEASED bump. Editors gated Pg0-style (hide until new ceiling after 048 released).

## 1. Problem

Tim (via Orchestrator, 2026-11-21 ~9:50 AM ET, **t773u**): confirmed-bred animals should get the **same due-date RANGE tracking** as Pregnancy Check, with clearer earliest / latest anchors:

1. **Latest** possible due date (= range **END**) should come from the **last exposure prior to** the preg check / `confirmed_bred_date`.
2. He believes **today** the confirmed-bred view shows that “last-possible” conception date as the **START** of the range (he thinks that is wrong).
3. His farm case: bull ran with cows **continuously** until he moved him this past spring. Most cows have **last year’s calving date** entered; he wants that to anchor the **EARLIEST** possible due date using industry cycling data (postpartum anestrus / return-to-cycle interval + gestation).

**Origin:** Tim via Orchestrator, 2026-11-21 ~9:50 AM ET (t773u).  
**Locked:** Tim, card **t776u** answering **t775s3213**, ~9:55 AM ET — Design’s rec on tip `52026be` with **S0→S1** (exact words: *"I would like to impliment the recomended functionality with return to cycle settings that can be edited."*).  
**Base citations:** Forgejo `origin/main` `9402a06`. Docs-only this pass — do not invent implementation beyond citing existing code and locking product options.

## 2. Current state (citations — do not invent)

Read on tip `9402a0675e5924ca311974c31fc88084249c576b`.

| Piece | Where | What it does today |
|---|---|---|
| **C0 due band** | `src/calcs/bull-exposure.js` **547–570** `dueBandForFemale` | Comment: *“C0 due band from exposure ± gestation; confirmation date is status only.”* **`earliestDue = exposureStart + G`**, **`latestDue = exposureEnd + G`** (or `null` if open-ended). `confirmedOn = confirmedBredDate` when tick is on — **status only**, not a conception date. |
| Gestation **C3** | same file **8–11**, **136–141** | Cattle **283**, sheep **150**, goat **150**. |
| Exposure union | same file **459–475** `includedIntervalsForFemale` / `unionExposureWindow` | Merges all `includeInView` intervals for the female; open `exposureEnd` → open latest. **Does not truncate** at `confirmed_bred_date`. |
| Animals due chrome | `src/features/animals/index.js` **754–782** | Due subline when Pregnancy Check filter **or** `confirmedBred === true` **or** any included exposure. Format: `Due {earliest} – {latest}` (or `– …` if no end). Also `Confirmed on {date}` and optional breeding-record expected calving. |
| i18n | `src/i18n/locales/en.json` (~749–751) | `confirmedOn`, `expectedCalving`, `dueBand`. |
| Pregnancy Check set **D0** | `bull-exposure.js` **498–545** | Open + exposed + protocol; **excludes** confirmed bred. Protocol uses **`minDaysPostCalving`** as a **check-eligibility** clock, not a due-band earliest. |
| Post-calving clock (protocol only) | `bull-exposure.js` **14–19**, **483–513**; farm_settings Gs1 | `latestCalvingDate` from `animal_calving_records.calved_at`. Defaults cattle **45** / sheep **30** / goat **30** days **post-partum before preg-check eligibility**. Heifers with no calving: post-calving N/A (AND still passes that half). |
| Return-to-cycle / anestrus constants | — | **None** for due-band earliest. No industry cycling interval in calcs beyond the preg-check protocol ints above. |
| OI-0243 lock (C0+C3) | brief / OPEN_ITEMS | Explicit: confirmation ≠ conception; band = exposure ± G. |
| Preg check settings (OI-0244) | Animals dialog + Farm Settings; Pg0 | Editable protocol thresholds; hide button until schema released. **Pattern to reuse** for return-to-cycle editors under **S1**. |

### 2.1 Was Tim right that “last-possible” is shown as START?

**No — not as coded on `9402a06`.** Last exposure **end** maps to **`latestDue`** (range **END**). Exposure **start** maps to **`earliestDue`** (range **START**). `confirmed_bred_date` is shown as **“Confirmed on …”**, not as either due endpoint.

What *can* feel wrong on a continuous spring turnout:

- **Earliest** is often **too early**: `exposureStart + G` ignores that a cow that calved last year was unlikely fertile until postpartum return-to-cycle.
- **Latest** is **not capped** by `confirmed_bred_date`: if membership/`exposureEnd` is open or later than the check date, latest can be open (`…`) or later than Tim expects.
- UX shows both **Confirmed on {date}** and **Due {earliest} – {latest}** on the same green subline — easy to misread which date is which.

**Bug-vs-spec:** Do **not** “fix” by swapping start/end (that would break locked C0). Treat Tim’s ask as a **product refinement** of earliest (postpartum) + optional latest cap (confirmed_bred_date) — see options **B** / **R** / **E** / **L**.

## 3. Goals

1. Confirmed-bred females show an earliest–latest due **range** coherent with Pregnancy Check / exposure bands.
2. **Latest** = last plausible conception from exposure **ending at or before** `confirmed_bred_date` (when present), plus gestation → range **END**.
3. **Earliest** can use **last calving + per-species postpartum return-to-cycle** (when a calving record exists), combined with exposure start, plus gestation.
4. Clear handling when calving or exposure is missing / open-ended; badges, not silent wrong numbers.
5. Stay multi-species-coherent with OI-0244 (**X1**).
6. **S1 LOCKED:** return-to-cycle days are **editable** `farm_settings` (migration **048**); editors beside Preg check settings / Farm Settings; Pg0-style release gate.

## 4. Non-goals (this OI)

- Redefining Pregnancy Check membership (D0) or protocol thresholds (Gs1 / Gd) — those stay OI-0243/0244. Protocol post-partum ≠ return-to-cycle **P**.
- Treating `confirmed_bred_date` as conception (rejected under OI-0243 **C1** unless Tim explicitly reverses).
- Writing exposure rows / new exposure tables (F0 stays).
- Veterinary diagnosis, ultrasound aging, or assumed-days-pregnant at check (unless Tim picks that axis).
- Applying SQL / raising `RELEASED_SCHEMA_VERSION` in this docs pass (048 file-only; RELEASED stays **47** until separate apply+bump).
- Rewriting OI-0232 confirmed-bred tick/date semantics.
- Reopening / widening already-applied migration **047**.

## 5. Options (LOCKED — Tim t776u chose Design rec with S0→S1; non-chosen options retained for history)

### B — Tim’s “last-possible as START” belief

- **B0 — Not a start/end swap bug; refine product (LOCKED — Design recommendation).** Cite §2.1: code already puts last exposure end on **END**. Ship E/L refinements; improve copy if needed so “Confirmed on” ≠ due start.
- **B1 — Treat as bug and swap earliest/latest.** **Consequence:** contradicts C0 tests and OI-0243 lock; **reject** unless citations were wrong (they are not on this tip).

### R — Range model for confirmed-bred

- **R0 — Keep C0 unchanged** for confirmed-bred (exposure start/end + G; confirmed date status only). **Consequence:** Tim’s earliest ask unmet; continuous turnout still too-wide early.
- **R1 — Refine C0 for confirmed-bred / due display (LOCKED — Design recommendation).** Keep exposure±G as the base; **narrow earliest** with postpartum return-to-cycle when calving exists; **cap conception-end** at `confirmed_bred_date` when set (see E/L). **Apply the refined band to all due lines via one shared `dueBand` helper** (Pregnancy Check open-set rows + confirmed-bred); membership **D0** unchanged.
- **R2 — Replace band with confirmation-centric math** (C1-style assumed days pregnant). **Consequence:** needs assumed-days lock; fights OI-0232/0243 “confirmation ≠ conception.”

### E — Earliest due anchor

Let `G` = species gestation (C3). Let `P` = postpartum **return-to-cycle** interval (option **P** — **not** the same semantic as preg-check `minDaysPostCalving`, though numbers may look similar).

- **E0 — Exposure start only (today).** `earliestDue = exposureStart + G`.
- **E1 — max(exposure start, last_calving + P) + G when calving exists; else exposure start + G (LOCKED — Design recommendation).** Matches Tim’s continuous-bull + last-year calving case. Heifers / no calving: fall back to exposure start; optional badge (U).
- **E2 — last_calving + P only** (ignore exposure start). **Consequence:** can invent an earliest before the bull was present.
- **E3 — confirmed_bred_date − assumed_days_pregnant + …** **Consequence:** C1-like; needs another constant.

### L — Latest due anchor

- **L0 — Exposure end + G (today).** Open end → open latest (`…`).
- **L1 — Conception-end = min(exposureEnd, confirmed_bred_date) when confirmed_bred_date set; if exposure open-ended, use confirmed_bred_date as cap; then + G (LOCKED — Design recommendation).** If not confirmed / no date: keep L0. Matches Tim’s “last exposure prior to preg check = range END.”
- **L2 — confirmed_bred_date alone as conception (+ G)** as latest (or point). **Consequence:** ignores earlier bull removal; weaker when check is days after bull out.

### P — Postpartum return-to-cycle defaults (LOCKED P-a)

**Honesty label:** these are **starting defaults** drawn from **common published ranges** for postpartum return to fertile cycling / voluntary wait — **not** farm-specific medical advice and **not** the same field as OI-0244 preg-check `minDaysPostCalving`. Under **S1** Tim can edit them in Farm Settings / Preg check settings dialog.

Illustrative published-range context (for Tim’s lock, not as code facts beyond “common ranges”):

- **Cattle:** often discussed ~**40–60** days postpartum before reliable cycling / breeding wait.
- **Sheep / goat:** typically **shorter** than cattle; seasonality matters; ballpark ~**20–40** days is commonly cited in husbandry summaries — **uncertain**.

| Pick | Cattle | Sheep | Goat | Notes |
|---|---|---|---|---|
| **P-a (LOCKED)** | **45** | **25** | **25** | Defaults for the three editable ints; still a **different** constant/name from preg-check post-partum |
| **P-b** | **60** | **30** | **30** | More conservative earliest (later first possible due) |
| **P-c** | **40** | **20** | **20** | More aggressive earliest |

### S — Where P lives

- **S0 — Compile-only constants in calcs (Design recommendation for v1 — not chosen).** Same pattern as C3 gestation. No migration.
- **S1 — `farm_settings` per-species columns (LOCKED — Tim t776u).** Editable return-to-cycle days; **one int per species** (cattle / sheep / goat) — not pairs. New migration **048** after applied **047**; Tim **yes + verified backup**; RELEASED bump separate; CP-55/56. Do **not** fold into already-applied 047. Editing UI: alongside **Preg check settings** dialog / Farm Settings; **same write path** as OI-0244 Ps0; **Pg0-style** hide until 048 applied + released (new ceiling after RELEASED bump).

### U — UX

- **U0 — Same Animals due subline; Confirmed bred filter shows earliest–latest; badge when missing calving (for E1) or missing/ambiguous exposure (LOCKED — Design recommendation).** Keep `Confirmed on {date}` as status. Optional short hint that earliest uses calving+P when present.
- **U1 — Refined band only when Confirmed bred filter is on;** other views keep raw C0. **Consequence:** two formulas visible depending on filter — confusing.
- **U2 — U0 + explicit “earliest from calving+P / latest from exposure≤confirm” helper copy** near Preg check settings or first due line.

### X — Species scope

- **X0 — Cattle only first.**
- **X1 — Cattle + sheep + goat (LOCKED — Design recommendation).** Coherent with OI-0244 **E1**; P-a supplies three defaults.

### Edge handling (locked with E/L)

| Case | Locked behavior |
|---|---|
| No prior calving | Earliest = exposure start + G; optional “no calving record” badge when Confirmed bred |
| Open-ended exposure + confirmed date | Latest = confirmed_bred_date + G (L1 cap) |
| Open-ended + not confirmed | Latest open (`…`) as today |
| Confirmed, no exposure in view | No band (or breeding-record expected only); keep Confirmed on + missing-exposure badge |
| `confirmed_bred` with NULL date (D4) | Keep date-missing badge; do not invent L1 cap |

## 6. Locked (Tim, card t776u answering t775s3213, ~9:55 AM ET)

**B0+R1+E1+L1+P-a(cattle45/sheep25/goat25)+S1+U0+X1**

Tim locked Design’s recommended functionality with editable return-to-cycle settings (exact words: *"I would like to impliment the recomended functionality with return to cycle settings that can be edited."*). Interpretation (Orchestrator + Design): Design rec on tip `52026be6e603020e3cff3fd30b5e846080a0508b` with **S0→S1**; apply refined band to **all** due lines via one shared helper (Design lean); migration **048**; editors beside Preg check settings / Farm Settings with Ps0 write path + Pg0-style gate.

| Axis | Locked | Meaning |
|---|---|---|
| B0 | ✓ | Not a start/end swap; refine product |
| R1 | ✓ | Refine C0; shared dueBand for all due lines; D0 membership unchanged |
| E1 | ✓ | earliest = max(exposureStart, lastCalving+P)+G when calving |
| L1 | ✓ | latest conception-end = min(exposureEnd, confirmed_bred_date) when date set; +G |
| P-a | ✓ | Defaults cattle **45** / sheep **25** / goat **25** |
| S1 | ✓ | Editable farm_settings; migration **048**; three ints; no reopen 047 |
| U0 | ✓ | Animals due chrome + badges; Confirmed on stays status |
| X1 | ✓ | Cattle + sheep + goat |

**READY FOR BUILD** after docs land on `main` (Orchestrator land card; Tim’s land yes) — Build **may** also start from this locked tip ahead of docs land (same coordination pattern as recent OIs). Migration **048** stays **file-only / unapplied** until Tim’s **separate** yes + verified backup. `RELEASED_SCHEMA_VERSION` stays **47** until apply + separate bump unlocks editors (Pg0-style). No exposure-row write (F0). D0 membership unchanged.

## 7. Acceptance criteria (LOCKED — Build after docs land / from locked tip)

- [x] Spec **LOCKED** (t776u / t775s3213): **B0+R1+E1+L1+P-a(cattle45/sheep25/goat25)+S1+U0+X1**.  
- [ ] Docs tip landed on main (separate Tim land yes) **or** Build starts from this locked tip per Orchestrator.  
- [ ] Shared `dueBand` helper: **earliest** = max(exposureStart, lastCalving+P)+G when calving exists, else exposureStart+G; **latest** = min(exposureEnd, confirmed_bred_date)+G when confirm date set (open exposure → confirm cap); else exposureEnd+G / open.  
- [ ] Applied to **all** due lines (Pregnancy Check + confirmed-bred); D0 membership unchanged.  
- [ ] P-a defaults cattle 45 / sheep 25 / goat 25 as **defaults** for three editable ints (distinct from preg-check post-partum).  
- [ ] Migration **048** file-only — **no apply** without Tim yes + verified backup; do **not** reopen 047.  
- [ ] `RELEASED_SCHEMA_VERSION` stays **47** until apply + separate RELEASED bump; editors Pg0-style hidden until new ceiling.  
- [ ] Editors alongside Preg check settings dialog / Farm Settings; same Ps0 write path.  
- [ ] U0 Animals due chrome + badges; X1 all breeding species; B0 refine not swap.  
- [ ] No exposure-row write; tests cover continuous-turnout case Tim described + heifer/no-calving + open-ended+confirm + D4 NULL date.

## 8. Open questions

**None for Tim** — axes locked on t776u to Design’s rec with **S1**. Build invents nothing in scope; migration **048** still needs Tim’s separate yes + verified backup before apply; RELEASED stays **47** until release process; no exposure-row write (F0); D0 unchanged.

## 9. Migration implications

- **S1 LOCKED:** new migration **048** after applied **047** (do **not** widen 047 retroactively).
- **Columns:** three ints on `farm_settings` — return-to-cycle days for cattle / sheep / goat (defaults **45 / 25 / 25**). One int per species (not exposure/post-partum pairs). Names distinct from `preg_check_min_days_post_*` (Build picks SCHEMA-legal names).
- **Gates:** Tim **yes + verified backup** before apply; stage file-only with code; RELEASED bump **separate** from code land (stays **47** until then); Animals/Farm Settings editors follow OI-0244 dialog patterns only after release gate (Pg0-style).

## 10. Related

- OI-0243 / OI-0244 (exposure, C0/C3, D0/D4, Gs1 protocol — protocol post-partum ≠ return-to-cycle P)
- OI-0232 / OI-0234 (confirmed_bred_date)
- SCHEMA §9.7, §9.9; UX §15.0–§15.1
- Tip cited (parent main): `9402a0675e5924ca311974c31fc88084249c576b`
- PROPOSED tip locked from: `52026be6e603020e3cff3fd30b5e846080a0508b`

---

**Tip instruction:** **SPEC LOCKED / READY FOR BUILD**. Do **not** land on main until Tim yeses the land card. Do **not** apply migration **048** without Tim’s separate yes + verified backup. RELEASED stays **47** until apply + bump. No exposure-row write (F0). D0 membership unchanged.
