# SESSION BRIEF — Observation Boxes Redesign + Dashboard 3-Button Row + Feed DM Label Fix

**Date:** 2026-04-18
**Context:** Three field-testing revisions bundled for a single implementation session. All three come from Tim's recent v2 field-testing pass. They're bundled together because (a) they all touch user-visible UI on the dashboard → event → survey path, (b) the observation boxes redesign is the umbrella that supersedes two earlier OIs (OI-0107, OI-0110), and (c) the three changes have no schema impact and can land in a single commit each without cross-dependencies.
**Read first:**
- `UI_SPRINT_SPEC.md § SP-12` (full sprint spec for both pieces below)
- `github/issues/observation-boxes-redesign.md` (full spec for OI-0112, the umbrella)
- `OPEN_ITEMS.md § OI-0108, OI-0109, OI-0112` (authoritative OI entries)

---

## The three OIs in this bundle

| OI | Scope | Spec file | Authoritative location |
|---|---|---|---|
| **OI-0108** | Event Detail feed-entry: rename "DMI" → "DM" label, guard silent-zero, add metric support | `github/issues/event-detail-feed-entry-dm-label.md` | OPEN_ITEMS.md § OI-0108 |
| **OI-0109** | Dashboard location card: replace stacked Feed/Feed Check with 3-button bottom row (Feed Check · Feed · Sub-Move) | `github/issues/dashboard-card-3-button-bottom-row.md` | OPEN_ITEMS.md § OI-0109 |
| **OI-0112** | Observation Boxes Redesign — three card variants (Pre-Graze, Post-Graze, Survey), 7-surface big-bang migration | `github/issues/observation-boxes-redesign.md` | `github/issues/observation-boxes-redesign.md` + UI_SPRINT_SPEC.md § SP-12 Part B |

**Superseded OIs (close during this work):** OI-0107 (Event Detail pre-graze paddock card) and OI-0110 (Sub-move Open paddock card) are both absorbed into OI-0112 as surfaces #7 and #4 respectively. Their OPEN_ITEMS.md entries are already marked **SUPERSEDED by OI-0112**; close them when OI-0112 ships.

---

## OPEN_ITEMS changes

No new entries to apply — all three OIs (OI-0108, OI-0109, OI-0112) and the related OI-0113 (sunset `event_observations`) are already in `OPEN_ITEMS.md`. Status transitions this session will produce:

- OI-0107 → `resolved` (superseded by OI-0112; close with pointer to OI-0112 commit)
- OI-0108 → `resolved` (shipped by this session)
- OI-0109 → `resolved` (shipped by this session)
- OI-0110 → `resolved` (superseded by OI-0112; close with pointer to OI-0112 commit)
- OI-0112 → `resolved` (shipped by this session)
- OI-0113 → stays `open` (separate follow-up; do not ship in this commit)

---

## Dependency order — READ BEFORE STARTING

The three items in this bundle are independent of each other, but OI-0112 has a cross-dependency on **OI-0111** (bale-ring residue diameter rename ft → cm, metric-internal):

```
OI-0111 (bale-ring rename, ft → cm) → OI-0112 (observation boxes) → OI-0113 (sunset event_observations)
```

**Either order for OI-0111 vs OI-0112 works.** If OI-0111 ships first, OI-0112 reads the new `farmSettings.baleRingResidueDiameterCm` and converts cm → ft inline before invoking BRC-1 (which stays imperial-native per `src/calcs/survey-bale-ring.js`). If OI-0112 ships first, use the existing `baleRingResidueDiameterFt` field and OI-0111 will update the reference in its own commit. **In your OI-0112 commit message, state explicitly which field name you're targeting.**

OI-0113 (sunset `event_observations`) stays locked to **after** OI-0112 — the new observation cards must be the only writers before the table can be retired.

---

## Recommended implementation order within the session

Small → medium → large. Each step commits independently.

