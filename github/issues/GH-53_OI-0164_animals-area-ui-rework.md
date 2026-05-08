# OI-0164 — Animals area UI rework: 2-column groups grid, Archive in Group Edit, Culls filter pill

**Status:** Open — ready to build (DESIGN LOCKED, no DESIGN REQUIRED).
**Owner:** Claude Code.
**Priority:** P2 — UX polish. Animals area works today; this rework recovers wasted phone-width space, gives manual archive a proper entry point, and replaces the dimmed-mix cull view with an exclusive Culls filter.

---

## Where the spec lives

This file is a **thin pointer**, not a duplicate.

- **Canonical OI body** (background, sub-items A/B/C, files, acceptance, grep contracts, origin): `OPEN_ITEMS.md` → `### OI-0164`.
- **Animals screen layout** (chip row with Culls pill, search, config row, 2-col groups grid, archived section): `V2_UX_FLOWS.md` **§15.0** — newly added in the same session.
- **Group Edit footer actions** (Cancel · Save · Archive · Delete with the gated-Delete table): `V2_UX_FLOWS.md` **§15.2** — `Edit-mode footer actions` subsection added in the same session.
- **Existing archive write path** (the same one Archive in the edit sheet must reuse): `V2_UX_FLOWS.md` **§3.4** Empty Group Handling (Archive Cascade) + `groups.archived_at` migration 024.

If anything below conflicts with the canonical sources above, the canonical source wins.

---

## What ships in this commit

Three coordinated UI changes inside `src/features/animals/index.js` plus a tiny CSS addition and a few i18n keys. No schema, no migration, no entity, no JSONB, no CP-55/CP-56 impact.

### Sub-item A — Groups list: 2-column tile grid

Replace the inline-stacked rows in `renderGroupsList` (~133–283) with a CSS grid. Each tile keeps the same content as today's row but rendered as a self-contained card.

