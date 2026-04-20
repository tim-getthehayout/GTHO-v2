# Open Items

## Open

---

### OI-0124 — Location `.areaHa` field-name drift: BRC auto-fill silently dead on Move All + Event Detail §5 + Edit Paddock Window + Pasture Survey (class-of-bug, 25+ drift sites across app)
**Added:** 2026-04-21 | **Area:** v2-build / observations / data-integrity / class-of-bug | **Priority:** P1 (user-reported BRC dead on Move All — "typing a ring count does not change the forage cover %"; same symptom silently present on 3 other observation surfaces; broader `loc.areaHa` drift affects 20+ other call sites in locations, harvest, field-mode, amendments, calcs)
**Checkpoint:** three-phase fix — Phase 1 (BRC observation-card surfaces) ships standalone; Phase 2 (drift sweep across all other callers) ships next; Phase 3 (legacy fallback cleanup + Known Trap entry) ships after the sweep. Phase 1 spec: `github/issues/location-area-field-brc-fix.md`. Phases 2 + 3 will get their own spec files after Phase 1 lands.

**Status:** open — Phase 1 spec written, ready for Claude Code handoff. Phase 2 + 3 tracked here until Phase 1 closes.

**What Tim hit (2026-04-21):** After OI-0114 NC-1 shipped BRC reactive auto-fill on the Sub-move Open sheet, Tim reported that the same behavior is broken on the Move All wizard — typing a ring count does not flip the `Forage Cover %` input. Investigation confirmed the bug is present on **four of the five** observation-card surfaces, and only Sub-move Open works.

**Root cause — field-name drift:** The `Location` entity's field is `areaHectares` (`src/entities/location.js:10`, `sbColumn: 'area_hectares'`). But many code paths read `loc.areaHa`, which is `undefined` on every Location object. Result: `paddockAcres` resolves to `null` → `isBrcAvailable()` returns `false` → ring-count listener is a no-op.

This exact drift was partially fixed by **OI-0075** (commit `69cc154`, 2026-04-18) for 8 dashboard sites using the fallback pattern `l?.areaHectares ?? l?.areaHa ?? 0`. That commit's message reads: "The dashboard read `loc.areaHa` in eight places, but the location entity stores the column as `areaHectares`." The pattern is correct; the sweep was scoped only to the dashboard.

**Surface matrix — BRC impact (Phase 1 scope):**

| Surface | File:line | Field read | BRC status |
|---|---|---|---|
| Sub-move Open (pre-graze) | `submove.js:74` | `areaHectares` | ✓ works |
| Move All wizard Step 3 (pre-graze) | `move-wizard.js:400-401` | `areaHa` | ✗ dead |
| Event Detail §5 (pre-graze, open windows) | `detail.js:527-528` | `areaHa` | ✗ dead |
| Edit Paddock Window dialog (pre-graze, open + closed per OI-0118) | `edit-paddock-window.js:84-85` | `areaHa` | ✗ dead |
| Pasture Survey card (pre-graze) | `surveys/index.js:308-309` | `areaHa` | ✗ dead |

**Surface matrix — broader drift (Phase 2 scope):** 20+ other `loc.areaHa` reads miscompute silently. Not BRC-related but the same class of bug. Files:
- `src/features/events/detail.js:452` (area display in §4)
- `src/features/field-mode/index.js:183, 490` (field-mode area display + fold-up totals)
- `src/features/locations/index.js:259, 287, 353, 360, 417, 509, 875-876, 1290` (locations list sort, display, DM-avail calc, form defaults, list rows — multiple sites, some write `areaHa` back into local state)
- `src/features/harvest/index.js:201` (harvest area display)
- `src/features/amendments/entry.js:355` (amendment entry reading location area for ledger routing)
- `src/calcs/feed-forage.js:605, 614, 690` (calc reads `loc.areaHa` — docs at line 560 say caller should pre-compute `areaHa = areaHectares ?? areaHa`; audit which callers comply)

Existing fallback-pattern sites (already OI-0075-correct, but will be touched in Phase 3 cleanup):
- `src/features/dashboard/index.js:413, 514, 994, 1281` (8 dashboard sites use `l?.areaHectares ?? l?.areaHa`)
- `src/features/events/dmi-chart-context.js:49-57` (encapsulates fallback; exposes `areaHa: loc.areaHectares ?? loc.areaHa` as a helper; comment: "no caller should read `.areaHa` directly off a location entity")

**Phase 3 cleanup rationale:** v1-migration (`v1-migration.js:190, 353`) writes `area_hectares` (correct); no live code path writes `loc.areaHa` onto a Location object. The `?? loc.areaHa` fallback appears to be purely defensive against hypothetical legacy in-memory state — per OI-0075's commit: "legacy fallback preserved for in-flight local state." Once Phase 2 migrates every reader to the fallback pattern, Phase 3 grep-verifies no writer produces `.areaHa` on a Location, drops the fallback everywhere, renames any residual readers to `.areaHectares`, and adds a CLAUDE.md §Known Traps entry to prevent recurrence.

**Why this is worth doing in three phases rather than one:**
- **Phase 1 is the observable bug** — Tim hit it today, four farmers will hit it tomorrow. Ship the fix immediately.
- **Phase 2 is silent drift** — visible compute errors in locations list, harvest display, amendment routing, calc fallbacks. Needs a broader audit pass with unit + visual smoke across every affected surface.
- **Phase 3 is the class-of-bug defense** — once the drift is swept, the legacy fallback can come out. Shipping the cleanup in the same commit as the sweep would obscure which reads were silently broken versus which were already using the fallback.

**Phase 1 acceptance criteria (spec file has full detail):**
- All 4 surfaces: typing a ring count flips Forage Cover % to a computed value when `farm_settings.bale_ring_residue_diameter_cm` is set
- Helper note under the ring-count input flips from inactive to the active "Ring diameter X ft · paddock Y ac" copy
- Preview chip shows computed cover %
- `npx vitest run` clean; new unit test per surface asserting `paddockAcres` is non-null when the Location has `areaHectares` set
- Manual smoke on all 4 surfaces (browser)

**Phase 1 files affected:**
- `src/features/events/move-wizard.js:400-402` (destLoc area read)
- `src/features/events/detail.js:527-529` (loc area read in openPaddockWindows loop)
- `src/features/events/edit-paddock-window.js:84-86` (loc area read in dialog open)
- `src/features/surveys/index.js:308-310` (initialLoc area read in pre-graze card render)
- `tests/unit/` — one new test per file (or a single `location-area-field-brc.test.js` cross-surface file) asserting the prop is wired

**CP-55/CP-56 impact:** None — this is a read-path correction only. No persisted shape change, no entity field change, no migration.

**Schema change:** None.

**Base doc impact:** None for Phase 1. Phase 3 will add a CLAUDE.md §Known Traps entry: "Location's area field is `areaHectares`, not `areaHa`. Reading `loc.areaHa` directly is a silent-zero bug — the field doesn't exist on Location objects coming out of `fromSupabaseShape`. Either use `loc.areaHectares` directly (preferred post-Phase-3) or `loc?.areaHectares ?? loc?.areaHa` (legacy-safe pattern from OI-0075)."

**Related:**
- **OI-0114** (shipped 2026-04-18) — NC-1 fixed BRC on sub-move Open using the correct field name. This OI extends the fix to the other four surfaces that were left silently broken.
- **OI-0075** (closed 2026-04-18) — established the `?? areaHa` fallback pattern for dashboard. Phase 2 applies the same pattern across the remaining 20+ drift sites; Phase 3 retires the fallback.
- **OI-0112** (umbrella — shipped) — Observation Boxes Redesign. BRC auto-fill is a first-class acceptance criterion of the shared pre-graze card; the card itself renders correctly, callers are passing `null` because of the field-name typo.
- **OI-0118** (shipped 2026-04-20) — Edit Paddock Window observation cards. Introduced `edit-paddock-window.js:84-85` using the wrong field name. Inherited the drift from the other call sites — not an OI-0118 regression, but Phase 1 closes the gap OI-0118 landed on top of.

**Notes:**
- `paddock_observations` column `paddock_acres` does not exist and is not needed — BRC is a live-compute operation at render time, not a persisted field. The issue is purely the `Location` read, not the observation write.
- `amendment-location.js` entity genuinely has an `areaHa` field (`sbColumn: 'area_ha'`) for amendment-level location snapshots. This is a different entity and is not affected by Phase 1/2/3 — the drift is exclusively on the `locations` table reads.

---

### OI-0123 — Sub-move close forced feed-check card labels by feed-delivery location, not the window being closed — confusing when delivery loc ≠ closing loc
**Added:** 2026-04-20 | **Area:** v2-build / events / submove / ui | **Priority:** P2 (OI-0119 forced-feed-check prompt is firing correctly but is not being recognized by the user because the card's visual framing does not match the user's mental model of "closing window X should ask about feed at X")

**Status:** open — DESIGN REQUIRED, do not build

**Context:** Tim closed the G-3 paddock-window sub-move on event `da54838f-...` at 2026-04-20 18:59:21 UTC. The prior event had one feed delivery (batch `bef27752-...` → G-1 on 2026-04-18). OI-0119's forced feed-check card rendered and was submitted — Supabase confirms a feed_check row `b6d1448f-...` created at 18:59:21.584 UTC (11ms after the window close) with `remaining_quantity=0.5` on batch → G-1, alongside check item. The spec behavior worked — Tim's recollection that "it did not ask me" is the symptom, not the bug.

**Root cause (UX, not logic):** `src/features/events/submove.js:193-222` groups forced feed-check cards by `${entry.batchId}|${entry.locationId}` where `locationId` is the **delivery** location (`event_feed_entries.location_id`), not the **closing** location (`paddockWindow.locationId`). Card heading renders as `${batchName} → ${groupLocName}` at line 215 — "${batch} → G-1" when closing G-3, because the feed was delivered to G-1. Tim reads "batch → G-1" as "this is a feed check for G-1, not for the G-3 close I'm doing" — visually the card doesn't feel like part of the close action. Compounding: Tim had done a manual feed check on the same batch → G-1 combo only 6 minutes earlier (at 18:53), so the forced card looked like a duplicate of what he just did.

**Why the spec is technically correct:** Stored feed at the event level lives wherever it was delivered, not at the window being closed. Feed delivered to G-1 is still being consumed by animals on G-1 AND G-3 (same event, same group). Closing the G-3 window doesn't change where the stored feed physically sits. The forced check asks "before you close this window, record remaining stored feed across the event" — which is correct data-model behavior. The problem is the UX framing makes it look like a question about G-3.

**Proposed fixes (pick one or combine):**

Option A — **Re-frame the card heading and surrounding copy** so the card reads as part of the close action, not a standalone feed check:
- Section title: "Record feed remaining before closing {closingLocName}" (already set to `t('feed.feedCheck')` at line 187 — change to an OI-0123 key that mentions the close)
- Card heading: `${batchName} (at ${deliveryLocName})` — moves the delivery location to a parenthetical so the visual weight lands on the batch, not the delivery paddock
- Sub-hint: "Feed is still being consumed from {deliveryLocName} by animals across this event." — explicit rationale

Option B — **Suppress the forced card when a manual feed check on the same batch+location happened very recently** (e.g. within the last 30 minutes on the same day). Reads the most-recent check per batch+location; if `nowMinus30min < check.createdAt`, seed the card's "remaining" input with the recent check's value AND show a "last recorded 6m ago" hint, OR hide the card entirely and mark the close interval as already-anchored. **Warning:** this changes the invariant OI-0119 specced ("sub-move close always strikes a clean actual/estimated boundary"). The boundary would rely on the prior check, which might not have been intended as a close-anchor.

Option C — **Both.** Re-frame (A) always, and additionally suggest the prior check's value as the default (not suppress the card) so the user can confirm with a single tap.

**Default recommendation:** Option A + the "seed with prior check's value" half of C. Don't suppress — the close-boundary invariant matters. But reduce the friction of confirming.

**Files affected (once design locked):**
- `src/features/events/submove.js` — section header copy + card heading layout (lines 184-222)
- `src/i18n/locales/en.json` — new strings for re-framed heading + hint
- If Option C: default-value read from the most-recent feed check item for each batch+location combo at render time
- Unit test coverage: header reads with the closing location name, pre-fill logic if applicable
- E2E test: close a sub-move where delivery location differs from closing location; verify the heading reads as expected

**Acceptance criteria (once designed):**
- [ ] Sub-move close sheet's forced feed-check section clearly reads as part of the close action
- [ ] Card heading does not suggest the check is "for" the delivery location in a way that conflicts with the user's current action (closing a different window)
- [ ] User recognizes the card as an ask and remembers submitting it after the close
- [ ] No regression on the OI-0119 close-boundary invariant — every sub-move close still writes a feed check that anchors the prior interval's storedDmiKg

**Related OIs:**
- OI-0119 (closed 2026-04-20) — specced the forced feed check. This OI is UX-layer refinement on top of the shipped mechanism.
- OI-0122 (below) — same field session; both stem from the cross-event move Tim did at 19:01.

**Notes:**
- This OI is strictly about the sub-move close forced-feed-check card's visual framing. The gate logic (`hasStoredFeed = eventFeedEntries.length > 0`) is correct. No change to when the card fires — only how it reads.
- Tim's hypothesis that "the feed check i did right before is what suppressed the force" is incorrect: the data shows both the manual check (at 18:53) and the forced check (at 18:59) saved successfully. The force fired; it just wasn't recognized. This OI exists because the UX made the force invisible, not because the force failed.

---

### OI-0122 — Same-farm rotation moves leave `events.source_event_id = NULL`, which blanks DMI-8 chart bars for dates before the new event's start
**Added:** 2026-04-20 | **Area:** v2-build / events / move-wizard / dmi-chart / data-repair | **Priority:** P1 (live field-testing regression — every same-farm rotation produces a card whose 3-day chart is ⅔ blank until the new event has accrued 3 full days. First-day rotations render a single filled bar with two blank neighbors.)

**Status:** **SCOPE LOCKED (Tim 2026-04-20): ship the 1-line code fix + one-time backfill SQL migration for existing rotations.** Session brief written at `session_briefs/SESSION_BRIEF_2026-04-20_oi0122-source-event-id.md`. Handoff to Claude Code pending push.

**Context (observed case):** Tim rotated cows from the G-1/G-3 event (`da54838f-...`) to a new E-3 event (`fa16a58d-...`) this afternoon at 2026-04-20 15:00. E-3's dashboard card rendered the 3-day chart with Monday (today) filled correctly, but Saturday (4/18) and Sunday (4/19) blank. Supabase confirms: `events.source_event_id = NULL` on the new E-3 event (`fa16a58d`). The prior G-1/G-3 event (`da54838f`) was active 4/18–4/20 — it DOES hold the data that would populate Sat/Sun on the chart.

**Root cause:** `src/features/events/move-wizard.js:680` sets `sourceEventId` only for **cross-farm** moves:
```js
sourceEventId: isCrossFarm ? sourceEvent.id : null,
```
Same-farm rotations (by far the common case) end up with `sourceEventId = null`. The OI-0119 chart date-routing bridge at `src/features/events/dmi-chart-context.js:140-142` reads `event.sourceEventId` to route chart days that pre-date the current event to the source event's own cascade:
```js
if (ownerStart && dateStr < ownerStart && event.sourceEventId) {
  ownerEventId = event.sourceEventId;
}
```
With `sourceEventId = null`, the bridge never activates. The chart then runs E-3's cascade for Sat/Sun — but E-3's startDate is 4/20, and `feed-forage.js` DMI-8 walks forward from `event.dateIn`. For dates before startDate, the walk loop exits via the `cursor > date` safety check at line 849 without populating `outRef`, so the emit at line 856-865 returns `{ status: 'estimated', totalDmiKg > 0, pastureDmiKg: 0, storedDmiKg: 0, deficitKg: 0 }`. All three bucket values are 0 → chart renders blank bars.

**Why this slipped through OI-0119:** The cascade rewrite specced the date-routing bridge assuming `sourceEventId` would be populated on every rotation. It wasn't verified against the actual move-wizard code path (the only path that sets `sourceEventId`), which had the cross-farm-only gate predating OI-0119. The spec is correct; the upstream data-producer is wrong.

**Fix (scope locked — Tim 2026-04-20):**

Two parts — a 1-line code change and a one-time backfill migration.

**Part 1 — Code fix.** Change `src/features/events/move-wizard.js:680` from:
```js
sourceEventId: isCrossFarm ? sourceEvent.id : null,
```
to:
```js
sourceEventId: sourceEvent.id,
```
**No change needed to `src/features/events/index.js`.** A re-read of `renderCrossFarmMarkers` at lines 338–370 confirms line 346 already applies the farm-id comparison (`if (sourceEvt && sourceEvt.farmId !== evt.farmId)`) **inside** the outer `if (evt.sourceEventId)` guard. Same-farm `sourceEventId` values pass line 344 but are correctly rejected by line 346 → no banner. The outgoing case at line 358 also already uses farm comparison. Display-side is already safe. The code diff is literally one line.

**Part 2 — One-time backfill migration (030_backfill_source_event_id.sql).** Walk the `event_group_windows` graph: for every event with `source_event_id IS NULL`, find the set of events whose `date_left = this event's date_joined` on the same `group_id`. If **every** group that joined the new event came from exactly one same source event (unambiguous inference), set `source_event_id` to that event. Skip if ambiguous (different groups came from different source events) or if no prior window was found (legitimate first event). Cycle guard: require `source_start < target_start` (strict inequality) so a same-day cycle pair — observed in two v1-migration Corral events (`7e88a2d4` ↔ `8fca7c26` both opened 2026-03-19) — is excluded.

**Dry-run against live Supabase (project `sxkmultsfsmfcijvsauf`, 2026-04-20):** 22 events with `source_event_id = NULL`. The CTE resolves 16 unambiguously (backfilled), 2 ambiguous (left NULL — E-5 event `b23f20c2` and J3/K cluster `8f15a4ab`), ~4 legitimate first events (no prior window, left NULL), and the Corral same-day cycle pair excluded by the cycle guard (both left NULL).

**Files affected:**
- `src/features/events/move-wizard.js` — line 680 unconditional assignment (1 line)
- `supabase/migrations/030_backfill_source_event_id.sql` — CTE + cycle-guarded UPDATE + `UPDATE operations SET schema_version = 30`
- `src/data/backup-migrations.js` — add `29: (b) => { b.schema_version = 30; return b; }` no-op entry
- `tests/unit/move-wizard.test.js` (if exists, else new) — assert same-farm move sets `sourceEventId` on the new event; cross-farm still works
- `tests/unit/dmi-chart-context.test.js` (or cascade context test) — assert 3-day chart for a day-1 rotation event shows prior-event data for pre-start days
- V2_MIGRATION_PLAN.md §5.3 / §5.3a — no table or FK added, but note migration 030 in the migration log
- CLAUDE.md — no doc rule change

**CP-55/CP-56 impact:** None on the backfill side (it only writes values into an already-specced `events.source_event_id` column that CP-55's `events` serializer already covers). BACKUP_MIGRATIONS 29→30 is a no-op version-bump — old backups restore fine; their `events.source_event_id` values are whatever the source operation persisted at backup time, which is the right semantic.

**Acceptance criteria:**
- [ ] `move-wizard.js:680` sets `sourceEventId = sourceEvent.id` unconditionally for the `destType === 'new'` branch
- [ ] Migration 030 written, executed against Supabase, and verified (row count = 16 backfilled, 2 ambiguous + cycle pair left NULL)
- [ ] `BACKUP_MIGRATIONS[29]` no-op entry added bumping to v30
- [ ] Unit test: same-farm move sets `sourceEventId` on the new event
- [ ] Unit test: cross-farm move still sets `sourceEventId` AND the display banner appears (regression guard against the old conditional gate)
- [ ] DMI-8 chart unit test: day-1 rotation event's 3-day chart shows the source event's cascade output for days that pre-date the new event's start
- [ ] E2E test: full same-farm rotation → Supabase assertion on `source_event_id` populated + chart render for pre-start days
- [ ] Verify in live data: E-3 event (`fa16a58d`) chart shows filled bars for Sat 4/18 and Sun 4/19 after Claude Code deploys the backfill

**Related OIs:**
- OI-0119 (closed 2026-04-20) — shipped the date-routing bridge that assumed `sourceEventId` would be set. This OI fixes the upstream producer.
- OI-0070 (open, waiting on DMI-8 field testing) — EST-1 accuracy calc. This bug was masking correct chart behavior; fixing it unblocks clean field-test data.

**CP-55/CP-56 impact:** **NONE.** The `source_event_id` column already exists on `events` table (per migration 015-ish) and is already included in backup export/import. This OI just starts populating it correctly.

**Schema impact:** **NONE.** Column exists; no migration required.

**Notes:**
- The `move-wizard.js:737` feed-transfer path already sets `sourceEventId` on `event_feed_entries` unconditionally. The inconsistency is: feed entries track source lineage regardless of farm, but the parent event doesn't. This OI aligns them.
- The comment at `move-wizard.js:673` ("Cross-farm move: use destination farm, link back via sourceEventId") predates OI-0119 and captures only the cross-farm use case. After this OI, update the comment to reflect that `sourceEventId` is always set; the `isCrossFarm` flag now only gates the `farmId` field assignment.
- PLUGIN IMPROVEMENT candidate: when a migration adds a column with FK-like semantics (like `source_event_id`), the spec-review checklist should ask "is there a single write path? does it set the column on all branches, or only some?" OI-0122 is a case where the column had exactly one writer, and that writer conditionally left it NULL — a bug class that's only visible when a downstream reader finally arrives.

---

### OI-0121 — Dashboard & Event Detail card summary line (DMI-4) disagrees with DMI-8 chart bars on the same card (two calcs, two stories)
**Added:** 2026-04-20 | **Area:** v2-build / calcs / dashboard / event-detail / ui | **Priority:** P1 (live field-testing surface — D location card showed "88% est. pasture / 12% stored" in its summary line while the adjacent 3-day chart rendered Monday entirely red (deficit). The two numbers are produced by different calcs and the user sees them side-by-side as contradictory facts about the same event.)
**Checkpoint:** Phase 3.5 polish (follow-up to OI-0119, ships standalone)

**Status:** open — DESIGN LOCKED: **Option A** (Tim 2026-04-20). Retire DMI-4 on the card; derive summary line (pasture % / stored % / deficit %) from DMI-8 cascade totals over the same window the chart covers. Four sub-questions still need answers before build: (1) aggregation window — 3-day rolling (matches chart) vs full-event vs today only; (2) does DMI-4 stay in the calc registry as an internal component or retire entirely; (3) Event Detail §8 + §15 scope in same commit as Dashboard or phased; (4) deficit rendering in the summary text — "0% pasture / 0% stored / 100% deficit" vs a separate callout like "⚠ Deficit today: 44 lbs DM short". Tim to answer each before spec converts to `github/issues/` file for Claude Code.

**What's wrong:**

On the Dashboard event card (and the Event Detail §8 + §15 summary block), the card currently renders two things that describe the same pasture-vs-stored breakdown:

1. **The summary text line** (e.g. "88% est. pasture · 12% stored · 28 lbs DM ...") — populated at `src/features/dashboard/index.js:1103-1107` from **DMI-4** (`src/calcs/feed-forage.js:97-122`).
2. **The 3-day chart bars** (green pasture / blue stored / red deficit) — populated at `src/features/dashboard/index.js:1339-1361` from **DMI-8** via `computeDmi8Days(event, dmi8)` (`src/features/events/dmi-chart-context.js:115-167`).

These two calcs use fundamentally different models:

- **DMI-4** is a naïve mass-balance over the whole event period: `pasture_dmi = total_dmi_required − stored_consumed`. It credits everything that wasn't eaten from stored feed to pasture, **regardless of whether the pasture pool can actually supply that much.** It has no concept of pool depletion.
- **DMI-8** is the walk-forward cascade shipped under OI-0119. For each day from event start to today, it decrements the FOR-1 pasture pool, then stored, then deficit. It knows when pasture has been grazed out.

For low-yield or long-duration events the two will always disagree, because DMI-4 over-credits pasture once the physical pool is exhausted.

**Observed case (D event, 2026-04-20):**
- Event start: 2026-03-24 (28 days on pasture)
- Group windows: 3 active, 16 head total
- FOR-1 initial pasture pool: ≈ 1,162 kg DM
- 28-day demand: ≈ 16 head × 28 days × ~8 kg/head/day = ≈ 3,584 kg DM
- Stored consumed (net, after close-reading residual): ≈ 430 kg DM (12% of demand)
- DMI-4 result (summary line): pasture = 3,584 − 430 = 3,154 kg = **88%** → reads as a healthy-pasture event
- DMI-8 result (chart): pasture pool of 1,162 kg exhausted around day 15; stored took over through mid-April; stored is now exhausted too → **Monday renders red (deficit)**

Both results are internally correct. The problem is the card tells the user two contradictory stories about the same event in two adjacent glyphs.

**Why it matters:**

- The summary line is the at-a-glance text the farmer reads first. "88% pasture" says "grazing is fine, we have pasture left." The chart directly below says "you're in deficit today." The user must reconcile this themselves — and if they skim only the text, they miss the red bar.
- The OI-0119 cascade was the expensive, correct thing to build. Leaving DMI-4 in place as the headline number undercuts its value.
- This is the same bug class as OI-0117's "two stored columns for one derivable fact = silent drift" — except here it's "two calcs for one derived metric = visible contradiction."

**Two possible fixes (require design decision):**

Option A — **Retire DMI-4 on the card; derive summary from DMI-8 cascade totals.**
Sum the cascade's per-day pasture/stored/deficit outputs over the window the summary describes (likely the rolling 3-day chart window, or the full event window). Produce pasturePct / storedPct / deficitPct from those sums. Summary line and chart bars use the same source of truth.

Option A pros: one calc, internally consistent card. Extends cleanly to a three-value breakdown (pasture / stored / deficit) so the summary can signal deficit in text too.
Option A cons: the DMI-4 number changes for every card (will drop sharply for long events where pasture depleted). Users who've internalized current numbers will see a visual shift. Requires deciding which window the summary aggregates over (see Open design questions below).

Option B — **Keep DMI-4 but rename and re-scope it.**
DMI-4 describes "what has been fed" (a supply-side accounting), not "what the pasture could supply." Rename the summary line to something like "Fed this period: 88% pasture, 12% stored" and add a separate "Today: deficit" flag driven by DMI-8. This preserves DMI-4's value (knowing how much the animals actually consumed vs were fed stored) while acknowledging it doesn't represent pasture health.

Option B pros: less behavior change, DMI-4 remains a useful number for understanding feed budgets. Explicit separation of "what was eaten" vs "what was available."
Option B cons: adds another line of text to an already-dense card. Two numbers on the card still, just with clearer labels. Does not resolve the underlying "which number do I trust when I glance" problem.

**Default recommendation:** Option A, but this is a judgment call Tim should make. DMI-4 was spec'd in V2_CALCULATION_SPEC.md §4.2 as "mass balance approach — assumes full daily intake met. Reasonable approximation" — language that pre-dates DMI-8 and should be re-visited.

**Open design questions (must answer before implementation):**

1. **Aggregation window for Option A:** should the summary reflect the full event (from event start to today), or the chart's rolling 3-day window, or today only? The chart is 3-day; matching that seems most consistent, but farmers may want the "whole event so far" number.
2. **Does DMI-4 stay in the calc registry (Option A) as a component of other calcs, or retire entirely?** If retained, its name/docs need a clearer "not for card display" disclaimer.
3. **Does Option A extend to the Event Detail §8 + §15 surfaces, or only the Dashboard card?** Both currently read DMI-4 from the same path; both would need the same treatment.
4. **Deficit rendering in the summary line:** if Option A is chosen, should a deficit day show as "pasture 0% / stored 0% / deficit 100%" in the text, or a separate callout like "⚠ Deficit today: 44 lbs DM short"?

**Files affected (once Option is chosen):**
- `src/features/dashboard/index.js` — the event-card builder around lines 1099-1108 (summary split) and 1260-1400 (summary + chart composition)
- `src/features/events/detail.js` — §8 Forage and §15 (wherever the event detail surfaces read DMI-4)
- `src/calcs/feed-forage.js` — DMI-4 rename/retire + V2_CALCULATION_SPEC.md §4.2 update
- `V2_CALCULATION_SPEC.md` — section §4.2 (DMI-4) — update docs to reflect retirement or rename
- `V2_UX_FLOWS.md` §17.7 (Dashboard) + §17.15 (Event Detail) — update summary-line wording
- `UI_SPRINT_SPEC.md` — add SP-13 (or similar) capturing the reconciled spec
- Tests: unit coverage for the new card-summary calc (Option A) or the renamed DMI-4 (Option B); visual/e2e coverage that the summary line and chart report the same pasture/stored/deficit picture on a depletion case like D

**Acceptance criteria (once designed):**
- [ ] Card summary line and chart bars are consistent: if chart shows deficit, summary reflects it
- [ ] D event card (and any long-duration/low-yield event) no longer reads "88% pasture" while chart bars are red
- [ ] V2_CALCULATION_SPEC.md §4.2 reflects the chosen disposition of DMI-4
- [ ] Unit tests cover a depletion scenario (pasture pool exhausted mid-period, stored exhausted before today) and assert summary line + chart agree
- [ ] E2E test covers the Dashboard card render for a known-deficit event

**Related OIs:**
- OI-0119 (closed 2026-04-20) — shipped the DMI-8 cascade. This OI is the natural follow-up: now that DMI-8 is the truth, the card summary should reflect it.
- OI-0075 Bug 3 — the prior card-data drift class (capacity line); pattern parallels this one.
- OI-0117 — "two stored columns for one derivable fact = silent drift." Same failure mode in the calc layer.

**Notes:**
- Observation data drift (D's pre-graze observation has `source_id = event_id` instead of `pw.id`, a pre-OI-0112 artifact affecting 50/73 event-sourced observations) is **NOT** the direct cause of this bug. `pickPreGraze` in `feed-forage.js:589-597` has a `(locationId + most-recent createdAt)` fallback that still selects D's observation. The fallback is load-bearing until OI-0113 drops the table; see OI-0113 for the data-quality cleanup. The contradiction described above is purely the two-calc disagreement.
- PLUGIN IMPROVEMENT candidate: when a PWA card surfaces two numbers from two calcs that describe the same underlying phenomenon, add a sanity check that the numbers reconcile within a tolerance, surfaced at commit/test time. Current project-infrastructure plugin has no rule for this. Worth logging once the design here is decided.

---

### OI-0120 — Edit member info (display name, email, role) on pending invites and accepted members
**Added:** 2026-04-20 | **Area:** v2-build / settings / member-management | **Priority:** P2 (usability gap exposed by CP-66 close-out audit — admins cannot correct typos in pending invites or update a member's display name/email post-acceptance without leaving the app and editing Supabase directly; role edit already works for accepted non-owner members but the pending-invite path has no edit at all)
**Checkpoint:** Phase 3.5 polish (follow-up to CP-66, ships standalone)

**Status:** closed — 2026-04-20. Spec: `github/issues/GH-30_edit-member-info.md` (GH issue #30). Pre-implementation DB check (via MCP `pg_constraint` query) confirmed `operation_members` has NO `(operation_id, email)` UNIQUE constraint — only `operation_members_invite_token_key` (UNIQUE invite_token) + the primary key — so the implementation defaults to the spec's client-side collision pre-check branch, with a belt-and-braces `/duplicate key|unique/i` mapping in the Supabase error handler so a future migration that adds the constraint surfaces as `t('members.emailInUse')` automatically. `showEditForm(member, operationId, panel, opts)` + `editMember(...)` added to `src/features/settings/member-management.js`, one function for both pending and accepted branches (pending branch renders the admin/team_member segment control; accepted branch omits role since the existing single-tap `renderRoleSelect` handles it inline). Edit buttons inserted per spec: **Edit | Copy | Regenerate | Cancel** on pending rows; **Role Select | Edit | Remove** on accepted non-owner non-self rows. Owner + self rows get no edit button (CP-66 protection rules preserved). Inline expand-in-place form renders below the member-row via `row.parentNode.insertBefore(form, row.nextSibling)`; toggle behavior (tapping Edit again closes an open form). Six new i18n keys added to `src/i18n/locales/en.json` (`edit`, `editTitle`, `editPending`, `saveChanges`, `changesSaved`, `emailInUse`). Collision pre-check only runs when email changed (skips the Supabase round-trip for display-name-only edits). Success flow: toast `t('members.changesSaved')` + structured `logger.info('members', 'member edited', ...)` + `renderMemberList` re-render. No `innerHTML`; all user-facing strings via `t()`. Full unit suite 1165 → 1172 (+7 cases: pending happy path, accepted happy path, validation empty-name + bad-email, owner/self no-button, email collision, toggle). E2E `tests/e2e/member-edit.spec.js` covers the Supabase round-trip per CLAUDE.md §E2E. No schema change. No CP-55/CP-56 impact. Closes OI-0120 and GH-30.

**What this closes:** CP-66 (closed 2026-04-20) shipped invite creation, role change for accepted members, member removal, link copy/regenerate, and invite cancel — but did NOT include any edit path for the captured `display_name` / `email` fields after the invite row is created. Two concrete gaps Tim hit in the close-out audit:

1. **Pending invite typos are unfixable.** `createInvite` (member-management.js:235-278) accepts a display name and email, inserts the row, copies the link to clipboard. If the admin typos the email or wants to change the display name before sending the link, the only path is **Cancel invite → start over** (which generates a new token, invalidates the link the admin may have already copied to a draft text/email). On the pending row in the member list, the actions are limited to Copy/Regenerate/Cancel (member-management.js:100-115). No edit.

2. **Accepted member name/email drift.** Once a member accepts the invite, `renderRoleSelect` (member-management.js:282-305) lets an admin/owner change their role between admin and team_member, but there is no UI to update the `display_name` (which Tim's CP-66 spec explicitly notes "pre-populates the member row. Invitee can change later" — but in practice neither the invitee nor the admin has any settings UI to do so) or the `email` (used for the email-based fallback claim in `claim_pending_invite`, so a stale email could break re-invite scenarios).

**Scope (locked with Tim 2026-04-20):**

| Surface | Editable fields | Permission | UX |
|---------|-----------------|------------|-----|
| Pending invite row | display_name, email, role | owner + admin (matches existing CP-66 admin-only gate) | Inline expand-in-place form on the row (no separate sheet — matches CP-66 invite creation pattern). New "Edit" button next to Copy/Regenerate/Cancel. Save persists to `operation_members` row, re-renders list. |
| Accepted member row | display_name, email | owner + admin (matches existing role-change gate; same `!isOwner && !isSelf` exclusion still applies — owners and self cannot be edited by anyone else, matching the existing role-edit guardrail) | Inline expand-in-place form below the row. New "Edit" button next to the existing role select + Remove. Role select stays where it is (no need to duplicate). Save persists, re-renders list. |
| Self-edit | display_name, email | any role (own row only) | Out of scope for this OI — separate self-profile UI lives in user account settings, not member management. Note for follow-up: if a member needs to change their own display name today, an admin must do it for them. Acceptable interim per Tim. |
| Owner row edit | (none) | (none) | Owner row has no edit button — same protection as the existing CP-66 owner-row no-actions rule. To change an owner's display name, the owner must use the self-profile path (currently missing — see above note). |

**Why the email field is editable on accepted members (and not just locked at acceptance):** The email column on an accepted member is the lookup key for the email-based fallback claim path (`claim_pending_invite`, member-management.js calls it during sign-in for users with no operation). If a member's primary email changes (job change, domain change, typo discovered post-acceptance), an admin needs a way to update it so future re-invite or recovery flows match. Schema-wise nothing prevents this — the column is just text, no FK.

**Why the role select stays separate (not folded into the edit form):** The existing `renderRoleSelect` (member-management.js:282-305) is a single-tap inline change with an immediate Supabase write — no edit-mode, no Save button. Tim has used this pattern in production. Folding role into a multi-field edit form would slow down the most common admin task (promote a team member to admin). Decision: keep the role select on the row for accepted members; the edit form covers display_name + email only. For pending invites the role edit happens inline because the row has no role select today (only Copy/Regenerate/Cancel) — the edit form is the most natural place to add it.

**Schema impact:** **NONE.** Both `display_name` and `email` columns already exist on `operation_members` (added in CP-66 migration). No new columns. No RLS changes (existing policies already allow admin/owner update on rows in their operation).

**CP-55/CP-56 impact:** **NONE.** No schema change → no export/import shape change. The existing CP-55 export already includes `display_name` and `email`; CP-56 import already round-trips them. This OI just exposes editing; the underlying data flow is unchanged.

**Validation rules (mirror CP-66's createInvite validation, member-management.js:241-242):**
- Display name: trimmed, non-empty.
- Email: trimmed, non-empty, contains `@`. Looser validation than full RFC-5322 — matches existing CP-66 invite creation.
- Optimistic concurrency: not required for this OI. Last-write-wins on a per-field basis is acceptable; the audit trail for who changed what is out of scope (could be added later via `app_logs`).

**Edge cases the spec must address:**
- What happens if an admin edits an accepted member's email to one that another member is using? → Spec says: surface inline error "Email already in use in this operation" via Supabase unique-constraint check (`operation_members` has `(operation_id, email)` unique constraint; if not, add to migration — but verify first). Action item for Claude Code: confirm whether the unique constraint exists; if not, the spec defaults to client-side check before write.
- What happens if a pending invite's email is edited and an old draft message has the link? → The link still works (it's keyed off `invite_token`, not email). Edit the email field updates only the display + the email-based fallback path. No invalidation of the link.
- What happens if an admin edits a pending invite's role from team_member → admin? → No special handling. The change persists. When the invitee accepts, they're admin.
- Owner row edit attempt: button is not rendered. Defense-in-depth: server-side RLS already prevents non-owners from updating the owner row's role; this OI does not change RLS.
- Self-edit attempt: button is not rendered for the current user's own row in member management. Self-profile editing is out of scope (see table above).

**Files affected:**
- `src/features/settings/member-management.js` — add `editMember` function, `showEditForm` inline form, edit button render in both pending and accepted action arrays
- `src/i18n/i18n.js` (or wherever `t()` strings live) — new strings: `members.edit`, `members.editTitle`, `members.editPending`, `members.saveChanges`, `members.changesSaved`, `members.emailInUse`
- Tests: `tests/unit/member-management-edit.test.js` — 6 cases (pending happy path, accepted happy path, validation failures for empty name + bad email, owner-row no edit button, self-row no edit button, email collision handling)
- E2E: `tests/e2e/member-edit.spec.js` — full edit → Supabase round-trip per CLAUDE.md §E2E rule (admin opens member sheet, edits a pending invite's email, verifies `operation_members.email` in Supabase reflects the change)

**Acceptance criteria:**
- [ ] Edit button renders on pending invite rows for owner/admin (not for team members)
- [ ] Edit button renders on accepted non-owner non-self rows for owner/admin
- [ ] Owner row has no edit button (CP-66 owner-row protection extends here)
- [ ] Self row has no edit button (self-edit is out of scope, see Notes)
- [ ] Tapping Edit on a pending row reveals inline form: display_name input, email input, role segment control (admin/team_member), Save + Cancel buttons
- [ ] Tapping Edit on an accepted row reveals inline form: display_name input, email input, Save + Cancel buttons (no role segment — role select stays on the row)
- [ ] Save validates: display_name trimmed non-empty, email trimmed non-empty contains `@`
- [ ] Save persists to Supabase via `update`; success toast shows "Changes saved"; member list re-renders with new values
- [ ] Email collision (another row in same operation has same email) shows inline error "Email already in use in this operation"
- [ ] Cancel button discards changes and collapses the form
- [ ] All user-facing strings use `t()`
- [ ] No `innerHTML` — DOM builder pattern only
- [ ] Unit tests cover all six cases above
- [ ] E2E test verifies Supabase row reflects the edit (per CLAUDE.md §E2E)

**Related OIs:** OI-0047 (closed 2026-04-20 — CP-66 ship: this OI is the in-place follow-up that CP-66 explicitly deferred). No other open OIs depend on this one.

**Notes:**
- This is independently shippable from OI-0119 (DMI-8 cascade) and the rest of the UI sprint. It does not touch any of the dashboard/event-detail surfaces under sprint revision.
- During UI sprint, the spec file in `github/issues/` is a full spec (not a thin pointer) per CLAUDE.md §"Active Sprint." At sprint reconciliation, the canonical spec text moves into V2_UX_FLOWS.md §20.7 (Member Management) as a new sub-section under §20.3.2 Member List, and the github/issues/ file becomes a pointer.
- Self-profile editing (a member changing their own display_name and email) is a known gap left open by this OI. Captured here for future tracking but explicitly out of scope for OI-0120 — decision is to scope OI-0120 narrowly to admin-side edit so the immediate CP-66 typo-fix gap is closed without expanding scope into account-settings UX. A separate OI for self-profile editing can be opened later if/when Tim hits the need.

---

### OI-0119 — DMI-8 chart shows empty bars: dead-table observation reads + actual-path requires two bracketing checks + estimated path ignores feed entries entirely + no cascade model (combined rewrite)
**Added:** 2026-04-20 | **Area:** v2-build / calcs / dashboard / event-detail / ui | **Priority:** P1 (live field-testing surface — farmer cannot see pasture vs stored split on any current event; chart is the primary data-density carrier on both the dashboard card and event detail; the bug class is the same silent field-name drift that OI-0075 Bug 3 closed on the capacity line)
**Checkpoint:** UI sprint (combined fix; supersedes OI-0076 deferral and rewrites OI-0069's DMI-8 spec)

**Status:** closed — 2026-04-20. Spec: `github/issues/GH-29_dmi-8-cascade-rewrite.md` (GH issue #29). DMI-8 rewritten with the cascade model in `src/calcs/feed-forage.js`; shared chart-context builder extracted to `src/features/events/dmi-chart-context.js` (centralizes the `paddock_observations` migration and the `areaHectares ?? areaHa` fallback, and applies the OI-0117 `getEventStartDate` decoration on `event.dateIn`); `src/features/dashboard/index.js` + `src/features/events/detail.js` chart builders now call the shared helper with date-routing source-event bridge; `src/ui/dmi-chart.js` renders all five statuses including the red deficit segment atop the stored stack, the `no_pasture_data` inline CTA linking to OI-0118's Edit Paddock Window dialog (missing observation) or to the Locations tab (missing forage type), and the "(Fix cover)" hint chip for partial pre-graze; `src/features/events/submove.js` gains the forced feed-check card on close when `event.hasStoredFeed` is true (writes `event_feed_checks` + per-combo `event_feed_check_items` with `isCloseReading=false`). Full unit suite 1135 → 1165 (30 new cases: 11 cascade + 5 context + 6 renderer + 4 submove close + 4 reused existing). Grep contracts: `getAll('eventObservations')` → 0 in `src/features/dashboard` + `src/features/events`; `feedEntries: _feedEntries` → 0; `update('events'` → 0 in `submove.js`. Base doc already up-to-date (Cowork pre-rewrote V2_CALCULATION_SPEC.md §4.2 with the cascade model + five statuses + deficit row). E2E `tests/e2e/dmi-chart.spec.js` covers the Supabase round-trip. No schema change. No CP-55/CP-56 impact.

**What Tim is hitting:** On the dashboard home (location cards G-1/G-3, D, B2/B-1) and on Event Detail's §3 DMI chart, the 3-day stacked bars render empty (`—` values, grey bars, no pasture/stored split) on active events that have real pre-graze observations, real animal placements, and in some cases real feed entries. Two screenshots captured 2026-04-20: three of three location cards with empty charts on events that have been open for 3–5 days. G-1/G-3 partially renders (legacy data path still works on one window), but D and B2 are fully grey.

**Three root causes — all present, all silent:**

1. **Dead-table observation read (same class as OI-0075 Bug 3 — "silent field-name drift").** OI-0112 migrated every observation writer from `event_observations` → `paddock_observations` and zeroed the writers on the old table. DMI-8's chart-data builder was missed in that sweep. Two call sites still read the dead collection:
   - `src/features/dashboard/index.js:1348` — `getAll('eventObservations').filter(o => o.eventId === event.id)` in the 3-day chart context builder. Result: `observations = []` on any event created or updated post-OI-0112, so the FOR-1 gate in DMI-8 (`if (!preGrazeObs?.forageHeightCm) return { status: 'needs_check' }`) always fires → grey bar.
   - `src/features/dashboard/index.js:1382` — same pattern in the `getSrcCtx()` source-event bridge helper.
   - `src/features/events/detail.js:432` — same pattern in `buildDmi8ChartData`.
   - `src/features/events/detail.js:475` — same pattern in the source-event bridge on detail.
   The correct pattern (already in use on the capacity line since OI-0075) is `getAll('paddockObservations').filter(o => o.locationId === primaryPw.locationId && o.type === 'open' && o.source === 'event')` with `sourceId === pw.id` preference and most-recent fallback.

2. **`loc.areaHa` vs `loc.areaHectares` field-name drift in `detail.js` only.** OI-0075 Bug 3 fixed this in `dashboard/index.js` at eight read sites by using `loc.areaHectares ?? loc.areaHa`. `detail.js:440` (`locations[pw.locationId] = { areaHa: loc.areaHa }`) and `detail.js:480` (source-event bridge) were missed. Result: `area_hectares` resolves to `undefined`, FOR-1 returns 0, pasture estimate path silently falls through to `needs_check`.

3. **Logic gaps in DMI-8 itself — three compounding bugs:**
   - **Feed entries ignored.** `src/calcs/feed-forage.js:539` destructures `feedEntries: _feedEntries` and never reads it. The estimated path derives `storedDmiKg` as `totalDmiKg - pastureDmiKg` (residual of the pasture balance), not from actual deliveries. Any event with stored feed deliveries but no bracketing feed checks shows either full pasture (if standing DM covers demand) or full stored (if pasture is exhausted), never the realistic mix where the farmer delivered stored feed alongside grazing.
   - **Actual path requires TWO bracketing feed checks.** `feed-forage.js:586-596` requires both `prevCheck` AND `nextCheck` covering the target date. Single-check case (the most common "today" scenario — one check exists, today is after the latest check) silently falls to needs_check / estimated, losing the actual fidelity that single-check interpolation (deliveries since check minus current remaining) can provide.
   - **No cascade model.** There is no representation of "pasture consumed first, stored consumed to fill the shortfall, deficit when both are exhausted." The farmer's mental model of the pasture — which v1 captured loosely with a pasture-vs-stored split — is architecturally missing.

**Why this is a combined rewrite and not three small fixes:**

The three bugs interact. Fixing the dead-table read alone un-greys bars but feeds the still-broken estimated path, which then renders wrong numbers. Fixing the single-check actual path alone forces a design decision about whether single-check projections retroactively convert prior estimates (spoiler: they should, for stored; they should not, for pasture). Fixing the feed-entries inclusion alone still leaves no cascade to decide which bucket the demand draws from first. The three belong in a single spec with a coherent model. Per CLAUDE.md §"Fix Root Causes, Not Symptoms": presenting three separate hotfixes and deferring the cascade model is the workaround path. The root-cause path is to redesign DMI-8 around a cascade bucket model that naturally covers every case, then wire the three bug fixes as preconditions for it to work.

**The new DMI-8 model — cascade bucket walk:**

For each date in the 3-day window, run one of five statuses per day:

1. **`no_animals`** — `totalDmiKg <= 0` (no active groups on this date). Blank bar, small "—" label, no CTA. Distinct from `needs_check` because the data isn't missing — there are legitimately no animals to feed.
2. **`actual`** — a feed check covers this date exactly (check on this date) OR brackets it (prev + next). Use DMI-5 (for bracketed) or single-check forward/backward projection (for un-bracketed "since last check"). `storedDmiKg` from deliveries minus residual; `pastureDmiKg = totalDmiKg - storedDmiKg` if in cascade window, else clamped to 0 and surplus goes to deficit.
3. **`estimated`** — no feed check; run the cascade:
   - **Step 1 — compute pasture bucket:** `initialPastureDm = FOR-1(pre-graze obs, location, forage type)` at the window start (event start OR earlier sub-move open OR source event end — see source bridge below). Walk forward day by day, subtracting each day's `pastureConsumed` (actual where a prior actual day exists, estimated where not).
   - **Step 2 — compute stored bucket:** starting inventory = sum of deliveries on or before this date, minus sum of residuals from the latest feed check (if any exists before this date). Walk forward subtracting each day's `storedConsumed`.
   - **Step 3 — allocate today's demand via cascade (preference: pasture, then stored, then deficit):**
     - If `remainingPastureDm >= todayDemand` → `pastureDmiKg = todayDemand`, `storedDmiKg = 0`, `deficitKg = 0`.
     - If `0 < remainingPastureDm < todayDemand` AND `remainingStoredDm >= shortfall` → `pastureDmiKg = remainingPastureDm`, `storedDmiKg = shortfall`, `deficitKg = 0`.
     - If `0 < remainingPastureDm < todayDemand` AND `remainingStoredDm < shortfall` → `pastureDmiKg = remainingPastureDm`, `storedDmiKg = remainingStoredDm`, `deficitKg = todayDemand - pastureDmiKg - storedDmiKg`.
     - If `remainingPastureDm <= 0` AND `remainingStoredDm >= todayDemand` → `pastureDmiKg = 0`, `storedDmiKg = todayDemand`, `deficitKg = 0`.
     - If `remainingPastureDm <= 0` AND `remainingStoredDm < todayDemand` → `pastureDmiKg = 0`, `storedDmiKg = remainingStoredDm`, `deficitKg = todayDemand - storedDmiKg`.
   - Decrement buckets by allocated amounts; move to next day.
4. **`needs_check`** — pre-graze observation is present but the cascade can't run yet (e.g. no prior days to seed the walk, or the event is day 1 with no forage type set but observation exists). Grey bar with "Feed check needed" hint. CTA: none (tapping doesn't help).
5. **`no_pasture_data`** — distinct status (NOT a sub-reason under `needs_check`): pre-graze observation is **missing** on the owning paddock window, OR `loc.forageTypeId` is `null`. Grey bar with CTA: "Set forage type" / "Add pre-graze observation" — inline link to the Edit Paddock Window dialog for the owning window (per OI-0118 this will open with pre-graze card pre-wired). Matches the way OI-0075's capacity line surfaced a missing-input hint.

**Cascade reset rules (the four places buckets change outside the daily walk):**

- **At event start:** pasture bucket = `FOR-1(pre-graze on primary paddock window)`. Stored bucket = sum of deliveries on that date.
- **At sub-move open:** pasture bucket **adds** `FOR-1(pre-graze on new sub-move's window)` to the current remaining pasture (pooled across parallel open sub-paddocks). Stored bucket is unchanged (physical bales don't teleport). **Rationale (Tim, 2026-04-20):** multiple sub-paddocks can be open simultaneously when the farmer gives cattle multiple days of pasture at once; the model must pool pasture across all currently-open paddock windows.
- **At sub-move close:** the closed window's remaining pasture is dropped from the pool (animals no longer have access to it). Stored bucket is unchanged. **NEW RULE — forced feed check on sub-move close when stored feed present:** if the event has any stored-feed deliveries, sub-move close requires a feed check as part of the close flow (inline card on the sub-move Close sheet). This strikes a clean actual/estimated line at the boundary and prevents the carryover ambiguity on the next sub-move's pasture projection. No stored-feed close prompt (as with existing Close Event behavior). **Rationale (Tim, 2026-04-20):** pasture observations are inherently subjective — a pre-graze height guess is already a best guess — so forcing a pasture observation at sub-move close doesn't buy accuracy. Feed checks on stored feed are much more precise and give the cascade a firm anchor.
- **At a feed check (any time):** stored bucket is re-anchored to `deliveries_since_check_start - sum(remaining)`. Pasture bucket is NOT re-anchored — observation-based estimates stay estimates (pre-graze is too subjective to use as a retroactive truth). Retroactive conversion rule: a feed check converts the **prior interval's `storedDmiKg`** from `estimated` → `actual` (the interval between this check and the previous check or the event start). Pasture bars in that interval stay `estimated`. **Rationale (Tim, 2026-04-20 — Option A chosen):** reading a post-graze pasture observation as ground truth would let a subjective pre-graze guess corrupt prior-day splits; the stored leg is measurable and can be retroactively trued up without that risk.

**Source-event bridge (simplified per Tim's 2026-04-20 decision):**

The 3-day rolling window can extend into a prior event via `event.sourceEventId`. Previous design considered "state handoff" at the event boundary (stored carries, pasture resets). Simplified to **date-routing only**: for each date in the chart window, find which event owned that date (source event OR current event), and run DMI-8 against **that event's** self-contained cascade. No state carryover between events; each event's cascade starts fresh from its own event-start observation and deliveries. **Trade-off accepted:** stored feed that physically carried across the boundary (farmer moved bales from the old paddock to the new) won't show on the new event's chart unless the farmer logs it as a delivery on the new event. This matches existing v2 + v1 semantics (deliveries are event-scoped). If field testing surfaces confusion, a "carry stored from prior event" toggle at event start is a future enhancement (captured as a sub-bullet below but not in scope here). **Rationale:** keeps the cascade self-contained per event; eliminates a class of handoff edge cases that would otherwise need specs (chained events, non-overlapping source bridges, reopen interactions).

**Pre-graze default when partial (Tim, 2026-04-20 — Option 3 "best-effort with Fix CTA"):** when a pre-graze observation exists with `forageHeightCm` but no `forageCoverPct`, default cover to **100%** for the cascade computation (matches "fully covered pasture" assumption). Render an inline "(assuming 100% cover — Fix)" subtle hint below the chart with a link to edit the observation. Do NOT fall to `no_pasture_data` — partial is usable, missing is not.

**Render additions for `src/ui/dmi-chart.js`:**

| Status | Bar color | Label | CTA |
|---|---|---|---|
| `actual` | solid two-stack (green pasture / amber stored) | total, day label | none |
| `estimated` | striped two-stack (green diagonal / amber diagonal) | total `(est.)`, day label | none |
| `estimated` with deficit | striped two-stack + **red segment on top** for deficit portion | total `(est.)` with `+X deficit` sub-label, day label | none |
| `needs_check` | grey short bar, `—` value | "Feed check needed" | none |
| `no_pasture_data` | grey short bar, `—` value | "No pasture data" | inline link "Set forage type" or "Add pre-graze" → Edit Paddock Window dialog |
| `no_animals` | blank space at bar height, `—` value | day label only | none |

Legend updates: add red ■ "deficit" only when at least one bar has deficit > 0.

**Files affected:**

- `src/calcs/feed-forage.js` — full rewrite of DMI-8 (~540–641). New cascade walker, five statuses, feed-entry inclusion, single-check projection, retroactive actual-conversion for prior stored intervals.
- `src/features/dashboard/index.js` — lines 1336–1425. Migrate dead-table reads (`eventObservations` → `paddockObservations` with the OI-0075 / OI-0112 pattern). Migrate source-event bridge to "date routing only" — call DMI-8 with the correct event context for pre-current-event days, no state handoff. Wire the new render statuses to the chart renderer.
- `src/features/events/detail.js` — lines 389–538. Same two migrations. Plus the `loc.areaHa` → `loc.areaHectares ?? loc.areaHa` fallback at lines 440 and 480 (sibling fix to OI-0075 Bug 3).
- `src/ui/dmi-chart.js` — add `deficit` segment rendering, `no_animals` blank rendering, `no_pasture_data` distinct rendering with inline CTA link. Update legend to conditionally include red deficit swatch.
- `src/features/events/submove.js` — sub-move Close: when `event.hasStoredFeed`, render a feed-check card inline in the Close sheet and require save before close. New `forceFeedCheckOnClose: true` branch.
- `src/features/events/close.js` — audit only: Close Event already prompts for feed check in most flows; confirm no regression.
- `tests/unit/calcs/dmi-8.test.js` — new test file with cases for: `no_animals` (zero groups), pure-pasture estimated (full pasture bucket), pasture→stored transition mid-day, deficit day, actual with single prior check, actual with bracketing checks, retroactive conversion of prior stored interval, source-event bridge routing, pre-graze 100%-cover default with partial observation, `no_pasture_data` on missing forage type, `no_pasture_data` on missing observation.
- `tests/unit/dashboard-dmi-chart.test.js` — update for the new render statuses; round-trip tests for the full chart context builder.
- `tests/unit/detail-dmi-chart.test.js` — same.
- `tests/e2e/dmi-chart.spec.js` — new: create an event with pre-graze + groups → assert 3 bars render with correct statuses → add a feed check → assert the prior interval bar converts to `actual` (not just the current day). Follows CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI" — chart data flows through Supabase for multi-device fidelity.

**Acceptance criteria:**

- [ ] Dashboard location cards G-1/G-3, D, B2/B-1 render non-empty 3-day charts for the active events (screenshot-reproducible).
- [ ] Event Detail §3 DMI chart renders non-empty 3-day bars on the same events.
- [ ] `getAll('eventObservations')` is not called from `dashboard/index.js` or `detail.js` (grep returns 0 matches outside a deprecated-collection fallback in sync-adapter, if any exists).
- [ ] `loc.areaHa` without the `areaHectares` fallback is not referenced in `detail.js` DMI-chart builder (grep).
- [ ] DMI-8 reads `feedEntries` (no leading underscore); unit test covers delivered-stored contribution to the cascade.
- [ ] Actual-path single-check projection works (test: one check before today, assert today's bar renders `actual` not `estimated`).
- [ ] Cascade allocates demand pasture-first, stored-second, deficit-third (unit test walks a 4-day cascade through each allocation branch).
- [ ] A feed check retroactively converts the PRIOR interval's `storedDmiKg` bar from `estimated` → `actual` (test asserts status flip after check insertion); pasture bars in the same interval stay `estimated`.
- [ ] Sub-move open adds the new window's standing DM to the pasture bucket; sub-move close drops it.
- [ ] Sub-move Close sheet requires a feed check when the event has any stored-feed deliveries (unit + e2e test).
- [ ] Parallel sub-paddocks pool pasture correctly (unit test with 2 open sub-paddocks, assert pooled `initialPastureDm`).
- [ ] Source-event bridge routes pre-event-start days to the source event's own DMI-8 context (unit test).
- [ ] `no_animals`, `needs_check`, `no_pasture_data` are distinct statuses with distinct renders (unit tests on the chart renderer).
- [ ] Pre-graze partial (height present, cover missing) renders with 100% cover default and a "(Fix)" hint (unit test).
- [ ] Chart deficit days render with red top segment and `+X deficit` sub-label; legend adds red swatch only when at least one bar has deficit.
- [ ] Full unit suite stays green; new cases added per the files-affected list.
- [ ] PROJECT_CHANGELOG.md row added on commit.

**Base doc impact (sprint reconciliation):**
- **V2_CALCULATION_SPEC.md §4.2 DMI-8** — rewritten inline with this OI (this OI updates the base doc directly; not sprint-deferred because the calc spec is authoritative).
- **V2_UX_FLOWS.md §12 Sub-moves** — the "forced feed check on sub-move close when stored feed present" rule rolls in at sprint reconciliation. Add the flow step to §12.
- **V2_UX_FLOWS.md §17.7 Dashboard** — chart status set expands from 3 to 5 (actual / estimated / needs_check / no_animals / no_pasture_data) plus the deficit render. Minor enumeration update at reconciliation.
- **V2_UX_FLOWS.md §17.15 Event Detail** — same chart status set.
- **UI_SPRINT_SPEC.md SP-3** — chart behavior note: cascade model, deficit bar, no-animals bar, no-pasture-data bar.

**CP-55/CP-56 impact:** **NONE.** DMI-8 is compute-on-read; no new columns. The forced-feed-check rule on sub-move close writes via the existing `event_feed_checks` + `event_feed_check_items` pipeline (already in CP-55).

**Schema change:** **NONE.**

**Related:**
- **OI-0069** (close with this OI) — original DMI-8 spec. The calc shipped per OI-0069 but the three root causes above were latent; this OI is the corrective rewrite per CLAUDE.md §"Corrections to Already-Built Code".
- **OI-0076** (close with this OI — supersedes) — "DMI Chart Empty Bars — Deferred Until Fresh V2 Test Data." Tim has generated fresh data; the deferral assumption (v1-migration data incompleteness) is now known to be only a minority contributor. The real causes are the three above.
- **OI-0075 Bug 3** (precedent) — same "silent field-name drift" class (`loc.areaHa` vs `loc.areaHectares`). Same fix pattern. This OI applies the pattern to the DMI chart's observation read + the missed `detail.js` area-field site.
- **OI-0112** (shipped, orphan) — migrated observation writers to `paddock_observations`. The DMI-8 chart was the last unmigrated reader; OI-0075 Bug 3 caught the capacity line, this OI catches the chart.
- **OI-0113** (pending — drop `event_observations` table) — this OI's fix is a prerequisite (last unmigrated reader). Once this ships, OI-0113 can drop the table with no live readers.
- **OI-0118** (shipped) — pre-graze card reachability on closed windows. The `no_pasture_data` inline CTA in this OI links to the Edit Paddock Window dialog enabled by OI-0118.
- **OI-0070** (EST-1) — estimated-vs-actual accuracy report. EST-1 depends on DMI-8 producing correct actual + estimated splits; this OI unblocks EST-1 field-testing.
- **CLAUDE.md Known Traps** — "silent field-name drift" (post-OI-0075). No new trap entry needed; this is a direct instance.

**Future work (captured, not in scope):** carry-stored-from-prior-event toggle at event start — surfaced if field testing shows missing stored feed on the first day of a new event after a physical carryover. New OI at that point.

**Thin pointer note:** full spec during UI sprint per `CLAUDE.md §"Active Sprint"`. Reduce to a thin pointer referencing V2_CALCULATION_SPEC.md §4.2 at sprint reconciliation.

---

### OI-0118 — Edit Paddock Window dialog is missing pre-graze / post-graze observation cards (surface parity gap with move wizard + event detail §5/§6)
**Added:** 2026-04-20 | **Area:** v2-build / events / observations / ui | **Priority:** P1 (surface parity gap — farmer discovered during live sub-move editing from Event Detail; once a window is closed, the pre-graze observation is **unreachable from the UI** because event detail §5 only renders pre-graze cards on open windows)
**Checkpoint:** shipped. Spec: `github/issues/GH-28_edit-paddock-window-observation-cards.md` (GH issue #28). See `src/features/events/edit-paddock-window.js` for the two new card sections.

**Status:** closed — 2026-04-20. `openEditPaddockWindowDialog` now renders the shared `renderPreGrazeCard` on every paddock window (open + closed) and `renderPostGrazeCard` only when `pw.dateClosed != null`, each with its own inline Save button (`edit-pw-pregraze-save-${pw.id}` / `edit-pw-postgraze-save-${pw.id}`) that writes to `paddock_observations` with `source='event'` and `sourceId=pw.id`. `paddockAcres` is populated on first render from `loc.areaHa` (no BRC late-bind needed — `pw.locationId` is known at dialog open). All seven unit tests green in `tests/unit/edit-paddock-window-observations.test.js`; e2e `tests/e2e/edit-paddock-window-observations.spec.js` asserts the Supabase round-trip. Full suite 1128 → 1135. No schema change; no CP-55/CP-56 impact. Base-doc update deferred to sprint reconciliation (V2_UX_FLOWS.md §12 + §17.15 will name pre/post-graze as rendered components of the edit dialog).

**What Tim is hitting:** On the Event Detail sheet, the "Edit" pencil next to a sub-move row (§12 Sub-move History, `detail.js:1299`) — and the "Edit" button on any row in §4 Paddocks (`detail.js:593`) — opens `openEditPaddockWindowDialog` from `src/features/events/edit-paddock-window.js`. That dialog only renders `dateOpened` + `timeOpened`, `dateClosed` + `timeClosed` (if closed), `areaPct`, and the strip-graze toggle. Pre-graze and post-graze observation cards are absent. Every other surface that touches a paddock window renders them: move wizard destination/source, sub-move Open sheet, sub-move Close sheet, Close Event sheet, Event Detail §5/§6. The edit dialog is the outlier.

**Why this is a root-cause problem and not just polish:** Event Detail §5 filters `openPaddockWindows = getAll('eventPaddockWindows').filter(pw => pw.eventId === ctx.eventId && !pw.dateClosed)` (`detail.js:624-625`). Once a paddock window is **closed**, its pre-graze card disappears from §5 forever. The post-graze card appears in §6 on closed windows, but there is currently **no surface in the app** where a farmer can correct a historical pre-graze observation on a closed sub-move. The edit-paddock-window dialog is the natural home for that — it's the only place the window is editable at all after closing.

**Scope:**
1. **Pre-graze card** — render `renderPreGrazeCard({ farmSettings, paddockAcres, initialValues })` unconditionally in the dialog (open AND closed windows). `paddockAcres` is `convert(loc.areaHa, 'area', 'toImperial')` where `loc = getById('locations', pw.locationId)`. `initialValues` reads from the existing `paddock_observations` row with `type: 'open'`, `source: 'event'`, preferring `sourceId === pw.id` with fall-through to most-recent (same pattern as `detail.js:644-648`).
2. **Post-graze card** — render `renderPostGrazeCard({ farmSettings, initialValues })` only when `pw.dateClosed != null`. Lookup pattern mirrors §6 (`detail.js:743-747`): `type: 'close'`, `source: 'event'`, `sourceId === pw.id` first, most-recent fallback.
3. **Save wiring** — each card gets its own inline Save button (not folded into the dialog's main Save — that keeps the observation write separable from the window-metadata write, matches §5/§6 pattern exactly, and avoids mixing `update('eventPaddockWindows')` with `add/update('paddockObservations')` in one handler). Copy the save-button logic from `detail.js:676-700` (pre-graze) and `detail.js:770-792` (post-graze) — same `if (obs) update(...) else add(PaddockObsEntity.create({... sourceId: pw.id ...}))` branch with the same transient "Saved" indicator.
4. **Ordering in the dialog:** existing fields at top (date opened / closed / area / strip) → pre-graze card → post-graze card (only if closed) → reopen button (only if closed) → delete button. Observations live above the destructive actions.
5. **BRC late-bind not required here** — unlike sub-move Open (NC-1 fix), the location is already known when the dialog opens (`pw.locationId`), so `paddockAcres` is populated on first render. No `setPaddockAcres` wiring needed.

**Files affected:**
- `src/features/events/edit-paddock-window.js` — add imports for `renderPreGrazeCard`, `renderPostGrazeCard`, `PaddockObsEntity`, `add` from store, `convert` from units, `getById` (already imported). Add two new sections to the panel before the button row.
- `tests/unit/features/events/edit-paddock-window.test.js` (new or extended) — unit tests covering: (a) pre-graze card renders on open windows, (b) pre-graze card renders on closed windows, (c) post-graze card renders only on closed windows, (d) save writes a new `paddock_observations` row with correct `sourceId`, `type`, `source`, (e) save updates an existing row rather than duplicating, (f) round-trip: open dialog → edit height → save → reopen dialog → card pre-populates with the saved value.
- `tests/e2e/` — extend an existing sub-move edit e2e (or add one) to assert a Supabase `paddock_observations` row appears after saving pre-graze from the edit dialog, per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI".
- `PROJECT_CHANGELOG.md` — one row on commit (Claude Code owns).

**Acceptance criteria:**
- [ ] Pre-graze card renders in `openEditPaddockWindowDialog` for every paddock window (open or closed).
- [ ] Post-graze card renders only when `pw.dateClosed != null`.
- [ ] Each card has its own Save button with the same transient "Saved" indicator pattern used in detail.js §5/§6.
- [ ] Save writes to `paddock_observations` with `source: 'event'`, `sourceId: pw.id`, `type: 'open'` for pre-graze and `type: 'close'` for post-graze. All five `add()` params / six `update()` params per CLAUDE.md §"Store call param-count check".
- [ ] `initialValues` populates from the existing observation row if one exists (prefer `sourceId === pw.id`, fall back to most recent, matching the §5/§6 pattern).
- [ ] `paddockAcres` is computed via `convert(loc.areaHa, 'area', 'toImperial')` so BRC helper surfaces when farm settings + location area are populated.
- [ ] Closed-window historical pre-graze edit round-trips to Supabase (e2e asserts the row exists with the new value).
- [ ] No regression in the existing dialog behavior — date/time/area/strip edits, reopen button, delete button all behave identically.
- [ ] Unit test suite stays green; new tests cover the six cases listed above.

**Base doc impact (sprint reconciliation):** V2_UX_FLOWS.md §12 Sub-moves and §17.15 Event Detail — the paddock-window edit dialog section should name pre-graze and post-graze as rendered components (currently not enumerated). SP-2 spec in `UI_SPRINT_SPEC.md` should reference the edit dialog's observation cards so the parity principle is preserved after sprint reconciliation. Canonical component references (pre-graze-card.js / post-graze-card.js) unchanged — this is just a new caller.

**CP-55/CP-56 impact:** NONE. No schema change. Existing `paddock_observations` columns already in CP-55 export (OI-0112 shipped) — this is just a new write surface for the same table.

**Schema change:** NONE. `paddock_observations` table + columns already exist.

**Thin pointer note:** not a thin pointer — no base-doc enumeration of the edit-paddock-window dialog's component set exists. At sprint reconciliation, the observation-card rendering rolls into V2_UX_FLOWS.md §17.15 alongside the date/area fields.

**Related:**
- **OI-0112** (shipped) — unified three card variants into `renderPreGrazeCard` / `renderPostGrazeCard` / `renderSurveyCard`, migrated six surfaces. The edit-paddock-window dialog is a seventh surface that was not part of the OI-0112 sweep. This OI closes that omission.
- **OI-0110** (shipped) — migrated sub-move Open sheet pre-graze to the shared card. Same class of caller-migration.
- **OI-0107** (shipped) — migrated Event Detail §5 pre-graze to the shared card. Direct architectural sibling: this OI extends the same pattern to the edit dialog for the closed-window case §5 doesn't cover.
- **OI-0114** (shipped) — observation boxes polish pass. Landed before this OI, so the styling the new callers inherit is already canonical — no additional CSS work expected.
- **Known Trap (CLAUDE.md):** "UI fields without Supabase columns = silent data loss." Inverse trap this OI addresses: a Supabase column (`paddock_observations.forage_height_cm` etc.) that has no editable surface on a closed window is silently unreachable — not a data-loss class, but the same root-cause family of UI/schema drift. No new entry needed; the existing trap covers this.

---

### OI-0117 — Derive `event.dateIn` / `timeIn` from earliest child window; drop the `events.date_in` / `events.time_in` columns
**Added:** 2026-04-18 | **Area:** v2-build / events / data-integrity / schema | **Priority:** P1 (architectural hardening — OI-0115 closed the symptom, this closes the class. Two sources of truth for event start is the root cause of that whole family of bugs.)
**Checkpoint:** shipped. Spec: `github/issues/GH-27_derived-event-start-datetime.md` (GH issue #27). See `src/features/events/event-start.js` for the derivation + write-through helpers and `supabase/migrations/028_drop_event_datetime_columns.sql` for the column drop.

**Status:** closed — 2026-04-18. Migration 028 applied and verified against Supabase (columns dropped, `operations.schema_version = 28`, one OI-0115-era drift victim pre-logged to `app_logs` for audit: event `da54838f-c79d-4749-a74f-601c7139599f`). All 1128 unit tests green. CP-55 export naturally omits the dropped columns; CP-56 27→28 migration rule discards `date_in`/`time_in` from pre-v28 backup rows with drift logging. Two new grep contracts added to CLAUDE.md §"Architecture Audit" #7 and a new Known Traps entry on "two stored columns for one derivable fact = silent drift" prevent regression.

**What's wrong:** `events.date_in` / `events.time_in` are stored as independent columns even though they are *definitionally* equal to the earliest opening across `event_paddock_windows` and `event_group_windows` on that event. Two sources of truth for the same fact means any code path that updates one but not the other creates drift. OI-0115 was exactly that — a phantom `change` event wrote `events.date_in` while the child windows stayed correct, producing a live corruption that the farmer then couldn't even fix from the UI because `edit-paddock-window.js:89`'s guard (`newDateOpened < event.dateIn`) used the corrupted `events.date_in` as the floor and blocked backdating the child window to recover. **Tim hit this exact chain during 2026-04-18 field testing after OI-0115's corruption had landed** — see session transcript for the B1/B2 repro on event `0afb6add…`.

**Root cause:** storing `events.date_in` as an authoritative column. It's not authoritative — the child windows are. Fix is to make the model match reality: derive `dateIn` / `timeIn` from the earliest child window at read time, and make the displayed-and-editable "In [date] [time]" on the Event Detail hero line write through to whichever child window sourced that minimum.

**Scope (high level — full breakdown in spec):**
1. **Schema v28 migration (028_drop_event_datetime_columns.sql):** `ALTER TABLE events DROP COLUMN date_in, DROP COLUMN time_in`. Pre-check: verify every event's current `date_in` equals `MIN(child opening)`; log and overwrite with the child truth for OI-0115-era corruption cases. `BACKUP_MIGRATIONS` entry bumps schema_version to 28.
2. **Entity:** remove `dateIn` / `timeIn` from `src/entities/event.js` `FIELDS`. Add `src/entities/event.js` (or `src/features/events/index.js`) helper `getEventStart(eventId) → { date, time, sourceWindowId, sourceWindowType }`.
3. **Read sites:** every `event.dateIn` / `event.timeIn` consumer switches to `getEventStart(eventId)`. Includes dashboard card, detail header, move-wizard close-out, rotation calendar, DMI-8 chart x-axis origin, Day-X counter, log/events-log, export payload (CP-55). Grep sweep required.
4. **Write site:** Event Detail hero's date + time inputs (detail.js:300–349) switch to `setEventStart(eventId, newDate, newTime)` which updates the earliest child window's `date_opened` / `time_opened` — not the parent event.
5. **Guard fix:** `edit-paddock-window.js:89` and `edit-group-window.js:113` recompute the floor as `MIN(all child windows' openings excluding the one being edited)` — no longer read `event.dateIn`.
6. **CP-55:** export no longer includes `events.date_in` / `events.time_in` (columns don't exist).
7. **CP-56:** reading a pre-v28 backup that contains `events.date_in` / `events.time_in` — discard them; the truth is rebuilt from child window rows. If child windows disagree with the backup's event.date_in by more than 1 day, log a `backup_import.drift_detected` event so Tim can audit which events were OI-0115 victims in historical backups.
8. **Tests:** unit tests for `getEventStart` + `setEventStart` (including tied-earliest-window cases), e2e tests confirming the UI edit writes to `event_paddock_windows` in Supabase (per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI").

**Tied-earliest write behavior on move-later (confirmed by Tim 2026-04-18 — option (a)):** when multiple child windows share the current earliest opening datetime and the user moves event start later, `setEventStart` updates **all tied windows**. On-save confirmation dialog when more than one window will move ("Moving event start to {date} {time} will also update {N} other window(s) that opened at the same time. Continue?"). Cancel aborts the whole save. Rationale: option (b) would leave the un-moved tied windows opening before the new event start, re-creating the exact floor-violation class of bug OI-0117 is closing.

**CP-55/CP-56 impact:** YES — schema v28. Backup format changes: forward backups omit the dropped columns; CP-56 migration rule added for pre-v28 backups that read-and-discard the columns with drift logging.

**Schema change:** YES — migration 028 drops two columns. `UPDATE operations SET schema_version = 28;` footer per CLAUDE.md §"Code Quality Checks" rule 6. `BACKUP_MIGRATIONS` no-op entry added.

**V2_MIGRATION_PLAN.md impact:** §5.3a FK dependency order unaffected (no tables added/removed). §5.11a migration-checklist rationale still covered. Add §5.x note about the derivation-from-child-windows invariant.

**V2_SCHEMA_DESIGN.md impact:** §5.1 `events` table — remove `date_in` and `time_in` rows from the column table and from the `CREATE TABLE` block. Add design-decision note: "`date_in` / `time_in` are derived from the earliest child `event_paddock_windows.date_opened` / `event_group_windows.date_joined` — no column stored. Writing a new start datetime on the Event Detail hero updates the earliest child window (see V2_APP_ARCHITECTURE.md §[new section])."

**V2_APP_ARCHITECTURE.md impact:** new section documenting the `getEventStart` / `setEventStart` read-through / write-through pattern as a reusable idiom. This is the first derived-with-write-through field in v2; subsequent similar cases (e.g. `event.dateOut` is a candidate for the same treatment with earliest-child-close logic) can reference it.

**Base doc impact:** at sprint reconciliation, fold the UI behavior into V2_UX_FLOWS.md §17.15 (Event Detail hero line) — "editing the In [date] [time] inputs updates the earliest child paddock or group window; no separate `events.date_in` column exists." No change needed to §17.7 Dashboard (the card just displays the derived value; no edit surface on the card).

**Related:**
- **OI-0115** (shipped, GH-25) — the symptom this closes at the class level. With OI-0117 landed, an OI-0115-class phantom write has no target to corrupt (the column doesn't exist).
- **OI-0116** (next) — the `time_in` editor spec. Ships first against the current column; its write-target switches to the earliest child window when OI-0117 lands, with no user-visible change.
- **Known trap (v1 lesson, CLAUDE.md):** "mutation functions that forget to notify subscribers = stale UI." Sibling trap this OI addresses: *two columns that store the same fact = drift whenever any code path updates one but not both*. Add a Known Traps entry after this ships — "derived-over-stored for any value that is strictly a function of child records."

---

### OI-0116 — Add editable `time_in` input to Event Detail header next to the date input
**Added:** 2026-04-18 | **Area:** v2-build / events / detail-sheet / ui | **Priority:** P2 (usability gap — `time_in` currently only editable via the paddock-window edit dialog, which Tim described as "not intuitive")
**Checkpoint:** ship as its own spec-file handoff. Spec: `github/issues/event-detail-time-in-editor.md`. Small-surface UI addition — one input, three guards that mirror the existing dateInInput, unit + e2e test. Independent of OI-0117.

**Status:** closed — 2026-04-20 (reconciliation sweep). Landed as part of OI-0117 rather than as a standalone handoff. `src/features/events/detail.js:350-381` contains the `timeInInput` sibling input with all three OI-0115 teardown guards (isConnected, render-time-snapshot identity, store-already-matches) and the in-code comment `// OI-0116/OI-0117: sibling time input`. Writes now go through `setEventStart()` rather than a stored column, because OI-0117 dropped `events.time_in` in migration 028 — the user-visible affordance matches what this OI specified.

**What's wrong:** The Event Detail hero line (`src/features/events/detail.js:300-349`) has an editable `<input type="date">` for `event.date_in` but no sibling input for `event.time_in`. To change the event's start time, the farmer has to open the Paddock Windows list, tap Edit on the earliest window, and change `timeOpened` there — a two-hop path without obvious signposting. Field-testing revealed this during the 2026-04-18 B1/B2 session.

**Fix:** add a `<input type="time">` next to `dateInInput` in the hero's IIFE, with the same three OI-0115 teardown guards (`isConnected`, render-time-snapshot value check, store-already-matches check). Writes to `events.time_in` via the standard `update()` path. Empty-string normalizes to `null` on save.

**CP-55/CP-56 impact:** none. `events.time_in` already in the export/import pipeline.

**Schema change:** none.

**Base doc impact:** at sprint reconciliation, V2_UX_FLOWS.md §17.15 hero-line mockup updates to show "In [date] [time] · Out [date] · $[cost]".

**Acceptance (short form — full list in spec):**
- [ ] Time input renders next to the date input, same styling, same width class
- [ ] Initial value reads from `event.timeIn`; empty when null
- [ ] Change handler writes `{ timeIn: newTime }` via `update()` with all six store-call params
- [ ] Three OI-0115 teardown guards present on the change handler (isConnected, render-time snapshot, store-matches)
- [ ] Empty string normalizes to `null`
- [ ] Unit test: render → change → assert store; phantom change after teardown → assert no write
- [ ] E2E test queries Supabase `events.time_in` after UI edit

**Related:**
- **OI-0115** (shipped, GH-25) — source of the three teardown guards being extended to this new input.
- **OI-0117** (next) — when the derive-from-child refactor lands, this input's write target switches from `events.time_in` to the earliest child window's `time_opened`. No visible change for the user.

---

### OI-0115 — Sub-move Open resets parent `event.date_in` to the sub-move's date (silent data corruption)
**Added:** 2026-04-18 | **Area:** v2-build / events / submove / data-integrity | **Priority:** P0 (silent data corruption during live field testing — every time-based metric on the affected event goes wrong until Tim manually corrects the date)
**Checkpoint:** ship as its own spec-file handoff. Spec: `github/issues/BUG_submove-resets-event-date-in.md`. Small-surface fix once root cause is identified, but root cause is not yet identified — needs investigation-first, fix-second handoff.

**Status:** closed — 2026-04-18, GH-25. Fix in `src/features/events/detail.js:renderSummary` `dateInInput` change handler (three new guards — see root cause).

**What happened (actual root cause after investigation):** The sub-move Save path is indeed a pure INSERT on `event_paddock_windows` — grep confirms zero `update('events', ...)` calls in `submove.js`, and an instrumented jsdom spy on `Store.update` never fires for the `events` entity during the save click. Of the 5 `update('events', ...)` sites in `src/`, only one writes `dateIn` — **`detail.js:307-325` (the Event Detail hero line's `dateInInput` change handler)**. The mutation must therefore arrive via that handler firing with the wrong value. The trigger: `add('eventPaddockWindows', ...)` at submove save fires `notify('eventPaddockWindows')`; `detail.js:135` subscribes and calls `renderSummary(ctx)`, which calls `clear(ctx.sections.summary)` and rebuilds the `dateInInput` from scratch. The OLD input — which is torn down mid-render — can fire a phantom `change` event during its DOM removal in real browsers (iOS Safari in particular, where native date pickers have implicit focus behavior during layout shifts). Pre-fix the handler had no guards — any `change` event with a non-empty value wrote to the store, regardless of whether the input was still connected or whether the value differed from the render-time snapshot. So a phantom change with the browser's picker-default value (today's date — matching the sub-move's `dateOpened`) silently wrote `event.date_in = 2026-04-18`. **The jsdom environment does not model this browser-specific teardown-cascade**, which is why the jsdom repro did not reproduce without an explicitly dispatched synthetic change event; the regression test now dispatches one to prove the fix holds. **Fix:** three guards on the `dateInInput` change handler — (1) `if (!dateInInput.isConnected) return;` — skip if the element was torn down; (2) `if (newDate === renderedDateIn) return;` — reject no-op phantom events that fire with the render-time snapshot value; (3) `if (newDate === evt?.dateIn) return;` — reject when the current store value already matches. All three close different teardown/race windows without blocking legitimate user edits (covered by a test case). Same `isConnected` guard added as belt-and-braces to the adjacent `renderNotes` onBlur handler (detail.js:1189). CLAUDE.md gains a new Known Traps entry ("Phantom change/blur events on teardown-replaced inputs") and an Architecture Audit invariant #6 naming the submove grep contract + the change-handler guard pattern.

**What Tim saw (2026-04-18 live field test):** Active event with main paddock G1, `event.date_in = 2026-04-16`. Tapped Sub-Move on the dashboard card, picked destination G3, left the sheet's "Date opened" at today's default (2026-04-18), tapped Save. Sub-move saved correctly — new `event_paddock_window` for G3 on 2026-04-18 appears. **But the parent event's `date_in` was overwritten from 2026-04-16 → 2026-04-18.** Dashboard card flipped from `Day 3 · In Apr 16` → `Day 1 · In Apr 18`; Event Detail sheet's editable "In" input reads 2026-04-18, confirming this is a real store mutation (not a render bug).

**Why this matters:** `event.date_in` is the anchor for every time-based metric on the event — Day X counter, DMI/NPK/AU-days integrations, pasture-percent mass balance windows, DMI-8 chart x-axis origin, move-wizard close-out semantics. Silent reset means every downstream calc is wrong until manually corrected, and the farmer has no cue the number changed other than the "In" date itself.

**Code-level investigation (Cowork, before handoff):**
- `src/features/events/submove.js` `openSubmoveOpenSheet` Save handler (lines 79–100) only calls `PaddockWindowEntity.create` + `add('eventPaddockWindows', …)` + `createObservation`. No `update('events', …)`. No mutation of `evt.date_in`.
- `createObservation` (`src/features/events/index.js:43-55`) writes a single `paddock_observations` row. No event mutation.
- Generic store `add` has no cross-entity side effects.
- Grep `update\('events'` across `src/`: five callers, none in the sub-move Save path (detail.js dateInInput + notes handlers, reopen-event.js, close.js, move-wizard.js source event close-out).

**Conclusion:** the mutation is happening indirectly — via a subscriber, a re-render cascade firing a phantom input `change`, an input-element side effect on re-mount, or a sync-layer merge. **Claude Code must root-cause before fixing.** Five suspects ranked in the spec file, with Event Detail's `dateInInput` change handler (detail.js:307-325) at the top — if Event Detail is open alongside the dashboard, the `subscribe('eventPaddockWindows', …)` re-render path may be indirectly triggering the `events` subscription + re-mounting the date input.

**Files likely touched by investigation:** `src/features/events/submove.js`, `src/features/events/detail.js`, `src/data/store.js`, `src/data/sync-adapter.js`, `src/ui/dom.js`, `src/features/dashboard/index.js`. Fix likely one-line + regression test; scope expands only if suspect 4 (sync-layer race) is the culprit.

**Acceptance (short form — full list in spec):**
- [ ] Root cause documented in commit message (not "we made it stop")
- [ ] Unit test: seed event with `dateIn = '2026-04-16'`, run sub-move Open Save with destination G3 and `dateOpened = '2026-04-18'`, assert `event.dateIn` unchanged
- [ ] E2E test queries Supabase `events` row directly after save per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI"
- [ ] Grep contract `grep -rn "update('events'" src/features/events/submove.js` returns zero matches; add to pre-commit checks
- [ ] Adjacent-flow smoke test — Advance Strip Save and Sub-move Close Save do not also reset `event.date_in`
- [ ] OPEN_ITEMS.md OI-0115 entry updated with actual root cause before close

**Recovery instruction for Tim (until fix ships):** open Event Detail for the affected event → tap the "In" date input → pick the correct original start date (`2026-04-16` for this event) → tap away to trigger save. Day counter and downstream calcs re-compute on next render. If multiple events affected, each needs manual correction.

**CP-55/CP-56 impact:** none. `events.date_in` is already in the backup pipeline; the fix prevents an incorrect mutation, not a schema change.

**Schema change:** none.

**Base doc impact:** at sprint reconciliation, add a "sub-move Open is a pure INSERT on `event_paddock_windows` — it never mutates the parent event" invariant note to V2_UX_FLOWS.md §12 Sub-moves.

**Related:**
- **OI-0109** (shipped) — promoted Sub-Move to the dashboard card's 3-up quick-action row. Likely what made this bug discoverable; the buried teal link pre-OI-0109 saw less use.
- **OI-0112** (shipped, commit `13a3327`) — migrated sub-move Open's pre-graze to the shared paddock card; touched `submove.js` Save. Worth blame-checking around the `createObservation` call before assuming pre-OI-0112 code is safe.
- **OI-0091 / OI-0095** — window-split architecture. Sub-move Open is architecturally a pure INSERT (new window, no split); if the bug turns out to be a misfiring split helper, the fix extends into the shared helpers and OI-0091/0095 invariants need a regression case too.
- **Known traps:** v1 "mutation functions that forget to notify subscribers = stale UI." This bug is close kin — *mutation functions whose subscribers then mutate other entities = phantom writes.* Worth a CLAUDE.md Known Traps entry once root cause lands.

---

### OI-0114 — Observation boxes (pre-graze / post-graze) field-testing polish: BRC inert on sub-move, top-row baselines misaligned, labels too large, spinners visible, Required pill red instead of amber
**Added:** 2026-04-18 | **Area:** v2-build / observations / ui / polish | **Priority:** P1 (visible regression from canonical mockup in every non-survey observation surface; farmer lost a core feature — bale-ring auto-fill — on the sub-move Open sheet)
**Checkpoint:** ship as its own spec-file handoff. Spec: `github/issues/observation-boxes-polish.md`. Polish pass on OI-0112 — no schema impact, pure CSS + `_shared.js` + sub-move BRC wiring.

**Status:** closed — 2026-04-18, commits `095d76e` (NC-1) + `a9ffbd4` (NC-2 through NC-7), GH-24. **NC-1 (reactive BRC)**: `renderForageStateRow` in `src/features/observations/_shared.js` now carries mutable state and exposes `setPaddockAcres(newAcres)`. The ring-count input listener is always attached; when BRC isn't available it's a no-op. `renderPreGrazeCard` and `renderSurveyCard` re-export the setter. `renderLocationPicker` in `src/features/events/index.js` gains an optional `opts.onSelect(loc)` callback fired after `selection.locationId` is set — purely additive, seven other call sites unchanged. `src/features/events/submove.js` wires the two together: on location pick, convert `loc.areaHectares` → acres and call `preGraze.setPaddockAcres(acres)`. Helper-note text flips from inactive to the active "Ring diameter X ft · paddock Y ac" copy in place; if a ring count was already typed before the pick, cover auto-fills retroactively. **NC-2–NC-7 (shared CSS + rendering polish)**: new rules in `main.css` — `.obs-top-row` (flex-end flex with 88px Height/Cover inputs, 72px Bale Rings input), `.obs-field` / `.obs-field-rings` scoping, `.obs-compact-label` (13px/500/muted with `.label-aux` child at 10px/400), `.obs-compact-input` (cross-browser spinner reset with `::-webkit-outer/inner-spin-button`), focus ring via teal accent, `.input-suffix` + `.input-suffix-label` for the floating unit inside inputs. `.obs-required` amber instead of red. New `withSuffix(input, text)` helper in `_shared.js` wraps Forage Height / Cover / Residual Height inputs; labels strip the `(in)` / `(%)` suffix. Dead `.paddock-card` classname dropped from `pre-graze-card.js`. Survey card inherits all NC-2–NC-5 wins automatically via the shared renderers — desired per Tim's "survey looks fine" scope note. **Tests**: new `tests/unit/submove-brc-reactive.test.js` (6 cases covering the full reactive state machine, including late-bind when a ring count is typed first); 6 new additive cases in `tests/unit/observation-cards.test.js` (top-row structure, input-suffix wrapping, label purity, `.label-aux` sub-label, amber Required pill, no `paddock-card` classname). Suite 1087 → 1099; `vite build` clean. No schema change. Spec file: `github/issues/GH-24_observation-boxes-polish.md`.

**What's wrong (seven non-conformance items):**

1. **NC-1 — Sub-move Open BRC auto-fill is inert.** `src/features/events/submove.js:65–70` passes `paddockAcres: null` because location is picked in the same sheet. In `_shared.js:113` this sets `brcAvailable = false`, so the ring-count input listener is never attached. Typing a ring count does nothing. Root cause fix: make the card reactive to location selection (re-render on pick, or late-bind acres via a `setPaddockAcres()` method on the returned state).
2. **NC-2 — Top row uses equal-width grid, not narrow-input flex row.** `_shared.js:146–149` uses `display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px` inline. Canonical uses `display: flex; gap: 16px; align-items: flex-end` with fixed 88px/72px inputs. Current layout forces baselines to diverge because the Bale Rings cell has a two-line label.
3. **NC-3 — Labels render too large and bold.** `_shared.js` emits `<div class="obs-compact-label">` but the class has no CSS rule, so labels inherit default `<div>` typography. Canonical is 13px / 500 / muted grey. Fix: add `.obs-compact-label` rule in `main.css`.
4. **NC-4 — Native number-spinner arrows visible on Forage Cover (and every number input).** `.obs-compact-input` has no CSS rule, so inputs get the browser's default spinners. Fix: add `.obs-compact-input` with `-webkit-appearance: none` + spinner reset.
5. **NC-5 — Unit suffix baked into label text** ("Forage Height (in)", "Forage Cover (%)", "Residual Height (in)"). Canonical: unit floats inside the input as an absolutely positioned `.input-suffix-label` span. Fix: wrap inputs in `.input-suffix` container; drop unit parens from label strings; add CSS rules.
6. **NC-6 — Required pill is red (`.obs-required` in `main.css:1208`); canonical is amber/warn.** Red reads as error; amber reads as "please fill this in." Fix: change `.obs-required` colors to amber; add `--color-amber-light` / `--color-amber-dark` tokens if missing.
7. **NC-7 — Dead `.paddock-card` className on the pre-graze container** (`pre-graze-card.js:33`) has no CSS rule. Legacy from OI-0100. Remove.

**Scope note — survey is NOT in this pass.** Tim explicitly excluded it ("not survey they look fine"). However, the survey card uses the same `_shared.js` sub-renderers as pre/post-graze, so it will automatically inherit NC-2 through NC-5 improvements — that's desired and doesn't violate the scope exclusion.

**Shared-renderer multiplier:** the same `_shared.js` functions render the fields across six non-survey surfaces (move wizard dest #1, move wizard src #2, close event #3, sub-move open #4, sub-move close #5, event detail pre/post panels #7). Fixing `_shared.js` + `main.css` in one pass fixes every surface. NC-1 is local to `submove.js`.

**Files affected:** `src/features/observations/_shared.js`, `src/features/observations/pre-graze-card.js`, `src/features/observations/post-graze-card.js`, `src/features/events/submove.js`, `src/styles/main.css`, `src/styles/tokens.css` (if amber-light/dark tokens are missing), `tests/unit/features/events/submove.test.js` (new reactive-BRC test), `tests/unit/features/observations/_shared.test.js`.

**Acceptance:** full list in `github/issues/observation-boxes-polish.md`. Summary: side-by-side with `pre-graze-box-mockup.html`, every non-survey observation card is visually indistinguishable from the mockup at the same screen width. `npx vitest run` clean. Manual smoke of all six surfaces.

**CP-55/CP-56 impact:** none — UI/CSS/rendering only.

**Schema change:** none.

**Base doc impact:** UI_SPRINT_SPEC.md § SP-12 Part B (observation boxes) already captures the canonical design target; no spec update needed. At end-of-sprint reconciliation, merge the NC fixes into `V2_UX_FLOWS.md` observation-card sections alongside SP-12.

**Related:**
- **OI-0112** — parent umbrella (Observation Boxes Redesign). This OI is a follow-up polish pass, not a replacement.
- **OI-0100** — original shared paddock-card component (superseded by OI-0112; `paddock-card` className left behind as NC-7).
- **OI-0111** — bale-ring diameter rename (ft → cm). Already landed; NC-1 fix reads `farmSettings.baleRingResidueDiameterCm`.

---

### OI-0111 — Settings UI skips unit conversion: stores whatever number the user typed regardless of unit system (caused silent corruption of Tim's AU weight + residual height defaults 2026-04-18)
**Added:** 2026-04-18 | **Area:** v2-build / settings / units / data-integrity | **Priority:** P0 (silent data corruption — every imperial user hitting Settings can rewrite metric columns with imperial numbers; downstream DMI / threshold / pricing calcs then run on nonsense)
**Checkpoint:** ship as its own spec-file handoff — not bundled. Class-of-bug fix that touches entity + migration + UI + tests + backup-migrations; too much surface area to piggyback on another session brief.

**Status:** closed — 2026-04-18. Shipped in a single commit per Tim's handoff direction. **Migration 027** applied and verified via MCP (`information_schema` confirms only `bale_ring_residue_diameter_cm` exists; default `365.76`; `schema_version` 26 → 27). **Entity rename** (`baleRingResidueDiameterFt` → `Cm`) propagated through `farm-setting.js` (FIELDS + create default 365.76 + to/fromSupabaseShape), `paddock-card.js` (reference + inline cm → ft conversion before invoking BRC-1), `locations/index.js` (bulk survey sheet — same inline conversion pattern), tests (`paddock-card`, `numeric-coercion-tier1`), and spec files. **`renderFarmSection` rewrite:** 13-field descriptor with `measureType` / `inverted` / `currency` / `perDay` / `displayUnit` / `precision` flags, convert on render, reverse-convert on save (full JS float, no rounding per spec §Precision), unit-suffixed labels composed dynamically. i18n keys added: `unit.ft`, `unit.pct`, `unit.days`, `unit.score`, `settings.baleRingDiameter`. `BACKUP_MIGRATIONS[26]` maps old `_ft` rows × 30.48 to `_cm` and stamps `schema_version = 27`. `CURRENT_SCHEMA_VERSION` bumped 26 → 27. **Tests:** new `tests/unit/settings-unit-roundtrip.test.js` (34 cases covering every unit-bearing field — imperial and metric round-trip, full-float storage, null handling, imperial display of metric defaults); new `backup-roundtrip` case for migration-26 rename; `backup-import` chain expectation updated (14 → 27). Full suite 1037/1037 pass. GH-16 closed. Spec file: `github/issues/GH-16_settings-ui-unit-conversion.md`.

**What's wrong:** `src/features/settings/index.js:97–172` (`renderFarmSection`) renders each numeric field as `<input value="{fs[key]}">` and saves via `parseFloat(val)` into the same key — no conversion on render, no conversion on save, and no unit suffix in the label. The field keys `defaultAuWeightKg`, `defaultResidualHeightCm`, `nPricePerKg`, `pPricePerKg`, `kPricePerKg`, `defaultManureRateKgPerDay` are stored metric (per the metric-internal rule in CLAUDE.md Known Traps), but the UI presents and accepts their raw metric values regardless of the user's unit system.

This violates:

- CLAUDE.md Known Traps — *"Unit confusion: always store metric, display converted."*
- CLAUDE.md §"New UI Fields → Supabase Column Rule" — the v2 mirror: column exists, but the UI bypasses the conversion layer, so stored values are silently wrong.

**Confirmed incident (2026-04-18):** Tim opened Settings, saw `454` (kg) and `10` (cm) in fields labeled only "AU Reference Weight" and "Default Residual Height", assumed the numbers were wrong for his imperial operation, and changed them to `1000` and `4`. Farm settings now contain `1000 kg` (~2,200 lbs) for AU weight and `4 cm` (~1.5 in) for residual height. Every DMI, stocking-rate, residual-badge, and threshold calculation reading those fields is operating on bad data. **Immediate recovery: Tim must manually re-enter `454` (AU weight) and `10` (residual height) in Settings before the fix ships.**

**Also in scope — rename `baleRingResidueDiameterFt` to metric storage.** Per Tim's direction this session: the bale-ring field currently stores feet, which violates metric-internal. Migration 027 renames to `bale_ring_residue_diameter_cm`, converts stored values × 30.48, updates default `12.0 → 365.76`. The BRC-1 calc (`src/calcs/survey-bale-ring.js`) stays imperial-native; callers convert cm → ft inline before invoking.

**Precision rule:** the fix must round-trip cleanly — typing `3.0` inches, saving, reopening must show `3.0` again. Store full-precision JS float from `convert()`; round only at display time. Test required per unit-bearing field.

**Fix:**

See the spec file for the full design — field descriptor with `measureType` / `inverted` / `currency` / `perDay` / `displayUnit` flags, render-path conversion, save-path inverse conversion, unit-label composition, migration 027 for the bale-ring rename, BACKUP_MIGRATIONS[26] entry, and round-trip unit test.

**Files affected:**

- `src/features/settings/index.js` — rewrite `renderFarmSection` render + save paths to use the unit-aware descriptor.
- `src/entities/farm-setting.js` — rename bale-ring field everywhere.
- `src/features/observations/paddock-card.js` — update field reference + inline cm → ft conversion for the BRC-1 calc.
- `src/utils/units.js` — optional `convertInverted()` helper (or inline the divide).
- `src/i18n/locales/en.json` — new keys for unit labels + bale-ring label.
- `src/data/backup-migrations.js` — `26` entry for ft → cm rename.
- `supabase/migrations/027_bale_ring_diameter_to_cm.sql` — new, write + run + verify.
- `tests/unit/settings-unit-roundtrip.test.js` — new.
- `tests/unit/paddock-card.test.js` — fixture rename.
- `V2_SCHEMA_DESIGN.md §1.3`, `V2_MIGRATION_PLAN.md §5.3` — rename column in docs.
- `OPEN_ITEMS.md` (OI-0107/OI-0110 acceptance mentions), `UI_SPRINT_SPEC.md`, `GH-12_survey-sheet-v1-parity.md`, `observation-boxes-redesign.md` — find/replace field name in text references.

**Acceptance criteria:**

- [ ] Every unit-bearing field in `renderFarmSection` displays converted to the user's unit system with a unit-suffixed label.
- [ ] Every unit-bearing field converts back to metric on save; metric storage is never rounded or truncated.
- [ ] Round-trip test passes for every field (entered value = displayed value after save + reload, at the field's display precision).
- [ ] `baleRingResidueDiameterFt` renamed to `baleRingResidueDiameterCm` everywhere; migration 027 applied and verified (`information_schema.columns` confirms only `_cm` column exists).
- [ ] BACKUP_MIGRATIONS[26] converts old `_ft` backups to `_cm` on import.
- [ ] Imperial user sees `1000 lbs` / `4 in` as defaults and typing those stores `453.592...` kg / `10.16` cm.
- [ ] Metric user behavior unchanged from today (values shown and stored in metric, now with unit-suffixed labels).
- [ ] `npx vitest run` clean.

**CP-55/CP-56 impact:** **yes** — `farm_settings.bale_ring_residue_diameter_ft` is renamed to `_cm`. CP-55 export picks up the new column automatically via `toSupabaseShape()`. CP-56 import must migrate old backups: `BACKUP_MIGRATIONS[26]` renames the field and multiplies by 30.48. No other column changes. `%`/day fields do not impact backup because their stored values are unchanged.

**Schema change:** yes — migration 027 renames `farm_settings.bale_ring_residue_diameter_ft` to `bale_ring_residue_diameter_cm`, converts stored values × 30.48, sets default 365.76, drops the old column. `schema_version` bumps to 27.

**Related:**
- **OI-0050** — broken store-call param counts in the same settings file (different bug class, same file).
- **OI-0053** — migrations committed but never executed; reinforces the write-+-run-+-verify rule for migration 027 here.
- **OI-0106** — PostgREST numeric coercion sweep; farm-setting numerics were coerced there. Orthogonal to this UI bug (coercion fine; display/save wrong).
- **GH-3** — unit_system migration to operations; confirm settings UI reads the unit system from `operations.unit_system`, not from `user_preferences`.

---

### OI-0113 — Sunset `event_observations` table (migration 029): zero writers after OI-0112 + zero readers after OI-0119; Option A chosen — drop
**Added:** 2026-04-18 | **Area:** v2-build / schema / observations / cleanup | **Priority:** P3 (no user-visible harm; pure hygiene — dead table + entity + backup-pipeline entries still exist)
**Checkpoint:** ready to ship 2026-04-20. Bundle: `session_briefs/SESSION_BRIEF_2026-04-20_oi0113-drop-event-observations.md` (paired with the OI-0059 close-out — zero-code attestation-only).

**Status:** closed — 2026-04-20, commit e677a1c, GH-31. Spec: `github/issues/GH-31_drop-event-observations-table.md`. Migration 029 applied + verified against Supabase (`information_schema.tables` count = 0 post-drop; `SELECT schema_version FROM operations` returns `29`). Pre-drop `SELECT COUNT(*)` confirmed one row (the pre-OI-0112 orphan documented in the spec); CASCADE handled it plus the RLS policies from migration 021 and the `bale_ring_residue_count` column added by migration 022. Code changes: deleted `src/entities/event-observation.js` + `tests/unit/entities/event-observation.test.js`; removed `eventObservations` from `push-all.js` (import + TO_SB_MAP entry), `sync-registry.js` (import + SYNC_REGISTRY entry), `store.js` (ENTITY_TYPES + `captureEventSnapshot`/`restoreEventSnapshot` observation keys), `backup-export.js` (BACKUP_TABLES), `backup-import.js` (FK_ORDER + `CURRENT_SCHEMA_VERSION` bumped 28 → 29); added `BACKUP_MIGRATIONS[28]` rule that discards `b.tables.event_observations` and stamps `b.schema_version = 29`. Retargeted three stale pointer comments in `farm-setting.js:104`, `batch.js:85`, `numeric-coercion-tier1.test.js:14` from the deleted `event-observation.js` to its successor `paddock-observation.js` (identical Tier 1 coercion pattern). Optional historical comments in `dmi-chart-context.js` + `dashboard/index.js` reworded to "dropped in migration 029 (OI-0113)" phrasing. Count-assertion tests in `store.test.js`, `backup-import.test.js`, `backup-roundtrip.test.js` updated for the new table/entity-type counts; v14 fixture left untouched per spec (walks the chain and gets its `event_observations` key dropped at the new 28→29 step). Full unit suite 1162/1162 pass — backup-roundtrip still green walking v14 → v29. OI-0059 verified in the same commit: migration 020 matches live Supabase policies byte-for-byte per the session brief attestation. No user-visible change.

**Migration number correction:** the original OI narrative below documents "migration 028" and `BACKUP_MIGRATIONS[27]`. Actual ship is **migration 029** and `BACKUP_MIGRATIONS[28]` bumping to v29 — because OI-0117 claimed 028 when it shipped. The spec file has the correct numbers throughout; the narrative below is kept for historical context.

**What's wrong:** Migration 021 (`supabase/migrations/021_create_event_observations.sql`) created the `event_observations` table intended as a phase-aware sibling of `paddock_observations` (with `observation_phase = 'pre_graze' | 'post_graze'`). A codebase audit on 2026-04-18 confirmed **zero writers** exist — every observation surface in v2 writes to `paddock_observations` via `type: 'open' | 'close'` and `source: 'event' | 'survey'`. The `event_observations` entity (`src/entities/event-observation.js`), table, columns, and RLS policies are dead weight. Once OI-0112 (Observation Boxes Redesign) ships, this stays true permanently — the spec locks all seven observation surfaces onto `paddock_observations`.

**Why this happened:** OI-0063 (closed) added columns to `event_observations` to align it with `paddock_observations` so either table could serve the observation role. The convergence decision landed the other way (on `paddock_observations`) during the 2026-04-18 design session — `type` + `source` + phase-agnostic `recovery_min_days/max_days` already covered pre-graze, post-graze, and survey shapes without needing a second table.

**Two options:**

**Option A — deprecate + drop (clean cut).** Migration 028: `DROP TABLE event_observations CASCADE;`. Drop the entity file. Drop the table from `BACKUP_TABLES` + `FK_ORDER` in backup-export.js / backup-import.js. Add `BACKUP_MIGRATIONS[27]` entry that discards any `event_observations` rows in older backups (should be empty in practice — no writers ever shipped). Schema_version 27 → 28. V2_SCHEMA_DESIGN.md §5.8 removed. V2_MIGRATION_PLAN.md §5.3 + §5.3a updated.

**Option B — keep frozen (defensive).** Leave the table in schema, entity, and backup pipeline. Add a SQL `REVOKE INSERT ON event_observations FROM ... ` and a CHECK constraint that effectively blocks new rows. Rationale: if we ever want to re-separate observation tables for scale/access reasons, the column inventory is preserved. Cost: every backup carries an empty table forever; every new dev has to ask "what's this for?"

**Recommendation:** Option A. The symmetry argument for keeping the table is weak — `paddock_observations` with `source: 'event'` is semantically identical. Zero writers × zero readers × zero historical rows = no value in preservation.

**Files affected (Option A):**

- `supabase/migrations/028_drop_event_observations.sql` — new; `DROP TABLE event_observations CASCADE;` plus `UPDATE operations SET schema_version = 28;`
- `src/entities/event-observation.js` — delete
- `src/data/backup-export.js` — remove from `BACKUP_TABLES`
- `src/data/backup-import.js` — remove from `FK_ORDER`; bump `CURRENT_SCHEMA_VERSION = 28`
- `src/data/backup-migrations.js` — `27: (b) => { delete b.event_observations; b.schema_version = 28; return b; }`
- `V2_SCHEMA_DESIGN.md §5.8` — remove section
- `V2_MIGRATION_PLAN.md §5.3` / §5.3a — remove table from lists
- `tests/unit/data/backup-roundtrip.test.js` — remove `event_observations` fixture cases
- Grep for any stragglers: `grep -rn "event_observations\|eventObservations\|EventObservation" src/` — should be zero after deletion

**Acceptance criteria (Option A):**

- [ ] Migration 028 applied and verified via `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'event_observations';` returns 0
- [ ] Zero matches for `event_observations` / `eventObservations` / `EventObservation` in `src/` after the commit
- [ ] `schema_version` is 28 after OI-0112 ships (OI-0112 doesn't bump; only this OI does)
- [ ] Backup taken before this OI round-trips cleanly through CP-55/CP-56 with `event_observations` rows discarded (expected empty anyway)
- [ ] `npx vitest run` clean

**CP-55/CP-56 impact:** yes — `event_observations` removed from `BACKUP_TABLES` / `FK_ORDER`; `BACKUP_MIGRATIONS[27]` discards the key for older backups. Low-risk because no real data has ever landed in the table.

**Schema change:** yes — migration 028 drops `event_observations` + RLS policies (CASCADE handles dependencies). Bumps `schema_version` 27 → 28.

**Ordering with OI-0111:** OI-0111 ships migration 027 (bale-ring rename). This OI ships migration 028. Strict ordering: OI-0111 before OI-0112 before OI-0113. If OI-0113 ships before OI-0112, any lingering event_observations writer (theoretical — the audit found none) would start crashing at migration-run time.

**Related:**
- **OI-0063** — shipped the column alignment that made this table redundant. Closed.
- **OI-0087** — added `event_observations` to the backup pipeline. Closed. This OI un-adds it.
- **OI-0089** — V2_SCHEMA_DESIGN.md §5.8 added. Closed. This OI removes that section.
- **OI-0112** — Observation Boxes Redesign. Prerequisite — must ship first. This OI is the tail-end cleanup.

---

### OI-0112 — Observation Boxes Redesign (umbrella): three unified card variants (Pre-Graze / Post-Graze / Survey) migrate all seven observation surfaces onto `paddock_observations`
**Added:** 2026-04-18 | **Area:** v2-build / observations / events / surveys / ui / big-bang | **Priority:** P1 (UX + consistency across seven surfaces; absorbs OI-0107 + OI-0110 and extends both to add post-graze and survey variants)
**Checkpoint:** bundle into `SESSION_BRIEF_2026-04-18_observation-boxes-redesign.md` alongside OI-0108 / OI-0109 / OI-0111 (bale-ring rename runs first). Ship as a single commit so visual rollout is consistent across all seven surfaces.

**Status:** closed — 2026-04-18, commit `13a3327` (GH-19). Big-bang migration shipped in a single commit: three new card components (`renderPreGrazeCard`, `renderPostGrazeCard`, `renderSurveyCard`) replace `renderPaddockCard`, `renderPreGrazeFields`, `renderPostGrazeFields`, and the hand-rolled survey form across all 7 caller surfaces. `src/features/observations/_shared.js` extracts the internal building blocks (forage-state compact row, anchored-label color-graded quality slider, single-select chip picker with deselect-on-reclick, recovery-window row, BRC preview chip, notes textarea). New card files: `pre-graze-card.js`, `post-graze-card.js`, `survey-card.js`. Deleted files: `src/features/events/observation-fields.js`, `src/features/observations/paddock-card.js`. Grep for `renderPreGrazeFields` / `renderPostGrazeFields` / `renderPaddockCard` returns zero matches in `src/` and `tests/` post-migration (verified pre-commit). **Write path:** every caller writes to `paddock_observations` with `source: 'event' | 'survey'` and `type: 'open' | 'close'`; no writes to `event_observations` (OI-0113 retires that table later). **BRC-1 helper:** targets `farmSettings.baleRingResidueDiameterCm` (OI-0111 shipped), converts cm → ft inline before invoking the imperial-native `src/calcs/survey-bale-ring.js`. **Event detail §5/§6 upgrade:** pre-graze and post-graze panels now render editable cards, one per open/closed paddock window respectively (absorbs OI-0107 pre-graze editability; adds post-graze editability as a new capability). Scope carve-out: the read-only observation reads in `renderDmiChart` (lines 378, 421) still pull from `event_observations` since migrating the DMI-8 calc pipeline is a separate follow-up tracked on OI-0113. **Tests:** new `tests/unit/observation-cards.test.js` (26 cases covering contract, BRC auto-fill, chip toggle, validation, hydration, per-variant shape); new `tests/e2e/observation-cards.spec.js` (2 Supabase-verification scenarios per CLAUDE.md §E2E — sub-move Open pre-graze card + individual-mode survey commit both assert `paddock_observations` row shape after save). Old `tests/unit/paddock-card.test.js` removed. **i18n** keys added under `event.`: `surveyObs`, `residualBaleRings`, `forageCoverCalculator`, `recoveryWindow`, `recoveryWindowDays`, `baleRingCoverPreview`, `baleRingHelperDetail`, `relativeForageQuality`. No hardcoded English in card files. Spec file renamed `observation-boxes-redesign.md` → `GH-19_observation-boxes-redesign.md`. GH issue #19 closed. Suite 1049 → 1067 tests pass. Closes OI-0107 (surface #7), OI-0110 (surface #4), OI-0112.

**What's wrong:** The current `renderPaddockCard` (OI-0100) ships a correct field set but a poor layout — tall single-column stack, native select for condition, unlabeled quality slider, two separate recovery fields. Tim's field testing on 2026-04-18 flagged: (a) the move wizard pre-graze UI is "not good," (b) Sub-move Open is missing bale-ring/quality/condition/notes (OI-0110), (c) Event Detail pre-graze is missing the same fields (OI-0107), (d) no surface collects post-graze notes today. The old `renderPreGrazeFields` / `renderPostGrazeFields` helpers in `src/features/events/observation-fields.js` are minimal-height+cover only. The Survey sheet uses a hand-rolled inline form.

**Why a unified redesign (not seven one-offs):** seven surfaces, same content needs, same write path — divergence is the bug. Also: post-graze needs a Notes field that doesn't exist today (no schema change — `paddock_observations.notes` already present and phase-agnostic); Survey needs pre-graze fields **plus** recovery window (readiness forecast), which requires its own dedicated variant shape.

**Three card variants (full contract in spec file):**

- **Pre-Graze Observations** — compact top row (Height · Cover · Residual Bale Rings with inline `≈ XX% cover` preview chip), Relative Forage Quality slider with Poor/Fair/Good/Excellent anchors + color-graded track, Forage Condition chip group (4 chips, single-select with deselect), Notes.
- **Post-Graze Observations** — Residual Height (compact top row), Recovery Window (`Min – Max days`), Notes (new capability).
- **Survey Observations** — Variant A's fields + Recovery Window + Notes (no separate post-graze survey variant; surveys are readiness assessments, both pieces needed together).

Header treatment (all three): title + `Optional` / `Required` pill. Required only renders on Pre-Graze and Survey when `farmSettings.recoveryRequired === true`.

**Write path (all seven surfaces):** `paddock_observations` only. `type: 'open'` for pre-graze and survey; `type: 'close'` for post-graze. `source: 'event'` for event-originated; `source: 'survey'` for survey-originated. Recovery columns (`recovery_min_days/max_days`) are phase-agnostic and already accept values on either `type` row — no schema change needed. Covers both individual survey sheet and bulk survey entry (one card per paddock in bulk mode).

**Seven surfaces migrated in one commit:**

| # | Surface | File | Current | Replace with |
|---|---|---|---|---|
| 1 | Move wizard destination | `src/features/events/move-wizard.js` ~387–399 | `renderPaddockCard` | `renderPreGrazeCard` |
| 2 | Move wizard source | `src/features/events/move-wizard.js` ~350–353 | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 3 | Close Event sheet | `src/features/events/close.js` ~117–120 | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 4 | Sub-move Open sheet (absorbs OI-0110) | `src/features/events/submove.js` ~64–67 | minimal `renderPreGrazeFields` | `renderPreGrazeCard` |
| 5 | Sub-move Close sheet | `src/features/events/submove.js` ~150–182 | `renderPostGrazeFields` | `renderPostGrazeCard` |
| 6 | Survey draft entry (individual + bulk) | `src/features/surveys/index.js` ~297–372 | inline hand-rolled form | `renderSurveyCard` |
| 7 | Event detail pre/post panels (absorbs OI-0107) | `src/features/events/detail.js` around pre/post display blocks | read-only display | editable `renderPreGrazeCard` + `renderPostGrazeCard`, one per paddock window |

**Files affected:**

- **New:** `src/features/observations/pre-graze-card.js`, `post-graze-card.js`, `survey-card.js`, `_shared.js` (sub-renderers for forage-state row, slider, chips, recovery row, notes, BRC helper — internal DRY).
- **Delete after migration:** `src/features/observations/paddock-card.js` (renderPaddockCard becomes dead code — its one caller is migrated to `renderPreGrazeCard`); `src/features/events/observation-fields.js` (renderPreGrazeFields / renderPostGrazeFields become dead code). Verify no remaining imports via grep before deleting.
- **Modified:** all seven caller files in the table above.
- **Tests:** unit tests per card variant + `_shared.js`; caller smoke tests for sub-move, event detail, survey; E2E tests per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI" — fill pre-graze card on a move destination → save → assert `paddock_observations` row has every field; same for sub-move, survey (individual + bulk).

**Acceptance criteria (excerpt — full list in spec file):**

- [ ] All three variants render per mockup with compact top row, anchor-labeled slider, chip condition picker, inline BRC preview chip.
- [ ] BRC-1 auto-fill: typing a ring count with `baleRingResidueDiameter` + `paddockAcres` populates Forage Cover via `src/calcs/survey-bale-ring.js`.
- [ ] Required validation: pre-graze and survey block save if height or cover is empty when `farmSettings.recoveryRequired === true`; post-graze always saves.
- [ ] All seven surfaces render the correct card variant, with the correct write mapping (`type` / `source`).
- [ ] `renderPreGrazeFields` / `renderPostGrazeFields` / `renderPaddockCard` are deleted; no remaining imports (grep clean).
- [ ] `npx vitest run` clean; all user-facing strings use `t()`; no `innerHTML` assignments with dynamic content.

**CP-55/CP-56 impact:** **none.** Pure UI + caller migration. No new Supabase columns. No change to `paddock_observations` shape. Survey rows (pre-graze `type: 'open'` with `recovery_min_days/max_days` populated) are already valid against the existing schema.

**Schema change:** none.

**Dependency on OI-0111 (bale-ring field rename):** OI-0111 ships migration 027 renaming `farm_settings.bale_ring_residue_diameter_ft` → `bale_ring_residue_diameter_cm`. If OI-0111 ships first, this OI reads the new `baleRingResidueDiameterCm` and converts cm → ft inline before invoking the BRC-1 calc (which stays imperial-native). If this OI ships first, it uses the old `baleRingResidueDiameterFt` field and OI-0111 updates the reference when migration 027 lands. Either order works — implementation commit must flag which field name it targets.

**Dependency blocker for OI-0113 (event_observations sunset):** OI-0113 drops the `event_observations` table in migration 028 after confirming zero writers. This OI's design locks "zero writers on `event_observations`" as a hard rule. OI-0113 must ship **after** OI-0112 merges.

**Base doc impact:** GH-10 §5 Pre-graze Observations and §6 Post-graze Observations both need rewording after this ships — §5 describes one card per open paddock window with full field set; §6 parallels for closed windows + adds Notes. GH-12 §Survey Card updated for Recovery row inclusion. V2_UX_FLOWS.md §17.15 (Event Detail) and §Survey flows picked up at sprint reconciliation. UI_SPRINT_SPEC.md **SP-12** captures the revision.

**Related:**
- **OI-0100** — shipped `renderPaddockCard` (the component this spec supersedes). Closed.
- **OI-0107** — Event Detail pre-graze migration. Superseded by this OI (Surface #7 pre-graze panel).
- **OI-0110** — Sub-move Open pre-graze migration. Superseded by this OI (Surface #4).
- **OI-0111** — Settings UI unit conversion + bale-ring rename. Runs first if possible; either ship order works.
- **OI-0113** — Sunset `event_observations` table. Depends on this OI shipping first.
- **GH-10 / SP-2** — Event Detail spec; §5 and §6 underspecified the post-graze editability + Notes. This OI fills the gap.
- **GH-12 / SP-9** — Survey Sheet v1 parity; source of the paddock card design lineage.

---

### OI-0110 — Sub-move Open sheet pre-graze: swap `renderPreGrazeFields` for the shared paddock card (bale-ring helper + forage quality + condition chips missing today)
**Added:** 2026-04-18 | **Area:** v2-build / events / submove / observations / ui | **Priority:** P1 (same-class-of-gap as OI-0107 — Tim hit this during field testing immediately after trying the sub-move flow: no bale-ring helper, no numeric quality slider, no condition chips)
**Checkpoint:** bundle into `SESSION_BRIEF_2026-04-18_observation-boxes-redesign.md` alongside OI-0107 / OI-0108 / OI-0109 / OI-0112 / OI-0113.

**Status:** closed — 2026-04-18, superseded by OI-0112, shipped in commit `13a3327` (GH-19). Sub-move Open now renders the full `renderPreGrazeCard` (surface #4) — fixes the missing bale-ring / quality / condition / notes fields that prompted this OI. Sub-move Close renders `renderPostGrazeCard` (surface #5) in the same commit. Writes go to `paddock_observations`. BRC helper is inactive on sub-move Open because `paddockAcres` isn't known until the farmer picks a location in the same sheet — follow-up PR can re-render the card on location change if field-testing shows the helper is missed; farmer can still enter cover% manually. Spec files renamed: umbrella at `github/issues/GH-19_observation-boxes-redesign.md`.

**Previous status:** open — spec ready for handoff. Spec file: `github/issues/submove-open-pregraze-paddock-card.md` (retained for historical context; do not implement from this file — use the umbrella spec instead).

**What's wrong:** `src/features/events/submove.js:66` calls `renderPreGrazeFields(farmSettings)` — the minimal height + cover-only version from `observation-fields.js:34`. It's missing:

- Bale-ring residue count input
- BRC-1 auto-fill of cover % from bale-ring count + paddock area
- Forage quality (1–100 slider)
- Condition chips (poor / fair / good / excellent)
- Recovery min/max days
- Notes

Tim hit this the moment he tried to log a sub-move after the OI-0100 work shipped. OI-0100 migrated `move-wizard.js` Step 3 pre-graze to the shared `renderPaddockCard` component, but `submove.js` was not migrated in the same commit. This is a straight one-caller follow-up — the same swap OI-0107 is doing for the Event Detail pre-graze.

**Fix:**

Replace the `renderPreGrazeFields(farmSettings)` call with `renderPaddockCard({ saveTo: 'event_observations', farmSettings, paddockAcres, initialValues })`. The sub-move open flow already has the destination `locationId` in hand (that's what the flow is targeting) — read the location's `areaHectares`, convert to acres, and pass as `paddockAcres` so the bale-ring helper surfaces.

```js
// Replace:
const preGraze = renderPreGrazeFields(farmSettings);
// With:
const loc = getById('locations', destinationLocationId);
const paddockAcres = loc ? convert(loc.areaHectares, 'area', 'toImperial') : null;
const preGraze = renderPaddockCard({
  saveTo: 'event_observations',
  farmSettings,
  paddockAcres,
  initialValues: {},  // sub-move opens a new paddock window; no prior observation to pre-fill
});
```

Persistence path is unchanged — the existing `createObservation(operationId, locationId, 'open', paddockWindowId, ...preGraze.getValues())` call (or equivalent in the submove save flow) already writes to `event_observations` with `observation_phase = 'pre_graze'`. The `getValues()` shape matches because `renderPaddockCard` is a superset of `renderPreGrazeFields` (same keys for height + cover, plus the additional fields the minimal version was missing).

**Confirm before implementing:** Grep `submove.js` for every consumer of `preGraze.getValues()` and `preGraze.validate()`. Make sure the saved record carries the new fields through to the `event_observations` write. If a sub-flow discards fields (e.g. destructures only `{ forageHeightCm, forageCoverPct }`), widen the destructure or pass `...preGraze.getValues()` through unchanged.

**Files affected:**

- `src/features/events/submove.js` — line 9 import + line 66 render call + the save path where `preGraze.getValues()` flows into `createObservation`.
- `tests/unit/submove.test.js` (or the nearest existing submove test file) — add: (1) sub-move open sheet renders the full paddock card; (2) bale-ring helper surfaces when farm settings + paddock acres present; (3) saved observation includes the new fields on `event_observations`.

**Acceptance criteria:**

- [ ] Sub-move Open sheet renders all `renderPaddockCard` fields: height, quality slider, cover % (with bale-ring helper when applicable), condition chips, bale-ring residue count, recovery min/max, notes.
- [ ] BRC-1 auto-fill of cover % works when farm settings has `baleRingResidueDiameterCm` and the paddock has `areaHectares`.
- [ ] Saved observation row in `event_observations` carries every field the paddock card collected (`paddockWindowId`, `observationPhase: 'pre_graze'`, and all the new fields).
- [ ] No regression in the existing sub-move flow — date/time, location picker, group selection, etc. behave identically.
- [ ] `renderPreGrazeFields` can stay in `observation-fields.js` for now (event-close post-graze still uses `renderPostGrazeFields` from the same file); deprecating the pre-graze helper is a follow-up.
- [ ] `npx vitest run` clean.

**CP-55/CP-56 impact:** none — schema already aligned (migration 022 + OI-0063). Pure UI integration, identical to OI-0100.

**Schema change:** none.

**Related:**
- **OI-0100** — shipped the shared `renderPaddockCard` and migrated the move wizard. This OI closes the parity gap for the sub-move caller. (A follow-up OI will handle the event-close post-graze path if Tim wants the full card there too.)
- **OI-0107** — same-shape fix for the Event Detail pre-graze. Ship these two together.
- **GH-12 / SP-9** — survey sheet paddock-card spec; source of the shared component's field set.

---

### OI-0109 — Dashboard location card: replace stacked Feed check + Feed buttons with 3-button bottom row (Feed Check · Feed · Sub-Move)
**Added:** 2026-04-18 | **Area:** v2-build / dashboard / ui | **Priority:** P1 (quick-access gap — sub-move today is buried in the card body as a teal text link; farmers asked for a dedicated quick-access button next to Feed Check and Feed)
**Checkpoint:** bundle into `SESSION_BRIEF_2026-04-18_event-detail-quick-access.md` alongside OI-0107 / OI-0108 / OI-0110.

**Status:** closed — 2026-04-18, commit `2db2efc` (GH-18). `buildLocationCard` now renders a single 3-up flex row (Feed Check · Feed · Sub-Move) in place of SP-3 / GH-11's two full-width stacked buttons. Each button `flex: 1`, gap 6px, padding 10px/8px, 13px/600, border-radius 8px — mirrors v1 `.grp-actions`. Sub-Move promoted from buried teal link to primary quick-access button. Standalone `+ Add sub-move` link above SUB-PADDOCKS removed; in-section link **inside** SUB-PADDOCKS preserved per Tim's explicit call. Event Detail Sub-move History untouched. New testid `dashboard-submove-btn-{event.id}`; existing Feed / Feed Check testids preserved. `openSubmoveOpenSheet` import already present. 4-case unit test covers testid presence, flex-row layout, click handler, and standalone-link removal. Reverses SP-3 / GH-11 §13–16 for the bottom-button section only; end-of-sprint reconciliation into V2_UX_FLOWS.md §17.7 per UI_SPRINT_SPEC SP-12 Part A. Spec file renamed `dashboard-card-3-button-bottom-row.md` → `GH-18_dashboard-card-3-button-bottom-row.md`. 1045 → 1049 tests pass. GH issue #18 closed.

**What's wrong:** SP-3 (GH-11) removed v1's two small bottom buttons and replaced them with two large full-width stacked buttons (amber Feed Check + green Feed). After field testing, Tim flagged two issues with that layout:

1. **No quick-access Sub-Move button** — opening a sub-move today requires scrolling into the card body and tapping the `+ Add sub-move` teal link. That's buried when Groups, DMI chart, and sub-paddocks are populated. Sub-move is a primary, frequently-used action during grazing rotation; it should sit next to Feed Check and Feed.
2. **Two large stacked full-width buttons take too much vertical space** — especially on mobile where card height is already the limiting factor for dashboard density.

**Fix (v1 small-button style, 3-up row):**

Replace the two full-width stacked buttons with a single row containing three equal-width buttons (each ~1/3 card width, matching v1's small-button visual style):

| Position | Label | Color | Opens |
|---|---|---|---|
| 1 | Feed Check | amber outline (`#FDF6EA` bg, amber border, `#8B6914` text) | `openFeedCheckSheet(event, operationId)` |
| 2 | Feed | green outline (green bg, white text) | `openDeliverFeedSheet(event, operationId)` |
| 3 | Sub-Move | teal outline (`btn btn-outline` with teal accent) | `openSubmoveOpenSheet(event, operationId)` |

Row layout: `display: flex; gap: 6px;` — each button `flex: 1`, `padding: 10px 8px`, `font-size: 13px`, `font-weight: 600`, border-radius `8px`. Mirror the v1 `.grp-actions` row style already extracted in GH-4 (dashboard group card).

**The `+ Add sub-move` teal text link:**

- On the dashboard card body (above the SUB-PADDOCKS section, rendered when no sub-moves exist) — **remove** (the new Sub-Move button supersedes it for quick-access, and removing it avoids two paths to the same sheet on the same card).
- Inside the **SUB-PADDOCKS section** (rendered only when sub-moves exist) — **keep** (Tim explicitly asked to keep the in-section link; it's the mid-flow "add another sub-move from here" affordance, not a quick-access entry point).
- Inside the **Event Detail sheet** (SP-2 §Sub-move History `+ Add sub-move` button) — **no change** (separate surface, already spec'd, Tim explicitly excluded it).

**Files affected:**

- `src/features/dashboard/index.js` — `buildLocationCard()` around lines 1293–1305 (replace the two large buttons with the 3-up row) and around lines 1130–1140 (remove the standalone `+ Add sub-move` teal link that renders when no sub-moves exist).
- `tests/unit/features/dashboard.test.js` — update the existing large-button assertion; add tests for the three-button row and its click handlers.

**Acceptance criteria:**

- [ ] Dashboard location card renders a single bottom row with three buttons: Feed Check · Feed · Sub-Move, left to right, equal width.
- [ ] Each button uses the small-button style (13px, 10px/8px padding, 1/3 card width via `flex: 1`).
- [ ] Feed Check opens `openFeedCheckSheet(event, operationId)`; Feed opens `openDeliverFeedSheet(event, operationId)`; Sub-Move opens `openSubmoveOpenSheet(event, operationId)`.
- [ ] `+ Add sub-move` teal link above the SUB-PADDOCKS section is removed; the link **inside** the SUB-PADDOCKS section (shown when sub-moves exist) stays unchanged.
- [ ] Event Detail sheet's Sub-move History `+ Add sub-move` button is unchanged (this OI does not touch `src/features/events/detail.js`).
- [ ] Card testid `dashboard-loc-card-{event.id}` still present.
- [ ] New testids: `dashboard-submove-btn-{event.id}` (in addition to existing `dashboard-feed-check-btn-{event.id}` and `dashboard-feed-btn-{event.id}`).
- [ ] Works on mobile (≤ 720px — row wraps to 2+1 only if absolute width < 240px, otherwise stays 3-up) and desktop.
- [ ] `npx vitest run` clean.

**CP-55/CP-56 impact:** none — visual/wiring only, no schema or state-shape change.

**Schema change:** none.

**Base doc impact:** This is a deliberate reversal of SP-3's "only two deltas" decision (UI_SPRINT_SPEC.md line 21, 182–184 and GH-11 §13–16, §The two changes from v1). The end-of-sprint reconciliation pass into V2_UX_FLOWS.md §17.7 must reflect the 3-button row, not the two-large-button design. UI_SPRINT_SPEC.md SP-12 captures this revision.

**Related:**
- **OI-0100** — shared paddock-card component (related via the event-detail quick-access bundle, not this specific card).
- **SP-3 / GH-11** — superseded by this revision for the bottom-button section only; all other SP-3 specs (accent bar, header, summary line, capacity, breakdown, sub-paddocks, groups, DMI chart, DMI/NPK summary) stand.

---

### OI-0108 — Event Detail feed entry display: label says "DMI" but value is dry matter (DM); rename label and guard the silent-zero path when a batch is missing weight or DM%
**Added:** 2026-04-18 | **Area:** v2-build / events / detail view / labels / feed | **Priority:** P1 (terminology bug on a user-facing row; also surfaces a silent-zero bug for bales whose batch is missing weight-per-unit or DM%)
**Checkpoint:** bundle into `SESSION_BRIEF_2026-04-18_event-detail-quick-access.md` alongside OI-0107 / OI-0109 / OI-0110.

**Status:** closed — 2026-04-18, commit `35e6764` (GH-17). Label renamed `DMI` → `DM` in the Event Detail §8 feed-entry row; silent-zero guard shows `— lbs DM` (with tooltip via `event.feedEntryDmMissing`) when batch is missing `weightPerUnitKg` or `dmPct`; metric unit support via `unitLabel('weight', unitSys)` — toggles `lbs DM` / `kg DM`. Pure helper `computeFeedEntryDm(quantity, batch, unitSys)` extracted and exported so the 8-case unit test can exercise both paths without bootstrapping the full detail DOM. **Audit of `openDeliverFeedSheet`** per spec: it reads (doesn't create) `batch.weightPerUnitKg` / `batch.dmPct`. Batch creation lives in `src/features/feed/index.js` Add Batch sheet (~L609–693) where both fields are captured via explicit inputs. The silent-zero is a display-side guard gap, not a capture gap — scope not extended (CLAUDE.md "Fix Root Causes, Not Symptoms"). Spec file renamed `event-detail-feed-entry-dm-label.md` → `GH-17_event-detail-feed-entry-dm-label.md`. 1037 → 1045 tests pass. GH issue #17 closed.

**What's wrong:** `src/features/events/detail.js:942–949` computes a per-entry value as:

```js
const dmiKg = (fe.quantity || 0) * (batch?.weightPerUnitKg ?? 0) * ((batch?.dmPct ?? 0) / 100);
const dmiLbs = dmiKg * KG_TO_LBS;
// …
el('div', {}, [`${Math.round(dmiLbs)} lbs DMI`]),
```

The formula (`quantity × weight_per_unit × DM%`) produces **dry matter delivered** (DM) — the absolute mass of dry matter in the feed entry. Not **dry matter intake** (DMI), which is consumption per head per day (what the dashboard summary line and DMI chart use). Labelling a feed-delivery row "DMI" conflates the two.

Second, on a bale-type batch, if `weightPerUnitKg` or `dmPct` is null/zero, the result is `0 lbs DMI` — silently. Tim saw this during field testing on a real bale delivery: the row displayed `0 lbs DMI` instead of the ~850 lbs DM that two 500-lb bales at 85% DM should produce. The zero is indistinguishable from "no data captured yet" vs. "batch is missing parameters" vs. "entry has zero quantity." Users can't tell whether to fix the batch, the entry, or ignore the zero.

**Fix (three parts):**

### Part A — Rename the label

In `src/features/events/detail.js:949`, change the display from `{N} lbs DMI` to `{N} lbs DM`. Rename the local vars `dmiKg` / `dmiLbs` to `dmKg` / `dmLbs` for readability (they were never DMI). Add an i18n key `event.feedEntryDm` with English string `"{n} {unit} DM"` so units and localisation round-trip cleanly.

### Part B — Missing-parameter guard (no silent zero)

Show `—` instead of `0 lbs DM` when the computation can't produce a real number. A zero is legitimate only when `quantity === 0`; everywhere else (batch missing weight, missing DM%, or both) the correct display is the em-dash:

```js
const weightKg = batch?.weightPerUnitKg;
const dmPct = batch?.dmPct;
const canCompute = weightKg != null && weightKg > 0 && dmPct != null && dmPct > 0;
const dmKg = canCompute ? (fe.quantity || 0) * weightKg * (dmPct / 100) : null;
const dmLbs = dmKg != null ? dmKg * KG_TO_LBS : null;
const dmDisplay = dmLbs != null ? `${Math.round(dmLbs)} lbs DM` : '— lbs DM';
```

Add `title` attribute (tooltip) on the em-dash case: `"Batch is missing weight-per-unit or DM %. Edit the batch in Feed to populate."` (new i18n key `event.feedEntryDmMissing`). This is the v1-trap class: a blank state that's actionable by the user, not a silent zero that looks like data.

### Part C — Metric unit support

The hardcoded `KG_TO_LBS` conversion is imperial-only. Follow the pattern already used in the Event Summary hero line (§2 of GH-10) — read `operation.unitSystem` and display `lbs DM` (imperial) or `kg DM` (metric) via `unitLabel('mass', unitSys)`.

**Files affected:**

- `src/features/events/detail.js` lines 942–949 (+ variable renames; add unit switch)
- `src/i18n/locales/en.json` — add `event.feedEntryDm` and `event.feedEntryDmMissing`
- `tests/unit/features/events/detail.test.js` — add: (1) renders `N lbs DM` for a batch with weight+DM populated, (2) renders `— lbs DM` when weight is null, (3) renders `— lbs DM` when DM% is null, (4) renders `0 lbs DM` only when `quantity === 0` and batch parameters are valid, (5) renders `kg DM` under metric unit system.

**Verify the bale-parameter entry flow (no code change expected — audit only):**

During implementation, confirm that the Deliver Feed sheet (`openDeliverFeedSheet`) captures `weightPerUnitKg` and `dmPct` on the batch it creates. If the sheet assumes a shared bale weight/DM without per-batch storage, that's a separate OI. Flag findings in the commit message; do not silently extend scope. Per CLAUDE.md "Fix Root Causes, Not Symptoms", if the audit finds the sheet does NOT populate these fields, stop and add a follow-up OI rather than patching both surfaces in one commit.

**Acceptance criteria:**

- [ ] Feed-entry row in Event Detail shows `{N} lbs DM` (not `DMI`), rounded to whole lbs.
- [ ] Label reads `kg DM` under metric unit system.
- [ ] Row shows `— lbs DM` when batch is missing `weightPerUnitKg` or `dmPct` (not `0 lbs DMI`).
- [ ] Row still shows `0 lbs DM` when entry `quantity === 0` and batch parameters are populated (legitimate zero).
- [ ] Tooltip on the em-dash case present (text via i18n key).
- [ ] Local variables renamed `dmKg` / `dmLbs` (not `dmiKg` / `dmiLbs`).
- [ ] New i18n keys added to `en.json`.
- [ ] 5 new unit tests pass; existing detail tests unchanged in behavior.

**CP-55/CP-56 impact:** none — rendering and label only, no schema or state-shape change.

**Schema change:** none.

**Related:**
- **OI-0106** (numeric coercion sweep) — `batch.weightPerUnitKg` and `batch.dmPct` are on the Tier 1 list. This OI's "missing parameter" path will work correctly after OI-0106 ships (coerced numbers compare correctly against `> 0`). If OI-0106 ships first, this OI is purely label + em-dash; if this OI ships first, the em-dash path is belt-and-braces for un-coerced numerics too (since `null > 0` is `false`, and the explicit `Number()` check handles stringified values safely).
- **GH-10** (Event Detail spec) — §8 Feed Entries currently says "amount + unit, date, cost" and doesn't name the DMI/DM label. No spec change needed; this OI implements the per-entry display that was left underspecified.

---

### OI-0107 — Event Detail pre-graze: swap the inline fields for the shared paddock card, one card per open paddock window (enables bale-ring helper + full survey-card fields)
**Added:** 2026-04-18 | **Area:** v2-build / events / detail view / observations / ui | **Priority:** P1 (gap vs v1 + vs OI-0100 — Tim wants the same paddock assessment fields on event detail that the move wizard pre-graze now has; bale-ring helper is the primary UX win that's missing here)
**Checkpoint:** bundle into `SESSION_BRIEF_2026-04-18_observation-boxes-redesign.md` alongside OI-0108 / OI-0109 / OI-0110 / OI-0112 / OI-0113.

**Status:** closed — 2026-04-18, superseded by OI-0112, shipped in commit `13a3327` (GH-19). Event Detail §5 Pre-graze and §6 Post-graze each now render editable cards — one per open paddock window for pre-graze, one per closed paddock window for post-graze. Writes route through `PaddockObsEntity` → `paddock_observations` with `source: 'event'` and `type: 'open' | 'close'`. BRC-1 helper active on pre-graze when `farmSettings.baleRingResidueDiameterCm` is set and the paddock has `areaHa`. Save button on each card writes or updates the matching row (keyed by `sourceId === pw.id`, with a fallback to most-recent for pre-OI-0112 rows). Spec files renamed: umbrella at `github/issues/GH-19_observation-boxes-redesign.md`.

**Previous status:** open — spec ready for handoff. Spec file: `github/issues/event-detail-pregraze-paddock-card.md` (retained for historical context; do not implement from this file — use the umbrella spec instead).

**What's wrong:** Event Detail §5 Pre-graze Observations (`src/features/events/detail.js:554–705` `renderPreGraze`) is today a single event-wide card with four inline fields: forage height, forage cover % (with slider), forage quality, condition chips. It does NOT include:

- **Bale-ring residue count** (field name `baleRingResidueCount`, already a column on `event_observations` via migration 022)
- **BRC-1 auto-fill of cover %** from the bale-ring count × ring diameter × paddock area (registered calc `src/calcs/survey-bale-ring.js`)
- **Recovery min/max days** (already captured on `event_observations`)
- **Notes** (already captured)

OI-0100 (closed 2026-04-18, commit `8ff3572`) shipped the reusable `renderPaddockCard` component at `src/features/observations/paddock-card.js` with the contract `{ saveTo, farmSettings, paddockAcres, initialValues } → { container, getValues, validate }`. The move wizard Step 3 already uses it. Event Detail is the last pre-graze surface still using a shallower inline implementation.

Tim's exact phrasing during field testing: *"Use survey card but write observations to event observations table"* — i.e., the same full-featured card as the survey sheet, persisted to `event_observations` not `paddock_observations`. That's exactly the component OI-0100 shipped.

**Fix (swap the inline implementation for the shared card; one card per open paddock window):**

Replace the event-level `renderPreGraze` with a per-paddock render loop. One card per open paddock window, because:

1. BRC-1 needs `paddockAcres` to compute. An event-level card cannot supply a single `paddockAcres` when the event has multiple open sub-paddocks.
2. The schema already keys observations by `paddock_window_id` (migration 021) — one observation per paddock per phase is the correct data shape.
3. Aligns with Paddocks §4 in GH-10 (also one card per paddock window).

**Render loop (rough shape):**

```js
function renderPreGraze(ctx) {
  const el2 = ctx.sections.preGraze;
  clear(el2);
  const event = getById('events', ctx.eventId);
  if (!event) return;

  const farmSettings = getAll('farmSettings').find(fs => fs.farmId === ctx.farmId) || null;
  const openWindows = getAll('eventPaddockWindows')
    .filter(pw => pw.eventId === ctx.eventId && !pw.dateClosed);

  for (const pw of openWindows) {
    const loc = getById('locations', pw.locationId);
    const paddockAcres = loc?.areaHectares != null
      ? convert(loc.areaHectares, 'area', 'toImperial')  // hectares → acres
      : null;

    // Latest pre-graze observation for THIS paddock window
    const obs = getAll('eventObservations')
      .filter(o =>
        o.eventId === ctx.eventId &&
        (o.paddockWindowId === pw.id || (!o.paddockWindowId && openWindows.length === 1)) &&
        (o.observationPhase === 'pre_graze' || !o.observationPhase),
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))[0];

    const card = renderPaddockCard({
      saveTo: 'event_observations',
      farmSettings,
      paddockAcres,
      initialValues: obs || {},
    });

    // Auto-save-on-blur adapter — one call per field, identical to existing Notes pattern
    // On first save for this paddock: add(); subsequent: update(); paddockWindowId: pw.id,
    // observationPhase: 'pre_graze'. See spec file for full wiring.

    el2.appendChild(card.container);
  }
}
```

**Save semantics:**

- Auto-save-on-blur, one field at a time — same pattern as the existing pre-graze card and the Notes section (GH-10 §11). No explicit Save button on the card in detail view.
- If no observation exists for a paddock yet, first blur on any field creates the observation via `add('eventObservations', ...)` with `paddockWindowId: pw.id`, `observationPhase: 'pre_graze'`. Subsequent blurs `update()`.
- **Back-compat read rule (observations written before migration 022 / OI-0063):** include `(o.paddockWindowId === pw.id || (!o.paddockWindowId && openWindows.length === 1))` — a null `paddockWindowId` is attributed to the sole paddock only when there's exactly one. Matches the §4 Paddocks fallback in GH-10.

**`renderPaddockCard` needs an auto-save adapter — it was built for commit-on-Next:**

The shared card was built for move-wizard Step 3 (single-commit-on-Next pattern). Event Detail wants blur-level auto-save. Two paths:

**Path A (recommended) — thin adapter in `detail.js`:** Wrap the card's `container` with blur listeners that call `getValues()` per-field and route the delta to `update()` / `add()`. Leaves the shared component unchanged. Adapter pattern already in use for the existing inline fields (see the `showSaved()` and `saveField()` helpers in `renderPreGraze` today — reuse those exact helpers with the widened field set).

**Path B — extend `renderPaddockCard`:** Add an `onFieldBlur` callback so callers can hook per-field saves without a wrapper. More invasive; touches the move-wizard consumer too. Defer to a follow-up unless Path A proves painful.

Default to Path A for this OI.

**Read-only when event is closed:** Same rule as today's `renderPreGraze` — `disabled = !isActive`. `renderPaddockCard` doesn't have a `disabled` prop today; add one in this OI (small change to the shared component, benefits every caller), OR disable inputs by walking `card.container.querySelectorAll('input, select, textarea, button')` in the adapter. Either is acceptable; the adapter approach is smaller.

**Files affected:**

- `src/features/events/detail.js` — replace `renderPreGraze` body with the per-paddock loop above; import `renderPaddockCard` from `../observations/paddock-card.js`.
- `src/features/observations/paddock-card.js` — optional: add a `disabled` prop for the closed-event read-only case.
- `tests/unit/features/events/detail.test.js` — update existing pre-graze tests:
  - Renders one card per open paddock window.
  - Bale-ring helper surfaces when `farmSettings.baleRingResidueDiameterCm` and `paddockAcres` are both present.
  - Entering a bale-ring count auto-fills the cover % via BRC-1.
  - Save-on-blur creates an observation row scoped to the correct `paddockWindowId`.
  - Subsequent blur updates, not inserts (one row per paddock × phase).
  - Closed event → card disabled.

**Acceptance criteria:**

- [ ] Event Detail §5 renders one `renderPaddockCard`-based card per open paddock window.
- [ ] Each card includes: forage height, forage quality slider (1–100), forage cover % with slider AND bale-ring helper, forage condition, bale-ring residue count, recovery min/max, notes.
- [ ] Bale-ring helper auto-fills cover when `farmSettings.baleRingResidueDiameterCm` and `paddockAcres` are populated; hidden otherwise.
- [ ] Save-on-blur writes to `event_observations` with correct `paddockWindowId` + `observationPhase: 'pre_graze'`.
- [ ] Observations written before migration 022 (null `paddockWindowId`) still render correctly when there's exactly one open paddock on the event.
- [ ] Closed events render the card read-only (inputs disabled).
- [ ] `npx vitest run` clean; updated tests pass; no regression in move-wizard or survey-sheet consumers of `renderPaddockCard`.

**CP-55/CP-56 impact:** none — schema already in place (migration 022 added `bale_ring_residue_count` to `event_observations`; OI-0063 alignment earlier). All fields round-trip through the existing `event-observation` entity. Pure UI integration.

**Schema change:** none.

**Base doc impact:** GH-10 §5 Pre-graze Observations currently describes four inline fields at event-level. After this OI ships, §5 should read "one card per open paddock window, each rendering the shared paddock card (same as move wizard Step 3 and survey draft entry)." Reconciliation into V2_UX_FLOWS.md §17.15 at sprint end picks this up; UI_SPRINT_SPEC.md SP-12 tracks the revision.

**Related:**
- **OI-0100** — shipped the shared `renderPaddockCard`. This OI is one of the last consumer migrations.
- **OI-0110** — same-shape migration for the sub-move Open sheet's pre-graze. Ship together.
- **OI-0063** / **migration 022** — schema alignment that made `event_observations.bale_ring_residue_count` exist. Closed.
- **OI-0068** — pre-graze inline editable fields per v4 mockup. This OI extends that inline-field pattern to the full survey card.
- **GH-10 / SP-2** — Event Detail spec. §5 underspecified the full field set; this OI is the operational spec for what ships in §5.
- **GH-12 / SP-9** — Survey sheet v1 parity; source of the paddock card design.

---

### OI-0106 — Sweep: coerce PostgREST stringified numerics across every entity (class-of-bug fix after OI-0103 hotfix)
**Added:** 2026-04-18 | **Area:** v2-build / data / entities / sync / calcs | **Priority:** P0 (class-of-bug — latent silent math/validate/render failures across the whole app on any pulled-from-Supabase record with a `numeric` column)
**Checkpoint:** standalone Claude Code session — full-codebase sweep, one commit (or one commit per priority tier if Claude Code prefers)

**Status:** closed — 2026-04-18 — Tier 1 `43d46b2`, Tier 2 `33c6add`, Tier 3 `caada42`. All 25 entities coerced across ~153 numeric/integer fields. 31 new round-trip + integration tests added (suite 969 → 1002). CLAUDE.md Known Traps updated. CP-56 audit confirmed the insert → `pullAllRemote` path routes every row through the coerced `fromSupabaseShape` — no import-side defensive wraps needed. GH-15 closed. Spec: `github/issues/GH-15_numeric-coercion-sweep.md`.

**What's wrong:** PostgREST returns PostgreSQL `numeric`/`decimal` columns as JavaScript **strings** (arbitrary-precision safety), not numbers. Pure integer types (`int4`, `int8` under the safe-integer ceiling) come back as numbers; everything else is a string. Every `fromSupabaseShape(row)` in `src/entities/` that passes `row.some_numeric_column` through untouched writes that string into in-memory state. Downstream code then:

1. **Silently corrupts math** via string concatenation — `total += entry.quantity` becomes `"0" + "1" + "2"` = `"012"`, not `3`. (This was the secondary bug in OI-0103 after the field-name fix — group totals in the feed-check sheet were concatenating instead of summing.)
2. **Crashes render** at format time — `stringValue.toFixed(1)` throws `TypeError` with no recovery. (The `.toFixed(1)` call in the feed-check sheet threw before Save was clickable, which is why the entity-field-name fix alone didn't resolve OI-0103.)
3. **Silent entity `validate()` rejection** — entities with strict `typeof record.quantity !== 'number'` checks reject records that round-tripped through Supabase. `add()`/`update()` throw, click handlers crash silently, sheet stays open, data never persists. Nothing in the console because `validate()` errors are returned as `{ valid: false, errors }` objects, not thrown.
4. **Lex comparisons on thresholds** — `value > threshold` with string `value` is lexicographic, not numeric. Dashboard threshold badges (AUD target/warn, rotation target/warn, NPK warn, cost-per-day) compare strings, not numbers. Badges may render red when they should be green, or vice versa. Hard to notice because the colour still renders.
5. **Backup/restore round-trip** — in-memory state had strings until the hotfix; any backup JSON Tim downloaded this week may contain stringified numerics. CP-56 import currently does not coerce; after the sweep, CP-56 still should run pulled records through `fromSupabaseShape` (which it does via `pullAllRemote`), but backup JSON restored via the file-upload path skips that. Sweep must include a guard.

**Where it came from:** OI-0103 was a two-layer bug. Layer 1 was the `checkDate:` vs `date:` entity-field-name typo, fixed in `38925be`. Layer 2 — surfaced only when Tim's real Supabase data flowed through the sheet — was this stringified-numeric issue. Fixed in `d55ba9b` for three surfaces (`event-feed-entry`, `event-feed-check-item`, `feed/check.js` sum). Every other numeric column in every other entity is still un-coerced.

**Scope (authoritative entity list — 24 entities, 94 numeric fields):**

Already coerced (reference pattern — no work, keep aligned):
- `event-observation.js` — 8 numeric/integer fields (fully coerced)
- `event-feed-entry.js` — `quantity` (coerced via hotfix)
- `event-feed-check-item.js` — `remainingQuantity` (coerced via hotfix)
- `farm-setting.js` — `baleRingResidueDiameterFt` only (1 of 17 — rest still un-coerced)

**Tier 1 (P0 — actively broken on live-data pull; dashboard, feed, DMI paths):**

| Entity | Numeric fields | Downstream impact |
|---|---|---|
| `batch.js` | `quantity`, `remaining`, `weightPerUnitKg`, `dmPct`, `costPerUnit` | Feed-check sheet (group total, `.toFixed` in delivery list), DMI calc, cost-per-day badge, dashboard AUD. `validate()` uses `typeof !== 'number'` on `quantity` and `remaining` → silent reject. |
| `event-group-window.js` | `headCount` (int), `avgWeightKg` | DMI (`headCount × avgWeightKg × dmiPct`), dashboard AU-days, threshold badges. `validate()` uses strict `typeof` on both. |
| `animal-weight-record.js` | `weightKg` | Rolls up into group-window `avgWeightKg` — compound effect. |
| `farm-setting.js` (remaining 16 cols) | `defaultAuWeightKg`, `defaultResidualHeightCm`, `defaultUtilizationPct`, `nPricePerKg`, `pPricePerKg`, `kPricePerKg`, `defaultManureRateKgPerDay`, `forageQualityScaleMin`/`Max`, 5× threshold cols, `thresholdNpkWarnPerHa`, `thresholdCostPerDayTarget`/`Warn` | Every dashboard threshold read; NPK pricing; DMI defaults when a batch is missing a value. Threshold lex comparisons are the worst quiet bug here. |
| `location.js` | `areaHectares`, `capturePercent` | Divides into AUD, stocking rate, every AUD/ha rollup. Division-by-string returns `NaN` silently. |
| `animal-class.js` | `defaultWeightKg`, `dmiPct`, `dmiPctLactating`, `excretionNRate`, `excretionPRate`, `excretionKRate` | DMI calc core inputs; NPK excretion rates. |

**Tier 2 (P1 — manifest in specific reports/flows):**

| Entity | Numeric fields |
|---|---|
| `event-paddock-window.js` | `areaPct` (strip-graze proportional band on dashboard + rotation calendar) |
| `paddock-observation.js` | `forageHeightCm`, `forageCoverPct`, `forageQuality` (int), `residualHeightCm` |
| `survey-draft-entry.js` | same four + `baleRingResidueCount`, `recoveryMinDays`/`Max` (ints) |
| `forage-type.js` | `dmPct`, `nPerTonneDm`, `pPerTonneDm`, `kPerTonneDm`, `dmKgPerCmPerHa`, `minResidualHeightCm`, `utilizationPct` |
| `feed-type.js` | `dmPct`, `nPct`, `pPct`, `kPct`, `defaultWeightKg` |
| `batch-nutritional-profile.js` | 12 `*Pct` columns + `rfv` |
| `harvest-event-field.js` | `quantity`, `weightPerUnitKg`, `dmPct` — `validate()` strict typeof on `quantity` |
| `animal-bcs-score.js` | `score` — strict `typeof` in validate |
| `batch-adjustment.js` | `previousQty`, `newQty`, `delta` — all three have strict `typeof` validate |

**Tier 3 (P2 — reports/nutrient math, less likely to crash):**

| Entity | Numeric fields |
|---|---|
| `soil-test.js` | 18 nutrient + chemistry cols |
| `manure-batch.js` | 14 nutrient + `estimatedVolumeKg` |
| `manure-batch-transaction.js` | `volumeKg` |
| `input-product.js` | 13 `*Pct` + `costPerUnit` |
| `amendment.js` | `totalQty`, `costOverride` |
| `amendment-location.js` | `qty`, 12 `*Kg` cols, `areaHa` |
| `npk-price-history.js` | `nPricePerKg`, `pPricePerKg`, `kPricePerKg` |
| `spreader.js` | `capacityKg` |
| `animal-treatment.js` | `doseAmount` |
| `farm.js` | `latitude`, `longitude`, `areaHectares` |

**Fix pattern (apply uniformly — match `event-observation.js`):**

```js
// In fromSupabaseShape(row) — for every field whose FIELDS entry has type 'numeric' or 'integer':
someField: row.some_column != null ? Number(row.some_column) : null,
```

One line per column, null-safe. Default to `null` (not `0`) when the column is null so `validate()` still catches "required" failures correctly. If the existing `create()` default is `0` or a number, keep that unchanged — coercion happens only on the inbound pull path.

**Defense-in-depth at critical math hotspots (already partially applied in `feed/check.js`):** where a feature file sums or divides a column that feeds a user-facing value, wrap the read with `Number(x) || 0`. Not a replacement for the entity fix — a belt-and-braces guard for future entity drift. Candidates:

- `src/features/dashboard/index.js` — AU-days, cost-per-day, threshold comparisons
- `src/features/feed/index.js` — feed totals, days-on-hand
- `src/features/reports/index.js` — DMI chart, trend aggregates
- `src/calcs/window-helpers.js`, `core.js`, `feed-forage.js` — calc chain inputs

Scope-limit the defensive wraps to aggregation sites that already have a history of silent errors; don't blanket-wrap every multiplication. The entity fix is the structural solution; the defensive wraps are insurance.

**Test pattern (round-trip + mergeRemote):**

One round-trip test per entity with a numeric column. Pattern:

```js
test('fromSupabaseShape coerces stringified numerics', () => {
  const row = {
    // every numeric/integer column as a stringified value (what PostgREST returns):
    quantity: '42.5',
    head_count: '10',
    // ...
  };
  const record = fromSupabaseShape(row);
  expect(typeof record.quantity).toBe('number');
  expect(record.quantity).toBe(42.5);
  // ...
});
```

Plus at least one integration test driving the pull path (`mergeRemote(entityType, [row])` then read back from store, verify downstream math). The hotfix added this pattern for the feed-check save path — mirror it for at least one entity per tier.

**CP-55/CP-56 impact:** none on the backup-JSON wire format, but the post-import in-memory state *does* change. Specifically:

- **CP-55 (export):** reads raw PostgREST rows via `supabase.from(table).select('*')` and writes them straight into `tables[tableName]` (`src/data/backup-export.js:188`). PostgREST returns `numeric` columns as strings, so **every backup JSON — past, present, and post-OI-0106 — contains stringified numerics** for every `numeric` column. OI-0106 is a pull-side coercion fix; it does **not** change what CP-55 writes. Backup JSON byte format is unchanged. Both "export before OI-0106" and "export after OI-0106" produce identical JSON for the same Supabase data.
- **CP-56 (import):** inserts the JSON rows into Supabase (PostgreSQL accepts stringified numerics for `numeric` columns and stores them as numbers — silent cast, not a bug), then at `backup-import.js:402` calls `pullAllRemote()` which routes every record through `fromSupabaseShape`. **Before OI-0106:** the re-pulled in-memory state has stringified numerics for every un-coerced entity — same trap as a normal Supabase pull. **After OI-0106:** the re-pulled in-memory state is guaranteed numeric for every entity. So the sweep *fixes* the end-state of an import; it does not break anything that was working.
- **`BACKUP_MIGRATIONS` chain (`src/data/backup-migrations.js`):** migrations 014 → 026 are all structural (add table, add column, enum rewrite) — none do arithmetic on numeric fields, so they are unaffected by the string-vs-number distinction. No chain updates needed.
- **`tests/unit/backup-roundtrip.test.js`:** already modified in the working tree for OI-0099 Class B4. Claude Code should re-verify the assertion shape after OI-0106 lands — if it does deep-equal across `export → import → in-memory snapshot`, some fields will flip from string to number on the post-import side and the assertion may need to normalize (or, better, assert `typeof === 'number'` as a positive signal that the coercion is working). Add a fixture case with a pre-hotfix-era backup (stringified numerics in the JSON) and prove round-trip still lands as numbers in memory.

**Spec-sync rule (CLAUDE.md "Export/Import Spec Sync Rule"):** OI-0106 does not change the backup payload wire format, the column list, or the schema_version — so by the letter of the rule it does not require a CP-55/CP-56 spec update. Flagged here anyway for traceability so a future dev reading the round-trip tests doesn't wonder why the assertion style shifted.

**Schema change:** none.

**Acceptance criteria:**

- [ ] Every entity in the Scope table above: every numeric/integer field in `FIELDS` has a `Number(row.col) != null ? Number(row.col) : null` pattern in `fromSupabaseShape`. No exceptions — defensive wrapping even where the column is theoretically `int4` (cheap insurance against future type changes).
- [ ] One unit round-trip test per entity in Tier 1 + Tier 2 (at minimum), proving stringified inputs come out as `typeof 'number'` on every field.
- [ ] One integration test exercising the `mergeRemote` path for a Tier 1 entity (pick `batch.js` — it's the one Tim just got burned by) — seed with stringified row, call `mergeRemote`, read store, verify downstream sum is a number.
- [ ] Defensive `Number(x) || 0` wraps added to the aggregation hotspots listed above (dashboard, reports, calcs) — scope-limited to sum/divide/compare-to-threshold sites.
- [ ] CP-56 file-upload import path audited: either the re-pull after insert coerces (in which case confirm with a test), or add explicit coercion.
- [ ] 961 tests pass before the sweep; ≥970 pass after (rough floor — should be ~1000 with the new round-trip tests).
- [ ] Commit message notes this is the structural follow-up to OI-0103's `d55ba9b` hotfix, class-of-bug label "PostgREST-stringified-numeric".
- [ ] Update CLAUDE.md "Known Traps" with a new entry: *"PostgREST returns `numeric` as strings — every entity's `fromSupabaseShape` must coerce via `Number(...)`. Pattern in `event-observation.js`."*

**Critical issues the sweep must look at (prioritised by class-of-harm, not tier):**

1. **`typeof === 'number'` validators** (silent rejects) — `batch.js`, `batch-adjustment.js`, `event-group-window.js`, `event-feed-entry.js`, `event-feed-check-item.js`, `harvest-event-field.js`, `animal-bcs-score.js`. These are the silent-drop class. After the sweep, these should pass; add a regression test for each that round-trips a stringified value through `validate()`.
2. **`.toFixed()` call sites** (hard crashes) — `feed/check.js`, `move-wizard.js`, `paddock-card.js`, `locations/index.js`, `dashboard/index.js`, `edit-group-window.js`, `detail.js`, `feed-forage.js` (calc), `reports/index.js`, `feed-entry-inline-form.js`, `field-mode/index.js`, `harvest/index.js`, `feed/index.js`, `feed/delivery.js`, `dmi-chart.js`, `observation-fields.js`, `amendments/entry.js`, `rotation-calendar/sidebar.js`, `amendments/reference-tables.js`, `amendments/manure.js`, `utils/units.js`. After the entity fix, these are safe; add targeted render tests for the highest-traffic ones (`dashboard`, `feed/check`, `detail`) to catch regressions.
3. **Threshold lex comparisons** (quiet wrongness) — `farm-setting.js` thresholds flow into `dashboard/index.js` badge logic. A threshold read as `"50"` and a value read as `"100"` satisfies `value > threshold` lexicographically (`"100" > "50"` is `false` lex). Dashboard badges may render wrong. Test: seed Supabase-shaped `farm_settings` with stringified thresholds, render the dashboard, assert the badge colour matches the numeric comparison.
4. **Divide-by-string → NaN** (silent zeroes/blanks) — `areaHectares` in `location.js`, `quantity`/`weightPerUnitKg` in `batch.js` feed per-unit math. Division cascades NaN through every downstream calc. Test: stringified area, run AUD/ha calc, assert finite number.
5. **Chart axis / aggregation** (visual anomalies) — `dmi-chart.js`, `reports/index.js`, `rotation-calendar/sidebar.js`. If an axis range is built from `d3.extent(records, r => r.quantity)` with string quantities, lex sort picks the wrong extent. Spot-check each chart after the fix with a visual or snapshot test.
6. **Calc-registry inputs** — `registerCalc()` formulas in `src/calcs/*.js` read directly from entity-shaped records. After the entity fix they're safe. No calc-registry change needed; audit by grep to confirm no calc uses `parseFloat`/`parseInt` today (which would mask the issue).

**Files likely affected:**

- `src/entities/*.js` — 24 files (Tier 1–3 above)
- `src/features/dashboard/index.js`, `src/features/reports/index.js`, `src/features/feed/index.js` — defensive wraps at aggregation sites
- `src/calcs/window-helpers.js`, `src/calcs/core.js`, `src/calcs/feed-forage.js` — confirm no implicit string coercion in chains; add Tier 1 integration test
- `src/data/backup-import.js` — confirm re-pull coerces; possibly add explicit coercion for file-upload path
- `tests/unit/entities-*.test.js` (new) — one round-trip test per Tier 1+2 entity
- `tests/unit/merge-remote-numeric-coercion.test.js` (new) — integration test for `batch.js` pull path
- `CLAUDE.md` — Known Traps entry

**Related:**
- **OI-0103** — the feed-check save bug whose surface fix exposed the class-of-bug behind it. Closed. This OI is the structural follow-up.
- **OI-0050** — prior silent-sync class of bug (missing sync params). Same family: silent data loss, invisible to user. Worth flagging the pattern in the CLAUDE.md Known Traps entry.
- **CLAUDE.md "E2E Testing — Verify Supabase, Not Just UI"** — same family of invisible-until-real-data-flows bug. The integration test requirement above enforces this rule for the pull path (not just the push path it was originally written for).

---

### OI-0105 — Destination location picker needs an anchored search bar
**Added:** 2026-04-18 | **Area:** v2-build / events / move-wizard / ui | **Priority:** P2 (usability — farms with many paddocks can't scan to the right one quickly)
**Checkpoint:** bundle with OI-0100 / OI-0101 / OI-0103 / OI-0104 into a single field-testing-roadblock session brief

**Status:** closed — 2026-04-18. Shipped as commit `8c71cb8`. Sticky search input at the top of `renderLocationPicker` filters the three sections (Ready / In Use / Confinement) by case-insensitive substring match on `loc.name`. Sections with zero matches collapse (header skipped). × clear button restores the full list. Query persists across internal re-renders via `container.dataset.locationSearchQuery` with focus + caret preserved. Applies to both callers (move-wizard Step 2, new-event dialog). New i18n keys `event.locationPicker.search` + `event.locationPicker.noMatches`. 946 tests pass (5 new).

**What's wrong:** Tim hit this testing the move wizard on his farm data. Step 2 of the move wizard renders `renderLocationPicker` (`src/features/events/index.js:641`) as a flat list grouped into *Ready / In use / Confinement* sections. With many paddocks, the list scrolls and the farmer can't jump to a specific name. There is no search, no filter, no alphabetical anchor.

**Fix — anchored search bar at the top of the picker:**

1. Add a text input at the very top of the picker container, **sticky/anchored** so it stays visible while the list below it scrolls: `position: sticky; top: 0` inside the scroll container, with a white background and a subtle bottom border so it doesn't bleed into the list.
2. On keystroke, filter each section's `locs` array by `loc.name` (case-insensitive `includes`). Sections with zero matches collapse away (don't render the empty section header).
3. `placeholder`: `t('event.locationPicker.search')` → "Search paddocks".
4. Clear-button (small `×` inside the input right edge) clears the filter and restores the full list.
5. Applies to **every** caller of `renderLocationPicker` — move wizard Step 2, new-event dialog (`features/events/index.js:575`), and any future caller. Single component change = consistent behavior everywhere.

**Files likely affected:**
- `src/features/events/index.js` — add search-bar render at top of `renderLocationPicker`; filter logic
- `src/styles/main.css` — `.loc-picker-search` rule (sticky positioning)
- `src/i18n/locales/en.json` — `event.locationPicker.search` key
- `tests/unit/events-location-picker.test.js` (new or extend) — typing into search filters the list; clearing restores it; empty sections don't render

**Acceptance criteria:**

- [ ] Search input renders at top of `renderLocationPicker` container, sticky on scroll
- [ ] Typing filters each section by `loc.name` case-insensitively
- [ ] Empty sections collapse (no orphan section headers)
- [ ] Clear-button restores the full list
- [ ] Used in move wizard Step 2 AND new-event location picker — same behavior both places
- [ ] Keyboard focus lands in the search input when the picker first renders (accessibility + fast entry)

**CP-55/CP-56 impact:** none (UI-only, no schema change).
**Schema change:** none.

**Related:**
- **OI-0102** (multi-paddock selection — DESIGN REQUIRED) — shares the same component; if multi-pick lands later, the search bar naturally filters across selectable items.

---

### OI-0104 — Move wizard feed transfer: per-line "Leave as residual" vs "Move to new paddock" + relocate under post-graze observations
**Added:** 2026-04-18 | **Area:** v2-build / events / move-wizard / feed / fertility | **Priority:** P1 (current wizard has no residual option — unconsumed feed either gets moved forward or hard-zeroed by `remainingQuantity: 0`, losing the fertility signal the farmer expects)
**Checkpoint:** bundle with OI-0100 / OI-0101 / OI-0103 / OI-0105 into a single field-testing-roadblock session brief. **Residual-to-ledger persistence is OI-0092's scope** — this OI ships the UI + wiring; if OI-0092 isn't ready by implementation time, the "residual" choice stores to a temporary column/table slot per OI-0092's stub spec and flips to the real deposit path in the OI-0092 PR.

**Status:** closed — 2026-04-18. Shipped as commit `1a22923`. 2-way radio (Move to new paddock / Leave as residual) replaces the per-line checkbox; Feed Transfer section moved under Close (appended to closeSection between post-graze observation and the Open destination section). Per-line `executeMoveWizard` branch: Move lines stamp `remainingQuantity = 0` + write destination `event_feed_entries` row; Residual lines stamp real `remainingQuantity = group.total` and emit `logger.info('residual-capture', ...)` + no destination row; mixed per-line handled. **Sequencing note:** OI-0092 is still a stub (no schema), so the residual arm uses a logger-only placeholder for the fertility-ledger write — a follow-up PR will flip this to the real ledger write when OI-0092 ships its schema. The OI-0091 placeholder comment at the former `move-wizard.js:480-481` has been replaced by the real per-line branch. New i18n keys `event.feedTransferMoveLabel`, `event.feedTransferResidualLabel`, `event.feedTransferResidualCaption`. 959 tests pass (5 new unit + 1 e2e verifying Supabase round-trip per CLAUDE.md rule).

**What's wrong (reproduced during Tim's farm testing):** Move wizard Step 3 renders a *Feed transfer* section with one checkbox per `batchId × locationId` line on the source event. Checked = create a matching delivery entry on the destination event (current behavior, `move-wizard.js:591–607`). Unchecked = the line just... vanishes, because the close-reading feed check stamps `remainingQuantity: 0` (line 487) which tells every downstream calc "the pasture was emptied." The farmer has no way to say *"I left 30 lbs on the pasture — it should count as residual feed for fertility, not as consumed."* v1 had this via `calcResidualOM()` + `feed_residual` NPK source (see GTHY_V1_FEATURE_AUDIT.md line 479 / 932 / 1218). v2 dropped it entirely — OI-0092 captures the gap, but without a UI there's no way for the farmer to signal residual intent at move time.

Secondary problem: the Feed transfer section renders **below** the whole close section (post-graze obs + destination open section), which is the wrong mental ordering. Residual feed is a *post-graze observation of the paddock being closed* — the farmer just walked it, saw what was left, and now decides where it goes. It should sit **directly under the post-graze observations of the paddock being closed**, before the destination section.

**Design (ratified with Tim, 2026-04-18):**

Per-line **2-way radio**, replacing the current single checkbox:

```
Batch #7 Hay → North Pasture — remaining: 30 lbs
  ( ) Move to new paddock      (default on active move)
  ( ) Leave as residual        (records to fertility ledger)
```

- **Default** = *Move to new paddock* (preserves today's default-checked behavior for farmers who aren't fussing with residuals).
- **Cross-farm moves** or cases where destination is an existing event in a different paddock: default stays *Move*.
- **Leave as residual**: writes the remaining quantity to the residual-deposit path (OI-0092 — `event_feed_residual_deposits` table or `event_feed_entries.residual_qty` column per OI-0092's schema-shape decision). The close-reading feed check's `remainingQuantity` on that line gets stamped to the actual remaining amount (not the hardcoded 0) so DMI math on the closed event reflects reality.
- **Move to new paddock**: unchanged behavior — create matching `event_feed_entries` row on destination with `source_event_id = sourceEvent.id`, `quantity = total remaining`. Close-reading check stamps `remainingQuantity: 0` for that line (because it was moved, not left).

**Placement in Step 3 (reordered):**

```
Close [Source Paddock Name]
  - Date out / Time out
  - Post-graze observation card (OI-0100 shared Survey card)
  - FEED TRANSFER (this OI — moved up from below)
    - Per batch × location line with 2-way radio

Open [Destination Paddock Name]   (only if destType === 'new')
  - Date in / Time in (prefilled from dateOut/timeOut per OI-0101)
  - Pre-graze observation card (OI-0100 shared Survey card)
```

**Amount handling:** the farmer does not enter a per-line amount. The amount that transfers (or becomes residual) is the **close-reading remaining** for that `batch × location` line — i.e., the total delivered on that line on this event minus everything consumed per prior feed checks. This is already computed for `transferToggles[].total` at `move-wizard.js:374–375`; the same value feeds either path. Future tightening (allow the farmer to correct the remaining with an inline number input on each line before committing) is a later follow-up — not this OI.

**Writes on confirm (per selected line, all in the same transaction as the rest of the wizard save):**

| Line choice | Close-reading `remainingQuantity` for line | Residual deposit | Destination delivery |
|---|---|---|---|
| Move to new paddock | `0` (existing behavior) | none | one `event_feed_entries` row on dest, `source_event_id = src.id`, `quantity = line.total` |
| Leave as residual | `line.total` (the amount left) | OI-0092 path — deposit row(s) in fertility ledger with NPK contribution | none |

**Files likely affected:**
- `src/features/events/move-wizard.js` — replace checkbox render (lines 384–398) with radio-per-line; reorder Step 3 so Feed transfer sits between the close section and the open section; update `executeMoveWizard` write logic to branch on each line's choice
- `src/entities/event-feed-residual-deposit.js` (new, per OI-0092 design) or `event-feed-entry.js` extension — depending on OI-0092 schema shape decision
- `supabase/migrations/NNN_*.sql` — per OI-0092 (not this OI's direct scope, but sequencing: if OI-0092 migration not yet applied, this OI's "Leave as residual" arm records to a placeholder and a follow-up PR flips it)
- `src/calcs/*` — NPK-R per OI-0092 (not this OI)
- `src/i18n/locales/en.json` — keys: `event.feedTransfer.move`, `event.feedTransfer.residual`, `event.feedTransfer.residualCaption` ("Records to fertility ledger")
- `tests/unit/move-wizard.test.js` — new cases for per-line radio: default is move, selecting residual writes the residual path, mixed (some move + some residual) handled correctly
- `tests/e2e/move-wizard-residual.spec.js` (new) — farmer path: close Shenk, leave 30 lbs hay on north as residual, verify NPK ledger entry on destination paddock's fertility page (pending OI-0092 UI)

**Acceptance criteria:**

- [ ] Feed transfer section relocates to between the close section and the open section in Step 3
- [ ] Each feed line shows a 2-way radio (Move / Residual), default = Move
- [ ] Selecting Residual writes via OI-0092 path (or stub path if OI-0092 still in flight; see coordination note above) AND stamps real `remainingQuantity` on the close-reading check for that line
- [ ] Selecting Move preserves current behavior — matching delivery row on destination, close-reading `remainingQuantity = 0`
- [ ] A single move can mix choices per line (e.g., 2 of 3 lines move, 1 stays as residual)
- [ ] Unit tests cover all three combinations (all move / all residual / mixed)
- [ ] Commit message notes coordination with OI-0092 so reviewer knows whether this ships with OI-0092's ledger writes or as a transitional stub

**CP-55/CP-56 impact:** **yes, inherited from OI-0092** — if OI-0092 adds `event_feed_residual_deposits` table or `event_feed_entries.residual_qty` column, CP-55 must serialize it and CP-56 must handle old backups missing the field. Flagged here explicitly so whoever picks this up doesn't forget — this is the v2 equivalent of the "UI field without Supabase column" trap, but with a known shape waiting in OI-0092.

**Schema change:** none in this OI directly; sequences with OI-0092's schema addition.

**Related:**
- **OI-0092** — residual feed NPK deposits. This OI is the UI + wiring for OI-0092's farmer-facing capture step. OI-0092 owns the schema shape, the calc, the ledger deposit format. If OI-0092 ships first, this OI's "Leave as residual" arm writes the real deposit; if this ships first, the residual arm writes to a placeholder column with a TODO comment pointing at OI-0092.
- **OI-0091** — the move-wizard close loop OI-0091 reworked is the integration surface. OI-0091 deliberately left `remainingQuantity: 0` in place because residual capture was OI-0092's scope. This OI is the first touch of that line since OI-0091 shipped.
- **GTHY_V1_FEATURE_AUDIT.md lines 479 / 932 / 1218** — v1 parity reference: `calcResidualOM`, `feed_residual` NPK source, `event_feed_residual_checks` table.
- **UI_SPRINT_SPEC.md §8a Move Feed Out** — different capability (pull feed out of an active event to inventory or another event). Residual and move-feed-out are complementary, not overlapping: move-feed-out is mid-event; this OI is at close/move time.

---

### OI-0103 — Feed check save button silently fails (entity field name mismatch: `checkDate` vs `date`)
**Added:** 2026-04-18 | **Area:** v2-build / feed / bugs | **Priority:** P0 (blocks field testing — farmers can't record any feed check through the primary sheet)
**Checkpoint:** bundle with OI-0100 / OI-0101 / OI-0104 / OI-0105 into a single field-testing-roadblock session brief; can ship in isolation if urgent

**Status:** closed — 2026-04-18. Shipped as commit `38925be` (field-name fix) + hotfix commit `d55ba9b` (PostgREST-stringified-numeric coercion — surfaced only against live Supabase data, not against the test suite which seeded via `add() + FeedEntryEntity.create({ quantity: 10 })` with plain numbers). `src/features/feed/check.js:262` now passes `date:` (matching the entity FIELDS key) instead of `checkDate:`. Two read sites in the same file (`allChecks.sort` and the "Last check" info line) were also falling through to `createdAt` because the column never populated — fixed to read `date` first. Siblings (move-wizard.js:466, close.js:185) already used the correct key. v1-trap class captured in commit message: UI captured data, silent drop on entity validate, invisible to user.

**Hotfix (`d55ba9b`):** after field-name fix landed, Tim hit a second layer — the sheet's `.toFixed(1)` throws `TypeError` on live pull and `group.totalDelivered += e.quantity` string-concatenates instead of summing, because PostgREST returns `numeric` columns as JavaScript strings. Fixed at three layers: `event-feed-entry.js.fromSupabaseShape` coerces `quantity` via `Number(...)`; `event-feed-check-item.js.fromSupabaseShape` coerces `remainingQuantity`; `feed/check.js` sum uses `Number(e.quantity) || 0` as belt-and-braces. New integration test `tests/unit/feed-check-save-integration.test.js` drives the full `openFeedCheckSheet → click Save → Supabase-sync-push` path covering both plain-number and Supabase-string-via-mergeRemote inputs. 961 tests pass.

**Follow-up opened:** **OI-0106** — full-codebase sweep of the same class-of-bug. Every entity with a `numeric` column in its `sbColumn` type feeds into math, `.toFixed`, `typeof` validation, or threshold comparison and is still vulnerable. OI-0103's hotfix was scope-limited to the feed-check save path because that was what blocked Tim; the structural sweep is OI-0106.

**What's wrong:** Tim hit this during farm testing — the Save button in the feed check sheet (`src/features/feed/check.js`) does nothing visible, and no check row lands in Supabase or localStorage. Root cause: the save handler (lines 259–263) calls `FeedCheckEntity.create` with `checkDate: dateInput.value`, but the entity (`src/entities/event-feed-check.js` line 7) declares the field as `date: { required: true, sbColumn: 'date' }`. The entity's `validate()` sees `date` missing (because only `checkDate` was passed) and rejects. The `add()` call throws before `queueWrite` fires. The sheet closes quietly — no error toast, no visual signal.

This is a pure field-name typo. `move-wizard.js` (line 466) and `close.js` both call the same entity with the correct `date:` key, confirming the entity is right and `check.js` is the outlier.

**Fix (three lines, one file):**

```js
// src/features/feed/check.js line 262 — change:
checkDate: dateInput.value, time: timeInput.value || null,

// to:
date: dateInput.value, time: timeInput.value || null,
```

Grep `checkDate` across `src/features/feed/check.js` for any other instance of the same typo before shipping.

**Why this went undetected:** exactly the class of bug CLAUDE.md's "E2E Testing — Verify Supabase, Not Just UI" rule was written to prevent. The existing test coverage (if any) probably asserted UI state (sheet closes, button clicks) without asserting `event_feed_checks` row count in the DB.

**Files likely affected:**
- `src/features/feed/check.js` — one-character rename per the snippet above (also audit for any `checkDate` references in the surrounding code — it should be none, but confirm)
- `tests/unit/feed-check-save.test.js` (new or extend) — mock `add()`; assert `FeedCheckEntity.create` is called with a `date` key populated from `dateInput.value`
- `tests/e2e/feed-check-save.spec.js` (new or extend) — open feed check sheet → enter a value → save → assert a row exists in `event_feed_checks` in Supabase (not just that the sheet closed)

**Acceptance criteria:**

- [ ] `checkDate` → `date` in `src/features/feed/check.js`
- [ ] Unit test covers the entity create call signature
- [ ] E2E test asserts the Supabase row exists after save (per CLAUDE.md §E2E Testing rule)
- [ ] Manual verification: on Tim's farm data, save a feed check → row appears in Supabase `event_feed_checks`
- [ ] Commit notes that this is a v1-trap-class bug — UI captured data, silent drop on validate, invisible to the user

**CP-55/CP-56 impact:** none.
**Schema change:** none.

**Related:**
- **OI-0050** — prior instance of the same class of bug (missing sync params in onboarding/settings calls). Same root cause: silent entity rejection with no user-visible error. Consider whether a blanket toast-on-entity-validation-error is a worthwhile follow-up (separate OI if so).

---

### OI-0102 — Multi-paddock selection in pasture picker (DESIGN REQUIRED, do not build)
**Added:** 2026-04-18 | **Area:** v2-build / locations / picker / ux | **Priority:** P3 (QoL — farmers who run multi-paddock / strip groups currently have to create events paddock-by-paddock or rely on strip-graze which isn't the same thing)
**Checkpoint:** design session required before implementation; explicitly deferred

**Status:** open — **DESIGN REQUIRED, do not build.** Captured here so it doesn't get lost while the five field-testing roadblocks are being spec'd.

**What Tim asked:** Explore allowing multi-paddock selection in the pasture picker so a farmer can put one animal group onto two or more paddocks at once, without using strip-graze. Today's picker (`renderLocationPicker` in `src/features/events/index.js:641`) is single-select (`selection.locationId`).

**Why this is a design problem, not a UI toggle:**

An event today is keyed on one paddock window at creation (though `event_paddock_windows` is already a table — v2 can in principle model multi-paddock events because it's a 1-to-many). Multi-pick implies several design decisions:

1. **Event model implications.** Does multi-pick create one event with multiple paddock windows (true multi-paddock event — matches what Tim described), or one event per paddock (parallel events sharing a group)? Probably the former (schema already supports it) but answer needs to be explicit.
2. **Strip-graze relationship.** Strip-graze today is "one paddock subdivided into strips." Multi-paddock is "one group on several whole paddocks." Are they mutually exclusive on an event, additive (some strips + some whole paddocks), or config-level twins? Needs a call.
3. **Move flow downstream.** When the farmer moves off a multi-paddock event, are all the paddocks closed together? One at a time? Partial moves (close paddock A, keep group on B)?
4. **Feed / observation attribution.** Today feed entries are `batchId × locationId` — multi-paddock events mean feed can target any of N locations. Observations (pre/post-graze) are keyed on a `paddock_window_id`, so each paddock needs its own observation card in the close flow. UI implications.
5. **DMI / pasture capacity math.** DMI-5 and pasture-capacity forecasts use paddock area. Multi-paddock event = sum of areas across selected paddocks. Already computable with existing schema, but needs a sanity-check across all calcs.
6. **Picker UX.** Checkboxes next to each location instead of click-to-select? Confirm button at the bottom of the picker? How does "In use" (paddock already occupied by another event) interact with multi-pick — gray out or allow (for shared grazing scenarios)?

**Questions to answer before building:**

1. One multi-paddock event or parallel events? (Strong lean: one event, multiple `event_paddock_windows` rows.)
2. Can multi-paddock coexist with strip-graze on the same event?
3. Partial-close behavior on moves: all-at-once or per-paddock?
4. Picker UX: checkbox-per-row + sticky Confirm button? (Ties to OI-0105's sticky-search — same component would also host the sticky Confirm.)
5. Feed / observation attribution: per-paddock cards or aggregate?
6. Downstream calc surfaces that assume a single paddock — grep sweep and enumerate before building.

**Files likely affected (once design locks):**

- `src/features/events/index.js` — `renderLocationPicker` multi-mode; `openCreateEventDialog` to accept an array of location IDs
- `src/features/events/move-wizard.js` — Step 2 to accept multiple destinations
- `src/data/store.js` — event-open helper creates multiple PWs at once
- Observation / feed / calc surfaces — audit pass

**CP-55/CP-56 impact:** probably none (multi-paddock is already representable with today's `event_paddock_windows` table). Confirm once design locks.

**Schema change:** probably none. Confirm once design locks.

**Related:**

- **OI-0105** (anchored search bar) — shares the same picker component; multi-pick should layer cleanly on top of the search bar.
- **v1 behavior** — v1 had multi-paddock grazing via "multiple paddocks" toggle on event create; see GTHY_V1_FEATURE_AUDIT.md (search "multi-paddock" / "multiple paddocks") when design session starts. V1 parity is the likely answer for most of the questions above.

---

### OI-0101 — Move wizard: pre-populate destination open date/time from source close date/time
**Added:** 2026-04-18 | **Area:** v2-build / events / move-wizard / ux | **Priority:** P2 (usability — farmer has to re-enter the same values they just entered; leading cause of accidental date mismatches between close and open)
**Checkpoint:** bundle with OI-0100 / OI-0103 / OI-0104 / OI-0105 into a single field-testing-roadblock session brief

**Status:** closed — 2026-04-18. Shipped as commit `373f276`. Step 3 state carries `dateInTouched` / `timeInTouched` flags (default false). `dateOut` / `timeOut` input listeners cascade into `dateIn` / `timeIn` while the corresponding Touched flag is false. First keystroke on `dateIn` / `timeIn` flips the flag and stops further cascading. Rule is strictly one-way (close → open). Five unit tests cover: cascade works, cascade stops after touch, dateIn + timeIn independent, no reverse propagation. 941 tests pass.

**What's wrong:** Move wizard Step 3 (`src/features/events/move-wizard.js`) has two independent date/time pairs: *Close source* (`dateOut` / `timeOut`, lines 312–324) and *Open destination* (`dateIn` / `timeIn`, lines 340–352). Both default to `todayStr` / `''` at wizard open (lines 59–64). When the farmer sets `dateOut = 2026-04-17` because the move actually happened yesterday, `dateIn` is still today — the destination event opens one day after the source closes, which is rarely what the farmer means.

**Fix:**

1. When `dateOut` input changes, mirror the value to `dateIn` (but only if the user hasn't manually edited `dateIn` already — track a `dateInTouched` flag, set `true` on first manual keystroke in `dateIn`).
2. Same for `timeOut` → `timeIn`, with the same "don't overwrite after manual edit" guard.
3. Mirror direction is **close → open only.** Changing `dateIn` doesn't affect `dateOut`. This prevents a user who wants to backdate the open (rare but legal) from accidentally rewriting the close.
4. On initial render, since `dateOut` and `dateIn` both start as `todayStr`, no mirror is needed — they already match. Mirror kicks in only on user edits.

**Why the "don't overwrite after manual edit" guard matters:** there are legitimate cases where the farmer wants open and close to differ — e.g., closed Shenk paddock at 6 PM, moved animals overnight in a holding pen, opened North Pasture at 7 AM the next day. Without the guard, typing in `dateIn` then changing `dateOut` would silently destroy the user's `dateIn` input. Two-way-sync-with-user-editability is a well-known UX pattern; one-way sync with manual-override-respect is the lighter-weight version and matches what Tim asked for.

**Files likely affected:**
- `src/features/events/move-wizard.js` — add `dateInTouched` / `timeInTouched` flags; attach `input` listeners on `dateOut` / `timeOut` that mirror into `dateIn` / `timeIn` unless flags are set; attach listeners on `dateIn` / `timeIn` that flip flags on first keystroke
- `tests/unit/move-wizard.test.js` — cover: (a) changing dateOut mirrors to dateIn, (b) after manual dateIn edit, further dateOut changes don't overwrite, (c) same for time

**Acceptance criteria:**

- [ ] Changing `dateOut` updates `dateIn` to the same value (only if user hasn't touched `dateIn` yet)
- [ ] Changing `timeOut` updates `timeIn` similarly
- [ ] After the user types in `dateIn` (even once), further edits to `dateOut` don't touch `dateIn`
- [ ] Opposite direction (changing `dateIn` / `timeIn`) never affects the close values
- [ ] Unit tests cover the three behaviors above

**CP-55/CP-56 impact:** none (client-side UX only).
**Schema change:** none.

**Related:**
- **OI-0091** (window split on state change) — move-wizard date/time values drive `closePaddockWindow` / `closeGroupWindow` timing. Correct prefill reduces user error in the most common case (close = open = same instant).
- **OI-0100** (pre-graze Survey card embed) — ships in the same wizard step; sequencing: OI-0101 is a 10-line change, no dependency on OI-0100.

---

### OI-0100 — Embed Survey paddock card as the pre-graze observation UI on move wizard + event close (includes slider for forage cover % and bale-ring helper)
**Added:** 2026-04-18 | **Area:** v2-build / events / observations / ui | **Priority:** P1 (gap vs v1 — pre-graze obs today only capture height + cover%; farmers are asking for full pasture assessment at event open, and the bale-ring helper is a major UX win for cover% estimation)
**Checkpoint:** bundle with OI-0101 / OI-0103 / OI-0104 / OI-0105 into a single field-testing-roadblock session brief. **Depends on GH-12** (Survey sheet v1 parity) shipping the paddock card as a reusable component; if GH-12 is still in flight, coordinate so the card lands once and both surfaces pick it up.

**Status:** closed — 2026-04-18. Shipped as commit `8ff3572`. GH-12 status at session start: shipped, but the paddock card UI was inline in `src/features/surveys/index.js` rather than a standalone module — so the bundle took the "build-shared" branch. New `src/features/observations/paddock-card.js` exports `renderPaddockCard({ saveTo, farmSettings, paddockAcres, initialValues })` with the same `{ container, getValues, validate }` contract as `renderPreGrazeFields`. Fields: forage height (unit-converted display), forage quality slider (1-100), forage cover % with BRC-1 bale-ring helper (auto-fills cover when `farmSettings.baleRingResidueDiameterFt` + `paddockAcres` are supplied), forage condition (poor/fair/good/excellent — matches `paddock_observations` and `survey_draft_entries`; `event_observations` uses a divergent set — preexisting doc-drift tracked separately), bale-ring residue count, recovery min/max days, notes. Move wizard Step 3 pre-graze now renders the shared card instead of the minimal `renderPreGrazeFields`; values flow through the existing `createObservation` call. Survey sheet NOT migrated this commit — follow-up PR can adopt the shared module. 954 tests pass (8 new covering contract, getValues, BRC auto-fill, validate required, initialValues pre-fill).

**What's wrong:** Pre-graze observation fields today (`src/features/events/observation-fields.js` `renderPreGrazeFields`) capture only `forageHeightCm` + `forageCoverPct` as plain number inputs. The Survey sheet (GH-12, `UI_SPRINT_SPEC.md` SP section for surveys) has a much richer *paddock card*: rating slider, veg height, forage cover with bale-ring helper, forage condition dropdown, recovery window. Tim wants pre-graze to use the **same component** so a pre-graze observation captures the same assessment a survey would, eliminating the v2-is-less-than-v1 gap Tim hit during farm testing.

**Critical design note — two tables, aligned fields:**

Pre-graze observations write to **`event_observations`** (via `createObservation()` in `move-wizard.js:498`, keyed on `paddock_window_id`). Surveys write to **`paddock_observations`** (keyed on `location_id` directly). These are **different tables** and remain different — they represent different things (observation tied to an event vs standalone pasture survey). However, per OI-0063 schema alignment and migration 022, `event_observations` has the same columns as `paddock_observations`: `forage_condition`, `bale_ring_residue_count`, `forage_height_cm`, `forage_cover_pct`, recovery fields, etc. So the paddock-card **UI component** can be reused — its submit callback just routes to the right table depending on caller.

**Design:**

1. **Extract the paddock card from GH-12's survey implementation** into a reusable renderer, e.g., `src/features/observations/paddock-card.js`, exporting `renderPaddockCard({ saveTo: 'event_observations' | 'paddock_observations', initialValues, onValuesChange })`. Returns `{ container, getValues(), validate() }` — same shape as today's `renderPreGrazeFields`.
2. **Pre-graze surface (move wizard + event close flows)** — replace `renderPreGrazeFields` call with `renderPaddockCard({ saveTo: 'event_observations', ... })`. The wizard's existing `createObservation(operationId, locationId, 'open', paddockWindowId, ...getValues())` call already writes to `event_observations` with `observation_phase = 'pre_graze'`; no change there.
3. **Survey surface** — unchanged shape; GH-12's paddock card IS the source. Pass `saveTo: 'paddock_observations'`.
4. **Post-graze (`renderPostGrazeFields`)** — out of scope for this OI. Keep today's behavior. If we decide later to use the same card for post-graze (flipping to `observation_phase = 'post_graze'`), that's a follow-up.
5. **Forage cover % slider.** Item 2 of Tim's roadblock list asks for the cover-% input to be a slider bar (UI_SPRINT_SPEC.md line 125 documents "narrow slider (~240px max width) with percentage readout"). This is already part of the GH-12 paddock card — embedding the card gets us the slider automatically.
6. **Bale-ring helper.** Already part of GH-12 per UI_SPRINT_SPEC.md line 618 — "Bale-ring residue helper — farm setting (diameter default 12 ft) + registered calc `survey.baleRingCover` + auto-fill forage cover." Same deal — embedding the card gets us the helper.

**Fallbacks (if GH-12 paddock card not yet shipped as extractable component):**

Option A — **Block this OI on GH-12 landing first.** Cleanest; zero duplication. Flag to Tim at handoff time if this is the right sequencing.

Option B — **Build the card now as part of this OI, in the shared location from day one** (`src/features/observations/paddock-card.js`), and GH-12's survey implementation adopts it when it lands. Keeps this roadblock moving without waiting on GH-12.

Default to Option A unless Tim signals this OI is more time-sensitive than GH-12.

**Files likely affected:**

- `src/features/observations/paddock-card.js` (new) — shared card component (extracted from or written as shared with GH-12)
- `src/features/events/observation-fields.js` — `renderPreGrazeFields` delegates to `renderPaddockCard({ saveTo: 'event_observations' })` or is deprecated in favor of direct callers using the shared card
- `src/features/events/move-wizard.js` lines 354–356 — swap to shared card
- `src/features/events/close.js` — same swap (close flow also has pre-graze? confirm — if no, skip)
- `src/features/surveys/*` (GH-12) — coordinate so survey sheet also uses the shared card
- `tests/unit/observations-paddock-card.test.js` (new) — component tests (rating slider range, cover% slider with bale-ring helper unlocks, forage condition enum, recovery window validation)
- `tests/unit/move-wizard.test.js` — extend; assert the paddock card renders inside Step 3's open destination section, and `getValues()` output flows through to `createObservation`

**Acceptance criteria:**

- [ ] Shared `renderPaddockCard` component lives in one place and is imported by both the move wizard pre-graze section and the survey sheet
- [ ] Move wizard Step 3 renders the full card (rating slider, veg height, cover% slider with bale-ring helper, forage condition, recovery window) under *Open destination*
- [ ] Cover % input is a slider with percentage readout (per UI_SPRINT_SPEC.md line 125)
- [ ] Bale-ring helper auto-fills cover % when used
- [ ] Values submitted via `createObservation` land in `event_observations` with the correct `observation_phase = 'pre_graze'`
- [ ] Validation messages match existing pre-graze required/optional behavior (obs-badge tied to `farm_settings.recovery_required`)
- [ ] No change to `paddock_observations` writes — survey behavior unchanged
- [ ] Unit tests cover the shared component; move-wizard integration test confirms values flow through

**CP-55/CP-56 impact:** none — `event_observations` already has all the columns (migrations 021 + 022; see OI-0063 for the alignment work and OI-0089 for the doc catch-up). Pure UI integration.

**Schema change:** none.

**Related:**
- **GH-12** (Survey sheet v1 parity) — source of the paddock card component; scheduling dependency.
- **OI-0063** (schema alignment between `event_observations` and `paddock_observations`) — closed, made this reuse architecturally possible.
- **OI-0089** (V2_SCHEMA_DESIGN.md catch-up) — closed, docs now reflect migration 022's `bale_ring_residue_count` on `event_observations`.
- **OI-0068** (pre-graze inline editable fields per v4 mockup) — closed; this OI extends the inline-field pattern from "height + cover" to the full Survey card.

---

### OI-0099 — Edit Animal silent-drop inputs (damId, sireTag, weaned, confirmedBred) — two classes of fix
**Added:** 2026-04-18 | **Area:** v2-build / animals / data integrity / schema | **Priority:** P1 (silent data loss on every Edit Animal save; spans both pure wiring bugs and "UI field without Supabase column" traps)
**Checkpoint:** OI-0096 shipped 2026-04-18; this OI is now unblocked. Tim chose to bundle Class A + Class B into a single spec (no gaps) rather than ship Class A first and leave Class B fields misleadingly live.

**Status:** closed — 2026-04-18. GH issue #14; spec file renamed to `github/issues/GH-14_edit-animal-silent-drop-inputs.md`. Migration 026 (`animals.confirmed_bred BOOLEAN NOT NULL DEFAULT false`) applied and verified via MCP — column exists, `schema_version = 26`. `BACKUP_MIGRATIONS[25]` no-op chain entry added; `CURRENT_SCHEMA_VERSION` bumped 25→26. Animal entity gains `confirmedBred` field in FIELDS/create/toSupabaseShape/fromSupabaseShape (default/fallback to `false` so pre-migration-026 backup rows resolve correctly). `saveAnimal` now reads all four previously-dropped inputs: `damId` (Class A select), `weaned` + `weanedDate` (Class A — checkbox toggle auto-stamps today and clears on uncheck; date field editable for back-date), sire FKs via the new picker (Class B B1 — three modes Animal-in-herd / AI-bull-from-list / None with mutual exclusivity between `sireAnimalId` and `sireAiBullId`; inline "+ Add AI bull" sub-dialog creates an `ai_bulls` record with 5-param `add()` and selects it immediately), and `confirmedBred` (Class B B4 — direct stored boolean, reverses A29's original "derive from breeding records" design). V2_SCHEMA_DESIGN.md §3.2 updated with new column row, A29 rewritten to document the reversal, A28 annotated with picker + ai_bulls v1-era-name note, Change Log row added. v1-migration.js preserves v1 `confirmedBred` when present. CP-55 export auto-picks `confirmed_bred` via `select('*')`; CP-56 import relies on column default for missing-column old backups. 969 tests pass (9 unit: entity defaults + round-trip + missing-column fallback + sire FK mutual-exclusivity round-trip; 5 Edit Animal dialog integration covering four-input persistence + mode switching + inline Add AI bull). E2E spec `edit-animal-silent-drop-inputs.spec.js` asserts Supabase rows directly per CLAUDE.md rule. Param-count grep verified (5-param `add()` / 6-param `update()` on every touched store call).

**What's wrong:** The Edit Animal dialog (`src/features/animals/index.js`) captures four inputs that `saveAnimal` (lines 1377–1419) silently drops. Every time a farmer edits an animal and changes any of these four fields, nothing is saved. No warning, no error, no visual feedback — the next render re-reads the unchanged value from the store and the farmer sees their edit "disappear."

Discovered during OI-0096 dependency review (see Change Log 2026-04-18). OI-0096 fixes `currentWeight` via the read-only + ⚖ button redesign; the other four are listed here to prevent loss.

**The four inputs (grouped by fix class):**

**Class A — pure silent-save bugs (entity + schema already correct):**

1. **`inputs.damId`** (line 1230) — `<select>` of female animals for this operation. Entity has `damId: uuid, sbColumn: 'dam_id'`. Supabase column exists. `saveAnimal` just doesn't read `inputs.damId.value` and doesn't include it in the `data` object passed to `update()`. **Fix:** add `damId: inputs.damId.value || null` to the `data` object in `saveAnimal`. One-line fix. Entity and schema already handle it.

2. **`inputs.weaned`** (line 1261) — checkbox. Entity has `weaned: boolean, sbColumn: 'weaned'` and `weanedDate: date, sbColumn: 'weaned_date'`. Supabase columns exist. `saveAnimal` doesn't read the checkbox. **Fix:** add `weaned: inputs.weaned?.checked ?? null` (input is conditional — only rendered in edit mode, so use optional chaining). Consider auto-stamping `weanedDate` to today when the checkbox is toggled from off to on; clear it when toggled back off. That's a design choice Tim may want to weigh in on, but the simple behavior (toggle reflects `weaned`, `weanedDate` stays `null` unless explicitly set elsewhere) is the minimum-viable fix.

**Class B — UI field without Supabase column (schema design gap):**

3. **`inputs.sireTag`** (line 1234) — freeform text input labeled *"Bull tag or name"*. **No matching entity field exists.** v2's `animals` entity has `sireAnimalId: uuid` (FK to another animal) and `sireAiBullId: uuid` (FK to AI bull record), but no freeform text field for sire identity. The UI looks like a v1 holdover where sire was stored as a string; v2 was redesigned to use FK relationships, but the UI was never updated to match.

   **Design decision required before implementation:**
   - **Option B1 — replace the input with a picker.** Two-choice picker: "Animal in this herd" (select from animals.sex='male') writing to `sireAnimalId`, OR "AI bull" (select from `ai_bulls` table if it exists) writing to `sireAiBullId`. Most semantic, matches v2 entity design. Requires UI redesign of the dam/sire row.
   - **Option B2 — add `sire_tag text` column to animals table.** Keeps the freeform input, requires schema migration (`ALTER TABLE animals ADD COLUMN sire_tag text`), entity field addition, CP-55/CP-56 spec update, `schema_version` bump, backup-migration chain entry. Matches v1 behavior but adds a field the v2 schema design deliberately avoided.
   - **Option B3 — remove the input entirely.** Simplest. Farmers set sire via a different flow (calving records have a sire field via `sireAnimalId` / `sireAiBullId` FKs already). Might lose breeding-data capture that's not also captured at calving.

4. **`inputs.confirmedBred`** (line 1293) — checkbox labeled *"Confirmed bred — Pregnancy check / palpation confirmed"*. **No matching entity field exists.** Entity has no `confirmedBred`, `confirmed_bred`, or equivalent column.

   **Design decision required before implementation:**
   - **Option B4 — add `confirmed_bred boolean` column to animals table.** Schema migration + entity + CP-55/CP-56 spec update + `schema_version` bump + backup-migration chain entry. Simple data model — a direct boolean on the animal.
   - **Option B5 — derive from `animal_calving_records`.** If v2's intent was that confirmed-bred status is implicit (a calving record exists or is expected), then the checkbox UI is redundant with the calving history section right above it. Remove the checkbox. But this loses the "confirmed bred *before* calving" state — a cow can be confirmed pregnant months before calving, and the farmer may want to capture that.
   - **Option B6 — new `animal_breeding_status` table.** Richer data model capturing breeding events (palpation date, method, outcome). More than a single boolean, supports repro history. Larger scope. Probably overkill for this OI; if desired, split into its own feature OI.

**Why this was not originally one OI:** Class A is a ~30-minute pure wiring fix. Class B required Tim's design input and a schema migration with CP-55/CP-56 implications. The original plan was to ship Class A first and defer Class B. On 2026-04-18 Tim chose to bundle — "no gaps" — so Class B doesn't sit with misleadingly-live inputs while design waits.

---

**Locked design decisions (2026-04-18):**

All four inputs ship as one bundle. Design options below are closed.

1. **Class A — damId wiring fix.** Read `inputs.damId.value || null` into the `data` object in `saveAnimal`. No design choice.

2. **Class A — weaned wiring fix.** Read `inputs.weaned?.checked ?? null` into the `data` object. Plus **`weanedDate` behavior** (locked by Tim): auto-stamp `weanedDate = todayStr` when `weaned` flips from false to true. Render an editable date field adjacent to the checkbox so the farmer can back-date (e.g., "weaned two weeks ago"). When `weaned` flips back to false, clear `weanedDate` to `null`. Behavior summary:
   - Checkbox off → `weaned = false`, `weanedDate = null`, date field hidden or disabled.
   - Checkbox on → `weaned = true`, `weanedDate` defaults to today, date field visible and editable.
   - Farmer edits date field while checkbox is on → `weanedDate` takes the edited value.

3. **Class B — sireTag → picker (B1 + inline Add AI bull).** Remove the freeform `<input type="text">`. Replace with a **sire picker** that has three modes:
   - **Animal in this herd** — select from `animals` filtered to `operationId` and `sex === 'male'` (include archived? Tim's call at implementation — default: active animals only; archived flagged with a muted suffix). Selecting writes `sireAnimalId`. Picker row format: **`{tagNum} — {name}`** (both ear tag and name visible; if either missing, show what's present).
   - **AI bull from list** — select from `ai_bulls` filtered to `operationId` where `archived = false`. Selecting writes `sireAiBullId`. Picker row format: **`{name}` · `{tag}`** if tag exists, else just `{name}`; if breed set, render as muted trailing text (e.g., `{name} · {tag}  [breed]`).
   - **Add AI bull (inline)** — action inside the picker opens a tiny sub-dialog capturing `name` (required), `tag` (optional), `breed` (optional). Saving creates a new `ai_bulls` record via `AiBullEntity.create()` + `add('aiBulls', ...)` using the standard 5-param shape, then immediately sets `sireAiBullId = newBull.id` and closes the sub-dialog. Returns farmer to the Edit Animal dialog with the new bull selected. This is the escape hatch for pre-app animals whose sire was never entered, neighbor's bulls, old farm bulls, etc.
   - Mutual exclusivity: setting a sire via "Animal in this herd" clears `sireAiBullId`, and vice versa. Only one of the two FKs is populated at a time.
   - No new column on `animals`. No schema change for sire.
   - **Semantic note (spec should acknowledge):** the `ai_bulls` table will, in practice, also hold historical / external / non-AI bulls that farmers enter inline. The table name is a v1-era artifact; no rename in scope. If Tim later wants to rename or split (e.g., `ai_bulls` → `external_sires`), that's a separate OI.

4. **Class B — confirmedBred → new column (B4).** Add `confirmed_bred boolean NOT NULL DEFAULT false` on `animals`. Entity gains `confirmedBred: { type: 'boolean', sbColumn: 'confirmed_bred' }`. `saveAnimal` reads `inputs.confirmedBred?.checked ?? false`. This is a direct stored state — checkbox on = confirmed, off = not confirmed. No derivation, no breeding-history table (B6 deferred to a future OI if needed).

**Schema change (now definite, was conditional):**
- New column: `animals.confirmed_bred boolean NOT NULL DEFAULT false`
- Migration file: `supabase/migrations/NNN_add_confirmed_bred.sql` (next available number)
- Migration must include `UPDATE operations SET schema_version = N;`
- `BACKUP_MIGRATIONS` entry: `N-1: (b) => { b.schema_version = N; return b; }` (no-op — the column defaults to false and CP-56 can read old backups missing the column as false)
- V2_SCHEMA_DESIGN.md §3.2 (`animals` table) updated to include `confirmed_bred`
- CLAUDE.md Migration Execution Rule applies: write + run + verify + report in commit message

**CP-55 / CP-56 impact (now definite):**
- CP-55 `animals` shape must include `confirmedBred` serialized as `confirmed_bred`.
- CP-56 migration chain gains a no-op rule for backups from before this schema version (missing column → treat as `false`).
- No impact from sireTag decision (reuses existing `sireAnimalId` / `sireAiBullId` columns).

---

**Scope (split by class):**

**Class A (ready to ship):**

1. `src/features/animals/index.js` `saveAnimal` — add `damId: inputs.damId.value || null` and `weaned: inputs.weaned?.checked ?? null` to the `data` object.
2. Consider auto-stamping `weanedDate = todayStr` when `weaned` flips from false to true; clear when flipped false. Default to minimum-viable (leave `weanedDate` untouched unless Tim specifies).
3. Unit test: Edit Animal dialog test asserts that toggling `damId` and `weaned` in the dialog, then saving, results in the correct values in the `update()` call.
4. E2E: set dam on an animal via Edit Animal → reload → dam is still set. Set weaned via Edit Animal → reload → weaned is still set.

**Class B (DESIGN REQUIRED before implementation):**

5. `sireTag` — design decision Tim picks (B1 / B2 / B3). Until then, the input stays in the DOM but remains non-functional. Consider adding a `disabled` attribute + small *"(not yet saved)"* caption as a stopgap so farmers don't think it's working.
6. `confirmedBred` — same shape. Until design locks, same stopgap: `disabled` attribute + caption.

**Explicit non-scope:**

- **`name` vs `tagNum` ambiguity in `saveAnimal` line 1382** — `name: inputs.name?.value?.trim?.() || inputs.tagNum.value.trim() || null` is an intentional fallback, not a bug. Out of scope.
- **`sexState` radio / `classId` dropdown** — already saved correctly. Not in this audit.
- **OI-0096 `currentWeight` input** — covered in OI-0096; this OI explicitly does not touch the weight path.

**Files likely affected (Class A ship):**

- `src/features/animals/index.js` — two-line addition to `data` object in `saveAnimal`
- `tests/unit/animals.test.js` — extend Edit Animal test

**Files likely affected (Class B, pending design):**

- `src/features/animals/index.js` — UI changes for sire picker (B1) or input removal (B3/B5)
- `src/entities/animal.js` — new field if B2 or B4
- `supabase/migrations/NNN_*.sql` — new columns if B2 or B4
- `V2_SCHEMA_DESIGN.md §3.2` — schema update if B2 or B4
- Backup/import migration chain — CP-55/CP-56 update if B2 or B4

**Acceptance criteria (bundled Class A + Class B, post design lock):**

- [ ] `inputs.damId.value` is read and persisted by `saveAnimal` (Class A)
- [ ] `inputs.weaned.checked` is read and persisted by `saveAnimal` (Class A)
- [ ] `weanedDate` auto-stamps to today when `weaned` flips on; date field is editable for back-date; clears when `weaned` flips off (Class A)
- [ ] `inputs.sireTag` removed from Edit Animal DOM; replaced with sire picker (Animal in herd / AI bull from list / inline Add AI bull)
- [ ] Sire picker rows for animals render `{tagNum} — {name}`; rows for AI bulls render `{name}` plus `{tag}` when present
- [ ] Inline "Add AI bull" captures name (required), tag (optional), breed (optional); creates `ai_bulls` record via standard 5-param `add()`; immediately sets `sireAiBullId` and returns farmer to Edit Animal with new bull selected
- [ ] Sire mutual exclusivity: only one of `sireAnimalId` / `sireAiBullId` is set at a time
- [ ] `animals.confirmed_bred boolean NOT NULL DEFAULT false` migration written, executed, and verified per CLAUDE.md Migration Execution Rule
- [ ] Migration bumps `schema_version` (`UPDATE operations SET schema_version = N;`)
- [ ] `BACKUP_MIGRATIONS` no-op entry added for the new version
- [ ] `confirmedBred` entity field added (`toSupabaseShape`, `fromSupabaseShape`, `FIELDS` all updated)
- [ ] `inputs.confirmedBred.checked` read and persisted by `saveAnimal`
- [ ] V2_SCHEMA_DESIGN.md §3.2 updated to include `confirmed_bred`
- [ ] CP-55 spec adds `confirmed_bred` to the `animals` export shape
- [ ] CP-56 spec adds a migration-chain entry (default `false` when column missing from old backups)
- [ ] Unit tests: Edit Animal dialog test covers all four inputs round-tripping through `saveAnimal` and `update()`
- [ ] Unit test: shape round-trip test for `animals` entity includes `confirmedBred`
- [ ] E2E test: Edit Animal → set dam, weaned (+ date), sire (via picker AND via inline Add AI bull), confirmedBred → reload → all five persist correctly
- [ ] E2E test verifies Supabase (not just localStorage) per CLAUDE.md E2E rule
- [ ] Param-count check: every store call in `saveAnimal` + the inline Add AI bull path uses correct 5/6/3 params
- [ ] PROJECT_CHANGELOG.md row added
- [ ] GitHub issue closed with commit hash

**CP-55/CP-56 impact (definite):** Adds `confirmed_bred` to the `animals` export shape. CP-56 migration-chain entry: backups from before this version treat missing column as `false`. No sireTag-related impact (existing `sireAnimalId` / `sireAiBullId` columns already handled).

**Schema change (definite):** One new column — `animals.confirmed_bred boolean NOT NULL DEFAULT false`. No new tables, no new FKs.

**Related:**

- **OI-0096** — parent audit that surfaced these. OI-0096 only addresses `currentWeight` via the read-only + ⚖ redesign; OI-0099 captures the other four.
- **CLAUDE.md "New UI Fields → Supabase Column Rule"** — Class B is exactly the v1 trap this rule was written to prevent. Good reminder that the rule applies to v2 too.
- **Potential related work** — if B6 is ever chosen, overlaps with v2's breeding/repro capability area (heat records already exist; breeding status does not).

---

### OI-0098 — Inline edit/delete of historical weight records in Edit Animal (DESIGN REQUIRED, do not build)
**Added:** 2026-04-18 | **Area:** v2-build / animals / weight / architecture | **Priority:** P3 (quality-of-life improvement; not blocking any current flow)
**Checkpoint:** deferred — design session needed before implementation

**Status:** open — **DESIGN REQUIRED, do not build.** Deferred from OI-0096 because editing or deleting a past weight record ripples into the window-split architecture (OI-0091/0094/0095) in ways that need an explicit answer.

**The problem OI-0098 solves:** Edit Animal currently shows a read-only "Weight history" list (lines 1313–1328). Farmers have no in-app way to correct a mis-typed weight or delete a duplicate record. Today's only option is the edit-group-window dialog (SP-10), which only reaches `avgWeightKg` on a closed window, not individual per-animal records.

**Why this is a design problem, not an implementation one:**

If a farmer edits a past weight record (say, changes `weightKg` from 450 to 460 on a record dated 30 days ago), that record may have triggered a `splitGroupWindow` call on a now-closed `event_group_window`. The stamped `avgWeightKg` on those closed window segments was computed from the original value. Editing the source record creates a question: do the stamped snapshots re-compute, or do they stay frozen?

Same shape for delete. Deleting a past weight record removes one sample from the group's average computation. If that sample contributed to a closed window's stamp, the stamp is now stale.

OI-0091 locked in **"stored snapshot for closed windows, live recompute for open windows."** That rule gives us two choices for weight-history edits:

- **A — snapshots stay frozen.** Edit/delete only affects live values on open windows. Closed windows keep their original stamps. Simple, predictable, but a mistyped weight from two events ago stays wrong in historical reports forever.
- **B — affected closed windows re-stamp.** The helper walks every `event_group_window` that overlaps the record's date, recomputes `avgWeightKg` / `headCount` from current state, rewrites the stamp. More correct, much more complex — and breaks the "closed window = immutable history" invariant we've been leaning on.

Neither choice is obvious. Pick A and it's arguably wrong; pick B and it's a significant architecture amendment.

**Questions to answer before building:**

1. Does edit-a-historical-weight update closed-window stamps (B) or only affect live values (A)?
2. If A, is there a separate "recompute stamps" action (farmer-initiated, explicit) or does mis-entered historical data just live with its original stamp?
3. If B, what's the migration/worker story for windows that have been archived or exported via CP-55? Does the re-stamp propagate to already-exported backups? (Answer: no — backups are frozen, but this means the exported backup becomes an inconsistent view.)
4. Can the farmer delete a record that was the *only* weight sample in a closed window? What happens to the stamp — fall back to `null`? The class default? The prior record?
5. UX: inline pencil/trash icons on each history row, or a separate edit-weight-record sheet? If inline, how does mobile-first UX handle the actions (swipe? long-press?)?
6. Should this bundle with a broader "edit any historical record" affordance (health events, observations, feed checks), or stay narrow to weight only?

**Files likely affected (once design locks):**

- `src/features/animals/index.js` — Edit Animal dialog weight-history section grows edit/delete affordances
- `src/data/store.js` — possibly new helper `reStampClosedWindows(groupId, dateRange)` if design choice is B
- `src/features/health/weight.js` — Edit Weight Record sheet (new) if that UX is chosen over inline
- Existing window-split helpers (`splitGroupWindow` / `closeGroupWindow`) may need retro-rewrite counterparts if B
- E2E coverage: whatever the final UX shape is

**CP-55/CP-56 impact:** potentially yes if design choice is B — any mechanism that rewrites closed-window stamps needs to be reflected in export/import so re-stamped values flow through backups correctly.

**Schema change:** probably none, but can't be ruled out until design locks.

**Related:**

- **OI-0096** — parent OI that deferred this work. OI-0096 replaces the Edit Animal editable `currentWeight` input with a read-only display; historical edit/delete is the follow-up feature.
- **OI-0091** — defines the "stored snapshot for closed windows" rule that makes this a real design question.
- **OI-0065** (reweigh flow — DESIGN REQUIRED) — adjacent unresolved weight-UX work; may inform or share the design answer.

---

### OI-0097 — §7 Remove group: remove incorrect `maybeShowEmptyGroupPrompt` call (correction to shipped OI-0090 wiring)
**Added:** 2026-04-18 | **Area:** v2-build / groups / events | **Priority:** P3 (cosmetic — prompt fires in a misleading context on an edge case only; no data corruption, no silent data loss)
**Checkpoint:** batches with OI-0095 + OI-0096 into one Claude Code session brief

**Status:** closed — 2026-04-18. `maybeShowEmptyGroupPrompt(groupWindow.groupId)` call removed from `src/features/events/group-windows.js` §7 Remove group handler; the `closeGroupWindow` call (OI-0094 entry #7) stays. Scope-boundary comment added: *"§7 Remove group closes the event_group_window only — it does not touch animal_group_memberships, so 'empty' is checked by membership-mutation flows only (cull, move, split, Edit Group, Edit Animal group change), not here."* Removed the now-unused `maybeShowEmptyGroupPrompt` import. OI-0090 session brief (`github/issues/SESSION_BRIEF_2026-04-17_empty-group-archive.md`) annotated with a correction banner at the top so re-reads don't follow the broken guidance. No test assertion removals needed — grep confirmed no `maybeShowEmptyGroupPrompt` coverage in `tests/`. 933 tests pass. Origin: OI-0090 Phase 3 wiring brief crossed a scope boundary.

**What's wrong:** OI-0090's session brief (`github/issues/SESSION_BRIEF_2026-04-17_empty-group-archive.md` Phase 3) listed `src/features/events/group-windows.js` §7 Remove group as a `maybeShowEmptyGroupPrompt(groupId)` wiring point. Claude Code shipped the wiring per the brief on 2026-04-18 (see OI-0090 closed status: *"Wired into cull-sheet, Edit Group checkboxes, Split Group, Edit Animal group change, move-wizard (guarded …), §7 Remove group."*). The wiring is wrong: §7 Remove group closes the group's `event_group_window` without touching `animal_group_memberships`, so the group's membership state is unchanged. "Empty" (zero open memberships) is orthogonal to "removed from this event's §7."

Effect:

- **Normal case** — group has open memberships on other contexts → `maybeShowEmptyGroupPrompt` no-ops. No harm.
- **Edge case** — group happened to have zero open memberships already (e.g., all animals were culled at some earlier point but the group stayed attached to the event's §7) → the prompt fires in a misleading context. The farmer just removed a group from one event; the prompt asks them to Archive / Keep active / Delete the group itself. Unrelated action; confusing UX.

**Fix:**

Remove the `maybeShowEmptyGroupPrompt(groupId)` call from the §7 Remove group handler in `src/features/events/group-windows.js`. The `closeGroupWindow(groupId, eventId, closeDate, closeTime)` call stays — that's OI-0094's entry #7 and is correct. Add a one-line comment noting the scope boundary: *"§7 Remove group doesn't touch memberships — emptiness is checked by membership-mutation flows only (cull, move, split, Edit Group, Edit Animal group change)."*

**Files affected:**

- `src/features/events/group-windows.js` — remove one line; add one clarifying comment

**Acceptance criteria:**

- [ ] `maybeShowEmptyGroupPrompt(groupId)` call removed from §7 Remove group handler
- [ ] Scope-boundary comment added adjacent to the `closeGroupWindow` call
- [ ] All existing tests still pass (no dedicated test covered this edge-case firing, so no test rewrites expected)
- [ ] If any unit test stubbed the prompt call as a positive assertion in §7 Remove group, the stub is removed
- [ ] Commit message references OI-0090's session brief as the origin of the incorrect wiring

**CP-55/CP-56 impact:** none.
**Schema change:** none.

**Related:**

- **OI-0090** (closed 2026-04-18) — this is a small code correction to its shipped behavior. Not a regression of OI-0090's intent; just a scope boundary crossed in the brief.
- **OI-0094** — §7 Remove group is OI-0094's entry #7. `closeGroupWindow` call is correct and stays.

---

### OI-0096 — Weight change entry point completeness (group-side audit follow-up)
**Added:** 2026-04-18 | **Area:** v2-build / animals / health / events / architecture | **Priority:** P1 (OI-0094's architectural rule is incomplete on two weight paths; daily-resolution calcs like DMI-8 can't correctly back-compute avg weight per day without a split stamp)
**Checkpoint:** batches with OI-0095 + OI-0097 into one Claude Code session brief

**Status:** closed — 2026-04-18. Both weight gaps closed. **Prereq (shipped separately):** `maybeSplitForGroup` promoted to a shared export in `src/data/store.js` (commit `959a7f3`) — duplicate local defs in `calving.js` + `animals/index.js` removed. **Quick Weight sheet** (`src/features/health/weight.js`) now calls `maybeSplitForGroup` for every active membership of the animal after the `add('animalWeightRecords', ...)` — no-op via the helper's guard when the animal has no active group or the group isn't on an open event. **Edit Animal dialog** — editable `currentWeight` input removed entirely (no more silent-save footgun). Replaced with a read-only "Current weight" row + ⚖ Weight button that closes Edit Animal and opens Quick Weight for the current animal; if no weight record exists, renders `—`. Existing Weight history list preserved as read-only; inline edit/delete deferred to OI-0098 (DESIGN REQUIRED). New `tests/unit/weight-sheet.test.js` covers the Quick Weight split wiring (3 cases). 930 tests pass. No schema change, no CP-55/CP-56 impact.

**What's wrong:** OI-0094's architectural rule is *"every mid-event state change that affects head count or avg weight splits the group's open window."* The group-side audit ran against membership/composition changes. Two weight-specific entry points slipped through the audit because weight is a per-animal attribute, not a membership event. But an individual weight change does shift the group's `avgWeightKg`, and therefore:

- Today's render reads live (correctly) via `getLiveWindowAvgWeight` from OI-0091. So the open dashboard/event-detail surface is not silently wrong — the live-read rule catches it.
- **Historical daily-resolution calcs** (DMI-8 daily breakdown, EST-1 accuracy comparison, any future per-day report) read `event_group_window.avgWeightKg` from each window segment. Without a split on the reweigh date, the window has one continuous snapshot spanning both the pre-reweigh and post-reweigh period. DMI-8 will use the final stamped value for every day in the window, overstating early-period DMI if the weight went up, understating it if the weight went down.
- **Inconsistency with the Group Weights bulk sheet.** The bulk path (`src/features/animals/index.js:1116`) correctly calls `maybeSplitForGroup(group.id, dateInput.value)` after the weight updates. The per-animal paths below do not. Same action, different plumbing.

**Two gaps:**

1. **Quick Weight sheet (`src/features/health/weight.js` line 64) — per-animal weight update never calls `splitGroupWindow`.** The Save handler creates a new `animal_weight_record` via `add()`, then closes the sheet. No `maybeSplitForGroup` call, no split. Fix: after the `add()`, call `maybeSplitForGroup(group.id, dateInput.value)` for the animal's current group (no-op if the animal isn't in a group or the group isn't on an open event — `maybeSplitForGroup` already guards).

2. **Edit Animal dialog `currentWeight` input (`src/features/animals/index.js:1217`) — silently dropped in `saveAnimal`.** The dialog captures an editable weight input; `saveAnimal` (lines 1377–1419) never reads `inputs.currentWeight.value`. No weight record is written, no split fires. Pure silent data loss.

   **Resolution (decided 2026-04-18 with Tim):** Replace the editable input with a **read-only current-weight display + ⚖ Weight button** that opens the Quick Weight sheet. The existing "Weight history" section stays (read-only list of prior records). Edit/delete of historical records is **not** in scope — see OI-0098 for that design work.

   This closes the silent-save footgun (no editable field = no value to drop), makes the weight workflow discoverable from inside Edit Animal (button right next to the read-only value), and keeps weight changes routing through the single `maybeSplitForGroup`-aware path in Quick Weight.

**Prerequisite (new — discovered during dependency review 2026-04-18):** `maybeSplitForGroup` is **not** a shared helper today. It is defined locally twice — in `src/features/health/calving.js:19` and `src/features/animals/index.js:31` (duplicate copies of the same function). OI-0094 never promoted it to a shared module. Before wiring the Quick Weight sheet, the session brief must promote `maybeSplitForGroup` to a shared location and update both existing callers to import from there. Recommended location: `src/data/store.js` next to `splitGroupWindow` / `closeGroupWindow` (keeps all window-split plumbing co-located). Alternative: `src/features/events/group-windows.js`.

**Known adjacent issue (flagged out of scope):** `saveAnimal()` silently drops four more inputs captured by the dialog — `inputs.damId` (1230), `inputs.sireTag` (1234), `inputs.weaned` (1261), `inputs.confirmedBred` (1293). Same pattern: dialog captures, save handler ignores. None are weight-related, so they sit outside OI-0096. Flag for a follow-up audit (separate future OI). The fix pattern is the same — tighten the save handler or remove the orphan inputs.

**Scope (the package):**

1. **Prerequisite — promote `maybeSplitForGroup` to a shared module.** Extract the current duplicate definitions (`calving.js:19`, `animals/index.js:31`) into `src/data/store.js` (preferred) or `src/features/events/group-windows.js`. Keep the exact signature (`maybeSplitForGroup(groupId, changeDate)`) and guard behavior (no-op if no open `event_group_window` for that group). Update both existing callers to import instead of redefine. This is the blocking step — everything downstream depends on it.

2. **Quick Weight sheet wiring** — `src/features/health/weight.js`: after the `add('animalWeightRecords', ...)` call on line 64, call `maybeSplitForGroup(groupId, dateInput.value)` where `groupId` is the animal's current group (look up via `animal_group_memberships`; skip if null). Import `maybeSplitForGroup` from the shared location created in step 1.

3. **Edit Animal dialog redesign** — replace the editable `currentWeight` input with a read-only display + ⚖ Weight button:
   - **Delete** the editable input block (`currentWeightDisplay` and `inputs.currentWeight` at roughly lines 1216–1221). Remove `inputs.currentWeight` from the `inputs` object so it can never be accidentally read by `saveAnimal` in the future.
   - **Add** a labeled read-only row showing the latest stored weight (read from `latestW?.weightKg`, formatted with unit conversion). Example layout: `Current weight: 487 kg   [⚖ Weight]`. If no weight record exists, display `—`.
   - **Add** a ⚖ Weight button adjacent to the read-only display. `onClick` closes the Edit Animal dialog and opens the Quick Weight sheet for the current animal (same entry the row's ⚖ button uses). Closing the edit dialog first avoids stacked-sheet issues and means the farmer returns to the Animals screen after logging the weight, not to a stale Edit Animal view.
   - **Preserve** the existing "Weight history" section (read-only list, lines 1313–1328). No edit/delete controls on history rows — that design lives in OI-0098.

4. **Unit tests:**
   - `tests/unit/weight-sheet.test.js` (new or extend): saving a weight for an animal in a group on an open event triggers `maybeSplitForGroup` with the sheet's date; saving for an animal with no group is a no-op for the helper.
   - `tests/unit/animals.test.js` Edit Animal test: assert the editable `currentWeight` input is absent; assert the read-only current-weight display renders the latest stored value (or `—` when no record exists); assert the ⚖ Weight button is present and its click handler opens the Quick Weight sheet for this animal.

5. **E2E addition** (roll into OI-0095's e2e spec, or add a small standalone): open Quick Weight for an animal in a group on an open event → save a new weight → dashboard card + event detail §7 `avgWeightKg` immediately reflects the live value (OI-0091 live-read) → close the event → closed `event_group_window` rows split on the reweigh date with correct stamped values. Second flow: open Edit Animal → tap ⚖ Weight → Edit Animal closes, Quick Weight opens pre-targeted at this animal.

6. **Grep audit:** every `add('animalWeightRecords', ...)` in `src/features/**` must be paired with a `maybeSplitForGroup` call, or be inside a flow that splits via another path (calving splits via the calf's membership addition — document this exception). Current `add()` sites: `src/features/health/weight.js:64`, `src/features/animals/index.js:1112` (bulk, already correct), `src/features/health/calving.js:170` (calf birth weight; implicit via membership add).

**Explicit non-scope:**

- **Inline edit/delete of historical weight records** — deferred to **OI-0098** (needs its own design decision on closed-window snapshot behavior).
- **Other silent-drop inputs in `saveAnimal`** (`damId`, `sireTag`, `weaned`, `confirmedBred`) — separate follow-up OI.
- **Reweigh flow redesign** (OI-0065, still DESIGN REQUIRED on UX) — OI-0096 fixes the existing per-animal + bulk paths; does not ship a new reweigh UX.
- **Historical back-stamping of `avgWeightKg` on already-closed windows** — not worth a migration. SP-10's edit-group-window dialog is the escape hatch for historical correction.

**Files likely affected:**

- `src/data/store.js` (or `src/features/events/group-windows.js`) — add shared `maybeSplitForGroup` export
- `src/features/health/calving.js` — remove local definition, import from shared location
- `src/features/animals/index.js` — remove local definition, import from shared; replace editable `currentWeight` input with read-only display + ⚖ button in Edit Animal dialog
- `src/features/health/weight.js` — one helper call added after `add()`
- `tests/unit/weight-sheet.test.js` (new) or an existing animals/health test file
- `tests/unit/animals.test.js` — update Edit Animal test for the new read-only + button layout

**Acceptance criteria:**

- [ ] `maybeSplitForGroup` exported from one shared location; both previous callers import from there; no duplicate definitions remain
- [ ] Quick Weight sheet Save triggers `maybeSplitForGroup` when the animal is a member of a group on an open event
- [ ] Edit Animal dialog shows current weight as read-only (not an editable input); adjacent ⚖ Weight button opens Quick Weight for this animal
- [ ] `inputs.currentWeight` no longer exists in the Edit Animal dialog code path
- [ ] Unit tests cover the Quick Weight split wiring and the Edit Animal read-only + button layout
- [ ] Grep audit: every `animal_weight_record` write is paired with a window-split call, or falls under a documented exception (calving)
- [ ] No regression to Group Weights bulk sheet (already correct; test still passes)

**CP-55/CP-56 impact:** **none.** More `event_group_window` rows over time; existing export/import handles the table.

**Schema change:** **none.**

**Related:**

- **OI-0094** — this is the weight-side completion of the group-state entry-point audit. Same architectural rule, different state dimension.
- **OI-0065** (reweigh flow — DESIGN REQUIRED) — uses these helpers once spec'd.
- **OI-0098** (new, DESIGN REQUIRED) — inline edit/delete of historical weight records in Edit Animal. Deferred from OI-0096 because of closed-window snapshot ripple effects.
- **Potential follow-up OI** — audit the four other silently-dropped `saveAnimal` inputs (`damId`, `sireTag`, `weaned`, `confirmedBred`).

---

### OI-0095 — Event Paddock Window Split on State Change (architectural fix — paddock analog of OI-0091)
**Added:** 2026-04-18 | **Area:** v2-build / events / paddocks / calcs / architecture | **Priority:** P0 (strip grazing silently loses per-strip effective-area history; every area-dependent calc on an open strip-grazed paddock is wrong after any `area_pct` edit)
**Checkpoint:** independent architectural pass; sequence after OI-0091 package + OI-0094 have landed so the group-side contract is stable reference material

**Status:** closed — 2026-04-18. Paddock-side analog of OI-0091 shipped. New store helpers `splitPaddockWindow(locationId, eventId, changeDate, changeTime, newState)` + `closePaddockWindow(locationId, eventId, closeDate, closeTime)` in `src/data/store.js`; new calc helper `getOpenPwForLocation(locationId, eventId, paddockWindows)` in `src/calcs/window-helpers.js`. Entry points wired: Advance Strip routes the close half through `closePaddockWindow` (retains distinct close/open dates via the existing `add()` for the open half); edit-paddock-window on OPEN windows routes `areaPct` / `isStripGraze` changes through `splitPaddockWindow` with a "Saving creates a new window from today forward" caption; edit-paddock-window on CLOSED windows keeps direct `update()` as historical-correction escape hatch; Edit dialog Reopen action adds same-paddock overlap guard against open siblings on any event; move-wizard close loop and event-close close loop converted to `closePaddockWindow`. `classifyPwsForReopen` pure classifier added to `reopen-event.js` — partitions PWs closed on `dateOut` into reopen vs keepClosed (reasons: `reused` — same paddock opened later in the event; `swap` — paddock already has an open window on another event). Summary dialog now shows combined group + paddock counts. Hardcoded `areaPct: 100` literals replaced with `getOpenPwForLocation(...)?.areaPct ?? 100` in `dashboard/index.js` + `locations/index.js`. Part B orphan cleanup ships as app-side `src/data/one-time-fixes.js::closePaddockWindowOrphans()` — localStorage-flag guarded, runs once per device, routes through `closePaddockWindow` so sync queues normally; wired into `src/main.js` after initial pull. V2_APP_ARCHITECTURE.md §4.4b added with paddock helper contract, 10-entry-point table, and paddock grep contract. 930 tests pass (20 new: `store-paddock-window-split` ×6, `orphan-cleanup` ×5, `classifyPwsForReopen` ×5, `getOpenPwForLocation` ×4). No schema change, no migration, no CP-55/CP-56 impact, no `schema_version` bump.

**What's wrong (reproduced in the code, not yet observed in field data):**

An `event_paddock_window` is the paddock-side analog of `event_group_window` — it represents a period during which a paddock's **placement state** (which paddock, what fraction of it via `area_pct`, whether it's a strip, which strip group it belongs to) is stable. The v2 codebase has the **row structure** for splits (multiple rows per `event_id + location_id` are already allowed, `is_strip_graze` / `strip_group_id` / `area_pct` columns exist per GH-4) but none of the **discipline of splitting** that OI-0091 put in place for group windows. Concretely:

1. **`edit-paddock-window.js` edits `area_pct` in place on an open window** (lines 60, 100, 108). A farmer who starts grazing a paddock at 100% and halfway through decides to strip-graze the back half at 25% can type `25` and hit Save. The single row mutates from `area_pct = 100` to `area_pct = 25`. The historical effective area (100% for the first N days) is gone. Every effective-area calc that looks back over this window — pasture cover forecast, DMI/acre, AU/acre, NPK/acre deposit density, grazing pressure — silently reads `area_pct = 25` for the entire duration and understates the area the animals were actually on.

2. **`submove.js` "Advance Strip" (lines 282–299) does split-on-state-change correctly today** — closes the current strip window with `dateClosed`/`timeClosed`, opens a new one with the same `stripGroupId` and `areaPct`. This is the correct pattern and the architectural exemplar. The gap is that this pattern is implemented ad hoc inside the advance-strip flow rather than as a reusable helper, so no other flow reuses it and the design doesn't compose.

3. **`move-wizard.js` close path (lines 495–503) closes paddock windows bare** — `update(...dateClosed, timeClosed)` on every open PW. No snapshot of "what was the effective area on this paddock at the moment of close." Today this is fine because `area_pct` doesn't mutate post-open in a well-behaved flow, but as soon as we fix `edit-paddock-window.js` (see #1 above) the snapshot rule will matter — the closed row must retain the `area_pct` that was actually in force on the day it closed, not whatever the farmer later types.

4. **`reopen-event.js` reopen path (line 100) clears `dateClosed`/`timeClosed`** with no consideration of whether the paddock's state has since changed. Group-side OI-0094 shipped a `classifyGwsForReopen` classifier that walks each closed GW and decides reopen-or-keep-closed based on whether the group has since moved. Paddock-side has no analog. A reopen blindly reopens whatever windows were closed on `date_out`, even if the farmer has since started a different event on the same paddock.

5. **`edit-paddock-window.js` reopen action (line 128) clears `dateClosed`/`timeClosed` with no same-paddock-overlap guard.** The edit dialog does guard *overlap with other windows* on save (lines 86–95), but the standalone reopen button on a closed window skips that check. If the farmer reopens an old closed window on a paddock that has since been re-opened in a new event, we end up with two overlapping open windows on the same paddock.

6. **No orphan prevention or cleanup analog of OI-0073.** OI-0073 walked v1-migration and fresh-v2 data for orphan `event_group_windows` (no matching open event, `dateLeft IS NULL`) and closed them. `event_paddock_windows` has the same failure mode: a whole-group move closes the source event but if the close path ever leaves a PW open (no such bug currently grep'd, but the invariant is undefended), the orphan is invisible until a pasture-cover forecast includes a paddock that isn't actually being grazed.

**Architectural principle (new — extends `V2_APP_ARCHITECTURE.md` §4.4):**

An `event_paddock_window` is a **period of stable placement state** on an event. During that period, `locationId`, `areaPct`, `isStripGraze`, and `stripGroupId` are constant by definition. When any of those change — strip advance, strip-size re-plan mid-event, paddock swap within event, retroactive area correction — the current open window **closes on the change date with its state stamped in**, and a new window **opens the same date with the new state**. Closed windows are historical truth (their `areaPct` snapshot is authoritative forever). The open window is still a stored row (unlike group windows, there's no cheaper live-recompute source — `areaPct` is not derivable from anywhere else), but any mutation of that row's placement-state columns must go through the split helpers, not a direct `update()`.

**Rule of thumb (paddock-side):** *every change to `areaPct`, `isStripGraze`, `stripGroupId`, or `locationId` on an open window splits the window. Direct `update()` on those columns on an open window is a bug.* Date/time bounds remain directly editable — they are the window's own identity, not state that splits it.

**Why this is a second architectural pass (not a rider on OI-0091):**

- **Different state model.** Group windows have a live-recompute fallback (live memberships are the source of truth; the stored snapshot is only meaningful on close). Paddock windows have no live-recompute source — `areaPct` is a farmer's plan, not a derivation. The split must therefore **snapshot on the closing row** and **write the new plan on the opening row**. Render/calc paths read the stored `areaPct` in both cases. This is a meaningfully different helper contract than `splitGroupWindow`.
- **Strip grazing is a shipped, spec'd surface.** `github/issues/GH-4_strip-grazing-paddock-windows.md` is the canonical strip-grazing spec. OI-0095 must not re-spec strip grazing — it must make the code behind strip grazing consistent with the split discipline. The Advance Strip flow already *does* split correctly and becomes the exemplar; the fix is lifting that inline pattern into a helper and wiring every other entry point to use it.
- **Area-dependent calcs cut across more calls.** DMI/acre, AU/acre, NPK/acre, pasture cover, grazing pressure, rotation-calendar recovery clocks, `calcs/feed-forage.js` all read `areaPct`. Every one of these must be audited for "does this read hit only closed windows, or open ones too?" — parallel to the grep-contract OI-0091 enforced for `gw.headCount` / `gw.avgWeightKg`.

**Scope (the package):**

1. **Two new store helpers** (`src/data/store.js`):
   - `splitPaddockWindow(paddockWindowId, changeDate, changeTime, newState)` — closes the current open window by stamping `dateClosed`/`timeClosed` on the existing row (keeping its `areaPct`/`isStripGraze`/`stripGroupId` intact as historical truth); opens a new window dated `changeDate`/`changeTime` on the same `eventId + locationId` with `newState.areaPct`, `newState.isStripGraze`, `newState.stripGroupId` applied. Returns `{ closedId, newId }`. Note: keyed on the PW id, not `(groupId, eventId)` like `splitGroupWindow`, because a single event can have multiple open PWs on different locations simultaneously (unlike groups, which are exactly one open GW per `(groupId, eventId)` pair).
   - `closePaddockWindow(paddockWindowId, closeDate, closeTime)` — close-only variant for terminal state changes (event close, strip graze ended early, paddock removed from event). No new window opens.
   - Both helpers assert the target row has `dateClosed IS NULL`. Passing a closed PW is a programming error; log + return `null`.

2. **Advance Strip refactor (`src/features/events/submove.js` lines 282–299)** — lift the existing inline close+open pair into a `splitPaddockWindow` call. Pure refactor: identical behavior, pattern now reusable. Establish the exemplar.

3. **`edit-paddock-window.js` `areaPct` edit (line 100)** — on an **open** PW, route `areaPct` changes through `splitPaddockWindow`. On a **closed** PW, keep the direct `update()` (closed-window historical correction is the explicit escape hatch, parallel to OI-0094's §7 locked decision for GW `headCount` on closed windows). UI treatment: when `dateClosed === null`, the `areaPct` input stays editable (farmer has a legitimate re-plan need), but Save calls the helper — not a bare `update()`. Add a caption below the field on open windows: *"Saving creates a new window from today forward. The prior area is preserved in the grazing history."*

4. **`edit-paddock-window.js` `isStripGraze` toggle (line 101)** — same treatment. Toggling strip-graze on/off on an open window is a state change → `splitPaddockWindow`. The new window gets the toggled `isStripGraze`; if turning strip graze on, generate a fresh `stripGroupId` the same way `move-wizard.js` does. If turning strip graze off, new window's `stripGroupId = null`, `areaPct = 100`.

5. **`edit-paddock-window.js` reopen action (line 128)** — before clearing `dateClosed`/`timeClosed`, run the same-paddock-overlap guard used on Save (lines 86–95) but against currently-open siblings. If any other PW on the same `(eventId, locationId)` is currently open, block with a clear error: *"This paddock already has an open window on this event. Close or delete the other window before reopening this one."*

6. **`move-wizard.js` close path (lines 495–503)** — replace the direct `update()` loop with `closePaddockWindow` per PW. Today this is a pure refactor (no stored snapshot changes), but it locks in the helper contract — future changes that add a stored snapshot (e.g., a `closing_area_pct` column) only need to update the helper.

7. **`reopen-event.js` paddock reopen (line 100)** — mirror OI-0094's group-side work. Build a `classifyPwsForReopen` pure classifier: for each PW closed on `date_out`, decide `reopen` (no later event on same paddock, no state change) or `keep_closed` (paddock has since been used on another event, or an edit-paddock-window reopen already reopened a sibling). Surface a summary dialog before commit: *"N paddock windows will be reopened. M stay closed because the paddock has since been reused."* Require explicit confirm. Unit test the classifier as a pure function.

8. **Live-recompute helpers — scoped question, not a blanket ask.** Unlike GWs, PWs have no "live recompute" source for `areaPct` — it's not derivable. But one calc path *does* want live-ish values: pasture cover forecasts on open paddocks use `areaPct` to compute effective area today. The helper contract here is simpler: `getOpenPwForLocation(locationId, eventId)` returns the single currently-open PW for a (location, event) pair. Used by calcs that need "what area_pct is in force right now" without scanning all windows. Placed in `src/calcs/window-helpers.js` next to the group-side helpers. No live-recompute analog of `getLiveWindowHeadCount` is needed for paddocks.

9. **Calc audit — parallel to OI-0091's grep-contract** (see `V2_APP_ARCHITECTURE.md` §4.4 grep-contract exception list, which will gain a paddock-side row):
   - `src/calcs/feed-forage.js` lines 215–217, 456–462, 620 — currently iterate paddock windows. Audit: do these read `areaPct` on open windows? If so, they're reading the stored value (fine) but must route through `getOpenPwForLocation` when the calc is parameterized by "now" rather than "over a range of closed windows."
   - `src/calcs/core.js` line 51 — `effectiveArea = areaHectares * (areaPct / 100)` on each window. Fine as long as callers pass one row at a time.
   - `src/features/dashboard/index.js` line 1018 — passes `areaPct: 100` as a hard-coded literal. That's a bug predating OI-0095 (doesn't support strip grazing on the dashboard); either fix in scope or log as a follow-up OI. **Probably in scope**: dashboard is already audited for live-read rules as of OI-0094; completing the paddock-side live-read story is cheaper here than tracking a separate OI.
   - `src/features/locations/index.js` line 357 — same `areaPct: 100` literal. Same decision as dashboard.
   - `src/features/events/rotation-calendar/calendar-grid.js` line 171 and `past-block.js` — already iterate strip windows with their `areaPct`. Should work after the helper migration; add a passing test.

10. **Orphan prevention + cleanup (analog of OI-0073):**
    - **Part A (code fix)** — no grep'd orphan source today, but once the helpers exist, add a commit-time assertion (in `splitPaddockWindow` / `closePaddockWindow`): if `dateClosed IS NULL` on the target row doesn't match expectation, log a warn and refuse. Prevents misuse by future flows.
    - **Part B (data cleanup) — locked as app-side one-time script (decided 2026-04-18 with Tim).** Not a SQL migration — no schema change, no `schema_version` bump, no `BACKUP_MIGRATIONS` entry, no CP-55/CP-56 flag. Implementation: add `closePaddockWindowOrphans()` to a new or existing module (e.g., `src/data/one-time-fixes.js`); call it from the app boot sequence in `src/main.js` (or the main entry point) after store initialization, guarded by a `user_preferences.paddock_orphan_cleanup_done` flag (default false). On first run: walk `eventPaddockWindows` where `dateClosed == null` and the parent event has `dateOut != null`; set `dateClosed = event.dateOut` and `timeClosed = event.timeOut` on each; route through `closePaddockWindow` helper so the sync path queues normally; log every row touched via `logger.info('orphan-cleanup', ...)`; flip the flag when the walk finishes. On subsequent runs: flag is set, function short-circuits. Idempotent if the flag is ever reset.
    - **Part C** — note in the OI: after OI-0095 lands, new orphans are architecturally prevented.

11. **Architectural doc update (`V2_APP_ARCHITECTURE.md`)** — extend §4.4 "Window-Split on State Change" with a parallel paddock-side subsection: the principle, the helper contract (`splitPaddockWindow` / `closePaddockWindow` / `getOpenPwForLocation`), the render/calc rule, and the authoritative entry-point table. Adds a paddock-side row to the grep-contract exception list.

**Explicit non-scope:**

- **Strip grazing UX and new surface area** → owned by `github/issues/GH-4_strip-grazing-paddock-windows.md`. OI-0095 touches only the persistence/split plumbing behind that feature, not the Move Wizard strip-setup step, the Advance Strip button on the event card, or the strip-timeline UI. If GH-4 is partly built, OI-0095 lifts what's there onto the helper; if GH-4 is unbuilt, OI-0095 still ships and GH-4 consumes the helper when it builds.
- **`areaPct` math beyond effective-area** (e.g., per-strip cost allocation, per-strip utilization reporting) → follow-up OIs once the split discipline is in place.
- **Paddock swap within event** (move event without creating a new event record) → no current flow in v2; if it exists in v1 and needs porting, it's a separate OI. OI-0095 makes the helper available; swap is trivially a `closePaddockWindow(oldPw) + add PaddockWindowEntity.create(new)` pair once the helpers exist.
- **Retroactive cleanup of stored `areaPct` values on historical closed windows.** Not worth a migration; edit-paddock-window on closed PWs is the escape hatch.

**Files likely affected:**
- `src/data/store.js` — new `splitPaddockWindow` and `closePaddockWindow` helpers
- `src/calcs/window-helpers.js` — new `getOpenPwForLocation` helper
- `src/features/events/submove.js` — Advance Strip refactor to use helper (pure refactor)
- `src/features/events/edit-paddock-window.js` — `areaPct` and `isStripGraze` edits go through helper on open windows; reopen guard added
- `src/features/events/move-wizard.js` — close loop converted to `closePaddockWindow`
- `src/features/events/close.js` — close-event paddock window loop (line 209) converted to `closePaddockWindow` so closing an event stamps snapshot discipline instead of bare `update()`
- `src/features/events/index.js` — Quick Move new-window `add()` (line 832) stays as-is (new-window opens don't route through the split helper — only mutations on *existing open* windows do); verify the grep contract scope excludes `add()` sites
- `src/features/events/reopen-event.js` — introduce `classifyPwsForReopen` + summary dialog
- `src/features/dashboard/index.js` and `src/features/locations/index.js` — replace hard-coded `areaPct: 100` with `getOpenPwForLocation(...)?.areaPct ?? 100`
- `src/features/events/rotation-calendar/calendar-grid.js`, `past-block.js` — audit; expected to need no changes
- `src/calcs/feed-forage.js` — audit call sites for open-window reads
- `src/data/one-time-fixes.js` (new, or extend existing) — `closePaddockWindowOrphans()` app-side cleanup function; invoked once from `src/main.js` boot sequence behind `user_preferences.paddock_orphan_cleanup_done` flag
- `src/main.js` (or equivalent app entry) — wire the one-time cleanup call after store init, before first render
- `V2_APP_ARCHITECTURE.md` §4.4 — extend with paddock-side subsection and updated grep-contract exception list
- `tests/unit/store-paddock-window-split.test.js` (new) — pure helper tests
- `tests/unit/calcs-window-helpers.test.js` — extend for `getOpenPwForLocation`
- `tests/unit/edit-paddock-window.test.js` — extend for helper call on open-window edits, reopen overlap guard, closed-window direct-update escape hatch
- `tests/unit/reopen-event.test.js` — extend with paddock classifier cases
- `tests/unit/move-wizard.test.js` — extend for close-path helper call
- `tests/unit/close-event.test.js` — extend for close-path helper call (closes open PWs through `closePaddockWindow`)
- `tests/unit/orphan-cleanup.test.js` (new) — orphan cleanup closes dangling PWs, sets flag, idempotent on second run
- `tests/e2e/paddock-window-split.spec.js` (new) — mid-event `areaPct` change on an open PW creates a new window; reopen summary dialog renders; advance-strip unchanged behavior

**Acceptance criteria:**
- [ ] `splitPaddockWindow` and `closePaddockWindow` exist and are unit-tested pure (input row → expected row mutations)
- [ ] `getOpenPwForLocation` exists and is unit-tested
- [ ] Advance Strip refactored to use `splitPaddockWindow`; e2e behavior identical; test passes unchanged
- [ ] `edit-paddock-window.js` `areaPct` and `isStripGraze` edits on open windows route through `splitPaddockWindow`; closed-window edits keep direct `update()` (historical correction escape hatch); UI shows the "new window from today forward" caption on open windows
- [ ] `edit-paddock-window.js` reopen action blocks if another PW on the same `(eventId, locationId)` is currently open
- [ ] `move-wizard.js` close loop converted to `closePaddockWindow`
- [ ] `reopen-event.js` shows a summary dialog ("N paddock windows will be reopened. M stay closed..."); `classifyPwsForReopen` is a pure exported function with unit tests for at least four cases (reopen, keep-closed-after-reuse, keep-closed-after-swap, empty set)
- [ ] `dashboard/index.js` and `locations/index.js` read `areaPct` from the open PW instead of literal `100`
- [ ] Grep audit passes: no direct `update('eventPaddockWindows', ...)` in `src/features/**` mutating `areaPct`, `isStripGraze`, or `stripGroupId` on open windows except inside the helper
- [ ] Grep audit passes: no `areaPct: 100` literal reads in `src/features/**` except tests
- [ ] Orphan cleanup script run once (CP-55 export-then-inspect to confirm); Part A helper assertions in place
- [ ] `V2_APP_ARCHITECTURE.md` §4.4 extended with paddock-side subsection, helper signatures, and grep-contract row
- [ ] E2E test: edit an open paddock window's `areaPct` from 100 to 50 → two rows exist, old one closed on today with `areaPct = 100`, new one open with `areaPct = 50`; pasture cover calc for today reads `areaPct = 50`; historical range calc reads both segments
- [ ] 910+ tests pass; no regressions

**CP-55/CP-56 impact:** **none.** Pattern creates more `event_paddock_window` rows over time; existing export/import already handles the table. No new columns, no renames, no removals, no backup-migration chain entry. Part B orphan cleanup is an app-side script (no SQL migration, no `schema_version` bump) — it writes `dateClosed` updates that flow through the normal sync path, identical to any other app mutation, so it does not affect export/import shape.

**Schema change:** **none.** Existing columns (`is_strip_graze`, `strip_group_id`, `area_pct` per GH-4) already support the pattern. Multiple rows per `(event_id, location_id)` are already allowed.

**Related:**
- **OI-0091** — direct architectural parallel on the group side. OI-0095 copies its structure, helper contract pattern, and grep-contract discipline.
- **OI-0094** — reuses the pattern of (a) lift pattern into helper, (b) wire every entry point, (c) update §4.4 table. `classifyGwsForReopen` in OI-0094 is the direct pattern for `classifyPwsForReopen` here.
- **OI-0073** — Parts A/B orphan cleanup pattern is copied for the paddock side.
- **GH-4** (`github/issues/GH-4_strip-grazing-paddock-windows.md`) — owner of the strip grazing feature spec. OI-0095 is the plumbing that makes that feature behave correctly across all entry points. OI-0095 does not re-spec GH-4.
- **Batched follow-ups to sequence with this OI** (per Tim, 2026-04-18):
  - Weight-side completeness OI — Quick Weight sheet (`src/features/health/weight.js`) never calls `splitGroupWindow`; Edit Animal `currentWeight` input is created but silently no-ops (read gap in `saveAnimal`). Scope ~1 day.
  - Correction OI for OI-0090 session brief — §7 Remove group incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point (closes the PW but doesn't touch `animal_group_memberships`, so "empty" doesn't apply). Apply correction + commit note; scope < 1 hour.

---

### OI-0094 — Group state-change entry point completeness (package 2 after OI-0091)
**Added:** 2026-04-17 | **Area:** v2-build / groups / events / architecture | **Priority:** P0 (silent calc wrongness persists on 11 entry points even after OI-0091 ships)
**Checkpoint:** runs AFTER OI-0091 + OI-0073 package lands

**Status:** closed — 2026-04-18. All ten in-scope entry points (entry #11 Animals bulk Move removed by OI-0093) now route state changes through OI-0091's helpers. `src/features/animals/index.js` Edit Group, Edit Animal, Group Weights, Split Group all call `splitGroupWindow` via the shared `maybeSplitForGroup` helper. `src/features/health/calving.js` splits the dam's group window on new calf membership. `src/features/events/group-windows.js` §7 Add opens with system-generated live values (view-only); §7 Remove calls `closeGroupWindow`. `src/features/events/edit-group-window.js` renders `headCount` / `avgWeightKg` view-only on open windows (with "System generated from live memberships" caption — v1 parity, locked sub-decision 2026-04-17); closed windows keep editable inputs as historical-correction escape hatch; Delete button now shows the spec'd confirm. `src/features/events/reopen-event.js` replaced the conflict dialog with a summary dialog: "N group windows will be reopened. M stay closed because the group has since left." `classifyGwsForReopen` is exported + unit-tested (4 cases). V2_APP_ARCHITECTURE.md §4.4 expanded with the authoritative 13-entry-point table and updated grep-contract exception list. 894 tests pass.

**Why a second package:** OI-0091's original scope covered three flows — cull, whole-group move, and event close. A follow-up audit of the codebase found eleven more places where a group's state (head count, avg weight, or membership composition) can change mid-event without calling the window-split helpers. Every one of those paths generates the same class of stale-snapshot bug OI-0091 fixes for the three covered flows. This OI covers the remaining eleven so the architectural rule ("split on every state change") is complete.

**The eleven entry points (grep-confirmed in current code):**

| # | Flow | File + line | What mutates |
|---|------|-------------|--------------|
| 1 | Edit Group sheet — add/remove animals via checkboxes | `src/features/animals/index.js:512-521` | memberships added + old memberships on other groups closed |
| 2 | Split Group sheet — Split button on group tile | `src/features/animals/index.js:723-726` | source memberships closed, new memberships created on target group |
| 3 | Edit Animal → group dropdown change | `src/features/animals/index.js:1280-1300` | old membership closed, new one opened |
| 4 | Group Weights sheet (bulk weight update on group tile) | `src/features/animals/index.js:976+` | per-animal `weight_kg` updates → group's live avg weight shifts |
| 5 | Calving flow (new calf → group membership) | `src/features/health/calving.js:161-162` | new membership created for calf; head count +1 |
| 6 | §7 "Add group" button (Edit Event dialog) | `src/features/events/group-windows.js:118` | opens a new `event_group_window` mid-event |
| 7 | §7 "Remove group" button (Edit Event dialog) | `src/features/events/group-windows.js:202` | closes an open `event_group_window` |
| 8 | §7 per-row Edit dialog — `headCount` / `avgWeightKg` fields | `src/features/events/edit-group-window.js:65, 67, 108` | on OPEN windows: render as view-only (live values, v1 parity — see locked sub-decision below); on CLOSED windows: remain editable (historical correction) |
| 9 | §7 per-row Edit dialog — Delete window | `src/features/events/edit-group-window.js:128` | hard-deletes a window; no cascade |
| 10 | Event reopen (clears `date_out`) | `src/features/events/reopen-event.js` | may need to reopen previously-closed windows |
| 11 | Animals bulk Move action (green action bar → Move to group) | `src/features/animals/index.js:1351-1356` | closes old membership, opens new — though this entry point may be removed by OI-0093 |

**Sub-decision — LOCKED 2026-04-17 — §7 per-row `headCount` / `avgWeightKg` on open windows (entry #8):**

On an **open** window, OI-0091 makes the stored `head_count` irrelevant — render and calc paths read live from memberships. A farmer's manual edit in §7 would therefore be silently overridden (type 6, save, card still shows 10 because live memberships say 10).

**Decision: render `headCount` and `avgWeightKg` as view-only on open windows. v1 treated these as system-generated and the v2 architecture makes them derived for open windows.** Tim, 2026-04-17: *"Ok those two fields should be view only. That's how they were in v1 as well. System generated."*

Implementation:

- When `dateLeft === null` (open window), render `headCount` and `avgWeightKg` as read-only labels showing the **live** values (from `getLiveWindowHeadCount(gw)` / `getLiveWindowAvgWeight(gw)`), styled as disabled/grey, with a small caption: *"System generated from live memberships. Use Cull, Move, or Reweigh to change."*
- When `dateLeft !== null` (closed window), the two fields remain editable — a closed window's snapshot is historical truth, and manual correction is the right escape hatch for mistakes (e.g., cull was logged with the wrong count).
- Date/time joined and date/time left fields remain editable in both states.

**Why:** Matches v1's "system generated" model (so farmers aren't relearning behavior) and enforces the OI-0091 architectural rule at the UI layer (open = live, closed = snapshot).

**Scope (the package):**

For every entry point above, the pattern is the same:

1. Replace the direct membership/window mutation with the appropriate call to OI-0091's helpers:
   - **Membership change that affects head count or avg weight on an open event** → call `splitGroupWindow(groupId, eventId, changeDate, changeTime, { headCount: liveCount, avgWeightKg: liveAvgWeight })` immediately after the membership mutation.
   - **Terminal state change (last animal gone, or explicit remove from event)** → call `closeGroupWindow(groupId, eventId, closeDate, closeTime)`.
   - **"Add group to event" (entry #6)** → treat as opening a new window with live values; no split needed (no prior open window for this group on this event).
   - **"Remove group from event" (entry #7)** → call `closeGroupWindow` directly instead of bare `update()`.
   - **§7 per-row Edit `headCount`/`avgWeightKg` (entry #8)** → open windows render view-only from `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` with a "System generated from live memberships" caption; closed windows keep current editable behavior. See locked sub-decision above.
   - **Delete window (entry #9)** → no change to logic, but add a confirmation that this hard-deletes historical data and should only be used to clean up mistakes.
   - **Event reopen (entry #10)** → for each window that was closed by the event-close flow on `date_out`, check: if the group's next event uses the same location, reopen the window (clear `dateLeft`/`timeLeft`); if the group has since moved or been culled, keep closed. Farmer should see a summary dialog: *"N group windows will be reopened. M stay closed because the group has since left."*

2. Each entry point gets a unit test verifying the helper is called with the right arguments after the mutation. The e2e test suite gains one additional flow per pair of entry points (e.g., one for Animals-screen flows, one for §7 flows, one for calving).

3. No new store helpers beyond OI-0091's. No new calc helpers. No schema change. No CP-55/CP-56 impact.

**Files likely affected:**

- `src/features/animals/index.js` — entry points 1, 2, 3, 4, 11 (five call sites, all need to call `splitGroupWindow` after the membership mutation)
- `src/features/health/calving.js` — entry point 5
- `src/features/events/group-windows.js` — entry points 6, 7
- `src/features/events/edit-group-window.js` — entry points 8 (sub-decision resolution), 9
- `src/features/events/reopen-event.js` — entry point 10 (with new summary dialog)
- `tests/unit/animals.test.js`, `tests/unit/calving.test.js`, `tests/unit/edit-group-window.test.js`, `tests/unit/group-windows.test.js`, `tests/unit/reopen-event.test.js` — unit tests per entry point
- `tests/e2e/group-state-change-completeness.spec.js` (new) — representative end-to-end flows

**Why not fold into OI-0091 now:** Claude Code is already executing OI-0091. Widening its scope mid-flight adds churn and risks either a rushed incomplete first pass or a delayed ship of the core architectural fix. Running as package 2 lets package 1 land clean, Tim verify the Shenk Culls fix in field data, and package 2 complete the architectural coverage without scope creep.

**Acceptance criteria:**
- [x] Sub-decision on §7 per-row `headCount` / `avgWeightKg` (entry #8) locked 2026-04-17: view-only on open windows, editable on closed windows (v1 parity — system generated).
- [ ] All eleven entry points call `splitGroupWindow` / `closeGroupWindow` (or have an explicit documented reason not to).
- [ ] §7 per-row Edit dialog renders `headCount` and `avgWeightKg` as disabled view-only when `dateLeft === null`, reading from `getLiveWindowHeadCount` / `getLiveWindowAvgWeight`. Caption reads *"System generated from live memberships. Use Cull, Move, or Reweigh to change."*
- [ ] §7 per-row Edit dialog keeps `headCount` / `avgWeightKg` editable when `dateLeft !== null` (closed window = historical correction permitted).
- [ ] Unit tests cover each entry point. Edit-group-window test covers both open (view-only) and closed (editable) paths.
- [ ] E2E test: add an animal to a group via Edit Group sheet (entry #1) → event detail §7 head count increases by 1, dashboard card matches; add a calf via calving (entry #5) → same check; §7 Remove group (entry #7) → window closes with live values; event reopen (entry #10) → summary dialog renders with expected counts.
- [ ] No direct `event_group_windows` mutations remain in the eleven files above except via the two helpers (grep check per entry point).
- [ ] OI-0091's `V2_APP_ARCHITECTURE.md` section gets a table of all entry points that must use the helpers (living reference for future flow authors).
- [ ] PROJECT_CHANGELOG.md updated.

**CP-55/CP-56 impact:** none. More rows over time; schema unchanged.

**Related:** OI-0091 (hard dependency — this is its completion package), OI-0073 (shares the "orphan prevention" theme), OI-0093 (if entry #11 Animals bulk Move is removed by OI-0093, update this scope to reflect that).

---

### OI-0093 — Animals screen: remove bulk action bar + conform group dropdown in Edit Animal
**Added:** 2026-04-17 | **Area:** v2-build / animals / UI | **Priority:** P1 (redundant UI + styling inconsistency)

**Status:** closed — 2026-04-18. Green bulk action bar + `#animals-action-bar` DOM + `renderActionBar()` + `selectedAnimals` Set + per-row checkbox column all removed from `src/features/animals/index.js`. `openAnimalMoveSheet` deleted (only caller was the action bar; grep confirmed). Edit Animal → Group field rewritten from raw `<select>` to v2 `loc-picker` tap-to-select rows (matches Move wizard + group-add patterns). OI-0094 entry #11 done-by-default — flow removed entirely.

**What's wrong:**

1. **Green bulk action bar on Animals screen** — when any animal is tapped via its row checkbox, a full-width green bar slides in at the top of the Animals screen showing `"N selected · Move to group · New group · Cancel"`. Confirmed in Tim's screenshot (2026-04-17). The bar is redundant: every action it exposes is already available per-animal via the row's Edit button (→ opens Edit Animal dialog with group dropdown) or per-group via the group tile's Edit / Split / Weights / × actions. The bulk action bar adds a second, parallel interaction pattern without adding capability.
2. **Group dropdown in Edit Animal dialog uses raw `<select>` styling** — does not match the rest of the app's picker/dropdown conventions (see v2 design system tokens used elsewhere — e.g., batch picker in Deliver Feed, group picker in Move wizard). Creates visual inconsistency and looks unfinished.

**Fix:**

1. **Remove the bulk action bar entirely.** Delete the `#animals-action-bar` DOM element, `renderActionBar()` function, and the `selectedAnimals` Set + click-handler that maintains it (`src/features/animals/index.js` lines 29, 59, 65, 215–227, 310–335, 378, 1323, 1358). Remove the checkbox column from each row. The row's existing Edit button becomes the primary per-animal action.
2. **Remove `openAnimalMoveSheet`** if it is only called from the action bar. If it is called elsewhere (e.g., from another entry point), leave the function and rewire its callers. Grep before removing.
3. **Rewrite the group dropdown in Edit Animal dialog** (`src/features/animals/index.js:1104`) to use the standard v2 picker pattern — tap-to-open sheet with selectable rows, consistent with the rest of the app. Verify against the pattern used in the Move wizard group picker or Deliver Feed batch picker (whichever is closer to the pattern documented in V2_DESIGN_SYSTEM.md).

**Interaction with OI-0094:** Entry point #11 (Animals bulk Move action) goes away entirely with OI-0093. Update OI-0094's entry point table to remove #11 once OI-0093 ships.

**Files affected:**
- `src/features/animals/index.js` — remove action bar, remove checkbox column, rewrite group dropdown to picker pattern
- (If `openAnimalMoveSheet` is orphaned) delete the function + its sheet DOM
- `tests/unit/animals.test.js` — remove tests for the deleted bulk flow; add tests for the new group picker
- `PROJECT_CHANGELOG.md`

**Acceptance criteria:**
- [ ] No green bulk action bar appears on the Animals screen under any condition.
- [ ] Per-row checkbox is removed. Each animal row has an Edit button as its primary action.
- [ ] Edit Animal → Group field uses the standard v2 picker pattern (consistent with Move wizard or Deliver Feed pickers).
- [ ] Group change in Edit Animal correctly closes old membership and opens a new one (existing behavior, verify still works after UI change).
- [ ] OI-0094's entry point #11 marked done-by-default (flow removed).
- [ ] Unit tests pass; visual check against design system.

**CP-55/CP-56 impact:** none. UI change only.

**Related:** OI-0094 (removes one of its eleven entry points), SP-10 (design-system-conformant picker pattern).

---

### OI-0092 — Residual feed NPK deposits (v1 parity gap)
**Added:** 2026-04-17 | **Area:** v2-build / calcs / feed / fertility | **Priority:** P2 (feature gap — grazing math ignores residual feed as nutrient input to pasture)
**Checkpoint:** post-OI-0091 track — full spec session required before build

**Status:** open — stub only. Flagged during OI-0091 design when Tim asked whether unconsumed/un-transferred feed ends up on the fertility ledger.

**What's wrong:** v1 had a `feed_residual` NPK source alongside `livestock_excretion`. When feed was left on pasture at event close (not consumed, not transferred), v1's `calcResidualOM()` computed the residual organic matter and its N/P/K contribution was deposited to the paddock fertility ledger. v2 dropped this entirely:
- v2 has no residual-feed concept in calcs (V2_CALCULATION_SPEC.md's "residual" refs are all pasture-grass-height, not feed).
- v2's NPK-1 covers only livestock excretion.
- Move wizard close (`src/features/events/move-wizard.js` line 482) hardcodes `remainingQuantity: 0` on close-reading, treating all unconsumed feed as vanished. No NPK deposit fires.
- Net: any event with leftover feed understates NPK deposited on the pasture. Farmer's fertility ledger is incomplete.

**Source references:**
- v1: `GTHO_V1_FEATURE_AUDIT.md` line 479 (`calcResidualOM` formula), line 932 (`feed_residual` NPK source), line 1218 (v1 had `event_feed_residual_checks` table).

**What's needed (short form — full spec required):**
1. **Capture residual at close.** Replace hardcoded zero with a farmer prompt at event close and move close: "Was any feed left on pasture?" Capture remaining qty per batch × location.
2. **Schema addition.** Either `event_feed_entries.residual_qty` (per-entry) or a new `event_feed_residual_deposits` table (per close-event aggregate) — decide during spec. Probably the latter for clean parity with `npk_deposits` shape.
3. **New calc (NPK-R or equivalent).** `n_kg = residual_qty × weight_per_unit_kg × (dm_pct / 100) × batch.n_per_tonne_dm / 1000`. Same for P and K. Port or revise v1's `residualPct` multiplier.
4. **NPK ledger integration.** Deposit rows with source `feed_residual` alongside existing `livestock_excretion` rows. Dashboard + reports pick them up without further wiring (same ledger surface).
5. **UI.** Residual capture step in close flows (event close + move close). Post-close edit path via SP-10 for corrections.
6. **v1 migration transform.** Port `event_feed_residual_checks` rows to the new v2 shape.
7. **CP-55/CP-56 impact.** New column or table → export/import spec update, schema_version bump, backup-migrations chain entry.

**Dependencies:** architecturally independent of OI-0091, but sequencing matters. OI-0091's close flows are the natural insertion point for the residual-capture step. Build OI-0091 first; OI-0092's UI plugs into the existing close path.

**Explicit non-scope of OI-0091:** OI-0091 must **not** modify the `remainingQuantity: 0` behavior. That line stays as-is until OI-0092 lands. OI-0091's spec includes a placeholder comment pointing to OI-0092 so Claude Code doesn't "helpfully" change it.

**Schema change:** yes, shape TBD.

**CP-55/CP-56 impact:** yes — detailed in full spec when written.

**Related:** OI-0091 (close flow integration point), v1 FEED-09 (`calcConsumedDMI` + `calcResidualOM`), v1 NUT-02 (NPK deposits ledger `feed_residual` source).

---

### OI-0091 — Event Window Split on State Change (architectural fix)
**Added:** 2026-04-17 | **Area:** v2-build / events / calcs / architecture | **Priority:** P0 (every calc on every open event is wrong after any cull, reweigh, or move; actively corrupting today's field data)
**Checkpoint:** blocks further field testing — ship with OI-0073 as coordinated package

**Status:** closed — 2026-04-18. Shipped as coordinated package with OI-0073. New store helpers `splitGroupWindow` / `closeGroupWindow` at the mutation site; live-read helpers `getLiveWindowHeadCount` / `getLiveWindowAvgWeight` in `src/calcs/window-helpers.js`; calc + render reroutes across dashboard, event detail, reports, rotation-calendar, retro-place, FOR-5; flow wiring in cull-sheet, move-wizard (close + destination w/ duplicate-open guard), event-close; new V2_APP_ARCHITECTURE.md §4.4 "Window-Split on State Change"; 15 new unit tests + e2e sync verification. `remainingQuantity:0` in move-wizard unchanged per OI-0092 non-scope. 890 tests pass. **OI-0090 unblocked** — empty-group archive flow can now build on the new trigger points.

**What's wrong (reproduced today):** Tim culled 4 head from Shenk Culls (10 → 6, then later → 5). Animals screen correctly shows 5 (it reads live `animal_group_memberships`). Every other surface — dashboard location card, event detail sheet §7, rotation calendar, reports — shows 10, because they read `event_group_windows.headCount`, which is a snapshot stamped at group-join time and never updated. Every DMI / NPK / AU / animal-days / days-remaining / stored-feed-demand / cost-per-day number on that event is ~50% overstated.

Independent but compounding: move wizard close loop (lines 502–507) sets only `dateLeft`/`timeLeft`, never stamps live values. And move wizard destination creation (lines 562–563, 603–604) copies the stale source snapshot forward (`headCount: gw.headCount, avgWeightKg: gw.avgWeightKg`), so a brand-new destination window inherits the lie on day one.

**Architectural principle (new — belongs in `V2_APP_ARCHITECTURE.md`):**

An `event_group_window` is a **period of stable group state** on an event. During that period, the group's `headCount`, `avgWeightKg`, and composition are constant by definition. When any of those change — cull, reweigh, wean, split, move, composition change — the current open window **closes on the change date with its final live values stamped in**, and a new window **opens the same date with the new state**. Closed windows are historical truth (their snapshot is authoritative forever). The open window is synthetic — its stored `headCount` / `avgWeightKg` are irrelevant on open rows; render and calc paths always recompute from live memberships for windows where `dateLeft IS NULL`.

**Rule of thumb:** *stored snapshot for closed windows, live recompute for open windows, split on every state change.*

**Scope (the package):**

1. **Two new store helpers** (`src/data/store.js`):
   - `splitGroupWindow(groupId, eventId, changeDate, changeTime, newState)` — closes the current open window for (group, event) by stamping **current live** `headCount` and `avgWeightKg` into the row and setting `dateLeft`/`timeLeft`; opens a new window dated `changeDate`/`changeTime` with `newState.headCount` and `newState.avgWeightKg` recomputed from live memberships.
   - `closeGroupWindow(groupId, eventId, closeDate, closeTime)` — same close step as `splitGroupWindow` but no new window opens. Used on terminal state changes (event close, last-membership-gone).

2. **Cull flow (`src/features/animals/cull-sheet.js`)** — after the existing `animal_group_memberships` close from OI-0086, call `splitGroupWindow`. If remaining head count is 0, call `closeGroupWindow` instead. **This subsumes OI-0090 Part 1 cascade.** OI-0090's dedicated `onLastMembershipClosed` helper is no longer needed — the last-membership case falls out naturally from `closeGroupWindow` when the live count is 0.

3. **Move wizard close path** (`src/features/events/move-wizard.js` lines 500–507) — replace the `update(…dateLeft, timeLeft)` loop with `closeGroupWindow` per group. Live values get stamped on close.

4. **Move wizard destination creation** (lines 554–566 and 596–607) — replace `headCount: gw.headCount, avgWeightKg: gw.avgWeightKg` with recomputed values from live `animal_group_memberships`. This is the "open" step of a split — write live, not copy source.

5. **Move wizard "existing event" duplicate-open guard** (lines 596–607) — before creating a new GW on a destination event of type `existing`, check if the group already has an open window on that event. If yes, log warning and skip. Prevents the class of orphan OI-0073 is also cleaning up.

6. **Event close flow (`src/features/events/close.js`)** — convert close loop to `closeGroupWindow` pattern so event close also stamps live values. (Sanity-check only if flow already does this; the grep suggests it doesn't.)

7. **Live-recompute helpers for render/calc** (`src/calcs/window-helpers.js` — new file):
   - `getLiveWindowHeadCount(gw)` — if `gw.dateLeft === null`, returns live count from memberships; else returns stored `gw.headCount`.
   - `getLiveWindowAvgWeight(gw)` — same pattern using live animal weights.
   - All render paths (`features/dashboard/index.js`, `features/events/detail.js`, `features/events/rotation-calendar/*`, `features/reports/*`) and calc input assembly route through these helpers. **No direct `gw.headCount` / `gw.avgWeightKg` reads** in render/calc paths after this change (grep-enforceable).

8. **Architectural doc update** — new section in `V2_APP_ARCHITECTURE.md` titled "Event Window Split on State Change" documenting the principle, the helpers, and the render/calc rule. Becomes the canonical reference for future flow authors (reweigh OI-0065, wean, split, composition change, per-group move OI-0066).

**Ships together — OI-0073 in same package:**

OI-0073's root cause attribution ("orphaned from v1 migration") was too narrow. Fresh v2 data is generating orphans too, because pre-OI-0091 flows don't honor the split pattern. Confirmed today on Tim's Shenk Culls move. OI-0073 scope widens:
- **Part A (code fix)** — keep as spec'd: prefer GWs linked to open events.
- **Part B (data cleanup)** — keep as spec'd: set `dateLeft` on orphan GWs. Must cover both v1-migration origin and fresh-v2 flow-bug origin.
- **Part C (new)** — note in OI-0073: after OI-0091 lands, orphan creation is architecturally prevented going forward. No new orphans from well-behaved flows.

OI-0073's spec file and OI body updated in the same commit as OI-0091.

**Explicit non-scope:**

- **Residual feed NPK / fertility ledger** → OI-0092 (separate track). Claude Code **must not** change the `remainingQuantity: 0` behavior in `move-wizard.js` line 482 during this work. Add a placeholder code comment pointing at OI-0092 so it's clear why it stays.
- **Per-group move variant** → OI-0066 (follow-up). Once `splitGroupWindow` exists, a per-group move becomes trivial; not in this scope.
- **Reweigh flow** → OI-0065 (DESIGN REQUIRED on UX; uses these helpers once spec'd).
- **Retroactive cleanup of already-stale stored snapshots on historical closed windows** — not worth a one-time migration. SP-10 §7 edit-group-window dialog gives manual correction path.

**Files likely affected:**
- `src/data/store.js` — new `splitGroupWindow()` and `closeGroupWindow()` helpers
- `src/calcs/window-helpers.js` — new file with `getLiveWindowHeadCount` / `getLiveWindowAvgWeight`
- `src/features/animals/cull-sheet.js` — call helper after membership close
- `src/features/events/move-wizard.js` — replace close loop (lines 500–507), destination create (554–566, 596–607), add duplicate-open guard
- `src/features/events/close.js` — convert to helper
- `src/features/dashboard/index.js` — route all `gw.headCount` / `gw.avgWeightKg` reads through helpers
- `src/features/events/detail.js` — same
- `src/features/events/rotation-calendar/calendar-grid.js`, `past-block.js` — same
- `src/features/reports/*` — audit for direct reads, convert
- `V2_APP_ARCHITECTURE.md` — new section "Event Window Split on State Change"
- `tests/unit/store-window-split.test.js` (new) — pure helper tests
- `tests/unit/calcs-window-helpers.test.js` (new) — live-recompute helper tests
- `tests/unit/cull-sheet.test.js` — extend for window-split call
- `tests/unit/move-wizard.test.js` — extend for live-stamp-on-close, live-read-on-destination, duplicate-open guard
- `tests/e2e/cull-updates-dashboard.spec.js` (new) — cull → dashboard card + event detail + DMI reflect new count immediately

**Acceptance criteria:**
- [ ] `splitGroupWindow` and `closeGroupWindow` exist, unit-tested pure (given memberships + change → expected row mutations)
- [ ] Cull flow calls one of the two helpers; tests cover partial cull (opens new window) and full cull (closes only, no new open)
- [ ] Move wizard close stamps live `headCount` + `avgWeightKg` into closing rows (not just `dateLeft`/`timeLeft`)
- [ ] Move wizard destination rows pull live values from memberships; test: stale source snapshot + live cull after snapshot → destination row uses live count
- [ ] Move wizard rejects duplicate open window on "existing event" destination (unit test)
- [ ] Event close converted to `closeGroupWindow`; same stamping guarantee
- [ ] Grep audit passes: no direct `gw.headCount` / `gw.avgWeightKg` reads in `src/features/**` or `src/calcs/**` outside the window-helpers module itself
- [ ] All calcs receive recomputed values for open windows; unit test covers "live recompute drops DMI" for a post-cull scenario
- [ ] `V2_APP_ARCHITECTURE.md` has the new "Event Window Split on State Change" section
- [ ] OI-0073 Part A (code fix) and Part B (data cleanup) both ship in the same commit/session
- [ ] `remainingQuantity: 0` line in `move-wizard.js` is **unchanged**; placeholder comment added pointing to OI-0092
- [ ] E2E test: cull an animal → dashboard card and event detail both reflect new count without reload; DMI chart drops accordingly
- [ ] All prior tests pass; no regressions

**CP-55/CP-56 impact:** **none direct.** Pattern creates more `event_group_window` rows over time; existing export/import already handles the table with pagination. No new columns, no renames, no removals, no backup-migration chain entry.

**Schema change:** **none.** Existing columns support the pattern (multiple rows per event+group already allowed).

**Related:**
- **OI-0090 / SP-11** — Part 1 (cascade helper) SUBSUMED by OI-0091. SP-11 now covers only Parts 2–4 (empty-group prompt, `archived_at` migration, reactivation). OI-0090 blocked on OI-0091.
- **OI-0073** — ships in the same package; root-cause attribution widened.
- **OI-0086** (closed) — cull flow gains an additional call to `splitGroupWindow` on top of the existing membership close.
- **OI-0092** (residual feed NPK) — explicit non-scope; separate track.
- **OI-0065** (reweigh — DESIGN REQUIRED) — uses these helpers once spec'd.
- **OI-0066** (per-group move) — uses these helpers once built.
- **v1 analog lesson** (CLAUDE.md Known Traps): "UI fields without Supabase columns = silent data loss." v2 analog: "snapshot-first calcs without live recompute = silent calc-wrongness after state change."

---

### OI-0090 — Empty group archive flow (prompt + archive as first-class state)
**Added:** 2026-04-17 | **Area:** v2-build / groups / events | **Priority:** P1 (silent data integrity — empty groups need a guided archive path; manual delete orphans historical events with "?")

**Status:** closed — 2026-04-18 (Parts 2–4; Part 1 was subsumed by OI-0091). Migration 024 `archived_at TIMESTAMPTZ` applied + verified (guarded `UPDATE operations SET schema_version = 24 WHERE schema_version < 24` so Tim's DB at 25 doesn't downgrade); fresh DBs get the normal sequential bump. `src/entities/group.js` `archived boolean` → `archivedAt timestamptz` with round-trip tests. New `store.archiveGroup(id)` / `reactivateGroup(id)` actions (6-param update per Rule 7). Backup-migrations `23 → 24` chain entry now maps `archived:true` → `archived_at: updated_at || exported_at || now()`, `archived:false` → `null`, strips old `archived` key. New `src/features/animals/empty-group-prompt.js` — `maybeShowEmptyGroupPrompt(groupId)` triggers the sheet when the group has zero open memberships and isn't already archived; prompt exposes Archive (primary) / Keep active / Delete (danger, disabled when group has `event_group_window` history with tooltip "This group is on N event(s). Archive instead to preserve history."). Wired into cull-sheet, Edit Group checkboxes, Split Group, Edit Animal group change, move-wizard (guarded to only fire if live headCount < 1 after close), §7 Remove group. Management UI gets Show archived toggle + archived-section rows with Reactivate + Delete (same gating). Picker filter sweep: `!g.archivedAt` replaces `!g.archived` in animals/index.js group pickers, move-wizard (via animals/index.js), event-creation, calving, dashboard, group-windows Add. v1-migration updated to emit `archived_at` on seed. 910 tests pass (16 new across group-archive + empty-group-prompt). Follow-up: SP-11 reconciliation (merge into V2_UX_FLOWS.md §3.4 + §15.2, V2_SCHEMA_DESIGN.md §3.3) remains at sprint end.

**What's wrong (reproduced today):** Tim culled the last animal out of the Culls group. OI-0086's cull flow correctly closed the animal's `animal_group_memberships` row. But no cascade fired to the group level:
- The group's open `event_group_window` stayed open (`date_left IS NULL`) — a "ghost" group with zero head count still attached to an event. *(This symptom is now owned by OI-0091: the cull flow must split/close the window with live values at the cull date.)*
- Tim then deleted the empty group from the management UI. The historical event now renders "?" where the group name used to be — hard-deleted group leaves orphan FK references from `event_group_windows.group_id`. *(This symptom remains in scope here — needs the archive-as-state path + delete-gating.)*

Three separate bugs interacting: (1) ~~no last-membership cascade~~ **→ moved to OI-0091**, (2) no empty-group guidance (prompt), (3) group delete allowed even when referenced by events.

**Fix (scoped to Parts 2–4 after OI-0091 subsumption):**

1. ~~**Automatic cascade**~~ — **STRUCK. Owned by OI-0091 as part of the window-split architecture.** The cull/move/wean flows each call `splitGroupWindow` / `closeGroupWindow` at the mutation site with live values, stamped at the change date. The centralized "on last membership closed" helper is no longer needed — the flows that *cause* last membership to close are the same flows that must already close the window per OI-0091. (Kept here for traceability; do not build a second cascade path.)
2. **Empty-group prompt** — after a group's last membership closes AND OI-0091's window-split fires, offer Archive / Keep active / Delete. Delete is **disabled** when the group has any event history (tooltip: *"This group is on N event(s). Archive instead to preserve history."*). The trigger point is now "group has zero open memberships and the closing flow has just committed" — each flow (cull-sheet, move-wizard, wean-wizard) calls `maybeShowEmptyGroupPrompt(groupId)` after its window-split commit.
3. **Archive as first-class state** — migration 024 replaces `groups.archived boolean` with `groups.archived_at TIMESTAMPTZ` for audit. NULL = active, timestamp = archived on that date. Backfill existing `archived = true` rows.
4. **Reactivation** — group management UI gets "Show archived" toggle + Reactivate action. Clears `archived_at`, group reappears in active pickers. Seasonal cohort reuse (Weaners 2025 → Weaners 2026 on the same group record) preserves continuous history.

**Why archive as timestamp (not keep the boolean):** Tim chose Option 2 — richer audit trail (sort by archive date, show "archived last summer" context for reactivation), aligns with the upcoming schema audit session's goal of cleaning up sparse columns. Migration is small and boolean is already in live schema.

**Schema change:** Migration 024 — add `archived_at timestamptz`, backfill (`UPDATE groups SET archived_at = updated_at WHERE archived = true`), drop `archived boolean`, `CREATE INDEX idx_groups_active ON groups(farm_id) WHERE archived_at IS NULL`, bump schema_version to 24. Must follow CLAUDE.md "Write + Run + Verify" rule.

**CP-55 / CP-56 impact:** `archived_at` serialized in export. Backup-migrations.js needs v23 → v24 chain entry mapping old `archived: true` → `archivedAt = g.updatedAt || b.exported_at || now()`, `archived: false` → `archivedAt = null`, then `delete g.archived`. Schema version bump 23 → 24.

**Files likely affected (after OI-0091 scope removal):**
- `supabase/migrations/024_groups_archived_at.sql` (new)
- `src/entities/group.js` (replace `archived` → `archivedAt`, update FIELDS, create, toSupabaseShape, fromSupabaseShape, validate)
- `src/data/store.js` (add `archiveGroup()`, `reactivateGroup()` — ~~`onLastMembershipClosed()`~~ no longer needed, OI-0091 owns window closure at the mutation site)
- `src/data/backup-migrations.js` (v23 → v24 chain entry)
- `src/features/animals/cull-sheet.js` (after OI-0091's window-split commit, call `maybeShowEmptyGroupPrompt(groupId)`)
- `src/features/events/move-wizard.js` (after OI-0091's window-split commit, call `maybeShowEmptyGroupPrompt(groupId)` — only if source group is now empty)
- `src/features/groups/` (empty-group prompt sheet, management UI — Show archived toggle, Reactivate button, Delete gating)
- All group pickers (move wizard, event creation, field mode, CRUD list) — filter by `archivedAt IS NULL`
- `tests/unit/group.test.js`, `tests/unit/backup-migrations.test.js`
- `tests/e2e/` — full cull-to-archive-to-reactivate round-trip with Supabase verification

**Related:** OI-0091 (**blocks this OI**; owns the automatic window-closure that was Part 1 of this flow), OI-0086 (cull flow, closed — this builds on its membership close), OI-0073 (group placement detection — ships in the OI-0091 package; both deal with event_group_window hygiene), §3.3 Composition Change (weaning flow — OI-0091's split pattern already covers weaning state change).

---

### OI-0089 — V2_SCHEMA_DESIGN.md missing `animal_notes` and `event_observations` sections
**Added:** 2026-04-17 | **Area:** v2-docs | **Priority:** P3 (doc drift only, no runtime effect)
**Checkpoint:** Local-only fields audit follow-up
**Status:** closed — 2026-04-17. Added §5.8 `event_observations` (Domain 5, after §5.7 paddock_observations) and §9.11 `animal_notes` (Domain 9, after §9.10 animal_weight_records — Domain 9 matches migration 012's "Domain 9 amendment" header; earlier "suggest §3.5" placement was overridden once the migration intent was checked). Both sections built from the live `SCHEMA_DUMP_2026-04-17.md` columns rather than the on-disk migrations alone, so migration 022's `bale_ring_residue_count` addition to `event_observations` is captured. Style matches existing neighbors (column table + design decisions + CREATE TABLE). Change Log row added to V2_SCHEMA_DESIGN.md. No schema change.

**What was wrong:** Two tables existed in live Supabase, in entity/store/migration/backup code, and in `V2_MIGRATION_PLAN.md §5.3a` — but were not documented in the canonical design doc:
- `animal_notes` — added in migration 012 (`012_d9_animal_notes.sql`)
- `event_observations` — added in migration 021 (`021_create_event_observations.sql`) + `bale_ring_residue_count` from migration 022

**Impact:** Pure doc drift. Any contributor treating `V2_SCHEMA_DESIGN.md` as canonical would not know these tables exist.

**Related:** FIND-01 in `AUDIT_LOCAL_ONLY_FIELDS.md`.

---

### OI-0088 — `CURRENT_SCHEMA_VERSION = 20` in backup-import.js is stale (live is 23)
**Added:** 2026-04-17 | **Area:** v2-build / backup-restore | **Priority:** P0 (current-version backups not round-trippable)
**Checkpoint:** Local-only fields audit follow-up

**Status:** closed — 2026-04-20 (reconciliation sweep). **Moot.** `src/data/backup-import.js:20` now reads `const CURRENT_SCHEMA_VERSION = 29;` — migrations 021 through 029 all bumped the constant as they landed, so the drift this OI captured was resolved organically by later schema work. `BACKUP_MIGRATIONS` chain in `src/data/backup-migrations.js` carries entries for every step from 14 → 29, including the 28→29 entry added by OI-0113 for the `event_observations` drop. The mechanical unit test proposed here (`expect(CURRENT_SCHEMA_VERSION).toBe(max(migration file numbers))`) is still valuable — log as a separate test-hygiene item if it isn't in place yet.

**What's wrong:**
```
backup-import.js: CURRENT_SCHEMA_VERSION = 20
live Supabase:   operations.schema_version = 23
```

A backup exported today from the live app carries `schema_version: 23`. When re-imported into the current build:
- If the importer rejects future backups (`backup.schema_version > CURRENT_SCHEMA_VERSION`) → import fails entirely.
- If the importer caps migration at `CURRENT_SCHEMA_VERSION` → the migration chain stops at 20 and columns added in migrations 021–023 (`event_observations` table, `survey_bale_ring_columns`, `feed_removal_columns`) are not migrated. Any backup originating from those columns is silently mis-migrated.

Either way, **current-version backups are not round-trippable through the current app.** Exact severity depends on importer branch logic — P0 if reject-on-future, P1 if silent mis-migration.

Note: the `BACKUP_MIGRATIONS` chain itself is fine — entries cover 14 → … → 22 → 23. Only the `CURRENT_SCHEMA_VERSION` constant is stale.

**Root cause:** Migrations 021, 022, 023 landed without bumping `CURRENT_SCHEMA_VERSION`. Same root cause as OI-0087 (Export/Import Spec Sync Rule not followed).

**Fix (Claude Code, session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md`):**
1. `src/data/backup-import.js`: `const CURRENT_SCHEMA_VERSION = 23;`
2. Verify `BACKUP_MIGRATIONS` entries 20, 21, 22 each advance `schema_version` by 1 correctly (chain was already confirmed during the audit).
3. Add a unit test: `expect(CURRENT_SCHEMA_VERSION).toBe(max(migration file numbers))`. Mechanical check catches the next one.

**Related:** FIND-03 in `AUDIT_LOCAL_ONLY_FIELDS.md`. Same deploy as OI-0087.

---

### OI-0087 — `event_observations` missing from backup pipeline (BACKUP_TABLES + FK_ORDER)
**Added:** 2026-04-17 | **Area:** v2-build / backup-restore | **Priority:** P1 (silent data loss on every backup round-trip)
**Checkpoint:** Local-only fields audit follow-up

**Status:** closed — 2026-04-20 (reconciliation sweep). **Moot.** The `event_observations` table no longer exists: OI-0112 (2026-04-18) migrated every writer to `paddock_observations`, OI-0119 (2026-04-20) migrated the last reader (DMI-8) to `paddock_observations`, and OI-0113 (migration 029, 2026-04-20) dropped the table outright. `src/data/backup-migrations.js:128` deletes `b.tables.event_observations` from any older backup during the 28→29 chain. There is no longer a table to include in `BACKUP_TABLES` or `FK_ORDER`; the three-file edit this OI proposed would be incorrect now. V2_SCHEMA_DESIGN.md §5.8 is a tombstone entry; V2_MIGRATION_PLAN.md §5.3a no longer lists the table. **Backup round-trip is correct for current-version data** — pre/post-graze observations live in `paddock_observations` (already in `BACKUP_TABLES`). The unit test this OI proposed (`expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length)`) is still a worthwhile mechanical check for the future and should land as a separate hygiene item if it isn't in place yet.

**What's wrong:**

| File | Status |
|---|---|
| `src/data/backup-export.js` `BACKUP_TABLES` | ❌ Missing (49 entries, should be 50) |
| `src/data/backup-import.js` `FK_ORDER` | ❌ Missing (49 entries, should be 50 at position 32) |

Migration 021 created the `event_observations` table. The entity file, store, sync-registry, live Supabase, and §5.3a FK list all know about it. But the backup export/import does not.

**Impact:** Farmers creating event observations (a SP-2-era feature) have data written to Supabase correctly, but:
- Exporting a backup silently drops every observation.
- Restoring a backup from today, if observations were captured in its source Supabase, silently drops them — `BACKUP_TABLES` never fetched them in the first place.

Every event observation ever created is at risk of loss the moment a farmer restores a backup to reset state or migrate between environments.

**Root cause:** Migration 021 landed without updating the backup spec in lockstep — exactly the class of bug the CLAUDE.md "Export/Import Spec Sync Rule" was written to prevent. Rule wasn't followed.

**Fix (Claude Code, session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md`):**
1. Add `event_observations: { paginate: true },` to `BACKUP_TABLES` in `src/data/backup-export.js` (position per §5.3a — after `event_paddock_windows`, before `event_group_windows`).
2. Add `'event_observations',` to `FK_ORDER` in `src/data/backup-import.js` at position 32 (between `event_paddock_windows` and `event_group_windows`).
3. Add a unit test: `expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length)`. Mechanical check catches the next one.

**CP-55/CP-56 impact:** yes — fixing this IS the CP-55/CP-56 spec-sync correction. No further spec work needed beyond the three file edits above; §5.3a is already correct.

**Related:** FIND-02 in `AUDIT_LOCAL_ONLY_FIELDS.md`. Same deploy as OI-0088.

---

### OI-0086 — Cull Sheet: replace broken stub with v1-parity dialog (date + reason + notes to Supabase)
**Added:** 2026-04-17 | **Area:** v2-build / animals | **Priority:** P1 (silent data loss on every cull today)
**Checkpoint:** Animals screen v1 parity follow-up
**Status:** closed — 2026-04-17. Filed as GH-13. New `src/features/animals/cull-sheet.js` with `openCullSheet`, `buildCulledBanner`, and pure helpers (`confirmCull`, `reactivateAnimal`, `buildAnimalLabel`, `CULL_REASONS`). Cull sheet captures date/reason/notes and persists `active=false` + 3 cull fields to Supabase; closes all open `animal_group_memberships` with `reason='cull'` on the cull date. Red banner replaces the placeholder; Reactivate clears all four fields. Fixed 3 stale `a.culled` references (filter, isCulled badge, group picker) to use `a.active === false`. All 6-param store calls verified per CLAUDE.md Rule 7. 12 unit tests + skeletal e2e sync-verification spec. 872 tests.

**What's wrong:** The v2 animal edit dialog uses `window.prompt()` for culls (`src/features/animals/index.js` lines 1241–1261), captures only a reason string, and sends `{ culled: true, cullReason: reason }`. The animal entity has no `culled` field — the correct field is `active` (boolean). So:
- `culled: true` never reaches Supabase via `toSupabaseShape()` — it's dropped silently.
- The reactivate button reads `existingAnimal.culled`, always undefined → UI can never show the culled state.
- No cull date is ever captured.
- No cull notes are ever captured.
- Culled animals stay visible in lists because `active` never flips.

Violates the "no local-only fields" rule and the v1-parity rule.

**What's already correct (no changes needed):**
- Schema: `animals.cull_date`, `cull_reason`, `cull_notes`, `active` all exist.
- Migration 003_d3 has all four columns.
- `src/entities/animal.js` has `cullDate`, `cullReason`, `cullNotes`, `active` with `sbColumn` mappings and full round-trip in `toSupabaseShape` / `fromSupabaseShape`.

**Fix (UI-only):** Spec in `github/issues/cull-sheet-v1-parity.md`. Build a proper Cull Sheet (date, reason dropdown with 9 v1 options, notes) opened from the "Cull animal…" button. On confirm: update the animal with all four fields, close any open `animal_group_memberships` rows on the cull date, toast, close both sheets. Replace the placeholder banner with the v1 red banner showing reason + date + notes + Reactivate. Remove the broken `window.prompt` stub entirely.

**CP-55/CP-56 impact:** none — columns already in spec.

**Related:** animals-screen-ui-v1-parity.md (which stubbed the Cull section as a single button placeholder), OI-0050 (sync param-count trap to guard against), v1 lesson "UI fields without Supabase columns = silent data loss."

---

### OI-0085 — §8 Feed Entries: display bugs + v1-parity inline add/edit
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P0 (blocks field testing)
**Checkpoint:** SP-10 follow-up
**Status:** closed — 2026-04-17. Two field-name typos fixed in `renderFeedEntries` (`batch?.name`, `fe.date`). §8 rebuilt to v1 inline pattern: `+ Add feed` header button, v1-style rows (date/desc left, DMI/cost + Edit/× right), inline form mount with module-level state, multi-batch add, batch-locked edit, 5 SP-10 §8 validation guards, inventory delta on edit, inventory restore on delete. `Deliver feed` big footer button removed. New `src/features/events/feed-entry-inline-form.js` with pure helpers + 19 unit tests. 860 tests green. `delivery.js` (standalone Deliver Feed sheet) untouched per OI-0072 scope.

**What's wrong (three things):**

1. **Feed name displays as `?`** in the §8 Feed Entries row. `renderFeedEntries` in `src/features/events/detail.js` (line 887) reads `batch?.feedName`, but the batch entity's field is `batch.name`.
2. **Delivery date is blank** in the §8 row (the empty gap in `? · 1 · · $45.00`). `renderFeedEntries` reads `fe.deliveryDate` (line 894), but the entity field is `fe.date`.
3. **Per-row Edit (pencil) button doesn't edit.** It calls `openDeliverFeedSheet` — the Add flow — so clicking it opens an empty new-delivery sheet. No edit UI exists.

**What Claude Code builds — v1 parity, inline pattern (not a sheet):**

The v1 pattern lives inside the event edit dialog. The §8 section has a "+ Add feed" button in the header; clicking it expands an inline form below the list. The per-row Edit button reuses the same form, pre-populated. This matches what farmers already expect from v1 and keeps the Edit Event dialog self-contained (no separate sheet to manage).

1. **Fix display bugs** (2 one-liners in `renderFeedEntries`).

2. **Rebuild §8 Feed Entries to v1 inline pattern** — see brief for extracted v1 HTML/CSS/JS.
   - Section header: `Feed entries` label on the left, `+ Add feed` button on the right (v1 `btn btn-green btn-xs`).
   - List of existing rows: date · description · DMI lbs · $cost · Edit · Delete.
   - Inline form container (initially hidden, `display: none`). Shows when `+ Add feed` or any row's Edit is tapped. Contains: Date input → batch selector (tap-to-toggle cards with checkmark + remaining) → per-selected-batch qty stepper (−/+ in 0.5 increments) → `Add to event` / `Cancel` buttons.
   - **Edit mode:** pre-populate date + selected batch + qty. Batch is locked in edit mode (can't deselect or add another — changing the batch means delete + re-add).
   - **Multi-batch add:** supported — farmer can select multiple batches, set qty for each, save once → creates N `event_feed_entries` rows sharing the date.

3. **Validation guards** per SP-10 § §8 (already ratified):
   - `entry.date < event.date_in` → reject.
   - `entry.date > event.date_out` on closed events → reject.
   - `entry.date` in the future → reject.
   - `quantity ≤ 0` → reject with copy: *"Quantity must be greater than zero. To remove feed from this event, use the Move feed out action."*
   - On edit: if quantity raise exceeds available inventory (`batch.remaining + old_qty`) → reject.

4. **Save behavior:**
   - **Add:** for each selected batch with qty > 0, create an `event_feed_entries` row, decrement `batches.remaining` by qty.
   - **Edit:** update the single row's date + qty. Adjust `batches.remaining` by the delta (`old_qty − new_qty`). Cascade DMI/NPK/cost through compute-on-read.

5. **Move feed out** button stays in the card footer (unchanged from SP-10 §8a).

6. **`Deliver feed` big button in §8 footer is removed** — its job is now done by the inline `+ Add feed` in the section header.

**No schema impact.** All fields already exist.

**Acceptance criteria:**
- [ ] §8 rows display batch name (not `?`) and delivery date (not blank).
- [ ] `+ Add feed` button opens the inline form below the list (not a sheet).
- [ ] Multi-batch add works: select two batches, set qty for each, save → two `event_feed_entries` rows with matching date.
- [ ] Per-row Edit button opens the inline form pre-populated; batch is locked, qty/date editable.
- [ ] Save (Edit mode) adjusts `batches.remaining` by the delta in the correct direction.
- [ ] All 5 validation guards reject with correct inline copy.
- [ ] DMI / NPK / cost update automatically after edit (compute-on-read).
- [ ] Delete still works unchanged.
- [ ] Visual layout matches v1 (use extracted HTML/CSS in the brief as the reference).
- [ ] Unit tests: display rendering with real batch, validation guards, quantity delta on `batches.remaining`, multi-batch add, edit pre-population.
- [ ] PROJECT_CHANGELOG.md updated.

**Spec reference:** `UI_SPRINT_SPEC.md` § SP-10 § §8 Feed Entries (ratified 2026-04-17) — rules.
**Brief reference:** `github/issues/SESSION_BRIEF_2026-04-17_oi0085-feed-entries-v1-parity.md` — extracted v1 HTML/CSS/JS.

**Files:**
- Modified: `src/features/events/detail.js` (2 bug fixes + rebuild `renderFeedEntries` to v1 inline pattern + inline add/edit logic)
- May be new: `src/features/events/feed-entry-inline-form.js` (extractable helper if detail.js gets crowded)
- Modified: `src/features/events/index.js` (remove Deliver feed sheet imports if no longer used in §8 context — check delivery.js is still called from dashboard-level CTAs before removing)
- New: `tests/unit/feed-entry-inline-form.test.js`

**Related:** OI-0072 (Feed Dialogs V1 Parity Rebuild) stays open and still covers the *standalone* Deliver feed sheet (used from dashboard CTAs). This OI doesn't touch that sheet — only the inline §8 pattern.

**Why P0:** display bugs make §8 unreadable; missing edit flow means farmers can't correct a mistyped quantity — field testing stalls the first time someone miscounts.

---

### OI-0083 — SP-10: Retro-place flow
**Added:** 2026-04-17 | **Area:** v2-build / events / groups | **Priority:** P1
**Checkpoint:** SP-10 Phase 3 — completes SP-10 build
**Status:** closed — 2026-04-17. `src/features/events/retro-place.js` built with sheet picker (full containment), optional paddock sub-picker, conflict-check abort, confirm dialog, atomic two-write commit (pre-validate + sequential update/add + manual revert on add failure). 14 unit tests pass. Reachable via direct invocation/tests until gap detection is wired in `edit-group-window.js` (separate follow-up).

**What:** Gap Option 3 of the gap/overlap resolver — retroactively place a group on another (closed) event that was open during the gap period. The spec has been simplified to an atomic two-write transaction — no reopen/re-close ceremony, no snapshot rollback infrastructure needed for this flow.

**Design decisions locked 2026-04-17 (with Tim):**

1. **Destination event picker:** sheet picker with event cards (full-screen sheet, one card per candidate event with dates, location(s), current groups, head count). **Not** a dropdown — retro-place is a consequential decision that warrants rich preview.
2. **Picker filter — full containment only.** Destination event must have `event.date_in ≤ gap_start` AND `event.date_out ≥ gap_end`. Partial-overlap events are excluded. Rationale: keeps the flow simple for a rare action; farmers facing a partial-fit scenario can cancel and handle the gap in pieces. Revisit if field testing shows farmers need partial fills.
3. **Flow simplification — atomic two-write, no reopen ceremony.** Once full-containment is the filter, the new group window's date range is fully derived (`date_joined = gap_start`, `date_left = gap_end`), leaving nothing for the user to decide beyond picking the destination. The prior spec's reopen-close-rollback ceremony was cost without benefit. Simpler flow: (a) snapshot, (b) user picks destination from sheet, (c) conflict check, (d) confirm dialog, (e) on Confirm — commit source edit + insert new historical group window atomically; on Cancel — nothing written.
4. **Conflict check:** if the group being placed already has an `event_group_window` on the destination whose range overlaps `[gap_start, gap_end]`, block with an error (not a three-option resolver). The premise of retro-place is that the group was unplaced during the gap; a pre-existing overlap violates that outright.
5. **No "undo" toast.** Retro-place is intentional and visible — the destination event's §7 group list now shows the new window. To reverse, the farmer opens the destination event's Edit dialog and deletes the window via the existing Delete-window action.

**What Claude Code builds:**
- `src/features/events/retro-place.js` — the sheet picker + confirm dialog + two-write transaction.
- Conflict-check helper (can live inline).
- Wire into the gap resolver at `resolve-window-change.js` as the handler for Option 3.

**Spec:** `UI_SPRINT_SPEC.md` § SP-10 "Retro-Place Flow" (fully rewritten 2026-04-17).

---

---

### OI-0084 — SP-10: §9 Feed check edit + re-snap invariant dialog
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P1
**Checkpoint:** SP-10 Phase 6 — completes SP-10 build
**Status:** closed — 2026-04-17. `src/features/events/edit-feed-check.js` built. Per-item edit dialog with range guards + invariant check covering Cases A/B/C/D. Re-snap dialog atomically deletes impossible later check items + saves edit, then a non-modal toast offers a "Feed check" shortcut to re-measure. `renderFeedChecks` in `detail.js` now renders one row per (check × item) feed line and wires the per-row Edit button to the new dialog. 20 unit tests pass.

**Clarification (2026-04-17):** The full design for this item already lives in `UI_SPRINT_SPEC.md` § SP-10 §9 (ratified 2026-04-17). What Claude Code flagged as "design-required" was really a scope surprise: the feed check edit UI doesn't exist in the current code (checks are add-only in `src/features/events/check.js`), so this item covers building the edit dialog from scratch rather than extending an existing one. That's a scope note, not a design gap. No new design decisions needed from Tim.

**What Claude Code builds:**

1. **Feed check edit dialog** (`src/features/events/edit-feed-check.js` — new file). Opens from the per-row inline Edit button in the §9 card (the button already exists per the OI-0071 fix; it currently has no target). Fields: `date`, `time` (optional), `remaining_amount`, optional `notes`. Batch and location read-only. Auto-save on commit (button), not on blur — this is a single submit because the invariant check needs all fields together.

2. **Range guards** (reject-on-save, inline error) per SP-10 §9:
   - `check.date` < `event.date_in` → reject.
   - `check.date` > `event.date_out` on closed events → reject.
   - `check.date` in the future → reject.
   - `remaining_amount` < 0 → reject.

3. **Invariant check on save** per SP-10 §9: run `consumed(Ti → Ti+1) ≥ 0` across all adjacent intervals on the feed line (same batch × location on the same event). Four cases:
   - **Case A — benign:** save silently, compute-on-read cascades.
   - **Case B — later-interval break:** surface **Re-snap dialog** listing the impossible later check(s). Options: `[Cancel edit]` or `[Delete later checks and save]`. After save, non-modal toast: *"Enter a new feed check to re-snap the line →"* with shortcut button.
   - **Case C — earlier-interval break:** surface conflict with `[Cancel edit]` only. No auto-delete of earlier checks.
   - **Case D — back-fill past-dated check:** same invariant check against both neighbors, resolves via B or C.

4. **Re-snap dialog** (`src/features/events/feed-check-resnap-dialog.js` or inline inside `edit-feed-check.js` — builder's choice). Simple modal with the warning copy + two buttons. Atomic on Confirm: delete impossible later check(s) + save the edit in a single transaction.

5. **Delete feed check** (existing) — keep as-is. No invariant check needed; deleting only widens an interval.

**Files:**
- New: `src/features/events/edit-feed-check.js`, optional `feed-check-resnap-dialog.js`.
- Modified: `src/features/events/event-detail.js` (wire per-row Edit button from §9 to the new dialog), `src/data/store.js` (transaction helper if not already generic enough for the re-snap atomic delete+save).

**No schema impact.** All fields already exist on `event_feed_checks`.

**Unit tests:** cover the four cases (A/B/C/D) with example check sequences and verify the dialog behavior + atomic delete+save transaction.

---

---

### OI-0082 — SP-10 §8a: Move Feed Out (new capability)
**Added:** 2026-04-17 | **Area:** v2-build / events / feed | **Priority:** P1
**Checkpoint:** SP-10 §8a
**Status:** closed — 2026-04-17. Migration 023 applied. 4-step sheet built. Entity updated. Wired to detail sheet.

**What this adds:** On any active event, a `Move feed out` action lets a farmer pull delivered feed back out — either to batch inventory or to another open event. Entry points: §8 Feed Entries card footer button and a per-row inline `Move out` action on each delivery row in the §8 list. Four-step sheet: current feed state → forced feed check (strikes the line) → amount + destination picker → confirm.

**Why it matters:** Field farmers do pull feed back out of pastures (bad weather, over-estimated, needed elsewhere). v1 had no way to record this; any attempt was a delete (losing history) or a negative-amount kludge. v2 needs explicit semantics so DMI / NPK / cost stay accurate.

**Schema impact (three new columns on `event_feed_entries`):**
- `entry_type` text enum (`delivery`, `removal`), default `'delivery'`
- `destination_type` text enum (`batch`, `event`) nullable
- `destination_event_id` uuid FK → events(id) ON DELETE SET NULL, nullable

Check constraints: `entry_type = 'removal'` → `destination_type IS NOT NULL`; `destination_type = 'event'` → `destination_event_id IS NOT NULL`; `destination_type = 'batch'` → `destination_event_id IS NULL`.

**CP-55/CP-56 impact:** CP-55 serializes all three. CP-56 defaults old backups to `delivery / NULL / NULL`. Migration bumps `schema_version`, adds `BACKUP_MIGRATIONS` no-op entry.

**Calc impact (compute-on-read, one-line change per calc):** DMI-1, DMI-5, NPK-1, NPK-2, cost-per-day — sum deliveries minus removals. Default-safe because legacy rows are all `entry_type = 'delivery'`.

**Spec:** UI_SPRINT_SPEC.md SP-10 §8a (full spec including flow, writes, invariants, edge cases, same-day ordering policy).

**Files likely affected:** `supabase/migrations/NNN_feed_removal_columns.sql`, `src/entities/event-feed-entry.js`, `src/features/events/move-feed-out.js` (new), `src/features/events/event-detail.js` (§8 card footer + per-row action), `src/data/store.js`, calc registry entries, `src/data/backup-export.js`, `src/data/backup-import.js`, `src/data/backup-migrations.js`.

---

### OI-0081 — SP-10: Event Data Edit Consistency Suite
**Added:** 2026-04-17 | **Area:** v2-build / events / edit dialogs | **Priority:** P0 (blocks field testing)
**Checkpoint:** SP-10
**Status:** closed — 2026-04-17. All 7 phases implemented: snapshot/rollback, gap/overlap resolver, move feed out, group window edit, paddock window edit + OI-0064 reopen, event reopen, observations auto-save.

**What this is:** A suite of edit-behavior specs for every data field inside the Edit Event dialog (§3, §6, §7, §8, §9, §12, event-level dates). Establishes the "structural state requires explicit reconciliation; derived values cascade on read" rule, then applies it section by section.

**Why it matters:** Field testing is blocked until editing is predictable. Without this, users will create silent inconsistencies (overlapping group windows, feed entries dated before their event, invalid feed checks) that accumulate over time.

**Sections ratified (all in UI_SPRINT_SPEC.md SP-10):**
- §7 Groups — group window edit dialog; shared gap/overlap resolution routine with retro-place flow (reopen + close + snapshot rollback on cancel)
- §12 Sub-moves — paddock window edit; no gap detection (gaps are legal); entry from both §4 and §12
- Event-level dates — `date_in` direct edit with reject-on-narrow / confirm-on-widen; `date_out` via new Event Reopen action; three-option group-conflict resolver
- §8 Feed Entries — validation guards; new per-row `Move out` action
- §9 Feed Checks — invariant check on save (`consumed ≥ 0`); Re-snap dialog for impossible later checks
- §3 Pre-graze + §6 Post-graze Observations — inline auto-save on blur; silent cascade

**Separately:** §8a Move Feed Out is tracked in OI-0082 (has schema impact).

**Spec:** UI_SPRINT_SPEC.md SP-10 (full walkthrough, all seven sections ratified 2026-04-17).

**Core principle (promote to V2_APP_ARCHITECTURE.md at reconciliation):** derived values compute on read and auto-cascade; structural state (date-bounded records) requires explicit reconciliation via dialogs; edits never silently rewrite cross-record state.

**Files likely affected:** `src/features/events/event-detail.js` and all its sub-cards, `src/features/events/edit-group-window.js` (new), `src/features/events/edit-paddock-window.js` (new), `src/features/events/reopen-event.js` (new), `src/features/events/retro-place.js` (new — reopen + close flow with snapshot rollback), `src/data/store.js` (snapshot/rollback helpers), calc registry unchanged (compute-on-read already handles cascade).

**Dependencies:** §8a (OI-0082) adds schema columns; the rest is app-layer behavior only.

---

### OI-0080 — SP-9 Bulk Survey Header Missing + Implementation Audit
**Added:** 2026-04-17 | **Area:** v2-build / surveys | **Priority:** P1
**Checkpoint:** SP-9 correction
**Status:** closed — 2026-04-17

**Resolution:** Bulk header Row 1 added (Cancel, DRAFT, Expand/Collapse, Save Draft, Finish & Save, ✕). Surveys sub-tab implemented (draft resume banner, committed list with Edit). Bulk-edit now replaces prior observations instead of appending.

**What is wrong:** After SP-9 landed, the bulk survey sheet is missing its entire top action row. Six controls are absent: Cancel, DRAFT pill, Expand/Collapse all, Save Draft, Finish & Save, ✕ close. Only the date + filter rows render.

**Why it is wrong:** Violates SP-9 acceptance criterion: "Bulk header matches v1 exactly: Cancel (red text) · DRAFT tag · Expand/Collapse all · Save Draft · Finish & Save · ✕ · date · farm pills (>1 farm) · type pills · search." Users cannot finish/save or explicitly cancel a bulk survey — only the auto-save-on-close fallback works.

**Correct behavior:** Bulk header must render Row 1 (action buttons) per the `_renderBulkSurveyHeader()` extraction in spec §6.1. Mode switcher must make bulk header visible when mode is 'bulk'.

**Files affected:** `src/features/locations/index.js` (openSurveySheet)

**Scope expansion:** Full audit of SP-9 implementation — see SESSION_BRIEF_2026-04-17_sp9-bulk-header-audit.md for the 8-part checklist.

---

### OI-0079 — Field Mode: Single Pasture Survey Picker Sheet
**Added:** 2026-04-17 | **Area:** v2-build / field-mode | **Priority:** P3
**Status:** open — interim fallback in place (navigates to #/locations)

**Problem:** V1 has a dedicated pasture survey picker sheet for field mode single survey — user selects a location, then the survey form opens for that location. V2 field mode survey-single tile currently navigates to the locations screen as an interim.

**Fix:** Build `openPastureSurveyPickerSheet()` with farm/type filter pills and location cards, similar to the harvest field picker. On selection, open `openSurveySheet(locationId, operationId)`.

---

### OI-0078 — Field Mode: Heat Picker Sheet
**Added:** 2026-04-17 | **Area:** v2-build / field-mode | **Priority:** P3
**Status:** closed — 2026-04-17. 2-step heat picker built: animal selection with event/group filter pills + search, then recording form. Stays open for multi-record. Toast on save.

---

### OI-0077 — i18n Pass: Hardcoded English Strings Across UI Sprint Screens
**Added:** 2026-04-17 | **Area:** v2-build / i18n | **Priority:** P3
**Checkpoint:** post-UI-sprint
**Status:** open — deferred, batch fix

**Problem:** All UI sprint screens (animals, feed check, feed deliver, dashboard cards, sidebar/header, locations + all 7 connected dialogs) use hardcoded English strings for labels, placeholders, buttons, and messages instead of routing through `t()` from `src/i18n/`. The app is English-only today so this has zero user impact, but it means the i18n infrastructure isn't wired for these screens.

**Scope:** Mechanical fix — no logic or layout changes. For each screen: (1) identify every hardcoded user-facing string, (2) add a key to the locale file, (3) wrap with `t()`. Estimate ~200–300 strings across all sprint screens.

**Fix:** Single dedicated session after the UI sprint is complete. Do all screens in one pass to avoid per-screen overhead.

**No schema impact. No CP-55/CP-56 impact.**

---

### OI-0076 — DMI Chart Empty Bars — Deferred Until Fresh V2 Test Data
**Added:** 2026-04-17 | **Area:** v2-build / UI | **Priority:** P3
**Checkpoint:** post-UI-sprint
**Status:** closed — 2026-04-20. **Superseded by OI-0119.** Tim generated fresh v2 data in field testing and the empty bars persisted; the deferral hypothesis (v1-migration data incompleteness) was only a minority contributor. Real root causes were the three latent bugs captured in OI-0119 (dead-table observation reads post-OI-0112, actual-path requires two bracketing checks, estimated path ignores feed entries). OI-0119 is the combined corrective rewrite.

**Problem:** The 3-day DMI chart on location cards shows empty bars with "—" values. Likely caused by v1 migrated data not having the per-day breakdown that DMI-8 needs. Cannot verify or fix without fresh v2 test data generated through normal app usage.

**Fix:** Revisit after Tim has generated some new events and feed data in v2. May also depend on DMI-8 landing (OI-0069).

**No schema impact.**

---

### OI-0075 — Dashboard Locations Tab: 7 Display Bugs
**Added:** 2026-04-17 | **Area:** v2-build / UI sprint | **Priority:** P2
**Checkpoint:** UI sprint
**Status:** closed — 2026-04-18 (full close). Bugs 1 / 2 / 4 / 6 shipped earlier in commit `e124952`. The remaining bugs 3 / 5 / 7 land in THIS commit — pre-handoff audit confirmed every required calc (FOR-1/2/3, DMI-1/2/4, NPK-1/2) was already registered; the work was pure investigation + wiring in `src/features/dashboard/index.js`. **Root cause for Bug 3:** the dashboard read `loc.areaHa` but the location entity stores `areaHectares` — a silent field-name drift that made `totalAreaHa` resolve to 0 on every real record, so the old gate `availableDmKg > 0 && dailyDmiKg > 0` always failed because FOR-1 skipped. Fix: eight read sites in dashboard now use `loc.areaHectares ?? loc.areaHa` (legacy fallback preserved). Plus the capacity line now also reads the post-OI-0112 pre-graze observation from `paddock_observations` (was still reading `eventObservations` pre-fix). When inputs are legitimately missing (no forage type, no observation, no animals, no area), an informative italic hint — `Capacity: add <missing> to estimate` — renders under a new `dashboard-capacity-hint-{event.id}` testid instead of silently dropping the row. **Root cause for Bug 5:** DMI-1 was being called with `qtyKg: fe.quantity` (bales, not kg) and `dmPct: 100` (hardcoded) — off by a factor of `weightPerUnitKg × (dmPct/100)`, so "2 bales × 500 kg × 85% DM" rendered as 2 kg DM instead of 850 kg. Fix: convert per-unit quantity × `batch.weightPerUnitKg`, use `batch.dmPct`, and subtract the latest close-reading feed check's residual (matches v1 `calcConsumedDMI(allFeedEntries, getEffectiveFeedResidual, _lastFeedCheck)` semantics). **Bug 7** — extracted exported helper `computePasturePercent(events)` that mass-balances total DMI-2 × days vs total DMI-1 deliveries across all supplied events, runs through DMI-4, and returns `{ pasturePercent, color, subLabel }` with green ≥ 75 / amber 50–74 / red < 50 color grading. Both `computeDesktopMetrics` (line 303 path) and `computeMobileMetrics` (line 414 placeholder) now call the helper — the desktop side loses its "always null" placeholder, the mobile side loses its hardcoded em-dash. NPK/Acre and NPK Value were already wired on both paths; the area fix above now lets them render for real. **Tests:** 8 new cases in `tests/unit/locations-tab-bugs-357.test.js` covering the full capacity line rendering, three different "missing input" hint paths, the v1-parity stored-feed DM number, and Pasture % color bands (green @ 100%, amber @ 60%). Full suite 1079 → 1087. Production build passes. GH-22 updated and closed. Spec file: `github/issues/GH-22_locations-tab-display-fixes.md`.

**Problem:** Seven display issues on the Locations tab compared to v1: (1) "lbs lbs" double unit suffix on weight lines, (2) missing acreage next to location name, (3) missing green capacity line (Est. capacity / days remaining / ADA), (4) badge shows "stored feed" instead of "stored feed & grazing", (5) stored feed DMI value mismatch with v1, (6) missing number formatting with commas, (7) empty top stat cards (Pasture %, NPK/Acre, NPK Value). DMI chart bars deferred to OI-0076.

**Fix:** Spec file `github/issues/GH-22_locations-tab-display-fixes.md`.

**No schema impact.** Visual/display only. No CP-55/CP-56 impact.

---

### OI-0074 — Event Detail Action Buttons: Wrong Layout and Missing CSS
**Added:** 2026-04-17 | **Area:** v2-build / UI sprint | **Priority:** P2
**Checkpoint:** UI sprint
**Status:** closed — 2026-04-18, commit `202069e` (GH-21). Pre-build audit found the three-tier layout (green primary + outline cancel row; amber full-width warning; red-small destructive) was already in place; only drift was the primary button identity. This commit renamed "Save & close" → "Save & recalculate" (testid `detail-save-close` → `detail-save-recalc`), wired the handler to invoke `renderAll(ctx)` before closing so DMI / NPK / summary / chart re-run, and added new i18n key `action.saveAndRecalculate`. Four unit cases in `tests/unit/detail-action-buttons.test.js` cover active + closed layouts. Undefined CSS classes `btn-olive` / `btn-danger` / `btn-ghost` exist elsewhere in `detail.js` but NOT in `renderActions`, so scope was respected per CLAUDE.md "Scoped Changes Only" — a follow-up can clean them up if field-testing flags them. Spec file: `github/issues/GH-21_event-detail-action-buttons.md`.

**Problem:** Event detail sheet bottom buttons render as a flat flex row (Move All / Close and Move / Delete / Cancel) instead of v1's hierarchical layout (primary row, warning action, destructive action). Uses undefined CSS classes (`btn-olive`, `btn-danger`, `btn-ghost`) so buttons have no visible background color.

**Fix:** Spec file `github/issues/GH-21_event-detail-action-buttons.md`. Restructure to: Save/Move All (green, flex:2) + Cancel (outline, flex:1) row, then Close & Move (amber, full-width), then Delete (red, small).

**No schema impact.** Visual only. No CP-55/CP-56 impact.

---

### OI-0073 — Group Placement Detection Picks Wrong eventGroupWindow
**Added:** 2026-04-17 | **Area:** v2-build / dashboard | **Priority:** P1 (blocks further field testing — dashboard placement is wrong for most groups today)
**Checkpoint:** UI sprint
**Status:** closed — 2026-04-18. Shipped with OI-0091. Part A — `renderGroupCard` at `src/features/dashboard/index.js:580` now prefers open-event windows with most-recent `dateJoined` tie-break. Part B — `supabase/migrations/025_close_orphan_group_windows.sql` applied and verified via MCP (0 groups with >1 open window post-apply; `schema_version` bumped 23→25; backup-migrations chain extended 23→24 reserved + 24→25 no-op). Part C — NPK NaN fix at root cause: NPK-1 returns `{nKg, pKg, kKg}` but dashboard read `result.n/.p/.k`; rewrote to defensive `result.nKg ?? result.n ?? 0` pattern at four sites. Post-OI-0091, new orphans are architecturally prevented going forward.

**Problem:** Dashboard Groups view shows most groups as "Not placed" despite having active events. Multiple `event_group_windows` rows per group have `date_left = null` (open), and `.find()` returns the first match in array order — which for most groups points to a stale window rather than the current open one. Bull Group works only by accident (its first match happens to be current).

**Root cause (widened 2026-04-17):** Orphaned open windows come from **two sources**:
- **(A) v1 migration** — v1 close/move flows didn't retroactively stamp `date_left` on migrated records; the v1 → v2 migration preserved those gaps.
- **(B) Fresh v2 flow bugs** — the cull flow (pre-OI-0086) and some pre-OI-0091 move-wizard paths left windows open instead of closing them. OI-0091 fixes the *new* sources; OI-0073 cleans up the *existing* orphans (both v1-migrated and v2-generated) so detection works today. Without OI-0073, OI-0091's split-on-state-change cannot be meaningfully field-tested — the dashboard still shows the wrong placement because the pre-existing orphans dominate the `.find()` result.

**Evidence:** Cow-Calf Herd has 10 open GWs (1 current, 9 orphans). Culls has 7 (1 current, 6 orphans). All groups follow the same pattern. Tim's Culls group appearing on both J2 and D (reported today) is a live instance of this bug — the move wizard correctly created a new open window on D, but existing orphans on J2 (and possibly others) are what render in both places.

**Fix — ships with OI-0091 package:** Three parts:
- **(A) Code fix** — `getGroupPlacement()` prefers GWs linked to open events; tie-break by most-recent `dateJoined`. Removes the silent `.find()` latent bug even if some orphans linger.
- **(B) Data cleanup migration** — one-shot SQL that closes orphaned open windows: for each group, keep the single most-recent open window and stamp `date_left = COALESCE(dateJoined, event.date_out)` on the rest. Run once as migration 025 (after OI-0091's logic ships so no new orphans are created post-cleanup). Reversible-by-restore via CP-56.
- **(C) NaN-in-NPK display fix** — secondary bug noticed in the same debug pass: NPK breakdown shows `NaN` when `animalClassId` is missing on a group. Fill with a best-effort default from `group.defaultClassId` or fallback class; log a warning. Keep the fix in this OI rather than spinning a new OI — it's a one-liner surfaced by the same investigation.

**Why ship with OI-0091:** Without OI-0091, fixing the orphans today doesn't stick — the cull/move/wean flows keep generating new ones. Without OI-0073, OI-0091's fix is invisible — the dashboard still reads stale orphans. Shipping them together gives Tim a single package to verify end-to-end.

**No schema impact for Parts A + C.** Part B is a one-shot data cleanup migration (no column change, just UPDATE statements). Minor CP-55/CP-56 impact for Part B: bump `schema_version` if run via migration chain; no export shape change. If run as pure SQL outside the migration chain, flag the drift in OPEN_ITEMS for a follow-up `schema_version` bump.

---

### OI-0072 — Feed Dialogs (Check + Deliver): V1 Parity UI Rebuild
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** UI sprint
**Status:** closed — earlier work, commits `1d9c0e4` + `74c53c9`. Audited 2026-04-18 during the pre-testing-cleanup bundle — every acceptance criterion met, implementation matches spec. **Feed Check** (`src/features/feed/check.js`): per-item triple-sync control (stepper ± buttons at lines 192–210 + percentage input + range slider, synced via updateUI at lines 127–172), consumed-since-last-check banner (lines 136–144, correct DMI formula), multi-item card-per-line layout (lines 175–257). **Deliver Feed** (`src/features/feed/delivery.js`): tap-to-select batch cards via toggleBatch (lines 81–87, 114–128, green checkmark on selected), inline quantity stepper on selected card with ±0.5 steps (lines 131–161), multi-batch selection via selectedLines array (line 65), feed-type grouping of unselected batches (lines 68–75, 98–166), live DMI + cost summary footer (renderSummary lines 170–193). **Global `.sheet-panel`**: width `min(92vw, 680px)` (main.css:223), padding `16px 16px 24px` (main.css:222), vertically centered (main.css:207). Spec file renamed `feed-check-ui-v1-parity.md` → `GH-20_feed-check-ui-v1-parity.md`. GH-20 filed + closed retroactively with audit note. No new code shipped with this close — implementation was already complete from the 2026-04-16 session that never got closed out in OPEN_ITEMS.

**Problem:** Both feed dialogs (feed check and deliver feed) are bare-bones v2 implementations that don't match v1's UI patterns. Feed check is missing the stepper/slider/percentage triple-sync control and consumed-since-last-check banner. Deliver feed is missing the tap-to-select batch cards with inline quantity steppers, multi-batch support, feed-type grouping, and live DMI/cost summary.

**Fix:** Spec file `github/issues/GH-20_feed-check-ui-v1-parity.md` covers both dialogs with full v1 layout descriptions, interaction patterns, and CSS classes. Includes extracted v1 HTML templates for Claude Code reference.

**No schema impact.** Visual/interaction only. No CP-55/CP-56 impact.

---

### OI-0071 — Event Detail Sheet: 7 UI Fixes (Post-Implementation Review)
**Added:** 2026-04-16 | **Area:** v2-build / UI | **Priority:** P1
**Checkpoint:** UI sprint (SP-2)
**Status:** closed — 2026-04-16

**Problem:** Tim reviewed the implemented SP-2 event detail sheet and found 7 issues: (1) edit event dialog missing save/cancel buttons, (2) pre-graze and post-graze fields not editable, (3) feed checks/entries/sub-moves missing inline edit buttons, (4) DMI/NPK breakdown card positioned too low — should be right under DMI chart, (5) deliver feed dialog missing required date/time, (6) deliver feed quantity stepper should use whole steps not 0.5, (7) move wizard buttons don't navigate.

**Fix:** Session brief `SESSION_BRIEF_2026-04-16_event-detail-ui-fixes.md` with all 7 fixes detailed. Fix 4 also requires updating the reader order in GH-10 spec.

**Resolution:** All 7 fixes implemented by Claude Code (2026-04-16).

---

### OI-0070 — EST-1: Estimated vs Actual Pasture Accuracy Comparison
**Added:** 2026-04-16 | **Area:** v2-design / calcs | **Priority:** P2
**Checkpoint:** post-UI-sprint
**Status:** open — spec'd, build later

**Problem:** No way to compare pre-graze estimates (how long the pasture should last) with actual outcomes (how long it did last). This feedback loop is essential for tuning forage type parameters over time.

**Fix:** New calc EST-1 (Event Pasture Accuracy) in the new Accuracy domain. Orchestrates existing calcs: FOR-1 (×2 for pre/post observations), FOR-3 (estimated days), DMI-1 (stored feed), DMI-3 (demand). Two surfaces: (1) summary card on the event detail sheet after event close, headline = "Estimated N days → Actual M days"; (2) accuracy trend report across all closed events. Includes a two-method sanity check (forage measurement vs mass balance). No schema impact.

**Spec:** V2_CALCULATION_SPEC.md §4.12 (added 2026-04-16). Session brief TBD when build is scheduled.

**Not blocking UI sprint.** Build after DMI-8 ships.

---

### OI-0069 — DMI-8: Daily DMI Breakdown Calc + 3-Day Chart
**Added:** 2026-04-16 | **Area:** v2-build / calcs | **Priority:** P1
**Checkpoint:** UI sprint (SP-2 + SP-3 chart)
**Status:** closed — 2026-04-20. **Superseded by OI-0119.** The original DMI-8 spec shipped per this OI (three-state output, FOR-1-seeded declining pasture mass balance) but three latent bugs surfaced in 2026-04-20 field testing: observation reads left on the dead `event_observations` table after OI-0112; actual path required TWO bracketing feed checks (silent fallthrough on the common single-check case); estimated path destructured `feedEntries: _feedEntries` and ignored stored deliveries entirely. OI-0119 is the combined corrective rewrite: cascade bucket model (pasture-first → stored-second → deficit-third), five statuses (adds `no_animals` + `no_pasture_data`), single-check actual projection, retroactive actual-conversion for the prior stored interval, date-routing-only source-event bridge, forced feed check on sub-move close when stored feed present, pooled pasture across parallel sub-paddocks, 100%-cover default for partial pre-graze. See V2_CALCULATION_SPEC.md §4.2 DMI-8 (rewritten with OI-0119) and spec file `github/issues/dmi-8-cascade-rewrite.md`.

**Problem:** The 3-day DMI chart on both the dashboard card (SP-3) and event detail sheet (SP-2) is a deferred placeholder. Existing DMI calcs (DMI-1 through DMI-7) produce single aggregate values, not per-day breakdowns with a pasture vs stored feed split. The chart needs per-day data.

**Fix:** New calc DMI-8 (Daily DMI Breakdown by Date). Three-state output: `actual` (feed check exists — use DMI-5 interpolation), `estimated` (no check — forecast from declining pasture mass balance using FOR-1 initial DM), `needs_check` (no basis for estimate — grey bar). Source event bridge for continuity across moves. Forage type required with inline prompt fallback.

**Spec:** V2_CALCULATION_SPEC.md § DMI-8 (added 2026-04-16). Session brief: `SESSION_BRIEF_2026-04-16_dmi-8-daily-breakdown.md`.

**No schema impact.** Compute-on-read only. No CP-55/CP-56 impact.

---

### OI-0068 — SP-2 Pre-graze Observations: Inline Fields, Not Modal
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** closed — 2026-04-16

**Problem:** Pre-graze observations were implemented as read-only labels with an "Edit" button that opens a modal (`openPreGrazeModal`). The approved mockup (v4) shows inline editable fields: forage height input, forage cover input + slider, quality input, condition chip picker. Tim confirmed (2026-04-16) that inline is correct — fields should be embedded directly in the detail sheet, not behind a modal.

**Fix:** Replace the read-only + modal pattern with inline editable fields per the v4 mockup. Auto-save on blur (same pattern as Notes). Remove `openPreGrazeModal`. CSS from the mockup (`.obs-line`, `.obs-field`, `.cover-slider`, `.qual-picker`, `.qual-chip`) is production-ready.

**Doc impact:** GH-10 spec file § Pre-graze Observations updated 2026-04-16. UI_SPRINT_SPEC.md change log updated.

---

### OI-0067 — SP-2 Event Detail: Convert from Full-Screen Route to Sheet Overlay
**Added:** 2026-04-16 | **Area:** v2-build / UI sprint | **Priority:** P1
**Checkpoint:** SP-2 refinement
**Status:** closed — 2026-04-16

**Problem:** SP-2 event detail was implemented as a full-screen routed view (`#/events?detail={eventId}`). Tim's review (2026-04-16) determined it should be a sheet overlay matching the move wizard pattern. The route-based approach forces a full page navigation away from the dashboard, losing context.

**Fix:** Convert `src/features/events/detail.js` from routed view to sheet. Remove the `#/events?detail=` route. Dashboard Edit button calls `openEventDetailSheet(event, operationId, farmId)` instead of `navigate()`. Sheet uses `ensureSheetDOM()` pattern. All 13 content sections stay the same — container change only.

**Doc impact:** GH-10 spec file updated 2026-04-16 (Navigation, Router Integration, Header sections). UI_SPRINT_SPEC.md § SP-2 updated.

---

### OI-0066 — Per-Group Move on Dashboard Card is Event-Scoped, Not Group-Scoped
**Added:** 2026-04-15 | **Area:** v2-design / UI sprint | **Priority:** P3
**Checkpoint:** Follow-up after SP-3
**Status:** closed — 2026-04-18, commit `cf39516` (GH-23). `openMoveWizard` gains a 4th `opts` arg with `scopedGroupWindowId`. When set, the wizard closes only that one `event_group_window`, leaves the source event's paddock windows open, and keeps `event.dateOut` unset — so long as any other GW on the event remains open. When the last group leaves, the wizard closes the event + PWs exactly as today. Feed entries stay on the source event in scoped mode (no close-reading check, no transfer toggles, no residual capture). Dashboard wiring updated at both per-group Move sites (`buildGroupCard` line 842 using `activeGW?.id`, `buildLocationCard` group row line 1187 using `gw.id`); card-level "Move all" unchanged — still calls `openMoveWizard(event, operationId, farmId)` with no scope param. New testid `dashboard-group-move-btn-{gw.id}` on the location-card group row. Six new invariant tests in `tests/unit/move-wizard-scoped.test.js` cover scoped-vs-non-scoped close-out + last-group-leaving + destination-shape; existing move-wizard tests pass. Pre-build audit 2026-04-18 confirmed this was UNTOUCHED — full build required and delivered in this commit. Spec file: `github/issues/GH-23_per-group-move-scoping.md`.

**Problem:** SP-3 dashboard card has a per-group Move button on each group row, but that button opens the event-scoped move wizard (same target as the card-level Move all). V1 and the eventual desired behavior is for the per-group Move to scope the wizard to that specific group window, so other groups on the event stay put.

**Fix:** Spec a scoped `openMoveWizard` variant that targets a single group window. Wire per-group Move rows to use it. Update SP-3 card accordingly.

**Why:** Keeps SP-3 implementation tight. Per-group-scoped move is additive and independent of the visual card rebuild.

**Doc impact:** `V2_UX_FLOWS.md` §13 (move wizard) and §17.7 (dashboard card) when the scoped variant is added.

---

### OI-0065 — Per-Group Reweigh Moves from Dashboard Card to Animals Area
**Added:** 2026-04-15 | **Area:** v2-design | **Priority:** P3
**Checkpoint:** Follow-up after SP-3
**Status:** open — DESIGN REQUIRED, do not build

**Problem:** V1 shows a per-group reweigh/scale icon next to the Move button on each group row of the dashboard location card. SP-3 removes this icon from the dashboard card and reserves reweigh for the Animals area of the app. The Animals-area entry point for reweigh is not yet spec'd.

**Fix (design required):** Spec the reweigh entry point in the Animals area. Questions to answer:
- Which Animals screen hosts the reweigh action (list, detail, group view)?
- What is the context — single animal, group, all animals on an event?
- How does it integrate with existing weight history (`animal_weights` or equivalent)?
- Does it live on the card-style list row, in the animal detail sheet, or both?

**Why:** Reweigh is an animals-domain action, not a pasture-event action. Keeping it on the dashboard card conflates the two domains and clutters the card. Moving it to Animals aligns with v2's separation of concerns.

**Doc impact:** `V2_UX_FLOWS.md` new section for reweigh flow; `V2_DESIGN_SYSTEM.md` if new patterns emerge.

**Not blocking SP-3** — SP-3 ships without per-group reweigh on the card. Reweigh design can happen in parallel.

---

### OI-0064 — Sub-move History: Manage Button Dropped; Reopen Folded Into Edit Dialog
**Added:** 2026-04-15 | **Area:** v2-design / UI sprint | **Priority:** P3
**Checkpoint:** SP-2 implementation
**Status:** closed — 2026-04-17. Paddock window edit dialog (edit-paddock-window.js) includes Reopen action for closed windows. Folded into SP-10 Phase 4.

**Problem:** The original §17.15 draft and mockup v1 showed a `Manage` button on each sub-move history row. During design review round 1 we dropped it — per-row affordances are now Edit only, and the reopen flow folds inside the Edit dialog (no inline Delete either). Logged so the decision is visible when the Edit dialog itself gets designed.

**Fix:** Captured in `github/issues/event-detail-view.md` (SP-2, § Sub-move History) and in `UI_SPRINT_SPEC.md` § SP-2. Edit dialog spec for reopen is a follow-up when that sheet is built (not part of SP-2).

**Why:** Every row action adds visual noise. `Manage` was redundant with Edit. The reopen case is rare enough to live one level deeper inside Edit.

---

### OI-0063 — event_observations Schema Alignment with paddock_observations
**Added:** 2026-04-15 | **Area:** v2-build / schema | **Priority:** P1
**Checkpoint:** SP-2 implementation (blocker)
**Status:** closed — 2026-04-15

**Resolution:** Migration 021 created `event_observations` table with all specified columns. Entity file `src/entities/event-observation.js` created with FIELDS, validate(), toSupabaseShape(), fromSupabaseShape(). Registered in store, sync-registry, push-all. BACKUP_MIGRATIONS entry added (20→21). V2_MIGRATION_PLAN.md §5.3a updated with `event_observations` at position 32 (after `event_paddock_windows`).

**Problem:** `event_observations` currently stores a subset of what `paddock_observations` stores. Pre-graze observations during an event should capture the same pasture-assessment data a standalone survey would (forage height, cover %, quality 1–100, condition enum), plus post-graze-only fields (residual height, recovery window min/max days). Without alignment, pre-graze observations can't overwrite/supersede the prior survey record for a paddock the way they should.

**Fix:** New migration adds to `event_observations`:
- `forage_quality` (integer 1–100)
- `forage_condition` (text enum: dry/fair/good/lush)
- `forage_cover_pct` (numeric — verify absence)
- `forage_height_cm` (numeric — verify absence)
- `stored_feed_only` (boolean default false)
- `post_graze_height_cm` (numeric nullable)
- `recovery_min_days` (integer nullable)
- `recovery_max_days` (integer nullable)
- `observation_phase` (text enum: `pre_graze` / `post_graze`)
- `paddock_window_id` (uuid FK → `event_paddock_windows(id)`)

Pre-graze read: `observation_phase = 'pre_graze' OR observation_phase IS NULL` (backward compat for old rows).

**CP-55/CP-56 impact:** Export must serialize all new columns; import must default nulls/false for old backups. Bump `schema_version` and add `BACKUP_MIGRATIONS` entry. If `paddock_window_id` FK changes restore ordering, update V2_MIGRATION_PLAN.md §5.3/§5.3a in the same commit.

**Why:** Event and paddock observations are the same pasture measurement taken from two directions — they must share the same field set or the pre-graze → post-graze → recovery lifecycle can't be represented.

**Doc impact:** V2_SCHEMA_DESIGN.md `event_observations` definition, V2_MIGRATION_PLAN.md §5.3/§5.3a (if FK order changes), CP-55/CP-56 spec entries.

---

### OI-0062 — Sheet DOM Pattern: Ensure-on-First-Use for Cross-Route Sheets
**Added:** 2026-04-15 | **Area:** v2-build / architecture | **Priority:** P3
**Checkpoint:** post-3.2
**Status:** open — DESIGN REQUIRED, do not build

**Problem:** Sheet wrappers are created as part of each route's DOM tree (~30 sheets across the codebase). This works when a sheet is opened from its own route, but breaks when a sheet needs to open from a different route (e.g., dashboard calling move-wizard). The wrapper element doesn't exist in the DOM, so the sheet silently fails to open.

**Partial fix applied (2026-04-15):** Three sheets that the dashboard calls (`move-wizard`, `close-event`, `create-survey`) now use the `ensureSheetDOM()` / ensure-on-first-use pattern — matching what `todo-sheet.js` already does. Each `open*` function checks for its wrapper by ID and creates + appends it to `document.body` if missing. The `getElementById` guard prevents duplicates when the route-level wrappers also exist.

**Remaining work (needs Cowork decision):** The other ~27 sheets still use the route-only pattern. This is fine as long as they're only ever opened from their own route. If future features need to call any of them cross-route, they'll need the same `ensureSheetDOM()` treatment. Options:
1. **Reactive** — apply the pattern only when a sheet needs cross-route access (current approach)
2. **Proactive** — migrate all ~30 sheets to ensure-on-first-use and remove the route-level wrappers (cleaner but higher touch count)
3. **App-shell** — create all sheet wrappers once in `main.js` (cleanest, but couples the shell to all features)

**Doc impact:** If Cowork chooses option 2 or 3, update V2_APP_ARCHITECTURE.md §6.2 (Sheet lifecycle) to document the pattern.

---

### OI-0061 — Onboarding Race: Duplicate Operation Created When localStorage Cleared
**Added:** 2026-04-15 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** 3.2
**Status:** closed — 2026-04-15

**Problem:** `showApp()` in `main.js` fired `syncAdapter.flush().then(() => pullAllRemote())` as a fire-and-forget promise, then synchronously checked `needsOnboarding()` (which reads `getAll('operations')` from localStorage). When localStorage was empty — after a clear, new device, or incognito — the pull hadn't finished yet, so the store had zero operations and onboarding ran, creating a duplicate operation in Supabase. This caused the same duplication loop cleaned up in OI-0060.

**Root cause:** The initial Supabase pull was not awaited before the onboarding gate check. The spec (V2_APP_ARCHITECTURE.md) expects the store to be hydrated from remote before any flow decisions.

**Fix:** Made `showApp()` async. Changed the initial sync from fire-and-forget to `await syncAdapter.flush(); await pullAllRemote();` so the store is hydrated from Supabase before `needsOnboarding()` runs. The `online` event listener remains unchanged (still awaits internally). All callers are compatible — none depend on the return value of `showApp()`.

---

### OI-0060 — Stale Test Operations in Supabase from Failed Import Attempts
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-Tier-3
**Status:** closed — 2026-04-15

**Problem:** Tier 3 import testing created multiple operation records from failed attempts that were never cleaned up. Known stale operation IDs: `0ee3e183` (schema_version 14), possibly `0a9fa989` and `7e28804d`. These orphaned operations and their child rows consume space and could confuse any future multi-operation queries.

**Fix:** Delete the stale operations and all child rows. Use the FK-dependency delete order from V2_MIGRATION_PLAN.md §5.3a (children → parents). Verify by querying `SELECT id, schema_version FROM operations` — only the current active operation should remain.

**Resolution:** Cleaned up 2026-04-15. Found 6 operations total (3× "Down East Beef and Lamb", 3× "Test") with 17 farms, 948 animals, 228 events across them. Deleted 5 stale operations and all child rows across all 44 tables with operation_id, keeping only `ef11ee62` (most recent successful migration). Verified: 1 operation, 1 farm, 79 animals, 19 events, 6 groups remain.

---

### OI-0059 — Migration 020 Needed: Capture operation_members RLS Simplification
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** pre-next-deploy
**Status:** closed — 2026-04-20 (already shipped in commit `5fcd881` on 2026-04-14; Supabase policy verification run 2026-04-20 confirms live policies match the migration file exactly).

**What shipped:**
- `supabase/migrations/020_fix_operation_members_rls_recursion.sql` — drops all 4 policies from migration 017 and recreates them with only `user_id = auth.uid()`. Bumps `schema_version = 20`.
- `BACKUP_MIGRATIONS[19]` no-op entry in `src/data/backup-migrations.js`.
- Backup-import / backup-roundtrip test updates.

**Verification (2026-04-20):** Cowork queried `pg_policies` on the live GTHO-v2 Supabase project. All 4 policies (`operation_members_select`, `_insert`, `_update`, `_delete`) use `(user_id = auth.uid())` with no recursive subqueries — byte-for-byte match to the migration file. `schema_version` on operations reads `28` (expected — past migration 020, currently at migration 028 post-OI-0117). OPEN_ITEMS simply never got the close-out after commit 5fcd881.

**Problem (historical):** OI-0058's fix (simplifying all 4 operation_members RLS policies to `user_id = auth.uid()`) was applied directly to Supabase via SQL during Tier 3 testing. No migration file existed in `supabase/migrations/`. The migration chain was out of sync with what's actually in the database — if anyone stood up a fresh Supabase instance from the migration files, they'd get the broken self-referential policies from migration 017.

**Fix shipped:** Claude Code wrote `supabase/migrations/020_fix_operation_members_rls_recursion.sql` that:
1. Drops all 4 policies from migration 017 (SELECT, INSERT, UPDATE, DELETE)
2. Creates simplified replacements using only `user_id = auth.uid()`
3. Bumps `schema_version = 20`
4. Added `BACKUP_MIGRATIONS[19]` no-op entry in `backup-migrations.js`

---

### OI-0058 — operation_members RLS Policies Self-Referential — Infinite Recursion on All Reads
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — fixed 2026-04-14 (SQL applied directly in Supabase)

**Problem:** Migration 017 replaced the `operation_members` `FOR ALL` policy with 4 granular policies, but the SELECT, INSERT, UPDATE, and DELETE policies all contain self-referential subqueries like:
```sql
USING (user_id = auth.uid() OR operation_id IN (
  SELECT om.operation_id FROM operation_members om
  WHERE om.user_id = auth.uid() AND om.accepted_at IS NOT NULL
));
```
When any other table's RLS policy runs `SELECT operation_id FROM operation_members WHERE user_id = auth.uid()`, Postgres applies operation_members' own SELECT policy, which queries operation_members again → infinite recursion. This was a latent bug since migration 017+018 that surfaced during Tier 3 import testing when pullAll hammered all tables simultaneously and the query planner evaluated both OR branches.

**Impact:** Every `pullAll` query fails with `"infinite recursion detected in policy for relation 'operation_members'"`. The import parity check reads 0 rows for every table → import always reports FAILED regardless of whether inserts succeeded. All background sync reads also fail.

**Fix:** Simplified all 4 operation_members policies to non-recursive versions using only `user_id = auth.uid()`:
- SELECT: `USING (user_id = auth.uid())`
- INSERT: `WITH CHECK (user_id = auth.uid())`
- UPDATE: `USING (user_id = auth.uid())`
- DELETE: `USING (user_id = auth.uid())`

This is correct for v2's single-user scope. When multi-user operations are added, a `SECURITY DEFINER` function will be needed to break the recursion chain (standard Postgres pattern).

**Migration needed:** Claude Code must write migration 020 capturing this policy change so the migration chain stays in sync with what's in Supabase.

---

### OI-0057 — v1 Migration Transform Leaves animal_classes Excretion Rates Null
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-57
**Status:** open

**Problem:** `v1-migration.js` §2.14 maps v1 animal classes to v2 format but leaves `excretion_n_rate`, `excretion_p_rate`, `excretion_k_rate` as `null` and `dmi_pct_lactating` as `null` (lines 273-274, comment: "seed with NRCS defaults post-migration"). When the import replaces the v2 onboarding defaults (which have full NRCS values from `seed-data.js`) with the v1-migrated classes, all NPK calculations break — they depend on non-null excretion rates.

**Fix:** In the v1 transform, populate NRCS defaults from `seed-data.js` `ANIMAL_CLASSES_BY_SPECIES.beef_cattle` based on the `role` value returned by `inferRole()`. The role-to-defaults lookup:

| role | excretion_n | excretion_p | excretion_k | dmi_pct_lactating |
|------|------------|------------|------------|-------------------|
| cow | 0.145 | 0.041 | 0.136 | 3.0 |
| heifer | 0.145 | 0.041 | 0.136 | null |
| bull | 0.145 | 0.041 | 0.136 | null |
| steer | 0.145 | 0.041 | 0.136 | null |
| calf | 0.145 | 0.041 | 0.136 | null |

If `inferRole()` returns an unrecognized role, use the cow defaults as fallback (most conservative for NPK).

**Note:** The excretion rates happen to be the same across all beef cattle roles (0.145/0.041/0.136 per NRCS standard). The key difference is `dmi_pct_lactating` — only cows get 3.0, all others null.

---

### OI-0056 — REFERENCE_TABLES Blocks Import Delete Phase — FK Constraint on operations
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-56 / CP-57
**Status:** closed — fixed 2026-04-14

**Problem:** `backup-import.js` `REFERENCE_TABLES` set includes 5 per-operation tables (`forage_types`, `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`). The `deleteTableRows()` function skips reference tables (they upsert instead of delete-then-insert). But these tables all have `operation_id` FK → `operations`. When the delete loop reaches `operations`, these undeletion rows block the delete with FK constraint violation: `forage_types_operation_id_fkey`.

**Root cause:** These 5 tables were misclassified as global reference data. They are per-operation seed data — each operation has its own forage types, animal classes, etc. Only `dose_units` and `input_product_units` are truly global (no `operation_id`, RLS disabled, per V2_SCHEMA_DESIGN.md DP#8 exemption).

**Fix:** Remove the 5 per-operation tables from `REFERENCE_TABLES`. Keep only `dose_units` and `input_product_units`. The backup is authoritative for all operation-scoped data — these tables should be deleted and re-inserted from the backup during import, like every other operation-scoped table.

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_reference-tables-import-fix.md`

---

### OI-0055 — Four Tables Missing operation_id Column — Breaks Import, RLS, and Scoped Queries
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-56 / CP-57
**Status:** closed — fixed 2026-04-14

**Problem:** Four child/junction tables were designed without a direct `operation_id` column, relying on transitive scoping through a parent FK:

| Table | Parent FK | Parent table |
|---|---|---|
| `todo_assignments` | `todo_id` | `todos` |
| `event_feed_check_items` | `feed_check_id` | `event_feed_checks` |
| `harvest_event_fields` | `harvest_event_id` | `harvest_events` |
| `survey_draft_entries` | `survey_id` | `surveys` |

This violates Design Principle #8 ("every user-data table has `operation_id`") and causes failures anywhere code assumes a direct `operation_id` column: backup import delete (`deleteTableRows()`), parity check (`parityCheck()`), RLS policies (which had to use join-based USING clauses), and any future operation-scoped query. The v1 import crashed on `todo_assignments` with `column operation_id does not exist` — zero data was imported.

**Root cause fix (not workaround):** Add `operation_id uuid NOT NULL` with FK to `operations` on all four tables. Migration 019 adds the column, backfills from parent, adds NOT NULL constraint, and creates standard granular RLS policies matching Pattern A from V2_INFRASTRUCTURE.md §5.1. Entity files, shape functions, and store calls updated to include `operation_id`. This eliminates the exception class entirely — no `INDIRECT_OPERATION_TABLES` map needed.

**CP-55/CP-56 impact:** Export must include the new column. Import delete and parity check work with the standard `operation_id` pattern (no special cases). BACKUP_MIGRATIONS entry 18 adds `operation_id` to these four tables in older backups by looking up the parent FK.

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_import-join-table-delete-fix.md`

---

### OI-0054 — Sync Adapter Uses Upsert Which Requires UPDATE Policy to Pass on INSERT
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — fixed 2026-04-14

**Problem:** `custom-sync.js` line 205 uses `.upsert(record, { onConflict: 'id' })` for every write. Supabase treats upsert as INSERT + UPDATE, requiring both policies to pass. During onboarding, the `operation_members` row doesn't exist yet, so any UPDATE policy that checks membership fails. This cascades to every table: operations (rejected despite `WITH CHECK (true)` on INSERT, because upsert also evaluates UPDATE policy) → operation_members (FK violation because operations row didn't land) → all other tables (RLS violation because no member row exists).

24 records dead-lettered on every onboarding attempt. Tier 3 migration testing is blocked.

**Root cause:** The sync adapter doesn't distinguish between new records (from store `add()`) and existing records (from store `update()`). It uses upsert for both, which is semantically incorrect and triggers the wrong RLS evaluation path.

**Two-part fix required:**

1. **Sync adapter (custom-sync.js):** `push()` must accept an `operation` hint ('insert' or 'update'). Store's `add()` passes 'insert' → sync uses `.insert()`. Store's `update()` passes 'update' → sync uses `.update().eq('id', id)`. Recovery/resync path keeps `.upsert()` (by the time recovery runs, the member row exists).

2. **RLS migration (018):** Split every `FOR ALL` policy into granular INSERT/SELECT/UPDATE/DELETE. INSERT uses `WITH CHECK (true)` (FK constraints enforce valid operation_id). SELECT/UPDATE/DELETE check membership. This is defense-in-depth: even if the sync adapter uses upsert, INSERT won't be blocked by the UPDATE check. See V2_INFRASTRUCTURE.md §5.1 for the updated patterns.

**Affects:** All tables with `FOR ALL` policies (~40 tables). All onboarding seed data. All Tier 3+ migration testing.

**Base docs updated:** V2_INFRASTRUCTURE.md §5.1 (RLS patterns), V2_APP_ARCHITECTURE.md §5.2 (sync write methods).

---

### OI-0053 — operation_members RLS Policy Infinite Recursion Blocks All Sync
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P0
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — partially fixed 2026-04-14, remaining work tracked in OI-0054

Dropped `operation_members_all` (FOR ALL, self-referential → infinite recursion). Replaced with 4 granular policies: SELECT (own row + operation members), INSERT (self-bootstrap via `user_id = auth.uid()` + admin/owner invite), UPDATE (admin/owner), DELETE (owner only). Applied missing migrations 014–016 to Supabase. Disabled RLS on `dose_units` and `input_product_units` (no `operation_id` column). Migration 017 written. Migration 001 updated for fresh DB setups. Schema version bumped to 17.

**Post-fix discovery:** The recursion fix alone was insufficient. The `operation_members` SELECT policy was further simplified to `USING (user_id = auth.uid())` to eliminate all self-referential subqueries. Even with that fix, sync still failed because the sync adapter uses `.upsert()` which requires UPDATE policies to pass during INSERT (see OI-0054).

**Spec file:** `github/issues/SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`

---

### OI-0052 — Onboarding Wizard Renders 3× on First Load
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** closed — 2026-04-20 (reconciliation sweep). Fix applied via option 1 (same-user guard). `src/main.js:66` tracks `lastRenderedUserId`; the `onAuthChange` callback at `main.js:88-92` short-circuits when the changed user's id matches the already-rendered id, so `clear(app) + showApp(app)` no longer fires on `INITIAL_SESSION` or `TOKEN_REFRESHED` restore events. Explicit `(OI-0052)` comment in the code. Landed in the main.js rewrite; no standalone commit.

`boot()` in `main.js` calls `showApp(app)` on initial load (line 70), which renders the onboarding wizard. Then Supabase's `onAuthStateChange` fires `INITIAL_SESSION` and `TOKEN_REFRESHED` events, each triggering the `onAuthChange` callback (line 81) which calls `clear(app)` + `showApp(app)` again. Each `showApp` call creates a new onboarding container and appends it. Result: 3 copies of step 1 visible.

Affects authenticated app shell too (duplicate headers/routes), but less visible because the content looks the same.

**Root cause:** `onAuthStateChange` fires for all events including `INITIAL_SESSION`, which duplicates the work `boot()` already did.

**Fix options:**
1. Guard `showApp` with a flag so it only executes once (reset on explicit logout)
2. Filter `onAuthStateChange` events — skip `INITIAL_SESSION` since `boot()` handles it; only react to `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` (and for token refresh, don't re-render)

---

### OI-0051 — Migration Summary Screen: Add "Copy Error Log" Button
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** pre-Tier-3-testing
**Status:** closed — 2026-04-20 (reconciliation sweep). `src/features/settings/v1-import.js:355-420` defines `renderCopyErrorLogBtn(audit, result)` with an OI-0051 doc comment; the button is appended to all three result screens (error card at line 263, parity report at 291, success report at 318). Uses `data-testid="v1-import-copy-error-log"`. Copy-to-clipboard emits toast via `t('settings.importV1ErrorLogCopied')`.

The migration summary screen (`src/features/settings/v1-import.js`) shows success/failure/parity results and auto-downloads unparseable dose CSV, but provides no way to capture the error log for troubleshooting. During Tier 3 testing (real v1 data on the deployed site), Tim needs an easy way to share errors without opening DevTools.

**What to add:** A "Copy error log" button on all three migration result screens (success, parity failure, error). On tap, collects the last 50 `app_logs` entries (from in-memory logger buffer or Supabase query), any migration-specific warnings from the `audit` object, and the `result` object summary. Formats as text, copies to clipboard. Toast: "Error log copied."

**Where:** `showV1SuccessReport()`, `showV1ParityReport()`, and the error card in `handleV1Import()` — add button to each.

---

### OI-0050 — Onboarding & Settings Records Never Sync to Supabase
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** pre-CP-66
**Status:** closed — fixed 2026-04-14

All 10 `add()` calls in onboarding and all 5 `update()` calls in settings now include `toSupabaseFn` and `table` params. Full codebase audit confirmed no other `add()`/`update()` calls missing sync params. "Resync to server" button added to Settings → Sync & Data as recovery path for existing users (`pushAllToSupabase()` re-queues all localStorage data).

**Spec file:** `github/issues/BUG_onboarding-settings-sync-gap.md`

---

### OI-0048 — Migration: Observation Type Inference Defaults All to 'open'
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Type now inferred from raw v1 source string: `rawSource.includes('close') ? 'close' : 'open'`. Covers `event_close` and `sub_move_close`. 4 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0049 — Migration: Feed Transfer Source Linking Dropped
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Transfer pair index built before event loop, `source_event_id` resolved via `transferPairId` for both sides. Orphaned pairs logged to audit warnings. Stats tracked: `transferPairsFound`, `transferPairsLinked`, `transferPairsOrphaned`. 3 unit tests added.

**Spec file:** `github/issues/v1-migration-open-event-fixes.md`

---

### OI-0047 — Member Management & Invite Flow Missing from V2 UX Specs
**Added:** 2026-04-14 | **Area:** v2-design | **Priority:** P2
**Checkpoint:** pre-Phase-3.5
**Status:** closed — 2026-04-20 (close-out audit). Implementation landed in an earlier session without the OI being closed. Everything the CP-66 spec called out is shipped in `src/features/settings/member-management.js` (446 lines — `openMemberManagementSheet`, `renderMemberList`, `showInviteForm`, `createInvite`, `renderRoleSelect`, `removeMember`, `cancelInvite`, `regenerateLink`, `copyInviteLink`, `generateInviteUrl`, `getMemberCount`, `getCurrentUserRole`, `renderMemberSheetMarkup`) and `src/features/auth/invite-claim.js` (142 lines — `#invite={token}` route handler + `claim_invite_by_token` RPC call + `claim_pending_invite` email fallback). All 18 acceptance criteria in `github/issues/CP-66_member-management-invite.md` met. Follow-up work on in-place edits for pending invites and accepted members tracked separately as OI-0120 — those capabilities were out of scope for CP-66.

**What shipped:**
- Member list with owner/admin/team_member ordering + pending invites sorted by `invited_at` ascending
- Create invite (inline form: display name, email, role segment control; auto-copies link to clipboard on save)
- Copy link / regenerate link / cancel invite for pending invites
- Change role (admin ↔ team_member) via inline `<select>` for accepted non-owner members
- Remove member with `window.confirm` gate for accepted non-owner, non-self members
- Owner row protected (no action buttons)
- Team members see read-only member count via `getMemberCount()`; management sheet gated by `isAdminOrOwner` check
- Router detects `#invite={token}` hash and triggers `claim_invite_by_token` RPC
- Unauthenticated invitee sees sign-in prompt; authenticated invitee's row is claimed (user_id set, accepted_at set, invite_token nulled)
- Already-claimed / invalid-token / already-a-member edge cases handled
- Hash cleared from URL after processing
- Email-based fallback (`claim_pending_invite`) runs on sign-in when user has no operation (v1 parity)
- All user-facing strings use `t()`; no `innerHTML` anywhere in the two files

**Spec file:** `github/issues/CP-66_member-management-invite.md` (retained as canonical reference; no GH- prefix because the spec was never filed as a GitHub issue for implementation — work shipped directly from Cowork's spec).
**Schema impact:** Adds `invite_token uuid` column to `operation_members`. CP-55/CP-56 impact handled (pending-row tokens exported, missing-column fallback on old backups).
**Decisions made:** Shareable link approach (admin copies URL, sends via text/email/etc.). No Supabase email service required. Email-based fallback claim preserved from v1 for belt-and-suspenders.

---

### OI-0046 — App Header Missing "Get The Hay Out" App Name
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-GH-5
**Status:** closed — fixed 2026-04-14

Added `t('app.name')` as `.header-app-name` element above the operation name in `src/ui/header.js`. Styled as 11px uppercase muted text (`--text2`). Does not compete with operation name or farm picker.

---

### OI-0040 — Move Wizard / Event Close Missing Residual Height + Recovery Day Inputs
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Added post-graze observation fields (residual height, recovery min/max days) to event close, move wizard close-out panel, and sub-move close. Added pre-graze observation fields (forage height, forage cover %) to move wizard destination panel and sub-move open. Validation controlled by `farm_settings.recovery_required`. Fields pre-fill from farm_settings defaults. New `observation-fields.js` helper module reused across all 3 surfaces. `createObservation()` extended with optional `fields` parameter. Recovery required toggle added to Settings.

---

### OI-0041 — Move Wizard Missing Pre-Graze Observation Fields
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — merged into OI-0040 fix (2026-04-14)

Pre-graze fields (forage height, forage cover %) added to move wizard destination panel and sub-move open sheet.

---

### OI-0042 — Health Recording: Group Session Mode Not Implemented
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** post-CP-57
**Status:** open — deferred to Phase 3.5 (Polish). Single-animal mode is functional; group iteration is a workflow convenience.

V2_UX_FLOWS.md §14 specifies group session mode for Weight, BCS, and Treatment recording (iterate through animals in a group). This is not implemented — health recording is single-animal only. No advance-to-next or group iteration pattern in weight.js, bcs.js, or treatment.js.

---

### OI-0043 — Field Mode Tile Navigation Targets Incorrect
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

"Harvest" tile now navigates to `#/harvest` (the harvest recording screen) instead of `#/feed` (feed inventory). "Feed Animals" stays at `#/events` which is the correct parent screen for feed delivery actions. Direct-to-sheet opening deferred — the parent screen navigation gives the user the right context.

---

### OI-0044 — Remaining i18n Hardcoded Strings (6 low-priority)
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

All 28 i18n violations fixed. Final 6: mobile-events-screen.js detail summary, reports/reference-console.js title, rotation-calendar/toolbar.js add button, settings parity reports, amendments/entry.js currency display.

---

### OI-0045 — Dead Export: daysBetweenExact() in date-utils.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-CP-57
**Status:** closed — fixed 2026-04-14

Removed `daysBetweenExact()` from `src/utils/date-utils.js` and its 3 tests from `tests/unit/date-utils.test.js`.

---

### OI-0039 — §2.25 Spec Text Describes Per-Element Rows but Schema Uses Single Row
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design | **Priority:** P3
**Checkpoint:** CP-57
**Status:** closed — spec updated 2026-04-14

**Resolution:** V2_MIGRATION_PLAN.md §2.25 rewritten to match the implemented schema: one row per effective date with three price columns (`n_price_per_kg`, `p_price_per_kg`, `k_price_per_kg`), not three rows with an `element` discriminator. Code was already correct. Spec-only fix.

---

### OI-0037 — CP-57 Drift: schema_version hardcoded instead of imported from backup-import.js
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P1
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/data/v1-migration.js` defines its own `CURRENT_SCHEMA_VERSION = 14` constant. §2.8 says "Read dynamically — same constant or derivation that CP-55 export uses per §5.11." If a new migration lands, v1-migration.js would retain stale value.

**Spec violated:** V2_MIGRATION_PLAN.md §2.8 (`schema_version` row) and §1.6 (`schema_version: current build's schema version (read dynamically per §5.11)`).

**Correct behavior:** Import `CURRENT_SCHEMA_VERSION` from `backup-import.js` (the single source of truth) instead of declaring a duplicate constant.

**Files affected:** `src/data/v1-migration.js`

---

### OI-0038 — CP-57 Drift: auto-backup not skipped for empty operations per §1.6
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-57
**Status:** closed — fixed 2026-04-14

**What is wrong:** `src/features/settings/v1-import.js` calls `importOperationBackup()` unconditionally. §1.6 says "CP-57 skips the auto-backup step when the target operation has no existing data." On first migration an empty operation produces a useless auto-backup download.

**Spec violated:** V2_MIGRATION_PLAN.md §1.6 (CP-57 Architecture — CP-56 steps that CP-57 skips).

**Correct behavior:** Add a `skipAutoBackup` option to `importOperationBackup()`. CP-57 passes `skipAutoBackup: true` when the target operation is empty (no events, animals, or locations). CP-56's own import path never sets it.

**Files affected:** `src/data/backup-import.js`, `src/features/settings/v1-import.js`, `src/data/v1-migration.js`

---

### OI-0036 — Remove v1 Import Option from Settings After Cutover
**Added:** 2026-04-14 | **Area:** v2-build | **Priority:** P4
**Checkpoint:** post-cutover
**Status:** open — deferred until v2 is live and v1 migration is complete

The "Import from v1" option in Settings → Import (CP-57) is a one-time migration tool. After Tim has migrated, verified data, and gone live in v2, the v1 import entry point should be removed from the UI. Not urgent — it does no harm sitting there — but it's cleanup that keeps Settings tidy.

**Fix:** Remove the "Import from v1" button/section from the Settings → Import screen. Delete or gate the migration transform code behind a feature flag or remove entirely. One PR after cutover is confirmed.

---

### OI-0020 — Calc Reference Console Destination (Reports → Settings)
**Added:** 2026-04-13 | **Area:** v2-design → v2-build | **Priority:** P3
**Checkpoint:** post-CP-54 (future)

The Calc Reference console (renders all registered formulas grouped by domain) currently lives in Reports and is reached as a tab alongside the six report tabs listed in §4.6. It is a developer/audit surface, not a user-facing report. The right long-term home is **Settings → Developer** (or equivalent), which keeps Reports focused on user-facing analytics.

**Why defer:** moving it now expands CP-54 scope. Reports already renders it; no user-visible regression by leaving it there one CP longer. The Settings surface for this doesn't yet have a design.

**Fix path:**
1. Design a Settings → Developer (or Settings → Advanced) section that houses the calc reference (and any other admin/diagnostic surfaces).
2. Move the console render from Reports to the new Settings section.
3. Remove the tab from Reports; update §4.6 to list exactly the 6 tabs with no "plus Calc Reference" aside.
4. Grep and delete any `#/reports/reference` routes.

**Out of scope for CP-54.** Claude Code should leave the reference console in Reports for this checkpoint.

---

### OI-0012 — Calc Test Coverage Gap
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Added 29 targeted tests to `tests/unit/calcs.test.js` (13 → 42 total): DMI-1 residual-by-date regression (3 tests), DMI-2 lactation branching beef vs dairy (3 tests), DMI-5 interpolation (2 tests), FED-1 residual percentage (3 tests), CST-1 feed cost (2 tests), CST-2 batch unit cost (2 tests), CST-3 NPK value (2 tests), REC-1 strip graze independent recovery (1 test). All requested coverage gaps addressed.

---

### OI-0013 — Reference Console Description Spot-Check
**Added:** 2026-04-13 | **Area:** v2-build | **Priority:** P2
**Checkpoint:** CP-45/CP-46/CP-47
**Status:** closed — fixed 2026-04-14

Audited all 37 `registerCalc()` calls across 4 files (core.js, feed-forage.js, advanced.js, capacity.js) against V2_CALCULATION_SPEC.md §4. Found 1 mismatch: CST-2 description said "cost_total / quantity_original" but spec says "bidirectional" — corrected. All other 36 descriptions match (some code descriptions add clarifying detail beyond the spec, which is acceptable).

---

### OI-0008 — CP-17: Location Picker Recovery Section Always Empty
**Added:** 2026-04-12 | **Updated:** 2026-04-14 | **Area:** v2-build | **Priority:** P3
**Checkpoint:** CP-17
**Status:** open — unblocked, ready to build

**No longer blocked.** OI-0040 fix landed — close observations now capture `recovery_min_days` and `recovery_max_days`. REC-1 calc is implemented in `src/calcs/advanced.js`. All the data and calc pieces exist.

**What remains:** Wire REC-1 into the location picker in `src/features/events/index.js` (line ~644 `renderLocationPicker()`). Currently a comment at line ~664 says "without paddock_observations we can't determine recovery status" and puts all non-in-use land locations into "Ready."

**Fix:**
1. For each non-in-use land location, query its most recent close observation (`type='close'`)
2. If that observation has `recoveryMinDays`, run REC-1 to get `earliestReturn`
3. If today < `earliestReturn` → classify as "Recovering" instead of "Ready"
4. Add a "Recovering" section to the sections array (between Ready and In Use)
5. ~15–20 lines of code. No schema change, no new calc.

---

## Closed

### OI-0035 — Schema Version Bump Convention Not Spec'd
**Added:** 2026-04-14 | **Closed:** 2026-04-14 | **Area:** v2-design / v2-build
**Resolution:** Convention defined and codified in two places: (1) **V2_MIGRATION_PLAN.md §5.11a** — new subsection "Schema Version Bump Convention" specifying that every new migration SQL ends with `UPDATE operations SET schema_version = N;` and adds a `BACKUP_MIGRATIONS` entry (no-op is fine: `N-1: (b) => { b.schema_version = N; return b; }`), plus update §5.3/§5.3a if the migration adds a table or FK. (2) **CLAUDE.md Code Quality Check #6** — enforced at commit time, same three requirements. Principle: "always do it, no judgment calls" — removes the need for case-by-case assessment of whether a migration changes backup shape.

---

### OI-0034 — CP-57 §2.7 Unparseable-Dose Audit Report Surface
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Downloaded CSV file. Format: one row per unparseable dose (animal tag, date, raw dose text, treatment_type, notes). Downloaded automatically at end of migration alongside the summary screen. V2_MIGRATION_PLAN.md §1.4 (Audit Report) and §2.7 updated to specify CSV download surface.

---

### OI-0033 — CP-57 §2.23 Calculation Parity Check — Promote to Formal AC
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Promoted to formal CP-57 acceptance criterion. NPK parity check: v1 stored NPK per event vs v2 on-read NPK calc, flag deltas >1% in the audit report. V2_MIGRATION_PLAN.md §1.4 updated with parity check bullet. Reference in §2.23 retained.

---

### OI-0032 — CP-57 Architecture: Reuse of CP-56 Import Pipeline
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Confirmed: CP-57 reads v1 JSON → applies 24 transforms → produces a v2-shaped backup envelope (same format as CP-55) → feeds into CP-56 import pipeline. Gets FK-ordering (§5.3a), parity check, and migration chain for free. Auto-backup step skipped when target operation is empty (one-off migration, nothing to back up). `schema_version` in synthesized envelope set to current. Documented in new **V2_MIGRATION_PLAN.md §1.6** (CP-57 Architecture).

---

### OI-0031 — CP-57 Tool UX: Where Does the Migration Tool Live?
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Settings → Import, alongside CP-56's "Import backup." Labeled "Import from v1." File upload (v1 JSON export). Re-run allowed (user can retry after failed attempt). Documented in new **V2_MIGRATION_PLAN.md §1.7** (CP-57 Tool UX). Post-cutover cleanup: OI-0036 added to remove the v1 import option after migration is complete.

---

### OI-0030 — CP-57 §1 Missing: v1 Export JSON Shape
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Option (a) — snapshot v1 export shape into v2 docs. New **V2_MIGRATION_PLAN.md §1.5** documents the complete v1 `S` object: 26 arrays (events, paddocks, animals, groups, etc.), objects/scalars (users, operationSettings, settings sub-fields), each with §2 transform cross-reference. Pulled from v1's `ensureDataArrays()` in index.html and ARCHITECTURE.md data model section.

---

### OI-0029 — CP-57 §2.14 animal_classes — Verify Rename/Splits Alignment
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Verified against `supabase/migrations/003_d3_animals_groups.sql`. §2.14 field list matches current schema. Added `archived = false` row to §2.14 for all migrated classes (column exists in schema, not previously in the transform spec). No rename/split drift found — the "rename/splits" noted in CLAUDE.md referred to earlier design iteration, not a code-level divergence.

---

### OI-0028 — CP-57 §2 Missing Transform: npk_price_history
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 tracks only current NPK prices (not history) in `operation_settings` JSONB (`nPrice`/`pPrice`/`kPrice`). Migration creates one `npk_price_history` row per element (N, P, K) with `effective_date = migration date` and current prices converted from $/lb to $/kg. New **V2_MIGRATION_PLAN.md §2.25** (npk_price_history) documents the transform. Tim confirmed current values with migration date as first record is the right approach.

---

### OI-0027 — CP-57 §2.24 user_preferences.active_farm_id Default for Migrated Prefs
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added `active_farm_id = NULL` to V2_MIGRATION_PLAN.md §2.24 user_preferences transform. Puts migrated user in "All farms" mode; they can pick an active farm after migration. v1 has no multi-farm concept. One-line spec update.

---

### OI-0026 — CP-57 §2.8 operations.schema_version Stamp During Migration
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** Added row to V2_MIGRATION_PLAN.md §2.8 operations transform table: `schema_version | Set to current schema version at time of migration. Read dynamically per §5.11.` Ensures migrated operations get the correct stamp for subsequent backups/imports.

---

### OI-0025 — CP-57 §2.7 Animal Notes Routing: animal_notes Table vs animals.notes Field
**Added:** 2026-04-13 | **Closed:** 2026-04-14 | **Area:** v2-design
**Resolution:** v1 type='note' health events → `animal_notes` table rows (one per note, `noted_at` from health event date). v1 `animals.notes` (free text field) stays as-is in `animals.notes` — not moved to `animal_notes`. V2_MIGRATION_PLAN.md §2.7 rewritten with updated notes routing. Tim confirmed: not many notes, so the clean one-per-row approach works.

---

### OI-0024 — CP-57 §2.3 event_paddock_windows Strip Graze Defaults
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added paragraph to V2_MIGRATION_PLAN.md §2.3 specifying full-paddock defaults for all migrated paddock windows: `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100`. Verified against migration 005 (`is_strip_graze DEFAULT false`, `area_pct DEFAULT 100 CHECK > 0 AND <= 100`) and V2_SCHEMA_DESIGN.md §5.2 — DB defaults match the migration values, but the spec sets them explicitly for clarity. v1 has no strip graze concept; users wanting strip graze on previously-migrated events would close and re-create. Note: `area_pct = 100` confirmed as the "full paddock" value (not NULL).

---

### OI-0023 — CP-57 §2.2 events.source_event_id Default for Migrated Events
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Added line to V2_MIGRATION_PLAN.md §2.2 events transform table: `source_event_id | NULL for all migrated events. New in v2 (GH-5, migration 014) — links cross-farm moves. v1 has no equivalent; all migrated events are origin events.` No design discussion needed — v1 has no cross-farm move concept.

---

### OI-0021 — CP-56 Transaction Strategy (Atomic Restore)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Option B — per-table client-side replace in FK-dependency order, with halt-on-first-failure.** No Postgres stored procedure. Rationale: the payload-size ceiling on Supabase `rpc` (~50 MB even with bumped limits) would force chunking for real operations, and chunked RPC is not atomic across chunks either — so Option A gives atomicity in dev and a fake promise in production. Option B keeps the implementation surface smaller (no SQL function to maintain in lockstep with schema changes), fails loudly at the specific table/row that violated, and is safe because the auto-backup file from OI-0022 is the rollback mechanism. Decision locked in V2_MIGRATION_PLAN.md §5.7.6 (wholesale replace, halt, reference §5.3a for order). FK-ordering authoritative list added as new §5.3a with two-pass pattern for `animals` and `events` self-references. CLAUDE.md "Known Traps" updated with FK-ordering rule pointing at §5.3a.

### OI-0022 — CP-56 Revert Safety Net (24h Stash Mechanism)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** **Auto-downloaded pre-import backup file.** Before the destructive replace runs, CP-56 calls the CP-55 export path to produce a fresh backup of the current operation state and triggers a browser download named `gtho-v2-auto-backup-before-restore__{slug}__{timestamp}__schema-v{N}.json`. Revert = re-import that file via the normal import flow. No in-app stash, no localStorage quota problem, no IndexedDB surface, no Supabase side table. If the auto-backup fails to produce (sync pending, offline, download blocked, disk full), CP-56 halts before the destructive replace — the import does not proceed without a safety net. Decision locked in V2_MIGRATION_PLAN.md §5.7.4 (step 4 of import procedure) and new §5.7a (Revert Mechanism — Design Decision) covering rationale, tradeoffs, and failure modes.

### OI-0019 — No Logout Affordance in Header (v1 Parity)
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Designed alongside OI-0015 since they share the same header real estate. User menu button (circle with initials) added to right cluster; tap opens popover with user email and Log Out. Logout triggers confirm dialog only when unsynced writes exist in the queue. Field Mode exits first before logout. Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0015 — Header Shows Farm Name, Needs Operation Name + Farm Picker
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-design → v2-build
**Resolution:** Full design locked. Key decisions: (1) `user_preferences.active_farm_id uuid NULL` — per-user, syncs across devices, null = "All farms" mode; (2) "All farms" mode supported — farm-scoped screens aggregate with per-record farm chips; (3) switch-with-unsaved-work shows a confirm dialog (Switch anyway / Cancel), drafts stay tied to their source farm; (4) active farm scopes display, not permissions — wizards include a **farm chip** at the top of destination pickers so cross-farm moves work without context switching; (5) **no event straddles farms** — whole-group cross-farm moves close the source event and open a new event linked by `events.source_event_id`; (6) individual animal cross-farm moves are membership edits only, no new event; (7) **build stamp restored** to header right cluster for testing diagnostics; (8) event cards render directional markers ("← from {farm}" / "→ to {farm}") when `source_event_id` links to an event on a different farm. Doc updates applied to V2_SCHEMA_DESIGN.md (§1.5, §5.1), V2_UX_FLOWS.md (§1, §17.2, new §18), V2_DESIGN_SYSTEM.md (§3.6). Full spec: `github/issues/header-redesign-and-multi-farm-context.md`.

---

### OI-0017 — Product Add Dialog Missing Unit Selection
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added unit selection (from `inputProductUnits`) to the input product create/edit sheet in `src/features/amendments/reference-tables.js`. Saves `unitId` on the product. Unit name shown in product list. Feed type sheet already had a unit selector (bale/ton/kg/lb). Treatment recording sheet already had dose unit selector. The gap was only on amendment input products.

---

### OI-0018 — Sync Status Not Shown in App Header
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added compact sync indicator to `src/ui/header.js` — dot-based (sync-ok/sync-pending/sync-err/sync-off classes from existing §3.14 design tokens). Reads from `getSyncAdapter().getStatus()`. Tap navigates to `#/settings`. CSS button in `.header-sync-btn`. No duplicate logic — reuses existing store sync state.

---

### OI-0016 — Dose Units: No Add/Edit UI
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added dose unit CRUD to `src/features/health/reference-tables.js` — add/edit sheet, archive action, list with testids. Follows existing category/type pattern. No schema change needed (table exists). Seed data preserved; users can now extend.

---

### OI-0014 — Event Close Manure Transaction volumeKg Placeholder
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Verified architecturally sound. `volumeKg=0` is a deliberate placeholder — the stored record links the event to the manure batch for tracing. Real volume requires NPK-1 calc inputs (excretion_rate × avg_weight × head_count × duration × capture_pct). Reports will compute at display time via NPK-1, not from the stored column. Code comment updated in `close.js` to document this decision. No functional change needed until Phase 3.4 amendments reports are built — re-verify when writing that display path.

---

### OI-0011 — Feed Screen Metrics Still Show Placeholders
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Wired DM on hand (sum batch.remaining × dm_pct for non-archived batches), daily run rate (average daily DM delivered over 30 days from event_feed_entries), and days on hand (DM on hand ÷ run rate) into feed day goal banner. Progress bar threshold coloring now works. Three stat cells added below the heading. Unit-aware via display().

---

### OI-0001 — Strip Grazing: Partial Paddock Windows
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-design
**Resolution:** Design integrated into main docs. Schema (V2_SCHEMA_DESIGN.md §5.2 event_paddock_windows) has `is_strip_graze`, `strip_group_id`, `area_pct`. Calc spec (V2_CALCULATION_SPEC.md) NPK-3, FOR-1, REC-1 updated for effective strip area. UX flows (V2_UX_FLOWS.md) §1.4 (move wizard strip graze option), §2.4 (advance strip action), §11 (event card strip progress) all documented. Design system §3.15 covers strip grazing progress component. Decision logged as A45 in V2_BUILD_INDEX.md. Spec remains at `github/issues/strip-grazing-paddock-windows.md` for Claude Code when this work is picked up during the rotation calendar (CP-54) or a dedicated checkpoint.

---

### OI-0002 — Unit System: No Schema Column
**Added:** 2026-04-12 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Design decision made: unit system lives on `operations` (operation-wide, same rationale as currency). Schema amended — `operations.unit_system text NOT NULL DEFAULT 'imperial' CHECK IN ('metric','imperial')`. Decision logged as A44 in V2_BUILD_INDEX.md. V2_INFRASTRUCTURE.md §1.3 added. V2_MIGRATION_PLAN.md §2.8 updated. Implementation spec written: `github/issues/unit-system-operations-migration.md` — includes localStorage → operation migration path, full list of unit-sensitive settings that must re-render on toggle, and input field conversion behavior.

---

### OI-0009 — Desktop Layout: Nav Sidebar Overlaps Main Content
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Added `grid-column: 2` to `.app-content` in the `@media (min-width: 900px)` block of `src/styles/main.css`. This places the main content in the `1fr` column (right side), while the fixed nav covers the 220px left column. GH issue #1.

---

### OI-0010 — Dashboard Home Screen Not Rendering Per v1 / Missing §17 Implementation
**Added:** 2026-04-13 | **Closed:** 2026-04-13 | **Area:** v2-build
**Resolution:** Complete rebuild of dashboard per V2_UX_FLOWS.md §17. Header bar updated to show farm name. Farm overview stats row (5-metric desktop, 3-metric mobile with threshold colors). Period selector pills (24h/3d/7d/30d/All). View toggle (Groups/Locations, default locations for new users). Group cards with composition line, location status bar, DMI progress, NPK deposited, action buttons (Move/Place/Weights/Edit), and collapse/expand on mobile. Location cards with active events by location, group lists, feed status, strip graze info, and unplaced groups section. Open tasks section (4 compact todo cards + Add task + All tasks link). Survey draft card (conditional). Weaning nudge (conditional). Mobile bottom nav (7 items, fixed bottom). Todos feature UI created: `src/features/todos/` with todo list screen (`#/todos` route), 3-axis filter bar (status/user/location), todo create/edit sheet, todo card component (compact + full modes). Todos nav entry with red badge (open count) on both desktop sidebar and mobile bottom nav. GH issue #2.

---

### OI-0003 — Animal Notes: No Schema Table
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-design
**Resolution:** Option A — add `animal_notes` table (id, operation_id, animal_id, noted_at, note, created_at, updated_at). Tim confirmed animals need notes. Schema amendment needed in V2_SCHEMA_DESIGN.md D9. V2_UX_FLOWS.md §14.8 updated to remove pending-decision language.

---

### OI-0004 — CP-22: Pull/Merge from Supabase Not Implemented
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Built sync registry (`src/data/sync-registry.js`) mapping all 50 entity types to table names + `fromSupabaseShape`. Added `mergeRemote()` to store (remote wins when `updated_at` newer, 5 unit tests). Added `pullAllRemote()` orchestrator (`src/data/pull-remote.js`). Wired into boot (flush queue then pull) and reconnect (window 'online' → flush then pull).

---

### OI-0006 — CP-18: Advance Strip Button Not Rendered
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Advance Strip button now renders on event cards when any paddock window has `isStripGraze=true` and is open. Sheet has two phases: close current strip (date/time) + open next strip (date/time). "End strip early" closes without opening next. Strip progress label shows "Strip N of M — Location". Creates close + open observations. Forage fields deferred to Phase 3.3. Strip progress bar visualization (§3.15) deferred — label only for now.

---

### OI-0007 — CP-17/18/20: Paddock Observations Not Created
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Added `createObservation()` helper. Observations now created at all 5 locations: event creation (open), sub-move open (open), sub-move close (close), move wizard (close per source window + open for destination), event close (close per window). Forage height/cover/quality fields remain null until Phase 3.3 populates them.

---

### OI-0005 — CP-23: E2E Test Has Wrong Selectors and Was Never Run
**Added:** 2026-04-12 | **Closed:** 2026-04-12 | **Area:** v2-build
**Resolution:** Fixed 3 onboarding selector mismatches (`onboarding-op-name` → `onboarding-operation-name`, `onboarding-next` → step-specific `onboarding-next-1/2/3`, `.onboarding` → `[data-testid="onboarding-wizard"]`). Changed auth flow from signup to login (Supabase rejects fake email domains). Added `beforeAll` guard requiring E2E_EMAIL/E2E_PASSWORD env vars. All 35 selectors verified against source. Playwright browsers confirmed installed. Test requires pre-created Supabase auth account to run.

---

## Change Log

| Date | Session | Changes |
|------|---------|---------|
| 2026-04-21 | OI-0124 opened — Location `.areaHa` field-name drift (BRC dead on 4 of 5 pre-graze surfaces) | Tim reported BRC auto-fill inert on the Move All wizard — typing a ring count does not flip Forage Cover %. Investigation confirmed the same bug is silently present on **four of the five** observation-card surfaces (Move All, Event Detail §5, Edit Paddock Window per OI-0118, Pasture Survey); only Sub-move Open works because OI-0114 NC-1 wrote fresh code with the correct field name. Root cause: Location entity's field is `areaHectares` (`src/entities/location.js:10`), but these four surfaces read `loc.areaHa` — which is `undefined` on every Location object. `paddockAcres` resolves to `null` → `isBrcAvailable()` returns false → ring-count listener is a no-op. **OI-0075** (commit `69cc154`, 2026-04-18) already established a `?? areaHa` legacy fallback pattern for 8 dashboard sites with the message "entity field is areaHectares; areaHa kept as legacy fallback" — Phase 1 extends that same pattern to the four broken observation-card surfaces. Grep confirmed broader drift: 20+ other `loc.areaHa` reads across `locations/index.js` (9 sites), `field-mode/index.js` (2), `detail.js:452`, `harvest/index.js:201`, `amendments/entry.js:355`, `feed-forage.js` (3), plus the existing correct-fallback sites in `dashboard/index.js` (8) and `dmi-chart-context.js`. `v1-migration.js` writes `area_hectares` correctly (line 353), confirming no live path produces `.areaHa` on a Location — the fallback is defensive against nothing and can be retired in Phase 3. OI-0124 structured as three phases: **Phase 1** (BRC observation surfaces, user-reported, ready to ship, spec at `github/issues/location-area-field-brc-fix.md`); **Phase 2** (drift sweep across 20+ other callers); **Phase 3** (legacy fallback retirement + CLAUDE.md §Known Traps entry). No schema change; no CP-55/CP-56 impact. Phase 2 + 3 tracked inside OI-0124's status line until Phase 1 lands, at which point they get their own spec files. **Related shipped OIs:** OI-0114 NC-1 (sub-move BRC fix, 2026-04-18), OI-0075 (dashboard drift fix + fallback origin, 2026-04-18), OI-0118 (Edit Paddock Window — inherited the drift at line 84-85, not an OI-0118 regression but Phase 1 closes the gap OI-0118 landed on top of). **No code change this session — OPEN_ITEMS.md entry + Phase 1 spec file only.** |
| 2026-04-20 | OI-0122 scope lock + session brief written — fix + one-time backfill | Tim chose the "fix + backfill" path on OI-0122: ship the 1-line code fix at `move-wizard.js:680` AND migration 030 one-time backfill of existing same-farm rotations so all existing E-3-class cards heal their DMI-8 charts immediately rather than waiting for the next rotation. Cowork ran the backfill CTE as a dry-run against live Supabase (`sxkmultsfsmfcijvsauf`): 22 events with `source_event_id = NULL`; CTE resolves **16 unambiguously**, leaves 2 ambiguous (E-5 `b23f20c2` and J3/K `8f15a4ab` — groups came from different prior events), ~4 legitimate first events. **Cycle discovery:** two v1-migration Corral events on 2026-03-19 (`7e88a2d4` and `8fca7c26`) point at each other via matching `date_left = date_joined` on the same group, creating a self-referential cycle. Guarded out via a strict-inequality cycle clause (`source_start < target_start`) in a second CTE — same-day pairs where both `event_paddock_windows.MIN(date_opened)` are equal get filtered before the UPDATE. **Display-side scope reduction:** initial OI-0122 spec proposed tightening `src/features/events/index.js:344` from `if (evt.sourceEventId)` → `if (evt.sourceEventId && sourceEvt && sourceEvt.farmId !== evt.farmId)`. On re-read, line 346 already applies the farm-id comparison inside the outer guard (`if (sourceEvt && sourceEvt.farmId !== evt.farmId)`); same-farm `sourceEventId` values pass line 344 but are correctly rejected by line 346 → no banner. The outgoing case at line 358 also already compares farm IDs. Display-side is already safe. **Code diff reduced to one line.** OI-0122 body updated: struck the `events/index.js:344` change requirement, replaced "Decision point + default recommendation: minimum ship" with the locked scope (fix + backfill), added acceptance criteria for migration 030 + BACKUP_MIGRATIONS[29] + the backfill verification (N=16 expected). Session brief written at `session_briefs/SESSION_BRIEF_2026-04-20_oi0122-source-event-id.md` — includes the 1-line code diff with comment update, the full migration 030 SQL (CTE + cycle guard + schema_version bump), the BACKUP_MIGRATIONS[29] no-op entry, pre- and post-migration verification queries, 3 unit test cases (same-farm sets, cross-farm still sets, destType='existing' no-op), 1 DMI-8 chart test case, 1 e2e with Supabase round-trip assertion, and a commit message template. Migration number verified (028 claimed by OI-0117, 029 claimed by OI-0113, next is 030). BACKUP_MIGRATIONS last key verified (28). **No code change this session — OPEN_ITEMS.md + session brief only.** PLUGIN IMPROVEMENT candidate already logged inline on OI-0122 (line 123): when a migration adds an FK-like column, the spec-review checklist should ask "is there a single write path? does it set the column on all branches, or only some?" |
| 2026-04-20 | OI-0121 Option A locked + OI-0122 (same-farm source_event_id) + OI-0123 (sub-move close forced-feed-check UX) opened | Tim chose **Option A** for OI-0121 — retire DMI-4 on the card, derive summary from DMI-8 cascade totals over the chart's window. OI-0121 status bumped from "DESIGN REQUIRED" to "DESIGN LOCKED: Option A" with the four remaining sub-questions (aggregation window, DMI-4 disposition, Event Detail scope, deficit text rendering) flagged for Tim to answer before the spec converts to a `github/issues/` file. Tim then flagged two new E-3 field-testing issues; Cowork diagnosed both via Supabase MCP against `sxkmultsfsmfcijvsauf`. **Issue 1 → OI-0122:** E-3 event's Sat+Sun chart bars are blank. Root cause: `src/features/events/move-wizard.js:680` sets `sourceEventId` only for cross-farm moves (`sourceEventId: isCrossFarm ? sourceEvent.id : null`). Same-farm rotations end up with `source_event_id = NULL`, which defeats the OI-0119 chart date-routing bridge (`dmi-chart-context.js:140-142` reads `event.sourceEventId` to route pre-start days to the source event's cascade). Without that bridge, pre-start days run the new event's own cascade — which walks forward from `event.dateIn` and returns 0/0/0 for dates before startDate, rendering blank bars. Verified: E-3 event (`fa16a58d`) has `source_event_id=NULL` despite a legitimate source event (`da54838f`, which held G-1+G-3 windows Apr 18-20 closing at the same instant E-3 opened). Fix is a 1-line change at `move-wizard.js:680` (unconditional `sourceEventId: sourceEvent.id`) plus tightening the display-side "← Moved from {farm}" guard at `events/index.js:344` from `if (evt.sourceEventId)` to `if (evt.sourceEventId && sourceEvt.farmId !== evt.farmId)` so same-farm moves don't trigger the banner. Minimum ship vs. ship+backfill decision surfaced to Tim; default recommendation minimum-ship (historical events stay blank). **Issue 2 → OI-0123:** G-3 sub-move close forced feed-check prompt appeared to be suppressed. Supabase data proves it actually fired — feed_check `b6d1448f-...` was created at 2026-04-20 18:59:21.584 UTC, 11ms after the G-3 window close at 18:59:21.573. Remaining=0.5 on batch → G-1. Tim's hypothesis that "a prior feed check suppressed the force" is incorrect — the force fired, Tim submitted a value, the row exists. Real diagnosis: UX framing. The forced-feed-check card groups by `${entry.batchId}|${entry.locationId}` where locationId is the **delivery** location (G-1), not the **closing** location (G-3). Card heading reads "batch → G - 1" while Tim is closing G-3, so visually it doesn't feel like part of the close action — especially after Tim had done a manual feed check on the same batch+location 6 minutes earlier (at 18:53, remaining also 0.5). The force worked; the UX made it invisible. Three fix options specced: (A) re-frame copy to make the card read as part of the close ("Record feed remaining before closing {closingLocName}"), (B) suppress the card when a recent check on same batch+location already exists (risk: breaks OI-0119 close-boundary invariant), (C) both — re-frame + seed card default from prior check's value for single-tap confirm. Default recommendation: (A) + seeding half of (C). No suppression. **All three OIs added to Open stack** (OI-0121 updated, OI-0122 P1 spec-ready, OI-0123 P2 design-required). **No code change this session — OPEN_ITEMS.md edits only.** Supabase audit queries used (events, event_paddock_windows, event_feed_entries, event_feed_checks, event_feed_check_items) — no data modified. |
| 2026-04-20 | OI-0121 opened — Dashboard card summary (DMI-4) vs DMI-8 chart bars contradict each other on the same card | Tim shared a screenshot of the D location card on Dashboard showing the summary text line "88% est. pasture · 12% stored" immediately above a 3-day chart with Monday rendered entirely red (deficit). Used Supabase MCP against project `sxkmultsfsmfcijvsauf` to pull D event's state (event `52bca23d-...`, 1 open paddock window on location `a334f135-...`, 3 group windows totaling 16 head, 1 feed delivery, 10 feed checks, no sub-moves, 28 days on pasture from Mar 24). Traced both paths in code. **Root cause:** the summary line (`src/features/dashboard/index.js:1103-1107`) uses **DMI-4** (`src/calcs/feed-forage.js:97-122`) — a naïve mass-balance `pasture_dmi = total_dmi_required − stored_consumed` that credits any non-stored consumption to pasture regardless of whether the pasture pool can supply it. The chart bars (`dashboard/index.js:1339-1361`) use **DMI-8** via `computeDmi8Days(event, dmi8)` — the walk-forward cascade just shipped under OI-0119. For D event the math: FOR-1 initial pool ≈ 1,162 kg DM vs 28-day demand ≈ 3,584 kg DM; DMI-4 credits 88% to pasture because stored entries only account for ~430 kg (12%); DMI-8 correctly depletes the pasture pool around day 15, then stored, then deficit. Both are mathematically correct within their own models — they simply model different things. The user sees two contradictory at-a-glance signals on the same card. **Observation data drift is NOT the cause** — D's pre-graze observation `3cb56005` has `source_id = event_id` instead of `pw.id` (pre-OI-0112 artifact affecting 50 of 73 event-sourced observations), but `pickPreGraze()` in `feed-forage.js:589-597` falls back to `(locationId + most-recent createdAt)` and correctly selects D's observation. That data cleanup is OI-0113's territory, not this one. **OI-0121 added** at top of Open with status `open — DESIGN REQUIRED, do not build`. Spec lists two candidate fixes: **Option A** retire DMI-4 on the card and derive summary from DMI-8 cascade totals over the chart window (recommended default — one source of truth, extends naturally to a three-value pasture/stored/deficit breakdown); **Option B** rename DMI-4 as "Fed this period" to disambiguate from pasture-availability reality and add a separate deficit flag driven by DMI-8 (less visual churn, keeps DMI-4's supply-side accounting value). Four design questions surface before build: aggregation window (3-day vs full-event vs today), DMI-4 retention in registry, Event Detail §8 + §15 scope, deficit rendering in text. Base-doc impacts captured for reconciliation: V2_CALCULATION_SPEC.md §4.2, V2_UX_FLOWS.md §17.7 + §17.15, UI_SPRINT_SPEC.md adds SP-13 once scope locks. Related: OI-0119 (closed today — shipped DMI-8 cascade that made DMI-4's discrepancy visible), OI-0075 Bug 3 (prior card-data drift class pattern), OI-0117 (same failure mode in schema layer — two stored columns for one derivable fact). **No code change this session — OPEN_ITEMS.md entry only.** **PLUGIN IMPROVEMENT candidate** captured inline: when a card surfaces two numbers from two calcs describing the same phenomenon, a commit/test-time reconciliation check would catch this class. Log once Option A/B decision is made and the scope is clear. |
| 2026-04-20 | OI-closure discipline rules integrated — IMPROVEMENT #16 + CLAUDE.md section | After the five-OI reconciliation sweep earlier today, Tim asked "what is the root cause of the OI always being missed and stale?" Cowork diagnosed three distinct failure modes: **(A) Piggyback ship** — sibling OIs that close as a side effect of a larger headline change get forgotten (OI-0116 rode with OI-0117; OI-0052 rode with main.js auth rewrite). **(B) Orphan flip** — code ships cleanly but the OPEN_ITEMS.md status line just never gets flipped (OI-0051). **(C) Moot-by-downstream** — a structural change retires an older OI's problem symbol, but the person shipping the structural change doesn't know the older OI existed (OI-0087 + OI-0088 became moot when OI-0113 dropped `event_observations` and migration 029 bumped schema_version). All three are prevented at close-out time, not at reconciliation. Three rules specified: **Piggyback rule** (grep for sibling OIs referencing the same file/feature before committing the headline close; flip all in the same commit), **Orphan-flip belt-and-braces** (commits citing `OI-NNNN` must stage OPEN_ITEMS.md — post-commit grep contract: `git log -1 --format=%B | grep -E 'OI-[0-9]+'` implies `git diff-tree --no-commit-id --name-only -r HEAD | grep OPEN_ITEMS.md` returns a match), **Downstream-moot sweep** (table drops, schema bumps, file deletes, renames trigger a grep of OPEN_ITEMS.md for the retired symbol; flip any now-moot entries in the same commit). **IMPROVEMENT #16 added to IMPROVEMENTS.md** covering all three rules with plugin/skill targets (`deploy-gate` SKILL.md gets the sibling-OI audit + downstream-moot sweep + post-commit OI-cite grep contract; `doc-workflow` SKILL.md gets a "passenger OIs" note in the spec-handoff section so session briefs list sibling OIs alongside the headline; project-scaffold SKILL.md gets an optional pre-commit hook as the project-specific complement). **CLAUDE.md updated** with a new subsection "OPEN_ITEMS.md Closure Discipline" under the existing "Doc Ownership" heading (after "Session Brief Handoff") — three rules in plain prose plus the 2026-04-20 origin story (which five OIs exhibited which failure mode). Ships standalone — separate commit from the IMPROVEMENT #15 + PROJECT_CHANGELOG batch Claude Code is already handling. No schema change. No CP-55/CP-56 impact. Files touched: `IMPROVEMENTS.md` (+1 entry), `CLAUDE.md` (+1 subsection), `OPEN_ITEMS.md` (this Change Log row). |
| 2026-04-20 | OI reconciliation sweep — five close-outs (OI-0116, OI-0052, OI-0051, OI-0087, OI-0088) | Tim asked Cowork to walk each P2/P3 item I had listed as "genuinely open" and verify against the code before continuing. The sweep found five that were already resolved but never flipped in OPEN_ITEMS.md. **OI-0116** (editable `time_in` input on Event Detail header) — landed inside the OI-0117 ship rather than as a standalone handoff; `src/features/events/detail.js:350-381` has the `timeInInput` with all three OI-0115 teardown guards and writes through `setEventStart()` (consistent with OI-0117's drop of `events.time_in` in migration 028). Closed with a code-citation note. **OI-0052** (onboarding 3× render on first load) — fix applied via option 1 (same-user guard): `src/main.js:66` tracks `lastRenderedUserId`, `onAuthChange` at `main.js:88-92` short-circuits when the id already matches, so `INITIAL_SESSION` + `TOKEN_REFRESHED` restores no longer re-fire `showApp`. Explicit `(OI-0052)` comment in the code. Closed. **OI-0051** (Copy Error Log button on Migration Summary) — `src/features/settings/v1-import.js:355-420` defines `renderCopyErrorLogBtn` with an OI-0051 doc comment; wired into all three result screens (error card line 263, parity report 291, success report 318) with `data-testid="v1-import-copy-error-log"` and `t('settings.importV1ErrorLogCopied')` toast. Closed. **OI-0087** (`event_observations` missing from backup pipeline) — moot. Table no longer exists: OI-0112 migrated writers, OI-0119 migrated the last reader (DMI-8), OI-0113 dropped it in migration 029. `src/data/backup-migrations.js:128` deletes `b.tables.event_observations` from pre-v29 backups. The three-file edit this OI proposed would be incorrect today; pre/post-graze data now lives in `paddock_observations` (already in BACKUP_TABLES) and round-trips cleanly. Closed with a note that the proposed invariant unit test (`expect(Object.keys(BACKUP_TABLES).length).toBe(FK_ORDER.length)`) is still worth landing as a separate hygiene item. **OI-0088** (`CURRENT_SCHEMA_VERSION = 20` stale) — moot. `src/data/backup-import.js:20` is now `= 29`; migrations 021–029 each bumped the constant as they landed, so the drift this OI captured resolved organically. `BACKUP_MIGRATIONS` chain complete 14 → 29 including the 28→29 entry added by OI-0113. The proposed test (`expect(CURRENT_SCHEMA_VERSION).toBe(max(migration file numbers))`) is still valuable; log as a separate test-hygiene item. **Why this matters:** OPEN_ITEMS.md is the project's source of truth for "what's left." Five stale entries were overstating the backlog by ~40% in the P2 column and could have caused duplicate work on the next session if someone picked one up without checking. **Remaining P2/P3 open after this sweep:** OI-0070 (EST-1 accuracy calc — spec'd, build later), OI-0092 (residual feed NPK — stub, spec session required), OI-0057 (animal_classes NRCS defaults in v1-migration — still null at v1-migration.js:273-275), OI-0008 (location picker Recovering section — still says "without paddock_observations we can't determine recovery status yet" at events/index.js:719-721), OI-0020 (calc reference console move — deferred), OI-0079 (pasture survey picker — partially done, has picker sheet but no farm/type filter pills). Design-required and intentionally-deferred items unchanged (OI-0062, OI-0065, OI-0098, OI-0102 design-required; OI-0036, OI-0042, OI-0077 deferred). **No schema change. No CP-55/CP-56 impact. No code change — OPEN_ITEMS.md edits only.** |
| 2026-04-20 | OI-0113 decision + spec + OI-0059 close-out audit | Tim asked to tackle OI-0059 + OI-0113 as a bundle. Cowork found OI-0059 was **already shipped** 6 days ago — commit `5fcd881` (Tim, 2026-04-14) wrote `supabase/migrations/020_fix_operation_members_rls_recursion.sql`, added `BACKUP_MIGRATIONS[19]` no-op entry, updated backup-import + round-trip tests. OPEN_ITEMS.md just never got the close-out. Cowork verified via Supabase MCP (`SELECT ... FROM pg_policies WHERE tablename = 'operation_members'`) that all 4 live policies (SELECT/INSERT/UPDATE/DELETE) match the migration file byte-for-byte — simplified to `user_id = auth.uid()`, no recursive subqueries. `schema_version` = 28 (expected, past 020 and now at OI-0117's 028). **OI-0059 status flipped to closed** with the verification note; no spec needed; Claude Code only needs to include a one-line attestation in the OI-0113 commit. For **OI-0113**: Tim chose **Option A (drop)** conditional on an audit. Cowork ran the full grep sweep across `src/`, `tests/`, migrations, backup pipeline, and docs. Findings (all inlined in the spec file): (1) Live code requires changes at 10 locations — entity file `src/entities/event-observation.js` deleted; push-all.js + sync-registry.js imports + registry entries removed; store.js entity-type list + `captureEventSnapshot` + `restoreEventSnapshot` references removed; backup-export.js BACKUP_TABLES + backup-import.js FK_ORDER + CURRENT_SCHEMA_VERSION bump + new BACKUP_MIGRATIONS[28] 28→29 rule. (2) Entity test `tests/unit/entities/event-observation.test.js` deleted. (3) Historical fixture `tests/fixtures/backup-v14.json` stays as-is — the extended BACKUP_MIGRATIONS chain discards the key at v28→v29. (4) Three stale pointer comments retargeted from `event-observation.js` to `paddock-observation.js` (farm-setting.js:104, batch.js:85, numeric-coercion-tier1.test.js:14) since paddock-observation.js is the direct successor using the same Tier 1 numeric-coercion pattern. (5) Two useful negative-assertion comments in `dmi-chart-context.js` and `dashboard/index.js` kept (optional reword to "dropped in migration 029"). (6) Migration history files (021, 022) stay — immutable. **Supabase data audit:** one orphan row (`ef5221a6-...` — pre-OI-0112 write from 2026-04-18 16:56 UTC, `paddock_window_id = null`, parent event still exists with two correct `paddock_observations` rows covering the same pre-graze data). CASCADE drops it safely. **Migration number bump:** OI narrative says "028" but 028 was claimed by OI-0117; actual ship is **migration 029** with `BACKUP_MIGRATIONS[28]` bumping to schema v29. OI status line + spec file corrected. **Spec file:** `github/issues/drop-event-observations-table.md` (full spec during UI sprint per CLAUDE.md §"Active Sprint"; thin pointer at sprint reconciliation). **Session brief:** `session_briefs/SESSION_BRIEF_2026-04-20_oi0113-drop-event-observations.md` bundles both OIs + git push command + Claude Code prompt. **V2_SCHEMA_DESIGN.md §5.8 + V2_MIGRATION_PLAN.md §5.3/§5.3a:** NOT yet removed — flagged in the spec for Cowork to strip in the commit that lands this brief (base-doc prep for the drop). **CP-55/CP-56 impact:** yes (BACKUP_MIGRATIONS[28] discards the key from older backups); captured in spec. **Schema change:** yes (migration 029 DROP TABLE CASCADE). **Dependencies:** all cleared — OI-0111, OI-0112, OI-0117, OI-0119 all shipped. Related: OI-0063 (shipped the column alignment that made this redundant — closed), OI-0087 (added to backup pipeline — closed), OI-0089 (V2_SCHEMA_DESIGN.md §5.8 add — closed), OI-0117 (migration 028, reason for the 029 number), OI-0119 (last reader migration, unblocked this OI). |
| 2026-04-20 | OI-0119 shipped + IMPROVEMENT #15 logged — DMI-8 cascade rewrite live; `git add` atomicity failure mode captured for plugin | Claude Code shipped the OI-0119 cascade rewrite across two commits: spec + base-doc updates in `ca332c0`, implementation in `65fc3b8` (DMI-8 rewrite in `src/calcs/feed-forage.js` with five statuses + per-day pasture→stored→deficit allocation; new shared chart-context helper `src/features/events/dmi-chart-context.js` centralizing the dead-table fix + `areaHectares ?? areaHa` fallback + OI-0117 `getEventStartDate` decoration + date-routing source-event bridge — replaces ~170 lines of duplication across dashboard + detail; chart renderer `src/ui/dmi-chart.js` adds blank-bar `no_animals`, grey-bar `no_pasture_data` with reason-specific inline CTA wired through `onNoPastureData(reason, { pwId, locationId })`, red deficit segment + `+X deficit` sub-label, conditional red legend swatch, "(Fix cover)" hint chip, fixes pre-existing metric `toDisplay` bug; sub-move close `src/features/events/submove.js` gains forced feed-check card per batch×location when `event.hasStoredFeed`, blocks Save until inputs filled, writes `event_feed_checks` + `event_feed_check_items` with `isCloseReading=false`, OI-0115 pure-insert invariant preserved). Suite 1135 → 1165 (+30 tests across cascade allocation, context builder, renderer branches, submove close, Supabase e2e round-trip). All four grep contracts pass. No schema change. No CP-55/CP-56 impact. GH-29 closed. **OI-0119 status updated** to `closed — 2026-04-20` with full enumeration of files and tests. **UI_SPRINT_SPEC.md SP-12 status bumped** to `Shipped 2026-04-20` with commit hashes. **Downstream OIs unblocked:** OI-0113 (`event_observations` sunset — last live reader removed; safe to ship migration 028 drop), OI-0070 (EST-1 accuracy report — DMI-8 now produces correct actual + estimated splits, ready for field-test). **IMPROVEMENT #15 added to IMPROVEMENTS.md** capturing today's `git add` atomicity failure mode: the OI-0119 spec push command included a pre-rename `github/issues/dmi-8-cascade-rewrite.md` that Claude Code renamed to `GH-29_*.md` before Tim ran `git add`; the pathspec failure aborted the entire add atomically, the manual retry dropped `UI_SPRINT_SPEC.md` from the list, and the doc sat stranded with stale filename references for ~3 hours until cleanup. The existing IMPROVEMENT #14 verify-push-landed rule does NOT catch this class — the partial push genuinely lands, SHA matches, but the wrong set of files was in it. Three concrete fixes proposed for `doc-workflow` + `deploy-gate` skills: (a) Cowork should not stage new pre-rename `github/issues/*.md` files at all (Claude Code owns that file's first commit during issue creation), (b) split the push command into two commits when a pre-rename spec file is present so a failure on it does not orphan base-doc changes, (c) post-commit `git status --porcelain` check to flag staged-but-not-committed files. |
| 2026-04-20 | CP-66 close-out audit + OI-0120 opened — Edit member info (display name, email, role) | Tim asked whether "edit members" had been spec'd and implemented. Cowork audited `src/features/settings/member-management.js` (446 lines) and `src/features/auth/invite-claim.js` (142 lines) and confirmed CP-66 shipped in a prior session but was never formally closed. All 18 acceptance criteria in `github/issues/CP-66_member-management-invite.md` are met (invite creation, invite acceptance via `#invite={token}`, role change for accepted non-owner members, member removal, link copy/regenerate, invite cancel, owner-row protection, team-member read-only member count, email-based fallback claim in sign-in path). **OI-0047 closed** (2026-04-20 close-out audit) with comprehensive "What shipped" enumeration under the status line — all 13 exported/internal functions listed plus both source files. Gap identified during audit: CP-66 spec did NOT include any edit path for captured `display_name` / `email` fields after row creation. Two concrete symptoms: (1) a typo in an invite's email is unfixable without Cancel → start over (which invalidates any link already copied to a draft message), (2) once a member accepts, no UI exists for admin or member to update display_name or email — the email-based fallback claim silently breaks on primary-email drift. Tim locked scope (2026-04-20): **pending invite in-place edit** of display_name + email + role, **accepted member edit** of display_name + email (role edit stays on the existing `renderRoleSelect` — single-tap inline remains), **owner + admin permission gate** matching existing CP-66 pattern, **owner row + self row excluded** (matches existing role-change guardrails; self-profile editing noted as known gap for future OI, not blocking). **OI-0120 added** at top of Open with full scope/validation/edge-case spec. **Spec file:** `github/issues/edit-member-info.md` (full spec during UI sprint per CLAUDE.md §"Active Sprint"; thin pointer at sprint reconciliation — moves into V2_UX_FLOWS.md §20.7 Member Management as a new sub-section). Schema impact: **NONE** — both columns exist on `operation_members`. CP-55/CP-56 impact: **NONE** — no shape change. Verification step required in implementation: confirm whether `(operation_id, email)` UNIQUE constraint exists on `operation_members`; if not, client-side collision check; if yes, surface constraint error. Files affected: `src/features/settings/member-management.js` (single `showEditForm` function handles both pending and accepted via `opts.isPending` branch), `src/i18n/i18n.js` (six new strings), new unit test `tests/unit/member-management-edit.test.js` (6 cases — pending happy path, accepted happy path, empty-name validation, bad-email validation, owner/self no-edit-button, email collision), new e2e `tests/e2e/member-edit.spec.js` (per CLAUDE.md §E2E Supabase round-trip rule — admin edits pending invite email, query Supabase to verify new value). Ships standalone; no dependency on OI-0119 DMI-8 cascade or other UI sprint items. Related: OI-0047 (closed — CP-66 ship that deferred this capability). |
| 2026-04-20 | OI-0119 opened — DMI-8 cascade rewrite (combined fix for dead-table reads + actual-path bracketing requirement + ignored feed entries + new cascade bucket model) | Tim shared two screenshots showing the 3-day DMI chart rendering empty bars on dashboard location cards (G-1/G-3, D, B2/B-1) and on Event Detail's §3 chart for active events with real data. Cowork diagnosed three compounding root causes: **(1) Dead-table observation read** — OI-0112 migrated writers from `event_observations` to `paddock_observations`, but DMI-8's chart-data builders at four call sites still read the old collection (`dashboard/index.js:1348` chart context, `1382` source-event bridge; `detail.js:432` builder, `475` source bridge). Same "silent field-name drift" class as OI-0075 Bug 3 closed on the capacity line. **(2) `loc.areaHa` vs `loc.areaHectares` field-name drift in `detail.js`** — the same fix OI-0075 Bug 3 applied to `dashboard/index.js` was missed at `detail.js:440` and `:480`. **(3) Three logic gaps in DMI-8 itself:** (a) `feed-forage.js:539` destructures `feedEntries: _feedEntries` and never reads it — estimated path derives `storedDmiKg` as the residual of pasture balance, never from actual deliveries; (b) actual path requires both `prevCheck` AND `nextCheck` bracketing the date — most common "today" case (one check exists, today is after the latest check) silently falls to needs_check / estimated; (c) no cascade model — no representation of "pasture consumed first, stored fills shortfall, deficit when both exhausted." Per CLAUDE.md §"Fix Root Causes, Not Symptoms" the three are inseparable: fixing the dead-table read alone surfaces the broken estimated path; fixing the single-check actual alone forces a retroactive-conversion design decision; fixing the feed-entries inclusion alone has no cascade to use it. Combined rewrite specced. **Cascade bucket model (Tim, 2026-04-20):** pasture-first → stored-second → deficit-third allocation per day. **Five statuses:** `actual`, `estimated`, `needs_check`, `no_animals` (zero demand — distinct from missing data), `no_pasture_data` (missing observation or forage type — distinct from `needs_check`, gets inline CTA). **Retroactive conversion (Tim chose Option A):** feed checks convert prior interval's STORED bar from estimated→actual; pasture bars stay estimated (pre-graze is too subjective to true up retroactively). **Sub-move open:** new window's standing DM adds to the pasture pool (parallel sub-paddocks pool — Tim confirmed 2026-04-20 multiple can be open at once when the farmer leaves multiple days of pasture). **Sub-move close:** new flow rule — when event has any stored-feed deliveries, sub-move close requires a feed check inline in the Close sheet to strike a clean actual/estimated boundary (Tim 2026-04-20 — pasture observations are too subjective to be a useful boundary marker, but stored measurements are precise). No stored-feed close prompt as before. **Source-event bridge (Tim's simplification 2026-04-20):** date-routing only — for each chart day, find the event that owned that date and run that event's self-contained cascade; no state handoff between events. Trade-off accepted: stored bales physically carried across event boundaries don't appear on the new event's chart unless the farmer logs them as a delivery (matches v1 + v2 existing semantics). Future enhancement (carry-stored toggle at event start) captured but out of scope. **Pre-graze partial defaults (Tim chose Option 3):** missing cover defaults to 100% with subtle "(assuming 100% cover — Fix)" hint and inline link to edit the observation; do NOT fall to `no_pasture_data` (partial is usable, missing is not). **Render additions** for `dmi-chart.js`: deficit segment in red atop the stored stack with "+X deficit" sub-label; `no_animals` blank-at-bar-height; `no_pasture_data` distinct grey with inline CTA link. Legend gains red deficit swatch only when at least one bar has deficit. **OI-0119 added** at top of Open. **OI-0076 closed** — superseded; the deferral hypothesis (v1-migration data incompleteness) was a minority contributor; real causes are the three above. **OI-0069 closed** — original DMI-8 spec shipped but the three latent bugs require this corrective rewrite per CLAUDE.md §"Corrections to Already-Built Code." V2_CALCULATION_SPEC.md §4.2 DMI-8 rewritten inline (calc spec is authoritative; not sprint-deferred). Spec file `github/issues/dmi-8-cascade-rewrite.md` (full spec during UI sprint per CLAUDE.md §"Active Sprint"; thin pointer at sprint reconciliation). Base-doc impacts at sprint reconciliation: V2_UX_FLOWS.md §12 (sub-move close forced-feed-check rule), §17.7 + §17.15 (5-status chart enumeration), UI_SPRINT_SPEC.md SP-3 (cascade behavior note). CP-55/CP-56 impact: NONE (compute-on-read; no new columns; forced feed check uses existing `event_feed_checks` pipeline). Schema change: NONE. Files affected: `feed-forage.js` (DMI-8 rewrite), `dashboard/index.js` (chart builder + bridge), `detail.js` (chart builder + bridge + areaHa fix), `dmi-chart.js` (3 new render statuses), `submove.js` (forced feed check on close). New unit tests cover all 5 statuses, cascade allocation branches, retroactive conversion, parallel sub-paddock pooling, source-event routing, partial pre-graze default. New e2e per CLAUDE.md §E2E (event creation → 3 bars render → feed check insertion → prior interval converts). Related: OI-0069 (closed — original spec), OI-0075 Bug 3 (precedent fix pattern), OI-0112 (the migration that orphaned the read sites), OI-0113 (unblocked once this ships — last `event_observations` reader removed), OI-0118 (the Edit Paddock Window dialog that the `no_pasture_data` CTA links to), OI-0070 (EST-1 unblocked for field testing once DMI-8 produces correct splits). |
| 2026-04-20 | OI-0118 opened — Edit Paddock Window dialog missing pre/post graze observation cards | Tim hit a surface-parity gap while editing a sub-move paddock window from the Event Detail sheet: the Edit Paddock Window dialog (`openEditPaddockWindowDialog` in `src/features/events/edit-paddock-window.js`, called from `detail.js:593` §4 Paddocks edit + `detail.js:1299` §12 Sub-move History pencil) renders date/time/area/strip fields but not the pre-graze or post-graze observation cards that every other paddock-window surface renders (move wizard dest/src, sub-move Open/Close, Close Event, Event Detail §5/§6). Cowork audited the seven observation surfaces from the OI-0112 sweep and confirmed this dialog is the lone outlier. Root-cause angle (why this is a P1 and not polish): Event Detail §5 filters to `!pw.dateClosed` (`detail.js:624-625`), so once a paddock window is closed, its pre-graze card disappears from §5 forever; no other surface in the app lets a farmer correct a historical pre-graze on a closed sub-move. Design decision confirmed by Tim (2026-04-20): **Option 1 — pre-graze always renders (open + closed); post-graze renders only on closed**, so the dialog covers the full lifecycle and becomes the single place to edit historical pre-graze. Alternative (Option 3 — pre only on open, post only on closed) rejected because it would leave the historical pre-graze edit with no UI surface. **OI-0118 added** (P1, surface parity + reachability). Small-surface spec: add imports for `renderPreGrazeCard`, `renderPostGrazeCard`, `PaddockObsEntity`, `add`, `convert`; two new panel sections (pre-graze always, post-graze in `if (isClosed)`); each card gets its own inline Save button matching `detail.js` §5/§6's transient "Saved" indicator pattern; saves to `paddock_observations` with `source: 'event'`, `sourceId: pw.id`, `type: 'open'`/`'close'`; lookup pattern mirrors detail.js `(sourceId === pw.id || most-recent fallback)`. BRC late-bind not required — `pw.locationId` is known at dialog open time so `paddockAcres = convert(loc.areaHa, 'area', 'toImperial')` populates on first render. Six unit test cases + one Supabase-round-trip e2e per CLAUDE.md §E2E rule. No schema change. No CP-55/CP-56 impact. Spec: `github/issues/edit-paddock-window-observation-cards.md`. Base-doc impact at sprint reconciliation: V2_UX_FLOWS.md §12 + §17.15 enumerate the dialog's component set. Related: OI-0112 (surface sweep, this closes the 7th surface), OI-0110 (sub-move Open caller migration), OI-0107 (detail §5 caller migration). |
| 2026-04-18 | OI-0116 + OI-0117 opened — post-OI-0115 field-testing uncovered downstream gap | After Tim shipped OI-0115 and returned to his 2026-04-18 field-test backup (event `0afb6add`, paddocks B1/B2), he tried to backdate the B2 sub-move paddock window from 2026-04-18 1:30 PM to 2026-04-15 1:31 PM to match the actual event start. Edit Paddock Window rejected with "Paddock can't open before the event started." Diagnosis: OI-0115 had landed but the corruption *value* was still sitting in `events.date_in = 2026-04-18` from pre-fix sub-move saves; `edit-paddock-window.js:89`'s guard (`newDateOpened < event.dateIn`) used the corrupted value as the floor and blocked recovery. Immediate unblock: edit the event's `date_in` back to 2026-04-15 via Event Detail hero — Tim confirmed this worked. Two downstream observations surfaced: **(A)** the hero line has a date input but no time input — `events.time_in` is only editable via Paddock Windows list → Edit, which Tim described as not intuitive. **(B)** storing `events.date_in`/`events.time_in` as columns *is* the OI-0115 root-cause class. The columns duplicate a fact (earliest child window's opening) that's already stored on `event_paddock_windows` / `event_group_windows`; any code path that writes one but not the other produces drift. **OI-0116 added** (P2, usability — time_in input on hero line with same three OI-0115 teardown guards; writes to `events.time_in` today, will switch to write-through on earliest child window when OI-0117 lands, no user-visible change). Independent ship, small surface. Spec: `github/issues/event-detail-time-in-editor.md`. **OI-0117 added** (P1, architectural hardening — drop `events.date_in` and `events.time_in` columns; `event.dateIn`/`timeIn` become derived from `MIN(child window openings)`; Event Detail hero inputs become write-through to the earliest child window via new `setEventStart` helper; paddock-window + group-window edit guards recompute floor as sibling-minimum excluding the record being edited, so OI-0115-class drift is always user-recoverable). Schema v28 migration 028 drops both columns with a pre-check that logs any existing corruption to `app_logs` for audit. `BACKUP_MIGRATIONS[27]` + `CURRENT_SCHEMA_VERSION` updates. CP-55 omits the dropped columns; CP-56 27→28 rule discards pre-v28 `date_in`/`time_in` with drift logging. Cross-cutting grep sweep required (dashboard card, detail header, move-wizard, rotation calendar, DMI-8 axis, events-log, export payload). **Tied-earliest write behavior confirmed by Tim (2026-04-18) — option (a):** when multiple child windows share the current earliest opening and the user moves event start later, `setEventStart` updates **all tied windows** together, with an on-save confirmation dialog whenever more than one window will move ("Moving event start to {date} {time} will also update {N} other window(s) that opened at the same time. Continue?"). Rationale: option (b) would leave the un-moved tied windows opening before the new event start, re-creating the exact floor-violation class OI-0117 is closing. No open design questions remain; spec is implementation-ready. Full spec: `github/issues/derived-event-start-datetime.md`. CLAUDE.md §"Fix Root Causes, Not Symptoms" alignment noted — OI-0115 closed the symptom, OI-0117 closes the class. Acceptance criteria include a new Architecture Audit grep invariant to prevent reintroducing `events.date_in`-class storage in the future. CP-55/CP-56 impact: **yes** for OI-0117 (schema v28, column drop, migration rule); **no** for OI-0116. Schema change: **yes** for OI-0117; **no** for OI-0116. |
| 2026-04-18 | OI-0115 shipped — sub-move no longer resets event.date_in (phantom-change teardown guard in detail.js) | Root-caused: not a writer in `submove.js` at all (grep-audited) — the mutation fires through the ONLY code path in src/ that writes `event.dateIn`, namely `detail.js:307-325` dateInInput change handler. Trigger: sub-move Save's `add('eventPaddockWindows')` → `notify('eventPaddockWindows')` → `detail.js:135` subscription → `renderSummary(ctx)` → `clear()` tears down the live `dateInInput` while rebuilding. In real browsers (iOS Safari most notably, with native date-picker implicit focus semantics during layout shifts), the teardown can fire a phantom `change` event on the removed input with whatever its `.value` is at that moment — which matches today's date if the picker defaulted to it. Pre-fix handler had no guards; any change write-through mutated `event.dateIn`. **Fix** (`detail.js:renderSummary`): three guards on the change handler — (1) `if (!dateInInput.isConnected) return;` skips writes after DOM teardown; (2) `if (newDate === renderedDateIn) return;` rejects phantom events with the render-time snapshot value; (3) `if (newDate === evt?.dateIn) return;` rejects when store already matches. Adjacent `renderNotes` onBlur gets the same `isConnected` guard. CLAUDE.md Architecture Audit gains a new rule #6 naming the submove grep contract + the change-handler guard pattern; Known Traps gains "Phantom change/blur events on teardown-replaced inputs." **Tests:** `tests/unit/submove-does-not-mutate-event-date-in.test.js` — 6 cases: Tim's exact repro without Detail open, same with Detail open (suspect-1 scenario), a synthetic phantom-change on dateInInput (models iOS Safari teardown cascade — this is the one that FAILS pre-fix), a disconnected-input change (Guard 1), a genuine user edit (fix must not break the legitimate path), and Sub-move Close Save (adjacent-flow smoke). `tests/e2e/submove-preserves-event-date-in.spec.js` — Supabase row assertion per CLAUDE.md §E2E. Grep contract verified: `grep -rn "update('events'" src/features/events/submove.js` → 0. Suite 1099 → 1105. jsdom note: jsdom does not model iOS Safari's native date-picker teardown behavior, so the unit test's 3rd case dispatches the phantom change synthetically to prove the guard contract holds (pre-fix it would fail). No schema change. No CP-55/CP-56 impact. GH-25 filed + closed. Spec file: `github/issues/GH-25_submove-resets-event-date-in.md`. |
| 2026-04-18 | Sub-move resets `event.date_in` bug triage — OI-0115 opened | Tim hit silent data corruption in live field testing: tapped the dashboard card's 3-up Sub-Move button (promoted by OI-0109) on an active event with main paddock **G1** / `date_in = 2026-04-16`, picked destination **G3**, left the "Date opened" field at today's default (**2026-04-18**), saved. New `event_paddock_window` row for G3 created correctly, but the **parent event's `date_in` was silently overwritten 2026-04-16 → 2026-04-18** — dashboard "Day X" counter reset, Event Detail's editable "In" input shows the new date (confirming a real store write, not just a render bug), every downstream time-based calc (DMI, NPK, AU-days, animal-days, pasture %, DMI-8 chart axis, reopen `date_out > date_in` check) now lies until manually corrected. Cowork walked the save path and confirmed **no direct cause in `submove.js`** — `openSubmoveOpenSheet` Save (lines 79–100) only calls `PaddockWindowEntity.create` + `add('eventPaddockWindows', …)` + `createObservation`; no `update('events', …)`; `createObservation` (events/index.js:43–55) writes one observation row; `store.add` (140–162) has no cross-entity side effects; the only five `update('events',…)` call sites in the codebase (detail.js dateInInput, detail.js notes, reopen-event.js, close.js, move-wizard.js) are all surfaces the sub-move Save does not touch. Mutation is happening **indirectly** via a subscription cascade, focus/blur artifact, or adjacent codepath. Investigation narrowed but didn't root-cause — Claude Code must root-cause before fixing. **OI-0115 added** (P0, silent data corruption during live field testing) at top of `## Open`. Full spec `github/issues/BUG_submove-resets-event-date-in.md` with 6 ordered suspects for Claude Code to investigate: **Suspect 1 (top)** — Event Detail's editable `dateInInput` (detail.js:305–325) change handler firing during the re-render cascade triggered by `subscribe('eventPaddockWindows', …)` when the detail sheet is open simultaneously with the dashboard; Suspect 2 — dashboard card input-element reuse (unlikely); Suspect 3 — `el()` DOM builder or input factory echoing `value` back via synthetic `change` on re-mount; Suspect 4 — sync-adapter `pullAllRemote`/`mergeRemote` race overwriting `events.date_in` with stale data; Suspect 5 — auto-recompute treating `min(paddock_windows.date_opened)` as authoritative for `event.date_in`; Suspect 6 — edit-paddock-window or adjacent sheet piggybacking on Save. 8 acceptance criteria including: root cause documented in commit message (not "we made it stop"), unit test mirroring Tim's exact repro (event `date_in = '2026-04-16'` / G1, sub-move to G3 on `2026-04-18`, assert `dateIn` unchanged + new PW row), E2E Supabase assertion per CLAUDE.md E2E rule, **grep contract** (`grep -rn "update('events'" src/features/events/submove.js` returns zero) added to per-commit sanity checks, regression guard on adjacent sub-move tests, **adjacent-flow smoke test** (verify Advance Strip Save + Sub-move Close Save don't also reset `date_in` — same subscription architecture, same likely root cause), and OPEN_ITEMS.md OI-0115 "What happened" line updated with actual root cause before close. Recovery instruction for Tim captured (edit Event Detail "In" date back to correct value; each affected event needs manual correction until fix ships). **Thin pointer note:** not a thin pointer — no base-doc spec exists for this flow yet because sub-move open was meant to be a no-op on the parent event; at sprint reconciliation, the fix and its "sub-move does NOT touch `event.date_in`" invariant roll into V2_UX_FLOWS.md §12 Sub-moves. No schema change. No CP-55/CP-56 impact (`events.date_in` is already in the export/import pipeline; fix prevents an incorrect mutation, not a shape change). Related: OI-0109 (shipped — promoted Sub-Move to 3-up row — likely what made this bug discoverable via more frequent use); OI-0112 commit `13a3327` touched `submove.js` Save handler — blame review recommended; OI-0091/0095 window-split architecture (sub-move must be a pure INSERT on `event_paddock_windows`, never split/close the parent). Known-trap candidate for CLAUDE.md after root cause lands: *"mutation functions that notify subscribers which then mutate other entities = phantom writes"* — close kin of the existing v1 trap about forgotten-subscriber notifications. |
| 2026-04-18 | Observation boxes field-testing polish audit — OI-0114 opened | After Tim field-tested the shipped OI-0112 cards on the sub-move Open sheet, flagged three visual/behavioral drift items: (1) bale-ring calc inert on sub-move, (2) top-row fields not baseline-aligned, (3) labels too large/bold plus native number spinners visible on Cover. Cowork ran a multi-file inspection via Explore subagent across all 6 non-survey observation surfaces (move wizard dest/src, close event, sub-move open/close, event detail pre/post). Survey excluded per Tim. Root causes identified and documented as 7 non-conformance items (NC-1 through NC-7): NC-1 `paddockAcres: null` at submove.js:69 disables the BRC input listener in `_shared.js:113/132`; NC-2 inline `grid-template-columns: repeat(3, minmax(0, 1fr))` at `_shared.js:148` forces equal widths and divergent baselines; NC-3/NC-4/NC-5 the classes `.obs-compact-label`, `.obs-compact-input`, `.obs-top-row`, `.obs-brc-preview` are referenced in code but have zero CSS rules in `main.css` — labels inherit default `<div>` typography and inputs show native spinners; NC-6 `.obs-required` at `main.css:1208` renders red instead of canonical amber/warn; NC-7 dead `.paddock-card` className on pre-graze container from OI-0100 legacy. **OI-0114 added** (P1) with full spec `github/issues/observation-boxes-polish.md`. Because six of seven fixes land in the shared `_shared.js` + `main.css`, the survey card automatically inherits NC-2/3/4/5 improvements even though it's out of scope (desired). CP-55/CP-56 impact: none. Dependency: none — OI-0114 can ship standalone. Canonical reference remains `App Migration Project/pre-graze-box-mockup.html` — spec instructs Claude Code to copy CSS rules from the mockup's `<style>` block and port them into `main.css`. |
| 2026-04-18 | OI-0114 Observation boxes polish pass — close in two commits (NC-1 + NC-2–7) | Follow-up polish after OI-0112's big-bang redesign. Two commits, full suite 1087 → 1099. **NC-1 (commit `095d76e`):** sub-move Open BRC auto-fill was inert because the pre-graze card rendered with `paddockAcres: null` before the farmer picked a location. Fixed at root: `_shared.js:renderForageStateRow` carries mutable state and exposes `setPaddockAcres(newAcres)`; the ring-count listener is always attached (no-op when BRC inactive). `renderPreGrazeCard` and `renderSurveyCard` re-export the setter. `renderLocationPicker` gains optional `opts.onSelect(loc)` callback — purely additive (seven other call sites unchanged). `submove.js` wires the picker's `onSelect` to call `preGraze.setPaddockAcres(convert(loc.areaHectares, 'area', 'toImperial'))`. Late-bind case covered: typing a ring count before location pick populates the cover field retroactively on the pick. 6-case regression test. **NC-2–7 (commit `a9ffbd4`):** shared `_shared.js` + `main.css` polish — top row flex-end baseline via new `.obs-top-row` / `.obs-field` / `.obs-field-rings` rules; `.obs-compact-label` at 13px/500 muted with `.label-aux` 10px/400 child; `.obs-compact-input` with cross-browser spinner reset (`::-webkit-outer/inner-spin-button`, `-moz-appearance: textfield`); new `withSuffix(input, text)` helper wraps Forage Height / Cover / Residual inputs with absolutely-positioned `.input-suffix-label` so units float inside inputs and labels become pure field names; `.obs-required` flips red → amber (existing tokens); dead `.paddock-card` className dropped from `pre-graze-card.js`. Survey card inherits NC-2–NC-5 automatically via the shared sub-renderers — desired per Tim's "survey looks fine" scope note. 6 additive test cases cover top-row structure, input-suffix wrapping, label purity, sub-label class, amber Required pill, and classname cleanup. Spec file renamed `observation-boxes-polish.md` → `GH-24_observation-boxes-polish.md`; GH issue #24 filed (to close after Tim verifies in browser). No schema change; no CP-55/CP-56 impact. |
| 2026-04-18 | Observation boxes redesign — big-bang unification across 7 surfaces | **OI-0112 added** (P1, umbrella): three card variants (Pre-Graze / Post-Graze / Survey) replace the current `renderPaddockCard` + `renderPreGrazeFields` + `renderPostGrazeFields` + inline survey form across all seven observation surfaces. Pure UI + caller migration; zero schema change. Writes converge on `paddock_observations` (`type: 'open' \| 'close'` + `source: 'event' \| 'survey'`). Post-graze gains Notes (new capability, existing column). Survey is a dedicated third variant (pre-graze fields + Recovery Window + Notes) — readiness-assessment shape. Full spec `github/issues/observation-boxes-redesign.md`; interactive mockup `App Migration Project/pre-graze-box-mockup.html`. **OI-0113 added** (P3, follow-up): sunset `event_observations` table (migration 021, zero writers) — Option A recommended (migration 028 drop + BACKUP_MIGRATIONS[27] entry). Must ship AFTER OI-0112 merges. **OI-0107 + OI-0110 marked SUPERSEDED** — their scopes absorbed as Surfaces #7 and #4 of OI-0112; kept open for traceability, close when OI-0112 ships. **UI_SPRINT_SPEC.md SP-12 added** tracking the revision (supersedes SP-3 bottom-row + GH-10 §5/§6 post-graze editability). Dependency order locked: **OI-0111 → OI-0112 → OI-0113** (bale-ring rename, then card redesign, then event_observations drop). Session brief `github/issues/SESSION_BRIEF_2026-04-18_observation-boxes-redesign.md` bundles OI-0108 (Feed DMI → DM label) + OI-0109 (Dashboard 3-button row) + OI-0112 umbrella for Claude Code handoff. Design session: three Q+A lock-ins (write path → post-graze scope → big-bang migration order + survey addendum) resolved all open scope questions before spec write. CP-55/CP-56 impact for OI-0112: none; for OI-0113: yes (removes `event_observations` from BACKUP_TABLES/FK_ORDER, BACKUP_MIGRATIONS[27] discards legacy rows). |
| 2026-04-18 | Settings UI unit-conversion bug discovered during live use | **OI-0111 added** (P0, silent data corruption). Tim opened Settings, saw `454` in "AU Reference Weight" and `10` in "Default Residual Height", assumed the metric values were wrong for his imperial operation, and changed them to `1000` and `4`. Root cause: `src/features/settings/index.js` `renderFarmSection` (lines 97–172) renders raw metric values with no conversion on render and no conversion on save — and labels carry no unit suffix. Violates CLAUDE.md Known Traps "Unit confusion: always store metric, display converted" and mirrors the v1 "UI field without Supabase column" trap at the conversion layer. Scope: every unit-bearing field in the settings form (`defaultAuWeightKg`, `defaultResidualHeightCm`, `nPricePerKg`/`pPricePerKg`/`kPricePerKg` — inverted conversion for price-per-weight, `defaultManureRateKgPerDay`, `baleRingResidueDiameterFt`). Per Tim's direction this session, the bale-ring field is renamed to metric storage as part of the fix — migration 027 `bale_ring_residue_diameter_ft → bale_ring_residue_diameter_cm` (× 30.48, default 12.0 ft → 365.76 cm, drops old column), `schema_version` 26 → 27, `BACKUP_MIGRATIONS[26]` handles old backups. Precision rule locked: store full JS-float precision from `convert()`; round only at display time; round-trip test per unit-bearing field must show entered imperial value unchanged after save + reload. Calc `src/calcs/survey-bale-ring.js` stays imperial-native; callers convert cm → ft inline. Full spec `github/issues/BUG_settings-ui-unit-conversion.md`. CP-55/CP-56 impact captured (farm_settings column rename only; no other state-shape changes). Immediate recovery instruction for Tim: manually re-enter `454` and `10` in Settings before the fix ships. |
| 2026-04-18 | OI-0106 base-doc reconciliation | After OI-0106 closed and Claude Code updated CLAUDE.md Known Traps, audited Cowork-owned design docs for parity. Two gaps found and closed. **V2_APP_ARCHITECTURE.md** — the entity contract appeared only as a one-line comment in the §3 File Structure code block (line 82). Added new **§3.1 Entity Contract** describing all five required exports (`FIELDS`, `create`, `validate`, `toSupabaseShape`, `fromSupabaseShape`) and, critically, spelling out `fromSupabaseShape`'s dual responsibility: (a) reverse the key mapping, (b) coerce PostgREST-stringified numerics via `row.col != null ? Number(row.col) : null`. Enumerates the four harm classes (string concat in sums, `.toFixed` TypeError, strict `typeof` validator silent-rejection, lex threshold comparisons) with `event-observation.js` as the reference implementation. **V2_INFRASTRUCTURE.md §6.1** — expanded the entity shape-function test pattern from a single local round-trip to a two-test pattern: (a) local round-trip for key mapping, (b) PostgREST pull simulation with stringified numerics asserting `typeof === 'number'`. Flags that the local round-trip alone does NOT catch PostgREST-string bugs because it routes through local objects that were never PostgREST-serialized. **OI-0103 reconciliation audit** — no base doc changes needed; V2_SCHEMA_DESIGN.md's `event_feed_checks.date` column was always spec'd correctly — the bug was code drifting from spec (`checkDate:` typo) in `src/features/feed/check.js`. Change Log rows added to both V2_APP_ARCHITECTURE.md and V2_INFRASTRUCTURE.md. No schema change, no CP-55/CP-56 impact, no `schema_version` bump. Close-out of the OI-0103 → OI-0106 chain: code ✓, CLAUDE.md ✓, Cowork-owned design docs ✓. |
| 2026-04-18 | Locations tab final pass — OI-0075 fully closed (bugs 3, 5, 7) | Follow-up to the earlier partial close. Pre-handoff audit confirmed every required calc (FOR-1/2/3, DMI-1/2/4, NPK-1/2) was already registered; this was pure wiring + investigation in `src/features/dashboard/index.js`. **Bug 3 root cause:** silent field-name drift — dashboard read `loc.areaHa` but the location entity stores `areaHectares`, so `totalAreaHa` resolved to 0 on every real record and the FOR-1 gate always failed. Fixed at 8 read sites with `loc.areaHectares ?? loc.areaHa` (legacy fallback). The post-OI-0112 observation source moved from `event_observations` → `paddock_observations`; capacity line now reads from the new table. When inputs are legitimately missing, an italic `Capacity: add <missing> to estimate` hint renders under `dashboard-capacity-hint-{event.id}` instead of dropping the row. **Bug 5:** DMI-1 was being called with `qtyKg: fe.quantity` (units, not kg) and `dmPct: 100` (hardcoded) — off by `weightPerUnitKg × dmPct/100`. Now converts per-unit quantity × `batch.weightPerUnitKg`, uses `batch.dmPct`, and subtracts latest close-reading residual — matches v1 `calcConsumedDMI` semantics. **Bug 7:** extracted exported helper `computePasturePercent(events)` doing mass-balance DMI-2 × days vs DMI-1 deliveries across events; routed through DMI-4. Both desktop and mobile stat cards now call it. Color grade: green ≥ 75 / amber 50–74 / red < 50. NPK/Acre and NPK Value were already wired on both paths; the area-field fix above lets them render for real. 8 new tests in `tests/unit/locations-tab-bugs-357.test.js` cover the capacity line full render, three "missing input" hint variants, the v1-parity stored-feed DM value, and Pasture % color bands at 100% and 60%. Full suite 1079 → 1087. No schema change; no CP-55/CP-56 impact. |
| 2026-04-18 | Pre-testing cleanup bundle — OI-0072 / OI-0074 / OI-0075 / OI-0066 (audit + 2 new commits + 2 retroactive closes) | Session brief `SESSION_BRIEF_2026-04-18_pre-testing-cleanup.md` asked for a state audit before building to catch OIs already shipped in prior sessions. Audit results per OI: **OI-0072** — DONE earlier (commits `1d9c0e4` + `74c53c9`); 11/11 acceptance items already present (triple-sync stepper/slider/%, consumed banner, tap-to-select cards, inline steppers, multi-batch, feed-type grouping, live DMI+cost, `.sheet-panel` sizing). Closed retroactively; no new code. **OI-0074** — PARTIAL; three-tier layout was already correct, only primary button identity drifted (`"Save & close"` label + `detail-save-close` testid + close-only handler). Commit `202069e` renames to `"Save & recalculate"` + `detail-save-recalc` + invokes `renderAll(ctx)` before close so DMI/NPK/summary/chart re-run. New i18n key `action.saveAndRecalculate`; 4 new unit cases. **OI-0075** — PARTIAL; bugs 1/2/4/6 shipped earlier in commit `e124952` (never closed out), bugs 3/5/7 wired structurally but render em-dashes pending DMI-8 / OI-0069 data flow. Per the session brief's carve-out, those stay deferred. **OI-0066** — UNTOUCHED; full build required. Commit `cf39516` adds `scopedGroupWindowId` opt to `openMoveWizard`, scopes close-out to the one GW, keeps source event + PWs open until the last group leaves, skips feed transfer in scoped mode. Two dashboard per-group Move sites wired (`buildGroupCard` + `buildLocationCard` group row); card-level "Move all" unchanged. Six new invariant tests cover scoped vs non-scoped vs last-group-leaving. GH issues #20, #21, #22, #23 filed + closed (GH-22 partial-closed with DMI-8 deferral note). Spec files renamed to GH- prefix. Suite 1069 → 1079 (+10 tests across OI-0074 + OI-0066; OI-0072 and OI-0075 already had coverage). No schema change across any of the four; no CP-55/CP-56 impact. |
| 2026-04-18 | OI-0108 / OI-0109 / OI-0112 shipped — observation-boxes bundle (three commits, GH-17 / 18 / 19) | Three field-testing revisions bundled per `SESSION_BRIEF_2026-04-18_observation-boxes-redesign.md`, landed in small → medium → large order. **OI-0108** (commit `35e6764`, GH-17): Event Detail §8 feed-entry row — label `lbs DMI` → `lbs DM` (formula produces dry matter *delivered*, not DMI); em-dash guard for batches missing weight-per-unit or DM%; metric-unit support via `unitLabel('weight', unitSys)`. New helper `computeFeedEntryDm` exported for tests; 8 cases. Audit of `openDeliverFeedSheet` per CLAUDE.md "Fix Root Causes": the sheet reads — doesn't create — batch fields; batch creation in `src/features/feed/index.js` Add Batch sheet already captures both. No scope extension. **OI-0109** (commit `2db2efc`, GH-18): Dashboard location card — two full-width stacked buttons (SP-3 / GH-11) replaced with a 3-up flex row (Feed Check · Feed · Sub-Move), equal `flex: 1`, mirrors v1 `.grp-actions`. Sub-Move promoted from buried teal link to primary quick-access button. Standalone `+ Add sub-move` above SUB-PADDOCKS removed; in-section link inside SUB-PADDOCKS preserved per Tim's explicit call. 4 unit cases. Reverses GH-11 §13–16 for bottom-row only; reconciliation into V2_UX_FLOWS.md §17.7 at sprint end. **OI-0112** (commit `13a3327`, GH-19) — the big-bang: three new card components (`renderPreGrazeCard`, `renderPostGrazeCard`, `renderSurveyCard`) + shared `_shared.js` sub-renderers replace `renderPaddockCard` + `renderPreGrazeFields` + `renderPostGrazeFields` + the hand-rolled survey form across all 7 caller surfaces in a single commit. All writes go to `paddock_observations` (source='event' or 'survey', type='open' or 'close'); no writes to `event_observations` (OI-0113 retires it later). BRC-1 helper targets `farmSettings.baleRingResidueDiameterCm` (OI-0111 shipped — metric-internal), converts cm → ft inline before invoking the imperial-native calc. Files deleted: `observation-fields.js`, `paddock-card.js`, `paddock-card.test.js`. Grep for legacy names: zero matches in `src/` and `tests/`. Absorbs OI-0107 (surface #7) and OI-0110 (surface #4). Event detail §5 pre-graze and §6 post-graze now render editable cards per paddock window; post-graze editability is a new capability. 26 new unit cases in `observation-cards.test.js` + 2 E2E Supabase-verification scenarios in `observation-cards.spec.js` per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI". **Bundle totals:** Suite 1037 → 1067 (+30 tests across OI-0108 and OI-0112; OI-0109's 4 cases are counted in the 1045 → 1049 delta). **OI-0113 (sunset `event_observations`)** stays open per the session brief — unlocks now that OI-0112 has zeroed the writers. **OIs closed with this bundle:** OI-0107, OI-0108, OI-0109, OI-0110, OI-0112. GH issues #17, #18, #19 closed; spec files renamed `BUG_/*.md` → `GH-N_*.md`. No schema change, no CP-55/CP-56 impact across any of the three. |
| 2026-04-18 | OI-0111 shipped — Settings UI unit conversion + bale-ring column rename (single commit, GH-16) | `renderFarmSection` in `src/features/settings/index.js` now uses a 13-field descriptor with `measureType` / `inverted` / `currency` / `perDay` / `displayUnit` / `precision` flags. **Render path** converts stored metric → display unit (e.g. 454 kg → 1001 lbs), composes unit-suffixed labels dynamically (`"AU Reference Weight (lbs)"`, `"N Price ($/lb)"`, `"Manure Rate (lbs/AU/day)"`). **Save path** converts display → metric using the inverse of the same factor, preserves the full JS float (no rounding/truncation per spec §Precision). Round-trip rule: entering `X` in display unit, saving, reopening shows exactly `X` again at the field's display precision — this is what lets sub-decimal drift from `convert()` sit below what the farmer sees. **Price fields** use the `inverted: true` flag (÷ factor on display, × factor on save) so $1.21/kg stored renders as ~$0.5489/lb. **Bale-ring field** uses `displayUnit: 'ft'` (imperial shows ft, not inches; metric shows cm). **Migration 027** renames `farm_settings.bale_ring_residue_diameter_ft` → `_cm` (× 30.48), sets default 365.76, drops the old column; applied and verified via MCP (`schema_version` 26 → 27). **Entity rename** propagated through `farm-setting.js` (FIELDS key, create default 365.76, to/fromSupabaseShape), paddock-card.js (reference + inline cm → ft conversion before invoking imperial-native BRC-1), locations/index.js (bulk survey inline conversion). **BACKUP_MIGRATIONS[26]** renames imported backup rows from `_ft` × 30.48 → `_cm`, stamps `schema_version = 27`. **CURRENT_SCHEMA_VERSION** bumped 26 → 27 in backup-import.js. **Tests:** new `tests/unit/settings-unit-roundtrip.test.js` (34 cases — imperial + metric round-trip for every unit-bearing field, full-float storage, null handling, imperial display of metric defaults); updated `paddock-card.test.js` + `numeric-coercion-tier1.test.js` fixtures; updated `backup-roundtrip.test.js` (added migration-26 rename case + chain-length assertion 12 → 13); updated `backup-import.test.js` (chain target 26 → 27). Suite 1037/1037 pass. **Docs:** V2_SCHEMA_DESIGN.md §1.3 adds `bale_ring_residue_diameter_cm` column row + CREATE TABLE entry + Change Log row; V2_MIGRATION_PLAN.md §5.3a `farm_settings` entry annotated with the column rename; UI_SPRINT_SPEC.md SP-9 + reconciliation checklist updated; OPEN_ITEMS OI-0107 + OI-0110 acceptance lines renamed; GH-12 spec + observation-boxes-redesign.md updated. Spec file renamed `BUG_` → `GH-16_`; GH issue #16 closed with commit hash. CLAUDE.md Known Traps "Unit confusion: always store metric, display converted" is now *enforced in the UI* — the trap was documented but the code bypassed it; this closes that gap. |
| 2026-04-18 | OI-0106 shipped — PostgREST stringified-numeric sweep (three-commit bundle) | Tier 1 `43d46b2`, Tier 2 `33c6add`, Tier 3 `caada42` (GH-15). Structural follow-up to OI-0103's `d55ba9b` hotfix. Every entity's `fromSupabaseShape` now coerces numeric/integer columns via `Number(v)` null-safe. **Tier 1** (6 entities, 33 fields — dashboard/feed/DMI hot path): batch, event-group-window, animal-weight-record, farm-setting (16 threshold/default/price cols), location, animal-class. **Tier 2** (9 entities, ~45 fields — reports + specific flows): event-paddock-window (strip-graze band), paddock-observation, survey-draft-entry, forage-type, feed-type, batch-nutritional-profile (12 lab cols), harvest-event-field, animal-bcs-score, batch-adjustment. **Tier 3** (10 entities, 75 fields — nutrient/cost math): soil-test (18 chemistry cols), manure-batch (15 nutrient cols), manure-batch-transaction, input-product (13 pct + cost), amendment, amendment-location (14 cols), npk-price-history, spreader, animal-treatment, farm. **Four harm classes removed:** (1) silent math corruption via concat ("0"+"1"+"2"="012"), (2) `.toFixed()` TypeError on strings, (3) strict typeof-number validator silent-rejection in `add()`/`update()` (blocked `batch.js`, `batch-adjustment.js`, `harvest-event-field.js`, `npk-price-history.js`, `event-group-window.js`), (4) lex comparisons on threshold badges ("100" < "60" lex-true, numeric-false — dashboard AUD/rotation/cost/NPK badges). **Tests:** 33 new (8 Tier 1 round-trip + 9 Tier 2 + 10 Tier 3 + 3 mergeRemote integration on batch path + 3 pre-OI-0106 backup round-trip cases in `backup-roundtrip.test.js`). Suite 969 → 1002. **CP-56 audit:** `backup-import.js:402` calls `pullAllRemote()` which routes every reinserted row through `fromSupabaseShape` — every entity now coerces, so post-import in-memory state is guaranteed numeric. No defensive wraps needed at import time. No backup-JSON wire-format change, no `schema_version` bump, no migration. **CLAUDE.md Known Traps** updated with new entry documenting the trap, four harm classes, reference pattern (`event-observation.js`), and round-trip-test requirement per new numeric column. GH-15 filed + closed; spec file renamed `BUG_` → `GH-15_`. Root-cause framing (same as OI-0050, OI-0103): silent data corruption invisible to the user until someone checks downstream state. |
| 2026-04-18 | OI-0099 shipped — Edit Animal silent-drop inputs complete fix | Commit `b584138` (GH-14). All four silent-drop inputs closed in one bundle per Tim's "no gaps" direction. **Migration 026** (`animals.confirmed_bred boolean NOT NULL DEFAULT false`) applied and verified via MCP; `schema_version` 25 → 26; `BACKUP_MIGRATIONS[25]` no-op chain entry; `CURRENT_SCHEMA_VERSION` bumped in backup-import.js. **Class A** — `damId` + `weaned` now read in `saveAnimal`; `weanedDate` auto-stamps on check, editable for back-date, clears on uncheck. **Class B sireTag** — freeform input replaced with three-mode picker (Animal-in-herd / AI-bull-from-list / None) with mutual exclusivity between `sireAnimalId` and `sireAiBullId`; inline "+ Add AI bull" sub-dialog creates an `ai_bulls` record via 5-param `add()` and selects it immediately (escape hatch for pre-app / historical / external bulls). **Class B confirmedBred** — direct stored boolean via new column; reverses A29's original "derive from breeding records" design. **Docs** — V2_SCHEMA_DESIGN.md §3.2 updated (new column row, A29 rewritten, A28 annotated with picker + `ai_bulls` v1-era-name note, CREATE TABLE DDL amended, Change Log row added). **v1-migration.js** preserves v1 `confirmedBred` when present. **CP-55** auto-picks `confirmed_bred` via `select('*')`; **CP-56** missing-column fallback resolves to `false`. **969 tests pass** — 4 new entity cases (default, round-trip, missing-column fallback, sire FK mutual-exclusivity), 5 new Edit Animal dialog integration cases (four-input persistence, sire mode switch, None clears, weaned-off clears date, inline Add AI bull creates row + selects), new e2e `edit-animal-silent-drop-inputs.spec.js` asserting Supabase rows directly per CLAUDE.md rule. Param-count grep verified (5-param `add()` / 6-param `update()`). Spec file renamed to `github/issues/GH-14_edit-animal-silent-drop-inputs.md`; GH issue #14 closed with commit hash. |
| 2026-04-18 | OI-0103 hotfix documentation + OI-0106 sweep opened | After `d55ba9b` shipped (hotfix for the secondary layer of OI-0103 — PostgREST returning `numeric` columns as JS strings), updated OI-0103 status to reflect the two-layer fix (`38925be` field-name + `d55ba9b` numeric coercion) and opened **OI-0106** (P0 — full-codebase numeric-coercion sweep). OI-0106 is the structural follow-up that Claude Code explicitly scope-limited out of `d55ba9b` to keep the hotfix minimal. Spec enumerates every one of 24 entities with numeric `sbColumn` fields, split into three priority tiers (Tier 1 — dashboard/feed/DMI paths; Tier 2 — reports and flow-specific; Tier 3 — nutrient math) with 94 numeric fields total. Critical issue classes called out: (1) `typeof === 'number'` silent validate rejections; (2) `.toFixed()` TypeError crashes; (3) threshold lex comparisons that quietly lie about dashboard badge colour; (4) divide-by-string NaN cascades through calc chains; (5) chart axis anomalies from lex sorts; (6) calc-registry input hygiene. Fix pattern matches the existing `event-observation.js` reference: `row.col != null ? Number(row.col) : null`. Defensive `Number(x) || 0` wraps at aggregation hotspots (`dashboard/index.js`, `reports/index.js`, `feed/index.js`, calcs) as belt-and-braces. CP-56 file-upload backup-import path must be audited since backups taken before `d55ba9b` may contain stringified numerics. Thin pointer `github/issues/BUG_numeric-coercion-sweep.md` written. **Root-cause framing:** OI-0050 (missing sync params) and OI-0103 (entity field-name typo + PostgREST numerics) are the same class of bug — silent data/calc corruption invisible to the user until someone checks downstream state. This sweep is the last major structural fix of that class that's visible from Tim's current testing; future instances of this class should be surfaced as CLAUDE.md Known-Traps additions plus round-trip entity tests. |
| 2026-04-18 | OI-0099 design lock — Class A + Class B bundled into one spec | With OI-0096 shipped this morning, Tim opted to close OI-0099 end-to-end rather than ship Class A first and leave the Class B inputs misleadingly live ("no gaps"). Locked four decisions: (1) **Class A damId** — read `inputs.damId.value \|\| null` in `saveAnimal`, one-line wiring fix, entity + column already exist; (2) **Class A weaned + weanedDate** — read `inputs.weaned?.checked`, auto-stamp `weanedDate = todayStr` when checkbox flips on, render an editable date field so the farmer can back-date (e.g., "weaned two weeks ago"), clear `weanedDate` when checkbox flips off; (3) **Class B sireTag → picker + inline Add AI bull (B1 refined)** — remove freeform text input; replace with picker offering "Animal in this herd" (writes `sireAnimalId`), "AI bull from list" (writes `sireAiBullId`), and "Add AI bull" (inline creates an `ai_bulls` record and sets `sireAiBullId`). Picker rows render ear tag + name (Tim's note: *"The picker needs to show ear tag and name"*). No new column on `animals`. Handles the "animals that pre-date the app" case (Tim's note) via the inline Add AI bull escape hatch. Semantic tension flagged: `ai_bulls` will in practice hold historical/external non-AI bulls too — acceptable for now, potential rename is a future OI. (4) **Class B confirmedBred → new column (B4)** — add `animals.confirmed_bred boolean NOT NULL DEFAULT false`. Schema migration + execution per CLAUDE.md Migration Execution Rule + `schema_version` bump + `BACKUP_MIGRATIONS` no-op entry + V2_SCHEMA_DESIGN.md §3.2 update + CP-55/CP-56 spec updates (add to `animals` export shape; backup-migration chain entry treats missing column as `false`). Single GitHub issue covers all four inputs. Acceptance criteria collapsed into one 21-item list. Status flipped open → "design locked, ready for implementation." OI-0098 (inline edit/delete of historical weight records) unrelated and stays open DESIGN REQUIRED. |
| 2026-04-18 | Field-testing roadblocks bundle shipped — OI-0100 / OI-0101 / OI-0103 / OI-0104 / OI-0105 closed | Five-commit bundle per `SESSION_BRIEF_2026-04-18_field-testing-roadblocks.md`. Shipped in dependency order. **OI-0103** (`38925be`, P0) — `src/features/feed/check.js:262` `checkDate:` → `date:` entity-field rename; Save button now persists to `event_feed_checks` instead of silently dropping. Two sibling read sites also fixed. v1-trap class noted in commit. **OI-0101** (`373f276`, P2) — move-wizard Step 3 dateIn/timeIn one-way mirror from dateOut/timeOut; first keystroke on open-side flips the touched flag and stops cascade. **OI-0105** (`8c71cb8`, P2) — sticky search bar on `renderLocationPicker` with case-insensitive filter, clear button, empty-state message, query persisted on `container.dataset` across internal re-renders. Applies to both picker callers. **OI-0100** (`8ff3572`, P1) — GH-12's inline paddock card extracted to a new shared module `src/features/observations/paddock-card.js`; move-wizard Step 3 pre-graze renders the shared card (rating slider, cover % with BRC-1 bale-ring helper, forage condition, bale-ring count, recovery days, notes). Survey sheet NOT migrated in this commit — follow-up PR can adopt the shared module. **OI-0104** (`1a22923`, P1) — 2-way per-line radio (Move / Leave as residual) replaces the per-line checkbox; Feed Transfer section relocated under Close; residual lines stamp real `remainingQuantity` instead of hardcoded 0 and emit `logger.info('residual-capture', ...)` — real fertility-ledger write lands with OI-0092's schema in a follow-up PR. **OI-0102** stays open (DESIGN REQUIRED, not built). Prerequisite for OI-0100 (Phase 0 `maybeSplitForGroup` shared-export) not needed this bundle — that happened in earlier paddock-window commits. 959 tests pass (25 new unit + 3 new e2e specs, two of which verify Supabase rows per CLAUDE.md rule). No schema change, no migration, no `schema_version` bump, no CP-55/CP-56 impact this bundle (OI-0092 carries its own when it ships). |
| 2026-04-18 | Farm-testing roadblocks captured — OI-0100 through OI-0105 | Tim hit six roadblocks testing v2 against his own farm data. Each captured as a discrete OI so nothing gets lost. **OI-0100** (P1) — pre-graze observations embed the **Survey paddock card** (rating slider, veg height, cover% slider with bale-ring helper, forage condition, recovery window) on the move wizard and event-close flows. Key design note: `event_observations` and `paddock_observations` are different tables on purpose (observation-of-event vs standalone-pasture-survey), but their fields are aligned per OI-0063/migration 022, so the **UI component** reuses cleanly — the submit callback just routes to the right table based on caller. Tim confirmed: *"You mean simply use the survey card on the move wizard, yes that makes sense."* Depends on GH-12 shipping the extractable component (or this OI builds it in the shared location and GH-12 adopts later). **OI-0101** (P2) — move wizard destination `dateIn`/`timeIn` one-way mirror from `dateOut`/`timeOut` with manual-override-respect guard. 10-line change. **OI-0102** (P3, DESIGN REQUIRED, do not build) — explore multi-paddock selection in the pasture picker. Captured stub per Tim's request ("Add OI- to explore"); six design questions enumerated (event model implications, strip-graze relationship, partial-close behavior, picker UX, feed/observation attribution, calc-surface audit). Deferred to a design session. **OI-0103** (P0) — feed check Save button silently fails. Root cause: `src/features/feed/check.js:262` passes `checkDate:` but entity field is `date:` (`src/entities/event-feed-check.js:7`). Entity validate rejects silently; no UI error. One-character fix; e2e test must assert Supabase row exists after save per CLAUDE.md §E2E Testing. Blocks all field testing on feed check path. **OI-0104** (P1) — move wizard feed transfer gets a per-line **2-way radio** (Move to new paddock / Leave as residual) replacing the current single checkbox. Default = Move. Residual path writes to the fertility ledger via **OI-0092**'s schema (sequencing note: if OI-0092 not yet shipped, this OI writes to a placeholder column with a TODO pointer, flips to the real path in OI-0092's PR). Feed transfer section also **relocates** from the bottom of Step 3 to sit between the close section and the open section (correct mental ordering — residual feed is a post-graze observation of the paddock being closed). Close-reading `remainingQuantity` stamps real-remaining-amount on residual lines instead of hardcoded 0. V1 parity for `calcResidualOM` / `feed_residual` NPK source. **OI-0105** (P2) — anchored sticky search bar at the top of `renderLocationPicker`, with case-insensitive filter and auto-collapsing empty sections; applies to every caller (move wizard Step 2, new-event dialog, future callers). **Bundling plan:** OI-0100 / OI-0101 / OI-0103 / OI-0104 / OI-0105 bundled into one Claude Code session brief (5 implementable items). OI-0102 stays open, design-required, not in the brief. CP-55/CP-56 impact: none direct for OI-0100/0101/0103/0105; inherited from OI-0092 for OI-0104. Schema change: none direct (OI-0104 sequences with OI-0092). |
| 2026-04-18 | OI-0099 captured — Edit Animal silent-drop audit (4 remaining inputs) | After the OI-0095/0096/0097 combined session brief was written, Tim flagged that the four adjacent silently-dropped `saveAnimal` inputs (`damId`, `sireTag`, `weaned`, `confirmedBred`) should be documented before they get lost. **OI-0099 added** (P1, mixed implementability). Investigation split the four into two classes: **Class A (pure silent-save bugs)** — `damId` (entity + `dam_id` column exist, just not read in `saveAnimal`) and `weaned` (entity + `weaned` + `weaned_date` columns exist, checkbox not read). Both are one-line wiring fixes, ship-ready after OI-0096 lands. **Class B (UI field without Supabase column — the v1 trap per CLAUDE.md)** — `sireTag` (freeform text input, no matching entity field; v2 entity uses `sireAnimalId` / `sireAiBullId` FKs instead) and `confirmedBred` (checkbox, no matching entity field at all). Both Class B items require Tim's design decision before implementation. Three options each documented: for `sireTag` — replace with animal/AI-bull picker (B1), add `sire_tag` column (B2), or remove entirely (B3). For `confirmedBred` — add `confirmed_bred` column (B4), derive from calving records (B5), or build full `animal_breeding_status` table (B6). Until design locks, Class B inputs stay in the DOM but should get a `disabled` attribute + stopgap caption so farmers don't think they're working. CP-55/CP-56 impact flagged for Class B if B2/B4 chosen (new columns require backup-migration chain entry). No session brief yet — Class A can ship as a small follow-up once OI-0095/0096/0097 land; Class B needs a design session. |
| 2026-04-18 | Dependency review + design-lock for the three-OI bundle (OI-0095 + OI-0096 + OI-0097) | Follow-on to the morning session that drafted OI-0095/0096/0097. Walked the bundle for order-of-operations gaps before writing the combined Claude Code session brief. **Found seven dependencies** worth flagging: (1) `maybeSplitForGroup` is not a shared helper — it's defined locally twice (`src/features/health/calving.js:19` and `src/features/animals/index.js:31`), so OI-0094 never actually promoted it; session brief now includes a **prerequisite step** to extract it to `src/data/store.js`, update both existing callers, and make it importable from the Quick Weight sheet; (2) OI-0095's `Files likely affected` list was missing `src/features/events/close.js:209` (close-event paddock window loop) and `src/features/events/index.js:832` (Quick Move new-window open) — both added with explicit in-scope/carve-out notes; (3) OI-0097 is fully independent of 0095/0096 helpers and can ship in isolation if needed (documented but kept in the bundle); (4) `SESSION_BRIEF_2026-04-17_empty-group-archive.md` on main still contains the broken §7 Remove wiring guidance — plan: annotate it with a correction banner when OI-0097 ships; (5) unit tests that positively asserted `maybeShowEmptyGroupPrompt` on §7 Remove must be removed by OI-0097; (6) OI-0096 Option A vs B needed a call; (7) OI-0095 Part B orphan cleanup needed migration-vs-app-side decision. **Locked decisions (with Tim):** **OI-0095 Part B → app-side one-time script** (no SQL migration, no `schema_version` bump, no CP-55/CP-56 impact). Guarded by `user_preferences.paddock_orphan_cleanup_done` flag, invoked from app boot after store init, routes through the new `closePaddockWindow` helper so sync queues normally. **OI-0096 Edit Animal redesign** — replace the editable `currentWeight` input with a **read-only current-weight display + ⚖ Weight button** that opens the Quick Weight sheet for the animal. Existing "Weight history" read-only list stays. No editable field = no silent-save footgun. **OI-0098 added** (P3, DESIGN REQUIRED, do not build) — inline edit/delete of historical weight records in Edit Animal, deferred from OI-0096. Six open design questions documented, centered on the closed-window snapshot ripple: editing a past weight that triggered a `splitGroupWindow` on a now-closed window raises "do stamps re-compute (B) or stay frozen (A)?" — a real architectural question, not a UI detail. Needs its own design session with Tim before implementation. Files-affected and Acceptance-criteria sections of OI-0095 and OI-0096 updated in lockstep. Next deliverable: combined session brief for OI-0095 + OI-0096 + OI-0097. |
| 2026-04-18 | Paddock-side window-split architecture (OI-0095 + follow-up batching) | After OI-0094 shipped, Tim asked to walk every event-window trigger systematically (group change, acreage change, weight change, feed) to catch anything the group-side pass missed. Walk surfaced: (1) feed is not a window trigger (time-stamped ledger, correct as-is); (2) weight has two real gaps on the group side — per-animal Quick Weight sheet (`src/features/health/weight.js`) never calls `splitGroupWindow`; Edit Animal `currentWeight` input is created but silently no-ops in `saveAnimal`; (3) §7 Remove group in OI-0090 session brief was incorrectly listed as a `maybeShowEmptyGroupPrompt` wiring point (closes the PW but doesn't touch `animal_group_memberships`); (4) **acreage/area is the biggest architectural miss** — `event_paddock_window` has the row structure for splits (GH-4 added `is_strip_graze`/`strip_group_id`/`area_pct` columns) but no discipline of splitting. `edit-paddock-window.js` mutates `area_pct` in place on open windows, destroying historical effective-area; `submove.js` Advance Strip splits correctly but the pattern is inline, not a reusable helper; `reopen-event.js` blindly reopens closed PWs without a classifier analog to OI-0094's `classifyGwsForReopen`. **OI-0095 added** (P0, architectural fix — paddock analog of OI-0091). Scope: new `splitPaddockWindow` + `closePaddockWindow` store helpers; new `getOpenPwForLocation` calc helper; lift Advance Strip onto the helper; route `edit-paddock-window.js` `areaPct`/`isStripGraze` edits through the helper on open windows; route `move-wizard.js` close loop through `closePaddockWindow`; build `classifyPwsForReopen` + summary dialog on reopen; fix hard-coded `areaPct: 100` reads in `dashboard/index.js` + `locations/index.js`; audit `calcs/feed-forage.js` + rotation-calendar reads; orphan prevention (helper assertions) + one-time cleanup; extend `V2_APP_ARCHITECTURE.md` §4.4 with paddock-side subsection and grep-contract row. No schema change (GH-4 columns already exist). No CP-55/CP-56 impact (more rows over time; existing export/import handles the table). Thin pointer `github/issues/paddock-window-split-architecture.md` written; session brief deferred until the two smaller follow-ups (weight-side OI + §7 Remove group correction) are drafted so they batch into a single Claude Code handoff per Tim's direction: *"lets walk through all event window related items and wrap it all in at the end."* |
| 2026-04-17 | Group state-change entry-point audit (OI-0094 + OI-0093 — package 2 after OI-0091) | After OI-0091 went to Claude Code, Tim asked for an audit of every place in the app where an animal group can be altered, to catch any entry points OI-0091 missed. Greps across `src/features/animals/index.js`, `src/features/health/calving.js`, `src/features/events/group-windows.js`, `src/features/events/edit-group-window.js`, `src/features/events/reopen-event.js`, and `src/features/field-mode/index.js` turned up eleven entry points that mutate group state but do not call OI-0091's `splitGroupWindow` / `closeGroupWindow` helpers — every one a latent stale-snapshot bug once OI-0091 lands. Also audited feed flows: architecture there is different (no window split needed); all feed paths converge on `feed/delivery.js`. **OI-0094 added** (P0, package 2) — one-pass completeness fix across all eleven entry points. Tim's direction: ship as a separate package rather than widening OI-0091 mid-flight (Claude Code already executing package 1). **§7 per-row Edit sub-decision locked** — Tim, *"those two fields should be view only. That's how they were in v1 as well. System generated."* — `headCount` + `avgWeightKg` fields in `edit-group-window.js` render view-only on open windows (showing live values with "System generated from live memberships" caption), editable on closed windows (historical correction escape hatch). v1 parity + aligns UI with the OI-0091 rule (open = live, closed = snapshot). **OI-0093 added** (P1) — separate UI cleanup: remove green bulk action bar from Animals screen (redundant with per-row Edit + per-group tile actions; confirmed in Tim's screenshot), remove checkbox column, rewrite Edit Animal group dropdown to use v2 design-system picker pattern instead of raw `<select>`. OI-0093 removes entry point #11 from OI-0094's scope entirely. CP-55/CP-56 impact: none (no schema change, reuses OI-0091 helpers). Full spec in OI-0094 body with 11-row entry-point table + locked sub-decision + 7 acceptance criteria; thin pointers `github/issues/group-state-change-entry-point-completeness.md` and `github/issues/animals-bulk-action-bar-removal.md`; session brief `github/issues/SESSION_BRIEF_2026-04-17_group-state-change-completeness.md` with 5-phase implementation order gated on OI-0091 helpers being present. |
| 2026-04-17 | Event window split architecture (OI-0091 + OI-0073 package + OI-0092 stub + OI-0090 revision) | **OI-0091 added** (P0, architectural fix — silent calc correctness across DMI/NPK/AU-days/animal-days/cost). Tim hit two real-data bugs from his farm notes: (1) dashboard card + event detail §7 both showed 10 head for Shenk Culls after culling 4, while the Animals screen correctly showed 5; (2) after moving the remaining 5 from J2 to D, the group rendered on both locations with 10 head each. Investigation traced root cause to `event_group_window.head_count` + `avg_weight_kg` being captured as snapshots at window creation and never updated on mid-event state changes (cull / move / wean / split). Every calc surface and render surface reads the stale snapshot; the Animals screen only works because it reads memberships directly. Widened scope after Tim's follow-up ("Are calcs using real time or cumulation of stored?") — not just a display bug; DMI / NPK / AU-days / animal-days / cost are all ~50% overstated for his case. Architectural fix: treat `event_group_window` as a period of stable state, split the window on every state change with live values stamped at change date. New store helpers `splitGroupWindow` + `closeGroupWindow`. New calc helpers `getLiveWindowHeadCount` + `getLiveWindowAvgWeight` — open windows recompute live, closed windows read stored snapshot. All calc + render paths rerouted through helpers (grep check). **OI-0073 widened and packaged with OI-0091** — orphaned open windows come from two sources (v1 migration AND fresh v2 flow bugs pre-OI-0091); shipping together so the dashboard can be field-tested. Added Part C (NaN-in-NPK display one-liner). Part B adds migration 025 to close existing orphans. **OI-0090 revised** — Part 1 (automatic event_group_window cleanup via `onLastMembershipClosed` cascade) struck; subsumed by OI-0091's at-the-mutation-site split. SP-11 acceptance criteria updated to reflect new trigger (`maybeShowEmptyGroupPrompt` after OI-0091's window commit). OI-0090 now blocked by OI-0091. **OI-0092 added** (P2 stub, separate track) — v1 parity gap: `calcResidualOM()` + `feed_residual` NPK source exist in v1 but were dropped in v2; flagged explicitly so OI-0091 does NOT touch the `remainingQuantity: 0` line in move-wizard. CP-55/CP-56 impact: none for OI-0091 (no schema change, just more rows); migration 025 bumps schema_version 24 → 25 for OI-0073 cleanup only. Full spec in OI-0091 body with 13 acceptance criteria; thin pointer `github/issues/event-window-split-architecture.md`; session brief `github/issues/SESSION_BRIEF_2026-04-17_event-window-split.md` with 5-phase implementation order (helpers → reroute reads → wire flows → OI-0073 cleanup → doc + tests). UI_SPRINT_SPEC.md § SP-11 Part 1 + Cascade Logic sections struck with crosslinks. |
| 2026-04-17 | Empty group archive flow design (SP-11) | **OI-0090 added** (P1, silent data integrity). Tim hit a real bug: culled the last animal out of the Culls group (OI-0086 closed the membership correctly), then manually deleted the empty group, leaving the historical event showing "?" where the group name should render. Design session covered three interlocking issues: (1) no cascade from last-membership-closed to event_group_window, (2) no empty-group guidance for the farmer, (3) group delete allowed even when referenced by events. Resolved with integrated SP-11 spec: automatic cascade closes the event window on the change date with a toast, empty-group prompt offers Archive / Keep active / Delete (Delete disabled when group has event history), archive upgraded to first-class state via migration 024 replacing `groups.archived boolean` with `groups.archived_at TIMESTAMPTZ` (chosen for richer audit + upcoming schema audit session), reactivation path through group management UI for seasonal cohort reuse. CP-55/CP-56 impact captured: serialize `archived_at`, v23 → v24 backup-migrations chain maps old boolean to timestamp. Full spec in UI_SPRINT_SPEC.md § SP-11; thin pointer in `github/issues/empty-group-archive-flow.md`. Reconciliation checklist updated — SP-11 will merge into V2_UX_FLOWS §3.4 + §15.2 and V2_SCHEMA_DESIGN §3.3 at sprint end. |
| 2026-04-17 | OI-0089 closed — V2_SCHEMA_DESIGN.md catch-up | **OI-0089 closed** — added §5.8 `event_observations` (Domain 5, after §5.7 paddock_observations) and §9.11 `animal_notes` (Domain 9, after §9.10 animal_weight_records; Domain 9 per migration 012's "Domain 9 amendment" header, overriding the earlier "suggest §3.5" placement). Built from `SCHEMA_DUMP_2026-04-17.md` live columns so migration 022's `bale_ring_residue_count` on `event_observations` is captured. Change Log row added to V2_SCHEMA_DESIGN.md. No schema change; pure doc catch-up. Only remaining item from the local-only fields audit is now closed. |
| 2026-04-17 | Local-only fields audit (v2) | Full matrix audit written to `AUDIT_LOCAL_ONLY_FIELDS.md`: 6 checks × 53 tables using live Supabase (`SCHEMA_DUMP_2026-04-17.md`) as ground truth. Entity ↔ live column parity, shape round-trip, store param counts, sync-registry coverage, migration execution all clean (0 findings). Three findings, all on the backup/restore path: **OI-0087 added** (P1, silent data loss) — `event_observations` missing from `BACKUP_TABLES` (backup-export.js) and `FK_ORDER` (backup-import.js position 32); **OI-0088 added** (P0, round-trip breakage) — `CURRENT_SCHEMA_VERSION = 20` in backup-import.js is stale vs live `schema_version = 23`; **OI-0089 added** (P3, doc drift) — V2_SCHEMA_DESIGN.md missing `animal_notes` (migration 012) and `event_observations` (migration 021) sections. Both P0/P1 findings share one root cause: migrations 021/022/023 landed without the CLAUDE.md Export/Import Spec Sync Rule being followed. Session brief `SESSION_BRIEF_2026-04-17_local-only-fields-fixes.md` written for Claude Code to fix OI-0087 + OI-0088 in one commit, including two recommended preventative unit tests (`BACKUP_TABLES.length === FK_ORDER.length` and `CURRENT_SCHEMA_VERSION === max(migration file numbers)`) that would catch this class of drift at commit time. |
| 2026-04-17 | Cull dialog design — animal edit stub fix | **OI-0086 added** (P1, silent data loss) — current v2 animal edit uses `window.prompt()` for cull reason only, sends `{ culled: true, cullReason }` where entity has no `culled` field (real field is `active`). Update call drops silently in `toSupabaseShape()`; no date, no notes, culled state never flips in UI. Schema/migration/entity already correct (`active`, `cullDate`, `cullReason`, `cullNotes` all present with full round-trip) — fix is UI-only. Spec written to `github/issues/cull-sheet-v1-parity.md` with v1 HTML verbatim (9 reason options, date picker, notes field, amber info banner, confirm/cancel buttons). Covers sheet, culled-state red banner with reason + date + notes + Reactivate, group membership close on cull date, e2e Supabase verification per CLAUDE.md pattern. No CP-55/CP-56 impact — columns already in spec. |
| 2026-04-17 | Post-SP-10 field-test block — §8 Feed Entries | **OI-0085 added** (P0, blocks field testing) — three bugs in §8 Feed Entries found during post-SP-10 testing: (1) feed name shows `?` because `renderFeedEntries` reads `batch?.feedName` instead of `batch?.name`; (2) delivery date is blank because it reads `fe.deliveryDate` instead of `fe.date`; (3) per-row Edit pencil opens the Add flow with no pre-fill — no real edit UI exists. Scope expanded to full v1 parity per Tim's direction: rebuild §8 to v1's **inline** pattern (Add/Edit form embedded in Edit Event dialog, not a separate sheet). V1 HTML/CSS/JS extracted into session brief `github/issues/SESSION_BRIEF_2026-04-17_oi0085-feed-entries-v1-parity.md`. Spec already ratified in UI_SPRINT_SPEC.md § SP-10 §8 — this is implementation catch-up, not new design. |
| 2026-04-17 | UI sprint — SP-10 OI-0083 + OI-0084 resolved | **OI-0083 unblocked** — retro-place design questions resolved with Tim: (1) destination picker = sheet picker with event cards; (2) filter = full containment only; (3) flow simplified to atomic two-write transaction (no reopen/re-close ceremony — the reopen was unnecessary once full containment was locked); (4) conflict check blocks with error (not three-option resolver); (5) no undo toast — user deletes via dest's §7 if reversing. UI_SPRINT_SPEC.md § SP-10 "Retro-Place Flow" rewritten. Status → DESIGN COMPLETE, ready for Claude Code. **OI-0084 reclassified** — not actually design-required. SP-10 §9 already has the full spec; Claude Code's "design-required" flag was really a scope surprise (feed check edit UI doesn't exist in current code, needs to be built from scratch). Clarification added; status → DESIGN COMPLETE, ready for Claude Code. Both items rolled into a second handoff brief. |
| 2026-04-17 | UI sprint — SP-10 walkthrough + §8a Move Feed Out design | **OI-0081 added** (SP-10 umbrella, P0 blocks field testing) — all seven event-data edit sections ratified in UI_SPRINT_SPEC.md: §7 Groups, §12 Sub-moves, event-level dates (+ Event Reopen), §8 Feed Entries, §9 Feed Checks, §3/§6 Observations. Core principle: derived values cascade on read; structural state requires explicit reconciliation. **OI-0082 added** (§8a Move Feed Out, P1) — new farmer capability to pull feed back out of an active event (to batch inventory or another open event). Four-step sheet, forced feed-check Step 2 staged-until-Confirm, schema adds 3 columns (`entry_type`, `destination_type`, `destination_event_id`) + check constraints, CP-55/CP-56 impact noted. Calcs update: sum deliveries minus removals (one-line per calc). Session brief + Claude Code handoff prompt authored in `github/issues/SESSION_BRIEF_2026-04-17_sp10-event-edit-consistency.md`. |
| 2026-04-16 | UI sprint — event detail post-implementation review | **OI-0071 added** — 7 UI fixes from Tim's review of implemented SP-2: (1) edit event dialog missing save/cancel buttons, (2) pre/post-graze fields not editable, (3) feed checks/entries/sub-moves missing inline edit buttons, (4) DMI/NPK card moves up to below DMI chart, (5) deliver feed dialog date/time required, (6) quantity stepper whole steps not 0.5, (7) move wizard buttons don't navigate. GH-10 reader order updated (DMI/NPK → position 4). Session brief: `SESSION_BRIEF_2026-04-16_event-detail-ui-fixes.md`. |
| 2026-04-16 | UI sprint — DMI-8 daily breakdown calc | **OI-0069 added** — DMI-8 (Daily DMI Breakdown by Date) spec'd in V2_CALCULATION_SPEC.md. Three-state output (actual/estimated/needs_check) for the 3-day chart. Composes DMI-2/DMI-3/DMI-5/FOR-1. Declining pasture mass balance for estimates. Source event bridge via source_event_id. Forage type missing guard with inline prompt. Session brief written. No schema impact. |
| 2026-04-16 | UI sprint — EST-1 accuracy comparison | **OI-0070 added** — EST-1 (Event Pasture Accuracy) spec'd in V2_CALCULATION_SPEC.md §4.12. New Accuracy domain (domain 12). Compares pre-graze estimates vs actual outcomes for closed events. Two surfaces: event close summary card + accuracy trend report. Two-method sanity check (forage measurement vs mass balance). No schema impact. P2, build after DMI-8. |
| 2026-04-16 | UI sprint — SP-2/SP-3 refinement | Tim reviewed implemented SP-2 and SP-3. Found 7 issues. **OI-0067 added** — event detail view converts from full-screen route to sheet overlay (P1). **OI-0068 added** — pre-graze observations convert from modal to inline editable fields per v4 mockup (P1). Also found: i18n key resolution bug (buttons show raw keys), Feed check/Feed/Move buttons not firing click handlers, post-graze card invisible on active events (visibility condition too restrictive). Session brief written: `SESSION_BRIEF_2026-04-16_sp2-sp3-refinement.md`. GH-10 spec file updated. UI_SPRINT_SPEC.md updated. |
| 2026-04-15 | UI sprint — SP-3 scope correction + handoff | Corrected SP-3 scope: card targets v1 parity (not a slimmer summary). Only two deltas from v1: drop the two small bottom Feed check / Feed buttons; add a large green Feed button under the existing large amber Feed check. Per-group reweigh removed from card, deferred to Animals area. Mockup v3 approved. **OI-0065 added** — per-group reweigh moves from dashboard card to Animals area (P3, DESIGN REQUIRED, not blocking). **OI-0066 added** — per-group Move on card is event-scoped, follow-up to add group-scoped variant (P3). `github/issues/dashboard-card-enrichment.md` rewritten end-to-end for v1 parity. UI_SPRINT_SPEC.md § SP-3 rewritten; status flipped to Ready for Claude Code. |
| 2026-04-15 | UI sprint — SP-2 design review round 1 | **OI-0063 added** — `event_observations` schema alignment with `paddock_observations` (P1, blocker for SP-2). Adds forage_quality, forage_condition, forage_cover_pct, forage_height_cm, stored_feed_only, post_graze_height_cm, recovery_min_days, recovery_max_days, observation_phase enum, paddock_window_id FK. CP-55/CP-56 impact captured in the OI body. **OI-0064 added** — Manage button dropped from sub-move history; reopen folds into Edit dialog (P3, spec'd). SP-2 handoff complete: `github/issues/event-detail-view.md` rewritten with finalized v4-mockup decisions (page order, anchor-no-close rule, per-paddock DM stats, Remove-group picker, post-graze recovery days on one row, one-component-per-pattern rule). UI_SPRINT_SPEC.md § SP-2 expanded with decisions + Schema Impacts subsection. |
| 2026-04-13 | Strip grazing + unit system integration | OI-0001 closed — strip grazing design integrated into V2_SCHEMA_DESIGN.md, V2_CALCULATION_SPEC.md, V2_UX_FLOWS.md, V2_DESIGN_SYSTEM.md; A45 logged. OI-0002 closed — `operations.unit_system` column added to schema; A44 logged; V2_INFRASTRUCTURE.md §1.3 added; V2_MIGRATION_PLAN.md §2.8 updated; implementation spec written to `github/issues/unit-system-operations-migration.md` covering entity update, store action, settings re-render on toggle, onboarding selector, and localStorage → operation migration. |
| 2026-04-13 | Pre-CP-54 audit + nits | Added OI-0011 (feed metrics placeholders, P2), OI-0012 (calc test gap, P2), OI-0013 (calc reference descriptions spot-check, P2), OI-0014 (event close manure volumeKg placeholder, P3) from audit. Added Tim nits: OI-0015 (header: operation name + farm picker, P2, DESIGN REQUIRED), OI-0016 (dose units CRUD, P3), OI-0017 (product add dialog missing unit selection, P2), OI-0018 (sync status not in app header, P2), OI-0019 (no logout affordance in header — v1 parity regression, P2). |
| 2026-04-13 | Header + multi-farm context design | OI-0015 closed — full design locked for header redesign (operation name + farm picker + user menu + build stamp) and multi-farm context (active_farm_id, "All farms" mode, cross-farm move pattern, no-straddling-events rule, source_event_id linkage). OI-0019 closed — bundled into same design (user menu popover with Log Out). Spec written to `github/issues/header-redesign-and-multi-farm-context.md`. Doc updates applied to V2_SCHEMA_DESIGN.md §1.5 and §5.1 (two new columns), V2_UX_FLOWS.md §17.2 (rewritten), §1 (farm chip on pickers), new §18 (farm switching), V2_DESIGN_SYSTEM.md §3.6 (extended with farm picker + user menu patterns). |
| 2026-04-13 | Rotation calendar design (CP-54) | Full design locked for CP-54. Major scope expansion from the original CP-54 row (month-columns × AUDS-colored-cells) to a continuous zoomable timeline with two view modes (Estimated Status + DM Forecast), linked-paddock rendering, proportional strip-graze bands, sub-move connectors, never-grazed tan capacity blocks with survey CTA, right-hand sidebar aligned 1:1 with the paddock column, two toolbar lightboxes (Timeline Selection + Dry Matter Forecaster), Show Confinement Locations on/off pill, and a mode indicator pill in the header. Calendar lives only on the Events screen — Reports → Rotation Calendar tab removed (Reports tab strip trimmed to 6: Feed & DMI Trends first). Mobile fallback: no calendar below 900px, mobile Events uses the v1 GRZ-11 banner + GRZ-10 events log pattern. List view on Events reuses v1 GRZ-10 event log. Doc updates: V2_DESIGN_SYSTEM.md §4.3 (Events rewritten), §4.6 (Rotation Calendar tab removed). V2_BUILD_INDEX.md CP-54 row rewritten with full acceptance criteria. V2_UX_FLOWS.md new §19 Rotation Calendar (8 subsections, Events-only). V2_CALCULATION_SPEC.md gained FOR-6 (Forecast Standing DM at Date) in the Forage domain and new §4.11 Capacity Forecast domain with CAP-1 (Period Capacity Coverage); formula count 35 → 37. OI-0001 (strip grazing) now explicitly bundled into CP-54 per the closure note. CP-54 implementation spec pending (next step this session). |
| 2026-04-13 | CP-54 pre-build reconciliation (Claude Code audit) | Added OI-0020 (Calc Reference console destination — Reports vs Settings, P3). GH-6 spec updated: calc file paths corrected to `src/calcs/feed-forage.js` (FOR-6) and new `src/calcs/capacity.js` (CAP-1) — not feature dirs, matching the existing 35-formula pattern; Reports cleanup reworded from "remove Rotation Calendar tab" (never built in code) to "confirm §4.6 alignment by adding Pasture Surveys + Weaning placeholder tabs"; Reference console left in Reports for this CP per OI-0020. V2_DESIGN_SYSTEM.md §4.6 updated to reflect reality: Calc Reference renders alongside the 6 report tabs in v2.0, planned destination Settings → Developer (OI-0020). No CP-54 build impact. |
| 2026-04-13 | CP-56 spec draft (while CP-55 in flight) | Drafted `github/issues/cp-56-import-json-restore.md` extracting acceptance criteria from V2_MIGRATION_PLAN.md §5.7–§5.9 and V2_UX_FLOWS.md §20.3. Surfaced two blocking design gaps as open items: **OI-0021** (transaction strategy — Postgres `rpc` stored procedure vs client-side per-table replace, P1, DESIGN REQUIRED) and **OI-0022** (revert safety net — 24h stash mechanism is referenced in §5.7.6 but undesigned; localStorage ~5MB budget likely insufficient for real operation backups, P1, DESIGN REQUIRED). Both OIs block CP-56 implementation; spec file references them explicitly in the "Blocked by open design questions" section. |
| 2026-04-13 | CP-56 design decisions locked + FK-ordering added | **OI-0021 closed** — picked per-table client-side replace with halt-on-first-failure (Option B); skipped Postgres `rpc` because payload size ceiling forces chunking which breaks atomicity in production anyway. **OI-0022 closed** — picked auto-downloaded pre-import backup file as the revert mechanism; skipped localStorage/IndexedDB/Supabase-side-table options because size-safe, durable, and reuses CP-55 code. Third issue Tim flagged: parent/child FK ordering was missing from the spec (same class of bug that burned v1). Added **new V2_MIGRATION_PLAN.md §5.3a** — authoritative FK-dependency insert/delete order for all 49 included tables, with two-pass pattern for self-referential tables (`animals`, `events`). V2_MIGRATION_PLAN.md §5.7 rewritten with 10 numbered steps; new §5.7a documents the revert mechanism rationale. CLAUDE.md "Known Traps" gained an FK-ordering entry pointing at §5.3a. CP-56 spec file slimmed to a thin pointer to the base docs — one source of truth per Tim's direction. |
| 2026-04-13 | CP-57 reconciliation — OI-0023 closed | **OI-0023 closed** — V2_MIGRATION_PLAN.md §2.2 events transform table gained `source_event_id = NULL` line. v1 has no cross-farm move concept; all migrated events are origin events. One-line spec update, no design discussion needed. |
| 2026-04-14 | CP-57 reconciliation — OI-0035 added | **OI-0035 added** — schema_version bump convention not spec'd. Surfaced during OI-0026 walkthrough: no doc enforces that each new migration SQL bumps `operations.schema_version` or adds a `BACKUP_MIGRATIONS` entry. P1 because it affects all future schema changes, not just CP-57. Separate from the CP-57 reconciliation set. |
| 2026-04-13 | CP-57 reconciliation — OI-0024 closed | **OI-0024 closed** — V2_MIGRATION_PLAN.md §2.3 gained a "Strip grazing columns (A45 — new in v2)" paragraph specifying `is_strip_graze = false`, `strip_group_id = NULL`, `area_pct = 100` for all migrated windows. Verified DB defaults in migration 005 and V2_SCHEMA_DESIGN.md §5.2 match the migration values; spec sets them explicitly anyway. Confirmed `area_pct = 100` represents full paddock. |
| 2026-04-14 | CP-57 reconciliation — batch closure (OI-0025 through OI-0035) | Closed 11 OIs in batch: **OI-0025** (animal notes → `animal_notes` rows), **OI-0026** (schema_version stamp in §2.8), **OI-0027** (active_farm_id = NULL in §2.24), **OI-0028** (npk_price_history transform — new §2.25), **OI-0029** (animal_classes verified, added `archived = false` to §2.14), **OI-0030** (v1 export shape — new §1.5), **OI-0031** (migration tool UX — new §1.7), **OI-0032** (CP-56 pipeline reuse — new §1.6), **OI-0033** (NPK parity check promoted to AC in §1.4), **OI-0034** (unparseable dose audit → CSV download in §1.4 + §2.7), **OI-0035** (schema version bump convention — new §5.11a + CLAUDE.md check #6). Added **OI-0036** (remove v1 import after cutover, P4, deferred). V2_MIGRATION_PLAN.md gained 6 edits (§1.4, §1.5, §1.6, §1.7, §2.7, §2.8, §2.14, §2.24, §2.25, §5.11a). CLAUDE.md gained Code Quality Check #6. |
| 2026-04-14 | Tier 3 testing blocked — Supabase sync failures | **OI-0052 added** — onboarding wizard renders 3× due to `onAuthStateChange` firing `INITIAL_SESSION` + `TOKEN_REFRESHED` after `boot()` already called `showApp()`. P2, cosmetic but also causes triple `pullAllRemote()`. **OI-0053 added** — P0 blocker: `operation_members` RLS `FOR ALL` policy has infinite recursion (queries itself). Prevents inserting first member row, which cascades to block all other tables. Also discovered migrations 014–016 never applied to Supabase (missing columns: `active_farm_id`, `schema_version`, `invite_token`). `dose_units` and `input_product_units` have RLS enabled outside of migrations. Session brief written: `SESSION_BRIEF_2026-04-14_supabase-migrations-rls-fix.md`. Build index updated: audit status corrected to complete, test count 747 → 779. |
| 2026-04-14 | RLS recursion fix + upsert bootstrap discovery | **OI-0053 closed** (partially) — infinite recursion fixed by splitting `FOR ALL` into granular policies on `operation_members`, then further simplifying SELECT to `user_id = auth.uid()` (no self-referential subquery). However, sync still fails because sync adapter uses `.upsert()` which Supabase evaluates as INSERT+UPDATE, requiring UPDATE policies to pass. UPDATE policies check `operation_members` which doesn't exist during onboarding bootstrap → all 24 onboarding records dead-letter. **OI-0054 added** — P0: two-part fix: (1) sync adapter must use `.insert()` for new records and `.update()` for existing, not `.upsert()` for all; (2) split all ~40 `FOR ALL` RLS policies into granular per-command policies with `WITH CHECK (true)` on INSERT. Base docs updated: V2_INFRASTRUCTURE.md §5.1 rewritten with 3 RLS patterns (operation-scoped granular, operation_members bootstrap-safe, user-scoped) + new §5.1a (onboarding bootstrap sequence). V2_APP_ARCHITECTURE.md §5.2 updated with write-method-by-operation-type table. |
| 2026-04-14 | OI-0054 closed — sync + RLS fix verified | Claude Code implemented both parts: sync adapter now uses `.insert()` for `add()` and `.update()` for `update()` (`.upsert()` only for recovery); migration 018 split all ~40 `FOR ALL` policies into granular INSERT/SELECT/UPDATE/DELETE. Verified: fresh onboard → dead letter queue empty → `operations`, `operation_members`, `animal_classes` (5 rows) all confirmed in Supabase. Supabase sync fully working. Tier 3 migration testing unblocked. |
| 2026-04-14 | OI-0057 added — v1 animal_classes missing NRCS defaults | v1 transform (`v1-migration.js` §2.14) leaves `excretion_n_rate`, `excretion_p_rate`, `excretion_k_rate`, and `dmi_pct_lactating` as null. When import replaces v2 onboarding defaults (which have full NRCS values) with migrated v1 classes, NPK calcs break. Fix: populate from `seed-data.js` based on `inferRole()` in the transform itself. |
| 2026-04-14 | OI-0058 added + closed — operation_members RLS infinite recursion | Migration 017 introduced self-referential subqueries in all 4 operation_members policies. Any table's RLS checking `SELECT FROM operation_members` triggered operation_members' own SELECT policy, which queried itself → infinite recursion on all reads. Latent since 017+018, surfaced during Tier 3 import pullAll. Fixed by simplifying all policies to `user_id = auth.uid()` (sufficient for single-user scope). SQL applied directly in Supabase; Claude Code needs migration 020 to capture it. |
| 2026-04-14 | OI-0059 + OI-0060 added — migration 020 tracking + stale test data | **OI-0059 added** — P1: migration 020 needed to capture the operation_members RLS simplification (OI-0058 fix) in the migration chain. SQL already applied to Supabase; file needed so fresh instances get correct policies. **OI-0060 added** — P4: stale test operations from failed Tier 3 import attempts (0ee3e183, possibly 0a9fa989, 7e28804d) need cleanup. No functional impact, housekeeping only. |
| 2026-04-14 | OI-0056 added — REFERENCE_TABLES blocking import delete | After OI-0055 fix landed, import hit new crash: `forage_types_operation_id_fkey` FK violation when deleting `operations`. Root cause: `REFERENCE_TABLES` set included 5 per-operation tables (`forage_types`, `animal_classes`, `treatment_categories`, `treatment_types`, `input_product_categories`) — `deleteTableRows()` skips them, so their rows block the `operations` delete. Fix: remove these 5 from REFERENCE_TABLES (they're per-operation seed data with `operation_id` FK), keep only `dose_units` and `input_product_units` (truly global, no `operation_id`, per DP#8 exemption). Session brief written for Claude Code. |
| 2026-04-14 | OI-0055 added — import delete crash on join tables | v1 import (CP-57) crashed on `todo_assignments` delete: `column operation_id does not exist`. Root cause: four child/junction tables (`todo_assignments`, `event_feed_check_items`, `harvest_event_fields`, `survey_draft_entries`) were designed without direct `operation_id`, violating Design Principle #8. Fix: migration 019 adds `operation_id uuid NOT NULL FK → operations` to all four tables, enforcing uniform `WHERE operation_id = $1` with no exceptions. Design docs updated: V2_SCHEMA_DESIGN.md (DP#8 + all 4 table specs), V2_APP_ARCHITECTURE.md (§5.5 backup architecture), V2_MIGRATION_PLAN.md (§5.7 steps 6 & 8). Session brief written for Claude Code. |
| 2026-04-13 | CP-57 pre-work — per-gap reconciliation OIs logged | Added **OI-0023** through **OI-0034** (12 items) covering every §1–§2 gap between V2_MIGRATION_PLAN.md and current schema/design. Split by concern: OI-0023 (events.source_event_id default), OI-0024 (strip graze defaults on paddock windows), OI-0025 (animal_notes routing — design required), OI-0026 (operations.schema_version stamp), OI-0027 (user_preferences.active_farm_id default), OI-0028 (npk_price_history transform — design required), OI-0029 (animal_classes rename/splits verification), OI-0030 (v1 export JSON shape — spec update), OI-0031 (CP-57 tool UX — design required), OI-0032 (reuse of CP-56 import pipeline — design required), OI-0033 (§2.23 parity check as formal AC), OI-0034 (§2.7 unparseable-dose audit surface — design required). Status tags distinguish SPEC UPDATE REQUIRED (obvious one-liners) from DESIGN REQUIRED (needs Tim's decision). To be walked through one at a time; each closure updates V2_MIGRATION_PLAN.md inline. CP-57 spec file in `github/issues/` written after all 12 close. |