1. **OI-0108** (Feed DM label fix) — smallest. Single file + i18n + 5 tests. Start here to build momentum.
2. **OI-0109** (Dashboard 3-button row) — small. Single file edit in `src/features/dashboard/index.js` + test updates. No new imports across features.
3. **OI-0112** (Observation Boxes Redesign) — largest. New `src/features/observations/` folder with 4 files (pre-graze-card, post-graze-card, survey-card, _shared), migration of 7 caller surfaces, deletion of 2 legacy files. This is the big-bang change; land it last so the other two are safely in place first.

---

## OI-0112 summary (the big one)

**Three card variants, one design language, one write path:**

| Variant | Fields | Used by |
|---|---|---|
| Pre-Graze | Height · Cover · Residual Bale Rings (compact top row) · Quality slider · Condition chips · Notes | Surfaces #1 (move wizard dest), #4 (sub-move Open), #7 (event detail pre-graze panel) |
| Post-Graze | Residual Height · Recovery Window (min–max days) · Notes | Surfaces #2 (move wizard src), #3 (close event), #5 (sub-move Close), #7 (event detail post-graze panel) |
| Survey | Pre-Graze fields + Recovery Window + Notes | Surface #6 (survey draft entry — individual + bulk) |

**Write path:** every caller writes to `paddock_observations`. No writes to `event_observations` in this change (OI-0113 sunsets that orphan table later). Event-originated rows use `source: 'event'`; survey rows use `source: 'survey'`. Pre-graze → `type: 'open'`; post-graze → `type: 'close'`.

**Files to create:**
- `src/features/observations/pre-graze-card.js`
- `src/features/observations/post-graze-card.js`
- `src/features/observations/survey-card.js`
- `src/features/observations/_shared.js`

**Files to delete after all 7 callers are migrated:**
- `src/features/events/observation-fields.js` (`renderPreGrazeFields`, `renderPostGrazeFields`)
- `src/features/observations/paddock-card.js` (`renderPaddockCard`)

Grep for `renderPreGrazeFields`, `renderPostGrazeFields`, `renderPaddockCard` before committing — should be zero matches post-migration.

**Design reference:** `/sessions/happy-dreamy-keller/mnt/App Migration Project/pre-graze-box-mockup.html` — open it to see all three variants, interactive.

**See `github/issues/observation-boxes-redesign.md` for the full spec — it's the authoritative document for this work.**

---

## OI-0109 summary

Replace the two full-width stacked buttons in `buildLocationCard()` (dashboard) with a 3-up row:

| Position | Label | Handler | Testid |
|---|---|---|---|
| 1 | Feed Check | `openFeedCheckSheet(event, operationId)` | `dashboard-feed-check-btn-{event.id}` (existing) |
| 2 | Feed | `openDeliverFeedSheet(event, operationId)` | `dashboard-feed-btn-{event.id}` (existing) |
| 3 | Sub-Move | `openSubmoveOpenSheet(event, operationId)` | `dashboard-submove-btn-{event.id}` (new) |

Row: `display: flex; gap: 6px;`, each button `flex: 1`, `padding: 10px 8px`, `font-size: 13px`, `font-weight: 600`, `border-radius: 8px`.

**Also remove** the standalone `+ Add sub-move` teal link above the SUB-PADDOCKS section (around lines 1130–1140 in `src/features/dashboard/index.js`). **Keep** the `+ Add sub-move` link inside the SUB-PADDOCKS section (renders when sub-moves exist). **Do not touch** `src/features/events/detail.js` — Event Detail's Sub-move History stays as-is.

---

## OI-0108 summary

Rename the Event Detail feed-entry row label `{N} lbs DMI` → `{N} lbs DM`. Rename local vars `dmiKg`/`dmiLbs` → `dmKg`/`dmLbs`. Guard the silent-zero path — show `— lbs DM` (em-dash) when batch is missing `weightPerUnitKg` or `dmPct`. Add metric unit support via `operation.unitSystem` + `unitLabel('mass', unitSys)`.

