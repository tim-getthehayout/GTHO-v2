# BUG — Sub-move Open resets `event.date_in` to the sub-move date (OI-0115)

**Added:** 2026-04-18
**Area:** v2-build / events / submove / data-integrity
**Priority:** P0 (silent data corruption during live field testing — event start date overwritten; every "Day X" / "since start" / days-on-pasture / DMI-over-time calculation on the affected event is now wrong)
**Thin pointer note:** not a thin pointer — no base-doc spec exists for this flow yet because sub-move open is meant to be a no-op on the parent event. Full spec here; at sprint reconciliation, the fix (and its "sub-move does NOT touch event.date_in" invariant) can be rolled into V2_UX_FLOWS.md §12 Sub-moves.

## Reproduction (Tim's field test — 2026-04-18)

Concrete numbers from Tim's live repro:

- Event: active, main paddock **G1**, original `event.date_in = 2026-04-16` (two days before the repro).
- Action: on the dashboard card for this event, tapped **Sub-Move** in the 3-up bottom row, picked destination paddock **G3**, left the "Date opened" field at today's default (**2026-04-18**), tapped Save.

**Expected:**
- New `event_paddock_window` row created: `event_id = <this event>`, `location_id = G3`, `date_opened = 2026-04-18`.
- Parent event untouched: `event.date_in` remains `2026-04-16`.
- Dashboard card still shows `Day 3 · In Apr 16`. Event Detail "In" input still shows `2026-04-16`.

**Actual:**
- New `event_paddock_window` row for G3 created correctly.
- **Parent event's `date_in` overwritten from `2026-04-16` → `2026-04-18`** (today, matching the sub-move's date).
- Dashboard card flips to `Day 1 · In Apr 18`.
- Event Detail sheet's editable "In" input reads `2026-04-18` (Tim confirmed — proves this is a real store mutation, not just a render bug). Day count and every time-in-paddock computation reset.

**Generalized reproduction steps:**

1. Open dashboard for an active event whose `date_in` is in the past (≥1 day old).
2. On the event's location card, tap the teal **Sub-Move** button in the 3-up bottom row (per OI-0109) to open the Sub-move Open sheet.
3. Leave the "Date opened" field at the default (today).
4. Pick a destination paddock in the location picker.
5. Fill any required pre-graze fields and tap **Save**.
6. Observe: dashboard card's "In [date]" flips to today; Event Detail "In" input confirms the same.

## Why this matters

`event.date_in` is the anchor for every time-based metric on the event:

- Dashboard "Day X" counter
- DMI / NPK / AU-days / animal-days integrations
- Pasture-percent mass balance windows
- Event-detail DMI-8 daily-breakdown chart x-axis origin
- Move-wizard scoping ("closed on `date_out` after N days in")
- v1→v2 parity for the card's "In [date]" display

Resetting it silently means every downstream calc lies until the user notices and manually edits `date_in` back (which is allowed but requires them to remember the original).

## Code-level investigation already done (Cowork)

I walked the save path and confirmed the obvious culprit is **not** the direct cause:

- `src/features/events/submove.js` `openSubmoveOpenSheet` (lines 26–111): the Save handler only calls `PaddockWindowEntity.create(...)` + `add('eventPaddockWindows', ...)` + `createObservation(...)`. **No `update('events', ...)` call. No mutation of `evt.date_in`.**
- `src/features/events/index.js` `createObservation` (lines 43–55): writes one `paddock_observations` row. No event mutation.
- `src/data/store.js` `add` (lines 140–162): generic; no cross-entity side effects. `eventPaddockWindows` subscribers run after, but subscribers are read-only render code (see next bullet).
- `src/data/store.js` helpers: `splitPaddockWindow` (line 715), `closePaddockWindow` (line 686), `findOpenPaddockWindow` (line 669) — none mutate `events`.
- Grep `update\('events'` across `src/`: only five callers, all in surfaces the sub-move Save does NOT touch (detail.js dateInInput change handler, detail.js notes change handler, reopen-event.js dateOut/timeOut clear, close.js dateOut/timeOut set, move-wizard.js source event dateOut set).

