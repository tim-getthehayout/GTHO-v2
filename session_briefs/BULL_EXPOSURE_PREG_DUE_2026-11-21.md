# Bull exposure → preg-check list + due windows (OI-0243)

**Status:** **PROPOSED** — awaiting Tim lock A/B/C/D/E/F (2026-11-21 ~6:03–6:04 AM ET via Orchestrator; 6:04 AM backfill addition)  
**Owner:** GTHO Design → (Build only after Tim locks; not handed)  
**Schema / migration:** undecided until E locks — first ship may be **view-only / compute-on-read** (no new tables) if A0; A1/A2 override ledger or farm gestation setting may need a later migration (apply still needs Tim’s yes + verified backup)  
**Base:** Forgejo `origin/main` `708933d90da5df9f8500a8ada1540adaacec019d` (OI-0242 tip). File/doc citations below were read on that SHA.

## 1. Problem

Tim wants to **track bull exposure to open cows and heifers**, then see:

1. **Which females should be preg-checked** (exposure-based; some farms skip checks and estimate from exposure alone).
2. **Earliest and latest due dates** for any female that was **exposed** or **confirmed pregnant**.

Two real co-presence cases on this farm’s operating model:

- **Same-group:** a bull is in the **same animal group** as open females.
- **Bull-group on shared event:** a dedicated **bull group** shares an **event** with groups that hold open females (overlapping `event_group_windows` on the same `event_id`).

Tim’s lean: recording each bull’s **individual movement** is probably the right granularity — but he is open to other options. Design must ground the choice in the existing offline-first membership + event window model and **avoid a second source of truth**.

**Origin:** Tim via Orchestrator, 2026-11-21 ~6:03 AM ET (America/New_York); **backfill addition** ~6:04 AM ET (same channel).

## 2. Current state (citations — do not invent)

### Open / confirmed-bred (already shipped or SPEC’d)

| Piece | Where | Notes |
|---|---|---|
| Stored flag | `animals.confirmed_bred` (migration `026_add_confirmed_bred.sql`; SCHEMA §3.2; OI-0099) | Edit Animal checkbox “Confirmed bred” / “Pregnancy check / palpation confirmed” — **not** derived from breeding records (A29 reversed). |
| Confirmed date | OI-0232 SPEC — [CONFIRMED_BRED_DATE_2026-11-18.md](CONFIRMED_BRED_DATE_2026-11-18.md); migration file `046_animals_confirmed_bred_date.sql` on disk | Nullable `animals.confirmed_bred_date`; Q1 untick clears date; Q2 calving clears tick+date. Apply / Edit UI follow that OI’s gates (yes + backup for apply). **This is confirmation date, not conception date.** |
| May 1 backfill | OI-0234 SPEC LOCKED — [CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md](CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md) | One-time write after 0232 apply; separate yes + backup. |
| “Open” filter / open set | OI-0235 / farm-reads; UX §15.0; [ANIMALS_MULTI_FILTERS_2026-11-19.md](ANIMALS_MULTI_FILTERS_2026-11-19.md) | **Open** ≈ active female with class role `cow` or `heifer` and `confirmedBred === false` (`src/features/assistant/farm-reads.js` `assessOpenAnimal`). Calves/steers/bulls out. |
| Animals filter cascade | OI-0236 — [ANIMALS_FILTER_CASCADE_2026-11-20.md](ANIMALS_FILTER_CASCADE_2026-11-20.md) | Open / Confirmed bred chips on Animals screen; not a due/preg-check worklist. |

### Membership + event co-presence (already the movement ledger)

| Piece | Where | Notes |
|---|---|---|
| Who is in which group when | SCHEMA §3.4 `animal_group_memberships` (`date_joined` / `date_left`; open = `date_left IS NULL`); entity `src/entities/animal-group-membership.js` | **Per-animal** group history. This is already individual movement into/out of groups. |
| Which groups are on which event when | SCHEMA §5.3 `event_group_windows` (`date_joined`/`time_joined`/`date_left`/`time_left`); entity `src/entities/event-group-window.js` | Group on pasture/event over a window. Event active while paddock + group windows overlap (SCHEMA Domain 5 / A1). |
| Class roles incl. bull | SCHEMA §3.1 `animal_classes.role` — beef cattle roles include `cow`, `heifer`, `bull`, `steer`, `calf` | Bulls are animals with role `bull` (not a separate “bull movement” table). |
| Groups | SCHEMA §3.3 `groups` | Farm operational labels; a “bull group” is just a group whose members are bulls (or mostly bulls) — no special schema type today. |

