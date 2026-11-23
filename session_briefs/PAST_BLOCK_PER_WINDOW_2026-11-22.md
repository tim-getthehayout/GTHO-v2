# Rotation past blocks are per window — bar dates, head count, metrics, connectors (OI-0264)

**Status:** **LOCKED / READY FOR BUILD** 2026-11-22 6:36 PM ET + 6:37 PM ET (America/New_York). Tim, 2026-11-22 6:36 PM ET, via Orchestrator, card **t1283s4999**: “Q1 A: bar ends at the window's own close, open windows run to today”; “Q2 A: head count at the end of the window, each group once”; “Fold per-window metrics into this OI”. Plus Tim, 2026-11-22 6:37 PM ET, via Orchestrator, typed **t1284u**: “the connector lines between paddocks in one main event also need to be rendered”. Codes: **Pw1 + Hc1 + Mw1 + Cn1**. Design readings are marked **(Design reading)** — each is a veto line on Tim's land card.
**Opened:** ~6:36 PM ET by GTHO Design from Tim **t1277u** (6:30 PM ET) and **t1279u** (6:32 PM ET), via Orchestrator.
**Branch tip:** `docs/oi-past-block-per-window` (parent `origin/main` `b02c6276a233c3d6d2934892384f70b97663b6d4`, Sv2 docs). Docs only — do not land until Tim land yes.
**No SQL / no migration / no data change.**

Line numbers are at main `1555ab9` (`b02c627` is docs-only; `src/` identical).

---

## Tim (verbatim)
- **t1277u (6:30 PM ET):** “I think the grazing bars are not rendering properly on sub moves. All the locations in an event are rendering equal length bars, when one paddock is likely open the whole time and others for a shorter time in that period. The bar for each submove should represent the time period for just that paddock.”
- **t1279u (6:32 PM ET):** “i think the head count data is also doing something strange. the event across f paddocks that started on 4/21 says 176 head”
- **t1284u (6:37 PM ET):** “the connector lines between paddocks in one main event also need to be rendered”

## What happens (render bug; the saved data is right)
Each paddock window (`event_paddock_windows`) has its own `date_opened` / `date_closed`, but the Locations & Rotation calendar draws every paddock of an event from the **event** start to the **event** close, adds up every saved group-window head count, and labels every bar with the **season/location** numbers.

Event `38cb666e` (F paddocks, Apr 21 – May 6 2026):

| Window | Saved dates | Drawn today | Under Pw1 |
|---|---|---|---|
| F-1 `c365b602` | Apr 21 – May 6 | Apr 21 – May 6 | Apr 21 – May 6 |
| F-4 `90ae71a3` | Apr 24 – Apr 28 | Apr 21 – May 6 | Apr 24 – Apr 28 |
| F-5 `3680d2eb` | Apr 25 – Apr 28 | Apr 21 – May 6 | Apr 25 – Apr 28 |
| F-2 `99f04685` | Apr 28 – May 6 | Apr 21 – May 6 | Apr 28 – May 6 |
| F-3 `b5fb8c9f` | Apr 29 – May 6 | Apr 21 – May 6 | Apr 29 – May 6 |

Group windows on that event: Shenk Cows `94df5538` 4 hd (Apr 21 – May 6); Cow-Calf Herd split into 7 rows as its count changed — `faedbab2` 31 (Apr 21–25), `f5e9e517` 30 (Apr 25–29), `31bbc783` 27 (Apr 29 – May 6), three one-day Apr 29 rows `636ca5e2` 27 / `1059d42a` 29 / `843b514a` 28, and `7733d0f0` 0 (joined 2026-04-21, **left 2025-08-30** — bad data). Every bar shows **176 hd** (sum of all 8 rows) and “Multiple Groups (8)” for 2 groups. True herd: 35 → 34 → 31.

