# Multispecies exposure → Pregnancy Check (sheep + goat) (OI-0244)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-21 ~7:18 AM ET, via Orchestrator, card **t759s3139**) — opened ~7:15–7:16 AM ET; **locked Design rec** on tip `070af6cec489c38d87c0585034297e62c6dc2789`
**Owner:** GTHO Design → GTHO Build (after docs land on main; Orchestrator land card — do not start until Tim yeses land)  
**Parent:** OI-0243 **live** on Forgejo `origin/main` `e310d9dc77726fc854dbfc95a9f32ef4d2970e0c` — lock **A0+B0+C0+C3+D0+D4+E0+F0+Fg1+Gh0+Gs0+Gg0+Gd0(35/45)+Gc0+Ux1**. Brief: [BULL_EXPOSURE_PREG_DUE_2026-11-21.md](BULL_EXPOSURE_PREG_DUE_2026-11-21.md).  
**Schema / migration:** Migration **047** (`preg_check_min_days_since_exposure` / `preg_check_min_days_post_calving` on `farm_settings`) is **file-only / not applied**; `RELEASED_SCHEMA_VERSION` still **45**; HELD includes **47**. This OI reverses **E0** (cattle-only) and likely **Gs0** (single cattle pair). Design lean **M0**: widen 047 **before apply** so one Tim yes+backup covers cattle + sheep + goat columns (and the Animals dialog can write them).

## 1. Problem

OI-0243 shipped a **cattle-only** bull-exposure → Animals **Pregnancy Check** worklist + due bands + read-only protocol summary (Ux1). Tim now wants the **same model for all breeding species** on this farm:

- **Sheep:** rams with ewes  
- **Goats:** bucks (vernacular **billies**) with does  

That reverses **E0** and pushes **Gs0 → Gs1** (per-species protocol thresholds). Tim also asked (7:16 AM ET) for a **"Preg check settings"** button on Animals (when Pregnancy Check is on) that opens a **dialog to edit** the protocol right there — today Ux1 is **display-only** and there is **no Settings editor** for these fields.

**Origin:** Tim via Orchestrator, 2026-11-21 ~7:15 AM ET (all-species) + ~7:16 AM ET (Animals inline editor).  
**Locked:** Tim, card **t759s3139**, ~7:18 AM ET — Design’s rec on tip `070af6c` (exact words: *"Lock OI-0244 A0+E1+B0-extend+C3-keep+D0+D4+F0+Fg1+Gh0+Gs1+Gg0+Gd-cattle(35/45)+Gd-sheep(25/30)+Gd-goat(25/30)+Gc0+UxA0+Ux-copy1+M0+Pb0+Ps0+Ps-farm0+Pe0+Pg0: all species, Open+ewe/doe, settings button+dialog, widen migration 047 before apply"* ).  
**Base citations:** Forgejo `origin/main` `e310d9d` (OI-0243 tip). Do not invent beyond options needed for product lock.

## 2. Current state (citations — do not invent)

| Piece | Where | Notes |
|---|---|---|
| OI-0243 lock | OPEN_ITEMS / brief | **A0+B0+C0+C3+D0+D4+E0+F0+Fg1+Gh0+Gs0+Gg0+Gd0(35/45)+Gc0+Ux1** |
| Migration 047 | `supabase/migrations/047_farm_settings_preg_check_thresholds.sql` | Adds two ints on `farm_settings` defaults **35 / 45**. **Not applied.** |
| Released ceiling | held-schema tests / ship gate | `RELEASED_SCHEMA_VERSION` = **45**; HELD includes **47** |
| Animals UI today | `#/animals` → Pregnancy Check chip | Ux1 **read-only** protocol line from `resolvePregCheckProtocol` (Gd0 35/45 until columns released). **No** Settings editor; **no** Animals dialog editor. |
| Open set | `assessOpenAnimal` in `src/features/assistant/farm-reads.js` | **cow / heifer only** + `confirmedBred === false` |
| Derive gate | `animals/index.js` + `calcs/bull-exposure.js` | `cattleOnly: true`; male role **`bull`**; female roles **`cow`/`heifer`** when cattle-only |
| Seed roles | `onboarding/seed-data.js` | Sheep: ewe/ram (+wether/lamb). Goat: doe/buck (+wether/kid). Vernacular **billy** = **buck** role. Steer/calf/wether/lamb/kid out of breeding-female open set. |
| Gestation constants | `bull-exposure.js` (C3) | Cattle **283**, sheep **150**, goat **150** — present; UI unused for sheep/goat under E0 |
| Post-calving clock | OI-0243 / calving records | Latest `animal_calving_records.calved_at`; heifers with no record → post-calving N/A (AND still passes that half) |
| Farm settings write path | `src/features/settings/index.js` | Existing `update('farmSettings', id, changes, validateFarmSetting, fsToSb, 'farm_settings')` — **no preg-check fields** in Farm Settings UI yet |

