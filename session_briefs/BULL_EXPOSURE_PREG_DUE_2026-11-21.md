# Bull exposure → preg-check list + due windows (OI-0243)

**Status:** **SPEC LOCKED / READY FOR BUILD** (Tim, 2026-11-21 ~6:34 AM ET, via Orchestrator, card **t745s3078**) — opened ~6:03–6:06 AM ET; **locked Design rec + Ux1** on tip `6ee631e6f515291df97c8e3beb05af017cd31d3f`
**Owner:** GTHO Design → GTHO Build (after docs land on main; Orchestrator land card — do not start until Tim yeses land)  
**Schema / migration:** A0+F0 prefer **no exposure table**. **Gh0** adds `farm_settings` threshold integers (migration later: Tim’s yes + backup + CP-55/56). A1/A2/F1/F2 as before. Gestation remains code constants under C3 unless a later settings OI.  
**Base:** Forgejo `origin/main` `708933d90da5df9f8500a8ada1540adaacec019d` (OI-0242 tip). File/doc citations below were read on that SHA.

## 1. Problem

Tim wants to **track bull exposure to open cows and heifers**, then see:

1. **Which females should be preg-checked** (exposure-based; some farms skip checks and estimate from exposure alone).
2. **Earliest and latest due dates** for any female that was **exposed** or **confirmed pregnant**.

Two real co-presence cases on this farm’s operating model:

- **Same-group:** a bull is in the **same animal group** as open females.
- **Bull-group on shared event:** a dedicated **bull group** shares an **event** with groups that hold open females (overlapping `event_group_windows` on the same `event_id`).

Tim’s lean: recording each bull’s **individual movement** is probably the right granularity — but he is open to other options. Design must ground the choice in the existing offline-first membership + event window model and **avoid a second source of truth**.

**Origin:** Tim via Orchestrator, 2026-11-21 ~6:03 AM ET (America/New_York); **backfill** ~6:04 AM ET; **Animals Pregnancy Check filter + configurable protocol** ~6:06 AM ET.
**Locked:** Tim, card **t745s3078**, ~6:34 AM ET — Design’s rec on tip `6ee631e` **plus Ux1** (exact words: *"A but please display the current preg check protocol settings on the form so the user can see them."*).

## 2. Current state (citations — do not invent)

### Open / confirmed-bred (already shipped or SPEC’d)

| Piece | Where | Notes |
|---|---|---|
| Stored flag | `animals.confirmed_bred` (migration `026_add_confirmed_bred.sql`; SCHEMA §3.2; OI-0099) | Edit Animal checkbox “Confirmed bred” / “Pregnancy check / palpation confirmed” — **not** derived from breeding records (A29 reversed). |
| Confirmed date | OI-0232 SPEC — [CONFIRMED_BRED_DATE_2026-11-18.md](CONFIRMED_BRED_DATE_2026-11-18.md); migration file `046_animals_confirmed_bred_date.sql` on disk | Nullable `animals.confirmed_bred_date`; Q1 untick clears date; Q2 calving clears tick+date. Apply / Edit UI follow that OI’s gates (yes + backup for apply). **This is confirmation date, not conception date.** |
| May 1 backfill | OI-0234 SPEC LOCKED — [CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md](CONFIRMED_BRED_MAY1_BACKFILL_2026-11-19.md) | One-time write after 0232 apply; separate yes + backup. |
| “Open” filter / open set | OI-0235 / farm-reads; UX §15.0; [ANIMALS_MULTI_FILTERS_2026-11-19.md](ANIMALS_MULTI_FILTERS_2026-11-19.md) | **Open** ≈ active female with class role `cow` or `heifer` and `confirmedBred === false` (`src/features/assistant/farm-reads.js` `assessOpenAnimal`). Calves/steers/bulls out. |
| Animals filter cascade | OI-0235 / OI-0236 — [ANIMALS_MULTI_FILTERS_2026-11-19.md](ANIMALS_MULTI_FILTERS_2026-11-19.md), [ANIMALS_FILTER_CASCADE_2026-11-20.md](ANIMALS_FILTER_CASCADE_2026-11-20.md); UX §15.0 | Same `#/animals` filter header (do not invent a second bar). **OI-0235 as-built:** class pills + **Open** / **Confirmed bred** status pills. **OI-0236 locked:** four stacked rows — Groups (large cards) → Species → Class → Open/Confirmed bred; pipeline groups → species OR → class OR → status → search. **No Pregnancy Check pill today** — Tim 6:06 AM asks to add one on this screen. |
| Last calving date | SCHEMA §9.9 `animal_calving_records.calved_at`; clears `confirmed_bred` on birth (OI-0099 / 2026-11-08 lock) | Source for **minimum days post-calving** in the protocol. Heifers with no calving row: post-calving gate N/A. |
| Farm settings home | SCHEMA Domain 1 `farm_settings` (per-**farm**, `farm_id` UNIQUE; denormalized `operation_id` for RLS). Explicitly **eliminates** v1 `operation_settings` JSONB. Already holds threshold integers (AUD/rotation/cost). | Natural home for preg-check threshold integers if Gh0 locks. New columns = migration later (Tim’s yes + backup). |

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
- **G2.** A **preg-check list** on the **Animals screen** via a **Pregnancy Check** filter/toggle (Tim 6:06 AM): females due for check per the configurable protocol.
- **G3.** For each exposed or confirmed-pregnant female, show **earliest** and **latest** due dates that work **even when no preg check was recorded**.
- **G4.** Stay offline-first and **compute on read** where possible; prefer existing membership + event windows over a parallel ledger.
- **G5.** Relate cleanly to OI-0232 `confirmed_bred` / `confirmed_bred_date` (confirmation ≠ conception).
- **G6.** Configurable protocol: **minimum days since exposure** and **minimum days post-calving** (Tim 6:06 AM), with a locked settings home and combine rule.