So on paper the sub-move Save path should never write to `events`. The mutation is happening indirectly — via a subscriber, a handler firing on re-render, a focus/blur cascade, or an adjacent codepath Tim is tripping over in the same flow. **Claude Code needs to root-cause this before writing the fix**; my investigation narrowed it but didn't identify the writer.

## Suspect list for Claude Code (ordered by likelihood)

Investigate in this order. Log what you rule out so the OPEN_ITEMS entry captures the actual root cause when closed.

### Suspect 1 — Event Detail sheet's `dateInInput` change handler firing on re-render

`src/features/events/detail.js` lines 305–325 render an editable `<input type="date">` for `event.date_in` and attach a `change` listener that calls `update('events', ctx.eventId, { dateIn: newDate }, …)`. The `change` event fires when the user explicitly edits the field — browsers do NOT fire `change` on programmatic `value` assignment, **but** some re-render flows may replace the element entirely (element identity change) without triggering change, OR the element stays mounted and a focus/blur cascade fires it.

Check: is the Event Detail sheet open simultaneously when Tim taps Sub-Move on the dashboard card? If yes:
- The sub-move Save triggers `subscribe('eventPaddockWindows', …)` on detail.js (line 135), which calls `renderPaddocks` / `renderPostGraze` / `renderSubmoves` / `renderSummary` — but **not** `renderHeader`.
- `subscribe('events', …)` (line 127) is NOT triggered by a paddock-window insert, so `renderHeader` should not re-run.
- BUT if any of those re-renders indirectly triggers an `events` subscription via `renderSummary` or similar, the dateInInput gets rebuilt. The old input's `change` handler may fire during teardown with the currently-focused value.

Test hypothesis: open dashboard WITHOUT opening Event Detail first, then tap Sub-Move → save → check `event.date_in`. If the bug reproduces only when Event Detail is open (or has been opened this session and the detail sheet is still mounted in the DOM), suspect 1 is confirmed.

### Suspect 2 — Dashboard card re-render creating a phantom `change` via input-element reuse

After the sub-move saves, `eventPaddockWindows` subscribers fire. Dashboard doesn't render an editable date input for `event.date_in` (only a text span, `detail.js`-style editability is scoped to Event Detail) — so a direct dashboard-card trigger is unlikely. Rule out quickly by grepping `dashboard/index.js` for `type: 'date'` and any `onchange` / `input` handlers on the date-display span. If nothing, move on.

### Suspect 3 — A shared input component (or DOM builder) echoing `value` back via `input` event on re-mount

Check `src/ui/dom.js` `el()` helper and any date-input factory: does setting `value` at construction trigger a synthetic `change` / `input` event? Vanilla `el('input', { type: 'date', value: todayStr })` should NOT, but if there's any `defaultValue` → `value` assignment in a utility wrapper, it could fire.

### Suspect 4 — Server-side / sync-adapter merge overwriting `event.date_in`

`src/data/sync-adapter.js` `pullAllRemote()` or `mergeRemote()` — if the sub-move Save queues a pull immediately after the insert, and the pull overlaps with a local `update()` that was queued elsewhere, a race could merge stale data back. Less likely because Tim saw the change immediately in the UI (before any network round-trip), but verify by forcing offline mode in the repro.

### Suspect 5 — An auto-recompute on dashboard subscribe that treats "earliest paddock_window.date_opened" as authoritative for `event.date_in`

Grep for `date_in` / `dateIn` assignments or computed reads across `src/features/dashboard/`, `src/features/events/`, and `src/calcs/`. If any code does `event.dateIn = min(paddockWindows.date_opened)` and persists, that's the culprit.

### Suspect 6 — `edit-paddock-window.js` or an adjacent edit sheet piggybacking on the Save handler

Less likely — the Sub-Move button wires directly to `openSubmoveOpenSheet` — but confirm the dashboard button's `onClick` at `src/features/dashboard/index.js:1438` is exactly `openSubmoveOpenSheet(event, operationId)` with no wrapping handler mutating the event first.

## Files likely affected

Investigation-only, not necessarily edit targets:

