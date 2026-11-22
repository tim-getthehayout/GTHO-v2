# Per-event unknown season metrics + historical weight fix + require weight going forward (OI-0249)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-22 ~6:30 AM ET, via Orchestrator, card **t901s3689** + **t901u**, lock **Zp+Gg+Ua+Sc+Bn+Ba+Be+Rt+Ww+Ca+Ce+Cb+Cw**). Opened ~6:17 AM ET from Tim’s asks **t889u** (~6:16 AM ET) and **t892u** (~6:17 AM ET). This docs tip is ready for Tim’s land of **docs**. **No SQL on this tip.** Part B **Ww** write is gated: SELECT-only list first (separate step), then verified backup + **separate** Tim yes.  
**Owner:** GTHO Design → GTHO Build (after docs land on main **or** from this locked tip ahead of land per Orchestrator coordination; Orchestrator land card for docs — land only after Tim yes).  
**Parent:** Forgejo `origin/main` `9aa913e06bc70f772ba6a8d25c9354f4bc954070` (PR #124 merge — OI-0248 missing-weight indicator on main; compiled `RELEASED_SCHEMA_VERSION` **48**). Restacked off `0d5d0b7` after main moved. Citations in §2 were read on `0d5d0b7`.  
**Also related:** OI-0246 season-metrics **Z1** ([LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md](LOCATIONS_MANAGEMENT_VIEW_2026-11-21.md) §11); OI-0248 missing-weight pill (**Ib+Mw+Ac+Pl+Pf+Pa+Sp** — do not reopen; code on main via PR #124); DMI-9 §1.6 ([IMPLIED_PASTURE_DMI_2026-11-17.md](IMPLIED_PASTURE_DMI_2026-11-17.md)); PR #120 peer-pasture DMI scope.  
**Schema / migration:** **Part A — none.** **Part B apply** (**Ww**) is a data write to existing `animal_weight_records` and/or `event_group_windows.avg_weight_kg` — **no new column / no migration**, but backup + separate yes. **Part C** is app validation on existing records — **no new column.** A database check constraint would need a later migration; not recommended as the first step. **Rt** is locked: no read-time re-derive.

## 1. Problem

Two Tim asks, same morning, same root cause (missing / zero weights leaking into Locations season totals).

**Part A — t889u (~6:16 AM ET, 2026-11-22), on E-1 dashes:** “There have been multiple groups since March of this year that went through that paddock and ate grass? And dropped manure? So its not unknown for the whole season, just one event is unknown.”

Build’s context: the closed event **2026-03-27 → 2026-04-03** on **E-1** had Culls / Mixed Calves / Shenk Culls with closed `avg_weight_kg = 0`. That set sticky `dmiUnknown` + `npkUnknown` for the **whole W1 season**, even though later events on that paddock have real weights. Tim’s direction: unknown should be **per-event**, not season-sticky. This **amends how Z1 is applied across a season** (Z1 itself still means never-present = 0, missing = “—” — not a silent 0). Locked grain is **Gg** (skip only the missing-weight group; keep other groups that day).

**Parts B and C — t892u (~6:17 AM ET):** “lets fix all weight records in the past, and require that all animals have a weight in the system going forward.”

- **B:** find animals / groups with no recorded weight, and closed event-window snapshots with `avg_weight_kg = 0` (E-1 March event is the example). Locked fill-in is **Bn+Ba+Be**; apply is a gated permanent rewrite (**Ww**), not a read-time recalc (**Rt**, not **Rr**).
- **C:** require a weight on animal create and Edit Animal only (**Ca+Ce**, not place/move or close). Block save until a recorded weight is entered; class default may be offered as a confirmable suggestion that writes a record (**Cb+Cw**). Relate to, but do not reopen, OI-0248.

**Split:** do **not** fold this into the OI-0246 list-parity + metrics code tip (in-flight PR #123 / restack). That tip keeps today’s sticky Z1 application; this OI is the follow-up.

## 2. Current state (citations — do not invent)

Read on tip `0d5d0b786dcf43fba8b91c29239e3da9e2dff83a`. Parent of this locked tip is main `9aa913e06bc70f772ba6a8d25c9354f4bc954070` (PR #124). The in-flight list-parity implementation (restacked tip `068cc61` / earlier `9e73e19`, not on main) **preserves the same sticky flags** — `dmiUnknown` / `npkUnknown` still null the whole window total after summing known slices.

| Piece | Where | What it does today |
|---|---|---|
| Season DMI unknown is sticky | `src/features/events/rotation-calendar/location-metrics.js` `computeLocationMetrics` (~276–337 on main; same pattern on the list-parity tip) | Walks each day in the W1 window. If any of **this location’s** open-event demand rows that day has `head > 0` but `avgWeightKg` not `> 0`, sets `dmiUnknown = true` and skips adding that day. Known later (or earlier) days may still be added into `dmiKg`, but **`finalDmi` is null whenever `dmiUnknown` is true** — the known-day total is thrown away. PR #120 already scoped the check to this location’s `openEventIds` (a peer pasture’s unknown weights no longer dash this one). Same-event multi-group missing weight still dashes **that day** as-built — this OI’s locked **Gg** changes that for Locations season totals (keep the known groups). |
| Season NPK unknown is sticky | same file, AUDs/NPK loop + residual addend on the list-parity tip | `npkUnknown = true` on a missing-weight group (or a residual addend with no NPK %) nulls **all** season N/P/K, including excretion already summed from known-weight events. |
| AUDs ignore unknown weights | same file (`audsKnown: true` always) | AUDs still add `head × (liveAvg \|\| 0) × days × share`. A zero-weight closed snapshot contributes **0 AUDs**, not “—”. Locked **Ua** keeps this behavior. |
| Z1 lock (OI-0246) | Locations brief §11; `t849s3511` | Never-present in the window = **0**. Missing weights / required inputs = **“—”**. The lock does not say “one missing slice dashes the whole season.” That stickiness is as-built, not an explicit Tim sentence. This OI amends the application. |
| DMI-9 already drops per day | `IMPLIED_PASTURE_DMI_2026-11-17.md` §1.6; CALC DMI-9 | A counted day with head > 0 and no usable weight is **dropped**, and the UI can say “counted N of D days.” All days dropped → Unknown. Locations season cells do **not** yet follow this. Locked Locations grain is **Gg** (per group), not DMI-9’s per-day **Gd**. |
| Closed window trusts the snapshot | `src/calcs/window-helpers.js` `getLiveWindowAvgWeight` / `getLiveWindowHeadCount` / `hasUnknownLiveWindowWeights` | If `dateLeft != null`, average and head come from `gw.avgWeightKg` / `gw.headCount` (`?? 0`). **No re-derive from `animal_weight_records`.** `hasUnknownLiveWindowWeights` returns **false** for closed windows, so the NPK path’s “unknown” comes from `!(liveAvg > 0)` when the snapshot is 0. `groupWindowsDailyDemand` uses the same helper, so DMI days in a closed zero-snapshot event also look unknown. Locked **Rt** keeps this trust-the-snapshot rule; zeros are fixed by the gated **Ww** rewrite, not at read time. |
| Close stamps live, but falls back to the old snapshot | `src/data/store.js` `closeGroupWindow` / `splitGroupWindow` (~772–850) | Live recompute at `closeDate`, then `avgWeightKg: liveAvg > 0 ? liveAvg : openGW.avgWeightKg`. If live is 0 and the open snapshot was already 0, the closed row keeps **0**. **Cc** was not locked — close is not gated by this OI. |
| Validator vs existing zeros | `src/entities/event-group-window.js` `validate`; `window-close-guard.js` `checkWindowCloses` | Validate requires `avgWeightKg > 0` (closed `headCount` may be 0). The close **preflight** substitutes `avgWeightKg: 1` when the existing value is 0 so the date guard is not confused with a weight error — it does **not** write 1. Existing `avg_weight_kg = 0` rows therefore predate or bypass today’s validator (e.g. older writes / v1 migration). A **Ww** rewrite would also make those rows valid. |
| Place already requires a positive average | `src/features/events/place-wizard.js` (~282–287) | Place refuses to write if computed `avgWeightKg` is not `> 0`. **Class default counts** here, because `getLiveWindowAvgWeight` uses it. That is weaker than OI-0248 **Mw** (class default is not a recorded weight). **Cm** was not locked — this OI does not tighten place/move. |
| Animal create / Edit Animal do not require a weight | `src/features/animals/index.js` `saveAnimal` (~2753–2858) | Name / composite head gates exist. A weight record is written only for a composite when `totalWeight` is filled. Individuals get weights from the separate ⚖ Weight / Quick Weight / group-weight paths. An animal can be saved with **no** `animal_weight_records` row. Locked **Ca+Ce+Cb+Cw** change this. |
| OI-0248 (locked, not this OI) | `MISSING_WEIGHT_INDICATOR_2026-11-22.md`; code on main `9aa913e` (PR #124) | Indicator + conditional “Missing weight” pill. **Mw:** missing = no recorded weight on or before today; class default does not count. **Ac:** pill also on Culls. Does **not** change DMI math and does **not** require a weight on save. This OI does not reopen those locks. |
| Score | `location-metrics.js` avg `forageQuality` | Average of observations in the window, else all-time for that location. **Independent of weights.** `scoreKnown` is true when any score exists. Missing weights do not dash Score today. Locked **Sc** keeps this. |

## 3. Goals / non-goals

**Goals**

- Season DMI / NPK on Locations should not go “—” for the whole W1 window just because one event (or some groups) lacked usable weights, when other groups / events on that paddock are known.
- Be honest when the total is incomplete (a partial mark, not a silent full-season number), and still “—” when nothing in the window can be computed. AUDs stay as today (**Ua**).
- Offer a path to fix historical zero snapshots and animals with no recorded weight, starting with a **read-only** list, then a gated permanent rewrite (**Ww**). Trust stored snapshots until that write (**Rt**).
- Going forward, require a recorded weight on animal create and Edit Animal save, so new animals are not left without a weight record.

**Non-goals**

- Do not reopen OI-0246 list-parity / formula locks (**S1+F1+L1+H0+C1** and NPK **Ns+R1+Kc** stay). This OI only amends **how Z1 is applied across the season**.
- Do not reopen OI-0248 (**Ib+Mw+Ac+Pl+Pf+Pa+Sp** stay). The pill remains the find-and-fix UI.
- Do not fold this into PR #123 / the list-parity code tip.
- Do not run SQL or write production data on this docs tip. A SELECT-only dry-run happens only after lock, as its own step. A write needs backup + a separate yes.
- Do not invent a `current_weight` column on `animals`. Source of truth stays `animal_weight_records`.
- Do not re-derive closed snapshots at read time (**Rt**, not **Rr**).
- Do not require a weight at place/move or event close (**Ca+Ce** only, not **Cm** / **Cc**).

## 4. Locked axes (t901s3689 / t901u)

Tim locked **Zp+Gg+Ua+Sc+Bn+Ba+Be+Rt+Ww+Ca+Ce+Cb+Cw**. Design had recommended **Zp+Gd+Uz+Sc+Rr+Bn+Be+Ww+Ca+Ce+Cm+Cc+Cb+Cw**; Tim chose **Gg** (not **Gd**), **Ua** (not **Uz**), **Rt** (not **Rr**), added **Ba** to the fill-in chain, and limited require-weight to **Ca+Ce** (not **Cm** / **Cc**).

### Part A — Season rollup when some events or days are unknown (amends Z1 application)

**Z — What the season cell shows**

| Code | Meaning |
|---|---|
| **Zs** | Sticky (today): any unknown slice in the window → the whole season cell is “—”. |
| **Zp** | **Partial:** sum the known slices; mark the cell as partial (e.g. a “partial” hint or “N of D days/events”). If every slice is unknown, still “—”. Never-present stays 0 (Z1). **LOCKED.** |
| **Zd** | Sum known slices with **no** partial mark (looks complete; not recommended). |

**Locked: Zp.** Season total = sum of known slices; mark partial; dash if nothing known remains; never-present stays 0.

**G — How fine is “unknown”?**

| Code | Meaning |
|---|---|
| **Ge** | Per event: an event with any unknown group is dropped as a whole. Matches Tim’s earlier wording (“just one event is unknown”). |
| **Gd** | Per day: drop only the days that are unknown on this location (same grain as DMI-9 §1.6 and F1 unmeasured-hay days). A fully unknown event drops all of its days, so E-1’s March stay is excluded and later known stays are kept. Design rec; **not locked.** |
| **Gg** | Per group-window: drop only the unknown group; keep other groups on the same day/event. **LOCKED.** |

**Locked: Gg** (not Design rec **Gd**). Skip only the missing-weight **group**; keep other groups that day. A same-event / same-day multi-group stay no longer dashes the whole day for Locations season totals — only the unknown group is omitted. Peer-pasture unknown still does not dash this location (PR #120 scope held).

**U — AUDs**

| Code | Meaning |
|---|---|
| **Ua** | Keep today’s behavior: AUDs always “known,” using 0 when weight is missing. **LOCKED.** |
| **Uz** | Apply the same unknown / partial rule as DMI and NPK (no silent 0). Design rec; **not locked.** |

**Locked: Ua** (not Design rec **Uz**). AUDs keep today’s behavior and still add, even when weight is 0. They are not dashed or marked partial because of missing weights.

**S — Pasture Score**

| Code | Meaning |
|---|---|
| **Sc** | **Today’s behavior:** Score is the average of forage-quality observations on hand. Missing weights do **not** dash or partial Score. **LOCKED.** |
| **Sp** | Mark Score partial when some events in the window have no survey. |
| **Sw** | Dash Score when any event in the window has unknown weights. |

**Locked: Sc.** Score is unchanged (survey average). Missing weights do not dash Score.

### Part B — Historical backfill (t892u)

Any production write is **blocked** until: (1) a SELECT-only count/list, (2) a verified backup, (3) a **separate** Tim yes. This docs tip does none of those.

**B source — where a fill-in weight comes from**

| Code | Meaning |
|---|---|
| **Bn** | Latest recorded weight on or before the as-of / close date (same rule as `latestWeightForAnimal`). **LOCKED** (first try). |
| **Ba** | If none on or before, use the nearest recorded weight **after** that date. **LOCKED** (fallback). |
| **Bc** | Use the class default. **Not locked.** |
| **Be** | Show Tim the list of leftovers (no record before or after) to enter or approve. **LOCKED.** |

**Locked: Bn+Ba+Be.** Fill-in = latest recorded weight on or before the as-of / close date; if none, the nearest recorded weight after that date; leftovers with no record at all go to a Tim list. Do **not** auto-write a class default as a recorded weight (**Bc** is not locked): that would clear the OI-0248 **Mw** indicator without Tim actually weighing the animal (or confirming a suggestion under **Cw**).

**R / W — how it is applied**

| Code | Meaning |
|---|---|
| **Rr** | Compute-on-read. When a **closed** snapshot is 0 or missing, re-derive average from weight records on or before the close date (open windows already recompute live). **No database write.** Design rec; **not locked.** |
| **Rt** | Trust the stored snapshot always (today). **LOCKED.** |
| **W0** | No data write. |
| **Wr** | Rewrite closed `event_group_windows.avg_weight_kg` (only rows that are 0 / missing). |
| **Wa** | Insert missing `animal_weight_records` (dated) for animals that have no record. |
| **Ww** | Both **Wr** and **Wa**, only after the dry-run list + backup + separate yes. **LOCKED.** |

**Locked: Rt+Ww** (not Design rec **Rr**). No read-time recalc — trust the stored closed snapshot. Zero snapshots stay 0 / unknown for season math until the gated **Ww** permanent rewrite of zero closed snapshots **and** missing weight records. **Ww** runs only after the SELECT-only list, a verified backup, and a **separate** Tim yes. Do not write in the same step as the list.

### Part C — Require a weight going forward (t892u)

**C where**

| Code | Meaning |
|---|---|
| **Ca** | Require a recorded weight when **creating** an animal. **LOCKED.** |
| **Ce** | Require a recorded weight when **saving Edit Animal** (if none on file yet). **LOCKED.** |
| **Cm** | Tighten **place / move**: refuse if the group has no recorded weight as of the date (class default alone is not enough). **Not locked.** |
| **Cc** | Block **event / group-window close** when any present animal has no recorded weight as of the close date. **Not locked.** |

**Locked: Ca+Ce only** (not Design rec **Cm** / **Cc**). Require a recorded weight on add animal and Edit Animal save. Place/move and event close are **not** gated by this OI. Existing animals still missing a weight can be found with the OI-0248 pill and are not blocked at move or close.

**C missing behavior**

| Code | Meaning |
|---|---|
| **Cb** | Block save until a recorded weight is entered. Class default may be offered as a **suggestion Tim confirms**, which then writes a real record. **LOCKED.** |
| **Cp** | Prefill class default and let Tim accept or change. |
| **Cq** | Silently use class default (not recommended; conflicts with **Mw** / **Cw**). |

**C what counts**

| Code | Meaning |
|---|---|
| **Cw** | A row in `animal_weight_records` (same idea as OI-0248 **Mw**). Class default does not satisfy the requirement by itself. **LOCKED.** |
| **Cd** | Recorded weight **or** class default. |

**Locked: Cb+Cw.** Block save until a recorded weight is on file. A class default may be offered as a confirmable suggestion; confirming it **writes an `animal_weight_records` row**. A silent default does not count.

## 5. Locked decision

**Zp+Gg+Ua+Sc+Bn+Ba+Be+Rt+Ww+Ca+Ce+Cb+Cw**

- **A.** Tim is right: later E-1 groups did graze and drop manure; the season cell should not be “—” because one March stay has a zero snapshot. Sum known slices (**Zp**) and skip only the missing-weight **group**, keeping other groups that day (**Gg**, not **Gd**). Mark the total partial, and still dash only when nothing known remains. AUDs keep today’s behavior and still add when weight is 0 (**Ua**, not **Uz**). Leave Score as the survey average (**Sc**).
- **B.** Trust the stored closed snapshot (**Rt**, not **Rr**) — no compute-on-read re-derive. After a SELECT-only list, a verified backup, and a **separate** Tim yes, permanently rewrite zero closed snapshots and write missing `animal_weight_records` (**Ww**). Fill-in source is latest on or before the as-of / close date (**Bn**); if none, nearest after (**Ba**); leftovers go to a Tim list (**Be**). Do not auto-write class defaults as records.
- **C.** Require a recorded weight on create and Edit Animal save only (**Ca+Ce**, not place/move **Cm** or close **Cc**). **Block** until one is entered (**Cb+Cw**); class default may be offered as a confirmable suggestion that writes a real record. OI-0248’s pill stays as the find-and-fix tool for anything still missing until backfill + these gates land.

**SQL / gates (explicit):** this docs tip writes no SQL. Part A + **Rt** + Part C need **no migration**. Part B dry-run is SELECT only (counts + a named list of zero snapshots and animals with no record) — a **separate** step after this tip, not in this commit. Part B **Ww** is a data write to existing tables — verified backup + separate Tim yes; still no new column. A later CHECK constraint would be its own migration, only after the backfill, and is not part of this lock.

## 6. Acceptance (after docs land / implement — not for this tip)

- [ ] Locations season DMI / NPK for a paddock like E-1 sum known group-windows in the W1 window and show a partial mark when some groups are unknown; they are “—” only when nothing known remains; never-present stays 0 (**Zp+Gg**).
- [ ] AUDs keep today’s behavior (**Ua**): they still add, using 0 when weight is missing; they are not dashed or marked partial by missing weights.
- [ ] A later known-weight group or event is not wiped because an earlier closed snapshot is 0.
- [ ] Same-event / same-day multi-group missing weight skips **only that group** and keeps the other groups that day (**Gg**). Peer-pasture unknown still does not dash this location (PR #120 scope held).
- [ ] Score is unchanged (**Sc**): survey average; missing weights do not dash Score.
- [ ] Closed snapshots are trusted as stored (**Rt**). Zero snapshots stay 0 / unknown for season math until the gated **Ww** rewrite; there is no read-time recalc.
- [ ] **Ww** runs only after a SELECT-only list + verified backup + separate Tim yes; no write in the same step as the list. Fill-in is **Bn** then **Ba**; leftovers go to Tim (**Be**).
- [ ] Create animal and Edit Animal save require a recorded weight (**Ca+Ce**) and block until one is entered (**Cb+Cw**); class default may be a confirmable suggestion that writes a record. Place/move and close are not gated. OI-0248 indicator and pill still match **Mw**.
- [ ] No new `animals` column. List-parity PR does not include this OI.

## 7. Related

- OI-0246 Z1 / S1 / F1 / Ns / Kc — formula stays; this amends season-wide application of “missing = —”.
- OI-0248 — find-and-fix UI; locks unchanged; code on main via PR #124 (`9aa913e`).
- DMI-9 §1.6 — per-day drop is the **Gd** pattern; this lock is **Gg+Zp** (group grain) on Locations season totals.
- PR #120 — peer-pasture unknown no longer dashes this location; same-event multi-group treatment for Locations season totals is now **Gg**.
- OI-0091 / `closeGroupWindow` — closed snapshot is authoritative; **Rt** keeps that (no **Rr** exception).
- Parent main: `9aa913e06bc70f772ba6a8d25c9354f4bc954070`.

---

**Tip instruction:** **LOCKED (Zp+Gg+Ua+Sc+Bn+Ba+Be+Rt+Ww+Ca+Ce+Cb+Cw)**. Ready for Tim’s land of **docs**. Do **not** land on main until Tim yeses the docs land card. Do **not** fold into the OI-0246 list-parity tip / PR #123. No SQL on this tip. Part B **Ww** writes stay gated (dry-run list as a separate step, then backup + separate yes).