## 3. Goals

1. Extend exposure derive + Pregnancy Check membership + due bands to **sheep and goats** (and keep cattle).  
2. Widen open/exposed female sets to **ewe** and **doe** (same `confirmedBred === false` semantics).  
3. Per-species protocol thresholds (**Gs1**) with sensible defaults; keep combine rule simple (**Gc0 AND** unless Tim picks otherwise).  
4. Animals UX that stays one Pregnancy Check chip but shows the right protocol line for mixed-species farms (**UxA**).  
5. **"Preg check settings"** button → dialog editor on Animals when Pregnancy Check is on (**P** axes), writing through the **same** farm_settings update path as Settings (**Ps0**).  
6. Prefer **one** schema apply: fold per-species columns into **047 before apply (M0)**.

## 4. Non-goals (this OI)

- New exposure table / exposure-row write (keep **A0 + F0**).  
- Per-group protocol overrides (**Gg0** stay unless Tim asks).  
- Editable gestation lengths (keep **C3** constants unless Tim opens a later settings OI).  
- Inventing a new ACL — match whoever can edit farm_settings today.  
- Applying migration 047 without Tim’s separate yes + verified backup.  
- Publishing / bumping `RELEASED_SCHEMA_VERSION` past 45 until apply+release process says so.  
- Folding “other” / unseeded species without clear male/female breeding roles (see **E3**).

## 5. Options (LOCKED — Tim t759s3139 chose Design rec; non-chosen options retained for history)

### E — Species scope (reverses E0)

Male ↔ female breeding roles (seeded):

| Species | Male role(s) | Female open / exposure set | Out of open/exposure female set |
|---|---|---|---|
| beef/dairy cattle | `bull` | `cow`, `heifer` | `steer`, `calf` |
| sheep | `ram` | `ewe` | `wether`, `lamb` |
| goat | `buck` (billy) | `doe` | `wether`, `kid` |

- **E1 — Cattle + sheep + goat (LOCKED — Design recommendation).** Extend derive so male role matches species (bull/ram/buck) and female open set matches table above. **Consequence:** matches Tim’s ask; one feature across the farm’s three breeding species.  
- **E2 — Sheep + goat only first; leave cattle path as OI-0243.** **Consequence:** two code paths; little savings now that cattle already ships.  
- **E3 — All seeded species including `other` if male/female breeding roles exist.** **Consequence:** vague without seed roles; defer unless Tim has `other` breeding stock with defined roles.

**Design recommendation:** **E1**.

### B — Open / exposed sets for sheep & goats

- **B0-extend — Widen `assessOpenAnimal` / Open pill to ewe + doe (keep cow/heifer) (LOCKED — Design recommendation).** Same `active` + female + `confirmedBred === false` semantics; roles become cow/heifer/**ewe**/**doe**. Exposed = open female with ≥1 non-ambiguous co-presence interval to a matching-species breeding male. **Consequence:** one Open definition across assistant, Animals filters, and Pregnancy Check.  
- **B1 — Separate species-aware open helpers; Animals Open chip stays cattle-only.** Pregnancy Check can still include sheep/goat via D0. **Consequence:** Open and Pregnancy Check diverge by species; confusing on mixed farms.