- `src/features/events/submove.js` — primary suspect surface; the Save path is clean on inspection but the reproduction points here
- `src/features/events/detail.js` — suspect 1 (dateInInput change handler + `subscribe('events', …)` re-render path)
- `src/features/dashboard/index.js` — suspect 2 (but unlikely)
- `src/data/store.js` — subscribe/notify mechanics
- `src/data/sync-adapter.js` — suspect 4 (merge-remote race)
- `src/ui/dom.js` — suspect 3 (input-element side effects on re-mount)

Edit targets depend on root cause. Most likely one-line fix in whichever handler is misfiring, plus a regression test.

## Acceptance criteria

1. **Root cause identified and documented in the commit message** — not "we made it stop happening" but "X was calling `update('events', …)` from this subscription path, fixed by Y."
2. **Reproduction no longer reproduces.** Manual repro steps above → `event.date_in` unchanged in the store, in localStorage, and in Supabase.
3. **Unit test added** that mirrors Tim's actual repro: seed an event with `date_in = '2026-04-16'`, main paddock G1; invoke the sub-move Open Save path directly (or its store-level equivalent) with destination = G3 and `date_opened = '2026-04-18'`; assert `getById('events', evt.id).dateIn === '2026-04-16'` unchanged AND a new `event_paddock_window` row exists for (event, G3, 2026-04-18).
4. **E2E test added** per CLAUDE.md §"E2E Testing — Verify Supabase, Not Just UI": after the sub-move Save, query Supabase `events` row for the affected event and assert `date_in` matches the pre-save value byte-for-byte.
5. **Regression guard** — add a similar "sub-move does not mutate parent event" assertion to any existing sub-move test so it fails loudly if this class of bug returns.
6. **Grep contract** — `grep -rn "update('events'" src/features/events/submove.js` returns zero matches. Add to the per-commit grep contracts (or CLAUDE.md Architecture Audit checklist) so a future well-intentioned change can't accidentally re-introduce it.
7. **Adjacent-flow smoke test** — verify the same Event Detail re-render path under Advance Strip Save and sub-move Close Save doesn't also reset `date_in`. These flows are architecturally similar and likely share the root cause if suspect 1 is right.
8. **OPEN_ITEMS.md updated with the actual root cause** in the OI-0115 "What happened" section before closing the entry. Don't leave it as "investigation pending."

## Recovery instruction for Tim (before the fix ships)

Tim: on the affected event, open Event Detail → tap the "In" date input → pick the correct original start date → tap away to trigger save. This will write the correct `date_in` back. Dashboard "Day X" and all downstream calcs will recompute correctly on next re-render.

If multiple events have been affected by multiple sub-move saves in this session, each needs manual correction until the fix lands.

## Schema change

None. Pure behavior/wiring bug.

## CP-55/CP-56 impact

None. `events.date_in` is already in the export/import pipeline; the fix is preventing an incorrect mutation, not changing the backup shape.

## Related

- **OI-0109** (shipped) — promoted Sub-Move to the 3-up quick-action row on the dashboard card. Likely what made this bug discoverable in Tim's field testing; the old buried teal link was used less often.
- **OI-0110 / OI-0112** (shipped) — migrated the sub-move Open sheet's pre-graze to the shared paddock card. OI-0112 touched `submove.js` Save handler; verify the commit (13a3327) didn't introduce the regression. Blame lines in `submove.js` around the `createObservation` call are worth a closer look.
- **OI-0091 / OI-0095** — window-split architecture. Sub-move is supposed to INSERT a new paddock window, not split or close anything on the parent event. If the bug is in a window-helper misfire, the fix may extend into the split/close helpers.
- **Known trap: v1 "mutation functions that forget to notify subscribers = stale UI"** — this bug is close kin: *mutation functions that notify subscribers which then mutate other entities = phantom writes*. Worth a CLAUDE.md Known Traps entry after the root cause lands.

## Commit message skeleton

```
fix(submove): stop Sub-move Open from resetting parent event.date_in (OI-0115)

Root cause: [fill in after investigation]

Sub-move Open must be a pure INSERT on event_paddock_windows — it must never
mutate the parent event. Added regression test + grep contract so this class
of bug fails at commit time.

No schema change. No CP-55/CP-56 impact.
Closes OI-0115 and [GH issue number after filing].
```