### Breeding records (exist; largely unused for “confirmed”)

| Piece | Where | Notes |
|---|---|---|
| `animal_breeding_records` | SCHEMA §9.7; entity `src/entities/animal-breeding-record.js` | `bred_at`, method `ai`\|`bull`, sire FKs, `expected_calving`, `confirmed_date`. Spec text still describes A29 derivation; **OI-0099 made `animals.confirmed_bred` the live truth** — breeding-record `confirmed_date` does not drive the Open pill. OI-0232 brief: prod had **0** breeding records when dated. |
| Gestation default (schema prose) | SCHEMA §9.7 | Auto-default `expected_calving = bred_at + species gestation` — cattle ~283, sheep ~150, goats ~150; user override allowed. **No farm_settings gestation column cited for this OI; first ship should lock the constant source via option C.** |
| Heat | SCHEMA §9.8 `animal_heat_records`; UX heat picker §16 | Estrus observations only — not exposure windows. |
| AI / external bulls catalog | SCHEMA §9.1 `ai_bulls`; animals `sire_animal_id` / `sire_ai_bull_id` (A28) | Lineage / AI catalog — not turnout exposure. |

### What does **not** exist today

- No derived **bull↔female exposure window** compute or screen.
- No preg-check **worklist** (Animals Open pill is a filter, not “due for check”).
- No earliest/latest **due-from-exposure** view.
- No explicit “bull exposure” table (and Design recommends not inventing one as the default truth — see A).

## 3. Goals

- **G1.** Define exposure windows for open females under both Tim cases (same-group bull; bull-group sharing an event), including **retroactive history** from existing records (Tim 6:04 AM ET).
- **G2.** A **preg-check list**: females that warrant a check from exposure (and rules for who drops off).
- **G3.** For each exposed or confirmed-pregnant female, show **earliest** and **latest** due dates that work **even when no preg check was recorded**.
- **G4.** Stay offline-first and **compute on read** where possible; prefer existing membership + event windows over a parallel ledger.
- **G5.** Relate cleanly to OI-0232 `confirmed_bred` / `confirmed_bred_date` (confirmation ≠ conception).

## 4. Non-goals (this OI)

- Rewriting OI-0099 / restoring A29 “derive confirmed from breeding records.”
- AI breeding workflow, semen inventory, or technician flows.
- Automatic writing of `animal_breeding_records` on every co-presence day.
- Replacing Animals Open / Confirmed bred filters (OI-0235/0236).
- Applying any migration or handing Build before Tim locks.

## 5. Options for Tim (lock one letter per axis)

### A — Exposure source of truth

- **A0 — Derive from co-presence (Design recommendation).** Exposure = time intervals where an open female and a bull (class role `bull`, active) are co-present via **(1)** overlapping `animal_group_memberships` in the **same** `group_id`, **or (2)** their groups having overlapping `event_group_windows` on the **same** `event_id`. Per-bull granularity comes from the **existing** membership ledger (each bull’s joins/leaves), not a new table. **Consequence:** no duplicate truth; quality tracks how carefully groups/events are moved; borrowed-bull / walk-through not in a group is invisible until membership or an override exists.
- **A1 — Explicit per-bull exposure / assignment history.** New write path (and almost certainly a new table) of bull↔female or bull↔group exposure intervals entered or edited by hand. **Consequence:** matches Tim’s “record each bull’s movement” instinct as a **dedicated** ledger, but duplicates membership/event windows unless those stop being authoritative — sync, conflict, and offline cost rise.
- **A2 — Hybrid.** Default compute as **A0**; allow sparse **explicit override** rows (add/exclude/adjust a window) when co-presence data is wrong or incomplete. **Consequence:** covers edge cases without making overrides the daily path; first ship can still be A0-only UI with override schema deferred if E says view-only.

### B — What counts as open / exposed

- **B0 — Reuse today’s open set + exposure (Design recommendation).** **Open female** = same predicate as `assessOpenAnimal` / Open pill: `active`, `sex === 'female'`, class role `cow` or `heifer`, `confirmedBred === false`. **Exposed** = open female with ≥1 non-empty derived (or override) exposure interval to ≥1 bull. Confirmed-bred females are **not** “open” but still appear on the **due** view (see C/D). **Consequence:** one definition across assistant, Animals filters, and this feature; heifers and cows both included; steers/calves/bulls out.
- **B1 — Open ignores confirmed_bred for exposure math.** Track exposure for all active cow/heifer females even if already confirmed bred (e.g. rebreed / exposure after a mark). **Consequence:** richer history; preg-check list must still exclude or demote already-confirmed (D); risk of noisy lists.
- **B2 — Cattle roles only via species gate in E; same as B0 otherwise.** (Use with E0.) No behavior change vs B0 if E0; listed so Tim can reject multi-species open definitions later without reopening B.