Farm-wide (prod SELECT, 2026-11-22): 30 events span more than one paddock; 54 of 120 multi-window windows open after their event's start; 4 windows close before their event, 2 close after it (e.g. `eeb2febe` E-3 closes Nov 17, event closes Nov 16; a J2 strip in `a0827026`); 0 windows are open on a closed event; 11 windows open now; 1 group window has `date_left < date_joined`. Repeat windows in one event: `90e7420b` J3-1 (2 identical), `a0827026` J2 (3 strips). 12 of 70 events show an inflated head count, worst 662.

## Root cause (file:line, `1555ab9`)
`src/features/events/rotation-calendar/calendar-grid.js` past-block loop `:920-982`:
- `:926-929` bar start = `getEventStartDate(event.id)`, end = `event.dateOut` or today. `pw.dateOpened` / `pw.dateClosed` are never read.
- `:938` `days` and `:939` `isActive` (NOW ring) are event-level.
- `:932` filter `!gw.closedAt` is a no-op (no such field on `event_group_windows`).
- `:933-936` group list is one entry per group **window**, not per group → “Multiple Groups (8)”.
- `:951-955` head count sums `getLiveWindowHeadCount` over every group window (`src/calcs/window-helpers.js:101` returns the stored `head_count` for closed windows) → 176.
- `:921`, `:957-961` AUDS / DMI / Pasture % come from `m` = the row's season/location metrics (`computeLocationMetrics` over the Season-metrics period), so every bar on a row shows the same numbers. `pasturePct` is a 100/0 stub (`m.dmiKg > 0`), `feedPct` is always 0. Only `storedFeedOnly` (`!!pw.noPasture`, `:962`) is per window.
- `readiness.js:19-21` already works per window (not touched here).

**Introduced by:** CP-54 `7141425` (2026-04-13, event-span bars); head-count summing since `c9e69d1` (2026-04-18).

## Connectors today (Cn — t1284u)
**Never drawn, anywhere.** No connector/arrow element exists in `src/` (past, active or future blocks) — `git log --all -S connector -- src tests` is empty. CP-54 specified them: `V2_DESIGN_SYSTEM.md:477` (“Sub-moves between paddocks render as a lighter-green block on the destination row plus a thin vertical arrow connecting the two rows at the move date”; linked paddocks get a dotted connector) and `V2_UX_FLOWS.md` §19.2. What shipped: a legend swatch “Sub-move” (`legend.js:31`, `main.css:2600`), a dead `_isSubMoveDestination` status tag (`paddock-column.js:24`, never set), and the linked-paddock reduced block (`past-block--linked`, `main.css:3171`). `event_paddock_windows` has no parent-window column (`parentWindowId` is only read by `events-log.js:129-130` and is never stored), so the “branched from” paddock must be inferred.

---

## Locked spec

### Pw1 — each window draws its own bar (Q1 A)
- One past block **per paddock window**, from `pw.dateOpened` to `pw.dateClosed`; an open window runs to **today** (Tim: “open windows run to today”).
- A window that closes after its event (E-3 Nov 17 vs event Nov 16) draws as recorded.
- **(Design reading)** A window still open on a closed event draws to the event's close. None exist in prod today (0 rows); guard only.
- **(Design reading)** A paddock with several windows in one event (repeat windows, strips) draws one bar per window. Identical duplicates (J3-1 `90e7420b`) overlap exactly; no de-dup in render.
- `days` = window days inclusive (`dateOpened` → `dateClosed` or today). NOW ring (`isActive`) = this window is open (`!pw.dateClosed`), not the event.
- Click still opens that window's detail: `openPastEventDetailSheet({ eventId, paddockWindowId: pw.id })` (unchanged).
- Range clipping (`range.start` / `range.end` / today) and the 4 px minimum width stay as today.

