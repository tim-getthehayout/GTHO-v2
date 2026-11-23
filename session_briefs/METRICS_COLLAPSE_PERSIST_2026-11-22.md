# Rotation Calendar Metrics collapse persists per device (OI-0267)

**Status:** **LOCKED / READY FOR BUILD** (Design rec; America/New_York).
**Opened / locked:** 7:27 PM ET 2026-11-22 by GTHO Design from Tim, via Orchestrator:
- **t1303u** (7:27 PM ET): “The metrics column tab should stay in the last state it was in the user selected (opened or closed) right now it reopens on any refresh of that screen”

**Branch tip:** `docs/oi-0267-metrics-collapse-persist`, stacked on `origin/main` `710a961cac6acde7e266d62ed87c8ab68d7b89e9` (OI-0262 Sa1, now live). FF onto current main. Docs only — do not land until Tim land yes.
**No SQL / no migration / no data change. D0.**

Line numbers are at main `7195e50`. Code read only.

---

## What happens today

The ▾/▸ Metrics toggle is session-only, so a collapsed column reopens on any remount.

| Piece | Where |
|---|---|
| Toggle UI | `calendar-grid.js` `renderMetricsCollapseToggle` ~701 |
| State default (expanded) | `calendar-state.js` `metricsCollapsed: false` at ~22 (OI-0254 **Cm1a**) |
| URL remount forces expanded | `readStateFromUrl` ~178–230 (`:191` and `:228–229` set `metricsCollapsed: false`; comments say “session only”) |
| Every screen remount rereads the URL | `events/index.js` 76–77 inside `renderEventsScreen` |
| Remount also on store updates | `events/index.js` 150–153 (`subscribe('events', …)`) |
| Setters write memory only | `setMetricsCollapsed` / `toggleMetricsCollapsed` (`calendar-state.js` 133–140); not in the URL |

So it reopens on reload, leave/return, Calendar↔Map, and events-store updates. List view has no toggle and is unaffected.

Existing test `tests/unit/calendar-state.test.js` ~272–276 (“URL remount resets collapse to expanded (Cm1a)”) pins the wrong behavior. The neighboring ~264 test (“defaults expanded and toggles in session only”) will also need its “session only” claim updated.

---

## Lock (Pd1)

Persist the last chosen open/closed state **per device** in `localStorage` key `gtho_v2_locations_metrics_collapsed`, following OI-0246 **Pb** (`gtho_v2_locations_metric_window`, `calendar-state.js` 7/120–121/241–264).

- Setters write the key.
- Mount / `readStateFromUrl` restores it.
- Unset or invalid falls back to expanded (**Cm1a** default kept).
- Not added to the URL.
- List view unchanged (no toggle).
- A `localStorage` exception (private mode) falls back silently to expanded, same as Pb’s try/catch.

**Rejected alternative:** cross-device `user_preferences.events_calendar_state jsonb` (the original V2_UX_FLOWS.md §19.9 follow-up). It would need a migration. Pd1 is the pattern already shipping for the season window.

**OI-0254 Cm1a:** default expanded still holds when unset. Session-only persistence in the OI-0254 implementation is superseded by Pd1.

---

## Acceptance

- Collapse, then reload/remount: stays collapsed.
- Expand, then remount: stays expanded.
- An events-store update keeps the last chosen state.
- Unset defaults expanded.
- A `localStorage` exception (private mode) falls back silently to expanded.

## Tests

- Replace `tests/unit/calendar-state.test.js` ~272–276 “URL remount resets collapse to expanded (Cm1a)” with a restore test (collapse then remount stays collapsed; expand then remount stays expanded).
- Revise ~264 “defaults expanded and toggles in session only” so it no longer claims session-only (setters persist).
- Pin unset → expanded, and a throwing `localStorage` → silent expanded fallback.
- Update the “session only” comments in `calendar-state.js` (`:6`, `:22`, `:132`, `:190–191`, `:228`).

## Docs

- V2_UX_FLOWS.md §19.9 state-persistence policy: most calendar state stays session/URL; per-device `localStorage` prefs are Pb (season window) and Pd1 (metrics collapse).
- OPEN_ITEMS.md OI-0254 **Cm1a** note: session-only implementation superseded by OI-0267 Pd1; Cm1a default still applies when unset.

## Stacking and size

- Independent of PR #152 / OI-0264 (no `calendar-state.js` diff) and of OI-0265 / OI-0266.
- Stacked on origin/main `710a961` (OI-0262 Sa1, now live). #152 and this tip do not touch the same files.
- **Size:** XS.