**Design recommendation:** **B0-extend**.

### C — Gestation / due math

- **C3-keep — Keep constants cattle 283 / sheep 150 / goat 150 (LOCKED — Design recommendation).** Due band still **exposure_start + G … exposure_end + G**; confirmation ≠ conception (OI-0232 / OI-0243 C0).  
- Editable gestation in farm_settings — **out of scope** unless Tim opens it.

**Design recommendation:** **C3-keep** (retain C0 semantics from OI-0243).

### D — Pregnancy Check membership

- **D0 — Open + exposed + protocol for that female’s species (unchanged membership rule; species-aware thresholds).**  
- **D4 — Date-missing badge unchanged.**

**Design recommendation:** **D0 + D4**.

### A / F — Derive + history (unchanged product choice)

- Keep **A0** derive co-presence (same-group membership **or** shared-event EGWs).  
- Keep **F0** compute-on-read + dry-run review; **Fg1** ambiguous exclude.  
- Dry-run extended to all locked species. **No exposure-row write.**

### G — Protocol settings (reverses Gs0)

- **Gh0 — stay:** values live on `farm_settings` (already chosen in OI-0243).  
- **Gs1 — Per-species threshold pairs (cattle / sheep / goat) (LOCKED — Design recommendation).** Columns or clearly named fields per species for min days since exposure + min days post-calving (illustrative names: `preg_check_*_cattle`, `*_sheep`, `*_goat`, or JSON — Build picks shape under SCHEMA review; product lock is three pairs).  
- **Gs0-keep — One farm-wide pair for all species.** Simpler; weak fit when sheep/goat clocks differ from cattle.  
- **Gg0 — No per-group overrides (LOCKED — Design recommendation).**  
- **Gc0 — AND combine (LOCKED — Design recommendation)** — inherit OI-0243 unless Tim wants per-species combine (default: one farm-wide Gc).  
- **Gd defaults:**  
  - **Gd-cattle — keep 35 / 45** (OI-0243 Gd0).  
  - Sheep options: **GdS0 = 25 / 30** (Design lean) · **GdS1 = 21 / 28**.  
  - Goat options: **GdG0 = 25 / 30** (Design lean) · **GdG1 = 21 / 28**.  
  - **Rationale (GdS0/GdG0):** small-ruminant ultrasound / AI preg checks commonly start ~3–4 weeks post-breeding, and uterine involution is faster than cattle — 25/30 scales the cattle AND gate down without going as aggressive as 21/28.

**Post-partum copy (Ux-copy):**

- **Ux-copy0 — Keep “post-calving”** even for sheep/goat.  
- **Ux-copy1 — Species-neutral “post-partum”** on shared protocol lines (LOCKED — Design recommendation for multi-species). Clock source stays `animal_calving_records.calved_at` (no new table).

**Design recommendation for G:** **Gh0 + Gs1 + Gg0 + Gd-cattle(35/45) + Gd-sheep(25/30) + Gd-goat(25/30) + Gc0 + Ux-copy1**.

### M — Migration 047 fold

- **M0 — Widen 047 before apply (LOCKED — Design recommendation; Tim lean).** Add per-species columns (or cattle pair + sheep/goat pairs) in the **same** migration file so one apply covers Gs1. Still requires Tim’s **yes + verified backup**; `RELEASED_SCHEMA_VERSION` stays **45** until apply + publish/release process.  
- **M1 — Apply 047 as written (cattle pair only), then new 048 for sheep/goat.** Two yeses; messier mid-flight.  
- **M2 — Defer settings columns; compiled per-species defaults only until a later settings OI.** Dialog cannot persist user edits.

**Call-out:** 047 is **not applied yet** → **M0 is the cheapest schema path.**

**Design recommendation:** **M0**.

### UxA — Animals toggle + protocol summary (mixed species)

