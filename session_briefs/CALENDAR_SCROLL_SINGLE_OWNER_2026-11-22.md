# Rotation calendar jiggles while scrolling sideways — single scroller (OI-0266)

**Status:** **PROPOSED → READY FOR BUILD pending Tim's land yes** (America/New_York). Bug fix, no product question — Tim's land card is the approval.
**Opened:** ~6:50 PM ET 2026-11-22 by GTHO Design from Tim, via Orchestrator:
- **t1291u** (6:47 PM ET): “when scrolling left or right the grazing windows are very 'jumpy' kind of vibrating or jiggling while scrolling”
- **t1292u** (6:48 PM ET): “its only on teh row that the mouse arrow is floating over”

**Branch tip:** `docs/oi-scroll-single-owner`, stacked on `docs/oi-locations-nav-retire` (OI-0265) → `docs/oi-past-block-per-window` (OI-0264) → `origin/main` `b02c6276a233c3d6d2934892384f70b97663b6d4`. Docs only — do not land until Tim land yes.
**No SQL / no migration / no data change.**

Line numbers are at main `b02c627`. Code read only; not reproduced on a device.

---

## What happens today

| Piece | Where |
|---|---|
| One sideways scroller per paddock row | `calendar-grid.js:1093-1101`; CSS `main.css:2847-2852` (`overflow-x: auto`); phone boxed strips `main.css:2971-2976` |
| One more for the date axis | `calendar-grid.js:716-725` |
| All ~38 collected and synced | `calendar-grid.js:425-435` → `bindHorizontalScrollSync` (`scroll-owner.js:38-56`) |
| Sync guard | `scroll-owner.js:44-51` (`locking` set and cleared in one synchronous pass) |
| Write-back check | `scroll-owner.js:49` (`other.scrollLeft !== left`) |

**Why the hovered row jiggles (t1292u):**
1. On a Mac the wheel / trackpad scrolls the scroller under the pointer — that row leads.
2. Its `scroll` event copies its position into every follower.
3. Follower `scroll` events fire a frame later, after `locking` is already false.
4. Each follower reads its own position — older than the leader's, which kept moving during momentum — and the `!==` check (also tripped by fractional Retina positions) writes that stale value into the leader.
5. The leader is pulled back a frame and forward again, up to ~37 times per scroll step. Followers lag together with the axis, so they look smooth.

On iPhone the same fight shows on whichever row the finger is on, and writing `scrollLeft` into a coasting scroller interrupts its momentum.

**Introduced by:** `9ce0e69` (2026-11-21 1:12 PM ET, “Combine locations and rotation management with synced scroll”) — `bindHorizontalScrollSync`, the `locking` guard and the axis in the sync list (`git log -S`). Not OI-0246 / 0252 / 0254.

**Not the cause:**
- No re-render on scroll.
- No mouse / pointer / wheel listeners anywhere in `src/features/events/rotation-calendar/*`.
- No viewport-following labels, IntersectionObserver, `will-change`, scroll-snap or transforms in this view.
- The two `requestAnimationFrame` calls run once at load (`calendar-grid.js:438-445` today-centring; `:490` metrics width).
- No hover rule changes geometry. Only `.past-block:hover { opacity: 0.9 }` with `transition: opacity 0.15s` (`main.css:3161`, `:3164`) — a slight flicker as blocks pass a still pointer, not the jiggle.
- The sticky name column (`main.css:2782-2792`) sits in a body with `overflow-x: hidden` (`main.css:2770-2775`), so it does nothing today.

---

## Fix (Design wording)

1. **Single scroller.** `.loc-mgmt__body` is the only scroller, both axes.
   - The date axis lives inside it, `position: sticky; top: 0`.
   - Desktop: the name + metrics columns are sticky to the left.
   - Phone: the name and metrics lines stay pinned to the left edge above each row's strip; the strip box stays as a visual frame but does not scroll by itself.
   - Row timelines and the axis no longer scroll on their own. Remove `bindHorizontalScrollSync` and its call.
2. **Keep working on the single scroller:** today-centring (`calendar-grid.js:438-445`), arrow keys (`:461-472`), jump to today.
3. **Fallback — only if sticky cannot keep the phone stacked layout:** one master scroller drives every row strip. Strips cannot scroll themselves; they move by transform in one `requestAnimationFrame` per frame, rounded to whole device pixels, and forward wheel / touch to the master. **No code path may write a position back into the scroller the user is driving.**
4. **Hover (Design reading):** drop the `.past-block:hover` opacity fade and its transition (`main.css:3161`, `:3164`); show a `:focus-visible` outline for keyboard focus instead.

## Acceptance

- Mac trackpad and wheel, iPhone Safari, and the Home Screen app: sideways scrolling moves every row and the axis together, including momentum. No jiggle on the row under the pointer or finger.
- Swiping or wheeling over any row scrolls all rows.
- Names and metrics stay in place; the axis stays at the top during vertical scroll.
- Today-centring on open, arrow keys and jump-to-today still work.
- Blocks do not flicker as they pass under a still pointer.

## Tests

- Update the F0 scroll-architecture invariants (`scroll-owner.js` `hasSingleVerticalScrollOwner`, `describeScrollArchitecture`) to “single owner, both axes”.
- Assert there are no per-row horizontal scrollers and no `scroll` listener that writes `scrollLeft` (no write-back).
- Today-centring and arrow keys act on the single scroller.
- Device check: iPhone Safari, Home Screen app, Mac trackpad.

## Stacking and size

- After OI-0264 (`calendar-grid.js` ~920-990) and OI-0265 (List view / nav). Different lines, same file.
- Check against `fix/oi-0261-axis-readiness`: OI-0263 adds the Map view to this surface; OI-0261 changes the axis (~`calendar-grid.js:787`).
- **Size:** S–M. Risk is the phone layout.

## Veto lines (plain language)

- Treated as a bug fix with no product question; your land yes is the approval.
- Scrolling sideways anywhere on the calendar moves all rows and the date axis together; names and numbers stay put.
- The faint fade when the mouse is over a past bar goes away; keyboard focus shows an outline instead.
