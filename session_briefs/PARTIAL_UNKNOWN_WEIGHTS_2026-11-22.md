# Per-event unknown season metrics + historical weight fix + require weight going forward (OI-0249)

**Status:** **PROPOSED** — awaiting Tim lock. No Build until lock. This tip is docs only. **No SQL on this tip.** Any later production data write needs a verified backup and a **separate** Tim yes (after a SELECT-only count/list).  
**Owner:** GTHO Design → GTHO Build (only after lock, and after Tim’s docs land yes — or from the locked tip ahead of land if Orchestrator coordinates).  
**Parent:** Forgejo `origin/main` `0d5d0b786dcf43fba8b91c29239e3da9e2dff83a` (OI-0248 LOCKED docs; PR #120 merge is an ancestor; compiled `RELEASED_SCHEMA_VERSION` **48**).  
**Also related:** OI-0246 season-metrics **Z1** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md) §11); OI-0248 missing-weight pill (**Ib+Mw+Ac+Pl+Pf+Pa+Sp** — do not reopen); DMI-9 §1.6 ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md)); PR #120 peer-pasture DMI scope.  
**Schema / migration:** **Part A — none.** **Part B apply** (if locked) is a data write to existing `animal_weight_records` and/or `event_group_windows.avg_weight_kg` — **no new column / no migration**, but backup + separate yes. **Part C** is app validation on existing records — **no new column.** A database check constraint would need a later migration; not recommended as the first step.

## 1. Problem

Two Tim asks, same morning, same root cause (missing / zero weights leaking into Locations season totals).

**Part A — t889u (~6:16 AM ET, 2026-11-22), on E-1 dashes:** “There have been multiple groups since March of this year that went through that paddock and ate grass? And dropped manure? So its not unknown for the whole season, just one event is unknown.”

Build’s context: the closed event **2026-03-27 → 2026-04-03** on **E-1** had Culls / Mixed Calves / Shenk Culls with closed `avg_weight_kg = 0`. That set sticky `dmiUnknown` + `npkUnknown` for the **whole W1 season**, even though later events on that paddock have real weights. Tim’s direction: unknown should be **per-event**, not season-sticky. This **amends how Z1 is applied across a season** (Z1 itself still means never-present = 0, missing = “—” — not a silent 0).

**Parts B and C — t892u (~6:17 AM ET):** “lets fix all weight records in the past, and require that all animals have a weight in the system going forward.”

- **B:** find animals / groups with no recorded weight, and closed event-window snapshots with `avg_weight_kg = 0` (E-1 March event is the example). Choose a fill-in source, and whether to rewrite stored snapshots vs re-derive at read time.  
- **C:** require a weight on animal create / edit (and optionally group move / event close). Choose block-save vs class-default prefill. Relate to, but do not reopen, OI-0248.