## 4. Non-goals (this OI)

- Rewriting OI-0099 / restoring A29 “derive confirmed from breeding records.”
- AI breeding workflow, semen inventory, or technician flows.
- Automatic writing of `animal_breeding_records` on every co-presence day.
- Replacing Animals Open / Confirmed bred filters (OI-0235/0236).
- Applying any migration or handing Build before Tim locks.

## 5. Options (LOCKED — Tim t745s3078 chose Design rec + Ux1; non-chosen options retained for history)

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

### D — Preg-check list membership (who the Pregnancy Check filter selects)

Threshold **values** and combine rule live under **G** (Tim 6:06 AM). D only locks membership shape:

- **D0 — Open + exposed + passes protocol G (Design recommendation).** Female meets B0 open; has non-ambiguous exposure (per Fg); satisfies locked G thresholds/combine; not confirmed bred; still active. The Animals **Pregnancy Check** filter selects exactly this set. Drop when confirmed bred, culled/inactive, exposure invalidated, or protocol no longer met. **Consequence:** one set for the filter and any due-for-check count; N is not hard-coded here.
- **D3 — Also require `exposure_end` in the past** before eligibility. **Consequence:** fewer mid-turnout checks; misses “check while bull still in.”
- **D4 — Confirmed-bred with NULL `confirmed_bred_date` as a separate “date missing” badge** (not in the Pregnancy Check set). **Consequence:** supports OI-0232 incomplete marks without mixing into due-for-check.

**Design recommendation:** **D0 + D4**. (Former fixed N=28/35/45 picks moved to **G** defaults.)

### E — Scope of first ship (+ Animals-screen surface — Tim 6:06 AM)

**Surface is decided (not deferred):** the preg-check view lives on the **Animals screen** (`#/animals`). Add a **Pregnancy Check** filter/toggle in the existing filter header that selects the D0 set.

**How filters work today (cite — extend, don’t fork):**
- OI-0235 / UX §15.0: same `filterWrap` / `.agc-chips` header; **Open** / **Confirmed bred** status pills (F1 mutually exclusive with each other in 0235; F2 label “Confirmed bred”).
- OI-0236: four stacked horizontal-scroll rows — **Groups** (large cards) → **Species** → **Class** → **Open / Confirmed bred**; pipeline groups → species OR → class OR → status → search ([ANIMALS_FILTER_CASCADE_2026-11-20.md](ANIMALS_FILTER_CASCADE_2026-11-20.md)).
- **Pregnancy Check** = new status-row control on that same cascade (label **Pregnancy Check**). Design rec for interaction: on the status row with Open / Confirmed bred; **mutually exclusive with Confirmed bred**; when on, list = protocol-due set (D0) and does **not** require also tapping Open; still AND with Groups/Species/Class/search. Do not add a second filter bar.