- **UxA0 — One Pregnancy Check chip; list = union of D0 across species; protocol summary follows active Species filter (LOCKED — Design recommendation).** When Species=Sheep → sheep pair line; Species=Goat → goat; Species=Cattle → cattle; **All species** → compact multi-line **or** “per species (see filter)”. Reuses OI-0236 cascade.  
- **UxA1 — One chip; protocol summary always shows all three pairs on multi-species farms.**  
- **UxA2 — Per-species Pregnancy Check chips.** More chrome; easy to miss one species.

**Design recommendation:** **UxA0**.

### P — Animals inline protocol editor (Tim 7:16 AM ET)

Tim exact ask: when Pregnancy Check is on, show a **"Preg check settings"** button that opens a **dialog** to **edit** protocol settings on Animals.

#### Pb — Button placement

- **Pb0 — Next to the Ux1 / UxA protocol summary line (LOCKED — Design recommendation).** Summary stays visible; button labeled **Preg check settings**.  
- **Pb1 — In filter chrome header** (farther from the numbers).  
- **Pb2 — Replace Ux1 line with a summary+button row** (single control strip).

#### Pd — Dialog fields

- If **Gs1:** per-species sections (**Cattle / Sheep / Goat**), each with **min days since exposure**, **min days post-calving**; combine **AND/OR** once farm-wide if **Gc** stays global (show one combine control), or per section if Tim locks per-species Gc (not Design lean).  
- If **Gs0-keep:** one exposure + one post-calving (+ combine).

#### Pv — Validation

- Non-negative **integers**; both threshold fields **required** (reject empty); optional upper bound (e.g. ≤ 365) — Design lean: **≥ 0 integer, required, soft max 365** with clear error text.

#### Pe — Who can edit

- **Pe0 — Any farm member who can edit farm_settings today (LOCKED — Design recommendation).**  
- **Pe1 — Owner/admin only.**  
Do **not** invent a new ACL — match existing Farm settings permission.

#### Ps — Save path

- **Ps0 — Same code path as Farm settings (LOCKED — Design recommendation).** Update `farmSettings` entity → `validateFarmSetting` → `toSupabaseShape` → enqueue write on `farm_settings` (same helper family as `settings/index.js` today).  
- **Ps-farm0 — Also add (or extend) Farm Settings UI for these fields** so Settings and Animals dialog call the **same** update helper (LOCKED — Design lean).  
- **Ps-farm1 — Animals-dialog-only** for first ship; Settings can gain the fields later **only** via the same helper.

#### Pg — Pre-release / schema gate for the button

Dialog writes need Gh0 columns (+ Gs1 per-species columns if locked). Until 047(+widening) is **applied and released**:

- **Pg0 — Hide the button until schema released (LOCKED — Design recommendation).** Ux1/UxA summary still shows compiled defaults.  
- **Pg1 — Show button disabled / read-only with “needs schema update” note.**

**Design recommendation for P:** **Pb0 + Pd(Gs1 sections) + Pv(non-neg int, required) + Pe0 + Ps0 + Ps-farm0 + Pg0**.

## 6. Locked (Tim, card t759s3139, ~7:18 AM ET)

**A0 + E1 + B0-extend + C3-keep + D0 + D4 + F0 + Fg1 + Gh0 + Gs1 + Gg0 + Gd-cattle(35/45) + Gd-sheep(25/30) + Gd-goat(25/30) + Gc0 + UxA0 + Ux-copy1 + M0 + Pb0 + Ps0 + Ps-farm0 + Pe0 + Pg0**

Tim locked Design’s rec on tip `070af6cec489c38d87c0585034297e62c6dc2789` (exact words: *"Lock OI-0244 A0+E1+B0-extend+C3-keep+D0+D4+F0+Fg1+Gh0+Gs1+Gg0+Gd-cattle(35/45)+Gd-sheep(25/30)+Gd-goat(25/30)+Gc0+UxA0+Ux-copy1+M0+Pb0+Ps0+Ps-farm0+Pe0+Pg0: all species, Open+ewe/doe, settings button+dialog, widen migration 047 before apply"*).

(Implied with Gs1: dialog **Pd** = per-species sections; **Pv** = required non-negative integers.)