### C — Gestation / due-window math

Let `G` = gestation length in days for the female’s species (see C sub-pick).

- **C0 — Exposure window → due band; confirmation does not invent conception (Design recommendation).** For each female, merge exposure intervals (union), then **earliest due = exposure_start + G**, **latest due = exposure_end + G**. If `confirmed_bred` / `confirmed_bred_date` is set: she stays on the **due** view; **do not** treat `confirmed_bred_date` as conception (OI-0232: confirmation date). Narrowing: if an `animal_breeding_records.expected_calving` exists, prefer that as a **point** (or show beside the band); else keep the exposure band and show “confirmed on {date}” as status only. **Consequence:** works with exposure-only farms; avoids wrong due math from palpation date.
- **C1 — Confirmed collapses band to a farm rule around confirmation.** e.g. due = `confirmed_bred_date + (G − assumed_days_pregnant_at_check)` with assumed days as a locked constant or setting. **Consequence:** needs Tim to pick the assumed days (extra lock); wrong if check timing varies.
- **C2 — Hardcode cattle G = 283 only in first ship; other species out until E widens.** (Pairs with E0.) Sheep/goat constants from SCHEMA §9.7 (~150) deferred. **Consequence:** simplest Build; multi-species farms wait.
- **C3 — Species constants from SCHEMA §9.7 prose (cattle ~283, sheep/goat ~150) as code constants; farm_settings later.** **Consequence:** no migration for G; changing G later is a code/docs change or a follow-up settings OI.

**Design recommendation for C:** **C0 + C3** (or **C0 + C2** if E0 cattle-only). Do **not** pick C1 unless Tim wants assumed-days-pregnant math.

### D — Preg-check list rules

Who appears on “should preg check”:

- **D0 — Exposed, still open, past minimum days since exposure start (Design recommendation).** Female meets B0 open; has exposure; `days_since_exposure_start ≥ N` (default **N = 35** calendar days unless Tim picks D1/D2); not yet confirmed bred; still active. Drop when confirmed bred, culled/inactive, or exposure invalidated. **Consequence:** simple; N is a product constant until a settings OI.
- **D1 — Same as D0 but N = 28.**
- **D2 — Same as D0 but N = 45.**
- **D3 — Also require exposure_end in the past (bull out / window closed) before listing.** **Consequence:** fewer mid-turnout checks; misses “check while bull still in” workflows.
- **D4 — Include confirmed-bred with NULL `confirmed_bred_date` as “confirm date missing” (not a due-for-check).** Separate from preg-check list; optional badge only. **Consequence:** supports OI-0232 incomplete marks without mixing into exposure checks.

**Design recommendation:** **D0 (N=35) + D4 as optional status**, not mixed into the check list. Tim can lock D1/D2 instead of 35 without changing the rule shape.

### E — Scope of first ship

- **E0 — Cattle-only, view-only derived lists (Design recommendation).** Beef/dairy cattle females + bulls; **read-only** preg-check list + due-band view (Animals area or a dedicated reproductive view — exact chrome deferred to Build only as “Animals-adjacent list, no new IA invent beyond one entry point named in acceptance”). No new tables if A0; no writes except existing confirmed-bred UI (OI-0232). **Consequence:** ships value from data Tim already records via moves; sheep/goat and override ledger follow-ups.
- **E1 — All species with SCHEMA §9.7 constants; still view-only.** **Consequence:** more test surface; same no-migration path if A0.
- **E2 — Include write paths in first ship** (override entries and/or auto-suggest breeding records). **Consequence:** needs schema + sync + CP-55/56 impact lines; slower; not needed for Tim’s stated view goals.
- **E3 — Fold due-band into OI-0232 Edit Animal** (show exposure-derived band under Confirmed bred) **and** keep a list view. **Consequence:** tighter UX with 0232; still depends on A/B/C locks; Edit Animal alone is not enough for the preg-check worklist.

**Design recommendation:** **E0**, with a later OI for overrides (if A2) and multi-species (if not E1). **Relate to OI-0232:** this OI **consumes** `confirmed_bred` / `confirmed_bred_date` as status; it does **not** replace the date field. Confirmation clears “needs check”; exposure drives due bands when no breeding-record expected calving exists.

### F — Backfill (retroactive history from existing records)

