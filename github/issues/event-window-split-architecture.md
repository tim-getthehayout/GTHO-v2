# Event Window Split on State Change — Architectural Fix

**Type:** Architectural fix + coordinated cleanup
**Priority:** P0 (silent calc correctness — DMI/NPK/AU/animal-days/cost all overstate by whatever fraction of the group left mid-event)
**Related OI:** OI-0091 (this issue), **OI-0073 (ships together — data cleanup)**
**Follows / is followed by:** OI-0086 (cull — closed, builds on its membership close), OI-0090 (empty group archive — blocked by this), OI-0092 (residual feed NPK — separate track, stub)

## Full spec

The full spec lives in `OPEN_ITEMS.md` § **OI-0091 — Event Window Split on State Change**. Read that entry end-to-end before implementing. This file is a thin pointer per the sprint workflow — do not duplicate the spec here.

Architectural background is in `V2_APP_ARCHITECTURE.md` (will be updated in the same commit to add a "Window-Split on State Change" subsection under the event domain).

## The bug in one paragraph

An `event_group_window` row carries `head_count` and `avg_weight_kg` as a **snapshot taken at window creation**. When animals are culled, moved out, weaned, or the group otherwise changes state during an open event, the snapshot is never updated. Every downstream read — dashboard card, event detail §7 "Groups on this event", DMI calcs, NPK calcs, AU-days, cost — uses the stale snapshot. Live membership changes are invisible to every calc surface except the Animals screen (which reads memberships directly).

This is why Tim saw 10 head on the dashboard card and event detail after culling four Shenk Culls animals down to 5 — the snapshot never ticked.

## The fix in one paragraph

An `event_group_window` is a **period of stable group state**. Any state change (cull / move / wean / split) **closes the current window with live values stamped at the change date**, and opens a new window carrying the new live state. For OPEN windows (`date_left IS NULL`), calcs read the *current live* head count and average weight via `getLiveWindowHeadCount(gw)` / `getLiveWindowAvgWeight(gw)` helpers rather than `gw.headCount` / `gw.avgWeightKg`. For CLOSED windows, the stored snapshot is authoritative (historically accurate at the change date). No schema change — just more rows per (event × group) where state changed mid-event.

## Ships as a coordinated package with OI-0073

OI-0073 (group placement detection picks wrong event_group_window) must ship in the same commit:

- **OI-0091** stops *new* orphans from being created by the cull/move/wean/split flows, and re-routes all calcs/renders to split-aware live reads.
- **OI-0073** cleans up *existing* orphans (from v1 migration and pre-OI-0091 v2 flows) so the dashboard `getGroupPlacement()` function returns sensible results today. Ship as (A) code fix — prefer open-event GWs, tie-break by most-recent `dateJoined`; (B) one-shot data cleanup migration 025 — close orphaned open windows; (C) NaN-in-NPK-display one-liner.

Shipping them separately leaves the dashboard in a broken state either way — OI-0091 alone doesn't fix the existing orphans, and OI-0073 alone doesn't stop new ones. Coordinated commit, single acceptance test covering cull → dashboard → event detail round-trip.

## Out of scope (explicit non-goals)

- **OI-0092 residual feed NPK deposit** — OI-0091 must NOT modify `move-wizard.js`'s `remainingQuantity: 0` line on close-reading. That's a v1-parity gap tracked separately.
- **OI-0066 per-group move** — the state-change framework here enables per-group move later, but this OI only wires the existing single-group flows (cull, whole-group move, wean, split).
- **OI-0065 reweigh flow** — reweigh is on the list of state-change triggers that eventually call `splitGroupWindow`, but the reweigh UI itself is a separate deliverable.

## CP-55 / CP-56 impact

**None.** No new columns, no renamed columns, no JSONB shape changes. The schema already supports multiple `event_group_windows` rows per (event × group). More rows — same serialization.

## Acceptance criteria

See OI-0091 in `OPEN_ITEMS.md` § Acceptance Criteria (13 items) and OI-0073 § Fix (Parts A/B/C).

Headline checks:
- [ ] Cull 4 of 10 from an in-event group → dashboard card shows 6; event detail §7 shows 6; Animals screen still shows 6. All three surfaces agree.
- [ ] Move Shenk Culls from J2 to D → J2's closed window stamps `head_count = 5` + `avg_weight_kg = [live]` on source close; D's new open window opens with the same 5 + live avg weight. No duplicate 10-head rendering.
- [ ] Re-import a pre-OI-0091 backup → migration 025 (or equivalent) closes orphaned open windows. `getGroupPlacement()` returns the most recent open-event window, not the first `.find()` match.
- [ ] Unit tests cover `splitGroupWindow`, `closeGroupWindow`, `getLiveWindowHeadCount`, `getLiveWindowAvgWeight` for open vs closed windows, including the multi-group-on-one-event case.
- [ ] DMI-1 / DMI-3 / NPK-1 / animal-days / AU-days all read via the new helpers — no direct `gw.headCount` / `e.headCount` reads remain in calc paths (grep check).
- [ ] NaN-in-NPK display fix verified (OI-0073 Part C).

## Session brief

`github/issues/SESSION_BRIEF_2026-04-17_event-window-split.md` covers implementation sequencing for the coordinated OI-0091 + OI-0073 package.