### Hc1 — head count at the window's end, each group once (Q2 A)
- Reference date **E** = `pw.dateClosed`, or today if the window is open.
- For each distinct `groupId` on the event, pick **one** group window present on E; head count = sum of `getLiveWindowHeadCount(gw, { memberships, animals, now: E })` over those picks (closed group windows return their stored `head_count`).
- **(Design reading) presence on E is inclusive at both ends:** `dateJoined <= E` and (`dateLeft` is null or `dateLeft >= E`). Inclusive on the leave date because a window that closes with its event shares the same date (F-1 closes May 6, Cow-Calf `31bbc783` leaves May 6). This is deliberately not the metrics helper `groupPresentOnDate` (`location-metrics.js:128-134`, exclusive on `dateLeft`).
- **(Design reading) tie-break when a group has several windows on E** (split windows hand over on the same date): take the latest `dateJoined` (then `timeJoined`, null last); still tied → the later `dateLeft` (open counts as latest), then `timeLeft`. So on Apr 29 Cow-Calf picks `31bbc783` (27), not the one-day rows.
- **(Design reading) bad data skipped:** a group window with `dateLeft < dateJoined` (e.g. `7733d0f0`) is ignored for head count and label. Not cleaned up here (data cleanup is Tim's, in the app).
- A group with no window present on E contributes nothing.
- **Group label de-duped by group:** `eventGroups` = distinct groups present on E (same picks). 2 groups → “Multiple Groups (2)”, tooltip lists names once.
- **38cb666e expected:** F-1 / F-2 / F-3 (E = May 6) → **31 hd** (Shenk 4 + Cow-Calf 27); F-4 / F-5 (E = Apr 28) → **34 hd** (Shenk 4 + Cow-Calf 30). Label “Multiple Groups (2)”.

### Mw1 — label metrics are for that window only (Tim: “Fold per-window metrics into this OI”)
Today's label: line 1 `<group> · <AUDS> AUDS · <days>d`; line 2 `Pasture <x>% · Feed <y>% · <DMI> DMI · <head> hd` (`past-block.js:58-66`, `:98-123`).
- **(Design reading) one calc, scoped to the window:** compute the label numbers with the existing `computeLocationMetrics` (`location-metrics.js:380`) for that paddock's location, with `windowStart = pw.dateOpened`, `windowEnd = pw.dateClosed || today`, `events = [that event]`, and a new optional `ctx.onlyPaddockWindowId = pw.id` that restricts `locPws` / `openMine` and the `prorateSpanHayByDemand` `pastureByPw` / `hayByPw` pick-up to that window. The full `paddockWindows` list still goes in so acre shares and Al1 hay allocation among sibling paddocks are unchanged (same F1 / OI-0258 / OI-0260 path as the List metrics; no new math). Build may wrap it as `computePaddockWindowMetrics(pw, ctx)`.
- **AUDS** = that call's `auds` (this window's acre share of the event's AUDs over its own days).
- **DMI** = that call's `dmiKg` (pasture DMI for this window). Unknown (`dmiKnown` false / null) → “— DMI” (OI-0253 B1). F1 hay-unknown stays sticky but only within this window's dates.
- **(Design reading) Pasture % / Feed %** replace the 100/0 stub with the window's split: `pasturePct = dmiKg / (dmiKg + storedFeedDmiKg) × 100`, `feedPct = 100 − pasturePct`, where `storedFeedDmiKg` is the Al1 hay allocated to this window (`hayByPw`). If DMI is unknown → “Pasture —%” and “Feed —%” (small formatter change: `formatPastureFeedDmiLine` accepts `feedPct` null). If both are known zero (no demand in the window) → “Pasture —% · Feed —%” rather than a fake 100/0.
- **storedFeedOnly first (OI-0256 Mt1):** `pw.noPasture` → Pasture 0% · Feed 100% · 0 DMI, tan paint, regardless of the calc.
- **Head** = Hc1. **Days** = Pw1.
- **(Design reading) cost:** one metrics call per visible past window per render; only windows that overlap the visible range are computed. If that is slow on Month zoom, memoise by `pw.id` + data revision. Season/List metrics column is unchanged.

### Cn1 — connector lines between paddocks in one event (t1284u)
Restores the CP-54 sub-move connector that was specified but never built.
- **(Design reading) attachment:** for every window of a multi-paddock event that opens **after** the event's first window, draw a thin vertical line at that window's **open date** (`dateOpened`, `timeOpened` ignored) from the **source bar** to the new bar's row, with a small arrow head at the new bar. Source bar = the event's **earliest-opened window still open on that date** (the “main” paddock; F-1 in `38cb666e`). If that one is already closed, the earliest-opened window open on that date; if none is open (gap), the window that closed most recently before that date.
- **(Design reading) same-day opens:** windows that open on the event's first day together (no move) get one connector at the event start joining their rows, so every paddock in the event is linked.
- **(Design reading) rows in between:** the line crosses any rows between source and target as a 2 px dark-green line drawn above the row backgrounds but below block labels (no fill, no paint on those rows' blocks). Rows are in the user's chosen sort, so event rows may not be adjacent.
- **Skipped:** source and target in the same row (repeat windows / strips); either row not rendered (filtered, hidden confinement, collapsed); open date outside the visible range.
- Drawn for past and active (NOW) events alike; future forecast blocks have no connectors.
- Sub-move destination fill stays the normal pasture green (CP-54's “lighter green destination block” is **not** revived here); the legend “Sub-move” swatch changes to a line sample labelled “Sub-move connector”.
- Implementation hint: one overlay layer in the timeline body positioned from the rendered rows' `offsetTop` (row heights can differ), rebuilt on render; `pointer-events: none`.

### Stacking
Same file as OI-0261 / OI-0262 / OI-0263 work (`calendar-grid.js`, `fix/oi-0261-axis-readiness`). Build branches **after OI-0261 merges**, or stacks on that branch and rebases. Stacks before the Locations-menu OI.

### Tests
1. **Staggered staircase** (event `3d02e797` pattern): windows opening on different days draw bars with different lefts and widths; none spans the whole event.
2. **Early close:** `38cb666e` F-4 ends Apr 28 and F-5 ends Apr 28; F-1 ends May 6.
3. **Late close:** a window closing the day after its event (E-3 Nov 17, event Nov 16) draws to Nov 17.
4. **Open window → today**, NOW ring on that bar only; a closed sibling in the same event has no ring.
5. **Repeat windows:** two windows of one paddock in one event → two bars.
6. **Head count `38cb666e`:** F-1/F-2/F-3 show 31 hd, F-4/F-5 show 34 hd (not 176).
7. **Inclusive leave date + tie-break:** same-day hand-over (Apr 29) picks the later-joined, longer window (27).
8. **De-duped label:** 2 groups with 8 windows → “Multiple Groups (2)”.
9. **Bad-data window skipped:** `dateLeft < dateJoined` adds 0 and is not in the label.
10. **Per-window metrics, stored-feed only:** `noPasture` window → Pasture 0% · Feed 100% · 0 DMI, tan.
11. **Per-window metrics, unknown DMI:** missing weight / F1 unknown in this window → “Pasture —% · Feed —% · — DMI”; a sibling window outside the unknown dates stays known.
12. **Per-window metrics differ by window:** F-4 (Apr 24–28) and F-1 (Apr 21 – May 6) show different AUDS/DMI, each computed over its own dates only; the List/season column for those rows is unchanged.
13. **Connectors:** `38cb666e` draws connectors at Apr 24 (F-1→F-4), Apr 25 (F-1→F-5), Apr 28 (F-1→F-2), Apr 29 (F-1→F-3); same-row repeat windows draw none; hidden target row draws none.

### Fix size
M (render loop per window + Hc1 helper + metrics ctx flag + connector overlay + formatter null + ~13 tests).

### Out of scope
Data cleanup of `7733d0f0` and the three one-day Apr 29 Cow-Calf rows (Tim can fix in the app); readiness (OI-0262); a stored parent-window link.