- Grid: `grid-template-columns: 1fr 1fr; gap: 8px; align-items: stretch;`. **All viewports**, including phone — Tim wants the space saving on the phone, not just desktop.
- Tile content: 3px left colour stripe → name + status badge → sex breakdown → head/avg-weight/DMI line → action row (Edit / Split when placed / Weights). Padding `12px` all sides.
- The `×` delete icon button on the active group row (today's line ~219) **goes away**. The only path off an active group is now Edit → Archive (default) or Edit → Delete (gated; sub-item B).
- Archived groups section below stays single-column (longer text, wider buttons).

### Sub-item B — Group Edit sheet: Archive primary, Delete gated

In `openGroupSheet` (~445–589), the existing footer is `Cancel · Save · Delete` with one-step destructive Delete. Replace with `Cancel · Save · Archive · Delete`.

- **Archive button** — `btn btn-amber`, edit-mode only. Calls the same archive write path that the empty-group prompt (§3.4) uses today: stamps `archivedAt = now()`, queues sync, closes the sheet, fires toast `Group {name} archived`.
- **Delete button** — red outline, edit-mode only. Disabled with the tooltip *"This group is on N event(s). Archive instead to preserve history."* when the group has ≥ 1 `event_group_windows`. Enabled and one-step destructive (`confirm("Delete group ...?")`) otherwise. Same gate, same wording as the archived-row Delete button at lines 264–271.

Create mode shows only `Cancel · Save` (no Archive, no Delete — there's nothing to remove).

### Sub-item C — Animals list: Culls filter pill replaces "Show culled" checkbox

Three coordinated changes in `renderFilterHeader` and `renderAnimalList`:

1. **Drop the checkbox.** Remove the `showCulledCheck` element and label (~111–117), the secondary controls flex row that hosted it (~115–123 — keep `+ Add animal`, re-anchor it appropriately), and the `showCulled` state variable.
2. **Add `Culls (N)` chip.** Append to the existing `agc-chips` row after the per-group chips. Visual: amber dot prefix (`var(--amber)`); label `Culls (N)` where N = count of animals with `active === false`. Hidden when `N === 0`.
3. **Filter logic in `renderAnimalList`** — three mutually exclusive states driven by `selectedFilter`:
   - `null` (`All` chip active, default) → active animals only
   - `'__culls'` sentinel (`Culls` chip active) → culled animals only, ignore group membership
   - `<groupId>` (group chip active) → active animals in that group only

The 0.5-opacity styling on culled rows (line ~383) **stays** — inside the Culls view it's the visual confirmation that the row is a cull.

---

## Files

| File | Purpose |
|------|---------|
| `src/features/animals/index.js` | renderGroupsList (tile grid + drop `×`), openGroupSheet (Archive + gated Delete), renderFilterHeader (drop showCulled, add Culls chip), renderAnimalList (sentinel filter logic) |
| `src/styles/main.css` (or wherever `.agc-chips` and `.grp-card` live — search the repo) | `.groups-grid` 2-col grid class. `.agc-chip-culls` modifier with amber dot. |
| `src/i18n/locales/en.json` | New keys: `group.archiveButton`, `group.archivedToast`, `group.deleteDisabledTooltip` (reuse existing wording from archived-row delete), `animal.cullsChip` |
| `tests/unit/animals/` | Tile grid renders one tile per active group; Archive calls archiveGroup; Delete is disabled when event_group_windows count > 0; Culls chip toggles cull-only filter; tapping a group chip while Culls is active deselects Culls |

---

## Acceptance

See `OPEN_ITEMS.md` OI-0164 for the full checklist. Summary:

- [ ] Groups list renders as 2-column grid at all viewports (≥ 320px). Archived section single-column.
- [ ] Each active group tile shows name + status badge + sex line + metrics line + Edit / Split / Weights buttons. The `×` delete icon is gone.
- [ ] Group Edit footer is `Cancel · Save · Archive · Delete`. Archive stamps `archivedAt`, closes the sheet, fires toast. Delete is disabled with the gated-tooltip when `event_group_windows` count > 0.
- [ ] Filter chip row is `All` · per-group · `Culls (N)` (when N > 0). The `Show culled` checkbox no longer renders.
- [ ] `Culls` chip → cull-only filter. Tapping `All` or any group chip while `Culls` is active deselects `Culls`.
- [ ] Search works within the active lifecycle state (active or culls).

## Grep contracts (run before commit, all must hold)

```bash
grep -n "Show culled" src/features/animals/index.js               # must return 0 matches
grep -n "showCulled" src/features/animals/index.js                # must return 0 matches (state variable + handler)
grep -nE "'×'|'×'" src/features/animals/index.js             # must return 0 matches at the active-group tile position (line 219 today). The archived-row Delete button text stays.
grep -n "archiveGroup" src/features/animals/index.js              # must return ≥ 2 matches (existing empty-group prompt path + new Group Edit Archive button)
grep -n "groups-grid\|grid-template-columns: 1fr 1fr" src/features/animals/index.js src/styles/  # must return ≥ 1 match
```

## What does NOT change

- No migration. No schema change. `groups.archived_at` already shipped in migration 024.
- No CP-55 / CP-56 spec impact — pure UI rework over existing data.
- The empty-group prompt (§3.4 / OI-0090) is unchanged. The new Archive button reuses that same write path.
- The archived-groups section below the active grid keeps its existing layout (single-column, Reactivate + gated Delete).
- The 0.5-opacity styling on culled rows persists; inside the new Culls view it serves as visual confirmation, not as a way to dim mixed-in rows.

## Suggested commit message

```
OI-0164 — Animals area UI rework: 2-column groups tile grid (all viewports),
Archive button on Group Edit sheet (Delete gated by event_group_windows count),
Culls filter pill replaces Show-culled checkbox (exclusive view, not mixed).
Spec in V2_UX_FLOWS.md §15.0 + §15.2. No schema or migration changes.
```