- **E0 — Cattle-only, view-only, Animals screen + Pregnancy Check filter (LOCKED).** Beef/dairy cattle; derived exposure/due; **Pregnancy Check** pill/toggle on Animals as above; due earliest/latest visible on matching animal rows or a detail subline (exact row chrome: show earliest–latest due on the animal card when Pregnancy Check or when viewing an exposed/confirmed female — Build must not invent a separate app section). No new exposure tables if A0; settings columns per G may still need a gated migration. **Consequence:** matches Tim’s 6:06 ask; reuses OI-0235/0236 patterns.
- **Ux1 — Protocol settings visible when Pregnancy Check is active (LOCKED — Tim t745s3078).** When the Pregnancy Check filter is on, show a **compact read-only summary** of the current protocol near the Pregnancy Check control / filter header: **min days since exposure**, **min days post-calving**, and **how they combine** (AND/OR per Gc). Example copy: `Protocol: ≥35d since exposure AND ≥45d post-calving` (numbers from live `farm_settings` after Gh0 apply, else Gd0 compiled defaults). **Display only** — not a settings editor on the Animals list; editing stays where Gh0 farm_settings live. **Consequence:** user sees why animals are/ aren’t due without leaving Animals.
- **E1 — All species; still Animals + Pregnancy Check; view-only.** **Consequence:** more test surface; Gs1 more natural.
- **E2 — Include write paths in first ship** (overrides / auto breeding records). **Consequence:** schema + sync + CP-55/56; slower.
- **E3 — Also show exposure due band on Edit Animal (OI-0232)** in addition to Animals list. **Consequence:** tighter with 0232; list filter still required.

**Design recommendation:** **E0**. **Relate to OI-0232:** consumes confirmed-bred fields as status; confirmation clears Pregnancy Check membership; exposure drives due bands when no breeding-record expected calving exists.

### G — Preg-check protocol settings (Tim 6:06 AM)

At least two configurable thresholds decide when an animal becomes due for a check:

1. **`min_days_since_exposure`** — calendar days since **exposure_start** (merged interval).
2. **`min_days_post_calving`** — calendar days since the dam’s **latest** `animal_calving_records.calved_at` (SCHEMA §9.9). If no calving record (typical heifer): treat post-calving as **satisfied / N/A** (only exposure rule applies).

#### Where settings live

- **Gh0 — `farm_settings` columns (Design recommendation).** Add two integer columns (names illustrative: `preg_check_min_days_since_exposure`, `preg_check_min_days_post_calving`) on existing per-**farm** `farm_settings` (SCHEMA Domain 1: `farm_id` UNIQUE; v1 `operation_settings` eliminated; threshold ints already live here). **Consequence:** matches GTHO settings pattern; multi-farm ops can differ; **migration later** needs Tim’s yes + verified backup + CP-55/56 impact; until applied, Build may ship with compiled defaults equal to Gd (document ceiling gate like other staged columns).
- **Gh1 — New operation-scoped settings store.** **Consequence:** fights current “per-farm, not per-operation” decision; avoid unless Tim overrules SCHEMA.

#### Species defaults / group overrides

- **Gs0 — Single cattle pair for first ship with E0 (Design recommendation).** One exposure default + one post-calving default used for beef/dairy cattle. Sheep/goat wait for a follow-up (or E1+Gs1). **Consequence:** smallest schema/UI.
- **Gs1 — Per-species defaults from day one** (cattle/sheep/goat columns or rows). **Consequence:** more migration/UI; fits E1.
- **Gg0 — No per-group overrides (Design recommendation).** Farm (or species) defaults only. **Consequence:** simple; group-specific protocols deferred.
- **Gg1 — Per-group overrides allowed.** **Consequence:** new table or JSON; sync/CP impact; easy to misuse.

#### Default values (lockable)

- **Gd0 — exposure = 35, post-calving = 45 (Design recommendation).** Exposure 35 = prior D0 rec (early pregnancy check window). Post-calving **45** ≈ common cattle voluntary wait / uterine involution window before expecting a reliable check; grounded in last calving via `calved_at` (not invented on `animals`). **Consequence:** sensible cattle starting point; Tim can override numbers in the lock reply without changing Gh/Gs/Gg/Gc.
- **Gd1 — exposure = 28, post-calving = 45.**
- **Gd2 — exposure = 45, post-calving = 60.**
- **Gd3 — exposure = 35, post-calving = 40.**

#### How the two rules combine

- **Gc0 — BOTH must be met (AND) (Design recommendation).** Due for check iff `days_since_exposure_start ≥ min_days_since_exposure` **AND** (no calving record **OR** `days_since_last_calving ≥ min_days_post_calving`). **Consequence:** won’t flag a just-calved open cow as due merely because an old/new exposure clock is long enough; safer clinical timing.
- **Gc1 — EITHER is enough (OR).** **Consequence:** noisier list; can surface animals still too early post-calving if exposure alone passes.