Tim (6:04 AM ET): the exposure dataset must be **built retroactively** from existing records, not only going forward.

#### What source data actually exists (read on `708933d`)

| Source | Path / citation | What it gives exposure math |
|---|---|---|
| Membership ledger (open **and** closed) | SCHEMA §3.4 `animal_group_memberships`; entity `src/entities/animal-group-membership.js` | Per-animal `date_joined` / `date_left` — **complete group history**, not just current. Same-group bull↔female overlap is computable for any past day. |
| Event group windows | SCHEMA §5.3 `event_group_windows`; entity `src/entities/event-group-window.js` | Which groups shared an event when — bull-group + open-female-group case. |
| v1 → v2 import of both | `src/data/v1-migration.js` §2.24 memberships (`date_joined`/`date_left`, fallback `migrationDate` when v1 omitted dates); event `groups[]` → EGWs (`date_joined`/`date_left`, fallback `eventDateIn`) | Imported history is in the **same tables** — no separate “v1 exposure” store. Ambiguity risk: missing v1 dates collapsed to migration/event date. |
| Animals + classes | SCHEMA §3.1–§3.2; `confirmed_bred` (026 / OI-0099) | Bull = class role `bull`; open female = B0 predicate. |
| Breeding records (sparse) | SCHEMA §9.7; v1-migration maps v1 breeding → `animal_breeding_records` | Optional evidence / expected_calving; **not** required for exposure-only farms. OI-0232 brief noted prod had **0** breeding rows when dated — treat as sparse, not primary. |
| **Not present** | — | No `bull_exposure_*` table today. No precomputed exposure windows. |

#### Process gate (every path that writes prod data)

Same bar as OI-0222 / OI-0234 data fixes:

1. **Verified backup** before any prod write.
2. **Read-only dry-run report** of proposed exposure windows **first** (Orchestrator or Build script; no writes).
3. **Tim reviews** the report.
4. **Tim’s separate yes** for the write (if any). Never bundle with the feature-code merge yes.

If locked **A0 + F0**, there is **no exposure-row write** — the dry-run is still required so Tim can review what historical windows the derive would show before trusting the view in production use.

#### Dry-run report shape (enough for Orchestrator later)

One row per proposed female↔bull exposure interval (after merge rules in A). Columns:

| Column | Meaning |
|---|---|
| `female_id` / `female_tag` | Animal id + tag/name |
| `female_class_role` | `cow` or `heifer` (and species if E1) |
| `bull_id` / `bull_tag` | Bull animal id + tag/name (repeat row or list if multi-bull same interval — prefer **one bull per row**) |
| `exposure_start` | Date (local) interval start |
| `exposure_end` | Date (local) or `null` if still open |
| `source` | `same_group_membership` \| `shared_event_group_windows` \| `override` (if A2) |
| `source_evidence` | Short cite: e.g. `membership:{female_m_id}+{bull_m_id}` or `egw:{female_egw_id}+{bull_egw_id}` / `event:{event_id}` |
| `ambiguity_flag` | `ok` \| `missing_join_date` \| `migration_date_fallback` \| `open_ended_bull` \| `multi_bull_overlap` \| `role_uncertain` \| `no_egw_for_group` \| … |
| `ambiguity_note` | One-line human reason |
| `include_in_view` | `yes` / `no` per locked gap rule (Fg*) |

Deliverables: CSV + summary JSON counts (rows total, by ambiguity_flag, by source, females covered, bulls covered). Default `--dry-run`. No Supabase writes in dry-run.

#### F options (materialize vs compute) — must cohere with A

- **F0 — Compute-on-read for all history; dry-run is review-only (Design recommendation with A0).** “Backfill” means: run the dry-run over **all** retained memberships + EGWs (including v1-imported rows), Tim reviews, then the shipped view **derives the same windows on read** — **no new exposure rows written**. **Consequence:** no prod data write for exposure itself; history depth = whatever is already in memberships/EGWs; fixing bad history means fixing membership/event data (separate yes) or A2 overrides later.
- **F1 — Materialize exposure rows after dry-run + backup + Tim’s yes.** Write one row per accepted dry-run interval into a new exposure table (requires **A1 or A2**). **Consequence:** true “dataset” on disk; sync/CP-55/56 impact; re-runs need idempotency rules; diverges from live memberships unless rebuilt.
- **F2 — F0 for the view, plus a separate optional membership-date repair pass.** After Tim reviews ambiguity rows (`migration_date_fallback`, `missing_join_date`), a **second** yes+backup may patch `animal_group_memberships` dates — that patch is **not** exposure rows; it is membership correction. **Consequence:** improves derive quality; two gated writes possible; still no exposure table if A0.