**Split:** do **not** fold this into the OI-0246 list-parity + metrics code tip (in-flight PR #123 / restack off `0d5d0b7`). That tip keeps today’s sticky Z1 application; this OI is the follow-up.

## 2. Current state (citations — do not invent)

Read on tip `0d5d0b786dcf43fba8b91c29239e3da9e2dff83a` (main). The in-flight list-parity implementation (tip `9e73e19`, not on main) **preserves the same sticky flags** — `dmiUnknown` / `npkUnknown` still null the whole window total after summing known slices.

| Piece | Where | What it does today |
|---|---|---|
| Season DMI unknown is sticky | `src/features/events/rotation-calendar/location-metrics.js` `computeLocationMetrics` (~276–337 on main; same pattern on `9e73e19` ~509–603) | Walks each day in the W1 window. If any of **this location’s** open-event demand rows that day has `head > 0` but `avgWeightKg` not `> 0`, sets `dmiUnknown = true` and skips adding that day. Known later (or earlier) days may still be added into `dmiKg`, but **`finalDmi` is null whenever `dmiUnknown` is true** — the known-day total is thrown away. PR #120 already scoped the check to this location’s `openEventIds` (a peer pasture’s unknown weights no longer dash this one). Same-event multi-group missing weight still dashes **that day**. |
| Season NPK unknown is sticky | same file, AUDs/NPK loop + residual addend on the list-parity tip | `npkUnknown = true` on a missing-weight group (or a residual addend with no NPK %) nulls **all** season N/P/K, including excretion already summed from known-weight events. |
| AUDs ignore unknown weights | same file (`audsKnown: true` always) | AUDs still add `head × (liveAvg \|\| 0) × days × share`. A zero-weight closed snapshot contributes **0 AUDs**, not “—”. This is looser than Z1 (“missing = —”, never a silent 0). |
| Z1 lock (OI-0246) | Locations brief §11; `t849s3511` | Never-present in the window = **0**. Missing weights / required inputs = **“—”**. The lock does not say “one missing slice dashes the whole season.” That stickiness is as-built, not an explicit Tim sentence. |
| DMI-9 already drops per day | `IMPLIED_PASTURE_DMI_2026-11-17.md` §1.6; CALC DMI-9 | A counted day with head > 0 and no usable weight is **dropped**, and the UI can say “counted N of D days.” All days dropped → Unknown. Locations season cells do **not** yet follow this. |
| Closed window trusts the snapshot | `src/calcs/window-helpers.js` `getLiveWindowAvgWeight` / `getLiveWindowHeadCount` / `hasUnknownLiveWindowWeights` | If `dateLeft != null`, average and head come from `gw.avgWeightKg` / `gw.headCount` (`?? 0`). **No re-derive from `animal_weight_records`.** `hasUnknownLiveWindowWeights` returns **false** for closed windows, so the NPK path’s “unknown” comes from `!(liveAvg > 0)` when the snapshot is 0. `groupWindowsDailyDemand` uses the same helper, so DMI days in a closed zero-snapshot event also look unknown. |
| Close stamps live, but falls back to the old snapshot | `src/data/store.js` `closeGroupWindow` / `splitGroupWindow` (~772–850) | Live recompute at `closeDate`, then `avgWeightKg: liveAvg > 0 ? liveAvg : openGW.avgWeightKg`. If live is 0 and the open snapshot was already 0, the closed row keeps **0**. |
| Validator vs existing zeros | `src/entities/event-group-window.js` `validate`; `window-close-guard.js` `checkWindowCloses` | Validate requires `avgWeightKg > 0` (closed `headCount` may be 0). The close **preflight** substitutes `avgWeightKg: 1` when the existing value is 0 so the date guard is not confused with a weight error — it does **not** write 1. Existing `avg_weight_kg = 0` rows therefore predate or bypass today’s validator (e.g. older writes / v1 migration). A rewrite would also make those rows valid. |
| Place already requires a positive average | `src/features/events/place-wizard.js` (~282–287) | Place refuses to write if computed `avgWeightKg` is not `> 0`. **Class default counts** here, because `getLiveWindowAvgWeight` uses it. That is weaker than OI-0248 **Mw** (class default is not a recorded weight). |
| Animal create / Edit Animal do not require a weight | `src/features/animals/index.js` `saveAnimal` (~2753–2858) | Name / composite head gates exist. A weight record is written only for a composite when `totalWeight` is filled. Individuals get weights from the separate ⚖ Weight / Quick Weight / group-weight paths. An animal can be saved with **no** `animal_weight_records` row. |
| OI-0248 (locked, not this OI) | `MISSING_WEIGHT_INDICATOR_2026-11-22.md` | Indicator + conditional “Missing weight” pill. **Mw:** missing = no recorded weight on or before today; class default does not count. **Ac:** pill also on Culls. Does **not** change DMI math and does **not** require a weight on save. |
| Score | `location-metrics.js` avg `forageQuality` | Average of observations in the window, else all-time for that location. **Independent of weights.** `scoreKnown` is true when any score exists. Missing weights do not dash Score today. |

## 3. Goals / non-goals

**Goals**

- Season DMI / NPK (and, if locked, AUDs) on Locations should not go “—” for the whole W1 window just because one event (or some days) lacked usable weights, when other events on that paddock are known.
- Be honest when the total is incomplete (a partial mark, not a silent full-season number), and still “—” when nothing in the window can be computed.
- Offer a path to fix historical zero snapshots and animals with no recorded weight, starting with a **read-only** list.
- Going forward, require that animals have a recorded weight in the system, so new zero snapshots are not stamped.

**Non-goals**

- Do not reopen OI-0246 list-parity / formula locks (**S1+F1+L1+H0+C1** and NPK **Ns+R1+Kc** stay). This OI only amends **how Z1 is applied across the season**.
- Do not reopen OI-0248 (**Ib+Mw+Ac+Pl+Pf+Pa+Sp** stay). The pill remains the find-and-fix UI.
- Do not fold this into PR #123 / the list-parity code tip.
- Do not run SQL or write production data on this docs tip. A SELECT-only dry-run happens only after lock, as its own step. A write needs backup + a separate yes.
- Do not invent a `current_weight` column on `animals`. Source of truth stays `animal_weight_records`.

## 4. Option axes (codes in values)

### Part A — Season rollup when some events or days are unknown (amends Z1 application)

**Z — What the season cell shows**

| Code | Meaning |
|---|---|
| **Zs** | Sticky (today): any unknown slice in the window → the whole season cell is “—”. |
| **Zp** | **Partial (recommended):** sum the known slices; mark the cell as partial (e.g. a “partial” hint or “N of D days/events”). If every slice is unknown, still “—”. Never-present stays 0 (Z1). |
| **Zd** | Sum known slices with **no** partial mark (looks complete; not recommended). |

**G — How fine is “unknown”?**

| Code | Meaning |
|---|---|
| **Ge** | Per event: an event with any unknown group is dropped as a whole. Matches Tim’s wording (“just one event is unknown”). |
| **Gd** | **Per day (recommended):** drop only the days that are unknown on this location (same grain as DMI-9 §1.6 and F1 unmeasured-hay days). A fully unknown event drops all of its days, so E-1’s March stay is excluded and later known stays are kept. |
| **Gg** | Per group-window: drop only the unknown group; keep other groups on the same day/event. |

**U — AUDs**

| Code | Meaning |
|---|---|
| **Ua** | Keep today’s behavior: AUDs always “known,” using 0 when weight is missing. |
| **Uz** | **Recommended:** apply the same unknown / partial rule as DMI and NPK (no silent 0). |

**S — Pasture Score**

| Code | Meaning |
|---|---|
| **Sc** | **Recommended (today’s behavior):** Score is the average of forage-quality observations on hand. Missing weights do **not** dash or partial Score. |
| **Sp** | Mark Score partial when some events in the window have no survey. |
| **Sw** | Dash Score when any event in the window has unknown weights. |

### Part B — Historical backfill (t892u)

Any production write is **blocked** until: (1) a SELECT-only count/list, (2) a verified backup, (3) a **separate** Tim yes. This docs tip does none of those.

**B source — where a fill-in weight comes from**

| Code | Meaning |
|---|---|
| **Bn** | **Recommended when a record exists:** latest recorded weight on or before the as-of / close date (same rule as `latestWeightForAnimal`). |
| **Ba** | If none on or before, use the nearest recorded weight **after** that date. |
| **Bc** | Use the class default. |
| **Be** | **Recommended for leftovers:** show Tim the list (no prior record, or only a later record if **Ba** is not locked) to enter or approve. |

**R / W — how it is applied**

| Code | Meaning |
|---|---|
| **Rr** | **Recommended with Part A:** compute-on-read. When a **closed** snapshot is 0 or missing, re-derive average from weight records on or before the close date (open windows already recompute live). **No database write.** Unblocks E-1-style season dashes even before a backfill write. |
| **Rt** | Trust the stored snapshot always (today). |
| **W0** | No data write (rely on **Rr** only). |
| **Wr** | Rewrite closed `event_group_windows.avg_weight_kg` (only rows that are 0 / missing). |
| **Wa** | Insert missing `animal_weight_records` (dated) for animals that have no record. |
| **Ww** | **Recommended for “fix the past,” gated:** both **Wr** and **Wa**, only after the dry-run list + backup + separate yes. |

Do **not** auto-write a class default as a recorded weight (**Bc** as a silent **Wa**): that would clear the OI-0248 **Mw** indicator without Tim actually weighing the animal.

### Part C — Require a weight going forward (t892u)

**C where**

| Code | Meaning |
|---|---|
| **Ca** | Require a recorded weight when **creating** an animal. |
| **Ce** | Require a recorded weight when **saving Edit Animal** (if none on file yet). |
| **Cm** | Tighten **place / move**: refuse if the group has no recorded weight as of the date (class default alone is not enough). Today’s place wizard already blocks a computed average of 0, but class default currently counts. |
| **Cc** | Block **event / group-window close** when any present animal has no recorded weight as of the close date — so new `avg_weight_kg = 0` snapshots are not stamped. |

**C missing behavior**

| Code | Meaning |
|---|---|
| **Cb** | **Recommended:** block save / close until a recorded weight is entered. Class default may be offered as a **suggestion Tim confirms**, which then writes a real record. |
| **Cp** | Prefill class default and let Tim accept or change. |
| **Cq** | Silently use class default (not recommended; conflicts with **Mw** / **Cw**). |

**C what counts**

| Code | Meaning |
|---|---|
| **Cw** | **Recommended:** a row in `animal_weight_records` (same idea as OI-0248 **Mw**). Class default does not satisfy the requirement. |
| **Cd** | Recorded weight **or** class default. |

## 5. Design recommendation

**Zp+Gd+Uz+Sc + Rr+Bn+Be + Ww + Ca+Ce+Cm+Cc+Cb+Cw**

- **A.** Tim is right: later E-1 groups did graze and drop manure; the season cell should not be “—” because one March stay has a zero snapshot. Sum known days (**Zp** + **Gd**, same grain as DMI-9), mark the total partial, and still dash only when nothing known remains. Apply the same rule to AUDs (**Uz**) so they do not silently under-count. Leave Score as the survey average (**Sc**).
- **B.** Ship **Rr** with Part A (compute-on-read, no SQL) so closed `avg_weight_kg = 0` is re-derived from on-or-before weight records when those records exist. Separately, after a SELECT-only list, Tim can yes a **Ww** write: rewrite zero snapshots from **Bn**, and add dated records for animals still missing a weight after Tim reviews leftovers (**Be**). Do not invent later-dated or class-default “records” unless Tim picks **Ba** / **Bc** on the list.
- **C.** Require a recorded weight on create, Edit Animal save, place/move, and close (**Ca+Ce+Cm+Cc**), and **block** until one is entered (**Cb+Cw**). That matches “going forward” and stops new zero snapshots. OI-0248’s pill stays as the find-and-fix tool for anything still missing until backfill + these gates land.

**SQL / gates (explicit):** this docs tip writes no SQL. Part A + **Rr** + Part C need **no migration**. Part B dry-run is SELECT only (counts + a named list of zero snapshots and animals with no record). Part B **Ww** is a data write to existing tables — verified backup + separate Tim yes; still no new column. A later CHECK constraint would be its own migration, only after the backfill, and is not part of this rec.

## 6. Acceptance (after lock — not for this tip)

- [ ] Locations season DMI / NPK (and AUDs if **Uz**) for a paddock like E-1 sum known events/days in the W1 window and show a partial mark when some slices are unknown; they are “—” only when nothing known remains; never-present stays 0.
- [ ] A later known-weight event is not wiped because an earlier closed snapshot is 0.
- [ ] Same-event / same-day multi-group missing weight still drops that event-day (PR #120 rule held).
- [ ] Score follows the locked **S** choice (rec **Sc**: unchanged by missing weights).
- [ ] If **Rr**: closed zero snapshots re-derive from on-or-before weight records at read time; open windows still recompute live.
- [ ] If **Ww** (or **Wr** / **Wa**): only after SELECT-only list + backup + separate Tim yes; no write in the same step as the list.
- [ ] If Part C: create / edit / place / close follow the locked where + **Cb**/**Cw** (or chosen alts). OI-0248 indicator and pill still match **Mw**.
- [ ] No new `animals` column. List-parity PR does not include this OI.

## 7. Related

- OI-0246 Z1 / S1 / F1 / Ns / Kc — formula stays; this amends season-wide application of “missing = —”.
- OI-0248 — find-and-fix UI; locks unchanged.
- DMI-9 §1.6 — per-day drop + “counted N of D days” is the pattern **Gd+Zp** should echo on Locations.
- PR #120 — peer-pasture unknown no longer dashes this location; still the same-event rule.
- OI-0091 / `closeGroupWindow` — closed snapshot is authoritative today; **Rr** is a compute-on-read exception when that snapshot is 0.
- Parent main: `0d5d0b786dcf43fba8b91c29239e3da9e2dff83a`.

---

**Tip instruction:** **PROPOSED.** Awaiting Tim lock on **A + B + C**. Do **not** land on main until Tim locks and yeses the docs land card. Do **not** fold into the OI-0246 list-parity tip / PR #123. No SQL on this tip. Part B writes stay gated (dry-run, then backup + separate yes).