**Design recommendation for G:** **Gh0 + Gs0 + Gg0 + Gd0 (35 / 45) + Gc0**.

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

## 6. Locked (Tim, card t745s3078, ~6:34 AM ET)

**A0 + B0 + C0 + C3 + D0 + D4 + E0 + F0 + Fg1 + Gh0 + Gs0 + Gg0 + Gd0 (35/45) + Gc0 + Ux1**

Tim picked Design’s rec on tip `6ee631e6f515291df97c8e3beb05af017cd31d3f`, with one addition (**Ux1**): when Pregnancy Check is active, **display the current preg-check protocol settings** (min days since exposure, min days post-calving, combine rule) so the user can see them.

| Axis | Locked | Meaning |
|---|---|---|
| A0 | ✓ | Derive exposure from co-presence (same-group membership or shared-event EGWs) |
| B0 | ✓ | Open = `assessOpenAnimal` / Open pill predicate |
| C0+C3 | ✓ | Due band from exposure±species gestation; confirmation ≠ conception |
| D0+D4 | ✓ | Pregnancy Check set = open+exposed+protocol; NULL confirm-date badge separate |
| E0 | ✓ | Cattle-only, view-only, Animals Pregnancy Check filter |
| Ux1 | ✓ | Read-only protocol summary when Pregnancy Check is on |
| F0+Fg1 | ✓ | Compute-on-read history + dry-run; flag/exclude ambiguous |
| Gh0+Gs0+Gg0+Gd0+Gc0 | ✓ | farm_settings ints; cattle pair; no group overrides; 35/45; AND |

**READY FOR BUILD** after docs land on `main` (Orchestrator land card; Tim’s land yes). Do not start Build before land.

## 7. Acceptance criteria (LOCKED — Build after docs land)

- [x] Spec **LOCKED** (t745s3078): A0+B0+C0+C3+D0+D4+E0+F0+Fg1+Gh0+Gs0+Gg0+Gd0(35/45)+Gc0+**Ux1**.
- [ ] Docs landed on `main` (Tim land yes) before Build starts.
- [ ] Read-only dry-run report (columns in §F) produced and Tim-reviewed before any prod write; if F0, no exposure-row write.
- [ ] Animals screen has **Pregnancy Check** filter/toggle in the existing OI-0235/0236 header; selecting it shows the D0 set (protocol G); no second filter bar.
- [ ] **Ux1:** When Pregnancy Check is active, a compact **read-only** protocol summary is visible near the filter chrome showing live min days since exposure, min days post-calving, and AND/OR combine (e.g. `Protocol: ≥35d since exposure AND ≥45d post-calving`); not an inline settings editor.
- [ ] Preg-check membership matches locked B + D + G (open + exposed + protocol; drops on confirmed/cull).
- [ ] Due view shows earliest/latest per locked C for exposed females **and** for confirmed-bred females (band and/or breeding-record expected calving per C0).
- [ ] Both co-presence cases covered per locked A: same-group membership overlap; cross-group same-event EGW overlap.
- [ ] Works with **zero** preg-check marks (exposure-only path).
- [ ] Does not redefine Open pill / `assessOpenAnimal` unless B explicitly says so.
- [ ] No migration / no prod data write without Tim’s yes + verified backup; if locked A0+E0+F0, prefer **no exposure-row write**; **Gh0 farm_settings columns** still need a gated migration when Build adds them (yes + backup); compiled defaults may match Gd0 until apply.
- [ ] Design PASS on the implementing PR; docs (UX + this brief) updated as-built on land.
- [ ] Tests: same-group exposure; bull-group shared event; confirmed-bred excluded from Pregnancy Check but present on due view; exposure-only due band; protocol AND boundary (exposure + post-calving); heifer with no calving (post-calving N/A); Animals filter interaction with Groups/Class.

## 8. Open questions

**None for Tim** — axes locked on t745s3078. Assumed-days-pregnant (**C1**) was not chosen. Build invents nothing in scope; Gh0 column apply still needs Tim’s yes + backup at migration time.

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
- Per-group protocol overrides unless Gg1.
- Per-species protocol columns unless Gs1 / E1.
- Settings UI chrome details beyond “editable on farm settings / thresholds area” (Build follows existing farm_settings UX).