New i18n keys: `event.feedEntryDm`, `event.feedEntryDmMissing`.

**Audit note:** during implementation, confirm the Deliver Feed sheet (`openDeliverFeedSheet`) captures `weightPerUnitKg` and `dmPct` on the batch it creates. If not, stop and open a new OI — do not silently extend scope (CLAUDE.md "Fix Root Causes, Not Symptoms").

---

## Test plan (per OI)

**OI-0108:** 5 new unit tests in `tests/unit/features/events/detail.test.js` (see OI-0108 acceptance criteria).

**OI-0109:** update existing large-button assertion in `tests/unit/features/dashboard.test.js`; add assertions for 3-button row, click handlers, and new `dashboard-submove-btn-*` testid.

**OI-0112:** see `github/issues/observation-boxes-redesign.md § Test Plan`. Summary:
- Unit tests for each card variant (`pre-graze-card.test.js`, `post-graze-card.test.js`, `survey-card.test.js`, `_shared.test.js`)
- Caller smoke tests for sub-move, event detail, surveys
- **E2E Supabase verification** (per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI"): fill pre-graze card on a move destination, save, confirm the resulting `paddock_observations` row in Supabase has every field. Same for sub-move and survey.

---

## CP-55/CP-56 Impact

**None for any of the three OIs.** All pure UI + caller migration. No schema changes. `paddock_observations` shape is unchanged; `event_observations` stays in the backup (empty table) until OI-0113 ships.

---

## Deploy Gate (before commit)

Per CLAUDE.md § "Code Quality Checks":

- [ ] `npx vitest run` — all unit tests pass
- [ ] No `innerHTML` assignments with dynamic content in any new card file
- [ ] All user-facing strings use `t()` — new i18n keys for anchor labels, chip labels, preview chip, required pill (OI-0112); `event.feedEntryDm`, `event.feedEntryDmMissing` (OI-0108)
- [ ] Grep for `renderPreGrazeFields`, `renderPostGrazeFields`, `renderPaddockCard` — zero results after OI-0112 migration
- [ ] Store call param-count check (CLAUDE.md §7) — no regressions
- [ ] **State in the OI-0112 commit message which bale-ring field name you're targeting** (`baleRingResidueDiameterFt` vs `baleRingResidueDiameterCm`) so OI-0111 knows whether to update the reference
- [ ] Close GitHub issues for OI-0107, OI-0108, OI-0109, OI-0110, OI-0112 after each respective commit lands. OI-0113 stays open.
- [ ] Update `PROJECT_CHANGELOG.md` with one row per commit
- [ ] Update `TASKS.md` — check off completed build tasks

---

## Related OIs (for context)

- **OI-0100** — shared paddock-card component (original scaffolding; OI-0112 supersedes the UI but keeps the contract lineage)
- **OI-0107** — Event Detail pre-graze panel (superseded by OI-0112 surface #7)
- **OI-0110** — Sub-move Open paddock card (superseded by OI-0112 surface #4)
- **OI-0111** — Bale-ring residue diameter rename (ft → cm); see Dependency order above
- **OI-0113** — Sunset `event_observations` table (P3; stays locked to after OI-0112)

---

## Notes for Claude Code

- The three OIs are independent but bundled because they all came from the same field-testing session and have similar scope (UI visual/wiring, no schema). Feel free to commit them separately — just keep them in the same PR/session.
- If the Deliver Feed audit in OI-0108 surfaces a missing-field bug, add a new OI (numbered OI-0114 or next available), do not fix it silently.
- OI-0112 is explicitly designed as a big-bang migration across all 7 surfaces. Do not phase it across multiple commits — the whole point is visual consistency after the swap. One commit with all 7 callers migrated is the target.
- Dedicated card components (not a `{ variant }` flag) — see OI-0112 spec § Notes for the rationale.