| Axis | Locked | Meaning |
|---|---|---|
| A0 | ✓ | Derive co-presence; no exposure table |
| E1 | ✓ | Cattle + sheep + goat |
| B0-extend | ✓ | Open = cow/heifer/ewe/doe, unconfirmed |
| C3-keep | ✓ | 283 / 150 / 150 constants |
| D0+D4 | ✓ | Protocol-due set + date-missing badge |
| F0+Fg1 | ✓ | Compute-on-read + ambiguous exclude |
| Gh0+Gs1+Gg0 | ✓ | farm_settings; per-species pairs; no group overrides |
| Gd | ✓ | Cattle 35/45; sheep 25/30; goat 25/30 |
| Gc0 | ✓ | AND |
| UxA0 | ✓ | One chip; protocol line follows Species filter |
| Ux-copy1 | ✓ | “post-partum” on shared copy |
| M0 | ✓ | Widen 047 before apply |
| Pb0+Ps0+Ps-farm0+Pe0+Pg0 | ✓ | Preg check settings btn beside summary; shared write path; hide until schema released |

**READY FOR BUILD** after docs land on `main` (Orchestrator land card; Tim’s land yes). Do not start Build before land. Migration **047** (widened under M0) stays **unapplied** until Tim’s **separate** yes + verified backup. No exposure-row write (A0+F0).

## 7. Acceptance criteria (LOCKED — Build after docs land)

- [x] Spec **LOCKED** (t759s3139): A0+E1+B0-extend+C3-keep+D0+D4+F0+Fg1+Gh0+Gs1+Gg0+Gd-cattle(35/45)+Gd-sheep(25/30)+Gd-goat(25/30)+Gc0+UxA0+Ux-copy1+M0+Pb0+Ps0+Ps-farm0+Pe0+Pg0.  
- [ ] Docs tip landed on main (separate Tim land yes) before Build starts.  
- [ ] Derive: ram↔ewe and buck↔doe co-presence windows; cattle path unchanged in product behavior.  
- [ ] Open pill / `assessOpenAnimal` includes ewe + doe (B0-extend).  
- [ ] Pregnancy Check D0 uses **per-species** protocol (Gs1).  
- [ ] UxA protocol summary matches Species filter / All-species rule.  
- [ ] **Preg check settings** button (Pb0) opens dialog; save uses **Ps0** shared farm_settings update; validation Pv.  
- [ ] Button gated per **Pg0** until 047(+widening) applied + released; `RELEASED_SCHEMA_VERSION` discipline held.  
- [ ] Migration widened under **M0** — **no apply** without Tim yes + verified backup.  
- [ ] No exposure-row write (A0+F0). Dry-run covers all locked species.  
- [ ] Focused tests for multi-species derive, open set, protocol resolve, dialog save helper.

## 8. Open questions

**None for Tim** — axes locked on t759s3139 to Design’s rec. Build invents nothing in scope; M0 widen of 047 still needs Tim’s separate yes + verified backup before apply; RELEASED stays 45 until release process; no exposure-row write (F0).

## 9. Related

- OI-0243 — [BULL_EXPOSURE_PREG_DUE_2026-11-21.md](BULL_EXPOSURE_PREG_DUE_2026-11-21.md) (parent; live `e310d9d`)  
- OI-0232 / OI-0234 — confirmed bred + date / May 1 backfill  
- OI-0235 / OI-0236 — Animals filters + cascade (Species row drives UxA0)  
- SCHEMA §1 farm_settings; §3.2 animals; §5.3 memberships; §9.7 gestation; §9.9 breeding  
- UX §15.0 Animals filters  

## 10. Explicitly deferred

- Per-group protocol overrides (Gg1)  
- Editable gestation days  
- Exposure override rows (A2) unless Tim reopens A  
- Applying / releasing schema 47 without Tim yes + backup + publish process  
- `other` species breeding without seeded male/female roles  

---

**Tip instruction:** **SPEC LOCKED / READY FOR BUILD**. Do **not** land on main until Tim yeses the land card. Do **not** apply widened migration 047 without Tim’s separate yes + verified backup. No exposure-row write (F0).