#### Fg — Gaps / ambiguous records (lock with F)

- **Fg0 — Skip ambiguous.** Dry-run lists them; views omit them entirely. **Consequence:** quieter lists; silent holes in history.
- **Fg1 — Flag and exclude from preg-check / due until resolved (Design recommendation).** Dry-run and (if shown) an “needs review” bucket; not counted as exposed for D/C until `ambiguity_flag = ok` or Tim accepts. **Consequence:** Tim sees gaps; no false due dates from migrationDate fallbacks.
- **Fg2 — Include with visible ambiguity badge.** Windows still drive due/check lists; UI marks uncertainty. **Consequence:** maximum coverage; higher false-confidence risk on imported fallback dates.

**Design recommendation for F:** **F0 + Fg1** with **A0**. Historical “backfill” is the dry-run + on-read derive over existing memberships/EGWs (incl. v1 import). Choose **F1** only if Tim locks A1/A2. Choose **F2** only if Tim wants membership date repairs called out as their own yes.

## 6. Design lock recommendation (for Tim’s card)

**A0 + B0 + C0 + C3 + D0 (N=35) + D4 + E0 + F0 + Fg1**

Rationale in one line: membership + event windows already record each bull’s individual group movement offline-first (including closed and v1-imported rows); deriving exposure avoids a second ledger; open/confirmed stay aligned with farm-reads and OI-0235; due bands from exposure start/end + species gestation work without a preg check; confirmation date is status, not conception; retroactive history is the same derive over retained ledgers, reviewed via dry-run before trust — no exposure-row write unless Tim later picks A1/A2+F1.

If Tim insists on “I want to type bull movements separately,” lock **A2** (not A1) so derive remains default; backfill then becomes **F1** for override/materialized rows after dry-run + backup + yes.

## 7. Acceptance criteria (after Tim locks — for a future Build handoff)

- [ ] Spec status flipped to SPEC LOCKED with the chosen option IDs (incl. **F/Fg**); Build not started before that.
- [ ] Read-only dry-run report (columns in §F) produced and Tim-reviewed before any prod write; if F0, no exposure-row write.
- [ ] Preg-check list matches locked B + D (only open exposed females; N as locked; drops on confirmed/cull).
- [ ] Due view shows earliest/latest per locked C for exposed females **and** for confirmed-bred females (band and/or breeding-record expected calving per C0).
- [ ] Both co-presence cases covered per locked A: same-group membership overlap; cross-group same-event EGW overlap.
- [ ] Works with **zero** preg-check marks (exposure-only path).
- [ ] Does not redefine Open pill / `assessOpenAnimal` unless B explicitly says so.
- [ ] No migration / no prod data write without Tim’s yes + verified backup; if locked A0+E0+F0, prefer **no new migration and no exposure-row write** (membership repair under F2 is a separate yes).
- [ ] Design PASS on the implementing PR; docs (UX + this brief) updated as-built on land.
- [ ] Tests: same-group exposure; bull-group shared event; confirmed-bred excluded from check list but present on due view; exposure-only due band; N threshold boundary.

## 8. Open questions → answered only via the options above

No free-form asks. Tim locks A/B/C/D/E/F/Fg (and N via D0/D1/D2). If he wants assumed-days-pregnant math, that is choosing **C1** and stating the assumed day count in the lock reply. Backfill write vs compute-only is **F**; gap policy is **Fg**.

## 9. Related

- OI-0232 confirmed_bred_date — [CONFIRMED_BRED_DATE_2026-11-18.md](CONFIRMED_BRED_DATE_2026-11-18.md)
- OI-0234 May 1 backfill — [CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md](CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md)
- OI-0235 / OI-0236 Animals Open + Confirmed bred filters
- OI-0099 Confirmed bred checkbox (migration 026)
- SCHEMA §3.2 animals, §3.4 memberships, §5.3 event_group_windows, §9.7 breeding records
- UX §15.0–§15.1 Animals / Edit Animal; heat §16 (out of scope for exposure)

## 10. Explicitly deferred

- Farm-editable gestation settings UI.
- Auto-creating `animal_breeding_records` from exposure.
- Multi-sire ambiguity UI beyond listing bulls in the exposure interval (detail layout after lock).
- Sheep/goat first-class due math if E0.
- Override ledger schema if A0-only first ship (revisit under A2 follow-up).
- Materialized exposure table and CP-55/56 export of it unless F1 locked.
- Automatic membership-date rewriting unless F2 locked and Tim yeses that write separately.
